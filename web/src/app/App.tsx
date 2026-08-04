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
import { Download, Moon, PanelLeft, PanelRight, Plus, Sun, X } from "lucide-react"
import {
  defaultReportExportOptions,
  type ReportExportFormat,
  type ReportExportOptions,
} from "../domain/reportExports"
import {
  normalizeSourceFileForPersistence,
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
import { parseSourcePreview, type ParsedEnergyUnit, type SourceParseResult } from "../domain/sourceParsers"
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
import { createBarrierSegment, createEdgeSegment, type BarrierRelativeEnergyLookup } from "./canvasDrawing"
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
  copyCanvasSelection as copyCanvasSelectionPayload,
  pasteCanvasClipboard as pasteCanvasClipboardPayload,
  selectAllCanvasItems as selectAllCanvasGraphItems,
  type CanvasClipboardPayload,
} from "./canvasClipboardState"
import {
  defaultEnergyDisplayOptions,
  energyTableNodeSelectionTransition,
  energyTableRows,
  nodeCoefficient,
  relativeEnergyZeroNode,
  relativeEnergyZeroSelectionTransition,
  type EnergyDisplayOptions,
} from "./energyDisplay"
import {
  browserImportSourceFilesFromFiles,
  canvasRawFileDropImportTransition,
  pendingImportProjectTransition,
  reconcileProjectWorkspaceSourceNodes,
  type CandidateReviewState,
  type ImportSourceFile,
  type StageSourceFilesOptions,
} from "./importRegistration"
import {
  nodeSourceDetailsSelection,
  selectSourceFileTransition,
  sourceFileDisplayGroupKey,
  sourceFileLooksLikeSolutionLog,
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
  type ProjectPackageRestoreTransition,
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
import { CommandPalette, type WorkbenchCommand } from "./CommandPalette"
import { loadWorkbenchLayoutPreference, saveWorkbenchLayoutPreference } from "./workbenchLayoutPreferences"
import {
  clampToolbarPlacement,
  defaultFloatingToolbarPlacement,
  resolveToolbarDropPlacement,
  type ToolbarMetrics,
  type ToolbarPlacement,
} from "./toolbarPlacement"
import type { SurfaceSize } from "./canvasGeometry"
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
  type RestoreProjectPackageOptions,
  type RestoreStartupProjectPackagesHandler,
  watchDesktopEngineStatus,
} from "./appRuntimeEffects"
import {
  applyCanvasSelectionTransitionState,
  applyNodeSourceDetailsSelectionState,
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
  deferredDesktopImportPlaceholder,
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
import {
  createAnimationFrameBatcher,
  desktopImportFilesWithProjectTargets,
  desktopImportFileWithReplacementIdentity,
  desktopParsedImportSourceFiles,
  desktopSourceFilePathForRawFile,
  type AnimationFrameBatcher,
} from "./importParseJobs"


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

type NodeResizePreviewCache = NodeDragPreviewCache & {
  originSize: SurfaceSize
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
  lifecycleGeneration: number
}

type ProjectRestoreRuntimeState = {
  projects: ProjectSummary[]
  workspaces: Record<string, ProjectWorkspaceSnapshot>
  activeProjectId: string
  activeSnapshot: ProjectWorkspaceSnapshot
}

type ImportIssueDialogState = {
  title: string
  entries: Array<{
    fileName: string
    code: string
    message: string
  }>
}

const sourceParsePendingWarningCodes = new Set(["parse_deferred", "parse_queued", "parse_running"])
const desktopImportRejectedWarningCodes = new Set([
  "unsupported_format",
  "parse_failed",
  "import_parse_failed",
  "cclib_parse_empty",
  "cclib_parse_failed",
  "cclib_unavailable",
  "full_file_read_failed",
  "source_file_too_large",
  "source_materialize_failed",
  "import_preview_missing",
  "import_preview_failed",
])
const maxBrowserProjectPackageBytes = 64 * 1024 * 1024
const maxCanvasImageFileBytes = 10 * 1024 * 1024

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
  const autosaveKeysRef = useRef(new Map<string, string>())
  const autosaveInputRef = useRef<ProjectAutosaveInput | null>(null)
  const autosaveInFlightRef = useRef(false)
  const autosaveQueueRef = useRef(new Map<string, ProjectAutosaveInput>())
  const activeProjectIdRef = useRef(initialProjects[0].id)
  const projectLifecycleGenerationRef = useRef(new Map<string, number>())
  const projectForgetInFlightRef = useRef(new Set<string>())
  const projectRestoreStateRef = useRef<ProjectRestoreRuntimeState | null>(null)
  const restoreStartupProjectPackagesRef = useRef<RestoreStartupProjectPackagesHandler | null>(null)
  const stageSourceFilesForProjectRef = useRef<((projectId: string, importedFiles: ImportSourceFile[], options?: StageSourceFilesOptions) => Promise<void>) | null>(null)
  const desktopImportFrameBatchersRef = useRef(new Set<AnimationFrameBatcher<ImportSourceFile>>())
  const appDisposedRef = useRef(false)
  const projectDirectoriesRef = useRef<Record<string, string>>({})
  const exportPanelRef = useRef<HTMLElement | null>(null)
  const exportTriggerRef = useRef<HTMLButtonElement | null>(null)
  const settingsReturnFocusRef = useRef<HTMLElement | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const dragPreviewNodeRef = useRef<{ nodeId: string; element: HTMLElement | null } | null>(null)
  const dragPreviewGeometryRef = useRef<NodeDragPreviewCache | null>(null)
  const lastImagePasteAtRef = useRef(0)
  const canvasClipboardRef = useRef<CanvasClipboardPayload | null>(null)
  const canvasClipboardPasteIndexRef = useRef(0)
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
  const initialLayoutPreference = useMemo(() => loadWorkbenchLayoutPreference(), [])
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(initialLayoutPreference.leftSidebarOpen)
  const [projectRailWidth, setProjectRailWidth] = useState(() => initialProjectRailWidth())
  const [rightSidebarOpen, setRightSidebarOpen] = useState(initialLayoutPreference.rightSidebarOpen)
  const [canvasTabs, setCanvasTabs] = useState<CanvasTabState[]>(() => initialCanvasTabs(initialProjects[0].label))
  const [activeCanvasTabId, setActiveCanvasTabId] = useState("canvas-1")
  const [keyboardEdgeSourceId, setKeyboardEdgeSourceId] = useState<string | null>(null)
  const [exportOptions] = useState<ReportExportOptions>({ ...defaultReportExportOptions })
  const [, setExportArtifacts] = useState<ExportedReportArtifact[]>([])
  const [exportBusy, setExportBusy] = useState(false)
  const [exportStatus, setExportStatus] = useState("No files exported in this session.")
  const [energyDisplayOptions, setEnergyDisplayOptions] = useState<EnergyDisplayOptions>(() => initialEnergyDisplayOptions())
  const [engineStatus, setEngineStatus] = useState<DesktopEngineStatus | null>(null)
  const [projectValidation, setProjectValidation] = useState<ProjectValidationPayload | null>(null)
  const [importIssueDialog, setImportIssueDialog] = useState<ImportIssueDialogState | null>(null)
  const [candidateReview, setCandidateReview] = useState<CandidateReviewState | null>(null)
  const [candidateRegisterBusy, setCandidateRegisterBusy] = useState(false)
  const [structurePreviewNodeId, setStructurePreviewNodeId] = useState<string | null>(null)
  const [structureEditorNodeId, setStructureEditorNodeId] = useState<string | null>(null)
  const structureEditorReturnFocusRef = useRef<HTMLElement | null>(null)
  const [historyPast, setHistoryPast] = useState<CanvasEditSnapshot[]>([])
  const [historyFuture, setHistoryFuture] = useState<CanvasEditSnapshot[]>([])
  const [desktopPreferences, setDesktopPreferences] = useState<DesktopPreferences>(() => initialDesktopPreferences())
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [canvasContextMenu, setCanvasContextMenu] = useState<CanvasContextMenuRequest | null>(null)
  const [renameEditingNodeId, setRenameEditingNodeId] = useState<string | null>(null)
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null)
  const [toolbarPlacement, setToolbarPlacement] = useState<ToolbarPlacement>(() => initialToolbarPlacement())
  const [toolbarMetrics, setToolbarMetrics] = useState<ToolbarMetrics | null>(null)
  const [startupRestorePending, setStartupRestorePending] = useState(() => Boolean(window.rxnflowDesktop?.getStartupProjectContent))

  useEffect(() => {
    saveWorkbenchLayoutPreference({ schemaVersion: 1, leftSidebarOpen, rightSidebarOpen })
  }, [leftSidebarOpen, rightSidebarOpen])

  const rememberProjectDirectory = useCallback((projectId: string, projectDirectory?: string | null) => {
    if (!projectId) return
    if (projectDirectory) {
      projectDirectoriesRef.current[projectId] = projectDirectory
      return
    }
    if (projectDirectory === null) delete projectDirectoriesRef.current[projectId]
  }, [])
  const openStructurePreview = useCallback((nodeId: string) => {
    setStructurePreviewNodeId(nodeId)
  }, [])
  const handleRenameRequestHandled = useCallback((nodeId: string) => {
    setRenameEditingNodeId((current) => current === nodeId ? null : current)
  }, [])
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
  const candidateReviewBlocked = Boolean(settingsOpen || importIssueDialog || structurePreviewNode || structureEditorNode)
  const appModalOpen = candidateReviewBlocked || Boolean(candidateReview)
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
    lifecycleGeneration: projectLifecycleGenerationRef.current.get(activeProject.id) ?? 0,
  }), [activeCanvasTabId, activeProject, files, projectCanvases])
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const activeProjectLabel = activeProject?.label ?? "Untitled Study"
  const activeCanvasLabel = canvasTabs.find((tab) => tab.id === activeCanvasTabId)?.label ?? activeProjectLabel
  const isMacDesktop = window.rxnflowDesktop?.platform === "darwin"
  const isMacCopyDragPlatform = isMacDesktop || /Mac|iPhone|iPad|iPod/.test(window.navigator.platform)
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
  const relativeEnergyByNodeId = useMemo<BarrierRelativeEnergyLookup>(
    () => new Map(energyRows.map((row) => [row.nodeId, row.relative])),
    [energyRows],
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
  const resizePreviewGeometryRef = useRef<NodeResizePreviewCache | null>(null)

  useLayoutEffect(() => {
    liveViewportRef.current = viewport
  }, [viewport])

  useLayoutEffect(() => {
    activeProjectIdRef.current = activeProjectId
  }, [activeProjectId])

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

  const finishCanvasViewportPreview = useCallback(() => {
    canvasRef.current?.classList.remove("is-live-pan")
  }, [])

  const commitMinimapViewport = useCallback((nextViewport: CanvasViewport) => {
    finishCanvasViewportPreview()
    setViewport(nextViewport)
  }, [finishCanvasViewportPreview])

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
      const segment = createEdgeSegment(source, targetNode, edgePreview.edge.stepRole)
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
        const segment = createBarrierSegment(barrierPreview.barrier, previewNodeMap, energyDisplayOptions, relativeEnergyByNodeId)
        if (!segment) continue
        barrierPreview.hitPath?.setAttribute("d", segment.arrowPath)
        barrierPreview.guidePath?.setAttribute("d", segment.guidePath)
        barrierPreview.arrowPath?.setAttribute("d", segment.arrowPath)
        if (barrierPreview.labelElement) {
          barrierPreview.labelElement.style.transform = `translate(${segment.labelPoint.x - barrierPreview.labelWidth / 2}px, ${segment.labelPoint.y - 20}px)`
        }
      }
    }
  }, [buildNodeDragPreviewCache, energyDisplayOptions, relativeEnergyByNodeId])

  const clearDragPreview = useCallback(() => {
    canvasRef.current?.classList.remove("is-live-pan", "is-live-node-drag", "is-live-node-resize")
    dragPreviewNodeRef.current?.element?.classList.remove("is-live-dragging", "is-live-resizing")
    dragPreviewNodeRef.current = null
    dragPreviewGeometryRef.current = null
    resizePreviewGeometryRef.current = null
  }, [])

  const startNodeResizePreview = useCallback((nodeId: string, originSize: SurfaceSize, element?: HTMLElement | null) => {
    const dragCache = buildNodeDragPreviewCache(nodeId, element)
    if (!dragCache) return null
    const resizeCache: NodeResizePreviewCache = {
      ...dragCache,
      originSize,
    }
    resizePreviewGeometryRef.current = resizeCache
    canvasRef.current?.classList.add("is-live-node-drag", "is-live-node-resize")
    dragCache.element?.classList.add("is-live-dragging", "is-live-resizing")
    return resizeCache
  }, [buildNodeDragPreviewCache])

  const previewNodeSize = useCallback((nodeId: string, size: SurfaceSize) => {
    let cache = resizePreviewGeometryRef.current?.nodeId === nodeId
      ? resizePreviewGeometryRef.current
      : null
    if (!cache || !cache.element?.isConnected) {
      const node = nodeMap.get(nodeId)
      cache = node ? startNodeResizePreview(nodeId, flowNodeSize(node)) : null
    }
    const element = cache?.element ?? null
    if (!cache || !element) return
    canvasRef.current?.classList.add("is-live-node-drag", "is-live-node-resize")
    element.classList.add("is-live-dragging", "is-live-resizing")
    element.style.width = `${size.width}px`
    element.style.height = `${size.height}px`

    const previewNode = { ...cache.node, size }
    for (const edgePreview of cache.edges) {
      const source = edgePreview.edge.sourceId === nodeId ? previewNode : edgePreview.source
      const targetNode = edgePreview.edge.targetId === nodeId ? previewNode : edgePreview.target
      const segment = createEdgeSegment(source, targetNode, edgePreview.edge.stepRole)
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
        const segment = createBarrierSegment(barrierPreview.barrier, previewNodeMap, energyDisplayOptions, relativeEnergyByNodeId)
        if (!segment) continue
        barrierPreview.hitPath?.setAttribute("d", segment.arrowPath)
        barrierPreview.guidePath?.setAttribute("d", segment.guidePath)
        barrierPreview.arrowPath?.setAttribute("d", segment.arrowPath)
        if (barrierPreview.labelElement) {
          barrierPreview.labelElement.style.transform = `translate(${segment.labelPoint.x - barrierPreview.labelWidth / 2}px, ${segment.labelPoint.y - 20}px)`
        }
      }
    }
  }, [energyDisplayOptions, nodeMap, relativeEnergyByNodeId, startNodeResizePreview])

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
    const reconciledSnapshot = reconcileProjectWorkspaceSourceNodes(snapshot)
    setCanvasTabs(canvasTabsFromProjectCanvases(reconciledSnapshot.canvases))
    setActiveCanvasTabId(reconciledSnapshot.activeCanvasId)
    applyProjectWorkspaceSnapshotState(appStateSetters, reconciledSnapshot, clearEditHistory)
  }, [appStateSetters, clearEditHistory])

  const applyProjectTransition = useCallback((transition: ProjectTransitionApplication) => {
    const reconciledWorkspaces = Object.fromEntries(Object.entries(transition.workspaces).map(([projectId, snapshot]) => [
      projectId,
      reconcileProjectWorkspaceSourceNodes(snapshot),
    ]))
    const activeSnapshot = reconciledWorkspaces[transition.activeProjectId]
      ?? reconcileProjectWorkspaceSourceNodes(transition.activeSnapshot)
    const reconciledTransition = {
      ...transition,
      workspaces: {
        ...reconciledWorkspaces,
        [transition.activeProjectId]: activeSnapshot,
      },
      activeSnapshot,
    }
    setCanvasTabs(canvasTabsFromProjectCanvases(activeSnapshot.canvases))
    setActiveCanvasTabId(activeSnapshot.activeCanvasId)
    applyProjectTransitionState(appStateSetters, reconciledTransition, clearEditHistory)
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
        pushEditHistory,
        copyModifier: isMacCopyDragPlatform ? event.altKey : event.ctrlKey,
      })
    },
    [
      appStateSetters,
      barriers,
      buildNodeDragPreviewCache,
      edges,
      isMacCopyDragPlatform,
      nodes,
      pushEditHistory,
      screenToWorld,
      selectedBarrierIds,
      selectedEdgeIds,
      selectedNodeIds,
    ],
  )

  const handleNodeResizePointerDown = useCallback((event: PointerEvent<HTMLElement>, node: FlowNode) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)

    const pointerId = event.pointerId
    const startWorld = screenToWorld({ x: event.clientX, y: event.clientY })
    const originSize = flowNodeSize(node)
    startNodeResizePreview(node.id, originSize, event.currentTarget.closest<HTMLElement>("[data-flow-node-id]"))
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
      previewNodeSize(node.id, nextSize)
      return nextSize
    }

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
      clearDragPreview()
    }

    const handlePointerMove = (pointerEvent: globalThis.PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return
      pointerEvent.preventDefault()
      updateSizeFromPointer(pointerEvent)
    }

    const handlePointerUp = (pointerEvent: globalThis.PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return
      pointerEvent.preventDefault()
      const finalSize = updateSizeFromPointer(pointerEvent, true)
      if (nodeSizeChanged(snapshot, node.id, finalSize)) pushEditHistory(snapshot)
      setNodes((current) => applyNodeSize(current, node.id, finalSize))
      cleanup()
    }

    const handlePointerCancel = (pointerEvent: globalThis.PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return
      previewNodeSize(node.id, originSize)
      cleanup()
      setNodes((current) => applyNodeSize(current, node.id, originSize))
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)
  }, [appStateSetters, clearDragPreview, currentEditSnapshot, previewNodeSize, pushEditHistory, screenToWorld, startNodeResizePreview])

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
      edges,
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
    edges,
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

  const startConnection = useCallback((event: PointerEvent<HTMLElement>, sourceId: string, stepRole?: "addition") => {
    startConnectionAction({
      event,
      sourceId,
      stepRole,
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

  const completeConnectionToNode = useCallback((event: PointerEvent<HTMLElement>, targetId: string, targetStepRole?: "release") => {
    completeConnectionToNodeAction({
      event,
      targetId,
      targetStepRole,
      connectionDraft,
      nodes,
      edges,
      appStateSetters,
      pushEditHistory,
    })
  }, [appStateSetters, connectionDraft, edges, nodes, pushEditHistory])

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
        rememberProjectDirectory(transition.activeProjectId, result.projectDirectory)
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
      rememberProjectDirectory(restored.activeProjectId, result.projectDirectory)
      applyProjectTransition(restored)
      return true
    }).catch((error: unknown) => {
      setProjectValidation(projectFolderCreationFailureValidation(error))
      return false
    })
  }, [activeProjectId, applyProjectTransition, currentProjectWorkspaceSnapshot, projectWorkspaces, projects, rememberProjectDirectory])

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
    if (projectForgetInFlightRef.current.has(projectId)) return
    const project = projects.find((item) => item.id === projectId)
    const projectDirectory = projectDirectoriesRef.current[projectId] ?? null
    const applyRemoval = () => {
      const latestState = projectRestoreStateRef.current ?? {
        projects,
        workspaces: projectWorkspaces,
        activeProjectId,
        activeSnapshot: currentProjectWorkspaceSnapshot(),
      }
      const action = deleteProjectAction({
        projects: latestState.projects,
        workspaces: latestState.workspaces,
        activeProjectId: latestState.activeProjectId,
        deletedProjectId: projectId,
        currentSnapshot: latestState.activeSnapshot,
        emptyViewport: defaultCanvasViewport(canvasRef.current),
        now: Date.now(),
      })
      autosaveQueueRef.current.delete(projectId)
      autosaveKeysRef.current.delete(projectId)
      projectLifecycleGenerationRef.current.set(
        projectId,
        (projectLifecycleGenerationRef.current.get(projectId) ?? 0) + 1,
      )
      rememberProjectDirectory(projectId, null)
      if (action.kind === "activate") {
        applyProjectTransition(action.transition)
        return
      }
      if (action.kind === "delete-inactive") {
        setProjects(action.projects)
        setProjectWorkspaces(action.workspaces)
        setProjectValidation(null)
      }
    }
    if (!window.rxnflowDesktop?.forgetProject) {
      applyRemoval()
      return
    }
    projectForgetInFlightRef.current.add(projectId)
    void forgetProjectInRuntime({
      desktopApi: window.rxnflowDesktop,
      projectId,
      projectDirectory,
    }).then((forgotten) => {
      if (forgotten) {
        applyRemoval()
        return
      }
      setProjectValidation(projectForgetFailureValidation(project?.label ?? projectId))
    }).finally(() => {
      projectForgetInFlightRef.current.delete(projectId)
    })
  }, [activeProjectId, applyProjectTransition, currentProjectWorkspaceSnapshot, projectWorkspaces, projects, rememberProjectDirectory])

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
  useEffect(() => {
    stageSourceFilesForProjectRef.current = stageSourceFilesForProject
  }, [stageSourceFilesForProject])

  useEffect(() => {
    appDisposedRef.current = false
    return () => {
      appDisposedRef.current = true
      for (const batcher of desktopImportFrameBatchersRef.current) batcher.cancel()
      desktopImportFrameBatchersRef.current.clear()
    }
  }, [])

  const removePendingImportFile = useCallback((projectId: string, ...removedFiles: ImportSourceFile[]) => {
    const rollbackTargets = removedFiles.filter(Boolean)
    if (rollbackTargets.length === 0) return
    const shouldRemove = (file: SourceFile) => rollbackTargets.some((target) => shouldRemoveFailedDesktopImportFile(file, target))
    if (projectId === activeProjectId) {
      setFiles((current) => {
        const next = current.filter((file) => !shouldRemove(file))
        return next.length === current.length ? current : next
      })
    } else {
      setProjectWorkspaces((current) => {
        const workspace = current[projectId]
        if (!workspace) return current
        const nextFiles = workspace.files.filter((file) => !shouldRemove(file))
        if (nextFiles.length === workspace.files.length) return current
        return {
          ...current,
          [projectId]: {
            ...workspace,
            files: nextFiles,
          },
        }
      })
    }
    const rollbackIds = new Set(rollbackTargets.map((file) => file.id))
    setSelectedFileIds((current) => current.filter((id) => !rollbackIds.has(id)))
    setSelectedFileId((current) => current && rollbackIds.has(current) ? null : current)
    setLastSelectedFileId((current) => current && rollbackIds.has(current) ? null : current)
    setInspectorMode("inspector")
  }, [activeProjectId])

  const runDesktopImportParseJob = useCallback((
    projectId: string,
    importedFiles: ImportSourceFile[],
    options: StageSourceFilesOptions = {},
    rawFiles: File[] = [],
  ) => {
    const desktopApi = window.rxnflowDesktop
    if (!desktopApi?.importSourceFiles || importedFiles.length === 0) return
    const autoRegister = options.autoRegister === true
    const projectFiles = projectId === activeProjectId
      ? currentProjectWorkspaceSnapshot().files
      : projectWorkspaces[projectId]?.files ?? []
    const replacementPlan = desktopImportFilesWithProjectTargets(importedFiles, projectFiles)
    let frameBatcher: AnimationFrameBatcher<ImportSourceFile> | null = null
    if (!autoRegister) {
      frameBatcher = createAnimationFrameBatcher({
        onFlush: async (parsedFiles, lastQueuedFile) => {
          const currentBatcher = frameBatcher
          if (!currentBatcher || !desktopImportFrameBatchersRef.current.has(currentBatcher)) return
          await (stageSourceFilesForProjectRef.current ?? stageSourceFilesForProject)(
            projectId,
            parsedFiles,
            {
              ...options,
              fileMode: "update",
              autoRegister: false,
              parseMode: "defer",
            },
          )
          if (!desktopImportFrameBatchersRef.current.has(currentBatcher)) return
          const selectedFileId = lastQueuedFile.id
          setSelectedFileIds([selectedFileId])
          setSelectedFileId(selectedFileId)
          setLastSelectedFileId(selectedFileId)
        },
      })
      desktopImportFrameBatchersRef.current.add(frameBatcher)
    }

    const parseJob = desktopParsedImportSourceFiles({
      desktopApi,
      projectId,
      projectDirectory: projectDirectoriesRef.current[projectId] ?? null,
      importedFiles: replacementPlan.files,
      rawFiles,
      referencedStoredPaths: referencedStoredPathsForProject({
        projectId,
        activeProjectId,
        currentSnapshot: currentProjectWorkspaceSnapshot(),
        workspaces: projectWorkspaces,
      }),
      onFileParsed: async (parsedFile, index) => {
        const replacementTarget = replacementPlan.replacementsByImportId.get(parsedFile.id)
        const restoreReplacementSelection = () => {
          if (!replacementTarget) return
          setSelectedFileIds((current) => Array.from(new Set(current.map((id) => (
            id === parsedFile.id ? replacementTarget.fileId : id
          )))))
          setSelectedFileId((current) => current === parsedFile.id ? replacementTarget.fileId : current)
          setLastSelectedFileId((current) => current === parsedFile.id ? replacementTarget.fileId : current)
        }
        if (desktopImportFailureShouldRemovePlaceholder(parsedFile)) {
          if (!frameBatcher) {
            restoreReplacementSelection()
            removePendingImportFile(projectId, parsedFile, importedFiles[index] ?? parsedFile)
            return
          }
          const currentBatcher = frameBatcher
          try {
            await currentBatcher.flush()
          } finally {
            if (desktopImportFrameBatchersRef.current.has(currentBatcher)) {
              restoreReplacementSelection()
              removePendingImportFile(projectId, parsedFile, importedFiles[index] ?? parsedFile)
            }
          }
          return
        }
        const resolvedFile = desktopImportFileWithReplacementIdentity(
          parsedFile,
          replacementTarget,
        )
        if (frameBatcher) {
          frameBatcher.enqueue(resolvedFile, index)
          return
        }
        await (stageSourceFilesForProjectRef.current ?? stageSourceFilesForProject)(projectId, [resolvedFile], {
          ...options,
          fileMode: "update",
          autoRegister: true,
          parseMode: "defer",
        })
      },
    })

    void (async () => {
      try {
        const parsedFiles = await parseJob
        await frameBatcher?.flush()
        if (appDisposedRef.current) return
        const entries = importIssueDialogEntries(parsedFiles)
        if (entries.length > 0) {
          const issue = {
            title: entries.some((entry) => entry.code === "unsupported_format") ? "Unsupported import format" : "Import failed",
            entries,
          }
          if (desktopApi.showImportIssues) {
            void desktopApi.showImportIssues(issue).catch(() => {
              if (!appDisposedRef.current) setImportIssueDialog(issue)
            })
            return
          }
          setImportIssueDialog(issue)
        }
      } catch (error: unknown) {
        let reportedError = error
        if (frameBatcher) {
          try {
            await frameBatcher.flush()
          } catch (flushError: unknown) {
            reportedError = flushError
          }
        }
        if (appDisposedRef.current) return
        setProjectValidation({
          valid: true,
          summary: {},
          issues: [{
            severity: "warning",
            code: "import_parse_failed",
            message: reportedError instanceof Error ? reportedError.message : "The desktop parser could not finish this import job.",
          }],
        })
      } finally {
        if (frameBatcher) {
          frameBatcher.cancel()
          desktopImportFrameBatchersRef.current.delete(frameBatcher)
        }
      }
    })()
  }, [activeProjectId, currentProjectWorkspaceSnapshot, projectWorkspaces, removePendingImportFile, stageSourceFilesForProject])

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
    const rawFiles = Array.from(fileList)
    const useDesktopImportJob = Boolean(window.rxnflowDesktop?.importSourceFiles)
    const desktopApi = window.rxnflowDesktop
    const importedFiles = await importFilesForProjectAction({
      fileList: rawFiles,
      projectId,
      stageSourceFilesForProject,
      previewMode: useDesktopImportJob ? "none" : "full",
      prepareFile: useDesktopImportJob
        ? (file) => {
            const sourcePath = desktopSourceFilePathForRawFile(desktopApi, file)
            return sourcePath ? { sourcePath } : undefined
          }
        : undefined,
      stageOptions: {
        autoRegister: false,
        parseMode: useDesktopImportJob ? "defer" : "fallback",
      },
    })
    if (useDesktopImportJob) runDesktopImportParseJob(projectId, importedFiles, { autoRegister: false }, rawFiles)
  }, [activeProjectId, runDesktopImportParseJob, stageSourceFilesForProject])

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

  const addImageAnnotations = useCallback(async (imageFiles: File[], center?: Point) => {
    const filesToInsert = imageFiles.filter(isCanvasImageFile)
    if (filesToInsert.length === 0) return false
    const canvas = canvasRef.current
    const rect = canvas?.getBoundingClientRect()
    const viewportCenter = center ?? screenToWorld({
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

  const handleCanvasRawFileDrop = useCallback(async (drop: CanvasRawFileDrop) => {
    if (drop.kind === "external-files") {
      const imageFiles = drop.files.filter(isCanvasImageFile)
      const sourceFiles = drop.files.filter((file) => !isCanvasImageFile(file))
      if (imageFiles.length > 0) await addImageAnnotations(imageFiles, drop.position)
      if (sourceFiles.length === 0) return
      if (window.rxnflowDesktop?.importSourceFiles) {
        const transition = canvasRawFileDropImportTransition({ ...drop, files: sourceFiles }, files)
        if (!transition || transition.kind !== "external-files") return
        const desktopApi = window.rxnflowDesktop
        const importedFiles = await browserImportSourceFilesFromFiles(transition.files, transition.idPrefix, {
          previewMode: "none",
          prepareFile: (file) => {
            const sourcePath = desktopSourceFilePathForRawFile(desktopApi, file)
            return sourcePath ? { sourcePath } : undefined
          },
        })
        await stageSourceFiles(importedFiles.map(deferredDesktopImportPlaceholder), {
          ...transition.options,
          autoRegister: false,
          parseMode: "defer",
        })
        runDesktopImportParseJob(activeProjectId, importedFiles, transition.options, sourceFiles)
        return
      }
      await handleCanvasRawFileDropAction({
        drop: { ...drop, files: sourceFiles },
        files,
        stageCurrentProjectSourceFiles: stageSourceFiles,
      })
      return
    }
    await handleCanvasRawFileDropAction({
      drop,
      files,
      stageCurrentProjectSourceFiles: stageSourceFiles,
    })
  }, [activeProjectId, addImageAnnotations, files, runDesktopImportParseJob, stageSourceFiles])

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
      if (event.defaultPrevented) return
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
    const useDesktopImportJob = Boolean(window.rxnflowDesktop?.importSourceFiles)
    const importedFiles = await importDesktopFilesAction({
      projectId,
      chooseFiles: window.rxnflowDesktop?.chooseFiles,
      stageSourceFilesForProject,
      stageOptions: {
        autoRegister: false,
        parseMode: useDesktopImportJob ? "defer" : "fallback",
      },
    })
    if (useDesktopImportJob) runDesktopImportParseJob(projectId, importedFiles, { autoRegister: false })
  }, [activeProjectId, runDesktopImportParseJob, stageSourceFilesForProject])

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
    if (startupRestorePending) return
    setActiveProjectInRuntime({
      desktopApi: window.rxnflowDesktop,
      projectId: activeProjectId,
      projectDirectory: projectDirectoriesRef.current[activeProjectId] ?? null,
    })
  }, [activeProjectId, startupRestorePending])

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
    rememberProjectDirectory(transition.activeProjectId, options?.projectDirectory)
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
  }, [activeProjectId, applyProjectTransition, currentProjectWorkspaceSnapshot, projectWorkspaces, projects, rememberProjectDirectory])
  const restoreStartupProjectPackages = useCallback<RestoreStartupProjectPackagesHandler>((payloads) => {
    let restoreState = projectRestoreStateRef.current ?? {
      projects,
      workspaces: projectWorkspaces,
      activeProjectId,
      activeSnapshot: currentProjectWorkspaceSnapshot(),
    }
    let finalTransition: Extract<ProjectPackageRestoreTransition, { ok: true }> | null = null
    let finalValidation: ProjectValidationPayload | null | undefined

    for (const [index, payload] of payloads.entries()) {
      const transition = projectPackageRestoreTransitionFromContent({
        content: payload.content,
        validation: payload.validation,
        projects: restoreState.projects,
        workspaces: restoreState.workspaces,
        activeProjectId: restoreState.activeProjectId,
        currentSnapshot: restoreState.activeSnapshot,
        replaceProjects: payload.replaceProjects ?? index === 0,
      })
      finalValidation = transition.validation
      if (!transition.ok) continue

      rememberProjectDirectory(transition.activeProjectId, payload.projectDirectory)
      restoreState = {
        projects: transition.projects,
        workspaces: transition.workspaces,
        activeProjectId: transition.activeProjectId,
        activeSnapshot: transition.activeSnapshot,
      }
      finalTransition = transition
    }

    if (!finalTransition) {
      if (finalValidation !== undefined) setProjectValidation(finalValidation)
      return
    }
    projectRestoreStateRef.current = restoreState
    applyProjectTransition({
      ...finalTransition,
      validation: finalValidation,
    })
  }, [activeProjectId, applyProjectTransition, currentProjectWorkspaceSnapshot, projectWorkspaces, projects, rememberProjectDirectory])
  restoreStartupProjectPackagesRef.current = restoreStartupProjectPackages

  const handleProjectInputChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ""
    if (!file) return
    if (file.size > maxBrowserProjectPackageBytes) {
      setProjectValidation({
        valid: false,
        summary: { size: file.size, maxSize: maxBrowserProjectPackageBytes },
        issues: [{
          severity: "error",
          code: "project_package_too_large",
          message: `Project package is too large (${file.size} bytes; maximum ${maxBrowserProjectPackageBytes} bytes).`,
        }],
      })
      return
    }
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
    const result = await saveProjectPackageToRuntime({
      desktopApi: window.rxnflowDesktop,
      project: activeProject,
      files,
      canvases: projectCanvases,
      activeCanvasId: activeCanvasTabId,
      setProjectValidation,
    })
    rememberProjectDirectory(activeProject.id, result?.projectDirectory)
  }, [activeCanvasTabId, activeProject, files, projectCanvases, rememberProjectDirectory])

  const runAutosaveProject = useCallback(async (requestedInput?: ProjectAutosaveInput) => {
    const desktopApi = window.rxnflowDesktop
    const input = requestedInput ?? autosaveInputRef.current
    if (!desktopApi?.autosaveProjectPackage || !input) return

    const autosaveKey = projectAutosaveKey(input)
    const lifecycleGeneration = input.lifecycleGeneration
    if ((projectLifecycleGenerationRef.current.get(input.project.id) ?? 0) !== lifecycleGeneration) {
      autosaveQueueRef.current.delete(input.project.id)
      return
    }
    if (autosaveKey === autosaveKeysRef.current.get(input.project.id)) {
      autosaveQueueRef.current.delete(input.project.id)
      return
    }
    if (autosaveInFlightRef.current) {
      autosaveQueueRef.current.delete(input.project.id)
      autosaveQueueRef.current.set(input.project.id, input)
      return
    }

    autosaveInFlightRef.current = true
    autosaveKeysRef.current.set(input.project.id, autosaveKey)
    try {
      let responseValidation: ProjectValidationPayload | null | undefined
      const result = await autosaveProjectPackageToRuntime({
        desktopApi,
        ...input,
        setProjectValidation: (validation) => {
          responseValidation = validation
        },
      })
      if ((projectLifecycleGenerationRef.current.get(input.project.id) ?? 0) !== lifecycleGeneration) return
      rememberProjectDirectory(input.project.id, result?.projectDirectory)
      if (activeProjectIdRef.current === input.project.id) {
        if (responseValidation !== undefined) setProjectValidation(responseValidation)
      }
      if (result?.content && activeProjectIdRef.current === input.project.id) {
        setFiles((current) => sourceFilesWithAutosavedMetadata(current, result.content ?? ""))
      } else if (result?.content) {
        setProjectWorkspaces((current) => {
          const workspace = current[input.project.id]
          if (!workspace) return current
          const nextFiles = sourceFilesWithAutosavedMetadata(workspace.files, result.content ?? "")
          if (nextFiles === workspace.files) return current
          return {
            ...current,
            [input.project.id]: {
              ...workspace,
              files: nextFiles,
            },
          }
        })
      }
    } catch (error) {
      if ((projectLifecycleGenerationRef.current.get(input.project.id) ?? 0) === lifecycleGeneration) {
        autosaveKeysRef.current.delete(input.project.id)
      }
      if ((projectLifecycleGenerationRef.current.get(input.project.id) ?? 0) === lifecycleGeneration
        && activeProjectIdRef.current === input.project.id) {
        setProjectValidation(projectAutosaveFailureValidation(error))
      }
    } finally {
      autosaveInFlightRef.current = false
      const nextQueued = autosaveQueueRef.current.entries().next().value as [string, ProjectAutosaveInput] | undefined
      if (nextQueued) {
        autosaveQueueRef.current.delete(nextQueued[0])
        void runAutosaveProject(nextQueued[1])
      }
    }
  }, [rememberProjectDirectory])

  useEffect(() => {
    const previousInput = autosaveInputRef.current
    if (autosaveHydratedRef.current && previousInput && previousInput.project.id !== autosaveInput.project.id) {
      void runAutosaveProject(previousInput)
    }
    autosaveInputRef.current = autosaveInput
    if (autosaveQueueRef.current.has(autosaveInput.project.id)) {
      if (autosaveKeysRef.current.get(autosaveInput.project.id) === projectAutosaveKey(autosaveInput)) {
        autosaveQueueRef.current.delete(autosaveInput.project.id)
        return
      }
      autosaveQueueRef.current.delete(autosaveInput.project.id)
      autosaveQueueRef.current.set(autosaveInput.project.id, autosaveInput)
    }
  }, [autosaveInput, runAutosaveProject])

  useEffect(() => {
    if (!window.rxnflowDesktop?.autosaveProjectPackage) return
    if (startupRestorePending) return

    if (!autosaveHydratedRef.current) {
      autosaveHydratedRef.current = true
      autosaveKeysRef.current.set(autosaveInput.project.id, projectAutosaveKey(autosaveInput))
      return
    }
    if (dragState) return

    const timer = window.setTimeout(() => {
      void runAutosaveProject(autosaveInput)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [autosaveInput, dragState, runAutosaveProject, startupRestorePending])

  useEffect(() => subscribeProjectPackageRuntimeMenus({
    desktopApi: window.rxnflowDesktop,
    openProjectPackage,
    saveProjectPackage,
    restoreProjectPackage,
  }), [openProjectPackage, restoreProjectPackage, saveProjectPackage])

  useEffect(() => restoreStartupProjectFromRuntime({
    desktopApi: window.rxnflowDesktop,
    restoreProjectPackages: (payloads) => {
      restoreStartupProjectPackagesRef.current?.(payloads)
    },
    onSettled: () => setStartupRestorePending(false),
  }), [])

  useEffect(() => watchDesktopEngineStatus({
    desktopApi: window.rxnflowDesktop,
    setEngineStatus,
  }), [])

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

  const deleteProjectFiles = useCallback((fileIds: string[]) => {
    const deletedFileIds = new Set(fileIds)
    if (deletedFileIds.size === 0) return

    const deletedNodeIds = new Set(nodes.filter((node) => node.sourceFileId && deletedFileIds.has(node.sourceFileId)).map((node) => node.id))
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
    const nextFiles = files.filter((file) => !deletedFileIds.has(file.id))
    const fallbackFileId = nextFiles[0]?.id ?? null
    const nextSelectedFileIds = selectedFileIds.filter((fileId) => !deletedFileIds.has(fileId))
    setFiles(nextFiles)
    setSelectedFileIds(nextSelectedFileIds.length > 0 ? nextSelectedFileIds : fallbackFileId ? [fallbackFileId] : [])
    setSelectedFileId(selectedFileId && !deletedFileIds.has(selectedFileId) ? selectedFileId : fallbackFileId)
    setLastSelectedFileId(lastSelectedFileId && !deletedFileIds.has(lastSelectedFileId) ? lastSelectedFileId : fallbackFileId)
    setInspectorMode("inspector")
  }, [barriers, edges, files, lastSelectedFileId, nodes, pushEditHistory, selectedFileId, selectedFileIds])

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
        basename: activeCanvasLabel,
        title: activeCanvasLabel,
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
  }, [activeCanvasLabel, activeProject.label, edges, energyRows, exportOptions, files, nodes])

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


  const hydrateSourceParseForStructure = useCallback(async (file: SourceFile): Promise<SourceParseResult | null> => {
    const desktopParser = window.rxnflowDesktop?.parseSourcePreview
    if (desktopParser) {
      try {
        const result = await desktopParser({
          projectId: activeProjectId,
          name: file.name,
          size: file.size,
          preview: file.preview,
          storedPath: file.storedPath,
          sourcePath: file.sourcePath,
        })
        const parse = result.ok ? result.data?.parse ?? null : null
        if (parse) {
          setFiles((current) => current.map((item) => item.id === file.id
            ? normalizeSourceFileForPersistence({ ...item, parse, kind: parse.sourceKind, status: parse.parsed ? "parsed" : item.status })
            : item,
          ))
          return parse
        }
      } catch {
        // Browser fallback below can still parse the in-memory preview sample.
      }
    }
    if (!file.preview) return null
    const parse = parseSourcePreview({ name: file.name, preview: file.preview })
    setFiles((current) => current.map((item) => item.id === file.id
      ? normalizeSourceFileForPersistence({ ...item, parse, kind: parse.sourceKind, status: parse.parsed ? "parsed" : item.status })
      : item,
    ))
    return parse
  }, [activeProjectId])

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

  const selectAllCanvasItems = useCallback(() => {
    applyCanvasSelectionState(appStateSetters, selectAllCanvasGraphItems({ nodes, edges, barriers }))
    appStateSetters.setInspectorMode("inspector")
  }, [appStateSetters, barriers, edges, nodes])

  const copyCanvasSelection = useCallback(() => {
    const payload = copyCanvasSelectionPayload({ nodes, edges, barriers }, {
      nodeIds: selectedNodeIds,
      edgeIds: selectedEdgeIds,
      barrierIds: selectedBarrierIds,
    })
    if (!payload) return
    canvasClipboardRef.current = payload
    canvasClipboardPasteIndexRef.current = 0
  }, [barriers, edges, nodes, selectedBarrierIds, selectedEdgeIds, selectedNodeIds])

  const pasteCanvasClipboard = useCallback(() => {
    const pasteIndex = canvasClipboardPasteIndexRef.current + 1
    const result = pasteCanvasClipboardPayload(
      { nodes, edges, barriers },
      canvasClipboardRef.current,
      { pasteIndex },
    )
    if (!result) {
      void pasteImagesFromSystemClipboard()
      return
    }
    pushEditHistory()
    setNodes(result.collections.nodes)
    setEdges(result.collections.edges)
    setBarriers(result.collections.barriers)
    applyCanvasSelectionState(appStateSetters, result.selection)
    appStateSetters.setInspectorMode("inspector")
    canvasClipboardPasteIndexRef.current = pasteIndex
  }, [appStateSetters, barriers, edges, nodes, pasteImagesFromSystemClipboard, pushEditHistory])

  const cutCanvasSelection = useCallback(() => {
    const selection = {
      nodeIds: selectedNodeIds,
      edgeIds: selectedEdgeIds,
      barrierIds: selectedBarrierIds,
    }
    const payload = copyCanvasSelectionPayload({ nodes, edges, barriers }, selection)
    if (!payload) return
    canvasClipboardRef.current = payload
    canvasClipboardPasteIndexRef.current = 0
    deleteSelection(selection)
  }, [barriers, deleteSelection, edges, nodes, selectedBarrierIds, selectedEdgeIds, selectedNodeIds])

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
  const contextMenuNode = contextMenuNodeId ? nodeMap.get(contextMenuNodeId) ?? null : null
  const contextMenuEdgeId = canvasContextMenu?.target.kind === "edge" ? canvasContextMenu.target.edgeId : null
  const contextMenuAnnotationId = canvasContextMenu?.target.kind === "annotation" ? canvasContextMenu.target.annotationId : null
  const beginMoveAnnotation = useCallback(() => {
    pushEditHistory()
  }, [pushEditHistory])
  const moveAnnotation = useCallback((annotationId: string, position: Point) => {
    setAnnotations((current) => current.map((annotation) => (
      annotation.id === annotationId ? { ...annotation, position } : annotation
    )))
  }, [])
  const deleteContextMenuSelection = useCallback(() => {
    if (!canvasContextMenu) return
    if (canvasContextMenu.target.kind === "annotation") {
      pushEditHistory()
      deleteAnnotation(canvasContextMenu.target.annotationId)
      setCanvasContextMenu(null)
      return
    }
    deleteSelection(canvasContextMenu.target.selection)
    setCanvasContextMenu(null)
  }, [canvasContextMenu, deleteAnnotation, deleteSelection, pushEditHistory])

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
      selectAllCanvasItems,
      copyCanvasSelection,
      pasteCanvasClipboard,
      cutCanvasSelection,
      deleteSelection,
      clearCanvasSelection,
      nudgeSelectedNodes,
    })
  }, [
    clearCanvasSelection,
    copyCanvasSelection,
    cutCanvasSelection,
    deleteSelection,
    hasCanvasSelection,
    nudgeSelectedNodes,
    pasteCanvasClipboard,
    redoEdit,
    selectAllCanvasItems,
    undoEdit,
  ])

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

  const openSettings = useCallback((returnFocusTo?: HTMLElement | null) => {
    const activeElement = document.activeElement
    settingsReturnFocusRef.current = returnFocusTo
      ?? (activeElement instanceof HTMLElement ? activeElement : null)
    setSettingsOpen(true)
  }, [])

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
      onDeleteFiles={deleteProjectFiles}
      canvases={canvasTabs}
      activeCanvasId={activeCanvasTabId}
      onSelectCanvas={switchCanvasTab}
      onCreateCanvas={createCanvasTab}
      onDeleteCanvas={deleteCanvasTab}
      onOpenSettings={openSettings}
      width={projectRailWidth}
      minWidth={projectRailMinWidth}
      maxWidth={projectRailMaxWidth}
      onResizePointerDown={startProjectRailResize}
      onResizeStep={setClampedProjectRailWidth}
    />
  )

  const workbenchCommands = useMemo<WorkbenchCommand[]>(() => [
    { id: "tool-select", label: "Select Tool", group: "Tools", shortcut: "V", run: () => setTool("select") },
    { id: "tool-pan", label: "Pan Tool", group: "Tools", shortcut: "H", run: () => setTool("pan") },
    { id: "tool-text", label: "Text Tool", group: "Tools", shortcut: "X", run: () => setTool("text") },
    { id: "insert-image", label: "Insert Image", group: "Tools", shortcut: "I", run: openImagePicker },
    { id: "table", label: tableDrawerOpen ? "Close Table" : "Open Table", group: "View", shortcut: "T", run: () => setViewMode(tableDrawerOpen ? "canvas" : "table") },
    { id: "fit-view", label: "Fit View", group: "View", shortcut: "F", run: fitCanvasViewport },
    { id: "auto-layout", label: "Auto Layout", group: "View", shortcut: "A", run: applyAutoLayout, enabled: nodes.length > 0 },
    { id: "toggle-projects", label: leftSidebarOpen ? "Hide Project Sidebar" : "Show Project Sidebar", group: "View", run: () => setLeftSidebarOpen((current) => !current) },
    { id: "toggle-inspector", label: rightSidebarOpen ? "Hide Inspector" : "Show Inspector", group: "View", run: () => setRightSidebarOpen((current) => !current) },
    { id: "import", label: "Import Calculation Files", group: "Project", shortcut: "⌘O", run: () => importInputRef.current?.click() },
    { id: "settings", label: "Open Settings", group: "Project", run: () => openSettings() },
    { id: "undo", label: "Undo Canvas Edit", group: "Edit", shortcut: "⌘Z", run: undoEdit, enabled: historyPast.length > 0 },
    { id: "redo", label: "Redo Canvas Edit", group: "Edit", shortcut: "⇧⌘Z", run: redoEdit, enabled: historyFuture.length > 0 },
  ], [applyAutoLayout, fitCanvasViewport, historyFuture.length, historyPast.length, leftSidebarOpen, nodes.length, openImagePicker, openSettings, redoEdit, rightSidebarOpen, tableDrawerOpen, undoEdit])

  useEffect(() => {
    if (appModalOpen) setCommandPaletteOpen(false)
  }, [appModalOpen])

  useEffect(() => {
    const handleCommandKey = (event: globalThis.KeyboardEvent) => {
      const paletteShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"
      if (paletteShortcut) {
        event.preventDefault()
        if (!commandPaletteOpen && (appModalOpen || document.querySelector('[aria-modal="true"]'))) return
        setCommandPaletteOpen((current) => !current)
        return
      }
      if (commandPaletteOpen || isEditablePasteTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      const commandByKey: Record<string, string> = { v: "tool-select", h: "tool-pan", x: "tool-text", i: "insert-image", t: "table", f: "fit-view", a: "auto-layout" }
      const commandId = commandByKey[event.key.toLowerCase()]
      if (!commandId || document.querySelector('[aria-modal="true"]')) return
      const command = workbenchCommands.find((candidate) => candidate.id === commandId)
      if (!command || command.enabled === false) return
      event.preventDefault()
      command.run()
    }
    window.addEventListener("keydown", handleCommandKey)
    return () => window.removeEventListener("keydown", handleCommandKey)
  }, [appModalOpen, commandPaletteOpen, workbenchCommands])

  const appShellClassName = `app-shell theme-${theme}${isMacDesktop ? " is-macos-desktop" : ""}${leftSidebarOpen ? "" : " is-left-collapsed"}${rightSidebarOpen ? "" : " is-right-collapsed"}${desktopWindowState.isFullScreen ? " is-window-fullscreen" : ""}${desktopWindowState.isMaximized ? " is-window-maximized" : ""}${desktopWindowState.isFullScreen || desktopWindowState.isMaximized ? " is-window-edge-to-edge" : ""}${tableDrawerOpen || structurePreviewNode || structureEditorNode ? " has-overlay-view" : ""}`

  if (startupRestorePending) {
    return (
      <div className={`${appShellClassName} is-startup-restoring`} style={appShellStyle}>
        <div className="startup-restore-view" role="status" aria-live="polite">
          <span className="startup-restore-spinner" aria-hidden="true" />
          <strong>Opening workspace</strong>
          <span>Loading your recent RxnFlow project...</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={appShellClassName}
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
          returnFocusTo={settingsReturnFocusRef.current}
        />
      ) : null}

      {commandPaletteOpen && !appModalOpen ? <CommandPalette commands={workbenchCommands} onClose={() => setCommandPaletteOpen(false)} /> : null}

      {canvasContextMenu ? (
        <div
          ref={contextMenuRef}
          className="canvas-context-menu"
          role="menu"
          aria-label={contextMenuNodeId ? "Node context menu" : contextMenuEdgeId ? "Edge context menu" : contextMenuAnnotationId ? "Canvas annotation context menu" : "Canvas context menu"}
          style={{ left: canvasContextMenu.x, top: canvasContextMenu.y }}
        >
          {contextMenuNodeId ? (
            <>
              <button type="button" role="menuitem" onClick={renameContextMenuNode}>Rename</button>
              <label className="canvas-context-menu-field">
                <span>Coefficient</span>
                <input
                  type="number"
                  inputMode="decimal"
                  name="node-coefficient"
                  autoComplete="off"
                  defaultValue={contextMenuNode ? nodeCoefficient(contextMenuNode) : 1}
                  aria-label="Node coefficient"
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.key === "Enter") event.currentTarget.blur()
                    if (event.key === "Escape") setCanvasContextMenu(null)
                  }}
                  onBlur={(event) => {
                    if (!contextMenuNodeId) return
                    const value = Number(event.currentTarget.value)
                    if (Number.isFinite(value) && value !== 0) updateNodeCoefficient(contextMenuNodeId, Number(value.toFixed(6)))
                    setCanvasContextMenu(null)
                  }}
                />
              </label>
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
              onFitView={fitCanvasViewport}
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
                  onSetNodeCoefficient={updateNodeCoefficient}
                  onUpdateEdgeLabel={updateEdgeLabel}
                  onUpdateBarrierLabel={updateBarrierLabel}
                  onSetRelativeEnergyZero={setRelativeEnergyZeroFromNode}
                  onOpenStructure={openStructurePreview}
                  onShowNodeSource={showNodeSourceDetails}
                  onRenameNode={renameNode}
                  renameEditingNodeId={renameEditingNodeId}
                  onRenameRequestHandled={handleRenameRequestHandled}
                  onOpenContextMenu={openCanvasContextMenu}
                  onRawFileDrop={handleCanvasRawFileDrop}
                  editingAnnotationId={editingAnnotationId}
                  onBeginEditAnnotation={setEditingAnnotationId}
                  onBeginMoveAnnotation={beginMoveAnnotation}
                  onMoveAnnotation={moveAnnotation}
                  onUpdateTextAnnotation={updateTextAnnotation}
                  onDeleteAnnotation={deleteAnnotation}
                />
                <MiniMap
                  nodes={nodes}
                  selectedNodeIds={selectedNodeIds}
                  viewport={viewport}
                  canvasRef={canvasRef}
                  onViewportPreview={previewCanvasViewport}
                  onViewportPreviewEnd={finishCanvasViewportPreview}
                  onViewportChange={commitMinimapViewport}
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
                  nodes={nodes}
                  edges={edges}
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
            onOpenStructure={openStructurePreview}
            onEdit2DStructure={(nodeId) => {
              structureEditorReturnFocusRef.current = null
              setStructureEditorNodeId(nodeId)
            }}
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
          onEdit2DStructure={(nodeId, returnFocusTo) => {
            structureEditorReturnFocusRef.current = returnFocusTo ?? null
            setStructurePreviewNodeId(null)
            setStructureEditorNodeId(nodeId)
          }}
          onReset2DStructure={resetNodeManualStructure}
          onHydrateSourceParse={hydrateSourceParseForStructure}
        />
      ) : null}
      {structureEditorNode ? (
        <Molecule2DEditorDialog
          node={structureEditorNode}
          atoms={sourceCoordinatePreview(structureEditorNode, sourceFileForNode(structureEditorNode, files))?.atoms ?? []}
          returnFocusTo={structureEditorReturnFocusRef.current}
          onClose={() => {
            setStructureEditorNodeId(null)
            structureEditorReturnFocusRef.current = null
          }}
          onSave={saveNodeManualStructure}
        />
      ) : null}
      {importIssueDialog ? (
        <ImportIssueDialog
          issue={importIssueDialog}
          onClose={() => setImportIssueDialog(null)}
        />
      ) : null}
      {candidateReview && !candidateReviewBlocked ? (
        <CandidateReviewSheet
          key={candidateReview.id}
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

function ImportIssueDialog({ issue, onClose }: { issue: ImportIssueDialogState; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement && activeElement !== document.body) {
      returnFocusRef.current = activeElement
    }
    closeButtonRef.current?.focus({ preventScroll: true })
    return () => {
      const returnFocus = returnFocusRef.current
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    }
  }, [])

  return (
    <div
      className="structure-preview-scrim import-issue-scrim"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="structure-preview-dialog import-issue-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={issue.title}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            onClose()
            return
          }
          if (event.key !== "Tab") return
          event.preventDefault()
          closeButtonRef.current?.focus({ preventScroll: true })
        }}
      >
        <header className="structure-preview-header">
          <div>
            <span>Import Report</span>
            <strong>{issue.title}</strong>
          </div>
          <button ref={closeButtonRef} type="button" className="structure-preview-close-button" aria-label="Close import error" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="structure-preview-body import-issue-body">
          <article className="structure-dialog-pane import-issue-pane" aria-label="Import errors">
            <ul>
              {issue.entries.slice(0, 6).map((entry) => (
                <li key={`${entry.fileName}-${entry.code}`}>
                  <span>{entry.fileName}</span>
                  <em>{entry.message}</em>
                </li>
              ))}
            </ul>
            {issue.entries.length > 6 ? (
              <small>{issue.entries.length - 6} more files failed.</small>
            ) : null}
          </article>
        </div>
      </section>
    </div>
  )
}

