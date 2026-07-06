import type { EdgeStepRole, FlowEdge, FlowNode, NodeKind } from "../domain/projectPackages"
import type { ParsedEnergyTableData, ParsedEnergyUnit } from "../domain/sourceParsers"

export type EnergyDisplayOptions = {
  baselineNodeId: string | null
  energySource: "solution" | "gas"
  outputUnit: "hartree" | "kcal/mol" | "kj/mol"
}

export type RelativeEnergyRole = "standalone" | "baseline" | "path-point" | "addition-term" | "release-term" | "participant-term"

export type EnergyExpressionTerm = {
  nodeId: string
  label: string
  coefficient: number
}

export type EnergyTableRow = {
  nodeId: string
  label: string
  kind: NodeKind
  formula: string
  charge: number | null
  spinMultiplicity: number | null
  gas: number | null
  solution: number | null
  energyUnit: ParsedEnergyUnit
  energyTable: ParsedEnergyTableData | null
  relativeEnergyTable: ParsedEnergyTableData | null
  relative: number | null
  relativeRole: RelativeEnergyRole
  showInRelativeTable: boolean
  expressionTerms: EnergyExpressionTerm[]
  relativeExpressionTerms: EnergyExpressionTerm[]
}

export type EnergyTableMode = "absolute" | "relative"

export type EnergyTableColumnId =
  | "structure"
  | "chargeMultiplicity"
  | "egasHartree"
  | "egasKcal"
  | "gasBasisFunctions"
  | "ggasHartree"
  | "ggasKcal"
  | "ggas1mHartree"
  | "ggas1mKcal"
  | "esolHartree"
  | "esolKcal"
  | "solBasisFunctions"
  | "gsolKcal"

export type EnergyTableColumnSpec = {
  id: EnergyTableColumnId
}

export const kcalPerHartree = 627.509474

export const energyTableColumnSpecs: readonly EnergyTableColumnSpec[] = [
  { id: "structure" },
  { id: "chargeMultiplicity" },
  { id: "egasHartree" },
  { id: "egasKcal" },
  { id: "gasBasisFunctions" },
  { id: "ggasHartree" },
  { id: "ggasKcal" },
  { id: "ggas1mHartree" },
  { id: "ggas1mKcal" },
  { id: "esolHartree" },
  { id: "esolKcal" },
  { id: "solBasisFunctions" },
  { id: "gsolKcal" },
] as const

export const defaultEnergyDisplayOptions: EnergyDisplayOptions = {
  baselineNodeId: null,
  energySource: "solution",
  outputUnit: "kcal/mol",
}

const energyTableNumericKeys = [
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
] as const satisfies readonly (keyof ParsedEnergyTableData)[]

type EnergyTableNumericKey = (typeof energyTableNumericKeys)[number]

type EnergyGraphModel = {
  defaultBaselineNodeId: string | null
  baselineTerms: EnergyExpressionTerm[] | null
  termsByNodeId: Map<string, EnergyExpressionTerm[]>
  roleByNodeId: Map<string, RelativeEnergyRole>
  relativeTableVisibilityByNodeId: Map<string, boolean>
}

type PathParticipantContext = {
  additions: string[]
  releases: string[]
}

export type RelativeEnergyZeroSelectionTransition = {
  energyDisplayOptions: EnergyDisplayOptions
  selection: {
    nodeIds: string[]
    edgeIds: string[]
    barrierIds: string[]
  }
  keyboardEdgeSourceId: null
  inspectorMode: "inspector"
}

export type EnergyTableNodeSelectionTransition = {
  selection: {
    nodeIds: string[]
    edgeIds: string[]
    barrierIds: string[]
  }
  inspectorMode: "inspector"
  viewMode: "canvas"
}

export function relativeEnergyZeroSelectionTransition(
  current: EnergyDisplayOptions,
  nodeId: string,
): RelativeEnergyZeroSelectionTransition {
  return {
    energyDisplayOptions: current.baselineNodeId === nodeId ? current : { ...current, baselineNodeId: nodeId },
    selection: {
      nodeIds: [nodeId],
      edgeIds: [],
      barrierIds: [],
    },
    keyboardEdgeSourceId: null,
    inspectorMode: "inspector",
  }
}

export function energyTableNodeSelectionTransition(nodeId: string): EnergyTableNodeSelectionTransition {
  return {
    selection: {
      nodeIds: [nodeId],
      edgeIds: [],
      barrierIds: [],
    },
    inspectorMode: "inspector",
    viewMode: "canvas",
  }
}

