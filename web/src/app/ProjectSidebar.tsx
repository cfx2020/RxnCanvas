import { useState, type FormEvent } from "react"
import {
  CheckCircle2,
  FileText,
  FolderOpen,
  HardDrive,
  Plus,
  RefreshCw,
  Save,
  Upload,
} from "lucide-react"
import { browserProjectBackendId } from "../repository"
import type { ProjectSidebarState } from "./projectSidebarState"
import type { ProjectFileEntry, ProjectFileKind, ProjectFileStatus } from "./projectFiles"
import { graphRawFileDropMimeType, serializeGraphRawFileDropPayload } from "./graphRawFileDropPayload"
import { useI18n, type MessageKey } from "./i18n"

type ProjectSidebarProps = {
  state: ProjectSidebarState
  onRefreshProjects: () => Promise<void>
  onCreateProject: (name: string) => Promise<ProjectSidebarState>
  onOpenProject: (projectRef: string) => Promise<void>
  onSaveProjectContent: () => Promise<void>
  onAddProjectFileToCanvas: (file: ProjectFileEntry) => void | Promise<void>
}

export function ProjectSidebar({
  state,
  onRefreshProjects,
  onCreateProject,
  onOpenProject,
  onSaveProjectContent,
  onAddProjectFileToCanvas,
}: ProjectSidebarProps) {
  const { t } = useI18n()
  const [projectName, setProjectName] = useState("")
  const isBusy = state.status === "loading"

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextState = await onCreateProject(projectName)
    if (nextState.status === "ready") {
      setProjectName("")
    }
  }

  return (
    <aside className="project-sidebar" aria-label={t("projectSidebar.aria")} aria-busy={isBusy}>
      <section className="rail-section project-sidebar-header">
        <p className="section-kicker">{t("projectSidebar.section")}</p>
        <h2>{t("projectSidebar.title")}</h2>
        <div className="sidebar-badge-row">
          <span className="local-only-badge">{t("workbench.localOnly")}</span>
          <span className="backend-badge">
            <HardDrive size={15} />
            <span>{browserProjectBackendId}</span>
          </span>
        </div>
      </section>

      <section className="rail-section active-project-section" aria-label={t("projectSidebar.activeAria")}>
        <p className="section-kicker">{t("projectSidebar.activeSection")}</p>
        <h2>{state.activeProject?.name ?? t("projectSidebar.noActiveProject")}</h2>
        <p className="muted">{state.activeProjectRef ?? t("projectSidebar.createOrOpen")}</p>

        <div className="project-state-grid">
          <StateRow label={t("projectSidebar.persistence")} value={persistenceLabel(state.persistence, t)} />
          <StateRow label={t("projectSidebar.validation")} value={validationLabel(state.validation.state, t)} />
          <StateRow label={t("projectSidebar.bridge")} value={bridgeLabel(state.bridge.state, t)} />
        </div>
        <p className="validation-message">{t(state.validation.messageKey, state.validation.messageParams)}</p>
        {state.validation.checksum ? (
          <code className="checksum-chip">{state.validation.checksum}</code>
        ) : null}

        <button
          type="button"
          className="sidebar-command-button save-content-button"
          onClick={onSaveProjectContent}
          disabled={isBusy || !state.activeProject}
        >
          <Save size={16} />
          <span>{t("projectSidebar.saveContent")}</span>
        </button>

        {state.error ? (
          <div className="sidebar-error" role="alert">
            <strong>{state.error.code}</strong>
            <span>{state.error.message}</span>
            {state.error.target ? <small>{state.error.target}</small> : null}
          </div>
        ) : null}
      </section>

      <ProjectFilesPanel state={state} onAddProjectFileToCanvas={onAddProjectFileToCanvas} />

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
                      <small>{project.projectRef}</small>
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

      <form className="rail-section project-create-form" aria-label={t("projectSidebar.createFormAria")} onSubmit={handleCreateProject}>
        <label htmlFor="project-sidebar-name">{t("projectSidebar.projectName")}</label>
        <input
          id="project-sidebar-name"
          value={projectName}
          onChange={(event) => setProjectName(event.currentTarget.value)}
          placeholder={t("projectSidebar.projectNamePlaceholder")}
          disabled={isBusy}
        />
        <div className="project-command-row">
          <button type="submit" className="sidebar-command-button" disabled={isBusy}>
            <Plus size={16} />
            <span>{t("projectSidebar.createProject")}</span>
          </button>
          <button
            type="button"
            className="sidebar-command-button sidebar-command-button--secondary"
            onClick={onRefreshProjects}
            disabled={isBusy}
          >
            <RefreshCw size={16} />
            <span>{t("projectSidebar.refresh")}</span>
          </button>
        </div>
      </form>
    </aside>
  )
}

type ProjectFilesPanelProps = {
  state: ProjectSidebarState
  onAddProjectFileToCanvas: (file: ProjectFileEntry) => void | Promise<void>
}

function ProjectFilesPanel({ state, onAddProjectFileToCanvas }: ProjectFilesPanelProps) {
  const { t } = useI18n()
  const fileCount = state.projectFiles.length
  return (
    <section className="rail-section project-files-section" aria-label={t("projectSidebar.projectFiles.aria")}>
      <div className="project-files-header">
        <div>
          <p className="section-kicker">{t("projectSidebar.projectFiles.section")}</p>
          <h2>{t("projectSidebar.projectFiles.title")}</h2>
        </div>
        <span className="project-files-count">
          {t(
            fileCount === 1
              ? "projectSidebar.projectFiles.countOne"
              : "projectSidebar.projectFiles.count",
            { count: fileCount },
          )}
        </span>
      </div>
      {!state.activeProject ? (
        <p className="project-files-empty">{t("projectSidebar.projectFiles.noActiveProject")}</p>
      ) : fileCount === 0 ? (
        <p className="project-files-empty">{t("projectSidebar.projectFiles.empty")}</p>
      ) : (
        <ul className="project-file-list" aria-label={t("projectSidebar.projectFiles.listAria")}>
          {state.projectFiles.map((file) => (
            <ProjectFileRow key={file.id} file={file} onAddProjectFileToCanvas={onAddProjectFileToCanvas} />
          ))}
        </ul>
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
          <small>{file.path}</small>
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
      {file.checksum ? (
        <code className="project-file-checksum">{file.checksum}</code>
      ) : null}
      {projectFileReferenceIds(file).length > 0 ? (
        <div className="project-file-reference-row">
          {projectFileReferenceIds(file).map((id) => (
            <code key={id}>{id}</code>
          ))}
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
          {file.warnings.map((warning, index) => (
            <code key={`${warning}-${index}`}>{warning}</code>
          ))}
        </div>
      ) : null}
    </li>
  )
}

function isDraggableRawProjectFile(file: ProjectFileEntry): boolean {
  return file.path.startsWith("inputs/raw/") && file.kind !== "export-artifact"
}

function projectFileReferenceIds(file: ProjectFileEntry): string[] {
  return [
    ...file.registeredObjectIds,
    ...file.graphNodeIds,
    ...file.artifactIds,
  ]
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

function bridgeLabel(state: ProjectSidebarState["bridge"]["state"], t: Translate): string {
  if (state === "opening") return t("projectSidebar.bridge.opening")
  if (state === "open") return t("projectSidebar.bridge.open")
  if (state === "saving") return t("projectSidebar.bridge.saving")
  if (state === "error") return t("projectSidebar.bridge.error")
  return t("projectSidebar.bridge.idle")
}
