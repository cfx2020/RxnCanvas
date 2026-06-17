import { useEffect, useMemo, useState, type DragEvent, type FormEvent, type MouseEvent, type ReactNode } from "react"
import { Atom, FilePlus2, Folder, FolderPlus, MoreHorizontal, Trash2, UploadCloud } from "lucide-react"
import type { ProjectSummary, SourceFile } from "../domain/projectPackages"
import {
  filesFromDataTransfer,
  projectFileDragMimeType,
  projectFileDragPath,
  sourceFileGroupsForDisplay,
  type SourceFileGroup,
} from "./fileDisplay"

export type FileSelectionOptions = {
  additive?: boolean
  range?: boolean
}

export function ProjectRail({
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
  onDeleteFile,
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
  onDeleteFile: (fileId: string) => void
}) {
  const [projectCreatorOpen, setProjectCreatorOpen] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState("")
  const [projectCreateBusy, setProjectCreateBusy] = useState(false)
  const [projectActionId, setProjectActionId] = useState<string | null>(null)
  const [deleteConfirmProjectId, setDeleteConfirmProjectId] = useState<string | null>(null)
  const selectedFileSet = useMemo(() => new Set(selectedFileIds), [selectedFileIds])
  const selectedFiles = useMemo(
    () => selectedFileIds
      .map((id) => files.find((file) => file.id === id))
      .filter((file): file is SourceFile => Boolean(file)),
    [files, selectedFileIds],
  )
  const fileGroups = useMemo(() => sourceFileGroupsForDisplay(files), [files])

  useEffect(() => {
    const projectIds = new Set(projects.map((project) => project.id))
    if (projectActionId && !projectIds.has(projectActionId)) setProjectActionId(null)
    if (deleteConfirmProjectId && !projectIds.has(deleteConfirmProjectId)) setDeleteConfirmProjectId(null)
  }, [deleteConfirmProjectId, projectActionId, projects])

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

  return (
    <aside className="project-rail" aria-label="Project rail">
      <div className="brand-block">
        <div className="brand-mark">
          <Atom size={18} />
        </div>
        <div>
          <strong>RxnFlow</strong>
          <span>Reaction canvas</span>
        </div>
      </div>

      <RailSection
        title="Workspaces"
        actionLabel="New Project Folder"
        actionIcon={<FolderPlus size={16} />}
        actionExpanded={projectCreatorOpen}
        onAction={() => setProjectCreatorOpen((current) => !current)}
        secondaryActionLabel="Open Folder"
        secondaryActionIcon={<Folder size={16} />}
        onSecondaryAction={onOpenProjectPackage}
      >
        {projectCreatorOpen ? (
          <form className="project-create-form" aria-label="Create project" onSubmit={submitProject}>
            <label>
              <span>Project name</span>
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
          </form>
        ) : null}
        {projects.map((project) => (
          <ProjectRailItem
            key={project.id}
            project={project}
            active={project.id === activeProjectId}
            menuOpen={projectActionId === project.id}
            confirmOpen={deleteConfirmProjectId === project.id}
            onOpen={() => {
              setProjectActionId(null)
              setDeleteConfirmProjectId(null)
              onOpenProject(project.id)
            }}
            onToggleMenu={() => {
              setDeleteConfirmProjectId(null)
              setProjectActionId((current) => current === project.id ? null : project.id)
            }}
            onImport={() => {
              setProjectActionId(null)
              setDeleteConfirmProjectId(null)
              onImportFiles(project.id)
            }}
            onDropFiles={(droppedFiles) => {
              setProjectActionId(null)
              setDeleteConfirmProjectId(null)
              onDropProjectFiles(project.id, droppedFiles)
            }}
            onRequestDelete={() => {
              setProjectActionId(null)
              setDeleteConfirmProjectId(project.id)
            }}
            onCancelDelete={() => setDeleteConfirmProjectId(null)}
            onConfirmDelete={() => {
              setDeleteConfirmProjectId(null)
              onDeleteProject(project.id)
            }}
          />
        ))}
      </RailSection>

      <RailSection title="Files" actionLabel="Import files" actionIcon={<UploadCloud size={16} />} onAction={() => onImportFiles(activeProjectId)}>
        {files.length === 0 ? (
          <p className="rail-empty">No local files</p>
        ) : fileGroups.map((group) => (
          <ProjectFileRow
            key={group.id}
            group={group}
            active={group.files.some((file) => file.id === selectedFileId)}
            selected={group.files.some((file) => selectedFileSet.has(file.id))}
            selectedFiles={selectedFiles}
            onSelect={onSelectFile}
            onDelete={onDeleteFile}
          />
        ))}
      </RailSection>
    </aside>
  )

  function closeProjectCreator() {
    setProjectNameDraft("")
    setProjectCreatorOpen(false)
  }
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
  onImport,
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
  onImport: () => void
  onDropFiles: (files: File[]) => void
  onRequestDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const acceptDroppedFiles = (event: DragEvent<HTMLDivElement>) => {
    const droppedFiles = filesFromDataTransfer(event.dataTransfer)
    if (droppedFiles.length === 0) return
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
        <em>{project.meta}</em>
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
          <button type="button" role="menuitem" className="is-neutral" onClick={onImport}>
            <UploadCloud size={14} />
            <span>Import files into project</span>
          </button>
          <button type="button" role="menuitem" onClick={onRequestDelete}>
            <Trash2 size={14} />
            <span>Delete project</span>
          </button>
        </div>
      ) : null}
      {confirmOpen ? (
        <div className="project-delete-confirm" role="alertdialog" aria-label={`Delete ${project.label}`}>
          <strong>Delete project?</strong>
          <span>{project.label}</span>
          <div>
            <button type="button" onClick={onCancelDelete}>Cancel</button>
            <button type="button" className="is-danger" onClick={onConfirmDelete}>Confirm delete project</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ProjectFileRow({
  group,
  active,
  selected,
  selectedFiles,
  onSelect,
  onDelete,
}: {
  group: SourceFileGroup
  active: boolean
  selected: boolean
  selectedFiles: SourceFile[]
  onSelect: (fileId: string, options?: FileSelectionOptions) => void
  onDelete: (fileId: string) => void
}) {
  const { primaryFile } = group
  const filesForDrag = selected && selectedFiles.length > 1 ? selectedFiles : group.files

  const selectFromEvent = (event: MouseEvent<HTMLButtonElement>) => {
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
      className={`project-file-card${active ? " is-active" : ""}${selected ? " project-file-card--selected" : ""}`}
      draggable
      onDragStart={startDrag}
    >
      <button
        type="button"
        className="project-file-main"
        aria-pressed={selected}
        aria-label={`${group.displayName} ${group.displayKind}${group.hasSolutionLog ? " gas solution" : ""}`}
        onClick={selectFromEvent}
      >
        <FilePlus2 size={15} />
        <span>{group.displayName}</span>
        {group.hasSolutionLog ? (
          <span className="project-file-phase-badges" aria-hidden="true">
            {group.hasGasLog ? <strong>gas</strong> : null}
            <strong>sol</strong>
          </span>
        ) : null}
        <em>{group.displayKind}</em>
      </button>
      <button
        type="button"
        className="project-file-remove"
        aria-label={`Remove ${group.displayName} from project`}
        title={`Remove ${group.displayName} from project`}
        onClick={() => group.files.forEach((file) => onDelete(file.id))}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
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
  children: ReactNode
}) {
  return (
    <section className="rail-section">
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
