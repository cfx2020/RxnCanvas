import type { FlowBarrier, FlowEdge, FlowNode } from "../domain/projectPackages"
import { reconcileEdgeDerivedPathRoles } from "../domain/reactionGraphRoles"
import { hasCanvasSelection, type CanvasSelectionIds } from "./canvasSelectionState"
export * from "./canvasMutationState"
export * from "./canvasKeyboardState"
export * from "./canvasSelectionState"
export * from "./canvasDragState"
export * from "./canvasLinkState"

export type CanvasEditCollections = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  barriers: FlowBarrier[]
}

export type DeleteCanvasSelectionTransition = {
  collections: CanvasEditCollections
  interaction: ClearCanvasInteractionTransition
}

export type RestoreCanvasEditInteractionTransition = {
  keyboardEdgeSourceId: null
  connectionDraft: null
  barrierDraft: null
  dragState: null
  inspectorMode: "inspector"
}

export type ClearCanvasInteractionTransition = {
  selection: CanvasSelectionIds
  keyboardEdgeSourceId: null
  connectionDraft: null
  barrierDraft: null
}

export function clearCanvasInteractionTransition(): ClearCanvasInteractionTransition {
  return {
    selection: { nodeIds: [], edgeIds: [], barrierIds: [] },
    keyboardEdgeSourceId: null,
    connectionDraft: null,
    barrierDraft: null,
  }
}

export function restoreCanvasEditInteractionTransition(): RestoreCanvasEditInteractionTransition {
  return {
    keyboardEdgeSourceId: null,
    connectionDraft: null,
    barrierDraft: null,
    dragState: null,
    inspectorMode: "inspector",
  }
}

export function deleteCanvasSelection(
  collections: CanvasEditCollections,
  selection: CanvasSelectionIds,
): CanvasEditCollections {
  const selectedNodeIdSet = new Set(selection.nodeIds)
  const selectedEdgeIdSet = new Set(selection.edgeIds)
  const selectedBarrierIdSet = new Set(selection.barrierIds)

  const nodes = collections.nodes.filter((node) => !selectedNodeIdSet.has(node.id))
  const edges = collections.edges.filter((edge) => (
      !selectedEdgeIdSet.has(edge.id)
      && !selectedNodeIdSet.has(edge.sourceId)
      && !selectedNodeIdSet.has(edge.targetId)
    ))
  return {
    nodes: reconcileEdgeDerivedPathRoles(nodes, edges),
    edges,
    barriers: collections.barriers.filter((barrier) => (
      !selectedBarrierIdSet.has(barrier.id)
      && !selectedNodeIdSet.has(barrier.sourceId)
      && !selectedNodeIdSet.has(barrier.targetId)
    )),
  }
}

export function deleteCanvasSelectionTransition(
  collections: CanvasEditCollections,
  selection: CanvasSelectionIds,
): DeleteCanvasSelectionTransition | null {
  if (!hasCanvasSelection(selection)) return null
  return {
    collections: deleteCanvasSelection(collections, selection),
    interaction: clearCanvasInteractionTransition(),
  }
}
