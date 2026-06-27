import { describe, expect, it, vi } from "vitest"
import {
  applyCanvasEditSnapshotRestoreState,
  applyCanvasSelectionState,
  applyImportedWorkspaceSnapshotState,
  applyProjectTransitionState,
} from "./appStateAppliers"
import { defaultEnergyDisplayOptions } from "./energyDisplay"

function setterBag() {
  return {
    setProjects: vi.fn(),
    setProjectWorkspaces: vi.fn(),
    setActiveProjectId: vi.fn(),
    setProjectValidation: vi.fn(),
    setFiles: vi.fn(),
    setNodes: vi.fn(),
    setEdges: vi.fn(),
    setBarriers: vi.fn(),
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
  }
}

function expectSelectionSetterToProduce(setter: ReturnType<typeof vi.fn>, current: string[], expected: string[]) {
  expect(setter).toHaveBeenCalled()
  const argument = setter.mock.calls.at(-1)?.[0]
  expect(typeof argument === "function" ? argument(current) : argument).toEqual(expected)
}

const workspace = (() => {
  const nodes = [{ id: "node-1", label: "A", formula: "H2", kind: "reactant" as const, method: "DFT", solvent: "gas", energyGas: -1, energySolution: -1, energyUnit: "hartree" as const, sourceStatus: "parsed" as const, position: { x: 1, y: 2 } }]
  const edges = [{ id: "edge-1", sourceId: "node-1", targetId: "node-2", label: "path" }]
  const barriers = [{ id: "barrier-1", sourceId: "node-1", targetId: "node-2" }]
  const viewport = { x: 1, y: 2, zoom: 0.8 }
  return {
    files: [{ id: "file-1", name: "a.log", kind: "Gaussian", size: 12, status: "parsed" as const, preview: "" }],
    canvases: [{
      id: "canvas-1",
      label: "画布 1",
      nodes,
      edges,
      barriers,
      viewport,
      selectedNodeIds: ["node-1"],
      selectedEdgeIds: ["edge-1"],
      selectedBarrierIds: ["barrier-1"],
    }],
    activeCanvasId: "canvas-1",
    nodes,
    edges,
    barriers,
    viewport,
    selectedNodeIds: ["node-1"],
    selectedEdgeIds: ["edge-1"],
    selectedBarrierIds: ["barrier-1"],
    selectedFileId: "file-1",
    selectedFileIds: ["file-1"],
    lastSelectedFileId: "file-1",
    energyDisplayOptions: defaultEnergyDisplayOptions,
    viewMode: "canvas" as const,
    inspectorMode: "inspector" as const,
  }
})()

describe("appStateAppliers", () => {
  it("applies canvas selection ids", () => {
    const setters = setterBag()
    applyCanvasSelectionState(setters, { nodeIds: ["n"], edgeIds: ["e"], barrierIds: ["b"] })
    expectSelectionSetterToProduce(setters.setSelectedNodeIds, [], ["n"])
    expectSelectionSetterToProduce(setters.setSelectedEdgeIds, [], ["e"])
    expectSelectionSetterToProduce(setters.setSelectedBarrierIds, [], ["b"])
    const nodeUpdater = setters.setSelectedNodeIds.mock.calls[0][0]
    const sameCurrent = ["n"]
    expect(nodeUpdater(sameCurrent)).toBe(sameCurrent)
  })

  it("applies a project transition and clears edit history", () => {
    const setters = setterBag()
    const clearEditHistory = vi.fn()
    applyProjectTransitionState(setters, {
      projects: [{ id: "p1", label: "P1", meta: "open" }],
      workspaces: { p1: workspace },
      activeProjectId: "p1",
      activeSnapshot: workspace,
      validation: null,
    }, clearEditHistory)

    expect(setters.setProjects).toHaveBeenCalledWith([{ id: "p1", label: "P1", meta: "open" }])
    expect(setters.setProjectWorkspaces).toHaveBeenCalledWith({ p1: workspace })
    expect(setters.setActiveProjectId).toHaveBeenCalledWith("p1")
    expect(setters.setFiles).toHaveBeenCalledWith(workspace.files)
    expectSelectionSetterToProduce(setters.setSelectedNodeIds, [], ["node-1"])
    expect(setters.setKeyboardEdgeSourceId).toHaveBeenCalledWith(null)
    expect(setters.setProjectValidation).toHaveBeenCalledWith(null)
    expect(clearEditHistory).toHaveBeenCalledTimes(1)
  })

  it("applies imported workspace snapshots without touching edges/barriers", () => {
    const setters = setterBag()
    applyImportedWorkspaceSnapshotState(setters, {
      snapshot: workspace,
      keyboardEdgeSourceId: null,
      candidateReview: null,
    })
    expect(setters.setFiles).toHaveBeenCalledWith(workspace.files)
    expect(setters.setNodes).toHaveBeenCalledWith(workspace.nodes)
    expect(setters.setEdges).not.toHaveBeenCalled()
    expect(setters.setCandidateReview).toHaveBeenCalledWith(null)
  })

  it("restores a canvas edit snapshot and clears transient interaction", () => {
    const setters = setterBag()
    applyCanvasEditSnapshotRestoreState(setters, {
      nodes: workspace.nodes,
      edges: workspace.edges,
      barriers: workspace.barriers,
      selectedNodeIds: ["node-1"],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
    })
    expect(setters.setNodes).toHaveBeenCalledWith(workspace.nodes)
    expect(setters.setConnectionDraft).toHaveBeenCalledWith(null)
    expect(setters.setInspectorMode).toHaveBeenCalledWith("inspector")
  })
})
