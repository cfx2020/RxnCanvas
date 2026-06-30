import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { CanvasViewport, FlowEdge, FlowNode } from "../domain/projectPackages"
import { defaultEnergyDisplayOptions, type EnergyTableRow } from "./energyDisplay"
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


  it("renders addition and release terms without a pending relative energy", () => {
    const node: FlowNode = {
      id: "external-reactant",
      label: "Maleic Anhydride",
      formula: "C4H2O3",
      kind: "reactant",
      method: "wB97X-D",
      solvent: "SMD",
      energyGas: -100,
      energySolution: -99,
      energyUnit: "kcal/mol",
      sourceStatus: "parsed",
      position: { x: 80, y: 120 },
    }
    const row: EnergyTableRow = {
      nodeId: node.id,
      label: node.label,
      kind: node.kind,
      formula: node.formula,
      charge: null,
      spinMultiplicity: null,
      gas: node.energyGas,
      solution: node.energySolution,
      energyUnit: node.energyUnit,
      energyTable: null,
      relativeEnergyTable: null,
      relative: null,
      relativeRole: "addition-term",
      showInRelativeTable: false,
      expressionTerms: [],
    }
    const releaseNode: FlowNode = {
      ...node,
      id: "released-product",
      label: "Chloride",
      formula: "Cl",
      position: { x: 340, y: 120 },
    }
    const releaseRow: EnergyTableRow = {
      ...row,
      nodeId: releaseNode.id,
      label: releaseNode.label,
      formula: releaseNode.formula,
      relativeRole: "release-term",
    }

    render(
      <CanvasSurface
        canvasRef={{ current: null }}
        nodes={[node, releaseNode]}
        files={[]}
        edges={[]}
        barriers={[]}
        nodeMap={new Map([[node.id, node], [releaseNode.id, releaseNode]])}
        selectedNodeIds={[]}
        selectedEdgeIds={[]}
        selectedBarrierIds={[]}
        keyboardEdgeSourceId={null}
        tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }}
        rubberBandDraft={null}
        connectionDraft={null}
        barrierDraft={null}
        energyDisplayOptions={{ ...defaultEnergyDisplayOptions }}
        energyRows={[row, releaseRow]}
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

    expect(screen.getByText("addition")).toBeInTheDocument()
    expect(screen.getByText("release")).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/ΔG\s*=\s*pending/)
  })

  it("reveals empty edge label affordances only when the curve is hovered", () => {
    const source: FlowNode = {
      id: "source",
      label: "Reactant",
      formula: "C2H4",
      kind: "reactant",
      method: "wB97X-D",
      solvent: "gas",
      energyGas: -100,
      energySolution: null,
      energyUnit: "hartree",
      sourceStatus: "parsed",
      position: { x: 120, y: 160 },
    }
    const target: FlowNode = {
      ...source,
      id: "target",
      label: "Product",
      kind: "product",
      position: { x: 460, y: 180 },
    }
    const edge: FlowEdge = {
      id: "edge-new",
      sourceId: source.id,
      targetId: target.id,
      label: "path",
    }
    const { container } = render(
      <CanvasSurface
        canvasRef={{ current: null }}
        nodes={[source, target]}
        files={[]}
        edges={[edge]}
        barriers={[]}
        nodeMap={new Map([[source.id, source], [target.id, target]])}
        selectedNodeIds={[]}
        selectedEdgeIds={[]}
        selectedBarrierIds={[]}
        keyboardEdgeSourceId={null}
        tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }}
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

    const labelAnchor = container.querySelector<HTMLElement>(".edge-label-anchor[data-flow-edge-id='edge-new']")
    expect(labelAnchor).toHaveClass("is-empty")
    expect(labelAnchor).not.toHaveClass("is-hovered")

    const edgeCurve = screen.getByRole("button", { name: "Edge Reactant to Product: path" })
    fireEvent.pointerEnter(edgeCurve)
    expect(labelAnchor).toHaveClass("is-hovered")

    fireEvent.click(screen.getByRole("button", { name: "Add path label from Reactant to Product" }))
    expect(screen.getByRole("textbox", { name: "Path label" })).toBeInTheDocument()
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

  it("preserves multi-selection when opening the context menu on a selected node", () => {
    const nodeA: FlowNode = {
      id: "node-a",
      label: "A",
      formula: "H2",
      kind: "reactant",
      method: "demo",
      solvent: "none",
      energyGas: null,
      energySolution: null,
      energyUnit: "hartree",
      position: { x: 120, y: 160 },
    }
    const nodeB: FlowNode = {
      ...nodeA,
      id: "node-b",
      label: "B",
      position: { x: 340, y: 160 },
    }
    const onSelectNode = vi.fn()
    const onOpenContextMenu = vi.fn()

    render(
      <CanvasSurface
        canvasRef={{ current: null }}
        nodes={[nodeA, nodeB]}
        files={[]}
        edges={[]}
        barriers={[]}
        nodeMap={new Map([[nodeA.id, nodeA], [nodeB.id, nodeB]])}
        selectedNodeIds={["node-a", "node-b"]}
        selectedEdgeIds={["edge-a"]}
        selectedBarrierIds={["barrier-a"]}
        keyboardEdgeSourceId={null}
        tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }}
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
        onSelectNode={onSelectNode}
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
        onOpenContextMenu={onOpenContextMenu}
        onRawFileDrop={vi.fn()}
      />,
    )

    fireEvent.contextMenu(screen.getByRole("button", { name: "Node B" }))

    expect(onSelectNode).not.toHaveBeenCalled()
    expect(onOpenContextMenu).toHaveBeenCalledWith(expect.objectContaining({
      target: {
        kind: "node",
        nodeId: "node-b",
        selection: {
          nodeIds: ["node-a", "node-b"],
          edgeIds: ["edge-a"],
          barrierIds: ["barrier-a"],
        },
      },
    }))
  })
})
