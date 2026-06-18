import { memo } from "react"
import {
  Hand,
  LayoutDashboard,
  Maximize2,
  MousePointer2,
  Redo2,
  Table2,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import type { EnergyDisplayOptions } from "./energyDisplay"

type ViewMode = "canvas" | "table"
type CanvasTool = "select" | "pan"

export const WorkbenchToolbar = memo(function WorkbenchToolbar({
  tool,
  viewMode,
  onSetTool,
  onSetViewMode,
  zoom,
  energyDisplayOptions,
  onEnergyDisplayOptionsChange,
  canUndo,
  canRedo,
  canDelete,
  onUndo,
  onRedo,
  onDelete,
  onAutoLayout,
  onFitView,
  onZoomIn,
  onZoomOut,
}: {
  tool: CanvasTool
  viewMode: ViewMode
  onSetTool: (tool: CanvasTool) => void
  onSetViewMode: (mode: ViewMode) => void
  zoom: number
  energyDisplayOptions: EnergyDisplayOptions
  onEnergyDisplayOptionsChange: (options: EnergyDisplayOptions) => void
  canUndo: boolean
  canRedo: boolean
  canDelete: boolean
  onUndo: () => void
  onRedo: () => void
  onDelete: () => void
  onAutoLayout: () => void
  onFitView: () => void
  onZoomIn: () => void
  onZoomOut: () => void
}) {
  return (
    <div className="floating-toolbar" role="toolbar" aria-label="Canvas commands">
        <label className="toolbar-select-group">
          <span>Δ</span>
          <select
            aria-label="Energy"
            value={energyDisplayOptions.energySource}
            onChange={(event) => onEnergyDisplayOptionsChange({
              ...energyDisplayOptions,
              energySource: event.currentTarget.value as EnergyDisplayOptions["energySource"],
            })}
          >
            <option value="gas">Egas</option>
            <option value="solution">Gsol</option>
          </select>
        </label>
        <label className="toolbar-select-group">
          <span>Unit</span>
          <select
            aria-label="Unit"
            value={energyDisplayOptions.outputUnit}
            onChange={(event) => onEnergyDisplayOptionsChange({
              ...energyDisplayOptions,
              outputUnit: event.currentTarget.value as EnergyDisplayOptions["outputUnit"],
            })}
          >
            <option value="hartree">hartree</option>
            <option value="kcal/mol">kcal/mol</option>
            <option value="kj/mol">kJ/mol</option>
          </select>
        </label>
        <div className="toolbar-divider" />
        <div className="toolbar-segmented" data-view-mode={viewMode} role="group" aria-label="Workbench view">
          <button
            type="button"
            className={viewMode === "canvas" ? "is-active" : ""}
            aria-pressed={viewMode === "canvas"}
            aria-label="Canvas view"
            title="Canvas view"
            onClick={() => onSetViewMode("canvas")}
          >
            <LayoutDashboard size={18} />
          </button>
          <button
            type="button"
            className={viewMode === "table" ? "is-active" : ""}
            aria-pressed={viewMode === "table"}
            aria-label="Table view"
            title="Table view"
            onClick={() => onSetViewMode("table")}
          >
            <Table2 size={18} />
          </button>
        </div>
        <div className="toolbar-divider" />
        <button
          type="button"
          className={tool === "select" ? "is-active" : ""}
          aria-pressed={tool === "select"}
          aria-label="Select tool"
          title="Select"
          onClick={() => onSetTool("select")}
        >
          <MousePointer2 size={18} />
        </button>
        <button
          type="button"
          className={tool === "pan" ? "is-active" : ""}
          aria-pressed={tool === "pan"}
          aria-label="Pan tool"
          title="Pan"
          onClick={() => onSetTool("pan")}
        >
          <Hand size={18} />
        </button>
        <div className="toolbar-divider" />
        <button type="button" aria-label="Undo canvas edit" title="Undo" onClick={onUndo} disabled={!canUndo}>
          <Undo2 size={18} />
        </button>
        <button type="button" aria-label="Redo canvas edit" title="Redo" onClick={onRedo} disabled={!canRedo}>
          <Redo2 size={18} />
        </button>
        <button type="button" aria-label="Delete selection" title="Delete" onClick={onDelete} disabled={!canDelete}>
          <Trash2 size={18} />
        </button>
        <button type="button" aria-label="Auto layout" title="Auto layout" onClick={onAutoLayout}>
          <LayoutDashboard size={18} />
        </button>
        <button type="button" aria-label="Fit view" title="Fit view" onClick={onFitView}>
          <Maximize2 size={18} />
        </button>
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut}>
          <ZoomOut size={18} />
        </button>
        <span className="toolbar-zoom-readout" aria-label={`Zoom ${Math.round(zoom * 100)} percent`}>
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn}>
          <ZoomIn size={18} />
        </button>
    </div>
  )
})
