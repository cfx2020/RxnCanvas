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

export type GraphEditorInteractionState = {
  mode: GraphEditorMode
  selection: GraphEditorSelection
  hover?: GraphEditorHoverTarget | null
  dragging?: GraphEditorDraggingState | null
  pendingEdge?: { fromNodeId: string } | null
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
    pendingEdge: { fromNodeId },
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
  const pendingEdge = state.pendingEdge && validNodeIds.has(state.pendingEdge.fromNodeId)
    ? state.pendingEdge
    : null
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

function pruneDraggingState(
  dragging: GraphEditorDraggingState | null,
  validNodeIds: Set<string>,
): GraphEditorDraggingState | null {
  if (!dragging || dragging.kind !== "node") return dragging
  const nodeIds = dragging.nodeIds.filter((nodeId) => validNodeIds.has(nodeId))
  if (nodeIds.length === 0) return null
  return { ...dragging, nodeIds }
}
