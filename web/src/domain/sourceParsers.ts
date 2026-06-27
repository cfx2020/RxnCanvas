import { gaussianVibrationalModesFromText } from "./vibrations"

export type ParsedEnergyUnit = "kcal/mol" | "hartree"
export type ParsedNodeKind = "reactant" | "transition" | "intermediate" | "product"

export type SourceParseInput = {
  name: string
  preview: string
}

export type ParseWarning = {
  code: string
  message: string
  target?: string | null
}

export type CoordinateAtom = {
  element: string
  x: number
  y: number
  z: number
}

export type VibrationDisplacement = {
  atomIndex: number
  dx: number
  dy: number
  dz: number
}

export type VibrationalMode = {
  modeId: string
  modeIndex: number
  frequencyCm1: number
  kind: "imaginary" | "real" | "unknown"
  displacements: VibrationDisplacement[]
  reducedMassAmu?: number | null
  forceConstant?: number | null
  irIntensityKmMol?: number | null
  ramanActivity?: number | null
  source: "cclib" | "rxnflow-text" | "embedded-text"
}

export type CoordinatePreview = {
  atomCount: number
  has3d: boolean
  elements: string[]
  atoms?: CoordinateAtom[]
  vibrationModes?: VibrationalMode[]
  previewKind: "text" | "unavailable" | string
}

export type ParsedEnergyTableData = {
  egasHartree?: number | null
  gasBasisFunctions?: number | null
  ggasHartree?: number | null
  ggas1mHartree?: number | null
  ggasShermoHartree?: number | null
  ggasShermo1mHartree?: number | null
  esolHartree?: number | null
  solBasisFunctions?: number | null
  sgauTran?: number | null
  swhitTran?: number | null
  entropyDelta?: number | null
  entropyCorrectionHartree?: number | null
  standardStateCorrectionHartree?: number | null
  gsolHartree?: number | null
}

export type ParseScope = "preview" | "full-file"
export type ParseConfidence = "high" | "medium" | "low"
export type ComputationTerminationStatus = "normal" | "error" | "running" | "unknown"

export type ParseCandidate = {
  candidateId: string
  objectIndex: number
  label: string
  formula: string
  charge: number | null
  spinMultiplicity: number | null
  method: string
  energyGas: number | null
  energySolution: number | null
  energyUnit: ParsedEnergyUnit
  coordinatePreview: CoordinatePreview | null
  roleHint: "final" | "transition" | "path-point" | "unknown" | string
  warnings: ParseWarning[]
  energyTable?: ParsedEnergyTableData | null
}

export type SourceParseResult = {
  label: string
  sourceKind: string
  formula: string
  kind: ParsedNodeKind
  method: string
  solvent: string
  energyGas: number | null
  energySolution: number | null
  energyUnit: ParsedEnergyUnit
  parsed: boolean
  parserId: string | null
  parserVersion: string | null
  objectCount: number
  warnings: ParseWarning[]
  candidates: ParseCandidate[]
  coordinatePreview: CoordinatePreview | null
  energyTable?: ParsedEnergyTableData | null
  parseScope?: ParseScope
  confidence?: ParseConfidence
  terminationStatus?: ComputationTerminationStatus | null
  terminationLabel?: string | null
  jobCpuTime?: string | null
  elapsedTime?: string | null
}

const parserVersion = "0.2.1"
const evToHartree = 0.03674932217565499
const oneMStandardStateCorrectionHartree = 0.003019
const numberPattern = "[-+]?\\d+(?:\\.\\d+)?(?:[EeDd][-+]?\\d+)?"

