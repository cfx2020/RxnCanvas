export type GraphEditorMode = "select" | "connect" | "pan"

export type CanvasPoint = {
  x: number
  y: number
}

export type GraphEditorSelection = {
  nodeIds: string[]
  edgeIds: string[]
  pathIds: string[]
}

export type GraphEditorHoverTarget = {
  kind: "node" | "edge" | "path"
  id: string
}

export type GraphEditorDraggingState =
  | { kind: "node"; nodeIds: string[]; origin: CanvasPoint; current: CanvasPoint }
  | { kind: "canvas"; origin: CanvasPoint; current: CanvasPoint }
  | { kind: "object-drop"; objectId: string; current: CanvasPoint }

export type PendingEdgeDraft = {
  fromNodeId: string
  pointerGraphPosition?: CanvasPoint | null
  targetNodeId?: string | null
  source: "click" | "pointer"
}

export type DirectEdgeGestureResult =
  | { kind: "connect"; fromNodeId: string; toNodeId: string }
  | { kind: "cancel"; reason: "empty-target" | "same-node" | "stale-source" | "pointer-cancel" }

export type GraphEditorInteractionState = {
  mode: GraphEditorMode
  selection: GraphEditorSelection
  hover?: GraphEditorHoverTarget | null
  dragging?: GraphEditorDraggingState | null
  pendingEdge?: PendingEdgeDraft | null
}

export type GraphEditorReferenceSet = {
  nodeIds: readonly string[]
  edgeIds: readonly string[]
  pathIds: readonly string[]
}

export const initialGraphEditorSelection: GraphEditorSelection = {
  nodeIds: [],
  edgeIds: [],
  pathIds: [],
}

export const initialGraphEditorInteractionState: GraphEditorInteractionState = {
  mode: "select",
  selection: initialGraphEditorSelection,
  hover: null,
  dragging: null,
  pendingEdge: null,
}

export function selectGraphEditorNode(
  state: GraphEditorInteractionState,
  nodeId: string,
): GraphEditorInteractionState {
  return {
    ...state,
    mode: state.pendingEdge ? "connect" : "select",
    selection: {
      ...state.selection,
      nodeIds: [nodeId],
      edgeIds: [],
      pathIds: [],
    },
  }
}

export function selectGraphEditorEdge(
  state: GraphEditorInteractionState,
  edgeId: string,
): GraphEditorInteractionState {
  return {
    ...clearGraphEditorPendingEdge(state),
    selection: {
      nodeIds: [],
      edgeIds: [edgeId],
      pathIds: [],
    },
  }
}

export function selectGraphEditorPath(
  state: GraphEditorInteractionState,
  pathId: string,
): GraphEditorInteractionState {
  return {
    ...clearGraphEditorPendingEdge(state),
    selection: {
      nodeIds: [],
      edgeIds: [],
      pathIds: [pathId],
    },
  }
}

export function startGraphEditorConnection(
  state: GraphEditorInteractionState,
): GraphEditorInteractionState {
  const fromNodeId = state.selection.nodeIds[0]
  if (!fromNodeId) return state
  return {
    ...state,
    mode: "connect",
    pendingEdge: { fromNodeId, source: "click" },
  }
}

export function startGraphEditorPointerEdge(
  state: GraphEditorInteractionState,
  fromNodeId: string,
  pointerGraphPosition: CanvasPoint,
): GraphEditorInteractionState {
  if (!fromNodeId) return state
  return {
    ...state,
    mode: "connect",
    dragging: null,
    pendingEdge: {
      fromNodeId,
      pointerGraphPosition,
      targetNodeId: null,
      source: "pointer",
    },
  }
}

export function updateGraphEditorPointerEdge(
  state: GraphEditorInteractionState,
  pointerGraphPosition: CanvasPoint,
  targetNodeId: string | null = null,
): GraphEditorInteractionState {
  if (!state.pendingEdge || state.pendingEdge.source !== "pointer") return state
  return {
    ...state,
    pendingEdge: {
      ...state.pendingEdge,
      pointerGraphPosition,
      targetNodeId,
    },
  }
}

export function setGraphEditorMode(
  state: GraphEditorInteractionState,
  mode: GraphEditorMode,
): GraphEditorInteractionState {
  if (state.mode === mode) return state
  return {
    ...clearGraphEditorPendingEdge(state),
    mode,
    dragging: null,
  }
}

export function startGraphEditorCanvasDrag(
  state: GraphEditorInteractionState,
  origin: CanvasPoint,
): GraphEditorInteractionState {
  if (state.mode !== "pan") return state
  return {
    ...state,
    dragging: {
      kind: "canvas",
      origin,
      current: origin,
    },
  }
}