export function energyTableRows(
  nodes: FlowNode[],
  options: EnergyDisplayOptions,
  edges: FlowEdge[] = [],
): EnergyTableRow[] {
  const model = deriveEnergyGraphModel(nodes, edges)
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const baselineNode = relativeEnergyZeroNode(nodes, options, edges)
  const expressionTableByNodeId = new Map<string, ParsedEnergyTableData | null>()
  const expressionKcalByNodeId = new Map<string, number | null>()

  for (const node of nodes) {
    const role = model.roleByNodeId.get(node.id) ?? "standalone"
    const terms = model.termsByNodeId.get(node.id) ?? nodeSelfTerms(nodeById, node.id)
    if (relativeEnergyRoleIsTerm(role)) {
      expressionTableByNodeId.set(node.id, null)
      expressionKcalByNodeId.set(node.id, null)
      continue
    }
    expressionTableByNodeId.set(node.id, evaluateExpressionEnergyTable(terms, nodeById))
    expressionKcalByNodeId.set(node.id, evaluateExpressionKcal(terms, nodeById, options))
  }

  const useModelBaselineTerms = !options.baselineNodeId && model.baselineTerms !== null
  const modelBaselineTerms = useModelBaselineTerms ? model.baselineTerms ?? [] : null
  const baselineTable = useModelBaselineTerms
    ? evaluateExpressionEnergyTable(modelBaselineTerms ?? [], nodeById)
    : baselineNode ? expressionTableByNodeId.get(baselineNode.id) ?? null : null
  const baselineKcal = useModelBaselineTerms
    ? evaluateExpressionKcal(modelBaselineTerms ?? [], nodeById, options)
    : baselineNode ? expressionKcalByNodeId.get(baselineNode.id) ?? null : null
  const baselineExpressionTerms = useModelBaselineTerms
    ? modelBaselineTerms ?? []
    : baselineNode ? model.termsByNodeId.get(baselineNode.id) ?? nodeSelfTerms(nodeById, baselineNode.id) : null

  return nodes.map((node) => {
    const role = model.roleByNodeId.get(node.id) ?? "standalone"
    const expressionTerms = model.termsByNodeId.get(node.id) ?? nodeSelfTerms(nodeById, node.id)
    const expressionTable = expressionTableByNodeId.get(node.id) ?? null
    const expressionKcal = expressionKcalByNodeId.get(node.id) ?? null
    const relativeEnergyTable = relativeEnergyRoleIsTerm(role) ? null : subtractEnergyTables(expressionTable, baselineTable)
    const relative = relativeEnergyRoleIsTerm(role) || typeof expressionKcal !== "number" || typeof baselineKcal !== "number"
      ? null
      : expressionKcal - baselineKcal
    return {
      nodeId: node.id,
      label: node.label,
      kind: node.kind,
      formula: node.formula,
      charge: node.charge ?? null,
      spinMultiplicity: node.spinMultiplicity ?? null,
      gas: node.energyGas,
      solution: node.energySolution,
      energyUnit: node.energyUnit,
      energyTable: normalizedNodeEnergyTable(node),
      relativeEnergyTable,
      relative,
      relativeRole: role,
      showInRelativeTable: model.relativeTableVisibilityByNodeId.get(node.id) ?? true,
      expressionTerms,
      relativeExpressionTerms: relativeEnergyRoleIsTerm(role) || !baselineExpressionTerms ? [] : relativeExpressionTerms(expressionTerms, baselineExpressionTerms),
    }
  })
}

export function sortedEnergyTableRows(
  rows: EnergyTableRow[],
  nodes: FlowNode[],
  edges: FlowEdge[],
): EnergyTableRow[] {
  const rowIndex = new Map(rows.map((row, index) => [row.nodeId, index]))
  const order = pathNodeOrder(nodes, edges)
  const orderIndex = new Map(order.map((nodeId, index) => [nodeId, index]))
  return [...rows].sort((left, right) => {
    const leftPathOrder = orderIndex.get(left.nodeId)
    const rightPathOrder = orderIndex.get(right.nodeId)
    if (leftPathOrder != null || rightPathOrder != null) {
      return (leftPathOrder ?? Number.MAX_SAFE_INTEGER) - (rightPathOrder ?? Number.MAX_SAFE_INTEGER)
    }
    return (rowIndex.get(left.nodeId) ?? 0) - (rowIndex.get(right.nodeId) ?? 0)
  })
}

export function visibleEnergyTableRows(
  rows: EnergyTableRow[],
  mode: EnergyTableMode,
): EnergyTableRow[] {
  return mode === "relative" ? rows.filter((row) => row.showInRelativeTable) : rows
}

export function energyTableColumnLabel(column: EnergyTableColumnSpec, mode: EnergyTableMode): string {
  const prefix = mode === "relative" ? "Δ" : ""
  switch (column.id) {
    case "structure":
      return "Structure"
    case "chargeMultiplicity":
      return "Charge / Mult."
    case "egasHartree":
      return `${prefix}Egas(Eh)`
    case "egasKcal":
      return `${prefix}Egas(kcal/mol)`
    case "gasBasisFunctions":
      return "Basisgas"
    case "ggasHartree":
      return `${prefix}Ggas(Eh)`
    case "ggasKcal":
      return `${prefix}Ggas(kcal/mol)`
    case "ggas1mHartree":
      return `${prefix}Ggas+1M(Eh)`
    case "ggas1mKcal":
      return `${prefix}Ggas+1M(kcal/mol)`
    case "esolHartree":
      return `${prefix}Esol(Eh)`
    case "esolKcal":
      return `${prefix}Esol(kcal/mol)`
    case "solBasisFunctions":
      return "Basissol"
    case "gsolKcal":
      return `${prefix}Gsol(kcal/mol)`
  }
}

