import type { FixtureRunData, ShellError, ShellResponse, ShellWarning } from "../shell"

export type CommandStatus = "idle" | "running" | "success" | "error"

export type WorkbenchShellState = {
  status: CommandStatus
  sessionId?: string
  projectId?: string
  projectName?: string
  graphId?: string
  profileId?: string
  profilePointCount: number
  objectCount: number
  artifactCount: number
  warnings: ShellWarning[]
  error?: ShellError
}

export const initialWorkbenchShellState: WorkbenchShellState = {
  status: "idle",
  profilePointCount: 0,
  objectCount: 0,
  artifactCount: 0,
  warnings: [],
}

export function projectFixtureResponse(
  response: ShellResponse<FixtureRunData>,
): WorkbenchShellState {
  if (!response.ok || !response.data) {
    return {
      ...initialWorkbenchShellState,
      status: "error",
      warnings: response.warnings,
      error: response.error ?? {
        code: "invalid_input",
        message: "Shell command did not return fixture data.",
        target: "fixture.run",
      },
    }
  }

  return {
    status: "success",
    sessionId: response.data.session_id,
    projectId: response.data.project.id,
    projectName: response.data.project.name,
    graphId: response.data.graph.id,
    profileId: response.data.profile.id,
    profilePointCount: response.data.profile.point_count,
    objectCount: response.data.object_count,
    artifactCount: response.data.artifact_count,
    warnings: response.warnings,
    error: undefined,
  }
}
