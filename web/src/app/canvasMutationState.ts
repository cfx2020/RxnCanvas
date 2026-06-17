import type { FlowBarrier, FlowEdge, FlowNode, ManualStructurePayload } from "../domain/projectPackages"
import type { CanvasSelectionIds } from "./canvasSelectionState"

export type CanvasCollectionUpdate<TItem> = {
  items: TItem[]
  selection: CanvasSelectionIds
  inspectorMode: "inspector"
}

export function normalizeEdgeLabel(label: string): string {
  return label.trim() || "path"
}

export function updateEdgeLabelTransition(
  edges: FlowEdge[],
  edgeId: string,
  label: string,
): CanvasCollectionUpdate<FlowEdge> | null {
  const normalizedLabel = normalizeEdgeLabel(label)
  const edge = edges.find((item) => item.id === edgeId)
  if (!edge || edge.label === normalizedLabel) return null
  return {
    items: edges.map((item) => item.id === edgeId ? { ...item, label: normalizedLabel } : item),
    selection: edgeOnlySelection(edgeId),
    inspectorMode: "inspector",
  }
}

export function normalizeBarrierLabel(label: string | null): string | undefined {
  return label?.trim() || undefined
}

export function updateBarrierLabelTransition(
  barriers: FlowBarrier[],
  barrierId: string,
  label: string | null,
): CanvasCollectionUpdate<FlowBarrier> | null {
  const nextLabel = normalizeBarrierLabel(label)
  const barrier = barriers.find((item) => item.id === barrierId)
  if (!barrier || barrier.label === nextLabel) return null
  return {
    items: barriers.map((item) => item.id === barrierId ? { ...item, label: nextLabel } : item),
    selection: barrierOnlySelection(barrierId),
    inspectorMode: "inspector",
  }
}

export function normalizeNodeCoefficient(coefficient: number): number | null {
  if (!Number.isFinite(coefficient) || coefficient === 0) return null
  return Number(coefficient.toFixed(6))
}

export function flowNodeCoefficient(node: FlowNode): number {
  return typeof node.coefficient === "number" && Number.isFinite(node.coefficient) ? node.coefficient : 1
}

export function updateNodeCoefficientTransition(
  nodes: FlowNode[],
  nodeId: string,
  coefficient: number,
): CanvasCollectionUpdate<FlowNode> | null {
  const normalized = normalizeNodeCoefficient(coefficient)
  if (normalized === null) return null
  const node = nodes.find((item) => item.id === nodeId)
  if (!node || flowNodeCoefficient(node) === normalized) return null
  return {
    items: nodes.map((item) => item.id === nodeId ? { ...item, coefficient: normalized } : item),
    selection: nodeOnlySelection(nodeId),
    inspectorMode: "inspector",
  }
}

export function updateNodeManualStructureTransition(
  nodes: FlowNode[],
  nodeId: string,
  structure: ManualStructurePayload | null,
): CanvasCollectionUpdate<FlowNode> | null {
  const normalized = normalizeManualStructurePayload(structure)
  const node = nodes.find((item) => item.id === nodeId)
  if (!node || sameManualStructure(node, normalized)) return null
  return {
    items: nodes.map((item) => item.id === nodeId
      ? {
          ...item,
          manualStructureKet: normalized?.ket,
          manualStructureMolfile: normalized?.molfile,
          manualStructureCdxml: normalized?.cdxml,
          manualStructureSvg: normalized?.svg,
        }
      : item),
    selection: nodeOnlySelection(nodeId),
    inspectorMode: "inspector",
  }
}

function normalizeManualStructurePayload(structure: ManualStructurePayload | null): ManualStructurePayload | null {
  if (!structure) return null
  const normalized = {
    ket: structure.ket?.trim() || undefined,
    molfile: structure.molfile?.trim() || undefined,
    cdxml: structure.cdxml?.trim() || undefined,
    svg: structure.svg?.trim() || undefined,
  }
  return normalized.ket || normalized.molfile || normalized.cdxml || normalized.svg ? normalized : null
}

function sameManualStructure(node: FlowNode, structure: ManualStructurePayload | null): boolean {
  return (node.manualStructureKet ?? undefined) === structure?.ket
    && (node.manualStructureMolfile ?? undefined) === structure?.molfile
    && (node.manualStructureCdxml ?? undefined) === structure?.cdxml
    && (node.manualStructureSvg ?? undefined) === structure?.svg
}

function nodeOnlySelection(nodeId: string | null): CanvasSelectionIds {
  return {
    nodeIds: nodeId ? [nodeId] : [],
    edgeIds: [],
    barrierIds: [],
  }
}

function edgeOnlySelection(edgeId: string | null): CanvasSelectionIds {
  return {
    nodeIds: [],
    edgeIds: edgeId ? [edgeId] : [],
    barrierIds: [],
  }
}

function barrierOnlySelection(barrierId: string | null): CanvasSelectionIds {
  return {
    nodeIds: [],
    edgeIds: [],
    barrierIds: barrierId ? [barrierId] : [],
  }
}
