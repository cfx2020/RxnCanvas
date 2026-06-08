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

export type GraphEditorSelectionMode = "replace" | "add" | "toggle"

export type GraphEditorSelectionTarget = {
  kind: "node" | "edge" | "path"
  id: string
}

export type GraphEditorHoverTarget = {
  kind: "node" | "edge" | "path"
  id: string
}

export type GraphEditorDraggingState =
  | { kind: "node"; nodeIds: string[]; origin: CanvasPoint; current: CanvasPoint }
  | { kind: "canvas"; origin: CanvasPoint; current: CanvasPoint }
  | { kind: "object-drop"; objectId: string; current: CanvasPoint }
  | { kind: "rubber-band"; origin: CanvasPoint; current: CanvasPoint; mode: "replace" | "add" }

export type PendingEdgeDraft = {
  fromNodeId: string
  pointerGraphPosition?: CanvasPoint | null
  targetNodeId?: string | null
  source: "click" | "pointer"
}

export type DirectEdgeGestureResult =
  | { kind: "connect"; fromNodeId: string; toNodeId: string }
  | { kind: "cancel"; reason: "empty-target" | "same-node" | "stale-source" | "pointer-cancel" }

export type GraphEditorKeyboardIntent =
  | { kind: "delete-selection" }
  | { kind: "clear-selection" }
  | { kind: "nudge-selection"; delta: CanvasPoint }
  | { kind: "undo-history" }
  | { kind: "redo-history" }

export type GraphEditorRubberBandNode = {
  id: string
  position: CanvasPoint
}

export type GraphEditorSelectionRectangle = {
  left: number
  top: number
  right: number
  bottom: number
}

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
  mode: "pan",
  selection: initialGraphEditorSelection,
  hover: null,
  dragging: null,
  pendingEdge: null,
}

export function selectGraphEditorNode(
  state: GraphEditorInteractionState,
  nodeId: string,
  mode: GraphEditorSelectionMode = "replace",
): GraphEditorInteractionState {
  return {
    ...state,
    mode: state.pendingEdge ? "connect" : state.mode,
    selection: applyGraphEditorSelectionIntent(state.selection, { kind: "node", id: nodeId }, mode),
  }
}

export function selectGraphEditorEdge(
  state: GraphEditorInteractionState,
  edgeId: string,
  mode: GraphEditorSelectionMode = "replace",
): GraphEditorInteractionState {
  const base = clearGraphEditorPendingEdge(state)
  return {
    ...base,
    selection: applyGraphEditorSelectionIntent(state.selection, { kind: "edge", id: edgeId }, mode),
  }
}

export function selectGraphEditorPath(
  state: GraphEditorInteractionState,
  pathId: string,
  mode: GraphEditorSelectionMode = "replace",
): GraphEditorInteractionState {
  const base = clearGraphEditorPendingEdge(state)
  return {
    ...base,
    selection: applyGraphEditorSelectionIntent(state.selection, { kind: "path", id: pathId }, mode),
  }
}

export function selectGraphEditorNodes(
  state: GraphEditorInteractionState,
  nodeIds: string[],
  mode: "replace" | "add" = "replace",
): GraphEditorInteractionState {
  const uniqueNodeIds = uniqueIds(nodeIds)
  const selection = mode === "replace"
    ? { nodeIds: uniqueNodeIds, edgeIds: [], pathIds: [] }
    : {
      ...state.selection,
      nodeIds: uniqueIds([...state.selection.nodeIds, ...uniqueNodeIds]),
    }
  return {
    ...clearGraphEditorPendingEdge(state),
    dragging: state.dragging?.kind === "rubber-band" ? null : state.dragging ?? null,
    selection,
  }
}