export function energyTableCellText(
  row: EnergyTableRow,
  column: EnergyTableColumnSpec,
  mode: EnergyTableMode,
): string {
  switch (column.id) {
    case "structure":
      return row.label
    case "chargeMultiplicity":
      return chargeMultiplicity(row)
    case "egasHartree":
      return formatHartreeTableCell(row, "egasHartree", mode)
    case "egasKcal":
      return formatKcalFromHartreeCell(row, "egasHartree", mode)
    case "gasBasisFunctions":
      return formatIntegerCell(tableNumberValue(row, "gasBasisFunctions", mode))
    case "ggasHartree":
      return formatHartreeTableCell(row, "ggasHartree", mode)
    case "ggasKcal":
      return formatKcalFromHartreeCell(row, "ggasHartree", mode)
    case "ggas1mHartree":
      return formatHartreeTableCell(row, "ggas1mHartree", mode)
    case "ggas1mKcal":
      return formatKcalFromHartreeCell(row, "ggas1mHartree", mode)
    case "esolHartree":
      return formatHartreeTableCell(row, "esolHartree", mode)
    case "esolKcal":
      return formatKcalFromHartreeCell(row, "esolHartree", mode)
    case "solBasisFunctions":
      return formatIntegerCell(tableNumberValue(row, "solBasisFunctions", mode))
    case "gsolKcal":
      return formatKcalFromHartreeCell(row, "gsolHartree", mode)
  }
}

export function energyTablePlainHeaders(mode: EnergyTableMode): string[] {
  return energyTableColumnSpecs.map((column) => energyTableColumnLabel(column, mode))
}

export function chargeMultiplicity(row: Pick<EnergyTableRow, "charge" | "spinMultiplicity">): string {
  if (typeof row.charge !== "number" && typeof row.spinMultiplicity !== "number") return "-"
  return `${row.charge ?? "?"} / ${row.spinMultiplicity ?? "?"}`
}

type HartreeEnergyTableKey =
  | "egasHartree"
  | "ggasHartree"
  | "ggas1mHartree"
  | "esolHartree"
  | "gsolHartree"

type NumericEnergyTableKey =
  | HartreeEnergyTableKey
  | "gasBasisFunctions"
  | "solBasisFunctions"

export function formatHartreeTableCell(
  row: Pick<EnergyTableRow, "energyTable" | "relativeEnergyTable" | "energyUnit" | "gas" | "solution">,
  key: HartreeEnergyTableKey,
  mode: EnergyTableMode,
): string {
  const value = tableNumberValue(row, key, mode)
  if (typeof value !== "number") return "-"
  return formatHartreeNumber(value)
}

export function formatKcalFromHartreeCell(
  row: Pick<EnergyTableRow, "energyTable" | "relativeEnergyTable" | "energyUnit" | "gas" | "solution">,
  key: HartreeEnergyTableKey,
  mode: EnergyTableMode,
): string {
  const value = tableNumberValue(row, key, mode)
  if (typeof value !== "number") return "-"
  return formatKcalNumber(value * kcalPerHartree)
}

export function tableNumberValue(
  row: Pick<EnergyTableRow, "energyTable" | "relativeEnergyTable" | "energyUnit" | "gas" | "solution">,
  key: NumericEnergyTableKey,
  mode: EnergyTableMode,
): number | null {
  const table = mode === "relative" ? row.relativeEnergyTable : row.energyTable
  const value = table?.[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (mode === "absolute" && key === "egasHartree" && row.energyUnit === "hartree" && typeof row.gas === "number") return row.gas
  if (mode === "absolute" && key === "gsolHartree" && row.energyUnit === "hartree" && typeof row.solution === "number") return row.solution
  return null
}

export function formatIntegerCell(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.trunc(value)) : "-"
}

export function formatHartreeNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : "-"
}

export function formatKcalNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "-"
}

