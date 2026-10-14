import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { ArrowDownAZ, Check, FilePlus2, Filter, Folder, FolderMinus, FolderOpen, FolderPlus, MoreHorizontal, Plus, Search, Settings2, Trash2, UploadCloud } from "lucide-react"
import type { ProjectSummary, SourceFile } from "../domain/projectPackages"
import type { CanvasTabState } from "./projectCanvasState"
import {
  dataTransferHasFiles,
  filesFromDataTransfer,
  projectFileDragMimeType,
  projectFileDragPath,
  sourceFileHasPendingDesktopParse,
  sourceFileParseIssue,
  sourceFileLooksLikeParsedSolutionLog,
  sourceFileGroupsForDisplay,
  type SourceFileGroup,
  type SourceFilePairStatus,
} from "./fileDisplay"

const FILE_CONTEXT_MENU_WIDTH = 212
const FILE_CONTEXT_MENU_HEIGHT = 68
const PROJECT_REGION_SHARE_STORAGE_KEY = "rxncanvas-project-rail-project-share"
const DEFAULT_PROJECT_REGION_SHARE = 0.35
const MIN_PROJECT_REGION_SHARE = 0.18
const MAX_PROJECT_REGION_SHARE = 0.72

type FileFilterMode = "all" | "ready" | "attention" | "missing-pair" | "parse-error" | "parsing"
type FileSortMode = "project" | "name" | "kind" | "status"
type FileToolMode = "search" | "filter" | "sort"

function clampProjectRegionShare(value: number): number {
  return Math.round(Math.min(MAX_PROJECT_REGION_SHARE, Math.max(MIN_PROJECT_REGION_SHARE, value)) * 100) / 100
}

function initialProjectRegionShare(): number {
  if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") {
    return DEFAULT_PROJECT_REGION_SHARE
  }
  const storedValue = window.localStorage.getItem(PROJECT_REGION_SHARE_STORAGE_KEY)
  if (storedValue === null) return DEFAULT_PROJECT_REGION_SHARE
  const storedShare = Number(storedValue)
  return Number.isFinite(storedShare) ? clampProjectRegionShare(storedShare) : DEFAULT_PROJECT_REGION_SHARE
}

export type FileSelectionOptions = {
  additive?: boolean
  range?: boolean
}