export function clearGraphEditorSelection(
  state: GraphEditorInteractionState,
): GraphEditorInteractionState {
  return {
    ...clearGraphEditorPendingEdge(state),
    dragging: state.dragging?.kind === "rubber-band" ? null : state.dragging ?? null,
    selection: initialGraphEditorSelection,
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

export function startGraphEditorRubberBand(
  state: GraphEditorInteractionState,
  origin: CanvasPoint,
  mode: "replace" | "add" = "replace",
): GraphEditorInteractionState {
  if (state.mode !== "select") return state
  return {
    ...clearGraphEditorPendingEdge(state),
    dragging: {
      kind: "rubber-band",
      origin,
      current: origin,
      mode,
    },
  }
}

export function updateGraphEditorRubberBand(
  state: GraphEditorInteractionState,
  current: CanvasPoint,
): GraphEditorInteractionState {
  if (!state.dragging || state.dragging.kind !== "rubber-band") return state
  return {
    ...state,
    dragging: {
      ...state.dragging,
      current,
    },
  }
}

export function endGraphEditorRubberBand(
  state: GraphEditorInteractionState,
): GraphEditorInteractionState {
  if (!state.dragging || state.dragging.kind !== "rubber-band") return state
  return {
    ...state,
    dragging: null,
  }
}

export function graphEditorRubberBandRectangle(
  origin: CanvasPoint,
  current: CanvasPoint,
): GraphEditorSelectionRectangle {
  return {
    left: Math.min(origin.x, current.x),
    top: Math.min(origin.y, current.y),
    right: Math.max(origin.x, current.x),
    bottom: Math.max(origin.y, current.y),
  }
}

export function resolveGraphEditorRubberBandNodeIds(
  state: GraphEditorInteractionState,
  nodes: readonly GraphEditorRubberBandNode[],
): string[] {
  if (!state.dragging || state.dragging.kind !== "rubber-band") return []
  const rectangle = graphEditorRubberBandRectangle(state.dragging.origin, state.dragging.current)
  return nodes
    .filter((node) => pointInRectangle(node.position, rectangle))
    .map((node) => node.id)
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

export function resolveGraphEditorKeyboardIntent(
  event: {
    key: string
    target?: EventTarget | null
    altKey?: boolean
    ctrlKey?: boolean
    metaKey?: boolean
    shiftKey?: boolean
  },
): GraphEditorKeyboardIntent | null {
  if (event.altKey || isEditableKeyboardTarget(event.target)) return null
  if (event.ctrlKey || event.metaKey) {
    const key = event.key.toLowerCase()
    if (key === "z" && event.shiftKey) return { kind: "redo-history" }
    if (key === "z") return { kind: "undo-history" }
    if (key === "y" && event.ctrlKey) return { kind: "redo-history" }
    return null
  }
  switch (event.key) {
    case "Delete":
    case "Backspace":
      return { kind: "delete-selection" }
    case "Escape":
      return { kind: "clear-selection" }
    case "ArrowUp":
      return { kind: "nudge-selection", delta: { x: 0, y: -20 } }
    case "ArrowDown":
      return { kind: "nudge-selection", delta: { x: 0, y: 20 } }
    case "ArrowLeft":
      return { kind: "nudge-selection", delta: { x: -20, y: 0 } }
    case "ArrowRight":
      return { kind: "nudge-selection", delta: { x: 20, y: 0 } }
    default:
      return null
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

function applyGraphEditorSelectionIntent(
  selection: GraphEditorSelection,
  target: GraphEditorSelectionTarget,
  mode: GraphEditorSelectionMode,
): GraphEditorSelection {
  if (mode === "replace") {
    return {
      nodeIds: target.kind === "node" ? [target.id] : [],
      edgeIds: target.kind === "edge" ? [target.id] : [],
      pathIds: target.kind === "path" ? [target.id] : [],
    }
  }
  return {
    nodeIds: updateSelectionIds(selection.nodeIds, target.kind === "node" ? target.id : null, mode),
    edgeIds: updateSelectionIds(selection.edgeIds, target.kind === "edge" ? target.id : null, mode),
    pathIds: updateSelectionIds(selection.pathIds, target.kind === "path" ? target.id : null, mode),
  }
}

function updateSelectionIds(
  ids: string[],
  targetId: string | null,
  mode: Exclude<GraphEditorSelectionMode, "replace">,
): string[] {
  if (!targetId) return ids
  const exists = ids.includes(targetId)
  if (mode === "add") return exists ? ids : [...ids, targetId]
  return exists ? ids.filter((id) => id !== targetId) : [...ids, targetId]
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)))
}

function pointInRectangle(point: CanvasPoint, rectangle: GraphEditorSelectionRectangle): boolean {
  return point.x >= rectangle.left
    && point.x <= rectangle.right
    && point.y >= rectangle.top
    && point.y <= rectangle.bottom
}

function isEditableKeyboardTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  if (tagName === "input" || tagName === "textarea" || tagName === "select") return true
  if (target.isContentEditable || target.contentEditable === "true" || target.contentEditable === "plaintext-only") return true
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"))
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
  if (dragging?.kind === "rubber-band") return null
  if (!dragging || dragging.kind !== "node") return dragging
  const nodeIds = dragging.nodeIds.filter((nodeId) => validNodeIds.has(nodeId))
  if (nodeIds.length === 0) return null
  return { ...dragging, nodeIds }
}