const gaussianScfPattern = new RegExp(`SCF Done:\\s+E\\(([^)]+)\\)\\s+=\\s+(${numberPattern})`, "i")
const gaussianGibbsCorrectionPattern = new RegExp(`Thermal correction to Gibbs Free Energy\\s+=\\s+(${numberPattern})`, "i")
const gaussianFreeEnergyPattern = new RegExp(`Sum of electronic and thermal Free Energies=\\s*(${numberPattern})`, "i")
const gaussianBasisFunctionPattern = /\bNBasis=\s*(\d+)/i
const gaussianRoutePattern = /^\s*#\s*[PpNnTt]?\s+(.+)$/m
const gaussianChargeMultiplicityPattern = /Charge\s*=\s*([-+]?\d+)\s+Multiplicity\s*=\s*(\d+)/g
const orcaEnergyPattern = new RegExp(`FINAL SINGLE POINT ENERGY\\s+(${numberPattern})`, "i")
const orcaTotalEnergyPattern = new RegExp(`Total Energy\\s*:\\s*(${numberPattern})(?:\\s*Eh)?`, "i")
const orcaSolvationPattern = new RegExp(`(?:CPCM|SMD|PCM)\\s+SOLVATION ENERGY\\s+=\\s+(${numberPattern})`, "i")
const orcaBasisFunctionPattern = /(?:Number of basis functions|#\s*of\s*contracted\s*basis\s*functions)\s*(?:[:=]|\.\.\.)?\s*(\d+)/i
const orcaRoutePattern = /^\s*!\s+(.+)$/m
const orcaChargePattern = /Total Charge\s+Charge\s+(?:\.+\s*)?([-+]?\d+)/i
const orcaMultiplicityPattern = /Multiplicity\s+Mult\s+(?:\.+\s*)?(\d+)/i
const orcaXyzDirectivePattern = /^\s*\*\s*xyz(?:file)?\s+([-+]?\d+)\s+(\d+)\b/im
const maplePointPattern = new RegExp(`IRC point\\s+\\d+\\s+energy\\s+(${numberPattern})`, "gi")
const mapleOutputEnergyPattern = new RegExp(`Energy:\\s*(${numberPattern})\\s*(Hartree)?`, "gi")
const mapleTaskPattern = /^\s*Task:\s*(.+?)\s*$/im
const mapleModelPattern = /^\s*model\s*:\s*(.+?)\s*$/im
const mapleCoordinatePattern = new RegExp(`^\\s*\\d+\\s+([A-Z][a-z]?)\\s+(${numberPattern})\\s+(${numberPattern})\\s+(${numberPattern})\\s*$`)
const mapleXyzCommentPattern = /^\s*(?:(?:Iter|Iteration)\s+\d+\s+)?(?:Image|Frame)\s+\d+\s+Energy\s*=|^\s*Iteration\s+\d+\s+Energy\s*=/i
const commentEnergyPattern = new RegExp(`\\b(?:energy|E)\\s*=\\s*(${numberPattern})(?:\\s*(Hartree|Ha|eV))?`, "i")
const xyzFrameLabelPattern = /^\s*((?:(?:Iter|Iteration)\s+\d+\s+)?(?:Image|Frame)\s+\d+|Iteration\s+\d+)\b/i
const formulaPattern = /\b(?:Formula|Stoichiometry)\s*(?:[:=]\s*)?([A-Z][A-Za-z0-9]*)\b/i
const extxyzMetadataPattern = /([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S+)/g
const extxyzNumberPattern = new RegExp(`^${numberPattern}$`)

const mapleBannerMarkers = ["M   A   P   L   E", "MAchine-learning Potential for Landscape Exploration"]

export function parseSourcePreview({ name, preview }: SourceParseInput): SourceParseResult {
  const label = basenameWithoutExtension(name)
  const guessedKind = inferNodeKind(name)
  const computation = computationMetadataFromSource(preview)
  const gaussian = parseGaussian(preview)
  if (gaussian) {
    const atoms = gaussianAtomsFromText(preview)
    const vibrations = gaussianVibrationalModesFromText(preview, atoms.length, name)
    const formula = inferFormulaFromText(preview) ?? (atoms.length > 0 ? formulaFromAtoms(atoms) : "pending")
    const [charge, spinMultiplicity] = gaussianChargeMultiplicity(preview)
    const energyTable = gaussianEnergyTable(preview)
    return sourceResultFromCandidates({
      label,
      sourceKind: "Gaussian",
      kind: guessedKind,
      solvent: inferSolvent(preview),
      parserId: "gaussian-log-text-preview",
      candidates: [parseCandidate({
        objectIndex: 0,
        label,
        formula,
        charge,
        spinMultiplicity,
        method: gaussian.method,
        energyGas: gaussian.energyGas,
        energySolution: gaussian.energySolution,
        energyUnit: "hartree",
        coordinatePreview: coordinatePreviewFromAtoms(atoms, vibrations.modes),
        roleHint: roleHintFromName(name),
        warnings: vibrations.warnings,
        energyTable,
      })],
      warnings: vibrations.warnings,
      energyTable,
      computation,
    })
  }

  const orca = parseOrca(preview)
  if (orca) {
    const atoms = orcaAtomsFromText(preview)
    const vibrationWarnings = orcaVibrationUnavailableWarnings(preview, name)
    const [charge, spinMultiplicity] = orcaChargeMultiplicity(preview)
    const energyTable = orcaEnergyTable(preview)
    return sourceResultFromCandidates({
      label,
      sourceKind: "ORCA",
      kind: guessedKind,
      solvent: inferSolvent(preview),
      parserId: "orca-output-text-preview",
      candidates: [parseCandidate({
        objectIndex: 0,
        label,
        formula: inferFormulaFromText(preview) ?? (atoms.length > 0 ? formulaFromAtoms(atoms) : "pending"),
        charge,
        spinMultiplicity,
        method: orcaMethodFromText(preview) ?? "ORCA single point",
        energyGas: orca.energyGas,
        energySolution: orca.energySolution,
        energyUnit: "hartree",
        coordinatePreview: coordinatePreviewFromAtoms(atoms),
        roleHint: roleHintFromName(name),
        warnings: vibrationWarnings,
        energyTable,
      })],
      warnings: vibrationWarnings,
      energyTable,
      computation,
    })
  }

  const extxyz = parseExtxyzPreview(name, preview)
  if (extxyz) {
    return sourceResultFromCandidates({
      label,
      sourceKind: "extxyz",
      kind: guessedKind,
      solvent: "unassigned",
      parserId: "xyz-ase-text-preview",
      candidates: extxyz.candidates,
      warnings: extxyz.warnings,
      computation,
    })
  }

  const maple = parseMaplePreview(name, preview)
  if (maple) {
    return sourceResultFromCandidates({
      label,
      sourceKind: "MAPLE",
      kind: guessedKind,
      solvent: "unassigned",
      parserId: "maple-output-text-preview",
      candidates: maple.candidates,
      warnings: maple.warnings,
      computation,
    })
  }

  const xyz = parseXyzPreview(name, preview)
  if (xyz) {
    return sourceResultFromCandidates({
      label,
      sourceKind: "XYZ",
      kind: guessedKind,
      solvent: "unassigned",
      parserId: "xyz-text-preview",
      candidates: xyz.candidates,
      warnings: xyz.warnings,
      computation,
    })
  }

  if (looksLikeXyzInput(name, preview)) {
    return failedSourceResult({
      label,
      sourceKind: "XYZ",
      kind: guessedKind,
      parserId: "xyz-text-preview",
      warning: { code: "parse_failed", message: "XYZ atom count does not match the number of coordinate lines.", target: name },
      computation,
    })
  }

  return {
    label,
    sourceKind: "Raw",
    formula: "pending",
    kind: guessedKind,
    method: "unparsed source",
    solvent: "unassigned",
    energyGas: null,
    energySolution: null,
    energyUnit: "kcal/mol",
    parsed: false,
    parserId: null,
    parserVersion: null,
    objectCount: 0,
    warnings: [{ code: "unsupported_format", message: "No supported parser recognized this source preview.", target: name }],
    candidates: [],
    coordinatePreview: null,
    energyTable: null,
    parseScope: "preview",
    confidence: "low",
    ...computation,
  }
}

function failedSourceResult(input: {
  label: string
  sourceKind: string
  kind: ParsedNodeKind
  parserId: string
  warning: ParseWarning
  parseScope?: ParseScope
  confidence?: ParseConfidence
  computation?: ComputationMetadata
}): SourceParseResult {
  return {
    label: input.label,
    sourceKind: input.sourceKind,
    formula: "pending",
    kind: input.kind,
    method: "unparsed source",
    solvent: "unassigned",
    energyGas: null,
    energySolution: null,
    energyUnit: "kcal/mol",
    parsed: false,
    parserId: input.parserId,
    parserVersion: parserVersion,
    objectCount: 0,
    warnings: [input.warning],
    candidates: [],
    coordinatePreview: null,
    energyTable: null,
    parseScope: input.parseScope ?? "preview",
    confidence: input.confidence ?? "low",
    ...(input.computation ?? {}),
  }
}

function sourceResultFromCandidates(input: {
  label: string
  sourceKind: string
  kind: ParsedNodeKind
  solvent: string
  parserId: string
  candidates: ParseCandidate[]
  warnings?: ParseWarning[]
  energyTable?: ParsedEnergyTableData | null
  parseScope?: ParseScope
  confidence?: ParseConfidence
  computation?: ComputationMetadata
}): SourceParseResult {
  const primary = primaryCandidate(input.candidates)
  const parserWarnings = [...(input.warnings ?? [])].sort((left, right) => left.code.localeCompare(right.code))
  const warnings = input.candidates.length > 1
    ? [
        ...parserWarnings,
        { code: "candidate_selection_available", message: `Parser preview produced ${input.candidates.length} candidates.`, target: input.label },
      ]
    : parserWarnings
  return {
    label: primary.label,
    sourceKind: input.sourceKind,
    formula: primary.formula,
    kind: input.kind,
    method: primary.method,
    solvent: input.solvent,
    energyGas: primary.energyGas,
    energySolution: primary.energySolution,
    energyUnit: primary.energyUnit,
    parsed: true,
    parserId: input.parserId,
    parserVersion,
    objectCount: input.candidates.length,
    warnings,
    candidates: input.candidates,
    coordinatePreview: primary.coordinatePreview,
    energyTable: input.energyTable ?? primary.energyTable ?? null,
    parseScope: input.parseScope ?? "preview",
    confidence: input.confidence ?? "low",
    ...(input.computation ?? {}),
  }
}

type ComputationMetadata = {
  terminationStatus: ComputationTerminationStatus
  terminationLabel: string
  jobCpuTime: string | null
  elapsedTime: string | null
}

function computationMetadataFromSource(sourceText: string): ComputationMetadata {
  const termination = classifyComputationTermination(sourceText)
  return {
    terminationStatus: termination.status,
    terminationLabel: termination.label,
    jobCpuTime: jobCpuTimeFromSource(sourceText),
    elapsedTime: elapsedTimeFromSource(sourceText),
  }
}

function classifyComputationTermination(sourceText: string): { label: string; status: ComputationTerminationStatus } {
  const normal = lastRegexMatchWithIndex(sourceText, /normal termination of gaussian[^\n]*/gi)
    ?? lastRegexMatchWithIndex(sourceText, /ORCA TERMINATED NORMALLY[^\n]*/gi)
  const normalEnd = normal ? normal.index + normal.text.length : -1
  const errors = [
    lastRegexMatchWithIndex(sourceText, /error termination via lnk1e in .*?\bl(\d+)\.exe\b/gi, (match) => `L${match[1]}`),
    lastRegexMatchWithIndex(sourceText, /error termination request processed by link\s+(\d+)/gi, (match) => `L${match[1]}`),
    lastRegexMatchWithIndex(sourceText, /segmentation fault/gi, () => "Segmentation fault"),
    lastRegexMatchWithIndex(sourceText, /(?:ORCA finished by error|aborting the run|error termination)/gi, () => "Error termination"),
    lastRegexMatchWithIndex(sourceText, /(?:killed|signal)/gi, () => "Killed"),
  ]
    .filter((item): item is { index: number; text: string; label: string } => Boolean(item))
    .sort((left, right) => right.index - left.index)
  const latestError = errors[0]
  if (latestError && latestError.index > normalEnd) return { label: "error", status: "error" }
  if (normal) return { label: "normal", status: "normal" }
  if (latestError) return { label: "error", status: "error" }
  return { label: "unknown", status: "unknown" }
}

function jobCpuTimeFromSource(sourceText: string): string | null {
  return normalizedRuntimeFromLine(firstTrimmedMatch(sourceText, /^\s*Job cpu time:\s*(.+)$/gim))
}

function elapsedTimeFromSource(sourceText: string): string | null {
  return normalizedRuntimeFromLine(firstTrimmedMatch(sourceText, /^\s*Elapsed time:\s*(.+)$/gim))
    ?? normalizedRuntimeFromLine(firstTrimmedMatch(sourceText, /^\s*TOTAL RUN TIME:\s*(.+)$/gim))
}

function normalizedRuntimeFromLine(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.replace(/\s+/g, " ").replace(/\.$/, "").trim()
  const gaussian = trimmed.match(/(\d+)\s+days?\s+(\d+)\s+hours?\s+(\d+)\s+minutes?\s+([\d.]+)\s+seconds?/i)
  if (gaussian) return `${gaussian[1]}d ${gaussian[2]}h ${gaussian[3]}m ${gaussian[4]}s`
  return trimmed || null
}

function lastRegexMatchWithIndex(
  sourceText: string,
  pattern: RegExp,
  label?: (match: RegExpMatchArray) => string,
): { index: number; text: string; label: string } | null {
  const matches = Array.from(sourceText.matchAll(pattern))
  const match = matches.at(-1)
  if (!match || typeof match.index !== "number") return null
  return { index: match.index, text: match[0], label: label?.(match) ?? match[0] }
}

function primaryCandidate(candidates: ParseCandidate[]): ParseCandidate {
  return [...candidates].reverse().find((candidate) => candidate.roleHint === "final") ?? candidates[candidates.length - 1]
}

function parseCandidate(input: Omit<ParseCandidate, "candidateId" | "warnings"> & { warnings?: ParseWarning[] }): ParseCandidate {
  return {
    ...input,
    candidateId: `candidate-${input.objectIndex + 1}-${safeIdentifier(input.label)}`,
    warnings: input.warnings ?? [],
  }
}

function parseGaussian(preview: string): { method: string; energyGas: number; energySolution: number | null } | null {
  const match = lastMatch(gaussianScfPattern, preview)
  if (!match) return null
  const energyGas = parseNumber(match[2])
  if (energyGas === null) return null
  const freeEnergy = numberFromMatch(lastMatch(gaussianFreeEnergyPattern, preview))
  const correction = numberFromMatch(lastMatch(gaussianGibbsCorrectionPattern, preview))
  return {
    method: gaussianMethodFromText(preview) ?? match[1] ?? "Gaussian",
    energyGas,
    energySolution: freeEnergy ?? (typeof correction === "number" ? energyGas + correction : null),
  }
}

function gaussianEnergyTable(preview: string): ParsedEnergyTableData | null {
  const scfMatch = lastMatch(gaussianScfPattern, preview)
  const egasHartree = scfMatch ? parseNumber(scfMatch[2]) : null
  const freeEnergy = numberFromMatch(lastMatch(gaussianFreeEnergyPattern, preview))
  const correction = numberFromMatch(lastMatch(gaussianGibbsCorrectionPattern, preview))
  const ggasHartree = typeof freeEnergy === "number"
    ? freeEnergy
    : (typeof egasHartree === "number" && typeof correction === "number" ? egasHartree + correction : null)
  const gasBasisFunctions = optionalIntegerFromText(firstGroup(gaussianBasisFunctionPattern, preview) ?? undefined)
  const table: ParsedEnergyTableData = {
    egasHartree,
    gasBasisFunctions,
    ggasHartree,
    ggas1mHartree: typeof ggasHartree === "number" ? ggasHartree + oneMStandardStateCorrectionHartree : null,
    standardStateCorrectionHartree: typeof ggasHartree === "number" ? oneMStandardStateCorrectionHartree : null,
  }
  return hasEnergyTableValue(table) ? table : null
}

function parseOrca(preview: string): { energyGas: number; energySolution: number | null } | null {
  const energyGas = numberFromMatch(lastMatch(orcaEnergyPattern, preview)) ?? numberFromMatch(lastMatch(orcaTotalEnergyPattern, preview))
  if (typeof energyGas !== "number") return null
  const solvation = numberFromMatch(lastMatch(orcaSolvationPattern, preview))
  return {
    energyGas,
    energySolution: typeof solvation === "number" ? energyGas + solvation : null,
  }
}

function orcaVibrationUnavailableWarnings(preview: string, target: string): ParseWarning[] {
  return /VIBRATIONAL FREQUENCIES|NORMAL MODES/i.test(preview)
    ? [{ code: "vibration_unavailable", message: "ORCA vibration data needs the full-file cclib parser or a recognized normal-mode block.", target }]
    : []
}

function orcaEnergyTable(preview: string): ParsedEnergyTableData | null {
  const egasHartree = numberFromMatch(lastMatch(orcaEnergyPattern, preview)) ?? numberFromMatch(lastMatch(orcaTotalEnergyPattern, preview))
  const gasBasisFunctions = optionalIntegerFromText(firstGroup(orcaBasisFunctionPattern, preview) ?? undefined)
  const table: ParsedEnergyTableData = {
    egasHartree,
    gasBasisFunctions,
  }
  return hasEnergyTableValue(table) ? table : null
}

function orcaAtomsFromText(preview: string): CoordinateAtom[] {
  const lines = preview.split(/\r?\n/)
  let bestAtoms: CoordinateAtom[] = []
  lines.forEach((line, index) => {
    if (!/CARTESIAN COORDINATES/i.test(line)) return
    const atoms = orcaCoordinateBlock(lines, index + 1)
    if (atoms.length > 0) bestAtoms = atoms
  })
  return bestAtoms
}

function orcaCoordinateBlock(lines: string[], start: number): CoordinateAtom[] {
  const atoms: CoordinateAtom[] = []
  for (const line of lines.slice(start)) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (atoms.length > 0) break
      continue
    }
    if (/^-+$/.test(trimmed)) continue
    const parts = trimmed.split(/\s+/)
    const symbol = /^[A-Z][a-z]?$/.test(parts[0])
      ? parts[0]
      : (/^\d+$/.test(parts[0]) && /^[A-Z][a-z]?$/.test(parts[1]) ? parts[1] : null)
    if (!symbol) {
      if (atoms.length > 0) break
      continue
    }
    const coordinates = parts.slice(-3).map(parseNumber)
    if (coordinates.length < 3 || coordinates.some((value) => value === null)) {
      if (atoms.length > 0) break
      continue
    }
    atoms.push({ element: symbol, x: coordinates[0] ?? 0, y: coordinates[1] ?? 0, z: coordinates[2] ?? 0 })
  }
  return atoms
}

