import { describe, expect, it } from "vitest"
import { effectiveThemeFromAppearance, normalizeDesktopPreferences } from "./desktopPreferences"

describe("desktopPreferences", () => {
  it("normalizes bad preference payloads to safe defaults", () => {
    expect(normalizeDesktopPreferences({
      appearance: "neon",
      energyOutputUnit: "cal",
      sourceOpeners: {
        gaussian: { appPath: 42 },
        text: { appPath: "/Applications/TextEdit.app", label: "TextEdit" },
      },
    })).toEqual({
      schemaVersion: 1,
      appearance: "system",
      energyOutputUnit: "kcal/mol",
      sourceOpeners: {
        text: { appPath: "/Applications/TextEdit.app", label: "TextEdit" },
      },
    })
  })

  it("resolves system appearance from the current system theme", () => {
    expect(effectiveThemeFromAppearance("system", true)).toBe("dark")
    expect(effectiveThemeFromAppearance("system", false)).toBe("light")
    expect(effectiveThemeFromAppearance("dark", false)).toBe("dark")
  })
})
