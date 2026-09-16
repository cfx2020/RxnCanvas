export type ParsedEnergyUnit = "kcal/mol" | "hartree"
export type ParsedNodeKind = "reactant" | "transition" | "intermediate" | "product"

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
  source: "cclib" | "rxnflow-text"
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
