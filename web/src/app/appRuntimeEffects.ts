import type {
  ProjectSummary,
  RxnFlowProjectCanvas,
  SourceFile,
} from "../domain/projectPackages"
import type { SourceParseResult } from "../domain/sourceParsers"
import { downloadText } from "./browserDownloads"
import {
  browserPreviewEngineStatus,
  engineStatusFailure,
  type DesktopEngineStatus,
} from "./desktopRuntime"
import type {
  DesktopPreferences,
  SourceOpenerProfile,
} from "./desktopPreferences"
import type {
  DesktopImportSourceFilesPayload,
  DesktopImportSourceFilesResponse,
  DesktopImportRegistrationPayload,
  DesktopImportRegistrationResponse,
  DesktopSourceFile,
} from "./importRegistration"
import {
  projectPackageOpenRuntimeTransition,
  projectPackageArchiveDefaultName,
  projectPackageSaveRuntimeTransition,
  serializeProjectPackage,
  type ProjectValidationPayload,
} from "./projectPackageWorkflow"

export type RxnflowDesktopApi = {
  platform: string
  chooseFiles: () => Promise<{ canceled: boolean; files: DesktopSourceFile[] }>
  getEngineStatus: () => Promise<DesktopEngineStatus>
  importSourceFiles?: (payload: DesktopImportSourceFilesPayload) => Promise<DesktopImportSourceFilesResponse>
  showImportIssues?: (payload: {
    title: string
    entries: Array<{
      fileName: string
      code: string
      message: string
    }>
  }) => Promise<{ ok: boolean; shown?: boolean }>
  filePathForFile?: (file: File) => string
  registerImportCandidates?: (payload: DesktopImportRegistrationPayload) => Promise<DesktopImportRegistrationResponse>
  parseSourcePreview?: (payload: {
    projectId?: string
    name: string
    size?: number
    preview?: string
    storedPath?: string
    sourcePath?: string
  }) => Promise<{ ok: boolean; data?: { parse?: SourceParseResult | null }; error?: { code: string; message: string } }>
  saveJsonSnapshot: (payload: { defaultName: string; content: string }) => Promise<{ canceled: boolean; filePath?: string }>
  saveReportArtifact: (payload: {
    defaultName: string
    mimeType: string
    encoding: "utf8" | "base64"
    content: string
  }) => Promise<{ canceled: boolean; filePath?: string }>
  createProjectFolder?: (payload: {
    projectLabel: string
    defaultName: string
    content: string
  }) => Promise<ProjectPackageSaveResult>
  openProjectPackage: () => Promise<ProjectPackageOpenResult>
  getStartupProjectContent?: () => Promise<ProjectPackageOpenResult>
  saveProjectPackage: (payload: { defaultName: string; content: string }) => Promise<ProjectPackageSaveResult>
  autosaveProjectPackage?: (payload: { defaultName: string; content: string }) => Promise<ProjectPackageSaveResult>
  setActiveProject?: (payload: {
    projectId: string
    projectDirectory?: string | null
  }) => Promise<{ ok: boolean; projectDirectory?: string | null }>
  forgetProject?: (payload: { projectId: string }) => Promise<{ ok: boolean; projectDirectory?: string | null }>
  openSourceFile?: (payload: {
    projectId?: string
    storedPath?: string
    sourcePath?: string
    name?: string
    sourceKind?: string
    parserId?: string | null
  }) => Promise<{ ok: boolean; filePath?: string; appPath?: string; profile?: SourceOpenerProfile; canceled?: boolean; error?: string }>
  getPreferences?: () => Promise<{ ok: boolean; preferences?: DesktopPreferences; error?: string }>
  setPreferences?: (patch: Partial<DesktopPreferences>) => Promise<{ ok: boolean; preferences?: DesktopPreferences; error?: string }>
  chooseExternalApp?: (payload: { profile: SourceOpenerProfile }) => Promise<{
    canceled: boolean
    appPath?: string
    label?: string
    preferences?: DesktopPreferences
  }>
  readChemicalClipboard?: () => Promise<{
    ok: boolean
    formats: string[]
    text?: string
    html?: string
    payloads?: Array<{ format: string; text: string }>
    error?: string
  }>
  writeChemicalClipboard?: (payload: {
    cdxml?: string
    cdx?: string
    molfile?: string
    ket?: string
    text?: string
  }) => Promise<{
    ok: boolean
    formats: string[]
    error?: string
  }>
  getWindowState?: () => Promise<{ isFullScreen: boolean; isMaximized: boolean }>
  onWindowStateChanged?: (callback: (state: { isFullScreen: boolean; isMaximized: boolean }) => void) => () => void
  onPreferencesChanged?: (callback: (preferences: DesktopPreferences) => void) => () => void
  onMenuImportFiles: (callback: () => void) => () => void
  onMenuOpenProject: (callback: () => void) => () => void
  onMenuSaveProject: (callback: () => void) => () => void
  onOpenProjectContent: (callback: (payload: ProjectPackageOpenPayload) => void) => () => void
}