function projectAutosaveKey(input: ProjectAutosaveInput): string {
  return JSON.stringify({
    project: input.project,
    files: input.files.map(sourceFileAutosaveSignature),
    canvases: input.canvases.map(canvasAutosaveSignature),
    activeCanvasId: input.activeCanvasId,
  })
}

function sourceFileAutosaveSignature(file: SourceFile) {
  const parse = file.parse
  return {
    id: file.id,
    name: file.name,
    kind: file.kind,
    size: file.size,
    status: file.status,
    previewLength: file.preview.length,
    previewHead: file.preview.slice(0, 96),
    previewTail: file.preview.slice(-96),
    sourcePath: file.sourcePath,
    storedPath: file.storedPath,
    checksum: file.checksum,
    parse: parse ? {
      parserId: parse.parserId,
      parserVersion: parse.parserVersion,
      parsed: parse.parsed,
      objectCount: parse.objectCount,
      parseScope: parse.parseScope,
      confidence: parse.confidence,
      sourceKind: parse.sourceKind,
      terminationStatus: parse.terminationStatus,
      primaryModeDisplacements: parse.coordinatePreview?.vibrationModes?.[0]?.displacements.length ?? 0,
      warnings: parse.warnings.map((warning) => `${warning.code}:${warning.target ?? ""}`),
      candidates: parse.candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        objectIndex: candidate.objectIndex,
        label: candidate.label,
        formula: candidate.formula,
        roleHint: candidate.roleHint,
        atoms: candidate.coordinatePreview?.atomCount ?? 0,
        modes: candidate.coordinatePreview?.vibrationModes?.length ?? 0,
        primaryModeDisplacements: candidate.coordinatePreview?.vibrationModes?.[0]?.displacements.length ?? 0,
      })),
    } : null,
  }
}

