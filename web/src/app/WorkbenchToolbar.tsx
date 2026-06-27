import { memo, type CSSProperties, type PointerEvent as ReactPointerEvent, type Ref } from "react"
import {
  GripVertical,
  Hand,
  ImagePlus,
  LayoutDashboard,
  MousePointer2,
  Redo2,
  Table2,
  Type,
  Undo2,
} from "lucide-react"
import type { EnergyDisplayOptions } from "./energyDisplay"
import type { ToolbarPlacement } from "./toolbarPlacement"

type ViewMode = "canvas" | "table"
type CanvasTool = "select" | "pan" | "text"

export const WorkbenchToolbar = memo(function WorkbenchToolbar({
  tool,
  viewMode,
  onSetTool,
  onSetViewMode,
  energyDisplayOptions,
  onEnergyDisplayOptionsChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAutoLayout,
  onInsertImage,
  placement,
  onDragStart,
  toolbarRef,
  style,
}: {
  tool: CanvasTool
  viewMode: ViewMode
  onSetTool: (tool: CanvasTool) => void
  onSetViewMode: (mode: ViewMode) => void
  energyDisplayOptions: EnergyDisplayOptions
  onEnergyDisplayOptionsChange: (options: EnergyDisplayOptions) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onAutoLayout: () => void
  onInsertImage: () => void
  placement: ToolbarPlacement
  onDragStart: (event: ReactPointerEvent<HTMLButtonElement>) => void
  toolbarRef?: Ref<HTMLDivElement>
  style?: CSSProperties
}) {
  const layout = placement.mode === "floating" ? "horizontal" : "vertical"
  const docked = placement.mode !== "floating"

  return (
    <div
      ref={toolbarRef}
      className={`floating-toolbar layout-${layout}${docked ? ` is-docked dock-${placement.mode}` : ""}`}
      data-layout={layout}
      data-placement={placement.mode}
      style={style}
      role="toolbar"
      aria-label="Canvas commands"
    >
        <button
          type="button"
          className="toolbar-drag-handle"
          aria-label={docked ? "Drag toolbar away from edge" : "Move toolbar"}
          title={docked ? "Drag away from edge" : "Move toolbar"}
          onPointerDown={onDragStart}
        >
          <GripVertical size={16} />
        </button>
        <div className="toolbar-energy-chip" role="group" aria-label="Energy display">
          <label className="toolbar-select-group toolbar-select-compact">
            <span className="visually-hidden">Energy</span>
            <select
              aria-label="Energy"
              value={energyDisplayOptions.energySource}
              onChange={(event) => onEnergyDisplayOptionsChange({
                ...energyDisplayOptions,
                energySource: event.currentTarget.value as EnergyDisplayOptions["energySource"],
              })}
            >
              <option value="gas">ΔEgas</option>
              <option value="solution">ΔGsol</option>
            </select>
          </label>
        </div>
        <div className="toolbar-divider" />
        <button
          type="button"
          className={viewMode === "table" ? "toolbar-table-toggle is-active" : "toolbar-table-toggle"}
          aria-pressed={viewMode === "table"}
          aria-label="Table view"
          title={viewMode === "table" ? "Close table" : "Open table"}
          onClick={() => onSetViewMode(viewMode === "table" ? "canvas" : "table")}
        >
          <Table2 size={18} />
        </button>
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
        <button
          type="button"
          className={tool === "text" ? "is-active" : ""}
          aria-pressed={tool === "text"}
          aria-label="Text tool"
          title="Text"
          onClick={() => onSetTool("text")}
        >
          <Type size={18} />
        </button>
        <button
          type="button"
          aria-label="Insert image"
          title="Insert image"
          onClick={onInsertImage}
        >
          <ImagePlus size={18} />
        </button>
        <div className="toolbar-divider" />
        <button type="button" aria-label="Undo canvas edit" title="Undo" onClick={onUndo} disabled={!canUndo}>
          <Undo2 size={18} />
        </button>
        <button type="button" aria-label="Redo canvas edit" title="Redo" onClick={onRedo} disabled={!canRedo}>
          <Redo2 size={18} />
        </button>
        <button type="button" aria-label="Auto layout" title="Auto layout" onClick={onAutoLayout}>
          <LayoutDashboard size={18} />
        </button>
    </div>
  )
})