declare global {
  interface Window {
    rxnflowDesktop?: RxnflowDesktopApi
  }
}

export type ProjectPackageSaveResult = {
  canceled: boolean
  filePath?: string
  projectDirectory?: string | null
  content?: string
  validation?: ProjectValidationPayload | null
}

export type ProjectPackageOpenPayload = {
  content: string
  filePath?: string
  projectDirectory?: string | null
  validation?: ProjectValidationPayload | null
  replaceProjects?: boolean
  source?: string
}

export type ProjectPackageOpenResult = {
  canceled: boolean
  content?: string
  projectContents?: ProjectPackageOpenPayload[]
  filePath?: string
  projectDirectory?: string | null
  validation?: ProjectValidationPayload | null
  replaceProjects?: boolean
  source?: string
}

export type RestoreProjectPackageOptions = {
  replaceProjects?: boolean
  projectDirectory?: string | null
}

export type RestoreProjectPackageHandler = (
  content: string,
  validation?: ProjectValidationPayload | null,
  options?: RestoreProjectPackageOptions,
) => void

export async function openProjectPackageFromRuntime({
  desktopApi,
  projectInput,
  restoreProjectPackage,
}: {
  desktopApi: RxnflowDesktopApi | undefined
  projectInput: HTMLInputElement | null
  restoreProjectPackage: RestoreProjectPackageHandler
}): Promise<void> {
  const transition = projectPackageOpenRuntimeTransition(Boolean(desktopApi?.openProjectPackage))
  if (transition.shouldOpenBrowserPicker) {
    projectInput?.click()
    return
  }
  const result = await desktopApi?.openProjectPackage()
  if (!result || result.canceled || !result.content) return
  restoreProjectPackage(result.content, result.validation, {
    replaceProjects: result.replaceProjects ?? Boolean(result.projectDirectory),
    projectDirectory: result.projectDirectory,
  })
}

export async function saveProjectPackageToRuntime({
  desktopApi,
  project,
  files,
  canvases,
  activeCanvasId,
  setProjectValidation,
}: {
  desktopApi: RxnflowDesktopApi | undefined
  project: ProjectSummary
  files: SourceFile[]
  canvases: RxnFlowProjectCanvas[]
  activeCanvasId: string
  setProjectValidation: (validation: ProjectValidationPayload | null) => void
}): Promise<ProjectPackageSaveResult | null> {
  const transition = projectPackageSaveRuntimeTransition(Boolean(desktopApi))
  const { content, defaultName } = serializeProjectPackage({
    project,
    files,
    canvases,
    activeCanvasId,
  }, transition.runtime)
  if (transition.shouldSaveDesktop) {
    const result = await desktopApi?.saveProjectPackage({
      defaultName: projectPackageArchiveDefaultName(project.label),
      content,
    })
    if (result && !result.canceled) setProjectValidation(result.validation ?? null)
    return result ?? null
  }
  if (transition.shouldDownloadBrowser) downloadText(defaultName, content, "application/json")
  setProjectValidation(null)
  return null
}