function pathNodeOrder(nodes: FlowNode[], edges: FlowEdge[]): string[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const pathNodes = nodes.filter((node) => node.pathRole !== "participant")
  const pathNodeIds = new Set(pathNodes.map((node) => node.id))
  const pathEdges = edges.filter((edge) => {
    const role = edgeStepRole(edge)
    if (role === "addition" || role === "release") return false
    return pathNodeIds.has(edge.sourceId) && pathNodeIds.has(edge.targetId)
  })
  if (pathEdges.length === 0) return pathNodes.map((node) => node.id)

  const successors = new Map<string, string[]>()
  const predecessors = new Map<string, string[]>()
  const nodePositionOrder = new Map(nodes.map((node, index) => [node.id, index]))
  for (const node of pathNodes) {
    successors.set(node.id, [])
    predecessors.set(node.id, [])
  }
  for (const edge of pathEdges) {
    successors.set(edge.sourceId, [...(successors.get(edge.sourceId) ?? []), edge.targetId])
    predecessors.set(edge.targetId, [...(predecessors.get(edge.targetId) ?? []), edge.sourceId])
  }
  for (const list of successors.values()) list.sort((left, right) => (nodePositionOrder.get(left) ?? 0) - (nodePositionOrder.get(right) ?? 0))

  const starts = pathNodes
    .filter((node) => (predecessors.get(node.id) ?? []).length === 0)
    .sort((left, right) => (nodePositionOrder.get(left.id) ?? 0) - (nodePositionOrder.get(right.id) ?? 0))
  const seedNodes = starts.length > 0 ? starts : [...pathNodes].sort((left, right) => (nodePositionOrder.get(left.id) ?? 0) - (nodePositionOrder.get(right.id) ?? 0))
  const ordered: string[] = []
  const seen = new Set<string>()
  const visit = (nodeId: string) => {
    if (seen.has(nodeId) || !nodeById.has(nodeId)) return
    seen.add(nodeId)
    ordered.push(nodeId)
    for (const nextId of successors.get(nodeId) ?? []) visit(nextId)
  }
  for (const node of seedNodes) visit(node.id)
  for (const node of pathNodes) visit(node.id)
  for (const edge of edges) {
    const role = edgeStepRole(edge)
    if (role === "addition" && !seen.has(edge.sourceId) && nodeById.get(edge.sourceId)?.pathRole === "participant") {
      ordered.splice(Math.max(0, ordered.indexOf(edge.targetId)), 0, edge.sourceId)
      seen.add(edge.sourceId)
    }
    if (role === "release" && !seen.has(edge.targetId) && nodeById.get(edge.targetId)?.pathRole === "participant") {
      const sourceIndex = ordered.indexOf(edge.sourceId)
      ordered.splice(sourceIndex >= 0 ? sourceIndex + 1 : ordered.length, 0, edge.targetId)
      seen.add(edge.targetId)
    }
  }
  return ordered
}


function relativeEnergyRoleIsTerm(role: RelativeEnergyRole): boolean {
  return role === "addition-term" || role === "release-term" || role === "participant-term"
}

function relativeExpressionTerms(
  expressionTerms: EnergyExpressionTerm[],
  baselineTerms: EnergyExpressionTerm[],
): EnergyExpressionTerm[] {
  return compactExpressionTerms([
    ...expressionTerms,
    ...baselineTerms.map((term) => ({ ...term, coefficient: -term.coefficient })),
  ])
}

export function normalizedNodeEnergyTable(node: FlowNode): ParsedEnergyTableData | null {
  const table: ParsedEnergyTableData = { ...(node.energyTable ?? {}) }
  if (table.egasHartree == null && node.energyUnit === "hartree" && typeof node.energyGas === "number") {
    table.egasHartree = node.energyGas
  }
  if (table.gsolHartree == null && node.energyUnit === "hartree" && typeof node.energySolution === "number") {
    table.gsolHartree = node.energySolution
  }
  return Object.values(table).some((value) => typeof value === "number" && Number.isFinite(value)) ? table : null
}

export function relativeEnergyZeroNode(
  nodes: FlowNode[],
  options: EnergyDisplayOptions,
  edges: FlowEdge[] = [],
): FlowNode | undefined {
  if (options.baselineNodeId) {
    const explicit = nodes.find((node) => node.id === options.baselineNodeId)
    if (explicit) return explicit
  }
  const graphBaselineId = deriveEnergyGraphModel(nodes, edges).defaultBaselineNodeId
  if (graphBaselineId) {
    const graphBaseline = nodes.find((node) => node.id === graphBaselineId)
    if (graphBaseline) return graphBaseline
  }
  return nodes.find((node) => nodeEnergyForRelative(node, options.energySource) !== null)
}

export function relativeEnergyKcal(
  node: FlowNode,
  baselineNode: FlowNode | undefined,
  baseline: number | null,
  options: EnergyDisplayOptions,
): number | null {
  if (!baselineNode || typeof baseline !== "number") return null
  const value = nodeEnergyForRelativeKcal(node, options)
  return typeof value === "number" ? value - baseline : null
}

export function nodeEnergyForRelative(node: FlowNode, source: EnergyDisplayOptions["energySource"]): number | null {
  const table = normalizedNodeEnergyTable(node)
  if (source === "solution") {
    if (typeof table?.gsolHartree === "number") return table.gsolHartree
    return node.energySolution ?? node.energyGas
  }
  if (typeof table?.egasHartree === "number") return table.egasHartree
  return node.energyGas ?? node.energySolution
}

