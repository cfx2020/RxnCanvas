import { describe, expect, it } from "vitest"
import { enUSMessages, messageCatalogs } from "./messages"
import {
  assertCatalogCompleteness,
  detectInitialLocale,
  formatMessage,
  localePreferenceKey,
  readStoredLocale,
  resolveInitialLocale,
  writeStoredLocale,
  type LocaleStorageAdapter,
} from "./runtime"

describe("i18n runtime", () => {
  it("keeps zh-CN and en-US catalog keys in lockstep", () => {
    expect(() => assertCatalogCompleteness()).not.toThrow()

    const expectedKeys = Object.keys(enUSMessages).sort()
    expect(Object.keys(messageCatalogs["zh-CN"]).sort()).toEqual(expectedKeys)
  })

  it("detects zh browser languages and falls back other languages to en-US", () => {
    expect(detectInitialLocale({ language: "zh-CN", storedLocale: null })).toBe("zh-CN")
    expect(detectInitialLocale({ language: "zh-Hans", storedLocale: null })).toBe("zh-CN")
    expect(detectInitialLocale({ language: "en-US", storedLocale: null })).toBe("en-US")
    expect(detectInitialLocale({ language: "fr-FR", storedLocale: null })).toBe("en-US")
  })

  it("prefers a valid stored locale over browser language", () => {
    expect(detectInitialLocale({ language: "zh-CN", storedLocale: "en-US" })).toBe("en-US")
    expect(detectInitialLocale({ language: "en-US", storedLocale: "zh-CN" })).toBe("zh-CN")
    expect(detectInitialLocale({ language: "zh-CN", storedLocale: "de-DE" })).toBe("zh-CN")
  })

  it("reads and writes supported stored locales without crashing on storage failures", () => {
    const storage = new MemoryLocaleStorage()

    expect(readStoredLocale(storage)).toBeNull()
    writeStoredLocale(storage, "zh-CN")
    expect(storage.getItem(localePreferenceKey)).toBe("zh-CN")
    expect(readStoredLocale(storage)).toBe("zh-CN")

    const brokenStorage: LocaleStorageAdapter = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }
    expect(readStoredLocale(brokenStorage)).toBeNull()
    expect(() => writeStoredLocale(brokenStorage, "en-US")).not.toThrow()
    expect(resolveInitialLocale({ storage: brokenStorage, language: "zh-CN" })).toBe("zh-CN")
  })

  it("formats messages with params and leaves missing params visible", () => {
    expect(formatMessage("workbench.profile.points", { count: 2 }, "en-US")).toBe(
      "2 profile points",
    )
    expect(formatMessage("workbench.profile.points", { count: 2 }, "zh-CN")).toBe(
      "2 个剖面点",
    )
    expect(formatMessage("workbench.profile.points", {}, "en-US")).toBe("{count} profile points")
  })
})

class MemoryLocaleStorage implements LocaleStorageAdapter {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}
