import type { ParsedEnergyTableData, ParsedEnergyUnit, SourceParseResult } from "./sourceParsers"

export type NodeKind = "reactant" | "transition" | "intermediate" | "product"

export type Point = {
  x: number
  y: number
}

export type CanvasViewport = {
  x: number
  y: number
  zoom: number
}

export type EnergyCorrectionKind = "manual" | "solvation" | "resonance" | "other"

export type EnergyCorrectionUnit = "hartree" | "kcal/mol" | "kj/mol"

export type EnergyCorrection = {
  id: string
  kind: EnergyCorrectionKind
  value: number
  unit: EnergyCorrectionUnit
  note?: string
}

export type ManualStructurePayload = {
  ket?: string
  molfile?: string
  cdxml?: string
  svg?: string
}

export type FlowNode = {
  id: string
  label: string
  formula: string
  kind: NodeKind
  coefficient?: number
  method: string
  solvent: string
  energyGas: number | null
  energySolution: number | null
  energyUnit: ParsedEnergyUnit
  sourceStatus?: "parsed" | "staged" | "demo"
  sourceFileId?: string
  sourceCandidateId?: string
  sourceObjectIndex?: number
  parserId?: string | null
  parserVersion?: string | null
  roleHint?: string
  charge?: number | null
  spinMultiplicity?: number | null
  energyTable?: ParsedEnergyTableData | null
  corrections?: EnergyCorrection[]
  manualStructureKet?: string
  manualStructureMolfile?: string
  manualStructureCdxml?: string
  manualStructureSvg?: string
  position: Point
}

export type FlowEdge = {
  id: string
  sourceId: string
  targetId: string
  label: string
}

export type FlowBarrier = {
  id: string
  sourceId: string
  targetId: string
  label?: string
}

export type ProjectSummary = {
  id: string
  label: string
  meta: string
}

export type SourceFile = {
  id: string
  name: string
  kind: string
  size: number
  status: "ready" | "parsed" | "staged"
  preview: string
  sourcePath?: string
  storedPath?: string
  checksum?: string
  parse?: SourceParseResult
}

export type ImportLedgerEntryStatus = "registered" | "staged" | "failed"

export type ImportLedgerEntry = {
  id: string
  fileId: string
  sourceName: string
  sourceKind: string
  status: ImportLedgerEntryStatus
  parserId?: string | null
  parserVersion?: string | null
  candidateId?: string
  objectIndex?: number
  registeredNodeIds: string[]
  warningCodes: string[]
}

export type ImportLedger = {
  schemaVersion: 1
  entries: ImportLedgerEntry[]
}

export type RxnFlowProjectPackage = {
  schemaVersion: 1
  packageKind: "rxnflow-project"
  project: ProjectSummary
  files: SourceFile[]
  nodes: FlowNode[]
  edges: FlowEdge[]
  barriers: FlowBarrier[]
  viewport: CanvasViewport
  importLedger: ImportLedger
  savedAt: string
}

type BuildProjectPackageOptions = {
  barriers?: FlowBarrier[]
  savedAt?: string
}

export function buildProjectPackage(
  project: ProjectSummary,
  files: SourceFile[],
  nodes: FlowNode[],
  edges: FlowEdge[],
  viewport: CanvasViewport,
  options: string | BuildProjectPackageOptions = new Date().toISOString(),
): RxnFlowProjectPackage {
  const savedAt = typeof options === "string" ? options : options.savedAt ?? new Date().toISOString()
  const barriers = typeof options === "string" ? [] : options.barriers ?? []
  return {
    schemaVersion: 1,
    packageKind: "rxnflow-project",
    project,
    files,
    nodes,
    edges,
    barriers,
    viewport,
    importLedger: buildImportLedger(files, nodes),
    savedAt,
  }
}

export function parseProjectPackage(content: string): RxnFlowProjectPackage | null {
  try {
    const value = JSON.parse(content) as Partial<RxnFlowProjectPackage>
    if (value.schemaVersion !== 1 || value.packageKind !== "rxnflow-project") return null
    if (!isObject(value.project) || !Array.isArray(value.files) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
      return null
    }
    const viewport = normalizeViewport(value.viewport)
    if (!viewport) return null

    const files = value.files.map(normalizeProjectFile)
    const nodes = value.nodes.map(normalizeProjectNode)
    const edges = value.edges.map(normalizeProjectEdge)
    const barriers = Array.isArray(value.barriers) ? value.barriers.map(normalizeProjectBarrier) : []

    return {
      schemaVersion: 1,
      packageKind: "rxnflow-project",
      project: normalizeProject(value.project),
      files,
      nodes,
      edges,
      barriers,
      viewport,
      importLedger: normalizeImportLedger(value.importLedger, files, nodes),
      savedAt: typeof value.savedAt === "string" && value.savedAt.length > 0 ? value.savedAt : new Date(0).toISOString(),
    }
  } catch {
    return null
  }
}