export function nodeEnergyForRelativeKcal(node: FlowNode, options: EnergyDisplayOptions): number | null {
  const table = normalizedNodeEnergyTable(node)
  if (options.energySource === "solution" && typeof table?.gsolHartree === "number") {
    return table.gsolHartree * kcalPerHartree
  }
  if (options.energySource === "gas" && typeof table?.egasHartree === "number") {
    return table.egasHartree * kcalPerHartree
  }
  const value = options.energySource === "solution"
    ? node.energySolution ?? node.energyGas
    : node.energyGas ?? node.energySolution
  return energyToKcal(value, node.energyUnit)
}

export function energyToKcal(value: number | null, unit: ParsedEnergyUnit): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return unit === "hartree" ? value * kcalPerHartree : value
}

export function formatEnergy(value: number | null, unit: ParsedEnergyUnit): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "pending"
  return unit === "hartree" ? `${value.toFixed(6)} Eh` : `${value.toFixed(2)} kcal/mol`
}

export function formatRelativeEnergy(value: number | null, unit: EnergyDisplayOptions["outputUnit"]): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "pending"
  const converted = relativeEnergyValueFromKcal(value, unit)
  return `${formatRelativeEnergyValue(converted, unit)} ${energyDisplayUnitLabel(unit)}`
}

export function relativeEnergyValueFromKcal(value: number, unit: EnergyDisplayOptions["outputUnit"]): number {
  if (unit === "hartree") return value / kcalPerHartree
  if (unit === "kj/mol") return value * 4.184
  return value
}

export function formatRelativeEnergyValue(value: number, unit: EnergyDisplayOptions["outputUnit"]): string {
  return unit === "hartree" ? value.toFixed(6) : value.toFixed(2)
}

export function formatBarrierValue(value: number, unit: EnergyDisplayOptions["outputUnit"]): string {
  return unit === "hartree" ? value.toFixed(6) : value.toFixed(2)
}

export function energyDisplayUnitLabel(unit: EnergyDisplayOptions["outputUnit"]): string {
  return unit === "hartree" ? "Eh" : unit === "kj/mol" ? "kJ/mol" : "kcal/mol"
}

export function nodeCoefficient(node: FlowNode): number {
  return typeof node.coefficient === "number" && Number.isFinite(node.coefficient) && node.coefficient !== 0
    ? node.coefficient
    : 1
}

export function formatCoefficientValue(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "1"
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(6)).toString()
}

export function nodeFooterText(node: FlowNode): string {
  if (node.sourceStatus === "parsed") return "Parsed source"
  if (node.sourceStatus === "staged" || (node.energyGas === null && node.energySolution === null)) return "Staged source"
  if (node.kind === "transition") return "Transition state"
  return "Registered"
}

