import type {
  EnergyProfileSummary,
  ImportBatchSummary,
  ObjectSummary,
  ProjectSummary,
  ShellError,
  ShellResponse,
  ShellWarning,
  WorkbenchArtifactSummary,
  WorkbenchCounts,
  WorkbenchSnapshotData,
  WorkspaceSummary,
} from "../shell"

export type CommandStatus = "idle" | "running" | "success" | "error"

export type {
  EnergyProfileSummary,
  ImportBatchSummary,
  ObjectSummary,
  ProjectSummary,
  WorkbenchArtifactSummary,
  WorkbenchCounts,
  WorkbenchSnapshotData,
  WorkspaceSummary,
} from "../shell"

export type WorkbenchDomainState = {
  status: CommandStatus
  sessionId?: string
  project?: ProjectSummary
  projectPath?: string
  active: {
    workspaceId?: string
    graphId?: string
    profileId?: string
  }
  counts: WorkbenchCounts
  objects: ObjectSummary[]
  imports: ImportBatchSummary[]
  workspace?: WorkspaceSummary
  profile?: EnergyProfileSummary
  artifacts: WorkbenchArtifactSummary[]
  warnings: ShellWarning[]
  error?: ShellError
}

export type WorkbenchUiState = {
  activePanel: "project" | "import" | "objects" | "graph" | "energy" | "export"
  pendingCommandIds: string[]
}

export const initialWorkbenchDomainState: WorkbenchDomainState = {
  status: "idle",
  active: {},
  counts: {
    objects: 0,
    imports: 0,
    graphs: 0,
    workspaces: 0,
    profiles: 0,
    artifacts: 0,
  },
  objects: [],
  imports: [],
  artifacts: [],
  warnings: [],
}

export const initialWorkbenchUiState: WorkbenchUiState = {
  activePanel: "project",
  pendingCommandIds: [],
}

export function projectWorkbenchSnapshot(
  response: ShellResponse<WorkbenchSnapshotData>,
): WorkbenchDomainState {
  if (!response.ok || !response.data) {
    return {
      ...initialWorkbenchDomainState,
      status: "error",
      warnings: response.warnings,
      error: response.error ?? {
        code: "invalid_input",
        message: "Shell command did not return workbench snapshot data.",
        target: "workbench.snapshot",
      },
    }
  }

  const data = response.data
  const warnings = data.warnings.length > 0 ? data.warnings : response.warnings
  return {
    status: "success",
    sessionId: data.session_id,
    project: data.project ?? undefined,
    projectPath: data.project_path ?? undefined,
    active: {
      workspaceId: data.active.workspace_id ?? data.workspace_id ?? undefined,
      graphId: data.active.graph_id ?? data.graph_id ?? undefined,
      profileId: data.active.profile_id ?? data.profile_id ?? undefined,
    },
    counts: data.counts,
    objects: data.objects,
    imports: data.imports,
    workspace: data.workspace ?? undefined,
    profile: data.profile ?? undefined,
    artifacts: data.artifacts,
    warnings,
    error: undefined,
  }
}
