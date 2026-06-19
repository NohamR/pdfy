import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const EXTENSION_DIR = path.resolve("./extension/reader-view");
const MANIFEST_PATH = path.join(EXTENSION_DIR, "manifest.json");
const READABILITY_PATH = path.join(EXTENSION_DIR, "data/inject/Readability.js");

export function checkExtension() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(
      `Extension not found at: ${EXTENSION_DIR}\n` +
        "Please extract the extension first:\n" +
        "  mkdir -p extension/reader-view\n" +
        "  unzip extension/Reader-View-Chrome-Web-Store.zip -d extension/reader-view",
    );
    process.exit(1);
  }
  if (!fs.existsSync(READABILITY_PATH)) {
    console.error(
      `Readability.js not found at: ${READABILITY_PATH}\n` +
        "The extension may be incomplete. Please re-extract it.",
    );
    process.exit(1);
  }
}

export function getReadabilityPath() {
  return READABILITY_PATH;
}

export function getExtensionDir() {
  return EXTENSION_DIR;
}

export async function launchBrowser() {
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
  return browser;
}

export async function discoverExtensionId(browser) {
  const page = await browser.newPage();
  await page.goto("chrome://extensions/", { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 1000));
  const extId = await page.evaluate(() => {
    return new Promise((resolve) => {
      chrome.management.getAll((exts) => {
        const found = exts.find((e) => e.name === "Reader View");
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
