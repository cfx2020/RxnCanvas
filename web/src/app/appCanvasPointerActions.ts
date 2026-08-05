import type { PointerEvent } from "react"
import type { CanvasViewport, EdgeStepRole, FlowBarrier, FlowEdge, FlowNode, Point } from "../domain/projectPackages"
import { reconcileEdgeDerivedPathRoles } from "../domain/reactionGraphRoles"
import {
  connectionSnapRadiusPx,
  nearestConnectionMagnetTarget,
  updateConnectionDraftWithMagnetTarget,
} from "./canvasConnectionMagnetism"
import { pannedViewportFromDrag } from "./canvasGeometry"
import { flowNodeIdAtClientPoint } from "./canvasHitTesting"
import {
  applyNodePositions,
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
import {
  copyCanvasSelection as copyCanvasSelectionPayload,
  pasteCanvasClipboard as pasteCanvasClipboardPayload,
} from "./canvasClipboardState"
import type { BarrierDraft, ConnectionDraft } from "./CanvasWorkspace"
import type { CanvasEditSnapshot } from "./projectWorkspace"
import {
  applyCanvasSelectionState,
  type ProjectWorkspaceStateSetters,
} from "./appStateAppliers"
import type { PushCanvasEditHistory } from "./appCanvasEditActions"

export type ScreenToWorld = (point: Point) => Point

export type CanvasDragPreview = {
  previewViewport?: (viewport: CanvasViewport) => void
  previewNodePosition?: (nodeId: string, position: Point) => void
}

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
  pushEditHistory,
  copyModifier,
}: {
  event: PointerEvent<HTMLElement>
  node: FlowNode
  currentSelection: CanvasSelectionIds
  nodes: FlowNode[]
  edges: FlowEdge[]
  barriers: FlowBarrier[]
  screenToWorld: ScreenToWorld
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
  copyModifier: boolean
}): void {
  if (event.button !== 0) return
  event.preventDefault()
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
  if (copyModifier) {
    const payload = copyCanvasSelectionPayload({ nodes, edges, barriers }, transition.selection)
    const copyResult = pasteCanvasClipboardPayload(
      { nodes, edges, barriers },
      payload,
      { pasteIndex: 1, offsetStep: { x: 0, y: 0 }, preserveLabels: true },
    )
    if (copyResult) {
      pushEditHistory()
      appStateSetters.setNodes(copyResult.collections.nodes)
      appStateSetters.setEdges(copyResult.collections.edges)
      appStateSetters.setBarriers(copyResult.collections.barriers)
      applyCanvasSelectionState(appStateSetters, copyResult.selection)
      appStateSetters.setInspectorMode(transition.inspectorMode)
      appStateSetters.setDragState({
        ...transition.dragState,
        nodeId: copyResult.selection.nodeIds[0] ?? transition.dragState.nodeId,
        subjects: copyResult.selection.nodeIds.flatMap((nodeId) => {
          const copiedNode = copyResult.collections.nodes.find((item) => item.id === nodeId)
          return copiedNode ? [{ nodeId, origin: copiedNode.position }] : []
        }),
        mode: "copy",
        snapshot: {
          nodes,
          edges,
          barriers,
          selectedNodeIds: currentSelection.nodeIds,
          selectedEdgeIds: currentSelection.edgeIds,
          selectedBarrierIds: currentSelection.barrierIds,
        },
      })
      return
    }
  }
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
  nodes = [],
  connectionSnapRadiusWorld = connectionSnapRadiusPx,
  viewport,
  screenToWorld,
  appStateSetters,
  dragPreview,
}: {
  pointerId: number
  clientX: number
  clientY: number
  connectionDraft: ConnectionDraft | null
  barrierDraft: BarrierDraft | null
  dragState: CanvasDragState<CanvasEditSnapshot> | null
  nodes?: FlowNode[]
  connectionSnapRadiusWorld?: number
  viewport?: CanvasViewport
  screenToWorld: ScreenToWorld
  appStateSetters: ProjectWorkspaceStateSetters
  dragPreview?: CanvasDragPreview
}): void {
  const clientPoint = { x: clientX, y: clientY }
  const worldPoint = screenToWorld(clientPoint)
  const move = canvasPointerMoveTransition({
    connectionDraft,
    barrierDraft,
    dragState,
    pointerId,
    clientPoint,
    worldPoint,
  })
  if (move.kind === "connection-draft") {
    appStateSetters.setConnectionDraft((currentDraft) => (
      updateConnectionDraftWithMagnetTarget({
        draft: currentDraft,
        pointerId,
        current: worldPoint,
        nodes,
        radius: connectionSnapRadiusWorld,
      })
    ))
    return
  }
  if (move.kind === "barrier-draft") {
    appStateSetters.setBarrierDraft(move.barrierDraft)
    return
  }
  if (move.kind === "none") return
  if (move.kind === "pan") {
    if (dragPreview?.previewViewport && viewport) {
      dragPreview.previewViewport(pannedViewportFromDrag(viewport, move.drag, move.clientPoint))
      return
    }
    appStateSetters.setViewport((current) => pannedViewportFromDrag(current, move.drag, move.clientPoint))
    return
  }
  if (move.kind === "rubber") {
    appStateSetters.setDragState(move.drag)
    return
  }

  if (dragPreview?.previewNodePosition && move.mode !== "copy" && move.positions.length === 1) {
    const [position] = move.positions
    dragPreview.previewNodePosition(position.nodeId, position.position)
    return
  }
  appStateSetters.setNodes((current) => applyNodePositions(current, move.positions))
}

