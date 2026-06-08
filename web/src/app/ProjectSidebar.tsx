import {
  ChevronRight,
  FolderOpen,
  FolderPlus,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react"
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent, type RefObject } from "react"
import { createPortal } from "react-dom"
import type { BrowserProjectRef } from "../repository"
import type { ProjectSidebarState } from "./projectSidebarState"
import type { ProjectFileEntry, ProjectFileKind, ProjectFileStatus } from "./projectFiles"
import { graphRawFileDropMimeType, serializeGraphRawFileDropPayload } from "./graphRawFileDropPayload"
import { useI18n, type MessageKey } from "./i18n"

type ProjectSidebarProps = {
  state: ProjectSidebarState
  collapsed: boolean
  onCreateProject: (name: string) => void | Promise<void>
  onOpenProject: (projectRef: string) => Promise<void>
  onDeleteProject: (projectRef: string) => Promise<void>
  onImportProjectFiles: (projectRef: string, files?: File[]) => void | Promise<void>
  onAddProjectFileToCanvas: (file: ProjectFileEntry) => void | Promise<void>
}

export function ProjectSidebar({
  state,
  collapsed,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onImportProjectFiles,
  onAddProjectFileToCanvas,
}: ProjectSidebarProps) {
  const { t } = useI18n()
  const isBusy = state.status === "loading"
  const [createOpen, setCreateOpen] = useState(false)
  const [projectName, setProjectName] = useState("")
  const [expandedProjectRefs, setExpandedProjectRefs] = useState<Set<string>>(() => new Set())
  const createInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (state.activeProjectRef) {
      setExpandedProjectRefs((current) => new Set([...current, state.activeProjectRef as string]))
    }
  }, [state.activeProjectRef])

  useEffect(() => {
    if (createOpen) createInputRef.current?.focus()
  }, [createOpen])

  const submitCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onCreateProject(projectName)
    if (projectName.trim()) {
      setProjectName("")
      setCreateOpen(false)
    }
  }

  const setProjectFolderExpanded = (projectRef: string, expanded: boolean) => {
    setExpandedProjectRefs((current) => {
      const next = new Set(current)
      if (expanded) next.add(projectRef)
      else next.delete(projectRef)
      return next
    })
  }

  return (
    <aside
      className={`project-sidebar ${collapsed ? "project-sidebar--collapsed" : ""}`}
      aria-label={t("projectSidebar.aria")}
      aria-busy={isBusy}
    >
      <ProjectFoldersPanel
        state={state}
        createOpen={createOpen}
        projectName={projectName}
        createInputRef={createInputRef}
        expandedProjectRefs={expandedProjectRefs}
        onToggleCreateOpen={() => setCreateOpen((current) => !current)}
        onProjectNameChange={setProjectName}
        onSubmitCreateProject={submitCreateProject}
        onCancelCreateProject={() => {
          setCreateOpen(false)
          setProjectName("")
        }}
        onSetProjectFolderExpanded={setProjectFolderExpanded}
        onOpenProject={onOpenProject}
        onDeleteProject={onDeleteProject}
        onImportProjectFiles={onImportProjectFiles}
        onAddProjectFileToCanvas={onAddProjectFileToCanvas}
      />
    </aside>
  )
}

type ProjectFoldersPanelProps = {
  state: ProjectSidebarState
  createOpen: boolean
  projectName: string
  createInputRef: RefObject<HTMLInputElement | null>
  expandedProjectRefs: Set<string>
  onToggleCreateOpen: () => void
  onProjectNameChange: (name: string) => void
  onSubmitCreateProject: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onCancelCreateProject: () => void
  onSetProjectFolderExpanded: (projectRef: string, expanded: boolean) => void
  onOpenProject: (projectRef: string) => Promise<void>
  onDeleteProject: (projectRef: string) => Promise<void>
  onImportProjectFiles: (projectRef: string, files?: File[]) => void | Promise<void>
  onAddProjectFileToCanvas: (file: ProjectFileEntry) => void | Promise<void>
}

