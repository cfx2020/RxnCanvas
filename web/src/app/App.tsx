import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react"
import { Download, Moon, PanelLeft, PanelRight, Plus, Sun } from "lucide-react"
import {
  defaultReportExportOptions,
  type ReportExportOptions,
} from "../domain/reportExports"
import {
  parseProjectPackage,
  type CanvasViewport,
  type FlowBarrier,
  type FlowEdge,
  type FlowNode,
  type ManualStructurePayload,
  type Point,
  type ProjectSummary,
  type SourceFile,
} from "../domain/projectPackages"
import type { ParsedEnergyUnit } from "../domain/sourceParsers"
import {
  autoLayoutFlowNodes,
  clamp,
  defaultCanvasViewportForSize,
  fallbackCanvasSize,
  fitViewportToNodesForSize,
  maxCanvasZoom,
  minCanvasZoom,
  worldPointFromClientPoint,
} from "./canvasGeometry"
import {
  canvasBarrierSelectionTransition,
  canvasEdgeSelectionTransition,
  canvasNodeSelectionTransition,
  hasCanvasSelection as selectionHasItems,
  keyboardConnectionEdgeTransition,
  keyboardConnectionSourceTransition,
  lastSelectedId,
  type CanvasDragState,
  type CanvasSelectionIds,
} from "./canvasEditState"
import {
  defaultEnergyDisplayOptions,
  energyTableNodeSelectionTransition,
  energyTableRows,
  relativeEnergyZeroNode,
  relativeEnergyZeroSelectionTransition,
  type EnergyDisplayOptions,
} from "./energyDisplay"
import {
  pendingImportProjectTransition,
  type CandidateReviewState,
  type ImportSourceFile,
  type StageSourceFilesOptions,
} from "./importRegistration"
import {
  deleteSourceFileTransition,
  nodeSourceDetailsSelection,
  selectSourceFileTransition,
} from "./fileDisplay"
import {
  canvasEditSnapshot,
  emptyProjectWorkspace,
  initialBarriers,
  initialEdges,
  initialFiles,
  initialNodes,
  initialProjectWorkspaces,
  initialProjects,
  projectWorkspaceSnapshot,
  type CanvasEditSnapshot,
  type ProjectWorkspaceSnapshot,
  type WorkbenchViewMode,
} from "./projectWorkspace"
import {
  canvasTabSnapshotFromState,
  canvasTabsFromProjectCanvases,
  closeCanvasTabState,
  createCanvasTabState,
  deleteCanvasTabState,
  initialCanvasTabs,
  projectCanvasesFromCanvasTabs,
  renameCanvasTabState,
  switchCanvasTabState,
  type CanvasTabSnapshot,
  type CanvasTabState,
} from "./projectCanvasState"
import {
  CanvasSurface,
  MiniMap,
  canvasSizeFromElement,
  type BarrierDraft,
  type CanvasRawFileDrop,
  type ConnectionDraft,
  type GraphSelectionMode,
} from "./CanvasWorkspace"
import {
  CandidateReviewSheet,
  InspectorPanel,
  StructurePreviewDialog,
  sourceCoordinatePreview,
  sourceFileForNode,
  type InspectorMode,
} from "./InspectorPanels"
import { type DesktopEngineStatus } from "./desktopRuntime"
import { Molecule2DEditorDialog } from "./Molecule2DEditorDialog"
import {
  invalidProjectPackageValidation,
  projectPackageRestoreTransitionFromContent,
  serializeProjectPackage,
  type ProjectValidationPayload,
} from "./projectPackageWorkflow"
import { ProjectRail, type FileSelectionOptions } from "./ProjectRail"
import { EnergyTableView, ExportDock, type ExportedReportArtifact } from "./ReportPanels"
import { WorkbenchToolbar } from "./WorkbenchToolbar"
import {
  clampToolbarPlacement,
  defaultFloatingToolbarPlacement,
  resolveToolbarDropPlacement,
  type ToolbarMetrics,
  type ToolbarPlacement,
} from "./toolbarPlacement"
import {
  applyCanvasSelectionState,
  applyProjectTransitionState,
  applyProjectWorkspaceSnapshotState,
  type ProjectTransitionApplication,
} from "./appStateAppliers"
import {
  autosaveProjectPackageToRuntime,
  forgetProjectInRuntime,
  openProjectPackageFromRuntime,
  restoreStartupProjectFromRuntime,
  saveProjectPackageToRuntime,
  setActiveProjectInRuntime,
  subscribeProjectPackageRuntimeMenus,
  type RestoreProjectPackageHandler,
  type RestoreProjectPackageOptions,
  watchDesktopEngineStatus,
} from "./appRuntimeEffects"
import {
  applyCanvasSelectionTransitionState,
  applyNodeSourceDetailsSelectionState,
  applySourceFileDeletionState,
  applySourceFileSelectionState,
} from "./appSelectionAppliers"
import {
  subscribeCanvasWheel,
  subscribeConnectionDraftPointer,
} from "./appCanvasEffects"
import { exportSelectedReportFormats } from "./appReportExport"
import { createProjectAction, deleteProjectAction, openProjectAction } from "./appProjectActions"
import { handleCanvasKeyboardEvent } from "./appCanvasKeyboardActions"
import {
  clearCanvasEditHistoryState,
  clearCanvasSelectionAction,
  deleteCanvasSelectionAction,
  nudgeSelectedNodesAction,
  pushCanvasEditHistoryState,
  redoCanvasEditAction,
  undoCanvasEditAction,
  updateBarrierLabelAction,
  updateEdgeLabelAction,
  updateNodeCoefficientAction,
  updateNodeManualStructureAction,
  type CanvasEditHistorySetters,
} from "./appCanvasEditActions"
import {
  completeConnectionToNodeAction,
  endCanvasPointerAction,
  finishConnectionDraftAtClientPointAction,
  handleCanvasPointerDownAction,
  handleNodePointerDownAction,
  handlePointerMoveAction,
  startBarrierAnnotationAction,
  startConnectionAction,
} from "./appCanvasPointerActions"
import {
  handleCanvasRawFileDropAction,
  importDesktopFilesAction,
  importFilesForProjectAction,
  openImportPickerAction,
  registerCandidateReviewAction,
  reviewCandidatesForFileAction,
  stageCurrentProjectSourceFilesAction,
  stageSourceFilesForProjectAction,
  toggleCandidateReviewSelectionAction,
} from "./appImportActions"


function defaultCanvasViewport(canvas: HTMLDivElement | null): CanvasViewport {
  return defaultCanvasViewportForSize(canvasSizeFromElement(canvas, fallbackCanvasSize))
}

function fitViewportToNodes(nodes: FlowNode[], canvas: HTMLDivElement | null): CanvasViewport {
  return fitViewportToNodesForSize(nodes, canvasSizeFromElement(canvas, fallbackCanvasSize))
}

type AppTheme = "light" | "dark"

type ProjectAutosaveInput = {
  project: ProjectSummary
  files: SourceFile[]
  canvases: ReturnType<typeof projectCanvasesFromCanvasTabs>
  activeCanvasId: string
}

type ProjectRestoreRuntimeState = {
  projects: ProjectSummary[]
  workspaces: Record<string, ProjectWorkspaceSnapshot>
  activeProjectId: string
  activeSnapshot: ProjectWorkspaceSnapshot
}

function initialAppTheme(): AppTheme {
  if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") return "light"
  return window.localStorage.getItem("rxnflow-theme") === "dark" ? "dark" : "light"
}

function initialToolbarPlacement(): ToolbarPlacement {
  if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") {
    return { mode: "floating", x: 0, y: 10 }
  }
  try {
    const raw = window.localStorage.getItem("rxnflow-toolbar-placement")
    if (!raw) return { mode: "floating", x: 0, y: 10 }
    const parsed = JSON.parse(raw) as Partial<ToolbarPlacement>
    if (parsed.mode === "left" || parsed.mode === "right") {
      return { mode: parsed.mode, y: Number.isFinite((parsed as { y?: number }).y) ? Number((parsed as { y?: number }).y) : 10 }
    }
    if (parsed.mode === "floating") {
      return {
        mode: "floating",
        x: Number.isFinite((parsed as { x?: number }).x) ? Number((parsed as { x?: number }).x) : 0,
        y: Number.isFinite((parsed as { y?: number }).y) ? Number((parsed as { y?: number }).y) : 10,
      }
    }
  } catch {
    // ignore malformed state
  }
  return { mode: "floating", x: 0, y: 10 }
}