function orcaChargeMultiplicity(preview: string): [number | null, number | null] {
  const xyz = preview.match(orcaXyzDirectivePattern)
  if (xyz) return [Number.parseInt(xyz[1], 10), Number.parseInt(xyz[2], 10)]
  return [
    optionalIntegerFromText(preview.match(orcaChargePattern)?.[1]),
    optionalIntegerFromText(preview.match(orcaMultiplicityPattern)?.[1]),
  ]
}

function orcaMethodFromText(preview: string): string | null {
  const route = preview.match(orcaRoutePattern)?.[1]?.trim()
  return route ? route.split(/\s+/).slice(0, 4).join(" ") : null
}

function parseExtxyzPreview(name: string, preview: string): { candidates: ParseCandidate[]; warnings: ParseWarning[] } | null {
  const frames = parseXyzFrames(preview, name)
  if (frames.length === 0 || !frames.some((frame) => looksLikeExtxyzComment(frame.comment))) return null

  const warnings: ParseWarning[] = []
  const candidates = frames.map((frame, index) => {
    const metadata = parseExtxyzMetadata(frame.comment)
    const energy = extxyzEnergyFromMetadata(metadata, name)
    warnings.push(...energy.warnings)
    return parseCandidate({
      objectIndex: index,
      label: extxyzFrameLabel(name, metadata, index, frames.length),
      formula: formulaFromAtoms(frame.atoms),
      charge: optionalIntegerFromText(metadata.charge),
      spinMultiplicity: optionalIntegerFromText(metadata.spin_multiplicity ?? metadata.spin),
      method: "ASE extxyz",
      energyGas: energy.value,
      energySolution: null,
      energyUnit: energy.value === null ? "kcal/mol" : "hartree",
      coordinatePreview: coordinatePreviewFromAtoms(frame.atoms),
      roleHint: frames.length > 1 ? (index === frames.length - 1 ? "final" : "path-point") : roleHintFromName(name),
      warnings: energy.warnings,
    })
  })
  return { candidates, warnings }
}

