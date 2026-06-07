import { useEffect, useRef, useState } from "react"
import type { DragEvent, KeyboardEvent, MouseEvent, PointerEvent } from "react"
import { Check, GitBranch, Hand, LayoutDashboard, Link2, Maximize2, MousePointer2, Plus, Redo2, RotateCcw, Route, Trash2, Undo2, XCircle, ZoomIn, ZoomOut } from "lucide-react"
import type { Atom3DSummary, ParseCandidateSummary, ShellError, ShellWarning } from "../shell"
import type { GraphEdgeSummary, GraphNodeSummary, GraphPathSummary, ObjectSummary, WorkbenchDomainState } from "./workbenchState"
import type { CanvasPoint, GraphEditorInteractionState, GraphEditorSelectionMode, PendingEdgeDraft } from "./graphEditorInteractionState"
import {
  graphEditorRubberBandRectangle,
  resolveGraphEditorDirectEdgeGesture,
  resolveGraphEditorKeyboardIntent,
  resolveGraphEditorRubberBandNodeIds,
} from "./graphEditorInteractionState"
import { createGraphLayoutPlan, type GraphLayoutPlan, type GraphLayoutWarning } from "./graphAutoLayout"
import { graphObjectDragMimeType, parseGraphObjectDragPayload } from "./graphObjectDragPayload"
import { graphRawFileDropMimeType, parseGraphRawFileDropPayload } from "./graphRawFileDropPayload"
import { firstUserFacingName, graphNodeDisplayName, graphPathDisplayName, objectDisplayName, userFacingText, warningTargetDisplay } from "./displayNames"
import {
  canvasPointToGraphNodePosition,
  graphNodeCssPosition,
  graphNodeLayoutBounds,
  graphNodePosition,
  moveGraphNodePosition,
  type GraphNodeLayoutPosition,
} from "./graphNodeLayout"
import {
  createGraphMinimapGeometry,
  fitGraphViewportToNodes,
  graphPointFromMinimapPoint,
  graphViewportFromMinimapCenter,
  graphViewportFromMinimapPoint,
  graphViewportCssTransform,
  normalizeGraphViewport,
  panGraphViewport,
  resetGraphViewport,
  screenPointToGraphPoint,
  zoomGraphViewportAtScreenPoint,
  zoomGraphViewport,
  type GraphMinimapGeometry,
  type GraphMinimapRect,
  type GraphSurfaceSize,
  type GraphViewport,
} from "./graphViewport"
import type { PathAutoExtendResult } from "./graphPathAutoExtend"
import type { GraphPathOrderDraft } from "./graphPathOrderDraft"
import type { CompositionDraftRow, CompositionDraftState } from "./compositionDraftState"
import type { EdgeLabelDraftState } from "./edgeLabelDraftState"
import { useI18n } from "./i18n"
import { Molecule3DViewer } from "./Molecule3DViewer"

export type AddObjectNodeRequest = {
  objectId?: string
  position?: [number, number]
}

export type AddRawFileNodeRequest = {
  source:
    | { kind: "external-file"; file: File }
    | { kind: "project-file"; projectFileId: string; path: string }
  position: [number, number]
}

export type MoveGraphNodeRequest = {
  nodeId: string
  position: [number, number]
}

export type RemoveGraphItemsRequest = {
  nodeIds: string[]
  edgeIds: string[]
  pathIds: string[]
}

export type NudgeGraphNodesRequest = {
  nodeIds: string[]
  delta: CanvasPoint
}

export type GraphAutoLayoutStatus = {
  state: "idle" | "applying" | "success" | "noop" | "error"
  message?: string
  warnings?: GraphLayoutWarning[]
}

export type PathAuthoringStatus =
  | { state: "idle" }
  | { state: "auto"; pathId: string; reason: Extract<PathAutoExtendResult, { kind: "set-path" }>["reason"] }
  | { state: "manual"; reason: Extract<PathAutoExtendResult, { kind: "manual" }>["reason"] }
  | { state: "error"; error: ShellError }

export type GraphHistoryControls = {
  canUndo: boolean
  canRedo: boolean
  undoLabel?: string | null
  redoLabel?: string | null
  running?: "undo" | "redo" | null
  error?: ShellError | null
}

export type ParseCandidateChooserState = {
  projectFileId: string
  rawFilePath: string
  batchId: string
  itemId: string
  candidates: ParseCandidateSummary[]
  selectedCandidateIds: string[]
  position: [number, number]
  status: "choosing" | "registering" | "adding-nodes" | "error"
  error?: ShellError | null
}

type CanvasChemicalNodeSummary = {
  nodeId: string
  structureName: string
  formula?: string | null
  charge?: number | null
  spinMultiplicity?: number | null
  displayEnergy?: {
    key: string
    source: string
    value?: number | null
    unit: string
  } | null
  geometry: Atom3DSummary[]
  warnings: ShellWarning[]
}

type GraphCanvasProps = {
  state: WorkbenchDomainState
  activeObjectId?: string
  interactionState: GraphEditorInteractionState
  autoLayoutStatus?: GraphAutoLayoutStatus
  pathAuthoringStatus?: PathAuthoringStatus
  historyControls: GraphHistoryControls
  pathOrderDraft: GraphPathOrderDraft | null
  edgeLabelDraft: EdgeLabelDraftState
  edgeLabelPending: boolean
  edgeLabelError: ShellError | null
  compositionDraft: CompositionDraftState
  compositionPending: boolean
  compositionError: ShellError | null
  candidateChooser: ParseCandidateChooserState | null
  onSelectNode: (nodeId: string, mode?: GraphEditorSelectionMode) => void
  onSelectEdge: (edgeId: string, mode?: GraphEditorSelectionMode) => void
  onSelectPath: (pathId: string, nodeIds: string[], mode?: GraphEditorSelectionMode) => void
  onMovePathDraftNode: (nodeId: string, direction: "up" | "down") => void
  onApplyPathOrderDraft: () => void
  onEdgeLabelDraftChange: (label: string) => void
  onResetEdgeLabelDraft: () => void
  onClearEdgeLabelDraft: () => void
  onApplyEdgeLabelDraft: () => void
  onStartNodeDrag: (nodeId: string, origin: CanvasPoint) => void
  onUpdateNodeDrag: (current: CanvasPoint) => void
  onEndNodeDrag: () => void
  onStartCanvasDrag: (origin: CanvasPoint) => void
  onUpdateCanvasDrag: (current: CanvasPoint) => void
  onEndCanvasDrag: () => void
  onStartRubberBand: (origin: CanvasPoint, mode: "replace" | "add") => void
  onUpdateRubberBand: (current: CanvasPoint) => void
  onEndRubberBand: (nodeIds: string[], mode: "replace" | "add") => void
  onCancelRubberBand: () => void
  onStartPointerEdge: (nodeId: string, position: CanvasPoint) => void
  onUpdatePointerEdge: (position: CanvasPoint, targetNodeId: string | null) => void
  onEndPointerEdge: (targetNodeId: string | null) => void
  onCancelPointerEdge: () => void
  onOpenWorkspace: () => void
  onAddObjectNode: (request?: AddObjectNodeRequest) => void
  onAddRawFileNode: (request: AddRawFileNodeRequest) => void | Promise<void>
  onToggleCandidateSelection: (candidateId: string, selected: boolean) => void
  onConfirmCandidateChooser: () => void
  onCancelCandidateChooser: () => void
  onMoveNode: (request: MoveGraphNodeRequest) => void
  onNudgeNodes: (request: NudgeGraphNodesRequest) => void
  onUndoHistory: () => void
  onRedoHistory: () => void
  onApplyAutoLayout: (plan: GraphLayoutPlan) => void
  onRemoveGraphItems: (request: RemoveGraphItemsRequest) => void
  onClearSelection: () => void
  onSetViewport: (viewport: GraphViewport) => void
  onTogglePanMode: () => void
  onStartConnection: () => void
  onSetActivePath: () => void
  onCompositionDraftRowChange: (index: number, field: keyof CompositionDraftRow, value: string) => void
  onAddCompositionDraftRow: () => void
  onRemoveCompositionDraftRow: (index: number) => void
  onResetCompositionDraft: () => void
  onApplyCompositionDraft: () => void
}

