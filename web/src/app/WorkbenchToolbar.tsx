import {
  Columns3,
  Download,
  FolderPlus,
  Hand,
  LayoutDashboard,
  Maximize2,
  MousePointer2,
  Redo2,
  Table2,
  Trash2,
  Undo2,
  UploadCloud,
} from "lucide-react"
import type { EnergyDisplayOptions } from "./energyDisplay"

type ViewMode = "canvas" | "table"
type CanvasTool = "select" | "pan"

export function WorkbenchToolbar({
  tool,
  viewMode,
  onSetTool,
  onSetViewMode,
  onImport,
  onSaveProject,
  onOpenExport,
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
}: {
  tool: CanvasTool
  viewMode: ViewMode
  onSetTool: (tool: CanvasTool) => void
  onSetViewMode: (mode: ViewMode) => void
  onImport: () => void
  onSaveProject: () => void
  onOpenExport: () => void
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
}) {
  return (
    <div className="floating-toolbar" role="toolbar" aria-label="Canvas commands">
      <button type="button" className="toolbar-primary" aria-label="Import" title="Import" onClick={onImport}>
        <UploadCloud size={18} />
        <span className="toolbar-label">Import</span>
      </button>
      <button type="button" aria-label="Export project" title="Export project package" onClick={onSaveProject}>
        <FolderPlus size={18} />
        <span className="toolbar-label">Project</span>
      </button>
      <div className="toolbar-divider" />
      <label className="toolbar-select-group">
        <span>Energy</span>
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
      <button
        type="button"
        className={viewMode === "canvas" ? "is-active" : ""}
        aria-pressed={viewMode === "canvas"}
        aria-label="Canvas view"
        onClick={() => onSetViewMode("canvas")}
      >
        <Columns3 size={18} />
      </button>
      <button
        type="button"
        className={viewMode === "table" ? "is-active" : ""}
        aria-pressed={viewMode === "table"}
        aria-label="Table view"
        onClick={() => onSetViewMode("table")}
      >
        <Table2 size={18} />
      </button>
      <div className="toolbar-divider" />
      <button
        type="button"
        className={tool === "select" ? "is-active" : ""}
        aria-pressed={tool === "select"}
        aria-label="Select tool"
        onClick={() => onSetTool("select")}
      >
        <MousePointer2 size={18} />
      </button>
      <button
        type="button"
        className={tool === "pan" ? "is-active" : ""}
        aria-pressed={tool === "pan"}
        aria-label="Pan tool"
        onClick={() => onSetTool("pan")}
      >
        <Hand size={18} />
      </button>
      <div className="toolbar-divider" />
      <button type="button" aria-label="Undo canvas edit" title="Undo canvas edit" onClick={onUndo} disabled={!canUndo}>
        <Undo2 size={18} />
      </button>
      <button type="button" aria-label="Redo canvas edit" title="Redo canvas edit" onClick={onRedo} disabled={!canRedo}>
        <Redo2 size={18} />
      </button>
      <button type="button" aria-label="Delete selection" title="Delete selection" onClick={onDelete} disabled={!canDelete}>
        <Trash2 size={18} />
      </button>
      <button type="button" aria-label="Auto layout" title="Auto layout" onClick={onAutoLayout}>
        <LayoutDashboard size={18} />
      </button>
      <button type="button" aria-label="Fit view" title="Fit view" onClick={onFitView}>
        <Maximize2 size={18} />
      </button>
      <div className="toolbar-divider" />
      <button type="button" aria-label="Export" title="Export" onClick={onOpenExport}>
        <Download size={18} />
        <span className="toolbar-label">Export</span>
      </button>
    </div>
  )
}
