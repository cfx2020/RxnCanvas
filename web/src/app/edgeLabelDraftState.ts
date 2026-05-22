import type { GraphEdgeSummary, WorkspaceSummary } from "../shell"

export type EdgeLabelDraftState = {
  edgeId: string | null
  label: string
  dirty: boolean
}

export const initialEdgeLabelDraftState: EdgeLabelDraftState = {
  edgeId: null,
  label: "",
  dirty: false,
}

export function edgeLabelDraftFromSelectedEdge(
  workspace: WorkspaceSummary | undefined,
): EdgeLabelDraftState {
  const selectedEdgeId = workspace?.selection?.edge_ids[0] ?? null
  if (!workspace || !selectedEdgeId) return initialEdgeLabelDraftState
  const edge = workspace.graph.edges.find((item) => item.id === selectedEdgeId)
  return edge ? edgeLabelDraftFromEdge(edge) : initialEdgeLabelDraftState
}

export function edgeLabelDraftFromEdge(edge: GraphEdgeSummary): EdgeLabelDraftState {
  return {
    edgeId: edge.id,
    label: edge.label ?? "",
    dirty: false,
  }
}

export function reconcileEdgeLabelDraft(
  current: EdgeLabelDraftState,
  workspace: WorkspaceSummary | undefined,
): EdgeLabelDraftState {
  const selectedEdgeId = workspace?.selection?.edge_ids[0] ?? null
  if (!workspace || !selectedEdgeId) return initialEdgeLabelDraftState
  const edge = workspace.graph.edges.find((item) => item.id === selectedEdgeId)
  if (!edge) return initialEdgeLabelDraftState
  if (current.edgeId !== edge.id) return edgeLabelDraftFromEdge(edge)
  if (current.dirty) return current
  const next = edgeLabelDraftFromEdge(edge)
  return edgeLabelDraftEquals(current, next) ? current : next
}

export function updateEdgeLabelDraft(
  current: EdgeLabelDraftState,
  label: string,
): EdgeLabelDraftState {
  if (!current.edgeId) return current
  return {
    ...current,
    label,
    dirty: true,
  }
}

export function clearEdgeLabelDraft(current: EdgeLabelDraftState): EdgeLabelDraftState {
  return updateEdgeLabelDraft(current, "")
}

function edgeLabelDraftEquals(
  left: EdgeLabelDraftState,
  right: EdgeLabelDraftState,
): boolean {
  return left.edgeId === right.edgeId
    && left.label === right.label
    && left.dirty === right.dirty
}