function ProjectFoldersPanel({
  state,
  createOpen,
  projectName,
  createInputRef,
  expandedProjectRefs,
  onToggleCreateOpen,
  onProjectNameChange,
  onSubmitCreateProject,
  onCancelCreateProject,
  onSetProjectFolderExpanded,
  onOpenProject,
  onDeleteProject,
  onImportProjectFiles,
  onAddProjectFileToCanvas,
}: ProjectFoldersPanelProps) {
  const { t } = useI18n()
  const isBusy = state.status === "loading"
  return (
    <section className="rail-section project-folder-section" aria-label={t("projectSidebar.projectsAria")}>
      <div className="project-folder-section-header">
        <p className="section-kicker">{t("projectSidebar.projectsSection")}</p>
        <button
          type="button"
          className="project-section-create-button"
          onClick={onToggleCreateOpen}
          aria-expanded={createOpen}
          aria-label={t("projectSidebar.newProject")}
          title={t("projectSidebar.newProject")}
          disabled={isBusy}
        >
          <FolderPlus size={15} />
        </button>
      </div>
      {createOpen ? (
        <form className="sidebar-create-form" aria-label={t("projectSidebar.createFormAria")} onSubmit={onSubmitCreateProject}>
          <label htmlFor="sidebar-project-name">{t("projectSidebar.projectName")}</label>
          <input
            id="sidebar-project-name"
            ref={createInputRef}
            value={projectName}
            onChange={(event) => onProjectNameChange(event.currentTarget.value)}
            placeholder={t("projectSidebar.projectNamePlaceholder")}
            disabled={isBusy}
          />
          <div className="sidebar-create-actions">
            <button type="button" onClick={onCancelCreateProject}>
              {t("projectSidebar.cancelCreateProject")}
            </button>
            <button type="submit" disabled={isBusy}>
              {t("projectSidebar.createProject")}
            </button>
          </div>
        </form>
      ) : null}
      {state.error ? (
        <div className="sidebar-error" role="alert">
          <strong>{state.error.code}</strong>
          <span>{state.error.message}</span>
          {state.error.target ? <small>{state.error.target}</small> : null}
        </div>
      ) : null}
      {state.projects.length === 0 ? (
        <p className="muted">{t("projectSidebar.noProjects")}</p>
      ) : (
        <ul className="project-folder-list" role="tree" aria-label={t("projectSidebar.projectFiles.listAria")}>
          {state.projects.map((project) => (
            <ProjectFolder
              key={project.projectRef}
              project={project}
              expanded={expandedProjectRefs.has(project.projectRef)}
              active={project.projectRef === state.activeProjectRef}
              isBusy={state.status === "loading"}
              projectFiles={project.projectRef === state.activeProjectRef ? state.projectFiles : []}
              onSetProjectFolderExpanded={onSetProjectFolderExpanded}
              onOpenProject={onOpenProject}
              onDeleteProject={onDeleteProject}
              onImportProjectFiles={onImportProjectFiles}
              onAddProjectFileToCanvas={onAddProjectFileToCanvas}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

type ProjectFolderProps = {
  project: BrowserProjectRef
  expanded: boolean
  active: boolean
  isBusy: boolean
  projectFiles: ProjectFileEntry[]
  onSetProjectFolderExpanded: (projectRef: string, expanded: boolean) => void
  onOpenProject: (projectRef: string) => Promise<void>
  onDeleteProject: (projectRef: string) => Promise<void>
  onImportProjectFiles: (projectRef: string, files?: File[]) => void | Promise<void>
  onAddProjectFileToCanvas: (file: ProjectFileEntry) => void | Promise<void>
}

function ProjectFolder({
  project,
  expanded,
  active,
  isBusy,
  projectFiles,
  onSetProjectFolderExpanded,
  onOpenProject,
  onDeleteProject,
  onImportProjectFiles,
  onAddProjectFileToCanvas,
}: ProjectFolderProps) {
  const { t } = useI18n()
  const fileCount = projectFiles.length
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const folderRef = useRef<HTMLLIElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (isBusy) {
      setMenuOpen(false)
    }
  }, [isBusy])

  useEffect(() => {
    if (!menuOpen) return undefined
    const handleDocumentPointerDown = (event: PointerEvent) => {
      const folder = folderRef.current
      const popover = popoverRef.current
      if (!folder || folder.contains(event.target as Node) || popover?.contains(event.target as Node)) return
      setMenuOpen(false)
    }
    document.addEventListener("pointerdown", handleDocumentPointerDown, { capture: true })
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown, { capture: true })
  }, [menuOpen])

  useEffect(() => {
    if (active) return
    setMenuOpen(false)
  }, [active])

  useEffect(() => {
    if (!menuOpen) return undefined
    const updateMenuPosition = () => {
      const rect = menuButtonRef.current?.getBoundingClientRect()
      if (!rect) return
      setMenuPosition({
        top: Math.max(8, rect.top),
        left: Math.min(window.innerWidth - 132, rect.right + 8),
      })
    }
    updateMenuPosition()
    window.addEventListener("resize", updateMenuPosition)
    window.addEventListener("scroll", updateMenuPosition, true)
    return () => {
      window.removeEventListener("resize", updateMenuPosition)
      window.removeEventListener("scroll", updateMenuPosition, true)
    }
  }, [menuOpen])

  const handleDragOver = (event: DragEvent<HTMLLIElement>) => {
    if (event.dataTransfer.files.length === 0) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }

  const handleDrop = (event: DragEvent<HTMLLIElement>) => {
    const files = Array.from(event.dataTransfer.files)
    if (files.length === 0) return
    event.preventDefault()
    void onImportProjectFiles(project.projectRef, files)
  }

  const handleProjectClick = () => {
    setMenuOpen(false)
    if (active) {
      onSetProjectFolderExpanded(project.projectRef, !expanded)
      return
    }
    onSetProjectFolderExpanded(project.projectRef, true)
    void onOpenProject(project.projectRef)
  }

  const handleDeleteProject = () => {
    setMenuOpen(false)
    void onDeleteProject(project.projectRef)
  }

  return (
    <li
      ref={folderRef}
      className={`project-folder ${active ? "project-folder--active" : ""} ${expanded ? "project-folder--expanded" : ""} ${menuOpen ? "project-folder--menu-open" : ""}`}
      role="treeitem"
      aria-expanded={expanded}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="project-folder-row">
        <button
          type="button"
          className="project-folder-main"
          onClick={handleProjectClick}
          aria-current={active ? "true" : undefined}
          aria-expanded={expanded}
          disabled={isBusy}
        >
          <ChevronRight size={14} className="project-folder-disclosure" aria-hidden="true" />
          <FolderOpen size={17} />
          <span>
            <strong>{project.name}</strong>
            <small>
              {active
                ? t(fileCount === 1 ? "projectSidebar.projectFiles.countOne" : "projectSidebar.projectFiles.count", { count: fileCount })
                : t("projectSidebar.projectUpdated", { date: formatProjectUpdatedAt(project.updatedAt) })}
            </small>
          </span>
        </button>
        <div className={`project-folder-actions ${menuOpen ? "project-folder-actions--open" : ""}`}>
          <button
            ref={menuButtonRef}
            type="button"
            className="project-folder-more-button"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setMenuPosition({
                top: Math.max(8, rect.top),
                left: Math.min(window.innerWidth - 132, rect.right + 8),
              })
              setMenuOpen((current) => !current)
            }}
            disabled={isBusy}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t("projectSidebar.projectFiles.moreActions", { name: project.name })}
            title={t("projectSidebar.projectFiles.moreActions", { name: project.name })}
          >
            <MoreVertical size={15} />
          </button>
          <button
            type="button"
            className="project-folder-import-button"
            onClick={() => {
              setMenuOpen(false)
              void onImportProjectFiles(project.projectRef)
            }}
            disabled={isBusy}
            title={t("projectSidebar.projectFiles.importInto", { name: project.name })}
            aria-label={t("projectSidebar.projectFiles.importInto", { name: project.name })}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
      {menuOpen ? createPortal(
        <div
          ref={popoverRef}
          className="project-folder-popover"
          role="menu"
          aria-label={t("projectSidebar.projectFiles.moreActions", { name: project.name })}
          style={menuPosition ? { top: `${menuPosition.top}px`, left: `${menuPosition.left}px` } : undefined}
        >
          <button
            type="button"
            className="project-folder-delete-action"
            role="menuitem"
            onClick={handleDeleteProject}
            disabled={isBusy}
          >
            <Trash2 size={14} />
            <span>{t("projectSidebar.projectFiles.deleteProject")}</span>
          </button>
        </div>,
        document.body,
      ) : null}
      {active && fileCount > 0 ? (
        <ul
          className={`project-folder-contents ${expanded ? "project-folder-contents--expanded" : "project-folder-contents--collapsed"}`}
          role="group"
          aria-hidden={expanded ? "false" : "true"}
        >
          {projectFiles.map((file) => (
            <ProjectFileRow key={file.id} file={file} onAddProjectFileToCanvas={onAddProjectFileToCanvas} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

type ProjectFileRowProps = {
  file: ProjectFileEntry
  onAddProjectFileToCanvas: (file: ProjectFileEntry) => void | Promise<void>
}

function ProjectFileRow({ file, onAddProjectFileToCanvas }: ProjectFileRowProps) {
  const { t } = useI18n()
  const draggable = isDraggableRawProjectFile(file)
  const kindBadge = projectFileKindBadge(file.kind)
  const kindLabel = t(projectFileKindLabelKey(file.kind))
  const handleActivateFile = () => {
    if (!draggable) return
    void onAddProjectFileToCanvas(file)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (!draggable || (event.key !== "Enter" && event.key !== " ")) return
    event.preventDefault()
    handleActivateFile()
  }

  return (
    <li
      className={`project-file-card project-file-card--${file.status} ${draggable ? "project-file-card--interactive" : ""}`}
      role="treeitem"
      draggable={draggable}
      tabIndex={draggable ? 0 : undefined}
      aria-label={projectFileAriaLabel(file, kindLabel, t)}
      onClick={handleActivateFile}
      onKeyDown={handleKeyDown}
      onDragStart={draggable ? (event) => {
        event.dataTransfer.effectAllowed = "copy"
        event.dataTransfer.setData(graphRawFileDropMimeType, serializeGraphRawFileDropPayload({
          kind: "project-file",
          projectFileId: file.id,
          path: file.path,
        }))
      } : undefined}
    >
      <span
        className={`project-file-kind-badge project-file-kind-badge--${kindBadge.className}`}
        title={kindLabel}
        aria-hidden="true"
      >
        {kindBadge.label}
      </span>
      <span className="project-file-title">
        <strong title={file.name}>{file.name}</strong>
      </span>
      {file.warnings.length > 0 ? (
        <span
          className="project-file-warning-dot"
          title={t("projectSidebar.projectFiles.warningCount", { count: file.warnings.length })}
          aria-hidden="true"
        />
      ) : null}
    </li>
  )
}

function isDraggableRawProjectFile(file: ProjectFileEntry): boolean {
  return file.path.startsWith("inputs/raw/") && file.kind !== "export-artifact"
}

function projectFileAriaLabel(
  file: ProjectFileEntry,
  kindLabel: string,
  t: Translate,
): string {
  return [
    file.name,
    kindLabel,
    t(projectFileStatusLabelKey(file.status)),
    ...(file.warnings.length > 0
      ? [t("projectSidebar.projectFiles.warningCount", { count: file.warnings.length })]
      : []),
  ].join(", ")
}

function formatProjectUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function projectFileKindBadge(kind: ProjectFileKind): { className: string; label: string } {
  if (kind === "gaussian-log") return { className: "gaussian-log", label: "G" }
  if (kind === "orca-output") return { className: "orca-output", label: "O" }
  if (kind === "maple-output") return { className: "maple-output", label: "M" }
  if (kind === "xyz") return { className: "xyz", label: "XYZ" }
  if (kind === "extxyz") return { className: "extxyz", label: "X" }
  if (kind === "export-artifact") return { className: "export-artifact", label: "E" }
  return { className: "unknown", label: "?" }
}

function projectFileKindLabelKey(kind: ProjectFileKind): MessageKey {
  if (kind === "gaussian-log") return "projectSidebar.projectFiles.kind.gaussianLog"
  if (kind === "orca-output") return "projectSidebar.projectFiles.kind.orcaOutput"
  if (kind === "maple-output") return "projectSidebar.projectFiles.kind.mapleOutput"
  if (kind === "xyz") return "projectSidebar.projectFiles.kind.xyz"
  if (kind === "extxyz") return "projectSidebar.projectFiles.kind.extxyz"
  if (kind === "export-artifact") return "projectSidebar.projectFiles.kind.exportArtifact"
  return "projectSidebar.projectFiles.kind.unknown"
}

function projectFileStatusLabelKey(status: ProjectFileStatus): MessageKey {
  if (status === "previewed") return "projectSidebar.projectFiles.status.previewed"
  if (status === "registered") return "projectSidebar.projectFiles.status.registered"
  if (status === "used-in-graph") return "projectSidebar.projectFiles.status.usedInGraph"
  if (status === "exported") return "projectSidebar.projectFiles.status.exported"
  if (status === "error") return "projectSidebar.projectFiles.status.error"
  return "projectSidebar.projectFiles.status.stored"
}

type Translate = ReturnType<typeof useI18n>["t"]
