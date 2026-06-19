import fs from 'node:fs'

export async function extractArticle (page, readabilityPath) {
  const readabilitySource = fs.readFileSync(readabilityPath, 'utf-8')
  await page.evaluate(readabilitySource)
  const article = await page.evaluate(() => {
    const doc = document.cloneNode(true)
    const reader = new Readability(doc)
    const parsed = reader.parse()
    if (!parsed) return null
    const text = parsed.textContent || ''
    const lang = document.documentElement.lang || 'en'
    const readingSpeeds = {
      en: { cpm: 987, variance: 118 },
      ar: { cpm: 612, variance: 88 },
      de: { cpm: 920, variance: 86 },
      es: { cpm: 1025, variance: 127 },
      fi: { cpm: 1078, variance: 121 },
      fr: { cpm: 998, variance: 126 },
      he: { cpm: 833, variance: 130 },
      it: { cpm: 950, variance: 131 },
      jp: { cpm: 891, variance: 121 },
      nl: { cpm: 1021, variance: 96 },
      pl: { cpm: 916, variance: 126 },
      pt: { cpm: 1007, variance: 122 },
      ru: { cpm: 985, variance: 119 },
      sv: { cpm: 1015, variance: 116 },
      tr: { cpm: 935, variance: 103 },
      zh: { cpm: 891, variance: 121 }
    }
    const speed = readingSpeeds[lang] || readingSpeeds.en
    const charsPerMinLow = speed.cpm - speed.variance
    const charsPerMinHigh = speed.cpm + speed.variance
    const dateMeta = document.querySelector(
      'meta[property="article:published_time"],meta[property="og:pubdate"],' +
        'meta[property="og:publish_date"],meta[name="citation_online_date"],' +
        'meta[name="dc.Date"]'
    )
    const publishedTime = dateMeta?.content || parsed.publishedTime || ''
    return {
      ...parsed,
      lang,
      readingTimeMinsFast: Math.ceil(text.length / charsPerMinHigh),
      readingTimeMinsSlow: Math.ceil(text.length / charsPerMinLow),
      published_time: publishedTime
        ? new Date(publishedTime).toLocaleDateString()
        : '',
      url: window.location.href
    }
  })
  if (!article) {
    throw new Error('Failed to extract article content with Readability')
  }
  console.log(
    `Extracted article: ${article.title} (${article.length} chars, reading ${article.readingTimeMinsFast}-${article.readingTimeMinsSlow} min` +
      (article.published_time ? `, ${article.published_time}` : '') +
      ')'
  )
  return article
}

export async function storeArticle (extPage, extId, articleId, article) {
  await extPage.goto(`chrome-extension://${extId}/manifest.json`, {
    timeout: 8000
  })
  await extPage.evaluate(
    ({ id, article }) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('content-temporary-storage', 1)
        req.onupgradeneeded = (e) => {
          const db = e.target.result
          if (!db.objectStoreNames.contains('storage')) {
            db.createObjectStore('storage', { keyPath: 'id' })
          }
        }
        req.onsuccess = (e) => {
          const db = e.target.result
          const tx = db.transaction(['storage'], 'readwrite')
          const store = tx.objectStore('storage')
          const put = store.put({ id, content: article })
          put.onerror = () => reject(put.error?.message || 'put failed')
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error?.message || 'tx failed')
        }
        req.onerror = () => reject(req.error?.message || 'open failed')
      })
    },
    { id: articleId, article }
  )
  console.log('Article stored in extension IndexedDB')
}

export async function setExtensionPreferences (page, extId, prefs) {
  await page.goto(`chrome-extension://${extId}/manifest.json`, {
    timeout: 8000
  })
  await page.evaluate((settings) => {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(settings, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError.message)
        else resolve()
      })
    })
  }, prefs)
  console.log(`Extension preferences set: ${Object.keys(prefs).length} key(s)`)
}

export async function waitForReaderView (page) {
  console.log('Waiting for Reader View to render article...')
  await page.waitForFunction(
    () => {
      const title = document.title
      if (!title || title === 'Loading... :: Reader View') return false
      const iframe = document.querySelector('#content iframe')
      if (!iframe) return false
      try {
        const body = iframe.contentDocument?.body
        if (!body) return false
        return body.textContent.trim().length > 200
      } catch {
        return false
      }
    },
    { timeout: 60000 }
  )
  console.log('Article rendered.')
}

export async function extractRenderedContent (page, baseUrl) {
  const html = await page.evaluate((extBase) => {
    const iframe = document.querySelector('#content iframe')
    if (!iframe) return null
    try {
      const doc = iframe.contentDocument
      if (!doc) return null

      const dataMode = document.documentElement.getAttribute('data-mode')
      if (dataMode) {
        doc.documentElement.setAttribute('data-mode', dataMode)
      }

      const cs = getComputedStyle(doc.documentElement)
      const cssVars = ['--fg', '--bg', '--bd', '--lk', '--hg']
      const inlineVars = cssVars
        .map((v) => `${v}: ${cs.getPropertyValue(v)}`)
        .filter((s) => s.length > 5)
        .join('; ')
      if (inlineVars) {
        const existing = doc.documentElement.style.cssText
        doc.documentElement.style.cssText = existing
          ? existing + '; ' + inlineVars
          : inlineVars
      }

      const b = doc.createElement('base')
      b.href = extBase
      doc.head.insertBefore(b, doc.head.firstChild)
      return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
    } catch {
      return null
    }
  }, baseUrl)
  if (!html) throw new Error('Could not extract rendered content from iframe')
  return html
}

export function getArticleTitle (page) {
  return page.evaluate(() => {
    return (document.title || '').replace(' :: Reader View', '')
  })
}