function canvasAutosaveSignature(canvas: ProjectAutosaveInput["canvases"][number]) {
  return {
    id: canvas.id,
    label: canvas.label,
    nodes: canvas.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      formula: node.formula,
      kind: node.kind,
      coefficient: node.coefficient,
      method: node.method,
      solvent: node.solvent,
      energyGas: node.energyGas,
      energySolution: node.energySolution,
      energyUnit: node.energyUnit,
      sourceStatus: node.sourceStatus,
      sourceFileId: node.sourceFileId,
      sourceCandidateId: node.sourceCandidateId,
      sourceObjectIndex: node.sourceObjectIndex,
      parserId: node.parserId,
      parserVersion: node.parserVersion,
      roleHint: node.roleHint,
      charge: node.charge,
      spinMultiplicity: node.spinMultiplicity,
      energyTable: node.energyTable,
      corrections: node.corrections,
      manualStructureKet: node.manualStructureKet,
      manualStructureMolfile: node.manualStructureMolfile,
      manualStructureCdxml: node.manualStructureCdxml,
      position: node.position,
      size: node.size,
    })),
    edges: canvas.edges,
    barriers: canvas.barriers,
    annotations: (canvas.annotations ?? []).map((annotation) => annotation.type === "image"
      ? {
          id: annotation.id,
          type: annotation.type,
          position: annotation.position,
          width: annotation.width,
          height: annotation.height,
          name: annotation.name,
          dataUrlLength: annotation.dataUrl.length,
        }
      : annotation,
    ),
    viewport: canvas.viewport,
    selectedNodeIds: canvas.selectedNodeIds,
    selectedEdgeIds: canvas.selectedEdgeIds,
    selectedBarrierIds: canvas.selectedBarrierIds,
  }
}