export function App() {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const canvasStageRef = useRef<HTMLDivElement | null>(null)
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const projectInputRef = useRef<HTMLInputElement | null>(null)
  const pendingImportProjectIdRef = useRef<string | null>(null)
  const autosaveHydratedRef = useRef(false)
  const autosaveKeyRef = useRef<string | null>(null)
  const autosaveInputRef = useRef<ProjectAutosaveInput | null>(null)
  const autosaveInFlightRef = useRef(false)
  const autosaveQueuedRef = useRef(false)
  const projectRestoreStateRef = useRef<ProjectRestoreRuntimeState | null>(null)
  const restoreProjectPackageRef = useRef<RestoreProjectPackageHandler | null>(null)
  const exportPanelRef = useRef<HTMLElement | null>(null)
  const exportTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [projects, setProjects] = useState(initialProjects)
  const [projectWorkspaces, setProjectWorkspaces] = useState<Record<string, ProjectWorkspaceSnapshot>>(() => initialProjectWorkspaces(defaultCanvasViewport(null)))
  const [activeProjectId, setActiveProjectId] = useState(initialProjects[0].id)
  const [files, setFiles] = useState(initialFiles)
  const [nodes, setNodes] = useState(initialNodes)
  const [edges, setEdges] = useState(initialEdges)
  const [barriers, setBarriers] = useState(initialBarriers)
  const [viewport, setViewport] = useState<CanvasViewport>(() => defaultCanvasViewport(null))
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(["ts-endo"])
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([])
  const [selectedBarrierIds, setSelectedBarrierIds] = useState<string[]>([])
  const [selectedFileId, setSelectedFileId] = useState<string | null>(initialFiles[0].id)
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([initialFiles[0].id])
  const [lastSelectedFileId, setLastSelectedFileId] = useState<string | null>(initialFiles[0].id)
  const [dragState, setDragState] = useState<CanvasDragState<CanvasEditSnapshot> | null>(null)
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null)
  const [barrierDraft, setBarrierDraft] = useState<BarrierDraft | null>(null)
  const [tool, setTool] = useState<"select" | "pan">("select")
  const [viewMode, setViewMode] = useState<WorkbenchViewMode>("canvas")
  const [tableDrawerMounted, setTableDrawerMounted] = useState(false)
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("inspector")
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const [leftRailPreviewOpen, setLeftRailPreviewOpen] = useState(false)
  const [canvasTabs, setCanvasTabs] = useState<CanvasTabState[]>(() => initialCanvasTabs(initialProjects[0].label))
  const [activeCanvasTabId, setActiveCanvasTabId] = useState("canvas-1")
  const [keyboardEdgeSourceId, setKeyboardEdgeSourceId] = useState<string | null>(null)
  const [exportOptions, setExportOptions] = useState<ReportExportOptions>({ ...defaultReportExportOptions })
  const [exportArtifacts, setExportArtifacts] = useState<ExportedReportArtifact[]>([])
  const [exportBusy, setExportBusy] = useState(false)
  const [exportStatus, setExportStatus] = useState("No report artifacts exported in this session.")
  const [energyDisplayOptions, setEnergyDisplayOptions] = useState<EnergyDisplayOptions>({ ...defaultEnergyDisplayOptions })
  const [engineStatus, setEngineStatus] = useState<DesktopEngineStatus | null>(null)
  const [projectValidation, setProjectValidation] = useState<ProjectValidationPayload | null>(null)
  const [candidateReview, setCandidateReview] = useState<CandidateReviewState | null>(null)
  const [candidateRegisterBusy, setCandidateRegisterBusy] = useState(false)
  const [structurePreviewNodeId, setStructurePreviewNodeId] = useState<string | null>(null)
  const [structureEditorNodeId, setStructureEditorNodeId] = useState<string | null>(null)
  const [historyPast, setHistoryPast] = useState<CanvasEditSnapshot[]>([])
  const [historyFuture, setHistoryFuture] = useState<CanvasEditSnapshot[]>([])
  const [theme, setTheme] = useState<AppTheme>(() => initialAppTheme())
  const [toolbarPlacement, setToolbarPlacement] = useState<ToolbarPlacement>(() => initialToolbarPlacement())
  const [toolbarMetrics, setToolbarMetrics] = useState<ToolbarMetrics | null>(null)
  const toolbarDragOffsetRef = useRef<Point | null>(null)
  const toolbarDragMetricsRef = useRef<ToolbarMetrics | null>(null)
  const toolbarDragPlacementRef = useRef<{ x: number; y: number } | null>(null)
  const toolbarFloatingSizeRef = useRef<{ width: number; height: number } | null>(null)

  const appStateSetters = useMemo(() => ({
    setProjects,
    setProjectWorkspaces,
    setActiveProjectId,
    setProjectValidation,
    setFiles,
    setNodes,
    setEdges,
    setBarriers,
    setViewport,
    setSelectedNodeIds,
    setSelectedEdgeIds,
    setSelectedBarrierIds,
    setSelectedFileId,
    setSelectedFileIds,
    setLastSelectedFileId,
    setEnergyDisplayOptions,
    setViewMode,
    setInspectorMode,
    setKeyboardEdgeSourceId,
    setConnectionDraft,
    setBarrierDraft,
    setDragState,
    setCandidateReview,
    setCandidateRegisterBusy,
    setStructurePreviewNodeId,
    setStructureEditorNodeId,
  }), [])

  const canvasEditHistorySetters = useMemo<CanvasEditHistorySetters>(() => ({
    setHistoryPast,
    setHistoryFuture,
  }), [])

  const selectedNodeId = lastSelectedId(selectedNodeIds)
  const selectedEdgeId = lastSelectedId(selectedEdgeIds)
  const selectedBarrierId = lastSelectedId(selectedBarrierIds)
  const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null
  const selectedEdge = selectedEdgeId ? edges.find((edge) => edge.id === selectedEdgeId) ?? null : null
  const selectedBarrier = selectedBarrierId ? barriers.find((barrier) => barrier.id === selectedBarrierId) ?? null : null
  const selectedFile = selectedFileId ? files.find((file) => file.id === selectedFileId) ?? null : null
  const structurePreviewNode = structurePreviewNodeId ? nodes.find((node) => node.id === structurePreviewNodeId) ?? null : null
  const structureEditorNode = structureEditorNodeId ? nodes.find((node) => node.id === structureEditorNodeId) ?? null : null
  const tableDrawerOpen = viewMode === "table"
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0]
  const currentCanvasSnapshot = useMemo(() => canvasTabSnapshotFromState({
    nodes,
    edges,
    barriers,
    viewport,
    selectedNodeIds,
    selectedEdgeIds,
    selectedBarrierIds,
  }), [barriers, edges, nodes, selectedBarrierIds, selectedEdgeIds, selectedNodeIds, viewport])
  const projectCanvases = useMemo(() => projectCanvasesFromCanvasTabs({
    tabs: canvasTabs,
    activeTabId: activeCanvasTabId,
    activeSnapshot: currentCanvasSnapshot,
  }), [activeCanvasTabId, canvasTabs, currentCanvasSnapshot])
  const openCanvasTabs = useMemo(() => canvasTabs.filter((tab) => !tab.closed), [canvasTabs])
  const autosaveInput = useMemo<ProjectAutosaveInput>(() => ({
    project: activeProject,
    files,
    canvases: projectCanvases,
    activeCanvasId: activeCanvasTabId,
  }), [activeCanvasTabId, activeProject, files, projectCanvases])
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const activeProjectLabel = activeProject?.label ?? "Untitled Study"
  const isMacDesktop = window.rxnflowDesktop?.platform === "darwin"
  const nodeIdSet = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes])
  const energyRowsSignature = useMemo(
    () => buildEnergyRowsSignature(nodes, edges, energyDisplayOptions),
    [edges, energyDisplayOptions, nodes],
  )
  const energyRows = useMemo(
    () => energyTableRows(nodes, energyDisplayOptions, edges),
    [energyRowsSignature],
  )
  const relativeZeroNodeId = useMemo(
    () => relativeEnergyZeroNode(nodes, energyDisplayOptions, edges)?.id ?? null,
    [edges, energyDisplayOptions, nodes],
  )
  const hasCanvasSelection = selectionHasItems({
    nodeIds: selectedNodeIds,
    edgeIds: selectedEdgeIds,
    barrierIds: selectedBarrierIds,
  })
  const pointerMoveFrameRef = useRef<number | null>(null)
  const pendingPointerMoveRef = useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null)

  useLayoutEffect(() => {
    const updateToolbarMetrics = () => {
      const stage = canvasStageRef.current
      const toolbar = toolbarRef.current
      if (!stage || !toolbar) return
      const stageRect = stage.getBoundingClientRect()
      const toolbarRect = toolbar.getBoundingClientRect()
      const nextMetrics: ToolbarMetrics = {
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        toolbarWidth: toolbarRect.width,
        toolbarHeight: toolbarRect.height,
      }
      setToolbarMetrics(nextMetrics)
      if (toolbarPlacement.mode === "floating") {
        toolbarFloatingSizeRef.current = {
          width: toolbarRect.width,
          height: toolbarRect.height,
        }
      }
      setToolbarPlacement((current) => {
        const seeded = current.mode === "floating" && current.x === 0
          ? defaultFloatingToolbarPlacement(nextMetrics)
          : current
        return clampToolbarPlacement(seeded, nextMetrics)
      })
    }

    updateToolbarMetrics()
    window.addEventListener("resize", updateToolbarMetrics)
    return () => window.removeEventListener("resize", updateToolbarMetrics)
  }, [leftSidebarOpen, rightSidebarOpen, toolbarPlacement.mode, viewMode])

  useEffect(() => {
    if (typeof window.localStorage?.setItem !== "function") return
    window.localStorage.setItem("rxnflow-toolbar-placement", JSON.stringify(toolbarPlacement))
  }, [toolbarPlacement])

  useEffect(() => {
    if (tableDrawerOpen) {
      setTableDrawerMounted(true)
      return
    }
    const timeout = window.setTimeout(() => setTableDrawerMounted(false), 280)
    return () => window.clearTimeout(timeout)
  }, [tableDrawerOpen])

  useEffect(() => {
    if (!tableDrawerOpen) return
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setViewMode("canvas")
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [tableDrawerOpen])

  const handleToolbarDragStart = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const stage = canvasStageRef.current
    const toolbar = toolbarRef.current
    const currentMetrics = toolbarMetrics
    if (!stage || !toolbar || !currentMetrics) return
    const stageRect = stage.getBoundingClientRect()
    const toolbarRect = toolbar.getBoundingClientRect()
    const floatingSize = toolbarFloatingSizeRef.current
    const dragMetrics: ToolbarMetrics = toolbarPlacement.mode === "floating"
      ? currentMetrics
      : {
          stageWidth: currentMetrics.stageWidth,
          stageHeight: currentMetrics.stageHeight,
          toolbarWidth: floatingSize?.width ?? 722,
          toolbarHeight: floatingSize?.height ?? 50,
        }
    const floatingSeed: { mode: "floating"; x: number; y: number } = toolbarPlacement.mode === "floating"
      ? toolbarPlacement
      : {
          mode: "floating" as const,
          x: toolbarPlacement.mode === "right" ? stageRect.width - dragMetrics.toolbarWidth - 10 : 10,
          y: toolbarPlacement.y,
        }
    const seededPlacementResult = clampToolbarPlacement(floatingSeed, dragMetrics)
    const seededPlacement = {
      x: seededPlacementResult.mode === "floating" ? seededPlacementResult.x : floatingSeed.x,
      y: seededPlacementResult.y,
    }
    toolbarDragOffsetRef.current = toolbarPlacement.mode === "floating"
      ? {
          x: event.clientX - toolbarRect.left,
          y: event.clientY - toolbarRect.top,
        }
      : {
          x: dragMetrics.toolbarWidth / 2,
          y: Math.min(
            Math.max(event.clientY - toolbarRect.top, 12),
            Math.max(12, dragMetrics.toolbarHeight - 12),
          ),
        }
    toolbarDragMetricsRef.current = dragMetrics
    toolbarDragPlacementRef.current = seededPlacement
    setToolbarPlacement({ mode: "floating", x: seededPlacement.x, y: seededPlacement.y })
    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const currentStage = canvasStageRef.current
      const dragOffset = toolbarDragOffsetRef.current
      const metrics = toolbarDragMetricsRef.current
      if (!currentStage || !dragOffset || !metrics) return
      const stageBounds = currentStage.getBoundingClientRect()
      const nextX = moveEvent.clientX - stageBounds.left - dragOffset.x
      const nextY = moveEvent.clientY - stageBounds.top - dragOffset.y
      const nextPlacementResult = clampToolbarPlacement({ mode: "floating", x: nextX, y: nextY }, metrics)
      const nextPlacement = {
        x: nextPlacementResult.mode === "floating" ? nextPlacementResult.x : nextX,
        y: nextPlacementResult.y,
      }
      toolbarDragPlacementRef.current = nextPlacement
      setToolbarPlacement({ mode: "floating", x: nextPlacement.x, y: nextPlacement.y })
    }
    const handlePointerUp = () => {
      if (!toolbarDragOffsetRef.current) return
      const metrics = toolbarDragMetricsRef.current
      const candidate = toolbarDragPlacementRef.current
      toolbarDragOffsetRef.current = null
      toolbarDragMetricsRef.current = null
      toolbarDragPlacementRef.current = null
      if (metrics) {
        const floatingCandidate = candidate ?? seededPlacement
        setToolbarPlacement(resolveToolbarDropPlacement(floatingCandidate, metrics))
      }
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  }, [toolbarMetrics, toolbarPlacement])

  const toolbarStyle = useMemo(() => {
    if (!toolbarMetrics) return undefined
    if (toolbarPlacement.mode === "floating") {
      return {
        "--rxnflow-toolbar-left": `${toolbarPlacement.x}px`,
        "--rxnflow-toolbar-top": `${toolbarPlacement.y}px`,
        "--rxnflow-toolbar-right": "auto",
        "--rxnflow-toolbar-transform": "none",
      } as CSSProperties
    }
    if (toolbarPlacement.mode === "right") {
      return {
        "--rxnflow-toolbar-left": "auto",
        "--rxnflow-toolbar-right": "10px",
        "--rxnflow-toolbar-top": `${toolbarPlacement.y}px`,
        "--rxnflow-toolbar-transform": "none",
      } as CSSProperties
    }
    return {
      "--rxnflow-toolbar-left": "10px",
      "--rxnflow-toolbar-right": "auto",
      "--rxnflow-toolbar-top": `${toolbarPlacement.y}px`,
      "--rxnflow-toolbar-transform": "none",
    } as CSSProperties
  }, [toolbarMetrics, toolbarPlacement])

  const applyCanvasSelection = useCallback((selection: CanvasSelectionIds) => {
    applyCanvasSelectionState(appStateSetters, selection)
  }, [appStateSetters])

  const currentEditSnapshot = useCallback(
    () => canvasEditSnapshot(nodes, edges, barriers, selectedNodeIds, selectedEdgeIds, selectedBarrierIds),
    [barriers, edges, nodes, selectedBarrierIds, selectedEdgeIds, selectedNodeIds],
  )

  const clearEditHistory = useCallback(() => {
    clearCanvasEditHistoryState(canvasEditHistorySetters)
  }, [canvasEditHistorySetters])

  const pushEditHistory = useCallback(
    (snapshot: CanvasEditSnapshot = currentEditSnapshot()) => {
      pushCanvasEditHistoryState(canvasEditHistorySetters, snapshot)
    },
    [canvasEditHistorySetters, currentEditSnapshot],
  )

  const currentProjectWorkspaceSnapshot = useCallback(() => projectWorkspaceSnapshot({
    files,
    canvases: projectCanvases,
    activeCanvasId: activeCanvasTabId,
    nodes,
    edges,
    barriers,
    viewport,
    selectedNodeIds,
    selectedEdgeIds,
    selectedBarrierIds,
    selectedFileId,
    selectedFileIds,
    lastSelectedFileId,
    energyDisplayOptions,
    viewMode,
    inspectorMode,
  }), [
    energyDisplayOptions,
    files,
    inspectorMode,
    lastSelectedFileId,
    selectedFileId,
    selectedFileIds,
    activeCanvasTabId,
    projectCanvases,
    viewMode,
  ])

  const currentCanvasTabSnapshot = useCallback((): CanvasTabSnapshot => currentCanvasSnapshot, [currentCanvasSnapshot])

  const applyCanvasTabSnapshot = useCallback((snapshot: CanvasTabSnapshot) => {
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
    setBarriers(snapshot.barriers)
    setViewport(snapshot.viewport)
    setSelectedNodeIds(snapshot.selectedNodeIds)
    setSelectedEdgeIds(snapshot.selectedEdgeIds)
    setSelectedBarrierIds(snapshot.selectedBarrierIds)
    clearEditHistory()
  }, [clearEditHistory])

  const applyProjectWorkspaceSnapshot = useCallback((snapshot: ProjectWorkspaceSnapshot) => {
    setCanvasTabs(canvasTabsFromProjectCanvases(snapshot.canvases))
    setActiveCanvasTabId(snapshot.activeCanvasId)
    applyProjectWorkspaceSnapshotState(appStateSetters, snapshot, clearEditHistory)
  }, [appStateSetters, clearEditHistory])

  const applyProjectTransition = useCallback((transition: ProjectTransitionApplication) => {
    setCanvasTabs(canvasTabsFromProjectCanvases(transition.activeSnapshot.canvases))
    setActiveCanvasTabId(transition.activeSnapshot.activeCanvasId)
    applyProjectTransitionState(appStateSetters, transition, clearEditHistory)
  }, [appStateSetters, clearEditHistory])

  const switchCanvasTab = useCallback((tabId: string) => {
    const currentSnapshot = currentCanvasTabSnapshot()
    const transition = switchCanvasTabState({
      tabs: canvasTabs,
      activeTabId: activeCanvasTabId,
      nextTabId: tabId,
      currentSnapshot,
    })
    if (!transition) return
    setCanvasTabs(transition.tabs)
    setActiveCanvasTabId(transition.activeTabId)
    applyCanvasTabSnapshot(transition.snapshotToApply)
  }, [activeCanvasTabId, applyCanvasTabSnapshot, canvasTabs, currentCanvasTabSnapshot])

  const createCanvasTab = useCallback((projectId?: string) => {
    const targetProjectId = typeof projectId === "string" && projectId.length > 0 ? projectId : activeProjectId
    const currentSnapshot = currentCanvasTabSnapshot()
    const id = `canvas-${Date.now()}`
    const blankSnapshot: CanvasTabSnapshot = {
      nodes: [],
      edges: [],
      barriers: [],
      viewport: defaultCanvasViewport(canvasRef.current),
      selectedNodeIds: [],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
    }
    if (targetProjectId !== activeProjectId) {
      const targetProject = projects.find((project) => project.id === targetProjectId)
      const targetWorkspace = projectWorkspaceSnapshot(
        projectWorkspaces[targetProjectId] ?? emptyProjectWorkspace(defaultCanvasViewport(canvasRef.current), targetProject?.label),
      )
      const targetTabs = canvasTabsFromProjectCanvases(targetWorkspace.canvases)
      const targetCurrentSnapshot = canvasTabSnapshotFromWorkspace(targetWorkspace)
      const targetTransition = createCanvasTabState({
        tabs: targetTabs,
        activeTabId: targetWorkspace.activeCanvasId,
        currentSnapshot: targetCurrentSnapshot,
        blankSnapshot,
        nextId: id,
        nextLabel: nextCanvasLabel(targetProject?.label ?? targetWorkspace.canvases[0]?.label ?? activeProjectLabel, targetTabs),
      })
      const activeSnapshot = projectWorkspaceSnapshot({
        ...targetWorkspace,
        canvases: projectCanvasesFromCanvasTabs({
          tabs: targetTransition.tabs,
          activeTabId: targetTransition.activeTabId,
          activeSnapshot: blankSnapshot,
        }),
        activeCanvasId: targetTransition.activeTabId,
        nodes: blankSnapshot.nodes,
        edges: blankSnapshot.edges,
        barriers: blankSnapshot.barriers,
        viewport: blankSnapshot.viewport,
        selectedNodeIds: blankSnapshot.selectedNodeIds,
        selectedEdgeIds: blankSnapshot.selectedEdgeIds,
        selectedBarrierIds: blankSnapshot.selectedBarrierIds,
        viewMode: "canvas",
      })
      applyProjectTransition({
        workspaces: {
          ...projectWorkspaces,
          [activeProjectId]: projectWorkspaceSnapshot(currentProjectWorkspaceSnapshot()),
          [targetProjectId]: activeSnapshot,
        },
        activeProjectId: targetProjectId,
        activeSnapshot,
        validation: null,
      })
      setCanvasTabs(targetTransition.tabs)
      setActiveCanvasTabId(targetTransition.activeTabId)
      setViewMode("canvas")
      return
    }
    const transition = createCanvasTabState({
      tabs: canvasTabs,
      activeTabId: activeCanvasTabId,
      currentSnapshot,
      blankSnapshot,
      nextId: id,
      nextLabel: nextCanvasLabel(activeProjectLabel, canvasTabs),
    })
    setCanvasTabs(transition.tabs)
    setActiveCanvasTabId(transition.activeTabId)
    applyCanvasTabSnapshot(transition.snapshotToApply)
    setViewMode("canvas")
  }, [
    activeCanvasTabId,
    activeProjectId,
    activeProjectLabel,
    applyCanvasTabSnapshot,
    applyProjectTransition,
    canvasTabs,
    currentCanvasTabSnapshot,
    currentProjectWorkspaceSnapshot,
    projectWorkspaces,
    projects,
  ])

  const renameCanvasTab = useCallback((tabId: string, label: string) => {
    setCanvasTabs((current) => renameCanvasTabState({ tabs: current, tabId, label }))
  }, [])

  const closeCanvasTab = useCallback((tabId: string) => {
    const currentSnapshot = currentCanvasTabSnapshot()
    const transition = closeCanvasTabState({
      tabs: canvasTabs,
      activeTabId: activeCanvasTabId,
      closedTabId: tabId,
      currentSnapshot,
    })
    if (!transition) return
    setCanvasTabs(transition.tabs)
    setActiveCanvasTabId(transition.activeTabId)
    applyCanvasTabSnapshot(transition.snapshotToApply)
  }, [activeCanvasTabId, applyCanvasTabSnapshot, canvasTabs, currentCanvasTabSnapshot])

  const deleteCanvasTab = useCallback((tabId: string) => {
    const currentSnapshot = currentCanvasTabSnapshot()
    const transition = deleteCanvasTabState({
      tabs: canvasTabs,
      activeTabId: activeCanvasTabId,
      deletedTabId: tabId,
      currentSnapshot,
    })
    if (!transition) return
    setCanvasTabs(transition.tabs)
    setActiveCanvasTabId(transition.activeTabId)
    applyCanvasTabSnapshot(transition.snapshotToApply)
    setViewMode("canvas")
  }, [activeCanvasTabId, applyCanvasTabSnapshot, canvasTabs, currentCanvasTabSnapshot])

  useEffect(() => {
    projectRestoreStateRef.current = {
      projects,
      workspaces: projectWorkspaces,
      activeProjectId,
      activeSnapshot: currentProjectWorkspaceSnapshot(),
    }
  }, [activeProjectId, currentProjectWorkspaceSnapshot, projectWorkspaces, projects])


  const undoEdit = useCallback(() => {
    undoCanvasEditAction({
      historyPast,
      historyFuture,
      currentSnapshot: currentEditSnapshot(),
      setters: canvasEditHistorySetters,
      appStateSetters,
    })
  }, [appStateSetters, canvasEditHistorySetters, currentEditSnapshot, historyFuture, historyPast])

  const redoEdit = useCallback(() => {
    redoCanvasEditAction({
      historyPast,
      historyFuture,
      currentSnapshot: currentEditSnapshot(),
      setters: canvasEditHistorySetters,
      appStateSetters,
    })
  }, [appStateSetters, canvasEditHistorySetters, currentEditSnapshot, historyFuture, historyPast])

  const resetCanvasViewport = useCallback(() => {
    setViewport(defaultCanvasViewport(canvasRef.current))
  }, [])

  const fitCanvasViewport = useCallback(() => {
    setViewport(fitViewportToNodes(nodes, canvasRef.current))
  }, [nodes])

  const applyAutoLayout = useCallback(() => {
    if (nodes.length === 0) return
    pushEditHistory()
    const nextNodes = autoLayoutFlowNodes(nodes, energyDisplayOptions, edges)
    setNodes(nextNodes)
    setViewport(fitViewportToNodes(nextNodes, canvasRef.current))
  }, [edges, energyDisplayOptions, nodes, pushEditHistory])

  useEffect(() => {
    resetCanvasViewport()
  }, [resetCanvasViewport])

  useEffect(() => {
    if (typeof window.localStorage?.setItem === "function") {
      window.localStorage.setItem("rxnflow-theme", theme)
    }
  }, [theme])

  const screenToWorld = useCallback(
    (point: Point) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      return worldPointFromClientPoint(point, { x: rect?.left ?? 0, y: rect?.top ?? 0 }, viewport)
    },
    [viewport],
  )

  useEffect(() => subscribeCanvasWheel({
    canvas: viewMode === "canvas" ? canvasRef.current : null,
    setViewport,
  }), [activeCanvasTabId, viewMode])

  const handleCanvasPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      handleCanvasPointerDownAction({
        event,
        connectionDraft,
        barrierDraft,
        tool,
        viewport,
        screenToWorld,
        appStateSetters,
      })
    },
    [appStateSetters, barrierDraft, connectionDraft, screenToWorld, tool, viewport],
  )

  const handleNodePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>, node: FlowNode) => {
      handleNodePointerDownAction({
        event,
        node,
        currentSelection: {
          nodeIds: selectedNodeIds,
          edgeIds: selectedEdgeIds,
          barrierIds: selectedBarrierIds,
        },
        nodes,
        edges,
        barriers,
        screenToWorld,
        appStateSetters,
      })
    },
    [appStateSetters, barriers, edges, nodes, screenToWorld, selectedBarrierIds, selectedEdgeIds, selectedNodeIds],
  )

  const applyPointerMovePayload = useCallback((payload: { pointerId: number; clientX: number; clientY: number }) => {
    handlePointerMoveAction({
      pointerId: payload.pointerId,
      clientX: payload.clientX,
      clientY: payload.clientY,
      connectionDraft,
      barrierDraft,
      dragState,
      screenToWorld,
      appStateSetters,
    })
  }, [appStateSetters, barrierDraft, connectionDraft, dragState, screenToWorld])

  const flushPointerMove = useCallback(() => {
    pointerMoveFrameRef.current = null
    const payload = pendingPointerMoveRef.current
    if (!payload) return
    pendingPointerMoveRef.current = null
    applyPointerMovePayload(payload)
  }, [applyPointerMovePayload])

  const cancelScheduledPointerMove = useCallback(() => {
    if (pointerMoveFrameRef.current !== null) window.cancelAnimationFrame(pointerMoveFrameRef.current)
    pointerMoveFrameRef.current = null
    pendingPointerMoveRef.current = null
  }, [])

  useEffect(() => cancelScheduledPointerMove, [cancelScheduledPointerMove])

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const payload = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
      }
      pendingPointerMoveRef.current = payload
      if (pointerMoveFrameRef.current !== null) return
      pendingPointerMoveRef.current = null
      applyPointerMovePayload(payload)
      pointerMoveFrameRef.current = window.requestAnimationFrame(flushPointerMove)
    },
    [applyPointerMovePayload, flushPointerMove],
  )

  const finishConnectionDraftAtClientPoint = useCallback((pointerId: number, clientX: number, clientY: number) => {
    return finishConnectionDraftAtClientPointAction({
      pointerId,
      clientX,
      clientY,
      connectionDraft,
      nodeIdSet,
      edges,
      appStateSetters,
      pushEditHistory,
    })
  }, [appStateSetters, connectionDraft, edges, nodeIdSet, pushEditHistory])

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    cancelScheduledPointerMove()
    endCanvasPointerAction({
      event,
      dragState,
      connectionDraft,
      barrierDraft,
      nodes,
      barriers,
      selection: {
        nodeIds: selectedNodeIds,
        edgeIds: selectedEdgeIds,
        barrierIds: selectedBarrierIds,
      },
      nodeIdSet,
      screenToWorld,
      finishConnectionDraftAtClientPoint,
      appStateSetters,
      pushEditHistory,
    })
  }, [
    appStateSetters,
    barrierDraft,
    barriers,
    cancelScheduledPointerMove,
    connectionDraft,
    dragState,
    finishConnectionDraftAtClientPoint,
    nodeIdSet,
    nodes,
    pushEditHistory,
    screenToWorld,
    selectedBarrierIds,
    selectedEdgeIds,
    selectedNodeIds,
  ])

  useEffect(() => subscribeConnectionDraftPointer({
    draft: connectionDraft,
    screenToWorld,
    setConnectionDraft,
    finishConnectionDraftAtClientPoint,
  }), [connectionDraft, finishConnectionDraftAtClientPoint, screenToWorld])

  useLayoutEffect(() => {
    if (typeof document === "undefined") return
    document.documentElement.style.setProperty("color-scheme", theme)
  }, [theme])

  useEffect(() => {
    if (leftSidebarOpen) setLeftRailPreviewOpen(false)
  }, [leftSidebarOpen])

  useEffect(() => {
    if (inspectorMode !== "export") return

    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (exportPanelRef.current?.contains(target)) return
      if (exportTriggerRef.current?.contains(target)) return
      setInspectorMode("inspector")
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setInspectorMode("inspector")
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer, true)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [inspectorMode])

  const startConnection = useCallback((event: PointerEvent<HTMLElement>, sourceId: string) => {
    startConnectionAction({
      event,
      sourceId,
      screenToWorld,
      appStateSetters,
    })
  }, [appStateSetters, screenToWorld])

  const startBarrierAnnotation = useCallback((event: PointerEvent<HTMLElement>, sourceId: string) => {
    startBarrierAnnotationAction({
      event,
      sourceId,
      screenToWorld,
      appStateSetters,
    })
  }, [appStateSetters, screenToWorld])

  const completeConnectionToNode = useCallback((event: PointerEvent<HTMLElement>, targetId: string) => {
    completeConnectionToNodeAction({
      event,
      targetId,
      connectionDraft,
      edges,
      appStateSetters,
      pushEditHistory,
    })
  }, [appStateSetters, connectionDraft, edges, pushEditHistory])

  const startKeyboardConnection = useCallback((sourceId: string) => {
    const transition = keyboardConnectionSourceTransition(keyboardEdgeSourceId, sourceId)
    setKeyboardEdgeSourceId(transition.keyboardEdgeSourceId)
    applyCanvasSelection(transition.selection)
    setInspectorMode(transition.inspectorMode)
  }, [applyCanvasSelection, keyboardEdgeSourceId])

  const createProject = useCallback((projectLabel?: string) => {
    const transition = createProjectAction({
      projects,
      workspaces: projectWorkspaces,
      activeProjectId,
      currentSnapshot: currentProjectWorkspaceSnapshot(),
      emptyViewport: defaultCanvasViewport(canvasRef.current),
      projectLabel,
      now: Date.now(),
    })
    const desktopApi = window.rxnflowDesktop
    if (!desktopApi?.createProjectFolder) {
      applyProjectTransition(transition)
      return true
    }

    const emptySnapshot = transition.activeSnapshot
    const serialized = serializeProjectPackage({
      project: transition.project,
      files: emptySnapshot.files,
      canvases: emptySnapshot.canvases,
      activeCanvasId: emptySnapshot.activeCanvasId,
    }, "desktop")

    return desktopApi.createProjectFolder({
      projectLabel: transition.project.label,
      defaultName: serialized.defaultName,
      content: serialized.content,
    }).then((result) => {
      if (!result || result.canceled) return false
      if (!result.content) {
        applyProjectTransition({
          ...transition,
          validation: result.validation ?? null,
        })
        return true
      }
      const restored = projectPackageRestoreTransitionFromContent({
        content: result.content,
        validation: result.validation,
        projects,
        workspaces: projectWorkspaces,
        activeProjectId,
        currentSnapshot: currentProjectWorkspaceSnapshot(),
        replaceProjects: Boolean(result.projectDirectory),
      })
      if (!restored.ok) {
        setProjectValidation(restored.validation)
        return false
      }
      applyProjectTransition(restored)
      return true
    }).catch((error: unknown) => {
      setProjectValidation(projectFolderCreationFailureValidation(error))
      return false
    })
  }, [activeProjectId, applyProjectTransition, currentProjectWorkspaceSnapshot, projectWorkspaces, projects])

  const openProject = useCallback((projectId: string) => {
    const transition = openProjectAction({
      workspaces: projectWorkspaces,
      activeProjectId,
      targetProjectId: projectId,
      currentSnapshot: currentProjectWorkspaceSnapshot(),
      emptyViewport: defaultCanvasViewport(canvasRef.current),
    })
    if (transition) applyProjectTransition(transition)
  }, [activeProjectId, applyProjectTransition, currentProjectWorkspaceSnapshot, projectWorkspaces])

  const deleteProject = useCallback((projectId: string) => {
    const action = deleteProjectAction({
      projects,
      workspaces: projectWorkspaces,
      activeProjectId,
      deletedProjectId: projectId,
      currentSnapshot: currentProjectWorkspaceSnapshot(),
      emptyViewport: defaultCanvasViewport(canvasRef.current),
      now: Date.now(),
    })
    if (action.kind === "activate") {
      forgetProjectInRuntime({ desktopApi: window.rxnflowDesktop, projectId })
      applyProjectTransition(action.transition)
      return
    }
    if (action.kind === "delete-inactive") {
      forgetProjectInRuntime({ desktopApi: window.rxnflowDesktop, projectId })
      setProjects(action.projects)
      setProjectWorkspaces(action.workspaces)
      setProjectValidation(null)
    }
  }, [activeProjectId, applyProjectTransition, currentProjectWorkspaceSnapshot, projectWorkspaces, projects])

  const stageSourceFiles = useCallback(async (importedFiles: ImportSourceFile[], options: StageSourceFilesOptions = {}) => {
    await stageCurrentProjectSourceFilesAction({
      importedFiles,
      options,
      canvas: canvasRef.current,
      viewport,
      currentSnapshot: currentProjectWorkspaceSnapshot(),
      viewMode,
      registerImportCandidates: window.rxnflowDesktop?.registerImportCandidates,
      appStateSetters,
      pushEditHistory,
      setCandidateReview,
    })
  }, [appStateSetters, currentProjectWorkspaceSnapshot, pushEditHistory, viewMode, viewport])

  const stageSourceFilesForProject = useCallback(async (
    projectId: string,
    importedFiles: ImportSourceFile[],
  ) => {
    await stageSourceFilesForProjectAction({
      projectId,
      importedFiles,
      activeProjectId,
      projects,
      workspaces: projectWorkspaces,
      currentSnapshot: currentProjectWorkspaceSnapshot(),
      emptyViewport: defaultCanvasViewport(canvasRef.current),
      canvas: canvasRef.current,
      registerImportCandidates: window.rxnflowDesktop?.registerImportCandidates,
      stageCurrentProjectSourceFiles: stageSourceFiles,
      applyProjectTransition,
      setCandidateReview,
    })
  }, [
    activeProjectId,
    applyProjectTransition,
    currentProjectWorkspaceSnapshot,
    projectWorkspaces,
    projects,
    stageSourceFiles,
  ])

  const reviewCandidatesForFile = useCallback((fileId: string) => {
    reviewCandidatesForFileAction({
      files,
      fileId,
      canvas: canvasRef.current,
      viewport,
      appStateSetters,
      setCandidateReview,
    })
  }, [appStateSetters, files, viewport])

  const showNodeSourceDetails = useCallback((nodeId: string) => {
    const selection = nodeSourceDetailsSelection({ nodes, files, nodeId })
    if (!selection) return
    applyNodeSourceDetailsSelectionState(appStateSetters, selection)
  }, [appStateSetters, files, nodes])

  const toggleCandidateSelection = useCallback((key: string) => {
    setCandidateReview((current) => toggleCandidateReviewSelectionAction(current, key))
  }, [])

  const closeCandidateReview = useCallback(() => {
    setCandidateReview(null)
  }, [])

  const registerCandidateReview = useCallback(async (mode: "selected" | "all") => {
    await registerCandidateReviewAction({
      mode,
      candidateReview,
      candidateRegisterBusy,
      registerImportCandidates: window.rxnflowDesktop?.registerImportCandidates,
      currentSnapshot: currentProjectWorkspaceSnapshot(),
      appStateSetters,
      pushEditHistory,
      setCandidateRegisterBusy,
    })
  }, [appStateSetters, candidateRegisterBusy, candidateReview, currentProjectWorkspaceSnapshot, pushEditHistory])

  const importFiles = useCallback(async (fileList: FileList | File[], projectId = activeProjectId) => {
    await importFilesForProjectAction({ fileList, projectId, stageSourceFilesForProject })
  }, [activeProjectId, stageSourceFilesForProject])

  const handleCanvasRawFileDrop = useCallback(async (drop: CanvasRawFileDrop) => {
    await handleCanvasRawFileDropAction({
      drop,
      files,
      stageCurrentProjectSourceFiles: stageSourceFiles,
    })
  }, [files, stageSourceFiles])

  const importDesktopFiles = useCallback(async (projectId = activeProjectId) => {
    await importDesktopFilesAction({
      projectId,
      chooseFiles: window.rxnflowDesktop?.chooseFiles,
      stageSourceFilesForProject,
    })
  }, [activeProjectId, stageSourceFilesForProject])

  const openImportPicker = useCallback((projectId = activeProjectId) => {
    openImportPickerAction({
      projectId,
      hasDesktopRuntime: Boolean(window.rxnflowDesktop),
      setPendingImportProjectId: (pendingProjectId) => {
        pendingImportProjectIdRef.current = pendingProjectId
      },
      importDesktopFiles: (targetProjectId) => void importDesktopFiles(targetProjectId),
      openBrowserPicker: () => importInputRef.current?.click(),
    })
  }, [activeProjectId, importDesktopFiles])

  useEffect(() => {
    return window.rxnflowDesktop?.onMenuImportFiles(openImportPicker)
  }, [openImportPicker])

  useEffect(() => {
    setActiveProjectInRuntime({ desktopApi: window.rxnflowDesktop, projectId: activeProjectId })
  }, [activeProjectId])

  const restoreProjectPackage = useCallback((
    content: string,
    validation?: ProjectValidationPayload | null,
    options?: RestoreProjectPackageOptions,
  ) => {
    const restoreState = projectRestoreStateRef.current ?? {
      projects,
      workspaces: projectWorkspaces,
      activeProjectId,
      activeSnapshot: currentProjectWorkspaceSnapshot(),
    }
    const transition = projectPackageRestoreTransitionFromContent({
      content,
      validation,
      projects: restoreState.projects,
      workspaces: restoreState.workspaces,
      activeProjectId: restoreState.activeProjectId,
      currentSnapshot: restoreState.activeSnapshot,
      replaceProjects: options?.replaceProjects,
    })
    if (!transition.ok) {
      setProjectValidation(transition.validation)
      return
    }
    projectRestoreStateRef.current = {
      projects: transition.projects,
      workspaces: transition.workspaces,
      activeProjectId: transition.activeProjectId,
      activeSnapshot: transition.activeSnapshot,
    }
    setActiveProjectInRuntime({
      desktopApi: window.rxnflowDesktop,
      projectId: transition.activeProjectId,
      projectDirectory: options?.projectDirectory,
    })
    applyProjectTransition(transition)
  }, [activeProjectId, applyProjectTransition, currentProjectWorkspaceSnapshot, projectWorkspaces, projects])
  restoreProjectPackageRef.current = restoreProjectPackage

  const handleProjectInputChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ""
    if (!file) return
    try {
      restoreProjectPackage(await file.text(), null)
    } catch {
      setProjectValidation(invalidProjectPackageValidation())
    }
  }, [restoreProjectPackage])

  const openProjectPackage = useCallback(async () => {
    await openProjectPackageFromRuntime({
      desktopApi: window.rxnflowDesktop,
      projectInput: projectInputRef.current,
      restoreProjectPackage,
    })
  }, [restoreProjectPackage])

  const saveProjectPackage = useCallback(async () => {
    await saveProjectPackageToRuntime({
      desktopApi: window.rxnflowDesktop,
      project: activeProject,
      files,
      canvases: projectCanvases,
      activeCanvasId: activeCanvasTabId,
      setProjectValidation,
    })
  }, [activeCanvasTabId, activeProject, files, projectCanvases])

  useEffect(() => {
    autosaveInputRef.current = autosaveInput
  }, [autosaveInput])

  const runAutosaveProject = useCallback(async () => {
    const desktopApi = window.rxnflowDesktop
    const input = autosaveInputRef.current
    if (!desktopApi?.autosaveProjectPackage || !input) return

    const autosaveKey = projectAutosaveKey(input)
    if (autosaveKey === autosaveKeyRef.current) return
    if (autosaveInFlightRef.current) {
      autosaveQueuedRef.current = true
      return
    }

    autosaveInFlightRef.current = true
    autosaveKeyRef.current = autosaveKey
    try {
      const result = await autosaveProjectPackageToRuntime({
        desktopApi,
        ...input,
        setProjectValidation,
      })
      if (result?.content) {
        setFiles((current) => sourceFilesWithAutosavedMetadata(current, result.content ?? ""))
      }
    } catch (error) {
      autosaveKeyRef.current = null
      setProjectValidation(projectAutosaveFailureValidation(error))
    } finally {
      autosaveInFlightRef.current = false
      if (autosaveQueuedRef.current) {
        autosaveQueuedRef.current = false
        void runAutosaveProject()
      }
    }
  }, [])

  useEffect(() => {
    if (!window.rxnflowDesktop?.autosaveProjectPackage) return

    const autosaveKey = projectAutosaveKey(autosaveInput)
    if (!autosaveHydratedRef.current) {
      autosaveHydratedRef.current = true
      autosaveKeyRef.current = autosaveKey
      return
    }
    if (dragState) return

    const timer = window.setTimeout(() => {
      void runAutosaveProject()
    }, 900)
    return () => window.clearTimeout(timer)
  }, [autosaveInput, dragState, runAutosaveProject])

  useEffect(() => subscribeProjectPackageRuntimeMenus({
    desktopApi: window.rxnflowDesktop,
    openProjectPackage,
    saveProjectPackage,
    restoreProjectPackage,
  }), [openProjectPackage, restoreProjectPackage, saveProjectPackage])

  useEffect(() => restoreStartupProjectFromRuntime({
    desktopApi: window.rxnflowDesktop,
    restoreProjectPackage: (content, validation, options) => {
      restoreProjectPackageRef.current?.(content, validation, options)
    },
  }), [])

  useEffect(() => watchDesktopEngineStatus({
    desktopApi: window.rxnflowDesktop,
    setEngineStatus,
  }), [])

  useEffect(() => {
    if (!candidateReview) return
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setCandidateReview(null)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [candidateReview])

  const handleImportInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const transition = pendingImportProjectTransition(activeProjectId, pendingImportProjectIdRef.current)
    pendingImportProjectIdRef.current = transition.pendingImportProjectId
    if (event.currentTarget.files) void importFiles(event.currentTarget.files, transition.projectId)
    event.currentTarget.value = ""
  }, [activeProjectId, importFiles])

  const selectFile = useCallback((fileId: string, options: FileSelectionOptions = {}) => {
    const relatedNode = nodes.find((node) => node.sourceFileId === fileId)
    if (relatedNode && !options.additive && !options.range) {
      const selection = nodeSourceDetailsSelection({ nodes, files, nodeId: relatedNode.id })
      if (selection) {
        applyNodeSourceDetailsSelectionState(appStateSetters, selection)
        return
      }
    }
    const transition = selectSourceFileTransition({
      files,
      currentSelectedFileIds: selectedFileIds,
      lastSelectedFileId,
      fileId,
      options,
    })
    applySourceFileSelectionState(appStateSetters, transition)
  }, [appStateSetters, files, lastSelectedFileId, nodes, selectedFileIds])

  const deleteProjectFile = useCallback((fileId: string) => {
    const deletedNodeIds = new Set(nodes.filter((node) => node.sourceFileId === fileId).map((node) => node.id))
    if (deletedNodeIds.size > 0) {
      pushEditHistory()
      setNodes((current) => current.filter((node) => !deletedNodeIds.has(node.id)))
      setEdges((current) => current.filter((edge) => !deletedNodeIds.has(edge.sourceId) && !deletedNodeIds.has(edge.targetId)))
      setBarriers((current) => current.filter((barrier) => !deletedNodeIds.has(barrier.sourceId) && !deletedNodeIds.has(barrier.targetId)))
      setSelectedNodeIds((current) => current.filter((nodeId) => !deletedNodeIds.has(nodeId)))
      setSelectedEdgeIds((current) => current.filter((edgeId) => {
        const edge = edges.find((item) => item.id === edgeId)
        return edge ? !deletedNodeIds.has(edge.sourceId) && !deletedNodeIds.has(edge.targetId) : true
      }))
      setSelectedBarrierIds((current) => current.filter((barrierId) => {
        const barrier = barriers.find((item) => item.id === barrierId)
        return barrier ? !deletedNodeIds.has(barrier.sourceId) && !deletedNodeIds.has(barrier.targetId) : true
      }))
    }
    const transition = deleteSourceFileTransition({
      files,
      selectedFileId,
      selectedFileIds,
      lastSelectedFileId,
      deletedFileId: fileId,
    })
    applySourceFileDeletionState(appStateSetters, transition)
  }, [appStateSetters, barriers, edges, files, lastSelectedFileId, nodes, pushEditHistory, selectedFileId, selectedFileIds])

  const selectNode = useCallback((nodeId: string, mode: GraphSelectionMode = "replace") => {
    if (keyboardEdgeSourceId && keyboardEdgeSourceId !== nodeId) {
      const transition = keyboardConnectionEdgeTransition(`edge-${Date.now()}`, keyboardEdgeSourceId, nodeId)
      if (!transition) return
      pushEditHistory()
      setEdges((current) => [...current, transition.edge])
      applyCanvasSelectionTransitionState(appStateSetters, transition)
      return
    }
    const transition = canvasNodeSelectionTransition({
      nodeIds: selectedNodeIds,
      edgeIds: selectedEdgeIds,
      barrierIds: selectedBarrierIds,
    }, nodeId, mode, keyboardEdgeSourceId)
    applyCanvasSelectionTransitionState(appStateSetters, transition)
  }, [appStateSetters, keyboardEdgeSourceId, pushEditHistory, selectedBarrierIds, selectedEdgeIds, selectedNodeIds])

  const selectEdge = useCallback((edgeId: string, mode: GraphSelectionMode = "replace") => {
    const transition = canvasEdgeSelectionTransition({
      nodeIds: selectedNodeIds,
      edgeIds: selectedEdgeIds,
      barrierIds: selectedBarrierIds,
    }, edgeId, mode)
    applyCanvasSelectionTransitionState(appStateSetters, transition)
  }, [appStateSetters, selectedBarrierIds, selectedEdgeIds, selectedNodeIds])

  const selectBarrier = useCallback((barrierId: string, mode: GraphSelectionMode = "replace") => {
    const transition = canvasBarrierSelectionTransition({
      nodeIds: selectedNodeIds,
      edgeIds: selectedEdgeIds,
      barrierIds: selectedBarrierIds,
    }, barrierId, mode)
    applyCanvasSelectionTransitionState(appStateSetters, transition)
  }, [appStateSetters, selectedBarrierIds, selectedEdgeIds, selectedNodeIds])

  const updateEdgeLabel = useCallback((edgeId: string, label: string) => {
    updateEdgeLabelAction({ edges, edgeId, label, appStateSetters, pushEditHistory })
  }, [appStateSetters, edges, pushEditHistory])

  const updateBarrierLabel = useCallback((barrierId: string, label: string | null) => {
    updateBarrierLabelAction({ barriers, barrierId, label, appStateSetters, pushEditHistory })
  }, [appStateSetters, barriers, pushEditHistory])

  const updateNodeCoefficient = useCallback((nodeId: string, coefficient: number) => {
    updateNodeCoefficientAction({ nodes, nodeId, coefficient, appStateSetters, pushEditHistory })
  }, [appStateSetters, nodes, pushEditHistory])

  const renameNode = useCallback((nodeId: string, label: string) => {
    const nextLabel = label.trim()
    if (!nextLabel) return
    const node = nodes.find((item) => item.id === nodeId)
    if (!node || node.label === nextLabel) return
    pushEditHistory()
    setNodes((current) => current.map((item) => item.id === nodeId ? { ...item, label: nextLabel } : item))
  }, [nodes, pushEditHistory])

  const updateNodeManualStructure = useCallback((nodeId: string, structure: ManualStructurePayload | null) => {
    updateNodeManualStructureAction({ nodes, nodeId, structure, appStateSetters, pushEditHistory })
  }, [appStateSetters, nodes, pushEditHistory])

  const saveNodeManualStructure = useCallback((nodeId: string, structure: ManualStructurePayload) => {
    updateNodeManualStructure(nodeId, structure)
    setStructureEditorNodeId(null)
  }, [updateNodeManualStructure])

  const resetNodeManualStructure = useCallback((nodeId: string) => {
    updateNodeManualStructure(nodeId, null)
  }, [updateNodeManualStructure])

  const exportSelectedFormats = useCallback(async () => {
    await exportSelectedReportFormats({
      exportOptions,
      projectLabel: activeProject.label,
      nodes,
      edges,
      files,
      rows: energyRows,
      desktopApi: window.rxnflowDesktop,
      setExportBusy,
      setExportStatus,
      setExportArtifacts,
    })
  }, [activeProject.label, edges, energyRows, exportOptions, files, nodes])

  const openSourceFileInSystemApp = useCallback(async (fileId: string) => {
    const file = files.find((item) => item.id === fileId)
    if (!file) return
    const result = await window.rxnflowDesktop?.openSourceFile?.({
      projectId: activeProjectId,
      storedPath: file.storedPath,
      sourcePath: file.sourcePath,
      name: file.name,
    })
    if (result && !result.ok) {
      setProjectValidation({
        valid: true,
        summary: {},
        issues: [{
          severity: "warning",
          code: "source_open_failed",
          message: result.error || "Could not open the raw source file.",
        }],
      })
    }
  }, [activeProjectId, files])

  const setRelativeEnergyZeroFromNode = useCallback((nodeId: string) => {
    const transition = relativeEnergyZeroSelectionTransition(energyDisplayOptions, nodeId)
    setEnergyDisplayOptions(transition.energyDisplayOptions)
    applyCanvasSelection(transition.selection)
    setKeyboardEdgeSourceId(transition.keyboardEdgeSourceId)
    setInspectorMode(transition.inspectorMode)
  }, [applyCanvasSelection, energyDisplayOptions])

  const clearCanvasSelection = useCallback(() => {
    clearCanvasSelectionAction(appStateSetters)
  }, [appStateSetters])

  const nudgeSelectedNodes = useCallback((delta: Point) => {
    nudgeSelectedNodesAction({ nodes, selectedNodeIds, delta, appStateSetters, pushEditHistory })
  }, [appStateSetters, nodes, pushEditHistory, selectedNodeIds])

  const deleteSelection = useCallback(() => {
    deleteCanvasSelectionAction({
      nodes,
      edges,
      barriers,
      selection: {
        nodeIds: selectedNodeIds,
        edgeIds: selectedEdgeIds,
        barrierIds: selectedBarrierIds,
      },
      appStateSetters,
      pushEditHistory,
    })
  }, [appStateSetters, barriers, edges, nodes, pushEditHistory, selectedBarrierIds, selectedEdgeIds, selectedNodeIds])

  const handleCanvasKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    handleCanvasKeyboardEvent(event, hasCanvasSelection, {
      undoEdit,
      redoEdit,
      deleteSelection,
      clearCanvasSelection,
      nudgeSelectedNodes,
    })
  }, [clearCanvasSelection, deleteSelection, hasCanvasSelection, nudgeSelectedNodes, redoEdit, undoEdit])

  const renderProjectRail = () => (
    <ProjectRail
      projects={projects}
      activeProjectId={activeProjectId}
      files={files}
      selectedFileId={selectedFileId}
      selectedFileIds={selectedFileIds}
      onCreateProject={createProject}
      onOpenProject={openProject}
      onDeleteProject={deleteProject}
      onOpenProjectPackage={openProjectPackage}
      onImportFiles={openImportPicker}
      onDropProjectFiles={(projectId, droppedFiles) => void importFiles(droppedFiles, projectId)}
      onSelectFile={selectFile}
      onDeleteFile={deleteProjectFile}
      onReviewCandidates={reviewCandidatesForFile}
      canvases={canvasTabs}
      activeCanvasId={activeCanvasTabId}
      onSelectCanvas={switchCanvasTab}
      onCreateCanvas={createCanvasTab}
      onDeleteCanvas={deleteCanvasTab}
    />
  )

  return (
    <div className={`app-shell theme-${theme}${isMacDesktop ? " is-macos-desktop" : ""}`}>
      <input
        ref={importInputRef}
        className="visually-hidden"
        type="file"
        multiple
        onChange={handleImportInputChange}
        aria-label="Import calculation files"
      />
      <input
        ref={projectInputRef}
        className="visually-hidden"
        type="file"
        accept=".rxnflow,.json,.rxnflow.json,application/json"
        onChange={handleProjectInputChange}
        aria-label="Open project package"
      />
      {leftSidebarOpen ? (
        <button
          type="button"
          className="window-icon-button left-sidebar-fixed-toggle"
          aria-label="Collapse project sidebar"
          title="Collapse project sidebar"
          aria-pressed={leftSidebarOpen}
          onClick={() => setLeftSidebarOpen(false)}
        >
          <PanelLeft size={16} />
        </button>
      ) : null}
      <div className="workspace-topbar-actions desktop-window-actions" aria-label="Window actions">
        <button
          type="button"
          className="theme-toggle-button"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          <span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
        <span className="window-action-drag-gap" aria-hidden="true" />
        <EngineStatusPill status={engineStatus} />
        <button
          ref={exportTriggerRef}
          type="button"
          className="window-icon-button floating-export-trigger"
          aria-label="Export"
          title="Export"
          aria-pressed={inspectorMode === "export"}
          onClick={() => setInspectorMode((current) => current === "export" ? "inspector" : "export")}
        >
          <Download size={16} />
        </button>
        <span className="window-action-drag-gap" aria-hidden="true" />
        <button
          type="button"
          className="window-icon-button right-sidebar-fixed-toggle"
          aria-label={rightSidebarOpen ? "Collapse node sidebar" : "Expand node sidebar"}
          title={rightSidebarOpen ? "Collapse node sidebar" : "Expand node sidebar"}
          aria-pressed={rightSidebarOpen}
          onClick={() => setRightSidebarOpen((current) => !current)}
        >
          <PanelRight size={16} />
        </button>
      </div>

      <main className={`workspace${leftSidebarOpen ? "" : " is-left-collapsed"}${rightSidebarOpen ? "" : " is-right-collapsed"}`}>
        {leftSidebarOpen ? renderProjectRail() : null}
        {!leftSidebarOpen ? (
          <div
            className={`project-rail-hover${leftRailPreviewOpen ? " is-open" : ""}`}
            onMouseEnter={() => setLeftRailPreviewOpen(true)}
            onMouseLeave={() => setLeftRailPreviewOpen(false)}
            onFocus={() => setLeftRailPreviewOpen(true)}
            onBlur={(event) => {
              const nextFocus = event.relatedTarget
              if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) {
                setLeftRailPreviewOpen(false)
              }
            }}
          >
            <button
              type="button"
              className="project-rail-hover-trigger"
              aria-label="Preview project sidebar"
              title="Preview project sidebar"
              onClick={() => setLeftSidebarOpen(true)}
            >
              <PanelLeft size={16} />
            </button>
            {leftRailPreviewOpen ? (
              <div className="project-rail-hover-panel">
                {renderProjectRail()}
              </div>
            ) : null}
          </div>
        ) : null}

        <section className={`workbench-shell view-canvas${tableDrawerOpen ? " has-table-drawer" : ""}`} aria-label="Reaction flow workspace">
          <div className="workspace-topbar">
            <div className="workspace-topbar-left">
              <CanvasTabBar
                tabs={openCanvasTabs}
                activeTabId={activeCanvasTabId}
                onSelectTab={switchCanvasTab}
                onCreateTab={createCanvasTab}
                onRenameTab={renameCanvasTab}
                onCloseTab={closeCanvasTab}
              />
            </div>
          </div>
          <ProjectValidationNotice validation={projectValidation} />

          <div ref={canvasStageRef} className={`canvas-stage view-canvas${tableDrawerOpen ? " has-table-drawer" : ""}`}>
            <WorkbenchToolbar
              tool={tool}
              viewMode={viewMode}
              onSetTool={setTool}
              onSetViewMode={setViewMode}
              zoom={viewport.zoom}
              energyDisplayOptions={energyDisplayOptions}
              onEnergyDisplayOptionsChange={setEnergyDisplayOptions}
              canUndo={historyPast.length > 0}
              canRedo={historyFuture.length > 0}
              canDelete={hasCanvasSelection}
              onUndo={undoEdit}
              onRedo={redoEdit}
              onDelete={deleteSelection}
              onAutoLayout={applyAutoLayout}
              onFitView={fitCanvasViewport}
              onZoomIn={() => setViewport((current) => ({ ...current, zoom: clamp(current.zoom * 1.12, minCanvasZoom, maxCanvasZoom) }))}
              onZoomOut={() => setViewport((current) => ({ ...current, zoom: clamp(current.zoom * 0.88, minCanvasZoom, maxCanvasZoom) }))}
              placement={toolbarPlacement}
              onDragStart={handleToolbarDragStart}
              toolbarRef={toolbarRef}
              style={toolbarStyle}
            />
            {inspectorMode === "export" ? (
              <aside className="export-float-panel" aria-label="Export panel" ref={exportPanelRef}>
                <div className="export-float-header">
                  <div>
                    <span>Export</span>
                    <strong>Report</strong>
                  </div>
                  <button type="button" aria-label="Close export panel" onClick={() => setInspectorMode("inspector")}>×</button>
                </div>
                <ExportDock
                  options={exportOptions}
                  artifacts={exportArtifacts}
                  busy={exportBusy}
                  status={exportStatus}
                  rows={energyRows}
                  onOptionsChange={setExportOptions}
                  onExport={exportSelectedFormats}
                />
              </aside>
            ) : null}

            <div className="workbench-view-track" data-view-mode="canvas">
              <div className="workbench-view-pane canvas-view-pane">
                <CanvasSurface
                  canvasRef={canvasRef}
                  nodes={nodes}
                  files={files}
                  edges={edges}
                  barriers={barriers}
                  nodeMap={nodeMap}
                  selectedNodeIds={selectedNodeIds}
                  selectedEdgeIds={selectedEdgeIds}
                  selectedBarrierIds={selectedBarrierIds}
                  keyboardEdgeSourceId={keyboardEdgeSourceId}
                  tool={tool}
                  viewport={viewport}
                  rubberBandDraft={dragState?.kind === "rubber" ? dragState : null}
                  connectionDraft={connectionDraft}
                  barrierDraft={barrierDraft}
                  energyDisplayOptions={energyDisplayOptions}
                  energyRows={energyRows}
                  relativeZeroNodeId={relativeZeroNodeId}
                  onCanvasPointerDown={handleCanvasPointerDown}
                  onCanvasKeyDown={handleCanvasKeyDown}
                  onPointerMove={handlePointerMove}
                  onPointerEnd={endDrag}
                  onNodePointerDown={handleNodePointerDown}
                  onNodePointerUp={completeConnectionToNode}
                  onStartConnection={startConnection}
                  onStartBarrierAnnotation={startBarrierAnnotation}
                  onStartKeyboardConnection={startKeyboardConnection}
                  onSelectNode={selectNode}
                  onSelectEdge={selectEdge}
                  onSelectBarrier={selectBarrier}
                  onUpdateEdgeLabel={updateEdgeLabel}
                  onUpdateBarrierLabel={updateBarrierLabel}
                  onSetNodeCoefficient={updateNodeCoefficient}
                  onSetRelativeEnergyZero={setRelativeEnergyZeroFromNode}
                  onOpenStructure={(nodeId) => setStructurePreviewNodeId(nodeId)}
                  onShowNodeSource={showNodeSourceDetails}
                  onRenameNode={renameNode}
                  onRawFileDrop={handleCanvasRawFileDrop}
                />
                <MiniMap
                  nodes={nodes}
                  selectedNodeIds={selectedNodeIds}
                  viewport={viewport}
                  canvasRef={canvasRef}
                  onViewportChange={setViewport}
                />
              </div>
            </div>
            {tableDrawerMounted ? (
              <div
                className={tableDrawerOpen ? "table-drawer-shell is-open" : "table-drawer-shell"}
                aria-hidden={!tableDrawerOpen}
              >
                <EnergyTableView
                  rows={energyRows}
                  outputUnit={energyDisplayOptions.outputUnit}
                  onClose={() => setViewMode("canvas")}
                  onSelectNode={(nodeId) => {
                    const transition = energyTableNodeSelectionTransition(nodeId)
                    applyCanvasSelection(transition.selection)
                    setInspectorMode(transition.inspectorMode)
                    setViewMode(transition.viewMode)
                  }}
                />
              </div>
            ) : null}
          </div>
        </section>

        {rightSidebarOpen ? (
          <InspectorPanel
            node={selectedNode}
            edge={selectedEdge}
            barrier={selectedBarrier}
            nodeMap={nodeMap}
            file={selectedFile}
            rows={energyRows}
            files={files}
            energyDisplayOptions={energyDisplayOptions}
            onReviewCandidates={reviewCandidatesForFile}
            onUpdateEdgeLabel={updateEdgeLabel}
            onUpdateBarrierLabel={updateBarrierLabel}
            onOpenStructure={(nodeId) => setStructurePreviewNodeId(nodeId)}
            onEdit2DStructure={(nodeId) => setStructureEditorNodeId(nodeId)}
            onReset2DStructure={resetNodeManualStructure}
            onOpenSourceFile={openSourceFileInSystemApp}
          />
        ) : null}
      </main>
      {structurePreviewNode ? (
        <StructurePreviewDialog
          node={structurePreviewNode}
          file={sourceFileForNode(structurePreviewNode, files)}
          leftSidebarOpen={leftSidebarOpen}
          rightSidebarOpen={rightSidebarOpen}
          onClose={() => setStructurePreviewNodeId(null)}
          onEdit2DStructure={(nodeId) => {
            setStructurePreviewNodeId(null)
            setStructureEditorNodeId(nodeId)
          }}
          onReset2DStructure={resetNodeManualStructure}
        />
      ) : null}
      {structureEditorNode ? (
        <Molecule2DEditorDialog
          node={structureEditorNode}
          atoms={sourceCoordinatePreview(structureEditorNode, sourceFileForNode(structureEditorNode, files))?.atoms ?? []}
          onClose={() => setStructureEditorNodeId(null)}
          onSave={saveNodeManualStructure}
        />
      ) : null}
      {candidateReview ? (
        <CandidateReviewSheet
          review={candidateReview}
          busy={candidateRegisterBusy}
          onToggleCandidate={toggleCandidateSelection}
          onClose={closeCandidateReview}
          onRegisterSelected={() => registerCandidateReview("selected")}
          onRegisterAll={() => registerCandidateReview("all")}
        />
      ) : null}
    </div>
  )
}

