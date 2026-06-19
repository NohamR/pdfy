import fs from 'node:fs'
import path from 'node:path'
import {
  checkExtension,
  launchBrowser,
  discoverExtensionId,
  getReadabilityPath
} from './browser.js'
import {
  extractArticle,
  storeArticle,
  setExtensionPreferences,
  waitForReaderView,
  extractRenderedContent,
  getArticleTitle
} from './reader.js'
import { enhanceHtml, generatePdf } from './pdf.js'
import { VALID_THEMES } from './cli.js'
import logger from './logger.js'

const EXTENSION_BASE = 'chrome-extension://'
const NAV_TIMEOUT = 30000

export { launchBrowser, VALID_THEMES }

export class BotProtectionError extends Error {
  constructor () {
    super('Bot protection or low-content page detected. Provide the article as HTML.')
    this.name = 'BotProtectionError'
  }
}

export async function convert (url, options = {}) {
  const {
    html,
    theme = 'light',
    css = null,
    prefs = {},
    output = null,
    browser: externalBrowser = null
  } = options

  if (!VALID_THEMES.includes(theme)) {
    throw new Error(`Invalid theme "${theme}". Valid themes: ${VALID_THEMES.join(', ')}`)
  }

  logger.info(`Theme: ${theme}`)

  const timeout = NAV_TIMEOUT

  await checkExtension()

  let browser = externalBrowser
  let ownBrowser = false
  if (!browser) {
    browser = await launchBrowser()
    ownBrowser = true
  }

  try {
    const extId = await discoverExtensionId(browser)

    logger.info(`Fetching article: "${url}"`)
    const articlePage = await browser.newPage()
    if (html) {
      await articlePage.setContent(html, { waitUntil: 'networkidle0' })
    } else {
      await articlePage.goto(url, { waitUntil: 'networkidle0', timeout })
    }
    const article = await extractArticle(articlePage, getReadabilityPath())
    await articlePage.close()

    if (article.title === 'Just a moment...' || article.length < 500) {
      throw new BotProtectionError()
    }

    const mergedPrefs = { ...prefs, mode: theme }
    if (css) {
      mergedPrefs['user-css'] = css
    }

    const extPage = await browser.newPage()
    await storeArticle(extPage, extId, 1, article)

    const prefsToSet = Object.fromEntries(
      Object.entries(mergedPrefs).filter(([_, v]) => v !== undefined && v !== null)
    )
    if (Object.keys(prefsToSet).length > 0) {
      await setExtensionPreferences(extPage, extId, prefsToSet)
    }
    await extPage.close()

    const readerUrl = [
      `${EXTENSION_BASE}${extId}/data/reader/index.html`,
      '?id=1',
      `&url=${encodeURIComponent(url)}`
    ].join('')
    logger.debug(`Opening Reader View: ${readerUrl}`)

    const readerPage = await browser.newPage()
    await readerPage.goto(readerUrl, { waitUntil: 'load', timeout })
    await waitForReaderView(readerPage)
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const title = await getArticleTitle(readerPage)

    let contentHtml = await extractRenderedContent(readerPage)
    contentHtml = contentHtml.replace(
      '<head>',
      `<head><base href="${url}"><meta name="referrer" content="unsafe-url">`
    )
    contentHtml = contentHtml.replace(/ loading="lazy"/g, '')
    await readerPage.close()

    const enhancedHtml = enhanceHtml(contentHtml, css)

    const pdfPage = await browser.newPage()
    await pdfPage.setViewport({ width: 1280, height: 7200 })

    let outputPath = null
    if (output) {
      outputPath = path.resolve(output)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    }

    const pdfBuffer = await generatePdf(pdfPage, enhancedHtml, outputPath, { timeout })
    await pdfPage.close()

    return { title, pdfBuffer, outputPath }
  } finally {
    if (ownBrowser && browser) {
      await browser.close()
      logger.info('Browser closed.')
    }
  }
}
