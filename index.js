import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer";

const EXTENSION_DIR = path.resolve("./extension/reader-view");
const MANIFEST_PATH = path.join(EXTENSION_DIR, "manifest.json");
const READABILITY_PATH = path.join(EXTENSION_DIR, "data/inject/Readability.js");

function getOutputFilename(title) {
  const safe = title
    .replace(/[<>:"/\\|?*]/g, "")
    .trim()
    .slice(0, 120);
  return `${safe || "article"}.pdf`;
}

async function discoverExtensionId(browser) {
  const page = await browser.newPage();
  await page.goto("chrome://extensions/", { timeout: 8000 });
  await new Promise(r => setTimeout(r, 1000));
  const extId = await page.evaluate(() => {
    return new Promise(resolve => {
      chrome.management.getAll(exts => {
        const found = exts.find(e => e.name === "Reader View");
        resolve(found ? found.id : null);
      });
    });
  });
  await page.close();
  if (!extId) {
    throw new Error("Could not discover Reader View extension ID");
  }
  console.log(`Discovered extension ID: ${extId}`);
  return extId;
}

async function extractArticle(page, readabilityPath) {
  const readabilitySource = fs.readFileSync(readabilityPath, "utf-8");
  await page.evaluate(readabilitySource);
  const article = await page.evaluate(() => {
    const doc = document.cloneNode(true);
    const reader = new Readability(doc);
    const parsed = reader.parse();
    if (!parsed) return null;
    return {
      title: parsed.title,
      content: parsed.content,
      textContent: parsed.textContent,
      length: parsed.length,
      excerpt: parsed.excerpt,
      byline: parsed.byline,
      dir: parsed.dir,
      url: window.location.href,
    };
  });
  if (!article) {
    throw new Error("Failed to extract article content with Readability");
  }
  console.log(`Extracted article: ${article.title} (${article.length} chars)`);
  return article;
}

async function storeArticle(extPage, extId, articleId, article) {
  await extPage.goto(
    `chrome-extension://${extId}/manifest.json`,
    { timeout: 8000 }
  );
  await extPage.evaluate(({ id, article }) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("content-temporary-storage", 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("storage")) {
          db.createObjectStore("storage", { keyPath: "id" });
        }
      };
      req.onsuccess = e => {
        const db = e.target.result;
        const tx = db.transaction(["storage"], "readwrite");
        const store = tx.objectStore("storage");
        const put = store.put({ id, content: article });
        put.onerror = () => reject(put.error?.message || "put failed");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error?.message || "tx failed");
      };
      req.onerror = () => reject(req.error?.message || "open failed");
    });
  }, { id: articleId, article });
  console.log("Article stored in extension IndexedDB");
}

async function waitForReaderView(page) {
  console.log("Waiting for Reader View to render article...");
  await page.waitForFunction(
    () => {
      const title = document.title;
      if (!title || title === "Loading... :: Reader View") return false;
      const iframe = document.querySelector("#content iframe");
      if (!iframe) return false;
      try {
        const body = iframe.contentDocument?.body;
        if (!body) return false;
        return body.textContent.trim().length > 200;
      } catch {
        return false;
      }
    },
    { timeout: 60000 }
  );
  console.log("Article rendered.");
}

async function extractRenderedContent(page, baseUrl) {
  const html = await page.evaluate((extBase) => {
    const iframe = document.querySelector("#content iframe");
    if (!iframe) return null;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return null;
      const b = doc.createElement("base");
      b.href = extBase;
      doc.head.insertBefore(b, doc.head.firstChild);
      return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
    } catch {
      return null;
    }
  }, baseUrl);
  if (!html) throw new Error("Could not extract rendered content from iframe");
  return html;
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: node index.js <URL>");
    process.exit(1);
  }

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(
      `Extension not found at: ${EXTENSION_DIR}\n` +
      "Please extract the extension first:\n" +
      "  mkdir -p extension/reader-view\n" +
      "  unzip extension/Reader-View-Chrome-Web-Store.zip -d extension/reader-view"
    );
    process.exit(1);
  }
  if (!fs.existsSync(READABILITY_PATH)) {
    console.error(
      `Readability.js not found at: ${READABILITY_PATH}\n` +
      "The extension may be incomplete. Please re-extract it."
    );
    process.exit(1);
  }

  console.log(`Launching browser with extension: ${EXTENSION_DIR}`);
  const browser = await puppeteer.launch({
    headless: true,
    ignoreDefaultArgs: [
      "--disable-extensions",
      "--disable-component-extensions-with-background-pages",
      "--enable-automation",
    ],
    args: [
      `--load-extension=${EXTENSION_DIR}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  try {
    const extId = await discoverExtensionId(browser);

    console.log(`Fetching article: ${url}`);
    const articlePage = await browser.newPage();
    await articlePage.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    const article = await extractArticle(articlePage, READABILITY_PATH);
    await articlePage.close();

    const extPage = await browser.newPage();
    await storeArticle(extPage, extId, 1, article);
    await extPage.close();

    const readerUrl = [
      `chrome-extension://${extId}/data/reader/index.html`,
      "?id=1",
      `&url=${encodeURIComponent(url)}`,
    ].join("");
    console.log(`Opening Reader View: ${readerUrl}`);

    const readerPage = await browser.newPage();
    await readerPage.goto(readerUrl, { waitUntil: "load", timeout: 30000 });

    await waitForReaderView(readerPage);
    await new Promise(r => setTimeout(r, 1000));

    const title = await readerPage.evaluate(() => {
      return (document.title || "").replace(" :: Reader View", "");
    });
    const outputFile = getOutputFilename(title);

    const contentHtml = await extractRenderedContent(readerPage, `chrome-extension://${extId}/data/reader/`);
    await readerPage.close();

    const highlightCss = '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/default.min.css">';
    const highlightJs = '<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"><\/script><script>hljs.highlightAll();<\/script>';
    const enhancedHtml = contentHtml.replace("</head>", `${highlightCss}${highlightJs}</head>`);

    const pdfPage = await browser.newPage();
    await pdfPage.setContent(enhancedHtml, { waitUntil: "networkidle0" });

    console.log(`Generating PDF: ${outputFile}`);
    await pdfPage.pdf({
      path: outputFile,
      format: "A4",
      printBackground: true,
      margin: {
        top: "10mm",
        bottom: "10mm",
        left: "0mm",
        right: "0mm",
      },
    });

    console.log(`PDF saved: ${outputFile}`);
    await pdfPage.close();
  } finally {
    await browser.close();
    console.log("Browser closed.");
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
