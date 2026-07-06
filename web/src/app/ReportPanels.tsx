import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { FileCode2, FileImage, Table2, X } from "lucide-react"
import type { FlowEdge, FlowNode } from "../domain/projectPackages"
import {
  reportExportCapability,
  type ReportExportArtifact,
  type ReportExportFormat,
} from "../domain/reportExports"
import {
  energyTableCellText,
  energyTableColumnSpecs,
  sortedEnergyTableRows,
  visibleEnergyTableRows,
  type EnergyDisplayOptions,
  type EnergyTableColumnSpec,
  type EnergyTableMode,
  type EnergyTableRow,
} from "./energyDisplay"

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
  const formatMeta: Record<ReportExportFormat, { description: string; icon: ReactNode }> = {
    png: { description: "Energy diagram image", icon: <FileImage size={16} /> },
    xlsx: { description: "Energy table workbook", icon: <Table2 size={16} /> },
    cdxml: { description: "ChemDraw diagram", icon: <FileCode2 size={16} /> },
  }

  return (
    <section className="export-panel export-menu" aria-label="Export panel">
      <div className="export-menu-heading">
        <span>Export</span>
        <strong>Report artifacts</strong>
      </div>
      <div className="export-menu-list" role="menu" aria-label="Export formats">
        {formats.map((format) => (
          <button
            key={format}
            type="button"
            role="menuitem"
            aria-label={reportExportCapability(format).label}
            className="export-menu-item"
            disabled={busy}
            onClick={() => onExportFormat(format)}
          >
            <span className="export-menu-item-icon" aria-hidden="true">{formatMeta[format].icon}</span>
            <span className="export-menu-item-copy" data-description={formatMeta[format].description}>
              <strong>{reportExportCapability(format).label}</strong>
            </span>
          </button>
        ))}
      </div>
      <span className="visually-hidden" role="status">{status}</span>
    </section>
  )
}

export const EnergyTableView = memo(function EnergyTableView({
  rows,
  nodes = [],
  edges = [],
  outputUnit: _outputUnit,
  onSelectNode,
  onClose,
}: {
  rows: EnergyTableRow[]
  nodes?: FlowNode[]
  edges?: FlowEdge[]
  outputUnit: EnergyDisplayOptions["outputUnit"]
  onSelectNode: (nodeId: string) => void
  onClose?: () => void
}) {
  const [tableMode, setTableMode] = useState<EnergyTableMode>("relative")
  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const modeAnimationKey = tableMode === "relative" ? "relative" : "absolute"
  const orderedRows = useMemo(
    () => sortedEnergyTableRows(rows, nodes, edges),
    [edges, nodes, rows],
  )
  const visibleRows = useMemo(
    () => visibleEnergyTableRows(orderedRows, tableMode),
    [orderedRows, tableMode],
  )

  useEffect(() => {
    if (typeof tableWrapRef.current?.scrollTo === "function") {
      tableWrapRef.current.scrollTo({ top: 0, left: 0, behavior: "smooth" })
    }
  }, [tableMode])

  return (
    <section className="workbench-energy-table-panel" aria-label="Energy table">
      <header className="workbench-energy-table-header">
        <div>
          <p className="section-kicker">Table</p>
          <h2>Energy Table</h2>
        </div>
        <div className="workbench-energy-table-header-actions">
          <div className={`workbench-energy-table-mode is-${tableMode}`} role="group" aria-label="Energy table mode">
            <button
              type="button"
              className={tableMode === "relative" ? "workbench-energy-table-mode-button--active" : ""}
              aria-pressed={tableMode === "relative"}
              onClick={() => setTableMode("relative")}
            >
              Relative
            </button>
            <button
              type="button"
              className={tableMode === "absolute" ? "workbench-energy-table-mode-button--active" : ""}
              aria-pressed={tableMode === "absolute"}
              onClick={() => setTableMode("absolute")}
            >
              Absolute
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
      {orderedRows.length === 0 ? (
        <div className="workbench-energy-table-empty">
          <strong>No nodes</strong>
        </div>
      ) : (
        <div ref={tableWrapRef} className="workbench-energy-table-wrap">
          <table key={modeAnimationKey} className="workbench-energy-table">
            <thead>
              <tr>
                {energyTableColumnSpecs.map((column) => (
                  <th key={column.id}>{renderEnergyTableHeader(column, tableMode)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.nodeId}>
                  <th scope="row">
                    <button type="button" onClick={() => onSelectNode(row.nodeId)}>{row.label}</button>
                  </th>
                  {energyTableColumnSpecs.slice(1).map((column) => (
                    <td key={column.id}>{energyTableCellText(row, column, tableMode)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
})

function renderEnergyTableHeader(column: EnergyTableColumnSpec, mode: EnergyTableMode): ReactNode {
  const prefix = mode === "relative" ? "Δ" : ""
  switch (column.id) {
    case "structure":
      return "Structure"
    case "chargeMultiplicity":
      return "Charge / Mult."
    case "egasHartree":
      return <span>{prefix}E<sub>gas</sub>(Eh)</span>
    case "egasKcal":
      return <span>{prefix}E<sub>gas</sub>(kcal/mol)</span>
    case "gasBasisFunctions":
      return <span>Basis<sub>gas</sub></span>
    case "ggasHartree":
      return <span>{prefix}G<sub>gas</sub>(Eh)</span>
    case "ggasKcal":
      return <span>{prefix}G<sub>gas</sub>(kcal/mol)</span>
    case "ggas1mHartree":
      return <span>{prefix}G<sub>gas</sub>+1M(Eh)</span>
    case "ggas1mKcal":
      return <span>{prefix}G<sub>gas</sub>+1M(kcal/mol)</span>
    case "esolHartree":
      return <span>{prefix}E<sub>sol</sub>(Eh)</span>
    case "esolKcal":
      return <span>{prefix}E<sub>sol</sub>(kcal/mol)</span>
    case "solBasisFunctions":
      return <span>Basis<sub>sol</sub></span>
    case "gsolKcal":
      return <span>{prefix}G<sub>sol</sub>(kcal/mol)</span>
  }
}
