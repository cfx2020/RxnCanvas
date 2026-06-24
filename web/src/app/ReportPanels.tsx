import { memo, useMemo, useState, type ReactNode } from "react"
import { Download, X } from "lucide-react"
import {
  reportExportFormats,
  type ReportExportArtifact,
  type ReportExportOptions,
} from "../domain/reportExports"
import { kcalPerHartree, type EnergyDisplayOptions, type EnergyTableRow } from "./energyDisplay"
import { displayExportDestination, formatBytes } from "./fileDisplay"

export type ExportedReportArtifact = ReportExportArtifact & {
  destination?: string
}

export function ExportDock({
  options,
  artifacts,
  busy,
  status,
  rows,
  onOptionsChange,
  onExport,
}: {
  options: ReportExportOptions
  artifacts: ExportedReportArtifact[]
  busy: boolean
  status: string
  rows: EnergyTableRow[]
  onOptionsChange: (options: ReportExportOptions) => void
  onExport: () => void | Promise<void>
}) {
  const formats = options.formats

  return (
    <section className="export-panel" aria-label="Export panel">
      <div className="selected-title">
        <div>
          <span>Report Export</span>
          <strong>{options.title || "Reaction path report"}</strong>
        </div>
        <Download size={18} />
      </div>
      <div className="export-format-grid" aria-label="Export formats">
        {reportExportFormats().map((format) => (
          <label key={format} className="export-format-option">
            <input
              type="checkbox"
              aria-label={format.toUpperCase()}
              checked={formats.includes(format)}
              onChange={(event) => {
                onOptionsChange({
                  ...options,
                  formats: event.currentTarget.checked
                    ? [...formats, format]
                    : formats.filter((item) => item !== format),
                })
              }}
            />
            <span>{format.toUpperCase()}</span>
          </label>
        ))}
      </div>
      <div className="report-export-options" aria-label="Export options">
        <label className="export-field">
          <span>Basename</span>
          <input
            value={options.basename}
            onChange={(event) => onOptionsChange({ ...options, basename: event.currentTarget.value })}
            placeholder="rxnflow-report"
          />
        </label>
        <label className="export-field">
          <span>Report title</span>
          <input
            value={options.title}
            onChange={(event) => onOptionsChange({ ...options, title: event.currentTarget.value })}
            placeholder="Reaction path report"
          />
        </label>
      </div>
      <button type="button" className="command-button report-export-primary" disabled={busy || formats.length === 0} onClick={onExport}>
        <Download size={17} />
        <span>{busy ? "Exporting" : "Export"}</span>
      </button>
      <div className="artifact-list" aria-label="Export summary">
        {artifacts.length === 0 ? (
          <article className="artifact-card">
            <strong>{rows.length} table rows ready</strong>
            <code>{status}</code>
          </article>
        ) : artifacts.map((artifact) => (
          <article key={artifact.id} className="artifact-card">
            <strong>{artifact.format.toUpperCase()}</strong>
            <code>{artifact.fileName} / {formatBytes(artifact.byteLength)}</code>
            {artifact.destination ? <code>Saved to {displayExportDestination(artifact.destination)}</code> : null}
          </article>
        ))}
      </div>
    </section>
  )
}

type EnergyTableMode = "absolute" | "relative"

