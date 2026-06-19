import fs from 'node:fs/promises'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXTENSION_DIR = path.resolve(__dirname, '..', 'extension')
const EXTENSION_ID = 'ecabifbgmdmgdllomnfinbmaellmclnh'
const CRX_PATH = path.join(EXTENSION_DIR, 'Reader-View-Chrome-Web-Store.crx')
const ZIP_PATH = path.join(EXTENSION_DIR, 'Reader-View-Chrome-Web-Store.zip')
const EXTRACT_DIR = path.join(EXTENSION_DIR, 'reader-view')

export async function downloadExtension ({ logger } = {}) {
  const log = logger || console

  log.info('Downloading Reader View extension from Chrome Web Store...')

  const url =
    'https://clients2.google.com/service/update2/crx' +
    '?response=redirect' +
    '&prodversion=150.0.0.0' +
    `&x=id%3D${EXTENSION_ID}%26installsource%3Dondemand%26uc` +
    '&nacl_arch=arm' +
    '&acceptformat=crx3'

  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`Failed to download CRX: HTTP ${response.status}`)
  }

  const crx = new Uint8Array(await response.arrayBuffer())
  log.info(`Downloaded ${(crx.length / 1024).toFixed(0)} KB`)

  if (crx[0] !== 0x43 || crx[1] !== 0x72 || crx[2] !== 0x32 || crx[3] !== 0x34) {
    throw new Error('Not a valid CRX file (bad magic number)')
  }

  const view = new DataView(crx.buffer, crx.byteOffset, crx.byteLength)
  const version = view.getUint32(4, true)

  let zipOffset
  if (version === 2) {
    const publicKeyLength = view.getUint32(8, true)
    const signatureLength = view.getUint32(12, true)
    zipOffset = 16 + publicKeyLength + signatureLength
  } else if (version === 3) {
    const headerLength = view.getUint32(8, true)
    zipOffset = 12 + headerLength
  } else {
    throw new Error(`Unsupported CRX version: ${version}`)
  }

  const zip = crx.slice(zipOffset)
  if (zip[0] !== 0x50 || zip[1] !== 0x4b) {
    throw new Error('Failed to locate ZIP payload in CRX')
  }

  await fs.mkdir(EXTENSION_DIR, { recursive: true })
  await fs.writeFile(CRX_PATH, crx)
  await fs.writeFile(ZIP_PATH, zip)

  log.info('Extracting extension...')
  await fs.mkdir(EXTRACT_DIR, { recursive: true })

  try {
    execSync(`unzip -o "${ZIP_PATH}" -d "${EXTRACT_DIR}"`, { stdio: 'pipe' })
  } catch {
    throw new Error(
      'Failed to extract the extension. Make sure "unzip" is installed.\n' +
        `You can manually extract it: unzip "${ZIP_PATH}" -d "${EXTRACT_DIR}"`
    )
  }

  log.info('Extension ready.')
}

const __filename = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  downloadExtension().catch((err) => {
    console.error('Download failed:', err.message)
    process.exit(1)
  })
}
