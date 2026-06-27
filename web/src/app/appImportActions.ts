import type { CanvasViewport, ProjectSummary, SourceFile } from "../domain/projectPackages"
import type { WorkbenchViewMode, ProjectWorkspaceSnapshot } from "./projectWorkspace"
import {
  activeCanvasSnapshot,
  emptyProjectWorkspace,
  projectWorkspaceSnapshot,
  saveAndActivateProjectWorkspaceTransition,
} from "./projectWorkspace"
import type { CanvasRawFileDrop } from "./CanvasWorkspace"
import {
  browserImportSourceFilesFromFiles,
  canvasRawFileDropImportTransition,
  candidateReviewEntriesForMode,
  candidateReviewRegistrationApplyTransition,
  candidateReviewTransitionForSourceFile,
  desktopImportFilesTransition,
  importLayoutFromCanvas,
  importPickerTransition,
  prepareProjectWorkspaceImport,
  projectWorkspaceImportApplyTransition,
  registeredOrFallbackNodesFromEntries,
  toggleCandidateReviewSelection,
  type CandidateReviewState,
  type DesktopImportRegistrationPayload,
  type DesktopImportRegistrationResponse,
  type ImportSourceFile,
  type StageSourceFilesOptions,
} from "./importRegistration"
import { applyImportedWorkspaceSnapshotState, type ProjectWorkspaceStateSetters, type ProjectTransitionApplication } from "./appStateAppliers"

export type RegisterImportCandidates = ((payload: DesktopImportRegistrationPayload) => Promise<DesktopImportRegistrationResponse>) | undefined

export async function stageCurrentProjectSourceFilesAction({
  importedFiles,
  options = {},
  canvas,
  viewport,
  currentSnapshot,
  viewMode,
  registerImportCandidates,
  appStateSetters,
  pushEditHistory,
  setCandidateReview,
}: {
  importedFiles: ImportSourceFile[]
  options?: StageSourceFilesOptions
  canvas: HTMLDivElement | null
  viewport: CanvasViewport
  currentSnapshot: ProjectWorkspaceSnapshot
  viewMode: WorkbenchViewMode
  registerImportCandidates: RegisterImportCandidates
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: () => void
  setCandidateReview: (review: CandidateReviewState | null) => void
}): Promise<void> {
  if (importedFiles.length === 0) return
  const importLayout = options.layout ?? importLayoutFromCanvas(canvas, viewport)
  const fileMode = options.fileMode ?? "prepend"
  const autoRegister = options.autoRegister ?? true
  const prepared = await prepareProjectWorkspaceImport({
    targetSnapshot: currentSnapshot,
    importedFiles,
    layout: importLayout,
    options: { fileMode, viewMode, registerImportCandidates, autoRegister },
  })
  if (!prepared) return
  const transition = projectWorkspaceImportApplyTransition(prepared)
  if (transition.reviewState) setCandidateReview(transition.reviewState)
  if (transition.shouldPushEditHistory) pushEditHistory()
  applyImportedWorkspaceSnapshotState(appStateSetters, {
    snapshot: transition.snapshot,
    keyboardEdgeSourceId: transition.keyboardEdgeSourceId,
  })
}

export async function stageSourceFilesForProjectAction({
  projectId,
  importedFiles,
  options = {},
  activeProjectId,
  projects,
  workspaces,
  currentSnapshot,
  emptyViewport,
  canvas,
  registerImportCandidates,
  stageCurrentProjectSourceFiles,
  applyProjectTransition,
  setCandidateReview,
}: {
  projectId: string
  importedFiles: ImportSourceFile[]
  options?: StageSourceFilesOptions
  activeProjectId: string
  projects: ProjectSummary[]
  workspaces: Record<string, ProjectWorkspaceSnapshot>
  currentSnapshot: ProjectWorkspaceSnapshot
  emptyViewport: CanvasViewport
  canvas: HTMLDivElement | null
  registerImportCandidates: RegisterImportCandidates
  stageCurrentProjectSourceFiles: (importedFiles: ImportSourceFile[], options?: StageSourceFilesOptions) => Promise<void>
  applyProjectTransition: (transition: ProjectTransitionApplication) => void
  setCandidateReview: (review: CandidateReviewState | null) => void
}): Promise<void> {
  if (projectId === activeProjectId) {
    await stageCurrentProjectSourceFiles(importedFiles, options)
    return
  }
  if (importedFiles.length === 0 || !projects.some((project) => project.id === projectId)) return

  const targetSnapshot = workspaces[projectId]
    ? projectWorkspaceSnapshot(workspaces[projectId])
    : emptyProjectWorkspace(emptyViewport)
  const targetCanvas = activeCanvasSnapshot(targetSnapshot)
  const prepared = await prepareProjectWorkspaceImport({
    targetSnapshot,
    importedFiles,
    layout: importLayoutFromCanvas(canvas, targetCanvas.viewport),
    options: { registerImportCandidates, autoRegister: options.autoRegister ?? true },
  })
  if (!prepared) return
  const transition = saveAndActivateProjectWorkspaceTransition({
    workspaces,
    activeProjectId,
    targetProjectId: projectId,
    currentSnapshot,
    targetSnapshot: prepared.snapshot,
  })
  applyProjectTransition({ ...transition, validation: null })
  if (prepared.reviewState) setCandidateReview(prepared.reviewState)
}

