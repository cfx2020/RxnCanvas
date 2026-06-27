import type { ParseWarning, VibrationalMode, VibrationDisplacement } from "./sourceParsers"

type VibrationSource = VibrationalMode["source"]

const numberPattern = "[-+]?\\d+(?:\\.\\d+)?(?:[EeDd][-+]?\\d+)?"
const gaussianFrequencyLinePattern = new RegExp(`Frequencies\\s+--\\s+((?:${numberPattern}\\s*)+)`, "i")
const gaussianReducedMassLinePattern = new RegExp(`Red\\.\\s*masses\\s+--\\s+((?:${numberPattern}\\s*)+)`, "i")
const gaussianForceConstantLinePattern = new RegExp(`Frc\\s*consts?\\s+--\\s+((?:${numberPattern}\\s*)+)`, "i")
const gaussianIrIntensityLinePattern = new RegExp(`IR\\s+Inten\\s+--\\s+((?:${numberPattern}\\s*)+)`, "i")
const gaussianRamanActivityLinePattern = new RegExp(`Raman\\s+Activ\\s+--\\s+((?:${numberPattern}\\s*)+)`, "i")

export function gaussianVibrationalModesFromText(
  sourceText: string,
  atomCount: number,
  target: string,
  source: VibrationSource = "rxnflow-text",
): { modes: VibrationalMode[]; warnings: ParseWarning[] } {
  if (atomCount <= 0) return { modes: [], warnings: [] }
  const lines = sourceText.split(/\r?\n/)
  const modes: VibrationalMode[] = []
  const warnings: ParseWarning[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const frequencyMatch = lines[index]?.match(gaussianFrequencyLinePattern)
    if (!frequencyMatch) continue
    const frequencies = numbersFromText(frequencyMatch[1])
    if (frequencies.length === 0) continue
    const modeCount = frequencies.length
    const reducedMasses = nearbyNumbers(lines, index, gaussianReducedMassLinePattern, modeCount)
    const forceConstants = nearbyNumbers(lines, index, gaussianForceConstantLinePattern, modeCount)
    const irIntensities = nearbyNumbers(lines, index, gaussianIrIntensityLinePattern, modeCount)
    const ramanActivities = nearbyNumbers(lines, index, gaussianRamanActivityLinePattern, modeCount)
    const displacementStart = findGaussianDisplacementStart(lines, index + 1, atomCount)
    if (displacementStart === -1) {
      warnings.push({
        code: "vibration_parse_partial",
        message: "Gaussian frequency lines were found, but normal-mode displacements were not recognized.",
        target,
      })
      continue
    }
    const displacements = readGaussianDisplacements(lines, displacementStart, atomCount, modeCount)
    frequencies.forEach((frequencyCm1, modeOffset) => {
      const modeDisplacements = displacements[modeOffset] ?? []
      if (modeDisplacements.length !== atomCount) {
        warnings.push({
          code: "vibration_shape_mismatch",
          message: `Vibration mode ${modes.length + 1} displacement count does not match atom count.`,
          target,
        })
        return
      }
      const modeIndex = modes.length
      modes.push({
        modeId: modeId(modeIndex, frequencyCm1),
        modeIndex,
        frequencyCm1,
        kind: frequencyCm1 < 0 ? "imaginary" : "real",
        displacements: modeDisplacements,
        reducedMassAmu: reducedMasses[modeOffset] ?? null,
        forceConstant: forceConstants[modeOffset] ?? null,
        irIntensityKmMol: irIntensities[modeOffset] ?? null,
        ramanActivity: ramanActivities[modeOffset] ?? null,
        source,
      })
    })
  }

  if (modes.length === 0 && /Frequencies\s+--/i.test(sourceText) && !warnings.some((warning) => warning.code === "vibration_parse_partial")) {
    warnings.push({
      code: "vibration_parse_partial",
      message: "Frequency data was detected, but no complete normal modes were parsed.",
      target,
    })
  }

  return { modes, warnings }
}

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
      reducedMassAmu: optionalFiniteNumber(mode.reducedMassAmu),
      forceConstant: optionalFiniteNumber(mode.forceConstant),
      irIntensityKmMol: optionalFiniteNumber(mode.irIntensityKmMol),
      ramanActivity: optionalFiniteNumber(mode.ramanActivity),
      source: mode.source === "cclib" || mode.source === "embedded-text" ? mode.source : "rxnflow-text",
    })
  })
  return { modes, warnings }
}

export function stripVibrationalModeDisplacements(modes: VibrationalMode[]): VibrationalMode[] {
  return modes.map((mode) => ({
    ...mode,
    displacements: [],
  }))
}

export function vibrationalModeHasDisplacements(mode: VibrationalMode | null | undefined, atomCount: number): boolean {
  return Array.isArray(mode?.displacements) && mode.displacements.length === atomCount
}

function nearbyNumbers(lines: string[], start: number, pattern: RegExp, expected: number): number[] {
  for (const line of lines.slice(start + 1, start + 8)) {
    const match = line.match(pattern)
    if (match) return numbersFromText(match[1]).slice(0, expected)
  }
  return []
}

function findGaussianDisplacementStart(lines: string[], start: number, atomCount: number): number {
  for (let index = start; index < Math.min(lines.length, start + 18 + atomCount); index += 1) {
    if (/^\s*Atom\s+AN\b/i.test(lines[index] ?? "")) return index + 1
  }
  return -1
}

function readGaussianDisplacements(lines: string[], start: number, atomCount: number, modeCount: number): VibrationDisplacement[][] {
  const modes: VibrationDisplacement[][] = Array.from({ length: modeCount }, () => [])
  for (let lineIndex = start; lineIndex < Math.min(lines.length, start + atomCount + 4); lineIndex += 1) {
    const parts = (lines[lineIndex] ?? "").trim().split(/\s+/)
    if (parts.length < 2 + modeCount * 3) break
    const atomIndex = Number.parseInt(parts[0] ?? "", 10) - 1
    if (!Number.isInteger(atomIndex) || atomIndex < 0 || atomIndex >= atomCount) break
    for (let modeOffset = 0; modeOffset < modeCount; modeOffset += 1) {
      const base = 2 + modeOffset * 3
      const dx = parseNumber(parts[base])
      const dy = parseNumber(parts[base + 1])
      const dz = parseNumber(parts[base + 2])
      if (dx === null || dy === null || dz === null) continue
      modes[modeOffset]?.push({ atomIndex, dx, dy, dz })
    }
  }
  return modes
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

function numbersFromText(value: string | undefined): number[] {
  if (!value) return []
  return value.trim().split(/\s+/).map(parseNumber).filter((item): item is number => item !== null)
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseFloat(value.replace(/[Dd]/g, "E"))
  return Number.isFinite(parsed) ? parsed : null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function optionalFiniteNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : finiteNumber(value)
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
