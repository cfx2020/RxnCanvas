import { enUSMessages, messageCatalogs, type MessageKey } from "./messages"

export type SupportedLocale = keyof typeof messageCatalogs

export type MessageParams = Record<string, string | number>

export const fallbackLocale = "en-US" satisfies SupportedLocale
export const localePreferenceKey = "rxnflow.web.locale" as const

export type LocaleStorageAdapter = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type LocaleDetectionInput = {
  storedLocale?: string | null
  language?: string | null
}

export function isSupportedLocale(locale: string | null | undefined): locale is SupportedLocale {
  return locale === "en-US" || locale === "zh-CN"
}

export function normalizeBrowserLocale(language: string | null | undefined): SupportedLocale {
  if (language?.toLowerCase().startsWith("zh")) {
    return "zh-CN"
  }
  return fallbackLocale
}

export function detectInitialLocale(input: LocaleDetectionInput): SupportedLocale {
  if (isSupportedLocale(input.storedLocale)) {
    return input.storedLocale
  }
  return normalizeBrowserLocale(input.language)
}

export function readStoredLocale(storage: LocaleStorageAdapter | undefined): SupportedLocale | null {
  try {
    const stored = storage?.getItem(localePreferenceKey) ?? null
    return isSupportedLocale(stored) ? stored : null
  } catch {
    return null
  }
}

export function writeStoredLocale(
  storage: LocaleStorageAdapter | undefined,
  locale: SupportedLocale,
): void {
  try {
    storage?.setItem(localePreferenceKey, locale)
  } catch {
    // Locale persistence is best-effort; the UI still works without storage.
  }
}

export function resolveInitialLocale(options: {
  storage?: LocaleStorageAdapter
  language?: string | null
}): SupportedLocale {
  return detectInitialLocale({
    storedLocale: readStoredLocale(options.storage),
    language: options.language,
  })
}

export function formatMessage(
  key: MessageKey,
  params: MessageParams = {},
  locale: SupportedLocale = fallbackLocale,
): string {
  const catalog = messageCatalogs[locale] ?? messageCatalogs[fallbackLocale]
  const template = catalog[key] ?? enUSMessages[key] ?? key
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, paramKey) => {
    const value = params[paramKey]
    return value === undefined ? match : String(value)
  })
}

export function assertCatalogCompleteness(): void {
  const expectedKeys = Object.keys(enUSMessages).sort()
  for (const [locale, catalog] of Object.entries(messageCatalogs)) {
    const actualKeys = Object.keys(catalog).sort()
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      throw new Error(`Message catalog keys differ for ${locale}.`)
    }
  }
}
