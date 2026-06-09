import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { ChevronDown, Download, Languages, Moon, PanelLeft, Sun } from "lucide-react"
import {
  BrowserProjectRepositoryError,
  checksumBrowserStorageBytes,
  type BrowserProjectRef,
  type BrowserProjectRepository,
  type BrowserProjectRepositoryErrorPayload,
  type BrowserStorageObject,
} from "../repository"
import type { EnergyComputeData, ExportProfileData, FixtureRunData, GraphEdgeSummary, GraphNodeSummary, GraphPathSummary, ImportBatchSummary, ImportPreviewData, ImportRegisterAllData, ImportRegisterSelectionData, JsonObject, ParseCandidateSummary, RegistryApplyCorrectionData, ShellArtifact, ShellClient, ShellError, ShellRuntimeInfo, WorkbenchArtifactSummary, WorkspaceCommandData, WorkspaceSelectionSummary, WorkspaceSummary } from "../shell"
import {
  addCompositionDraftRow,
  compositionDraftFromSelectedNode,
  initialCompositionDraftState,
  reconcileCompositionDraft,
  removeCompositionDraftRow,
  updateCompositionDraftRow,
  type CompositionDraftState,
} from "./compositionDraftState"
import type { EnergyPanelOptions } from "./EnergyProfilePanel"
import {
  clearEdgeLabelDraft,
  edgeLabelDraftFromSelectedEdge,
  initialEdgeLabelDraftState,
  reconcileEdgeLabelDraft,
  updateEdgeLabelDraft,
  type EdgeLabelDraftState,
} from "./edgeLabelDraftState"
import {
  applyArtifactPersistenceResults,
  persistExportArtifacts,
  type ExportArtifactPersistenceResult,
} from "./exportArtifactPersistence"
import { reportExportFormats } from "./exportFormatCapabilities"
import {
  completeGraphEditorConnection,
  clearGraphEditorSelection,
  endGraphEditorCanvasDrag,
  endGraphEditorRubberBand,
  initialGraphEditorInteractionState,
  pruneGraphEditorInteractionState,
  clearGraphEditorPendingEdge,
  resolveGraphEditorDirectEdgeGesture,
  selectGraphEditorEdge,
  selectGraphEditorNode,
  selectGraphEditorNodes,
  selectGraphEditorPath,
  setGraphEditorMode,
  startGraphEditorCanvasDrag,
  startGraphEditorPointerEdge,
  startGraphEditorRubberBand,
  updateGraphEditorCanvasDrag,
  updateGraphEditorPointerEdge,
  updateGraphEditorRubberBand,
  type CanvasPoint,
  type GraphEditorInteractionState,
  type GraphEditorSelection,
  type GraphEditorSelectionMode,
} from "./graphEditorInteractionState"
import {
  clearGraphEditorHistory,
  completeGraphEditorHistoryReplay,
  failGraphEditorHistoryReplay,
  graphEditorHistoryReplayLabel,
  graphEditorHistoryViewportTargetForReplay,
  initialGraphEditorHistoryState,
  peekGraphEditorHistoryEntry,
  pushGraphEditorHistoryEntry,
  snapshotGraphEditorGraph,
  snapshotGraphEditorNodePositions,
  snapshotGraphEditorSelection,
  staleGraphEditorHistoryReference,
  startGraphEditorHistoryReplay,
  type GraphEditorHistoryEntry,
  type GraphEditorHistoryRemoveEntry,
  type GraphEditorHistoryNodeEntry,
  type GraphEditorHistoryState,
  type GraphEditorGraphSnapshot,
} from "./graphEditorHistory"
import type { GraphLayoutPlan } from "./graphAutoLayout"
import { canvasPointToGraphNodePosition, graphNodePosition, moveGraphNodePosition } from "./graphNodeLayout"
import { normalizeGraphViewport, type GraphViewport } from "./graphViewport"
import { resolvePathAutoExtendIntent } from "./graphPathAutoExtend"
import {
  createGraphPathOrderDraft,
  moveGraphPathDraftNode,
  type GraphPathOrderDraft,
  type GraphPathOrderMoveDirection,
} from "./graphPathOrderDraft"
import { GraphCanvas, type AddObjectNodeRequest, type AddRawFileNodeRequest, type CanvasEnergyDisplayOptions, type CanvasEnergyMode, type CanvasEnergyUnit, type GraphAutoLayoutStatus, type MoveGraphNodeRequest, type NudgeGraphNodesRequest, type ParseCandidateChooserState, type PathAuthoringStatus, type RemoveGraphItemsRequest, type UpdateGraphNodeLabelRequest } from "./GraphCanvas"
import {
  importPreviewArgsFromFiles,
  filesToWebImportFiles,
  initialTransientImportState,
  mergeRegisteredObjects,
  type TransientImportState,
  type WebImportFile,
} from "./transientImportState"
import type { ApplyCorrectionRequest } from "./ObjectRegistryPanel"
import { persistImportFilesAsRawInputs, persistRawInputFile, type BrowserRawResource } from "./rawInputPersistence"
import { createProject, deleteProject, openProject, refreshProjects, saveProjectContent } from "./projectSidebarActions"
import { listProjectFileEntries, projectFileEntriesWithWorkbenchProjection, type ProjectFileEntry } from "./projectFiles"
import {
  contentFilesToShellPayload,
  projectManifestPath,
  readProjectContentFiles,
  shellPayloadToContentFiles,
  type BrowserProjectContentFile,
  type ProjectSaveContentData,
} from "./projectContentBridge"
import { initialProjectSidebarState, type ProjectSidebarState } from "./projectSidebarState"
import { ProjectSidebar } from "./ProjectSidebar"
import { ReportExportPanel, type ReportExportOptions } from "./ReportExportPanel"
import { warningTargetDisplay } from "./displayNames"
import {
  initialWorkbenchDomainState,
  projectWorkbenchSnapshot,
  type WorkbenchDomainState,
  type WorkbenchSnapshotData,
} from "./workbenchState"
import { useI18n, type SupportedLocale } from "./i18n"

type WorkbenchTestApi = {
  runFixture: () => Promise<void>
  runInvalidCommand: () => Promise<void>
}

declare global {
  interface Window {
    __rxnflowWorkbenchTest?: WorkbenchTestApi
  }
}

type WorkbenchShellProps = {
  shellClient: ShellClient
  projectRepository: BrowserProjectRepository
  runtimeInfo?: ShellRuntimeInfo
}

type WorkspaceFlowShellState = {
  projectRailDensity: "normal" | "compact"
  projectRailOpen: boolean
  inspectorOpen: boolean
}

const defaultRuntimeInfo: ShellRuntimeInfo = {
  mode: "fixture",
  transportKind: "in-process-test",
}

const defaultWorkspaceFlowShellState: WorkspaceFlowShellState = {
  projectRailDensity: "normal",
  projectRailOpen: true,
  inspectorOpen: false,
}

const narrowWorkbenchMediaQuery = "(max-width: 700px)"