export const EnergyTableView = memo(function EnergyTableView({
  rows,
  outputUnit: _outputUnit,
  onSelectNode,
  onClose,
}: {
  rows: EnergyTableRow[]
  outputUnit: EnergyDisplayOptions["outputUnit"]
  onSelectNode: (nodeId: string) => void
  onClose?: () => void
}) {
  const [tableMode, setTableMode] = useState<EnergyTableMode>("absolute")
  const visibleRows = useMemo(
    () => tableMode === "relative" ? rows.filter((row) => row.showInRelativeTable) : rows,
    [rows, tableMode],
  )

  return (
    <section className="workbench-energy-table-panel" aria-label="Energy table">
      <header className="workbench-energy-table-header">
        <div>
          <p className="section-kicker">Table</p>
          <h2>Energy Table</h2>
        </div>
        <div className="workbench-energy-table-header-actions">
          <div className="workbench-energy-table-mode" role="group" aria-label="Energy table mode">
            <button
              type="button"
              className={tableMode === "absolute" ? "workbench-energy-table-mode-button--active" : ""}
              aria-pressed={tableMode === "absolute"}
              onClick={() => setTableMode("absolute")}
            >
              Absolute
            </button>
            <button
              type="button"
              className={tableMode === "relative" ? "workbench-energy-table-mode-button--active" : ""}
              aria-pressed={tableMode === "relative"}
              onClick={() => setTableMode("relative")}
            >
              Relative
            </button>
          </div>
          <span>{visibleRows.length} rows</span>
          {onClose ? (
            <button
              type="button"
              className="workbench-energy-table-close"
              aria-label="Close table view"
              title="Close table"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </header>
      {rows.length === 0 ? (
        <div className="workbench-energy-table-empty">
          <strong>No nodes</strong>
        </div>
      ) : (
        <div className="workbench-energy-table-wrap">
          <table className="workbench-energy-table">
            <thead>
              <tr>
                {energyTableHeaders(tableMode === "relative").map((header, index) => (
                  <th key={index}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.nodeId}>
                  <th scope="row">
                    <button type="button" onClick={() => onSelectNode(row.nodeId)}>{row.label}</button>
                  </th>
                  <td>{chargeMultiplicity(row)}</td>
                  <td>{row.formula || "-"}</td>
                  <td>{formatHartreeTableCell(row, "egasHartree", tableMode)}</td>
                  <td>{formatIntegerCell(tableNumberValue(row, "gasBasisFunctions", tableMode))}</td>
                  <td>{formatKcalFromHartreeCell(row, "egasHartree", tableMode)}</td>
                  <td>{formatHartreeTableCell(row, "ggasHartree", tableMode)}</td>
                  <td>{formatKcalFromHartreeCell(row, "ggasHartree", tableMode)}</td>
                  <td>{formatHartreeTableCell(row, "ggas1mHartree", tableMode)}</td>
                  <td>{formatKcalFromHartreeCell(row, "ggas1mHartree", tableMode)}</td>
                  <td>{formatHartreeTableCell(row, "ggasShermoHartree", tableMode)}</td>
                  <td>{formatKcalFromHartreeCell(row, "ggasShermoHartree", tableMode)}</td>
                  <td>{formatHartreeTableCell(row, "ggasShermo1mHartree", tableMode)}</td>
                  <td>{formatKcalFromHartreeCell(row, "ggasShermo1mHartree", tableMode)}</td>
                  <td>{formatHartreeTableCell(row, "esolHartree", tableMode)}</td>
                  <td>{formatIntegerCell(tableNumberValue(row, "solBasisFunctions", tableMode))}</td>
                  <td>{formatKcalFromHartreeCell(row, "esolHartree", tableMode)}</td>
                  <td>{formatNumberCell(tableNumberValue(row, "sgauTran", tableMode))}</td>
                  <td>{formatNumberCell(tableNumberValue(row, "swhitTran", tableMode))}</td>
                  <td>{formatNumberCell(tableNumberValue(row, "entropyDelta", tableMode))}</td>
                  <td>{formatHartreeTableCell(row, "entropyCorrectionHartree", tableMode)}</td>
                  <td>{formatHartreeTableCell(row, "standardStateCorrectionHartree", tableMode)}</td>
                  <td>{formatKcalFromHartreeCell(row, "gsolHartree", tableMode)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
})

function energyTableHeaders(relative: boolean): ReactNode[] {
  const prefix = relative ? "Δ" : ""
  return [
    "Structure",
    "Charge / Multiplicity",
    "Formula",
    <span>{prefix}E<sub>gas</sub></span>,
    <span>Basis functions <sub>gas</sub></span>,
    <span>{prefix}E<sub>gas</sub> × 627.5095</span>,
    <span>{prefix}G<sub>gas</sub></span>,
    <span>{prefix}G<sub>gas</sub> × 627.5095</span>,
    <span>{prefix}G<sub>gas</sub>+1M</span>,
    <span>{prefix}G<sub>gas</sub>+1M × 627.5095</span>,
    <span>{prefix}G<sub>gas</sub>(shermo)</span>,
    <span>{prefix}G<sub>gas</sub>(shermo) × 627.5095</span>,
    <span>{prefix}G<sub>gas</sub>(shermo+1M)</span>,
    <span>{prefix}G<sub>gas</sub>(shermo+1M) × 627.5095</span>,
    <span>{prefix}E<sub>sol</sub></span>,
    <span>Basis functions <sub>sol</sub></span>,
    <span>{prefix}E<sub>sol</sub> × 627.5095</span>,
    <span>{prefix}S<sub>gau,tran</sub></span>,
    <span>{prefix}S<sub>whit,tran</sub></span>,
    <span>{prefix}S<sub>gau,tran</sub> - {prefix}S<sub>whit,tran</sub></span>,
    <span>T*({prefix}S<sub>gau,tran</sub> - {prefix}S<sub>whit,tran</sub>)/1000</span>,
    "RT*0.239006/1000",
    <span>{prefix}G<sub>sol</sub></span>,
  ]
}

type HartreeEnergyTableKey =
  | "egasHartree"
  | "ggasHartree"
  | "ggas1mHartree"
  | "ggasShermoHartree"
  | "ggasShermo1mHartree"
  | "esolHartree"
  | "entropyCorrectionHartree"
  | "standardStateCorrectionHartree"
  | "gsolHartree"

type NumericEnergyTableKey =
  | HartreeEnergyTableKey
  | "gasBasisFunctions"
  | "solBasisFunctions"
  | "sgauTran"
  | "swhitTran"
  | "entropyDelta"

function chargeMultiplicity(row: EnergyTableRow): string {
  if (typeof row.charge !== "number" && typeof row.spinMultiplicity !== "number") return "-"
  return `${row.charge ?? "?"} / ${row.spinMultiplicity ?? "?"}`
}

function formatHartreeTableCell(
  row: EnergyTableRow,
  key: HartreeEnergyTableKey,
  mode: EnergyTableMode,
): string {
  const value = tableNumberValue(row, key, mode)
  if (typeof value !== "number") return "-"
  return formatHartreeNumber(value)
}

function formatKcalFromHartreeCell(
  row: EnergyTableRow,
  key: HartreeEnergyTableKey,
  mode: EnergyTableMode,
): string {
  const value = tableNumberValue(row, key, mode)
  if (typeof value !== "number") return "-"
  return formatKcalNumber(value * kcalPerHartree)
}

function tableNumberValue(row: EnergyTableRow, key: NumericEnergyTableKey, mode: EnergyTableMode): number | null {
  const table = mode === "relative" ? row.relativeEnergyTable : row.energyTable
  const value = table?.[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (mode === "absolute" && key === "egasHartree" && row.energyUnit === "hartree" && typeof row.gas === "number") return row.gas
  if (mode === "absolute" && key === "gsolHartree" && row.energyUnit === "hartree" && typeof row.solution === "number") return row.solution
  return null
}

function formatIntegerCell(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.trunc(value)) : "-"
}

function formatNumberCell(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(6)).toString() : "-"
}

function formatHartreeNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : "-"
}

function formatKcalNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "-"
}
