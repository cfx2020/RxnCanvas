import { memo, useMemo, useState, type ReactNode } from "react"
import { X } from "lucide-react"
import {
  reportExportCapability,
  type ReportExportArtifact,
  type ReportExportFormat,
} from "../domain/reportExports"
import { kcalPerHartree, type EnergyDisplayOptions, type EnergyTableRow } from "./energyDisplay"

export type ExportedReportArtifact = ReportExportArtifact & {
  destination?: string
}

export function ExportDock({
  busy,
  status,
  onExportFormat,
}: {
  busy: boolean
  status: string
  onExportFormat: (format: ReportExportFormat) => void | Promise<void>
}) {
  const formats: ReportExportFormat[] = ["png", "xlsx", "cdxml"]

  return (
    <section className="export-panel export-menu" aria-label="Export panel">
      <div className="export-menu-list" role="menu" aria-label="Export formats">
        {formats.map((format) => (
          <button
            key={format}
            type="button"
            role="menuitem"
            className="export-menu-item"
            disabled={busy}
            onClick={() => onExportFormat(format)}
          >
            {reportExportCapability(format).label}
          </button>
        ))}
      </div>
      <span className="visually-hidden" role="status">{status}</span>
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
                  <td>{formatHartreeTableCell(row, "egasHartree", tableMode)}</td>
                  <td>{formatKcalFromHartreeCell(row, "egasHartree", tableMode)}</td>
                  <td>{formatIntegerCell(tableNumberValue(row, "gasBasisFunctions", tableMode))}</td>
                  <td>{formatHartreeTableCell(row, "ggasHartree", tableMode)}</td>
                  <td>{formatKcalFromHartreeCell(row, "ggasHartree", tableMode)}</td>
                  <td>{formatHartreeTableCell(row, "ggas1mHartree", tableMode)}</td>
                  <td>{formatKcalFromHartreeCell(row, "ggas1mHartree", tableMode)}</td>
                  <td>{formatHartreeTableCell(row, "esolHartree", tableMode)}</td>
                  <td>{formatKcalFromHartreeCell(row, "esolHartree", tableMode)}</td>
                  <td>{formatIntegerCell(tableNumberValue(row, "solBasisFunctions", tableMode))}</td>
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
    "Charge / Mult.",
    <span>{prefix}E<sub>gas</sub>(Eh)</span>,
    <span>{prefix}E<sub>gas</sub>(kcal/mol)</span>,
    <span>Basis<sub>gas</sub></span>,
    <span>{prefix}G<sub>gas</sub>(Eh)</span>,
    <span>{prefix}G<sub>gas</sub>(kcal/mol)</span>,
    <span>{prefix}G<sub>gas</sub>+1M(Eh)</span>,
    <span>{prefix}G<sub>gas</sub>+1M(kcal/mol)</span>,
    <span>{prefix}E<sub>sol</sub>(Eh)</span>,
    <span>{prefix}E<sub>sol</sub>(kcal/mol)</span>,
    <span>Basis<sub>sol</sub></span>,
    <span>{prefix}G<sub>sol</sub>(kcal/mol)</span>,
  ]
}

type HartreeEnergyTableKey =
  | "egasHartree"
  | "ggasHartree"
  | "ggas1mHartree"
  | "esolHartree"
  | "gsolHartree"

type NumericEnergyTableKey =
  | HartreeEnergyTableKey
  | "gasBasisFunctions"
  | "solBasisFunctions"

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

function formatHartreeNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : "-"
}

function formatKcalNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "-"
}
