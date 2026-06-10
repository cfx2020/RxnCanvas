import type { JsonObject, ObjectSummary } from "../shell"

export type EnergyDisplayMode = "electronic" | "free" | "solvation" | "corrected"
export type EnergyDisplayUnit = "hartree" | "kcal_mol" | "kj_mol"

export type ResolvedObjectEnergyValue = {
  key: string
  source: "energies" | "thermochemistry" | "derived"
  value: number
  unit: string
  reference?: string | null
  derived?: boolean
}

export const hartreeToKcalMol = 627.5095
export const hartreeToKjMol = hartreeToKcalMol * 4.184
export const oneMStandardStateCorrectionHartree = 0.003019

const electronicKeys = ["egas", "electronic", "scf"]
const freeGasKeys = ["ggas_1m", "ggas", "gibbs", "free_energy", "gibbs_free_energy"]
const freeGasUncorrectedKeys = ["ggas", "gibbs", "free_energy", "gibbs_free_energy"]
const solutionElectronicKeys = ["esol", "solution_electronic_energy"]
const solutionFreeKeys = ["gsol", "solution_free_energy", "solvation_free_energy"]

export function resolveObjectEnergyValue(
  object: ObjectSummary | null | undefined,
  mode: EnergyDisplayMode,
): ResolvedObjectEnergyValue | null {
  if (!object) return null
  if (mode === "electronic") {
    return energyValueFromObjectRecord(object, "energies", electronicKeys)
  }
  if (mode === "free") {
    return resolveGasFreeEnergy1M(object)
  }
  if (mode === "solvation") {
    return resolveSolutionFreeEnergy(object)
  }
  const base = energyValueFromObjectRecord(object, "energies", electronicKeys)
  if (!base) return null
  const corrections = correctionEnergySum(object)
  if (!corrections) return base
  const correctionInBaseUnit = convertEnergyValue(corrections.value, corrections.unit, normalizeEnergyUnit(base.unit) ?? "hartree")
  if (correctionInBaseUnit === null) return base
  return {
    ...base,
    key: "corrected",
    source: "derived",
    value: base.value + correctionInBaseUnit,
    reference: "Egas plus registered correction terms",
    derived: true,
  }
}

export function resolveGasFreeEnergy1M(
  object: ObjectSummary | null | undefined,
): ResolvedObjectEnergyValue | null {
  if (!object) return null
  const explicit = energyValueFromObjectRecord(object, "thermochemistry", ["ggas_1m"])
    ?? energyValueFromObjectRecord(object, "energies", ["ggas_1m"])
  if (explicit) return explicit
  const ggas = energyValueFromObjectRecord(object, "thermochemistry", freeGasUncorrectedKeys)
    ?? energyValueFromObjectRecord(object, "energies", freeGasUncorrectedKeys)
  if (!ggas) return null
  const correction = convertEnergyValue(oneMStandardStateCorrectionHartree, "hartree", normalizeEnergyUnit(ggas.unit) ?? "hartree")
  if (correction === null) return ggas
  return {
    ...ggas,
    key: "ggas_1m",
    source: "derived",
    value: ggas.value + correction,
    reference: "Ggas plus 1M standard-state correction",
    derived: true,
  }
}

export function resolveSolutionFreeEnergy(
  object: ObjectSummary | null | undefined,
): ResolvedObjectEnergyValue | null {
  if (!object) return null
  const explicit = energyValueFromObjectRecord(object, "thermochemistry", solutionFreeKeys)
  if (explicit) return explicit
  const ggas1m = resolveGasFreeEnergy1M(object)
  const egas = energyValueFromObjectRecord(object, "energies", electronicKeys)
  const esol = energyValueFromObjectRecord(object, "energies", solutionElectronicKeys)
  if (!ggas1m || !egas || !esol) return null
  const ggasKcal = convertEnergyValue(ggas1m.value, ggas1m.unit, "kcal_mol")
  const egasKcal = convertEnergyValue(egas.value, egas.unit, "kcal_mol")
  const esolKcal = convertEnergyValue(esol.value, esol.unit, "kcal_mol")
  if (ggasKcal === null || egasKcal === null || esolKcal === null) return null
  return {
    key: "gsol",
    source: "derived",
    value: ggasKcal - egasKcal + esolKcal,
    unit: "kcal_mol",
    reference: "Gsol = Ggas(1M) - Egas + Esol",
    derived: true,
  }
}

