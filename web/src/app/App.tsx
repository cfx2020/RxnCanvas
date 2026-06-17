import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react"
import { Atom, Moon, Sun } from "lucide-react"
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
  CanvasSurface,
  MiniMap,
  ZoomControls,
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
import { EnergyTableView, type ExportedReportArtifact } from "./ReportPanels"
import { WorkbenchToolbar } from "./WorkbenchToolbar"
import {
  applyCanvasSelectionState,
  applyProjectTransitionState,
  applyProjectWorkspaceSnapshotState,
  type ProjectTransitionApplication,
} from "./appStateAppliers"
import {
  autosaveProjectPackageToRuntime,
  openProjectPackageFromRuntime,
  restoreStartupProjectFromRuntime,
  saveProjectPackageToRuntime,
  subscribeProjectPackageRuntimeMenus,
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
  nodes: FlowNode[]
  edges: FlowEdge[]
  barriers: FlowBarrier[]
  viewport: CanvasViewport
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

export function App() {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const projectInputRef = useRef<HTMLInputElement | null>(null)
  const pendingImportProjectIdRef = useRef<string | null>(null)
  const autosaveHydratedRef = useRef(false)
  const autosaveKeyRef = useRef<string | null>(null)
  const autosaveInputRef = useRef<ProjectAutosaveInput | null>(null)
  const autosaveInFlightRef = useRef(false)
  const autosaveQueuedRef = useRef(false)
  const projectRestoreStateRef = useRef<ProjectRestoreRuntimeState | null>(null)
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
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("inspector")
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
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0]
  const autosaveInput = useMemo<ProjectAutosaveInput>(() => ({
    project: activeProject,
    files,
    nodes,
    edges,
    barriers,
    viewport,
  }), [activeProject, barriers, edges, files, nodes, viewport])
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const nodeIdSet = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes])
  const energyRows = useMemo(() => energyTableRows(nodes, energyDisplayOptions), [nodes, energyDisplayOptions])
  const relativeZeroNodeId = useMemo(() => relativeEnergyZeroNode(nodes, energyDisplayOptions)?.id ?? null, [nodes, energyDisplayOptions])
  const hasCanvasSelection = selectionHasItems({
    nodeIds: selectedNodeIds,
    edgeIds: selectedEdgeIds,
    barrierIds: selectedBarrierIds,
  })

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
    barriers,
    edges,
    energyDisplayOptions,
    files,
    inspectorMode,
    lastSelectedFileId,
    nodes,
    selectedBarrierIds,
    selectedEdgeIds,
    selectedFileId,
    selectedFileIds,
    selectedNodeIds,
    viewMode,
    viewport,
  ])

  useEffect(() => {
    projectRestoreStateRef.current = {
      projects,
      workspaces: projectWorkspaces,
      activeProjectId,
      activeSnapshot: currentProjectWorkspaceSnapshot(),
    }
  }, [activeProjectId, currentProjectWorkspaceSnapshot, projectWorkspaces, projects])

  const applyProjectWorkspaceSnapshot = useCallback((snapshot: ProjectWorkspaceSnapshot) => {
    applyProjectWorkspaceSnapshotState(appStateSetters, snapshot, clearEditHistory)
  }, [appStateSetters, clearEditHistory])

  const applyProjectTransition = useCallback((transition: ProjectTransitionApplication) => {
    applyProjectTransitionState(appStateSetters, transition, clearEditHistory)
  }, [appStateSetters, clearEditHistory])

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
    const nextNodes = autoLayoutFlowNodes(nodes, energyDisplayOptions)
    setNodes(nextNodes)
    setViewport(fitViewportToNodes(nextNodes, canvasRef.current))
  }, [energyDisplayOptions, nodes, pushEditHistory])

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
    canvas: canvasRef.current,
    setViewport,
  }), [])

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

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      handlePointerMoveAction({
        event,
        connectionDraft,
        barrierDraft,
        dragState,
        screenToWorld,
        appStateSetters,
      })
    },
    [appStateSetters, barrierDraft, connectionDraft, dragState, screenToWorld],
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

  useEffect(() => subscribeConnectionDraftPointer({
    draft: connectionDraft,
    screenToWorld,
    setConnectionDraft,
    finishConnectionDraftAtClientPoint,
  }), [connectionDraft, finishConnectionDraftAtClientPoint, screenToWorld])

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
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
      nodes: emptySnapshot.nodes,
      edges: emptySnapshot.edges,
      barriers: emptySnapshot.barriers,
      viewport: emptySnapshot.viewport,
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
      applyProjectTransition(action.transition)
      return
    }
    if (action.kind === "delete-inactive") {
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

  const restoreProjectPackage = useCallback((
    content: string,
    validation?: ProjectValidationPayload | null,
    options?: { replaceProjects?: boolean },
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
    applyProjectTransition(transition)
  }, [activeProjectId, applyProjectTransition, currentProjectWorkspaceSnapshot, projectWorkspaces, projects])

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
      nodes,
      edges,
      barriers,
      viewport,
      setProjectValidation,
    })
  }, [activeProject, barriers, edges, files, nodes, viewport])

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
    restoreProjectPackage,
  }), [restoreProjectPackage])

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
    const transition = selectSourceFileTransition({
      files,
      currentSelectedFileIds: selectedFileIds,
      lastSelectedFileId,
      fileId,
      options,
    })
    applySourceFileSelectionState(appStateSetters, transition)
  }, [appStateSetters, files, lastSelectedFileId, selectedFileIds])

  const deleteProjectFile = useCallback((fileId: string) => {
    const transition = deleteSourceFileTransition({
      files,
      selectedFileId,
      selectedFileIds,
      lastSelectedFileId,
      deletedFileId: fileId,
    })
    applySourceFileDeletionState(appStateSetters, transition)
  }, [appStateSetters, files, lastSelectedFileId, selectedFileId, selectedFileIds])

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

  return (
    <div className={`app-shell theme-${theme}`}>
      <div className="window-bar" aria-label="Application window chrome">
        <div className="traffic-lights" aria-hidden="true">
          <span className="traffic traffic-red" />
          <span className="traffic traffic-yellow" />
          <span className="traffic traffic-green" />
        </div>
        <div className="window-title">
          <Atom size={16} />
          <span>RxnFlow</span>
        </div>
        <div className="window-actions">
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
          <EngineStatusPill status={engineStatus} />
          <span>{activeProject.label}</span>
        </div>
      </div>

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

      <main className="workspace">
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
        />

        <section className="canvas-stage" aria-label="Reaction flow workspace">
          <WorkbenchToolbar
            tool={tool}
            viewMode={viewMode}
            onSetTool={setTool}
            onSetViewMode={setViewMode}
            onImport={() => openImportPicker(activeProjectId)}
            onSaveProject={saveProjectPackage}
            onOpenExport={() => setInspectorMode("export")}
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
          />
          <ProjectValidationNotice validation={projectValidation} />

          <div className="workbench-view-pane" hidden={viewMode !== "canvas"}>
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
              onUpdateBarrierLabel={updateBarrierLabel}
              onSetNodeCoefficient={updateNodeCoefficient}
              onSetRelativeEnergyZero={setRelativeEnergyZeroFromNode}
              onShowNodeSource={showNodeSourceDetails}
              onRawFileDrop={handleCanvasRawFileDrop}
            />
            <MiniMap
              nodes={nodes}
              selectedNodeIds={selectedNodeIds}
              viewport={viewport}
              canvasRef={canvasRef}
              onViewportChange={setViewport}
            />
            <ZoomControls
              zoom={viewport.zoom}
              onZoomIn={() => setViewport((current) => ({ ...current, zoom: clamp(current.zoom * 1.12, minCanvasZoom, maxCanvasZoom) }))}
              onZoomOut={() => setViewport((current) => ({ ...current, zoom: clamp(current.zoom * 0.88, minCanvasZoom, maxCanvasZoom) }))}
              onReset={fitCanvasViewport}
            />
          </div>

          <div className="workbench-view-pane table-view-pane" hidden={viewMode !== "table"}>
            <EnergyTableView rows={energyRows} outputUnit={energyDisplayOptions.outputUnit} onSelectNode={(nodeId) => {
              const transition = energyTableNodeSelectionTransition(nodeId)
              applyCanvasSelection(transition.selection)
              setInspectorMode(transition.inspectorMode)
              setViewMode(transition.viewMode)
            }} />
          </div>
        </section>

        <InspectorPanel
          mode={inspectorMode}
          node={selectedNode}
          edge={selectedEdge}
          barrier={selectedBarrier}
          nodeMap={nodeMap}
          file={selectedFile}
          rows={energyRows}
          exportOptions={exportOptions}
          exportArtifacts={exportArtifacts}
          exportBusy={exportBusy}
          exportStatus={exportStatus}
          files={files}
          energyDisplayOptions={energyDisplayOptions}
          onModeChange={setInspectorMode}
          onExportOptionsChange={setExportOptions}
          onExport={exportSelectedFormats}
          onReviewCandidates={reviewCandidatesForFile}
          onUpdateEdgeLabel={updateEdgeLabel}
          onUpdateBarrierLabel={updateBarrierLabel}
          onOpenStructure={(nodeId) => setStructurePreviewNodeId(nodeId)}
          onEdit2DStructure={(nodeId) => setStructureEditorNodeId(nodeId)}
          onReset2DStructure={resetNodeManualStructure}
        />
      </main>
      {structurePreviewNode ? (
        <StructurePreviewDialog
          node={structurePreviewNode}
          file={sourceFileForNode(structurePreviewNode, files)}
          onClose={() => setStructurePreviewNodeId(null)}
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
    nodes: input.nodes,
    edges: input.edges,
    barriers: input.barriers,
    viewport: input.viewport,
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

function EngineStatusPill({ status }: { status: DesktopEngineStatus | null }) {
  const ready = status?.ok === true && status.data.status === "ready"
  const browserPreview = status?.ok === false && status.error.code === "browser_preview"
  const label = ready
    ? "Local engine"
    : browserPreview
      ? "Browser preview"
      : status === null
        ? "Checking engine"
        : "Engine offline"

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
