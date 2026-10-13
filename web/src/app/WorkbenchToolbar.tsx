import { memo, useCallback, useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type Ref, type SyntheticEvent } from "react"
import {
  GripVertical,
  Hand,
  ImagePlus,
  LayoutDashboard,
  Maximize2,
  MousePointer2,
  Redo2,
  Table2,
  Type,
  Undo2,
} from "lucide-react"
import type { EnergyDisplayOptions } from "./energyDisplay"
import type { ToolbarPlacement } from "./toolbarPlacement"
import { WorkbenchToolbarTooltip } from "./WorkbenchToolbarTooltip"

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
  onFitView,
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
  onFitView: () => void
  onInsertImage: () => void
  placement: ToolbarPlacement
  onDragStart: (event: ReactPointerEvent<HTMLButtonElement>) => void
  toolbarRef?: Ref<HTMLDivElement>
  style?: CSSProperties
}) {
  const layout = placement.mode === "floating" ? "horizontal" : "vertical"
  const docked = placement.mode !== "floating"
  const [tooltipTarget, setTooltipTarget] = useState<HTMLElement | null>(null)
  const dismissTooltip = useCallback(() => setTooltipTarget(null), [])
  const showTooltip = (event: SyntheticEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("button, select") : null
    setTooltipTarget(target && event.currentTarget.contains(target) ? target : null)
  }

  useEffect(dismissTooltip, [dismissTooltip, tool, viewMode, placement.mode])

  return (
    <>
      <div
        ref={toolbarRef}
        className={`floating-toolbar layout-${layout}${docked ? ` is-docked dock-${placement.mode}` : ""}`}
        data-layout={layout}
        data-placement={placement.mode}
        style={style}
        role="toolbar"
        aria-label="Canvas commands"
        onPointerOver={(event) => {
          if (event.pointerType !== "touch") showTooltip(event)
        }}
        onPointerLeave={dismissTooltip}
        onPointerDownCapture={dismissTooltip}
        onClickCapture={dismissTooltip}
        onFocusCapture={showTooltip}
        onBlurCapture={dismissTooltip}
      >
        <button
          type="button"
          className="toolbar-drag-handle"
          aria-label={docked ? "Drag toolbar away from edge" : "Move toolbar"}
          onPointerDown={onDragStart}
        >
          <GripVertical size={16} />
        </button>
        <div className="toolbar-command-group toolbar-energy-chip" role="group" aria-label="Energy and view">
          <label className="toolbar-select-group toolbar-select-compact">
            <span className="visually-hidden">Energy</span>
            <select
              aria-label="Energy"
              data-tooltip={energyDisplayOptions.energySource === "gas" ? "Gas-phase electronic energy" : "Solution free energy"}
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
          data-tooltip={viewMode === "table" ? "Close energy table" : "Open energy table"}
          aria-keyshortcuts="T"
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
          aria-keyshortcuts="V"
          onClick={() => onSetTool("select")}
        >
          <MousePointer2 size={18} />
        </button>
        <button
          type="button"
          className={tool === "pan" ? "is-active" : ""}
          aria-pressed={tool === "pan"}
          aria-label="Pan tool"
          aria-keyshortcuts="H"
          onClick={() => onSetTool("pan")}
        >
          <Hand size={18} />
        </button>
        <button
          type="button"
          className={tool === "text" ? "is-active" : ""}
          aria-pressed={tool === "text"}
          aria-label="Text tool"
          aria-keyshortcuts="X"
          onClick={() => onSetTool("text")}
        >
          <Type size={18} />
        </button>
        <button
          type="button"
          aria-label="Insert image"
          aria-keyshortcuts="I"
          onClick={onInsertImage}
        >
          <ImagePlus size={18} />
        </button>
        <div className="toolbar-divider" />
        <button type="button" aria-label="Undo canvas edit" aria-keyshortcuts="Meta+Z Control+Z" onClick={onUndo} disabled={!canUndo}>
          <Undo2 size={18} />
        </button>
        <button type="button" aria-label="Redo canvas edit" aria-keyshortcuts="Meta+Shift+Z Control+Y" onClick={onRedo} disabled={!canRedo}>
          <Redo2 size={18} />
        </button>
        <button type="button" aria-label="Auto layout" aria-keyshortcuts="A" onClick={onAutoLayout}>
          <LayoutDashboard size={18} />
        </button>
        <button type="button" aria-label="Fit view" aria-keyshortcuts="F" onClick={onFitView}>
          <Maximize2 size={18} />
        </button>
      </div>
      {tooltipTarget ? <WorkbenchToolbarTooltip target={tooltipTarget} placement={placement.mode} onDismiss={dismissTooltip} /> : null}
    </>
  )
})
