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
  type ReportExportFormat,
  type ReportExportOptions,
} from "../domain/reportExports"
import {
  parseProjectPackage,
  type CanvasAnnotation,
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
  flowNodeSize,
  maxCanvasZoom,
  minCanvasZoom,
  pannedViewportFromDrag,
  resizedNodeSize,
  worldPointFromClientPoint,
} from "./canvasGeometry"
import { createBarrierSegment, createEdgeSegment } from "./canvasDrawing"
import {
  applyNodeSize,
  canvasBarrierSelectionTransition,
  canvasEdgeSelectionTransition,
  canvasNodeSelectionTransition,
  hasCanvasSelection as selectionHasItems,
  keyboardConnectionEdgeTransition,
  keyboardConnectionSourceTransition,
  lastSelectedId,
  nodeSizeChanged,
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
  type CanvasContextMenuRequest,
  type CanvasRawFileDrop,
  type CanvasTool,
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
import { SettingsPanel } from "./SettingsPanel"
import {
  defaultDesktopPreferences,
  effectiveThemeFromAppearance,
  isEnergyOutputUnitPreference,
  normalizeDesktopPreferences,
  type AppearancePreference,
  type DesktopPreferences,
  type SourceOpenerProfile,
} from "./desktopPreferences"
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
import { connectionSnapRadiusPx } from "./canvasConnectionMagnetism"
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

function inlineElementWidth(element: HTMLElement, fallback: number): number {
  const styleWidth = Number.parseFloat(element.style.width)
  if (Number.isFinite(styleWidth) && styleWidth > 0) return styleWidth
  if (element.offsetWidth > 0) return element.offsetWidth
  return fallback
}

function findElementByData<T extends Element>(
  root: ParentNode | null,
  selector: string,
  dataKey: string,
  value: string,
): T | null {
  const elements = root?.querySelectorAll<T>(selector) ?? []
  return Array.from(elements).find((element) => {
    const dataset = (element as unknown as { dataset?: DOMStringMap }).dataset
    return dataset?.[dataKey] === value
  }) ?? null
}

type CachedEdgeDragPreview = {
  edge: FlowEdge
  source: FlowNode
  target: FlowNode
  hitPath: SVGPathElement | null
  visiblePath: SVGPathElement | null
  labelElement: HTMLElement | null
  labelWidth: number
}

type CachedBarrierDragPreview = {
  barrier: FlowBarrier
  hitPath: SVGPathElement | null
  guidePath: SVGPathElement | null
  arrowPath: SVGPathElement | null
  labelElement: HTMLElement | null
  labelWidth: number
}

type NodeDragPreviewCache = {
  nodeId: string
  node: FlowNode
  nodeMap: Map<string, FlowNode>
  element: HTMLElement | null
  edges: CachedEdgeDragPreview[]
  barriers: CachedBarrierDragPreview[]
}

const energyUnitStorageKey = "rxnflow-energy-output-unit"
const projectRailWidthStorageKey = "rxnflow-project-rail-width"
const projectRailMinWidth = 212
const projectRailMaxWidth = 360

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

function initialDesktopPreferences(): DesktopPreferences {
  if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") {
    return defaultDesktopPreferences
  }
  const legacyTheme = window.localStorage.getItem("rxnflow-theme")
  const storedUnit = window.localStorage.getItem(energyUnitStorageKey)
  return normalizeDesktopPreferences({
    ...defaultDesktopPreferences,
    appearance: legacyTheme === "dark" || legacyTheme === "light" ? legacyTheme : "system",
    energyOutputUnit: isEnergyOutputUnitPreference(storedUnit) ? storedUnit : "kcal/mol",
  })
}

function isEnergyOutputUnit(value: string | null): value is EnergyDisplayOptions["outputUnit"] {
  return value === "hartree" || value === "kcal/mol" || value === "kj/mol"
}

function initialEnergyDisplayOptions(): EnergyDisplayOptions {
  if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") {
    return { ...defaultEnergyDisplayOptions }
  }
  const storedUnit = window.localStorage.getItem(energyUnitStorageKey)
  return {
    ...defaultEnergyDisplayOptions,
    outputUnit: isEnergyOutputUnit(storedUnit) ? storedUnit : "kcal/mol",
  }
}

