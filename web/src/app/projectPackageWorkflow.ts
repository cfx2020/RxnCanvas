import {
  buildProjectPackage,
  normalizeProjectFilesForPersistence,
  parseProjectPackage,
  safeProjectFileStem,
  type ProjectSummary,
  type RxnFlowProjectCanvas,
  type SourceFile,
} from "../domain/projectPackages"
import {
  projectWorkspaceFromPackage,
  saveAndActivateProjectWorkspaceTransition,
  type ProjectWorkspaceSnapshot,
  type ProjectWorkspaceTransition,
} from "./projectWorkspace"

export type ProjectValidationPayload = {
  valid: boolean
  summary: Record<string, unknown>
  issues: ProjectValidationIssue[]
}

export type ProjectValidationIssue = {
  severity: "error" | "warning"
  code: string
  message: string
}

export type ProjectPackageRuntime = "desktop" | "browser"

export type ProjectPackageSerializationInput = {
  project: ProjectSummary
  files: SourceFile[]
  canvases: RxnFlowProjectCanvas[]
  activeCanvasId: string
}

export type SerializedProjectPackage = {
  defaultName: string
  content: string
}

export type ProjectPackageOpenRuntimeTransition = {
  shouldOpenDesktop: boolean
  shouldOpenBrowserPicker: boolean
}

export type ProjectPackageSaveRuntimeTransition = {
  runtime: ProjectPackageRuntime
  shouldSaveDesktop: boolean
  shouldDownloadBrowser: boolean
}

export type ProjectPackageRestoreResult =
  | {
      ok: true
      project: ProjectSummary
      snapshot: ProjectWorkspaceSnapshot
      validation: ProjectValidationPayload | null
    }
  | {
      ok: false
      validation: ProjectValidationPayload
    }

export type ProjectPackageRestoreTransition =
  | ({
      ok: true
      projects: ProjectSummary[]
      validation: ProjectValidationPayload | null
    } & ProjectWorkspaceTransition)
  | {
      ok: false
      validation: ProjectValidationPayload
    }

const builtInDemoProjectIds = new Set(["diels-alder", "nickel", "ir-screening"])

export function serializeProjectPackage(
  input: ProjectPackageSerializationInput,
  runtime: ProjectPackageRuntime,
): SerializedProjectPackage {
  const projectPackage = buildProjectPackage(
    input.project,
    input.files,
    input.canvases,
    { activeCanvasId: input.activeCanvasId },
  )
  return {
    defaultName: projectPackageDefaultName(input.project.label, runtime),
    content: `${JSON.stringify(projectPackage)}\n`,
  }
}

export function projectPackageFilesForPersistence(files: SourceFile[]): SourceFile[] {
  return normalizeProjectFilesForPersistence(files)
}

export function projectPackageDefaultName(projectLabel: string, runtime: ProjectPackageRuntime): string {
  return `${safeProjectFileStem(projectLabel)}${runtime === "desktop" ? ".rxnflow" : ".rxnflow.json"}`
}

export function projectPackageArchiveDefaultName(projectLabel: string): string {
  return `${safeProjectFileStem(projectLabel)}.rxnflow.zip`
}

export function projectPackageOpenRuntimeTransition(hasDesktopOpen: boolean): ProjectPackageOpenRuntimeTransition {
  return {
    shouldOpenDesktop: hasDesktopOpen,
    shouldOpenBrowserPicker: !hasDesktopOpen,
  }
}

export function projectPackageSaveRuntimeTransition(hasDesktopSave: boolean): ProjectPackageSaveRuntimeTransition {
  return {
    runtime: hasDesktopSave ? "desktop" : "browser",
    shouldSaveDesktop: hasDesktopSave,
    shouldDownloadBrowser: !hasDesktopSave,
  }
}

export function projectPackageRestoreFromContent(
  content: string,
  validation?: ProjectValidationPayload | null,
): ProjectPackageRestoreResult {
  const projectPackage = parseProjectPackage(content)
  if (!projectPackage) {
    return {
      ok: false,
      validation: validation ?? invalidProjectPackageValidation(),
    }
  }

  return {
    ok: true,
    project: { ...projectPackage.project, meta: "open" },
    snapshot: projectWorkspaceFromPackage(projectPackage),
    validation: validation ?? null,
  }
}

export function projectPackageRestoreTransitionFromContent({
  content,
  validation,
  projects,
  workspaces,
  activeProjectId,
  currentSnapshot,
  replaceProjects,
}: {
  content: string
  validation?: ProjectValidationPayload | null
  projects: ProjectSummary[]
  workspaces: Record<string, ProjectWorkspaceSnapshot>
  activeProjectId: string
  currentSnapshot: ProjectWorkspaceSnapshot
  replaceProjects?: boolean
}): ProjectPackageRestoreTransition {
  const restoredProject = projectPackageRestoreFromContent(content, validation)
  if (!restoredProject.ok) {
    return {
      ok: false,
      validation: restoredProject.validation,
    }
  }

  const transition = saveAndActivateProjectWorkspaceTransition({
    workspaces,
    activeProjectId,
    targetProjectId: restoredProject.project.id,
    currentSnapshot,
    targetSnapshot: restoredProject.snapshot,
  })

  if (replaceProjects) {
    const retainedProjects = projects.filter((project) =>
      project.id !== restoredProject.project.id && !builtInDemoProjectIds.has(project.id),
    )
    const retainedProjectIds = new Set([restoredProject.project.id, ...retainedProjects.map((project) => project.id)])
    return {
      ok: true,
      projects: [
        restoredProject.project,
        ...retainedProjects,
      ],
      workspaces: Object.fromEntries(
        Object.entries(transition.workspaces).filter(([projectId]) => retainedProjectIds.has(projectId)),
      ),
      activeProjectId: transition.activeProjectId,
      activeSnapshot: transition.activeSnapshot,
      validation: restoredProject.validation,
    }
  }

  return {
    ok: true,
    projects: [
      restoredProject.project,
      ...projects.filter((project) => project.id !== restoredProject.project.id),
    ],
    validation: restoredProject.validation,
    ...transition,
  }
}

export function invalidProjectPackageValidation(): ProjectValidationPayload {
  return {
    valid: false,
    summary: {},
    issues: [{
      severity: "error",
      code: "invalid_project_package",
      message: "The selected file is not a readable RxnFlow project package.",
    }],
  }
}