function importIssueDialogEntries(files: ImportSourceFile[]): ImportIssueDialogState["entries"] {
  return files.flatMap((file) => {
    const warning = file.parse?.warnings.find((item) => shouldShowImportIssueDialog(item.code))
      ?? desktopImportParseRejectionWarning(file)
    if (!warning || warning.code === "source_import_superseded") return []
    return [{
      fileName: file.name,
      code: warning.code,
      message: warning.message,
    }]
  })
}

function shouldShowImportIssueDialog(code: string): boolean {
  return code === "unsupported_format"
    || code === "source_materialize_failed"
    || code === "full_file_read_failed"
    || code === "import_preview_missing"
    || code === "import_preview_failed"
}

function firstImportParseFailureWarning(file: ImportSourceFile): { code: string; message: string } | undefined {
  const warning = file.parse?.warnings.find((item) => !sourceParsePendingWarningCodes.has(item.code))
    ?? file.parse?.warnings[0]
  if (warning) return warning
  if (!file.parse) {
    return {
      code: "import_preview_missing",
      message: "The desktop parser did not return import data for this file.",
    }
  }
  return {
    code: "import_parse_failed",
    message: "The desktop parser could not parse this file.",
  }
}

function desktopImportParseRejectionWarning(file: ImportSourceFile): { code: string; message: string } | undefined {
  const parse = file.parse
  if (!parse) {
    return {
      code: "import_preview_missing",
      message: "The desktop parser did not return import data for this file.",
    }
  }
  const rejectedWarning = parse.warnings.find((warning) => desktopImportRejectedWarningCodes.has(warning.code))
  if (rejectedWarning) return rejectedWarning
  if (parse.terminationStatus === "error") {
    return {
      code: "calculation_error_termination",
      message: parse.terminationLabel && parse.terminationLabel !== "error"
        ? `Calculation ended with ${parse.terminationLabel}.`
        : "Calculation output ended with error termination.",
    }
  }
  if (parse.terminationStatus === "running") {
    return {
      code: "calculation_incomplete",
      message: "Calculation output is incomplete or still running.",
    }
  }
  if (!parse.parsed) return firstImportParseFailureWarning(file)
  return undefined
}