function projectAutosaveKey(input: ProjectAutosaveInput): string {
  return JSON.stringify({
    project: input.project,
    files: input.files,
    canvases: input.canvases,
    activeCanvasId: input.activeCanvasId,
  })
}

function sourceFilesWithAutosavedMetadata(files: SourceFile[], savedContent: string): SourceFile[] {
  const savedPackage = parseProjectPackage(savedContent)
  if (!savedPackage) return files
  const savedFiles = new Map(savedPackage.files.map((file) => [file.id, file]))
  let changed = false
  const nextFiles = files.map((file) => {
    const savedFile = savedFiles.get(file.id)
    if (!savedFile) return file
    const nextFile: SourceFile = {
      ...file,
      size: savedFile.size,
      status: savedFile.status,
      preview: savedFile.preview,
      storedPath: savedFile.storedPath,
      checksum: savedFile.checksum,
      sourcePath: savedFile.sourcePath,
      parse: savedFile.parse ?? file.parse,
    }
    if (JSON.stringify(nextFile) !== JSON.stringify(file)) changed = true
    return nextFile
  })
  return changed ? nextFiles : files
}

function projectAutosaveFailureValidation(error: unknown): ProjectValidationPayload {
  return {
    valid: false,
    summary: {},
    issues: [{
      severity: "error",
      code: "project_autosave_failed",
      message: `Project autosave failed: ${error instanceof Error ? error.message : String(error)}`,
    }],
  }
}

