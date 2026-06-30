import { describe, expect, it, vi } from "vitest"
import type { PointerEvent } from "react"
import type { FlowBarrier, FlowEdge, FlowNode } from "../domain/projectPackages"
import type { ProjectWorkspaceStateSetters } from "./appStateAppliers"
import {
  endCanvasPointerAction,
  handleNodePointerDownAction,
} from "./appCanvasPointerActions"
import type { CanvasDragState } from "./canvasEditState"
import type { CanvasEditSnapshot } from "./projectWorkspace"

const nodes: FlowNode[] = [
  {
    id: "node-a",
    label: "A",
    formula: "H2",
    kind: "reactant",
    method: "demo",
    solvent: "none",
    energyGas: null,
    energySolution: null,
    energyUnit: "hartree",
    position: { x: 10, y: 20 },
  },
  {
    id: "node-b",
    label: "B",
    formula: "H2",
    kind: "product",
    method: "demo",
    solvent: "none",
    energyGas: null,
    energySolution: null,
    energyUnit: "hartree",
    position: { x: 80, y: 120 },
  },
]

const edges: FlowEdge[] = [
  { id: "edge-ab", sourceId: "node-a", targetId: "node-b", label: "path" },
]

const barriers: FlowBarrier[] = [
  { id: "barrier-ab", sourceId: "node-a", targetId: "node-b", label: "12.3" },
]

function appStateSetters(overrides: Partial<ProjectWorkspaceStateSetters> = {}): ProjectWorkspaceStateSetters {
  return {
    setFiles: vi.fn(),
    setNodes: vi.fn(),
    setEdges: vi.fn(),
    setBarriers: vi.fn(),
    setAnnotations: vi.fn(),
    setViewport: vi.fn(),
    setSelectedNodeIds: vi.fn(),
    setSelectedEdgeIds: vi.fn(),
    setSelectedBarrierIds: vi.fn(),
    setSelectedFileId: vi.fn(),
    setSelectedFileIds: vi.fn(),
    setLastSelectedFileId: vi.fn(),
    setEnergyDisplayOptions: vi.fn(),
    setViewMode: vi.fn(),
    setInspectorMode: vi.fn(),
    setKeyboardEdgeSourceId: vi.fn(),
    setConnectionDraft: vi.fn(),
    setBarrierDraft: vi.fn(),
    setDragState: vi.fn(),
    setCandidateReview: vi.fn(),
    setCandidateRegisterBusy: vi.fn(),
    setStructurePreviewNodeId: vi.fn(),
    ...overrides,
  }
}

function pointerEvent<TElement extends HTMLElement = HTMLElement>(
  options: Partial<PointerEvent<TElement>> = {},
): PointerEvent<TElement> {
  return {
    button: 0,
    pointerId: 7,
    clientX: 20,
    clientY: 30,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    currentTarget: { setPointerCapture: vi.fn() },
    ...options,
  } as unknown as PointerEvent<TElement>
}

describe("appCanvasPointerActions", () => {
  it("copies the selected node subgraph before starting modifier copy drag", () => {
    const setNodes = vi.fn()
    const setEdges = vi.fn()
    const setBarriers = vi.fn()
    const setDragState = vi.fn()
    const pushEditHistory = vi.fn()
    const setters = appStateSetters({ setNodes, setEdges, setBarriers, setDragState })

    handleNodePointerDownAction({
      event: pointerEvent(),
      node: nodes[1],
      currentSelection: {
        nodeIds: ["node-a", "node-b"],
        edgeIds: [],
        barrierIds: [],
      },
      nodes,
      edges,
      barriers,
      screenToWorld: () => ({ x: 20, y: 30 }),
      appStateSetters: setters,
      pushEditHistory,
      copyModifier: true,
    })

    expect(pushEditHistory).toHaveBeenCalledTimes(1)
    const copiedNodes = setNodes.mock.calls[0][0] as FlowNode[]
    expect(copiedNodes.map((node) => [node.id, node.label, node.position])).toEqual([
      ["node-a", "A", { x: 10, y: 20 }],
      ["node-b", "B", { x: 80, y: 120 }],
      ["node-a-copy", "A", { x: 10, y: 20 }],
      ["node-b-copy", "B", { x: 80, y: 120 }],
    ])
    expect(setEdges).toHaveBeenCalledWith([
      ...edges,
      { id: "edge-ab-copy", sourceId: "node-a-copy", targetId: "node-b-copy", label: "path" },
    ])
    expect(setBarriers).toHaveBeenCalledWith([
      ...barriers,
      { id: "barrier-ab-copy", sourceId: "node-a-copy", targetId: "node-b-copy", label: "12.3" },
    ])
    expect(setDragState).toHaveBeenCalledWith(expect.objectContaining({
      kind: "node",
      mode: "copy",
      subjects: [
        { nodeId: "node-a-copy", origin: { x: 10, y: 20 } },
        { nodeId: "node-b-copy", origin: { x: 80, y: 120 } },
      ],
    }))
  })

  it("does not push another history entry when finishing copy drag", () => {
    const setNodes = vi.fn()
    const pushEditHistory = vi.fn()
    const dragState: CanvasDragState<CanvasEditSnapshot> = {
      kind: "node",
      pointerId: 7,
      nodeId: "node-a-copy",
      start: { x: 10, y: 20 },
      subjects: [{ nodeId: "node-a-copy", origin: { x: 10, y: 20 } }],
      mode: "copy",
      snapshot: {
        nodes,
        edges,
        barriers,
        selectedNodeIds: ["node-a"],
        selectedEdgeIds: [],
        selectedBarrierIds: [],
      },
    }

    endCanvasPointerAction({
      event: pointerEvent<HTMLDivElement>({ clientX: 42, clientY: 58 } as Partial<PointerEvent<HTMLDivElement>>),
      dragState,
      connectionDraft: null,
      barrierDraft: null,
      nodes: [...nodes, { ...nodes[0], id: "node-a-copy" }],
      barriers,
      selection: { nodeIds: ["node-a-copy"], edgeIds: [], barrierIds: [] },
      nodeIdSet: new Set(nodes.map((node) => node.id)),
      screenToWorld: () => ({ x: 42, y: 58 }),
      finishConnectionDraftAtClientPoint: vi.fn(),
      appStateSetters: appStateSetters({ setNodes }),
      pushEditHistory,
    })

    expect(pushEditHistory).not.toHaveBeenCalled()
    expect(setNodes).toHaveBeenCalledTimes(1)
  })
})