export function WorkbenchShell({
  shellClient,
  projectRepository,
  runtimeInfo = defaultRuntimeInfo,
}: WorkbenchShellProps) {
  const { locale, setLocale, t } = useI18n()
  const [workbenchState, setWorkbenchState] = useState<WorkbenchDomainState>(
    initialWorkbenchDomainState,
  )
  const [projectSidebarState, setProjectSidebarState] = useState<ProjectSidebarState>(
    initialProjectSidebarState,
  )
  const [workspaceFlowShellState, setWorkspaceFlowShellState] = useState<WorkspaceFlowShellState>(
    defaultWorkspaceFlowShellState,
  )
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const [transientImportState, setTransientImportState] = useState<TransientImportState>(
    initialTransientImportState,
  )
  const [activeObjectId, setActiveObjectId] = useState<string | undefined>()
  const [correctionPending, setCorrectionPending] = useState(false)
  const [correctionError, setCorrectionError] = useState<ShellError | null>(null)
  const [graphEditorInteraction, setGraphEditorInteraction] = useState(
    initialGraphEditorInteractionState,
  )
  const [graphEditorHistory, setGraphEditorHistory] = useState<GraphEditorHistoryState>(
    initialGraphEditorHistoryState,
  )
  const [autoLayoutStatus, setAutoLayoutStatus] = useState<GraphAutoLayoutStatus>({ state: "idle" })
  const [pathAuthoringStatus, setPathAuthoringStatus] = useState<PathAuthoringStatus>({ state: "idle" })
  const [pathOrderDraft, setPathOrderDraft] = useState<GraphPathOrderDraft | null>(null)
  const [edgeLabelDraft, setEdgeLabelDraft] = useState<EdgeLabelDraftState>(
    initialEdgeLabelDraftState,
  )
  const [edgeLabelPending, setEdgeLabelPending] = useState(false)
  const [edgeLabelError, setEdgeLabelError] = useState<ShellError | null>(null)
  const [compositionDraft, setCompositionDraft] = useState<CompositionDraftState>(
    initialCompositionDraftState,
  )
  const [compositionPending, setCompositionPending] = useState(false)
  const [compositionError, setCompositionError] = useState<ShellError | null>(null)
  const [parseCandidateChooser, setParseCandidateChooser] = useState<ParseCandidateChooserState | null>(null)
  const [canvasEnergyDisplayOptions, setCanvasEnergyDisplayOptions] = useState<CanvasEnergyDisplayOptions>({
    mode: "electronic",
    unit: "kcal_mol",
  })
  const [energyPanelOptions, setEnergyPanelOptions] = useState<EnergyPanelOptions>({
    pathId: "",
    outputUnit: "kcal_mol",
    energyKey: "electronic",
    energySource: "energies",
    baselineNodeId: "",
    correctionPolicyMode: "none",
    correctionKinds: ["solvation", "resonance", "manual"],
    correctionIds: "",
  })
  const [reportExportOptions, setReportExportOptions] = useState<ReportExportOptions>({
    formats: reportExportFormats(),
    includeBytes: true,
    basename: "rxnflow-profile",
    title: "Relative energy profile",
  })
  const projectSidebarStateRef = useRef<ProjectSidebarState>(initialProjectSidebarState)
  const workbenchStateRef = useRef<WorkbenchDomainState>(initialWorkbenchDomainState)
  const graphEditorHistoryRef = useRef<GraphEditorHistoryState>(initialGraphEditorHistoryState)
  const graphEditorHistoryCounterRef = useRef(0)
  const graphEditorHistoryScopeRef = useRef("")
  const pesComputeSignatureRef = useRef<string | null>(null)
  const pesComputeInFlightRef = useRef<string | null>(null)
  const shellSessionVersionRef = useRef(0)
  const shellElementRef = useRef<HTMLDivElement | null>(null)
  const topbarElementRef = useRef<HTMLElement | null>(null)
  const projectImportInputRef = useRef<HTMLInputElement | null>(null)
  const pendingProjectImportRef = useRef<string | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSaveSignatureRef = useRef("")
  const nodeDragFrameRef = useRef<number | null>(null)
  const nodeDragPointRef = useRef<CanvasPoint | null>(null)
  const canvasDragFrameRef = useRef<number | null>(null)
  const canvasDragPointRef = useRef<CanvasPoint | null>(null)

  useEffect(() => {
    const shellElement = shellElementRef.current
    const topbarElement = topbarElementRef.current
    if (!shellElement || !topbarElement) return undefined

    const syncTopbarHeight = () => {
      shellElement.style.setProperty("--workbench-topbar-height", `${Math.ceil(topbarElement.getBoundingClientRect().height)}px`)
    }
    syncTopbarHeight()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncTopbarHeight)
      return () => window.removeEventListener("resize", syncTopbarHeight)
    }

    const observer = new ResizeObserver(syncTopbarHeight)
    observer.observe(topbarElement)
    window.addEventListener("resize", syncTopbarHeight)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", syncTopbarHeight)
    }
  }, [])

  useEffect(() => () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }
    if (nodeDragFrameRef.current !== null) {
      window.cancelAnimationFrame(nodeDragFrameRef.current)
    }
    if (canvasDragFrameRef.current !== null) {
      window.cancelAnimationFrame(canvasDragFrameRef.current)
    }
  }, [])

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined

    const mediaQuery = window.matchMedia(narrowWorkbenchMediaQuery)
    const closeProjectRailForNarrowViewport = (matches: boolean) => {
      if (!matches) return
      setWorkspaceFlowShellState((current) => (
        current.projectRailOpen ? { ...current, projectRailOpen: false } : current
      ))
    }

    closeProjectRailForNarrowViewport(mediaQuery.matches)

    const handleMediaChange = (event: MediaQueryListEvent) => {
      closeProjectRailForNarrowViewport(event.matches)
    }

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleMediaChange)
      return () => mediaQuery.removeEventListener("change", handleMediaChange)
    }

    mediaQuery.addListener(handleMediaChange)
    return () => mediaQuery.removeListener(handleMediaChange)
  }, [])

  useEffect(() => {
    workbenchStateRef.current = workbenchState
  }, [workbenchState])

  const replaceProjectSidebarState = useCallback((nextState: ProjectSidebarState) => {
    projectSidebarStateRef.current = nextState
    setProjectSidebarState(nextState)
  }, [])

  useEffect(() => {
    const current = projectSidebarStateRef.current
    const projectedFiles = projectFileEntriesWithWorkbenchProjection(current.projectFiles, workbenchState)
    if (projectFileProjectionSignature(projectedFiles) === projectFileProjectionSignature(current.projectFiles)) {
      return
    }
    replaceProjectSidebarState({
      ...current,
      projectFiles: projectedFiles,
    })
  }, [replaceProjectSidebarState, workbenchState])

  const replaceGraphEditorHistory = useCallback((nextState: GraphEditorHistoryState) => {
    graphEditorHistoryRef.current = nextState
    setGraphEditorHistory(nextState)
  }, [])

  const updateGraphEditorHistory = useCallback((updater: (state: GraphEditorHistoryState) => GraphEditorHistoryState) => {
    replaceGraphEditorHistory(updater(graphEditorHistoryRef.current))
  }, [replaceGraphEditorHistory])

  const resetGraphEditorHistory = useCallback(() => {
    updateGraphEditorHistory(clearGraphEditorHistory)
  }, [updateGraphEditorHistory])

  const nextGraphEditorHistoryEntryId = useCallback((kind: string) => {
    graphEditorHistoryCounterRef.current += 1
    return `graph-history-${kind}-${graphEditorHistoryCounterRef.current}`
  }, [])

  const pushGraphEditorHistory = useCallback((entry: GraphEditorHistoryEntry) => {
    updateGraphEditorHistory((current) => pushGraphEditorHistoryEntry(current, entry))
  }, [updateGraphEditorHistory])

  useEffect(() => {
    graphEditorHistoryRef.current = graphEditorHistory
  }, [graphEditorHistory])

  useEffect(() => {
    const workspace = workbenchState.workspace
    const scope = [
      workbenchState.sessionId ?? "",
      workspace?.workspace_id ?? workbenchState.active.workspaceId ?? "",
      workspace?.graph.id ?? workbenchState.active.graphId ?? "",
    ].join(":")
    if (graphEditorHistoryScopeRef.current && graphEditorHistoryScopeRef.current !== scope) {
      resetGraphEditorHistory()
    }
    graphEditorHistoryScopeRef.current = scope
  }, [
    resetGraphEditorHistory,
    workbenchState.active.graphId,
    workbenchState.active.workspaceId,
    workbenchState.sessionId,
    workbenchState.workspace,
  ])

  const refreshProjectSidebar = useCallback(async () => {
    const loadingState: ProjectSidebarState = {
      ...projectSidebarStateRef.current,
      status: "loading",
      error: undefined,
    }
    replaceProjectSidebarState(loadingState)
    const nextState = await refreshProjects(projectRepository, loadingState)
    replaceProjectSidebarState(nextState)
  }, [projectRepository, replaceProjectSidebarState])

  useEffect(() => {
    void refreshProjectSidebar()
  }, [refreshProjectSidebar])

  useEffect(() => {
    setActiveObjectId((current) => {
      const graphObjectIds = graphChemicalObjectIds(workbenchState.workspace)
      const objectById = new Map(workbenchState.objects.map((object) => [object.id, object]))
      const currentExists = current && workbenchState.objects.some((object) => object.id === current)
      const currentObject = current ? objectById.get(current) : undefined
      const graphObjectWithGeometry = graphObjectIds.find((objectId) => hasRenderableGeometry(objectById.get(objectId)?.geometry))
      if (
        currentExists
        && (graphObjectIds.length === 0 || graphObjectIds.includes(current))
        && (hasRenderableGeometry(currentObject?.geometry) || !graphObjectWithGeometry)
      ) {
        return current
      }
      return graphObjectWithGeometry
        ?? graphObjectIds.find((objectId) => objectById.has(objectId))
        ?? workbenchState.objects.find((object) => hasRenderableGeometry(object.geometry))?.id
        ?? workbenchState.objects[0]?.id
    })
  }, [workbenchState.objects, workbenchState.workspace])

  useEffect(() => {
    const graph = workbenchState.workspace?.graph
    setGraphEditorInteraction((current) => pruneGraphEditorInteractionState(
      current,
      {
        nodeIds: graph?.nodes.map((node) => node.id) ?? [],
        edgeIds: graph?.edges.map((edge) => edge.id) ?? [],
        pathIds: graph?.paths.map((path) => path.id) ?? [],
      },
    ))
    setPathOrderDraft((current) => {
      if (!current) return current
      const path = graph?.paths.find((item) => item.id === current.pathId)
      return path ? current : null
    })
  }, [workbenchState.workspace])

  useEffect(() => {
    setEdgeLabelDraft((current) => reconcileEdgeLabelDraft(current, workbenchState.workspace))
    setEdgeLabelError((current) => {
      if (!current) return current
      return isSingleEdgeSelection(workbenchState.workspace?.selection) ? current : null
    })
    setCompositionDraft((current) => reconcileCompositionDraft(current, workbenchState.workspace))
    setCompositionError((current) => {
      if (!current) return current
      return isSingleNodeSelection(workbenchState.workspace?.selection) ? current : null
    })
  }, [workbenchState.workspace])

  useEffect(() => {
    const workspace = workbenchState.workspace
    if (!workspace) return
    const selection = workspace.selection ?? {
      node_ids: [],
      edge_ids: [],
      path_ids: [],
    }
    setGraphEditorInteraction((current) => ({
      ...current,
      selection: {
        nodeIds: selection.node_ids,
        edgeIds: selection.edge_ids,
        pathIds: selection.path_ids,
      },
    }))
    if (isSinglePathSelection(selection)) {
      const path = workspace.graph.paths.find((item) => item.id === selection.path_ids[0])
      setPathOrderDraft(path ? createGraphPathOrderDraft(path.id, path.node_ids) : null)
    } else {
      setPathOrderDraft(null)
    }
  }, [workbenchState.workspace])

  useEffect(() => {
    setEnergyPanelOptions((current) => {
      const paths = workbenchState.workspace?.graph.paths ?? []
      const activePathId = workbenchState.workspace?.active_path_id ?? paths[0]?.id ?? ""
      const pathStillExists = current.pathId && paths.some((path) => path.id === current.pathId)
      const nextPathId = activePathId || (pathStillExists ? current.pathId : "")
      const nextPath = paths.find((path) => path.id === nextPathId)
      const baselineStillExists = current.baselineNodeId
        && nextPath?.node_ids.includes(current.baselineNodeId)
      return {
        ...current,
        pathId: nextPathId,
        baselineNodeId: baselineStillExists ? current.baselineNodeId : "",
      }
    })
  }, [workbenchState.workspace])

  const hydrateRestoredProjectGeometry = useCallback(async (
    restoredState: WorkbenchDomainState,
    activeProject: BrowserProjectRef,
    projectFiles: ProjectFileEntry[],
  ): Promise<WorkbenchDomainState> => {
    const sessionId = restoredState.sessionId
    if (!sessionId || !restoredProjectNeedsGeometryHydration(restoredState)) {
      return restoredState
    }

    let hydrationProjectFiles = projectFiles
    if (hydrationProjectFiles.length === 0) {
      try {
        hydrationProjectFiles = await listProjectFileEntries(projectRepository, activeProject)
      } catch {
        hydrationProjectFiles = projectFiles
      }
    }

    const rawFiles = restoredGeometryHydrationFiles(restoredState, hydrationProjectFiles)
    if (rawFiles.length === 0) {
      return restoredState
    }

    let hydrated = false
    for (const [fileIndex, file] of rawFiles.entries()) {
      let storedFile: BrowserStorageObject
      try {
        storedFile = await projectRepository.readObject(activeProject.projectRef, file.path)
      } catch {
        continue
      }

      const previewResponse = await shellClient.run<ImportPreviewData>({
        command: "import.preview",
        args: {
          session_id: sessionId,
          sources: [{
            kind: "inline_bytes",
            filename: file.name,
            bytes_base64: bytesToBase64(storedFile.bytes),
            mime_type: typeof storedFile.metadata?.mime_type === "string"
              ? storedFile.metadata.mime_type
              : "text/plain",
          }],
        },
      })
      if (!previewResponse.ok || !previewResponse.data) {
        continue
      }

      const registerResponse = await shellClient.run<ImportRegisterAllData>({
        command: "import.register_all",
        args: {
          session_id: sessionId,
          batch_id: previewResponse.data.batch.id,
        },
      })
      if (!registerResponse.ok || !registerResponse.data) {
        continue
      }
      const hydratedObjects = registerResponse.data.objects.filter((object) => hasRenderableGeometry(object.geometry))
      const namedHydratedObjects = hydratedObjects.filter((object) => (
        hydrationNamesMatch(object.label, file.name)
        || hydrationNamesMatch(object.source_file_id, file.name)
        || hydrationNamesMatch(object.label, file.sourceName)
        || hydrationNamesMatch(object.source_file_id, file.sourceName)
      ))
      const hydratedObject = namedHydratedObjects.find((object) => !objectNeedsRawHydration(object))
        ?? hydratedObjects.find((object) => !objectNeedsRawHydration(object))
        ?? namedHydratedObjects[0]
        ?? hydratedObjects[0]
      if (!hydratedObject) {
        continue
      }
      const targetNodeIds = uniqueStrings([
        ...restoredGeometryHydrationNodeIds(restoredState, file.name),
        ...restoredGeometryHydrationNodeIds(restoredState, file.sourceName),
      ])
      const fallbackNodeIds = targetNodeIds.length > 0
        ? targetNodeIds
        : restoredGeometryHydrationFallbackNodeIds(restoredState, hydratedObject, {
            allowSingleRawFallback: rawFiles.length === 1,
            fileIndex,
            rawFileCount: rawFiles.length,
          })
      for (const nodeId of fallbackNodeIds) {
        const compositionResponse = await shellClient.run<WorkspaceCommandData>({
          command: "workspace.set_node_composition",
          args: {
            session_id: sessionId,
            node_id: nodeId,
            composition: [{
              object_id: hydratedObject.id,
              coefficient: 1,
            }],
          },
        })
        hydrated = hydrated || Boolean(compositionResponse.ok)
      }
    }

    if (!hydrated) {
      return restoredState
    }

    const snapshot = await shellClient.run<WorkbenchSnapshotData>({
      command: "workbench.snapshot",
      args: { session_id: sessionId },
    })
    return projectWorkbenchSnapshot(snapshot)
  }, [projectRepository, shellClient])

  const ensureRestoredProjectActivePath = useCallback(async (
    restoredState: WorkbenchDomainState,
    sessionId: string,
  ): Promise<WorkbenchDomainState> => {
    const inferredNodeIds = inferLinearPathNodeIds(restoredState.workspace)
    if (!inferredNodeIds) return restoredState

    const pathResponse = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.set_path",
      args: {
        session_id: sessionId,
        path_id: "path-web-main",
        node_ids: inferredNodeIds,
        label: "path-web-main",
      },
    })
    if (!pathResponse.ok || !pathResponse.data) {
      return restoredState
    }

    const snapshot = await shellClient.run<WorkbenchSnapshotData>({
      command: "workbench.snapshot",
      args: { session_id: sessionId },
    })
    return projectWorkbenchSnapshot(snapshot)
  }, [shellClient])

  const restoreSidebarProjectSession = useCallback(async (
    baseState: ProjectSidebarState,
  ) => {
    const restoreVersion = shellSessionVersionRef.current + 1
    shellSessionVersionRef.current = restoreVersion
    const activeProject = baseState.activeProject
    if (!activeProject) {
      replaceProjectSidebarState(baseState)
      return
    }
    const loadingState: ProjectSidebarState = {
      ...baseState,
      status: "loading",
      bridge: { state: "opening" },
      error: undefined,
    }
    replaceProjectSidebarState(loadingState)
    let contentFiles
    try {
      const files = await readProjectContentFiles(projectRepository, activeProject.projectRef)
      contentFiles = await contentFilesToShellPayload(files)
    } catch (error) {
      if (!(error instanceof BrowserProjectRepositoryError)) {
        throw error
      }
      replaceProjectSidebarState({
        ...loadingState,
        status: "error",
        bridge: { state: "error" },
        persistence: "error",
        validation: {
          state: "error",
          messageKey: "projectSidebar.errorMessage",
          messageParams: { message: error.message },
          checkedAt: new Date().toISOString(),
        },
        error: error.toJSON(),
      })
      return
    }
    const response = await shellClient.run({
      command: "project.open",
      args: {
        content_files: contentFiles,
        load_content: true,
      },
    })
    if (!response.ok || !response.data) {
      const nextState: ProjectSidebarState = {
        ...loadingState,
        status: "error",
        bridge: { state: "error" },
        persistence: "error",
        validation: {
          state: "error",
          messageKey: "projectSidebar.errorMessage",
          messageParams: { message: response.error?.message ?? "Project bridge open failed." },
          checkedAt: new Date().toISOString(),
        },
        error: response.error ? {
          code: "storage_failed",
          message: response.error.message,
          target: response.error.target ?? null,
          details: response.error.details ?? null,
        } : undefined,
      }
      replaceProjectSidebarState(nextState)
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: response.warnings,
        error: response.error ?? shellError("invalid_input", "Project bridge open failed.", "project.open"),
      }))
      return
    }
    const snapshot = await shellClient.run<WorkbenchSnapshotData>({
      command: "workbench.snapshot",
      args: { session_id: response.data.session_id },
    })
    if (shellSessionVersionRef.current !== restoreVersion) {
      return
    }
    let restoredState = projectWorkbenchSnapshot(snapshot)
    restoredState = await hydrateRestoredProjectGeometry(
      restoredState,
      activeProject,
      baseState.projectFiles,
    )
    restoredState = await ensureRestoredProjectActivePath(restoredState, String(response.data.session_id))
    if (shellSessionVersionRef.current !== restoreVersion) {
      return
    }
    resetGraphEditorHistory()
    setWorkbenchState(restoredState)
    const sessionId = String(response.data.session_id)
    const nextState: ProjectSidebarState = {
      ...loadingState,
      status: "ready",
      bridge: {
        state: "open",
        sessionId,
      },
      persistence: "persisted",
      error: undefined,
    }
    replaceProjectSidebarState(nextState)
  }, [ensureRestoredProjectActivePath, hydrateRestoredProjectGeometry, projectRepository, replaceProjectSidebarState, resetGraphEditorHistory, shellClient])

  const createSidebarProject = useCallback(
    async (name: string) => {
      const requestVersion = shellSessionVersionRef.current
      const loadingState: ProjectSidebarState = {
        ...projectSidebarStateRef.current,
        status: "loading",
        error: undefined,
      }
      replaceProjectSidebarState(loadingState)
      const nextState = await createProject(projectRepository, loadingState, name)
      if (
        nextState.status === "ready"
        && nextState.activeProject
        && nextState.validation.state === "valid"
        && shellSessionVersionRef.current === requestVersion
      ) {
        await restoreSidebarProjectSession(nextState)
        return nextState
      }
      replaceProjectSidebarState(nextState)
      return nextState
    },
    [projectRepository, replaceProjectSidebarState, restoreSidebarProjectSession],
  )

  const openSidebarProject = useCallback(
    async (projectRef: string) => {
      const requestVersion = shellSessionVersionRef.current
      const loadingState: ProjectSidebarState = {
        ...projectSidebarStateRef.current,
        status: "loading",
        error: undefined,
      }
      replaceProjectSidebarState(loadingState)
      let nextState = await openProject(projectRepository, loadingState, projectRef)
      if (
        nextState.status === "ready"
        && nextState.activeProject
        && nextState.validation.state === "missing"
        && shellSessionVersionRef.current === requestVersion
      ) {
        nextState = await saveProjectContent(projectRepository, nextState)
      }
      if (
        nextState.status === "ready"
        && nextState.activeProject
        && nextState.validation.state === "valid"
        && shellSessionVersionRef.current === requestVersion
      ) {
        await restoreSidebarProjectSession(nextState)
        return
      }
      replaceProjectSidebarState(nextState)
    },
    [projectRepository, replaceProjectSidebarState, restoreSidebarProjectSession],
  )

  const deleteSidebarProject = useCallback(
    async (projectRef: string) => {
      const deletingActiveProject = projectSidebarStateRef.current.activeProjectRef === projectRef
      const loadingState: ProjectSidebarState = {
        ...projectSidebarStateRef.current,
        status: "loading",
        error: undefined,
      }
      replaceProjectSidebarState(loadingState)
      const nextState = await deleteProject(projectRepository, loadingState, projectRef)
      replaceProjectSidebarState(nextState)
      if (!deletingActiveProject || nextState.status !== "ready") {
        return
      }
      shellSessionVersionRef.current += 1
      autoSaveSignatureRef.current = ""
      resetGraphEditorHistory()
      setParseCandidateChooser(null)
      setTransientImportState(initialTransientImportState)
      setActiveObjectId(undefined)
      setWorkbenchState(initialWorkbenchDomainState)
    },
    [projectRepository, replaceProjectSidebarState, resetGraphEditorHistory],
  )

  const deleteSidebarProjectFile = useCallback(
    async (file: ProjectFileEntry) => {
      const current = projectSidebarStateRef.current
      if (!current.activeProject || current.activeProject.projectRef !== file.projectRef) return
      const optimisticState: ProjectSidebarState = {
        ...current,
        error: undefined,
        projectFiles: current.projectFiles.filter((item) => item.path !== file.path),
      }
      replaceProjectSidebarState(optimisticState)
      try {
        await projectRepository.deleteObject(file.projectRef, file.path)
        replaceProjectSidebarState(await refreshProjects(projectRepository, projectSidebarStateRef.current))
      } catch (error) {
        replaceProjectSidebarState({
          ...projectSidebarStateRef.current,
          error: {
            code: "storage_failed",
            message: error instanceof Error ? error.message : "Project file delete failed.",
            target: file.path,
          },
        })
      }
    },
    [projectRepository, replaceProjectSidebarState],
  )

  const saveSidebarBridgeSession = useCallback(async (): Promise<boolean> => {
    const activeProject = projectSidebarStateRef.current.activeProject
    const sessionId = workbenchStateRef.current.sessionId
    if (!activeProject || !sessionId) return false
    const loadingState: ProjectSidebarState = {
      ...projectSidebarStateRef.current,
      status: "loading",
      persistence: "saving",
      bridge: { ...projectSidebarStateRef.current.bridge, state: "saving" },
      error: undefined,
    }
    replaceProjectSidebarState(loadingState)
    const response = await shellClient.run<ProjectSaveContentData>({
      command: "project.save_content",
      args: {
        session_id: sessionId,
        include_content_files: true,
      },
    })
    if (!response.ok || !response.data || !Array.isArray(response.data.content_files)) {
      const nextState: ProjectSidebarState = {
        ...loadingState,
        status: "error",
        bridge: { ...loadingState.bridge, state: "error" },
        persistence: "error",
        validation: {
          state: "error",
          messageKey: "projectSidebar.errorMessage",
          messageParams: { message: response.error?.message ?? "Project bridge save failed." },
          checkedAt: new Date().toISOString(),
        },
      }
      replaceProjectSidebarState(nextState)
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: response.warnings,
        error: response.error ?? shellError("invalid_input", "Project bridge save failed.", "project.save_content"),
      }))
      return false
    }
    const files = await preserveBrowserProjectManifest(
      projectRepository,
      activeProject.projectRef,
      shellPayloadToContentFiles(response.data.content_files) as BrowserProjectContentFile[],
    )
    const savedState = await saveProjectContent(projectRepository, loadingState, files)
    if (savedState.status !== "ready" || savedState.persistence !== "persisted") {
      replaceProjectSidebarState({
        ...savedState,
        bridge: { state: "error", sessionId },
      })
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: response.warnings,
        error: shellError("storage_failed", "Project content save failed.", "project.save_content"),
      }))
      return false
    }
    replaceProjectSidebarState({
      ...savedState,
      bridge: { state: "open", sessionId },
    })
    setWorkbenchState((current) => ({ ...current, status: "success", warnings: response.warnings, error: undefined }))
    return true
  }, [projectRepository, replaceProjectSidebarState, shellClient])

  const saveSidebarProject = useCallback(async () => {
    const autoSaveSignature = projectAutoSaveSignature(
      workbenchStateRef.current,
      projectSidebarStateRef.current,
    )
    let persisted = false
    if (workbenchStateRef.current.sessionId) {
      persisted = await saveSidebarBridgeSession()
    } else {
      const loadingState: ProjectSidebarState = {
        ...projectSidebarStateRef.current,
        status: "loading",
        persistence: "saving",
        error: undefined,
      }
      replaceProjectSidebarState(loadingState)
      const nextState = await saveProjectContent(projectRepository, loadingState)
      replaceProjectSidebarState(nextState)
      persisted = nextState.status === "ready" && nextState.persistence === "persisted"
    }
    if (persisted && autoSaveSignature) {
      autoSaveSignatureRef.current = autoSaveSignature
    }
  }, [projectRepository, replaceProjectSidebarState, saveSidebarBridgeSession])

  useEffect(() => {
    const signature = projectAutoSaveSignature(workbenchState, projectSidebarState)
    if (
      !signature
      || signature === autoSaveSignatureRef.current
      || projectSidebarState.status === "loading"
      || projectSidebarState.bridge.state === "opening"
      || projectSidebarState.bridge.state === "saving"
    ) {
      return undefined
    }

    const timer = setTimeout(() => {
      if (autoSaveTimerRef.current === timer) {
        autoSaveTimerRef.current = null
      }
      void saveSidebarProject()
    }, 300)
    autoSaveTimerRef.current = timer
    return () => {
      if (autoSaveTimerRef.current === timer) {
        clearTimeout(timer)
        autoSaveTimerRef.current = null
      }
    }
  }, [projectSidebarState, saveSidebarProject, workbenchState])

  const runFixture = useCallback(async () => {
    shellSessionVersionRef.current += 1
    setParseCandidateChooser(null)
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })
    if (!fixtureResponse.ok || !fixtureResponse.data) {
      setWorkbenchState({
        ...initialWorkbenchDomainState,
        status: "error",
        warnings: fixtureResponse.warnings,
        error: fixtureResponse.error ?? {
          code: "invalid_input",
          message: "Shell command did not return fixture data.",
          target: "fixture.run",
        },
      })
      return
    }

    let snapshotResponse = await shellClient.run<WorkbenchSnapshotData>({
      command: "workbench.snapshot",
      args: {
        session_id: fixtureResponse.data.session_id,
      },
    })
    if (snapshotResponse.ok && snapshotResponse.data && !snapshotResponse.data.workspace) {
      const workspaceResponse = await shellClient.run<WorkspaceCommandData>({
        command: "workspace.open",
        args: {
          session_id: fixtureResponse.data.session_id,
        },
      })
      if (!workspaceResponse.ok || !workspaceResponse.data) {
        setWorkbenchState({
          ...initialWorkbenchDomainState,
          status: "error",
          warnings: workspaceResponse.warnings,
          error: workspaceResponse.error ?? {
            code: "invalid_input",
            message: "Fixture workspace could not be opened.",
            target: "workspace.open",
          },
        })
        return
      }
      snapshotResponse = await shellClient.run<WorkbenchSnapshotData>({
        command: "workbench.snapshot",
        args: {
          session_id: fixtureResponse.data.session_id,
        },
      })
    }
    resetGraphEditorHistory()
    setWorkbenchState(projectWorkbenchSnapshot(snapshotResponse))
  }, [resetGraphEditorHistory, shellClient])

  const runInvalidCommand = useCallback(async () => {
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run({
      command: "missing.command",
      args: {},
    })
    setWorkbenchState({
      ...initialWorkbenchDomainState,
      status: "error",
      warnings: response.warnings,
      error: response.error ?? undefined,
    })
  }, [shellClient])

  useEffect(() => {
    if (!import.meta.env.DEV && import.meta.env.MODE !== "test") {
      return undefined
    }
    const testApi: WorkbenchTestApi = {
      runFixture,
      runInvalidCommand,
    }
    window.__rxnflowWorkbenchTest = testApi
    return () => {
      if (window.__rxnflowWorkbenchTest === testApi) {
        delete window.__rxnflowWorkbenchTest
      }
    }
  }, [runFixture, runInvalidCommand])

  const persistFilesIntoProject = useCallback(async (projectRef: string, files: File[]) => {
    const selectedFiles = filesToWebImportFiles(files)
    if (selectedFiles.length === 0) return

    setTransientImportState((current) => ({
      ...current,
      status: "selecting",
      selectedFiles,
      activeBatch: undefined,
      registeredObjectIds: [],
      warnings: [],
      error: undefined,
    }))

    if (projectSidebarStateRef.current.activeProjectRef !== projectRef) {
      await openSidebarProject(projectRef)
    }

    const activeProject = projectSidebarStateRef.current.activeProject
    if (!activeProject || activeProject.projectRef !== projectRef) {
      const error = shellError("active_project_required", "Active browser project is required before importing files.", "active_project")
      setTransientImportState((current) => ({
        ...current,
        status: "error",
        selectedFiles,
        warnings: [],
        error,
      }))
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: [],
        error,
      }))
      return
    }

    const persistedFiles = await persistImportFilesAsRawInputs(projectRepository, activeProject, selectedFiles)
    replaceProjectSidebarState(await refreshProjects(projectRepository, projectSidebarStateRef.current))
    const failedFile = persistedFiles.find((file) => file.rawPersistence?.state === "error")
    const importError = failedFile?.rawPersistence?.state === "error" ? failedFile.rawPersistence.error : undefined
    if (importError) {
      setTransientImportState((current) => ({
        ...current,
        status: "error",
        selectedFiles: persistedFiles,
        warnings: [],
        error: importError,
      }))
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: [],
        error: importError,
      }))
      return
    }

    setTransientImportState((current) => ({
      ...current,
      status: "registered",
      selectedFiles: persistedFiles,
      activeBatch: undefined,
      registeredObjectIds: [],
      warnings: [],
      error: undefined,
    }))
    setWorkbenchState((current) => ({
      ...current,
      status: "success",
      error: undefined,
    }))
  }, [openSidebarProject, projectRepository, replaceProjectSidebarState])

  const openProjectImport = useCallback(async (projectRef: string, files?: File[]) => {
    if (files && files.length > 0) {
      await persistFilesIntoProject(projectRef, files)
      return
    }

    if (projectSidebarStateRef.current.activeProjectRef !== projectRef) {
      await openSidebarProject(projectRef)
    }
    pendingProjectImportRef.current = projectRef
    projectImportInputRef.current?.click()
  }, [openSidebarProject, persistFilesIntoProject])

  const handleProjectImportInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const projectRef = pendingProjectImportRef.current ?? projectSidebarStateRef.current.activeProjectRef
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ""
    if (!projectRef || files.length === 0) return
    void persistFilesIntoProject(projectRef, files)
  }, [persistFilesIntoProject])

  const applyWorkspaceResponse = useCallback((response: Awaited<ReturnType<ShellClient["run"]>>) => {
    if (!response.ok || !response.data) {
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: response.warnings,
        error: response.error ?? shellError("invalid_input", "Workspace command did not return data.", "workspace"),
      }))
      return
    }

    const data = response.data as WorkspaceCommandData
    setEnergyPanelOptions((current) => energyOptionsForWorkspace(current, data.workspace))
    setWorkbenchState((current) => ({
      ...current,
      status: "success",
      active: {
        ...current.active,
        workspaceId: data.workspace.workspace_id,
        graphId: data.workspace.graph.id,
      },
      counts: {
        ...current.counts,
        graphs: 1,
        workspaces: 1,
      },
      workspace: data.workspace,
      warnings: response.warnings,
      error: undefined,
    }))
  }, [])

  const openWorkspace = useCallback(async () => {
    const sessionId = workbenchState.sessionId
    if (!sessionId) return
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.open",
      args: { session_id: sessionId },
    })
    applyWorkspaceResponse(response)
  }, [applyWorkspaceResponse, shellClient, workbenchState.sessionId])

  const ensureWorkspaceReady = useCallback(async (sessionId: string) => {
    if (workbenchStateRef.current.workspace) return true
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.open",
      args: { session_id: sessionId },
    })
    applyWorkspaceResponse(response)
    if (response.ok && response.data) {
      resetGraphEditorHistory()
      return true
    }
    return false
  }, [applyWorkspaceResponse, resetGraphEditorHistory, shellClient])

  const addObjectNode = useCallback(async (request: AddObjectNodeRequest = {}) => {
    const sessionId = workbenchState.sessionId
    const activeObject = workbenchState.objects.find((object) => object.id === (request.objectId ?? activeObjectId))
      ?? workbenchState.objects[0]
    if (!sessionId || !activeObject) return
    const nodeCount = workbenchState.workspace?.graph.nodes.length ?? 0
    if (!(await ensureWorkspaceReady(sessionId))) return
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.add_node",
      args: {
        session_id: sessionId,
        kind: "species",
        label: activeObject.label ?? activeObject.id,
        chemical_object_ids: [activeObject.id],
        position: request.position ?? [120 + nodeCount * 180, nodeCount % 2 === 0 ? 290 : 160],
      },
    })
    applyWorkspaceResponse(response)
    if (response.ok && response.data) {
      resetGraphEditorHistory()
    }
  }, [activeObjectId, applyWorkspaceResponse, ensureWorkspaceReady, resetGraphEditorHistory, shellClient, workbenchState.objects, workbenchState.sessionId, workbenchState.workspace])

  const applyDropImportError = useCallback((
    error: ShellError,
    selectedFiles: WebImportFile[] = [],
    warnings: WorkbenchDomainState["warnings"] = [],
    activeBatch?: ImportBatchSummary,
  ) => {
    setTransientImportState((current) => ({
      ...current,
      status: "error",
      selectedFiles: selectedFiles.length > 0 ? selectedFiles : current.selectedFiles,
      activeBatch: activeBatch ?? current.activeBatch,
      warnings,
      error,
    }))
    setWorkbenchState((current) => {
      const imports = activeBatch ? upsertImportBatch(current.imports, activeBatch) : current.imports
      return {
        ...current,
        status: "error",
        imports,
        counts: { ...current.counts, imports: imports.length },
        warnings,
        error,
      }
    })
  }, [])

  const updateProjectFileEntry = useCallback((
    path: string,
    patch: Partial<Pick<ProjectFileEntry, "status" | "registeredObjectIds" | "graphNodeIds" | "warnings">>,
  ) => {
    const current = projectSidebarStateRef.current
    const nextState: ProjectSidebarState = {
      ...current,
      projectFiles: current.projectFiles.map((file) => (
        file.path === path
          ? {
              ...file,
              ...patch,
              registeredObjectIds: patch.registeredObjectIds ?? file.registeredObjectIds,
              graphNodeIds: patch.graphNodeIds ?? file.graphNodeIds,
              warnings: patch.warnings ?? file.warnings,
            }
          : file
      )),
    }
    replaceProjectSidebarState(nextState)
  }, [replaceProjectSidebarState])

  const addReusableProjectFileObjectNode = useCallback(async (
    file: ProjectFileEntry,
    position: [number, number],
  ): Promise<boolean> => {
    const reusableObjects = reusableProjectFileObjects(file, workbenchStateRef.current)
    if (reusableObjects.length === 0) return false
    const primaryObject = reusableObjects[0]
    const reusableObjectIds = reusableObjects.map((object) => object.id)
    const sessionId = workbenchStateRef.current.sessionId
    if (!sessionId || !primaryObject) return false
    if (!(await ensureWorkspaceReady(sessionId))) return true
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const addNodeResponse = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.add_node",
      args: {
        session_id: sessionId,
        kind: "species",
        label: primaryObject.label ?? primaryObject.id,
        chemical_object_ids: [primaryObject.id],
        position,
      },
    })
    applyWorkspaceResponse(addNodeResponse)
    if (!addNodeResponse.ok || !addNodeResponse.data) {
      updateProjectFileEntry(file.path, {
        status: "error",
        registeredObjectIds: reusableObjectIds,
        warnings: projectFileWarningMessagesFromError(
          addNodeResponse.error ?? shellError("invalid_input", "Workspace add node did not return workspace data.", "workspace.add_node"),
        ),
      })
      return true
    }
    const latestWorkspace = addNodeResponse.data.workspace
    updateProjectFileEntry(file.path, {
      status: "used-in-graph",
      registeredObjectIds: reusableObjectIds,
      graphNodeIds: reusableObjectIds.flatMap((objectId) => graphNodeIdsForObject(latestWorkspace, objectId)),
      warnings: [],
    })
    resetGraphEditorHistory()
    return true
  }, [applyWorkspaceResponse, ensureWorkspaceReady, resetGraphEditorHistory, shellClient, updateProjectFileEntry])

  const addRawFileNode = useCallback(async (request: AddRawFileNodeRequest) => {
    const sessionId = workbenchState.sessionId
    const activeProject = projectSidebarStateRef.current.activeProject
    setParseCandidateChooser(null)
    if (!sessionId) {
      applyDropImportError(shellError("invalid_input", "Shell session is required before dropping raw files.", "session_id"))
      return
    }
    if (!activeProject) {
      applyDropImportError(shellError("active_project_required", "Active browser project is required before dropping raw files.", "active_project"))
      return
    }
    if (request.source.kind === "project-file") {
      const source = request.source
      const projectFile = projectSidebarStateRef.current.projectFiles.find((file) => (
        file.id === source.projectFileId || file.path === source.path
      ))
      if (projectFile && await addReusableProjectFileObjectNode(projectFile, request.position)) return
    }

    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const importFileResult = await rawDropImportFile(projectRepository, activeProject.projectRef, request.source)
    if (!importFileResult.ok) {
      if (request.source.kind === "project-file") {
        updateProjectFileEntry(request.source.path, {
          status: "error",
          warnings: projectFileWarningMessagesFromError(importFileResult.error),
        })
      }
      applyDropImportError(importFileResult.error, [importFileResult.file])
      return
    }
    const rawFilePath = importFileResult.file.storagePath ?? importFileResult.file.name

    const previewState: TransientImportState = {
      ...initialTransientImportState,
      status: "previewing",
      selectedFiles: [importFileResult.file],
      expectedFormat: "auto",
      strict: false,
    }
    setTransientImportState(previewState)
    replaceProjectSidebarState(await refreshProjects(projectRepository, projectSidebarStateRef.current))

    const payload = await importPreviewArgsFromFiles(previewState, sessionId, { preferInlineBytes: true })
    if (!payload.ok) {
      updateProjectFileEntry(rawFilePath, {
        status: "error",
        warnings: projectFileWarningMessagesFromError(payload.error),
      })
      applyDropImportError(payload.error, payload.files)
      return
    }

    const previewResponse = await shellClient.run<ImportPreviewData>({
      command: "import.preview",
      args: payload.args,
    })
    if (!previewResponse.ok || !previewResponse.data) {
      const error = previewResponse.error ?? shellError("invalid_input", "Import preview did not return a batch.", "import.preview")
      updateProjectFileEntry(rawFilePath, {
        status: "error",
        warnings: projectFileWarningMessagesFromError(error),
      })
      applyDropImportError(
        error,
        payload.files,
        previewResponse.warnings,
      )
      return
    }

    const previewBatch = previewResponse.data.batch
    updateProjectFileEntry(rawFilePath, {
      status: "previewed",
      warnings: projectFileWarningMessagesFromWarnings(previewResponse.warnings),
    })
    setTransientImportState((current) => ({
      ...current,
      status: "ready",
      selectedFiles: payload.files,
      activeBatch: previewBatch,
      registeredObjectIds: [],
      warnings: previewResponse.warnings,
      error: undefined,
    }))
    setWorkbenchState((current) => {
      const imports = upsertImportBatch(current.imports, previewBatch)
      return {
        ...current,
        status: "success",
        imports,
        counts: { ...current.counts, imports: imports.length },
        warnings: previewResponse.warnings,
        error: undefined,
      }
    })

    const objectCount = importPreviewObjectCount(previewBatch)
    const chooserItem = importPreviewCandidateChooserItem(previewBatch)
    if (objectCount > 1 && chooserItem) {
      setParseCandidateChooser({
        projectFileId: importFileResult.file.id,
        rawFilePath,
        batchId: previewBatch.id,
        itemId: chooserItem.itemId,
        candidates: chooserItem.candidates,
        selectedCandidateIds: [chooserItem.candidates[0]?.candidate_id].filter((value): value is string => Boolean(value)),
        position: request.position,
        status: "choosing",
        error: null,
      })
      return
    }
    if (objectCount !== 1) {
      const error = shellError(
        "candidate_selection_required",
        `Raw file preview produced ${objectCount} objects but no selectable candidate list.`,
        importFileResult.file.storagePath ?? importFileResult.file.name,
      )
      updateProjectFileEntry(rawFilePath, {
        status: "error",
        warnings: projectFileWarningMessagesFromError(error),
      })
      applyDropImportError(error, payload.files, previewResponse.warnings, previewBatch)
      return
    }

    setTransientImportState((current) => ({
      ...current,
      status: "registering",
      warnings: [],
      error: undefined,
    }))
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const registerResponse = await shellClient.run<ImportRegisterAllData>({
      command: "import.register_all",
      args: {
        session_id: sessionId,
        batch_id: previewBatch.id,
      },
    })
    if (!registerResponse.ok || !registerResponse.data) {
      const error = registerResponse.error ?? shellError("invalid_input", "Import register did not return object ids.", "import.register_all")
      updateProjectFileEntry(rawFilePath, {
        status: "error",
        warnings: projectFileWarningMessagesFromError(error),
      })
      applyDropImportError(
        error,
        payload.files,
        registerResponse.warnings,
        previewBatch,
      )
      return
    }

    const registerData = registerResponse.data
    const registeredObjectId = registerData.registered_object_ids[0]
    const registeredObject = registerData.objects.find((object) => object.id === registeredObjectId)
    if (!registeredObjectId || !registeredObject) {
      const error = shellError("invalid_input", "Import register did not return a single registered object.", "import.register_all")
      updateProjectFileEntry(rawFilePath, {
        status: "error",
        warnings: projectFileWarningMessagesFromError(error),
      })
      applyDropImportError(
        error,
        payload.files,
        registerResponse.warnings,
        registerData.batch,
      )
      return
    }

    setActiveObjectId(registeredObjectId)
    updateProjectFileEntry(rawFilePath, {
      status: "registered",
      registeredObjectIds: [registeredObjectId],
      warnings: projectFileWarningMessagesFromWarnings(registerResponse.warnings),
    })
    setTransientImportState((current) => ({
      ...current,
      status: "registered",
      activeBatch: registerData.batch,
      registeredObjectIds: registerData.registered_object_ids,
      warnings: registerResponse.warnings,
      error: undefined,
    }))
    setWorkbenchState((current) => {
      const imports = upsertImportBatch(current.imports, registerData.batch)
      const mergedObjects = mergeRegisteredObjects(current.objects, registerData.objects)
      return {
        ...current,
        status: "success",
        imports,
        objects: mergedObjects,
        counts: {
          ...current.counts,
          imports: imports.length,
          objects: mergedObjects.length,
        },
        warnings: registerResponse.warnings,
        error: undefined,
      }
    })

    if (!(await ensureWorkspaceReady(sessionId))) return
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const addNodeResponse = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.add_node",
      args: {
        session_id: sessionId,
        kind: "species",
        label: registeredObject.label ?? registeredObject.id,
        chemical_object_ids: [registeredObject.id],
        position: request.position,
      },
    })
    applyWorkspaceResponse(addNodeResponse)
    if (!addNodeResponse.ok || !addNodeResponse.data) {
      updateProjectFileEntry(rawFilePath, {
        status: "error",
        registeredObjectIds: [registeredObjectId],
        warnings: projectFileWarningMessagesFromError(
          addNodeResponse.error ?? shellError("invalid_input", "Workspace add node did not return workspace data.", "workspace.add_node"),
        ),
      })
      return
    }
    updateProjectFileEntry(rawFilePath, {
      status: "used-in-graph",
      registeredObjectIds: [registeredObjectId],
      graphNodeIds: graphNodeIdsForObject(addNodeResponse.data.workspace, registeredObjectId),
    })
    resetGraphEditorHistory()
  }, [addReusableProjectFileObjectNode, applyDropImportError, applyWorkspaceResponse, ensureWorkspaceReady, transientImportState.expectedFormat, transientImportState.strict, projectRepository, replaceProjectSidebarState, resetGraphEditorHistory, shellClient, updateProjectFileEntry, workbenchState.sessionId])

  const addProjectFileToCanvas = useCallback(async (file: ProjectFileEntry) => {
    const baseNodeCount = workbenchStateRef.current.workspace?.graph.nodes.length ?? 0
    if (await addReusableProjectFileObjectNode(file, registeredImportNodePosition(baseNodeCount, 0))) return
    await addRawFileNode({
      source: {
        kind: "project-file",
        projectFileId: file.id,
        path: file.path,
      },
      position: registeredImportNodePosition(baseNodeCount, 0),
    })
  }, [addRawFileNode, addReusableProjectFileObjectNode])

  const cancelParseCandidateChooser = useCallback(() => {
    setParseCandidateChooser(null)
  }, [])

  const toggleParseCandidateSelection = useCallback((candidateId: string, selected: boolean) => {
    setParseCandidateChooser((current) => {
      if (!current || current.status !== "choosing") return current
      const selectedIds = new Set(current.selectedCandidateIds)
      if (selected) {
        selectedIds.add(candidateId)
      } else {
        selectedIds.delete(candidateId)
      }
      return {
        ...current,
        selectedCandidateIds: current.candidates
          .map((candidate) => candidate.candidate_id)
          .filter((id) => selectedIds.has(id)),
        error: null,
      }
    })
  }, [])

  const confirmParseCandidateChooser = useCallback(async () => {
    const chooser = parseCandidateChooser
    const sessionId = workbenchState.sessionId
    if (!chooser || !sessionId || chooser.status !== "choosing") return
    const selectedCandidates = chooser.candidates.filter((candidate) =>
      chooser.selectedCandidateIds.includes(candidate.candidate_id)
    )
    if (selectedCandidates.length === 0) {
      setParseCandidateChooser({
        ...chooser,
        status: "error",
        error: shellError("invalid_input", "At least one parse candidate must be selected.", "object_indices"),
      })
      return
    }

    setParseCandidateChooser({ ...chooser, status: "registering", error: null })
    setTransientImportState((current) => ({ ...current, status: "registering", warnings: [], error: undefined }))
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const registerResponse = await shellClient.run<ImportRegisterSelectionData>({
      command: "import.register_selection",
      args: {
        session_id: sessionId,
        batch_id: chooser.batchId,
        item_id: chooser.itemId,
        object_indices: selectedCandidates.map((candidate) => candidate.object_index),
      },
    })
    if (!registerResponse.ok || !registerResponse.data) {
      const error = registerResponse.error ?? shellError("invalid_input", "Import selection did not return object ids.", "import.register_selection")
      updateProjectFileEntry(chooser.rawFilePath, {
        status: "error",
        warnings: projectFileWarningMessagesFromError(error),
      })
      setTransientImportState((current) => ({
        ...current,
        status: "error",
        warnings: registerResponse.warnings,
        error,
      }))
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: registerResponse.warnings,
        error,
      }))
      setParseCandidateChooser((current) => current ? { ...current, status: "error", error } : current)
      return
    }

    const registerData = registerResponse.data
    const registeredObjectIds = registerData.registered_object_ids
    const objectById = new Map(registerData.objects.map((object) => [object.id, object]))
    const registeredObjects = registeredObjectIds
      .map((objectId) => objectById.get(objectId))
      .filter((object): object is NonNullable<typeof object> => Boolean(object))
    if (registeredObjects.length !== registeredObjectIds.length) {
      const error = shellError("invalid_input", "Import selection did not return every selected object.", "import.register_selection")
      updateProjectFileEntry(chooser.rawFilePath, {
        status: "error",
        warnings: projectFileWarningMessagesFromError(error),
      })
      setTransientImportState((current) => ({
        ...current,
        status: "error",
        activeBatch: registerData.batch,
        registeredObjectIds,
        warnings: registerResponse.warnings,
        error,
      }))
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: registerResponse.warnings,
        error,
      }))
      setParseCandidateChooser((current) => current ? { ...current, status: "error", error } : current)
      return
    }

    setActiveObjectId(registeredObjectIds[0])
    updateProjectFileEntry(chooser.rawFilePath, {
      status: "registered",
      registeredObjectIds,
      warnings: projectFileWarningMessagesFromWarnings(registerResponse.warnings),
    })
    setTransientImportState((current) => ({
      ...current,
      status: "registered",
      activeBatch: registerData.batch,
      registeredObjectIds,
      warnings: registerResponse.warnings,
      error: undefined,
    }))
    setWorkbenchState((current) => {
      const imports = upsertImportBatch(current.imports, registerData.batch)
      const mergedObjects = mergeRegisteredObjects(current.objects, registerData.objects)
      return {
        ...current,
        status: "success",
        imports,
        objects: mergedObjects,
        counts: {
          ...current.counts,
          imports: imports.length,
          objects: mergedObjects.length,
        },
        warnings: registerResponse.warnings,
        error: undefined,
      }
    })

    setParseCandidateChooser((current) => current ? { ...current, status: "adding-nodes", error: null } : current)
    if (!(await ensureWorkspaceReady(sessionId))) return
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    let latestWorkspace: WorkspaceSummary | null = null
    for (const [index, object] of registeredObjects.entries()) {
      const addNodeResponse = await shellClient.run<WorkspaceCommandData>({
        command: "workspace.add_node",
        args: {
          session_id: sessionId,
          kind: "species",
          label: object.label ?? object.id,
          chemical_object_ids: [object.id],
          position: stackedCandidateNodePosition(chooser.position, index),
        },
      })
      applyWorkspaceResponse(addNodeResponse)
      if (!addNodeResponse.ok || !addNodeResponse.data) {
        const error = addNodeResponse.error ?? shellError("invalid_input", "Workspace add node did not return workspace data.", "workspace.add_node")
        updateProjectFileEntry(chooser.rawFilePath, {
          status: "error",
          registeredObjectIds,
          warnings: projectFileWarningMessagesFromError(error),
        })
        setParseCandidateChooser((current) => current ? { ...current, status: "error", error } : current)
        return
      }
      latestWorkspace = addNodeResponse.data.workspace
    }

    if (latestWorkspace) {
      updateProjectFileEntry(chooser.rawFilePath, {
        status: "used-in-graph",
        registeredObjectIds,
        graphNodeIds: registeredObjectIds.flatMap((objectId) => graphNodeIdsForObject(latestWorkspace, objectId)),
        warnings: [],
      })
    }
    setParseCandidateChooser(null)
    resetGraphEditorHistory()
  }, [applyWorkspaceResponse, ensureWorkspaceReady, parseCandidateChooser, resetGraphEditorHistory, shellClient, updateProjectFileEntry, workbenchState.sessionId])

  const applyCorrection = useCallback(async (request: ApplyCorrectionRequest) => {
    const sessionId = workbenchState.sessionId
    if (!sessionId) return
    setCorrectionPending(true)
    setCorrectionError(null)
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<RegistryApplyCorrectionData>({
      command: "registry.apply_correction",
      args: {
        session_id: sessionId,
        object_id: request.objectId,
        correction: request.correction,
      },
    })
    setCorrectionPending(false)
    if (!response.ok || !response.data) {
      const error = response.error ?? shellError("invalid_input", "Correction command did not return an object.", "registry.apply_correction")
      setCorrectionError(error)
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: response.warnings,
        error,
      }))
      return
    }
    const updatedObject = response.data.object

    setWorkbenchState((current) => ({
      ...current,
      status: "success",
      objects: replaceWorkbenchObject(current.objects, updatedObject),
      counts: {
        ...current.counts,
        objects: Math.max(current.counts.objects, current.objects.length),
      },
      warnings: response.warnings,
      error: undefined,
    }))
  }, [shellClient, workbenchState.sessionId])

  const startNodeDrag = useCallback((nodeId: string, origin: CanvasPoint) => {
    setGraphEditorInteraction((current) => ({
      ...selectGraphEditorNode(current, nodeId),
      dragging: {
        kind: "node",
        nodeIds: [nodeId],
        origin,
        current: origin,
      },
    }))
  }, [])

  const updateNodeDrag = useCallback((currentPoint: CanvasPoint) => {
    nodeDragPointRef.current = currentPoint
    if (nodeDragFrameRef.current !== null) return
    nodeDragFrameRef.current = window.requestAnimationFrame(() => {
      nodeDragFrameRef.current = null
      const point = nodeDragPointRef.current
      if (!point) return
      setGraphEditorInteraction((current) => {
        if (!current.dragging || current.dragging.kind !== "node") return current
        return {
          ...current,
          dragging: {
            ...current.dragging,
            current: point,
          },
        }
      })
    })
  }, [])

  const endNodeDrag = useCallback(() => {
    if (nodeDragFrameRef.current !== null) {
      window.cancelAnimationFrame(nodeDragFrameRef.current)
      nodeDragFrameRef.current = null
    }
    nodeDragPointRef.current = null
    setGraphEditorInteraction((current) => ({
      ...current,
      dragging: null,
    }))
  }, [])

  const startCanvasDrag = useCallback((origin: CanvasPoint) => {
    setGraphEditorInteraction((current) => startGraphEditorCanvasDrag(current, origin))
  }, [])

  const updateCanvasDrag = useCallback((currentPoint: CanvasPoint) => {
    canvasDragPointRef.current = currentPoint
    if (canvasDragFrameRef.current !== null) return
    canvasDragFrameRef.current = window.requestAnimationFrame(() => {
      canvasDragFrameRef.current = null
      const point = canvasDragPointRef.current
      if (!point) return
      setGraphEditorInteraction((current) => updateGraphEditorCanvasDrag(current, point))
    })
  }, [])

  const endCanvasDrag = useCallback(() => {
    if (canvasDragFrameRef.current !== null) {
      window.cancelAnimationFrame(canvasDragFrameRef.current)
      canvasDragFrameRef.current = null
    }
    canvasDragPointRef.current = null
    setGraphEditorInteraction(endGraphEditorCanvasDrag)
  }, [])

  const moveGraphNode = useCallback(async (request: MoveGraphNodeRequest) => {
    const sessionId = workbenchState.sessionId
    if (!sessionId) return
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.move_node",
      args: {
        session_id: sessionId,
        node_id: request.nodeId,
        position: request.position,
      },
    })
    applyWorkspaceResponse(response)
    if (response.ok && response.data) {
      resetGraphEditorHistory()
    }
  }, [applyWorkspaceResponse, resetGraphEditorHistory, shellClient, workbenchState.sessionId])

  const updateGraphNodeLabel = useCallback(async (request: UpdateGraphNodeLabelRequest) => {
    const sessionId = workbenchState.sessionId
    if (!sessionId || !request.nodeId || !request.label.trim()) return
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.update_node",
      args: {
        session_id: sessionId,
        node_id: request.nodeId,
        label: request.label.trim(),
      },
    })
    applyWorkspaceResponse(response)
    if (response.ok && response.data) {
      resetGraphEditorHistory()
    }
  }, [applyWorkspaceResponse, resetGraphEditorHistory, shellClient, workbenchState.sessionId])

  const nudgeGraphNodes = useCallback(async (request: NudgeGraphNodesRequest) => {
    const sessionId = workbenchState.sessionId
    const workspace = workbenchState.workspace
    const nodes = workspace?.graph.nodes ?? []
    if (!sessionId || request.nodeIds.length === 0) return
    const before = snapshotGraphEditorNodePositions(nodes, request.nodeIds)
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const moves = request.nodeIds
      .map((nodeId) => {
        const node = byId.get(nodeId)
        if (!node) return null
        return {
          nodeId,
          position: tuplePosition(moveGraphNodePosition(graphNodePosition(node), request.delta)),
        }
      })
      .filter((move): move is MoveGraphNodeRequest => Boolean(move))
    if (moves.length === 0) return
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    let latestWorkspace: WorkspaceSummary | null = null
    for (const move of moves) {
      const response = await shellClient.run<WorkspaceCommandData>({
        command: "workspace.move_node",
        args: {
          session_id: sessionId,
          node_id: move.nodeId,
          position: move.position,
        },
      })
      applyWorkspaceResponse(response)
      if (!response.ok || !response.data) return
      latestWorkspace = response.data.workspace
    }
    const after = snapshotGraphEditorNodePositions(latestWorkspace?.graph.nodes ?? [], before.map((item) => item.nodeId))
    pushGraphEditorHistory({
      id: nextGraphEditorHistoryEntryId("nudge"),
      kind: "nudge",
      label: t("graphCanvas.history.nudge"),
      before,
      after,
      createdAt: new Date().toISOString(),
    })
  }, [applyWorkspaceResponse, nextGraphEditorHistoryEntryId, pushGraphEditorHistory, shellClient, t, workbenchState.sessionId, workbenchState.workspace])

  const applyGraphAutoLayout = useCallback(async (plan: GraphLayoutPlan) => {
    const sessionId = workbenchState.sessionId
    const workspace = workbenchState.workspace
    if (!sessionId) return
    if (plan.changedNodeIds.length === 0) {
      setAutoLayoutStatus({
        state: "noop",
        message: `${Object.keys(plan.nodePositions).length} nodes already match ${plan.strategy}.`,
        warnings: plan.warnings,
      })
      return
    }
    const before = snapshotGraphEditorNodePositions(workspace?.graph.nodes ?? [], plan.changedNodeIds)
    const beforeViewport = normalizeGraphViewport(workspace?.viewport)

    setAutoLayoutStatus({
      state: "applying",
      message: `${plan.changedNodeIds.length} node moves queued.`,
      warnings: plan.warnings,
    })
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    let latestWorkspace: WorkspaceSummary | null = null

    for (const nodeId of plan.changedNodeIds) {
      const position = plan.nodePositions[nodeId]
      if (!position) continue
      const response = await shellClient.run<WorkspaceCommandData>({
        command: "workspace.move_node",
        args: {
          session_id: sessionId,
          node_id: nodeId,
          position,
        },
      })
      applyWorkspaceResponse(response)
      if (!response.ok || !response.data) {
        setAutoLayoutStatus({
          state: "error",
          message: response.error?.message ?? "Layout move failed.",
          warnings: plan.warnings,
        })
        return
      }
      latestWorkspace = response.data.workspace
    }

    if (plan.viewportIntent) {
      const response = await shellClient.run<WorkspaceCommandData>({
        command: "workspace.set_viewport",
        args: {
          session_id: sessionId,
          viewport: plan.viewportIntent,
        },
      })
      applyWorkspaceResponse(response)
      if (!response.ok || !response.data) {
        setAutoLayoutStatus({
          state: "error",
          message: response.error?.message ?? "Layout viewport fit failed.",
          warnings: plan.warnings,
        })
        return
      }
      latestWorkspace = response.data.workspace
    }

    const after = snapshotGraphEditorNodePositions(latestWorkspace?.graph.nodes ?? [], before.map((item) => item.nodeId))
    pushGraphEditorHistory({
      id: nextGraphEditorHistoryEntryId("layout"),
      kind: "layout",
      label: t("graphCanvas.history.layout"),
      before,
      after,
      beforeViewport,
      afterViewport: plan.viewportIntent ? normalizeGraphViewport(latestWorkspace?.viewport) : null,
      createdAt: new Date().toISOString(),
    })
    setAutoLayoutStatus({
      state: "success",
      message: `${plan.changedNodeIds.length} nodes moved with ${plan.strategy}.`,
      warnings: plan.warnings,
    })
  }, [applyWorkspaceResponse, nextGraphEditorHistoryEntryId, pushGraphEditorHistory, shellClient, t, workbenchState.sessionId, workbenchState.workspace])

  const updateNodeCompositionDraft = useCallback((
    index: number,
    field: keyof CompositionDraftState["rows"][number],
    value: string,
  ) => {
    setCompositionError(null)
    setCompositionDraft((current) => updateCompositionDraftRow(current, index, field, value))
  }, [])

  const addNodeCompositionDraftRow = useCallback(() => {
    const fallbackObjectId = activeObjectId ?? workbenchState.objects[0]?.id ?? ""
    setCompositionError(null)
    setCompositionDraft((current) => addCompositionDraftRow(current, fallbackObjectId))
  }, [activeObjectId, workbenchState.objects])

  const removeNodeCompositionDraftRow = useCallback((index: number) => {
    setCompositionError(null)
    setCompositionDraft((current) => removeCompositionDraftRow(current, index))
  }, [])

  const resetNodeCompositionDraft = useCallback(() => {
    setCompositionError(null)
    setCompositionDraft(compositionDraftFromSelectedNode(workbenchState.workspace))
  }, [workbenchState.workspace])

  const applyNodeCompositionDraft = useCallback(async () => {
    const sessionId = workbenchState.sessionId
    const nodeId = compositionDraft.nodeId
    if (!sessionId || !nodeId) return
    const compositionTerms = []
    let validationError: ShellError | null = null
    for (const [index, row] of compositionDraft.rows.entries()) {
      const coefficient = Number(row.coefficient)
      if (!row.objectId || !Number.isFinite(coefficient) || coefficient === 0) {
        validationError = shellError("invalid_input", "Composition coefficient must be a non-zero finite number.", `composition.${index}.coefficient`)
        break
      }
      compositionTerms.push({
        object_id: row.objectId,
        coefficient,
        role: row.role.trim() || null,
        label: row.label.trim() || null,
        metadata: {},
      })
    }
    if (validationError) {
      setCompositionError(validationError)
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        error: validationError,
      }))
      return
    }
    if (compositionTerms.length === 0) {
      const error = shellError("invalid_input", "Node composition must include at least one term.", "composition")
      setCompositionError(error)
      setWorkbenchState((current) => ({ ...current, status: "error", error }))
      return
    }

    setCompositionPending(true)
    setCompositionError(null)
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.set_node_composition",
      args: {
        session_id: sessionId,
        node_id: nodeId,
        composition: compositionTerms,
      },
    })
    setCompositionPending(false)
    if (!response.ok || !response.data) {
      const error = response.error ?? shellError("invalid_input", "Workspace command did not return data.", "workspace.set_node_composition")
      setCompositionError(error)
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: response.warnings,
        error,
      }))
      return
    }
    setCompositionDraft(compositionDraftFromSelectedNode(response.data.workspace))
    applyWorkspaceResponse(response)
    resetGraphEditorHistory()
  }, [applyWorkspaceResponse, compositionDraft, resetGraphEditorHistory, shellClient, workbenchState.sessionId])

  const updateGraphEdgeLabelDraft = useCallback((label: string) => {
    setEdgeLabelError(null)
    setEdgeLabelDraft((current) => updateEdgeLabelDraft(current, label))
  }, [])

  const resetGraphEdgeLabelDraft = useCallback(() => {
    setEdgeLabelError(null)
    setEdgeLabelDraft(edgeLabelDraftFromSelectedEdge(workbenchState.workspace))
  }, [workbenchState.workspace])

  const clearGraphEdgeLabelDraft = useCallback(() => {
    setEdgeLabelError(null)
    setEdgeLabelDraft((current) => clearEdgeLabelDraft(current))
  }, [])

  const applyGraphEdgeLabelDraft = useCallback(async () => {
    const sessionId = workbenchState.sessionId
    const edgeId = edgeLabelDraft.edgeId
    if (!sessionId || !edgeId) return
    setEdgeLabelPending(true)
    setEdgeLabelError(null)
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const label = edgeLabelDraft.label.trim() ? edgeLabelDraft.label : null
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.update_edge",
      args: {
        session_id: sessionId,
        edge_id: edgeId,
        label,
      },
    })
    setEdgeLabelPending(false)
    if (!response.ok || !response.data) {
      const error = response.error ?? shellError("invalid_input", "Workspace command did not return data.", "workspace.update_edge")
      setEdgeLabelError(error)
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: response.warnings,
        error,
      }))
      return
    }
    setEdgeLabelDraft(edgeLabelDraftFromSelectedEdge(response.data.workspace))
    applyWorkspaceResponse(response)
    resetGraphEditorHistory()
  }, [applyWorkspaceResponse, edgeLabelDraft, resetGraphEditorHistory, shellClient, workbenchState.sessionId])

  const removeGraphItems = useCallback(async (request: RemoveGraphItemsRequest) => {
    const sessionId = workbenchState.sessionId
    if (!sessionId || (request.nodeIds.length === 0 && request.edgeIds.length === 0 && request.pathIds.length === 0)) return
    const before = snapshotGraphEditorGraph(workbenchState.workspace)
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.remove",
      args: {
        session_id: sessionId,
        node_ids: request.nodeIds,
        edge_ids: request.edgeIds,
        path_ids: request.pathIds,
      },
    })
    applyWorkspaceResponse(response)
    if (response.ok && response.data) {
      pushGraphEditorHistory({
        id: nextGraphEditorHistoryEntryId("remove"),
        kind: "remove",
        label: t("graphCanvas.history.delete"),
        before,
        after: snapshotGraphEditorGraph(response.data.workspace),
        createdAt: new Date().toISOString(),
      })
    }
  }, [applyWorkspaceResponse, nextGraphEditorHistoryEntryId, pushGraphEditorHistory, shellClient, t, workbenchState.sessionId, workbenchState.workspace])

  const setGraphViewport = useCallback(async (viewport: GraphViewport) => {
    const sessionId = workbenchState.sessionId
    if (!sessionId) return
    const before = normalizeGraphViewport(workbenchState.workspace?.viewport)
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.set_viewport",
      args: {
        session_id: sessionId,
        viewport,
      },
    })
    applyWorkspaceResponse(response)
    if (response.ok && response.data) {
      pushGraphEditorHistory({
        id: nextGraphEditorHistoryEntryId("viewport"),
        kind: "viewport",
        label: t("graphCanvas.history.viewport"),
        before,
        after: normalizeGraphViewport(response.data.workspace.viewport),
        createdAt: new Date().toISOString(),
      })
    }
  }, [applyWorkspaceResponse, nextGraphEditorHistoryEntryId, pushGraphEditorHistory, shellClient, t, workbenchState.sessionId, workbenchState.workspace?.viewport])

  const autoFitGraphViewport = useCallback(async (viewport: GraphViewport) => {
    const sessionId = workbenchState.sessionId
    if (!sessionId) return
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.set_viewport",
      args: {
        session_id: sessionId,
        viewport,
      },
    })
    applyWorkspaceResponse(response)
  }, [applyWorkspaceResponse, shellClient, workbenchState.sessionId])

  const selectGraphItems = useCallback(async (
    selection: WorkspaceSelectionSummary,
    options: { recordHistory?: boolean } = {},
  ) => {
    const sessionId = workbenchState.sessionId
    if (!sessionId) return
    const before = snapshotGraphEditorSelection(workbenchState.workspace?.selection)
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.select",
      args: {
        session_id: sessionId,
        selection,
      },
    })
    applyWorkspaceResponse(response)
    if (options.recordHistory && response.ok && response.data) {
      pushGraphEditorHistory({
        id: nextGraphEditorHistoryEntryId("selection"),
        kind: "selection",
        label: t("graphCanvas.history.selection"),
        before,
        after: snapshotGraphEditorSelection(response.data.workspace.selection),
        createdAt: new Date().toISOString(),
      })
    }
  }, [applyWorkspaceResponse, nextGraphEditorHistoryEntryId, pushGraphEditorHistory, shellClient, t, workbenchState.sessionId, workbenchState.workspace?.selection])

  const replayGraphEditorHistory = useCallback(async (direction: "undo" | "redo") => {
    const sessionId = workbenchStateRef.current.sessionId
    const workspace = workbenchStateRef.current.workspace
    const entry = peekGraphEditorHistoryEntry(graphEditorHistoryRef.current, direction)
    if (!sessionId || !workspace || !entry || graphEditorHistoryRef.current.running) return
    const staleTarget = staleGraphEditorHistoryReference(entry, {
      nodeIds: workspace.graph.nodes.map((node) => node.id),
      edgeIds: workspace.graph.edges.map((edge) => edge.id),
      pathIds: workspace.graph.paths.map((path) => path.id),
    })
    if (staleTarget) {
      updateGraphEditorHistory((current) => failGraphEditorHistoryReplay(current, shellError(
        "graph_history_stale",
        "History entry references graph items that no longer exist.",
        staleTarget,
      )))
      return
    }

    updateGraphEditorHistory((current) => startGraphEditorHistoryReplay(current, direction))
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const replayResult = await replayGraphEditorHistoryEntry({
      entry,
      direction,
      sessionId,
      shellClient,
      workspace,
      applyWorkspaceResponse,
    })
    if (!replayResult.ok) {
      const error = replayResult.error ?? shellError("invalid_input", "Graph history replay failed.", "graph.history")
      updateGraphEditorHistory((current) => failGraphEditorHistoryReplay(current, error))
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        error,
      }))
      return
    }

    updateGraphEditorHistory((current) => completeGraphEditorHistoryReplay(current, direction))
  }, [applyWorkspaceResponse, shellClient, updateGraphEditorHistory])

  const clearGraphSelection = useCallback(() => {
    setGraphEditorInteraction(clearGraphEditorSelection)
    setEdgeLabelError(null)
    setEdgeLabelDraft(initialEdgeLabelDraftState)
    setCompositionError(null)
    setCompositionDraft(initialCompositionDraftState)
    setPathOrderDraft(null)
    void selectGraphItems({ node_ids: [], edge_ids: [], path_ids: [] }, { recordHistory: true })
  }, [selectGraphItems])

  const syncDraftsForGraphSelection = useCallback((selection: GraphEditorSelection) => {
    const workspace = workbenchState.workspace
    const nextWorkspace = workspace
      ? {
        ...workspace,
        selection: workspaceSelectionFromGraphEditorSelection(selection),
      }
      : undefined
    setEdgeLabelError(null)
    setEdgeLabelDraft(edgeLabelDraftFromSelectedEdge(nextWorkspace))
    setCompositionError(null)
    setCompositionDraft(compositionDraftFromSelectedNode(nextWorkspace))
    if (isSingleGraphEditorPathSelection(selection) && workspace) {
      const path = workspace.graph.paths.find((item) => item.id === selection.pathIds[0])
      setPathOrderDraft(path ? createGraphPathOrderDraft(path.id, path.node_ids) : null)
    } else {
      setPathOrderDraft(null)
    }
  }, [workbenchState.workspace])

  const selectEnergyProfilePoint = useCallback((nodeId: string) => {
    resetGraphEditorHistory()
    void selectGraphItems({ node_ids: [nodeId], edge_ids: [], path_ids: [] })
  }, [resetGraphEditorHistory, selectGraphItems])

  const togglePanMode = useCallback(() => {
    setGraphEditorInteraction((current) => setGraphEditorMode(
      current,
      current.mode === "pan" ? "select" : "pan",
    ))
  }, [])

  const updateCanvasEnergyDisplayOptions = useCallback((options: CanvasEnergyDisplayOptions) => {
    setCanvasEnergyDisplayOptions(options)
    setEnergyPanelOptions((current) => energyOptionsFromCanvasEnergyDisplayOptions(current, options))
  }, [])

  const startRubberBand = useCallback((origin: CanvasPoint, mode: "replace" | "add") => {
    setGraphEditorInteraction((current) => startGraphEditorRubberBand(current, origin, mode))
  }, [])

  const updateRubberBand = useCallback((currentPoint: CanvasPoint) => {
    setGraphEditorInteraction((current) => updateGraphEditorRubberBand(current, currentPoint))
  }, [])

  const endRubberBand = useCallback((nodeIds: string[], mode: "replace" | "add") => {
    const base = graphEditorInteractionWithWorkspaceSelection(
      graphEditorInteraction,
      workbenchState.workspace?.selection,
    )
    const nextInteraction = endGraphEditorRubberBand(selectGraphEditorNodes(base, nodeIds, mode))
    setGraphEditorInteraction(nextInteraction)
    syncDraftsForGraphSelection(nextInteraction.selection)
    void selectGraphItems(workspaceSelectionFromGraphEditorSelection(nextInteraction.selection), { recordHistory: true })
  }, [graphEditorInteraction, selectGraphItems, syncDraftsForGraphSelection, workbenchState.workspace?.selection])

  const cancelRubberBand = useCallback(() => {
    setGraphEditorInteraction(endGraphEditorRubberBand)
  }, [])

  const selectGraphEdge = useCallback((edgeId: string, mode: GraphEditorSelectionMode = "replace") => {
    const base = graphEditorInteractionWithWorkspaceSelection(
      graphEditorInteraction,
      workbenchState.workspace?.selection,
    )
    const nextInteraction = selectGraphEditorEdge(base, edgeId, mode)
    setGraphEditorInteraction(nextInteraction)
    syncDraftsForGraphSelection(nextInteraction.selection)
    void selectGraphItems(workspaceSelectionFromGraphEditorSelection(nextInteraction.selection), { recordHistory: true })
  }, [graphEditorInteraction, selectGraphItems, syncDraftsForGraphSelection, workbenchState.workspace?.selection])

  const selectGraphPath = useCallback((pathId: string, _nodeIds: string[], mode: GraphEditorSelectionMode = "replace") => {
    const base = graphEditorInteractionWithWorkspaceSelection(
      graphEditorInteraction,
      workbenchState.workspace?.selection,
    )
    const nextInteraction = selectGraphEditorPath(base, pathId, mode)
    setGraphEditorInteraction(nextInteraction)
    syncDraftsForGraphSelection(nextInteraction.selection)
    void selectGraphItems(workspaceSelectionFromGraphEditorSelection(nextInteraction.selection), { recordHistory: true })
  }, [graphEditorInteraction, selectGraphItems, syncDraftsForGraphSelection, workbenchState.workspace?.selection])

  const movePathDraftNode = useCallback((nodeId: string, direction: GraphPathOrderMoveDirection) => {
    setPathOrderDraft((current) => current ? moveGraphPathDraftNode(current, nodeId, direction) : current)
  }, [])

  const applyPathOrderDraft = useCallback(async () => {
    const sessionId = workbenchState.sessionId
    if (!sessionId || !pathOrderDraft) return
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.set_path",
      args: {
        session_id: sessionId,
        path_id: pathOrderDraft.pathId,
        node_ids: pathOrderDraft.nodeIds,
        label: pathOrderDraft.pathId,
      },
    })
    applyWorkspaceResponse(response)
    if (response.ok && response.data) {
      resetGraphEditorHistory()
    }
  }, [applyWorkspaceResponse, pathOrderDraft, resetGraphEditorHistory, shellClient, workbenchState.sessionId])

  const connectGraphNodes = useCallback(async (fromNodeId: string, toNodeId: string) => {
    const sessionId = workbenchState.sessionId
    if (!sessionId || fromNodeId === toNodeId) return
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    setPathAuthoringStatus({ state: "idle" })
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.connect",
      args: {
        session_id: sessionId,
        from_node_id: fromNodeId,
        to_node_id: toNodeId,
      },
    })
    applyWorkspaceResponse(response)
    if (response.ok && response.data) {
      const autoExtend = resolvePathAutoExtendIntent(response.data.workspace, fromNodeId, toNodeId)
      if (autoExtend.kind === "set-path") {
        setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
        const pathResponse = await shellClient.run<WorkspaceCommandData>({
          command: "workspace.set_path",
          args: {
            session_id: sessionId,
            path_id: autoExtend.pathId,
            node_ids: autoExtend.nodeIds,
            label: autoExtend.pathId,
          },
        })
        applyWorkspaceResponse(pathResponse)
        if (pathResponse.ok && pathResponse.data) {
          setPathAuthoringStatus({
            state: "auto",
            pathId: autoExtend.pathId,
            reason: autoExtend.reason,
          })
        } else {
          setPathAuthoringStatus({
            state: "error",
            error: pathResponse.error ?? shellError("graph_invalid", "Path update failed after connecting nodes.", "workspace.set_path"),
          })
        }
      } else {
        setPathAuthoringStatus({ state: "manual", reason: autoExtend.reason })
      }
      resetGraphEditorHistory()
    }
  }, [applyWorkspaceResponse, resetGraphEditorHistory, shellClient, workbenchState.sessionId])

  const selectGraphNode = useCallback(
    async (nodeId: string, mode: GraphEditorSelectionMode = "replace") => {
      const pendingConnectionFromId = graphEditorInteraction.pendingEdge?.fromNodeId
      if (mode === "replace" && graphEditorInteraction.pendingEdge?.source === "click" && pendingConnectionFromId && pendingConnectionFromId !== nodeId) {
        setGraphEditorInteraction((current) => completeGraphEditorConnection(current, nodeId))
        await connectGraphNodes(pendingConnectionFromId, nodeId)
        return
      }
      const base = graphEditorInteractionWithWorkspaceSelection(
        graphEditorInteraction,
        workbenchState.workspace?.selection,
      )
      const selectableBase = mode === "replace" ? base : clearGraphEditorPendingEdge(base)
      const nextInteraction = selectGraphEditorNode(selectableBase, nodeId, mode)
      setGraphEditorInteraction(nextInteraction)
      syncDraftsForGraphSelection(nextInteraction.selection)
      void selectGraphItems(workspaceSelectionFromGraphEditorSelection(nextInteraction.selection), { recordHistory: true })
    },
    [connectGraphNodes, graphEditorInteraction, selectGraphItems, syncDraftsForGraphSelection, workbenchState.workspace?.selection],
  )

  const startPointerEdge = useCallback((nodeId: string, position: CanvasPoint) => {
    setGraphEditorInteraction((current) => startGraphEditorPointerEdge(current, nodeId, position))
  }, [])

  const updatePointerEdge = useCallback((position: CanvasPoint, targetNodeId: string | null) => {
    setGraphEditorInteraction((current) => updateGraphEditorPointerEdge(current, position, targetNodeId))
  }, [])

  const cancelPointerEdge = useCallback(() => {
    setGraphEditorInteraction(clearGraphEditorPendingEdge)
  }, [])

  const endPointerEdge = useCallback((targetNodeId: string | null) => {
    const nodeIds = workbenchState.workspace?.graph.nodes.map((node) => node.id) ?? []
    const result = resolveGraphEditorDirectEdgeGesture(
      graphEditorInteraction,
      { nodeIds, edgeIds: [], pathIds: [] },
      targetNodeId,
    )
    setGraphEditorInteraction((current) => (
      result.kind === "connect"
        ? completeGraphEditorConnection(current, result.toNodeId)
        : clearGraphEditorPendingEdge(current)
    ))
    if (result.kind === "connect") {
      void connectGraphNodes(result.fromNodeId, result.toNodeId)
    }
  }, [connectGraphNodes, graphEditorInteraction, workbenchState.workspace])

  const runEnergyCompute = useCallback(async ({ force = true }: { force?: boolean } = {}) => {
    const target = pesComputeTarget(workbenchState, energyPanelOptions)
    if (!target) return
    if (!force && profileMatchesPesComputeTarget(workbenchState.profile, target)) {
      pesComputeSignatureRef.current = target.signature
      return
    }
    if (!force && pesComputeSignatureRef.current === target.signature) return
    if (pesComputeInFlightRef.current === target.signature) return
    pesComputeInFlightRef.current = target.signature
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<EnergyComputeData>({
      command: "energy.compute",
      args: {
        session_id: target.sessionId,
        path_id: target.pathId,
        output_unit: target.outputUnit,
        include_corrections: target.includeCorrections,
        energy_key: target.energyKey,
        energy_source: target.energySource,
        correction_policy: target.correctionPolicy,
        ...(target.baselineNodeId ? { baseline_node_id: target.baselineNodeId } : {}),
      },
    })
    pesComputeInFlightRef.current = null

    if (!response.ok || !response.data) {
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: response.warnings,
        error: response.error ?? shellError("invalid_input", "Energy compute did not return a profile.", "energy.compute"),
      }))
      return
    }

    const profile = response.data.profile
    pesComputeSignatureRef.current = target.signature
    setWorkbenchState((current) => ({
      ...current,
      status: "success",
      active: {
        ...current.active,
        profileId: profile.id,
      },
      counts: {
        ...current.counts,
        profiles: Math.max(current.counts.profiles, 1),
      },
      profile,
      warnings: response.warnings,
      error: undefined,
    }))
  }, [energyPanelOptions, shellClient, workbenchState])

  useEffect(() => {
    void runEnergyCompute({ force: false })
  }, [runEnergyCompute])

  const runReportExport = useCallback(async () => {
    const sessionId = workbenchState.sessionId
    if (!sessionId || !workbenchState.profile || reportExportOptions.formats.length === 0) return
    const basename = reportExportOptions.basename.trim() || workbenchState.profile.id
    const title = reportExportOptions.title.trim() || "Relative energy profile"
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<ExportProfileData>({
      command: "export.profile",
      args: {
        session_id: sessionId,
        formats: reportExportOptions.formats,
        include_bytes: reportExportOptions.includeBytes,
        basename,
        title,
      },
    })

    if (!response.ok || !response.data) {
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: response.warnings,
        error: response.error ?? shellError("invalid_input", "Export profile did not return artifacts.", "export.profile"),
      }))
      return
    }

    const runtimeArtifacts = response.artifacts.map(shellArtifactSummary)
    let nextArtifacts = mergeArtifacts(workbenchState.artifacts, runtimeArtifacts)
    let persistenceWarnings = response.warnings
    const activeProject = projectSidebarStateRef.current.activeProject
    if (activeProject) {
      try {
        const persistenceResults = await persistExportArtifacts(
          projectRepository,
          activeProject.projectRef,
          response.artifacts,
          { basename },
        )
        nextArtifacts = mergeArtifacts(
          workbenchState.artifacts,
          applyArtifactPersistenceResults(runtimeArtifacts, persistenceResults),
        )
        persistenceWarnings = [...response.warnings, ...artifactPersistenceWarnings(persistenceResults)]
        const refreshedSidebarState = await openProject(
          projectRepository,
          {
            ...projectSidebarStateRef.current,
            status: "loading",
            persistence: "saving",
            error: undefined,
          },
          activeProject.projectRef,
        )
        replaceProjectSidebarState({
          ...refreshedSidebarState,
          bridge: projectSidebarStateRef.current.bridge,
        })
      } catch (error) {
        persistenceWarnings = [
          ...response.warnings,
          browserPersistenceWarning(error),
        ]
      }
    }

    setWorkbenchState((current) => ({
      ...current,
      status: "success",
      counts: {
        ...current.counts,
        artifacts: nextArtifacts.length,
      },
      artifacts: nextArtifacts,
      warnings: persistenceWarnings,
      error: undefined,
    }))
  }, [projectRepository, replaceProjectSidebarState, reportExportOptions, shellClient, workbenchState.artifacts, workbenchState.profile, workbenchState.sessionId])

  const toggleProjectRail = useCallback(() => {
    setWorkspaceFlowShellState((current) => ({
      ...current,
      projectRailOpen: !current.projectRailOpen,
    }))
  }, [])

  const toggleExportDock = useCallback(() => {
    setWorkspaceFlowShellState((current) => ({
      ...current,
      inspectorOpen: !current.inspectorOpen,
    }))
  }, [])

  return (
    <div className="workbench-shell" ref={shellElementRef} data-theme={theme}>
      <header className="workbench-topbar" ref={topbarElementRef}>
        <div className="topbar-brand-lockup" aria-label="RxnFlow">
          <span className="brand-mark brand-mark--topbar">Rf</span>
          <span className="topbar-wordmark">{t("app.brand").toUpperCase()}</span>
        </div>

        <nav className="topbar-command-menu" aria-label={t("workbench.menu.aria")}>
          <button
            type="button"
            className={`topbar-command-button ${workspaceFlowShellState.projectRailOpen ? "topbar-icon-command--active" : ""}`}
            onClick={toggleProjectRail}
            aria-pressed={workspaceFlowShellState.projectRailOpen}
          >
            <PanelLeft size={17} />
            <span>{t("workbench.menu.projectPanel")}</span>
          </button>
        </nav>

        <div className="topbar-spacer" />

        <div className="topbar-status">
          <LocaleSwitcher locale={locale} onChange={setLocale} />
          <button
            type="button"
            className="topbar-icon-command theme-toggle-button"
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            aria-pressed={theme === "dark"}
            aria-label={theme === "dark" ? t("theme.switchToLight") : t("theme.switchToDark")}
            title={theme === "dark" ? t("theme.switchToLight") : t("theme.switchToDark")}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button
            type="button"
            className={`topbar-command-button ${workspaceFlowShellState.inspectorOpen ? "topbar-icon-command--active" : ""}`}
            onClick={toggleExportDock}
            aria-pressed={workspaceFlowShellState.inspectorOpen}
          >
            <Download size={17} />
            <span>{t("workbench.menu.export")}</span>
          </button>
        </div>
      </header>
      <input
        ref={projectImportInputRef}
        className="project-import-file-input"
        type="file"
        multiple
        onChange={handleProjectImportInputChange}
        aria-label={t("projectSidebar.projectFiles.import")}
      />
      {workbenchState.error ? <WorkbenchErrorAlert error={workbenchState.error} /> : null}

      <main
        className="workbench-grid workspace-flow-shell"
        aria-label={t("workbench.aria")}
        data-export-dock="report"
        data-project-rail-density={workspaceFlowShellState.projectRailDensity}
        data-project-rail={workspaceFlowShellState.projectRailOpen ? "open" : "closed"}
        data-inspector={workspaceFlowShellState.inspectorOpen ? "open" : "closed"}
      >
        <section className="project-rail" aria-label={t("workbench.flow.projectRail")}>
          <ProjectSidebar
            state={projectSidebarState}
            collapsed={!workspaceFlowShellState.projectRailOpen}
            onCreateProject={async (name) => {
              await createSidebarProject(name)
            }}
            onOpenProject={openSidebarProject}
            onDeleteProject={deleteSidebarProject}
            onImportProjectFiles={openProjectImport}
            onAddProjectFileToCanvas={addProjectFileToCanvas}
            onDeleteProjectFile={deleteSidebarProjectFile}
          />
        </section>
        <section className="canvas-stage" aria-label={t("workbench.flow.canvasStage")}>
          <div className="workspace-column canvas-stage-stack">
            <GraphCanvas
              state={workbenchState}
              activeObjectId={activeObjectId}
              interactionState={graphEditorInteraction}
              autoLayoutStatus={autoLayoutStatus}
              pathAuthoringStatus={pathAuthoringStatus}
              historyControls={{
                canUndo: graphEditorHistory.undo.length > 0,
                canRedo: graphEditorHistory.redo.length > 0,
                undoLabel: graphEditorHistoryReplayLabel(graphEditorHistory, "undo"),
                redoLabel: graphEditorHistoryReplayLabel(graphEditorHistory, "redo"),
                running: graphEditorHistory.running,
                error: graphEditorHistory.error,
              }}
              pathOrderDraft={pathOrderDraft}
              edgeLabelDraft={edgeLabelDraft}
              edgeLabelPending={edgeLabelPending}
              edgeLabelError={edgeLabelError}
              compositionDraft={compositionDraft}
              compositionPending={compositionPending}
              compositionError={compositionError}
              energyDisplayOptions={canvasEnergyDisplayOptions}
              candidateChooser={parseCandidateChooser}
              onEnergyDisplayOptionsChange={updateCanvasEnergyDisplayOptions}
              onSelectNode={selectGraphNode}
              onSelectEdge={selectGraphEdge}
              onSelectPath={selectGraphPath}
              onMovePathDraftNode={movePathDraftNode}
              onApplyPathOrderDraft={applyPathOrderDraft}
              onEdgeLabelDraftChange={updateGraphEdgeLabelDraft}
              onResetEdgeLabelDraft={resetGraphEdgeLabelDraft}
              onClearEdgeLabelDraft={clearGraphEdgeLabelDraft}
              onApplyEdgeLabelDraft={applyGraphEdgeLabelDraft}
              onStartNodeDrag={startNodeDrag}
              onUpdateNodeDrag={updateNodeDrag}
              onEndNodeDrag={endNodeDrag}
              onStartCanvasDrag={startCanvasDrag}
              onUpdateCanvasDrag={updateCanvasDrag}
              onEndCanvasDrag={endCanvasDrag}
              onStartRubberBand={startRubberBand}
              onUpdateRubberBand={updateRubberBand}
              onEndRubberBand={endRubberBand}
              onCancelRubberBand={cancelRubberBand}
              onStartPointerEdge={startPointerEdge}
              onUpdatePointerEdge={updatePointerEdge}
              onEndPointerEdge={endPointerEdge}
              onCancelPointerEdge={cancelPointerEdge}
              onAddObjectNode={addObjectNode}
              onAddRawFileNode={addRawFileNode}
              onToggleCandidateSelection={toggleParseCandidateSelection}
              onConfirmCandidateChooser={confirmParseCandidateChooser}
              onCancelCandidateChooser={cancelParseCandidateChooser}
              onMoveNode={moveGraphNode}
              onUpdateNodeLabel={updateGraphNodeLabel}
              onNudgeNodes={nudgeGraphNodes}
              onUndoHistory={() => void replayGraphEditorHistory("undo")}
              onRedoHistory={() => void replayGraphEditorHistory("redo")}
              onApplyAutoLayout={applyGraphAutoLayout}
              onRemoveGraphItems={removeGraphItems}
              onClearSelection={clearGraphSelection}
              onSetViewport={setGraphViewport}
              onAutoFitViewport={autoFitGraphViewport}
              onTogglePanMode={togglePanMode}
              onCompositionDraftRowChange={updateNodeCompositionDraft}
              onAddCompositionDraftRow={addNodeCompositionDraftRow}
              onRemoveCompositionDraftRow={removeNodeCompositionDraftRow}
              onResetCompositionDraft={resetNodeCompositionDraft}
              onApplyCompositionDraft={applyNodeCompositionDraft}
            />
          </div>
        </section>
        <InspectorPanel
          state={workbenchState}
          hasActiveBrowserProject={Boolean(projectSidebarState.activeProject)}
          reportExportOptions={reportExportOptions}
          onReportExportOptionsChange={setReportExportOptions}
          onRunReportExport={runReportExport}
        />
      </main>
    </div>
  )
}

