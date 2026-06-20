import fs from 'node:fs'
import path from 'node:path'
import logger from './logger.js'

const HIGHLIGHT_JS =
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"><\/script><script>hljs.highlightAll();<\/script>'

function highlightCss (style) {
  return `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/${style}.min.css">`
}

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

export function enhanceHtml (html, customCss, highlightStyle = 'github') {
  let enhanced = html.replace(
    '</head>',
    `${highlightCss(highlightStyle)}${HIGHLIGHT_JS}</head>`
  )
  enhanced = enhanced.replace(/<details(?![^>]*?\bopen\b)/g, '<details open')
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
      top: '10mm',
      bottom: '10mm',
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
