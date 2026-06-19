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

## Usage

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

## Credits

- [Reader View](https://chromewebstore.google.com/detail/reader-view/ecabifbgmdmgdllomnfinbmaellmclnh) Chrome extension
- [Mozilla Readability](https://github.com/mozilla/readability)
- [Puppeteer](https://pptr.dev/)
- [highlight.js](https://highlightjs.org/)
