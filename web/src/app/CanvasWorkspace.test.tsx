import { useMemo, useState } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { CanvasViewport, FlowEdge, FlowNode } from "../domain/projectPackages"
import { defaultEnergyDisplayOptions, type EnergyTableRow } from "./energyDisplay"
import {
  CanvasSurface,
  MiniMap,
  ZoomControls,
  canvasSizeFromElement,
  normalizedSelectionRect,
  selectionRectIsClick,
} from "./CanvasWorkspace"

const heavyEditorPreloadMocks = vi.hoisted(() => ({
  preload3Dmol: vi.fn(() => Promise.resolve({})),
}))

vi.mock("./Molecule3DmolViewer.loader", () => ({
  preload3Dmol: heavyEditorPreloadMocks.preload3Dmol,
}))

describe("CanvasWorkspace", () => {
  it("preloads 3Dmol immediately from the node preview hover and keyboard focus", () => {
    const node: FlowNode = {
      id: "preload-node",
      label: "Preload node",
      formula: "H2",
      kind: "intermediate",
      method: "test",
      solvent: "gas",
      energyGas: -1,
      energySolution: -1,
      energyUnit: "hartree",
      sourceStatus: "parsed",
      position: { x: 120, y: 160 },
    }
    const nodeMap = new Map([[node.id, node]])
    heavyEditorPreloadMocks.preload3Dmol.mockClear()

    render(
      <CanvasSurface
        canvasRef={{ current: null }}
        nodes={[node]}
        files={[]}
        edges={[]}
        barriers={[]}
        nodeMap={nodeMap}
        selectedNodeIds={[]}
        selectedEdgeIds={[]}
        selectedBarrierIds={[]}
        keyboardEdgeSourceId={null}
        tool="select"
        viewport={{ x: 0, y: 0, zoom: 1 }}
        rubberBandDraft={null}
        connectionDraft={null}
        barrierDraft={null}
        energyDisplayOptions={defaultEnergyDisplayOptions}
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
        onSetNodeCoefficient={vi.fn()}
        onUpdateEdgeLabel={vi.fn()}
        onUpdateBarrierLabel={vi.fn()}
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

    const open3D = screen.getByRole("button", { name: "Open 3D Structure for Preload node" })
    expect(screen.getByRole("button", { name: "Node Preload node" })).toHaveClass("node-intermediate")
    fireEvent.mouseEnter(open3D)
    expect(heavyEditorPreloadMocks.preload3Dmol).toHaveBeenCalledTimes(1)

    fireEvent.focus(open3D)
    expect(heavyEditorPreloadMocks.preload3Dmol).toHaveBeenCalledTimes(2)
  })

  it("skips CanvasSurface renders for unrelated parent state and updates for canvas props", () => {
    const renderReads = vi.fn()
    const trackedNodes = (label: string) => new Proxy<FlowNode[]>([{
      id: "memo-node",
      label,
      formula: "H2",
      kind: "intermediate",
      method: "test",
      solvent: "gas",
      energyGas: -1,
      energySolution: -1,
      energyUnit: "hartree",
      sourceStatus: "parsed",
      position: { x: 120, y: 160 },
    }], {
      get(target, property, receiver) {
        if (property === "map") renderReads()
        return Reflect.get(target, property, receiver)
      },
    })
    const stableProps = {
      canvasRef: { current: null },
      files: [],
      edges: [],
      barriers: [],
      selectedNodeIds: [],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
      keyboardEdgeSourceId: null,
      tool: "select" as const,
      rubberBandDraft: null,
      connectionDraft: null,
      barrierDraft: null,
      energyDisplayOptions: defaultEnergyDisplayOptions,
      energyRows: [],
      relativeZeroNodeId: null,
      onCanvasPointerDown: vi.fn(),
      onCanvasKeyDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerEnd: vi.fn(),
      onNodePointerDown: vi.fn(),
      onNodeResizePointerDown: vi.fn(),
      onNodePointerUp: vi.fn(),
      onStartConnection: vi.fn(),
      onStartBarrierAnnotation: vi.fn(),
      onStartKeyboardConnection: vi.fn(),
      onSelectNode: vi.fn(),
      onSelectEdge: vi.fn(),
      onSelectBarrier: vi.fn(),
      onSetNodeCoefficient: vi.fn(),
      onUpdateEdgeLabel: vi.fn(),
      onUpdateBarrierLabel: vi.fn(),
      onSetRelativeEnergyZero: vi.fn(),
      onOpenStructure: vi.fn(),
      onShowNodeSource: vi.fn(),
      onRenameNode: vi.fn(),
      renameEditingNodeId: null,
      onRenameRequestHandled: vi.fn(),
      onOpenContextMenu: vi.fn(),
      onRawFileDrop: vi.fn(),
    }

    function Harness() {
      const [panelOpen, setPanelOpen] = useState(false)
      const [nodes, setNodes] = useState(() => trackedNodes("Memo A"))
      const [viewport, setViewport] = useState<CanvasViewport>({ x: 0, y: 0, zoom: 1 })
      const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
      return (
        <>
          <button type="button" onClick={() => setPanelOpen((current) => !current)}>Toggle panel</button>
          <button type="button" onClick={() => setViewport((current) => ({ ...current, zoom: 1.2 }))}>Change viewport</button>
          <button type="button" onClick={() => setNodes(trackedNodes("Memo B"))}>Change nodes</button>
          <span>{panelOpen ? "Panel open" : "Panel closed"}</span>
          <CanvasSurface {...stableProps} nodes={nodes} nodeMap={nodeMap} viewport={viewport} />
        </>
      )
    }

    render(<Harness />)
    const initialRenderReads = renderReads.mock.calls.length

    fireEvent.click(screen.getByRole("button", { name: "Toggle panel" }))
    expect(screen.getByText("Panel open")).toBeInTheDocument()
    expect(renderReads).toHaveBeenCalledTimes(initialRenderReads)

    fireEvent.click(screen.getByRole("button", { name: "Change viewport" }))
    expect(screen.getByLabelText("Graph canvas surface").querySelector(".canvas-world")).toHaveStyle({
      transform: "translate(0px, 0px) scale(1.2)",
    })
    expect(renderReads).toHaveBeenCalledTimes(initialRenderReads + 1)

    fireEvent.click(screen.getByRole("button", { name: "Change nodes" }))
    expect(screen.getByRole("button", { name: "Node Memo B" })).toBeInTheDocument()
    expect(renderReads).toHaveBeenCalledTimes(initialRenderReads + 3)
  })

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

  it("batches minimap drag previews and commits the viewport once on release", () => {
    const node: FlowNode = {
      id: "node-a",
      label: "Node A",
      formula: "H2",
      kind: "intermediate",
      method: "test",
      solvent: "gas",
      energyGas: -1,
      energySolution: -1,
      energyUnit: "hartree",
      sourceStatus: "parsed",
      position: { x: 120, y: 160 },
    }
    const canvas = document.createElement("div")
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800,
      toJSON: () => ({}),
    } as DOMRect)
    const onViewportPreview = vi.fn()
    const onViewportChange = vi.fn()
    const frameCallbacks: FrameRequestCallback[] = []
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined)

    render(
      <MiniMap
        nodes={[node]}
        selectedNodeIds={[]}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        canvasRef={{ current: canvas }}
        onViewportPreview={onViewportPreview}
        onViewportPreviewEnd={vi.fn()}
        onViewportChange={onViewportChange}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onReset={vi.fn()}
      />,
    )

    const minimap = screen.getByRole("button", { name: "Navigate graph minimap" })
    vi.spyOn(minimap, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 270, bottom: 128, width: 270, height: 128,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.pointerDown(minimap, { button: 0, clientX: 40, clientY: 40, pointerId: 7 })
    onViewportPreview.mockClear()
    fireEvent.pointerMove(minimap, { button: 0, clientX: 120, clientY: 62, pointerId: 7 })
    fireEvent.pointerMove(minimap, { button: 0, clientX: 180, clientY: 82, pointerId: 7 })

    expect(requestFrame).toHaveBeenCalledOnce()
    expect(onViewportPreview).not.toHaveBeenCalled()
    expect(onViewportChange).not.toHaveBeenCalled()

    act(() => frameCallbacks[0]?.(16))
    expect(onViewportPreview).toHaveBeenCalledOnce()
    expect(onViewportChange).not.toHaveBeenCalled()

    fireEvent.pointerUp(minimap, { button: 0, clientX: 180, clientY: 82, pointerId: 7 })
    expect(onViewportChange).toHaveBeenCalledOnce()

    requestFrame.mockRestore()
    cancelFrame.mockRestore()
  })

  it("keeps the missing-solvation light when a gas node has free energy but no parsed sol file", () => {
    const node: FlowNode = {
      id: "i1p6-node",
      label: "i1p6",
      formula: "C10H10",
      kind: "intermediate",
      method: "wB97X-D",
      solvent: "SMD",
      energyGas: -100,
      energySolution: -99.5,
      energyUnit: "hartree",
      sourceStatus: "parsed",
      sourceFileId: "i1p6-gas",
      energyTable: { egasHartree: -100, gsolHartree: -99.5 },
      position: { x: 120, y: 160 },
    }

    render(
      <CanvasSurface
        canvasRef={{ current: null }}
        nodes={[node]}
        files={[{
          id: "i1p6-gas",
          name: "i1p6.log",
          kind: "Gaussian",
          size: 100,
          status: "parsed",
          preview: "",
        }]}
        edges={[]}
        barriers={[]}
        nodeMap={new Map([[node.id, node]])}
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

    expect(screen.getByRole("button", { name: "Node i1p6" }).querySelector(".status-light-missing")).toBeInTheDocument()
  })

  it("keeps the missing-gas light when a sol node has no parsed gas file", () => {
    const node: FlowNode = {
      id: "i1p6-sol-node",
      label: "i1p6",
      formula: "C10H10",
      kind: "intermediate",
      method: "wB97X-D",
      solvent: "SMD",
      energyGas: -100,
      energySolution: -99.5,
      energyUnit: "hartree",
      sourceStatus: "parsed",
      sourceFileId: "i1p6-sol",
      energyTable: { esolHartree: -100, gsolHartree: -99.5 },
      position: { x: 120, y: 160 },
    }

    render(
      <CanvasSurface
        canvasRef={{ current: null }}
        nodes={[node]}
        files={[{
          id: "i1p6-sol",
          name: "i1p6-sol.log",
          kind: "Gaussian",
          size: 100,
          status: "parsed",
          preview: "",
        }]}
        edges={[]}
        barriers={[]}
        nodeMap={new Map([[node.id, node]])}
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

    const statusLight = screen.getByRole("button", { name: "Node i1p6" }).querySelector(".status-light-missing")
    expect(statusLight).toBeInTheDocument()
    expect(statusLight).toHaveAttribute("aria-label", expect.stringContaining("No paired gas log"))
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
      relativeExpressionTerms: [],
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

    expect(screen.queryByText("addition")).not.toBeInTheDocument()
    expect(screen.queryByText("release")).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/ΔG\s*=\s*pending/)
  })

  it("reveals empty edge label affordances only when the curve is hovered", () => {
    const onPointerMove = vi.fn()
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
        onPointerMove={onPointerMove}
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
    fireEvent.mouseMove(edgeCurve)
    expect(labelAnchor).not.toHaveClass("is-hovered")

    fireEvent.pointerMove(edgeCurve, { pointerId: 4, clientX: 320, clientY: 180 })
    expect(labelAnchor).toHaveClass("is-hovered")
    expect(onPointerMove).toHaveBeenCalledOnce()

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
