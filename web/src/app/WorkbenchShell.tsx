import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, Play } from "lucide-react"
import { BrowserProjectRepositoryError, type BrowserProjectRepository } from "../repository"
import type { EnergyComputeData, ExportProfileData, FixtureRunData, ImportBatchSummary, ImportPreviewData, ImportRegisterAllData, JsonObject, RegistryApplyCorrectionData, ShellArtifact, ShellClient, ShellError, ShellRuntimeInfo, WorkbenchArtifactSummary, WorkspaceCommandData, WorkspaceSelectionSummary } from "../shell"
import {
  addCompositionDraftRow,
  compositionDraftFromSelectedNode,
  initialCompositionDraftState,
  reconcileCompositionDraft,
  removeCompositionDraftRow,
  updateCompositionDraftRow,
  type CompositionDraftState,
} from "./compositionDraftState"
import { EnergyProfilePanel, type EnergyPanelOptions } from "./EnergyProfilePanel"
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
import {
  completeGraphEditorConnection,
  endGraphEditorCanvasDrag,
  initialGraphEditorInteractionState,
  pruneGraphEditorInteractionState,
  selectGraphEditorEdge,
  selectGraphEditorNode,
  selectGraphEditorPath,
  setGraphEditorMode,
  startGraphEditorCanvasDrag,
  startGraphEditorConnection,
  updateGraphEditorCanvasDrag,
  type CanvasPoint,
} from "./graphEditorInteractionState"
import type { GraphLayoutPlan } from "./graphAutoLayout"
import type { GraphViewport } from "./graphViewport"
import {
  createGraphPathOrderDraft,
  moveGraphPathDraftNode,
  type GraphPathOrderDraft,
  type GraphPathOrderMoveDirection,
} from "./graphPathOrderDraft"
import { GraphCanvas, type AddObjectNodeRequest, type GraphAutoLayoutStatus, type MoveGraphNodeRequest, type RemoveGraphItemsRequest } from "./GraphCanvas"
import { ImportInbox } from "./ImportInbox"
import {
  importPreviewArgsFromFiles,
  initialImportInboxState,
  mergeRegisteredObjects,
  type ImportInboxState,
  type WebImportFile,
} from "./importInboxState"
import { ObjectRegistryPanel, type ApplyCorrectionRequest } from "./ObjectRegistryPanel"
import { persistImportFilesAsRawInputs } from "./rawInputPersistence"
import { exportBrowserProjectBundle, type ExportBundleStatus } from "./projectBundleExport"
import {
  browserProjectBundleImportConflictPolicy,
  importBrowserProjectBundle,
  type ImportBundleStatus,
} from "./projectBundleImport"
import { createProject, openProject, refreshProjects, saveProjectContent } from "./projectSidebarActions"
import {
  contentFilesToShellPayload,
  readProjectContentFiles,
  shellPayloadToContentFiles,
  type BrowserProjectContentFile,
  type ProjectSaveContentData,
} from "./projectContentBridge"
import { initialProjectSidebarState, type ProjectSidebarState } from "./projectSidebarState"
import { ProjectSidebar } from "./ProjectSidebar"
import { ReportExportPanel, type ReportExportOptions } from "./ReportExportPanel"
import {
  initialWorkbenchDomainState,
  projectWorkbenchSnapshot,
  type CommandStatus,
  type WorkbenchDomainState,
  type WorkbenchSnapshotData,
} from "./workbenchState"
import { useI18n, type SupportedLocale } from "./i18n"

type WorkbenchShellProps = {
  shellClient: ShellClient
  projectRepository: BrowserProjectRepository
  runtimeInfo?: ShellRuntimeInfo
}

