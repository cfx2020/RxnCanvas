import type { ParseWarning, VibrationalMode, VibrationDisplacement } from "./sourceParseTypes"

export function normalizeVibrationalModes(
  value: unknown,
  atomCount: number,
  target = "vibration",
  options: { allowMissingDisplacements?: boolean } = {},
): { modes: VibrationalMode[]; warnings: ParseWarning[] } {
  if (!Array.isArray(value) || atomCount <= 0) return { modes: [], warnings: [] }
  const warnings: ParseWarning[] = []
  const modes: VibrationalMode[] = []
  value.forEach((rawMode, rawIndex) => {
    if (!rawMode || typeof rawMode !== "object") return
    const mode = rawMode as Record<string, unknown>
    const frequencyCm1 = finiteNumber(mode.frequencyCm1)
    const rawDisplacements = Array.isArray(mode.displacements) ? mode.displacements : []
    const displacements = rawDisplacements
      .map((item) => normalizeDisplacement(item, atomCount))
      .filter((item): item is VibrationDisplacement => Boolean(item))
    if (frequencyCm1 === null || (!options.allowMissingDisplacements && displacements.length !== atomCount)) {
      warnings.push({
        code: "vibration_shape_mismatch",
        message: `Vibration mode ${rawIndex + 1} does not match the coordinate payload shape.`,
        target,
      })
      return
    }
    if (options.allowMissingDisplacements && rawDisplacements.length > 0 && displacements.length !== atomCount) {
      warnings.push({
        code: "vibration_shape_mismatch",
        message: `Vibration mode ${rawIndex + 1} does not match the coordinate payload shape.`,
        target,
      })
      return
    }
    const modeIndex = integerOrFallback(mode.modeIndex, modes.length)
    modes.push({
      modeId: typeof mode.modeId === "string" && mode.modeId ? mode.modeId : modeId(modeIndex, frequencyCm1),
      modeIndex,
      frequencyCm1,
      kind: mode.kind === "imaginary" || mode.kind === "real" || mode.kind === "unknown"
        ? mode.kind
        : (frequencyCm1 < 0 ? "imaginary" : "real"),
      displacements,
      reducedMassAmu: finiteNumber(mode.reducedMassAmu),
      forceConstant: finiteNumber(mode.forceConstant),
      irIntensityKmMol: finiteNumber(mode.irIntensityKmMol),
      ramanActivity: finiteNumber(mode.ramanActivity),
      source: mode.source === "cclib" ? "cclib" : "rxncanvas-text",
    })
  })
  return { modes, warnings }
}

export function compactVibrationalModesForPersistence(modes: VibrationalMode[]): VibrationalMode[] {
  return modes.map((mode, index) => ({
    ...mode,
    displacements: index === 0 ? mode.displacements : [],
  }))
}

export function vibrationalModeHasDisplacements(mode: VibrationalMode | null | undefined, atomCount: number): boolean {
  return Array.isArray(mode?.displacements) && mode.displacements.length === atomCount
}

function normalizeDisplacement(value: unknown, atomCount: number): VibrationDisplacement | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  const atomIndex = integerOrNull(item.atomIndex)
  const dx = finiteNumber(item.dx)
  const dy = finiteNumber(item.dy)
  const dz = finiteNumber(item.dz)
  if (atomIndex === null || atomIndex < 0 || atomIndex >= atomCount || dx === null || dy === null || dz === null) return null
  return { atomIndex, dx, dy, dz }
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null
}

function integerOrFallback(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback
}

function modeId(modeIndex: number, frequencyCm1: number): string {
  const kind = frequencyCm1 < 0 ? "imaginary" : "real"
  return `mode-${modeIndex + 1}-${kind}-${Math.abs(frequencyCm1).toFixed(2)}`
}
