import type { FlowEdge, FlowNode, NodeKind } from "../domain/projectPackages"
import type { ParsedEnergyTableData, ParsedEnergyUnit } from "../domain/sourceParsers"

export type EnergyDisplayOptions = {
  baselineNodeId: string | null
  energySource: "solution" | "gas"
  outputUnit: "hartree" | "kcal/mol" | "kj/mol"
}

export type RelativeEnergyRole = "standalone" | "baseline" | "path-point" | "term-only"

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
}

export const kcalPerHartree = 627.509474

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
  termsByNodeId: Map<string, EnergyExpressionTerm[]>
  roleByNodeId: Map<string, RelativeEnergyRole>
  relativeTableVisibilityByNodeId: Map<string, boolean>
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
    if (role === "term-only") {
      expressionTableByNodeId.set(node.id, null)
      expressionKcalByNodeId.set(node.id, null)
      continue
    }
    expressionTableByNodeId.set(node.id, evaluateExpressionEnergyTable(terms, nodeById))
    expressionKcalByNodeId.set(node.id, evaluateExpressionKcal(terms, nodeById, options))
  }

  const baselineTable = baselineNode ? expressionTableByNodeId.get(baselineNode.id) ?? null : null
  const baselineKcal = baselineNode ? expressionKcalByNodeId.get(baselineNode.id) ?? null : null

  return nodes.map((node) => {
    const role = model.roleByNodeId.get(node.id) ?? "standalone"
    const expressionTable = expressionTableByNodeId.get(node.id) ?? null
    const expressionKcal = expressionKcalByNodeId.get(node.id) ?? null
    const relativeEnergyTable = role === "term-only" ? null : subtractEnergyTables(expressionTable, baselineTable)
    const relative = role === "term-only" || typeof expressionKcal !== "number" || typeof baselineKcal !== "number"
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
      expressionTerms: model.termsByNodeId.get(node.id) ?? nodeSelfTerms(nodeById, node.id),
    }
  })
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
  const fallback = fallbackEnergyGraphModel(nodes)
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]))
  const successors = new Map<string, string[]>()
  const predecessors = new Map<string, string[]>()

  for (const edge of edges) {
    if (!nodeById.has(edge.sourceId) || !nodeById.has(edge.targetId)) continue
    successors.set(edge.sourceId, [...(successors.get(edge.sourceId) ?? []), edge.targetId])
    predecessors.set(edge.targetId, [...(predecessors.get(edge.targetId) ?? []), edge.sourceId])
  }
  if (successors.size === 0) return fallback

  for (const list of successors.values()) list.sort((a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0))
  const mainPath = longestDirectedPath(nodes, successors, predecessors)
  if (mainPath.length < 2) return fallback

  const pathSet = new Set(mainPath)
  const startId = mainPath[0]
  const firstPathPointId = mainPath[1]
  const sideProducts = (successors.get(startId) ?? []).filter((nodeId) => nodeId !== firstPathPointId && !pathSet.has(nodeId))
  const externalReactants = (predecessors.get(firstPathPointId) ?? []).filter((nodeId) => nodeId !== startId && !pathSet.has(nodeId))
  const hasAuxiliaryTerms = sideProducts.length > 0 || externalReactants.length > 0
  const roleByNodeId = new Map<string, RelativeEnergyRole>()
  const termsByNodeId = new Map<string, EnergyExpressionTerm[]>()
  const relativeTableVisibilityByNodeId = new Map<string, boolean>()

  for (const node of nodes) {
    roleByNodeId.set(node.id, "term-only")
    termsByNodeId.set(node.id, [])
    relativeTableVisibilityByNodeId.set(node.id, false)
  }

  mainPath.forEach((nodeId, index) => {
    if (index === 0) {
      roleByNodeId.set(nodeId, "baseline")
      termsByNodeId.set(nodeId, [])
      relativeTableVisibilityByNodeId.set(nodeId, true)
      return
    }

    const termIds = [nodeId, ...sideProducts]
    const negativeTermIds = index === 1 ? [startId] : [startId, ...externalReactants]
    const terms = compactExpressionTerms([
      ...termIds.flatMap((id) => nodeSelfTerms(nodeById, id)),
      ...negativeTermIds.flatMap((id) => nodeSelfTerms(nodeById, id, -1)),
    ])
    roleByNodeId.set(nodeId, "path-point")
    termsByNodeId.set(nodeId, terms)
    relativeTableVisibilityByNodeId.set(nodeId, true)
  })

  const auxiliaryTermIds = new Set([...sideProducts, ...externalReactants])
  const distanceFromStart = reachableNodeDistances(startId, successors)
  for (const [nodeId, distance] of distanceFromStart) {
    if (distance === 0 || auxiliaryTermIds.has(nodeId) || roleByNodeId.get(nodeId) === "path-point") continue
    const negativeTermIds = distance === 1 ? [startId] : [startId, ...externalReactants]
    const terms = compactExpressionTerms([
      ...nodeSelfTerms(nodeById, nodeId),
      ...sideProducts.flatMap((id) => nodeSelfTerms(nodeById, id)),
      ...negativeTermIds.flatMap((id) => nodeSelfTerms(nodeById, id, -1)),
    ])
    roleByNodeId.set(nodeId, "path-point")
    termsByNodeId.set(nodeId, terms)
    relativeTableVisibilityByNodeId.set(nodeId, true)
  }

  return {
    defaultBaselineNodeId: startId,
    termsByNodeId,
    roleByNodeId,
    relativeTableVisibilityByNodeId,
  }
}

function fallbackEnergyGraphModel(nodes: FlowNode[]): EnergyGraphModel {
  return {
    defaultBaselineNodeId: nodes.find((node) => nodeEnergyForRelative(node, defaultEnergyDisplayOptions.energySource) !== null)?.id ?? null,
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
