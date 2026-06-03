import {
  BrowserProjectRepositoryError,
  validateBrowserProjectRef,
  type BrowserProjectRef,
  type BrowserProjectRepository,
  type BrowserWriteReceipt,
} from "../repository"
import {
  createEmptyProjectContentFiles,
  ensureEmptyProjectContent,
  projectContentIndexPath,
  validateBrowserProjectContent,
  writeProjectContentFiles,
  type BrowserProjectContentFile,
} from "./projectContentBridge"
import {
  initialProjectSidebarState,
  projectSidebarErrorPayload,
  projectSidebarErrorValidation,
  projectSidebarBridgeValidation,
  projectSidebarMissingValidation,
  projectSidebarValidValidation,
  type ProjectSidebarState,
} from "./projectSidebarState"
import { listProjectFileEntries, type ProjectFileEntry } from "./projectFiles"

export async function refreshProjects(
  repository: BrowserProjectRepository,
  state: ProjectSidebarState = initialProjectSidebarState,
): Promise<ProjectSidebarState> {
  try {
    const projects = await repository.listProjects()
    const activeProject = findProject(projects, state.activeProjectRef)
    const projectFiles = await listProjectFileEntries(repository, activeProject)
    return readyProjectSidebarState(state, projects, projectFiles)
  } catch (error) {
    return repositoryErrorProjectSidebarState(state, error)
  }
}

export async function createProject(
  repository: BrowserProjectRepository,
  state: ProjectSidebarState,
  name: string,
): Promise<ProjectSidebarState> {
  try {
    const project = await repository.createProject({ name })
    const contentFiles = await createEmptyProjectContentFiles(project)
    const receipts = await writeProjectContentFiles(repository, project.projectRef, contentFiles)
    const projects = await repository.listProjects()
    const activeProject = findProject(projects, project.projectRef) ?? project
    const indexReceipt = receiptForPath(receipts, projectContentIndexPath)
    const projectFiles = await listProjectFileEntries(repository, activeProject)

    return {
      status: "ready",
      projects,
      activeProjectRef: activeProject.projectRef,
      activeProject,
      persistence: "persisted",
      bridge: { state: "idle" },
      projectFiles,
      validation: projectSidebarValidValidation(indexReceipt.checksum, indexReceipt.updatedAt),
      lastWrite: indexReceipt,
    }
  } catch (error) {
    return repositoryErrorProjectSidebarState(state, error)
  }
}

export async function openProject(
  repository: BrowserProjectRepository,
  state: ProjectSidebarState,
  projectRef: string,
): Promise<ProjectSidebarState> {
  try {
    const safeProjectRef = validateBrowserProjectRef(projectRef)
    const projects = await repository.listProjects()
    const activeProject = findProject(projects, safeProjectRef)
    if (!activeProject) {
      throw new BrowserProjectRepositoryError({
        code: "invalid_input",
        message: "Browser local project is not listed.",
        target: "project_ref",
        details: { project_ref: safeProjectRef },
      })
    }

    try {
      const validation = await validateBrowserProjectContent(repository, safeProjectRef)
      const projectFiles = await listProjectFileEntries(repository, activeProject)
      return {
        status: "ready",
        projects,
        activeProjectRef: activeProject.projectRef,
        activeProject,
        persistence: validation.state === "valid" ? "persisted" : validation.state === "missing" ? "dirty" : "error",
        bridge: { state: "idle" },
        projectFiles,
        validation: projectSidebarBridgeValidation(validation),
      }
    } catch (error) {
      if (error instanceof BrowserProjectRepositoryError && error.code === "object_not_found") {
        return {
          status: "ready",
          projects,
          activeProjectRef: activeProject.projectRef,
          activeProject,
          persistence: "dirty",
          bridge: { state: "idle" },
          projectFiles: await listProjectFileEntries(repository, activeProject),
          validation: projectSidebarMissingValidation(),
        }
      }
      return repositoryErrorProjectSidebarState(
        {
          ...state,
          projects,
          activeProjectRef: activeProject.projectRef,
          activeProject,
        },
        error,
      )
    }
  } catch (error) {
    return repositoryErrorProjectSidebarState(state, error)
  }
}

export async function saveProjectContent(
  repository: BrowserProjectRepository,
  state: ProjectSidebarState,
  files?: BrowserProjectContentFile[],
): Promise<ProjectSidebarState> {
  try {
    const activeProject = state.activeProject ?? findProject(state.projects, state.activeProjectRef)
    if (!activeProject) {
      throw new BrowserProjectRepositoryError({
        code: "invalid_input",
        message: "Active browser project is required before saving project content.",
        target: "active_project",
      })
    }

    const receipts = files
      ? await writeProjectContentFiles(repository, activeProject.projectRef, files)
      : await ensureEmptyProjectContent(repository, activeProject)
    const projects = await repository.listProjects()
    const refreshedActiveProject = findProject(projects, activeProject.projectRef) ?? activeProject
    const indexReceipt = receiptForPath(receipts, projectContentIndexPath)
    const projectFiles = await listProjectFileEntries(repository, refreshedActiveProject)

    return {
      status: "ready",
      projects,
      activeProjectRef: refreshedActiveProject.projectRef,
      activeProject: refreshedActiveProject,
      persistence: "persisted",
      bridge: state.bridge,
      projectFiles,
      validation: projectSidebarValidValidation(indexReceipt.checksum, indexReceipt.updatedAt),
      lastWrite: indexReceipt,
    }
  } catch (error) {
    return repositoryErrorProjectSidebarState(state, error)
  }
}

function readyProjectSidebarState(
  state: ProjectSidebarState,
  projects: BrowserProjectRef[],
  projectFiles: ProjectFileEntry[],
): ProjectSidebarState {
  const activeProject = findProject(projects, state.activeProjectRef)
  if (!activeProject) {
    return {
      status: "ready",
      projects,
      persistence: "empty",
      bridge: { state: "idle" },
      projectFiles: [],
      validation: initialProjectSidebarState.validation,
    }
  }

  return {
    ...state,
    status: "ready",
    projects,
    activeProjectRef: activeProject.projectRef,
    activeProject,
    bridge: state.bridge,
    projectFiles,
    error: undefined,
  }
}

function repositoryErrorProjectSidebarState(
  state: ProjectSidebarState,
  error: unknown,
): ProjectSidebarState {
  if (!(error instanceof BrowserProjectRepositoryError)) {
    throw error
  }

  const payload = projectSidebarErrorPayload(error)
  return {
    ...state,
    status: "error",
    persistence: "error",
    validation: projectSidebarErrorValidation(payload),
    error: payload,
  }
}

function receiptForPath(
  receipts: BrowserWriteReceipt[],
  path: string,
): BrowserWriteReceipt {
  return receipts.find((receipt) => receipt.path === path) ?? receipts[receipts.length - 1]
}

function findProject(
  projects: BrowserProjectRef[],
  projectRef: string | undefined,
): BrowserProjectRef | undefined {
  if (!projectRef) {
    return undefined
  }
  return projects.find((project) => project.projectRef === projectRef)
}