function WorkbenchErrorAlert({ error }: { error: ShellError }) {
  const target = warningTargetDisplay(error)
  return (
    <div className="workbench-error-alert" role="alert">
      <code>{error.code}</code>
      <span>{error.message}</span>
      {target ? <small>{target}</small> : null}
    </div>
  )
}

function upsertImportBatch(
  batches: ImportBatchSummary[],
  batch: ImportBatchSummary,
): ImportBatchSummary[] {
  const index = batches.findIndex((existing) => existing.id === batch.id)
  if (index === -1) {
    return [...batches, batch]
  }
  return batches.map((existing, currentIndex) => (currentIndex === index ? batch : existing))
}

type RawDropImportFileResult =
  | { ok: true; file: WebImportFile }
  | { ok: false; file: WebImportFile; error: ShellError }

async function rawDropImportFile(
  repository: BrowserProjectRepository,
  projectRef: string,
  source: AddRawFileNodeRequest["source"],
): Promise<RawDropImportFileResult> {
  if (source.kind === "external-file") {
    const result = await persistRawInputFile(repository, projectRef, source.file)
    const fallbackFile = webImportFileFromFile(source.file)
    if (!result.ok) {
      return {
        ok: false,
        file: {
          ...fallbackFile,
          rawPersistence: { state: "error", error: result.error },
        },
        error: result.error,
      }
    }
    return {
      ok: true,
      file: webImportFileFromRawResource(result.resource, source.file),
    }
  }

  try {
    const object = await repository.readObject(projectRef, source.path)
    const resource = browserRawResourceFromObject(object, source.projectFileId)
    return {
      ok: true,
      file: webImportFileFromRawResource(resource, fileFromBrowserStorageObject(object, resource)),
    }
  } catch (error) {
    const shellErrorPayload = repositoryErrorPayload(error, source.path)
    return {
      ok: false,
      file: {
        id: source.projectFileId,
        name: baseName(source.path),
        size: 0,
        storagePath: source.path,
        sourceKind: "path",
        rawPersistence: { state: "error", error: shellErrorPayload },
      },
      error: shellErrorPayload,
    }
  }
}

