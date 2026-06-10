import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent, PointerEvent, ReactElement } from "react"
import { Check, Hand, Maximize2, Minus, MoreHorizontal, MousePointer2, Plus, Redo2, RotateCcw, Trash2, Undo2, X, XCircle, ZoomIn, ZoomOut } from "lucide-react"
import type { Atom3DSummary, EnergyProfilePointSummary, EnergyProfileSummary, ParseCandidateSummary, ShellError, ShellWarning } from "../shell"
import type { GraphEdgeSummary, GraphNodeSummary, GraphPathSummary, ObjectSummary, WorkbenchDomainState } from "./workbenchState"
import type { CanvasPoint, GraphEditorInteractionState, GraphEditorSelectionMode, PendingEdgeDraft } from "./graphEditorInteractionState"
import {
  graphEditorRubberBandRectangle,
  resolveGraphEditorDirectEdgeGesture,
  resolveGraphEditorKeyboardIntent,
  resolveGraphEditorRubberBandNodeIds,
} from "./graphEditorInteractionState"
import { type GraphLayoutPlan, type GraphLayoutWarning } from "./graphAutoLayout"
import { graphObjectDragMimeType, parseGraphObjectDragPayload } from "./graphObjectDragPayload"
import { graphRawFileDropMimeType, parseGraphRawFileDropPayload } from "./graphRawFileDropPayload"
import { firstUserFacingName, graphNodeDisplayName, graphPathDisplayName, objectDisplayName, userFacingText, warningTargetDisplay } from "./displayNames"
import {
  canvasPointToGraphNodePosition,
  clampGraphNodeLayoutPosition,
  graphNodeCssPosition,
  graphNodeLayoutBounds,
  graphNodePosition,
  moveGraphNodePosition,
  type GraphNodeLayoutPosition,
} from "./graphNodeLayout"
import {
  createGraphMinimapGeometry,
  fitGraphViewportToNodes,
  graphViewportFromMinimapPoint,
  graphPointToScreenPoint,
  graphViewportCssTransform,
  normalizeGraphViewport,
  panGraphViewport,
  resetGraphViewport,
  screenPointToGraphPoint,
  zoomGraphViewportAtScreenPoint,
  zoomGraphViewport,
  type GraphSurfaceSize,
  type GraphViewport,
} from "./graphViewport"
import type { PathAutoExtendResult } from "./graphPathAutoExtend"
import type { GraphPathOrderDraft } from "./graphPathOrderDraft"
import type { CompositionDraftRow, CompositionDraftState } from "./compositionDraftState"
import type { EdgeLabelDraftState } from "./edgeLabelDraftState"
import { convertEnergyValue, energyValueFromUnknown, normalizeEnergyUnit, resolveObjectEnergyValue } from "./energyValues"
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
    | { kind: "project-files"; files: Array<{ projectFileId: string; path: string }> }
  position: [number, number]
  addNode?: boolean
}

export type MoveGraphNodeRequest = {
  nodeId: string
  position: [number, number]
}

export type UpdateGraphNodeLabelRequest = {
  nodeId: string
  label: string
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

export type NodeSolutionLogPairCandidate = {
  nodeId: string
  projectFileId: string
  path: string
  name: string
  paired: boolean
}

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
  atomCount: number
  electronCount?: number | null
  displayEnergy?: ResolvedCanvasEnergy | null
  geometry: Atom3DSummary[]
  warnings: ShellWarning[]
}

export type CanvasEnergyMode = "electronic" | "free" | "solvation" | "corrected"
export type CanvasEnergyUnit = "hartree" | "kcal_mol" | "kj_mol"

export type CanvasEnergyDisplayOptions = {
  mode: CanvasEnergyMode
  unit: CanvasEnergyUnit
}

type ResolvedCanvasEnergy = {
  key: string
  source: string
  value: number
  unit: CanvasEnergyUnit
  mode: CanvasEnergyMode
}

type GraphEdgeSegment = {
  id: string
  sourceId: string
  targetId: string
  from: GraphNodeLayoutPosition
  to: GraphNodeLayoutPosition
  controlFrom: GraphNodeLayoutPosition
  controlTo: GraphNodeLayoutPosition
  labelPoint: GraphNodeLayoutPosition
  hitPoint: GraphNodeLayoutPosition
  path: string
  sourceLabel: string
  targetLabel: string
  label: string | null
}

type GraphBarrierAnnotationSegment = {
  id: string
  arrowPath: string
  guidePath: string
  label: string
  defaultLabel: string
  labelPoint: GraphNodeLayoutPosition
  hitPoint: GraphNodeLayoutPosition
  sourceLabel: string
  targetLabel: string
}

type GraphEdgeMetrics = {
  surfaceSize: GraphSurfaceSize
  nodeHalfWidth: number
  nodeHalfHeight: number
}

type CanvasBarrierAnnotation = {
  id: string
  sourceNodeId: string
  targetNodeId: string
  label?: string | null
}

type BarrierDragSession = {
  fromNodeId: string
  origin: CanvasPoint
  moved: boolean
  wasActive: boolean
}

type NodeResizeSession = {
  nodeId: string
  origin: CanvasPoint
  size: GraphNodeCardSize
}

type GraphNodeCardSize = {
  width: number
  height: number
}

type EdgeDragSession = {
  fromNodeId: string
}

