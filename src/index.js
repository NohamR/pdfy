import fs from 'node:fs'
import process from 'node:process'
import path from 'node:path'
import readline from 'node:readline/promises'
import { parseArgs, VALID_THEMES } from './cli.js'
import { loadConfigFile, loadPreferences, readCustomCss } from './config.js'
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

async function promptForInput () {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  const answer = await rl.question('> ')
  rl.close()
  return answer.trim().replace(/^['"]|['"]$/g, '')
}

async function main () {
  const { url, opts } = parseArgs()

  await checkExtension()

  const config = await loadConfigFile(opts.config)

  const prefsPath = opts.prefs || config.prefs || null
  const cssPath = opts.css || config.css || null
  const outputPath = opts.output || config.output || null

  let preferences = {}
  if (prefsPath) {
    preferences = loadPreferences(path.resolve(prefsPath))
  }

  const theme = opts.theme || config.theme || preferences.mode || 'light'
  if (!VALID_THEMES.includes(theme)) {
    logger.error(
      `Invalid theme "${theme}". Valid themes: ${VALID_THEMES.join(', ')}`
    )
    process.exit(1)
  }
  preferences.mode = theme
  logger.info(`Theme: ${theme}`)

  let customCss = null
  if (cssPath) {
    customCss = readCustomCss(path.resolve(cssPath))
    if (customCss !== null) {
      preferences['user-css'] = customCss
      logger.info(`Custom CSS loaded: "${path.resolve(cssPath)}"`)
    }
  }

  const browser = await launchBrowser()

  try {
    const extId = await discoverExtensionId(browser)

    logger.info(`Fetching article: "${url}"`)
    const articlePage = await browser.newPage()
    await articlePage.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
    let article = await extractArticle(articlePage, getReadabilityPath())

    if (article.title === 'Just a moment...' || article.length < 500) {
      logger.warn('Cloudflare or bot protection detected..')
      logger.warn('Open the URL in your browser, save the page as complete HTML (File > Save Page As),')
      logger.warn('then paste the saved file path below and press Enter:')

      const htmlPath = await promptForInput()
      const resolvedPath = path.resolve(htmlPath)

      if (!fs.existsSync(resolvedPath)) {
        logger.error(`File not found: "${resolvedPath}"`)
        process.exit(1)
      }

      logger.info(`Loading article from local file: "${resolvedPath}"`)
      await articlePage.goto(`file://${resolvedPath}`, { waitUntil: 'networkidle0', timeout: 30000 })
      article = await extractArticle(articlePage, getReadabilityPath())
    }

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
    const outputFile = outputPath
      ? resolveOutputPath(outputPath)
      : getOutputFilename(title)

    let contentHtml = await extractRenderedContent(readerPage)
    contentHtml = contentHtml.replace(
      '<head>',
      `<head><base href="${url}"><meta name="referrer" content="unsafe-url">`
    )
    contentHtml = contentHtml.replace(/ loading="lazy"/g, '')
    await readerPage.close()

    const enhancedHtml = enhanceHtml(contentHtml, customCss)

    const pdfPage = await browser.newPage()
    await pdfPage.setViewport({ width: 1280, height: 7200 })
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