export function GraphCanvas({
  state,
  activeObjectId,
  interactionState,
  autoLayoutStatus,
  pathAuthoringStatus = { state: "idle" },
  historyControls,
  pathOrderDraft,
  edgeLabelDraft,
  edgeLabelPending,
  edgeLabelError,
  compositionDraft,
  compositionPending,
  compositionError,
  candidateChooser,
  onSelectNode,
  onSelectEdge,
  onSelectPath,
  onMovePathDraftNode,
  onApplyPathOrderDraft,
  onEdgeLabelDraftChange,
  onResetEdgeLabelDraft,
  onClearEdgeLabelDraft,
  onApplyEdgeLabelDraft,
  onStartNodeDrag,
  onUpdateNodeDrag,
  onEndNodeDrag,
  onStartCanvasDrag,
  onUpdateCanvasDrag,
  onEndCanvasDrag,
  onStartRubberBand,
  onUpdateRubberBand,
  onEndRubberBand,
  onCancelRubberBand,
  onStartPointerEdge,
  onUpdatePointerEdge,
  onEndPointerEdge,
  onCancelPointerEdge,
  onOpenWorkspace,
  onAddObjectNode,
  onAddRawFileNode,
  onToggleCandidateSelection,
  onConfirmCandidateChooser,
  onCancelCandidateChooser,
  onMoveNode,
  onNudgeNodes,
  onUndoHistory,
  onRedoHistory,
  onApplyAutoLayout,
  onRemoveGraphItems,
  onClearSelection,
  onSetViewport,
  onTogglePanMode,
  onStartConnection,
  onSetActivePath,
  onCompositionDraftRowChange,
  onAddCompositionDraftRow,
  onRemoveCompositionDraftRow,
  onResetCompositionDraft,
  onApplyCompositionDraft,
}: GraphCanvasProps) {
  const { t } = useI18n()
  const nodeDragRef = useRef<NodeDragSession | null>(null)
  const canvasDragRef = useRef<CanvasDragSession | null>(null)
  const rubberBandRef = useRef<RubberBandSession | null>(null)
  const edgeDragRef = useRef<EdgeDragSession | null>(null)
  const minimapDragRef = useRef<MinimapDragSession | null>(null)
  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null)
  const [minimapDrag, setMinimapDrag] = useState<MinimapDragSession | null>(null)
  const ignoreNextNodeClickRef = useRef<string | null>(null)
  const workspace = state.workspace
  const graph = workspace?.graph
  const nodes = graph?.nodes ?? []
  const edges = graph?.edges ?? []
  const paths = graph?.paths ?? []
  const objectById = new Map(state.objects.map((object) => [object.id, object]))
  const activeObject = state.objects.find((object) => object.id === activeObjectId) ?? state.objects[0]
  const selectionSize = interactionState.selection.nodeIds.length
    + interactionState.selection.edgeIds.length
    + interactionState.selection.pathIds.length
  const singleSelectedNodeId = selectionSize === 1 ? interactionState.selection.nodeIds[0] : undefined
  const singleSelectedEdgeId = selectionSize === 1 ? interactionState.selection.edgeIds[0] : undefined
  const singleSelectedPathId = selectionSize === 1 ? interactionState.selection.pathIds[0] : undefined
  const selectedNodeIds = new Set(interactionState.selection.nodeIds)
  const selectedEdgeIds = new Set(interactionState.selection.edgeIds)
  const selectedPathIds = new Set(interactionState.selection.pathIds)
  const selectedNodeId = singleSelectedNodeId
  const selectedEdgeId = singleSelectedEdgeId
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId)
  const selectedEdgeSource = selectedEdge ? nodes.find((node) => node.id === edgeSource(selectedEdge)) : undefined
  const selectedEdgeTarget = selectedEdge ? nodes.find((node) => node.id === edgeTarget(selectedEdge)) : undefined
  const selectedEdgeSourceLabel = graphNodeDisplayName(selectedEdgeSource, objectById, t("graphCanvas.none"))
  const selectedEdgeTargetLabel = graphNodeDisplayName(selectedEdgeTarget, objectById, t("graphCanvas.none"))
  const selectedPathId = singleSelectedPathId
  const pendingConnectionFromId = interactionState.pendingEdge?.fromNodeId
  const graphReferences = {
    nodeIds: nodes.map((node) => node.id),
    edgeIds: edges.map((edge) => edge.id),
    pathIds: paths.map((path) => path.id),
  }
  const directEdgeGesture = resolveGraphEditorDirectEdgeGesture(interactionState, graphReferences)
  const pendingDirectEdgeTargetId = directEdgeGesture.kind === "connect" ? directEdgeGesture.toNodeId : null
  const viewport = normalizeGraphViewport(workspace?.viewport)
  const zoomPercent = Math.round(viewport.zoom * 100)
  const panActive = interactionState.mode === "pan"
  const canUseWorkspace = Boolean(state.sessionId)
  const canAddNode = canUseWorkspace && Boolean(activeObject)
  const canConnect = Boolean(singleSelectedNodeId)
  const canSetPath = nodes.length > 1
  const canRemoveSelection = selectionSize > 0
  const canApplyLayout = canUseWorkspace && nodes.length > 0 && autoLayoutStatus?.state !== "applying"
  const objectDropEnabled = canUseWorkspace && state.objects.length > 0
  const rubberBandRectangle = rubberBandRectangleFromInteractionState(interactionState)

  const handleZoom = (direction: "in" | "out") => {
    onSetViewport(zoomGraphViewport(viewport, direction))
  }

  const handleFitViewport = (element: HTMLElement) => {
    onSetViewport(fitGraphViewportToNodes(nodes, surfaceSizeFromElement(element)))
  }

  const handleApplyAutoLayout = () => {
    if (!graph) return
    onApplyAutoLayout(createGraphLayoutPlan({ graph }))
  }

  const handleKeyboardIntent = (event: KeyboardEvent<HTMLElement>) => {
    if (!canUseWorkspace || !isGraphKeyboardScopeTarget(event.target)) return
    const intent = resolveGraphEditorKeyboardIntent(event)
    if (!intent) return
    event.preventDefault()
    if (intent.kind === "undo-history") {
      onUndoHistory()
      return
    }
    if (intent.kind === "redo-history") {
      onRedoHistory()
      return
    }
    if (intent.kind === "delete-selection") {
      if (!canRemoveSelection) return
      onRemoveGraphItems({
        nodeIds: interactionState.selection.nodeIds,
        edgeIds: interactionState.selection.edgeIds,
        pathIds: interactionState.selection.pathIds,
      })
      return
    }
    if (intent.kind === "clear-selection") {
      onClearSelection()
      return
    }
    if (interactionState.selection.nodeIds.length === 0) return
    onNudgeNodes({
      nodeIds: interactionState.selection.nodeIds,
      delta: intent.delta,
    })
  }

  const handleCanvasWheel = (event: WheelEvent) => {
    const surface = canvasSurfaceRef.current
    if (!surface) return
    if (!event.target || !canUseWorkspace || nodes.length === 0 || !isCanvasViewportInputTarget(event.target)) return
    const surfacePoint = surfacePointFromClientPoint(surface, event.clientX, event.clientY)
    event.preventDefault()
    onSetViewport(zoomGraphViewportAtScreenPoint(
      viewport,
      surfaceSizeFromElement(surface),
      surfacePoint,
      event.deltaY,
      { ctrlOrMeta: event.ctrlKey || event.metaKey },
    ))
  }

  useEffect(() => {
    const surface = canvasSurfaceRef.current
    if (!surface) return undefined
    surface.addEventListener("wheel", handleCanvasWheel, { passive: false })
    return () => surface.removeEventListener("wheel", handleCanvasWheel)
  })

  const handleCanvasPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canUseWorkspace || event.button !== 0 || !isCanvasPanStartTarget(event.target)) return
    const origin = graphPointFromClientPoint(event.currentTarget, event.clientX, event.clientY, viewport)
    if (panActive) {
      canvasDragRef.current = {
        origin,
        dragging: false,
      }
    } else if (interactionState.mode === "select" && nodes.length > 0) {
      rubberBandRef.current = {
        origin,
        dragging: false,
        mode: event.shiftKey ? "add" : "replace",
      }
    } else {
      return
    }
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  const handleCanvasPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rubberBand = rubberBandRef.current
    if (rubberBand) {
      const current = graphPointFromClientPoint(event.currentTarget, event.clientX, event.clientY, viewport)
      if (!rubberBand.dragging && pointerDistance(rubberBand.origin, current) < 4) return
      if (!rubberBand.dragging) {
        rubberBand.dragging = true
        onStartRubberBand(rubberBand.origin, rubberBand.mode)
      }
      onUpdateRubberBand(current)
      event.preventDefault()
      return
    }
    const drag = canvasDragRef.current
    if (!drag) return
    const current = graphPointFromClientPoint(event.currentTarget, event.clientX, event.clientY, viewport)
    if (!drag.dragging && pointerDistance(drag.origin, current) < 4) return
    if (!drag.dragging) {
      drag.dragging = true
      onStartCanvasDrag(drag.origin)
    }
    onUpdateCanvasDrag(current)
    event.preventDefault()
  }

  const handleCanvasPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const rubberBand = rubberBandRef.current
    if (rubberBand) {
      const current = graphPointFromClientPoint(event.currentTarget, event.clientX, event.clientY, viewport)
      rubberBandRef.current = null
      if (rubberBand.dragging) {
        onEndRubberBand(
          nodeIdsInRubberBand(interactionState, nodes, rubberBand.origin, current, rubberBand.mode),
          rubberBand.mode,
        )
        event.preventDefault()
      }
      return
    }
    const drag = canvasDragRef.current
    if (!drag) return
    const current = graphPointFromClientPoint(event.currentTarget, event.clientX, event.clientY, viewport)
    canvasDragRef.current = null
    if (drag.dragging) {
      onEndCanvasDrag()
      onSetViewport(panGraphViewport(viewport, {
        x: current.x - drag.origin.x,
        y: current.y - drag.origin.y,
      }))
      event.preventDefault()
    }
  }

  const handleCanvasPointerCancel = () => {
    const drag = canvasDragRef.current
    const rubberBand = rubberBandRef.current
    canvasDragRef.current = null
    rubberBandRef.current = null
    if (drag?.dragging) onEndCanvasDrag()
    if (rubberBand?.dragging) onCancelRubberBand()
  }

  const setMinimapDragSession = (session: MinimapDragSession | null) => {
    minimapDragRef.current = session
    setMinimapDrag(session)
  }

  const handleMinimapPointerDown = (
    event: PointerEvent<HTMLDivElement>,
    geometry: GraphMinimapGeometry,
  ) => {
    if (!canUseWorkspace || event.button !== 0) return
    event.stopPropagation()
    const current = minimapPointFromClientPoint(event.currentTarget, event.clientX, event.clientY)
    const center = graphPointFromMinimapPoint(current, geometry)
    setMinimapDragSession({
      origin: current,
      current,
      geometry,
      center,
      dragging: false,
    })
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    event.preventDefault()
  }

  const handleMinimapPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = minimapDragRef.current
    if (!drag) return
    event.stopPropagation()
    const current = minimapPointFromClientPoint(event.currentTarget, event.clientX, event.clientY)
    setMinimapDragSession({
      ...drag,
      current,
      center: graphPointFromMinimapPoint(current, drag.geometry),
      dragging: drag.dragging || pointerDistance(drag.origin, current) >= 3,
    })
    event.preventDefault()
  }

  const handleMinimapPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = minimapDragRef.current
    if (!drag) return
    event.stopPropagation()
    const current = minimapPointFromClientPoint(event.currentTarget, event.clientX, event.clientY)
    setMinimapDragSession(null)
    onSetViewport(graphViewportFromMinimapPoint(viewport, current, drag.geometry))
    event.preventDefault()
  }

  const handleMinimapPointerCancel = () => {
    setMinimapDragSession(null)
  }

  const handleCanvasDragOver = (event: DragEvent<HTMLDivElement>) => {
    const acceptsRawFile = canUseWorkspace && hasGraphRawFileDropPayload(event.dataTransfer)
    const acceptsObject = objectDropEnabled && hasGraphObjectDragPayload(event.dataTransfer)
    if (!acceptsRawFile && !acceptsObject) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }

  const handleCanvasDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!canUseWorkspace) return
    const rawFileRequest = rawFileNodeRequestFromDrop(event, viewport)
    if (rawFileRequest) {
      event.preventDefault()
      void onAddRawFileNode(rawFileRequest)
      return
    }
    if (!objectDropEnabled) return
    const payload = parseGraphObjectDragPayload(event.dataTransfer.getData(graphObjectDragMimeType))
    if (!payload || !state.objects.some((object) => object.id === payload.objectId)) return
    event.preventDefault()
    onAddObjectNode({
      objectId: payload.objectId,
      position: canvasPositionFromDrop(event, viewport),
    })
  }

  const handleNodePointerDown = (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => {
    if (!canUseWorkspace || event.button !== 0) return
    const origin = pointFromPointerEvent(event, viewport)
    nodeDragRef.current = {
      nodeId: node.id,
      origin,
      nodeOrigin: graphNodePosition(node),
      dragging: false,
    }
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  const handleNodePointerMove = (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => {
    const drag = nodeDragRef.current
    if (!drag || drag.nodeId !== node.id) return
    const current = pointFromPointerEvent(event, viewport)
    if (!drag.dragging && pointerDistance(drag.origin, current) < 4) return
    if (!drag.dragging) {
      drag.dragging = true
      onStartNodeDrag(node.id, drag.origin)
    }
    onUpdateNodeDrag(current)
    event.preventDefault()
  }

  const handleNodePointerUp = (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => {
    const drag = nodeDragRef.current
    if (!drag || drag.nodeId !== node.id) return
    const current = pointFromPointerEvent(event, viewport)
    nodeDragRef.current = null
    if (drag.dragging) {
      ignoreNextNodeClickRef.current = node.id
      onEndNodeDrag()
      onMoveNode({
        nodeId: node.id,
        position: tuplePosition(moveGraphNodePosition(
          drag.nodeOrigin,
          { x: current.x - drag.origin.x, y: current.y - drag.origin.y },
        )),
      })
      event.preventDefault()
      return
    }
  }

  const handleNodeClick = (nodeId: string, event: MouseEvent<HTMLButtonElement>) => {
    if (ignoreNextNodeClickRef.current === nodeId) {
      ignoreNextNodeClickRef.current = null
      return
    }
    onSelectNode(nodeId, selectionModeFromMouseEvent(event))
  }

  const handleNodePointerCancel = (node: GraphNodeSummary) => {
    const drag = nodeDragRef.current
    if (!drag || drag.nodeId !== node.id) return
    nodeDragRef.current = null
    if (drag.dragging) onEndNodeDrag()
  }

  const handleEdgeHandlePointerDown = (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => {
    if (!canUseWorkspace || event.button !== 0) return
    event.stopPropagation()
    const position = pointFromPointerEvent(event, viewport)
    edgeDragRef.current = {
      fromNodeId: node.id,
    }
    onStartPointerEdge(node.id, position)
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    event.preventDefault()
  }

  const handleEdgeHandlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = edgeDragRef.current
    if (!drag) return
    event.stopPropagation()
    const position = pointFromPointerEvent(event, viewport)
    onUpdatePointerEdge(position, nodeIdFromPoint(event.clientX, event.clientY, nodes, drag.fromNodeId))
    event.preventDefault()
  }

  const handleEdgeHandlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = edgeDragRef.current
    if (!drag) return
    event.stopPropagation()
    edgeDragRef.current = null
    onEndPointerEdge(nodeIdFromPoint(event.clientX, event.clientY, nodes, drag.fromNodeId))
    event.preventDefault()
  }

  const handleEdgeHandlePointerCancel = () => {
    if (!edgeDragRef.current) return
    edgeDragRef.current = null
    onCancelPointerEdge()
  }

  return (
    <section className="graph-workspace" aria-label={t("graphCanvas.aria")} onKeyDown={handleKeyboardIntent}>
      <div className="graph-command-bar" aria-label={t("graphCanvas.commands")}>
        <button type="button" onClick={onOpenWorkspace} disabled={!canUseWorkspace}>
          <GitBranch size={16} />
          <span>{t("graphCanvas.openWorkspace")}</span>
        </button>
        <button type="button" onClick={() => onAddObjectNode()} disabled={!canAddNode}>
          <Plus size={16} />
          <span>{t("graphCanvas.addObjectNode")}</span>
        </button>
        <button type="button" onClick={onStartConnection} disabled={!canConnect}>
          <Link2 size={16} />
          <span>{t("graphCanvas.connect")}</span>
        </button>
        <button type="button" onClick={onSetActivePath} disabled={!canSetPath}>
          <Route size={16} />
          <span>{t("graphCanvas.setPath")}</span>
        </button>
        <button type="button" onClick={handleApplyAutoLayout} disabled={!canApplyLayout}>
          <LayoutDashboard size={16} />
          <span>{t("graphCanvas.applyLayout")}</span>
        </button>
        <button
          type="button"
          onClick={() => onRemoveGraphItems({
            nodeIds: interactionState.selection.nodeIds,
            edgeIds: interactionState.selection.edgeIds,
            pathIds: interactionState.selection.pathIds,
          })}
          disabled={!canRemoveSelection}
        >
          <Trash2 size={16} />
          <span>{t("graphCanvas.deleteSelected")}</span>
        </button>
      </div>
      {autoLayoutStatus && autoLayoutStatus.state !== "idle" ? (
        <LayoutStatus status={autoLayoutStatus} />
      ) : null}
      <HistoryStatus controls={historyControls} />

      <div className="graph-viewport-bar" aria-label={t("graphCanvas.viewportControls")}>
        <button
          type="button"
          onClick={onUndoHistory}
          disabled={!canUseWorkspace || !historyControls.canUndo || Boolean(historyControls.running)}
          title={historyControls.undoLabel ? t("graphCanvas.undoWithLabel", { label: historyControls.undoLabel }) : t("graphCanvas.undo")}
        >
          <Undo2 size={16} />
          <span>{t("graphCanvas.undo")}</span>
        </button>
        <button
          type="button"
          onClick={onRedoHistory}
          disabled={!canUseWorkspace || !historyControls.canRedo || Boolean(historyControls.running)}
          title={historyControls.redoLabel ? t("graphCanvas.redoWithLabel", { label: historyControls.redoLabel }) : t("graphCanvas.redo")}
        >
          <Redo2 size={16} />
          <span>{t("graphCanvas.redo")}</span>
        </button>
        <button
          type="button"
          onClick={onTogglePanMode}
          disabled={!canUseWorkspace}
          aria-pressed={panActive}
          className={panActive ? "graph-viewport-button--active" : ""}
          title={t("graphCanvas.pan")}
        >
          <Hand size={16} />
          <span>{t("graphCanvas.pan")}</span>
        </button>
        <button type="button" onClick={() => handleZoom("out")} disabled={!canUseWorkspace} title={t("graphCanvas.zoomOut")}>
          <ZoomOut size={16} />
          <span>{t("graphCanvas.zoomOut")}</span>
        </button>
        <output aria-label={t("graphCanvas.zoomValue", { value: zoomPercent })}>
          {t("graphCanvas.zoomValue", { value: zoomPercent })}
        </output>
        <button type="button" onClick={() => handleZoom("in")} disabled={!canUseWorkspace} title={t("graphCanvas.zoomIn")}>
          <ZoomIn size={16} />
          <span>{t("graphCanvas.zoomIn")}</span>
        </button>
        <button
          type="button"
          onClick={(event) => handleFitViewport(event.currentTarget.closest(".graph-workspace")?.querySelector(".graph-canvas-surface") as HTMLElement)}
          disabled={!canUseWorkspace || nodes.length === 0}
          title={t("graphCanvas.fitView")}
        >
          <Maximize2 size={16} />
          <span>{t("graphCanvas.fitView")}</span>
        </button>
        <button type="button" onClick={() => onSetViewport(resetGraphViewport())} disabled={!canUseWorkspace} title={t("graphCanvas.resetView")}>
          <RotateCcw size={16} />
          <span>{t("graphCanvas.resetView")}</span>
        </button>
      </div>

      <GraphMinimap
        nodes={nodes}
        viewport={viewport}
        zoomPercent={zoomPercent}
        canUseWorkspace={canUseWorkspace}
        drag={minimapDrag}
        onPointerDown={handleMinimapPointerDown}
        onPointerMove={handleMinimapPointerMove}
        onPointerUp={handleMinimapPointerUp}
        onPointerCancel={handleMinimapPointerCancel}
      />

      <div className="graph-canvas-layout">
        <div
          ref={canvasSurfaceRef}
          className={`graph-canvas-surface ${panActive ? "graph-canvas-surface--pan" : ""}`}
          aria-label={t("graphCanvas.surface")}
          tabIndex={canUseWorkspace ? 0 : undefined}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerCancel}
        >
          {nodes.length === 0 ? (
            <div className="graph-empty-state">
              <MousePointer2 size={22} />
              <strong>{t("graphCanvas.empty")}</strong>
              <span>{t("graphCanvas.emptyDetail")}</span>
            </div>
          ) : (
            <>
              <div className="graph-viewport-layer" style={{ transform: graphViewportCssTransform(viewport) }}>
                <GraphEdgeLayer
                  nodes={nodes}
                  edges={edges}
                  objectById={objectById}
                  selectedEdgeIds={selectedEdgeIds}
                  pendingEdge={interactionState.pendingEdge}
                  onSelectEdge={onSelectEdge}
                />
                {rubberBandRectangle ? (
                  <div
                    className="graph-rubber-band"
                    aria-hidden="true"
                    style={rubberBandStyle(rubberBandRectangle)}
                  />
                ) : null}
                <div className="graph-node-layer">
                  {nodes.map((node) => (
                    <GraphNodeButton
                      key={node.id}
                      node={node}
                      summary={canvasChemicalNodeSummary(node, state.objects)}
                      selected={selectedNodeIds.has(node.id)}
                      pending={node.id === pendingConnectionFromId}
                      pendingTarget={node.id === pendingDirectEdgeTargetId}
                      activePath={isNodeInActivePath(node.id, workspace?.active_path_id, paths)}
                      dragging={isDraggingNode(interactionState, node.id)}
                      draggingPosition={draggingNodePosition(interactionState, node)}
                      onPointerDown={handleNodePointerDown}
                      onPointerMove={handleNodePointerMove}
                      onPointerUp={handleNodePointerUp}
                      onPointerCancel={handleNodePointerCancel}
                      onEdgeHandlePointerDown={handleEdgeHandlePointerDown}
                      onEdgeHandlePointerMove={handleEdgeHandlePointerMove}
                      onEdgeHandlePointerUp={handleEdgeHandlePointerUp}
                      onEdgeHandlePointerCancel={handleEdgeHandlePointerCancel}
                      onClick={handleNodeClick}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
          {candidateChooser ? (
            <ParseCandidateChooser
              state={candidateChooser}
              onToggleSelection={onToggleCandidateSelection}
              onConfirm={onConfirmCandidateChooser}
              onCancel={onCancelCandidateChooser}
            />
          ) : null}
        </div>

        <aside className="network-preview-panel" aria-label={t("graphCanvas.preview")}>
          <p className="section-kicker">{t("graphCanvas.preview")}</p>
          <dl className="network-preview-grid">
            <div>
              <dt>{t("graphCanvas.nodes")}</dt>
              <dd>{workspace?.preview.node_count ?? 0}</dd>
            </div>
            <div>
              <dt>{t("graphCanvas.edges")}</dt>
              <dd>{workspace?.preview.edge_count ?? 0}</dd>
            </div>
            <div>
              <dt>{t("graphCanvas.paths")}</dt>
              <dd>{workspace?.preview.path_count ?? 0}</dd>
            </div>
          </dl>
          <PreviewValue
            label={t("graphCanvas.activePath")}
            value={activePathDisplayName(workspace?.active_path_id, paths, nodes, objectById, t("graphCanvas.none"))}
          />
          <PathAuthoringStatusNotice status={pathAuthoringStatus} />
          <EdgeLabelEditor
            edge={selectedEdge}
            sourceLabel={selectedEdgeSourceLabel}
            targetLabel={selectedEdgeTargetLabel}
            draft={edgeLabelDraft}
            pending={edgeLabelPending}
            error={edgeLabelError}
            onDraftChange={onEdgeLabelDraftChange}
            onReset={onResetEdgeLabelDraft}
            onClear={onClearEdgeLabelDraft}
            onApply={onApplyEdgeLabelDraft}
          />
          <PathList
            paths={paths}
            nodes={nodes}
            objects={state.objects}
            activePathId={workspace?.active_path_id}
            selectedPathId={selectedPathId}
            selectedPathIds={selectedPathIds}
            pathOrderDraft={pathOrderDraft}
            onSelectPath={onSelectPath}
            onMovePathDraftNode={onMovePathDraftNode}
            onApplyPathOrderDraft={onApplyPathOrderDraft}
          />
          <PreviewWarnings
            disconnectedNodeIds={workspace?.preview.disconnected_node_ids ?? []}
            nodes={nodes}
            objectById={objectById}
          />
          <NodeCompositionEditor
            draft={compositionDraft}
            objects={state.objects}
            pending={compositionPending}
            error={compositionError}
            onRowChange={onCompositionDraftRowChange}
            onAddRow={onAddCompositionDraftRow}
            onRemoveRow={onRemoveCompositionDraftRow}
            onReset={onResetCompositionDraft}
            onApply={onApplyCompositionDraft}
          />
        </aside>
      </div>
    </section>
  )
}

function ParseCandidateChooser({
  state,
  onToggleSelection,
  onConfirm,
  onCancel,
}: {
  state: ParseCandidateChooserState
  onToggleSelection: (candidateId: string, selected: boolean) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const selectedCandidateIds = new Set(state.selectedCandidateIds)
  const selectedCount = state.candidates.filter((candidate) => selectedCandidateIds.has(candidate.candidate_id)).length
  const busy = state.status === "registering" || state.status === "adding-nodes"
  return (
    <section
      className={`parse-candidate-chooser parse-candidate-chooser--${state.status}`}
      aria-label={t("graphCanvas.candidateChooser.aria")}
      style={parseCandidateChooserStyle(state.position)}
    >
      <div className="parse-candidate-chooser-header">
        <div>
          <p className="section-kicker">{t("graphCanvas.candidateChooser.section")}</p>
          <h3>{t("graphCanvas.candidateChooser.title")}</h3>
        </div>
        <span>{parseCandidateChooserStatusLabel(state.status, t)}</span>
      </div>
      <div className="parse-candidate-chooser-source">
        <span>{t("graphCanvas.candidateChooser.file")}</span>
        <code>{userFacingText(state.rawFilePath) ?? state.rawFilePath}</code>
        <small>{t("graphCanvas.candidateChooser.count", { count: state.candidates.length })}</small>
      </div>
      <ul className="parse-candidate-list">
        {state.candidates.map((candidate) => (
          <li
            key={candidate.candidate_id}
            className={`parse-candidate-card ${selectedCandidateIds.has(candidate.candidate_id) ? "parse-candidate-card--selected" : ""}`}
          >
            <div className="parse-candidate-title">
              <label>
                <input
                  type="checkbox"
                  checked={selectedCandidateIds.has(candidate.candidate_id)}
                  disabled={busy}
                  onChange={(event) => onToggleSelection(candidate.candidate_id, event.currentTarget.checked)}
                  aria-label={t("graphCanvas.candidateChooser.selectCandidate", { label: candidate.label })}
                />
                <strong>{candidate.label}</strong>
              </label>
            </div>
            <dl className="parse-candidate-grid">
              <CandidateValue
                label={t("graphCanvas.candidateChooser.index")}
                value={String(candidate.object_index)}
              />
              <CandidateValue
                label={t("graphCanvas.candidateChooser.formula")}
                value={candidate.formula ?? t("graphCanvas.none")}
              />
              <CandidateValue
                label={t("graphCanvas.candidateChooser.chargeSpin")}
                value={formatCandidateChargeSpin(candidate, t)}
              />
              <CandidateValue
                label={t("graphCanvas.candidateChooser.method")}
                value={candidate.method ?? t("graphCanvas.none")}
              />
              <CandidateValue
                label={t("graphCanvas.candidateChooser.energy")}
                value={formatCandidateDisplayEnergy(candidate, t)}
              />
              <CandidateValue
                label={t("graphCanvas.candidateChooser.coordinates")}
                value={formatCandidateCoordinatePreview(candidate, t)}
              />
            </dl>
            {candidate.warnings.length > 0 ? (
              <div className="parse-candidate-warning-row">
                <span>{t("graphCanvas.candidateChooser.warnings")}</span>
                {candidate.warnings.map((warning) => (
                  <code key={`${candidate.candidate_id}:${warning.code}:${warning.target ?? ""}`}>
                    {warning.code}
                  </code>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {state.error ? (
        <p className="parse-candidate-error" role="alert">
          <code>{state.error.code}</code>
          <span>{state.error.message}</span>
          {warningTargetDisplay(state.error) ? <small>{warningTargetDisplay(state.error)}</small> : null}
        </p>
      ) : null}
      <div className="parse-candidate-command-row">
        <button type="button" onClick={onCancel} disabled={busy}>
          <XCircle size={15} />
          <span>{t("graphCanvas.candidateChooser.cancel")}</span>
        </button>
        <button type="button" onClick={onConfirm} disabled={busy || selectedCount === 0}>
          <Check size={15} />
          <span>{parseCandidateChooserConfirmLabel(state.status, selectedCount, t)}</span>
        </button>
      </div>
    </section>
  )
}

function parseCandidateChooserConfirmLabel(
  status: ParseCandidateChooserState["status"],
  selectedCount: number,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (status === "registering") return t("graphCanvas.candidateChooser.registering")
  if (status === "adding-nodes") return t("graphCanvas.candidateChooser.addingNodes")
  return t("graphCanvas.candidateChooser.confirm", { count: selectedCount })
}

function CandidateValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function formatCandidateChargeSpin(
  candidate: ParseCandidateSummary,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const charge = candidate.charge ?? t("graphCanvas.none")
  const spin = candidate.spin_multiplicity ?? t("graphCanvas.none")
  return t("graphCanvas.candidateChooser.chargeSpinValue", { charge, spin })
}

function formatCandidateDisplayEnergy(
  candidate: ParseCandidateSummary,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const energy = candidate.display_energy
  if (!energy) return t("graphCanvas.none")
  return `${energy.key} ${energy.value} ${energy.unit}`
}

function formatCandidateCoordinatePreview(
  candidate: ParseCandidateSummary,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const preview = candidate.coordinate_preview
  if (!preview || preview.preview_kind === "unavailable") return t("graphCanvas.none")
  const elements = preview.elements.length > 0 ? preview.elements.join(" ") : t("graphCanvas.none")
  const dimensionality = preview.has3d
    ? t("graphCanvas.candidateChooser.has3d")
    : t("graphCanvas.candidateChooser.no3d")
  return t("graphCanvas.candidateChooser.coordinateValue", {
    count: preview.atom_count,
    elements,
    dimensionality,
  })
}

function parseCandidateChooserStyle(position: [number, number]) {
  const cssPosition = graphNodeCssPosition({ x: position[0], y: position[1] })
  const horizontalAnchor = position[0] > graphNodeLayoutBounds.width * 0.58 ? "-100%" : "0"
  const verticalAnchor = position[1] > graphNodeLayoutBounds.height * 0.58 ? "-100%" : "0"
  return {
    ...cssPosition,
    transform: `translate(${horizontalAnchor}, ${verticalAnchor})`,
  }
}

function parseCandidateChooserStatusLabel(
  status: ParseCandidateChooserState["status"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (status) {
    case "registering":
      return t("graphCanvas.candidateChooser.status.registering")
    case "adding-nodes":
      return t("graphCanvas.candidateChooser.status.addingNodes")
    case "error":
      return t("graphCanvas.candidateChooser.status.error")
    case "choosing":
    default:
      return t("graphCanvas.candidateChooser.status.choosing")
  }
}

function HistoryStatus({ controls }: { controls: GraphHistoryControls }) {
  const { t } = useI18n()
  if (controls.error) {
    return (
      <div className="graph-history-status graph-history-status--error" role="alert">
        <strong>{t("graphCanvas.historyError")}</strong>
        <span>{controls.error.message}</span>
        {warningTargetDisplay(controls.error) ? <small>{warningTargetDisplay(controls.error)}</small> : null}
      </div>
    )
  }
  if (!controls.running) return null
  return (
    <div className="graph-history-status">
      <strong>{controls.running === "undo" ? t("graphCanvas.undoing") : t("graphCanvas.redoing")}</strong>
      <span>{controls.running === "undo" ? controls.undoLabel : controls.redoLabel}</span>
    </div>
  )
}

function LayoutStatus({ status }: { status: GraphAutoLayoutStatus }) {
  const { t } = useI18n()
  const warning = status.warnings?.[0]
  return (
    <div className={`graph-layout-status graph-layout-status--${status.state}`}>
      <strong>{graphLayoutStatusLabel(status.state, t)}</strong>
      {status.message ? <span>{status.message}</span> : null}
      {warning ? (
        <small>
          <code>{warning.code}</code>
          {warning.message}
        </small>
      ) : null}
    </div>
  )
}

function graphLayoutStatusLabel(
  state: GraphAutoLayoutStatus["state"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (state) {
    case "applying":
      return t("graphCanvas.layoutStatus.applying")
    case "success":
      return t("graphCanvas.layoutStatus.success")
    case "noop":
      return t("graphCanvas.layoutStatus.noop")
    case "error":
      return t("graphCanvas.layoutStatus.error")
    case "idle":
    default:
      return t("graphCanvas.layoutStatus.idle")
  }
}

type NodeDragSession = {
  nodeId: string
  origin: CanvasPoint
  nodeOrigin: GraphNodeLayoutPosition
  dragging: boolean
}

type CanvasDragSession = {
  origin: CanvasPoint
  dragging: boolean
}

type RubberBandSession = {
  origin: CanvasPoint
  dragging: boolean
  mode: "replace" | "add"
}

type EdgeDragSession = {
  fromNodeId: string
}

type MinimapDragSession = {
  origin: CanvasPoint
  current: CanvasPoint
  geometry: GraphMinimapGeometry
  center: CanvasPoint
  dragging: boolean
}

function GraphMinimap({
  nodes,
  viewport,
  zoomPercent,
  canUseWorkspace,
  drag,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  nodes: GraphNodeSummary[]
  viewport: GraphViewport
  zoomPercent: number
  canUseWorkspace: boolean
  drag: MinimapDragSession | null
  onPointerDown: (event: PointerEvent<HTMLDivElement>, geometry: GraphMinimapGeometry) => void
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void
  onPointerCancel: () => void
}) {
  const { t } = useI18n()
  const geometry = createGraphMinimapGeometry(nodes, viewport, graphMinimapSize)
  if (!geometry) return null
  const draftWindow = drag
    ? graphMinimapViewportWindow(graphViewportFromMinimapCenter(viewport, drag.center), drag.geometry)
    : null

  return (
    <div className="graph-minimap-panel" aria-label={t("graphCanvas.minimapAria")}>
      <div className="graph-minimap-header">
        <strong>{t("graphCanvas.minimap")}</strong>
        <output aria-label={t("graphCanvas.minimapZoomAria", { value: zoomPercent })}>
          {t("graphCanvas.minimapZoomValue", { value: zoomPercent })}
        </output>
      </div>
      <div
        className="graph-minimap"
        role="button"
        aria-label={t("graphCanvas.minimapNavigate")}
        tabIndex={canUseWorkspace ? 0 : undefined}
        data-testid="graph-minimap"
        onPointerDown={(event) => onPointerDown(event, geometry)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div className="graph-minimap-bounds" style={minimapBoundsStyle(geometry)} />
        {geometry.nodes.map((node) => (
          <span
            key={node.id}
            className="graph-minimap-node"
            style={{ left: `${node.x}px`, top: `${node.y}px` }}
            aria-hidden="true"
          />
        ))}
        <div
          className="graph-minimap-window"
          style={minimapRectStyle(geometry.viewportWindow)}
          aria-hidden="true"
        />
        {draftWindow ? (
          <div
            className="graph-minimap-window graph-minimap-window--draft"
            style={minimapRectStyle(draftWindow)}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  )
}

function hasGraphObjectDragPayload(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(graphObjectDragMimeType)
}

function hasGraphRawFileDropPayload(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types)
  return types.includes(graphRawFileDropMimeType) || types.includes("Files")
}

function rawFileNodeRequestFromDrop(
  event: DragEvent<HTMLDivElement>,
  viewport: GraphViewport,
): AddRawFileNodeRequest | null {
  const position = canvasPositionFromDrop(event, viewport)
  const projectFilePayload = parseGraphRawFileDropPayload(event.dataTransfer.getData(graphRawFileDropMimeType))
  if (projectFilePayload?.kind === "project-file") {
    return {
      source: {
        kind: "project-file",
        projectFileId: projectFilePayload.projectFileId,
        path: projectFilePayload.path,
      },
      position,
    }
  }
  const file = firstDataTransferFile(event.dataTransfer)
  if (file) {
    return {
      source: { kind: "external-file", file },
      position,
    }
  }
  return null
}

function firstDataTransferFile(dataTransfer: DataTransfer): File | null {
  const files = dataTransfer.files
  if (!files || files.length === 0) return null
  return files.item(0) ?? files[0] ?? null
}

function isCanvasPanStartTarget(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement) && !(target instanceof SVGElement)) return false
  return !target.closest(".graph-node-card, .graph-edge-connect-handle, .graph-edge-hitbox, .graph-path-select, .parse-candidate-chooser")
}

function isGraphKeyboardScopeTarget(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement) && !(target instanceof SVGElement)) return false
  return Boolean(target.closest(".graph-canvas-surface, .graph-node-card, .graph-edge-hitbox, .graph-path-select"))
}

function isCanvasViewportInputTarget(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement) && !(target instanceof SVGElement)) return false
  return Boolean(target.closest(".graph-canvas-surface")) && !target.closest(".parse-candidate-chooser")
}

function canvasPositionFromDrop(event: DragEvent<HTMLDivElement>, viewport: GraphViewport): [number, number] {
  return tuplePosition(canvasPointToGraphNodePosition(
    graphPointFromClientPoint(event.currentTarget, event.clientX, event.clientY, viewport),
  ))
}

function pointFromPointerEvent(event: PointerEvent<HTMLElement>, viewport: GraphViewport): CanvasPoint {
  const surface = event.currentTarget.closest(".graph-canvas-surface") as HTMLElement | null
  if (!surface) {
    return canvasPointToGraphNodePosition({ x: event.clientX, y: event.clientY })
  }
  return canvasPointToGraphNodePosition(graphPointFromClientPoint(surface, event.clientX, event.clientY, viewport))
}

function graphPointFromClientPoint(
  surface: HTMLElement,
  clientX: number,
  clientY: number,
  viewport: GraphViewport,
): GraphNodeLayoutPosition {
  const rect = surface.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: clientX, y: clientY }
  }
  const surfacePoint = {
    x: clamp(clientX - rect.left, 0, rect.width),
    y: clamp(clientY - rect.top, 0, rect.height),
  }
  return screenPointToGraphPoint(surfacePoint, surfaceSizeFromElement(surface), viewport)
}

function surfacePointFromClientPoint(
  surface: HTMLElement,
  clientX: number,
  clientY: number,
): GraphNodeLayoutPosition {
  const rect = surface.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return { x: clientX, y: clientY }
  return {
    x: clamp(clientX - rect.left, 0, rect.width),
    y: clamp(clientY - rect.top, 0, rect.height),
  }
}

function surfaceSizeFromElement(element: HTMLElement | null): GraphSurfaceSize {
  const rect = element?.getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return {
      width: graphNodeLayoutBounds.width,
      height: graphNodeLayoutBounds.height,
    }
  }
  return {
    width: rect.width,
    height: rect.height,
  }
}

const graphMinimapSize = {
  width: 180,
  height: 108,
}

function minimapPointFromClientPoint(
  element: HTMLElement,
  clientX: number,
  clientY: number,
): CanvasPoint {
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return { x: clientX, y: clientY }
  return {
    x: clamp(((clientX - rect.left) / rect.width) * graphMinimapSize.width, 0, graphMinimapSize.width),
    y: clamp(((clientY - rect.top) / rect.height) * graphMinimapSize.height, 0, graphMinimapSize.height),
  }
}

function graphMinimapViewportWindow(
  viewport: GraphViewport,
  geometry: GraphMinimapGeometry,
): GraphMinimapRect {
  return {
    left: viewport.x * geometry.scale + geometry.offset.x,
    top: viewport.y * geometry.scale + geometry.offset.y,
    width: (graphNodeLayoutBounds.width / viewport.zoom) * geometry.scale,
    height: (graphNodeLayoutBounds.height / viewport.zoom) * geometry.scale,
  }
}

function minimapRectStyle(rect: GraphMinimapRect) {
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
}

function minimapBoundsStyle(geometry: GraphMinimapGeometry) {
  const bounds = geometry.graphBounds
  return minimapRectStyle({
    left: bounds.left * geometry.scale + geometry.offset.x,
    top: bounds.top * geometry.scale + geometry.offset.y,
    width: (bounds.right - bounds.left) * geometry.scale,
    height: (bounds.bottom - bounds.top) * geometry.scale,
  })
}

function selectionModeFromMouseEvent(event: MouseEvent<HTMLElement>): GraphEditorSelectionMode {
  return event.shiftKey ? "toggle" : "replace"
}

function rubberBandRectangleFromInteractionState(
  interactionState: GraphEditorInteractionState,
): ReturnType<typeof graphEditorRubberBandRectangle> | null {
  const dragging = interactionState.dragging
  if (!dragging || dragging.kind !== "rubber-band") return null
  return graphEditorRubberBandRectangle(dragging.origin, dragging.current)
}

function rubberBandStyle(rectangle: ReturnType<typeof graphEditorRubberBandRectangle>) {
  return {
    left: `${(rectangle.left / graphNodeLayoutBounds.width) * 100}%`,
    top: `${(rectangle.top / graphNodeLayoutBounds.height) * 100}%`,
    width: `${((rectangle.right - rectangle.left) / graphNodeLayoutBounds.width) * 100}%`,
    height: `${((rectangle.bottom - rectangle.top) / graphNodeLayoutBounds.height) * 100}%`,
  }
}

function nodeIdsInRubberBand(
  interactionState: GraphEditorInteractionState,
  nodes: GraphNodeSummary[],
  origin: CanvasPoint,
  current: CanvasPoint,
  mode: "replace" | "add",
): string[] {
  return resolveGraphEditorRubberBandNodeIds(
    {
      ...interactionState,
      dragging: { kind: "rubber-band", origin, current, mode },
    },
    nodes.map((node) => ({ id: node.id, position: graphNodePosition(node) })),
  )
}

function GraphNodeButton({
  node,
  summary,
  selected,
  pending,
  pendingTarget,
  activePath,
  dragging,
  draggingPosition,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onEdgeHandlePointerDown,
  onEdgeHandlePointerMove,
  onEdgeHandlePointerUp,
  onEdgeHandlePointerCancel,
  onClick,
}: {
  node: GraphNodeSummary
  summary: CanvasChemicalNodeSummary
  selected: boolean
  pending: boolean
  pendingTarget: boolean
  activePath: boolean
  dragging: boolean
  draggingPosition?: GraphNodeLayoutPosition
  onPointerDown: (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (node: GraphNodeSummary) => void
  onEdgeHandlePointerDown: (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => void
  onEdgeHandlePointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onEdgeHandlePointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onEdgeHandlePointerCancel: () => void
  onClick: (nodeId: string, event: MouseEvent<HTMLButtonElement>) => void
}) {
  const { t } = useI18n()
  const position = graphNodeCssPosition(draggingPosition ?? graphNodePosition(node))
  return (
    <div
      className={`graph-node-card-shell ${dragging ? "graph-node-card-shell--dragging" : ""}`}
      style={position}
      data-graph-node-id={node.id}
    >
      <button
        type="button"
        className={`graph-node-card ${selected ? "graph-node-card--selected" : ""} ${pending ? "graph-node-card--pending" : ""} ${pendingTarget ? "graph-node-card--pending-target" : ""} ${activePath ? "graph-node-card--path" : ""} ${dragging ? "graph-node-card--dragging" : ""}`}
        data-graph-node-id={node.id}
        onPointerDown={(event) => onPointerDown(node, event)}
        onPointerMove={(event) => onPointerMove(node, event)}
        onPointerUp={(event) => onPointerUp(node, event)}
        onPointerCancel={() => onPointerCancel(node)}
        onClick={(event) => onClick(node.id, event)}
        aria-current={selected ? "true" : undefined}
      >
        <span className="graph-node-title-row">
          <span>{summary.structureName}</span>
          {summary.warnings.length > 0 ? (
            <span
              className="graph-node-warning-dot"
              title={t("graphCanvas.node.warningCount", { count: summary.warnings.length })}
              aria-label={t("graphCanvas.node.warningCount", { count: summary.warnings.length })}
            />
          ) : null}
        </span>
        {summary.geometry.length > 0 ? (
          <Molecule3DViewer atoms={summary.geometry} label={summary.structureName} />
        ) : (
          <span className="graph-node-structure-empty">{t("graphCanvas.node.noStructure")}</span>
        )}
        <span className="graph-node-metrics">
          <GraphNodeDetail label={t("graphCanvas.node.energy")} value={formatNodeEnergyValue(summary, t)} />
          <GraphNodeDetail label={t("graphCanvas.node.charge")} value={formatNullableNumber(summary.charge, t)} />
          <GraphNodeDetail label={t("graphCanvas.node.spin")} value={formatNullableNumber(summary.spinMultiplicity, t)} />
        </span>
        {summary.formula ? (
          <span className="graph-node-formula" title={summary.formula}>
            {summary.formula}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        className="graph-edge-connect-handle"
        aria-label={t("graphCanvas.edgeHandle", { node: summary.structureName })}
        title={t("graphCanvas.edgeHandle", { node: summary.structureName })}
        data-graph-node-id={node.id}
        onPointerDown={(event) => onEdgeHandlePointerDown(node, event)}
        onPointerMove={(event) => onEdgeHandlePointerMove(event)}
        onPointerUp={(event) => onEdgeHandlePointerUp(event)}
        onPointerCancel={onEdgeHandlePointerCancel}
      >
        <Link2 size={14} />
      </button>
    </div>
  )
}

function GraphNodeDetail({ label, value }: { label: string; value: string }) {
  return (
    <span className="graph-node-metric-pill">
      <small>{label}</small>
      <b>{value}</b>
    </span>
  )
}

function canvasChemicalNodeSummary(
  node: GraphNodeSummary,
  objects: ObjectSummary[],
): CanvasChemicalNodeSummary {
  const composition = nodeCompositionTerms(node)
  const objectIds = uniqueStrings([
    ...composition.map((term) => term.object_id),
    ...(node.chemical_object_ids ?? []),
  ])
  const objectById = new Map(objects.map((object) => [object.id, object]))
  const nodeObjects = objectIds
    .map((objectId) => objectById.get(objectId))
    .filter((object): object is ObjectSummary => Boolean(object))
  const primaryObject = nodeObjects[0]
  const structureName = firstUserFacingName([
    primaryObject?.label,
    node.label,
    primaryObject?.source_file_id,
    node.id,
  ])
  return {
    nodeId: node.id,
    structureName,
    formula: summarizeNodeFormula(nodeObjects),
    charge: summarizeSharedNumber(nodeObjects.map((object) => object.charge)),
    spinMultiplicity: summarizeSharedNumber(nodeObjects.map((object) => object.spin_multiplicity)),
    displayEnergy: summarizeNodeDisplayEnergy(nodeObjects),
    geometry: summarizeNodeGeometry(nodeObjects),
    warnings: nodeObjects.flatMap((object) => object.warnings ?? []),
  }
}

function nodeCompositionTerms(node: GraphNodeSummary): Array<{ object_id: string; coefficient?: number }> {
  return node.composition?.length
    ? node.composition
    : (node.chemical_object_ids ?? []).map((objectId) => ({ object_id: objectId, coefficient: 1 }))
}

function summarizeNodeFormula(objects: ObjectSummary[]): string | null {
  const formulas = uniqueStrings(objects.map((object) => object.formula).filter((value): value is string => Boolean(value)))
  if (formulas.length === 0) return null
  return formulas.join(" + ")
}

function summarizeSharedNumber(values: Array<number | null | undefined>): number | null {
  const present = values.filter((value): value is number => typeof value === "number")
  if (present.length === 0) return null
  return present.every((value) => value === present[0]) ? present[0] : null
}

function summarizeNodeDisplayEnergy(objects: ObjectSummary[]): CanvasChemicalNodeSummary["displayEnergy"] {
  for (const object of objects) {
    if (object.display_energy) {
      return {
        key: object.display_energy.key,
        source: object.display_energy.source,
        value: object.display_energy.value,
        unit: object.display_energy.unit,
      }
    }
    const channel = object.energy_channels?.[0]
    if (channel) {
      return {
        key: channel.key,
        source: channel.source,
        value: null,
        unit: channel.unit,
      }
    }
  }
  return null
}

function summarizeNodeGeometry(objects: ObjectSummary[]): Atom3DSummary[] {
  for (const object of objects) {
    const geometry = object.geometry?.filter(isRenderableAtom3D) ?? []
    if (geometry.length > 0) return geometry
  }
  return []
}

function isRenderableAtom3D(atom: Atom3DSummary): atom is Atom3DSummary {
  return Boolean(atom.element)
    && Number.isFinite(atom.x)
    && Number.isFinite(atom.y)
    && Number.isFinite(atom.z)
}

function formatNodeEnergyValue(
  summary: CanvasChemicalNodeSummary,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const energy = summary.displayEnergy
  if (!energy) return t("graphCanvas.node.energyMissing")
  if (typeof energy.value === "number") return `${formatShortNumber(energy.value)} ${energy.unit}`
  return energy.unit
}

function formatNullableNumber(
  value: number | null | undefined,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return typeof value === "number" ? String(value) : t("graphCanvas.none")
}

function formatShortNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (Math.abs(value) >= 1000 || Math.abs(value) < 0.001) return value.toExponential(4)
  return Number(value.toFixed(6)).toString()
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function draggingNodePosition(
  interactionState: GraphEditorInteractionState,
  node: GraphNodeSummary,
): GraphNodeLayoutPosition | undefined {
  const dragging = interactionState.dragging
  if (!dragging || dragging.kind !== "node" || !dragging.nodeIds.includes(node.id)) return undefined
  const nodeOrigin = graphNodePosition(node)
  return moveGraphNodePosition(nodeOrigin, {
    x: dragging.current.x - dragging.origin.x,
    y: dragging.current.y - dragging.origin.y,
  })
}

function isDraggingNode(interactionState: GraphEditorInteractionState, nodeId: string): boolean {
  const dragging = interactionState.dragging
  return Boolean(dragging && dragging.kind === "node" && dragging.nodeIds.includes(nodeId))
}

function GraphEdgeLayer({
  nodes,
  edges,
  objectById,
  selectedEdgeIds,
  pendingEdge,
  onSelectEdge,
}: {
  nodes: GraphNodeSummary[]
  edges: GraphEdgeSummary[]
  objectById: Map<string, ObjectSummary>
  selectedEdgeIds: Set<string>
  pendingEdge?: PendingEdgeDraft | null
  onSelectEdge: (edgeId: string, mode?: GraphEditorSelectionMode) => void
}) {
  const segments = edges.map((edge) => {
    const source = nodes.find((node) => node.id === edgeSource(edge))
    const target = nodes.find((node) => node.id === edgeTarget(edge))
    if (!source || !target) return null
    const from = graphNodePosition(source)
    const to = graphNodePosition(target)
    return {
      id: edge.id,
      from,
      to,
      sourceLabel: graphNodeDisplayName(source, objectById),
      targetLabel: graphNodeDisplayName(target, objectById),
      label: edge.label ?? null,
    }
  }).filter(Boolean) as Array<{
    id: string
    from: { x: number; y: number }
    to: { x: number; y: number }
    sourceLabel: string
    targetLabel: string
    label: string | null
  }>
  const pendingSegment = pendingEdgeSegment(nodes, pendingEdge ?? null)

  return (
    <div className="graph-edge-layer" aria-label="Graph edges">
      <svg className="graph-edge-svg" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
        {pendingSegment ? (
          <g className="graph-edge-pending">
            <line
              className="graph-edge-pending-line"
              x1={(pendingSegment.from.x / graphNodeLayoutBounds.width) * 100}
              y1={(pendingSegment.from.y / graphNodeLayoutBounds.height) * 100}
              x2={(pendingSegment.to.x / graphNodeLayoutBounds.width) * 100}
              y2={(pendingSegment.to.y / graphNodeLayoutBounds.height) * 100}
            />
            <circle
              className="graph-edge-pending-end"
              cx={(pendingSegment.to.x / graphNodeLayoutBounds.width) * 100}
              cy={(pendingSegment.to.y / graphNodeLayoutBounds.height) * 100}
              r="1.5"
            />
          </g>
        ) : null}
        {segments.map((segment) => (
          <g key={segment.id} className={selectedEdgeIds.has(segment.id) ? "graph-edge--selected" : ""}>
            <line
              className="graph-edge-line"
              x1={(segment.from.x / graphNodeLayoutBounds.width) * 100}
              y1={(segment.from.y / graphNodeLayoutBounds.height) * 100}
              x2={(segment.to.x / graphNodeLayoutBounds.width) * 100}
              y2={(segment.to.y / graphNodeLayoutBounds.height) * 100}
            />
            <circle
              cx={(segment.to.x / graphNodeLayoutBounds.width) * 100}
              cy={(segment.to.y / graphNodeLayoutBounds.height) * 100}
              r="1.5"
            />
            {segment.label ? (
              <text
                className="graph-edge-svg-label"
                x={(((segment.from.x + segment.to.x) / 2) / graphNodeLayoutBounds.width) * 100}
                y={(((segment.from.y + segment.to.y) / 2) / graphNodeLayoutBounds.height) * 100}
              >
                {segment.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      {segments.map((segment) => {
        const selected = selectedEdgeIds.has(segment.id)
        return (
          <button
            key={segment.id}
            type="button"
            aria-label={`Edge ${segment.sourceLabel} to ${segment.targetLabel}${segment.label ? `: ${segment.label}` : ""}`}
            className={`graph-edge-hitbox ${selected ? "graph-edge-hitbox--selected" : ""}`}
            style={edgeHitboxStyle(segment.from, segment.to)}
            onClick={(event) => {
              event.stopPropagation()
              onSelectEdge(segment.id, selectionModeFromMouseEvent(event))
            }}
          />
        )
      })}
    </div>
  )
}

function pendingEdgeSegment(
  nodes: GraphNodeSummary[],
  pendingEdge: PendingEdgeDraft | null,
): { from: GraphNodeLayoutPosition; to: GraphNodeLayoutPosition } | null {
  if (!pendingEdge || pendingEdge.source !== "pointer") return null
  const source = nodes.find((node) => node.id === pendingEdge.fromNodeId)
  if (!source) return null
  const target = pendingEdge.targetNodeId
    ? nodes.find((node) => node.id === pendingEdge.targetNodeId)
    : undefined
  const to = target ? graphNodePosition(target) : pendingEdge.pointerGraphPosition
  if (!to) return null
  return {
    from: graphNodePosition(source),
    to,
  }
}

function nodeIdFromPoint(
  clientX: number,
  clientY: number,
  nodes: GraphNodeSummary[],
  fallbackNodeId?: string,
): string | null {
  const validNodeIds = new Set(nodes.map((node) => node.id))
  if (typeof document.elementsFromPoint !== "function") {
    return fallbackNodeId && validNodeIds.has(fallbackNodeId) ? fallbackNodeId : null
  }
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    const nodeElement = element.closest<HTMLElement>("[data-graph-node-id]")
    const nodeId = nodeElement?.dataset.graphNodeId
    if (nodeId && validNodeIds.has(nodeId)) return nodeId
  }
  return null
}

function EdgeLabelEditor({
  edge,
  sourceLabel,
  targetLabel,
  draft,
  pending,
  error,
  onDraftChange,
  onReset,
  onClear,
  onApply,
}: {
  edge?: GraphEdgeSummary
  sourceLabel?: string
  targetLabel?: string
  draft: EdgeLabelDraftState
  pending: boolean
  error: ShellError | null
  onDraftChange: (label: string) => void
  onReset: () => void
  onClear: () => void
  onApply: () => void
}) {
  const { t } = useI18n()
  const disabled = !edge || !draft.edgeId || pending
  const edgeName = edge
    ? firstUserFacingName([edge.label, sourceLabel && targetLabel ? `${sourceLabel} -> ${targetLabel}` : null], t("graphCanvas.none"))
    : t("graphCanvas.none")
  return (
    <form
      className="edge-label-editor"
      aria-label={t("edgeLabelEditor.aria")}
      onSubmit={(event) => {
        event.preventDefault()
        onApply()
      }}
    >
      <div className="edge-label-editor-header">
        <div>
          <span>{t("edgeLabelEditor.title")}</span>
          <code>{edgeName}</code>
        </div>
        <small>{draft.dirty ? t("edgeLabelEditor.dirty") : t("edgeLabelEditor.clean")}</small>
      </div>

      {edge ? (
        <>
          <p className="edge-label-route">
            <code>{sourceLabel ?? edgeSource(edge)}</code>
            <span>{t("edgeLabelEditor.to")}</span>
            <code>{targetLabel ?? edgeTarget(edge)}</code>
          </p>
          <label>
            <span>{t("edgeLabelEditor.label")}</span>
            <input
              type="text"
              value={draft.label}
              onChange={(event) => onDraftChange(event.currentTarget.value)}
              disabled={disabled}
              placeholder={t("edgeLabelEditor.placeholder")}
            />
          </label>
        </>
      ) : (
        <p className="muted">{t("edgeLabelEditor.empty")}</p>
      )}

      {error ? (
        <p className="edge-label-error">
          <code>{error.code}</code>
          <span>{error.message}</span>
          {warningTargetDisplay(error) ? <small>{warningTargetDisplay(error)}</small> : null}
        </p>
      ) : null}

      <div className="edge-label-command-row">
        <button type="button" onClick={onClear} disabled={disabled || !draft.label}>
          <XCircle size={15} />
          <span>{t("edgeLabelEditor.clear")}</span>
        </button>
        <button type="button" onClick={onReset} disabled={disabled || !draft.dirty}>
          <RotateCcw size={15} />
          <span>{t("edgeLabelEditor.reset")}</span>
        </button>
        <button type="submit" disabled={disabled || !draft.dirty}>
          <Check size={15} />
          <span>{pending ? t("edgeLabelEditor.applying") : t("edgeLabelEditor.apply")}</span>
        </button>
      </div>
    </form>
  )
}

function edgeHitboxStyle(
  from: GraphNodeLayoutPosition,
  to: GraphNodeLayoutPosition,
): { left: string; top: string } {
  return {
    left: `${(((from.x + to.x) / 2) / graphNodeLayoutBounds.width) * 100}%`,
    top: `${(((from.y + to.y) / 2) / graphNodeLayoutBounds.height) * 100}%`,
  }
}

function PreviewValue({ label, value }: { label: string; value?: string | null }) {
  const { t } = useI18n()
  return (
    <div className="preview-value">
      <span>{label}</span>
      <code>{value ?? t("graphCanvas.none")}</code>
    </div>
  )
}

function PathList({
  paths,
  nodes,
  objects,
  activePathId,
  selectedPathId,
  selectedPathIds,
  pathOrderDraft,
  onSelectPath,
  onMovePathDraftNode,
  onApplyPathOrderDraft,
}: {
  paths: GraphPathSummary[]
  nodes: GraphNodeSummary[]
  objects: ObjectSummary[]
  activePathId?: string | null
  selectedPathId?: string
  selectedPathIds: Set<string>
  pathOrderDraft: GraphPathOrderDraft | null
  onSelectPath: (pathId: string, nodeIds: string[], mode?: GraphEditorSelectionMode) => void
  onMovePathDraftNode: (nodeId: string, direction: "up" | "down") => void
  onApplyPathOrderDraft: () => void
}) {
  const { t } = useI18n()
  const objectById = new Map(objects.map((object) => [object.id, object]))
  const nodeLabelById = new Map(nodes.map((node) => [node.id, graphNodeDisplayName(node, objectById)]))
  if (paths.length === 0) {
    return <p className="muted">{t("graphCanvas.noPaths")}</p>
  }
  return (
    <ul className="graph-path-list" aria-label={t("graphCanvas.pathList")}>
      {paths.map((path) => {
        const selected = selectedPathIds.has(path.id)
        const singleSelected = selectedPathId === path.id
        const draftNodeIds = singleSelected && pathOrderDraft?.pathId === path.id ? pathOrderDraft.nodeIds : path.node_ids
        const routeLabel = path.node_ids.map((nodeId) => nodeLabelById.get(nodeId) ?? t("graphCanvas.none")).join(" -> ")
        const pathName = graphPathDisplayName(path, nodeLabelById, t("graphCanvas.activePath"))
        return (
          <li key={path.id} className={`${path.id === activePathId ? "graph-path-list--active" : ""} ${selected ? "graph-path-list--selected" : ""}`}>
            <button
              type="button"
              className="graph-path-select"
              aria-label={`Select path ${pathName}`}
              onClick={(event) => onSelectPath(path.id, path.node_ids, selectionModeFromMouseEvent(event))}
            >
              <strong>{pathName}</strong>
              <span>{routeLabel}</span>
            </button>
            {singleSelected ? (
              <div className="graph-path-draft" aria-label={t("graphCanvas.pathOrderDraft")}>
                <ol>
                  {draftNodeIds.map((nodeId, index) => (
                    <li key={nodeId}>
                      <span>{nodeLabelById.get(nodeId) ?? t("graphCanvas.none")}</span>
                      <button type="button" onClick={() => onMovePathDraftNode(nodeId, "up")} disabled={index === 0}>
                        {t("graphCanvas.moveUp")}
                      </button>
                      <button type="button" onClick={() => onMovePathDraftNode(nodeId, "down")} disabled={index === draftNodeIds.length - 1}>
                        {t("graphCanvas.moveDown")}
                      </button>
                    </li>
                  ))}
                </ol>
                <button type="button" onClick={onApplyPathOrderDraft}>
                  {t("graphCanvas.applyPathOrder")}
                </button>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function PathAuthoringStatusNotice({ status }: { status: PathAuthoringStatus }) {
  const { t } = useI18n()
  if (status.state === "idle") return null
  if (status.state === "auto") {
    return (
      <p className="network-preview-ok path-authoring-status">
        <strong>{t("graphCanvas.pathAuthoring.auto", { reason: status.reason })}</strong>
      </p>
    )
  }
  if (status.state === "manual") {
    return (
      <p className="network-preview-warning path-authoring-status">
        <strong>{t("graphCanvas.pathAuthoring.manual", { reason: status.reason })}</strong>
      </p>
    )
  }
  return (
    <p className="network-preview-warning path-authoring-status">
      <strong>{t("graphCanvas.pathAuthoring.error")}</strong>
      <code>{status.error.code}</code>
      <span>{status.error.message}</span>
    </p>
  )
}

function PreviewWarnings({
  disconnectedNodeIds,
  nodes,
  objectById,
}: {
  disconnectedNodeIds: string[]
  nodes: GraphNodeSummary[]
  objectById: Map<string, ObjectSummary>
}) {
  const { t } = useI18n()
  if (disconnectedNodeIds.length === 0) {
    return <p className="network-preview-ok">{t("graphCanvas.noDisconnected")}</p>
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  return (
    <div className="network-preview-warning">
      <strong>{t("graphCanvas.disconnected")}</strong>
      {disconnectedNodeIds.map((nodeId) => (
        <code key={nodeId}>{graphNodeDisplayName(nodeById.get(nodeId), objectById)}</code>
      ))}
    </div>
  )
}

function NodeCompositionEditor({
  draft,
  objects,
  pending,
  error,
  onRowChange,
  onAddRow,
  onRemoveRow,
  onReset,
  onApply,
}: {
  draft: CompositionDraftState
  objects: ObjectSummary[]
  pending: boolean
  error: ShellError | null
  onRowChange: (index: number, field: keyof CompositionDraftRow, value: string) => void
  onAddRow: () => void
  onRemoveRow: (index: number) => void
  onReset: () => void
  onApply: () => void
}) {
  const { t } = useI18n()
  const disabled = !draft.nodeId || pending
  return (
    <form
      className="composition-editor"
      aria-label={t("compositionEditor.aria")}
      onSubmit={(event) => {
        event.preventDefault()
        onApply()
      }}
    >
      <div className="composition-editor-header">
        <div>
          <span>{t("compositionEditor.title")}</span>
          <code>{draft.nodeId ? t("compositionEditor.title") : t("graphCanvas.none")}</code>
        </div>
        <small>{draft.dirty ? t("compositionEditor.dirty") : t("compositionEditor.clean")}</small>
      </div>

      {draft.rows.length > 0 ? (
        <div className="composition-row-list">
          {draft.rows.map((row, index) => (
            <CompositionDraftRowEditor
              key={`${draft.nodeId ?? "none"}-${index}`}
              row={row}
              index={index}
              objects={objects}
              disabled={disabled}
              canRemove={draft.rows.length > 1}
              onRowChange={onRowChange}
              onRemoveRow={onRemoveRow}
            />
          ))}
        </div>
      ) : (
        <p className="muted">{t("compositionEditor.empty")}</p>
      )}

      {error ? (
        <p className="composition-error">
          <code>{error.code}</code>
          <span>{error.message}</span>
          {warningTargetDisplay(error) ? <small>{warningTargetDisplay(error)}</small> : null}
        </p>
      ) : null}

      <div className="composition-command-row">
        <button type="button" onClick={onAddRow} disabled={disabled || objects.length === 0}>
          <Plus size={15} />
          <span>{t("compositionEditor.addTerm")}</span>
        </button>
        <button type="button" onClick={onReset} disabled={disabled || !draft.dirty}>
          <RotateCcw size={15} />
          <span>{t("compositionEditor.reset")}</span>
        </button>
        <button type="submit" disabled={disabled || !draft.dirty || draft.rows.length === 0}>
          <Check size={15} />
          <span>{pending ? t("compositionEditor.applying") : t("compositionEditor.apply")}</span>
        </button>
      </div>
    </form>
  )
}

function CompositionDraftRowEditor({
  row,
  index,
  objects,
  disabled,
  canRemove,
  onRowChange,
  onRemoveRow,
}: {
  row: CompositionDraftRow
  index: number
  objects: ObjectSummary[]
  disabled: boolean
  canRemove: boolean
  onRowChange: (index: number, field: keyof CompositionDraftRow, value: string) => void
  onRemoveRow: (index: number) => void
}) {
  const { t } = useI18n()
  return (
    <div className="composition-row">
      <label>
        <span>{t("compositionEditor.object")}</span>
        <select
          value={row.objectId}
          onChange={(event) => onRowChange(index, "objectId", event.currentTarget.value)}
          disabled={disabled || objects.length === 0}
        >
          {objects.map((object) => (
            <option key={object.id} value={object.id}>
              {objectDisplayName(object)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t("compositionEditor.coefficient")}</span>
        <input
          type="number"
          step="any"
          value={row.coefficient}
          onChange={(event) => onRowChange(index, "coefficient", event.currentTarget.value)}
          disabled={disabled}
        />
      </label>
      <label>
        <span>{t("compositionEditor.role")}</span>
        <select
          value={row.role}
          onChange={(event) => onRowChange(index, "role", event.currentTarget.value)}
          disabled={disabled}
        >
          <option value="">{t("compositionEditor.role.none")}</option>
          <option value="reactant">{t("compositionEditor.role.reactant")}</option>
          <option value="reagent">{t("compositionEditor.role.reagent")}</option>
          <option value="catalyst">{t("compositionEditor.role.catalyst")}</option>
          <option value="product">{t("compositionEditor.role.product")}</option>
        </select>
      </label>
      <label>
        <span>{t("compositionEditor.label")}</span>
        <input
          type="text"
          value={row.label}
          onChange={(event) => onRowChange(index, "label", event.currentTarget.value)}
          disabled={disabled}
          placeholder={t("compositionEditor.labelPlaceholder")}
        />
      </label>
      <button
        type="button"
        title={t("compositionEditor.removeTerm")}
        aria-label={t("compositionEditor.removeTerm")}
        onClick={() => onRemoveRow(index)}
        disabled={disabled || !canRemove}
      >
        <Trash2 size={15} />
      </button>
    </div>
  )
}

function isNodeInActivePath(nodeId: string, activePathId: string | null | undefined, paths: GraphPathSummary[]): boolean {
  const activePath = paths.find((path) => path.id === activePathId)
  return activePath?.node_ids.includes(nodeId) ?? false
}

function activePathDisplayName(
  activePathId: string | null | undefined,
  paths: GraphPathSummary[],
  nodes: GraphNodeSummary[],
  objectById: Map<string, ObjectSummary>,
  fallback: string,
): string | null {
  if (!activePathId) return null
  const activePath = paths.find((path) => path.id === activePathId)
  if (!activePath) return null
  const nodeLabelById = new Map(nodes.map((node) => [node.id, graphNodeDisplayName(node, objectById)]))
  return graphPathDisplayName(activePath, nodeLabelById, fallback)
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

function tuplePosition(position: GraphNodeLayoutPosition): [number, number] {
  return [position.x, position.y]
}

function pointerDistance(origin: CanvasPoint, current: CanvasPoint): number {
  return Math.hypot(current.x - origin.x, current.y - origin.y)
}

function edgeSource(edge: GraphEdgeSummary): string {
  return edge.from_node ?? edge.source ?? ""
}

function edgeTarget(edge: GraphEdgeSummary): string {
  return edge.to_node ?? edge.target ?? ""
}