export async function autosaveProjectPackageToRuntime({
  desktopApi,
  project,
  files,
  canvases,
  activeCanvasId,
  setProjectValidation,
}: {
  desktopApi: RxnflowDesktopApi | undefined
  project: ProjectSummary
  files: SourceFile[]
  canvases: RxnFlowProjectCanvas[]
  activeCanvasId: string
  setProjectValidation: (validation: ProjectValidationPayload | null) => void
}): Promise<ProjectPackageSaveResult | null> {
  if (!desktopApi?.autosaveProjectPackage) return null
  const { content, defaultName } = serializeProjectPackage({
    project,
    files,
    canvases,
    activeCanvasId,
  }, "desktop")
  const result = await desktopApi.autosaveProjectPackage({ defaultName, content })
  if (!result.canceled) setProjectValidation(result.validation ?? null)
  return result
}

export function subscribeProjectPackageRuntimeMenus({
  desktopApi,
  openProjectPackage,
  saveProjectPackage,
  restoreProjectPackage,
}: {
  desktopApi: RxnflowDesktopApi | undefined
  openProjectPackage: () => void
  saveProjectPackage: () => void
  restoreProjectPackage: RestoreProjectPackageHandler
}): () => void {
  const disposers = [
    desktopApi?.onMenuOpenProject?.(openProjectPackage),
    desktopApi?.onMenuSaveProject?.(saveProjectPackage),
    desktopApi?.onOpenProjectContent?.((payload) => {
      restoreProjectPackage(payload.content, payload.validation, {
        replaceProjects: payload.replaceProjects,
        projectDirectory: payload.projectDirectory,
      })
    }),
  ].filter((dispose): dispose is () => void => typeof dispose === "function")
  return () => {
    disposers.forEach((dispose) => dispose())
  }
}

export function restoreStartupProjectFromRuntime({
  desktopApi,
  restoreProjectPackage,
  onSettled,
}: {
  desktopApi: RxnflowDesktopApi | undefined
  restoreProjectPackage: RestoreProjectPackageHandler
  onSettled?: () => void
}): () => void {
  let canceled = false
  const settle = () => {
    if (!canceled) onSettled?.()
  }
  if (!desktopApi?.getStartupProjectContent) return () => {
    canceled = true
  }

  void desktopApi.getStartupProjectContent().then((result) => {
    if (canceled || !result || result.canceled) return
    const payloads = result.content
      ? [result as ProjectPackageOpenPayload]
      : Array.isArray(result.projectContents)
        ? result.projectContents
        : []
    payloads.filter((payload) => payload?.content).forEach((payload, index) => {
      restoreProjectPackage(payload.content, payload.validation, {
        replaceProjects: payload.replaceProjects ?? index === 0,
        projectDirectory: payload.projectDirectory,
      })
    })
  }).catch(() => {
    // Startup restore is best-effort. Invalid recent workspaces are pruned by the main process.
  }).finally(() => {
    settle()
  })

  return () => {
    canceled = true
  }
}

export function setActiveProjectInRuntime({
  desktopApi,
  projectId,
  projectDirectory,
}: {
  desktopApi: RxnflowDesktopApi | undefined
  projectId: string
  projectDirectory?: string | null
}): void {
  if (!desktopApi?.setActiveProject || !projectId) return
  void desktopApi.setActiveProject({ projectId, projectDirectory }).catch(() => {
    // Active workspace persistence is best-effort; autosave still protects the project data.
  })
}

export function forgetProjectInRuntime({
  desktopApi,
  projectId,
}: {
  desktopApi: RxnflowDesktopApi | undefined
  projectId: string
}): void {
  if (!desktopApi?.forgetProject || !projectId) return
  void desktopApi.forgetProject({ projectId }).catch(() => {
    // Removing a project from the desktop recent store is best-effort.
  })
}

export function watchDesktopEngineStatus({
  desktopApi,
  setEngineStatus,
}: {
  desktopApi: RxnflowDesktopApi | undefined
  setEngineStatus: (status: DesktopEngineStatus | null) => void
}): () => void {
  let canceled = false
  if (!desktopApi?.getEngineStatus) {
    setEngineStatus(browserPreviewEngineStatus())
    return () => {
      canceled = true
    }
  }

  setEngineStatus(null)
  void desktopApi.getEngineStatus().then((status) => {
    if (!canceled) setEngineStatus(status)
  }).catch((error: unknown) => {
    if (canceled) return
    setEngineStatus(engineStatusFailure(error))
  })

  return () => {
    canceled = true
  }
}