const defaultRuntimeInfo: ShellRuntimeInfo = {
  mode: "fixture",
  transportKind: "in-process-test",
}

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
  const [exportBundleStatus, setExportBundleStatus] = useState<ExportBundleStatus>({ state: "idle" })
  const [importBundleStatus, setImportBundleStatus] = useState<ImportBundleStatus>({ state: "idle" })
  const [importInboxState, setImportInboxState] = useState<ImportInboxState>(
    initialImportInboxState,
  )
  const [activeObjectId, setActiveObjectId] = useState<string | undefined>()
  const [correctionPending, setCorrectionPending] = useState(false)
  const [correctionError, setCorrectionError] = useState<ShellError | null>(null)
  const [graphEditorInteraction, setGraphEditorInteraction] = useState(
    initialGraphEditorInteractionState,
  )
  const [autoLayoutStatus, setAutoLayoutStatus] = useState<GraphAutoLayoutStatus>({ state: "idle" })
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
  const [energyPanelOptions, setEnergyPanelOptions] = useState<EnergyPanelOptions>({
    pathId: "",
    outputUnit: "kcal_mol",
    energyKey: "electronic",
    energySource: "auto",
    baselineNodeId: "",
    correctionPolicyMode: "none",
    correctionKinds: ["solvation", "resonance", "manual"],
    correctionIds: "",
  })
  const [reportExportOptions, setReportExportOptions] = useState<ReportExportOptions>({
    formats: ["png", "cdxml", "xlsx"],
    includeBytes: true,
    basename: "rxnflow-profile",
    title: "Relative energy profile",
  })
  const projectSidebarStateRef = useRef<ProjectSidebarState>(initialProjectSidebarState)

  const replaceProjectSidebarState = useCallback((nextState: ProjectSidebarState) => {
    projectSidebarStateRef.current = nextState
    setProjectSidebarState(nextState)
  }, [])

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
    setExportBundleStatus({ state: "idle" })
  }, [projectSidebarState.activeProjectRef])

  useEffect(() => {
    setActiveObjectId((current) => {
      if (current && workbenchState.objects.some((object) => object.id === current)) {
        return current
      }
      return workbenchState.objects[0]?.id
    })
  }, [workbenchState.objects])

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
      const selectedEdgeId = workbenchState.workspace?.selection?.edge_ids[0]
      return selectedEdgeId ? current : null
    })
    setCompositionDraft((current) => reconcileCompositionDraft(current, workbenchState.workspace))
    setCompositionError((current) => {
      if (!current) return current
      const selectedNodeId = workbenchState.workspace?.selection?.node_ids[0]
      return selectedNodeId ? current : null
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
    if (selection.path_ids[0]) {
      const path = workspace.graph.paths.find((item) => item.id === selection.path_ids[0])
      setPathOrderDraft(path ? createGraphPathOrderDraft(path.id, path.node_ids) : null)
    } else {
      setPathOrderDraft((current) => current && workspace.graph.paths.some((path) => path.id === current.pathId) ? current : null)
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

  const createSidebarProject = useCallback(
    async (name: string) => {
      const loadingState: ProjectSidebarState = {
        ...projectSidebarStateRef.current,
        status: "loading",
        error: undefined,
      }
      replaceProjectSidebarState(loadingState)
      const nextState = await createProject(projectRepository, loadingState, name)
      replaceProjectSidebarState(nextState)
      return nextState
    },
    [projectRepository, replaceProjectSidebarState],
  )

  const openSidebarProject = useCallback(
    async (projectRef: string) => {
      const loadingState: ProjectSidebarState = {
        ...projectSidebarStateRef.current,
        status: "loading",
        error: undefined,
      }
      replaceProjectSidebarState(loadingState)
      const nextState = await openProject(projectRepository, loadingState, projectRef)
      replaceProjectSidebarState(nextState)
    },
    [projectRepository, replaceProjectSidebarState],
  )

  const saveSidebarProjectStub = useCallback(async () => {
    const loadingState: ProjectSidebarState = {
      ...projectSidebarStateRef.current,
      status: "loading",
      persistence: "saving",
      error: undefined,
    }
    replaceProjectSidebarState(loadingState)
    const nextState = await saveProjectContent(projectRepository, loadingState)
    replaceProjectSidebarState(nextState)
  }, [projectRepository, replaceProjectSidebarState])

  const openSidebarBridgeSession = useCallback(async () => {
    const activeProject = projectSidebarStateRef.current.activeProject
    if (!activeProject) return
    const loadingState: ProjectSidebarState = {
      ...projectSidebarStateRef.current,
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
    setWorkbenchState(projectWorkbenchSnapshot(snapshot))
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
  }, [projectRepository, replaceProjectSidebarState, shellClient])

  const saveSidebarBridgeSession = useCallback(async () => {
    const activeProject = projectSidebarStateRef.current.activeProject
    const sessionId = workbenchState.sessionId
    if (!activeProject || !sessionId) return
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
      return
    }
    const files = shellPayloadToContentFiles(response.data.content_files) as BrowserProjectContentFile[]
    const savedState = await saveProjectContent(projectRepository, loadingState, files)
    replaceProjectSidebarState({
      ...savedState,
      bridge: { state: "open", sessionId },
    })
    setWorkbenchState((current) => ({ ...current, status: "success", warnings: response.warnings, error: undefined }))
  }, [projectRepository, replaceProjectSidebarState, shellClient, workbenchState.sessionId])

  const exportSidebarBundle = useCallback(async () => {
    const activeProject = projectSidebarStateRef.current.activeProject
    setExportBundleStatus({ state: "exporting" })
    const result = await exportBrowserProjectBundle(projectRepository, activeProject)
    if (!result.ok) {
      setExportBundleStatus({ state: "error", error: result.error })
      return
    }
    triggerBrowserBundleDownload(result.blob, result.fileName)
    setExportBundleStatus({
      state: "success",
      fileName: result.fileName,
      summary: result.summary,
    })
  }, [projectRepository])

  const importSidebarBundleFile = useCallback(async (file: File) => {
    setImportBundleStatus({ state: "importing", fileName: file.name })
    const result = await importBrowserProjectBundle(projectRepository, {
      file,
      conflictPolicy: browserProjectBundleImportConflictPolicy,
    })
    if (!result.ok) {
      setImportBundleStatus({ state: "error", error: result.error })
      return
    }

    const loadingState: ProjectSidebarState = {
      ...projectSidebarStateRef.current,
      status: "loading",
      error: undefined,
    }
    replaceProjectSidebarState(loadingState)
    const nextState = await openProject(projectRepository, loadingState, result.project.projectRef)
    replaceProjectSidebarState(nextState)
    setImportBundleStatus({
      state: "success",
      project: nextState.activeProject ?? result.project,
      summary: result.summary,
      receiptCount: result.receipts.length,
    })
  }, [projectRepository, replaceProjectSidebarState])

  const runFixture = useCallback(async () => {
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

    const snapshotResponse = await shellClient.run<WorkbenchSnapshotData>({
      command: "workbench.snapshot",
      args: {
        session_id: fixtureResponse.data.session_id,
      },
    })
    setWorkbenchState(projectWorkbenchSnapshot(snapshotResponse))
  }, [shellClient])

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

  const selectImportFiles = useCallback((files: WebImportFile[]) => {
    setImportInboxState((current) => ({
      ...current,
      status: files.length > 0 ? "selecting" : "idle",
      selectedFiles: files,
      activeBatch: undefined,
      registeredObjectIds: [],
      warnings: [],
      error: undefined,
    }))
  }, [])

  const changeImportExpectedFormat = useCallback((expectedFormat: string) => {
    setImportInboxState((current) => ({ ...current, expectedFormat }))
  }, [])

  const changeImportStrict = useCallback((strict: boolean) => {
    setImportInboxState((current) => ({ ...current, strict }))
  }, [])

  const clearImportInbox = useCallback(() => {
    setImportInboxState(initialImportInboxState)
  }, [])

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

  const addObjectNode = useCallback(async (request: AddObjectNodeRequest = {}) => {
    const sessionId = workbenchState.sessionId
    const activeObject = workbenchState.objects.find((object) => object.id === (request.objectId ?? activeObjectId))
      ?? workbenchState.objects[0]
    if (!sessionId || !activeObject) return
    const nodeCount = workbenchState.workspace?.graph.nodes.length ?? 0
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
  }, [activeObjectId, applyWorkspaceResponse, shellClient, workbenchState.objects, workbenchState.sessionId, workbenchState.workspace])

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
    setGraphEditorInteraction((current) => {
      if (!current.dragging || current.dragging.kind !== "node") return current
      return {
        ...current,
        dragging: {
          ...current.dragging,
          current: currentPoint,
        },
      }
    })
  }, [])

  const endNodeDrag = useCallback(() => {
    setGraphEditorInteraction((current) => ({
      ...current,
      dragging: null,
    }))
  }, [])

  const startCanvasDrag = useCallback((origin: CanvasPoint) => {
    setGraphEditorInteraction((current) => startGraphEditorCanvasDrag(current, origin))
  }, [])

  const updateCanvasDrag = useCallback((currentPoint: CanvasPoint) => {
    setGraphEditorInteraction((current) => updateGraphEditorCanvasDrag(current, currentPoint))
  }, [])

  const endCanvasDrag = useCallback(() => {
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
  }, [applyWorkspaceResponse, shellClient, workbenchState.sessionId])

  const applyGraphAutoLayout = useCallback(async (plan: GraphLayoutPlan) => {
    const sessionId = workbenchState.sessionId
    if (!sessionId) return
    if (plan.changedNodeIds.length === 0) {
      setAutoLayoutStatus({
        state: "noop",
        message: `${Object.keys(plan.nodePositions).length} nodes already match ${plan.strategy}.`,
        warnings: plan.warnings,
      })
      return
    }

    setAutoLayoutStatus({
      state: "applying",
      message: `${plan.changedNodeIds.length} node moves queued.`,
      warnings: plan.warnings,
    })
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))

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
    }

    setAutoLayoutStatus({
      state: "success",
      message: `${plan.changedNodeIds.length} nodes moved with ${plan.strategy}.`,
      warnings: plan.warnings,
    })
  }, [applyWorkspaceResponse, shellClient, workbenchState.sessionId])

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
  }, [applyWorkspaceResponse, compositionDraft, shellClient, workbenchState.sessionId])

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
  }, [applyWorkspaceResponse, edgeLabelDraft, shellClient, workbenchState.sessionId])

  const removeGraphItems = useCallback(async (request: RemoveGraphItemsRequest) => {
    const sessionId = workbenchState.sessionId
    if (!sessionId || (request.nodeIds.length === 0 && request.edgeIds.length === 0 && request.pathIds.length === 0)) return
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
  }, [applyWorkspaceResponse, shellClient, workbenchState.sessionId])

  const setGraphViewport = useCallback(async (viewport: GraphViewport) => {
    const sessionId = workbenchState.sessionId
    if (!sessionId) return
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.set_viewport",
      args: {
        session_id: sessionId,
        viewport,
      },
    })
    applyWorkspaceResponse(response)
  }, [applyWorkspaceResponse, shellClient, workbenchState.sessionId])

  const selectGraphItems = useCallback(async (selection: WorkspaceSelectionSummary) => {
    const sessionId = workbenchState.sessionId
    if (!sessionId) return
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.select",
      args: {
        session_id: sessionId,
        selection,
      },
    })
    applyWorkspaceResponse(response)
  }, [applyWorkspaceResponse, shellClient, workbenchState.sessionId])

  const selectEnergyProfilePoint = useCallback((nodeId: string) => {
    void selectGraphItems({ node_ids: [nodeId], edge_ids: [], path_ids: [] })
  }, [selectGraphItems])

  const togglePanMode = useCallback(() => {
    setGraphEditorInteraction((current) => setGraphEditorMode(
      current,
      current.mode === "pan" ? "select" : "pan",
    ))
  }, [])

  const startConnection = useCallback(() => {
    setGraphEditorInteraction(startGraphEditorConnection)
  }, [])

  const selectGraphEdge = useCallback((edgeId: string) => {
    setGraphEditorInteraction((current) => selectGraphEditorEdge(current, edgeId))
    setEdgeLabelError(null)
    void selectGraphItems({ node_ids: [], edge_ids: [edgeId], path_ids: [] })
  }, [selectGraphItems])

  const selectGraphPath = useCallback((pathId: string, nodeIds: string[]) => {
    setGraphEditorInteraction((current) => selectGraphEditorPath(current, pathId))
    setPathOrderDraft(createGraphPathOrderDraft(pathId, nodeIds))
    void selectGraphItems({ node_ids: [], edge_ids: [], path_ids: [pathId] })
  }, [selectGraphItems])

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
  }, [applyWorkspaceResponse, pathOrderDraft, shellClient, workbenchState.sessionId])

  const selectGraphNode = useCallback(
    async (nodeId: string) => {
      const pendingConnectionFromId = graphEditorInteraction.pendingEdge?.fromNodeId
      if (pendingConnectionFromId && pendingConnectionFromId !== nodeId && workbenchState.sessionId) {
        setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
        const response = await shellClient.run<WorkspaceCommandData>({
          command: "workspace.connect",
          args: {
            session_id: workbenchState.sessionId,
            from_node_id: pendingConnectionFromId,
            to_node_id: nodeId,
          },
        })
        setGraphEditorInteraction((current) => completeGraphEditorConnection(current, nodeId))
        applyWorkspaceResponse(response)
        return
      }
      setGraphEditorInteraction((current) => selectGraphEditorNode(current, nodeId))
      const nextWorkspace = workbenchState.workspace
        ? {
          ...workbenchState.workspace,
          selection: { node_ids: [nodeId], edge_ids: [], path_ids: [] },
        }
        : undefined
      setCompositionError(null)
      setCompositionDraft(compositionDraftFromSelectedNode(nextWorkspace))
      void selectGraphItems({ node_ids: [nodeId], edge_ids: [], path_ids: [] })
    },
    [applyWorkspaceResponse, graphEditorInteraction.pendingEdge?.fromNodeId, selectGraphItems, shellClient, workbenchState.sessionId, workbenchState.workspace],
  )

  const setActiveCanvasPath = useCallback(async () => {
    const sessionId = workbenchState.sessionId
    const nodeIds = workbenchState.workspace?.graph.nodes.map((node) => node.id) ?? []
    if (!sessionId || nodeIds.length === 0) return
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.set_path",
      args: {
        session_id: sessionId,
        path_id: "path-web-main",
        node_ids: nodeIds,
        label: "Canvas path",
      },
    })
    applyWorkspaceResponse(response)
  }, [applyWorkspaceResponse, shellClient, workbenchState.sessionId, workbenchState.workspace])

  const runEnergyCompute = useCallback(async () => {
    const sessionId = workbenchState.sessionId
    const pathId = workbenchState.workspace?.active_path_id
      || energyPanelOptions.pathId
      || workbenchState.workspace?.graph.paths[0]?.id
      || ""
    const energyKey = energyPanelOptions.energyKey.trim() || "electronic"
    const correctionPolicy = correctionPolicyFromEnergyOptions(energyPanelOptions)
    if (!sessionId || !pathId) return
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<EnergyComputeData>({
      command: "energy.compute",
      args: {
        session_id: sessionId,
        path_id: pathId,
        output_unit: energyPanelOptions.outputUnit,
        include_corrections: energyPanelOptions.correctionPolicyMode !== "none",
        energy_key: energyKey,
        energy_source: energyPanelOptions.energySource,
        correction_policy: correctionPolicy,
        ...(energyPanelOptions.baselineNodeId ? { baseline_node_id: energyPanelOptions.baselineNodeId } : {}),
      },
    })

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
  }, [energyPanelOptions, shellClient, workbenchState.sessionId, workbenchState.workspace])

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

  const previewImport = useCallback(async () => {
    const payload = await importPreviewArgsFromFiles(importInboxState, workbenchState.sessionId, {
      preferInlineBytes: runtimeInfo.mode === "local-http",
    })
    if (!payload.ok) {
      setImportInboxState((current) => ({
        ...current,
        status: "error",
        selectedFiles: payload.files,
        warnings: [],
        error: payload.error,
      }))
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: [],
        error: payload.error,
      }))
      return
    }
    const args = payload.args
    const selectedFiles = await persistImportFilesAsRawInputs(
      projectRepository,
      projectSidebarStateRef.current.activeProject,
      payload.files,
    )
    setImportInboxState((current) => ({
      ...current,
      status: "previewing",
      selectedFiles,
      warnings: [],
      error: undefined,
    }))
    const response = await shellClient.run<ImportPreviewData>({
      command: "import.preview",
      args,
    })

    if (!response.ok || !response.data) {
      const error = response.error ?? shellError("invalid_input", "Import preview did not return a batch.", "import.preview")
      setImportInboxState((current) => ({
        ...current,
        status: "error",
        warnings: response.warnings,
        error,
      }))
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: response.warnings,
        error,
      }))
      return
    }

    const batch = response.data.batch
    setImportInboxState((current) => ({
      ...current,
      status: "ready",
      activeBatch: batch,
      registeredObjectIds: [],
      warnings: response.warnings,
      error: undefined,
    }))
    setWorkbenchState((current) => {
      const imports = upsertImportBatch(current.imports, batch)
      return {
        ...current,
        status: "success",
        imports,
        counts: { ...current.counts, imports: imports.length },
        warnings: response.warnings,
        error: undefined,
      }
    })
  }, [importInboxState, projectRepository, runtimeInfo.mode, shellClient, workbenchState.sessionId])

  const registerImportBatch = useCallback(async () => {
    const batchId = importInboxState.activeBatch?.id
    setImportInboxState((current) => ({
      ...current,
      status: "registering",
      warnings: [],
      error: undefined,
    }))
    const response = await shellClient.run<ImportRegisterAllData>({
      command: "import.register_all",
      args: {
        session_id: workbenchState.sessionId ?? "",
        batch_id: batchId ?? "",
      },
    })

    if (!response.ok || !response.data) {
      const error = response.error ?? shellError("invalid_input", "Import register did not return object ids.", "import.register_all")
      setImportInboxState((current) => ({
        ...current,
        status: "error",
        warnings: response.warnings,
        error,
      }))
      setWorkbenchState((current) => ({
        ...current,
        status: "error",
        warnings: response.warnings,
        error,
      }))
      return
    }

    const { batch, registered_object_ids: registeredObjectIds, objects } = response.data
    setImportInboxState((current) => ({
      ...current,
      status: "registered",
      activeBatch: batch,
      registeredObjectIds,
      warnings: response.warnings,
      error: undefined,
    }))
    setWorkbenchState((current) => {
      const imports = upsertImportBatch(current.imports, batch)
      const mergedObjects = mergeRegisteredObjects(current.objects, objects)
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
        warnings: response.warnings,
        error: undefined,
      }
    })
  }, [importInboxState.activeBatch?.id, shellClient, workbenchState.sessionId])

  return (
    <div className="workbench-shell">
      <header className="workbench-topbar">
        <div className="brand-lockup" aria-label="RxnFlow">
          <span className="brand-mark">Rf</span>
          <div>
            <p className="brand-eyebrow">{t("app.brand")}</p>
            <h1>{t("workbench.title")}</h1>
          </div>
        </div>
        <div className="topbar-status">
          <LocaleSwitcher locale={locale} onChange={setLocale} />
          <span className="local-only-badge">{t("workbench.localOnly")}</span>
          <RuntimeBadge runtimeInfo={runtimeInfo} />
          <span className={`run-state run-state--${workbenchState.status}`}>
            {statusLabel(workbenchState.status, t)}
          </span>
        </div>
      </header>

      <main className="workbench-grid" aria-label={t("workbench.aria")}>
        <ProjectSidebar
          state={projectSidebarState}
          workbenchState={workbenchState}
          exportBundleStatus={exportBundleStatus}
          importBundleStatus={importBundleStatus}
          onRefreshProjects={refreshProjectSidebar}
          onCreateProject={createSidebarProject}
          onOpenProject={openSidebarProject}
          onSaveProjectContent={saveSidebarProjectStub}
          onOpenBridgeSession={openSidebarBridgeSession}
          onSaveBridgeSession={saveSidebarBridgeSession}
          onExportBundle={exportSidebarBundle}
          onImportBundleFileSelected={importSidebarBundleFile}
        />
        <div className="workspace-column">
          <ImportInbox
            state={importInboxState}
            onFilesSelected={selectImportFiles}
            onExpectedFormatChange={changeImportExpectedFormat}
            onStrictChange={changeImportStrict}
            onPreview={previewImport}
            onRegisterAll={registerImportBatch}
            onClear={clearImportInbox}
          />
          <GraphCanvas
            state={workbenchState}
            activeObjectId={activeObjectId}
            interactionState={graphEditorInteraction}
            autoLayoutStatus={autoLayoutStatus}
            pathOrderDraft={pathOrderDraft}
            edgeLabelDraft={edgeLabelDraft}
            edgeLabelPending={edgeLabelPending}
            edgeLabelError={edgeLabelError}
            compositionDraft={compositionDraft}
            compositionPending={compositionPending}
            compositionError={compositionError}
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
            onOpenWorkspace={openWorkspace}
            onAddObjectNode={addObjectNode}
            onMoveNode={moveGraphNode}
            onApplyAutoLayout={applyGraphAutoLayout}
            onRemoveGraphItems={removeGraphItems}
            onSetViewport={setGraphViewport}
            onTogglePanMode={togglePanMode}
            onStartConnection={startConnection}
            onSetActivePath={setActiveCanvasPath}
            onCompositionDraftRowChange={updateNodeCompositionDraft}
            onAddCompositionDraftRow={addNodeCompositionDraftRow}
            onRemoveCompositionDraftRow={removeNodeCompositionDraftRow}
            onResetCompositionDraft={resetNodeCompositionDraft}
            onApplyCompositionDraft={applyNodeCompositionDraft}
          />
        </div>
        <InspectorPanel
          state={workbenchState}
          activeObjectId={activeObjectId}
          hasActiveBrowserProject={Boolean(projectSidebarState.activeProject)}
          correctionPending={correctionPending}
          correctionError={correctionError}
          energyPanelOptions={energyPanelOptions}
          reportExportOptions={reportExportOptions}
          onSelectObject={setActiveObjectId}
          onApplyCorrection={applyCorrection}
          onEnergyOptionsChange={setEnergyPanelOptions}
          onReportExportOptionsChange={setReportExportOptions}
          onRunEnergyCompute={runEnergyCompute}
          onRunReportExport={runReportExport}
          onRunFixture={runFixture}
          onRunInvalidCommand={runInvalidCommand}
          onSelectEnergyProfilePoint={selectEnergyProfilePoint}
        />
      </main>
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

type StateProps = {
  state: WorkbenchDomainState
}

type InspectorPanelProps = {
  state: WorkbenchDomainState
  activeObjectId?: string
  hasActiveBrowserProject: boolean
  correctionPending: boolean
  correctionError: ShellError | null
  energyPanelOptions: EnergyPanelOptions
  reportExportOptions: ReportExportOptions
  onSelectObject: (objectId: string) => void
  onApplyCorrection: (request: ApplyCorrectionRequest) => void
  onEnergyOptionsChange: (options: EnergyPanelOptions) => void
  onReportExportOptionsChange: (options: ReportExportOptions) => void
  onRunEnergyCompute: () => void
  onRunReportExport: () => void
  onRunFixture: () => void
  onRunInvalidCommand: () => void
  onSelectEnergyProfilePoint: (nodeId: string) => void
}

function InspectorPanel({
  state,
  activeObjectId,
  hasActiveBrowserProject,
  correctionPending,
  correctionError,
  energyPanelOptions,
  reportExportOptions,
  onSelectObject,
  onApplyCorrection,
  onEnergyOptionsChange,
  onReportExportOptionsChange,
  onRunEnergyCompute,
  onRunReportExport,
  onRunFixture,
  onRunInvalidCommand,
  onSelectEnergyProfilePoint,
}: InspectorPanelProps) {
  const { t } = useI18n()

  return (
    <aside className="inspector-panel" aria-label="Command and profile inspector">
      <ObjectRegistryPanel
        objects={state.objects}
        activeObjectId={activeObjectId}
        correctionPending={correctionPending}
        correctionError={correctionError}
        onSelectObject={onSelectObject}
        onApplyCorrection={onApplyCorrection}
      />

      <section className="command-panel">
        <p className="section-kicker">{t("workbench.command.section")}</p>
        <div className="command-actions">
          <button type="button" className="command-button" onClick={onRunFixture}>
            <Play size={17} />
            <span>{t("workbench.command.fixtureRun")}</span>
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onRunInvalidCommand}
            title={t("workbench.command.invalid")}
            aria-label={t("workbench.command.invalid")}
          >
            <AlertTriangle size={17} />
          </button>
        </div>
      </section>

      <EnergyProfilePanel
        profile={state.profile}
        workspace={state.workspace}
        objects={state.objects}
        options={energyPanelOptions}
        disabled={!state.sessionId || !energyPanelOptions.pathId && !state.workspace?.active_path_id && !state.workspace?.graph.paths[0]?.id}
        warnings={state.warnings}
        selectedNodeId={state.workspace?.selection?.node_ids[0] ?? null}
        onOptionsChange={onEnergyOptionsChange}
        onCompute={onRunEnergyCompute}
        onSelectProfilePoint={onSelectEnergyProfilePoint}
      />

      <ReportExportPanel
        artifacts={state.artifacts}
        profile={state.profile}
        options={reportExportOptions}
        disabled={!state.sessionId || !state.profile}
        warnings={state.warnings}
        hasActiveBrowserProject={Boolean(state.sessionId && hasActiveBrowserProject)}
        onOptionsChange={onReportExportOptionsChange}
        onExport={onRunReportExport}
      />

      <section className="inspector-section">
        <p className="section-kicker">{t("workbench.commandStatus.section")}</p>
        <CommandStatusPanel state={state} />
      </section>
    </aside>
  )
}

