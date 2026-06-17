export type CanvasSelectionMode = "replace" | "toggle"

export type CanvasSelectionIds = {
  nodeIds: string[]
  edgeIds: string[]
  barrierIds: string[]
}

export type CanvasSelectionTransition = {
  selection: CanvasSelectionIds
  keyboardEdgeSourceId: string | null
  inspectorMode: "inspector"
}

export function toggleIdSelection(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id]
}

export function selectIdsForMode(ids: string[], id: string, mode: CanvasSelectionMode): string[] {
  return mode === "toggle" ? toggleIdSelection(ids, id) : [id]
}

export function canvasSelectionForNode(
  currentSelection: CanvasSelectionIds,
  nodeId: string,
  mode: CanvasSelectionMode,
): CanvasSelectionIds {
  return {
    nodeIds: selectIdsForMode(currentSelection.nodeIds, nodeId, mode),
    edgeIds: mode === "replace" ? [] : currentSelection.edgeIds,
    barrierIds: mode === "replace" ? [] : currentSelection.barrierIds,
  }
}

export function canvasSelectionForEdge(
  currentSelection: CanvasSelectionIds,
  edgeId: string,
  mode: CanvasSelectionMode,
): CanvasSelectionIds {
  return {
    nodeIds: mode === "replace" ? [] : currentSelection.nodeIds,
    edgeIds: selectIdsForMode(currentSelection.edgeIds, edgeId, mode),
    barrierIds: mode === "replace" ? [] : currentSelection.barrierIds,
  }
}

export function canvasSelectionForBarrier(
  currentSelection: CanvasSelectionIds,
  barrierId: string,
  mode: CanvasSelectionMode,
): CanvasSelectionIds {
  return {
    nodeIds: mode === "replace" ? [] : currentSelection.nodeIds,
    edgeIds: mode === "replace" ? [] : currentSelection.edgeIds,
    barrierIds: selectIdsForMode(currentSelection.barrierIds, barrierId, mode),
  }
}

export function canvasNodeSelectionTransition(
  currentSelection: CanvasSelectionIds,
  nodeId: string,
  mode: CanvasSelectionMode,
  currentKeyboardEdgeSourceId: string | null,
): CanvasSelectionTransition {
  return {
    selection: canvasSelectionForNode(currentSelection, nodeId, mode),
    keyboardEdgeSourceId: currentKeyboardEdgeSourceId === nodeId ? currentKeyboardEdgeSourceId : null,
    inspectorMode: "inspector",
  }
}

export function canvasEdgeSelectionTransition(
  currentSelection: CanvasSelectionIds,
  edgeId: string,
  mode: CanvasSelectionMode,
): CanvasSelectionTransition {
  return {
    selection: canvasSelectionForEdge(currentSelection, edgeId, mode),
    keyboardEdgeSourceId: null,
    inspectorMode: "inspector",
  }
}

export function canvasBarrierSelectionTransition(
  currentSelection: CanvasSelectionIds,
  barrierId: string,
  mode: CanvasSelectionMode,
): CanvasSelectionTransition {
  return {
    selection: canvasSelectionForBarrier(currentSelection, barrierId, mode),
    keyboardEdgeSourceId: null,
    inspectorMode: "inspector",
  }
}

export function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids))
}

export function lastSelectedId(ids: string[]): string | null {
  return ids.at(-1) ?? null
}

export function nodeOnlySelection(nodeId: string | null): CanvasSelectionIds {
  return {
    nodeIds: nodeId ? [nodeId] : [],
    edgeIds: [],
    barrierIds: [],
  }
}

export function edgeOnlySelection(edgeId: string | null): CanvasSelectionIds {
  return {
    nodeIds: [],
    edgeIds: edgeId ? [edgeId] : [],
    barrierIds: [],
  }
}

export function barrierOnlySelection(barrierId: string | null): CanvasSelectionIds {
  return {
    nodeIds: [],
    edgeIds: [],
    barrierIds: barrierId ? [barrierId] : [],
  }
}

export function hasCanvasSelection(selection: CanvasSelectionIds): boolean {
  return selection.nodeIds.length > 0 || selection.edgeIds.length > 0 || selection.barrierIds.length > 0
}
