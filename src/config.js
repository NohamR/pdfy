import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import logger from './logger.js'

const CONFIG_FILE_NAMES = ['.pdfyrc', '.pdfyrc.json', 'pdfy.config.js']

function normalizeConfig (config) {
  const result = {}
  if (config.theme) result.theme = config.theme
  if (config.css) result.css = config.css
  if (config.prefs) result.prefs = config.prefs
  if (config.output) result.output = config.output
  if (config.highlightStyle) result.highlightStyle = config.highlightStyle
  if (config['highlight-style']) result.highlightStyle = config['highlight-style']
  if (config['log-level']) result.logLevel = config['log-level']
  if (config.logLevel) result.logLevel = config.logLevel
  return result
}

function findConfigFile () {
  for (const name of CONFIG_FILE_NAMES) {
    const fullPath = path.resolve(name)
    if (fs.existsSync(fullPath)) return fullPath
  }
  return null
}

async function parseConfigFile (filePath) {
  if (filePath.endsWith('.js')) {
    const mod = await import(pathToFileURL(filePath).href)
    return normalizeConfig(mod.default || {})
  }
  const raw = fs.readFileSync(filePath, 'utf-8')
  return normalizeConfig(JSON.parse(raw))
}

export async function loadConfigFile (configPath) {
  const target = configPath
    ? path.resolve(configPath)
    : findConfigFile()

  if (!target || !fs.existsSync(target)) return {}

  logger.debug(`Config loaded from: "${target}"`)
  try {
    return await parseConfigFile(target)
  } catch (err) {
    logger.warn(`Could not parse config file "${target}": ${err.message}`)
    return {}
  }
}

export function loadPreferences (prefsPath) {
  if (!prefsPath || !fs.existsSync(prefsPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(prefsPath, 'utf-8'))
  } catch (e) {
    logger.warn(`Warning: could not parse preferences file: "${prefsPath}"`)
    return {}
  }
}

export function readCustomCss (cssPath) {
  if (!cssPath || !fs.existsSync(cssPath)) return null
  const css = fs.readFileSync(cssPath, 'utf-8').trim()
  return css || null
}

export const DEFAULT_CONFIG_DIR = path.resolve('./config')
export const DEFAULT_PREFS_PATH = path.join(
  DEFAULT_CONFIG_DIR,
  'reader-view-preferences.json'
)
export const DEFAULT_CSS_PATH = path.join(DEFAULT_CONFIG_DIR, 'rules.css')