function parseExtxyzMetadata(comment: string): Record<string, string> {
  const metadata: Record<string, string> = {}
  for (const match of comment.matchAll(extxyzMetadataPattern)) {
    let value = match[2] ?? ""
    if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === "\"" || value[0] === "'")) {
      value = value.slice(1, -1)
    }
    metadata[match[1] ?? ""] = value
  }
  return metadata
}

function extxyzEnergyFromMetadata(metadata: Record<string, string>, target: string): { value: number | null; warnings: ParseWarning[] } {
  if (metadata.energy === undefined) {
    return {
      value: null,
      warnings: [{ code: "missing_section", message: "extxyz frame does not include energy metadata.", target }],
    }
  }
  const energy = optionalNumberFromText(metadata.energy)
  if (energy === null) {
    return {
      value: null,
      warnings: [{ code: "ambiguous_value", message: "extxyz energy metadata is not numeric.", target }],
    }
  }
  return {
    value: energy * evToHartree,
    warnings: [{ code: "unit_assumed", message: "extxyz energy metadata was treated as eV and converted to hartree.", target }],
  }
}

function extxyzFrameLabel(name: string, metadata: Record<string, string>, index: number, total: number): string {
  const label = metadata.label || (total > 1 ? `${basenameWithoutExtension(name)} frame ${index + 1}` : basenameWithoutExtension(name))
  return label.slice(0, 80)
}

