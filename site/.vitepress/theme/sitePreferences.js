import { computed, ref } from 'vue'
import { siteContent } from './siteContent'

const LANGUAGE_KEY = 'rxncanvas-language'
const THEME_KEY = 'rxncanvas-theme'

export const language = ref('zh')
export const theme = ref('light')

export function useSiteContent() {
  return computed(() => siteContent[language.value])
}

let initialized = false

function readPreference(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function savePreference(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // The site remains usable when storage is unavailable.
  }
}

function applyTheme(value) {
  theme.value = value
  document.documentElement.dataset.theme = value
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'dark' ? '#0b1b24' : '#f5f8fa')
}

function applyLanguage(value) {
  const nextContent = siteContent[value]
  language.value = value
  document.documentElement.lang = value === 'zh' ? 'zh-CN' : 'en'
  document.title = nextContent.meta.title
  document.querySelector('meta[name="description"]')?.setAttribute('content', nextContent.meta.description)
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', nextContent.meta.title)
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', nextContent.meta.description)
}

export function initializeSitePreferences() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const savedLanguage = readPreference(LANGUAGE_KEY)
  const savedTheme = readPreference(THEME_KEY)
  const preferredTheme = document.documentElement.dataset.theme
  const initialTheme = savedTheme || (preferredTheme === 'dark' ? 'dark' : 'light')

  applyLanguage(savedLanguage === 'en' ? 'en' : 'zh')
  applyTheme(initialTheme === 'dark' ? 'dark' : 'light')

  // VitePress restores its static lang attribute after hydration.
  window.requestAnimationFrame(() => {
    applyLanguage(language.value)
  })
}

export function toggleLanguage() {
  const nextLanguage = language.value === 'zh' ? 'en' : 'zh'
  applyLanguage(nextLanguage)
  savePreference(LANGUAGE_KEY, nextLanguage)
}

export function toggleTheme() {
  const nextTheme = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme(nextTheme)
  savePreference(THEME_KEY, nextTheme)
}
