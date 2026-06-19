import { Command } from 'commander'

export const VALID_THEMES = [
  'light',
  'dark',
  'sepia',
  'groove-dark',
  'solarized-light',
  'solarized-dark',
  'nord-light',
  'nord-dark'
]

const program = new Command()

program
  .name('pdfy')
  .description('Convert web articles to PDF using Reader View and Puppeteer')
  .argument('<url>', 'URL of the article to convert')
  .option(
    '-t, --theme <theme>',
    `Reader View theme (${VALID_THEMES.join(', ')})`
  )
  .option('-c, --css <path>', 'path to custom CSS file')
  .option('-p, --prefs <path>', 'path to extension preferences JSON')
  .option(
    '-o, --output <path>',
    'output file path (default: ./output/<title>.pdf)'
  )
  .option(
    '-l, --log-level <level>',
    'logging level (fatal, error, warn, info, debug)'
  )
  .addHelpText(
    'after',
    `
Examples:
  node src/index.js <URL>
  node src/index.js <URL> --theme dark --css config/rules.css
  npm start -- <URL> --theme dark --css config/rules.css
`
  )

export function parseArgs () {
  program.parse(process.argv)
  const opts = program.opts()
  return {
    url: program.args[0],
    opts: {
      theme: opts.theme || null,
      css: opts.css || null,
      prefs: opts.prefs || null,
      output: opts.output || null
    }
  }
}