function deriveEnergyGraphModel(nodes: FlowNode[], edges: FlowEdge[]): EnergyGraphModel {
  const defaultModel = defaultEnergyGraphModel(nodes)
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]))
  const participantIds = new Set(nodes.filter((node) => node.pathRole === "participant").map((node) => node.id))
  const pathNodes = nodes.filter((node) => !participantIds.has(node.id))
  const pathEdges = edges.filter((edge) => {
    const role = edgeStepRole(edge)
    return role !== "addition"
      && role !== "release"
      && !participantIds.has(edge.sourceId)
      && !participantIds.has(edge.targetId)
      && nodeById.has(edge.sourceId)
      && nodeById.has(edge.targetId)
  })
  const successors = new Map<string, string[]>()
  const predecessors = new Map<string, string[]>()

  for (const node of pathNodes) {
    successors.set(node.id, [])
    predecessors.set(node.id, [])
  }
  for (const edge of pathEdges) {
    successors.set(edge.sourceId, [...(successors.get(edge.sourceId) ?? []), edge.targetId])
    predecessors.set(edge.targetId, [...(predecessors.get(edge.targetId) ?? []), edge.sourceId])
  }
  for (const list of successors.values()) list.sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0))

  const hasPathConnectivity = pathEdges.length > 0
  const mainPath = hasPathConnectivity && pathNodes.length > 0 ? longestDirectedPath(pathNodes, successors, predecessors) : []
  const baselineId = mainPath[0]
    ?? pathNodes.find((node) => nodeEnergyForRelative(node, defaultEnergyDisplayOptions.energySource) !== null)?.id
    ?? defaultModel.defaultBaselineNodeId
  const additionsByPathNodeId = new Map<string, string[]>()
  const releasesAfterPathNodeId = new Map<string, string[]>()
  const roleByNodeId = new Map<string, RelativeEnergyRole>()
  const termsByNodeId = new Map<string, EnergyExpressionTerm[]>()
  const relativeTableVisibilityByNodeId = new Map<string, boolean>()

  for (const node of nodes) {
    const participant = participantIds.has(node.id)
    roleByNodeId.set(node.id, participant ? "participant-term" : "standalone")
    termsByNodeId.set(node.id, participant ? [] : nodeSelfTerms(nodeById, node.id))
    relativeTableVisibilityByNodeId.set(node.id, !participant)
  }

  if (!hasPathConnectivity) {
    if (baselineId && !participantIds.has(baselineId)) roleByNodeId.set(baselineId, "baseline")
    return {
      defaultBaselineNodeId: baselineId,
      baselineTerms: defaultModel.baselineTerms,
      termsByNodeId,
      roleByNodeId,
      relativeTableVisibilityByNodeId,
    }
  }

  for (const edge of edges) {
    const role = edgeStepRole(edge)
    if (role !== "addition" && role !== "release") continue
    const participantId = participantEndpoint(edge, participantIds)
    const pathId = pathEndpoint(edge, participantId)
    if (!participantId || !pathId || !nodeById.has(participantId)) continue
    const map = role === "addition" ? additionsByPathNodeId : releasesAfterPathNodeId
    map.set(pathId, uniqueParticipantNodeIds([...(map.get(pathId) ?? []), participantId], nodeById, nodeOrder))
    roleByNodeId.set(participantId, role === "addition" ? "addition-term" : "release-term")
    termsByNodeId.set(participantId, [])
    relativeTableVisibilityByNodeId.set(participantId, false)
  }

  const pathStartsWithParticipantAddition = baselineId ? (additionsByPathNodeId.get(baselineId) ?? []).length > 0 : false
  const baselineSubtractIds = pathStartsWithParticipantAddition ? [] : [baselineId].filter((id): id is string => Boolean(id))
  const contextByNodeId = new Map<string, PathParticipantContext>()
  if (baselineId) {
    contextByNodeId.set(baselineId, normalizeParticipantContext({
      additions: additionsByPathNodeId.get(baselineId) ?? [],
      releases: [],
    }, nodeById, nodeOrder))
    const queue = [baselineId]
    for (let index = 0; index < queue.length; index += 1) {
      const nodeId = queue[index]
      const context = contextByNodeId.get(nodeId)
      if (!context) continue
      for (const nextId of successors.get(nodeId) ?? []) {
        const candidate = normalizeParticipantContext({
          additions: [...context.additions, ...(additionsByPathNodeId.get(nextId) ?? [])],
          releases: [...context.releases, ...(releasesAfterPathNodeId.get(nodeId) ?? [])],
        }, nodeById, nodeOrder)
        const current = contextByNodeId.get(nextId)
        if (current && !participantContextIsBetter({
          candidate,
          current,
          nodeId: nextId,
          nodeById,
          baselineSubtractIds,
          nodeOrder,
        })) continue
        contextByNodeId.set(nextId, candidate)
        queue.push(nextId)
      }
    }
  }

  for (const node of pathNodes) {
    const context = contextByNodeId.get(node.id)
    if (!context) continue
    if (node.id === baselineId && !pathStartsWithParticipantAddition) {
      roleByNodeId.set(node.id, "baseline")
      termsByNodeId.set(node.id, [])
      relativeTableVisibilityByNodeId.set(node.id, true)
      continue
    }
    roleByNodeId.set(node.id, "path-point")
    termsByNodeId.set(node.id, expressionTermsForPathContext(nodeById, node.id, context, baselineSubtractIds))
    relativeTableVisibilityByNodeId.set(node.id, true)
  }

  return {
    defaultBaselineNodeId: baselineId,
    baselineTerms: baselineId ? termsByNodeId.get(baselineId) ?? [] : [],
    termsByNodeId,
    roleByNodeId,
    relativeTableVisibilityByNodeId,
  }
}

function edgeStepRole(edge: FlowEdge): EdgeStepRole {
  return edge.stepRole ?? "path"
}

function participantEndpoint(edge: FlowEdge, participantIds: Set<string>): string | null {
  if (participantIds.has(edge.sourceId)) return edge.sourceId
  if (participantIds.has(edge.targetId)) return edge.targetId
  return null
}

function pathEndpoint(edge: FlowEdge, participantId: string | null): string | null {
  if (!participantId) return null
  return edge.sourceId === participantId ? edge.targetId : edge.sourceId
}

function expressionTermsForPathContext(
  nodeById: Map<string, FlowNode>,
  nodeId: string,
  context: PathParticipantContext,
  baselineSubtractIds: string[],
): EnergyExpressionTerm[] {
  return compactExpressionTerms([
    ...nodeSelfTerms(nodeById, nodeId),
    ...context.releases.flatMap((id) => nodeSelfTerms(nodeById, id)),
    ...[...baselineSubtractIds, ...context.additions].flatMap((id) => nodeSelfTerms(nodeById, id, -1)),
  ])
}

function normalizeParticipantContext(
  context: PathParticipantContext,
  nodeById: Map<string, FlowNode>,
  nodeOrder: Map<string, number>,
): PathParticipantContext {
  return {
    additions: uniqueParticipantNodeIds(context.additions, nodeById, nodeOrder),
    releases: uniqueParticipantNodeIds(context.releases, nodeById, nodeOrder),
  }
}