function parseMaplePreview(name: string, preview: string): { candidates: ParseCandidate[]; warnings: ParseWarning[] } | null {
  if (looksLikeMapleXyz(preview)) {
    return parseXyzPreview(name, preview, "MAPLE trajectory", "hartree")
  }

  if (mapleBannerMarkers.some((marker) => preview.slice(0, 8000).includes(marker))) {
    const atoms = lastMapleCoordinateBlock(preview)
    if (atoms.length === 0) return null
    const energyGas = lastMapleOutputEnergy(preview)
    const task = firstGroup(mapleTaskPattern, preview)
    const model = firstGroup(mapleModelPattern, preview)
    const warnings = energyGas === null
      ? [{ code: "missing_section", message: "MAPLE output does not contain an electronic energy.", target: name }]
      : []
    return {
      warnings,
      candidates: [parseCandidate({
        objectIndex: 0,
        label: task ? `MAPLE ${task}` : basenameWithoutExtension(name),
        formula: formulaFromAtoms(atoms),
        charge: null,
        spinMultiplicity: null,
        method: [task, model].filter(Boolean).join(" ") || "MAPLE output",
        energyGas,
        energySolution: null,
        energyUnit: energyGas === null ? "kcal/mol" : "hartree",
        coordinatePreview: coordinatePreviewFromAtoms(atoms),
        roleHint: roleHintFromName(name),
        warnings,
      })],
    }
  }

  const matches = Array.from(preview.matchAll(maplePointPattern))
  const last = matches.at(-1)
  if (!last) return null
  const energyGas = parseNumber(last[1])
  if (energyGas === null) return null
  return {
    warnings: [],
    candidates: [parseCandidate({
      objectIndex: 0,
      label: basenameWithoutExtension(name),
      formula: inferFormulaFromText(preview) ?? "pending",
      charge: null,
      spinMultiplicity: null,
      method: "MAPLE IRC",
      energyGas,
      energySolution: null,
      energyUnit: "hartree",
      coordinatePreview: null,
      roleHint: roleHintFromName(name),
    })],
  }
}

