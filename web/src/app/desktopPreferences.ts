import type { EnergyDisplayOptions } from "./energyDisplay"

export type AppearancePreference = "system" | "dark" | "light"
export type SourceOpenerProfile = "gaussian" | "text"
export type EnergyOutputUnitPreference = EnergyDisplayOptions["outputUnit"]

export type SourceOpenerPreference = {
  appPath: string | null
  label?: string | null
}

export type DesktopPreferences = {
  schemaVersion: 1
  appearance: AppearancePreference
  energyOutputUnit: EnergyOutputUnitPreference
  sourceOpeners: {
    gaussian?: SourceOpenerPreference
    text?: SourceOpenerPreference
  }
}

export const defaultDesktopPreferences: DesktopPreferences = {
  schemaVersion: 1,
  appearance: "system",
  energyOutputUnit: "kcal/mol",
  sourceOpeners: {},
}

export function normalizeDesktopPreferences(value: unknown): DesktopPreferences {
  if (!isObject(value)) return { ...defaultDesktopPreferences, sourceOpeners: {} }
  return {
    schemaVersion: 1,
    appearance: isAppearancePreference(value.appearance) ? value.appearance : defaultDesktopPreferences.appearance,
    energyOutputUnit: isEnergyOutputUnitPreference(value.energyOutputUnit) ? value.energyOutputUnit : defaultDesktopPreferences.energyOutputUnit,
    sourceOpeners: {
      gaussian: normalizeSourceOpener(value.sourceOpeners?.gaussian),
      text: normalizeSourceOpener(value.sourceOpeners?.text),
    },
  }
}

export function effectiveThemeFromAppearance(appearance: AppearancePreference, systemPrefersDark: boolean): "dark" | "light" {
  if (appearance === "dark" || appearance === "light") return appearance
  return systemPrefersDark ? "dark" : "light"
}

export function isEnergyOutputUnitPreference(value: unknown): value is EnergyOutputUnitPreference {
  return value === "hartree" || value === "kcal/mol" || value === "kj/mol"
}

function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === "system" || value === "dark" || value === "light"
}

function normalizeSourceOpener(value: unknown): SourceOpenerPreference | undefined {
  if (!isObject(value)) return undefined
  const appPath = typeof value.appPath === "string" && value.appPath.length > 0 ? value.appPath : null
  const label = typeof value.label === "string" && value.label.length > 0 ? value.label : null
  if (!appPath && !label) return undefined
  return { appPath, label }
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object"
}
