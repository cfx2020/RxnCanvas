import {
  CheckCircle2,
  FileText,
  FolderOpen,
  FolderTree,
  Plus,
  Upload,
} from "lucide-react"
import type { ProjectSidebarState } from "./projectSidebarState"
import type { ProjectFileEntry, ProjectFileKind, ProjectFileStatus } from "./projectFiles"
import { graphRawFileDropMimeType, serializeGraphRawFileDropPayload } from "./graphRawFileDropPayload"
import { useI18n, type MessageKey } from "./i18n"

type ProjectSidebarProps = {
  state: ProjectSidebarState
  onOpenProject: (projectRef: string) => Promise<void>
  onImportProjectFiles: () => void
  onAddProjectFileToCanvas: (file: ProjectFileEntry) => void | Promise<void>
}

export function ProjectSidebar({
  state,
  onOpenProject,
  onImportProjectFiles,
  onAddProjectFileToCanvas,
}: ProjectSidebarProps) {
  const { t } = useI18n()
  const isBusy = state.status === "loading"

  return (
    <aside className="project-sidebar" aria-label={t("projectSidebar.aria")} aria-busy={isBusy}>
      <section className="rail-section project-sidebar-header">
        <p className="section-kicker">{t("projectSidebar.section")}</p>
        <h2>{t("projectSidebar.title")}</h2>
      </section>

      <section className="rail-section active-project-section" aria-label={t("projectSidebar.activeAria")}>
        <p className="section-kicker">{t("projectSidebar.activeSection")}</p>
        <h2>{state.activeProject?.name ?? t("projectSidebar.noActiveProject")}</h2>
        <p className="muted">{state.activeProject ? t("projectSidebar.projectReady") : t("projectSidebar.createOrOpen")}</p>

        <div className="project-state-grid">
          <StateRow label={t("projectSidebar.persistence")} value={persistenceLabel(state.persistence, t)} />
          <StateRow label={t("projectSidebar.validation")} value={validationLabel(state.validation.state, t)} />
        </div>
        <p className="validation-message">{t(state.validation.messageKey, state.validation.messageParams)}</p>
        {state.error ? (
          <div className="sidebar-error" role="alert">
            <strong>{state.error.code}</strong>
            <span>{state.error.message}</span>
            {state.error.target ? <small>{state.error.target}</small> : null}
          </div>
        ) : null}
      </section>

      <ProjectFilesPanel
        state={state}
        onImportProjectFiles={onImportProjectFiles}
        onAddProjectFileToCanvas={onAddProjectFileToCanvas}
      />

      <section className="rail-section project-switcher-section" aria-label={t("projectSidebar.projectsAria")}>
        <p className="section-kicker">{t("projectSidebar.projectsSection")}</p>
        {state.projects.length > 0 ? (
          <ul className="project-list">
            {state.projects.map((project) => {
              const isActive = project.projectRef === state.activeProjectRef
              return (
                <li key={project.projectRef}>
                  <button
                    type="button"
                    className={`project-list-button ${isActive ? "project-list-button--active" : ""}`}
                    onClick={() => onOpenProject(project.projectRef)}
                    aria-current={isActive ? "true" : undefined}
                    disabled={isBusy}
                  >
                    <FolderOpen size={16} />
                    <span>
                      <strong>{project.name}</strong>
                      <small>{t("projectSidebar.projectUpdated", { date: formatProjectUpdatedAt(project.updatedAt) })}</small>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted">{t("projectSidebar.noProjects")}</p>
        )}
      </section>
    </aside>
  )
}

type ProjectFilesPanelProps = {
  state: ProjectSidebarState
  onImportProjectFiles: () => void
  onAddProjectFileToCanvas: (file: ProjectFileEntry) => void | Promise<void>
}

function ProjectFilesPanel({ state, onImportProjectFiles, onAddProjectFileToCanvas }: ProjectFilesPanelProps) {
  const { t } = useI18n()
  const fileCount = state.projectFiles.length
  return (
    <section className="rail-section project-files-section" aria-label={t("projectSidebar.projectFiles.aria")}>
      <div className="project-files-header">
        <div>
          <p className="section-kicker">{t("projectSidebar.projectFiles.section")}</p>
          <h2>{t("projectSidebar.projectFiles.title")}</h2>
        </div>
        <button
          type="button"
          className="project-files-import-button"
          onClick={onImportProjectFiles}
          disabled={!state.activeProject}
          title={t("projectSidebar.projectFiles.import")}
          aria-label={t("projectSidebar.projectFiles.import")}
        >
          <Plus size={15} />
          <span>{t("projectSidebar.projectFiles.importShort")}</span>
        </button>
      </div>
      {!state.activeProject ? (
        <p className="project-files-empty">{t("projectSidebar.projectFiles.noActiveProject")}</p>
      ) : fileCount === 0 ? (
        <p className="project-files-empty">{t("projectSidebar.projectFiles.empty")}</p>
      ) : (
        <div className="project-tree" role="tree" aria-label={t("projectSidebar.projectFiles.listAria")}>
          <div className="project-tree-root" role="treeitem" aria-expanded="true">
            <FolderTree size={16} />
            <span>
              <strong>{state.activeProject.name}</strong>
              <small>
                {t(
                  fileCount === 1
                    ? "projectSidebar.projectFiles.countOne"
                    : "projectSidebar.projectFiles.count",
                  { count: fileCount },
                )}
              </small>
            </span>
          </div>
          <ul className="project-file-list" role="group">
            {state.projectFiles.map((file) => (
              <ProjectFileRow key={file.id} file={file} onAddProjectFileToCanvas={onAddProjectFileToCanvas} />
            ))}
          </ul>
        </div>
      )}
    </section>
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
          onClick={() => void onAddProjectFileToCanvas(file)}
        >
          <Upload size={15} />
          <span>{t("projectSidebar.projectFiles.addToCanvas")}</span>
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

type StateRowProps = {
  label: string
  value: string
}

function StateRow({ label, value }: StateRowProps) {
  return (
    <div className="project-state-row">
      <span>{label}</span>
      <strong>
        <CheckCircle2 size={15} />
        {value}
      </strong>
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

function persistenceLabel(state: ProjectSidebarState["persistence"], t: Translate): string {
  if (state === "dirty") return t("projectSidebar.persistence.dirty")
  if (state === "saving") return t("projectSidebar.persistence.saving")
  if (state === "persisted") return t("projectSidebar.persistence.persisted")
  if (state === "error") return t("projectSidebar.persistence.error")
  return t("projectSidebar.persistence.empty")
}

function validationLabel(state: ProjectSidebarState["validation"]["state"], t: Translate): string {
  if (state === "missing") return t("projectSidebar.validation.missing")
  if (state === "valid") return t("projectSidebar.validation.valid")
  if (state === "error") return t("projectSidebar.validation.error")
  return t("projectSidebar.validation.unknown")
}