function parseXyzPreview(name: string, preview: string, method = "XYZ geometry", defaultEnergyUnit: string | null = null): { candidates: ParseCandidate[]; warnings: ParseWarning[] } | null {
  const frames = parseXyzFrames(preview, name, defaultEnergyUnit)
  if (frames.length === 0) return null
  const warnings: ParseWarning[] = []
  const candidates = frames.map((frame, index) => {
    const frameWarnings = frame.energyGas === null
      ? [...frame.energyWarnings, { code: "missing_section", message: "XYZ frame does not include an electronic energy.", target: name }]
      : frame.energyWarnings
    warnings.push(...frameWarnings)
    return parseCandidate({
      objectIndex: index,
      label: xyzFrameLabel(name, frame.comment, index, frames.length),
      formula: formulaFromAtoms(frame.atoms),
      charge: null,
      spinMultiplicity: null,
      method,
      energyGas: frame.energyGas,
      energySolution: null,
      energyUnit: frame.energyGas === null ? "kcal/mol" : "hartree",
      coordinatePreview: coordinatePreviewFromAtoms(frame.atoms),
      roleHint: frames.length > 1 ? (index === frames.length - 1 ? "final" : "path-point") : roleHintFromName(name),
      warnings: frameWarnings,
    })
  })
  return { candidates, warnings }
}

function parseXyzFrames(preview: string, target = "XYZ frame", defaultEnergyUnit: string | null = null): Array<{ atoms: CoordinateAtom[]; comment: string; energyGas: number | null; energyWarnings: ParseWarning[] }> {
  const lines = preview.split(/\r?\n/).map((line) => line.trimEnd())
  const frames: Array<{ atoms: CoordinateAtom[]; comment: string; energyGas: number | null; energyWarnings: ParseWarning[] }> = []
  let index = 0
  while (index < lines.length) {
    if (!lines[index]?.trim()) {
      index += 1
      continue
    }
    const atomCount = Number.parseInt(lines[index]?.trim() ?? "", 10)
    if (!Number.isInteger(atomCount) || atomCount <= 0) return []
    const commentIndex = index + 1
    const atomLines = lines.slice(commentIndex + 1, commentIndex + 1 + atomCount)
    if (commentIndex >= lines.length || atomLines.length !== atomCount) return []
    const atoms: CoordinateAtom[] = []
    for (const line of atomLines) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 4 || !/^[A-Z][a-z]?$/.test(parts[0])) return []
      const coordinates = [parseNumber(parts[1]), parseNumber(parts[2]), parseNumber(parts[3])]
      if (coordinates.some((value) => value === null)) return []
      atoms.push({ element: parts[0], x: coordinates[0] ?? 0, y: coordinates[1] ?? 0, z: coordinates[2] ?? 0 })
    }
    const comment = lines[commentIndex]?.trim() ?? ""
    const energy = xyzEnergyFromComment(comment, target, defaultEnergyUnit)
    frames.push({ atoms, comment, energyGas: energy.value, energyWarnings: energy.warnings })
    index = commentIndex + 1 + atomCount
  }
  return frames
}