export function reviewCandidatesForFileAction({
  files,
  fileId,
  canvas,
  viewport,
  appStateSetters,
  setCandidateReview,
}: {
  files: SourceFile[]
  fileId: string
  canvas: HTMLDivElement | null
  viewport: CanvasViewport
  appStateSetters: ProjectWorkspaceStateSetters
  setCandidateReview: (review: CandidateReviewState | null) => void
}): void {
  const file = files.find((item) => item.id === fileId)
  const transition = candidateReviewTransitionForSourceFile(file, importLayoutFromCanvas(canvas, viewport))
  if (!transition) return
  appStateSetters.setSelectedFileId(transition.selection.selectedFileId)
  appStateSetters.setSelectedFileIds(transition.selection.selectedFileIds)
  appStateSetters.setLastSelectedFileId(transition.selection.lastSelectedFileId)
  appStateSetters.setSelectedEdgeIds(transition.selection.selectedEdgeIds)
  appStateSetters.setSelectedBarrierIds(transition.selection.selectedBarrierIds)
  appStateSetters.setKeyboardEdgeSourceId(null)
  appStateSetters.setInspectorMode("inspector")
  setCandidateReview(transition.reviewState)
}

export function toggleCandidateReviewSelectionAction(
  current: CandidateReviewState | null,
  key: string,
): CandidateReviewState | null {
  return toggleCandidateReviewSelection(current, key)
}

export async function registerCandidateReviewAction({
  mode,
  candidateReview,
  candidateRegisterBusy,
  registerImportCandidates,
  currentSnapshot,
  appStateSetters,
  pushEditHistory,
  setCandidateRegisterBusy,
}: {
  mode: "selected" | "all"
  candidateReview: CandidateReviewState | null
  candidateRegisterBusy: boolean
  registerImportCandidates: RegisterImportCandidates
  currentSnapshot: ProjectWorkspaceSnapshot
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: () => void
  setCandidateRegisterBusy: (busy: boolean) => void
}): Promise<void> {
  if (!candidateReview || candidateRegisterBusy) return
  const entries = candidateReviewEntriesForMode(candidateReview, mode)
  if (entries.length === 0) return
  setCandidateRegisterBusy(true)
  try {
    const createdNodes = await registeredOrFallbackNodesFromEntries(
      registerImportCandidates,
      entries,
      mode,
      candidateReview.layout,
    )
    const transition = candidateReviewRegistrationApplyTransition(currentSnapshot, createdNodes)
    if (transition.shouldPushEditHistory) pushEditHistory()
    applyImportedWorkspaceSnapshotState(appStateSetters, {
      snapshot: transition.snapshot,
      keyboardEdgeSourceId: transition.keyboardEdgeSourceId,
      candidateReview: transition.candidateReview,
    })
  } finally {
    setCandidateRegisterBusy(false)
  }
}

export async function importFilesForProjectAction({
  fileList,
  projectId,
  stageSourceFilesForProject,
}: {
  fileList: FileList | File[]
  projectId: string
  stageSourceFilesForProject: (projectId: string, importedFiles: ImportSourceFile[], options?: StageSourceFilesOptions) => Promise<void>
}): Promise<void> {
  const importedFiles = await browserImportSourceFilesFromFiles(fileList)
  await stageSourceFilesForProject(projectId, importedFiles, { autoRegister: false })
}

export async function handleCanvasRawFileDropAction({
  drop,
  files,
  stageCurrentProjectSourceFiles,
}: {
  drop: CanvasRawFileDrop
  files: SourceFile[]
  stageCurrentProjectSourceFiles: (importedFiles: ImportSourceFile[], options?: StageSourceFilesOptions) => Promise<void>
}): Promise<void> {
  const transition = canvasRawFileDropImportTransition(drop, files)
  if (!transition) return
  if (transition.kind === "external-files") {
    const importedFiles = await browserImportSourceFilesFromFiles(transition.files, transition.idPrefix)
    await stageCurrentProjectSourceFiles(importedFiles, transition.options)
    return
  }
  await stageCurrentProjectSourceFiles(transition.files, transition.options)
}

export async function importDesktopFilesAction({
  projectId,
  chooseFiles,
  stageSourceFilesForProject,
}: {
  projectId: string
  chooseFiles: (() => Promise<Parameters<typeof desktopImportFilesTransition>[0]>) | undefined
  stageSourceFilesForProject: (projectId: string, importedFiles: ImportSourceFile[], options?: StageSourceFilesOptions) => Promise<void>
}): Promise<void> {
  const transition = desktopImportFilesTransition(await chooseFiles?.())
  if (!transition) return
  await stageSourceFilesForProject(projectId, transition.importedFiles, { autoRegister: false })
}

export function openImportPickerAction({
  projectId,
  hasDesktopRuntime,
  setPendingImportProjectId,
  importDesktopFiles,
  openBrowserPicker,
}: {
  projectId: string
  hasDesktopRuntime: boolean
  setPendingImportProjectId: (projectId: string | null) => void
  importDesktopFiles: (projectId: string) => void
  openBrowserPicker: () => void
}): void {
  const transition = importPickerTransition(projectId, hasDesktopRuntime)
  setPendingImportProjectId(transition.pendingImportProjectId)
  if (transition.shouldImportDesktop) {
    importDesktopFiles(transition.projectId)
    return
  }
  if (transition.shouldOpenBrowserPicker) openBrowserPicker()
}
