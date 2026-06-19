import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'
import { downloadExtension } from './download-extension.js'
import logger from './logger.js'

const EXTENSION_DIR = path.resolve('./extension/reader-view')
const MANIFEST_PATH = path.join(EXTENSION_DIR, 'manifest.json')
const READABILITY_PATH = path.join(EXTENSION_DIR, 'data/inject/Readability.js')

export async function checkExtension () {
  if (!fs.existsSync(MANIFEST_PATH)) {
    logger.info('Extension not found. Downloading automatically...')
    try {
      await downloadExtension({ logger })
    } catch (err) {
      logger.error(`Failed to download extension: ${err.message}`)
      process.exit(1)
    }
    if (!fs.existsSync(MANIFEST_PATH)) {
      logger.error('Download completed but extension not found. Extraction may have failed.')
      process.exit(1)
    }
  }
  if (!fs.existsSync(READABILITY_PATH)) {
    logger.error(
      `Readability.js not found at: "${READABILITY_PATH}"\n` +
        'The extension may be incomplete.'
    )
    process.exit(1)
  }
}

export function getReadabilityPath () {
  return READABILITY_PATH
}

export function getExtensionDir () {
  return EXTENSION_DIR
}

export async function launchBrowser () {
  logger.debug(`Launching browser with extension: "${EXTENSION_DIR}"`)
  const browser = await puppeteer.launch({
    headless: true,
    ignoreDefaultArgs: [
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--enable-automation'
    ],
    args: [
      `--load-extension=${EXTENSION_DIR}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  })
  return browser
}

export async function discoverExtensionId (browser) {
  const page = await browser.newPage()
  await page.goto('chrome://extensions/', { timeout: 8000 })
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const extId = await page.evaluate(() => {
    return new Promise((resolve) => {
      chrome.management.getAll((exts) => {
        const found = exts.find((e) => e.name === 'Reader View')
        resolve(found ? found.id : null)
      })
    })
  })
  await page.close()
  if (!extId) {
    throw new Error('Could not discover Reader View extension ID')
  }
  logger.debug(`Discovered extension ID: ${extId}`)
  return extId
}
