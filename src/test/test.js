import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname)
const TEST_FILE = path.join(TEST_DIR, 'test.txt')
const OUTPUT_DIR = 'output/test'

const TESTS = [
  { label: 'default (no theme/css)', args: '' },
  { label: 'dark theme', args: '--theme dark' },
  { label: 'sepia theme', args: '--theme sepia' },
  { label: 'custom CSS', args: '--css config/rules.css' },
  {
    label: 'dark theme + custom CSS',
    args: '--theme dark --css config/rules.css'
  }
]

if (!fs.existsSync(TEST_FILE)) {
  console.error(`Test file not found: ${TEST_FILE}`)
  process.exit(1)
}

const urls = fs
  .readFileSync(TEST_FILE, 'utf-8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))

if (urls.length === 0) {
  console.error('No URLs found in test.txt')
  process.exit(1)
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true })

let passed = 0
let failed = 0

console.log(
  `Running ${TESTS.length} test scenario(s) across ${urls.length} URL(s)...\n`
)

for (const url of urls) {
  for (const { label, args } of TESTS) {
    const slug = label.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '')
    const outputPath = path.join(OUTPUT_DIR, `${slug}.pdf`)
    const testName = `[${label}] ${url}`
    console.log(`\n=== ${testName} ===`)

    try {
      execSync(`node src/index.js "${url}" ${args} --output "${outputPath}"`, {
        stdio: 'inherit',
        timeout: 120000
      })
      console.log(`  PASS: ${testName}`)
      passed++
    } catch (err) {
      console.error(`  FAIL: ${testName}`)
      failed++
    }
  }
}

console.log(`\n${'='.repeat(50)}`)
console.log(
  `Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`
)
process.exit(failed > 0 ? 1 : 0)