function xyzEnergyFromComment(comment: string, target: string, defaultEnergyUnit: string | null = null): { value: number | null; warnings: ParseWarning[] } {
  const match = comment.match(commentEnergyPattern)
  if (!match) return { value: null, warnings: [] }
  const value = parseNumber(match[1])
  if (value === null) {
    return {
      value: null,
      warnings: [{ code: "ambiguous_value", message: "XYZ energy comment is not numeric.", target }],
    }
  }
  const unit = (match[2] ?? defaultEnergyUnit ?? "").toLowerCase()
  if (unit === "hartree" || unit === "ha") return { value, warnings: [] }
  if (unit === "ev") return { value: value * evToHartree, warnings: [] }
  return {
    value,
    warnings: [{ code: "unit_assumed", message: "XYZ energy comment did not include a unit; assumed hartree.", target }],
  }
}

function xyzFrameLabel(name: string, comment: string, index: number, total: number): string {
  const frameLabel = comment.match(xyzFrameLabelPattern)?.[1]?.trim()
  if (frameLabel) return frameLabel.slice(0, 80)
  if (comment && !comment.match(commentEnergyPattern)) return comment.slice(0, 80)
  if (total > 1) return `${basenameWithoutExtension(name)} frame ${index + 1}`
  return basenameWithoutExtension(name)
}

function looksLikeMapleXyz(preview: string): boolean {
  const lines = preview.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return lines.length >= 2 && /^\d+$/.test(lines[0]) && mapleXyzCommentPattern.test(lines[1])
}

function looksLikeExtxyzComment(comment: string): boolean {
  return comment.includes("Properties=") || comment.includes("Lattice=")
}

function looksLikeXyzInput(name: string, preview: string): boolean {
  if (!name.toLowerCase().endsWith(".xyz")) return false
  const firstLine = preview.split(/\r?\n/).find((line) => line.trim())?.trim() ?? ""
  return /^[-+]?\d+$/.test(firstLine)
}

function lastMapleCoordinateBlock(preview: string): CoordinateAtom[] {
  const blocks: CoordinateAtom[][] = []
  let current: CoordinateAtom[] = []
  for (const line of preview.split(/\r?\n/)) {
    const match = line.match(mapleCoordinatePattern)
    if (!match) {
      if (current.length > 0) {
        blocks.push(current)
        current = []
      }
      continue
    }
    current.push({
      element: match[1],
      x: parseNumber(match[2]) ?? 0,
      y: parseNumber(match[3]) ?? 0,
      z: parseNumber(match[4]) ?? 0,
    })
  }
  if (current.length > 0) blocks.push(current)
  return blocks.at(-1) ?? []
}

function lastMapleOutputEnergy(preview: string): number | null {
  const matches = Array.from(preview.matchAll(mapleOutputEnergyPattern))
  const last = matches.at(-1)
  return last ? parseNumber(last[1]) : null
}

function gaussianAtomsFromText(preview: string): CoordinateAtom[] {
  const lines = preview.split(/\r?\n/)
  let bestAtoms: CoordinateAtom[] = []
  lines.forEach((line, index) => {
    if (!line.includes("Standard orientation:") && !line.includes("Input orientation:")) return
    const atoms = gaussianOrientationBlock(lines, index + 1)
    if (atoms.length > 0) bestAtoms = atoms
  })
  return bestAtoms
}

function gaussianOrientationBlock(lines: string[], start: number): CoordinateAtom[] {
  let dashCount = 0
  const atoms: CoordinateAtom[] = []
  for (const line of lines.slice(start)) {
    if (/^\s*-+\s*$/.test(line)) {
      dashCount += 1
      if (dashCount >= 3) break
      continue
    }
    if (dashCount < 2) continue
    const parts = line.trim().split(/\s+/)
    if (parts.length < 6) continue
    const atomicNumber = Number.parseInt(parts[1], 10)
    if (!Number.isInteger(atomicNumber)) continue
    const coordinates = [parseNumber(parts[3]), parseNumber(parts[4]), parseNumber(parts[5])]
    if (coordinates.some((value) => value === null)) continue
    atoms.push({
      element: symbolFromAtomicNumber(atomicNumber),
      x: coordinates[0] ?? 0,
      y: coordinates[1] ?? 0,
      z: coordinates[2] ?? 0,
    })
  }
  return atoms
}

function gaussianChargeMultiplicity(preview: string): [number | null, number | null] {
  const matches = Array.from(preview.matchAll(gaussianChargeMultiplicityPattern))
  const last = matches.at(-1)
  return last ? [Number.parseInt(last[1], 10), Number.parseInt(last[2], 10)] : [null, null]
}

function gaussianMethodFromText(preview: string): string | null {
  const match = preview.match(gaussianRoutePattern)
  if (!match) return null
  return match[1].split(/\s+/).find((token) => token.includes("/"))?.split("/", 1)[0] ?? null
}

function coordinatePreviewFromAtoms(atoms: Array<string | CoordinateAtom>, vibrationModes: VibrationalMode[] = []): CoordinatePreview | null {
  if (atoms.length === 0) return null
  const elements = atomElements(atoms)
  const coordinateAtoms = atoms.every(isCoordinateAtom) ? atoms : undefined
  return {
    atomCount: atoms.length,
    has3d: Boolean(coordinateAtoms?.length),
    elements: Array.from(new Set(elements)).sort(),
    atoms: coordinateAtoms,
    ...(vibrationModes.length > 0 ? { vibrationModes } : {}),
    previewKind: "text",
  }
}