export function updateGraphEditorCanvasDrag(
  state: GraphEditorInteractionState,
  current: CanvasPoint,
): GraphEditorInteractionState {
  if (!state.dragging || state.dragging.kind !== "canvas") return state
  return {
    ...state,
    dragging: {
      ...state.dragging,
      current,
    },
  }
}

export function endGraphEditorCanvasDrag(
  state: GraphEditorInteractionState,
): GraphEditorInteractionState {
  if (!state.dragging || state.dragging.kind !== "canvas") return state
  return {
    ...state,
    dragging: null,
  }
}

export function clearGraphEditorPendingEdge(
  state: GraphEditorInteractionState,
): GraphEditorInteractionState {
  return {
    ...state,
    mode: "select",
    pendingEdge: null,
  }
}

export function completeGraphEditorConnection(
  state: GraphEditorInteractionState,
  targetNodeId: string,
): GraphEditorInteractionState {
  return {
    ...clearGraphEditorPendingEdge(state),
    selection: {
      ...state.selection,
      nodeIds: [targetNodeId],
      edgeIds: [],
      pathIds: [],
    },
  }
}

export function resolveGraphEditorDirectEdgeGesture(
  state: GraphEditorInteractionState,
  references: GraphEditorReferenceSet,
  targetNodeId: string | null = state.pendingEdge?.targetNodeId ?? null,
): DirectEdgeGestureResult {
  const pendingEdge = state.pendingEdge
  if (!pendingEdge || pendingEdge.source !== "pointer") {
    return { kind: "cancel", reason: "pointer-cancel" }
  }
  const validNodeIds = new Set(references.nodeIds)
  if (!validNodeIds.has(pendingEdge.fromNodeId)) {
    return { kind: "cancel", reason: "stale-source" }
  }
  if (!targetNodeId || !validNodeIds.has(targetNodeId)) {
    return { kind: "cancel", reason: "empty-target" }
  }
  if (targetNodeId === pendingEdge.fromNodeId) {
    return { kind: "cancel", reason: "same-node" }
  }
  return { kind: "connect", fromNodeId: pendingEdge.fromNodeId, toNodeId: targetNodeId }
}

export function pruneGraphEditorInteractionState(
  state: GraphEditorInteractionState,
  references: GraphEditorReferenceSet,
  options: { fallbackNodeId?: string } = {},
): GraphEditorInteractionState {
  const validNodeIds = new Set(references.nodeIds)
  const validEdgeIds = new Set(references.edgeIds)
  const validPathIds = new Set(references.pathIds)
  const selection = {
    nodeIds: state.selection.nodeIds.filter((nodeId) => validNodeIds.has(nodeId)),
    edgeIds: state.selection.edgeIds.filter((edgeId) => validEdgeIds.has(edgeId)),
    pathIds: state.selection.pathIds.filter((pathId) => validPathIds.has(pathId)),
  }
  if (selection.nodeIds.length === 0 && options.fallbackNodeId && validNodeIds.has(options.fallbackNodeId)) {
    selection.nodeIds = [options.fallbackNodeId]
  }

  const hover = state.hover && targetExists(state.hover, validNodeIds, validEdgeIds, validPathIds)
    ? state.hover
    : null
  const pendingEdge = prunePendingEdge(state.pendingEdge ?? null, validNodeIds)
  const dragging = pruneDraggingState(state.dragging ?? null, validNodeIds)

  return {
    ...state,
    mode: pendingEdge || state.mode !== "connect" ? state.mode : "select",
    selection,
    hover,
    dragging,
    pendingEdge,
  }
}

function targetExists(
  target: GraphEditorHoverTarget,
  validNodeIds: Set<string>,
  validEdgeIds: Set<string>,
  validPathIds: Set<string>,
): boolean {
  if (target.kind === "node") return validNodeIds.has(target.id)
  if (target.kind === "edge") return validEdgeIds.has(target.id)
  return validPathIds.has(target.id)
}

function prunePendingEdge(
  pendingEdge: PendingEdgeDraft | null,
  validNodeIds: Set<string>,
): PendingEdgeDraft | null {
  if (!pendingEdge || !validNodeIds.has(pendingEdge.fromNodeId)) return null
  if (!pendingEdge.targetNodeId || validNodeIds.has(pendingEdge.targetNodeId)) return pendingEdge
  return {
    ...pendingEdge,
    targetNodeId: null,
  }
}

function pruneDraggingState(
  dragging: GraphEditorDraggingState | null,
  validNodeIds: Set<string>,
): GraphEditorDraggingState | null {
  if (!dragging || dragging.kind !== "node") return dragging
  const nodeIds = dragging.nodeIds.filter((nodeId) => validNodeIds.has(nodeId))
  if (nodeIds.length === 0) return null
  return { ...dragging, nodeIds }
}
