import { Activity, Calculator } from "lucide-react"
import type { ReactNode } from "react"
import type {
  CorrectionComponentSummary,
  EnergyComponentSummary,
  EnergyChannelSelectionSource,
  EnergyChannelSummary,
  EnergyExpressionMissingSummary,
  EnergyExpressionSummary,
  EnergyOutputUnit,
  EnergyProfilePointSummary,
  EnergyProfileSummary,
  EnergyValueSummary,
  ShellWarning,
  ObjectSummary,
  WorkspaceSummary,
} from "../shell"
import { useI18n } from "./i18n"

export type EnergyPanelOptions = {
  pathId: string
  outputUnit: EnergyOutputUnit
  energyKey: string
  energySource: EnergyChannelSelectionSource
  baselineNodeId: string
  correctionPolicyMode: "none" | "all" | "kinds" | "ids"
  correctionKinds: string[]
  correctionIds: string
}

type EnergyProfilePanelProps = {
  profile?: EnergyProfileSummary
  workspace?: WorkspaceSummary
  objects: ObjectSummary[]
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
  expression?: EnergyExpressionSummary | null
  warnings: ShellWarning[]
}

export function EnergyProfilePanel({
  profile,
  workspace,
  objects,
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
  const energyChannelOptions = energyChannelOptionsFromObjects(objects)
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
          <span>{t("energyPanel.energyChannel")}</span>
          <select
            value={channelSelectValue(options)}
            onChange={(event) => {
              const channel = energyChannelOptions.find((item) => item.value === event.currentTarget.value)
              if (!channel) return
              onOptionsChange({
                ...options,
                energyKey: channel.key,
                energySource: channel.source,
              })
            }}
            disabled={energyChannelOptions.length === 0}
          >
            {energyChannelOptions.length === 0 ? (
              <option value="">{t("energyPanel.noEnergyChannels")}</option>
            ) : null}
            {energyChannelOptions.map((channel) => (
              <option key={channel.value} value={channel.value}>
                {channel.label}
              </option>
            ))}
            <option value="custom">{t("energyPanel.customEnergyChannel")}</option>
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
          <span>{t("energyPanel.energySource")}</span>
          <select
            value={options.energySource}
            onChange={(event) => onOptionsChange({ ...options, energySource: event.currentTarget.value as EnergyChannelSelectionSource })}
          >
            <option value="auto">{t("energyPanel.energySource.auto")}</option>
            <option value="energies">energies</option>
            <option value="thermochemistry">thermochemistry</option>
          </select>
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

      <div className="energy-policy-panel" aria-label={t("energyPanel.correctionPolicyControls")}>
        <label className="energy-field">
          <span>{t("energyPanel.correctionPolicy")}</span>
          <select
            value={options.correctionPolicyMode}
            onChange={(event) => onOptionsChange({
              ...options,
              correctionPolicyMode: event.currentTarget.value as EnergyPanelOptions["correctionPolicyMode"],
            })}
          >
            <option value="none">{t("energyPanel.correctionPolicy.none")}</option>
            <option value="all">{t("energyPanel.correctionPolicy.all")}</option>
            <option value="kinds">{t("energyPanel.correctionPolicy.kinds")}</option>
            <option value="ids">{t("energyPanel.correctionPolicy.ids")}</option>
          </select>
        </label>
        {options.correctionPolicyMode === "kinds" ? (
          <div className="energy-kind-grid" aria-label={t("energyPanel.correctionKinds")}>
            {["solvation", "resonance", "manual"].map((kind) => (
              <label key={kind} className="energy-toggle">
                <input
                  type="checkbox"
                  checked={options.correctionKinds.includes(kind)}
                  onChange={(event) => onOptionsChange({
                    ...options,
                    correctionKinds: event.currentTarget.checked
                      ? Array.from(new Set([...options.correctionKinds, kind]))
                      : options.correctionKinds.filter((item) => item !== kind),
                  })}
                />
                <span>{kind}</span>
              </label>
            ))}
          </div>
        ) : null}
        {options.correctionPolicyMode === "ids" ? (
          <label className="energy-field">
            <span>{t("energyPanel.correctionIds")}</span>
            <input
              type="text"
              value={options.correctionIds}
              onChange={(event) => onOptionsChange({ ...options, correctionIds: event.currentTarget.value })}
              placeholder="corr-a, corr-b"
            />
          </label>
        ) : null}
      </div>

      <div className="energy-command-row">
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
          <EnergyExpressionDetails points={points} />
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

type EnergyChannelOption = {
  value: string
  key: string
  source: EnergyChannelSelectionSource
  label: string
}

function energyChannelOptionsFromObjects(objects: ObjectSummary[]): EnergyChannelOption[] {
  const channelMap = new Map<string, EnergyChannelSummary>()
  for (const object of objects) {
    for (const channel of object.energy_channels ?? []) {
      const id = `${channel.source}:${channel.key}`
      const existing = channelMap.get(id)
      if (existing) {
        channelMap.set(id, {
          ...existing,
          object_ids: Array.from(new Set([...existing.object_ids, ...channel.object_ids])),
        })
      } else {
        channelMap.set(id, { ...channel, object_ids: [...channel.object_ids] })
      }
    }
  }
  return Array.from(channelMap.values()).map((channel) => ({
    value: `${channel.source}:${channel.key}`,
    key: channel.key,
    source: channel.source,
    label: `${channel.source}:${channel.key} · ${channel.unit} · ${channel.object_ids.length}`,
  }))
}

function channelSelectValue(options: EnergyPanelOptions): string {
  const source = options.energySource === "auto" ? "" : options.energySource
  return source ? `${source}:${options.energyKey}` : "custom"
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

function EnergyExpressionDetails({ points }: { points: NormalizedEnergyPoint[] }) {
  const { t } = useI18n()
  const pointsWithExpression = points.filter((point) => point.expression)
  if (pointsWithExpression.length === 0) return null

  return (
    <div className="energy-expression-details" aria-label={t("energyPanel.expressionDetails")}>
      <strong>{t("energyPanel.expressionDetails")}</strong>
      {pointsWithExpression.map((point) => (
        <article key={point.nodeId} className="energy-expression-card">
          <header>
            <span>{point.label}</span>
            <code>{point.nodeId}</code>
            <small>{formatEnergyValue(point.expression?.total)}</small>
          </header>
          {point.expression?.terms.length ? (
            <ExpressionComponentList
              label={t("energyPanel.expressionTerms")}
              components={point.expression.terms}
              renderComponent={(component) => (
                <>
                  <code>{component.object_label ?? component.object_id}</code>
                  <span>{t("energyPanel.coefficient")} {formatCoefficient(component.coefficient)}</span>
                  <span>{component.energy_key} · {component.energy_source}</span>
                  <strong>{formatEnergyValue(component.contribution)}</strong>
                </>
              )}
            />
          ) : null}
          {point.expression?.corrections.length ? (
            <ExpressionComponentList
              label={t("energyPanel.expressionCorrections")}
              components={point.expression.corrections}
              renderComponent={(component) => (
                <>
                  <code>{component.correction_id}</code>
                  <span>{component.kind}</span>
                  <span>{t("energyPanel.coefficient")} {formatCoefficient(component.coefficient)}</span>
                  <strong>{formatEnergyValue(component.contribution)}</strong>
                </>
              )}
            />
          ) : null}
          {point.expression?.missing.length ? (
            <ExpressionMissingList missing={point.expression.missing} />
          ) : null}
        </article>
      ))}
    </div>
  )
}

function ExpressionComponentList<TComponent extends EnergyComponentSummary | CorrectionComponentSummary>({
  label,
  components,
  renderComponent,
}: {
  label: string
  components: TComponent[]
  renderComponent: (component: TComponent) => ReactNode
}) {
  return (
    <div className="energy-expression-block">
      <span>{label}</span>
      {components.map((component, index) => (
        <p key={`${label}-${index}`}>
          {renderComponent(component)}
        </p>
      ))}
    </div>
  )
}

function ExpressionMissingList({ missing }: { missing: EnergyExpressionMissingSummary[] }) {
  const { t } = useI18n()
  return (
    <div className="energy-expression-block missing">
      <span>{t("energyPanel.expressionMissing")}</span>
      {missing.map((item, index) => (
        <p key={`${item.code}-${index}`}>
          <code>{item.code}</code>
          {item.object_id ? <span>{item.object_id}</span> : null}
          {item.energy_key ? <span>{item.energy_key}</span> : null}
          {item.energy_source ? <span>{item.energy_source}</span> : null}
          <strong>{item.message}</strong>
        </p>
      ))}
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
      expression: point.expression,
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
    expression: point.expression,
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

function formatEnergyValue(value?: EnergyValueSummary | null): string {
  if (!value) return ""
  return `${formatEnergy(value.value)} ${value.unit}`
}

function formatCoefficient(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toString()
}
