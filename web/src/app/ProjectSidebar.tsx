import {
  AlertTriangle,
  ChevronRight,
  FileText,
  FolderOpen,
  FolderPlus,
  Plus,
  Save,
  Upload,
} from "lucide-react"
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react"
import type { BrowserProjectRef } from "../repository"
import type { ProjectSidebarState } from "./projectSidebarState"
import type { ProjectFileEntry, ProjectFileKind, ProjectFileStatus } from "./projectFiles"
import { graphRawFileDropMimeType, serializeGraphRawFileDropPayload } from "./graphRawFileDropPayload"
import { useI18n, type MessageKey } from "./i18n"

type ProjectSidebarProps = {
  state: ProjectSidebarState
  onCreateProject: (name: string) => Promise<void>
  onOpenProject: (projectRef: string) => Promise<void>
  onImportProjectFiles: (projectRef: string, files?: File[]) => void | Promise<void>
  onAddProjectFileToCanvas: (file: ProjectFileEntry) => void | Promise<void>
}

export function ProjectSidebar({
  state,
  onCreateProject,
  onOpenProject,
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

  const toggleProjectFolder = (projectRef: string) => {
    setExpandedProjectRefs((current) => {
      const next = new Set(current)
      if (next.has(projectRef)) next.delete(projectRef)
      else next.add(projectRef)
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
        onToggleProjectFolder={toggleProjectFolder}
        onOpenProject={onOpenProject}
        onImportProjectFiles={onImportProjectFiles}
        onAddProjectFileToCanvas={onAddProjectFileToCanvas}
      />
    </aside>
  )
}

type ProjectFoldersPanelProps = {
  state: ProjectSidebarState
  expandedProjectRefs: Set<string>
  onToggleProjectFolder: (projectRef: string) => void
  onOpenProject: (projectRef: string) => Promise<void>
  onImportProjectFiles: (projectRef: string, files?: File[]) => void | Promise<void>
  onAddProjectFileToCanvas: (file: ProjectFileEntry) => void | Promise<void>
}

function ProjectFoldersPanel({
  state,
  expandedProjectRefs,
  onToggleProjectFolder,
  onOpenProject,
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
              onToggleProjectFolder={onToggleProjectFolder}
              onOpenProject={onOpenProject}
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
  onToggleProjectFolder: (projectRef: string) => void
  onOpenProject: (projectRef: string) => Promise<void>
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
  onToggleProjectFolder,
  onOpenProject,
  onImportProjectFiles,
  onAddProjectFileToCanvas,
}: ProjectFolderProps) {
  const { t } = useI18n()
  const fileCount = projectFiles.length
  const projectAlerts = active ? projectFolderAlerts(persistence, validation, t) : []

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

  return (
    <li
      className={`project-folder ${active ? "project-folder--active" : ""}`}
      role="treeitem"
      aria-expanded={expanded}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="project-folder-row">
        <button
          type="button"
          className="project-folder-toggle"
          onClick={() => onToggleProjectFolder(project.projectRef)}
          aria-label={t("projectSidebar.projectFiles.toggleFolder", { name: project.name })}
          aria-expanded={expanded}
        >
          <ChevronRight size={15} />
        </button>
        <button
          type="button"
          className="project-folder-main"
          onClick={() => onOpenProject(project.projectRef)}
          aria-current={active ? "true" : undefined}
          disabled={isBusy}
        >
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
      {expanded ? (
        <div className="project-folder-contents" role="group">
          {active ? (
            <>
              {projectAlerts.length > 0 ? <ProjectAlerts alerts={projectAlerts} /> : null}
              {fileCount === 0 ? (
                <p className="project-files-empty">{t("projectSidebar.projectFiles.empty")}</p>
              ) : (
                <ul className="project-file-list" role="group">
                  {projectFiles.map((file) => (
                    <ProjectFileRow key={file.id} file={file} onAddProjectFileToCanvas={onAddProjectFileToCanvas} />
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="project-files-empty">{t("projectSidebar.projectFiles.openFolderHint")}</p>
          )}
          <p className="project-folder-drop-hint">{t("projectSidebar.projectFiles.dropHint")}</p>
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
  return (
    <li
      className={`project-file-card project-file-card--${file.status} ${draggable ? "project-file-card--draggable" : ""}`}
      role="treeitem"
      draggable={draggable}
      onDragStart={draggable ? (event) => {
        event.dataTransfer.effectAllowed = "copy"
        event.dataTransfer.setData(graphRawFileDropMimeType, serializeGraphRawFileDropPayload({
          kind: "project-file",
          projectFileId: file.id,
          path: file.path,
        }))
      } : undefined}
    >
      <div className="project-file-title-row">
        <span className="project-file-icon" aria-hidden="true">
          <FileText size={16} />
        </span>
        <span className="project-file-title">
          <strong title={file.name}>{file.name}</strong>
          <small>{projectFileTreeHint(file, t)}</small>
        </span>
      </div>
      <div className="project-file-meta-row">
        <span>{t(projectFileKindLabelKey(file.kind))}</span>
        <span className={`project-file-status project-file-status--${file.status}`}>
          {t(projectFileStatusLabelKey(file.status))}
        </span>
        {typeof file.byteSize === "number" ? (
          <span>{formatFileByteSize(file.byteSize)}</span>
        ) : null}
      </div>
      {projectFileUsageCount(file) > 0 ? (
        <div className="project-file-usage-row">
          {projectFileUsageSummary(file, t)}
        </div>
      ) : null}
      {draggable ? (
        <button
          type="button"
          className="project-file-add-button"
          aria-label={t("projectSidebar.projectFiles.addToCanvas")}
          title={t("projectSidebar.projectFiles.addToCanvas")}
          onClick={() => void onAddProjectFileToCanvas(file)}
        >
          <Upload size={15} />
          <span className="visually-hidden">{t("projectSidebar.projectFiles.addToCanvas")}</span>
        </button>
      ) : null}
      {file.warnings.length > 0 ? (
        <div className="project-file-warning-row" role="status">
          {t("projectSidebar.projectFiles.warningCount", { count: file.warnings.length })}
        </div>
      ) : null}
    </li>
  )
}

function isDraggableRawProjectFile(file: ProjectFileEntry): boolean {
  return file.path.startsWith("inputs/raw/") && file.kind !== "export-artifact"
}

function projectFileUsageCount(file: ProjectFileEntry): number {
  return file.graphNodeIds.length || file.registeredObjectIds.length || file.artifactIds.length
}

function projectFileTreeHint(file: ProjectFileEntry, t: Translate): string {
  if (file.status === "used-in-graph" && file.graphNodeIds.length > 0) {
    return t("projectSidebar.projectFiles.hint.usedInGraph", { count: file.graphNodeIds.length })
  }
  if (file.status === "registered" && file.registeredObjectIds.length > 0) {
    return t("projectSidebar.projectFiles.hint.registered", { count: file.registeredObjectIds.length })
  }
  if (file.status === "previewed") return t("projectSidebar.projectFiles.hint.previewed")
  return t("projectSidebar.projectFiles.hint.drag")
}

function projectFileUsageSummary(file: ProjectFileEntry, t: Translate): string {
  if (file.graphNodeIds.length > 0) {
    return t("projectSidebar.projectFiles.usage.graphNodes", { count: file.graphNodeIds.length })
  }
  if (file.registeredObjectIds.length > 0) {
    return t("projectSidebar.projectFiles.usage.objects", { count: file.registeredObjectIds.length })
  }
  return t("projectSidebar.projectFiles.usage.artifacts", { count: file.artifactIds.length })
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

function formatFileByteSize(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize} B`
  const kib = byteSize / 1024
  if (kib < 1024) return `${kib.toFixed(1)} KiB`
  return `${(kib / 1024).toFixed(1)} MiB`
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
