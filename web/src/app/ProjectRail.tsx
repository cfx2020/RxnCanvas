import { memo, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { ArrowDownAZ, FilePlus2, Filter, Folder, FolderOpen, FolderPlus, MoreHorizontal, Plus, Search, Settings2, Trash2, UploadCloud } from "lucide-react"
import type { ProjectSummary, SourceFile } from "../domain/projectPackages"
import type { CanvasTabState } from "./projectCanvasState"
import {
  dataTransferHasFiles,
  filesFromDataTransfer,
  projectFileDragMimeType,
  projectFileDragPath,
  sourceFileLooksLikeParsedSolutionLog,
  sourceFileGroupsForDisplay,
  type SourceFileGroup,
} from "./fileDisplay"

const FILE_CONTEXT_MENU_WIDTH = 212
const FILE_CONTEXT_MENU_HEIGHT = 68

type FileFilterMode = "all" | "attention" | "missing-pair" | "parse-error" | "parsing"
type FileSortMode = "project" | "name" | "kind" | "status"

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
  onOpenSettings?: () => void
  width?: number
  minWidth?: number
  maxWidth?: number
  onResizePointerDown?: (event: PointerEvent<HTMLElement>) => void
  onResizeStep?: (nextWidth: number) => void
}) {
  const [projectCreatorOpen, setProjectCreatorOpen] = useState(false)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState("")
  const [projectCreateBusy, setProjectCreateBusy] = useState(false)
  const [projectActionId, setProjectActionId] = useState<string | null>(null)
  const [canvasActionId, setCanvasActionId] = useState<string | null>(null)
  const [deleteConfirmProjectId, setDeleteConfirmProjectId] = useState<string | null>(null)
  const [fileContextMenu, setFileContextMenu] = useState<FileContextMenuState | null>(null)
  const [sourceBrowserToolsOpen, setSourceBrowserToolsOpen] = useState(false)
  const railRef = useRef<HTMLElement | null>(null)
  const fileContextMenuRef = useRef<HTMLDivElement | null>(null)
  const selectedFileSet = useMemo(() => new Set(selectedFileIds), [selectedFileIds])
  const selectedFiles = useMemo(
    () => selectedFileIds
      .map((id) => files.find((file) => file.id === id))
      .filter((file): file is SourceFile => Boolean(file)),
    [files, selectedFileIds],
  )
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
  const sourceBrowserHasActiveControls = fileSearchQuery.trim().length > 0 || fileFilterMode !== "all" || fileSortMode !== "project"
  const sourceBrowserControlsVisible = sourceBrowserToolsOpen || sourceBrowserHasActiveControls
  const selectedFileGroupFiles = useMemo(() => fileGroups
    .filter((group) => group.files.some((file) => selectedFileSet.has(file.id)))
    .flatMap((group) => group.files), [fileGroups, selectedFileSet])

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
    if (!workspaceMenuOpen && !projectCreatorOpen && !projectActionId && !canvasActionId && !deleteConfirmProjectId && !fileContextMenu) return

    const closeTransientUi = () => {
      setWorkspaceMenuOpen(false)
      setProjectActionId(null)
      setCanvasActionId(null)
      setDeleteConfirmProjectId(null)
      setFileContextMenu(null)
      if (projectCreatorOpen) closeProjectCreator()
    }
    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (fileContextMenuRef.current?.contains(target)) return
      if (fileContextMenu) setFileContextMenu(null)
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
  }, [canvasActionId, deleteConfirmProjectId, fileContextMenu, projectActionId, projectCreatorOpen, workspaceMenuOpen])

  const openFileContextMenu = (group: SourceFileGroup, event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setWorkspaceMenuOpen(false)
    setProjectActionId(null)
    setCanvasActionId(null)
    setDeleteConfirmProjectId(null)

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

  return (
    <>
      <aside className="project-rail" aria-label="Project rail" ref={railRef}>
        <div className="project-rail-scroll">
          <RailSection
            title="Projects"
            actionLabel="Workspace actions"
            actionIcon={<Plus size={16} />}
            actionExpanded={workspaceMenuOpen}
            onAction={() => setWorkspaceMenuOpen((current) => !current)}
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

          <RailSection
            title="Files"
            actionLabel="Import files"
            actionIcon={<UploadCloud size={16} />}
            onAction={() => onImportFiles(activeProjectId)}
            secondaryActionLabel={sourceBrowserControlsVisible ? "Hide file controls" : "Search and filter files"}
            secondaryActionIcon={<Search size={16} />}
            onSecondaryAction={() => setSourceBrowserToolsOpen((current) => !current)}
            onDropFiles={(droppedFiles) => onDropProjectFiles(activeProjectId, droppedFiles)}
          >
            {sourceBrowserControlsVisible ? (
              <SourceBrowserControls
                query={fileSearchQuery}
                filterMode={fileFilterMode}
                sortMode={fileSortMode}
                fileCount={files.length}
                groupCount={fileGroups.length}
                onQueryChange={setFileSearchQuery}
                onFilterModeChange={setFileFilterMode}
                onSortModeChange={setFileSortMode}
              />
            ) : null}
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
              selectedFiles={selectedFiles}
              onSelect={onSelectFile}
              onOpenContextMenu={openFileContextMenu}
            />
          ))}
          </RailSection>
        </div>

        {onOpenSettings ? (
          <div className="project-rail-footer">
            <button type="button" className="project-rail-settings" aria-label="Settings" title="Settings" onClick={onOpenSettings}>
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
            <Trash2 size={14} />
            <span>Delete project</span>
          </button>
        </div>
      ) : null}
      {confirmOpen ? (
        <div className="project-delete-confirm" role="alertdialog" aria-label={`Delete ${project.label}`}>
          <div className="project-delete-confirm-header">
            <span className="project-delete-confirm-icon" aria-hidden="true">
              <Trash2 size={16} />
            </span>
            <div>
              <strong>Delete project from workspace?</strong>
              <span>{project.label}</span>
            </div>
          </div>
          <p>
            Deletes this project from the current workspace, including its canvases and imported log
            registrations.
          </p>
          <small>Original source files on disk are not deleted.</small>
          <div className="project-delete-confirm-actions">
            <button type="button" className="is-secondary" onClick={onCancelDelete}>Cancel</button>
            <button type="button" className="is-danger" onClick={onConfirmDelete}>Delete project</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SourceBrowserControls({
  query,
  filterMode,
  sortMode,
  fileCount,
  groupCount,
  onQueryChange,
  onFilterModeChange,
  onSortModeChange,
}: {
  query: string
  filterMode: FileFilterMode
  sortMode: FileSortMode
  fileCount: number
  groupCount: number
  onQueryChange: (query: string) => void
  onFilterModeChange: (mode: FileFilterMode) => void
  onSortModeChange: (mode: FileSortMode) => void
}) {
  return (
    <div className="source-browser-controls">
      <label className="source-browser-search">
        <Search size={13} aria-hidden="true" />
        <input
          type="search"
          aria-label="Search files"
          value={query}
          placeholder="Search files"
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <span>{groupCount}/{fileCount}</span>
      </label>
      <div className="source-browser-menus">
        <label>
          <Filter size={13} aria-hidden="true" />
          <select
            aria-label="Filter files"
            value={filterMode}
            onChange={(event) => {
              onFilterModeChange(event.target.value as FileFilterMode)
              event.currentTarget.blur()
            }}
          >
            <option value="all">All</option>
            <option value="attention">Attention</option>
            <option value="missing-pair">Missing pair</option>
            <option value="parse-error">Errors</option>
            <option value="parsing">Parsing</option>
          </select>
        </label>
        <label>
          <ArrowDownAZ size={13} aria-hidden="true" />
          <select
            aria-label="Sort files"
            value={sortMode}
            onChange={(event) => {
              onSortModeChange(event.target.value as FileSortMode)
              event.currentTarget.blur()
            }}
          >
            <option value="project">Project</option>
            <option value="name">Name</option>
            <option value="kind">Kind</option>
            <option value="status">Status</option>
          </select>
        </label>
      </div>
    </div>
  )
}

function ProjectFileRow({
  group,
  active,
  selected,
  selectedFiles,
  onSelect,
  onOpenContextMenu,
}: {
  group: SourceFileGroup
  active: boolean
  selected: boolean
  selectedFiles: SourceFile[]
  onSelect: (fileId: string, options?: FileSelectionOptions) => void
  onOpenContextMenu: (group: SourceFileGroup, event: MouseEvent<HTMLDivElement>) => void
}) {
  const { primaryFile } = group
  const filesForDrag = selected && selectedFiles.length > 1 ? selectedFiles : group.files
  const suppressNextClickRef = useRef(false)
  const missingPairLog = group.hasParsedGasLog !== group.hasParsedSolutionLog
  const parsing = group.files.some(sourceFileHasPendingDesktopParse)
  const parseIssue = group.files.map(sourceFileParseIssue).find((issue) => issue !== null) ?? null
  const parseIssueTitle = parseIssue ? `${parseIssue.file.name}: ${parseIssue.message}` : undefined
  const solvationPairTitle = missingPairLog
    ? !group.hasParsedGasLog && group.hasSolutionLog
      ? "No paired gas log"
      : "No paired solvation log"
    : undefined
  const fileStatusTitle = [solvationPairTitle, parseIssueTitle].filter(Boolean).join(" - ") || undefined
  const fileAriaLabel = `${group.displayName} ${group.displayKind}${fileStatusTitle ? `, ${fileStatusTitle}` : ""}`

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
  }

  return (
    <div
      className={`project-file-card${active ? " is-active" : ""}${selected ? " project-file-card--selected" : ""}${parsing ? " is-parsing" : ""}`}
      draggable
      onContextMenu={(event) => onOpenContextMenu(group, event)}
      onDragStart={startDrag}
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
        {parseIssue ? (
          <i
            className="project-file-phase-badges has-parse-error"
            data-status-title={parseIssueTitle}
            aria-hidden="true"
          />
        ) : missingPairLog ? (
          <i
            className="project-file-phase-badges has-missing-solution"
            data-status-title={solvationPairTitle}
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
  const missingPair = sourceFileGroupHasMissingPair(group)
  const parseError = group.files.some((file) => sourceFileParseIssue(file) !== null)
  const parsing = group.files.some(sourceFileHasPendingDesktopParse)
  if (mode === "attention") return missingPair || parseError || parsing
  if (mode === "missing-pair") return missingPair
  if (mode === "parse-error") return parseError
  return parsing
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
  if (group.files.some((file) => sourceFileParseIssue(file) !== null)) return 0
  if (sourceFileGroupHasMissingPair(group)) return 1
  if (group.files.some(sourceFileHasPendingDesktopParse)) return 2
  return 3
}

function sourceFileGroupHasMissingPair(group: SourceFileGroup): boolean {
  return group.hasParsedGasLog !== group.hasParsedSolutionLog
}

function alphaCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
}

function sourceFileHasPendingDesktopParse(file: SourceFile): boolean {
  if (file.status !== "staged") return false
  return (file.parse?.warnings ?? []).some((warning) => (
    warning.code === "parse_deferred"
    || warning.code === "parse_queued"
    || warning.code === "parse_running"
  ))
}

function sourceFileParseIssue(file: SourceFile): { file: SourceFile; message: string } | null {
  if (!file.parse || file.parse.parsed || sourceFileHasPendingDesktopParse(file)) return null
  const warning = file.parse.warnings.find((item) => !isPendingParseWarning(item.code))
  return {
    file,
    message: warning?.message || "This source could not be parsed.",
  }
}

function isPendingParseWarning(code: string): boolean {
  return code === "parse_deferred" || code === "parse_queued" || code === "parse_running"
}

function RailSection({
  title,
  actionLabel,
  actionIcon,
  actionExpanded,
  onAction,
  secondaryActionLabel,
  secondaryActionIcon,
  onSecondaryAction,
  onDropFiles,
  children,
}: {
  title: string
  actionLabel: string
  actionIcon: ReactNode
  actionExpanded?: boolean
  onAction: () => void
  secondaryActionLabel?: string
  secondaryActionIcon?: ReactNode
  onSecondaryAction?: () => void | Promise<void>
  onDropFiles?: (files: File[]) => void
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
          {secondaryActionLabel && onSecondaryAction ? (
            <button
              type="button"
              aria-label={secondaryActionLabel}
              title={secondaryActionLabel}
              onClick={onSecondaryAction}
            >
              {secondaryActionIcon}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={actionLabel}
            aria-expanded={actionExpanded}
            title={actionLabel}
            onClick={onAction}
          >
            {actionIcon}
          </button>
        </div>
      </div>
      <div className="rail-list">{children}</div>
    </section>
  )
}
