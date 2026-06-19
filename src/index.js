import process from 'node:process'
import path from 'node:path'
import { parseArgs, VALID_THEMES } from './cli.js'
import { loadPreferences, readCustomCss } from './config.js'
import logger from './logger.js'
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
import {
  getOutputFilename,
  resolveOutputPath,
  enhanceHtml,
  generatePdf
} from './pdf.js'

const EXTENSION_BASE = 'chrome-extension://'

async function main () {
  const { url, opts } = parseArgs()

  checkExtension()

  let preferences = {}
  if (opts.prefs) {
    preferences = loadPreferences(path.resolve(opts.prefs))
  }

  const theme = opts.theme || preferences.mode || 'light'
  if (!VALID_THEMES.includes(theme)) {
    logger.error(
      `Invalid theme "${theme}". Valid themes: ${VALID_THEMES.join(', ')}`
    )
    process.exit(1)
  }
  preferences.mode = theme
  logger.info(`Theme: ${theme}`)

  let customCss = null
  if (opts.css) {
    customCss = readCustomCss(path.resolve(opts.css))
    if (customCss !== null) {
      preferences['user-css'] = customCss
      logger.info(`Custom CSS loaded: ${path.resolve(opts.css)}`)
    }
  }

  const browser = await launchBrowser()

  try {
    const extId = await discoverExtensionId(browser)

    logger.info(`Fetching article: ${url}`)
    const articlePage = await browser.newPage()
    await articlePage.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
    const article = await extractArticle(articlePage, getReadabilityPath())
    await articlePage.close()

    const extPage = await browser.newPage()
    await storeArticle(extPage, extId, 1, article)

    const prefsToSet = Object.fromEntries(
      Object.entries(preferences).filter(
        ([_, v]) => v !== undefined && v !== null
      )
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
    await readerPage.goto(readerUrl, { waitUntil: 'load', timeout: 30000 })

    await waitForReaderView(readerPage)
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const title = await getArticleTitle(readerPage)
    const outputFile = opts.output
      ? resolveOutputPath(opts.output)
      : getOutputFilename(title)

    const contentHtml = await extractRenderedContent(
      readerPage,
      `${EXTENSION_BASE}${extId}/data/reader/`
    )
    await readerPage.close()

    const enhancedHtml = enhanceHtml(contentHtml, customCss)

    const pdfPage = await browser.newPage()
    await generatePdf(pdfPage, enhancedHtml, outputFile)
    await pdfPage.close()
  } finally {
    await browser.close()
    logger.info('Browser closed.')
  }
}

main().catch((err) => {
  logger.error(err)
  process.exit(1)
})
