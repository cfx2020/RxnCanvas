import { describe, expect, it, vi } from "vitest"
import {
  applyCanvasSelectionTransitionState,
  applyFlowEdgeCollectionUpdateState,
  applyNodeSourceDetailsSelectionState,
  applySourceFileDeletionState,
  applySourceFileSelectionState,
} from "./appSelectionAppliers"

function setters() {
  return {
    setFiles: vi.fn(), setNodes: vi.fn(), setEdges: vi.fn(), setBarriers: vi.fn(), setViewport: vi.fn(),
    setSelectedNodeIds: vi.fn(), setSelectedEdgeIds: vi.fn(), setSelectedBarrierIds: vi.fn(),
    setSelectedFileId: vi.fn(), setSelectedFileIds: vi.fn(), setLastSelectedFileId: vi.fn(),
    setEnergyDisplayOptions: vi.fn(), setViewMode: vi.fn(), setInspectorMode: vi.fn(),
    setKeyboardEdgeSourceId: vi.fn(), setConnectionDraft: vi.fn(), setBarrierDraft: vi.fn(), setDragState: vi.fn(),
    setCandidateReview: vi.fn(), setCandidateRegisterBusy: vi.fn(), setStructurePreviewNodeId: vi.fn(),
  }
}

describe("appSelectionAppliers", () => {
  it("applies source file selection", () => {
    const bag = setters()
    applySourceFileSelectionState(bag, {
      selectedFileId: "file-a",
      selectedFileIds: ["file-a"],
      lastSelectedFileId: "file-a",
      selectedBarrierIds: [],
      keyboardEdgeSourceId: null,
      inspectorMode: "source",
    })
    expect(bag.setSelectedFileId).toHaveBeenCalledWith("file-a")
    expect(bag.setKeyboardEdgeSourceId).toHaveBeenCalledWith(null)
    expect(bag.setInspectorMode).toHaveBeenCalledWith("source")
  })

  it("applies source file deletion", () => {
    const bag = setters()
    const files = [{ id: "file-b", name: "b.out", kind: "ORCA", size: 1, status: "parsed" as const, preview: "" }]
    applySourceFileDeletionState(bag, {
      files,
      selectedFileId: "file-b",
      selectedFileIds: ["file-b"],
      lastSelectedFileId: "file-b",
      inspectorMode: "source",
    })
    expect(bag.setFiles).toHaveBeenCalledWith(files)
    expect(bag.setSelectedFileIds).toHaveBeenCalledWith(["file-b"])
  })

  it("applies node source details selection", () => {
    const bag = setters()
    applyNodeSourceDetailsSelectionState(bag, {
      selectedNodeIds: ["node-a"],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
      selectedFileId: "file-a",
      selectedFileIds: ["file-a"],
      lastSelectedFileId: "file-a",
      keyboardEdgeSourceId: null,
      inspectorMode: "source",
    })
    expect(bag.setSelectedNodeIds).toHaveBeenCalledWith(["node-a"])
    expect(bag.setSelectedFileId).toHaveBeenCalledWith("file-a")
  })

  it("applies canvas selection and collection updates", () => {
    const bag = setters()
    applyCanvasSelectionTransitionState(bag, {
      selection: { nodeIds: [], edgeIds: ["edge-a"], barrierIds: [] },
      keyboardEdgeSourceId: null,
      inspectorMode: "inspector",
    })
    expect(bag.setSelectedEdgeIds).toHaveBeenCalledWith(["edge-a"])

    const edges = [{ id: "edge-a", sourceId: "n1", targetId: "n2", label: "new" }]
    applyFlowEdgeCollectionUpdateState(bag, {
      items: edges,
      selection: { nodeIds: [], edgeIds: ["edge-a"], barrierIds: [] },
      inspectorMode: "inspector",
    })
    expect(bag.setEdges).toHaveBeenCalledWith(edges)
    expect(bag.setInspectorMode).toHaveBeenLastCalledWith("inspector")
  })
})