type PendingBarrierDraft = {
  fromNodeId: string
  pointerGraphPosition: GraphNodeLayoutPosition
  targetNodeId: string | null
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
  energyDisplayOptions: CanvasEnergyDisplayOptions
  candidateChooser: ParseCandidateChooserState | null
  onEnergyDisplayOptionsChange: (options: CanvasEnergyDisplayOptions) => void
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
  onAddObjectNode: (request?: AddObjectNodeRequest) => void
  onAddRawFileNode: (request: AddRawFileNodeRequest) => void | Promise<void>
  onToggleCandidateSelection: (candidateId: string, selected: boolean) => void
  onConfirmCandidateChooser: () => void
  onCancelCandidateChooser: () => void
  onMoveNode: (request: MoveGraphNodeRequest) => void
  onUpdateNodeLabel: (request: UpdateGraphNodeLabelRequest) => void
  onNudgeNodes: (request: NudgeGraphNodesRequest) => void
  onUndoHistory: () => void
  onRedoHistory: () => void
  onApplyAutoLayout: (plan: GraphLayoutPlan) => void
  onRemoveGraphItems: (request: RemoveGraphItemsRequest) => void
  onClearSelection: () => void
  onSetViewport: (viewport: GraphViewport) => void
  onAutoFitViewport: (viewport: GraphViewport) => void
  onTogglePanMode: () => void
  onCompositionDraftRowChange: (index: number, field: keyof CompositionDraftRow, value: string) => void
  onAddCompositionDraftRow: () => void
  onRemoveCompositionDraftRow: (index: number) => void
  onResetCompositionDraft: () => void
  onApplyCompositionDraft: () => void
  solutionLogPairCandidates?: NodeSolutionLogPairCandidate[]
  onPairSolutionLog?: (candidate: NodeSolutionLogPairCandidate) => void | Promise<void>
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
  energyDisplayOptions,
  candidateChooser,
  onEnergyDisplayOptionsChange,
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
  onAddObjectNode,
  onAddRawFileNode,
  onToggleCandidateSelection,
  onConfirmCandidateChooser,
  onCancelCandidateChooser,
  onMoveNode,
  onUpdateNodeLabel,
  onNudgeNodes,
  onUndoHistory,
  onRedoHistory,
  onApplyAutoLayout,
  onRemoveGraphItems,
  onClearSelection,
  onSetViewport,
  onAutoFitViewport,
  onTogglePanMode,
  onCompositionDraftRowChange,
  onAddCompositionDraftRow,
  onRemoveCompositionDraftRow,
  onResetCompositionDraft,
  onApplyCompositionDraft,
  solutionLogPairCandidates = [],
  onPairSolutionLog,
}: GraphCanvasProps) {
  const { t } = useI18n()
  const nodeDragRef = useRef<NodeDragSession | null>(null)
  const canvasDragRef = useRef<CanvasDragSession | null>(null)
  const rubberBandRef = useRef<RubberBandSession | null>(null)
  const edgeDragRef = useRef<EdgeDragSession | null>(null)
  const barrierDragRef = useRef<BarrierDragSession | null>(null)
  const suppressNextBarrierClickRef = useRef(false)
  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null)
  const wheelPreviewViewportRef = useRef<GraphViewport | null>(null)
  const wheelPendingViewportRef = useRef<GraphViewport | null>(null)
  const wheelPreviewFrameRef = useRef<number | null>(null)
  const wheelCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ignoreNextNodeClickRef = useRef<string | null>(null)
  const autoFitGraphKeyRef = useRef<string | null>(null)
  const workspace = state.workspace
  const graph = workspace?.graph
  const nodes = graph?.nodes ?? []
  const edges = graph?.edges ?? []
  const paths = graph?.paths ?? []
  const objectById = useMemo(() => new Map(state.objects.map((object) => [object.id, object])), [state.objects])
  const selectionSize = interactionState.selection.nodeIds.length
    + interactionState.selection.edgeIds.length
    + interactionState.selection.pathIds.length
  const singleSelectedPathId = selectionSize === 1 ? interactionState.selection.pathIds[0] : undefined
  const selectedNodeIds = useMemo(() => new Set(interactionState.selection.nodeIds), [interactionState.selection.nodeIds])
  const selectedEdgeIds = useMemo(() => new Set(interactionState.selection.edgeIds), [interactionState.selection.edgeIds])
  const selectedPathIds = useMemo(() => new Set(interactionState.selection.pathIds), [interactionState.selection.pathIds])
  const solutionLogPairCandidatesByNodeId = useMemo(() => {
    const byNodeId = new Map<string, NodeSolutionLogPairCandidate[]>()
    for (const candidate of solutionLogPairCandidates) {
      const current = byNodeId.get(candidate.nodeId) ?? []
      current.push(candidate)
      byNodeId.set(candidate.nodeId, current)
    }
    return byNodeId
  }, [solutionLogPairCandidates])
  const selectedPathId = singleSelectedPathId
  const pendingConnectionFromId = interactionState.pendingEdge?.fromNodeId
  const graphReferences = {
    nodeIds: nodes.map((node) => node.id),
    edgeIds: edges.map((edge) => edge.id),
    pathIds: paths.map((path) => path.id),
  }
  const nodeIdSignature = graphReferences.nodeIds.join("\u001f")
  const directEdgeGesture = resolveGraphEditorDirectEdgeGesture(interactionState, graphReferences)
  const pendingDirectEdgeTargetId = directEdgeGesture.kind === "connect" ? directEdgeGesture.toNodeId : null
  const viewport = normalizeGraphViewport(workspace?.viewport)
  const panActive = interactionState.mode === "pan"
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set())
  const [energyReferenceNodeId, setEnergyReferenceNodeId] = useState<string | null>(null)
  const [pendingBarrierDraft, setPendingBarrierDraft] = useState<PendingBarrierDraft | null>(null)
  const [barrierAnnotations, setBarrierAnnotations] = useState<CanvasBarrierAnnotation[]>([])
  const [selectedBarrierAnnotationId, setSelectedBarrierAnnotationId] = useState<string | null>(null)
  const [editingEdgeLabelId, setEditingEdgeLabelId] = useState<string | null>(null)
  const [expandedMolecule, setExpandedMolecule] = useState<CanvasChemicalNodeSummary | null>(null)
  const [nodeSizeById, setNodeSizeById] = useState<Record<string, GraphNodeCardSize>>({})
  const [minimapPreviewViewport, setMinimapPreviewViewport] = useState<GraphViewport | null>(null)
  const [wheelPreviewViewport, setWheelPreviewViewport] = useState<GraphViewport | null>(null)
  const [edgeMetrics, setEdgeMetrics] = useState<GraphEdgeMetrics>(() => defaultGraphEdgeMetrics)
  const nodeSizeSignature = useMemo(
    () => Object.entries(nodeSizeById)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([nodeId, size]) => `${nodeId}:${Math.round(size.width)}x${Math.round(size.height)}`)
      .join("|"),
    [nodeSizeById],
  )
  const canUseWorkspace = Boolean(state.sessionId)
  const canRemoveSelection = selectionSize > 0 || Boolean(selectedBarrierAnnotationId)
  const objectDropEnabled = canUseWorkspace && state.objects.length > 0
  const rubberBandRectangle = rubberBandRectangleFromInteractionState(interactionState)
  const nodeSummaryById = useMemo(
    () => new Map(nodes.map((node) => [node.id, canvasChemicalNodeSummary(node, state.objects, energyDisplayOptions)])),
    [energyDisplayOptions, nodes, state.objects],
  )
  const defaultEnergyReferenceNodeId = useMemo(
    () => defaultEnergyReferenceNodeIdForGraph(nodes, paths, workspace?.active_path_id),
    [nodes, paths, workspace?.active_path_id],
  )
  const effectiveEnergyReferenceNodeId = energyReferenceNodeId && nodes.some((node) => node.id === energyReferenceNodeId)
    ? energyReferenceNodeId
    : defaultEnergyReferenceNodeId
  const relativeEnergyByNodeId = useMemo(
    () => relativeEnergyValuesByNodeId(nodes, nodeSummaryById, effectiveEnergyReferenceNodeId, state.profile, energyDisplayOptions),
    [effectiveEnergyReferenceNodeId, energyDisplayOptions, nodeSummaryById, nodes, state.profile],
  )
  const displayNodes = useMemo(
    () => graphNodesWithDragPreview(nodes, interactionState),
    [interactionState, nodes],
  )
  const displayViewport = minimapPreviewViewport ?? wheelPreviewViewport ?? canvasDragPreviewViewport(interactionState, viewport)
  const zoomPercent = Math.round(displayViewport.zoom * 100)

  const handleZoom = (direction: "in" | "out") => {
    onSetViewport(zoomGraphViewport(viewport, direction))
  }

  const handleFitViewport = (element: HTMLElement) => {
    onSetViewport(fitGraphViewportToNodes(displayNodes, surfaceSizeFromElement(element)))
  }

  const handleResetViewport = () => {
    const surface = canvasSurfaceRef.current
    if (surface && displayNodes.length > 0) {
      onSetViewport(fitGraphViewportToNodes(displayNodes, surfaceSizeFromElement(surface)))
      return
    }
    onSetViewport(resetGraphViewport())
  }

  const handleEnergyLayout = () => {
    if (!graph) return
    onApplyAutoLayout(createEnergyRankedLayoutPlan({
      graph,
      paths,
      referenceNodeId: effectiveEnergyReferenceNodeId,
      relativeEnergyByNodeId,
      surfaceSize: edgeMetrics.surfaceSize,
      fitAfterLayout: true,
    }))
  }

  const clearCanvasSelection = useCallback(() => {
    setSelectedBarrierAnnotationId(null)
    setEditingEdgeLabelId(null)
    onClearSelection()
  }, [onClearSelection])

  const removeCurrentSelection = useCallback(() => {
    setEditingEdgeLabelId(null)
    if (selectedBarrierAnnotationId) {
      setBarrierAnnotations((current) => current.filter((annotation) => annotation.id !== selectedBarrierAnnotationId))
      setSelectedBarrierAnnotationId(null)
      return
    }
    void onRemoveGraphItems({
      nodeIds: interactionState.selection.nodeIds,
      edgeIds: interactionState.selection.edgeIds,
      pathIds: interactionState.selection.pathIds,
    })
  }, [interactionState.selection.edgeIds, interactionState.selection.nodeIds, interactionState.selection.pathIds, onRemoveGraphItems, selectedBarrierAnnotationId])

  const removeNodeFromCanvas = useCallback((nodeId: string) => {
    setEditingEdgeLabelId(null)
    setSelectedBarrierAnnotationId(null)
    setBarrierAnnotations((current) => current.filter((annotation) => (
      annotation.sourceNodeId !== nodeId && annotation.targetNodeId !== nodeId
    )))
    void onRemoveGraphItems({ nodeIds: [nodeId], edgeIds: [], pathIds: [] })
  }, [onRemoveGraphItems])

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
      removeCurrentSelection()
      return
    }
    if (intent.kind === "clear-selection") {
      clearCanvasSelection()
      return
    }
    if (interactionState.selection.nodeIds.length === 0) return
    onNudgeNodes({
      nodeIds: interactionState.selection.nodeIds,
      delta: intent.delta,
    })
  }

  const clearWheelPreviewTimers = useCallback(() => {
    if (wheelPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(wheelPreviewFrameRef.current)
      wheelPreviewFrameRef.current = null
    }
    if (wheelCommitTimerRef.current !== null) {
      clearTimeout(wheelCommitTimerRef.current)
      wheelCommitTimerRef.current = null
    }
  }, [])

  const commitWheelViewport = useCallback((nextViewport: GraphViewport) => {
    wheelPendingViewportRef.current = null
    wheelCommitTimerRef.current = null
    onSetViewport(nextViewport)
  }, [onSetViewport])

  const previewWheelViewport = useCallback((nextViewport: GraphViewport) => {
    wheelPendingViewportRef.current = nextViewport
    if (wheelPreviewFrameRef.current === null) {
      wheelPreviewFrameRef.current = window.requestAnimationFrame(() => {
        wheelPreviewFrameRef.current = null
        const pending = wheelPendingViewportRef.current
        if (!pending) return
        wheelPreviewViewportRef.current = pending
        setWheelPreviewViewport(pending)
      })
    }
    if (wheelCommitTimerRef.current !== null) {
      clearTimeout(wheelCommitTimerRef.current)
    }
    wheelCommitTimerRef.current = setTimeout(() => {
      const committed = wheelPendingViewportRef.current ?? wheelPreviewViewportRef.current
      if (committed) {
        commitWheelViewport(committed)
      }
    }, 120)
  }, [commitWheelViewport])

  const handleCanvasWheel = useCallback((event: WheelEvent) => {
    const surface = canvasSurfaceRef.current
    if (!surface) return
    if (!event.target || !canUseWorkspace || nodes.length === 0 || !isCanvasViewportInputTarget(event.target)) return
    const surfacePoint = surfacePointFromClientPoint(surface, event.clientX, event.clientY)
    event.preventDefault()
    const surfaceSize = surfaceSizeFromElement(surface)
    const baseViewport = wheelPendingViewportRef.current ?? wheelPreviewViewportRef.current ?? viewport
    if (event.ctrlKey || event.metaKey) {
      previewWheelViewport(zoomGraphViewportAtScreenPoint(
        baseViewport,
        surfaceSize,
        surfacePoint,
        event.deltaY,
        { ctrlOrMeta: true },
      ))
      return
    }
    const graphDelta = {
      x: (event.deltaX / Math.max(surfaceSize.width, 1)) * graphNodeLayoutBounds.width / baseViewport.zoom,
      y: (event.deltaY / Math.max(surfaceSize.height, 1)) * graphNodeLayoutBounds.height / baseViewport.zoom,
    }
    previewWheelViewport(panGraphViewport(baseViewport, { x: -graphDelta.x, y: -graphDelta.y }))
  }, [canUseWorkspace, nodes.length, previewWheelViewport, viewport])

  useEffect(() => {
    const surface = canvasSurfaceRef.current
    if (!surface) return undefined
    surface.addEventListener("wheel", handleCanvasWheel, { passive: false })
    return () => surface.removeEventListener("wheel", handleCanvasWheel)
  }, [handleCanvasWheel])

  useEffect(() => clearWheelPreviewTimers, [clearWheelPreviewTimers])

  useEffect(() => {
    if (!wheelPreviewViewport) return
    if (graphViewportNearlyEqual(wheelPreviewViewport, viewport)) {
      wheelPreviewViewportRef.current = null
      wheelPendingViewportRef.current = null
      setWheelPreviewViewport(null)
    }
  }, [viewport, wheelPreviewViewport])

  useEffect(() => {
    if (wheelPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(wheelPreviewFrameRef.current)
      wheelPreviewFrameRef.current = null
    }
    if (wheelCommitTimerRef.current !== null) {
      clearTimeout(wheelCommitTimerRef.current)
      wheelCommitTimerRef.current = null
    }
    wheelPreviewViewportRef.current = null
    wheelPendingViewportRef.current = null
    setWheelPreviewViewport(null)
  }, [workspace?.workspace_id, graph?.id])

  useEffect(() => {
    const surface = canvasSurfaceRef.current
    if (!surface) return undefined
    const updateEdgeMetrics = () => {
      setEdgeMetrics((current) => {
        const next = graphEdgeMetricsFromSurface(surface, viewport.zoom)
        return graphEdgeMetricsEqual(current, next) ? current : next
      })
    }
    updateEdgeMetrics()
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updateEdgeMetrics)
      : null
    resizeObserver?.observe(surface)
    window.addEventListener("resize", updateEdgeMetrics)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener("resize", updateEdgeMetrics)
    }
  }, [nodeSizeSignature, nodes.length, viewport.zoom])

  useEffect(() => {
    if (!canUseWorkspace || !graph) return
    const surface = canvasSurfaceRef.current
    if (!surface) return
    const key = `${workspace?.workspace_id ?? "workspace"}:${graph.id}`
    if (autoFitGraphKeyRef.current === key) return
    if (nodes.length === 0) {
      autoFitGraphKeyRef.current = key
      return
    }
    autoFitGraphKeyRef.current = key
    onAutoFitViewport(fitGraphViewportToNodes(displayNodes, surfaceSizeFromElement(surface)))
  }, [canUseWorkspace, displayNodes, graph, nodes.length, onAutoFitViewport, workspace?.workspace_id])

  useEffect(() => {
    if (!energyReferenceNodeId) return
    if (!nodes.some((node) => node.id === energyReferenceNodeId)) {
      setEnergyReferenceNodeId(null)
    }
  }, [energyReferenceNodeId, nodes])

  useEffect(() => {
    if (!pendingBarrierDraft) return
    if (!nodes.some((node) => node.id === pendingBarrierDraft.fromNodeId)) {
      setPendingBarrierDraft(null)
    }
  }, [nodes, pendingBarrierDraft])

  useEffect(() => {
    if (barrierAnnotations.length === 0 && !selectedBarrierAnnotationId) return
    const nodeIds = new Set(nodeIdSignature ? nodeIdSignature.split("\u001f") : [])
    const validAnnotations = barrierAnnotations.filter((annotation) => (
      nodeIds.has(annotation.sourceNodeId)
      && nodeIds.has(annotation.targetNodeId)
    ))
    if (validAnnotations.length !== barrierAnnotations.length) {
      setBarrierAnnotations(validAnnotations)
    }
    if (selectedBarrierAnnotationId && !validAnnotations.some((annotation) => annotation.id === selectedBarrierAnnotationId)) {
      setSelectedBarrierAnnotationId(null)
    }
  }, [barrierAnnotations, nodeIdSignature, selectedBarrierAnnotationId])

  useEffect(() => {
    if (Object.keys(nodeSizeById).length === 0) return
    const nodeIds = new Set(nodes.map((node) => node.id))
    setNodeSizeById((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([nodeId]) => nodeIds.has(nodeId)))
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }, [nodeSizeById, nodes])

  useEffect(() => {
    if (!editingEdgeLabelId) return
    if (!edges.some((edge) => edge.id === editingEdgeLabelId)) {
      setEditingEdgeLabelId(null)
    }
  }, [edges, editingEdgeLabelId])

  useEffect(() => {
    if (!minimapPreviewViewport) return
    if (graphViewportNearlyEqual(minimapPreviewViewport, viewport)) {
      setMinimapPreviewViewport(null)
    }
  }, [minimapPreviewViewport, viewport])

  const toggleNodeCollapsed = useCallback((nodeId: string) => {
    setCollapsedNodeIds((current) => {
      const next = new Set(current)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  const createBarrierAnnotation = useCallback((sourceNodeId: string, targetNodeId: string) => {
    if (sourceNodeId === targetNodeId) return false
    const id = `barrier-${sourceNodeId}-${targetNodeId}-${Date.now()}`
    setBarrierAnnotations((current) => [
      ...current.filter((annotation) => !(
        annotation.sourceNodeId === sourceNodeId
        && annotation.targetNodeId === targetNodeId
      )),
      { id, sourceNodeId, targetNodeId },
    ])
    setSelectedBarrierAnnotationId(id)
    return true
  }, [])

  const updateBarrierAnnotationLabel = useCallback((annotationId: string, label: string | null) => {
    setBarrierAnnotations((current) => current.map((annotation) => (
      annotation.id === annotationId ? { ...annotation, label } : annotation
    )))
  }, [])

  const resizeNodeCard = useCallback((nodeId: string, size: GraphNodeCardSize) => {
    setNodeSizeById((current) => ({
      ...current,
      [nodeId]: {
        width: Math.round(clamp(size.width, graphNodeCardSizeBounds.minWidth, graphNodeCardSizeBounds.maxWidth)),
        height: Math.round(clamp(size.height, graphNodeCardSizeBounds.minHeight, graphNodeCardSizeBounds.maxHeight)),
      },
    }))
  }, [])

  const handleCanvasPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canUseWorkspace || event.button !== 0 || !isCanvasPanStartTarget(event.target)) return
    if (selectionSize > 0 || selectedBarrierAnnotationId) clearCanvasSelection()
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

  const handleNodePointerDown = useCallback((node: GraphNodeSummary, event: PointerEvent<HTMLElement>) => {
    if (!canUseWorkspace || event.button !== 0) return
    const origin = pointFromPointerEvent(event, viewport, { snap: false })
    nodeDragRef.current = {
      nodeId: node.id,
      origin,
      nodeOrigin: graphNodePosition(node),
      dragging: false,
    }
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }, [canUseWorkspace, viewport])

  const handleNodePointerMove = useCallback((node: GraphNodeSummary, event: PointerEvent<HTMLElement>) => {
    const drag = nodeDragRef.current
    if (!drag || drag.nodeId !== node.id) return
    const current = pointFromPointerEvent(event, viewport, { snap: false })
    if (!drag.dragging && pointerDistance(drag.origin, current) < 4) return
    if (!drag.dragging) {
      drag.dragging = true
      onStartNodeDrag(node.id, drag.origin)
    }
    onUpdateNodeDrag(current)
    event.preventDefault()
  }, [onStartNodeDrag, onUpdateNodeDrag, viewport])

  const handleNodePointerUp = useCallback((node: GraphNodeSummary, event: PointerEvent<HTMLElement>) => {
    const drag = nodeDragRef.current
    if (!drag || drag.nodeId !== node.id) return
    const current = pointFromPointerEvent(event, viewport, { snap: false })
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
  }, [onEndNodeDrag, onMoveNode, viewport])

  const handleNodeClick = useCallback((nodeId: string, event: MouseEvent<HTMLElement>) => {
    if (ignoreNextNodeClickRef.current === nodeId) {
      ignoreNextNodeClickRef.current = null
      return
    }
    setSelectedBarrierAnnotationId(null)
    onSelectNode(nodeId, selectionModeFromMouseEvent(event))
  }, [onSelectNode])

  const handleNodePointerCancel = useCallback((node: GraphNodeSummary) => {
    const drag = nodeDragRef.current
    if (!drag || drag.nodeId !== node.id) return
    nodeDragRef.current = null
    if (drag.dragging) onEndNodeDrag()
  }, [onEndNodeDrag])

  const handleEdgeHandlePointerDown = useCallback((node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => {
    if (!canUseWorkspace || event.button !== 0) return
    event.stopPropagation()
    const position = pointFromPointerEvent(event, viewport, { snap: false })
    edgeDragRef.current = {
      fromNodeId: node.id,
    }
    onStartPointerEdge(node.id, position)
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    event.preventDefault()
  }, [canUseWorkspace, onStartPointerEdge, viewport])

  const updateEdgeDragFromClientPoint = useCallback((clientX: number, clientY: number) => {
    const drag = edgeDragRef.current
    if (!drag) return false
    const position = pointFromClientPoint(clientX, clientY, viewport, { snap: false })
    onUpdatePointerEdge(position, nodeIdFromPoint(clientX, clientY, nodes, drag.fromNodeId))
    return true
  }, [nodes, onUpdatePointerEdge, viewport])

  const finishEdgeDragAtClientPoint = useCallback((clientX: number, clientY: number) => {
    const drag = edgeDragRef.current
    if (!drag) return false
    edgeDragRef.current = null
    onEndPointerEdge(nodeIdFromPoint(clientX, clientY, nodes, drag.fromNodeId))
    return true
  }, [nodes, onEndPointerEdge])

  const handleEdgeHandlePointerMove = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (!updateEdgeDragFromClientPoint(event.clientX, event.clientY)) return
    event.stopPropagation()
    event.preventDefault()
  }, [updateEdgeDragFromClientPoint])

  const handleEdgeHandlePointerUp = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (!finishEdgeDragAtClientPoint(event.clientX, event.clientY)) return
    event.stopPropagation()
    event.preventDefault()
  }, [finishEdgeDragAtClientPoint])

  const handleEdgeHandlePointerCancel = useCallback(() => {
    if (!edgeDragRef.current) return
    edgeDragRef.current = null
    onCancelPointerEdge()
  }, [onCancelPointerEdge])

  useEffect(() => {
    if (!interactionState.pendingEdge || interactionState.pendingEdge.source !== "pointer") return undefined
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (!updateEdgeDragFromClientPoint(event.clientX, event.clientY)) return
      event.preventDefault()
    }
    const handlePointerUp = (event: globalThis.PointerEvent) => {
      if (!finishEdgeDragAtClientPoint(event.clientX, event.clientY)) return
      event.preventDefault()
    }
    const handlePointerCancel = () => {
      if (!edgeDragRef.current) return
      edgeDragRef.current = null
      onCancelPointerEdge()
    }
    window.addEventListener("pointermove", handlePointerMove, { capture: true })
    window.addEventListener("pointerup", handlePointerUp, { capture: true })
    window.addEventListener("pointercancel", handlePointerCancel, { capture: true })
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, { capture: true })
      window.removeEventListener("pointerup", handlePointerUp, { capture: true })
      window.removeEventListener("pointercancel", handlePointerCancel, { capture: true })
    }
  }, [finishEdgeDragAtClientPoint, interactionState.pendingEdge, onCancelPointerEdge, updateEdgeDragFromClientPoint])

  const updateBarrierDragFromClientPoint = useCallback((clientX: number, clientY: number) => {
    const drag = barrierDragRef.current
    if (!drag) return false
    if (Math.hypot(clientX - drag.origin.x, clientY - drag.origin.y) > 4) {
      drag.moved = true
    }
    setPendingBarrierDraft({
      fromNodeId: drag.fromNodeId,
      pointerGraphPosition: pointFromClientPoint(clientX, clientY, viewport, { snap: false }),
      targetNodeId: nodeIdFromPoint(clientX, clientY, nodes, drag.fromNodeId),
    })
    return true
  }, [nodes, viewport])

  const finishBarrierDragAtClientPoint = useCallback((clientX: number, clientY: number) => {
    const drag = barrierDragRef.current
    if (!drag) return false
    barrierDragRef.current = null
    suppressNextBarrierClickRef.current = true
    if (drag.moved) {
      const targetNodeId = nodeIdFromPoint(clientX, clientY, nodes, drag.fromNodeId)
      if (targetNodeId) createBarrierAnnotation(drag.fromNodeId, targetNodeId)
      setPendingBarrierDraft(null)
    } else if (drag.wasActive) {
      setPendingBarrierDraft(null)
    } else {
      setPendingBarrierDraft(null)
    }
    return true
  }, [createBarrierAnnotation, nodes])

  useEffect(() => {
    if (!pendingBarrierDraft) return undefined
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (!updateBarrierDragFromClientPoint(event.clientX, event.clientY)) return
      event.preventDefault()
    }
    const handlePointerUp = (event: globalThis.PointerEvent) => {
      if (!finishBarrierDragAtClientPoint(event.clientX, event.clientY)) return
      event.preventDefault()
    }
    const handlePointerCancel = () => {
      if (!barrierDragRef.current) return
      barrierDragRef.current = null
      setPendingBarrierDraft(null)
    }
    window.addEventListener("pointermove", handlePointerMove, { capture: true })
    window.addEventListener("pointerup", handlePointerUp, { capture: true })
    window.addEventListener("pointercancel", handlePointerCancel, { capture: true })
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, { capture: true })
      window.removeEventListener("pointerup", handlePointerUp, { capture: true })
      window.removeEventListener("pointercancel", handlePointerCancel, { capture: true })
    }
  }, [finishBarrierDragAtClientPoint, pendingBarrierDraft, updateBarrierDragFromClientPoint])

  const handleBarrierHandlePointerDown = useCallback((node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => {
    if (!canUseWorkspace || event.button !== 0) return
    event.stopPropagation()
    barrierDragRef.current = {
      fromNodeId: node.id,
      origin: { x: event.clientX, y: event.clientY },
      moved: false,
      wasActive: pendingBarrierDraft?.fromNodeId === node.id,
    }
    setPendingBarrierDraft({
      fromNodeId: node.id,
      pointerGraphPosition: pointFromPointerEvent(event, viewport, { snap: false }),
      targetNodeId: null,
    })
    setSelectedBarrierAnnotationId(null)
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    event.preventDefault()
  }, [canUseWorkspace, pendingBarrierDraft?.fromNodeId, viewport])

  const handleBarrierHandlePointerMove = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (!updateBarrierDragFromClientPoint(event.clientX, event.clientY)) return
    event.stopPropagation()
    event.preventDefault()
  }, [updateBarrierDragFromClientPoint])

  const handleBarrierHandlePointerUp = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (!finishBarrierDragAtClientPoint(event.clientX, event.clientY)) return
    event.stopPropagation()
    event.preventDefault()
  }, [finishBarrierDragAtClientPoint])

  const handleBarrierHandlePointerCancel = useCallback(() => {
    if (!barrierDragRef.current) return
    barrierDragRef.current = null
    setPendingBarrierDraft(null)
  }, [])

  const handleBarrierHandleClick = useCallback((_node: GraphNodeSummary, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (suppressNextBarrierClickRef.current) {
      suppressNextBarrierClickRef.current = false
      return
    }
    setSelectedBarrierAnnotationId(null)
  }, [])

  return (
    <section className="graph-workspace" aria-label={t("graphCanvas.aria")} onKeyDown={handleKeyboardIntent}>
      {autoLayoutStatus && autoLayoutStatus.state !== "idle" ? (
        <LayoutStatus status={autoLayoutStatus} />
      ) : null}
      <HistoryStatus controls={historyControls} />

      <div className="graph-viewport-bar" aria-label={t("graphCanvas.viewportControls")}>
        <div className="graph-energy-controls" aria-label={t("graphCanvas.energyControls")}>
          <label>
            <span>{t("graphCanvas.energyMode")}</span>
            <select
              value={energyDisplayOptions.mode}
              onChange={(event) => {
                const mode = event.currentTarget.value as CanvasEnergyMode
                onEnergyDisplayOptionsChange({
                  ...energyDisplayOptions,
                  mode,
                })
              }}
            >
              <option value="electronic">{t("graphCanvas.energyMode.electronic")}</option>
              <option value="free">{t("graphCanvas.energyMode.free")}</option>
              <option value="solvation">{t("graphCanvas.energyMode.solvation")}</option>
              <option value="corrected">{t("graphCanvas.energyMode.corrected")}</option>
            </select>
          </label>
          <label>
            <span>{t("graphCanvas.energyUnit")}</span>
            <select
              value={energyDisplayOptions.unit}
              onChange={(event) => {
                const unit = event.currentTarget.value as CanvasEnergyUnit
                onEnergyDisplayOptionsChange({
                  ...energyDisplayOptions,
                  unit,
                })
              }}
            >
              <option value="hartree">{t("graphCanvas.energyUnit.hartree")}</option>
              <option value="kcal_mol">{t("graphCanvas.energyUnit.kcalMol")}</option>
              <option value="kj_mol">{t("graphCanvas.energyUnit.kjMol")}</option>
            </select>
          </label>
        </div>
        {canRemoveSelection ? (
          <button
            type="button"
            onClick={removeCurrentSelection}
            title={t("graphCanvas.deleteSelected")}
          >
            <Trash2 size={16} />
            <span className="visually-hidden">{t("graphCanvas.deleteSelected")}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onUndoHistory}
          disabled={!canUseWorkspace || !historyControls.canUndo || Boolean(historyControls.running)}
          title={historyControls.undoLabel ? t("graphCanvas.undoWithLabel", { label: historyControls.undoLabel }) : t("graphCanvas.undo")}
        >
          <Undo2 size={16} />
          <span className="visually-hidden">{t("graphCanvas.undo")}</span>
        </button>
        <button
          type="button"
          onClick={onRedoHistory}
          disabled={!canUseWorkspace || !historyControls.canRedo || Boolean(historyControls.running)}
          title={historyControls.redoLabel ? t("graphCanvas.redoWithLabel", { label: historyControls.redoLabel }) : t("graphCanvas.redo")}
        >
          <Redo2 size={16} />
          <span className="visually-hidden">{t("graphCanvas.redo")}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (panActive) onTogglePanMode()
          }}
          disabled={!canUseWorkspace}
          aria-pressed={!panActive}
          className={!panActive ? "graph-viewport-button--active" : ""}
          title={t("graphCanvas.select")}
        >
          <MousePointer2 size={16} />
          <span className="visually-hidden">{t("graphCanvas.select")}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (!panActive) onTogglePanMode()
          }}
          disabled={!canUseWorkspace}
          aria-pressed={panActive}
          className={panActive ? "graph-viewport-button--active" : ""}
          title={t("graphCanvas.pan")}
        >
          <Hand size={16} />
          <span className="visually-hidden">{t("graphCanvas.pan")}</span>
        </button>
        <button type="button" onClick={() => handleZoom("out")} disabled={!canUseWorkspace} title={t("graphCanvas.zoomOut")}>
          <ZoomOut size={16} />
          <span className="visually-hidden">{t("graphCanvas.zoomOut")}</span>
        </button>
        <output aria-label={t("graphCanvas.zoomValue", { value: zoomPercent })}>
          {t("graphCanvas.zoomValue", { value: zoomPercent })}
        </output>
        <button type="button" onClick={() => handleZoom("in")} disabled={!canUseWorkspace} title={t("graphCanvas.zoomIn")}>
          <ZoomIn size={16} />
          <span className="visually-hidden">{t("graphCanvas.zoomIn")}</span>
        </button>
        <button
          type="button"
          onClick={(event) => handleFitViewport(event.currentTarget.closest(".graph-workspace")?.querySelector(".graph-canvas-surface") as HTMLElement)}
          disabled={!canUseWorkspace || nodes.length === 0}
          title={t("graphCanvas.fitView")}
        >
          <Maximize2 size={16} />
          <span className="visually-hidden">{t("graphCanvas.fitView")}</span>
        </button>
        <button
          type="button"
          onClick={handleEnergyLayout}
          disabled={!canUseWorkspace || nodes.length === 0}
          title={t("graphCanvas.energyLayout")}
          aria-label={t("graphCanvas.energyLayout")}
          className="graph-viewport-text-button"
        >
          <span>{t("graphCanvas.energyLayoutShort")}</span>
        </button>
        <button type="button" onClick={handleResetViewport} disabled={!canUseWorkspace} title={t("graphCanvas.resetView")}>
          <RotateCcw size={16} />
          <span className="visually-hidden">{t("graphCanvas.resetView")}</span>
        </button>
      </div>

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
              <GraphEdgeLayer
                nodes={displayNodes}
                edges={edges}
                objectById={objectById}
                nodeSummaryById={nodeSummaryById}
                relativeEnergyByNodeId={relativeEnergyByNodeId}
                barrierAnnotations={barrierAnnotations}
                edgeMetrics={edgeMetrics}
                viewport={displayViewport}
                selectedEdgeIds={selectedEdgeIds}
                selectedBarrierAnnotationId={selectedBarrierAnnotationId}
                pendingEdge={interactionState.pendingEdge}
                pendingBarrier={pendingBarrierDraft}
                edgeLabelDraft={edgeLabelDraft}
                edgeLabelPending={edgeLabelPending}
                edgeLabelError={edgeLabelError}
                onSelectEdge={(edgeId, mode) => {
                  setSelectedBarrierAnnotationId(null)
                  setEditingEdgeLabelId(null)
                  onSelectEdge(edgeId, mode)
                }}
                editingEdgeLabelId={editingEdgeLabelId}
                onEditEdgeLabel={(edgeId) => {
                  setSelectedBarrierAnnotationId(null)
                  setEditingEdgeLabelId(edgeId)
                  onSelectEdge(edgeId, "replace")
                }}
                onEdgeLabelDraftChange={onEdgeLabelDraftChange}
                onResetEdgeLabelDraft={onResetEdgeLabelDraft}
                onClearEdgeLabelDraft={onClearEdgeLabelDraft}
                onApplyEdgeLabelDraft={onApplyEdgeLabelDraft}
                onSelectBarrierAnnotation={(annotationId) => {
                  setSelectedBarrierAnnotationId(annotationId)
                  onClearSelection()
                }}
                onRemoveBarrierAnnotation={(annotationId) => {
                  setBarrierAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId))
                  setSelectedBarrierAnnotationId((current) => current === annotationId ? null : current)
                }}
                onUpdateBarrierAnnotationLabel={updateBarrierAnnotationLabel}
              />
              <div className="graph-viewport-layer" style={{ transform: graphViewportCssTransform(displayViewport) }}>
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
                      summary={nodeSummaryById.get(node.id) ?? canvasChemicalNodeSummary(node, state.objects, energyDisplayOptions)}
                      selected={selectedNodeIds.has(node.id)}
                      pending={node.id === pendingConnectionFromId}
                      pendingTarget={node.id === pendingDirectEdgeTargetId}
                      barrierSource={pendingBarrierDraft?.fromNodeId === node.id}
                      barrierTarget={Boolean(pendingBarrierDraft && pendingBarrierDraft.fromNodeId !== node.id)}
                      collapsed={collapsedNodeIds.has(node.id)}
                      activePath={isNodeInActivePath(node.id, workspace?.active_path_id, paths)}
                      dragging={isDraggingNode(interactionState, node.id)}
                      displayPosition={graphNodePosition(displayNodes.find((displayNode) => displayNode.id === node.id) ?? node)}
                      relativeEnergy={relativeEnergyByNodeId.get(node.id) ?? null}
                      energyDisplayMode={energyDisplayOptions.mode}
                      energyReference={node.id === effectiveEnergyReferenceNodeId}
                      cardSize={nodeSizeById[node.id] ?? null}
                      viewportZoom={displayViewport.zoom}
                      onPointerDown={handleNodePointerDown}
                      onPointerMove={handleNodePointerMove}
                      onPointerUp={handleNodePointerUp}
                      onPointerCancel={handleNodePointerCancel}
                      onUpdateLabel={onUpdateNodeLabel}
                      onRemoveNode={removeNodeFromCanvas}
                      onToggleCollapsed={toggleNodeCollapsed}
                      onSetEnergyReference={setEnergyReferenceNodeId}
                      solutionLogPairCandidates={solutionLogPairCandidatesByNodeId.get(node.id) ?? []}
                      onPairSolutionLog={onPairSolutionLog}
                      onOpenStructure={setExpandedMolecule}
                      onEdgeHandlePointerDown={handleEdgeHandlePointerDown}
                      onEdgeHandlePointerMove={handleEdgeHandlePointerMove}
                      onEdgeHandlePointerUp={handleEdgeHandlePointerUp}
                      onEdgeHandlePointerCancel={handleEdgeHandlePointerCancel}
                      onBarrierHandlePointerDown={handleBarrierHandlePointerDown}
                      onBarrierHandlePointerMove={handleBarrierHandlePointerMove}
                      onBarrierHandlePointerUp={handleBarrierHandlePointerUp}
                      onBarrierHandlePointerCancel={handleBarrierHandlePointerCancel}
                      onBarrierHandleClick={handleBarrierHandleClick}
                      onResizeNode={resizeNodeCard}
                      onClick={handleNodeClick}
                    />
                  ))}
                </div>
              </div>
              <GraphMinimap
                nodes={displayNodes}
                viewport={displayViewport}
                onPreviewViewport={setMinimapPreviewViewport}
                onCommitViewport={(nextViewport) => {
                  setMinimapPreviewViewport(nextViewport)
                  onSetViewport(nextViewport)
                }}
              />
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

        <PathAuthoringStatusNotice status={pathAuthoringStatus} />
      </div>
      {expandedMolecule ? (
        <Molecule3DDialog
          summary={expandedMolecule}
          onClose={() => setExpandedMolecule(null)}
        />
      ) : null}
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
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    setVisible(true)
    if (status.state === "error" || status.state === "applying") return undefined
    const timeout = window.setTimeout(() => setVisible(false), 2400)
    return () => window.clearTimeout(timeout)
  }, [status.message, status.state])
  if (!visible) return null
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