export function safeProjectFileStem(label: string): string {
  const stem = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return stem || "rxnflow-project"
}

export function buildImportLedger(files: SourceFile[], nodes: FlowNode[]): ImportLedger {
  const nodesByFile = new Map<string, FlowNode[]>()
  nodes.forEach((node) => {
    if (!node.sourceFileId) return
    nodesByFile.set(node.sourceFileId, [...(nodesByFile.get(node.sourceFileId) ?? []), node])
  })

  const entries = files.flatMap((file) => {
    const fileNodes = nodesByFile.get(file.id) ?? []
    if (fileNodes.length === 0) {
      return [importLedgerEntryForFile(file)]
    }

    const groupedNodes = new Map<string, FlowNode[]>()
    fileNodes.forEach((node) => {
      const key = `${node.sourceCandidateId ?? ""}:${node.sourceObjectIndex ?? ""}`
      groupedNodes.set(key, [...(groupedNodes.get(key) ?? []), node])
    })

    return Array.from(groupedNodes.values()).map((group, index) =>
      importLedgerEntryForRegisteredNodes(file, group, index),
    )
  })

  return { schemaVersion: 1, entries }
}

function importLedgerEntryForFile(file: SourceFile): ImportLedgerEntry {
  return {
    id: importLedgerEntryId(file.id, undefined, undefined, 0),
    fileId: file.id,
    sourceName: file.name,
    sourceKind: file.kind,
    status: "staged",
    parserId: file.parse?.parserId ?? null,
    parserVersion: file.parse?.parserVersion ?? null,
    registeredNodeIds: [],
    warningCodes: warningCodesFromFile(file),
  }
}

function importLedgerEntryForRegisteredNodes(file: SourceFile, nodes: FlowNode[], index: number): ImportLedgerEntry {
  const firstNode = nodes[0]
  return {
    id: importLedgerEntryId(file.id, firstNode.sourceCandidateId, firstNode.sourceObjectIndex, index),
    fileId: file.id,
    sourceName: file.name,
    sourceKind: file.kind,
    status: "registered",
    parserId: firstNode.parserId ?? file.parse?.parserId ?? null,
    parserVersion: firstNode.parserVersion ?? file.parse?.parserVersion ?? null,
    candidateId: firstNode.sourceCandidateId,
    objectIndex: firstNode.sourceObjectIndex,
    registeredNodeIds: nodes.map((node) => node.id),
    warningCodes: warningCodesFromFile(file),
  }
}

function importLedgerEntryId(fileId: string, candidateId: string | undefined, objectIndex: number | undefined, index: number): string {
  const candidatePart = candidateId ?? (objectIndex !== undefined ? `object-${objectIndex}` : `source-${index + 1}`)
  return `import-${safeLedgerIdPart(fileId)}-${safeLedgerIdPart(candidatePart)}`
}

function safeLedgerIdPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item"
}

function warningCodesFromFile(file: SourceFile): string[] {
  return Array.from(new Set((file.parse?.warnings ?? [])
    .map((warning) => warning.code)
    .filter((code): code is string => typeof code === "string" && code.length > 0)))
}

function normalizeProject(project: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: stringOrFallback(project.id, "rxnflow-project"),
    label: stringOrFallback(project.label, "RxnFlow Project"),
    meta: stringOrFallback(project.meta, "open"),
  }
}

function normalizeProjectFile(file: SourceFile | Partial<SourceFile>, index: number): SourceFile {
  return {
    id: stringOrFallback(file.id, `file-${index + 1}`),
    name: stringOrFallback(file.name, "imported-source"),
    kind: stringOrFallback(file.kind, "Raw"),
    size: finiteNumberOrFallback(file.size, 0),
    status: isSourceFileStatus(file.status) ? file.status : "staged",
    preview: stringOrFallback(file.preview, ""),
    sourcePath: typeof file.sourcePath === "string" ? file.sourcePath : undefined,
    storedPath: typeof file.storedPath === "string" ? file.storedPath : undefined,
    checksum: typeof file.checksum === "string" ? file.checksum : undefined,
    parse: normalizeSourceParseResult(file.parse),
  }
}

