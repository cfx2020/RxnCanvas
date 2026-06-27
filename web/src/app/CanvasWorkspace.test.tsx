import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { CanvasViewport, FlowNode } from "../domain/projectPackages"
import { defaultEnergyDisplayOptions } from "./energyDisplay"
import {
  CanvasSurface,
  ZoomControls,
  canvasSizeFromElement,
  normalizedSelectionRect,
  selectionRectIsClick,
} from "./CanvasWorkspace"

describe("CanvasWorkspace", () => {
  it("normalizes rubber-band rectangles without depending on drag direction", () => {
    const rect = normalizedSelectionRect({ x: 80, y: 120 }, { x: 20, y: 40 })

    expect(rect).toEqual({ x: 20, y: 40, width: 60, height: 80 })
    expect(selectionRectIsClick(rect)).toBe(false)
    expect(selectionRectIsClick({ x: 0, y: 0, width: 4, height: 5 })).toBe(true)
  })

  it("falls back when canvas size cannot be measured", () => {
    expect(canvasSizeFromElement(null, { width: 900, height: 700 })).toEqual({ width: 900, height: 700 })
  })

  it("renders accessible zoom controls", () => {
    const onZoomIn = vi.fn()
    const onZoomOut = vi.fn()
    const onReset = vi.fn()

    render(<ZoomControls zoom={0.625} onZoomIn={onZoomIn} onZoomOut={onZoomOut} onReset={onReset} />)

    expect(screen.getByText("63%")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }))
    fireEvent.click(screen.getByRole("button", { name: "Reset canvas view" }))

    expect(onZoomIn).toHaveBeenCalledOnce()
    expect(onZoomOut).toHaveBeenCalledOnce()
    expect(onReset).toHaveBeenCalledOnce()
  })

  it("renders the empty canvas state without inactive feature text", () => {
    const viewport: CanvasViewport = { x: 0, y: 0, zoom: 1 }
    const nodes: FlowNode[] = []

    render(
      <CanvasSurface
        canvasRef={{ current: null }}
        nodes={nodes}
        files={[]}
        edges={[]}
        barriers={[]}
        nodeMap={new Map()}
        selectedNodeIds={[]}
        selectedEdgeIds={[]}
        selectedBarrierIds={[]}
        keyboardEdgeSourceId={null}
        tool="select"
        viewport={viewport}
        rubberBandDraft={null}
        connectionDraft={null}
        barrierDraft={null}
        energyDisplayOptions={{ ...defaultEnergyDisplayOptions }}
        energyRows={[]}
        relativeZeroNodeId={null}
        onCanvasPointerDown={vi.fn()}
        onCanvasKeyDown={vi.fn()}
        onPointerMove={vi.fn()}
        onPointerEnd={vi.fn()}
        onNodePointerDown={vi.fn()}
        onNodeResizePointerDown={vi.fn()}
        onNodePointerUp={vi.fn()}
        onStartConnection={vi.fn()}
        onStartBarrierAnnotation={vi.fn()}
        onStartKeyboardConnection={vi.fn()}
        onSelectNode={vi.fn()}
        onSelectEdge={vi.fn()}
        onSelectBarrier={vi.fn()}
        onUpdateEdgeLabel={vi.fn()}
        onUpdateBarrierLabel={vi.fn()}
        onSetNodeCoefficient={vi.fn()}
        onSetRelativeEnergyZero={vi.fn()}
        onOpenStructure={vi.fn()}
        onShowNodeSource={vi.fn()}
        onRenameNode={vi.fn()}
        renameEditingNodeId={null}
        onRenameRequestHandled={vi.fn()}
        onOpenContextMenu={vi.fn()}
        onRawFileDrop={vi.fn()}
      />,
    )

    expect(screen.getByLabelText("Graph canvas surface")).toBeInTheDocument()
    expect(screen.getByText("No nodes in this project")).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Add Node|Compute|Object Registry/i)
  })
})
