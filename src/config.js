import fs from 'node:fs'
import path from 'node:path'
import logger from './logger.js'

export function loadPreferences (prefsPath) {
  if (!prefsPath || !fs.existsSync(prefsPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(prefsPath, 'utf-8'))
  } catch (e) {
    logger.warn(`Warning: could not parse preferences file: ${prefsPath}`)
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
