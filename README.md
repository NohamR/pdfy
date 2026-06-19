# pdfy

Convert web articles to PDF using the [Reader View](https://chromewebstore.google.com/detail/reader-view/ecabifbgmdmgdllomnfinbmaellmclnh) Chrome extension and headless Chrome (Puppeteer).

## Features

- Extracts article content via Mozilla Readability
- Renders using Reader View for clean typography
- Supports all Reader View themes: `light`, `dark`, `sepia`, `groove-dark`, `solarized-light`, `solarized-dark`, `nord-light`, `nord-dark`
- Custom CSS injection
- Syntax highlighting via highlight.js
- Automatic reading time estimation
- Configurable extension preferences

## Installation

```bash
npm install
```

The Reader View extension is downloaded and extracted automatically on first run.

## CLI Usage

```bash
node src/index.js --help
```

```bash
Usage: pdfy [options] <url>

Arguments:
  url                      URL of the article to convert

Options:
  -t, --theme <theme>      Reader View theme (light, dark, sepia, groove-dark, solarized-light, solarized-dark, nord-light, nord-dark)
  -c, --css <path>         path to custom CSS file
  --config <path>          path to config file (.pdfyrc, .pdfyrc.json, pdfy.config.js)
  -p, --prefs <path>       path to extension preferences JSON
  -o, --output <path>      output file path (default: ./output/<title>.pdf)
  -l, --log-level <level>  logging level (fatal, error, warn, info, debug)
  -h, --help               display help for command
```

### Configuration

pdfy automatically discovers a config file in the current directory. Supported formats:

- `.pdfyrc` (JSON)
- `.pdfyrc.json` (JSON)
- `pdfy.config.js` (ESM module exporting a default object)

Example `.pdfyrc`:
```json
{
  "theme": "dark",
  "css": "config/rules.css",
  "prefs": "config/reader-view-preferences.json",
  "output": "./output/article.pdf"
}
```

Example `pdfy.config.js`:
```js
export default {
  theme: 'dark',
  css: 'config/rules.css',
  prefs: 'config/reader-view-preferences.json',
  output: './output/article.pdf'
}
```

CLI flags always override config file values. Use `--config <path>` to specify a custom config file location.

### Examples

```bash
node src/index.js https://example.com/article
node src/index.js https://example.com/article --theme dark --css config/rules.css
node src/index.js https://example.com/article --prefs config/reader-view-preferences.json
node src/index.js https://example.com/article --config .pdfyrc
npm start -- https://example.com/article --theme dark --css config/rules.css
```

### Running tests

```bash
npm test
```

The test script reads URLs from `src/test/test.txt` and runs multiple scenarios (default, dark, sepia, custom CSS, etc.).

## Library Usage

Use pdfy programmatically in your own Node.js applications:

```js
import { convert, launchBrowser, BotProtectionError, VALID_THEMES } from 'pdfy'

// Simple usage
const { title, pdfBuffer } = await convert('https://example.com/article')
fs.writeFileSync('article.pdf', pdfBuffer)

// With options
const result = await convert('https://example.com/article', {
  theme: 'dark',
  css: 'body { color: #333 }',
  prefs: { fontSize: 20 },
  output: './article.pdf'     // saves to disk and returns buffer
})
console.log(`Generated: ${result.title}`)

// Reuse browser across conversions (for servers)
const browser = await launchBrowser()
const a = await convert('https://example.com/1', { browser, theme: 'dark' })
const b = await convert('https://example.com/2', { browser, theme: 'sepia' })
await browser.close()

// Handle bot protection
try {
  await convert('https://example.com/article')
} catch (err) {
  if (err instanceof BotProtectionError) {
    // Prompt user to provide the article HTML manually
  }
}
```

### API

**`convert(url, options?)`** — returns `{ title, pdfBuffer, outputPath }`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `theme` | string | `'light'` | Reader View theme |
| `css` | string | `null` | Custom CSS string |
| `prefs` | object | `{}` | Extension preferences |
| `output` | string | `null` | File path to write PDF (returns buffer when omitted) |
| `browser` | Browser | `null` | Reuse a Puppeteer browser instance |
| `html` | string | `null` | Pre-fetched HTML content (skips URL fetch) |

**`launchBrowser()`** — launches a Puppeteer browser with the Reader View extension loaded.

**`BotProtectionError`** — thrown when the target page appears to be behind bot protection.


## HTTP Server

Run as a headless service via Docker or directly with Node:

```bash
# Start server
npm run start:server

# Or via Docker
docker compose up -d
```

### Endpoints

```
POST /convert   Generate a PDF from a URL
GET  /health    Health check (browser status, uptime)
GET  /          Help page
```

### Usage

```bash
curl -X POST http://localhost:8080/convert \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/article","theme":"dark"}' \
  -o article.pdf
```

| Body field | Type | Description |
|------------|------|-------------|
| `url` | string | Article URL (required unless `html` is provided) |
| `theme` | string | Reader View theme |
| `css` | string | Custom CSS string |
| `html` | string | Pre-fetched HTML (bypasses URL fetch) |
| `prefs` | object | Extension preferences |

## Credits

- [Reader View](https://chromewebstore.google.com/detail/reader-view/ecabifbgmdmgdllomnfinbmaellmclnh) Chrome extension
- [Mozilla Readability](https://github.com/mozilla/readability)
- [Puppeteer](https://pptr.dev/)
- [highlight.js](https://highlightjs.org/)