function fileFromBrowserStorageObject(object: BrowserStorageObject, resource: BrowserRawResource): File | undefined {
  if (typeof File === "undefined") return undefined
  return new File([object.bytes], resource.metadata.source_name, {
    type: resource.metadata.mime_type ?? "",
    lastModified: resource.metadata.last_modified ?? undefined,
  })
}

function webImportFileFromFile(file: File): WebImportFile {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    size: file.size,
    mimeType: file.type || undefined,
    lastModified: file.lastModified || undefined,
    storagePath: `inputs/raw/${file.name}`,
    file,
    sourceKind: "path",
  }
}

function webImportFileFromRawResource(resource: BrowserRawResource, file?: File): WebImportFile {
  return {
    id: resource.id,
    name: resource.metadata.source_name,
    size: resource.metadata.byte_size,
    mimeType: resource.metadata.mime_type ?? file?.type ?? undefined,
    lastModified: resource.metadata.last_modified ?? file?.lastModified ?? undefined,
    storagePath: resource.path,
    file,
    sourceKind: "path",
    rawPersistence: { state: "persisted", resource },
  }
}

function browserRawResourceFromObject(object: BrowserStorageObject, rawResourceId: string): BrowserRawResource {
  const sourceName = stringMetadata(object, "source_name") ?? baseName(object.path)
  return {
    id: rawResourceId,
    kind: "raw_file",
    path: object.path,
    checksum: object.checksum ?? "",
    metadata: {
      source_name: sourceName,
      byte_size: numberMetadata(object, "byte_size") ?? object.bytes.byteLength,
      mime_type: stringMetadata(object, "mime_type"),
      last_modified: numberMetadata(object, "last_modified"),
    },
  }
}