function projectFolderCreationFailureValidation(error: unknown): ProjectValidationPayload {
  return {
    valid: false,
    summary: {},
    issues: [{
      severity: "error",
      code: "project_folder_create_failed",
      message: `Project folder creation failed: ${error instanceof Error ? error.message : String(error)}`,
    }],
  }
}

function CanvasTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCreateTab,
  onRenameTab,
  onCloseTab,
}: {
  tabs: CanvasTabState[]
  activeTabId: string
  onSelectTab: (tabId: string) => void
  onCreateTab: () => void
  onRenameTab: (tabId: string, label: string) => void
  onCloseTab: (tabId: string) => void
}) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState("")

  const beginRename = (tab: CanvasTabState) => {
    setEditingTabId(tab.id)
    setDraftLabel(tab.label)
  }
  const submitRename = (tab: CanvasTabState) => {
    const next = draftLabel.trim()
    if (next && next !== tab.label) onRenameTab(tab.id, next)
    setEditingTabId(null)
    setDraftLabel("")
  }

  return (
    <nav className="canvas-tab-bar" aria-label="Canvas tabs">
      <div className="canvas-tab-list" role="tablist" aria-label="Project canvases">
        {tabs.map((tab) => {
          const editing = editingTabId === tab.id
          return (
            <span key={tab.id} className={tab.id === activeTabId ? "canvas-tab-shell is-active" : "canvas-tab-shell"}>
              {editing ? (
                <input
                  className="canvas-tab-input"
                  aria-label={`Rename canvas ${tab.label}`}
                  value={draftLabel}
                  onChange={(event) => setDraftLabel(event.currentTarget.value)}
                  onBlur={() => submitRename(tab)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur()
                    if (event.key === "Escape") {
                      setEditingTabId(null)
                      setDraftLabel("")
                    }
                  }}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  role="tab"
                  className={tab.id === activeTabId ? "canvas-tab is-active" : "canvas-tab"}
                  aria-selected={tab.id === activeTabId}
                  onClick={() => onSelectTab(tab.id)}
                  onDoubleClick={() => beginRename(tab)}
                  title="Double-click to rename"
                >
                  {tab.label}
                </button>
              )}
              {tabs.length > 1 ? (
                <button
                  type="button"
                  className="canvas-tab-close"
                  aria-label={`Close canvas ${tab.label}`}
                  title={`Close ${tab.label}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onCloseTab(tab.id)
                  }}
                >
                  ×
                </button>
              ) : null}
            </span>
          )
        })}
        <button type="button" className="canvas-tab-add" aria-label="New canvas" title="New canvas" onClick={() => onCreateTab()}>
          <Plus size={15} />
        </button>
      </div>
    </nav>
  )
}

function nextCanvasLabel(projectLabel: string, tabs: CanvasTabState[]): string {
  const base = projectLabel.trim() || "Untitled Study"
  if (!tabs.some((tab) => tab.label === base)) return base
  let index = 1
  while (tabs.some((tab) => tab.label === `${base} ${index}`)) index += 1
  return `${base} ${index}`
}

function canvasTabSnapshotFromWorkspace(snapshot: ProjectWorkspaceSnapshot): CanvasTabSnapshot {
  return {
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    barriers: snapshot.barriers,
    viewport: snapshot.viewport,
    selectedNodeIds: snapshot.selectedNodeIds,
    selectedEdgeIds: snapshot.selectedEdgeIds,
    selectedBarrierIds: snapshot.selectedBarrierIds,
  }
}

function buildEnergyRowsSignature(
  nodes: FlowNode[],
  edges: FlowEdge[],
  options: EnergyDisplayOptions,
): string {
  const edgeSignature = edges.map((edge) => `${edge.id}:${edge.sourceId}:${edge.targetId}:${edge.label}`).join("|")
  const nodeSignature = nodes.map((node) => [
    node.id,
    node.label,
    node.kind,
    node.formula,
    node.energyGas ?? "",
    node.energySolution ?? "",
    node.energyUnit,
    node.coefficient ?? "",
    node.charge ?? "",
    node.spinMultiplicity ?? "",
    node.sourceFileId ?? "",
    node.sourceCandidateId ?? "",
    node.sourceObjectIndex ?? "",
    node.parserId ?? "",
    node.parserVersion ?? "",
    node.manualStructureKet ?? "",
    node.manualStructureMolfile ?? "",
    node.manualStructureCdxml ?? "",
    node.manualStructureSvg ?? "",
    JSON.stringify(node.energyTable ?? null),
    JSON.stringify(node.corrections ?? []),
  ].join("~")).join("||")
  return `${options.baselineNodeId ?? ""}#${options.energySource}#${options.outputUnit}#${edgeSignature}#${nodeSignature}`
}

function EngineStatusPill({ status }: { status: DesktopEngineStatus | null }) {
  const ready = status?.ok === true && status.data.status === "ready"
  const browserPreview = status?.ok === false && status.error.code === "browser_preview"
  if (status === null || ready || browserPreview) return null
  const label = "Engine offline"

  return (
    <span
      className={`engine-status-pill${ready ? " is-ready" : ""}${browserPreview ? " is-preview" : ""}`}
      aria-label={`Engine status: ${label}`}
      title={ready ? status.data.engineVersion : status?.ok === false ? status.error.message : label}
    >
      <span aria-hidden="true" />
      {label}
    </span>
  )
}

function ProjectValidationNotice({ validation }: { validation: ProjectValidationPayload | null }) {
  const issues = validation?.issues ?? []
  if (issues.length === 0) return null

  const errorCount = issues.filter((issue) => issue.severity === "error").length
  const warningCount = issues.length - errorCount
  const title = errorCount > 0 ? "Project needs repair" : "Project warnings"
  const countLabel = [
    errorCount > 0 ? `${errorCount} error${errorCount === 1 ? "" : "s"}` : null,
    warningCount > 0 ? `${warningCount} warning${warningCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" / ")

  return (
    <section
      className={`project-validation-notice${errorCount > 0 ? " has-errors" : ""}`}
      role={errorCount > 0 ? "alert" : "status"}
      aria-label="Project validation"
      aria-live="polite"
    >
      <div className="project-validation-head">
        <strong>{title}</strong>
        <span>{countLabel}</span>
      </div>
      <ul>
        {issues.slice(0, 3).map((issue, index) => (
          <li key={`${issue.code}-${index}`}>
            <em>{issue.severity}</em>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
      {issues.length > 3 ? (
        <span className="project-validation-more">+{issues.length - 3} more</span>
      ) : null}
    </section>
  )
}