function normalizeProjectNode(node: FlowNode | Partial<FlowNode>, index: number): FlowNode {
  return {
    id: stringOrFallback(node.id, `node-${index + 1}`),
    label: stringOrFallback(node.label, "Imported node"),
    formula: stringOrFallback(node.formula, "pending"),
    kind: isNodeKind(node.kind) ? node.kind : "intermediate",
    coefficient: finiteNonZeroNumberOrUndefined(node.coefficient),
    method: stringOrFallback(node.method, "unassigned"),
    solvent: stringOrFallback(node.solvent, "unassigned"),
    energyGas: finiteNumberOrNull(node.energyGas),
    energySolution: finiteNumberOrNull(node.energySolution),
    energyUnit: node.energyUnit === "hartree" ? "hartree" : "kcal/mol",
    sourceStatus: isNodeSourceStatus(node.sourceStatus) ? node.sourceStatus : undefined,
    sourceFileId: typeof node.sourceFileId === "string" ? node.sourceFileId : undefined,
    sourceCandidateId: typeof node.sourceCandidateId === "string" ? node.sourceCandidateId : undefined,
    sourceObjectIndex: finiteNumberOrUndefined(node.sourceObjectIndex),
    parserId: typeof node.parserId === "string" || node.parserId === null ? node.parserId : undefined,
    parserVersion: typeof node.parserVersion === "string" || node.parserVersion === null ? node.parserVersion : undefined,
    roleHint: typeof node.roleHint === "string" ? node.roleHint : undefined,
    charge: finiteNumberOrNull(node.charge),
    spinMultiplicity: finiteNumberOrNull(node.spinMultiplicity),
    energyTable: normalizeEnergyTableData(node.energyTable),
    corrections: normalizeEnergyCorrections(node.corrections),
    manualStructureKet: nonEmptyStringOrUndefined(node.manualStructureKet),
    manualStructureMolfile: nonEmptyStringOrUndefined(node.manualStructureMolfile),
    manualStructureCdxml: nonEmptyStringOrUndefined(node.manualStructureCdxml),
    manualStructureSvg: nonEmptyStringOrUndefined(node.manualStructureSvg),
    position: normalizePoint(node.position),
  }
}

function normalizeProjectEdge(edge: FlowEdge | Partial<FlowEdge>, index: number): FlowEdge {
  return {
    id: stringOrFallback(edge.id, `edge-${index + 1}`),
    sourceId: stringOrFallback(edge.sourceId, ""),
    targetId: stringOrFallback(edge.targetId, ""),
    label: stringOrFallback(edge.label, "step"),
  }
}

function normalizeProjectBarrier(barrier: FlowBarrier | Partial<FlowBarrier>, index: number): FlowBarrier {
  return {
    id: stringOrFallback(barrier.id, `barrier-${index + 1}`),
    sourceId: stringOrFallback(barrier.sourceId, ""),
    targetId: stringOrFallback(barrier.targetId, ""),
    label: typeof barrier.label === "string" && barrier.label.trim().length > 0 ? barrier.label.trim() : undefined,
  }
}

function normalizeImportLedger(value: unknown, files: SourceFile[], nodes: FlowNode[]): ImportLedger {
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries)) {
    return buildImportLedger(files, nodes)
  }
  return {
    schemaVersion: 1,
    entries: value.entries.map(normalizeImportLedgerEntry),
  }
}

