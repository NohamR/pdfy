import fs from 'node:fs'
import process from 'node:process'
import path from 'node:path'
import readline from 'node:readline/promises'
import { parseArgs } from './cli.js'
import { loadConfigFile, loadPreferences, readCustomCss } from './config.js'
import { getOutputFilename } from './pdf.js'
import { convert, BotProtectionError } from './pdfy.js'
import logger from './logger.js'

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

  const config = await loadConfigFile(opts.config)

  const prefsPath = opts.prefs || config.prefs || null
  const cssPath = opts.css || config.css || null
  const outputPath = opts.output || config.output || null

  const preferences = prefsPath ? loadPreferences(path.resolve(prefsPath)) : {}
  const customCss = cssPath ? readCustomCss(path.resolve(cssPath)) : null

  let html
  const currentUrl = url

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await convert(currentUrl, {
        html,
        theme: opts.theme || config.theme || preferences.mode || 'light',
        css: customCss,
        prefs: preferences,
        output: outputPath,
        highlightStyle: opts.highlightStyle || config.highlightStyle
      })

      const sizeKb = (result.pdfBuffer.length / 1024).toFixed(0)
      logger.info(`PDF generated: "${result.title}" (${sizeKb} KB)`)
      const savePath = result.outputPath || getOutputFilename(result.title)
      fs.writeFileSync(savePath, result.pdfBuffer)
      logger.info(`Saved to: "${savePath}"`)
      return
    } catch (err) {
      if (err instanceof BotProtectionError && attempt === 0) {
        logger.warn('Bot protection or low-content page detected.')
        logger.warn('Open the URL in your browser, save the page as complete HTML (File > Save Page As),')
        logger.warn('then paste the saved file path below and press Enter:')

        const htmlPath = await promptForInput()
        const resolvedPath = path.resolve(htmlPath)

        if (!fs.existsSync(resolvedPath)) {
          logger.error(`File not found: "${resolvedPath}"`)
          process.exit(1)
        }

        logger.info(`Loading article from local file: "${resolvedPath}"`)
        html = fs.readFileSync(resolvedPath, 'utf-8')
        continue
      }
      throw err
    }
  }
}

main().catch((err) => {
  logger.error(err.message || err)
  process.exit(1)
})