function initialProjectRailWidth(): number {
  if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") {
    return projectRailMinWidth
  }
  const storedWidth = Number(window.localStorage.getItem(projectRailWidthStorageKey))
  return Number.isFinite(storedWidth)
    ? clamp(storedWidth, projectRailMinWidth, projectRailMaxWidth)
    : projectRailMinWidth
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
  const imageInputRef = useRef<HTMLInputElement | null>(null)
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
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const dragPreviewNodeRef = useRef<{ nodeId: string; element: HTMLElement | null } | null>(null)
  const dragPreviewGeometryRef = useRef<NodeDragPreviewCache | null>(null)
  const lastImagePasteAtRef = useRef(0)
  const [projects, setProjects] = useState(initialProjects)
  const [projectWorkspaces, setProjectWorkspaces] = useState<Record<string, ProjectWorkspaceSnapshot>>(() => initialProjectWorkspaces(defaultCanvasViewport(null)))
  const [activeProjectId, setActiveProjectId] = useState(initialProjects[0].id)
  const [files, setFiles] = useState(initialFiles)
  const [nodes, setNodes] = useState(initialNodes)
  const [edges, setEdges] = useState(initialEdges)
  const [barriers, setBarriers] = useState(initialBarriers)
  const [annotations, setAnnotations] = useState<CanvasAnnotation[]>([])
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
  const [tool, setTool] = useState<CanvasTool>("pan")
  const [viewMode, setViewMode] = useState<WorkbenchViewMode>("canvas")
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("inspector")
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [projectRailWidth, setProjectRailWidth] = useState(() => initialProjectRailWidth())
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const [canvasTabs, setCanvasTabs] = useState<CanvasTabState[]>(() => initialCanvasTabs(initialProjects[0].label))
  const [activeCanvasTabId, setActiveCanvasTabId] = useState("canvas-1")
  const [keyboardEdgeSourceId, setKeyboardEdgeSourceId] = useState<string | null>(null)
  const [exportOptions] = useState<ReportExportOptions>({ ...defaultReportExportOptions })
  const [, setExportArtifacts] = useState<ExportedReportArtifact[]>([])
  const [exportBusy, setExportBusy] = useState(false)
  const [exportStatus, setExportStatus] = useState("No report artifacts exported in this session.")
  const [energyDisplayOptions, setEnergyDisplayOptions] = useState<EnergyDisplayOptions>(() => initialEnergyDisplayOptions())
  const [engineStatus, setEngineStatus] = useState<DesktopEngineStatus | null>(null)
  const [projectValidation, setProjectValidation] = useState<ProjectValidationPayload | null>(null)
  const [candidateReview, setCandidateReview] = useState<CandidateReviewState | null>(null)
  const [candidateRegisterBusy, setCandidateRegisterBusy] = useState(false)
  const [structurePreviewNodeId, setStructurePreviewNodeId] = useState<string | null>(null)
  const [structureEditorNodeId, setStructureEditorNodeId] = useState<string | null>(null)
  const [historyPast, setHistoryPast] = useState<CanvasEditSnapshot[]>([])
  const [historyFuture, setHistoryFuture] = useState<CanvasEditSnapshot[]>([])
  const [desktopPreferences, setDesktopPreferences] = useState<DesktopPreferences>(() => initialDesktopPreferences())
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [canvasContextMenu, setCanvasContextMenu] = useState<CanvasContextMenuRequest | null>(null)
  const [renameEditingNodeId, setRenameEditingNodeId] = useState<string | null>(null)
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null)
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
    setAnnotations,
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
  const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null
  const selectedFile = selectedFileId ? files.find((file) => file.id === selectedFileId) ?? null : null
  const structurePreviewNode = structurePreviewNodeId ? nodes.find((node) => node.id === structurePreviewNodeId) ?? null : null
  const structureEditorNode = structureEditorNodeId ? nodes.find((node) => node.id === structureEditorNodeId) ?? null : null
  const tableDrawerOpen = viewMode === "table"
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0]
  const currentCanvasSnapshot = useMemo(() => canvasTabSnapshotFromState({
    nodes,
    edges,
    barriers,
    annotations,
    viewport,
    selectedNodeIds,
    selectedEdgeIds,
    selectedBarrierIds,
  }), [annotations, barriers, edges, nodes, selectedBarrierIds, selectedEdgeIds, selectedNodeIds, viewport])
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
  const theme = effectiveThemeFromAppearance(desktopPreferences.appearance, systemPrefersDark)
  const [desktopWindowState, setDesktopWindowState] = useState({ isFullScreen: false, isMaximized: false })
  const appShellStyle = useMemo(() => ({
    "--rxnflow-project-rail-width": `${projectRailWidth}px`,
  } as CSSProperties), [projectRailWidth])
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
  const liveViewportRef = useRef<CanvasViewport>(viewport)

  useLayoutEffect(() => {
    liveViewportRef.current = viewport
  }, [viewport])

  const canvasWorldElement = useCallback(() => (
    canvasRef.current?.querySelector<HTMLElement>(".canvas-world") ?? null
  ), [])

  const previewCanvasViewport = useCallback((nextViewport: CanvasViewport) => {
    liveViewportRef.current = nextViewport
    const world = canvasWorldElement()
    if (!world) return
    canvasRef.current?.classList.add("is-live-pan")
    world.style.transform = `translate(${nextViewport.x}px, ${nextViewport.y}px) scale(${nextViewport.zoom})`
  }, [canvasWorldElement])

  const buildNodeDragPreviewCache = useCallback((nodeId: string, preferredElement?: HTMLElement | null): NodeDragPreviewCache | null => {
    const canvas = canvasRef.current
    const node = nodeMap.get(nodeId)
    if (!canvas || !node) return null
    const element = preferredElement?.dataset.flowNodeId === nodeId
      ? preferredElement
      : Array.from(canvas.querySelectorAll<HTMLElement>("[data-flow-node-id]"))
        .find((item) => item.dataset.flowNodeId === nodeId) ?? null

    const edgePreviews = edges.flatMap<CachedEdgeDragPreview>((edge) => {
      if (edge.sourceId !== nodeId && edge.targetId !== nodeId) return []
      const source = nodeMap.get(edge.sourceId)
      const target = nodeMap.get(edge.targetId)
      if (!source || !target) return []
      const edgeElement = findElementByData<SVGGElement>(canvas, "[data-flow-edge-id]", "flowEdgeId", edge.id)
      const labelElement = findElementByData<HTMLElement>(canvas, "[data-flow-edge-label-id]", "flowEdgeLabelId", edge.id)
      return [{
        edge,
        source,
        target,
        hitPath: edgeElement?.querySelector<SVGPathElement>(".edge-hit-path") ?? null,
        visiblePath: edgeElement?.querySelector<SVGPathElement>(".edge-visible-path") ?? null,
        labelElement,
        labelWidth: labelElement ? inlineElementWidth(labelElement, 80) : 80,
      }]
    })

    const barrierPreviews = barriers.flatMap<CachedBarrierDragPreview>((barrier) => {
      if (barrier.sourceId !== nodeId && barrier.targetId !== nodeId) return []
      const barrierElement = findElementByData<SVGGElement>(canvas, "[data-flow-barrier-id]", "flowBarrierId", barrier.id)
      const labelElement = findElementByData<HTMLElement>(canvas, "[data-flow-barrier-label-id]", "flowBarrierLabelId", barrier.id)
      return [{
        barrier,
        hitPath: barrierElement?.querySelector<SVGPathElement>(".barrier-hit-path") ?? null,
        guidePath: barrierElement?.querySelector<SVGPathElement>(".barrier-guide") ?? null,
        arrowPath: barrierElement?.querySelector<SVGPathElement>(".barrier-arrow") ?? null,
        labelElement,
        labelWidth: labelElement ? inlineElementWidth(labelElement, 100) : 100,
      }]
    })

    const cache = {
      nodeId,
      node,
      nodeMap,
      element,
      edges: edgePreviews,
      barriers: barrierPreviews,
    }
    dragPreviewGeometryRef.current = cache
    dragPreviewNodeRef.current = { nodeId, element }
    return cache
  }, [barriers, edges, nodeMap])

  const previewNodePosition = useCallback((nodeId: string, position: Point) => {
    let cache = dragPreviewGeometryRef.current?.nodeId === nodeId
      ? dragPreviewGeometryRef.current
      : null
    if (!cache || !cache.element?.isConnected) cache = buildNodeDragPreviewCache(nodeId)
    const target = cache?.element ?? null
    if (!cache || !target) return
    canvasRef.current?.classList.add("is-live-node-drag")
    target.classList.add("is-live-dragging")
    target.style.transform = `translate(${position.x}px, ${position.y}px)`

    const previewNode = { ...cache.node, position }
    for (const edgePreview of cache.edges) {
      const source = edgePreview.edge.sourceId === nodeId ? previewNode : edgePreview.source
      const targetNode = edgePreview.edge.targetId === nodeId ? previewNode : edgePreview.target
      const segment = createEdgeSegment(source, targetNode)
      edgePreview.hitPath?.setAttribute("d", segment.path)
      edgePreview.visiblePath?.setAttribute("d", segment.path)
      if (edgePreview.labelElement) {
        edgePreview.labelElement.style.transform = `translate(${segment.labelPoint.x - edgePreview.labelWidth / 2}px, ${segment.labelPoint.y - 16}px)`
      }
    }

    if (cache.barriers.length > 0) {
      const previewNodeMap = new Map(cache.nodeMap)
      previewNodeMap.set(nodeId, previewNode)
      for (const barrierPreview of cache.barriers) {
        const segment = createBarrierSegment(barrierPreview.barrier, previewNodeMap, energyDisplayOptions)
        if (!segment) continue
        barrierPreview.hitPath?.setAttribute("d", segment.arrowPath)
        barrierPreview.guidePath?.setAttribute("d", segment.guidePath)
        barrierPreview.arrowPath?.setAttribute("d", segment.arrowPath)
        if (barrierPreview.labelElement) {
          barrierPreview.labelElement.style.transform = `translate(${segment.labelPoint.x - barrierPreview.labelWidth / 2}px, ${segment.labelPoint.y - 20}px)`
        }
      }
    }
  }, [buildNodeDragPreviewCache, energyDisplayOptions])

  const clearDragPreview = useCallback(() => {
    canvasRef.current?.classList.remove("is-live-pan", "is-live-node-drag")
    dragPreviewNodeRef.current?.element?.classList.remove("is-live-dragging")
    dragPreviewNodeRef.current = null
    dragPreviewGeometryRef.current = null
  }, [])

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
    if (typeof window.localStorage?.setItem !== "function") return
    window.localStorage.setItem(projectRailWidthStorageKey, String(projectRailWidth))
  }, [projectRailWidth])

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
    () => canvasEditSnapshot(nodes, edges, barriers, selectedNodeIds, selectedEdgeIds, selectedBarrierIds, annotations),
    [annotations, barriers, edges, nodes, selectedBarrierIds, selectedEdgeIds, selectedNodeIds],
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
    annotations,
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
    annotations,
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
    setAnnotations(snapshot.annotations ?? [])
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
      annotations: [],
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
        annotations: blankSnapshot.annotations,
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
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const update = () => setSystemPrefersDark(media.matches)
    update()
    media.addEventListener?.("change", update)
    return () => media.removeEventListener?.("change", update)
  }, [])

  useEffect(() => {
    let disposed = false
    const apply = (state: { isFullScreen?: boolean; isMaximized?: boolean } | undefined) => {
      if (disposed || !state) return
      setDesktopWindowState({
        isFullScreen: Boolean(state.isFullScreen),
        isMaximized: Boolean(state.isMaximized),
      })
    }
    void window.rxnflowDesktop?.getWindowState?.().then(apply)
    const dispose = window.rxnflowDesktop?.onWindowStateChanged?.(apply)
    return () => {
      disposed = true
      dispose?.()
    }
  }, [])

  useEffect(() => {
    let disposed = false
    const apply = (preferences: DesktopPreferences) => {
      const normalized = normalizeDesktopPreferences(preferences)
      setDesktopPreferences(normalized)
      setEnergyDisplayOptions((current) => ({ ...current, outputUnit: normalized.energyOutputUnit }))
      setProjectWorkspaces((current) => Object.fromEntries(
        Object.entries(current).map(([projectId, workspace]) => [
          projectId,
          {
            ...workspace,
            energyDisplayOptions: {
              ...workspace.energyDisplayOptions,
              outputUnit: normalized.energyOutputUnit,
            },
          },
        ]),
      ))
    }
    void window.rxnflowDesktop?.getPreferences?.().then((result) => {
      if (disposed || !result?.preferences) return
      apply(result.preferences)
    })
    const dispose = window.rxnflowDesktop?.onPreferencesChanged?.((preferences) => {
      if (!disposed) apply(preferences)
    })
    return () => {
      disposed = true
      dispose?.()
    }
  }, [])

  useEffect(() => {
    if (typeof window.localStorage?.setItem === "function") {
      window.localStorage.setItem("rxnflow-theme", theme)
      window.localStorage.setItem("rxnflow-appearance", desktopPreferences.appearance)
    }
  }, [desktopPreferences.appearance, theme])

  useEffect(() => {
    if (typeof window.localStorage?.setItem === "function") {
      window.localStorage.setItem(energyUnitStorageKey, energyDisplayOptions.outputUnit)
    }
  }, [energyDisplayOptions.outputUnit])

  useEffect(() => {
    if (!canvasContextMenu) return
    const closeOnPointer = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (contextMenuRef.current?.contains(target)) return
      setCanvasContextMenu(null)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setCanvasContextMenu(null)
    }
    const closeOnScroll = () => setCanvasContextMenu(null)
    document.addEventListener("pointerdown", closeOnPointer, true)
    document.addEventListener("keydown", closeOnEscape)
    window.addEventListener("scroll", closeOnScroll, true)
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer, true)
      document.removeEventListener("keydown", closeOnEscape)
      window.removeEventListener("scroll", closeOnScroll, true)
    }
  }, [canvasContextMenu])

  const screenToWorld = useCallback(
    (point: Point) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      return worldPointFromClientPoint(point, { x: rect?.left ?? 0, y: rect?.top ?? 0 }, liveViewportRef.current)
    },
    [],
  )

  useEffect(() => subscribeCanvasWheel({
    canvas: viewMode === "canvas" ? canvasRef.current : null,
    setViewport,
    getViewport: () => liveViewportRef.current,
    previewViewport: previewCanvasViewport,
  }), [activeCanvasTabId, previewCanvasViewport, viewMode])

  const handleCanvasPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (tool === "text") {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        const position = screenToWorld({ x: event.clientX, y: event.clientY })
        const id = createCanvasAnnotationId("text")
        pushEditHistory()
        setAnnotations((current) => [
          ...current,
          {
            id,
            type: "text",
            position,
            text: "",
          },
        ])
        setEditingAnnotationId(id)
        return
      }
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
    [appStateSetters, barrierDraft, connectionDraft, pushEditHistory, screenToWorld, tool, viewport],
  )

  const handleNodePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>, node: FlowNode) => {
      buildNodeDragPreviewCache(node.id, event.currentTarget)
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
    [appStateSetters, barriers, buildNodeDragPreviewCache, edges, nodes, screenToWorld, selectedBarrierIds, selectedEdgeIds, selectedNodeIds],
  )

  const handleNodeResizePointerDown = useCallback((event: PointerEvent<HTMLElement>, node: FlowNode) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)

    const pointerId = event.pointerId
    const startWorld = screenToWorld({ x: event.clientX, y: event.clientY })
    const originSize = flowNodeSize(node)
    const snapshot: CanvasEditSnapshot = {
      ...currentEditSnapshot(),
      selectedNodeIds: [node.id],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
    }

    applyCanvasSelectionState(appStateSetters, {
      nodeIds: [node.id],
      edgeIds: [],
      barrierIds: [],
    })
    appStateSetters.setInspectorMode("inspector")

    const updateSizeFromPointer = (pointerEvent: globalThis.PointerEvent, snap = false) => {
      const currentWorld = screenToWorld({ x: pointerEvent.clientX, y: pointerEvent.clientY })
      const nextSize = resizedNodeSize(originSize, startWorld, currentWorld, snap)
      setNodes((current) => applyNodeSize(current, node.id, nextSize))
      return nextSize
    }

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
    }

    const handlePointerMove = (pointerEvent: globalThis.PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return
      pointerEvent.preventDefault()
      updateSizeFromPointer(pointerEvent)
    }

    const handlePointerUp = (pointerEvent: globalThis.PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return
      pointerEvent.preventDefault()
      cleanup()
      const finalSize = updateSizeFromPointer(pointerEvent, true)
      if (nodeSizeChanged(snapshot, node.id, finalSize)) pushEditHistory(snapshot)
    }

    const handlePointerCancel = (pointerEvent: globalThis.PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return
      cleanup()
      setNodes((current) => applyNodeSize(current, node.id, originSize))
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)
  }, [appStateSetters, currentEditSnapshot, pushEditHistory, screenToWorld])

  const applyPointerMovePayload = useCallback((payload: { pointerId: number; clientX: number; clientY: number }) => {
    handlePointerMoveAction({
      pointerId: payload.pointerId,
      clientX: payload.clientX,
      clientY: payload.clientY,
      connectionDraft,
      barrierDraft,
      dragState,
      nodes,
      connectionSnapRadiusWorld: connectionSnapRadiusPx / viewport.zoom,
      viewport,
      screenToWorld,
      appStateSetters,
      dragPreview: {
        previewViewport: previewCanvasViewport,
        previewNodePosition,
      },
    })
  }, [appStateSetters, barrierDraft, connectionDraft, dragState, nodes, previewCanvasViewport, previewNodePosition, screenToWorld, viewport])

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

  const flushScheduledPointerMoveNow = useCallback(() => {
    if (pointerMoveFrameRef.current !== null) window.cancelAnimationFrame(pointerMoveFrameRef.current)
    pointerMoveFrameRef.current = null
    const payload = pendingPointerMoveRef.current
    pendingPointerMoveRef.current = null
    if (payload) applyPointerMovePayload(payload)
  }, [applyPointerMovePayload])

  useEffect(() => cancelScheduledPointerMove, [cancelScheduledPointerMove])

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      pendingPointerMoveRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
      }
      if (pointerMoveFrameRef.current !== null) return
      pointerMoveFrameRef.current = window.requestAnimationFrame(flushPointerMove)
    },
    [flushPointerMove],
  )

  const finishConnectionDraftAtClientPoint = useCallback((pointerId: number, clientX: number, clientY: number) => {
    return finishConnectionDraftAtClientPointAction({
      pointerId,
      clientX,
      clientY,
      connectionDraft,
      nodes,
      releasePoint: screenToWorld({ x: clientX, y: clientY }),
      connectionSnapRadiusWorld: connectionSnapRadiusPx / viewport.zoom,
      nodeIdSet,
      edges,
      appStateSetters,
      pushEditHistory,
    })
  }, [appStateSetters, connectionDraft, edges, nodeIdSet, nodes, pushEditHistory, screenToWorld, viewport.zoom])

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    flushScheduledPointerMoveNow()
    if (dragState?.kind === "pan" && dragState.pointerId === event.pointerId) {
      setViewport((current) => pannedViewportFromDrag(current, dragState, { x: event.clientX, y: event.clientY }))
    }
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
    clearDragPreview()
  }, [
    appStateSetters,
    barrierDraft,
    barriers,
    clearDragPreview,
    connectionDraft,
    dragState,
    finishConnectionDraftAtClientPoint,
    flushScheduledPointerMoveNow,
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
    nodes,
    snapRadiusWorld: connectionSnapRadiusPx / viewport.zoom,
    screenToWorld,
    setConnectionDraft,
    finishConnectionDraftAtClientPoint,
  }), [connectionDraft, finishConnectionDraftAtClientPoint, nodes, screenToWorld, viewport.zoom])

  useLayoutEffect(() => {
    if (typeof document === "undefined") return
    document.documentElement.style.setProperty("color-scheme", theme)
  }, [theme])

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
    options: StageSourceFilesOptions = {},
  ) => {
    await stageSourceFilesForProjectAction({
      projectId,
      importedFiles,
      options,
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

  const updateTextAnnotation = useCallback((annotationId: string, text: string) => {
    const nextText = text.trim()
    setAnnotations((current) => current.map((annotation) => (
      annotation.id === annotationId && annotation.type === "text"
        ? { ...annotation, text: nextText }
        : annotation
    )))
    setEditingAnnotationId(null)
  }, [])

  const deleteAnnotation = useCallback((annotationId: string) => {
    setAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId))
    setEditingAnnotationId((current) => current === annotationId ? null : current)
  }, [])

  const addImageAnnotations = useCallback(async (imageFiles: File[]) => {
    const filesToInsert = imageFiles.filter((file) => file.type.startsWith("image/"))
    if (filesToInsert.length === 0) return false
    const canvas = canvasRef.current
    const rect = canvas?.getBoundingClientRect()
    const viewportCenter = screenToWorld({
      x: (rect?.left ?? 0) + (rect?.width ?? fallbackCanvasSize.width) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? fallbackCanvasSize.height) / 2,
    })
    const images = (await Promise.all(filesToInsert.map((file, index) => imageAnnotationFromFile(file, {
      x: viewportCenter.x + index * 28,
      y: viewportCenter.y + index * 28,
    })))).filter((annotation): annotation is Extract<CanvasAnnotation, { type: "image" }> => Boolean(annotation))
    if (images.length === 0) return false
    pushEditHistory()
    setAnnotations((current) => [...current, ...images])
    lastImagePasteAtRef.current = Date.now()
    return true
  }, [pushEditHistory, screenToWorld])

  const pasteImagesFromSystemClipboard = useCallback(async () => {
    const imageFiles = await imageFilesFromSystemClipboard()
    if (imageFiles.length === 0) return false
    return addImageAnnotations(imageFiles)
  }, [addImageAnnotations])

  const openImagePicker = useCallback(() => {
    imageInputRef.current?.click()
  }, [])

  const handleImageInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const imageFiles = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ""
    if (imageFiles.length === 0) return
    void addImageAnnotations(imageFiles)
  }, [addImageAnnotations])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (viewMode !== "canvas") return
      if (isEditablePasteTarget(event.target)) return
      const files = imageFilesFromClipboardData(event.clipboardData)
      if (files.length === 0) {
        if (!clipboardMayContainImage(event.clipboardData)) return
        event.preventDefault()
        void pasteImagesFromSystemClipboard()
        return
      }
      event.preventDefault()
      void addImageAnnotations(files)
    }
    window.addEventListener("paste", handlePaste)
    return () => window.removeEventListener("paste", handlePaste)
  }, [addImageAnnotations, pasteImagesFromSystemClipboard, viewMode])

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (viewMode !== "canvas") return
      if (isEditablePasteTarget(event.target)) return
      if (event.key.toLowerCase() !== "v" || (!event.metaKey && !event.ctrlKey)) return
      window.setTimeout(() => {
        if (Date.now() - lastImagePasteAtRef.current < 350) return
        void pasteImagesFromSystemClipboard()
      }, 0)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [pasteImagesFromSystemClipboard, viewMode])


  const zoomCanvasIn = useCallback(() => {
    setViewport((current) => ({ ...current, zoom: clamp(current.zoom * 1.12, minCanvasZoom, maxCanvasZoom) }))
  }, [])

  const zoomCanvasOut = useCallback(() => {
    setViewport((current) => ({ ...current, zoom: clamp(current.zoom * 0.88, minCanvasZoom, maxCanvasZoom) }))
  }, [])

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

  useEffect(() => {
    syncNativeControlTooltips()
    const observer = new MutationObserver(() => syncNativeControlTooltips())
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label", "title"],
    })
    return () => observer.disconnect()
  }, [])

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
    const normalizedLabel = label.trim() || "path"
    const edge = edges.find((item) => item.id === edgeId)
    if (!edge || edge.label === normalizedLabel) return
    pushEditHistory()
    setEdges(edges.map((item) => item.id === edgeId ? { ...item, label: normalizedLabel } : item))
  }, [edges, pushEditHistory])

  const updateBarrierLabel = useCallback((barrierId: string, label: string | null) => {
    const normalizedLabel = label?.trim() || undefined
    const barrier = barriers.find((item) => item.id === barrierId)
    if (!barrier || barrier.label === normalizedLabel) return
    pushEditHistory()
    setBarriers(barriers.map((item) => item.id === barrierId ? { ...item, label: normalizedLabel } : item))
  }, [barriers, pushEditHistory])

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

  const exportReportFormat = useCallback(async (format: ReportExportFormat) => {
    setInspectorMode("inspector")
    await exportSelectedReportFormats({
      exportOptions: {
        ...exportOptions,
        formats: [format],
      },
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
      sourceKind: file.parse?.sourceKind ?? file.kind,
      parserId: file.parse?.parserId,
    })
    if (result && !result.ok && !result.canceled) {
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

  const setEnergyOutputUnit = useCallback((unit: EnergyDisplayOptions["outputUnit"]) => {
    setDesktopPreferences((current) => normalizeDesktopPreferences({ ...current, energyOutputUnit: unit }))
    void window.rxnflowDesktop?.setPreferences?.({ energyOutputUnit: unit })
    setEnergyDisplayOptions((current) => ({ ...current, outputUnit: unit }))
    setProjectWorkspaces((current) => Object.fromEntries(
      Object.entries(current).map(([projectId, workspace]) => [
        projectId,
        {
          ...workspace,
          energyDisplayOptions: {
            ...workspace.energyDisplayOptions,
            outputUnit: unit,
          },
        },
      ]),
    ))
  }, [])

  const setAppearancePreference = useCallback((appearance: AppearancePreference) => {
    setDesktopPreferences((current) => normalizeDesktopPreferences({ ...current, appearance }))
    void window.rxnflowDesktop?.setPreferences?.({ appearance })
  }, [])

  const chooseSourceOpener = useCallback((profile: SourceOpenerProfile) => {
    void window.rxnflowDesktop?.chooseExternalApp?.({ profile }).then((result) => {
      if (result?.preferences) setDesktopPreferences(normalizeDesktopPreferences(result.preferences))
    })
  }, [])

  const clearSourceOpener = useCallback((profile: SourceOpenerProfile) => {
    const sourceOpeners = {
      ...desktopPreferences.sourceOpeners,
      [profile]: { appPath: null, label: null },
    }
    setDesktopPreferences((current) => normalizeDesktopPreferences({ ...current, sourceOpeners }))
    void window.rxnflowDesktop?.setPreferences?.({ sourceOpeners })
  }, [desktopPreferences.sourceOpeners])

  const clearCanvasSelection = useCallback(() => {
    clearCanvasSelectionAction(appStateSetters)
  }, [appStateSetters])

  const nudgeSelectedNodes = useCallback((delta: Point) => {
    nudgeSelectedNodesAction({ nodes, selectedNodeIds, delta, appStateSetters, pushEditHistory })
  }, [appStateSetters, nodes, pushEditHistory, selectedNodeIds])

  const deleteSelection = useCallback((selectionOverride?: CanvasSelectionIds) => {
    const selection = selectionOverride ?? {
      nodeIds: selectedNodeIds,
      edgeIds: selectedEdgeIds,
      barrierIds: selectedBarrierIds,
    }
    deleteCanvasSelectionAction({
      nodes,
      edges,
      barriers,
      selection,
      appStateSetters,
      pushEditHistory,
    })
  }, [appStateSetters, barriers, edges, nodes, pushEditHistory, selectedBarrierIds, selectedEdgeIds, selectedNodeIds])

  const openCanvasContextMenu = useCallback((request: CanvasContextMenuRequest) => {
    const width = typeof window === "undefined" ? 220 : window.innerWidth
    const height = typeof window === "undefined" ? 260 : window.innerHeight
    setCanvasContextMenu({
      ...request,
      x: clamp(request.x, 8, Math.max(8, width - 226)),
      y: clamp(request.y, 8, Math.max(8, height - 210)),
    })
  }, [])

  const contextMenuNodeId = canvasContextMenu?.target.kind === "node" ? canvasContextMenu.target.nodeId : null
  const deleteContextMenuSelection = useCallback(() => {
    if (!canvasContextMenu) return
    deleteSelection(canvasContextMenu.target.selection)
    setCanvasContextMenu(null)
  }, [canvasContextMenu, deleteSelection])

  const renameContextMenuNode = useCallback(() => {
    if (!contextMenuNodeId) return
    setRenameEditingNodeId(contextMenuNodeId)
    setCanvasContextMenu(null)
  }, [contextMenuNodeId])

  const setZeroFromContextMenuNode = useCallback(() => {
    if (!contextMenuNodeId) return
    setRelativeEnergyZeroFromNode(contextMenuNodeId)
    setCanvasContextMenu(null)
  }, [contextMenuNodeId, setRelativeEnergyZeroFromNode])

  const showSourceFromContextMenuNode = useCallback(() => {
    if (!contextMenuNodeId) return
    showNodeSourceDetails(contextMenuNodeId)
    setCanvasContextMenu(null)
  }, [contextMenuNodeId, showNodeSourceDetails])

  const handleCanvasKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    handleCanvasKeyboardEvent(event, hasCanvasSelection, {
      undoEdit,
      redoEdit,
      deleteSelection,
      clearCanvasSelection,
      nudgeSelectedNodes,
    })
  }, [clearCanvasSelection, deleteSelection, hasCanvasSelection, nudgeSelectedNodes, redoEdit, undoEdit])

  const setClampedProjectRailWidth = useCallback((nextWidth: number) => {
    setProjectRailWidth(clamp(nextWidth, projectRailMinWidth, projectRailMaxWidth))
  }, [])

  const startProjectRailResize = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = projectRailWidth
    const moveProjectRail = (moveEvent: globalThis.PointerEvent) => {
      setClampedProjectRailWidth(startWidth + moveEvent.clientX - startX)
    }
    const stopProjectRailResize = () => {
      window.removeEventListener("pointermove", moveProjectRail)
      window.removeEventListener("pointerup", stopProjectRailResize)
      window.removeEventListener("pointercancel", stopProjectRailResize)
    }
    window.addEventListener("pointermove", moveProjectRail)
    window.addEventListener("pointerup", stopProjectRailResize)
    window.addEventListener("pointercancel", stopProjectRailResize)
  }, [projectRailWidth, setClampedProjectRailWidth])

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
      onOpenSettings={() => setSettingsOpen(true)}
      width={projectRailWidth}
      minWidth={projectRailMinWidth}
      maxWidth={projectRailMaxWidth}
      onResizePointerDown={startProjectRailResize}
      onResizeStep={setClampedProjectRailWidth}
    />
  )

  return (
    <div
      className={`app-shell theme-${theme}${isMacDesktop ? " is-macos-desktop" : ""}${leftSidebarOpen ? "" : " is-left-collapsed"}${rightSidebarOpen ? "" : " is-right-collapsed"}${desktopWindowState.isFullScreen ? " is-window-fullscreen" : ""}${desktopWindowState.isMaximized ? " is-window-maximized" : ""}${desktopWindowState.isFullScreen || desktopWindowState.isMaximized ? " is-window-edge-to-edge" : ""}${tableDrawerOpen || structurePreviewNode || structureEditorNode ? " has-overlay-view" : ""}`}
      style={appShellStyle}
    >
      <input
        ref={importInputRef}
        className="visually-hidden"
        type="file"
        multiple
        onChange={handleImportInputChange}
        aria-label="Import calculation files"
      />
      <input
        ref={imageInputRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageInputChange}
        aria-label="Insert image file"
      />
      <input
        ref={projectInputRef}
        className="visually-hidden"
        type="file"
        accept=".rxnflow,.json,.rxnflow.json,application/json"
        onChange={handleProjectInputChange}
        aria-label="Open project package"
      />
      <div className="desktop-titlebar-shell" aria-label="Window titlebar">
        <button
          type="button"
          className="window-icon-button left-sidebar-fixed-toggle"
          aria-label={leftSidebarOpen ? "Collapse project sidebar" : "Expand project sidebar"}
          title={leftSidebarOpen ? "Collapse project sidebar" : "Expand project sidebar"}
          aria-pressed={leftSidebarOpen}
          onClick={() => setLeftSidebarOpen((current) => !current)}
        >
          <PanelLeft size={16} />
        </button>
        <div className="workspace-topbar desktop-titlebar-tabs" aria-label="Canvas tabs titlebar">
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
        <div className="workspace-topbar-actions desktop-window-actions" aria-label="Window actions">
          <button
            type="button"
            className="theme-toggle-button"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setAppearancePreference(theme === "dark" ? "light" : "dark")}
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
      </div>

      {settingsOpen ? (
        <SettingsPanel
          preferences={desktopPreferences}
          desktopAvailable={Boolean(window.rxnflowDesktop?.getPreferences)}
          onAppearanceChange={setAppearancePreference}
          onEnergyUnitChange={setEnergyOutputUnit}
          onChooseOpener={chooseSourceOpener}
          onClearOpener={clearSourceOpener}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {canvasContextMenu ? (
        <div
          ref={contextMenuRef}
          className="canvas-context-menu"
          role="menu"
          aria-label={contextMenuNodeId ? "Node context menu" : "Canvas context menu"}
          style={{ left: canvasContextMenu.x, top: canvasContextMenu.y }}
        >
          {contextMenuNodeId ? (
            <>
              <button type="button" role="menuitem" onClick={renameContextMenuNode}>Rename</button>
              <button type="button" role="menuitem" onClick={setZeroFromContextMenuNode}>Set zero</button>
              <button type="button" role="menuitem" onClick={showSourceFromContextMenuNode}>Source details</button>
              <span className="canvas-context-menu-divider" aria-hidden="true" />
            </>
          ) : null}
          <button type="button" role="menuitem" className="is-danger" onClick={deleteContextMenuSelection}>
            Delete
          </button>
        </div>
      ) : null}

      <main className={`workspace${leftSidebarOpen ? "" : " is-left-collapsed"}${rightSidebarOpen ? "" : " is-right-collapsed"}`}>
        {renderProjectRail()}

        <section className={`workbench-shell view-canvas${tableDrawerOpen ? " has-table-drawer" : ""}`} aria-label="Reaction flow workspace">
          <div className="workspace-topbar workspace-topbar-placeholder" aria-hidden="true" />
          <ProjectValidationNotice validation={projectValidation} />

          <div ref={canvasStageRef} className={`canvas-stage view-canvas${tableDrawerOpen ? " has-table-drawer" : ""}`}>
            <WorkbenchToolbar
              tool={tool}
              viewMode={viewMode}
              onSetTool={setTool}
              onSetViewMode={setViewMode}
              energyDisplayOptions={energyDisplayOptions}
              onEnergyDisplayOptionsChange={setEnergyDisplayOptions}
              canUndo={historyPast.length > 0}
              canRedo={historyFuture.length > 0}
              onUndo={undoEdit}
              onRedo={redoEdit}
              onAutoLayout={applyAutoLayout}
              onInsertImage={openImagePicker}
              placement={toolbarPlacement}
              onDragStart={handleToolbarDragStart}
              toolbarRef={toolbarRef}
              style={toolbarStyle}
            />
            {inspectorMode === "export" ? (
              <aside className="export-float-panel" aria-label="Export panel" ref={exportPanelRef}>
                <ExportDock
                  busy={exportBusy}
                  status={exportStatus}
                  onExportFormat={exportReportFormat}
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
                  annotations={annotations}
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
                  onNodeResizePointerDown={handleNodeResizePointerDown}
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
                  renameEditingNodeId={renameEditingNodeId}
                  onRenameRequestHandled={(nodeId) => {
                    setRenameEditingNodeId((current) => current === nodeId ? null : current)
                  }}
                  onOpenContextMenu={openCanvasContextMenu}
                  onRawFileDrop={handleCanvasRawFileDrop}
                  editingAnnotationId={editingAnnotationId}
                  onBeginEditAnnotation={setEditingAnnotationId}
                  onUpdateTextAnnotation={updateTextAnnotation}
                  onDeleteAnnotation={deleteAnnotation}
                />
                <MiniMap
                  nodes={nodes}
                  selectedNodeIds={selectedNodeIds}
                  viewport={viewport}
                  canvasRef={canvasRef}
                  onViewportChange={setViewport}
                  onZoomIn={zoomCanvasIn}
                  onZoomOut={zoomCanvasOut}
                  onReset={fitCanvasViewport}
                />
              </div>
            </div>
            {tableDrawerOpen ? (
              <div
                className="table-drawer-shell is-open"
                aria-hidden={false}
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) setViewMode("canvas")
                }}
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
            file={selectedFile}
            rows={energyRows}
            files={files}
            energyDisplayOptions={energyDisplayOptions}
            onReviewCandidates={reviewCandidatesForFile}
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

function estimatedTabInputTextWidth(text: string): number {
  return Array.from(text).reduce((width, char) => {
    if (/\s/.test(char)) return width + 4
    if (/[\u3400-\u9fff]/.test(char)) return width + 12
    if (/[A-Z0-9Δ‡+=./()[\]{}–—-]/.test(char)) return width + 8.2
    return width + 6.8
  }, 0)
}

function canvasTabInputWidth(value: string, placeholder: string): number {
  const text = value.length > 0 ? value : (placeholder.trim() || "Canvas")
  return clamp(Math.ceil(estimatedTabInputTextWidth(text) + 34), 76, 210)
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
                  style={{
                    "--canvas-tab-input-width": `${canvasTabInputWidth(draftLabel, tab.label)}px`,
                  } as CSSProperties}
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
    annotations: snapshot.annotations,
    viewport: snapshot.viewport,
    selectedNodeIds: snapshot.selectedNodeIds,
    selectedEdgeIds: snapshot.selectedEdgeIds,
    selectedBarrierIds: snapshot.selectedBarrierIds,
  }
}

function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select"
}

function syncNativeControlTooltips(root: ParentNode = document): void {
  const controls = root.querySelectorAll<HTMLElement>(
    'button[aria-label], [role="button"][aria-label], [role="menuitem"][aria-label]',
  )
  controls.forEach((control) => {
    const label = control.getAttribute("aria-label")?.trim()
    if (!label) return
    const isAutoTitle = control.dataset.rxnflowAutoTitle === "true"
    const currentTitle = control.getAttribute("title")?.trim()
    if (currentTitle && !isAutoTitle) return
    if (currentTitle === label && isAutoTitle) return
    control.setAttribute("title", label)
    control.dataset.rxnflowAutoTitle = "true"
  })
}

function imageFilesFromClipboardData(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData) return []
  const files = Array.from(clipboardData.files ?? []).filter((file) => file.type.startsWith("image/"))
  if (files.length > 0) return files
  return Array.from(clipboardData.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null && file.type.startsWith("image/"))
}

