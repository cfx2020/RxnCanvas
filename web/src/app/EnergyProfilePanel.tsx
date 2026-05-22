import { Activity, Calculator } from "lucide-react"
import type {
  EnergyOutputUnit,
  EnergyProfilePointSummary,
  EnergyProfileSummary,
  EnergyValueSummary,
  ShellWarning,
  WorkspaceSummary,
} from "../shell"
import { useI18n } from "./i18n"

export type EnergyPanelOptions = {
  pathId: string
  outputUnit: EnergyOutputUnit
  includeCorrections: boolean
  energyKey: string
  baselineNodeId: string
}

type EnergyProfilePanelProps = {
  profile?: EnergyProfileSummary
  workspace?: WorkspaceSummary
  options: EnergyPanelOptions
  disabled: boolean
  warnings: ShellWarning[]
  onOptionsChange: (options: EnergyPanelOptions) => void
  onCompute: () => void
}

type NormalizedEnergyPoint = {
  nodeId: string
  label: string
  value?: number
  unit?: string
  missingReason?: string
  warnings: ShellWarning[]
}

export function EnergyProfilePanel({
  profile,
  workspace,
  options,
  disabled,
  warnings,
  onOptionsChange,
  onCompute,
}: EnergyProfilePanelProps) {
  const { t } = useI18n()
  const paths = workspace?.graph.paths ?? []
  const selectedPath = paths.find((path) => path.id === options.pathId)
  const baselineNodeIds = selectedPath?.node_ids ?? []
  const points = profile?.points.map(normalizeEnergyPoint) ?? []
  const panelWarnings = uniqueWarnings([
    ...warnings,
    ...(profile?.warnings ?? []),
    ...points.flatMap((point) => point.warnings),
  ])

  return (
    <section className="energy-profile-panel" aria-label={t("energyPanel.aria")}>
      <div className="energy-panel-header">
        <div>
          <p className="section-kicker">{t("energyPanel.section")}</p>
          <h2>{profile?.id ?? t("energyPanel.noProfile")}</h2>
        </div>
        <span className="energy-unit-badge">{profile?.output_unit ?? options.outputUnit}</span>
      </div>

      <div className="energy-options-grid" aria-label={t("energyPanel.options")}>
        <label className="energy-field">
          <span>{t("energyPanel.path")}</span>
          <select
            value={options.pathId}
            onChange={(event) => onOptionsChange({ ...options, pathId: event.currentTarget.value, baselineNodeId: "" })}
            disabled={paths.length === 0}
          >
            {paths.length === 0 ? (
              <option value="">{t("energyPanel.noPath")}</option>
            ) : null}
            {paths.map((path) => (
              <option key={path.id} value={path.id}>
                {path.id}
              </option>
            ))}
          </select>
        </label>

        <label className="energy-field">
          <span>{t("energyPanel.outputUnit")}</span>
          <select
            value={options.outputUnit}
            onChange={(event) => onOptionsChange({ ...options, outputUnit: event.currentTarget.value as EnergyOutputUnit })}
          >
            <option value="kcal_mol">kcal_mol</option>
            <option value="kj_mol">kj_mol</option>
          </select>
        </label>

        <label className="energy-field">
          <span>{t("energyPanel.energyKey")}</span>
          <input
            type="text"
            value={options.energyKey}
            onChange={(event) => onOptionsChange({ ...options, energyKey: event.currentTarget.value })}
            placeholder="electronic"
          />
        </label>

        <label className="energy-field">
          <span>{t("energyPanel.baseline")}</span>
          <select
            value={options.baselineNodeId}
            onChange={(event) => onOptionsChange({ ...options, baselineNodeId: event.currentTarget.value })}
            disabled={baselineNodeIds.length === 0}
          >
            <option value="">{t("energyPanel.defaultBaseline")}</option>
            {baselineNodeIds.map((nodeId) => (
              <option key={nodeId} value={nodeId}>
                {nodeId}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="energy-command-row">
        <label className="energy-toggle">
          <input
            type="checkbox"
            checked={options.includeCorrections}
            onChange={(event) => onOptionsChange({ ...options, includeCorrections: event.currentTarget.checked })}
          />
          <span>{t("energyPanel.includeCorrections")}</span>
        </label>
        <button
          type="button"
          className="command-button"
          onClick={onCompute}
          disabled={disabled}
        >
          <Calculator size={17} />
          <span>{t("energyPanel.compute")}</span>
        </button>
      </div>

      <div className="energy-profile-summary">
        <SummaryValue label={t("energyPanel.profile")} value={profile?.id} />
        <SummaryValue label={t("energyPanel.path")} value={profile?.path_id ?? options.pathId} />
        <SummaryValue label={t("energyPanel.baseline")} value={profile?.baseline_node_id} />
        <SummaryValue label={t("energyPanel.points")} value={profile?.point_count} />
      </div>

      {profile && points.length > 0 ? (
        <>
          <EnergyCurvePreview points={points} />
          <EnergyTable points={points} />
        </>
      ) : (
        <div className="energy-empty-state">
          <Activity size={22} />
          <strong>{t("energyPanel.empty")}</strong>
          <span>{t("energyPanel.emptyDetail")}</span>
        </div>
      )}

      {panelWarnings.length > 0 ? (
        <div className="energy-warning-list" aria-label={t("energyPanel.warnings")}>
          <strong>{t("energyPanel.warnings")}</strong>
          {panelWarnings.map((warning, index) => (
            <p key={`${warning.code}-${warning.target ?? "target"}-${index}`}>
              <code>{warning.code}</code>
              <span>{warning.message}</span>
              {warning.target ? <small>{warning.target}</small> : null}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function SummaryValue({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <span>{label}</span>
      <code>{value ?? "none"}</code>
    </div>
  )
}

function EnergyTable({ points }: { points: NormalizedEnergyPoint[] }) {
  const { t } = useI18n()

  return (
    <div className="energy-table-wrap">
      <table className="energy-table">
        <thead>
          <tr>
            <th>{t("energyPanel.structure")}</th>
            <th>{t("energyPanel.node")}</th>
            <th>{t("energyPanel.relative")}</th>
            <th>{t("energyPanel.unit")}</th>
            <th>{t("energyPanel.missingReason")}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.nodeId}>
              <td>{point.label}</td>
              <td><code>{point.nodeId}</code></td>
              <td>{point.value === undefined ? "" : formatEnergy(point.value)}</td>
              <td>{point.unit ?? ""}</td>
              <td>{point.missingReason ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EnergyCurvePreview({ points }: { points: NormalizedEnergyPoint[] }) {
  const { t } = useI18n()
  const drawable = points
    .map((point, index) => ({ ...point, index }))
    .filter((point): point is NormalizedEnergyPoint & { index: number; value: number } => point.value !== undefined)
  const width = 260
  const height = 132
  const padding = 22
  const minValue = drawable.length > 0 ? Math.min(...drawable.map((point) => point.value)) : 0
  const maxValue = drawable.length > 0 ? Math.max(...drawable.map((point) => point.value)) : 0
  const span = Math.max(maxValue - minValue, 1)
  const xFor = (index: number) => {
    const denominator = Math.max(points.length - 1, 1)
    return padding + (index / denominator) * (width - padding * 2)
  }
  const yFor = (value: number) => padding + ((maxValue - value) / span) * (height - padding * 2)
  const path = drawable.map((point) => `${xFor(point.index)},${yFor(point.value)}`).join(" ")

  return (
    <figure className="energy-curve-preview">
      <figcaption>{t("energyPanel.curve")}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("energyPanel.curve")}>
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
        {drawable.length > 1 ? <polyline points={path} /> : null}
        {drawable.map((point) => (
          <g key={point.nodeId}>
            <circle cx={xFor(point.index)} cy={yFor(point.value)} r="4" />
            <text x={xFor(point.index)} y={yFor(point.value) - 8}>{formatEnergy(point.value)}</text>
          </g>
        ))}
      </svg>
    </figure>
  )
}

function normalizeEnergyPoint(point: EnergyProfilePointSummary): NormalizedEnergyPoint {
  const relative = point.relative_energy
  if (typeof relative === "number") {
    return {
      nodeId: point.node_id,
      label: point.label,
      value: relative,
      unit: point.unit ?? undefined,
      missingReason: point.missing_reason ?? undefined,
      warnings: point.warnings ?? [],
    }
  }
  const valueSummary = isEnergyValueSummary(relative) ? relative : undefined
  return {
    nodeId: point.node_id,
    label: point.label,
    value: valueSummary?.value,
    unit: valueSummary?.unit ?? point.unit ?? undefined,
    missingReason: point.missing_reason ?? undefined,
    warnings: point.warnings ?? [],
  }
}

function isEnergyValueSummary(value: unknown): value is EnergyValueSummary {
  return typeof value === "object"
    && value !== null
    && "value" in value
    && typeof (value as EnergyValueSummary).value === "number"
}

function uniqueWarnings(warnings: ShellWarning[]): ShellWarning[] {
  const seen = new Set<string>()
  const result: ShellWarning[] = []
  for (const warning of warnings) {
    const key = `${warning.code}\n${warning.message}\n${warning.target ?? ""}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(warning)
    }
  }
  return result
}

function formatEnergy(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
}
