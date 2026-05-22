import { useState, type FormEvent, type ReactNode } from "react"
import {
  Boxes,
  CheckCircle2,
  CloudCog,
  Download,
  FlaskConical,
  FolderOpen,
  HardDrive,
  Network,
  Plus,
  RefreshCw,
  Save,
  Upload,
} from "lucide-react"
import { browserProjectBackendId } from "../repository"
import type { WorkbenchDomainState } from "./workbenchState"
import type { ProjectSidebarState } from "./projectSidebarState"
import { useI18n } from "./i18n"

type ProjectSidebarProps = {
  state: ProjectSidebarState
  workbenchState: WorkbenchDomainState
  onRefreshProjects: () => Promise<void>
  onCreateProject: (name: string) => Promise<ProjectSidebarState>
  onOpenProject: (projectRef: string) => Promise<void>
  onSaveProjectContent: () => Promise<void>
  onOpenBridgeSession: () => Promise<void>
  onSaveBridgeSession: () => Promise<void>
}

export function ProjectSidebar({
  state,
  workbenchState,
  onRefreshProjects,
  onCreateProject,
  onOpenProject,
  onSaveProjectContent,
  onOpenBridgeSession,
  onSaveBridgeSession,
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

      <section className="rail-section" aria-label={t("projectSidebar.projectsAria")}>
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
        <div className="project-command-row">
          <button
            type="button"
            className="sidebar-command-button sidebar-command-button--secondary"
            onClick={onOpenBridgeSession}
            disabled={isBusy || !state.activeProject}
          >
            <CloudCog size={16} />
            <span>{t("projectSidebar.openBridge")}</span>
          </button>
          <button
            type="button"
            className="sidebar-command-button sidebar-command-button--secondary"
            onClick={onSaveBridgeSession}
            disabled={isBusy || !state.activeProject || !workbenchState.sessionId}
          >
            <Save size={16} />
            <span>{t("projectSidebar.saveBridge")}</span>
          </button>
        </div>

        {state.error ? (
          <div className="sidebar-error" role="alert">
            <strong>{state.error.code}</strong>
            <span>{state.error.message}</span>
            {state.error.target ? <small>{state.error.target}</small> : null}
          </div>
        ) : null}
      </section>

      <section className="rail-section bundle-entry-section" aria-label={t("projectSidebar.bundleAria")}>
        <p className="section-kicker">{t("projectSidebar.bundleSection")}</p>
        <div className="project-command-row">
          <button
            type="button"
            className="sidebar-command-button sidebar-command-button--secondary"
            disabled
          >
            <Upload size={16} />
            <span>{t("projectSidebar.importBundle")}</span>
          </button>
          <button
            type="button"
            className="sidebar-command-button sidebar-command-button--secondary"
            disabled
          >
            <Download size={16} />
            <span>{t("projectSidebar.exportBundle")}</span>
          </button>
        </div>
        <p className="bundle-unavailable-message">
          {t("projectSidebar.bundleUnavailable")}
        </p>
      </section>

      <section className="rail-section">
        <p className="section-kicker">{t("projectSidebar.snapshotSection")}</p>
        <h2>{workbenchState.project?.name ?? t("projectSidebar.noProjectLoaded")}</h2>
        <p className="muted">{workbenchState.project?.id ?? workbenchState.sessionId ?? t("projectSidebar.noShellSession")}</p>
      </section>

      <section className="rail-section metric-stack" aria-label={t("projectSidebar.objectSummaryAria")}>
        <Metric icon={<Boxes size={18} />} label={t("projectSidebar.objects")} value={workbenchState.counts.objects} />
        <Metric icon={<Network size={18} />} label={t("projectSidebar.graph")} value={workbenchState.counts.graphs} />
        <Metric
          icon={<FlaskConical size={18} />}
          label={t("projectSidebar.profilePoints")}
          value={workbenchState.profile?.point_count ?? 0}
        />
      </section>
    </aside>
  )
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

type MetricProps = {
  icon: ReactNode
  label: string
  value: number
}

function Metric({ icon, label, value }: MetricProps) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
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
