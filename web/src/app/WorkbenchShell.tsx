import { useCallback, useState, type ReactNode } from "react"
import { AlertTriangle, Boxes, CircleDot, FlaskConical, Network, Play } from "lucide-react"
import type { FixtureRunData, ShellClient } from "../shell"
import {
  initialWorkbenchShellState,
  projectFixtureResponse,
  type WorkbenchShellState,
} from "./workbenchState"

type WorkbenchShellProps = {
  shellClient: ShellClient
}

export function WorkbenchShell({ shellClient }: WorkbenchShellProps) {
  const [workbenchState, setWorkbenchState] = useState<WorkbenchShellState>(
    initialWorkbenchShellState,
  )

  const runFixture = useCallback(async () => {
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })
    setWorkbenchState(projectFixtureResponse(response))
  }, [shellClient])

  const runInvalidCommand = useCallback(async () => {
    setWorkbenchState((current) => ({ ...current, status: "running", error: undefined }))
    const response = await shellClient.run({
      command: "missing.command",
      args: {},
    })
    setWorkbenchState({
      ...initialWorkbenchShellState,
      status: "error",
      warnings: response.warnings,
      error: response.error ?? undefined,
    })
  }, [shellClient])

  return (
    <div className="workbench-shell">
      <header className="workbench-topbar">
        <div className="brand-lockup" aria-label="RxnFlow">
          <span className="brand-mark">Rf</span>
          <div>
            <p className="brand-eyebrow">RxnFlow</p>
            <h1>Workbench</h1>
          </div>
        </div>
        <div className="topbar-status">
          <span className="local-only-badge">Local-only</span>
          <span className={`run-state run-state--${workbenchState.status}`}>
            {statusLabel(workbenchState.status)}
          </span>
        </div>
      </header>

      <main className="workbench-grid" aria-label="RxnFlow web workbench">
        <ProjectRail state={workbenchState} />
        <GraphWorkspaceFrame state={workbenchState} />
        <InspectorPanel
          state={workbenchState}
          onRunFixture={runFixture}
          onRunInvalidCommand={runInvalidCommand}
        />
      </main>
    </div>
  )
}

type StateProps = {
  state: WorkbenchShellState
}

function ProjectRail({ state }: StateProps) {
  return (
    <aside className="project-rail" aria-label="Project and object summary">
      <section className="rail-section">
        <p className="section-kicker">Project</p>
        <h2>{state.projectName ?? "No project loaded"}</h2>
        <p className="muted">{state.projectId ?? "No shell session"}</p>
      </section>

      <section className="rail-section metric-stack" aria-label="Object summary">
        <Metric icon={<Boxes size={18} />} label="Objects" value={state.objectCount} />
        <Metric icon={<Network size={18} />} label="Graph" value={state.graphId ? 1 : 0} />
        <Metric icon={<FlaskConical size={18} />} label="Profile points" value={state.profilePointCount} />
      </section>
    </aside>
  )
}

function GraphWorkspaceFrame({ state }: StateProps) {
  const hasFixture = state.status === "success"

  return (
    <section className="graph-workspace" aria-label="Graph workspace">
      <div className="workspace-toolbar">
        <div>
          <p className="section-kicker">Graph workspace</p>
          <h2>{state.graphId ?? "Awaiting shell response"}</h2>
        </div>
        <span>{state.sessionId ?? "No session"}</span>
      </div>

      <div className="path-board" aria-label="Fixture reaction path preview">
        <div className={`path-node ${hasFixture ? "path-node--active" : ""}`}>
          <CircleDot size={18} />
          <span>Object A</span>
        </div>
        <div className="path-edge" />
        <div className={`path-node ${hasFixture ? "path-node--active" : ""}`}>
          <CircleDot size={18} />
          <span>Object B</span>
        </div>
      </div>
    </section>
  )
}

type InspectorPanelProps = {
  state: WorkbenchShellState
  onRunFixture: () => void
  onRunInvalidCommand: () => void
}

function InspectorPanel({ state, onRunFixture, onRunInvalidCommand }: InspectorPanelProps) {
  return (
    <aside className="inspector-panel" aria-label="Command and profile inspector">
      <section className="command-panel">
        <p className="section-kicker">Shell command</p>
        <div className="command-actions">
          <button type="button" className="command-button" onClick={onRunFixture}>
            <Play size={17} />
            <span>Fixture Run</span>
          </button>
          <button type="button" className="icon-button" onClick={onRunInvalidCommand} title="Invalid command">
            <AlertTriangle size={17} />
          </button>
        </div>
      </section>

      <section className="inspector-section">
        <p className="section-kicker">Energy profile</p>
        <h2>{state.profileId ?? "No profile"}</h2>
        <p className="muted">
          {state.profilePointCount > 0
            ? `${state.profilePointCount} profile points`
            : "Awaiting shell projection"}
        </p>
      </section>

      <section className="inspector-section">
        <p className="section-kicker">Command status</p>
        <CommandStatusPanel state={state} />
      </section>
    </aside>
  )
}

function CommandStatusPanel({ state }: StateProps) {
  if (state.error) {
    return (
      <div className="status-box status-box--error" role="alert">
        <strong>{state.error.code}</strong>
        <span>{state.error.message}</span>
      </div>
    )
  }

  return (
    <div className="status-box">
      <strong>{statusLabel(state.status)}</strong>
      <span>{state.artifactCount} artifacts indexed</span>
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

function statusLabel(status: WorkbenchShellState["status"]): string {
  if (status === "running") return "Running"
  if (status === "success") return "Ready"
  if (status === "error") return "Error"
  return "Idle"
}
