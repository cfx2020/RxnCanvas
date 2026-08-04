import { describe, expect, it, vi } from "vitest"
import type { PointerEvent } from "react"
import type { FlowBarrier, FlowEdge, FlowNode } from "../domain/projectPackages"
import type { ProjectWorkspaceStateSetters } from "./appStateAppliers"
import {
  completeConnectionToNodeAction,
  endCanvasPointerAction,
  finishConnectionDraftAtClientPointAction,
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
      edges,
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

  it("marks a source node as an addition term when connecting from its addition connector", () => {
    const cl: FlowNode = {
      ...nodes[0],
      id: "cl",
      label: "Cl",
      position: { x: 180, y: -120 },
    }
    const canvasNodes = [...nodes, cl]
    const setNodes = vi.fn()
    const setEdges = vi.fn()
    const pushEditHistory = vi.fn()

    completeConnectionToNodeAction({
      event: pointerEvent({ pointerId: 7 }),
      targetId: "node-b",
      connectionDraft: {
        pointerId: 7,
        sourceId: "cl",
        current: { x: 80, y: 120 },
        stepRole: "addition",
      },
      nodes: canvasNodes,
      edges,
      appStateSetters: appStateSetters({ setNodes, setEdges }),
      pushEditHistory,
    })

    expect(pushEditHistory).toHaveBeenCalledTimes(1)
    expect(setNodes.mock.calls[0][0].find((node: FlowNode) => node.id === "cl")?.pathRole).toBe("participant")
    expect(setEdges.mock.calls[0][0]).toContainEqual({
      id: expect.stringMatching(/^edge-/),
      sourceId: "cl",
      targetId: "node-b",
      label: "path",
      stepRole: "addition",
    })
  })

  it("uses the release magnet role when finishing a snapped window-level connection", () => {
    const source: FlowNode = {
      ...nodes[0],
      id: "source",
      label: "Source",
      position: { x: -160, y: 80 },
    }
    const n2: FlowNode = {
      ...nodes[1],
      id: "n2",
      label: "N2",
      position: { x: 320, y: 80 },
    }
    const canvasNodes = [source, n2]
    const setNodes = vi.fn()
    const setEdges = vi.fn()
    const setConnectionDraft = vi.fn()
    const pushEditHistory = vi.fn()

    finishConnectionDraftAtClientPointAction({
      pointerId: 7,
      clientX: 322,
      clientY: 151,
      connectionDraft: {
        pointerId: 7,
        sourceId: "source",
        current: { x: 322, y: 151 },
      },
      nodes: canvasNodes,
      releasePoint: { x: 322, y: 151 },
      connectionSnapRadiusWorld: 44,
      nodeIdSet: new Set(canvasNodes.map((node) => node.id)),
      edges: [],
      appStateSetters: appStateSetters({ setNodes, setEdges, setConnectionDraft }),
      pushEditHistory,
      now: 123,
    })

    expect(pushEditHistory).toHaveBeenCalledTimes(1)
    expect(setNodes.mock.calls[0][0].find((node: FlowNode) => node.id === "n2")?.pathRole).toBe("participant")
    expect(setEdges).toHaveBeenCalledWith([{
      id: "edge-123",
      sourceId: "source",
      targetId: "n2",
      label: "path",
      stepRole: "release",
    }])
    expect(setConnectionDraft).toHaveBeenCalledWith(null)
  })

  it("marks a target node as a release term when connecting to its release connector", () => {
    const n2: FlowNode = {
      ...nodes[0],
      id: "n2",
      label: "N2",
      position: { x: 180, y: -120 },
    }
    const canvasNodes = [...nodes, n2]
    const setNodes = vi.fn()
    const setEdges = vi.fn()
    const pushEditHistory = vi.fn()

    completeConnectionToNodeAction({
      event: pointerEvent({ pointerId: 7 }),
      targetId: "n2",
      targetStepRole: "release",
      connectionDraft: {
        pointerId: 7,
        sourceId: "node-b",
        current: { x: 180, y: -120 },
      },
      nodes: canvasNodes,
      edges,
      appStateSetters: appStateSetters({ setNodes, setEdges }),
      pushEditHistory,
    })

    expect(pushEditHistory).toHaveBeenCalledTimes(1)
    expect(setNodes.mock.calls[0][0].find((node: FlowNode) => node.id === "n2")?.pathRole).toBe("participant")
    expect(setEdges.mock.calls[0][0]).toContainEqual({
      id: expect.stringMatching(/^edge-/),
      sourceId: "node-b",
      targetId: "n2",
      label: "path",
      stepRole: "release",
    })
  })

  it("keeps an addition role when its draft is released over a release connector", () => {
    const cl: FlowNode = {
      ...nodes[0],
      id: "cl",
      label: "Cl",
      position: { x: 180, y: -120 },
    }
    const canvasNodes = [...nodes, cl]
    const setNodes = vi.fn()
    const setEdges = vi.fn()

    completeConnectionToNodeAction({
      event: pointerEvent({ pointerId: 7 }),
      targetId: "node-b",
      targetStepRole: "release",
      connectionDraft: {
        pointerId: 7,
        sourceId: "cl",
        current: { x: 80, y: 120 },
        stepRole: "addition",
      },
      nodes: canvasNodes,
      edges,
      appStateSetters: appStateSetters({ setNodes, setEdges }),
      pushEditHistory: vi.fn(),
    })

    expect(setNodes.mock.calls[0][0].find((node: FlowNode) => node.id === "cl")?.pathRole).toBe("participant")
    expect(setEdges.mock.calls[0][0]).toContainEqual({
      id: expect.stringMatching(/^edge-/),
      sourceId: "cl",
      targetId: "node-b",
      label: "path",
      stepRole: "addition",
    })
  })
})
