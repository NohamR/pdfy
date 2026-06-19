import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer";

const EXTENSION_DIR = path.resolve("./extension/reader-view");
const MANIFEST_PATH = path.join(EXTENSION_DIR, "manifest.json");
const READABILITY_PATH = path.join(EXTENSION_DIR, "data/inject/Readability.js");

const VALID_THEMES = [
  "light", "dark", "sepia", "groove-dark",
  "solarized-light", "solarized-dark", "nord-light", "nord-dark",
];

function parseArgs() {
  const args = process.argv.slice(2);
  const url = args[0];
  const opts = { theme: null, css: null, prefs: null };
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--theme" && args[i + 1]) opts.theme = args[++i];
    else if (args[i] === "--css" && args[i + 1]) opts.css = args[++i];
    else if (args[i] === "--prefs" && args[i + 1]) opts.prefs = args[++i];
  }
  return { url, opts };
}

function loadPreferences(prefsPath) {
  if (!prefsPath || !fs.existsSync(prefsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
  } catch (e) {
    console.warn(`Warning: could not parse preferences file: ${prefsPath}`);
    return {};
  }
}

function readCustomCss(cssPath) {
  if (!cssPath || !fs.existsSync(cssPath)) return null;
  const css = fs.readFileSync(cssPath, "utf-8").trim();
  return css || null;
}

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
    const text = parsed.textContent || "";
    const lang = document.documentElement.lang || "en";
    const readingSpeeds = {
      en: { cpm: 987, variance: 118 }, ar: { cpm: 612, variance: 88 },
      de: { cpm: 920, variance: 86 }, es: { cpm: 1025, variance: 127 },
      fi: { cpm: 1078, variance: 121 }, fr: { cpm: 998, variance: 126 },
      he: { cpm: 833, variance: 130 }, it: { cpm: 950, variance: 131 },
      jp: { cpm: 891, variance: 121 }, nl: { cpm: 1021, variance: 96 },
      pl: { cpm: 916, variance: 126 }, pt: { cpm: 1007, variance: 122 },
      ru: { cpm: 985, variance: 119 }, sv: { cpm: 1015, variance: 116 },
      tr: { cpm: 935, variance: 103 }, zh: { cpm: 891, variance: 121 },
    };
    const speed = readingSpeeds[lang] || readingSpeeds.en;
    const charsPerMinLow = speed.cpm - speed.variance;
    const charsPerMinHigh = speed.cpm + speed.variance;
    const dateMeta = document.querySelector(
      'meta[property="article:published_time"],meta[property="og:pubdate"],' +
      'meta[property="og:publish_date"],meta[name="citation_online_date"],' +
      'meta[name="dc.Date"]'
    );
    const publishedTime = dateMeta?.content || parsed.publishedTime || "";
    return {
      ...parsed,
      lang,
      readingTimeMinsFast: Math.ceil(text.length / charsPerMinHigh),
      readingTimeMinsSlow: Math.ceil(text.length / charsPerMinLow),
      published_time: publishedTime ? (new Date(publishedTime)).toLocaleDateString() : "",
      url: window.location.href,
    };
  });
  if (!article) {
    throw new Error("Failed to extract article content with Readability");
  }
  console.log(`Extracted article: ${article.title} (${article.length} chars, reading ${article.readingTimeMinsFast}-${article.readingTimeMinsSlow} min` + (article.published_time ? `, ${article.published_time}` : "") + ")");
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

async function setExtensionPreferences(page, extId, prefs) {
  await page.goto(
    `chrome-extension://${extId}/manifest.json`,
    { timeout: 8000 }
  );
  await page.evaluate((settings) => {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(settings, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError.message);
        else resolve();
      });
    });
  }, prefs);
    console.log(`Extension preferences set: ${Object.keys(prefs).length} key(s)`);
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
  const { url, opts } = parseArgs();
  if (!url) {
    console.error("Usage: node index.js <URL> [--theme <theme>] [--css <path>] [--prefs <path>]");
    console.error("Themes: " + VALID_THEMES.join(", "));
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

  let preferences = {};
  if (opts.prefs) {
    preferences = loadPreferences(path.resolve(opts.prefs));
  }

  const theme = opts.theme || preferences.mode || "light";
  if (!VALID_THEMES.includes(theme)) {
    console.error(`Invalid theme "${theme}". Valid themes: ${VALID_THEMES.join(", ")}`);
    process.exit(1);
  }
  preferences.mode = theme;
  console.log(`Theme: ${theme}`);

  let customCss = null;
  if (opts.css) {
    const cssFile = path.resolve(opts.css);
    customCss = readCustomCss(cssFile);
    if (customCss !== null) {
      preferences["user-css"] = customCss;
      console.log(`Custom CSS loaded: ${cssFile}`);
    }
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

    const prefsToSet = Object.fromEntries(
      Object.entries(preferences).filter(([_, v]) => v !== undefined && v !== null)
    );
    if (Object.keys(prefsToSet).length > 0) {
      await setExtensionPreferences(extPage, extId, prefsToSet);
    }
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
    let enhancedHtml = contentHtml.replace("</head>", `${highlightCss}${highlightJs}</head>`);

    if (customCss !== null) {
      enhancedHtml = enhancedHtml.replace("</head>", `<style>${customCss}</style></head>`);
    }

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
