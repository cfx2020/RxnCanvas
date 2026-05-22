import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { MessageKey } from "./messages"
import {
  fallbackLocale,
  formatMessage,
  resolveInitialLocale,
  writeStoredLocale,
  type MessageParams,
  type SupportedLocale,
} from "./runtime"

export type I18nRuntime = {
  locale: SupportedLocale
  setLocale(locale: SupportedLocale): void
  t(key: MessageKey, params?: MessageParams): string
}

const I18nContext = createContext<I18nRuntime | undefined>(undefined)

type I18nProviderProps = {
  children: ReactNode
  initialLocale?: SupportedLocale
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    if (initialLocale) {
      return initialLocale
    }
    return resolveInitialLocale({
      storage: globalThis.localStorage,
      language: globalThis.navigator?.language,
    })
  })

  const setLocale = useCallback((nextLocale: SupportedLocale) => {
    setLocaleState(nextLocale)
    writeStoredLocale(globalThis.localStorage, nextLocale)
  }, [])

  const value = useMemo<I18nRuntime>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => formatMessage(key, params, locale),
    }),
    [locale, setLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nRuntime {
  const value = useContext(I18nContext)
  if (!value) {
    return {
      locale: fallbackLocale,
      setLocale: () => undefined,
      t: (key, params) => formatMessage(key, params, fallbackLocale),
    }
  }
  return value
}

export type { MessageKey, MessageParams, SupportedLocale }
export {
  assertCatalogCompleteness,
  detectInitialLocale,
  fallbackLocale,
  formatMessage,
  isSupportedLocale,
  localePreferenceKey,
  normalizeBrowserLocale,
  readStoredLocale,
  resolveInitialLocale,
  writeStoredLocale,
} from "./runtime"