function sourceFilesWithAutosavedMetadata(files: SourceFile[], savedContent: string): SourceFile[] {
  const savedPackage = parseProjectPackage(savedContent)
  if (!savedPackage) return files
  const savedFiles = new Map(savedPackage.files.map((file) => [file.id, file]))
  let changed = false
  const nextFiles = files.map((file) => {
    const savedFile = savedFiles.get(file.id)
    if (!savedFile) return file
    const parse = preferredAutosavedSourceParse(file.parse, savedFile.parse)
    const status = parse === savedFile.parse && parse !== file.parse
      ? savedFile.status
      : file.status
    const nextFile: SourceFile = {
      ...file,
      size: savedFile.size,
      status,
      preview: savedFile.preview,
      storedPath: savedFile.storedPath,
      checksum: savedFile.checksum,
      sourcePath: savedFile.sourcePath,
      parse,
    }
    if (!sourceFileMetadataMatches(file, nextFile)) changed = true
    return nextFile
  })
  return changed ? nextFiles : files
}

function preferredAutosavedSourceParse(
  currentParse: SourceParseResult | undefined,
  savedParse: SourceParseResult | undefined,
): SourceParseResult | undefined {
  if (!savedParse) return currentParse
  if (!currentParse) return savedParse
  const currentRank = sourceParseResolutionRank(currentParse)
  const savedRank = sourceParseResolutionRank(savedParse)
  return savedRank > currentRank ? savedParse : currentParse
}