async function preserveBrowserProjectManifest(
  repository: BrowserProjectRepository,
  projectRef: string,
  files: BrowserProjectContentFile[],
): Promise<BrowserProjectContentFile[]> {
  const manifestFile = files.find((file) => file.path === projectManifestPath)
  if (!manifestFile) return files
  try {
    const currentObject = await repository.readObject(projectRef, projectManifestPath)
    const currentManifest = parseJsonObjectBytes(currentObject.bytes)
    const savedManifest = parseJsonObjectBytes(manifestFile.bytes)
    const nextManifest: JsonObject = {
      ...savedManifest,
      id: typeof currentManifest.id === "string" ? currentManifest.id : savedManifest.id,
      name: typeof currentManifest.name === "string" ? currentManifest.name : savedManifest.name,
      created_at: typeof currentManifest.created_at === "string" ? currentManifest.created_at : savedManifest.created_at,
      resources: Array.isArray(currentManifest.resources)
        ? currentManifest.resources
        : Array.isArray(savedManifest.resources) ? savedManifest.resources : [],
    }
    const bytes = jsonObjectBytes(nextManifest)
    const checksum = await checksumBrowserStorageBytes(bytes)
    return files.map((file) => file.path === projectManifestPath
      ? {
        ...file,
        bytes,
        checksum,
        metadata: { kind: "project_manifest" },
      }
      : file)
  } catch {
    return files
  }
}