function participantContextIsBetter({
  candidate,
  current,
  nodeId,
  nodeById,
  baselineSubtractIds,
  nodeOrder,
}: {
  candidate: PathParticipantContext
  current: PathParticipantContext
  nodeId: string
  nodeById: Map<string, FlowNode>
  baselineSubtractIds: string[]
  nodeOrder: Map<string, number>
}): boolean {
  const candidateTerms = expressionTermsForPathContext(nodeById, nodeId, candidate, baselineSubtractIds)
  const currentTerms = expressionTermsForPathContext(nodeById, nodeId, current, baselineSubtractIds)
  const candidateScore = expressionCompletenessScore(candidateTerms, nodeById)
  const currentScore = expressionCompletenessScore(currentTerms, nodeById)
  if (candidateScore !== currentScore) return candidateScore > currentScore
  const candidateSize = expressionTermSize(candidateTerms)
  const currentSize = expressionTermSize(currentTerms)
  if (candidateSize !== currentSize) return candidateSize < currentSize
  return firstTermOrder(candidateTerms, nodeOrder) < firstTermOrder(currentTerms, nodeOrder)
}

function expressionCompletenessScore(terms: EnergyExpressionTerm[], nodeById: Map<string, FlowNode>): number {
  const solution = evaluateExpressionKcal(terms, nodeById, defaultEnergyDisplayOptions)
  const gas = evaluateExpressionKcal(terms, nodeById, { ...defaultEnergyDisplayOptions, energySource: "gas" })
  return (typeof solution === "number" ? 2 : 0) + (typeof gas === "number" ? 1 : 0)
}

function expressionTermSize(terms: EnergyExpressionTerm[]): number {
  return terms.reduce((sum, term) => sum + Math.abs(term.coefficient), 0)
}

function firstTermOrder(terms: EnergyExpressionTerm[], nodeOrder: Map<string, number>): number {
  return Math.min(...terms.map((term) => nodeOrder.get(term.nodeId) ?? Number.MAX_SAFE_INTEGER))
}

function uniqueParticipantNodeIds(
  nodeIds: string[],
  nodeById: Map<string, FlowNode>,
  nodeOrder: Map<string, number>,
): string[] {
  const selectedBySpecies = new Map<string, string>()
  for (const nodeId of uniqueNodeIds(nodeIds, nodeOrder)) {
    const node = nodeById.get(nodeId)
    const key = participantSpeciesKey(node)
    const currentId = selectedBySpecies.get(key)
    if (!currentId) {
      selectedBySpecies.set(key, nodeId)
      continue
    }
    const current = nodeById.get(currentId)
    if (participantEnergyScore(node) > participantEnergyScore(current)) selectedBySpecies.set(key, nodeId)
  }
  return uniqueNodeIds([...selectedBySpecies.values()], nodeOrder)
}

function participantSpeciesKey(node: FlowNode | undefined): string {
  if (!node) return "missing"
  return [
    node.label.trim().toLowerCase(),
    node.formula.trim().toLowerCase(),
    node.charge ?? "",
    node.spinMultiplicity ?? "",
  ].join("|")
}

function participantEnergyScore(node: FlowNode | undefined): number {
  if (!node) return 0
  return (typeof nodeEnergyForRelativeKcal(node, defaultEnergyDisplayOptions) === "number" ? 2 : 0)
    + (typeof nodeEnergyForRelativeKcal(node, { ...defaultEnergyDisplayOptions, energySource: "gas" }) === "number" ? 1 : 0)
}

function defaultEnergyGraphModel(nodes: FlowNode[]): EnergyGraphModel {
  return {
    defaultBaselineNodeId: nodes.find((node) => nodeEnergyForRelative(node, defaultEnergyDisplayOptions.energySource) !== null)?.id ?? null,
    baselineTerms: null,
    termsByNodeId: new Map(nodes.map((node) => [node.id, [{ nodeId: node.id, label: node.label, coefficient: nodeCoefficient(node) }]])),
    roleByNodeId: new Map(nodes.map((node) => [node.id, "standalone" as const])),
    relativeTableVisibilityByNodeId: new Map(nodes.map((node) => [node.id, true])),
  }
}

function longestDirectedPath(
  nodes: FlowNode[],
  successors: Map<string, string[]>,
  predecessors: Map<string, string[]>,
): string[] {
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]))
  const betterPath = (candidate: string[], current: string[]) => {
    if (candidate.length !== current.length) return candidate.length > current.length
    const candidateStart = candidate[0]
    const currentStart = current[0]
    const candidateStartsAtSource = (predecessors.get(candidateStart) ?? []).length === 0
    const currentStartsAtSource = (predecessors.get(currentStart) ?? []).length === 0
    if (candidateStartsAtSource !== currentStartsAtSource) return candidateStartsAtSource
    return (nodeOrder.get(candidateStart) ?? Number.MAX_SAFE_INTEGER) < (nodeOrder.get(currentStart) ?? Number.MAX_SAFE_INTEGER)
  }
  const walk = (nodeId: string, seen: Set<string>): string[] => {
    let best = [nodeId]
    for (const nextId of successors.get(nodeId) ?? []) {
      if (seen.has(nextId)) continue
      const candidate = [nodeId, ...walk(nextId, new Set([...seen, nextId]))]
      if (betterPath(candidate, best)) best = candidate
    }
    return best
  }

  let best: string[] = []
  for (const node of nodes) {
    const candidate = walk(node.id, new Set([node.id]))
    if (betterPath(candidate, best)) best = candidate
  }
  return best
}