function CommandStatusPanel({ state }: StateProps) {
  const { t } = useI18n()

  if (state.error) {
    return (
      <div className="status-box status-box--error" role="alert">
        <strong>{state.error.code}</strong>
        <span>{state.error.message}</span>
        {state.error.target ? <small>{state.error.target}</small> : null}
      </div>
    )
  }

  return (
    <div className="status-box">
      <strong>{statusLabel(state.status, t)}</strong>
      <span>{t("workbench.commandStatus.artifacts", { count: state.counts.artifacts })}</span>
    </div>
  )
}

type Translate = ReturnType<typeof useI18n>["t"]

function statusLabel(status: CommandStatus, t: Translate): string {
  if (status === "running") return t("workbench.status.running")
  if (status === "success") return t("workbench.status.ready")
  if (status === "error") return t("workbench.status.error")
  return t("workbench.status.idle")
}

function RuntimeBadge({ runtimeInfo }: { runtimeInfo: ShellRuntimeInfo }) {
  const { t } = useI18n()
  const label = runtimeInfo.mode === "local-http"
    ? t("workbench.runtime.localHttp")
    : t("workbench.runtime.fixture")
  const title = runtimeInfo.endpoint
    ? t("workbench.runtime.endpoint", { endpoint: runtimeInfo.endpoint })
    : t("workbench.runtime.transport", { transport: runtimeInfo.transportKind })

  return (
    <span className={`runtime-badge runtime-badge--${runtimeInfo.mode}`} title={title}>
      {label}
    </span>
  )
}

function triggerBrowserBundleDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  try {
    link.href = url
    link.download = fileName
    link.rel = "noopener"
    link.style.display = "none"
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    URL.revokeObjectURL(url)
  }
}

type LocaleSwitcherProps = {
  locale: SupportedLocale
  onChange: (locale: SupportedLocale) => void
}

function LocaleSwitcher({ locale, onChange }: LocaleSwitcherProps) {
  const { t } = useI18n()

  return (
    <label className="locale-switcher">
      <span>{t("locale.label")}</span>
      <select
        value={locale}
        onChange={(event) => onChange(event.currentTarget.value as SupportedLocale)}
      >
        <option value="zh-CN">{t("locale.zhCN")}</option>
        <option value="en-US">{t("locale.enUS")}</option>
      </select>
    </label>
  )
}