export function createConnectionEdgeAction({
  edges,
  nodes,
  sourceId,
  targetId,
  stepRole,
  appStateSetters,
  pushEditHistory,
  now = Date.now(),
}: {
  edges: FlowEdge[]
  nodes?: FlowNode[]
  sourceId: string
  targetId: string
  stepRole?: Extract<EdgeStepRole, "addition" | "release">
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
  now?: number
}): void {
  const transition = createConnectionEdgeTransition(edges, `edge-${now}`, sourceId, targetId, stepRole)
  if (!transition) return
  const createdEdgeId = `edge-${now}`
  pushEditHistory()
  const nextEdges = stepRole
    ? transition.items.filter((edge) => !sideSpeciesEdgeInvolvingNode(edge, stepRole === "addition" ? sourceId : targetId) || edge.id === createdEdgeId)
    : transition.items
  if (nodes) appStateSetters.setNodes(reconcileEdgeDerivedPathRoles(nodes, nextEdges))
  appStateSetters.setEdges(nextEdges)
  applyCanvasSelectionState(appStateSetters, transition.selection)
  appStateSetters.setInspectorMode("inspector")
}

export function finishConnectionDraftAtClientPointAction({
  pointerId,
  clientX,
  clientY,
  connectionDraft,
  nodes = [],
  releasePoint,
  connectionSnapRadiusWorld = connectionSnapRadiusPx,
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
  nodes?: FlowNode[]
  releasePoint?: Point
  connectionSnapRadiusWorld?: number
  nodeIdSet: Set<string>
  edges: FlowEdge[]
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
  now?: number
}): boolean {
  if (!connectionDraft) return false
  const magneticTarget = releasePoint
    ? nearestConnectionMagnetTarget({
      nodes,
      sourceId: connectionDraft.sourceId,
      current: releasePoint,
      radius: connectionSnapRadiusWorld,
      sourceStepRole: connectionDraft.stepRole,
    })
    : null
  const targetId = magneticTarget?.targetId ?? (releasePoint ? null : connectionDraft.snapTargetId) ?? flowNodeIdAtDocumentPoint({
    clientX,
    clientY,
    excludedNodeId: connectionDraft.sourceId,
    nodeIdSet,
  })
  const transition = completeConnectionDraftTransition(connectionDraft, pointerId, targetId)
  if (!transition) return false
  if (transition.target) {
    const stepRole = magneticTarget
      ? magneticTarget.stepRole ?? connectionDraft.stepRole
      : (releasePoint ? connectionDraft.stepRole : (connectionDraft.snapStepRole ?? connectionDraft.stepRole))
    createConnectionEdgeAction({
      edges,
      nodes,
      sourceId: transition.target.sourceId,
      targetId: transition.target.targetId,
      stepRole,
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
  edges,
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
  edges: FlowEdge[]
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
      const nextNodes = applyNodePositions(nodes, finishedNodeDrag.positions)
      if (finishedNodeDrag.moved && finishedNodeDrag.mode !== "copy") {
        pushEditHistory(finishedNodeDrag.snapshot)
      }
      appStateSetters.setNodes(nextNodes)
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
  stepRole,
  screenToWorld,
  appStateSetters,
}: {
  event: PointerEvent<HTMLElement>
  sourceId: string
  stepRole?: Extract<EdgeStepRole, "addition">
  screenToWorld: ScreenToWorld
  appStateSetters: ProjectWorkspaceStateSetters
}): void {
  if (event.button !== 0) return
  event.stopPropagation()
  const transition = startConnectionDraftTransition(
    event.pointerId,
    sourceId,
    screenToWorld({ x: event.clientX, y: event.clientY }),
    stepRole,
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
  targetStepRole,
  connectionDraft,
  nodes,
  edges,
  appStateSetters,
  pushEditHistory,
}: {
  event: PointerEvent<HTMLElement>
  targetId: string
  targetStepRole?: Extract<EdgeStepRole, "release">
  connectionDraft: ConnectionDraft | null
  nodes?: FlowNode[]
  edges: FlowEdge[]
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
}): void {
  const transition = completeConnectionDraftTransition(connectionDraft, event.pointerId, targetId)
  if (!transition) return
  event.stopPropagation()
  if (transition.target) {
    const stepRole = connectionDraft?.stepRole ?? targetStepRole ?? connectionDraft?.snapStepRole
    createConnectionEdgeAction({
      edges,
      nodes,
      sourceId: transition.target.sourceId,
      targetId: transition.target.targetId,
      stepRole,
      appStateSetters,
      pushEditHistory,
    })
  }
  appStateSetters.setConnectionDraft(transition.connectionDraft)
}

function sideSpeciesEdgeInvolvingNode(edge: FlowEdge, nodeId: string): boolean {
  return (edge.stepRole === "addition" || edge.stepRole === "release")
    && (edge.sourceId === nodeId || edge.targetId === nodeId)
}