function uniqueNodeIds(nodeIds: string[], nodeOrder: Map<string, number>): string[] {
  return Array.from(new Set(nodeIds)).sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0))
}

function reachableNodeDistances(startId: string, successors: Map<string, string[]>): Map<string, number> {
  const distances = new Map<string, number>([[startId, 0]])
  const queue = [startId]
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index]
    const distance = distances.get(nodeId) ?? 0
    for (const nextId of successors.get(nodeId) ?? []) {
      if (distances.has(nextId)) continue
      distances.set(nextId, distance + 1)
      queue.push(nextId)
    }
  }
  return distances
}

function reachablePathIndexes(
  startId: string,
  successors: Map<string, string[]>,
  pathIndexById: Map<string, number>,
): Map<string, number> {
  const indexes = new Map<string, number>([[startId, pathIndexById.get(startId) ?? 0]])
  const queue = [startId]
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index]
    const currentPathIndex = indexes.get(nodeId) ?? 0
    for (const nextId of successors.get(nodeId) ?? []) {
      const nextPathIndex = Math.max(currentPathIndex, pathIndexById.get(nextId) ?? currentPathIndex)
      if (indexes.has(nextId) && (indexes.get(nextId) ?? 0) >= nextPathIndex) continue
      indexes.set(nextId, nextPathIndex)
      queue.push(nextId)
    }
  }
  return indexes
}

function nodeSelfTerms(nodeById: Map<string, FlowNode>, nodeId: string, sign = 1): EnergyExpressionTerm[] {
  const node = nodeById.get(nodeId)
  if (!node) return []
  return [{ nodeId, label: node.label, coefficient: sign * nodeCoefficient(node) }]
}

function compactExpressionTerms(terms: EnergyExpressionTerm[]): EnergyExpressionTerm[] {
  const byNodeId = new Map<string, EnergyExpressionTerm>()
  for (const term of terms) {
    const current = byNodeId.get(term.nodeId)
    byNodeId.set(term.nodeId, {
      nodeId: term.nodeId,
      label: term.label,
      coefficient: (current?.coefficient ?? 0) + term.coefficient,
    })
  }
  return Array.from(byNodeId.values()).filter((term) => Math.abs(term.coefficient) > 1e-9)
}

function evaluateExpressionEnergyTable(
  terms: EnergyExpressionTerm[],
  nodeById: Map<string, FlowNode>,
): ParsedEnergyTableData | null {
  if (terms.length === 0) return zeroEnergyTable()
  const table: ParsedEnergyTableData = {}
  for (const key of energyTableNumericKeys) {
    let total = 0
    let complete = true
    for (const term of terms) {
      const node = nodeById.get(term.nodeId)
      const value = node ? nodeEnergyTableValue(node, key) : null
      if (typeof value !== "number") {
        complete = false
        break
      }
      total += term.coefficient * value
    }
    if (complete) table[key] = normalizedFloatingPoint(total)
  }
  return Object.values(table).some((value) => typeof value === "number" && Number.isFinite(value)) ? table : null
}

function evaluateExpressionKcal(
  terms: EnergyExpressionTerm[],
  nodeById: Map<string, FlowNode>,
  options: EnergyDisplayOptions,
): number | null {
  if (terms.length === 0) return 0
  let total = 0
  for (const term of terms) {
    const node = nodeById.get(term.nodeId)
    if (!node) return null
    const value = nodeEnergyForRelativeKcal(node, options)
    if (typeof value !== "number") return null
    total += term.coefficient * value
  }
  return normalizedFloatingPoint(total)
}

function subtractEnergyTables(
  value: ParsedEnergyTableData | null,
  baseline: ParsedEnergyTableData | null,
): ParsedEnergyTableData | null {
  if (!value || !baseline) return null
  const table: ParsedEnergyTableData = {}
  for (const key of energyTableNumericKeys) {
    const rowValue = value[key]
    const baselineValue = baseline[key]
    if (typeof rowValue === "number" && Number.isFinite(rowValue) && typeof baselineValue === "number" && Number.isFinite(baselineValue)) {
      table[key] = normalizedFloatingPoint(rowValue - baselineValue)
    }
  }
  return Object.values(table).some((item) => typeof item === "number") ? table : null
}

function zeroEnergyTable(): ParsedEnergyTableData {
  return Object.fromEntries(energyTableNumericKeys.map((key) => [key, 0])) as ParsedEnergyTableData
}

function nodeEnergyTableValue(node: FlowNode, key: EnergyTableNumericKey): number | null {
  const table = normalizedNodeEnergyTable(node)
  const value = table?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function normalizedFloatingPoint(value: number): number {
  return Math.abs(value) < 1e-10 ? 0 : Number(value.toFixed(12))
}
