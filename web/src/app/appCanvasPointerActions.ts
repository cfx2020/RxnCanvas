import type { PointerEvent } from "react"
import type { CanvasViewport, FlowBarrier, FlowEdge, FlowNode, Point } from "../domain/projectPackages"
import { pannedViewportFromDrag } from "./canvasGeometry"
import { flowNodeIdAtClientPoint } from "./canvasHitTesting"
import {
  applyNodePosition,
  canvasNodePointerDownTransition,
  canvasPointerMoveTransition,
  canvasSurfacePointerDownTransition,
  completeBarrierDraftTransition,
  completeConnectionDraftTransition,
  createConnectionEdgeTransition,
  finishCanvasDragTransition,
  startBarrierDraftTransition,
  startConnectionDraftTransition,
  type CanvasDragState,
  type CanvasSelectionIds,
} from "./canvasEditState"
import type { BarrierDraft, ConnectionDraft } from "./CanvasWorkspace"
import type { CanvasEditSnapshot } from "./projectWorkspace"
import {
  applyCanvasSelectionState,
  type ProjectWorkspaceStateSetters,
} from "./appStateAppliers"
import type { PushCanvasEditHistory } from "./appCanvasEditActions"

export type ScreenToWorld = (point: Point) => Point

export function flowNodeIdAtDocumentPoint({
  clientX,
  clientY,
  excludedNodeId,
  nodeIdSet,
}: {
  clientX: number
  clientY: number
  excludedNodeId: string
  nodeIdSet: Set<string>
}): string | null {
  return flowNodeIdAtClientPoint(document, clientX, clientY, excludedNodeId, nodeIdSet)
}

