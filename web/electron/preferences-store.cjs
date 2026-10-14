const fs = require("node:fs/promises")
const path = require("node:path")

const preferencesFileName = "rxncanvas-preferences.json"

const defaultPreferences = {
  schemaVersion: 1,
  appearance: "system",
  energyOutputUnit: "kcal/mol",
  sourceOpeners: {},
}

function preferencesStorePath(userDataDirectory) {
  return path.join(userDataDirectory, preferencesFileName)
}

async function loadPreferences(userDataDirectory) {
  try {
    const content = await fs.readFile(preferencesStorePath(userDataDirectory), "utf8")
    return normalizePreferences(JSON.parse(content))
  } catch {
    return normalizePreferences(null)
  }
}

async function savePreferences(userDataDirectory, preferences) {
  const normalized = normalizePreferences(preferences)
  await fs.mkdir(userDataDirectory, { recursive: true })
  await fs.writeFile(preferencesStorePath(userDataDirectory), `${JSON.stringify(normalized, null, 2)}\n`, "utf8")
  return normalized
}

async function patchPreferences(userDataDirectory, patch) {
  const current = await loadPreferences(userDataDirectory)
  return savePreferences(userDataDirectory, mergePreferences(current, patch))
}

function mergePreferences(current, patch) {
  const nextOpeners = {
    ...(current.sourceOpeners || {}),
    ...(patch && typeof patch === "object" && patch.sourceOpeners && typeof patch.sourceOpeners === "object" ? patch.sourceOpeners : {}),
  }
  return normalizePreferences({
    ...current,
    ...(patch && typeof patch === "object" ? patch : {}),
    sourceOpeners: nextOpeners,
  })
}

function normalizePreferences(value) {
  const source = value && typeof value === "object" ? value : {}
  return {
    schemaVersion: 1,
    appearance: ["system", "dark", "light"].includes(source.appearance) ? source.appearance : defaultPreferences.appearance,
    energyOutputUnit: ["hartree", "kcal/mol", "kj/mol"].includes(source.energyOutputUnit) ? source.energyOutputUnit : defaultPreferences.energyOutputUnit,
    sourceOpeners: {
      ...openerEntry("gaussian", source.sourceOpeners),
      ...openerEntry("text", source.sourceOpeners),
    },
  }
}

function openerEntry(profile, sourceOpeners) {
  const value = sourceOpeners && typeof sourceOpeners === "object" ? sourceOpeners[profile] : null
  if (!value || typeof value !== "object") return {}
  const appPath = typeof value.appPath === "string" && value.appPath.length > 0 ? value.appPath : null
  const label = typeof value.label === "string" && value.label.length > 0 ? value.label : null
  if (!appPath && !label) return {}
  return { [profile]: { appPath, label } }
}

module.exports = {
  defaultPreferences,
  loadPreferences,
  normalizePreferences,
  patchPreferences,
  preferencesStorePath,
  savePreferences,
}