function GraphMinimap({
  nodes,
  viewport,
  onPreviewViewport,
  onCommitViewport,
}: {
  nodes: GraphNodeSummary[]
  viewport: GraphViewport
  onPreviewViewport: (viewport: GraphViewport | null) => void
  onCommitViewport: (viewport: GraphViewport) => void
}) {
  const { t } = useI18n()
  const minimapRef = useRef<HTMLButtonElement | null>(null)
  const dragGeometryRef = useRef<NonNullable<ReturnType<typeof createGraphMinimapGeometry>> | null>(null)
  const dragViewportRef = useRef<GraphViewport | null>(null)
  const previewFrameRef = useRef<number | null>(null)
  const pendingPreviewRef = useRef<{ point: GraphNodeLayoutPosition; viewport: GraphViewport } | null>(null)
  const [draftPoint, setDraftPoint] = useState<GraphNodeLayoutPosition | null>(null)
  const minimapSize = { width: 162, height: 98 }
  const geometry = useMemo(
    () => createGraphMinimapGeometry(nodes, viewport, minimapSize),
    [nodes, viewport],
  )
  const draftGeometry = useMemo(() => {
    if (!geometry || !draftPoint) return null
    return createGraphMinimapGeometry(
      nodes,
      graphViewportFromMinimapPoint(viewport, draftPoint, geometry),
      minimapSize,
    )
  }, [draftPoint, geometry, nodes, viewport])
  useEffect(() => () => {
    if (previewFrameRef.current !== null) {
      window.cancelAnimationFrame(previewFrameRef.current)
      previewFrameRef.current = null
    }
    pendingPreviewRef.current = null
  }, [])
  if (!geometry) return null

  const pointFromEvent = (event: PointerEvent<HTMLButtonElement>): GraphNodeLayoutPosition => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height),
    }
  }
  const applyPoint = (
    point: GraphNodeLayoutPosition,
    sourceGeometry: NonNullable<ReturnType<typeof createGraphMinimapGeometry>> = geometry,
    sourceViewport: GraphViewport = viewport,
  ) => {
    const nextViewport = graphViewportFromMinimapPoint(sourceViewport, point, sourceGeometry)
    return nextViewport
  }
  const cancelScheduledPreview = () => {
    if (previewFrameRef.current === null) return
    window.cancelAnimationFrame(previewFrameRef.current)
    previewFrameRef.current = null
  }
  const schedulePreview = (
    point: GraphNodeLayoutPosition,
    sourceGeometry: NonNullable<ReturnType<typeof createGraphMinimapGeometry>> = geometry,
    sourceViewport: GraphViewport = viewport,
  ) => {
    pendingPreviewRef.current = {
      point,
      viewport: applyPoint(point, sourceGeometry, sourceViewport),
    }
    if (previewFrameRef.current !== null) return
    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null
      const pending = pendingPreviewRef.current
      pendingPreviewRef.current = null
      if (!pending) return
      setDraftPoint(pending.point)
      onPreviewViewport(pending.viewport)
    })
  }
  return (
    <section className="graph-minimap-panel" aria-label={t("graphCanvas.minimapAria")}>
      <button
        ref={minimapRef}
        type="button"
        className="graph-minimap"
        data-testid="graph-minimap"
        aria-label={t("graphCanvas.minimapNavigate")}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.stopPropagation()
          const point = pointFromEvent(event)
          dragGeometryRef.current = geometry
          dragViewportRef.current = viewport
          schedulePreview(point, geometry, viewport)
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!dragGeometryRef.current) return
          event.stopPropagation()
          const point = pointFromEvent(event)
          schedulePreview(point, dragGeometryRef.current, dragViewportRef.current ?? viewport)
        }}
        onPointerUp={(event) => {
          if (!dragGeometryRef.current) return
          event.stopPropagation()
          const point = pointFromEvent(event)
          cancelScheduledPreview()
          pendingPreviewRef.current = null
          setDraftPoint(null)
          const nextViewport = applyPoint(point, dragGeometryRef.current ?? geometry, dragViewportRef.current ?? viewport)
          onPreviewViewport(nextViewport)
          dragGeometryRef.current = null
          dragViewportRef.current = null
          onCommitViewport(nextViewport)
          event.currentTarget.releasePointerCapture?.(event.pointerId)
        }}
        onPointerCancel={() => {
          cancelScheduledPreview()
          pendingPreviewRef.current = null
          dragGeometryRef.current = null
          dragViewportRef.current = null
          setDraftPoint(null)
          onPreviewViewport(null)
        }}
      >
        <span className="graph-minimap-bounds" aria-hidden="true" />
        {geometry.nodes.map((node) => (
          <span
            key={node.id}
            className="graph-minimap-node"
            style={{ left: `${node.x}px`, top: `${node.y}px` }}
            aria-hidden="true"
          />
        ))}
        <span
          className={`graph-minimap-window ${draftGeometry ? "graph-minimap-window--draft" : ""}`}
          style={minimapWindowStyle((draftGeometry ?? geometry).viewportWindow)}
          aria-label={t("graphCanvas.minimapZoomAria", { value: Math.round(viewport.zoom * 100) })}
        />
      </button>
    </section>
  )
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
  if (projectFilePayload?.kind === "project-files") {
    return {
      source: {
        kind: "project-files",
        files: projectFilePayload.files,
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
  return !target.closest(".graph-node-card, .graph-edge-connect-handle, .graph-barrier-connect-handle, .graph-edge-hitbox, .graph-edge-hit-line, .graph-edge-label, .graph-edge-inline-label-editor, .graph-barrier-hit-line, .graph-barrier-label, .graph-minimap-panel, .parse-candidate-chooser")
}

function isGraphKeyboardScopeTarget(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement) && !(target instanceof SVGElement)) return false
  return Boolean(target.closest(".graph-canvas-surface, .graph-node-card, .graph-edge-hitbox, .graph-edge-hit-line, .graph-edge-label, .graph-edge-inline-label-editor, .graph-barrier-hit-line, .graph-barrier-label, .graph-path-select"))
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

function pointFromPointerEvent(
  event: PointerEvent<HTMLElement>,
  viewport: GraphViewport,
  options: { snap?: boolean } = {},
): CanvasPoint {
  const surface = event.currentTarget.closest(".graph-canvas-surface") as HTMLElement | null
  const snap = options.snap ?? true
  if (!surface) {
    const fallback = { x: event.clientX, y: event.clientY }
    return snap ? canvasPointToGraphNodePosition(fallback) : fallback
  }
  const point = graphPointFromClientPoint(surface, event.clientX, event.clientY, viewport)
  return snap ? canvasPointToGraphNodePosition(point) : point
}

function pointFromClientPoint(
  clientX: number,
  clientY: number,
  viewport: GraphViewport,
  options: { snap?: boolean } = {},
): CanvasPoint {
  const surface = document.querySelector(".graph-canvas-surface") as HTMLElement | null
  const snap = options.snap ?? true
  if (!surface) {
    const fallback = { x: clientX, y: clientY }
    return snap ? canvasPointToGraphNodePosition(fallback) : fallback
  }
  const point = graphPointFromClientPoint(surface, clientX, clientY, viewport)
  return snap ? canvasPointToGraphNodePosition(point) : point
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
    x: clientX - rect.left,
    y: clientY - rect.top,
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

function minimapWindowStyle(rectangle: { left: number; top: number; width: number; height: number }) {
  return {
    left: `${rectangle.left}px`,
    top: `${rectangle.top}px`,
    width: `${rectangle.width}px`,
    height: `${rectangle.height}px`,
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

function defaultEnergyReferenceNodeIdForGraph(
  nodes: GraphNodeSummary[],
  paths: GraphPathSummary[],
  activePathId?: string | null,
): string | null {
  if (nodes.length === 0) return null
  const activePath = activePathId ? paths.find((path) => path.id === activePathId) : undefined
  const path = activePath ?? paths[0]
  const pathNodeId = path?.node_ids.find((nodeId) => nodes.some((node) => node.id === nodeId))
  return pathNodeId ?? nodes[0]?.id ?? null
}

function relativeEnergyValuesByNodeId(
  nodes: GraphNodeSummary[],
  nodeSummaryById: Map<string, CanvasChemicalNodeSummary>,
  referenceNodeId: string | null,
  profile: EnergyProfileSummary | undefined,
  options: CanvasEnergyDisplayOptions,
): Map<string, ResolvedCanvasEnergy> {
  const profileValues = relativeEnergyValuesFromProfile(nodes, referenceNodeId, profile, options)
  const fallbackValues = relativeEnergyValuesFromNodeSummaries(nodes, nodeSummaryById, referenceNodeId)
  if (!profileValues) return fallbackValues
  const values = new Map(profileValues)
  for (const [nodeId, value] of fallbackValues) {
    if (!values.has(nodeId)) values.set(nodeId, value)
  }
  return values
}

function relativeEnergyValuesFromNodeSummaries(
  nodes: GraphNodeSummary[],
  nodeSummaryById: Map<string, CanvasChemicalNodeSummary>,
  referenceNodeId: string | null,
): Map<string, ResolvedCanvasEnergy> {
  const referenceEnergy = referenceNodeId
    ? nodeSummaryById.get(referenceNodeId)?.displayEnergy ?? null
    : null
  if (!referenceEnergy) return new Map()
  const values = new Map<string, ResolvedCanvasEnergy>()
  for (const node of nodes) {
    const energy = nodeSummaryById.get(node.id)?.displayEnergy
    if (!energy || energy.unit !== referenceEnergy.unit || energy.mode !== referenceEnergy.mode) continue
    const relativeValue = energy.value - referenceEnergy.value
    if (!isPlausibleRelativeEnergyValue(relativeValue, energy.unit)) continue
    values.set(node.id, {
      ...energy,
      value: relativeValue,
    })
  }
  return values
}

function relativeEnergyValuesFromProfile(
  nodes: GraphNodeSummary[],
  referenceNodeId: string | null,
  profile: EnergyProfileSummary | undefined,
  options: CanvasEnergyDisplayOptions,
): Map<string, ResolvedCanvasEnergy> | null {
  if (!profile || !profileMatchesCanvasEnergyOptions(profile, options)) return null
  const profileUnit = normalizeEnergyUnit(profile.output_unit)
  if (!profileUnit || profileUnit !== options.unit) return null
  const pointByNodeId = new Map(profile.points.map((point) => [point.node_id, point]))
  if (!nodes.some((node) => pointByNodeId.has(node.id))) return null

  const referencePoint = referenceNodeId ? pointByNodeId.get(referenceNodeId) : undefined
  if (!referencePoint) return null
  const referenceAbsoluteValue = profilePointAbsoluteEnergyValue(referencePoint, options.unit)
  const referenceRelativeValue = profilePointRelativeEnergyValue(referencePoint, profile.output_unit, options.unit)
  const values = new Map<string, ResolvedCanvasEnergy>()
  for (const node of nodes) {
    const point = pointByNodeId.get(node.id)
    if (!point) continue
    const absoluteValue = profilePointAbsoluteEnergyValue(point, options.unit)
    const relativeValueFromAbsolute = referenceAbsoluteValue !== null && absoluteValue !== null
      ? absoluteValue - referenceAbsoluteValue
      : null
    const pointRelativeValue = profilePointRelativeEnergyValue(point, profile.output_unit, options.unit)
    const relativeValueFromProfile = referenceRelativeValue !== null && pointRelativeValue !== null
      ? pointRelativeValue - referenceRelativeValue
      : null
    const relativeValue = relativeValueFromAbsolute ?? relativeValueFromProfile
    if (relativeValue === null || !isPlausibleRelativeEnergyValue(relativeValue, options.unit)) continue
    values.set(node.id, {
      key: profile.energy_key ?? canvasEnergyModeKey(options.mode),
      source: String(profile.energy_source ?? "profile"),
      value: relativeValue,
      unit: options.unit,
      mode: options.mode,
    })
  }
  return values
}

function profileMatchesCanvasEnergyOptions(
  profile: EnergyProfileSummary,
  options: CanvasEnergyDisplayOptions,
): boolean {
  if (normalizeEnergyUnit(profile.output_unit) !== options.unit) return false
  const correctionMode = String(profile.correction_policy?.mode ?? "none")
  if (options.mode === "corrected") {
    return correctionMode !== "none"
  }
  if (correctionMode !== "none") return false
  return profileCanvasEnergyMode(profile) === options.mode
}

function profileCanvasEnergyMode(profile: EnergyProfileSummary): CanvasEnergyMode {
  const key = normalizeEnergyKey(profile.energy_key ?? "")
  if (["gsol", "solution_free_energy", "solvation_free_energy"].includes(key)) return "solvation"
  if (["ggas", "ggas_1m", "gibbs", "free_energy", "gibbs_free_energy"].includes(key)) return "free"
  return "electronic"
}

function normalizeEnergyKey(key: string): string {
  return key.trim().toLowerCase().replace(/[/-]/g, "_")
}

function profilePointAbsoluteEnergyValue(
  point: EnergyProfilePointSummary,
  unit: CanvasEnergyUnit,
): number | null {
  const energy = energyValueFromUnknown(point.expression?.total)
  if (!energy) return null
  return convertEnergyValue(energy.value, energy.unit, unit)
}

function profilePointRelativeEnergyValue(
  point: EnergyProfilePointSummary,
  profileUnit: string,
  unit: CanvasEnergyUnit,
): number | null {
  if (typeof point.relative_energy === "number") {
    return convertEnergyValue(point.relative_energy, profileUnit, unit)
  }
  const energy = energyValueFromUnknown(point.relative_energy)
  if (!energy) return null
  return convertEnergyValue(energy.value, energy.unit, unit)
}

function isPlausibleRelativeEnergyValue(value: number, unit: CanvasEnergyUnit): boolean {
  if (!Number.isFinite(value)) return false
  const magnitude = Math.abs(value)
  if (unit === "hartree") return magnitude <= 20
  if (unit === "kj_mol") return magnitude <= 42000
  return magnitude <= 10000
}

const GraphNodeButton = memo(function GraphNodeButton({
  node,
  summary,
  selected,
  pending,
  pendingTarget,
  barrierSource,
  barrierTarget,
  collapsed,
  activePath,
  dragging,
  displayPosition,
  relativeEnergy,
  energyDisplayMode,
  energyReference,
  cardSize,
  viewportZoom,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onUpdateLabel,
  onRemoveNode,
  onToggleCollapsed,
  onSetEnergyReference,
  solutionLogPairCandidates,
  onPairSolutionLog,
  onOpenStructure,
  onEdgeHandlePointerDown,
  onEdgeHandlePointerMove,
  onEdgeHandlePointerUp,
  onEdgeHandlePointerCancel,
  onBarrierHandlePointerDown,
  onBarrierHandlePointerMove,
  onBarrierHandlePointerUp,
  onBarrierHandlePointerCancel,
  onBarrierHandleClick,
  onResizeNode,
  onClick,
}: {
  node: GraphNodeSummary
  summary: CanvasChemicalNodeSummary
  selected: boolean
  pending: boolean
  pendingTarget: boolean
  barrierSource: boolean
  barrierTarget: boolean
  collapsed: boolean
  activePath: boolean
  dragging: boolean
  displayPosition: GraphNodeLayoutPosition
  relativeEnergy: ResolvedCanvasEnergy | null
  energyDisplayMode: CanvasEnergyMode
  energyReference: boolean
  cardSize: GraphNodeCardSize | null
  viewportZoom: number
  onPointerDown: (node: GraphNodeSummary, event: PointerEvent<HTMLElement>) => void
  onPointerMove: (node: GraphNodeSummary, event: PointerEvent<HTMLElement>) => void
  onPointerUp: (node: GraphNodeSummary, event: PointerEvent<HTMLElement>) => void
  onPointerCancel: (node: GraphNodeSummary) => void
  onUpdateLabel: (request: UpdateGraphNodeLabelRequest) => void
  onRemoveNode: (nodeId: string) => void
  onToggleCollapsed: (nodeId: string) => void
  onSetEnergyReference: (nodeId: string) => void
  solutionLogPairCandidates: NodeSolutionLogPairCandidate[]
  onPairSolutionLog?: (candidate: NodeSolutionLogPairCandidate) => void | Promise<void>
  onOpenStructure: (summary: CanvasChemicalNodeSummary) => void
  onEdgeHandlePointerDown: (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => void
  onEdgeHandlePointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onEdgeHandlePointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onEdgeHandlePointerCancel: () => void
  onBarrierHandlePointerDown: (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => void
  onBarrierHandlePointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onBarrierHandlePointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onBarrierHandlePointerCancel: () => void
  onBarrierHandleClick: (node: GraphNodeSummary, event: MouseEvent<HTMLButtonElement>) => void
  onResizeNode: (nodeId: string, size: GraphNodeCardSize) => void
  onClick: (nodeId: string, event: MouseEvent<HTMLElement>) => void
}) {
  const { t } = useI18n()
  const [draftLabel, setDraftLabel] = useState(summary.structureName)
  const [menuOpen, setMenuOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const resizeDragRef = useRef<NodeResizeSession | null>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!selected) setDraftLabel(summary.structureName)
  }, [selected, summary.structureName])
  useEffect(() => {
    if (!menuOpen) return undefined
    const handleDocumentPointerDown = (event: globalThis.PointerEvent) => {
      const card = cardRef.current
      if (!card || card.contains(event.target as Node)) return
      setMenuOpen(false)
    }
    document.addEventListener("pointerdown", handleDocumentPointerDown, { capture: true })
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown, { capture: true })
  }, [menuOpen])
  useEffect(() => () => {
    resizeCleanupRef.current?.()
    resizeCleanupRef.current = null
  }, [])
  const position = graphNodeCssPosition(displayPosition)
  const shellStyle = {
    ...position,
    ...(cardSize ? {
      "--graph-node-width": `${cardSize.width}px`,
      "--graph-node-height": `${cardSize.height}px`,
    } : {}),
  } as CSSProperties
  const applyNodeResize = (clientX: number, clientY: number): boolean => {
    const resize = resizeDragRef.current
    if (!resize || resize.nodeId !== node.id) return false
    const scale = Math.max(viewportZoom, 0.001)
    onResizeNode(node.id, {
      width: clamp(resize.size.width + (clientX - resize.origin.x) / scale, graphNodeCardSizeBounds.minWidth, graphNodeCardSizeBounds.maxWidth),
      height: clamp(resize.size.height + (clientY - resize.origin.y) / scale, graphNodeCardSizeBounds.minHeight, graphNodeCardSizeBounds.maxHeight),
    })
    return true
  }
  const finishNodeResize = () => {
    resizeDragRef.current = null
    resizeCleanupRef.current?.()
    resizeCleanupRef.current = null
  }
  const startNodeResize = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    event.preventDefault()
    if (collapsed || event.button !== 0) return
    resizeCleanupRef.current?.()
    resizeDragRef.current = {
      nodeId: node.id,
      origin: { x: event.clientX, y: event.clientY },
      size: cardSize ?? defaultGraphNodeCardSize,
    }
    const handleWindowPointerMove = (nativeEvent: globalThis.PointerEvent) => {
      if (!applyNodeResize(nativeEvent.clientX, nativeEvent.clientY)) return
      nativeEvent.preventDefault()
    }
    const handleWindowPointerEnd = (nativeEvent: globalThis.PointerEvent) => {
      if (!resizeDragRef.current) return
      nativeEvent.preventDefault()
      finishNodeResize()
    }
    window.addEventListener("pointermove", handleWindowPointerMove, { capture: true })
    window.addEventListener("pointerup", handleWindowPointerEnd, { capture: true })
    window.addEventListener("pointercancel", handleWindowPointerEnd, { capture: true })
    resizeCleanupRef.current = () => {
      window.removeEventListener("pointermove", handleWindowPointerMove, { capture: true })
      window.removeEventListener("pointerup", handleWindowPointerEnd, { capture: true })
      window.removeEventListener("pointercancel", handleWindowPointerEnd, { capture: true })
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const updateNodeResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!applyNodeResize(event.clientX, event.clientY)) return
    event.stopPropagation()
    event.preventDefault()
  }
  const endNodeResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!resizeDragRef.current) return
    event.stopPropagation()
    event.preventDefault()
    finishNodeResize()
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }
  const applyLabel = () => {
    const label = draftLabel.trim() || summary.structureName
    if (label !== summary.structureName) {
      onUpdateLabel({ nodeId: node.id, label })
    }
    setDraftLabel(label)
  }
  const collapseLabel = collapsed
    ? t("graphCanvas.node.expandStructure", { node: summary.structureName })
    : t("graphCanvas.node.collapseStructure", { node: summary.structureName })
  const compactSummary = `${formatCompactRelativeNodeEnergyValue(relativeEnergy, t)} (${formatNullableNumber(summary.charge, t)},${formatNullableNumber(summary.spinMultiplicity, t)})`
  const chargeSpinOverlay = formatCompactChargeSpin(summary, t)
  const relativeEnergyLabel = relativeEnergySymbol(energyDisplayMode)
  const unpairedSolutionCandidate = energyDisplayMode === "solvation"
    ? solutionLogPairCandidates.find((candidate) => !candidate.paired)
    : undefined
  const showWarningDot = summary.warnings.length > 0 || Boolean(unpairedSolutionCandidate)
  const warningDotLabel = unpairedSolutionCandidate
    ? t("graphCanvas.node.pairSolutionLog", { file: unpairedSolutionCandidate.name })
    : t("graphCanvas.node.warningCount", { count: summary.warnings.length })
  return (
    <div
      className={`graph-node-card-shell ${dragging ? "graph-node-card-shell--dragging" : ""}`}
      style={shellStyle}
      data-graph-node-id={node.id}
    >
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        className={`graph-node-card ${collapsed ? "graph-node-card--collapsed" : ""} ${selected ? "graph-node-card--selected" : ""} ${pending ? "graph-node-card--pending" : ""} ${pendingTarget ? "graph-node-card--pending-target" : ""} ${barrierSource ? "graph-node-card--barrier-source" : ""} ${barrierTarget ? "graph-node-card--barrier-target" : ""} ${activePath ? "graph-node-card--path" : ""} ${dragging ? "graph-node-card--dragging" : ""}`}
        data-graph-node-id={node.id}
        onPointerDown={(event) => onPointerDown(node, event)}
        onPointerMove={(event) => onPointerMove(node, event)}
        onPointerUp={(event) => onPointerUp(node, event)}
        onPointerCancel={() => onPointerCancel(node)}
        onClickCapture={(event) => {
          const target = event.target
          if (!(target instanceof Element) || !target.closest(".molecule-3d-viewer")) return
          onClick(node.id, event as unknown as MouseEvent<HTMLElement>)
        }}
        onClick={(event) => onClick(node.id, event)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            onClick(node.id, event as unknown as MouseEvent<HTMLElement>)
          }
        }}
        aria-current={selected ? "true" : undefined}
      >
        <span className="graph-node-title-row">
          <span
            className="graph-node-traffic-actions"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="graph-node-traffic-button graph-node-traffic-button--delete"
              aria-label={t("graphCanvas.node.delete", { node: summary.structureName })}
              title={t("graphCanvas.node.delete", { node: summary.structureName })}
              onClick={() => onRemoveNode(node.id)}
            >
              <X size={10} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="graph-node-traffic-button graph-node-traffic-button--collapse"
              aria-label={collapseLabel}
              title={collapseLabel}
              onClick={() => onToggleCollapsed(node.id)}
            >
              <Minus size={10} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="graph-node-traffic-button graph-node-traffic-button--more"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t("graphCanvas.node.moreActions", { node: summary.structureName })}
              title={t("graphCanvas.node.moreActions", { node: summary.structureName })}
              onClick={() => setMenuOpen((current) => !current)}
            >
              <MoreHorizontal size={11} aria-hidden="true" />
            </button>
          </span>
          {selected ? (
            <form
              className="graph-node-title-editor"
              onSubmit={(event) => {
                event.preventDefault()
                applyLabel()
                event.currentTarget.querySelector("input")?.blur()
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <input
                className="graph-node-title-input"
                aria-label={t("graphCanvas.node.displayName")}
                value={draftLabel}
                onChange={(event) => setDraftLabel(event.currentTarget.value)}
                onBlur={applyLabel}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === "Escape") {
                    setDraftLabel(summary.structureName)
                    event.currentTarget.blur()
                  }
                }}
              />
            </form>
          ) : (
            <span title={summary.structureName}>{summary.structureName}</span>
          )}
          {showWarningDot ? (
            <span
              className="graph-node-warning-dot"
              title={warningDotLabel}
              aria-label={warningDotLabel}
            />
          ) : null}
          {menuOpen ? (
            <div
              className="graph-node-action-menu"
              role="menu"
              aria-label={t("graphCanvas.node.moreActions", { node: summary.structureName })}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="graph-node-action-menu-value">
                <span>{t("graphCanvas.node.absoluteEnergy")}</span>
                <strong>{formatNodeEnergyValue(summary, t)}</strong>
              </div>
              <button
                type="button"
                role="menuitem"
                className={energyReference ? "graph-node-action-menu-item--active" : ""}
                onClick={() => {
                  onSetEnergyReference(node.id)
                  setMenuOpen(false)
                }}
              >
                <span>{energyReference
                  ? t("graphCanvas.node.referencePoint", { node: summary.structureName })
                  : t("graphCanvas.node.setReferencePoint", { node: summary.structureName })}</span>
              </button>
              {solutionLogPairCandidates.length > 0 ? (
                <div className="graph-node-action-menu-section" role="group" aria-label={t("graphCanvas.node.solutionLogs")}>
                  <span className="graph-node-action-menu-section-title">{t("graphCanvas.node.solutionLogs")}</span>
                  {solutionLogPairCandidates.map((candidate) => (
                    <button
                      key={`${candidate.projectFileId}:${candidate.path}`}
                      type="button"
                      role="menuitem"
                      className={candidate.paired ? "graph-node-action-menu-item--active" : ""}
                      onClick={() => {
                        void onPairSolutionLog?.(candidate)
                        setMenuOpen(false)
                      }}
                      disabled={!onPairSolutionLog}
                    >
                      <span>{candidate.paired
                        ? t("graphCanvas.node.solutionLogPaired", { file: candidate.name })
                        : t("graphCanvas.node.pairSolutionLog", { file: candidate.name })}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </span>
        {!collapsed ? (
          <>
            <span className="graph-node-structure-frame">
              {summary.geometry.length > 0 ? (
                <Molecule3DViewer atoms={summary.geometry} label={summary.structureName} />
              ) : (
                <span className="graph-node-structure-empty">{t("graphCanvas.node.noStructure")}</span>
              )}
              <span className="graph-node-charge-spin-overlay">{chargeSpinOverlay}</span>
              {summary.geometry.length > 0 ? (
                <button
                  type="button"
                  className="graph-node-structure-expand-button"
                  aria-label={t("graphCanvas.node.expand3d", { node: summary.structureName })}
                  title={t("graphCanvas.node.expand3d", { node: summary.structureName })}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onOpenStructure(summary)
                  }}
                >
                  <Maximize2 size={12} aria-hidden="true" />
                </button>
              ) : null}
            </span>
            <span className="graph-node-expanded-summary">
              <GraphNodeDetail label={relativeEnergyLabel} value={formatRelativeNodeEnergyValue(relativeEnergy, t)} emphasized />
            </span>
          </>
        ) : (
          <span className="graph-node-compact-summary">
            <b>{compactSummary}</b>
          </span>
        )}
        <span className="visually-hidden">
          {barrierSource ? t("graphCanvas.node.chooseBarrierTarget", { node: summary.structureName }) : ""}
        </span>
        {!collapsed && summary.formula ? (
          <span className="graph-node-formula" title={summary.formula}>
            {renderFormula(summary.formula)}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className="graph-edge-connect-handle graph-edge-connect-handle--left"
        aria-label={t("graphCanvas.edgeHandleInto", { node: summary.structureName })}
        title={t("graphCanvas.edgeHandleInto", { node: summary.structureName })}
        data-graph-node-id={node.id}
        tabIndex={-1}
        onPointerDown={(event) => {
          event.stopPropagation()
          event.preventDefault()
        }}
      />
      <button
        type="button"
        className="graph-edge-connect-handle graph-edge-connect-handle--right"
        aria-label={t("graphCanvas.edgeHandle", { node: summary.structureName })}
        title={t("graphCanvas.edgeHandle", { node: summary.structureName })}
        data-graph-node-id={node.id}
        onPointerDown={(event) => onEdgeHandlePointerDown(node, event)}
        onPointerMove={(event) => onEdgeHandlePointerMove(event)}
        onPointerUp={(event) => onEdgeHandlePointerUp(event)}
        onPointerCancel={onEdgeHandlePointerCancel}
      />
      <button
        type="button"
        className="graph-barrier-connect-handle"
        aria-label={t("graphCanvas.barrierHandle", { node: summary.structureName })}
        title={t("graphCanvas.barrierHandle", { node: summary.structureName })}
        data-graph-node-id={node.id}
        data-graph-barrier-handle="true"
        onPointerDown={(event) => onBarrierHandlePointerDown(node, event)}
        onPointerMove={(event) => onBarrierHandlePointerMove(event)}
        onPointerUp={(event) => onBarrierHandlePointerUp(event)}
        onPointerCancel={onBarrierHandlePointerCancel}
        onClick={(event) => onBarrierHandleClick(node, event)}
      />
      {!collapsed ? (
        <button
          type="button"
          className="graph-node-resize-handle"
          aria-label={t("graphCanvas.node.resize", { node: summary.structureName })}
          title={t("graphCanvas.node.resize", { node: summary.structureName })}
          onPointerDown={startNodeResize}
          onPointerMove={updateNodeResize}
          onPointerUp={endNodeResize}
          onPointerCancel={endNodeResize}
        />
      ) : null}
    </div>
  )
})

function GraphNodeDetail({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <span className={`graph-node-metric-pill ${emphasized ? "graph-node-metric-pill--emphasized" : ""}`}>
      <small>{label}</small>
      <b>{value}</b>
    </span>
  )
}

function Molecule3DDialog({
  summary,
  onClose,
}: {
  summary: CanvasChemicalNodeSummary
  onClose: () => void
}) {
  const { t } = useI18n()
  const infoLines = [
    `Charge ${formatNullableNumber(summary.charge, t)} / Multiplicity ${formatNullableNumber(summary.spinMultiplicity, t)}`,
    `${summary.atomCount} atoms, ${summary.electronCount ?? t("graphCanvas.none")} electrons`,
  ]
  return (
    <div className="molecule-3d-dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="molecule-3d-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("graphCanvas.node.structureDialog", { node: summary.structureName })}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="molecule-3d-dialog-header">
          <strong>{summary.structureName}</strong>
          <button
            type="button"
            aria-label={t("graphCanvas.node.closeStructureDialog")}
            title={t("graphCanvas.node.closeStructureDialog")}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="molecule-3d-dialog-viewer">
          <Molecule3DViewer
            atoms={summary.geometry}
            label={summary.structureName}
            variant="large"
            interactiveMeasurements
            infoLines={infoLines}
          />
        </div>
      </section>
    </div>
  )
}

function canvasChemicalNodeSummary(
  node: GraphNodeSummary,
  objects: ObjectSummary[],
  energyDisplayOptions: CanvasEnergyDisplayOptions,
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
  const geometry = summarizeNodeGeometry(nodeObjects)
  const charge = summarizeSharedNumber(nodeObjects.map((object) => object.charge))
  return {
    nodeId: node.id,
    structureName,
    formula: summarizeNodeFormula(nodeObjects),
    charge,
    spinMultiplicity: summarizeSharedNumber(nodeObjects.map((object) => object.spin_multiplicity)),
    atomCount: geometry.length,
    electronCount: estimateNodeElectronCount(geometry, charge),
    displayEnergy: resolveCanvasNodeEnergy(composition, objectById, energyDisplayOptions),
    geometry,
    warnings: nodeObjects
      .flatMap((object) => object.warnings ?? [])
      .filter((warning) => warning.code !== "solution_log_paired"),
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

function resolveCanvasNodeEnergy(
  composition: Array<{ object_id: string; coefficient?: number }>,
  objectById: Map<string, ObjectSummary>,
  options: CanvasEnergyDisplayOptions,
): ResolvedCanvasEnergy | null {
  let sum = 0
  let resolvedCount = 0
  for (const term of composition) {
    const object = objectById.get(term.object_id)
    if (!object) continue
    const objectEnergy = resolveObjectCanvasEnergy(object, options.mode)
    if (!objectEnergy) continue
    const converted = convertEnergyValue(objectEnergy.value, objectEnergy.unit, options.unit)
    if (converted === null) continue
    sum += (term.coefficient ?? 1) * converted
    resolvedCount += 1
  }
  if (resolvedCount === 0) return null
  return {
    key: canvasEnergyModeKey(options.mode),
    source: "canvas",
    value: sum,
    unit: options.unit,
    mode: options.mode,
  }
}

function resolveObjectCanvasEnergy(
  object: ObjectSummary,
  mode: CanvasEnergyMode,
): { value: number; unit: string } | null {
  return resolveObjectEnergyValue(object, mode)
}

function canvasEnergyModeKey(mode: CanvasEnergyMode): string {
  if (mode === "free") return "ggas"
  if (mode === "solvation") return "gsol"
  if (mode === "corrected") return "corrected"
  return "egas"
}

function summarizeNodeGeometry(objects: ObjectSummary[]): Atom3DSummary[] {
  for (const object of objects) {
    const geometry = object.geometry ?? []
    if (geometry.length === 0) continue
    const renderableGeometry = geometry
      .map(normalizeRenderableAtom3D)
      .filter((atom): atom is Atom3DSummary => Boolean(atom))
    if (renderableGeometry.length > 0) return renderableGeometry
  }
  return []
}

function renderFormula(formula: string): Array<string | ReactElement> {
  return formula.split(/(\d+)/g).filter(Boolean).map((part, index) => (
    /^\d+$/.test(part)
      ? <sub key={`${part}:${index}`}>{part}</sub>
      : part
  ))
}

function estimateNodeElectronCount(geometry: Atom3DSummary[], charge: number | null): number | null {
  if (geometry.length === 0) return null
  let total = 0
  for (const atom of geometry) {
    const atomicNumber = atomicNumberForElement(String(atom.element ?? ""))
    if (!atomicNumber) return null
    total += atomicNumber
  }
  return total - (charge ?? 0)
}

function atomicNumberForElement(value: string): number | null {
  const element = value.trim().slice(0, 1).toUpperCase() + value.trim().slice(1, 2).toLowerCase()
  const atomicNumbers: Record<string, number> = {
    H: 1,
    B: 5,
    C: 6,
    N: 7,
    O: 8,
    F: 9,
    P: 15,
    S: 16,
    Cl: 17,
    Br: 35,
    I: 53,
    Ni: 28,
    Pd: 46,
  }
  return atomicNumbers[element] ?? null
}

function normalizeRenderableAtom3D(atom: Atom3DSummary): Atom3DSummary | null {
  const x = Number(atom.x)
  const y = Number(atom.y)
  const z = Number(atom.z)
  if (!atom.element || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
  return {
    ...atom,
    element: String(atom.element),
    x,
    y,
    z,
  }
}

function formatNodeEnergyValue(
  summary: CanvasChemicalNodeSummary,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const energy = summary.displayEnergy
  if (!energy) return t("graphCanvas.node.energyMissing")
  if (typeof energy.value === "number") return `${formatCanvasEnergyValue(energy.value, energy.unit)} ${formatCanvasEnergyUnit(energy.unit)}`
  return formatCanvasEnergyUnit(energy.unit)
}

function formatRelativeNodeEnergyValue(
  energy: ResolvedCanvasEnergy | null,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (!energy) return t("graphCanvas.node.energyMissing")
  return formatSignedCanvasEnergyValue(energy.value, energy.unit)
}

function formatCompactRelativeNodeEnergyValue(
  energy: ResolvedCanvasEnergy | null,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (!energy) return t("graphCanvas.node.energyMissing")
  return formatCanvasEnergyValue(energy.value, energy.unit)
}

function formatCanvasEnergyValue(value: number, unit: CanvasEnergyUnit): string {
  if (!Number.isFinite(value)) return String(value)
  const precision = unit === "hartree" ? 6 : 2
  if (Math.abs(value) >= 100000 || (value !== 0 && Math.abs(value) < 0.000001)) return value.toExponential(4)
  return value.toFixed(precision)
}

function formatCanvasEnergyUnit(unit: CanvasEnergyUnit): string {
  if (unit === "kcal_mol") return "kcal/mol"
  if (unit === "kj_mol") return "kJ/mol"
  return "Hartree"
}

function formatSignedCanvasEnergyValue(value: number, unit: CanvasEnergyUnit): string {
  const precision = unit === "hartree" ? 6 : 2
  const rounded = Number.isFinite(value) ? Number(value.toFixed(precision)) : value
  if (!Number.isFinite(rounded)) return `${String(rounded)} ${formatCanvasEnergyUnit(unit)}`
  if (Math.abs(rounded) >= 100000 || (rounded !== 0 && Math.abs(rounded) < 0.000001)) {
    return `${rounded.toExponential(4)} ${formatCanvasEnergyUnit(unit)}`
  }
  return `${rounded.toFixed(precision)} ${formatCanvasEnergyUnit(unit)}`
}

function formatCompactChargeSpin(
  summary: Pick<CanvasChemicalNodeSummary, "charge" | "spinMultiplicity">,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return `${formatNullableNumber(summary.charge, t)},${formatNullableNumber(summary.spinMultiplicity, t)}`
}

function relativeEnergySymbol(mode: CanvasEnergyMode): string {
  if (mode === "free") return "ΔG"
  if (mode === "solvation") return "ΔGsol"
  if (mode === "corrected") return "ΔEcorr"
  return "ΔE"
}

function barrierEnergySymbol(mode: CanvasEnergyMode): string {
  if (mode === "free") return "ΔG"
  if (mode === "solvation") return "ΔGsol"
  if (mode === "corrected") return "ΔEcorr"
  return "ΔE"
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
  return {
    x: nodeOrigin.x + dragging.current.x - dragging.origin.x,
    y: nodeOrigin.y + dragging.current.y - dragging.origin.y,
  }
}

function graphNodesWithDragPreview(
  nodes: GraphNodeSummary[],
  interactionState: GraphEditorInteractionState,
): GraphNodeSummary[] {
  const dragging = interactionState.dragging
  if (!dragging || dragging.kind !== "node") return nodes
  const draggingNodeIds = new Set(dragging.nodeIds)
  return nodes.map((node) => {
    if (!draggingNodeIds.has(node.id)) return node
    const position = draggingNodePosition(interactionState, node)
    return position ? { ...node, position: tuplePosition(position) } : node
  })
}

function createEnergyRankedLayoutPlan({
  graph,
  paths,
  referenceNodeId,
  relativeEnergyByNodeId,
  surfaceSize,
  fitAfterLayout,
}: {
  graph: NonNullable<WorkbenchDomainState["workspace"]>["graph"]
  paths: GraphPathSummary[]
  referenceNodeId: string | null
  relativeEnergyByNodeId: Map<string, ResolvedCanvasEnergy>
  surfaceSize: GraphSurfaceSize
  fitAfterLayout: boolean
}): GraphLayoutPlan {
  const nodes = graph.nodes
  const nodeLayers = energyLayoutNodeLayers(graph, paths, referenceNodeId)
  const order = energyLayoutNodeOrder(nodes, paths, nodeLayers)
  const energies = nodes
    .map((node) => relativeEnergyByNodeId.get(node.id)?.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  const minEnergy = energies.length > 0 ? Math.min(...energies) : 0
  const maxEnergy = energies.length > 0 ? Math.max(...energies) : 0
  const span = maxEnergy - minEnergy
  const xPadding = nodes.length <= 2 ? 150 : 110
  const yTop = 72
  const yBottom = graphNodeLayoutBounds.height - 72
  const nodePositions: Record<string, [number, number]> = {}
  const warnings: GraphLayoutWarning[] = []

  order.forEach((nodeId, index) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) return
    const energy = relativeEnergyByNodeId.get(nodeId)?.value
    const layer = nodeLayers.get(nodeId) ?? index
    const maxLayer = Math.max(...Array.from(nodeLayers.values()), order.length - 1, 0)
    const x = order.length === 1 || maxLayer === 0
      ? xPadding
      : xPadding + (layer / maxLayer) * (graphNodeLayoutBounds.width - xPadding * 2)
    const y = typeof energy === "number" && Number.isFinite(energy) && span > 0
      ? yBottom - ((energy - minEnergy) / span) * (yBottom - yTop)
      : graphNodeLayoutBounds.height / 2
    if (typeof energy !== "number" || !Number.isFinite(energy)) {
      warnings.push({
        code: "layout_missing_energy",
        message: "Node has no usable energy for vertical ranking; it was kept on the center line.",
        target: nodeId,
      })
    }
    nodePositions[nodeId] = tuplePosition(clampGraphNodeLayoutPosition({ x, y }))
  })

  if (energies.length > 0 && span === 0) {
    warnings.push({
      code: "layout_flat_energy",
      message: "All usable node energies are equal; nodes were placed on the center line.",
      target: graph.id,
    })
  }
  if (energies.length === 0) {
    warnings.push({
      code: "layout_no_energy",
      message: "No usable node energies were found; nodes were ordered horizontally on the center line.",
      target: graph.id,
    })
  }

  const changedNodeIds = nodes
    .filter((node) => {
      const position = nodePositions[node.id]
      return position ? !sameTuplePosition(tuplePosition(graphNodePosition(node)), position) : false
    })
    .map((node) => node.id)
  const plannedNodes = nodes.map((node) => ({
    ...node,
    position: nodePositions[node.id] ?? tuplePosition(graphNodePosition(node)),
  }))

  return {
    graphId: graph.id,
    strategy: "energy-ranked",
    nodePositions,
    changedNodeIds,
    viewportIntent: fitAfterLayout ? fitGraphViewportToNodes(plannedNodes, surfaceSize) : null,
    warnings,
  }
}

function energyLayoutNodeOrder(
  nodes: GraphNodeSummary[],
  paths: GraphPathSummary[],
  nodeLayers: Map<string, number>,
): string[] {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const pathOrder = [...paths]
    .sort((left, right) => right.node_ids.length - left.node_ids.length)
    .flatMap((path) => path.node_ids)
    .filter((nodeId) => nodeIds.has(nodeId))
  const seen = new Set<string>()
  const ordered = pathOrder.filter((nodeId) => {
    if (seen.has(nodeId)) return false
    seen.add(nodeId)
    return true
  })
  const remaining = nodes
    .filter((node) => !seen.has(node.id))
    .sort((left, right) => {
      const leftPosition = graphNodePosition(left)
      const rightPosition = graphNodePosition(right)
      return (nodeLayers.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (nodeLayers.get(right.id) ?? Number.MAX_SAFE_INTEGER)
        || leftPosition.x - rightPosition.x
        || leftPosition.y - rightPosition.y
        || left.id.localeCompare(right.id)
    })
    .map((node) => node.id)
  const stableRank = new Map([...ordered, ...remaining].map((nodeId, index) => [nodeId, index]))
  return [...ordered, ...remaining].sort((left, right) => {
    const leftLayer = nodeLayers.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightLayer = nodeLayers.get(right) ?? Number.MAX_SAFE_INTEGER
    if (leftLayer !== rightLayer) return leftLayer - rightLayer
    return (stableRank.get(left) ?? 0) - (stableRank.get(right) ?? 0)
  })
}

function energyLayoutNodeLayers(
  graph: NonNullable<WorkbenchDomainState["workspace"]>["graph"],
  paths: GraphPathSummary[],
  referenceNodeId: string | null,
): Map<string, number> {
  const nodeIds = graph.nodes.map((node) => node.id)
  const validNodeIds = new Set(nodeIds)
  if (nodeIds.length === 0) return new Map()
  const reference = referenceNodeId && validNodeIds.has(referenceNodeId)
    ? referenceNodeId
    : defaultEnergyReferenceNodeIdForGraph(graph.nodes, paths, paths[0]?.id) ?? nodeIds[0]
  const outgoing = new Map(nodeIds.map((nodeId) => [nodeId, [] as string[]]))
  const undirected = new Map(nodeIds.map((nodeId) => [nodeId, [] as string[]]))
  for (const edge of graph.edges) {
    const source = edgeSource(edge)
    const target = edgeTarget(edge)
    if (!validNodeIds.has(source) || !validNodeIds.has(target) || source === target) continue
    outgoing.get(source)?.push(target)
    undirected.get(source)?.push(target)
    undirected.get(target)?.push(source)
  }
  const layers = new Map<string, number>([[reference, 0]])
  assignEnergyLayoutLayersFrom(reference, outgoing, layers)
  assignEnergyLayoutLayersFrom(reference, undirected, layers)
  const pathOrder = energyLayoutPathOrder(paths, validNodeIds)
  let nextLayer = Math.max(0, ...layers.values()) + 1
  for (const nodeId of pathOrder) {
    if (layers.has(nodeId)) continue
    layers.set(nodeId, nextLayer)
    assignEnergyLayoutLayersFrom(nodeId, outgoing, layers)
    nextLayer = Math.max(nextLayer, ...layers.values()) + 1
  }
  for (const node of graph.nodes) {
    if (layers.has(node.id)) continue
    layers.set(node.id, nextLayer)
    nextLayer += 1
  }
  return layers
}

function assignEnergyLayoutLayersFrom(
  startNodeId: string,
  adjacency: Map<string, string[]>,
  layers: Map<string, number>,
): void {
  const queue = [startNodeId]
  while (queue.length > 0) {
    const nodeId = queue.shift()!
    const baseLayer = layers.get(nodeId) ?? 0
    for (const target of [...(adjacency.get(nodeId) ?? [])].sort()) {
      const nextLayer = baseLayer + 1
      const existing = layers.get(target)
      if (existing !== undefined && existing <= nextLayer) continue
      layers.set(target, nextLayer)
      queue.push(target)
    }
  }
}

function energyLayoutPathOrder(paths: GraphPathSummary[], validNodeIds: Set<string>): string[] {
  const seen = new Set<string>()
  return [...paths]
    .sort((left, right) => right.node_ids.length - left.node_ids.length)
    .flatMap((path) => path.node_ids)
    .filter((nodeId) => {
      if (!validNodeIds.has(nodeId) || seen.has(nodeId)) return false
      seen.add(nodeId)
      return true
    })
}

function sameTuplePosition(left: [number, number], right: [number, number]): boolean {
  return left[0] === right[0] && left[1] === right[1]
}

function canvasDragPreviewViewport(
  interactionState: GraphEditorInteractionState,
  viewport: GraphViewport,
): GraphViewport {
  const dragging = interactionState.dragging
  if (!dragging || dragging.kind !== "canvas") return viewport
  return panGraphViewport(viewport, {
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
  nodeSummaryById,
  relativeEnergyByNodeId,
  barrierAnnotations,
  edgeMetrics,
  viewport,
  selectedEdgeIds,
  selectedBarrierAnnotationId,
  editingEdgeLabelId,
  pendingEdge,
  pendingBarrier,
  edgeLabelDraft,
  edgeLabelPending,
  edgeLabelError,
  onSelectEdge,
  onEditEdgeLabel,
  onEdgeLabelDraftChange,
  onResetEdgeLabelDraft,
  onClearEdgeLabelDraft,
  onApplyEdgeLabelDraft,
  onSelectBarrierAnnotation,
  onRemoveBarrierAnnotation,
  onUpdateBarrierAnnotationLabel,
}: {
  nodes: GraphNodeSummary[]
  edges: GraphEdgeSummary[]
  objectById: Map<string, ObjectSummary>
  nodeSummaryById: Map<string, CanvasChemicalNodeSummary>
  relativeEnergyByNodeId: Map<string, ResolvedCanvasEnergy>
  barrierAnnotations: CanvasBarrierAnnotation[]
  edgeMetrics: GraphEdgeMetrics
  viewport: GraphViewport
  selectedEdgeIds: Set<string>
  selectedBarrierAnnotationId?: string | null
  editingEdgeLabelId?: string | null
  pendingEdge?: PendingEdgeDraft | null
  pendingBarrier?: PendingBarrierDraft | null
  edgeLabelDraft: EdgeLabelDraftState
  edgeLabelPending: boolean
  edgeLabelError: ShellError | null
  onSelectEdge: (edgeId: string, mode?: GraphEditorSelectionMode) => void
  onEditEdgeLabel: (edgeId: string) => void
  onEdgeLabelDraftChange: (label: string) => void
  onResetEdgeLabelDraft: () => void
  onClearEdgeLabelDraft: () => void
  onApplyEdgeLabelDraft: () => void
  onSelectBarrierAnnotation: (annotationId: string) => void
  onRemoveBarrierAnnotation: (annotationId: string) => void
  onUpdateBarrierAnnotationLabel: (annotationId: string, label: string | null) => void
}) {
  const { t } = useI18n()
  const segments = edges.map((edge) => {
    const source = nodes.find((node) => node.id === edgeSource(edge))
    const target = nodes.find((node) => node.id === edgeTarget(edge))
    if (!source || !target) return null
    return {
      id: edge.id,
      sourceId: source.id,
      targetId: target.id,
      sourcePosition: graphNodePosition(source),
      targetPosition: graphNodePosition(target),
      sourceLabel: graphNodeDisplayName(source, objectById),
      targetLabel: graphNodeDisplayName(target, objectById),
      label: edge.label ?? null,
    }
  }).filter(Boolean) as Array<{
    id: string
    sourceId: string
    targetId: string
    sourcePosition: GraphNodeLayoutPosition
    targetPosition: GraphNodeLayoutPosition
    sourceLabel: string
    targetLabel: string
    label: string | null
  }>
  const siblingCountByPair = new Map<string, number>()
  for (const segment of segments) {
    const key = graphEdgePairKey(segment.sourceId, segment.targetId)
    siblingCountByPair.set(key, (siblingCountByPair.get(key) ?? 0) + 1)
  }
  const siblingIndexByPair = new Map<string, number>()
  const curvedSegments = segments.map((segment) => {
    const key = graphEdgePairKey(segment.sourceId, segment.targetId)
    const siblingIndex = siblingIndexByPair.get(key) ?? 0
    siblingIndexByPair.set(key, siblingIndex + 1)
    return createGraphEdgeSegment({
      ...segment,
      siblingIndex,
      siblingCount: siblingCountByPair.get(key) ?? 1,
      edgeMetrics,
    })
  })
  const svgSize = edgeMetrics.surfaceSize
  const pendingSegment = pendingEdgeSegment(nodes, pendingEdge ?? null, edgeMetrics)
  const pendingBarrierSegment = pendingBarrier
    ? pendingBarrierAnnotationSegment(nodes, pendingBarrier, edgeMetrics, viewport, svgSize)
    : null
  const barrierSegments = barrierAnnotations
    .map((annotation) => createBarrierAnnotationSegment(annotation, nodes, nodeSummaryById, relativeEnergyByNodeId, edgeMetrics, viewport, svgSize))
    .filter((segment): segment is GraphBarrierAnnotationSegment => Boolean(segment))

  return (
    <div
      className="graph-edge-layer"
      data-barrier-annotation-count={barrierAnnotations.length}
      data-barrier-segment-count={barrierSegments.length}
    >
      <svg
        className="graph-edge-svg"
        aria-hidden="true"
        viewBox={`0 0 ${svgSize.width} ${svgSize.height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <marker
            id="graph-barrier-arrowhead"
            viewBox="0 0 8 8"
            markerWidth="7"
            markerHeight="7"
            refX="4"
            refY="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" className="graph-barrier-arrowhead" />
          </marker>
        </defs>
        {pendingSegment ? (
          <g className="graph-edge-pending">
            <path
              className="graph-edge-pending-line"
              d={graphEdgeScreenPath(pendingSegment, viewport, svgSize)}
            />
          </g>
        ) : null}
        {curvedSegments.map((segment) => (
          <g key={segment.id} className={selectedEdgeIds.has(segment.id) ? "graph-edge--selected" : ""}>
            <path
              className="graph-edge-hit-line"
              d={graphEdgeScreenPath(segment, viewport, svgSize)}
              onPointerDown={(event) => {
                event.stopPropagation()
                event.preventDefault()
              }}
              onClick={(event) => {
                event.stopPropagation()
                onSelectEdge(segment.id, selectionModeFromMouseEvent(event as unknown as MouseEvent<HTMLElement>))
              }}
            />
            <path
              className="graph-edge-line"
              d={graphEdgeScreenPath(segment, viewport, svgSize)}
            />
          </g>
        ))}
        {pendingBarrierSegment ? (
          <path className="graph-barrier-pending-line" d={pendingBarrierSegment.path} />
        ) : null}
        {barrierSegments.map((segment) => (
          <g
            key={segment.id}
            className={`graph-barrier-annotation ${selectedBarrierAnnotationId === segment.id ? "graph-barrier-annotation--selected" : ""}`}
          >
            <path
              className="graph-barrier-hit-line"
              d={segment.guidePath}
              onPointerDown={(event) => {
                event.stopPropagation()
                onSelectBarrierAnnotation(segment.id)
                event.preventDefault()
              }}
              onClick={(event) => {
                event.stopPropagation()
                onSelectBarrierAnnotation(segment.id)
              }}
            />
            <path
              className="graph-barrier-hit-line"
              d={segment.arrowPath}
              onPointerDown={(event) => {
                event.stopPropagation()
                onSelectBarrierAnnotation(segment.id)
                event.preventDefault()
              }}
              onClick={(event) => {
                event.stopPropagation()
                onSelectBarrierAnnotation(segment.id)
              }}
            />
            <path className="graph-barrier-guide" d={segment.guidePath} />
            <path className="graph-barrier-arrow" d={segment.arrowPath} />
          </g>
        ))}
      </svg>
      {barrierSegments.map((segment) => (
        <button
          key={`${segment.id}:hitbox`}
          type="button"
          aria-label={t("graphCanvas.barrier.select", {
            source: segment.sourceLabel,
            target: segment.targetLabel,
          })}
          className={`graph-barrier-hitbox ${selectedBarrierAnnotationId === segment.id ? "graph-barrier-hitbox--selected" : ""}`}
          style={{ left: `${segment.hitPoint.x}px`, top: `${segment.hitPoint.y}px` }}
          onPointerDown={(event) => {
            event.stopPropagation()
            onSelectBarrierAnnotation(segment.id)
          }}
          onClick={(event) => {
            event.stopPropagation()
            onSelectBarrierAnnotation(segment.id)
          }}
        />
      ))}
      {pendingSegment ? (
        <span
          className="graph-edge-end-marker graph-edge-end-marker--pending"
          style={edgeScreenPointStyle(pendingSegment.to, viewport, svgSize)}
          aria-hidden="true"
        />
      ) : null}
      {curvedSegments.map((segment) => (
        <span
          key={`${segment.id}:marker`}
          className="graph-edge-end-marker"
          style={edgeScreenPointStyle(segment.to, viewport, svgSize)}
          aria-hidden="true"
        />
      ))}
      {curvedSegments.map((segment) => {
        const selected = selectedEdgeIds.has(segment.id)
        const editing = editingEdgeLabelId === segment.id
        if (editing) {
          return (
            <EdgeInlineLabelEditor
              key={`${segment.id}:label-editor`}
              segment={segment}
              draft={edgeLabelDraft}
              pending={edgeLabelPending}
              error={edgeLabelError}
              style={edgeScreenPointStyle(segment.labelPoint, viewport, svgSize)}
              onDraftChange={onEdgeLabelDraftChange}
              onReset={onResetEdgeLabelDraft}
              onClear={onClearEdgeLabelDraft}
              onApply={onApplyEdgeLabelDraft}
            />
          )
        }
        return segment.label || selected ? (
          <button
            type="button"
            key={`${segment.id}:label`}
            className={`graph-edge-label ${selected ? "graph-edge-label--selected" : ""} ${segment.label ? "" : "graph-edge-label--placeholder"}`}
            style={edgeScreenPointStyle(segment.labelPoint, viewport, svgSize)}
            aria-label={t("graphCanvas.edge.editLabel", {
              source: segment.sourceLabel,
              target: segment.targetLabel,
            })}
            onPointerDown={(event) => {
              event.stopPropagation()
              event.preventDefault()
            }}
            onClick={(event) => {
              event.stopPropagation()
              onEditEdgeLabel(segment.id)
            }}
          >
            {segment.label || t("edgeLabelEditor.placeholder")}
          </button>
        ) : null
      })}
      {barrierSegments.map((segment) => selectedBarrierAnnotationId === segment.id ? (
        <BarrierInlineLabelEditor
          key={`${segment.id}:label-editor`}
          segment={segment}
          style={{ left: `${segment.labelPoint.x}px`, top: `${segment.labelPoint.y}px` }}
          onApply={(label) => onUpdateBarrierAnnotationLabel(segment.id, label)}
        />
      ) : (
        <button
          key={`${segment.id}:label`}
          type="button"
          className="graph-barrier-label"
          style={{ left: `${segment.labelPoint.x}px`, top: `${segment.labelPoint.y}px` }}
          aria-label={t("graphCanvas.barrier.editLabel", {
            source: segment.sourceLabel,
            target: segment.targetLabel,
          })}
          onPointerDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
          }}
          onClick={(event) => {
            event.stopPropagation()
            onSelectBarrierAnnotation(segment.id)
          }}
        >
          {segment.label}
        </button>
      ))}
      {curvedSegments.map((segment) => {
        const selected = selectedEdgeIds.has(segment.id)
        return (
          <button
            key={segment.id}
            type="button"
            aria-label={`Edge ${segment.sourceLabel} to ${segment.targetLabel}${segment.label ? `: ${segment.label}` : ""}`}
            className={`graph-edge-hitbox ${selected ? "graph-edge-hitbox--selected" : ""}`}
            style={edgeScreenPointStyle(segment.hitPoint, viewport, svgSize)}
            onPointerDown={(event) => {
              event.stopPropagation()
              event.preventDefault()
            }}
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

function EdgeInlineLabelEditor({
  segment,
  draft,
  pending,
  error,
  style,
  onDraftChange,
  onReset,
  onClear,
  onApply,
}: {
  segment: GraphEdgeSegment
  draft: EdgeLabelDraftState
  pending: boolean
  error: ShellError | null
  style: { left: string; top: string }
  onDraftChange: (label: string) => void
  onReset: () => void
  onClear: () => void
  onApply: () => void
}) {
  const { t } = useI18n()
  const value = draft.edgeId === segment.id ? draft.label : segment.label ?? ""
  const dirty = draft.edgeId === segment.id && draft.dirty
  const disabled = pending || draft.edgeId !== segment.id
  const submittedRef = useRef(false)
  const latestSubmitStateRef = useRef({ dirty, disabled, onApply })
  useEffect(() => {
    latestSubmitStateRef.current = { dirty, disabled, onApply }
    if (!dirty) submittedRef.current = false
  }, [dirty, disabled, onApply])
  const submit = useCallback(() => {
    const latest = latestSubmitStateRef.current
    if (submittedRef.current || !latest.dirty || latest.disabled) return
    submittedRef.current = true
    latest.onApply()
  }, [])
  useEffect(() => () => submit(), [submit])
  return (
    <form
      className={`graph-edge-inline-label-editor ${error ? "graph-edge-inline-label-editor--error" : ""}`}
      style={style}
      aria-label={t("edgeLabelEditor.aria")}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={t("edgeLabelEditor.placeholder")}
        aria-label={t("edgeLabelEditor.label")}
        autoFocus
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        onBlur={() => window.setTimeout(submit, 0)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === "Escape") {
            onReset()
            event.currentTarget.blur()
          }
        }}
      />
      <button
        type="button"
        disabled={disabled || !value}
        aria-label={t("edgeLabelEditor.clear")}
        title={t("edgeLabelEditor.clear")}
        onClick={onClear}
      >
        <X size={11} aria-hidden="true" />
      </button>
      {pending ? <small>{t("edgeLabelEditor.applying")}</small> : null}
      {error ? <small>{error.code}</small> : null}
    </form>
  )
}

function BarrierInlineLabelEditor({
  segment,
  style,
  onApply,
}: {
  segment: GraphBarrierAnnotationSegment
  style: { left: string; top: string }
  onApply: (label: string | null) => void
}) {
  const { t } = useI18n()
  const [value, setValue] = useState(segment.label)
  const submittedRef = useRef(false)
  const latestSubmitStateRef = useRef({
    value: segment.label,
    defaultLabel: segment.defaultLabel,
    label: segment.label,
    onApply,
  })
  useEffect(() => {
    setValue(segment.label)
    submittedRef.current = false
  }, [segment.label])
  useEffect(() => {
    latestSubmitStateRef.current = {
      value,
      defaultLabel: segment.defaultLabel,
      label: segment.label,
      onApply,
    }
  }, [onApply, segment.defaultLabel, segment.label, value])
  const submit = useCallback(() => {
    if (submittedRef.current) return
    const latest = latestSubmitStateRef.current
    const nextValue = latest.value.trim()
    const nextLabel = nextValue && nextValue !== latest.defaultLabel ? nextValue : null
    const currentLabel = latest.label === latest.defaultLabel ? null : latest.label
    if (nextLabel === currentLabel) return
    submittedRef.current = true
    latest.onApply(nextLabel)
  }, [])
  useEffect(() => () => submit(), [submit])
  return (
    <form
      className="graph-barrier-label graph-barrier-label--selected graph-barrier-inline-label-editor"
      style={style}
      aria-label={t("graphCanvas.barrier.editor")}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <input
        type="text"
        value={value}
        aria-label={t("graphCanvas.barrier.label")}
        placeholder={segment.defaultLabel}
        autoFocus
        onChange={(event) => setValue(event.currentTarget.value)}
        onBlur={() => window.setTimeout(submit, 0)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === "Escape") {
            setValue(segment.label)
            event.currentTarget.blur()
          }
        }}
      />
    </form>
  )
}

function createBarrierAnnotationSegment(
  annotation: CanvasBarrierAnnotation,
  nodes: GraphNodeSummary[],
  nodeSummaryById: Map<string, CanvasChemicalNodeSummary>,
  relativeEnergyByNodeId: Map<string, ResolvedCanvasEnergy>,
  edgeMetrics: GraphEdgeMetrics,
  viewport: GraphViewport,
  surfaceSize: GraphSurfaceSize,
): GraphBarrierAnnotationSegment | null {
  const source = nodes.find((node) => node.id === annotation.sourceNodeId)
  const target = nodes.find((node) => node.id === annotation.targetNodeId)
  if (!source || !target) return null
  const sourceEnergy = relativeEnergyByNodeId.get(source.id) ?? null
  const targetEnergy = relativeEnergyByNodeId.get(target.id) ?? null
  if (!sourceEnergy || !targetEnergy || sourceEnergy.unit !== targetEnergy.unit) return null
  const sourcePosition = graphNodePosition(source)
  const targetPosition = graphNodePosition(target)
  const sourceBottom = graphPointToScreenPoint(graphNodeBottomAnchor(sourcePosition, edgeMetrics), surfaceSize, viewport)
  const targetRight = graphPointToScreenPoint(graphNodeEdgeAnchor(targetPosition, "right", edgeMetrics), surfaceSize, viewport)
  const arrowX = clamp(sourceBottom.x, 34, Math.max(34, surfaceSize.width - 34))
  const sourceY = clamp(sourceBottom.y + 18, 26, Math.max(26, surfaceSize.height - 26))
  const targetY = clamp(targetRight.y, 26, Math.max(26, surfaceSize.height - 26))
  const topY = Math.min(sourceY, targetY)
  const bottomY = Math.max(sourceY, targetY)
  const arrowTop = topY === bottomY ? Math.max(18, topY - 26) : topY
  const arrowBottom = topY === bottomY ? Math.min(surfaceSize.height - 18, bottomY + 26) : bottomY
  const labelValue = targetEnergy.value - sourceEnergy.value
  const defaultLabel = `${barrierEnergySymbol(sourceEnergy.mode)}‡ ${formatCanvasEnergyValue(labelValue, sourceEnergy.unit)}`
  const targetGuideY = sourceY > targetY ? arrowTop : arrowBottom
  const labelY = (arrowTop + arrowBottom) / 2
  return {
    id: annotation.id,
    arrowPath: `M ${roundPathCoordinate(arrowX)} ${roundPathCoordinate(arrowTop)} L ${roundPathCoordinate(arrowX)} ${roundPathCoordinate(arrowBottom)}`,
    guidePath: [
      `M ${roundPathCoordinate(sourceBottom.x)} ${roundPathCoordinate(sourceBottom.y)}`,
      `L ${roundPathCoordinate(arrowX)} ${roundPathCoordinate(sourceY)}`,
      `M ${roundPathCoordinate(targetRight.x)} ${roundPathCoordinate(targetRight.y)}`,
      `L ${roundPathCoordinate(arrowX)} ${roundPathCoordinate(targetGuideY)}`,
    ].join(" "),
    label: annotation.label?.trim() || defaultLabel,
    defaultLabel,
    labelPoint: {
      x: arrowX,
      y: labelY,
    },
    hitPoint: { x: arrowX, y: labelY },
    sourceLabel: nodeSummaryById.get(source.id)?.structureName ?? source.label ?? source.id,
    targetLabel: nodeSummaryById.get(target.id)?.structureName ?? target.label ?? target.id,
  }
}

function pendingBarrierAnnotationSegment(
  nodes: GraphNodeSummary[],
  pendingBarrier: PendingBarrierDraft,
  edgeMetrics: GraphEdgeMetrics,
  viewport: GraphViewport,
  surfaceSize: GraphSurfaceSize,
): { path: string } | null {
  const source = nodes.find((node) => node.id === pendingBarrier.fromNodeId)
  if (!source) return null
  const sourcePosition = graphNodePosition(source)
  const target = pendingBarrier.targetNodeId
    ? nodes.find((node) => node.id === pendingBarrier.targetNodeId)
    : undefined
  const targetPosition = target ? graphNodePosition(target) : pendingBarrier.pointerGraphPosition
  const from = graphPointToScreenPoint(
    { x: sourcePosition.x, y: sourcePosition.y + edgeMetrics.nodeHalfHeight },
    surfaceSize,
    viewport,
  )
  const to = graphPointToScreenPoint(
    target
      ? { x: targetPosition.x + edgeMetrics.nodeHalfWidth, y: targetPosition.y }
      : targetPosition,
    surfaceSize,
    viewport,
  )
  const vertical = Math.abs(to.y - from.y)
  const bend = clamp(Math.max(36, vertical * 0.42), 36, 120)
  const controlFrom = { x: from.x, y: from.y + (to.y >= from.y ? bend : -bend) }
  const controlTo = { x: to.x, y: to.y + (to.y >= from.y ? -bend : bend) }
  return {
    path: `M ${roundPathCoordinate(from.x)} ${roundPathCoordinate(from.y)} C ${roundPathCoordinate(controlFrom.x)} ${roundPathCoordinate(controlFrom.y)}, ${roundPathCoordinate(controlTo.x)} ${roundPathCoordinate(controlTo.y)}, ${roundPathCoordinate(to.x)} ${roundPathCoordinate(to.y)}`,
  }
}

function pendingEdgeSegment(
  nodes: GraphNodeSummary[],
  pendingEdge: PendingEdgeDraft | null,
  edgeMetrics: GraphEdgeMetrics,
): GraphEdgeSegment | null {
  if (!pendingEdge || pendingEdge.source !== "pointer") return null
  const source = nodes.find((node) => node.id === pendingEdge.fromNodeId)
  if (!source) return null
  const target = pendingEdge.targetNodeId
    ? nodes.find((node) => node.id === pendingEdge.targetNodeId)
    : undefined
  const targetPosition = target ? graphNodePosition(target) : pendingEdge.pointerGraphPosition
  if (!targetPosition) return null
  return createGraphEdgeSegment({
    id: "pending",
    sourceId: source.id,
    targetId: target?.id ?? "pointer",
    sourcePosition: graphNodePosition(source),
    targetPosition,
    sourceLabel: source.label ?? source.id,
    targetLabel: target?.label ?? "pointer",
    label: null,
    siblingIndex: 0,
    siblingCount: 1,
    targetAnchored: Boolean(target),
    edgeMetrics,
  })
}

function graphEdgePairKey(sourceId: string, targetId: string): string {
  return `${sourceId}->${targetId}`
}

function createGraphEdgeSegment({
  id,
  sourceId,
  targetId,
  sourcePosition,
  targetPosition,
  sourceLabel,
  targetLabel,
  label,
  siblingIndex,
  siblingCount,
  edgeMetrics,
  targetAnchored = true,
}: {
  id: string
  sourceId: string
  targetId: string
  sourcePosition: GraphNodeLayoutPosition
  targetPosition: GraphNodeLayoutPosition
  sourceLabel: string
  targetLabel: string
  label: string | null
  siblingIndex: number
  siblingCount: number
  edgeMetrics: GraphEdgeMetrics
  targetAnchored?: boolean
}): GraphEdgeSegment {
  const siblingOffset = (siblingIndex - (siblingCount - 1) / 2) * 18
  const from = graphNodeEdgeAnchor(sourcePosition, "right", edgeMetrics, siblingOffset)
  const to = targetAnchored
    ? graphNodeEdgeAnchor(targetPosition, "left", edgeMetrics, siblingOffset)
    : {
      x: targetPosition.x,
      y: targetPosition.y,
    }
  const horizontalDistance = Math.abs(to.x - from.x)
  const verticalDistance = Math.abs(to.y - from.y)
  const controlDistance = edgeControlDistance(horizontalDistance, verticalDistance)
  const controlFrom = {
    x: from.x + controlDistance,
    y: from.y,
  }
  const controlTo = {
    x: to.x - controlDistance,
    y: to.y,
  }
  const hitPoint = cubicBezierPoint(from, controlFrom, controlTo, to, 0.5)
  const labelPoint = cubicBezierPoint(from, controlFrom, controlTo, to, 0.48)
  return {
    id,
    sourceId,
    targetId,
    from,
    to,
    controlFrom,
    controlTo,
    labelPoint: {
      x: labelPoint.x,
      y: labelPoint.y,
    },
    hitPoint,
    path: `M ${roundPathCoordinate(from.x)} ${roundPathCoordinate(from.y)} C ${roundPathCoordinate(controlFrom.x)} ${roundPathCoordinate(controlFrom.y)}, ${roundPathCoordinate(controlTo.x)} ${roundPathCoordinate(controlTo.y)}, ${roundPathCoordinate(to.x)} ${roundPathCoordinate(to.y)}`,
    sourceLabel,
    targetLabel,
    label,
  }
}

function edgeControlDistance(horizontalDistance: number, verticalDistance: number): number {
  const baseDistance = Math.max(horizontalDistance, verticalDistance * 0.22)
  return clamp(baseDistance * 0.34, 8, 96)
}

function graphNodeEdgeAnchor(
  position: GraphNodeLayoutPosition,
  side: "left" | "right",
  edgeMetrics: GraphEdgeMetrics,
  verticalOffset = 0,
): GraphNodeLayoutPosition {
  return {
    x: position.x + (side === "right" ? edgeMetrics.nodeHalfWidth : -edgeMetrics.nodeHalfWidth),
    y: position.y + verticalOffset,
  }
}

function graphNodeBottomAnchor(
  position: GraphNodeLayoutPosition,
  edgeMetrics: GraphEdgeMetrics,
): GraphNodeLayoutPosition {
  return {
    x: position.x,
    y: position.y + edgeMetrics.nodeHalfHeight,
  }
}

const defaultGraphEdgeMetrics: GraphEdgeMetrics = {
  surfaceSize: {
    width: graphNodeLayoutBounds.width,
    height: graphNodeLayoutBounds.height,
  },
  nodeHalfWidth: 95,
  nodeHalfHeight: 92,
}

const defaultGraphNodeCardSize: GraphNodeCardSize = {
  width: 218,
  height: 244,
}

const graphNodeCardSizeBounds = {
  minWidth: 190,
  maxWidth: 360,
  minHeight: 214,
  maxHeight: 460,
}

function graphEdgeMetricsFromSurface(surface: HTMLElement, viewportZoom: number): GraphEdgeMetrics {
  const surfaceSize = surfaceSizeFromElement(surface)
  const shell = surface.querySelector<HTMLElement>(".graph-node-card-shell")
  const measuredShellWidth = shell ? shell.getBoundingClientRect().width / Math.max(viewportZoom, 0.001) : null
  const measuredShellHeight = shell ? shell.getBoundingClientRect().height / Math.max(viewportZoom, 0.001) : null
  const nodeWidth = measuredShellWidth && Number.isFinite(measuredShellWidth) && measuredShellWidth > 0
    ? measuredShellWidth
    : responsiveGraphNodeCardWidth(surfaceSize.width)
  const nodeHeight = measuredShellHeight && Number.isFinite(measuredShellHeight) && measuredShellHeight > 0
    ? measuredShellHeight
    : 184
  return {
    surfaceSize,
    nodeHalfWidth: (nodeWidth / 2) * (graphNodeLayoutBounds.width / Math.max(surfaceSize.width, 1)),
    nodeHalfHeight: (nodeHeight / 2) * (graphNodeLayoutBounds.height / Math.max(surfaceSize.height, 1)),
  }
}

function responsiveGraphNodeCardWidth(surfaceWidth: number): number {
  const preferred = surfaceWidth <= 620
    ? surfaceWidth * 0.42
    : surfaceWidth * 0.24
  const min = surfaceWidth <= 620 ? 150 : 168
  const max = surfaceWidth <= 620 ? 184 : 210
  return clamp(preferred, min, max)
}

function graphEdgeMetricsEqual(left: GraphEdgeMetrics, right: GraphEdgeMetrics): boolean {
  return Math.abs(left.surfaceSize.width - right.surfaceSize.width) < 0.5
    && Math.abs(left.surfaceSize.height - right.surfaceSize.height) < 0.5
    && Math.abs(left.nodeHalfWidth - right.nodeHalfWidth) < 0.25
    && Math.abs(left.nodeHalfHeight - right.nodeHalfHeight) < 0.25
}

function cubicBezierPoint(
  p0: GraphNodeLayoutPosition,
  p1: GraphNodeLayoutPosition,
  p2: GraphNodeLayoutPosition,
  p3: GraphNodeLayoutPosition,
  t: number,
): GraphNodeLayoutPosition {
  const oneMinusT = 1 - t
  return {
    x: oneMinusT ** 3 * p0.x
      + 3 * oneMinusT ** 2 * t * p1.x
      + 3 * oneMinusT * t ** 2 * p2.x
      + t ** 3 * p3.x,
    y: oneMinusT ** 3 * p0.y
      + 3 * oneMinusT ** 2 * t * p1.y
      + 3 * oneMinusT * t ** 2 * p2.y
      + t ** 3 * p3.y,
  }
}

function roundPathCoordinate(value: number): number {
  return Math.round(value * 100) / 100
}

function nodeIdFromPoint(
  clientX: number,
  clientY: number,
  nodes: GraphNodeSummary[],
  excludedNodeId?: string,
): string | null {
  const validNodeIds = new Set(nodes.map((node) => node.id))
  if (typeof document.elementsFromPoint !== "function") {
    return null
  }
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    const nodeElement = element.closest<HTMLElement>("[data-graph-node-id]")
    const nodeId = nodeElement?.dataset.graphNodeId
    if (nodeId && nodeId !== excludedNodeId && validNodeIds.has(nodeId)) return nodeId
  }
  return null
}

function graphEdgeScreenPath(
  segment: GraphEdgeSegment,
  viewport: GraphViewport,
  surfaceSize: GraphSurfaceSize,
): string {
  const from = graphPointToScreenPoint(segment.from, surfaceSize, viewport)
  const controlFrom = graphPointToScreenPoint(segment.controlFrom, surfaceSize, viewport)
  const controlTo = graphPointToScreenPoint(segment.controlTo, surfaceSize, viewport)
  const to = graphPointToScreenPoint(segment.to, surfaceSize, viewport)
  return `M ${roundPathCoordinate(from.x)} ${roundPathCoordinate(from.y)} C ${roundPathCoordinate(controlFrom.x)} ${roundPathCoordinate(controlFrom.y)}, ${roundPathCoordinate(controlTo.x)} ${roundPathCoordinate(controlTo.y)}, ${roundPathCoordinate(to.x)} ${roundPathCoordinate(to.y)}`
}

function edgeScreenPointStyle(
  point: GraphNodeLayoutPosition,
  viewport: GraphViewport,
  surfaceSize: GraphSurfaceSize,
): { left: string; top: string } {
  const screenPoint = graphPointToScreenPoint(point, surfaceSize, viewport)
  return {
    left: `${screenPoint.x}px`,
    top: `${screenPoint.y}px`,
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
  if (status.state === "auto" || status.state === "manual") return null
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

function graphViewportNearlyEqual(left: GraphViewport, right: GraphViewport): boolean {
  return Math.abs(left.x - right.x) < 0.001
    && Math.abs(left.y - right.y) < 0.001
    && Math.abs(left.zoom - right.zoom) < 0.001
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