export function handleCanvasPointerDownAction({
  event,
  connectionDraft,
  barrierDraft,
  tool,
  viewport,
  screenToWorld,
  appStateSetters,
}: {
  event: PointerEvent<HTMLDivElement>
  connectionDraft: ConnectionDraft | null
  barrierDraft: BarrierDraft | null
  tool: "select" | "pan"
  viewport: CanvasViewport
  screenToWorld: ScreenToWorld
  appStateSetters: ProjectWorkspaceStateSetters
}): void {
  if (event.button !== 0) return
  const clientPoint = { x: event.clientX, y: event.clientY }
  const transition = canvasSurfacePointerDownTransition({
    connectionDraft,
    barrierDraft,
    tool,
    pointerId: event.pointerId,
    clientPoint,
    worldPoint: screenToWorld(clientPoint),
    viewport,
    additive: event.shiftKey,
  })
  if (transition.kind === "clear-connection-draft") {
    appStateSetters.setConnectionDraft(transition.connectionDraft)
    return
  }
  if (transition.kind === "clear-barrier-draft") {
    appStateSetters.setBarrierDraft(transition.barrierDraft)
    return
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
  appStateSetters.setDragState(transition.dragState)
}

export function handleNodePointerDownAction({
  event,
  node,
  currentSelection,
  nodes,
  edges,
  barriers,
  screenToWorld,
  appStateSetters,
}: {
  event: PointerEvent<HTMLElement>
  node: FlowNode
  currentSelection: CanvasSelectionIds
  nodes: FlowNode[]
  edges: FlowEdge[]
  barriers: FlowBarrier[]
  screenToWorld: ScreenToWorld
  appStateSetters: ProjectWorkspaceStateSetters
}): void {
  if (event.button !== 0) return
  event.stopPropagation()
  event.currentTarget.setPointerCapture?.(event.pointerId)
  const transition = canvasNodePointerDownTransition({
    currentSelection,
    node,
    pointerId: event.pointerId,
    worldPoint: screenToWorld({ x: event.clientX, y: event.clientY }),
    additive: event.shiftKey,
    snapshotForSelection: (selection) => ({
      nodes,
      edges,
      barriers,
      selectedNodeIds: selection.nodeIds,
      selectedEdgeIds: selection.edgeIds,
      selectedBarrierIds: selection.barrierIds,
    }),
  })
  applyCanvasSelectionState(appStateSetters, transition.selection)
  appStateSetters.setInspectorMode(transition.inspectorMode)
  appStateSetters.setDragState(transition.dragState)
}

export function handlePointerMoveAction({
  pointerId,
  clientX,
  clientY,
  connectionDraft,
  barrierDraft,
  dragState,
  screenToWorld,
  appStateSetters,
}: {
  pointerId: number
  clientX: number
  clientY: number
  connectionDraft: ConnectionDraft | null
  barrierDraft: BarrierDraft | null
  dragState: CanvasDragState<CanvasEditSnapshot> | null
  screenToWorld: ScreenToWorld
  appStateSetters: ProjectWorkspaceStateSetters
}): void {
  const clientPoint = { x: clientX, y: clientY }
  const move = canvasPointerMoveTransition({
    connectionDraft,
    barrierDraft,
    dragState,
    pointerId,
    clientPoint,
    worldPoint: screenToWorld(clientPoint),
  })
  if (move.kind === "connection-draft") {
    appStateSetters.setConnectionDraft(move.connectionDraft)
    return
  }
  if (move.kind === "barrier-draft") {
    appStateSetters.setBarrierDraft(move.barrierDraft)
    return
  }
  if (move.kind === "none") return
  if (move.kind === "pan") {
    appStateSetters.setViewport((current) => pannedViewportFromDrag(current, move.drag, move.clientPoint))
    return
  }
  if (move.kind === "rubber") {
    appStateSetters.setDragState(move.drag)
    return
  }

  appStateSetters.setNodes((current) => applyNodePosition(current, move.nodeId, move.position))
}

export function createConnectionEdgeAction({
  edges,
  sourceId,
  targetId,
  appStateSetters,
  pushEditHistory,
  now = Date.now(),
}: {
  edges: FlowEdge[]
  sourceId: string
  targetId: string
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
  now?: number
}): void {
  const transition = createConnectionEdgeTransition(edges, `edge-${now}`, sourceId, targetId)
  if (!transition) return
  pushEditHistory()
  appStateSetters.setEdges(transition.items)
  applyCanvasSelectionState(appStateSetters, transition.selection)
  appStateSetters.setInspectorMode("inspector")
}

export function finishConnectionDraftAtClientPointAction({
  pointerId,
  clientX,
  clientY,
  connectionDraft,
  nodeIdSet,
  edges,
  appStateSetters,
  pushEditHistory,
  now,
}: {
  pointerId: number
  clientX: number
  clientY: number
  connectionDraft: ConnectionDraft | null
  nodeIdSet: Set<string>
  edges: FlowEdge[]
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
  now?: number
}): boolean {
  if (!connectionDraft) return false
  const targetId = flowNodeIdAtDocumentPoint({
    clientX,
    clientY,
    excludedNodeId: connectionDraft.sourceId,
    nodeIdSet,
  })
  const transition = completeConnectionDraftTransition(connectionDraft, pointerId, targetId)
  if (!transition) return false
  if (transition.target) {
    createConnectionEdgeAction({
      edges,
      sourceId: transition.target.sourceId,
      targetId: transition.target.targetId,
      appStateSetters,
      pushEditHistory,
      now,
    })
  }
  appStateSetters.setConnectionDraft(transition.connectionDraft)
  return true
}

export function endCanvasPointerAction({
  event,
  dragState,
  connectionDraft,
  barrierDraft,
  nodes,
  barriers,
  selection,
  nodeIdSet,
  screenToWorld,
  finishConnectionDraftAtClientPoint,
  appStateSetters,
  pushEditHistory,
}: {
  event: PointerEvent<HTMLDivElement>
  dragState: CanvasDragState<CanvasEditSnapshot> | null
  connectionDraft: ConnectionDraft | null
  barrierDraft: BarrierDraft | null
  nodes: FlowNode[]
  barriers: FlowBarrier[]
  selection: CanvasSelectionIds
  nodeIdSet: Set<string>
  screenToWorld: ScreenToWorld
  finishConnectionDraftAtClientPoint: (pointerId: number, clientX: number, clientY: number) => boolean
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
}): void {
  if (dragState?.pointerId === event.pointerId) {
    const releasePoint = screenToWorld({ x: event.clientX, y: event.clientY })
    const transition = finishCanvasDragTransition(
      dragState,
      event.pointerId,
      releasePoint,
      nodes,
      selection,
    )
    const finishedNodeDrag = transition?.nodeDrag
    if (finishedNodeDrag) {
      if (finishedNodeDrag.moved) pushEditHistory(finishedNodeDrag.snapshot)
      appStateSetters.setNodes((current) => applyNodePosition(current, finishedNodeDrag.nodeId, finishedNodeDrag.finalPosition))
    }
    if (transition?.rubberBand) {
      applyCanvasSelectionState(appStateSetters, transition.rubberBand.selection)
    }
    if (transition?.inspectorMode) appStateSetters.setInspectorMode(transition.inspectorMode)
    if (transition) appStateSetters.setDragState(transition.dragState)
  }
  if (connectionDraft?.pointerId === event.pointerId) {
    finishConnectionDraftAtClientPoint(event.pointerId, event.clientX, event.clientY)
  }
  if (barrierDraft?.pointerId === event.pointerId) {
    const targetId = flowNodeIdAtDocumentPoint({
      clientX: event.clientX,
      clientY: event.clientY,
      excludedNodeId: barrierDraft.sourceId,
      nodeIdSet,
    })
    const id = `barrier-${barrierDraft.sourceId}-${targetId ?? "missing"}-${Date.now()}`
    const transition = completeBarrierDraftTransition(barriers, id, barrierDraft, event.pointerId, targetId)
    if (transition?.creation) {
      pushEditHistory()
      appStateSetters.setBarriers(transition.creation.items)
      applyCanvasSelectionState(appStateSetters, transition.creation.selection)
      appStateSetters.setInspectorMode(transition.inspectorMode ?? "inspector")
    }
    if (transition) appStateSetters.setBarrierDraft(transition.barrierDraft)
  }
}

export function startConnectionAction({
  event,
  sourceId,
  screenToWorld,
  appStateSetters,
}: {
  event: PointerEvent<HTMLElement>
  sourceId: string
  screenToWorld: ScreenToWorld
  appStateSetters: ProjectWorkspaceStateSetters
}): void {
  if (event.button !== 0) return
  event.stopPropagation()
  const transition = startConnectionDraftTransition(
    event.pointerId,
    sourceId,
    screenToWorld({ x: event.clientX, y: event.clientY }),
  )
  applyCanvasSelectionState(appStateSetters, transition.selection)
  appStateSetters.setKeyboardEdgeSourceId(transition.keyboardEdgeSourceId)
  appStateSetters.setConnectionDraft(transition.connectionDraft)
}

export function startBarrierAnnotationAction({
  event,
  sourceId,
  screenToWorld,
  appStateSetters,
}: {
  event: PointerEvent<HTMLElement>
  sourceId: string
  screenToWorld: ScreenToWorld
  appStateSetters: ProjectWorkspaceStateSetters
}): void {
  if (event.button !== 0) return
  event.stopPropagation()
  event.currentTarget.setPointerCapture?.(event.pointerId)
  const transition = startBarrierDraftTransition(
    event.pointerId,
    sourceId,
    screenToWorld({ x: event.clientX, y: event.clientY }),
  )
  applyCanvasSelectionState(appStateSetters, transition.selection)
  appStateSetters.setKeyboardEdgeSourceId(transition.keyboardEdgeSourceId)
  appStateSetters.setConnectionDraft(transition.connectionDraft)
  appStateSetters.setBarrierDraft(transition.barrierDraft)
}

export function completeConnectionToNodeAction({
  event,
  targetId,
  connectionDraft,
  edges,
  appStateSetters,
  pushEditHistory,
}: {
  event: PointerEvent<HTMLElement>
  targetId: string
  connectionDraft: ConnectionDraft | null
  edges: FlowEdge[]
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
}): void {
  const transition = completeConnectionDraftTransition(connectionDraft, event.pointerId, targetId)
  if (!transition) return
  event.stopPropagation()
  if (transition.target) {
    createConnectionEdgeAction({
      edges,
      sourceId: transition.target.sourceId,
      targetId: transition.target.targetId,
      appStateSetters,
      pushEditHistory,
    })
  }
  appStateSetters.setConnectionDraft(transition.connectionDraft)
}
