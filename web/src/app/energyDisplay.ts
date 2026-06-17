import type { FlowNode, NodeKind } from "../domain/projectPackages"
import type { ParsedEnergyTableData, ParsedEnergyUnit } from "../domain/sourceParsers"

export type EnergyDisplayOptions = {
  baselineNodeId: string | null
  energySource: "solution" | "gas"
  outputUnit: "hartree" | "kcal/mol" | "kj/mol"
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
  relative: number | null
}

export const kcalPerHartree = 627.509474

export const defaultEnergyDisplayOptions: EnergyDisplayOptions = {
  baselineNodeId: null,
  energySource: "solution",
  outputUnit: "kcal/mol",
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

export function energyTableRows(nodes: FlowNode[], options: EnergyDisplayOptions): EnergyTableRow[] {
  const baselineNode = relativeEnergyZeroNode(nodes, options)
  const baseline = baselineNode ? nodeEnergyForRelativeKcal(baselineNode, options) : null
  return nodes.map((node) => ({
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
    relative: relativeEnergyKcal(node, baselineNode, baseline, options),
  }))
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

export function relativeEnergyZeroNode(nodes: FlowNode[], options: EnergyDisplayOptions): FlowNode | undefined {
  return (options.baselineNodeId
    ? nodes.find((node) => node.id === options.baselineNodeId)
    : undefined) ?? nodes.find((node) => nodeEnergyForRelative(node, options.energySource) !== null)
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
  return source === "solution"
    ? node.energySolution ?? node.energyGas
    : node.energyGas ?? node.energySolution
}

export function nodeEnergyForRelativeKcal(node: FlowNode, options: EnergyDisplayOptions): number | null {
  const value = energyToKcal(nodeEnergyForRelative(node, options.energySource), node.energyUnit)
  return typeof value === "number" ? value : null
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