function sourceParseResolutionRank(parse: SourceParseResult): number {
  if (sourceParseHasPendingDesktopJob(parse)) return 1
  if (!parse.parsed) return 2
  const hasResolvedObjects = parse.objectCount > 0
    || parse.candidates.length > 0
    || Boolean(parse.coordinatePreview)
  return hasResolvedObjects ? 4 : 3
}

function sourceParseHasPendingDesktopJob(parse: SourceParseResult): boolean {
  return parse.warnings.some((warning) => (
    warning.code === "parse_deferred"
    || warning.code === "parse_queued"
    || warning.code === "parse_running"
  ))
}

function sourceFileMetadataMatches(left: SourceFile, right: SourceFile): boolean {
  return left.size === right.size
    && left.status === right.status
    && left.preview === right.preview
    && left.storedPath === right.storedPath
    && left.checksum === right.checksum
    && left.sourcePath === right.sourcePath
    && sourceParseAutosaveSignatureMatches(left.parse, right.parse)
}

function sourceParseAutosaveSignatureMatches(left: SourceParseResult | undefined, right: SourceParseResult | undefined): boolean {
  if (!left || !right) return left === right
  if (left.parserId !== right.parserId
    || left.parserVersion !== right.parserVersion
    || left.parsed !== right.parsed
    || left.objectCount !== right.objectCount
    || left.parseScope !== right.parseScope
    || left.confidence !== right.confidence
    || left.sourceKind !== right.sourceKind
    || left.terminationStatus !== right.terminationStatus
    || (left.coordinatePreview?.vibrationModes?.[0]?.displacements.length ?? 0) !== (right.coordinatePreview?.vibrationModes?.[0]?.displacements.length ?? 0)
    || left.warnings.length !== right.warnings.length
    || left.candidates.length !== right.candidates.length) {
    return false
  }
  for (let index = 0; index < left.warnings.length; index += 1) {
    const leftWarning = left.warnings[index]
    const rightWarning = right.warnings[index]
    if (leftWarning.code !== rightWarning.code || leftWarning.target !== rightWarning.target) return false
  }
  for (let index = 0; index < left.candidates.length; index += 1) {
    const leftCandidate = left.candidates[index]
    const rightCandidate = right.candidates[index]
    if (leftCandidate.candidateId !== rightCandidate.candidateId
      || leftCandidate.objectIndex !== rightCandidate.objectIndex
      || leftCandidate.label !== rightCandidate.label
      || leftCandidate.formula !== rightCandidate.formula
      || leftCandidate.roleHint !== rightCandidate.roleHint
      || (leftCandidate.coordinatePreview?.atomCount ?? 0) !== (rightCandidate.coordinatePreview?.atomCount ?? 0)
      || (leftCandidate.coordinatePreview?.vibrationModes?.length ?? 0) !== (rightCandidate.coordinatePreview?.vibrationModes?.length ?? 0)
      || (leftCandidate.coordinatePreview?.vibrationModes?.[0]?.displacements.length ?? 0) !== (rightCandidate.coordinatePreview?.vibrationModes?.[0]?.displacements.length ?? 0)) {
      return false
    }
  }
  return true
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

function projectForgetFailureValidation(projectLabel: string): ProjectValidationPayload {
  return {
    valid: false,
    summary: { projectLabel },
    issues: [{
      severity: "error",
      code: "project_forget_failed",
      message: `${projectLabel} was not removed because RxnFlow could not update Recent Projects. Try removing it again.`,
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

function isCanvasImageFile(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  return file.type.startsWith("image/")
    || lowerName.endsWith(".png")
    || lowerName.endsWith(".jpg")
    || lowerName.endsWith(".jpeg")
    || lowerName.endsWith(".webp")
    || lowerName.endsWith(".gif")
}

async function imageAnnotationFromFile(
  file: File,
  center: Point,
): Promise<Extract<CanvasAnnotation, { type: "image" }> | null> {
  if (file.size > maxCanvasImageFileBytes) return null
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
  const edgeSignature = edges.map((edge) => `${edge.id}:${edge.sourceId}:${edge.targetId}:${edge.label}:${edge.stepRole ?? ""}`).join("|")
  const nodeSignature = nodes.map((node) => [
    node.id,
    node.label,
    node.kind,
    node.pathRole ?? "",
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
    JSON.stringify(node.energyTable ?? null),
    JSON.stringify(node.corrections ?? []),
  ].join("~")).join("||")
  return `${options.baselineNodeId ?? ""}#${options.energySource}#${options.outputUnit}#${edgeSignature}#${nodeSignature}`
}

function referencedStoredPathsForProject({
  projectId,
  activeProjectId,
  currentSnapshot,
  workspaces,
}: {
  projectId: string
  activeProjectId: string
  currentSnapshot: ProjectWorkspaceSnapshot
  workspaces: Record<string, ProjectWorkspaceSnapshot>
}): string[] {
  const files = projectId === activeProjectId
    ? currentSnapshot.files
    : workspaces[projectId]?.files ?? []
  return Array.from(new Set(files
    .map((file) => file.storedPath)
    .filter((storedPath): storedPath is string => Boolean(storedPath))))
}

function desktopImportFailureShouldRemovePlaceholder(file: ImportSourceFile): boolean {
  return Boolean(desktopImportParseRejectionWarning(file))
}

function shouldRemoveFailedDesktopImportFile(file: SourceFile, failedImport: ImportSourceFile): boolean {
  if (file.id === failedImport.id) return true
  if (file.storedPath || file.status !== "staged") return false
  if (!sameSourceFileReplacementTarget(file, failedImport)) return false
  const parse = file.parse
  if (!parse) return true
  if (parse.parsed) return false
  return parse.warnings.some((warning) => (
    warning.code === "parse_deferred"
    || warning.code === "unsupported_format"
    || warning.code === "import_preview_failed"
    || warning.code === "import_preview_missing"
    || warning.code === "import_parse_failed"
    || warning.code === "parse_failed"
    || warning.code === "cclib_parse_empty"
    || warning.code === "cclib_parse_failed"
    || warning.code === "source_materialize_failed"
    || warning.code === "source_import_superseded"
    || warning.code === "full_file_read_failed"
  ))
}

function sameSourceFileReplacementTarget(file: SourceFile, importedFile: ImportSourceFile): boolean {
  return sourceFileDisplayGroupKey(file) === sourceFileDisplayGroupKey(importedFile)
    && sourceFileLooksLikeSolutionLog(file) === sourceFileLooksLikeSolutionLog(importedFile)
    && normalizedSourceFileName(file.name) === normalizedSourceFileName(importedFile.name)
}

function normalizedSourceFileName(name: string): string {
  return name.trim().toLowerCase()
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