function isCoordinateAtom(atom: string | CoordinateAtom): atom is CoordinateAtom {
  return typeof atom !== "string"
}

function inferNodeKind(name: string): ParsedNodeKind {
  const lower = name.toLowerCase()
  if (/\b(ts|transition|saddle)\b/.test(lower)) return "transition"
  if (/\b(product|adduct|prod|final)\b/.test(lower)) return "product"
  if (/\b(reactant|reagent|substrate)\b/.test(lower)) return "reactant"
  return "intermediate"
}

function inferSolvent(preview: string): string {
  if (/toluene/i.test(preview)) return "Toluene"
  if (/water|h2o/i.test(preview)) return "Water"
  if (/acetonitrile|meCN/i.test(preview)) return "Acetonitrile"
  if (/(?:SMD|CPCM|PCM)/i.test(preview)) return "implicit solvent"
  return "unassigned"
}

function inferFormulaFromText(preview: string): string | null {
  const formulaMatch = preview.match(formulaPattern)
  return formulaMatch?.[1] ?? null
}

function atomElements(atoms: Array<string | CoordinateAtom>): string[] {
  return atoms.map((atom) => typeof atom === "string" ? atom : atom.element)
}

function formulaFromAtoms(atoms: Array<string | CoordinateAtom>): string {
  const counts = new Map<string, number>()
  atomElements(atoms).forEach((atom) => counts.set(atom, (counts.get(atom) ?? 0) + 1))
  const ordered = [
    ...["C", "H"].filter((atom) => counts.has(atom)),
    ...Array.from(counts.keys()).filter((atom) => atom !== "C" && atom !== "H").sort(),
  ]
  return ordered.map((atom) => `${atom}${counts.get(atom) === 1 ? "" : counts.get(atom)}`).join("")
}

function roleHintFromName(name: string): string {
  const lower = name.toLowerCase()
  if (/\b(final|product|prod|adduct)\b/.test(lower)) return "final"
  if (/\b(ts|transition|saddle)\b/.test(lower)) return "transition"
  if (/\b(frame|image|irc|path)\b/.test(lower)) return "path-point"
  return "unknown"
}

function firstGroup(pattern: RegExp, preview: string): string | null {
  return preview.match(pattern)?.[1]?.trim() ?? null
}

function firstTrimmedMatch(sourceText: string, pattern: RegExp): string | null {
  const match = Array.from(sourceText.matchAll(pattern)).at(-1)
  return match?.[1]?.trim() || null
}

function lastMatch(pattern: RegExp, preview: string): RegExpMatchArray | null {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
  const globalPattern = new RegExp(pattern.source, flags)
  let result: RegExpMatchArray | null = null
  for (const match of preview.matchAll(globalPattern)) result = match
  return result
}

function numberFromMatch(match: RegExpMatchArray | null): number | null {
  return match?.[1] ? parseNumber(match[1]) : null
}

function hasEnergyTableValue(table: ParsedEnergyTableData): boolean {
  return Object.values(table).some((value) => typeof value === "number" && Number.isFinite(value))
}

function parseNumber(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(/[Dd]/g, "E"))
  return Number.isFinite(parsed) ? parsed : null
}

function optionalNumberFromText(value: string | undefined): number | null {
  if (!value || !extxyzNumberPattern.test(value.trim())) return null
  return parseNumber(value)
}

function optionalIntegerFromText(value: string | undefined): number | null {
  const parsed = optionalNumberFromText(value)
  return parsed !== null && Number.isInteger(parsed) ? parsed : null
}

function basenameWithoutExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "") || name
}

function safeIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "source"
}

function symbolFromAtomicNumber(number: number): string {
  return elements[number] ?? `E${number}`
}

const elements = [
  "",
  "H",
  "He",
  "Li",
  "Be",
  "B",
  "C",
  "N",
  "O",
  "F",
  "Ne",
  "Na",
  "Mg",
  "Al",
  "Si",
  "P",
  "S",
  "Cl",
  "Ar",
  "K",
  "Ca",
  "Sc",
  "Ti",
  "V",
  "Cr",
  "Mn",
  "Fe",
  "Co",
  "Ni",
  "Cu",
  "Zn",
  "Ga",
  "Ge",
  "As",
  "Se",
  "Br",
  "Kr",
  "Rb",
  "Sr",
  "Y",
  "Zr",
  "Nb",
  "Mo",
  "Tc",
  "Ru",
  "Rh",
  "Pd",
  "Ag",
  "Cd",
  "In",
  "Sn",
  "Sb",
  "Te",
  "I",
  "Xe",
  "Cs",
  "Ba",
  "La",
  "Ce",
  "Pr",
  "Nd",
  "Pm",
  "Sm",
  "Eu",
  "Gd",
  "Tb",
  "Dy",
  "Ho",
  "Er",
  "Tm",
  "Yb",
  "Lu",
  "Hf",
  "Ta",
  "W",
  "Re",
  "Os",
  "Ir",
  "Pt",
  "Au",
  "Hg",
  "Tl",
  "Pb",
  "Bi",
  "Po",
  "At",
  "Rn",
]
