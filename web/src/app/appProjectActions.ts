import type { CanvasViewport, ProjectSummary } from "../domain/projectPackages"
import {
  createLocalProjectWorkspaceTransition,
  deleteLocalProjectWorkspaceTransition,
  emptyProjectWorkspace,
  switchProjectWorkspaceTransition,
  type ProjectWorkspaceSnapshot,
} from "./projectWorkspace"
import type { ProjectTransitionApplication } from "./appStateAppliers"

export type DeleteProjectAction =
  | { kind: "none" }
  | { kind: "activate"; transition: ProjectTransitionApplication }
  | { kind: "delete-inactive"; projects: ProjectSummary[]; workspaces: Record<string, ProjectWorkspaceSnapshot> }

export function createProjectAction({
  projects,
  workspaces,
  activeProjectId,
  currentSnapshot,
  emptyViewport,
  projectLabel,
  now,
}: {
  projects: ProjectSummary[]
  workspaces: Record<string, ProjectWorkspaceSnapshot>
  activeProjectId: string
  currentSnapshot: ProjectWorkspaceSnapshot
  emptyViewport: CanvasViewport
  projectLabel?: string
  now: number
}): ProjectTransitionApplication & { project: ProjectSummary } {
  return {
    ...createLocalProjectWorkspaceTransition({
      projects,
      workspaces,
      activeProjectId,
      currentSnapshot,
      nextSnapshot: emptyProjectWorkspace(emptyViewport),
      projectLabel,
      now,
    }),
    validation: null,
  }
}

export function openProjectAction({
  workspaces,
  activeProjectId,
  targetProjectId,
  currentSnapshot,
  emptyViewport,
}: {
  workspaces: Record<string, ProjectWorkspaceSnapshot>
  activeProjectId: string
  targetProjectId: string
  currentSnapshot: ProjectWorkspaceSnapshot
  emptyViewport: CanvasViewport
}): ProjectTransitionApplication | null {
  const transition = switchProjectWorkspaceTransition({
    workspaces,
    activeProjectId,
    targetProjectId,
    currentSnapshot,
    fallbackSnapshot: emptyProjectWorkspace(emptyViewport),
  })
  return transition ? { ...transition, validation: null } : null
}

export function deleteProjectAction({
  projects,
  workspaces,
  activeProjectId,
  deletedProjectId,
  currentSnapshot,
  emptyViewport,
  now,
}: {
  projects: ProjectSummary[]
  workspaces: Record<string, ProjectWorkspaceSnapshot>
  activeProjectId: string
  deletedProjectId: string
  currentSnapshot: ProjectWorkspaceSnapshot
  emptyViewport: CanvasViewport
  now: number
}): DeleteProjectAction {
  const transition = deleteLocalProjectWorkspaceTransition({
    projects,
    workspaces,
    activeProjectId,
    deletedProjectId,
    currentSnapshot,
    fallbackSnapshot: emptyProjectWorkspace(emptyViewport),
    now,
  })
  if (!transition) return { kind: "none" }
  if (transition.activeChanged) return { kind: "activate", transition: { ...transition, validation: null } }
  return { kind: "delete-inactive", projects: transition.projects, workspaces: transition.workspaces }
}