function normalizeImportLedgerEntry(entry: ImportLedgerEntry | Partial<ImportLedgerEntry>, index: number): ImportLedgerEntry {
  return {
    id: stringOrFallback(entry.id, `import-entry-${index + 1}`),
    fileId: stringOrFallback(entry.fileId, ""),
    sourceName: stringOrFallback(entry.sourceName, "imported-source"),
    sourceKind: stringOrFallback(entry.sourceKind, "Raw"),
    status: isImportLedgerEntryStatus(entry.status) ? entry.status : "staged",
    parserId: typeof entry.parserId === "string" || entry.parserId === null ? entry.parserId : undefined,
    parserVersion: typeof entry.parserVersion === "string" || entry.parserVersion === null ? entry.parserVersion : undefined,
    candidateId: typeof entry.candidateId === "string" ? entry.candidateId : undefined,
    objectIndex: finiteNumberOrUndefined(entry.objectIndex),
    registeredNodeIds: Array.isArray(entry.registeredNodeIds)
      ? entry.registeredNodeIds.filter((nodeId): nodeId is string => typeof nodeId === "string" && nodeId.length > 0)
      : [],
    warningCodes: Array.isArray(entry.warningCodes)
      ? entry.warningCodes.filter((code): code is string => typeof code === "string" && code.length > 0)
      : [],
  }
}

function normalizeViewport(viewport: unknown): CanvasViewport | null {
  if (!isObject(viewport)) return null
  const x = finiteNumberOrNull(viewport.x)
  const y = finiteNumberOrNull(viewport.y)
  const zoom = finiteNumberOrNull(viewport.zoom)
  if (x === null || y === null || zoom === null || zoom <= 0) return null
  return { x, y, zoom }
}

function normalizePoint(point: unknown): Point {
  if (!isObject(point)) return { x: 0, y: 0 }
  return {
    x: finiteNumberOrFallback(point.x, 0),
    y: finiteNumberOrFallback(point.y, 0),
  }
}

function normalizeEnergyTableData(value: unknown): ParsedEnergyTableData | null {
  if (!isObject(value)) return null
  const table: ParsedEnergyTableData = {}
  for (const key of [
    "egasHartree",
    "gasBasisFunctions",
    "ggasHartree",
    "ggas1mHartree",
    "ggasShermoHartree",
    "ggasShermo1mHartree",
    "esolHartree",
    "solBasisFunctions",
    "sgauTran",
    "swhitTran",
    "entropyDelta",
    "entropyCorrectionHartree",
    "standardStateCorrectionHartree",
    "gsolHartree",
  ] as const) {
    table[key] = finiteNumberOrNull(value[key])
  }
  return Object.values(table).some((item) => typeof item === "number") ? table : null
}

function normalizeEnergyCorrections(value: unknown): EnergyCorrection[] | undefined {
  if (!Array.isArray(value)) return undefined
  const corrections = value
    .map(normalizeEnergyCorrection)
    .filter((correction): correction is EnergyCorrection => correction !== null)
  return corrections.length > 0 ? corrections : undefined
}

function normalizeEnergyCorrection(value: unknown, index: number): EnergyCorrection | null {
  if (!isObject(value)) return null
  const amount = finiteNumberOrNull(value.value)
  if (amount === null) return null
  return {
    id: stringOrFallback(value.id, `correction-${index + 1}`),
    kind: isEnergyCorrectionKind(value.kind) ? value.kind : "manual",
    value: amount,
    unit: isEnergyCorrectionUnit(value.unit) ? value.unit : "kcal/mol",
    note: typeof value.note === "string" && value.note.trim().length > 0 ? value.note : undefined,
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}


function nonEmptyStringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

function finiteNumberOrFallback(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function finiteNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function finiteNonZeroNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value !== 0 ? value : undefined
}

function normalizeSourceParseResult(value: unknown): SourceParseResult | undefined {
  if (!isObject(value)) return undefined
  if (typeof value.label !== "string" || typeof value.sourceKind !== "string") return undefined
  return value as SourceParseResult
}

function isNodeKind(value: unknown): value is NodeKind {
  return value === "reactant" || value === "transition" || value === "intermediate" || value === "product"
}

function isNodeSourceStatus(value: unknown): value is FlowNode["sourceStatus"] {
  return value === "parsed" || value === "staged" || value === "demo"
}

function isSourceFileStatus(value: unknown): value is SourceFile["status"] {
  return value === "ready" || value === "parsed" || value === "staged"
}

function isImportLedgerEntryStatus(value: unknown): value is ImportLedgerEntryStatus {
  return value === "registered" || value === "staged" || value === "failed"
}

function isEnergyCorrectionKind(value: unknown): value is EnergyCorrectionKind {
  return value === "manual" || value === "solvation" || value === "resonance" || value === "other"
}

function isEnergyCorrectionUnit(value: unknown): value is EnergyCorrectionUnit {
  return value === "hartree" || value === "kcal/mol" || value === "kj/mol"
}
