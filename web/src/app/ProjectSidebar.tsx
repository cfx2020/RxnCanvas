import {
  AlertTriangle,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  MoreVertical,
  Plus,
  Save,
  Trash2,
} from "lucide-react"
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from "react"
import type { BrowserProjectRef } from "../repository"
import type { ProjectSidebarState } from "./projectSidebarState"
import type { ProjectFileEntry, ProjectFileKind, ProjectFileStatus } from "./projectFiles"
import { graphRawFileDropMimeType, serializeGraphRawFileDropPayload } from "./graphRawFileDropPayload"
import { useI18n, type MessageKey } from "./i18n"

type ProjectSidebarProps = {
  state: ProjectSidebarState
  onCreateProject: (name: string) => Promise<void>
  onOpenProject: (projectRef: string) => Promise<void>
  onDeleteProject: (projectRef: string) => Promise<void>
  onImportProjectFiles: (projectRef: string, files?: File[]) => void | Promise<void>
  onAddProjectFileToCanvas: (file: ProjectFileEntry) => void | Promise<void>
}

export function ProjectSidebar({
  state,
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
    <aside className="project-sidebar" aria-label={t("projectSidebar.aria")} aria-busy={isBusy}>
      <section className="rail-section drawer-command-section" aria-label={t("projectSidebar.createFormAria")}>
        <button
          type="button"
          className="drawer-new-project-button"
          onClick={() => setCreateOpen((current) => !current)}
          aria-expanded={createOpen}
        >
          <FolderPlus size={18} />
          <span>{t("projectSidebar.newProject")}</span>
        </button>
        {createOpen ? (
          <form className="sidebar-create-form" aria-label={t("projectSidebar.createFormAria")} onSubmit={submitCreateProject}>
            <label htmlFor="sidebar-project-name">{t("projectSidebar.projectName")}</label>
            <input
              id="sidebar-project-name"
              ref={createInputRef}
              value={projectName}
              onChange={(event) => setProjectName(event.currentTarget.value)}
              placeholder={t("projectSidebar.projectNamePlaceholder")}
              disabled={isBusy}
            />
            <div className="sidebar-create-actions">
              <button type="button" onClick={() => {
                setCreateOpen(false)
                setProjectName("")
              }}>
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
      </section>

      <ProjectFoldersPanel
        state={state}
        expandedProjectRefs={expandedProjectRefs}
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
  expandedProjectRefs: Set<string>
  onSetProjectFolderExpanded: (projectRef: string, expanded: boolean) => void
  onOpenProject: (projectRef: string) => Promise<void>
  onDeleteProject: (projectRef: string) => Promise<void>
  onImportProjectFiles: (projectRef: string, files?: File[]) => void | Promise<void>
  onAddProjectFileToCanvas: (file: ProjectFileEntry) => void | Promise<void>
}

function ProjectFoldersPanel({
  state,
  expandedProjectRefs,
  onSetProjectFolderExpanded,
  onOpenProject,
  onDeleteProject,
  onImportProjectFiles,
  onAddProjectFileToCanvas,
}: ProjectFoldersPanelProps) {
  const { t } = useI18n()
  return (
    <section className="rail-section project-folder-section" aria-label={t("projectSidebar.projectsAria")}>
      <p className="section-kicker">{t("projectSidebar.projectsSection")}</p>
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
              persistence={state.persistence}
              validation={state.validation}
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
  persistence: ProjectSidebarState["persistence"]
  validation: ProjectSidebarState["validation"]
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
  persistence,
  validation,
  onSetProjectFolderExpanded,
  onOpenProject,
  onDeleteProject,
  onImportProjectFiles,
  onAddProjectFileToCanvas,
}: ProjectFolderProps) {
  const { t } = useI18n()
  const fileCount = projectFiles.length
  const projectAlerts = active ? projectFolderAlerts(persistence, validation, t) : []
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (isBusy) setMenuOpen(false)
  }, [isBusy])

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
    if (!window.confirm(t("projectSidebar.projectFiles.confirmDeleteProject", { name: project.name }))) {
      return
    }
    void onDeleteProject(project.projectRef)
  }

  return (
    <li
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
          <div className="project-folder-more">
            <button
              type="button"
              className="project-folder-more-button"
              onClick={() => setMenuOpen((current) => !current)}
              disabled={isBusy}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t("projectSidebar.projectFiles.moreActions", { name: project.name })}
              title={t("projectSidebar.projectFiles.moreActions", { name: project.name })}
            >
              <MoreVertical size={15} />
            </button>
            {menuOpen ? (
              <div className="project-folder-menu" role="menu">
                <button
                  type="button"
                  className="project-folder-menu-item project-folder-menu-item--danger"
                  role="menuitem"
                  onClick={handleDeleteProject}
                >
                  <Trash2 size={15} />
                  <span>{t("projectSidebar.projectFiles.deleteProject")}</span>
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="project-folder-import-button"
            onClick={() => void onImportProjectFiles(project.projectRef)}
            disabled={isBusy}
            title={t("projectSidebar.projectFiles.importInto", { name: project.name })}
            aria-label={t("projectSidebar.projectFiles.importInto", { name: project.name })}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
      {expanded && active && (projectAlerts.length > 0 || fileCount > 0) ? (
        <div className="project-folder-contents" role="group">
          {projectAlerts.length > 0 ? <ProjectAlerts alerts={projectAlerts} /> : null}
          {fileCount > 0 ? (
            <ul className="project-file-list" role="group">
              {projectFiles.map((file) => (
                <ProjectFileRow key={file.id} file={file} onAddProjectFileToCanvas={onAddProjectFileToCanvas} />
              ))}
            </ul>
          ) : null}
        </div>
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
  const compactBadges = projectFileCompactBadges(file, t)
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
      aria-label={projectFileAriaLabel(file, kindLabel, compactBadges, t)}
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
      {compactBadges.length > 0 ? (
        <span className="project-file-compact-meta" aria-hidden="true">
          {compactBadges.map((badge) => (
            <span key={badge.id} className={`project-file-compact-badge project-file-compact-badge--${badge.tone}`}>
              {badge.label}
            </span>
          ))}
        </span>
      ) : null}
    </li>
  )
}

function isDraggableRawProjectFile(file: ProjectFileEntry): boolean {
  return file.path.startsWith("inputs/raw/") && file.kind !== "export-artifact"
}

type ProjectFileCompactBadge = {
  id: string
  label: string
  tone: "neutral" | "success" | "warning" | "error"
}

function projectFileCompactBadges(file: ProjectFileEntry, t: Translate): ProjectFileCompactBadge[] {
  const badges: ProjectFileCompactBadge[] = []

  if (file.graphNodeIds.length > 0) {
    badges.push({
      id: "graph-nodes",
      label: t("projectSidebar.projectFiles.compact.inGraph"),
      tone: "success",
    })
  } else if (file.registeredObjectIds.length > 0) {
    badges.push({
      id: "registered-objects",
      label: t("projectSidebar.projectFiles.compact.parsed"),
      tone: "success",
    })
  } else if (file.artifactIds.length > 0) {
    badges.push({
      id: "artifacts",
      label: t("projectSidebar.projectFiles.compact.artifacts", { count: file.artifactIds.length }),
      tone: "neutral",
    })
  } else if (file.status !== "stored") {
    badges.push({
      id: "status",
      label: t(projectFileStatusLabelKey(file.status)),
      tone: file.status === "error" ? "error" : "neutral",
    })
  }

  return badges
}

function projectFileAriaLabel(
  file: ProjectFileEntry,
  kindLabel: string,
  badges: ProjectFileCompactBadge[],
  t: Translate,
): string {
  return [
    file.name,
    kindLabel,
    t(projectFileStatusLabelKey(file.status)),
    ...badges.map((badge) => badge.label),
  ].join(", ")
}

type ProjectAlert = {
  id: string
  tone: "info" | "warning" | "error"
  icon: "save" | "warning"
  title: string
  detail?: string
}

function ProjectAlerts({ alerts }: { alerts: ProjectAlert[] }) {
  const { t } = useI18n()
  return (
    <div className="project-alert-list" role="status" aria-label={t("projectSidebar.notice.alertsAria")}>
      {alerts.map((alert) => (
        <div key={alert.id} className={`project-alert project-alert--${alert.tone}`}>
          {alert.icon === "save" ? <Save size={15} /> : <AlertTriangle size={15} />}
          <span>
            <strong>{alert.title}</strong>
            {alert.detail ? <small>{alert.detail}</small> : null}
          </span>
        </div>
      ))}
    </div>
  )
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

function projectFolderAlerts(
  persistence: ProjectSidebarState["persistence"],
  validation: ProjectSidebarState["validation"],
  t: Translate,
): ProjectAlert[] {
  const alerts: ProjectAlert[] = []
  if (persistence === "dirty") {
    alerts.push({
      id: "persistence-dirty",
      tone: "warning",
      icon: "save",
      title: t("projectSidebar.notice.unsaved"),
      detail: t("projectSidebar.notice.unsavedDetail"),
    })
  } else if (persistence === "saving") {
    alerts.push({
      id: "persistence-saving",
      tone: "info",
      icon: "save",
      title: t("projectSidebar.notice.saving"),
    })
  } else if (persistence === "error") {
    alerts.push({
      id: "persistence-error",
      tone: "error",
      icon: "warning",
      title: t("projectSidebar.notice.saveError"),
    })
  }
  if (validation.state === "missing" || validation.state === "error") {
    alerts.push({
      id: `validation-${validation.state}`,
      tone: "error",
      icon: "warning",
      title: t("projectSidebar.notice.projectFilesIssue"),
      detail: t(validation.messageKey, validation.messageParams),
    })
  }
  return alerts
}
