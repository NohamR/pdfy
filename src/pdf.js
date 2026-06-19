import fs from 'node:fs'
import path from 'node:path'
import logger from './logger.js'

const HIGHLIGHT_CSS =
  '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/default.min.css">'
const HIGHLIGHT_JS =
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"><\/script><script>hljs.highlightAll();<\/script>'

export function getOutputFilename (title, outputDir) {
  const safe = title
    .replace(/[<>:"/\\|?*]/g, '')
    .trim()
    .slice(0, 120)
  const dir = outputDir ? path.resolve(outputDir) : path.resolve('./output')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `${safe || 'article'}.pdf`)
}

export function resolveOutputPath (outputFlag) {
  if (!outputFlag) return null
  const resolved = path.resolve(outputFlag)
  const dir = resolved.endsWith('.pdf')
    ? path.dirname(resolved)
    : path.dirname(resolved)
  fs.mkdirSync(dir, { recursive: true })
  return resolved.endsWith('.pdf') ? resolved : `${resolved}.pdf`
}

export function enhanceHtml (html, customCss) {
  let enhanced = html.replace(
    '</head>',
    `${HIGHLIGHT_CSS}${HIGHLIGHT_JS}</head>`
  )
  if (customCss !== null) {
    enhanced = enhanced.replace(
      '</head>',
      `<style>${customCss}</style></head>`
    )
  }
  return enhanced
}

export async function generatePdf (page, html, outputPath, { timeout = 30000 } = {}) {
  await page.setContent(html, { waitUntil: 'networkidle0', timeout })
  await page.waitForFunction(
    () => Array.from(document.images).every(img => img.complete),
    { timeout, polling: 200 }
  ).catch(() => logger.debug('Image wait timed out, continuing...'))
  const pdfOptions = {
    format: 'A4',
    printBackground: true,
    margin: {
      top: '0mm',
      bottom: '0mm',
      left: '0mm',
      right: '0mm'
    }
  }
  if (outputPath) {
    pdfOptions.path = outputPath
    logger.info(`Generating PDF: "${outputPath}"`)
  }
  const buffer = await page.pdf(pdfOptions)
  if (outputPath) {
    logger.info(`PDF saved: "${outputPath}"`)
  }
  return buffer
}
