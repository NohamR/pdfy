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

Extract the Reader View extension (get it using [CRX Downloader](https://chromewebstore.google.com/detail/crx-extractordownloader/ajkhmmldknmfjnmeedkbkkojgobmljda)):

```bash
mkdir -p extension/reader-view
unzip extension/Reader-View-Chrome-Web-Store.zip -d extension/reader-view
```

## Usage

```bash
node src/index.js --help
```

```
Usage: pdfy [options] <url>

Arguments:
  url                  URL of the article to convert

Options:
  -t, --theme <theme>  Reader View theme (light, dark, sepia, groove-dark, solarized-light, solarized-dark, nord-light, nord-dark)
  -c, --css <path>     path to custom CSS file
  -p, --prefs <path>   path to extension preferences JSON
  -o, --output <path>  output file path (default: ./output/<title>.pdf)
  -h, --help           display help for command
```

### Examples

```bash
node src/index.js https://example.com/article
node src/index.js https://example.com/article --theme dark --css config/rules.css
node src/index.js https://example.com/article --prefs config/reader-view-preferences.json
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