export const ProjectRail = memo(function ProjectRail({
  projects,
  activeProjectId,
  files,
  selectedFileId,
  selectedFileIds,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onOpenProjectPackage,
  onImportFiles,
  onDropProjectFiles,
  onSelectFile,
  onDeleteFiles,
  canvases = [],
  activeCanvasId,
  onSelectCanvas,
  onCreateCanvas,
  onDeleteCanvas,
  onOpenSettings,
  width,
  minWidth,
  maxWidth,
  onResizePointerDown,
  onResizeStep,
  onCompactMouseEnter,
  onCompactMouseLeave,
}: {
  projects: ProjectSummary[]
  activeProjectId: string
  files: SourceFile[]
  selectedFileId: string | null
  selectedFileIds: string[]
  onCreateProject: (label?: string) => boolean | void | Promise<boolean | void>
  onOpenProject: (projectId: string) => void
  onDeleteProject: (projectId: string) => void
  onOpenProjectPackage: () => void | Promise<void>
  onImportFiles: (projectId?: string) => void
  onDropProjectFiles: (projectId: string, files: File[]) => void
  onSelectFile: (fileId: string, options?: FileSelectionOptions) => void
  onDeleteFiles: (fileIds: string[]) => void
  canvases?: CanvasTabState[]
  activeCanvasId?: string
  onSelectCanvas?: (canvasId: string) => void
  onCreateCanvas?: (projectId?: string) => void
  onDeleteCanvas?: (canvasId: string) => void
  onOpenSettings?: (trigger: HTMLButtonElement) => void
  width?: number
  minWidth?: number
  maxWidth?: number
  onResizePointerDown?: (event: PointerEvent<HTMLElement>) => void
  onResizeStep?: (nextWidth: number) => void
  onCompactMouseEnter?: () => void
  onCompactMouseLeave?: () => void
}) {
  const [projectCreatorOpen, setProjectCreatorOpen] = useState(false)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState("")
  const [projectCreateBusy, setProjectCreateBusy] = useState(false)
  const [projectActionId, setProjectActionId] = useState<string | null>(null)
  const [canvasActionId, setCanvasActionId] = useState<string | null>(null)
  const [deleteConfirmProjectId, setDeleteConfirmProjectId] = useState<string | null>(null)
  const [fileContextMenu, setFileContextMenu] = useState<FileContextMenuState | null>(null)
  const [fileToolOpen, setFileToolOpen] = useState<FileToolMode | null>(null)
  const [projectRegionShare, setProjectRegionShare] = useState(initialProjectRegionShare)
  const railRef = useRef<HTMLElement | null>(null)
  const fileContextMenuRef = useRef<HTMLDivElement | null>(null)
  const fileToolsPanelRef = useRef<HTMLDivElement | null>(null)
  const selectedFileSet = useMemo(() => new Set(selectedFileIds), [selectedFileIds])
  const fileGroups = useMemo(() => sourceFileGroupsForDisplay(files), [files])
  const [fileSearchQuery, setFileSearchQuery] = useState("")
  const [fileFilterMode, setFileFilterMode] = useState<FileFilterMode>("all")
  const [fileSortMode, setFileSortMode] = useState<FileSortMode>("project")
  const visibleFileGroups = useMemo(() => {
    const query = normalizedFileSearchQuery(fileSearchQuery)
    return fileGroups
      .filter((group) => sourceFileGroupMatchesFilter(group, fileFilterMode))
      .filter((group) => sourceFileGroupMatchesQuery(group, query))
      .sort((left, right) => sourceFileGroupCompare(left, right, fileSortMode))
  }, [fileFilterMode, fileGroups, fileSearchQuery, fileSortMode])
  const selectedFileGroupFiles = useMemo(() => fileGroups
    .filter((group) => group.files.some((file) => selectedFileSet.has(file.id)))
    .flatMap((group) => group.files), [fileGroups, selectedFileSet])
  const railStyle = useMemo(() => ({
    "--rxncanvas-project-region-share": `${Math.round(projectRegionShare * 100)}%`,
  } as CSSProperties), [projectRegionShare])

  useEffect(() => {
    if (typeof window.localStorage?.setItem !== "function") return
    window.localStorage.setItem(PROJECT_REGION_SHARE_STORAGE_KEY, String(projectRegionShare))
  }, [projectRegionShare])

  useEffect(() => {
    const projectIds = new Set(projects.map((project) => project.id))
    const canvasIds = new Set(canvases.map((canvas) => canvas.id))
    if (projectActionId && !projectIds.has(projectActionId)) setProjectActionId(null)
    if (canvasActionId && !canvasIds.has(canvasActionId)) setCanvasActionId(null)
    if (deleteConfirmProjectId && !projectIds.has(deleteConfirmProjectId)) setDeleteConfirmProjectId(null)
    if (fileContextMenu && !fileContextMenu.fileIds.some((fileId) => files.some((file) => file.id === fileId))) {
      setFileContextMenu(null)
    }
  }, [canvasActionId, canvases, deleteConfirmProjectId, fileContextMenu, files, projectActionId, projects])

  useEffect(() => {
    if (!workspaceMenuOpen && !projectCreatorOpen && !projectActionId && !canvasActionId && !deleteConfirmProjectId && !fileContextMenu && !fileToolOpen) return

    const closeTransientUi = () => {
      setWorkspaceMenuOpen(false)
      setProjectActionId(null)
      setCanvasActionId(null)
      setDeleteConfirmProjectId(null)
      setFileContextMenu(null)
      setFileToolOpen(null)
      if (projectCreatorOpen) closeProjectCreator()
    }
    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (fileContextMenuRef.current?.contains(target)) return
      if (fileContextMenu) setFileContextMenu(null)
      if (fileToolsPanelRef.current?.contains(target)) return
      if (target instanceof Element && target.closest("[data-file-tool-trigger]")) return
      if (fileToolOpen) setFileToolOpen(null)
      if (railRef.current?.contains(target)) return
      closeTransientUi()
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeTransientUi()
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer, true)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [canvasActionId, deleteConfirmProjectId, fileContextMenu, fileToolOpen, projectActionId, projectCreatorOpen, workspaceMenuOpen])

  const openFileContextMenu = (group: SourceFileGroup, event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setWorkspaceMenuOpen(false)
    setProjectActionId(null)
    setCanvasActionId(null)
    setDeleteConfirmProjectId(null)
    setFileToolOpen(null)

    const groupIsSelected = group.files.some((file) => selectedFileSet.has(file.id))
    const actionFiles = groupIsSelected && selectedFileGroupFiles.length > 0 ? selectedFileGroupFiles : group.files
    if (!groupIsSelected) onSelectFile(group.primaryFile.id)

    const width = typeof window === "undefined" ? 1024 : window.innerWidth
    const height = typeof window === "undefined" ? 768 : window.innerHeight
    const x = Math.max(8, Math.min(event.clientX, width - FILE_CONTEXT_MENU_WIDTH - 8))
    const y = Math.max(8, Math.min(event.clientY, height - FILE_CONTEXT_MENU_HEIGHT - 8))
    const fileIds = Array.from(new Set(actionFiles.map((file) => file.id)))
    setFileContextMenu({
      x,
      y,
      fileIds,
      label: fileIds.length === 1 ? group.displayName : `${fileIds.length} files`,
    })
  }

  const submitProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = onCreateProject(projectNameDraft)
    if (isPromiseLike(result)) {
      setProjectCreateBusy(true)
      void result.then((created) => {
        if (created !== false) closeProjectCreator()
      }).finally(() => setProjectCreateBusy(false))
      return
    }
    if (result !== false) closeProjectCreator()
  }

  const resizeSidebarFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (!onResizeStep || typeof width !== "number") return
    if (event.key === "ArrowRight") {
      event.preventDefault()
      onResizeStep(width + 12)
    } else if (event.key === "ArrowLeft") {
      event.preventDefault()
      onResizeStep(width - 12)
    } else if (event.key === "Home" && typeof minWidth === "number") {
      event.preventDefault()
      onResizeStep(minWidth)
    } else if (event.key === "End" && typeof maxWidth === "number") {
      event.preventDefault()
      onResizeStep(maxWidth)
    }
  }

  const resizeProjectRegionsFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setProjectRegionShare((current) => clampProjectRegionShare(current + 0.04))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setProjectRegionShare((current) => clampProjectRegionShare(current - 0.04))
    } else if (event.key === "Home") {
      event.preventDefault()
      setProjectRegionShare(MIN_PROJECT_REGION_SHARE)
    } else if (event.key === "End") {
      event.preventDefault()
      setProjectRegionShare(MAX_PROJECT_REGION_SHARE)
    }
  }

  const startProjectRegionResize = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const rail = railRef.current
    const projectsRegion = rail?.querySelector<HTMLElement>(".project-rail-region-projects")
    const filesRegion = rail?.querySelector<HTMLElement>(".project-rail-region-files")
    if (!rail || !projectsRegion || !filesRegion) return

    event.preventDefault()
    const startY = event.clientY
    const startProjectHeight = projectsRegion.getBoundingClientRect().height
    const totalRegionHeight = startProjectHeight + filesRegion.getBoundingClientRect().height
    const minimumProjectHeight = 74
    const maximumProjectHeight = Math.max(minimumProjectHeight, totalRegionHeight - 96)
    const railStyles = window.getComputedStyle(rail)
    const railContentHeight = Math.max(
      1,
      rail.clientHeight - Number.parseFloat(railStyles.paddingTop) - Number.parseFloat(railStyles.paddingBottom),
    )

    document.body.classList.add("is-resizing-project-rail-sections")
    const moveProjectRegion = (moveEvent: globalThis.PointerEvent) => {
      const nextHeight = Math.min(
        maximumProjectHeight,
        Math.max(minimumProjectHeight, startProjectHeight + moveEvent.clientY - startY),
      )
      setProjectRegionShare(clampProjectRegionShare(nextHeight / railContentHeight))
    }
    const stopProjectRegionResize = () => {
      document.body.classList.remove("is-resizing-project-rail-sections")
      window.removeEventListener("pointermove", moveProjectRegion)
      window.removeEventListener("pointerup", stopProjectRegionResize)
      window.removeEventListener("pointercancel", stopProjectRegionResize)
    }
    window.addEventListener("pointermove", moveProjectRegion)
    window.addEventListener("pointerup", stopProjectRegionResize)
    window.addEventListener("pointercancel", stopProjectRegionResize)
  }

  return (
    <>
      <aside
        className="project-rail"
        aria-label="Project rail"
        ref={railRef}
        style={railStyle}
        onMouseEnter={onCompactMouseEnter}
        onMouseLeave={onCompactMouseLeave}
      >
        <div className="project-rail-region project-rail-region-projects">
          <RailSection
            title="Projects"
            actionLabel="Workspace actions"
            actionIcon={<Plus size={16} />}
            actionExpanded={workspaceMenuOpen}
            onAction={() => {
              setFileToolOpen(null)
              setWorkspaceMenuOpen((current) => !current)
            }}
          >
            {workspaceMenuOpen ? (
              <div className="workspace-action-menu" role="menu" aria-label="Workspace actions">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setWorkspaceMenuOpen(false)
                    setProjectCreatorOpen(true)
                  }}
                >
                  <FolderPlus size={15} />
                  <span>New blank project</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setWorkspaceMenuOpen(false)
                    void onOpenProjectPackage()
                  }}
                >
                  <FolderOpen size={15} />
                  <span>Use existing folder</span>
                </button>
              </div>
            ) : null}
            {projectCreatorOpen ? (
              <form className="project-create-form" aria-label="Create project" onSubmit={submitProject}>
                <label>
                  <span>Project folder name</span>
                  <input
                    aria-label="Project name"
                    value={projectNameDraft}
                    placeholder="Catalyst Screen"
                    onChange={(event) => setProjectNameDraft(event.target.value)}
                  />
                </label>
                <div>
                  <button type="submit" disabled={projectCreateBusy}>{projectCreateBusy ? "Creating…" : "Create Folder"}</button>
                  <button type="button" onClick={() => {
                    closeProjectCreator()
                  }} disabled={projectCreateBusy}>
                    Cancel
                  </button>
                </div>
                <p>Defaults to Documents in the desktop folder picker.</p>
              </form>
            ) : null}
            {projects.map((project) => {
              const active = project.id === activeProjectId
              return (
                <div key={project.id} className="project-rail-project-group">
                  <ProjectRailItem
                    project={project}
                    active={active}
                    menuOpen={projectActionId === project.id}
                    confirmOpen={deleteConfirmProjectId === project.id}
                    onOpen={() => {
                      setProjectActionId(null)
                      setCanvasActionId(null)
                      setDeleteConfirmProjectId(null)
                      onOpenProject(project.id)
                    }}
                    onToggleMenu={() => {
                      setCanvasActionId(null)
                      setDeleteConfirmProjectId(null)
                      setProjectActionId((current) => current === project.id ? null : project.id)
                    }}
                    onCreateCanvas={() => {
                      setProjectActionId(null)
                      setCanvasActionId(null)
                      setDeleteConfirmProjectId(null)
                      onCreateCanvas?.(project.id)
                    }}
                    onDropFiles={(droppedFiles) => {
                      setProjectActionId(null)
                      setCanvasActionId(null)
                      setDeleteConfirmProjectId(null)
                      onDropProjectFiles(project.id, droppedFiles)
                    }}
                    onRequestDelete={() => {
                      setProjectActionId(null)
                      setCanvasActionId(null)
                      setDeleteConfirmProjectId(project.id)
                    }}
                    onCancelDelete={() => setDeleteConfirmProjectId(null)}
                    onConfirmDelete={() => {
                      setDeleteConfirmProjectId(null)
                      onDeleteProject(project.id)
                    }}
                  />
                  {active && canvases.length > 1 ? (
                    <div className="project-canvas-list" aria-label={`${project.label} canvases`}>
                      {canvases.map((canvas) => (
                        <span
                          key={canvas.id}
                          className={`project-canvas-row-shell${canvas.id === activeCanvasId ? " is-active" : ""}${canvasActionId === canvas.id ? " has-open-actions" : ""}`}
                        >
                          <button
                            type="button"
                            className="project-canvas-row"
                            aria-current={canvas.id === activeCanvasId ? "true" : undefined}
                            onClick={() => {
                              setProjectActionId(null)
                              setCanvasActionId(null)
                              setDeleteConfirmProjectId(null)
                              onSelectCanvas?.(canvas.id)
                            }}
                          >
                            <span>{canvas.label}</span>
                          </button>
                          <button
                            type="button"
                            className="project-canvas-more"
                            aria-label={`Canvas actions for ${canvas.label}`}
                            aria-haspopup="menu"
                            aria-expanded={canvasActionId === canvas.id}
                            title={`Canvas actions for ${canvas.label}`}
                            onClick={() => {
                              setProjectActionId(null)
                              setDeleteConfirmProjectId(null)
                              setCanvasActionId((current) => current === canvas.id ? null : canvas.id)
                            }}
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          {canvasActionId === canvas.id ? (
                            <span className="project-canvas-action-menu" role="menu" aria-label={`Actions for ${canvas.label}`}>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setCanvasActionId(null)
                                  onDeleteCanvas?.(canvas.id)
                                }}
                              >
                                <Trash2 size={14} />
                                <span>Delete canvas</span>
                              </button>
                            </span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </RailSection>

        </div>

        <div
          className="project-rail-section-resizer"
          role="separator"
          aria-label="Resize Projects and Files panels"
          aria-orientation="horizontal"
          aria-valuemin={Math.round(MIN_PROJECT_REGION_SHARE * 100)}
          aria-valuemax={Math.round(MAX_PROJECT_REGION_SHARE * 100)}
          aria-valuenow={Math.round(projectRegionShare * 100)}
          tabIndex={0}
          title="Drag to resize Projects and Files"
          onDoubleClick={() => setProjectRegionShare(DEFAULT_PROJECT_REGION_SHARE)}
          onPointerDown={startProjectRegionResize}
          onKeyDown={resizeProjectRegionsFromKeyboard}
        />

        <div className="project-rail-region project-rail-region-files">
          <RailSection
            title="Files"
            onDropFiles={(droppedFiles) => onDropProjectFiles(activeProjectId, droppedFiles)}
            headingActions={(
              <>
                <button
                  type="button"
                  className={fileSearchQuery.length > 0 ? "has-active-filter" : undefined}
                  data-file-tool-trigger
                  aria-label="Search files"
                  aria-expanded={fileToolOpen === "search"}
                  aria-controls="file-search-tool"
                  title="Search files"
                  onClick={() => {
                    setWorkspaceMenuOpen(false)
                    setFileToolOpen((current) => current === "search" ? null : "search")
                  }}
                >
                  <Search size={14} />
                </button>
                <button
                  type="button"
                  className={fileFilterMode !== "all" ? "has-active-filter" : undefined}
                  data-file-tool-trigger
                  aria-label="Filter files"
                  aria-expanded={fileToolOpen === "filter"}
                  aria-controls="file-filter-tool"
                  title="Filter files"
                  onClick={() => {
                    setWorkspaceMenuOpen(false)
                    setFileToolOpen((current) => current === "filter" ? null : "filter")
                  }}
                >
                  <Filter size={14} />
                </button>
                <button
                  type="button"
                  className={fileSortMode !== "project" ? "has-active-filter" : undefined}
                  data-file-tool-trigger
                  aria-label="Sort files"
                  aria-expanded={fileToolOpen === "sort"}
                  aria-controls="file-sort-tool"
                  title="Sort files"
                  onClick={() => {
                    setWorkspaceMenuOpen(false)
                    setFileToolOpen((current) => current === "sort" ? null : "sort")
                  }}
                >
                  <ArrowDownAZ size={14} />
                </button>
                <button
                  type="button"
                  aria-label="Import files"
                  title="Import files"
                  onClick={() => {
                    setFileToolOpen(null)
                    onImportFiles(activeProjectId)
                  }}
                >
                  <UploadCloud size={15} />
                </button>
              </>
            )}
            toolbar={fileToolOpen ? (
              <div
                ref={fileToolsPanelRef}
                id={`file-${fileToolOpen}-tool`}
                className={`source-browser-popover source-browser-popover--${fileToolOpen}`}
              >
                {fileToolOpen === "search" ? (
                  <label className="source-browser-search">
                    <Search size={13} aria-hidden="true" />
                    <input
                      type="search"
                      aria-label="Search files"
                      value={fileSearchQuery}
                      placeholder="Search files"
                      autoFocus
                      onChange={(event) => setFileSearchQuery(event.target.value)}
                    />
                    <span>{visibleFileGroups.length}/{fileGroups.length}</span>
                  </label>
                ) : fileToolOpen === "filter" ? (
                  <FileFilterMenu
                    groups={fileGroups}
                    filterMode={fileFilterMode}
                    onSelect={(mode) => {
                      setFileFilterMode(mode)
                      setFileToolOpen(null)
                    }}
                  />
                ) : (
                  <FileSortMenu
                    sortMode={fileSortMode}
                    onSelect={(mode) => {
                      setFileSortMode(mode)
                      setFileToolOpen(null)
                    }}
                  />
                )}
              </div>
            ) : null}
          >
            {files.length === 0 ? (
              <p className="rail-empty">No local files</p>
            ) : visibleFileGroups.length === 0 ? (
              <p className="rail-empty">No matching files</p>
            ) : visibleFileGroups.map((group) => (
              <ProjectFileRow
                key={group.id}
                group={group}
                active={group.files.some((file) => file.id === selectedFileId)}
                selected={group.files.some((file) => selectedFileSet.has(file.id))}
                selectedGroupFiles={selectedFileGroupFiles}
                onSelect={onSelectFile}
                onOpenContextMenu={openFileContextMenu}
              />
            ))}
          </RailSection>
        </div>

        {onOpenSettings ? (
          <div className="project-rail-footer">
            <button
              type="button"
              className="project-rail-settings"
              aria-label="Settings"
              title="Settings"
              onClick={(event) => onOpenSettings(event.currentTarget)}
            >
              <Settings2 size={15} aria-hidden="true" />
              <span>Settings</span>
            </button>
          </div>
        ) : null}
        {onResizePointerDown ? (
          <div
            className="project-rail-resize-handle"
            role="separator"
            aria-label="Resize project sidebar"
            aria-orientation="vertical"
            aria-valuemin={minWidth}
            aria-valuemax={maxWidth}
            aria-valuenow={width}
            tabIndex={0}
            title="Drag to resize project sidebar"
            onPointerDown={onResizePointerDown}
            onKeyDown={resizeSidebarFromKeyboard}
          />
        ) : null}
      </aside>
      {fileContextMenu && typeof document !== "undefined" ? createPortal(
        <div
          ref={fileContextMenuRef}
          className="canvas-context-menu project-file-context-menu"
          role="menu"
          aria-label={`File actions for ${fileContextMenu.label}`}
          style={{ left: fileContextMenu.x, top: fileContextMenu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onClick={() => {
              const fileIds = fileContextMenu.fileIds
              setFileContextMenu(null)
              onDeleteFiles(fileIds)
            }}
          >
            <Trash2 size={14} aria-hidden="true" />
            <span>Delete file and nodes</span>
          </button>
        </div>,
        document.body,
      ) : null}
    </>
  )

  function closeProjectCreator() {
    setProjectNameDraft("")
    setProjectCreatorOpen(false)
  }
})

type FileContextMenuState = {
  x: number
  y: number
  fileIds: string[]
  label: string
}

function isPromiseLike(value: unknown): value is Promise<boolean | void> {
  return Boolean(value && typeof (value as Promise<boolean | void>).then === "function")
}

function ProjectRailItem({
  project,
  active,
  menuOpen,
  confirmOpen,
  onOpen,
  onToggleMenu,
  onCreateCanvas,
  onDropFiles,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  project: ProjectSummary
  active: boolean
  menuOpen: boolean
  confirmOpen: boolean
  onOpen: () => void
  onToggleMenu: () => void
  onCreateCanvas: () => void
  onDropFiles: (files: File[]) => void
  onRequestDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const actionButtonRef = useRef<HTMLButtonElement | null>(null)
  const cancelDeleteButtonRef = useRef<HTMLButtonElement | null>(null)
  const confirmDeleteButtonRef = useRef<HTMLButtonElement | null>(null)
  const restoreActionFocusRef = useRef(false)

  useEffect(() => {
    if (confirmOpen) {
      restoreActionFocusRef.current = false
      cancelDeleteButtonRef.current?.focus({ preventScroll: true })
      return
    }
    if (!restoreActionFocusRef.current) return
    restoreActionFocusRef.current = false
    actionButtonRef.current?.focus({ preventScroll: true })
  }, [confirmOpen])

  const cancelDelete = () => {
    restoreActionFocusRef.current = true
    onCancelDelete()
  }

  const acceptDroppedFiles = (event: DragEvent<HTMLDivElement>) => {
    if (!dataTransferHasFiles(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }

  const importDroppedFiles = (event: DragEvent<HTMLDivElement>) => {
    const droppedFiles = filesFromDataTransfer(event.dataTransfer)
    if (droppedFiles.length === 0) return
    event.preventDefault()
    onDropFiles(droppedFiles)
  }

  return (
    <div
      className={`project-rail-item${active ? " is-active" : ""}${menuOpen || confirmOpen ? " has-open-actions" : ""}`}
      onDragOver={acceptDroppedFiles}
      onDrop={importDroppedFiles}
    >
      <button
        type="button"
        className="project-rail-main"
        aria-label={`${project.label} ${project.meta}`}
        aria-current={active ? "true" : undefined}
        onClick={onOpen}
      >
        <Folder size={15} />
        <span>{project.label}</span>
      </button>
      <button
        ref={actionButtonRef}
        type="button"
        className="project-rail-action"
        aria-label={`Project actions for ${project.label}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="Project actions"
        onClick={onToggleMenu}
      >
        <MoreHorizontal size={15} />
      </button>
      {menuOpen ? (
        <div className="project-action-menu" role="menu" aria-label={`Project actions for ${project.label}`}>
          <button type="button" role="menuitem" className="is-neutral" onClick={onCreateCanvas}>
            <Plus size={14} />
            <span>New canvas</span>
          </button>
          <button type="button" role="menuitem" className="is-danger" onClick={onRequestDelete}>
            <FolderMinus size={14} />
            <span>Remove from sidebar</span>
          </button>
        </div>
      ) : null}
      {confirmOpen ? (
        <div
          className="project-delete-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-label={`Remove ${project.label} from sidebar`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              cancelDelete()
              return
            }
            if (event.key !== "Tab") return
            if (event.shiftKey && document.activeElement === cancelDeleteButtonRef.current) {
              event.preventDefault()
              confirmDeleteButtonRef.current?.focus({ preventScroll: true })
            } else if (!event.shiftKey && document.activeElement === confirmDeleteButtonRef.current) {
              event.preventDefault()
              cancelDeleteButtonRef.current?.focus({ preventScroll: true })
            }
          }}
        >
          <div className="project-delete-confirm-header">
            <span className="project-delete-confirm-icon" aria-hidden="true">
              <FolderMinus size={16} />
            </span>
            <div>
              <strong>Remove project from sidebar?</strong>
              <span>{project.label}</span>
            </div>
          </div>
          <p>
            Removes this project, its canvases, and imported log registrations from the current sidebar.
          </p>
          <small>Original source files and saved .rxncanvas folders on disk are not deleted.</small>
          <div className="project-delete-confirm-actions">
            <button ref={cancelDeleteButtonRef} type="button" className="is-secondary" onClick={cancelDelete}>Cancel</button>
            <button ref={confirmDeleteButtonRef} type="button" className="is-danger" onClick={onConfirmDelete}>Remove from sidebar</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FileFilterMenu({
  groups,
  filterMode,
  onSelect,
}: {
  groups: SourceFileGroup[]
  filterMode: FileFilterMode
  onSelect: (mode: FileFilterMode) => void
}) {
  const counts = useMemo(() => {
    const tally: Record<SourceFilePairStatus, number> = {
      ready: 0,
      parsing: 0,
      "missing-pair": 0,
      "parse-error": 0,
    }
    for (const group of groups) tally[group.pairStatus] += 1
    return tally
  }, [groups])
  const options: { mode: FileFilterMode; label: string; count: number; tone: string }[] = [
    { mode: "all", label: "All files", count: groups.length, tone: "is-neutral" },
    { mode: "ready", label: "Ready", count: counts.ready, tone: "is-ready" },
    { mode: "attention", label: "Needs attention", count: groups.length - counts.ready, tone: "is-attention" },
    { mode: "missing-pair", label: "Missing pair", count: counts["missing-pair"], tone: "is-missing" },
    { mode: "parsing", label: "Parsing", count: counts.parsing, tone: "is-parsing" },
    { mode: "parse-error", label: "Parse errors", count: counts["parse-error"], tone: "is-error" },
  ]
  return (
    <div className="source-browser-menu" role="menu" aria-label="Filter files">
      {options.map((option) => {
        const active = filterMode === option.mode
        return (
          <button
            key={option.mode}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            aria-label={`${option.label} ${option.count}`}
            onClick={() => onSelect(active && option.mode !== "all" ? "all" : option.mode)}
          >
            <span className="source-browser-menu-check" aria-hidden="true">
              {active ? <Check size={12} /> : null}
            </span>
            <span className="source-browser-menu-label">
              <i className={`source-browser-status-dot ${option.tone}`} aria-hidden="true" />
              {option.label}
            </span>
            <span className="source-browser-menu-count">{option.count}</span>
          </button>
        )
      })}
    </div>
  )
}

function FileSortMenu({
  sortMode,
  onSelect,
}: {
  sortMode: FileSortMode
  onSelect: (mode: FileSortMode) => void
}) {
  const options: { mode: FileSortMode; label: string }[] = [
    { mode: "project", label: "Project order" },
    { mode: "name", label: "File name" },
    { mode: "kind", label: "File type" },
    { mode: "status", label: "Status" },
  ]
  return (
    <div className="source-browser-menu" role="menu" aria-label="Sort files">
      {options.map((option) => {
        const active = sortMode === option.mode
        return (
          <button
            key={option.mode}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            aria-label={option.label}
            onClick={() => onSelect(option.mode)}
          >
            <span className="source-browser-menu-check" aria-hidden="true">
              {active ? <Check size={12} /> : null}
            </span>
            <span className="source-browser-menu-label">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function ProjectFileRow({
  group,
  active,
  selected,
  selectedGroupFiles,
  onSelect,
  onOpenContextMenu,
}: {
  group: SourceFileGroup
  active: boolean
  selected: boolean
  selectedGroupFiles: SourceFile[]
  onSelect: (fileId: string, options?: FileSelectionOptions) => void
  onOpenContextMenu: (group: SourceFileGroup, event: MouseEvent<HTMLDivElement>) => void
}) {
  const { primaryFile } = group
  const filesForDrag = selected && selectedGroupFiles.length > 0 ? selectedGroupFiles : group.files
  const suppressNextClickRef = useRef(false)
  const dragInProgressRef = useRef(false)
  const dragGhostRef = useRef<HTMLDivElement | null>(null)
  const parsing = group.hasPendingParse
  const parseIssue = group.files.map(sourceFileParseIssue).find((issue) => issue !== null) ?? null
  const parseIssueTitle = parseIssue ? `${parseIssue.file.name}: ${parseIssue.message}` : undefined
  const missingPairTitle = group.pairStatus === "missing-pair"
    ? !group.hasGasLog && group.hasSolutionLog
      ? "No paired gas log"
      : "No paired solvation log"
    : undefined
  const fileStatusTitle = [missingPairTitle, parseIssueTitle].filter(Boolean).join(" - ") || undefined
  const fileAriaLabel = `${group.displayName} ${group.displayKind}${fileStatusTitle ? `, ${fileStatusTitle}` : ""}`

  const removeDragGhost = () => {
    dragGhostRef.current?.remove()
    dragGhostRef.current = null
  }

  useEffect(() => () => removeDragGhost(), [])

  const selectFromEvent = (event: MouseEvent<HTMLButtonElement>) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    onSelect(primaryFile.id, {
      additive: event.metaKey || event.ctrlKey,
      range: event.shiftKey,
    })
  }

  const startDrag = (event: DragEvent<HTMLDivElement>) => {
    dragInProgressRef.current = true
    const payloadFiles = filesForDrag.length > 0 ? filesForDrag : [primaryFile]
    const payload = payloadFiles.length === 1
      ? {
          kind: "project-file",
          projectFileId: payloadFiles[0].id,
          path: projectFileDragPath(payloadFiles[0]),
        }
      : {
          kind: "project-files",
          files: payloadFiles.map((item) => ({
            projectFileId: item.id,
            path: projectFileDragPath(item),
          })),
        }

    event.dataTransfer.effectAllowed = "copy"
    event.dataTransfer.setData(projectFileDragMimeType, JSON.stringify(payload))
    event.dataTransfer.setData("text/plain", payloadFiles.map((item) => projectFileDragPath(item)).join("\n"))

    removeDragGhost()
    const ghost = document.createElement("div")
    ghost.className = "project-file-drag-ghost"
    ghost.setAttribute("aria-hidden", "true")

    const sourceIcon = event.currentTarget.querySelector<HTMLElement>(".project-file-kind-icon")
    if (sourceIcon) {
      const icon = sourceIcon.cloneNode(true)
      if (icon instanceof HTMLElement) {
        icon.className = `project-file-drag-ghost-icon kind-${group.displayKind.toLowerCase()}`
      }
      ghost.append(icon)
    }

    const label = document.createElement("span")
    label.className = "project-file-drag-ghost-label"
    label.textContent = selected && selectedGroupFiles.length > group.files.length
      ? selectedGroupFiles.map((item) => item.name).join(", ")
      : group.displayName
    ghost.append(label)

    document.body.append(ghost)
    dragGhostRef.current = ghost
    if (typeof event.dataTransfer.setDragImage === "function") {
      event.dataTransfer.setDragImage(ghost, 18, 18)
    }
  }

  const armDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.draggable = true
  }

  const disarmDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragInProgressRef.current) return
    event.currentTarget.draggable = false
  }

  const cancelDrag = (event: PointerEvent<HTMLDivElement>) => {
    dragInProgressRef.current = false
    event.currentTarget.draggable = false
    removeDragGhost()
  }

  const finishDrag = (event: DragEvent<HTMLDivElement>) => {
    dragInProgressRef.current = false
    event.currentTarget.draggable = false
    removeDragGhost()
  }

  return (
    <div
      className={`project-file-card${active ? " is-active" : ""}${selected ? " project-file-card--selected" : ""}${parsing ? " is-parsing" : ""}`}
      draggable={false}
      onContextMenu={(event) => onOpenContextMenu(group, event)}
      onPointerDown={armDrag}
      onPointerUp={disarmDrag}
      onPointerCancel={cancelDrag}
      onPointerEnter={(event) => {
        if (event.buttons === 0) cancelDrag(event)
      }}
      onDragStart={startDrag}
      onDragEnd={finishDrag}
    >
      <button
        type="button"
        className="project-file-main"
        aria-pressed={selected}
        aria-label={fileAriaLabel}
        onClick={selectFromEvent}
      >
        <span
          className={`project-file-kind-icon kind-${group.displayKind.toLowerCase()}`}
          aria-hidden="true"
        >
          <FilePlus2 size={14} />
        </span>
        <span>{group.displayName}</span>
        {group.pairStatus === "parse-error" ? (
          <i
            className="project-file-phase-badges has-parse-error"
            data-status-title={parseIssueTitle}
            aria-hidden="true"
          />
        ) : group.pairStatus === "missing-pair" ? (
          <i
            className={`project-file-phase-badges${!group.hasGasLog && group.hasSolutionLog ? " has-missing-gas" : " has-missing-solution"}`}
            data-status-title={missingPairTitle}
            aria-hidden="true"
          />
        ) : null}
      </button>
      {parsing ? (
        <span
          className="project-file-progress"
          role="progressbar"
          aria-label={`Parsing ${group.displayName}`}
        >
          <span aria-hidden="true" />
        </span>
      ) : null}
    </div>
  )
}

function normalizedFileSearchQuery(query: string): string {
  return query.trim().toLowerCase()
}

function sourceFileGroupMatchesQuery(group: SourceFileGroup, query: string): boolean {
  if (!query) return true
  return sourceFileGroupSearchText(group).includes(query)
}

function sourceFileGroupSearchText(group: SourceFileGroup): string {
  return [
    group.displayName,
    group.displayKind,
    ...group.files.flatMap((file) => [
      file.name,
      file.kind,
      file.parse?.label,
      file.parse?.formula,
      file.parse?.method,
      file.parse?.solvent,
      file.parse?.parserId,
      ...(file.parse?.warnings ?? []).map((warning) => warning.code),
    ]),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase()
}

function sourceFileGroupMatchesFilter(group: SourceFileGroup, mode: FileFilterMode): boolean {
  if (mode === "all") return true
  if (mode === "ready") return group.pairStatus === "ready"
  if (mode === "attention") return group.pairStatus !== "ready"
  if (mode === "missing-pair") return group.pairStatus === "missing-pair"
  if (mode === "parse-error") return group.pairStatus === "parse-error"
  return group.pairStatus === "parsing"
}

function sourceFileGroupCompare(left: SourceFileGroup, right: SourceFileGroup, mode: FileSortMode): number {
  if (mode === "name") return alphaCompare(left.displayName, right.displayName)
  if (mode === "kind") {
    return alphaCompare(left.displayKind, right.displayKind)
      || alphaCompare(left.displayName, right.displayName)
  }
  if (mode === "status") {
    return sourceFileGroupStatusRank(left) - sourceFileGroupStatusRank(right)
      || alphaCompare(left.displayName, right.displayName)
  }
  return 0
}

function sourceFileGroupStatusRank(group: SourceFileGroup): number {
  if (group.pairStatus === "parse-error") return 0
  if (group.pairStatus === "missing-pair") return 1
  if (group.pairStatus === "parsing") return 2
  return 3
}

function alphaCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
}

function RailSection({
  title,
  actionLabel,
  actionIcon,
  actionExpanded,
  onAction,
  headingActions,
  onDropFiles,
  toolbar,
  children,
}: {
  title: string
  actionLabel?: string
  actionIcon?: ReactNode
  actionExpanded?: boolean
  onAction?: () => void
  headingActions?: ReactNode
  onDropFiles?: (files: File[]) => void
  toolbar?: ReactNode
  children: ReactNode
}) {
  const acceptDroppedFiles = (event: DragEvent<HTMLElement>) => {
    if (!onDropFiles) return
    if (!dataTransferHasFiles(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }

  const importDroppedFiles = (event: DragEvent<HTMLElement>) => {
    if (!onDropFiles) return
    const droppedFiles = filesFromDataTransfer(event.dataTransfer)
    if (droppedFiles.length === 0) return
    event.preventDefault()
    onDropFiles(droppedFiles)
  }

  return (
    <section
      className={`rail-section${onDropFiles ? " rail-section--drop-target" : ""}`}
      onDragOver={acceptDroppedFiles}
      onDrop={importDroppedFiles}
    >
      <div className="rail-heading">
        <span>{title}</span>
        <div className="rail-heading-actions">
          {headingActions ?? (actionLabel && onAction ? (
            <button
              type="button"
              aria-label={actionLabel}
              aria-expanded={actionExpanded}
              title={actionLabel}
              onClick={onAction}
            >
              {actionIcon}
            </button>
          ) : null)}
        </div>
      </div>
      {toolbar}
      <div className="rail-list">{children}</div>
    </section>
  )
}
