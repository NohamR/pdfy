import { createServer } from 'node:http'
import process from 'node:process'
import { convert, launchBrowser, BotProtectionError, VALID_THEMES } from './pdfy.js'
import logger from './logger.js'

const PORT = parseInt(process.env.PORT || '8080', 10)
const HOST = process.env.HOST || '0.0.0.0'

let browser

async function parseBody (req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString())
}

function sendJson (res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

async function handleConvert (req, res) {
  let body
  try {
    body = await parseBody(req)
  } catch {
    return sendJson(res, 400, { error: 'Invalid JSON body' })
  }

  const { url, theme, css, prefs, html } = body

  if (!url && !html) {
    return sendJson(res, 400, { error: 'Missing required field: url (or html for direct content)' })
  }

  if (theme && !VALID_THEMES.includes(theme)) {
    return sendJson(res, 400, {
      error: `Invalid theme. Valid themes: ${VALID_THEMES.join(', ')}`
    })
  }

  try {
    const result = await convert(url || 'about:blank', {
      browser,
      html: html || null,
      theme: theme || 'light',
      css: css || null,
      prefs: prefs || {}
    })

    const sizeKb = (result.pdfBuffer.length / 1024).toFixed(0)
    logger.info(`Converted: "${result.title}" (${sizeKb} KB)`)

    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(result.title)}.pdf"`,
      'Content-Length': result.pdfBuffer.length
    })
    res.end(result.pdfBuffer)
  } catch (err) {
    if (err instanceof BotProtectionError) {
      return sendJson(res, 400, {
        error: 'Bot protection detected.',
        hint: 'Pass the page HTML directly via the "html" field.'
      })
    }
    logger.error(`Conversion failed: ${err.message}`)
    sendJson(res, 500, { error: err.message })
  }
}

const server = createServer((req, res) => {
  const { method, url } = req

  if (method === 'POST' && url === '/convert') {
    return handleConvert(req, res)
  }

  if (method === 'GET' && url === '/health') {
    return sendJson(res, 200, {
      status: 'ok',
      browser: browser ? 'connected' : 'disconnected',
      uptime: process.uptime()
    })
  }

  if (method === 'GET' && url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(`
pdfy server

POST /convert   Convert a URL to PDF
  Body: { "url": "...", "theme": "...", "css": "...", "html": "..." }

GET /health     Health check
GET /           This help
`)
    return
  }

  sendJson(res, 404, { error: 'Not found' })
})

async function start () {
  logger.info('Launching browser...')
  browser = await launchBrowser()
  logger.info('Browser ready')

  server.listen(PORT, HOST, () => {
    logger.info(`Server listening on http://${HOST}:${PORT}`)
  })
}

async function shutdown () {
  logger.info('Shutting down...')
  if (browser) await browser.close()
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

start().catch((err) => {
  logger.error(`Failed to start: ${err.message}`)
  process.exit(1)
})