export function energyValueFromObjectRecord(
  object: ObjectSummary | null | undefined,
  source: "energies" | "thermochemistry",
  preferredKeys: readonly string[],
): ResolvedObjectEnergyValue | null {
  if (!object) return null
  const record = jsonObjectRecord(object[source])
  for (const key of preferredKeys) {
    const energy = energyValueFromUnknown(record[key])
    if (energy) {
      return {
        key,
        source,
        value: energy.value,
        unit: energy.unit,
        reference: energy.reference,
      }
    }
  }
  const fallback = object.display_energy
  if (fallback?.source === source && preferredKeys.includes(normalizeEnergyKey(fallback.key))) {
    return {
      key: fallback.key,
      source,
      value: fallback.value,
      unit: fallback.unit,
      reference: fallback.reference ?? null,
    }
  }
  return null
}

export function energyValueFromUnknown(value: unknown): { value: number; unit: string; reference?: string | null } | null {
  const record = jsonObjectRecord(value)
  const numericValue = Number(record.value)
  const unit = typeof record.unit === "string" ? record.unit : ""
  if (!Number.isFinite(numericValue) || !unit) return null
  const reference = typeof record.reference === "string" ? record.reference : null
  return { value: numericValue, unit, reference }
}

export function formatEnergyValue(value: number, unit: EnergyDisplayUnit): string {
  if (!Number.isFinite(value)) return "-"
  return `${value.toFixed(unit === "hartree" ? 6 : 2)} ${energyUnitLabel(unit)}`
}

export function convertEnergyValue(value: number, fromUnit: string, toUnit: EnergyDisplayUnit): number | null {
  const normalizedFrom = normalizeEnergyUnit(fromUnit)
  if (!normalizedFrom) return null
  const valueHartree = normalizedFrom === "hartree"
    ? value
    : normalizedFrom === "kcal_mol"
      ? value / hartreeToKcalMol
      : value / hartreeToKjMol
  if (toUnit === "hartree") return valueHartree
  if (toUnit === "kcal_mol") return valueHartree * hartreeToKcalMol
  return valueHartree * hartreeToKjMol
}

export function normalizeEnergyUnit(unit: string): EnergyDisplayUnit | null {
  const normalized = unit.trim().toLowerCase().replace(/[/-]/g, "_").replace(/[ -]/g, "_")
  if (normalized === "hartree" || normalized === "eh" || normalized === "au" || normalized === "a_u") return "hartree"
  if (normalized === "kcal_mol" || normalized === "kcalmol") return "kcal_mol"
  if (normalized === "kj_mol" || normalized === "kjmol") return "kj_mol"
  return null
}

export function energyUnitLabel(unit: EnergyDisplayUnit): string {
  if (unit === "kcal_mol") return "kcal/mol"
  if (unit === "kj_mol") return "kJ/mol"
  return "Hartree"
}

export function basisFunctionCountFromObject(object: ObjectSummary | null | undefined): number | null {
  if (!object) return null
  const candidates = [
    object.basis_function_count,
    object.basis_functions,
    object.basis_function,
    jsonObjectRecord(object.metadata).basis_function_count,
    jsonObjectRecord(object.metadata).basis_functions,
    jsonObjectRecord(object.metadata).basis_function,
  ]
  for (const candidate of candidates) {
    const value = Number(candidate)
    if (Number.isInteger(value) && value > 0) return value
  }
  return null
}

export function energyModeRelativeLabel(mode: EnergyDisplayMode): string {
  if (mode === "free") return "ΔG"
  if (mode === "solvation") return "ΔGsol"
  if (mode === "corrected") return "ΔEcorr"
  return "ΔE"
}

function correctionEnergySum(object: ObjectSummary): { value: number; unit: string } | null {
  let sumHartree = 0
  let count = 0
  for (const correction of object.corrections ?? []) {
    const energy = correction.energy
    if (!energy) continue
    const valueHartree = convertEnergyValue(energy.value, energy.unit, "hartree")
    if (valueHartree === null) continue
    sumHartree += valueHartree
    count += 1
  }
  return count > 0 ? { value: sumHartree, unit: "hartree" } : null
}

function jsonObjectRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {}
}

function normalizeEnergyKey(key: string): string {
  return key.trim().toLowerCase().replace(/[ -]/g, "_")
}
