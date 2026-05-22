export type GraphPathOrderDraft = {
  pathId: string
  nodeIds: string[]
}

export type GraphPathOrderMoveDirection = "up" | "down"

export function createGraphPathOrderDraft(pathId: string, nodeIds: readonly string[]): GraphPathOrderDraft {
  return {
    pathId,
    nodeIds: [...nodeIds],
  }
}

export function moveGraphPathDraftNode(
  draft: GraphPathOrderDraft,
  nodeId: string,
  direction: GraphPathOrderMoveDirection,
): GraphPathOrderDraft {
  const index = draft.nodeIds.indexOf(nodeId)
  if (index < 0) return draft
  const targetIndex = direction === "up" ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= draft.nodeIds.length) return draft
  const nodeIds = [...draft.nodeIds]
  const [item] = nodeIds.splice(index, 1)
  nodeIds.splice(targetIndex, 0, item)
  return { ...draft, nodeIds }
}

export function graphPathDraftChanged(draft: GraphPathOrderDraft | null, nodeIds: readonly string[]): boolean {
  if (!draft || draft.nodeIds.length !== nodeIds.length) return false
  return draft.nodeIds.some((nodeId, index) => nodeId !== nodeIds[index])
}