function parseJsonObjectBytes(bytes: Uint8Array<ArrayBuffer>): JsonObject {
  const value = JSON.parse(new TextDecoder().decode(bytes))
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}
}

function jsonObjectBytes(value: JsonObject): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`) as Uint8Array<ArrayBuffer>
}

function importPreviewObjectCount(batch: ImportBatchSummary): number {
  return batch.items.reduce((count, item) => count + (item.preview?.object_count ?? 0), 0)
}

function importPreviewCandidateChooserItem(
  batch: ImportBatchSummary,
): { itemId: string; candidates: ParseCandidateSummary[] } | null {
  for (const item of batch.items) {
    const candidates = item.preview?.candidates ?? []
    if (candidates.length > 1) {
      return { itemId: item.id, candidates }
    }
  }
  return null
}

function graphNodeIdsForObject(workspace: WorkspaceSummary, objectId: string): string[] {
  return workspace.graph.nodes
    .filter((node) => graphNodeObjectIds(node).includes(objectId))
    .map((node) => node.id)
}

function reusableProjectFileObjects(
  file: ProjectFileEntry,
  workbench: WorkbenchDomainState,
): WorkbenchDomainState["objects"] {
  if (file.registeredObjectIds.length === 0 || workbench.objects.length === 0) return []
  const objectById = new Map(workbench.objects.map((object) => [object.id, object]))
  return file.registeredObjectIds
    .map((objectId) => objectById.get(objectId))
    .filter((object): object is WorkbenchDomainState["objects"][number] => Boolean(object))
    .filter((object) => !objectNeedsRawHydration(object))
    .sort((left, right) => projectFileReusableObjectScore(right) - projectFileReusableObjectScore(left))
}

function projectFileReusableObjectScore(object: WorkbenchDomainState["objects"][number]): number {
  let score = 0
  if (hasRenderableGeometry(object.geometry)) score += 1000
  if (object.coordinate_preview?.has3d) score += 140
  if (object.display_energy && Number.isFinite(object.display_energy.value)) score += 120
  if ((object.energy_channels ?? []).length > 0) score += 80
  if (object.formula) score += 30
  if (typeof object.charge === "number") score += 12
  if (typeof object.spin_multiplicity === "number") score += 12
  if (object.source_file_id || object.provenance?.source_file_id) score += 8
  if ((object.warnings ?? []).length > 0) score -= Math.min(60, (object.warnings ?? []).length * 8)
  return score
}

function graphNodeObjectIds(node: WorkspaceSummary["graph"]["nodes"][number]): string[] {
  return Array.from(new Set([
    ...(node.composition ?? []).map((term) => term.object_id),
    ...(node.chemical_object_ids ?? []),
  ].filter((value): value is string => Boolean(value))))
}

function projectFileWarningMessagesFromError(error: ShellError): string[] {
  return [formatProjectFileWarningMessage(error.code, error.target)]
}

function projectFileWarningMessagesFromWarnings(warnings: WorkbenchDomainState["warnings"]): string[] {
  return Array.from(new Set(warnings.map((warning) => formatProjectFileWarningMessage(warning.code, warning.target))))
}

function formatProjectFileWarningMessage(code: string, target?: string | null): string {
  return target ? `${code}: ${target}` : code
}

function projectFileProjectionSignature(files: ProjectFileEntry[]): string {
  return JSON.stringify(files.map((file) => ({
    id: file.id,
    status: file.status,
    registeredObjectIds: file.registeredObjectIds,
    graphNodeIds: file.graphNodeIds,
    warnings: file.warnings,
  })))
}

function repositoryErrorPayload(error: unknown, target: string): BrowserProjectRepositoryErrorPayload {
  if (error instanceof BrowserProjectRepositoryError) {
    return error.toJSON()
  }
  return {
    code: "storage_failed",
    message: error instanceof Error ? error.message : "Browser project file read failed.",
    target,
  }
}

function stringMetadata(object: BrowserStorageObject, key: string): string | null {
  const value = object.metadata[key]
  return typeof value === "string" ? value : null
}

function numberMetadata(object: BrowserStorageObject, key: string): number | null {
  const value = object.metadata[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function baseName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path
}

function replaceWorkbenchObject(
  objects: WorkbenchDomainState["objects"],
  object: WorkbenchDomainState["objects"][number],
): WorkbenchDomainState["objects"] {
  if (!objects.some((item) => item.id === object.id)) {
    return [...objects, object]
  }
  return objects.map((item) => item.id === object.id ? object : item)
}

function shellError(code: string, message: string, target: string): ShellError {
  return { code, message, target }
}

function workspaceSelectionFromGraphEditorSelection(
  selection: GraphEditorSelection,
): WorkspaceSelectionSummary {
  return {
    node_ids: selection.nodeIds,
    edge_ids: selection.edgeIds,
    path_ids: selection.pathIds,
  }
}

function graphEditorSelectionFromWorkspaceSelection(
  selection: WorkspaceSelectionSummary | null | undefined,
): GraphEditorSelection {
  return {
    nodeIds: selection?.node_ids ?? [],
    edgeIds: selection?.edge_ids ?? [],
    pathIds: selection?.path_ids ?? [],
  }
}

function graphEditorInteractionWithWorkspaceSelection(
  interaction: GraphEditorInteractionState,
  selection: WorkspaceSelectionSummary | null | undefined,
): GraphEditorInteractionState {
  return {
    ...interaction,
    selection: graphEditorSelectionFromWorkspaceSelection(selection),
  }
}

async function replayGraphEditorHistoryEntry({
  entry,
  direction,
  sessionId,
  shellClient,
  workspace,
  applyWorkspaceResponse,
}: {
  entry: GraphEditorHistoryEntry
  direction: "undo" | "redo"
  sessionId: string
  shellClient: ShellClient
  workspace: WorkspaceSummary
  applyWorkspaceResponse: (response: Awaited<ReturnType<ShellClient["run"]>>) => void
}): Promise<{ ok: true } | { ok: false; error?: ShellError | null }> {
  if (entry.kind === "viewport") {
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.set_viewport",
      args: {
        session_id: sessionId,
        viewport: direction === "undo" ? entry.before : entry.after,
      },
    })
    applyWorkspaceResponse(response)
    return response.ok && response.data ? { ok: true } : { ok: false, error: response.error }
  }

  if (entry.kind === "selection") {
    const target = direction === "undo" ? entry.before : entry.after
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.select",
      args: {
        session_id: sessionId,
        selection: workspaceSelectionFromGraphEditorSelection({
          nodeIds: target.nodeIds,
          edgeIds: target.edgeIds,
          pathIds: target.pathIds,
        }),
      },
    })
    applyWorkspaceResponse(response)
    return response.ok && response.data ? { ok: true } : { ok: false, error: response.error }
  }

  if (entry.kind === "remove") {
    return replayGraphRemoveHistoryEntry({
      entry,
      direction,
      sessionId,
      shellClient,
      workspace,
      applyWorkspaceResponse,
    })
  }

  const target = (direction === "undo" ? entry.before : entry.after) as GraphEditorHistoryNodeEntry["before"]
  for (const snapshot of target) {
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.move_node",
      args: {
        session_id: sessionId,
        node_id: snapshot.nodeId,
        position: snapshot.position,
      },
    })
    applyWorkspaceResponse(response)
    if (!response.ok || !response.data) {
      return { ok: false, error: response.error }
    }
  }

  const viewportTarget = graphEditorHistoryViewportTargetForReplay(entry, direction)
  if (viewportTarget) {
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.set_viewport",
      args: {
        session_id: sessionId,
        viewport: viewportTarget,
      },
    })
    applyWorkspaceResponse(response)
    if (!response.ok || !response.data) {
      return { ok: false, error: response.error }
    }
  }

  return { ok: true }
}

async function replayGraphRemoveHistoryEntry({
  entry,
  direction,
  sessionId,
  shellClient,
  workspace,
  applyWorkspaceResponse,
}: {
  entry: GraphEditorHistoryRemoveEntry
  direction: "undo" | "redo"
  sessionId: string
  shellClient: ShellClient
  workspace: WorkspaceSummary
  applyWorkspaceResponse: (response: Awaited<ReturnType<ShellClient["run"]>>) => void
}): Promise<{ ok: true } | { ok: false; error?: ShellError | null }> {
  if (direction === "undo") {
    return restoreGraphSnapshot({
      snapshot: entry.before,
      sessionId,
      shellClient,
      workspace,
      applyWorkspaceResponse,
    })
  }

  return removeGraphSnapshotDelta({
    before: entry.before,
    after: entry.after,
    sessionId,
    shellClient,
    workspace,
    applyWorkspaceResponse,
  })
}

async function restoreGraphSnapshot({
  snapshot,
  sessionId,
  shellClient,
  workspace,
  applyWorkspaceResponse,
}: {
  snapshot: GraphEditorGraphSnapshot
  sessionId: string
  shellClient: ShellClient
  workspace: WorkspaceSummary
  applyWorkspaceResponse: (response: Awaited<ReturnType<ShellClient["run"]>>) => void
}): Promise<{ ok: true } | { ok: false; error?: ShellError | null }> {
  let currentWorkspace = workspace
  const nodeIdMap = new Map<string, string>()
  const usedCurrentNodeIds = new Set<string>()

  for (const targetNode of snapshot.nodes) {
    const currentNode = findCurrentNodeForSnapshot(targetNode, currentWorkspace, usedCurrentNodeIds)
    if (currentNode) {
      nodeIdMap.set(targetNode.id, currentNode.id)
      usedCurrentNodeIds.add(currentNode.id)
      continue
    }

    const previousNodeIds = new Set(currentWorkspace.graph.nodes.map((node) => node.id))
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.add_node",
      args: {
        session_id: sessionId,
        node_id: targetNode.id,
        kind: targetNode.kind,
        label: targetNode.label,
        chemical_object_ids: targetNode.chemical_object_ids ?? [],
        composition: targetNode.composition ?? [],
        position: targetNode.position ?? null,
        metadata: graphJsonObject(targetNode.metadata),
      },
    })
    applyWorkspaceResponse(response)
    if (!response.ok || !response.data) {
      return { ok: false, error: response.error }
    }
    currentWorkspace = response.data.workspace
    const restoredNode = currentWorkspace.graph.nodes.find((node) => !previousNodeIds.has(node.id))
      ?? findCurrentNodeForSnapshot(targetNode, currentWorkspace, usedCurrentNodeIds)
    if (!restoredNode) {
      return {
        ok: false,
        error: shellError("graph_history_replay_failed", "Restored graph node could not be matched.", targetNode.id),
      }
    }
    nodeIdMap.set(targetNode.id, restoredNode.id)
    usedCurrentNodeIds.add(restoredNode.id)
  }

  for (const targetEdge of snapshot.edges) {
    const sourceNodeId = nodeIdMap.get(workbenchEdgeSource(targetEdge))
    const targetNodeId = nodeIdMap.get(workbenchEdgeTarget(targetEdge))
    if (!sourceNodeId || !targetNodeId) continue

    const existingEdge = findCurrentEdgeForSnapshot(targetEdge, currentWorkspace, nodeIdMap)
    if (existingEdge) {
      if ((existingEdge.label ?? null) !== (targetEdge.label ?? null)) {
        const response = await shellClient.run<WorkspaceCommandData>({
          command: "workspace.update_edge",
          args: {
            session_id: sessionId,
            edge_id: existingEdge.id,
            label: targetEdge.label ?? null,
            metadata: graphJsonObject(targetEdge.metadata),
          },
        })
        applyWorkspaceResponse(response)
        if (!response.ok || !response.data) return { ok: false, error: response.error }
        currentWorkspace = response.data.workspace
      }
      continue
    }

    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.connect",
      args: {
        session_id: sessionId,
        edge_id: targetEdge.id,
        from_node_id: sourceNodeId,
        to_node_id: targetNodeId,
        label: targetEdge.label ?? null,
        metadata: graphJsonObject(targetEdge.metadata),
      },
    })
    applyWorkspaceResponse(response)
    if (!response.ok || !response.data) {
      return { ok: false, error: response.error }
    }
    currentWorkspace = response.data.workspace
  }

  for (const targetPath of snapshot.paths) {
    const mappedNodeIds = targetPath.node_ids
      .map((nodeId) => nodeIdMap.get(nodeId))
      .filter((nodeId): nodeId is string => Boolean(nodeId))
    if (mappedNodeIds.length !== targetPath.node_ids.length) continue
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.set_path",
      args: {
        session_id: sessionId,
        path_id: targetPath.id,
        node_ids: mappedNodeIds,
        label: targetPath.label ?? targetPath.id,
      },
    })
    applyWorkspaceResponse(response)
    if (!response.ok || !response.data) {
      return { ok: false, error: response.error }
    }
    currentWorkspace = response.data.workspace
  }

  if (snapshot.activePathId) {
    const activePath = snapshot.paths.find((path) => path.id === snapshot.activePathId)
    if (activePath) {
      const mappedNodeIds = activePath.node_ids
        .map((nodeId) => nodeIdMap.get(nodeId))
        .filter((nodeId): nodeId is string => Boolean(nodeId))
      if (mappedNodeIds.length === activePath.node_ids.length) {
        const response = await shellClient.run<WorkspaceCommandData>({
          command: "workspace.set_path",
          args: {
            session_id: sessionId,
            path_id: activePath.id,
            node_ids: mappedNodeIds,
            label: activePath.label ?? activePath.id,
          },
        })
        applyWorkspaceResponse(response)
        if (!response.ok || !response.data) return { ok: false, error: response.error }
        currentWorkspace = response.data.workspace
      }
    }
  }

  if (snapshot.viewport) {
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.set_viewport",
      args: {
        session_id: sessionId,
        viewport: snapshot.viewport,
      },
    })
    applyWorkspaceResponse(response)
    if (!response.ok || !response.data) return { ok: false, error: response.error }
    currentWorkspace = response.data.workspace
  }

  const edgeIdMap = edgeIdMapForSnapshot(snapshot, currentWorkspace, nodeIdMap)
  const pathIdSet = new Set(currentWorkspace.graph.paths.map((path) => path.id))
  const selection = {
    node_ids: snapshot.selection.nodeIds
      .map((nodeId) => nodeIdMap.get(nodeId))
      .filter((nodeId): nodeId is string => Boolean(nodeId)),
    edge_ids: snapshot.selection.edgeIds
      .map((edgeId) => edgeIdMap.get(edgeId))
      .filter((edgeId): edgeId is string => Boolean(edgeId)),
    path_ids: snapshot.selection.pathIds.filter((pathId) => pathIdSet.has(pathId)),
  }
  const response = await shellClient.run<WorkspaceCommandData>({
    command: "workspace.select",
    args: {
      session_id: sessionId,
      selection,
    },
  })
  applyWorkspaceResponse(response)
  if (!response.ok || !response.data) return { ok: false, error: response.error }
  return { ok: true }
}

async function removeGraphSnapshotDelta({
  before,
  after,
  sessionId,
  shellClient,
  workspace,
  applyWorkspaceResponse,
}: {
  before: GraphEditorGraphSnapshot
  after: GraphEditorGraphSnapshot
  sessionId: string
  shellClient: ShellClient
  workspace: WorkspaceSummary
  applyWorkspaceResponse: (response: Awaited<ReturnType<ShellClient["run"]>>) => void
}): Promise<{ ok: true } | { ok: false; error?: ShellError | null }> {
  const beforeToCurrentNodeIds = nodeIdMapBetweenSnapshots(before.nodes, workspace)
  const afterEquivalentNodeIds = new Set<string>()
  for (const afterNode of after.nodes) {
    const currentNode = findCurrentNodeForSnapshot(afterNode, workspace, afterEquivalentNodeIds)
    if (currentNode) afterEquivalentNodeIds.add(currentNode.id)
  }

  const nodeIds = before.nodes
    .filter((node) => !hasEquivalentNodeInSnapshot(node, after.nodes))
    .map((node) => beforeToCurrentNodeIds.get(node.id))
    .filter((nodeId): nodeId is string => typeof nodeId === "string" && !afterEquivalentNodeIds.has(nodeId))

  const edgeIds = before.edges
    .filter((edge) => !hasEquivalentEdgeInSnapshot(edge, after.edges, before.nodes, after.nodes))
    .map((edge) => findCurrentEdgeForSnapshot(edge, workspace, beforeToCurrentNodeIds)?.id)
    .filter((edgeId): edgeId is string => Boolean(edgeId))

  const pathIds = before.paths
    .filter((path) => !hasEquivalentPathInSnapshot(path, after.paths, before.nodes, after.nodes))
    .map((path) => findCurrentPathForSnapshot(path, workspace, beforeToCurrentNodeIds)?.id)
    .filter((pathId): pathId is string => Boolean(pathId))

  if (nodeIds.length === 0 && edgeIds.length === 0 && pathIds.length === 0) {
    return { ok: true }
  }

  const response = await shellClient.run<WorkspaceCommandData>({
    command: "workspace.remove",
    args: {
      session_id: sessionId,
      node_ids: nodeIds,
      edge_ids: edgeIds,
      path_ids: pathIds,
    },
  })
  applyWorkspaceResponse(response)
  return response.ok && response.data ? { ok: true } : { ok: false, error: response.error }
}

function findCurrentNodeForSnapshot(
  targetNode: GraphNodeSummary,
  workspace: WorkspaceSummary,
  usedCurrentNodeIds: Set<string>,
): GraphNodeSummary | null {
  const sameId = workspace.graph.nodes.find((node) => node.id === targetNode.id && !usedCurrentNodeIds.has(node.id))
  if (sameId) return sameId
  return workspace.graph.nodes.find((node) => !usedCurrentNodeIds.has(node.id) && graphNodesEquivalent(node, targetNode)) ?? null
}

function nodeIdMapBetweenSnapshots(nodes: GraphNodeSummary[], workspace: WorkspaceSummary): Map<string, string> {
  const idMap = new Map<string, string>()
  const usedCurrentNodeIds = new Set<string>()
  for (const node of nodes) {
    const currentNode = findCurrentNodeForSnapshot(node, workspace, usedCurrentNodeIds)
    if (!currentNode) continue
    idMap.set(node.id, currentNode.id)
    usedCurrentNodeIds.add(currentNode.id)
  }
  return idMap
}

function edgeIdMapForSnapshot(
  snapshot: GraphEditorGraphSnapshot,
  workspace: WorkspaceSummary,
  nodeIdMap: Map<string, string>,
): Map<string, string> {
  const idMap = new Map<string, string>()
  const usedCurrentEdgeIds = new Set<string>()
  for (const edge of snapshot.edges) {
    const currentEdge = findCurrentEdgeForSnapshot(edge, workspace, nodeIdMap, usedCurrentEdgeIds)
    if (!currentEdge) continue
    idMap.set(edge.id, currentEdge.id)
    usedCurrentEdgeIds.add(currentEdge.id)
  }
  return idMap
}

function findCurrentEdgeForSnapshot(
  targetEdge: GraphEdgeSummary,
  workspace: WorkspaceSummary,
  nodeIdMap: Map<string, string>,
  usedCurrentEdgeIds: Set<string> = new Set(),
): GraphEdgeSummary | null {
  const sameId = workspace.graph.edges.find((edge) => edge.id === targetEdge.id && !usedCurrentEdgeIds.has(edge.id))
  if (sameId) return sameId
  const sourceNodeId = nodeIdMap.get(workbenchEdgeSource(targetEdge))
  const targetNodeId = nodeIdMap.get(workbenchEdgeTarget(targetEdge))
  if (!sourceNodeId || !targetNodeId) return null
  return workspace.graph.edges.find((edge) => (
    !usedCurrentEdgeIds.has(edge.id)
    && workbenchEdgeSource(edge) === sourceNodeId
    && workbenchEdgeTarget(edge) === targetNodeId
    && (edge.label ?? null) === (targetEdge.label ?? null)
  )) ?? workspace.graph.edges.find((edge) => (
    !usedCurrentEdgeIds.has(edge.id)
    && workbenchEdgeSource(edge) === sourceNodeId
    && workbenchEdgeTarget(edge) === targetNodeId
  )) ?? null
}

function findCurrentPathForSnapshot(
  targetPath: GraphPathSummary,
  workspace: WorkspaceSummary,
  nodeIdMap: Map<string, string>,
): GraphPathSummary | null {
  const sameId = workspace.graph.paths.find((path) => path.id === targetPath.id)
  if (sameId) return sameId
  const mappedNodeIds = targetPath.node_ids.map((nodeId) => nodeIdMap.get(nodeId))
  if (mappedNodeIds.some((nodeId) => !nodeId)) return null
  return workspace.graph.paths.find((path) => (
    path.node_ids.join("\n") === mappedNodeIds.join("\n")
    && (path.label ?? null) === (targetPath.label ?? null)
  )) ?? null
}

function hasEquivalentNodeInSnapshot(node: GraphNodeSummary, nodes: GraphNodeSummary[]): boolean {
  return nodes.some((candidate) => graphNodesEquivalent(node, candidate))
}

function hasEquivalentEdgeInSnapshot(
  edge: GraphEdgeSummary,
  edges: GraphEdgeSummary[],
  beforeNodes: GraphNodeSummary[],
  afterNodes: GraphNodeSummary[],
): boolean {
  const sourceNode = beforeNodes.find((node) => node.id === workbenchEdgeSource(edge))
  const targetNode = beforeNodes.find((node) => node.id === workbenchEdgeTarget(edge))
  return edges.some((candidate) => {
    const candidateSource = afterNodes.find((node) => node.id === workbenchEdgeSource(candidate))
    const candidateTarget = afterNodes.find((node) => node.id === workbenchEdgeTarget(candidate))
    return Boolean(sourceNode && targetNode && candidateSource && candidateTarget)
      && graphNodesEquivalent(sourceNode as GraphNodeSummary, candidateSource as GraphNodeSummary)
      && graphNodesEquivalent(targetNode as GraphNodeSummary, candidateTarget as GraphNodeSummary)
      && (edge.label ?? null) === (candidate.label ?? null)
  })
}

function hasEquivalentPathInSnapshot(
  path: GraphPathSummary,
  paths: GraphPathSummary[],
  beforeNodes: GraphNodeSummary[],
  afterNodes: GraphNodeSummary[],
): boolean {
  return paths.some((candidate) => (
    (path.label ?? null) === (candidate.label ?? null)
    && path.node_ids.length === candidate.node_ids.length
    && path.node_ids.every((nodeId, index) => {
      const beforeNode = beforeNodes.find((node) => node.id === nodeId)
      const afterNode = afterNodes.find((node) => node.id === candidate.node_ids[index])
      return Boolean(beforeNode && afterNode) && graphNodesEquivalent(beforeNode as GraphNodeSummary, afterNode as GraphNodeSummary)
    })
  ))
}

function graphNodesEquivalent(left: GraphNodeSummary, right: GraphNodeSummary): boolean {
  return left.kind === right.kind
    && left.label === right.label
    && sameGraphNodePosition(left.position, right.position)
    && stableJson(left.chemical_object_ids ?? []) === stableJson(right.chemical_object_ids ?? [])
    && stableJson(left.composition ?? []) === stableJson(right.composition ?? [])
}

function sameGraphNodePosition(left: GraphNodeSummary["position"], right: GraphNodeSummary["position"]): boolean {
  if (!left && !right) return true
  if (!left || !right) return false
  return Math.abs(left[0] - right[0]) < 0.001 && Math.abs(left[1] - right[1]) < 0.001
}

function graphJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}
}

function isSingleNodeSelection(selection: WorkspaceSelectionSummary | null | undefined): boolean {
  return (selection?.node_ids.length ?? 0) === 1
    && (selection?.edge_ids.length ?? 0) === 0
    && (selection?.path_ids.length ?? 0) === 0
}

function isSingleEdgeSelection(selection: WorkspaceSelectionSummary | null | undefined): boolean {
  return (selection?.node_ids.length ?? 0) === 0
    && (selection?.edge_ids.length ?? 0) === 1
    && (selection?.path_ids.length ?? 0) === 0
}

function isSinglePathSelection(selection: WorkspaceSelectionSummary | null | undefined): boolean {
  return (selection?.node_ids.length ?? 0) === 0
    && (selection?.edge_ids.length ?? 0) === 0
    && (selection?.path_ids.length ?? 0) === 1
}

function isSingleGraphEditorPathSelection(selection: GraphEditorSelection): boolean {
  return selection.nodeIds.length === 0
    && selection.edgeIds.length === 0
    && selection.pathIds.length === 1
}

function tuplePosition(position: CanvasPoint): [number, number] {
  return [position.x, position.y]
}

function registeredImportNodePosition(baseNodeCount: number, index: number): [number, number] {
  const column = baseNodeCount + index
  return [120 + column * 260, column % 2 === 0 ? 280 : 160]
}

function stackedCandidateNodePosition(origin: [number, number], index: number): [number, number] {
  const baseX = clampCandidateGraphCoordinate(origin[0], 120, 480)
  const baseY = baseX > 420 ? 50 : clampCandidateGraphCoordinate(origin[1], 50, 270)
  const directionX = baseX > 420 ? -160 : 160
  const directionY = baseY > 210 ? -220 : 220
  return tuplePosition(canvasPointToGraphNodePosition({
    x: clampCandidateGraphCoordinate(baseX + index * directionX, 120, 480),
    y: clampCandidateGraphCoordinate(baseY + index * directionY, 50, 270),
  }))
}

function clampCandidateGraphCoordinate(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function energyOptionsForWorkspace(
  current: EnergyPanelOptions,
  workspace: WorkspaceCommandData["workspace"],
): EnergyPanelOptions {
  const paths = workspace.graph.paths ?? []
  const activePathId = workspace.active_path_id ?? paths[0]?.id ?? ""
  const nextPath = paths.find((path) => path.id === activePathId)
  const baselineStillExists = current.baselineNodeId
    && nextPath?.node_ids.includes(current.baselineNodeId)
  return {
    ...current,
    pathId: activePathId,
    baselineNodeId: baselineStillExists ? current.baselineNodeId : "",
  }
}

function energyOptionsFromCanvasEnergyDisplayOptions(
  current: EnergyPanelOptions,
  options: CanvasEnergyDisplayOptions,
): EnergyPanelOptions {
  const channel = energyChannelForCanvasEnergyMode(options.mode)
  return {
    ...current,
    ...channel,
    outputUnit: energyOutputUnitFromCanvasEnergyUnit(options.unit, current.outputUnit),
  }
}

function energyChannelForCanvasEnergyMode(
  mode: CanvasEnergyMode,
): Pick<EnergyPanelOptions, "energyKey" | "energySource" | "correctionPolicyMode"> {
  if (mode === "free") {
    return {
      energyKey: "ggas",
      energySource: "thermochemistry",
      correctionPolicyMode: "none",
    }
  }
  if (mode === "solvation") {
    return {
      energyKey: "gsol",
      energySource: "thermochemistry",
      correctionPolicyMode: "none",
    }
  }
  if (mode === "corrected") {
    return {
      energyKey: "electronic",
      energySource: "energies",
      correctionPolicyMode: "all",
    }
  }
  return {
    energyKey: "electronic",
    energySource: "energies",
    correctionPolicyMode: "none",
  }
}

function energyOutputUnitFromCanvasEnergyUnit(
  unit: CanvasEnergyUnit,
  fallback: EnergyPanelOptions["outputUnit"],
): EnergyPanelOptions["outputUnit"] {
  return unit === "kcal_mol" || unit === "kj_mol" ? unit : fallback
}

type PesComputeTarget = {
  signature: string
  sessionId: string
  pathId: string
  nodeIds: string[]
  outputUnit: EnergyPanelOptions["outputUnit"]
  energyKey: string
  energySource: EnergyPanelOptions["energySource"]
  baselineNodeId: string
  correctionPolicy: JsonObject
  includeCorrections: boolean
}

function pesComputeTarget(
  state: WorkbenchDomainState,
  options: EnergyPanelOptions,
): PesComputeTarget | null {
  const sessionId = state.sessionId
  const workspace = state.workspace
  if (!sessionId || !workspace) return null
  const pathId = workspace.active_path_id
    || options.pathId
    || workspace.graph.paths[0]?.id
    || ""
  const path = workspace.graph.paths.find((item) => item.id === pathId)
  if (!path) return null
  const energyKey = options.energyKey.trim() || "electronic"
  const correctionPolicy = correctionPolicyFromEnergyOptions(options)
  const target: Omit<PesComputeTarget, "signature"> = {
    sessionId,
    pathId,
    nodeIds: [...path.node_ids],
    outputUnit: options.outputUnit,
    energyKey,
    energySource: options.energySource,
    baselineNodeId: options.baselineNodeId || path.node_ids[0] || "",
    correctionPolicy,
    includeCorrections: options.correctionPolicyMode !== "none",
  }
  return {
    ...target,
    signature: pesComputeSignature(target),
  }
}

function profileMatchesPesComputeTarget(
  profile: WorkbenchDomainState["profile"],
  target: PesComputeTarget,
): boolean {
  if (!profile) return false
  if (profile.path_id !== target.pathId) return false
  if (profile.output_unit !== target.outputUnit) return false
  if ((profile.energy_key ?? "electronic") !== target.energyKey) return false
  if ((profile.energy_source ?? "auto") !== target.energySource) return false
  if ((profile.baseline_node_id ?? target.nodeIds[0] ?? "") !== target.baselineNodeId) return false
  if (profile.points.map((point) => point.node_id).join("\n") !== target.nodeIds.join("\n")) return false
  const profileCorrectionPolicy = profile.correction_policy ?? { mode: "none" }
  return stableJson(profileCorrectionPolicy) === stableJson(target.correctionPolicy)
}

function pesComputeSignature(target: Omit<PesComputeTarget, "signature">): string {
  return stableJson({
    sessionId: target.sessionId,
    pathId: target.pathId,
    nodeIds: target.nodeIds,
    outputUnit: target.outputUnit,
    energyKey: target.energyKey,
    energySource: target.energySource,
    baselineNodeId: target.baselineNodeId,
    correctionPolicy: target.correctionPolicy,
  })
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableJsonValue(value))
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue)
  }
  if (!value || typeof value !== "object") {
    return value
  }
  const object = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .map((key) => [key, stableJsonValue(object[key])]),
  )
}

function correctionPolicyFromEnergyOptions(options: EnergyPanelOptions): JsonObject {
  if (options.correctionPolicyMode === "kinds") {
    return {
      mode: "kinds",
      kinds: options.correctionKinds,
    }
  }
  if (options.correctionPolicyMode === "ids") {
    return {
      mode: "ids",
      ids: options.correctionIds.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean),
    }
  }
  return { mode: options.correctionPolicyMode }
}

function shellArtifactSummary(artifact: ShellArtifact): WorkbenchArtifactSummary {
  return {
    id: artifact.id,
    format: artifact.format,
    path: artifact.path ?? null,
    bytes_base64: artifact.bytes_base64 ?? null,
    metadata: artifact.metadata,
    persisted: false,
    has_inline_bytes: typeof artifact.bytes_base64 === "string" && artifact.bytes_base64.length > 0,
  }
}

function mergeArtifacts(
  current: WorkbenchArtifactSummary[],
  incoming: WorkbenchArtifactSummary[],
): WorkbenchArtifactSummary[] {
  const byId = new Map(current.map((artifact) => [artifact.id, artifact]))
  for (const artifact of incoming) {
    byId.set(artifact.id, artifact)
  }
  return Array.from(byId.values())
}

function artifactPersistenceWarnings(results: readonly ExportArtifactPersistenceResult[]) {
  return results
    .filter((result) => result.error && result.error.code !== "missing_inline_bytes")
    .map((result) => ({
      code: result.error?.code ?? "artifact_persistence_failed",
      message: result.error?.message ?? "Export artifact persistence failed.",
      target: result.error?.target ?? result.path ?? result.artifactId,
      details: {
        artifact_id: result.artifactId,
        path: result.path ?? null,
        checksum: result.checksum ?? null,
      },
    }))
}

function browserPersistenceWarning(error: unknown) {
  if (error instanceof Error) {
    return {
      code: "artifact_persistence_failed",
      message: error.message,
      target: "exports",
    }
  }
  return {
    code: "artifact_persistence_failed",
    message: "Export artifact persistence failed.",
    target: "exports",
  }
}

type InspectorPanelProps = {
  state: WorkbenchDomainState
  hasActiveBrowserProject: boolean
  reportExportOptions: ReportExportOptions
  onReportExportOptionsChange: (options: ReportExportOptions) => void
  onRunReportExport: () => void
}

function InspectorPanel({
  state,
  hasActiveBrowserProject,
  reportExportOptions,
  onReportExportOptionsChange,
  onRunReportExport,
}: InspectorPanelProps) {
  const { t } = useI18n()

  return (
    <aside
      className="inspector-panel export-dock"
      aria-label={t("reportExport.aria")}
      data-active-dock="export"
    >
      <div className="export-dock-panel">
        <ReportExportPanel
          artifacts={state.artifacts}
          options={reportExportOptions}
          disabled={!state.sessionId || !state.profile}
          onOptionsChange={onReportExportOptionsChange}
          onExport={onRunReportExport}
        />
      </div>
    </aside>
  )
}

function inferLinearPathNodeIds(workspace: WorkbenchDomainState["workspace"]): string[] | null {
  if (!workspace || workspace.active_path_id || workspace.graph.paths.length > 0) return null
  const nodeIds = new Set(workspace.graph.nodes.map((node) => node.id))
  const edges = workspace.graph.edges
    .map((edge) => ({
      from: workbenchEdgeSource(edge),
      to: workbenchEdgeTarget(edge),
    }))
    .filter((edge) => edge.from && edge.to && edge.from !== edge.to && nodeIds.has(edge.from) && nodeIds.has(edge.to))
  if (edges.length === 0 || edges.length !== workspace.graph.edges.length) return null

  const outgoing = new Map<string, string>()
  const incomingCounts = new Map<string, number>()
  for (const edge of edges) {
    if (outgoing.has(edge.from)) return null
    outgoing.set(edge.from, edge.to)
    incomingCounts.set(edge.to, (incomingCounts.get(edge.to) ?? 0) + 1)
    if ((incomingCounts.get(edge.to) ?? 0) > 1) return null
  }

  const starts = Array.from(outgoing.keys()).filter((nodeId) => !incomingCounts.has(nodeId))
  if (starts.length !== 1) return null

  const path = [starts[0]]
  const visited = new Set(path)
  while (outgoing.has(path[path.length - 1])) {
    const nextNodeId = outgoing.get(path[path.length - 1])
    if (!nextNodeId || visited.has(nextNodeId)) return null
    path.push(nextNodeId)
    visited.add(nextNodeId)
  }

  return path.length === edges.length + 1 ? path : null
}

function workbenchEdgeSource(edge: WorkspaceSummary["graph"]["edges"][number]): string {
  return edge.from_node ?? edge.source ?? ""
}

function workbenchEdgeTarget(edge: WorkspaceSummary["graph"]["edges"][number]): string {
  return edge.to_node ?? edge.target ?? ""
}

function restoredProjectNeedsGeometryHydration(state: WorkbenchDomainState): boolean {
  if (!state.workspace) return false
  const objectById = new Map(state.objects.map((object) => [object.id, object]))
  return state.workspace.graph.nodes.some((node) => graphNodeNeedsGeometryHydration(node, objectById))
}

function restoredGeometryHydrationFiles(
  state: WorkbenchDomainState,
  projectFiles: ProjectFileEntry[],
): ProjectFileEntry[] {
  const missingNames = new Set<string>()
  const objectById = new Map(state.objects.map((object) => [object.id, object]))
  for (const object of state.objects) {
    if (!objectNeedsRawHydration(object)) continue
    addNormalizedName(missingNames, object.label)
    addNormalizedName(missingNames, object.source_file_id)
  }
  for (const node of state.workspace?.graph.nodes ?? []) {
    if (graphNodeNeedsGeometryHydration(node, objectById)) {
      addNormalizedName(missingNames, node.label)
    }
  }

  const seenPaths = new Set<string>()
  const rawFiles = projectFiles.filter((file) => {
    if (!isRawHydrationFile(file) || seenPaths.has(file.path)) return false
    seenPaths.add(file.path)
    return true
  })
  const matchedFiles = rawFiles.filter((file) => {
    const names = [file.name, file.sourceName, stripRawHydrationPrefix(file.name)].filter((value): value is string => Boolean(value))
    return names.some((name) => hydrationNameCandidates(name).some((candidate) => missingNames.has(candidate)))
  })
  return matchedFiles.length > 0 ? matchedFiles : rawFiles
}

function restoredGeometryHydrationNodeIds(
  state: WorkbenchDomainState,
  fileName: string | null | undefined,
): string[] {
  if (!fileName) return []
  const objectById = new Map(state.objects.map((object) => [object.id, object]))
  return (state.workspace?.graph.nodes ?? [])
    .filter((node) => graphNodeNeedsGeometryHydration(node, objectById))
    .filter((node) => hydrationNamesMatch(node.label, fileName))
    .map((node) => node.id)
}

function restoredGeometryHydrationFallbackNodeIds(
  state: WorkbenchDomainState,
  hydratedObject: WorkbenchDomainState["objects"][number],
  options: {
    allowSingleRawFallback: boolean
    fileIndex: number
    rawFileCount: number
  },
): string[] {
  const objectById = new Map(state.objects.map((object) => [object.id, object]))
  const candidates = (state.workspace?.graph.nodes ?? [])
    .filter((node) => graphNodeNeedsGeometryHydration(node, objectById))
  const namedMatches = candidates.filter((node) => (
    hydrationNamesMatch(node.label, hydratedObject.label)
    || hydrationNamesMatch(node.label, hydratedObject.source_file_id)
  ))
  if (namedMatches.length > 0) return namedMatches.map((node) => node.id)
  if (options.allowSingleRawFallback && candidates.length === 1) return [candidates[0].id]
  if (
    options.rawFileCount > 1
    && candidates.length === options.rawFileCount
    && options.fileIndex >= 0
    && options.fileIndex < candidates.length
  ) {
    return [candidates[options.fileIndex].id]
  }
  return []
}

function graphNodeNeedsGeometryHydration(
  node: NonNullable<WorkbenchDomainState["workspace"]>["graph"]["nodes"][number],
  objectById: Map<string, WorkbenchDomainState["objects"][number]>,
): boolean {
  const nodeObjectIds = [
    ...(node.chemical_object_ids ?? []),
    ...(node.composition ?? []).map((term) => term.object_id),
  ]
  if (nodeObjectIds.length === 0) return true
  const nodeObjects = nodeObjectIds
    .map((objectId) => objectById.get(objectId))
    .filter((object): object is WorkbenchDomainState["objects"][number] => Boolean(object))
  if (nodeObjects.length === 0) return true
  return nodeObjects.some((object) => objectNeedsRawHydration(object))
}

function objectNeedsRawHydration(object: WorkbenchDomainState["objects"][number]): boolean {
  if (!hasRenderableGeometry(object.geometry)) return true
  if (!isLogLikeComputationalObject(object)) return false
  return !objectHasElectronicEnergyChannel(object) || !objectHasGasFreeEnergyChannel(object)
}

function isLogLikeComputationalObject(object: WorkbenchDomainState["objects"][number]): boolean {
  const candidates = [
    object.label,
    object.source_file_id,
    object.provenance?.source_file_id,
    object.provenance?.parser_id,
  ]
  return candidates.some((value) => typeof value === "string" && (
    /\.(log|out)$/i.test(value)
    || value.toLowerCase().includes("gaussian")
    || value.toLowerCase().includes("orca")
  ))
}

function objectHasElectronicEnergyChannel(object: WorkbenchDomainState["objects"][number]): boolean {
  return objectEnergyKeys(object).some((key) => ["egas", "electronic", "scf"].includes(key))
}

function objectHasGasFreeEnergyChannel(object: WorkbenchDomainState["objects"][number]): boolean {
  return objectThermochemistryKeys(object).some((key) => (
    ["ggas", "ggas_1m", "gibbs", "free_energy", "gibbs_free_energy"].includes(key)
  ))
}

function objectEnergyKeys(object: WorkbenchDomainState["objects"][number]): string[] {
  return uniqueStrings([
    ...jsonStringValues(object.energy_keys),
    ...energyChannelKeys(object, "energies"),
    object.display_energy?.source === "energies" ? object.display_energy.key : null,
  ]).map(normalizeHydrationEnergyKey)
}

function objectThermochemistryKeys(object: WorkbenchDomainState["objects"][number]): string[] {
  return uniqueStrings([
    ...jsonStringValues(object.thermochemistry_keys),
    ...energyChannelKeys(object, "thermochemistry"),
    object.display_energy?.source === "thermochemistry" ? object.display_energy.key : null,
  ]).map(normalizeHydrationEnergyKey)
}

function energyChannelKeys(
  object: WorkbenchDomainState["objects"][number],
  source: "energies" | "thermochemistry",
): string[] {
  return (object.energy_channels ?? [])
    .filter((channel) => channel.source === source)
    .map((channel) => channel.key)
}

function jsonStringValues(values: unknown): string[] {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string")
    : []
}

function normalizeHydrationEnergyKey(value: string): string {
  return value.trim().toLowerCase().replace(/[/-]/g, "_")
}

function isRawHydrationFile(file: ProjectFileEntry): boolean {
  return file.path.startsWith("inputs/raw/")
    && file.kind !== "export-artifact"
}

function addNormalizedName(target: Set<string>, value: string | null | undefined): void {
  if (!value) return
  for (const candidate of hydrationNameCandidates(value)) {
    target.add(candidate)
  }
}

function hydrationNamesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false
  const leftNames = new Set(hydrationNameCandidates(left))
  return hydrationNameCandidates(right).some((name) => leftNames.has(name))
}

function hydrationNameCandidates(value: string): string[] {
  const stripped = stripRawHydrationPrefix(value)
  return Array.from(new Set([
    normalizeHydrationName(value),
    normalizeHydrationName(stripped),
    normalizeHydrationName(stripRawHydrationExtension(stripped)),
  ].filter(Boolean)))
}

function normalizeHydrationName(value: string): string {
  return value.trim().toLowerCase()
}

function stripRawHydrationPrefix(value: string): string {
  return value
    .replace(/^raw[-:]/i, "")
    .replace(/^[a-f0-9]{12}-/i, "")
}

function stripRawHydrationExtension(value: string): string {
  return value.replace(/\.(log|out|xyz|extxyz)$/i, "")
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function hasRenderableGeometry(geometry: unknown): boolean {
  return Array.isArray(geometry)
    && geometry.some((atom) => (
      atom
      && typeof atom === "object"
      && !Array.isArray(atom)
      && typeof (atom as JsonObject).element === "string"
      && Number.isFinite(Number((atom as JsonObject).x))
      && Number.isFinite(Number((atom as JsonObject).y))
      && Number.isFinite(Number((atom as JsonObject).z))
    ))
}

function graphChemicalObjectIds(workspace: WorkbenchDomainState["workspace"]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const node of workspace?.graph.nodes ?? []) {
    const nodeIds = [
      ...(node.composition ?? []).map((term) => term.object_id),
      ...(node.chemical_object_ids ?? []),
    ]
    for (const objectId of nodeIds) {
      if (!objectId || seen.has(objectId)) continue
      seen.add(objectId)
      ids.push(objectId)
    }
  }
  return ids
}

function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function projectAutoSaveSignature(
  workbenchState: WorkbenchDomainState,
  projectSidebarState: ProjectSidebarState,
): string {
  if (
    !workbenchState.sessionId
    || !projectSidebarState.activeProjectRef
    || workbenchState.status === "running"
    || workbenchState.status === "error"
  ) {
    return ""
  }

  return JSON.stringify({
    projectRef: projectSidebarState.activeProjectRef,
    sessionId: workbenchState.sessionId,
    objects: workbenchState.objects,
    imports: workbenchState.imports,
    workspace: workbenchState.workspace,
    profile: workbenchState.profile,
    artifacts: workbenchState.artifacts,
  })
}

type LocaleSwitcherProps = {
  locale: SupportedLocale
  onChange: (locale: SupportedLocale) => void
}

function LocaleSwitcher({ locale, onChange }: LocaleSwitcherProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return undefined
    const handleDocumentPointerDown = (event: PointerEvent) => {
      const wrapper = wrapperRef.current
      if (!wrapper || wrapper.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("pointerdown", handleDocumentPointerDown, { capture: true })
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown, { capture: true })
  }, [open])

  const chooseLocale = (nextLocale: SupportedLocale) => {
    onChange(nextLocale)
    setOpen(false)
  }

  return (
    <div className="locale-switcher" ref={wrapperRef}>
      <button
        type="button"
        className="locale-switcher-button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("locale.openMenu")}
        title={t("locale.label")}
      >
        <Languages size={16} />
        <span>{locale === "zh-CN" ? t("locale.zhCN") : t("locale.enUS")}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <select
        className="locale-switcher-native"
        aria-label={t("locale.label")}
        value={locale}
        onChange={(event) => chooseLocale(event.currentTarget.value as SupportedLocale)}
      >
        <option value="zh-CN">{t("locale.zhCN")}</option>
        <option value="en-US">{t("locale.enUS")}</option>
      </select>
      {open ? (
        <div className="locale-switcher-menu" role="menu" aria-label={t("locale.label")}>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={locale === "zh-CN"}
            onClick={() => chooseLocale("zh-CN")}
          >
            <span>{t("locale.zhCN")}</span>
            <small>ZH</small>
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={locale === "en-US"}
            onClick={() => chooseLocale("en-US")}
          >
            <span>{t("locale.enUS")}</span>
            <small>EN</small>
          </button>
        </div>
      ) : null}
    </div>
  )
}