function clipboardMayContainImage(clipboardData: DataTransfer | null): boolean {
  if (!clipboardData) return true
  const types = Array.from(clipboardData.types ?? [])
  if (types.length === 0) return true
  return types.some((type) => (
    type === "Files"
    || type.startsWith("image/")
    || type === "public.tiff"
    || type === "public.png"
  ))
}

async function imageFilesFromSystemClipboard(): Promise<File[]> {
  const read = navigator.clipboard?.read
  if (typeof read !== "function") return []
  try {
    const clipboardItems = await read.call(navigator.clipboard)
    const files: File[] = []
    for (const item of clipboardItems) {
      const imageType = item.types.find((type) => type.startsWith("image/"))
      if (!imageType) continue
      const blob = await item.getType(imageType)
      const extension = imageType.split("/")[1] || "png"
      files.push(new File([blob], `Pasted image.${extension}`, { type: imageType }))
    }
    return files
  } catch {
    return []
  }
}

function createCanvasAnnotationId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return `${prefix}-${globalThis.crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function imageAnnotationFromFile(
  file: File,
  center: Point,
): Promise<Extract<CanvasAnnotation, { type: "image" }> | null> {
  const dataUrl = await readFileAsDataUrl(file)
  if (!dataUrl.startsWith("data:image/")) return null
  const size = await imageSizeFromDataUrl(dataUrl)
  const maxWidth = 260
  const scale = Math.min(1, maxWidth / Math.max(1, size.width))
  const width = Math.max(48, Math.round(size.width * scale))
  const height = Math.max(48, Math.round(size.height * scale))
  return {
    id: createCanvasAnnotationId("image"),
    type: "image",
    position: {
      x: Math.round(center.x - width / 2),
      y: Math.round(center.y - height / 2),
    },
    dataUrl,
    width,
    height,
    name: file.name || "Pasted image",
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image clipboard item"))
    reader.readAsDataURL(file)
  })
}

function imageSizeFromDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve({
      width: image.naturalWidth || 240,
      height: image.naturalHeight || 160,
    })
    image.onerror = () => resolve({ width: 240, height: 160 })
    image.src = dataUrl
  })
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
  const issues = (validation?.issues ?? []).filter((issue) => issue.severity === "error")
  if (issues.length === 0) return null

  const errorCount = issues.length
  const title = "Project needs repair"
  const countLabel = `${errorCount} error${errorCount === 1 ? "" : "s"}`

  return (
    <section
      className="project-validation-notice has-errors"
      role="alert"
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
