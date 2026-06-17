import { describe, expect, it } from "vitest"
import type { FlowBarrier, FlowEdge, FlowNode } from "../domain/projectPackages"
import {
  appendBarrierAnnotation,
  appendConnectionEdge,
  applyNodePosition,
  barrierOnlySelection,
  canvasBarrierSelectionTransition,
  canvasDragMoveForPointer,
  canvasPointerMoveTransition,
  canvasDragStateFromPointer,
  canvasEdgeSelectionTransition,
  canvasNodePointerDownTransition,
  canvasSelectionRectFromPoints,
  canvasSelectionRectIsClick,
  canvasSurfacePointerDownTransition,
  canvasKeyboardActionForInput,
  canvasKeyboardTransitionForInput,
  canvasNodeSelectionTransition,
  clearCanvasInteractionTransition,
  canvasSelectionForBarrier,
  canvasSelectionForEdge,
  canvasSelectionForNode,
  completeBarrierDraftTransition,
  completeConnectionDraftTransition,
  createBarrierAnnotationTransition,
  createConnectionEdgeTransition,
  deleteCanvasSelection,
  deleteCanvasSelectionTransition,
  draftMatchesPointer,
  edgeOnlySelection,
  finishCanvasDragTransition,
  finishNodeDragForPointer,
  finishRubberBandSelectionForPointer,
  hasCanvasSelection,
  keyboardConnectionSourceTransition,
  keyboardConnectionEdgeTransition,
  lastSelectedId,
  linkTargetFromDraft,
  normalizeBarrierLabel,
  normalizeEdgeLabel,
  normalizeNodeCoefficient,
  nodeDragStartSelection,
  nodeDragMoved,
  nodeOnlySelection,
  nodeIdsInSelectionRect,
  nudgeFlowNodes,
  nudgeSelectedNodesTransition,
  restoreCanvasEditInteractionTransition,
  rubberBandSelection,
  selectIdsForMode,
  shortcutTargetIsEditable,
  startBarrierDraftTransition,
  startConnectionDraftTransition,
  toggleIdSelection,
  uniqueIds,
  updateBarrierLabelTransition,
  updateDraftCurrentForPointer,
  updateEdgeLabelTransition,
  updateNodeCoefficientTransition,
  updateNodeManualStructureTransition,
  validLinkTarget,
} from "./canvasEditState"

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
    position: { x: 30, y: 40 },
  },
]

const edges: FlowEdge[] = [
  { id: "edge-a", sourceId: "node-a", targetId: "node-b", label: "path" },
  { id: "edge-b", sourceId: "node-b", targetId: "node-c", label: "path" },
]

const barriers: FlowBarrier[] = [
  { id: "barrier-a", sourceId: "node-a", targetId: "node-b", label: "12.3" },
  { id: "barrier-b", sourceId: "node-b", targetId: "node-c", label: "9.1" },
]

describe("canvasEditState", () => {

  it("updates and resets manual 2D structures on nodes", () => {
    const updated = updateNodeManualStructureTransition(nodes, "node-a", {
      ket: " manual ket ",
      molfile: " manual molfile ",
      cdxml: " manual cdxml ",
      svg: " manual svg ",
    })

    expect(updated?.items[0].manualStructureKet).toBe("manual ket")
    expect(updated?.items[0].manualStructureMolfile).toBe("manual molfile")
    expect(updated?.items[0].manualStructureCdxml).toBe("manual cdxml")
    expect(updated?.items[0].manualStructureSvg).toBe("manual svg")
    expect(updated?.selection.nodeIds).toEqual(["node-a"])

    const reset = updateNodeManualStructureTransition(updated?.items ?? [], "node-a", null)
    expect(reset?.items[0].manualStructureKet).toBeUndefined()
    expect(reset?.items[0].manualStructureMolfile).toBeUndefined()
    expect(reset?.items[0].manualStructureCdxml).toBeUndefined()
    expect(reset?.items[0].manualStructureSvg).toBeUndefined()
  })

  it("derives canvas pan and rubber-band drag state from pointer input", () => {
    expect(canvasDragStateFromPointer({
      tool: "select",
      pointerId: 5,
      clientPoint: { x: 120, y: 140 },
      worldPoint: { x: 10, y: 20 },
      viewport: { x: 1, y: 2, zoom: 0.5 },
      additive: true,
    })).toEqual({
      kind: "rubber",
      pointerId: 5,
      start: { x: 10, y: 20 },
      current: { x: 10, y: 20 },
      additive: true,
    })

    expect(canvasDragStateFromPointer({
      tool: "pan",
      pointerId: 6,
      clientPoint: { x: 120, y: 140 },
      worldPoint: { x: 10, y: 20 },
      viewport: { x: 1, y: 2, zoom: 0.5 },
      additive: false,
    })).toEqual({
      kind: "pan",
      pointerId: 6,
      start: { x: 120, y: 140 },
      origin: { x: 1, y: 2 },
    })
  })

  it("builds surface pointer-down transitions or clears active drafts first", () => {
    const connectionDraft = { pointerId: 7, sourceId: "node-a", current: { x: 1, y: 2 } }
    const barrierDraft = { pointerId: 8, sourceId: "node-b", current: { x: 3, y: 4 } }
    const base = {
      tool: "select" as const,
      pointerId: 5,
      clientPoint: { x: 120, y: 140 },
      worldPoint: { x: 10, y: 20 },
      viewport: { x: 1, y: 2, zoom: 0.5 },
      additive: true,
    }

    expect(canvasSurfacePointerDownTransition({ ...base, connectionDraft, barrierDraft })).toEqual({
      kind: "clear-connection-draft",
      connectionDraft: null,
    })
    expect(canvasSurfacePointerDownTransition({ ...base, connectionDraft: null, barrierDraft })).toEqual({
      kind: "clear-barrier-draft",
      barrierDraft: null,
    })
    expect(canvasSurfacePointerDownTransition({ ...base, connectionDraft: null, barrierDraft: null })).toEqual({
      kind: "surface-drag",
      dragState: {
        kind: "rubber",
        pointerId: 5,
        start: { x: 10, y: 20 },
        current: { x: 10, y: 20 },
        additive: true,
      },
    })
  })

  it("classifies active pointer movement by drag kind", () => {
    const panDrag = canvasDragStateFromPointer({
      tool: "pan",
      pointerId: 6,
      clientPoint: { x: 120, y: 140 },
      worldPoint: { x: 10, y: 20 },
      viewport: { x: 1, y: 2, zoom: 0.5 },
      additive: false,
    })
    const nodeDrag = {
      kind: "node" as const,
      pointerId: 7,
      nodeId: "node-b",
      start: { x: 30, y: 40 },
      origin: { x: 30, y: 40 },
      snapshot: { nodes },
    }

    expect(canvasDragMoveForPointer(null, 1, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ kind: "none" })
    expect(canvasDragMoveForPointer(panDrag, 6, { x: 130, y: 150 }, { x: 0, y: 0 })).toEqual({
      kind: "pan",
      drag: panDrag,
      clientPoint: { x: 130, y: 150 },
    })
    expect(canvasDragMoveForPointer(panDrag, 99, { x: 130, y: 150 }, { x: 0, y: 0 })).toEqual({ kind: "none" })
    expect(canvasDragMoveForPointer(nodeDrag, 7, { x: 0, y: 0 }, { x: 34, y: 48 })).toEqual({
      kind: "node",
      nodeId: "node-b",
      position: { x: 34, y: 48 },
    })
  })

  it("prioritizes draft movement before canvas drag movement", () => {
    const connectionDraft = { pointerId: 7, sourceId: "node-a", current: { x: 1, y: 2 } }
    const barrierDraft = { pointerId: 8, sourceId: "node-b", current: { x: 3, y: 4 } }
    const nodeDrag = {
      kind: "node" as const,
      pointerId: 7,
      nodeId: "node-b",
      start: { x: 30, y: 40 },
      origin: { x: 30, y: 40 },
      snapshot: { nodes },
    }

    expect(canvasPointerMoveTransition({
      connectionDraft,
      barrierDraft,
      dragState: nodeDrag,
      pointerId: 7,
      clientPoint: { x: 0, y: 0 },
      worldPoint: { x: 9, y: 10 },
    })).toEqual({
      kind: "connection-draft",
      connectionDraft: { pointerId: 7, sourceId: "node-a", current: { x: 9, y: 10 } },
    })

    expect(canvasPointerMoveTransition({
      connectionDraft,
      barrierDraft,
      dragState: null,
      pointerId: 8,
      clientPoint: { x: 0, y: 0 },
      worldPoint: { x: 11, y: 12 },
    })).toEqual({
      kind: "barrier-draft",
      barrierDraft: { pointerId: 8, sourceId: "node-b", current: { x: 11, y: 12 } },
    })

    expect(canvasPointerMoveTransition({
      connectionDraft,
      barrierDraft,
      dragState: nodeDrag,
      pointerId: 9,
      clientPoint: { x: 0, y: 0 },
      worldPoint: { x: 11, y: 12 },
    })).toEqual({ kind: "none" })
  })

  it("toggles and deduplicates ordered ids", () => {
    expect(toggleIdSelection(["a"], "b")).toEqual(["a", "b"])
    expect(toggleIdSelection(["a", "b"], "a")).toEqual(["b"])
    expect(selectIdsForMode(["a"], "b", "replace")).toEqual(["b"])
    expect(selectIdsForMode(["a"], "b", "toggle")).toEqual(["a", "b"])
    expect(uniqueIds(["a", "b", "a"])).toEqual(["a", "b"])
    expect(lastSelectedId(["a", "b"])).toBe("b")
    expect(lastSelectedId([])).toBeNull()
  })

  it("detects whether a canvas selection has any selected ids", () => {
    expect(hasCanvasSelection({ nodeIds: [], edgeIds: [], barrierIds: [] })).toBe(false)
    expect(hasCanvasSelection({ nodeIds: [], edgeIds: ["edge-a"], barrierIds: [] })).toBe(true)
  })

  it("builds a clear-canvas interaction transition", () => {
    expect(clearCanvasInteractionTransition()).toEqual({
      selection: { nodeIds: [], edgeIds: [], barrierIds: [] },
      keyboardEdgeSourceId: null,
      connectionDraft: null,
      barrierDraft: null,
    })
  })

  it("builds a canvas edit restore interaction transition", () => {
    expect(restoreCanvasEditInteractionTransition()).toEqual({
      keyboardEdgeSourceId: null,
      connectionDraft: null,
      barrierDraft: null,
      dragState: null,
      inspectorMode: "inspector",
    })
  })

  it("builds connection and barrier draft start transitions", () => {
    expect(startConnectionDraftTransition(5, "node-a", { x: 10, y: 20 })).toEqual({
      selection: { nodeIds: ["node-a"], edgeIds: [], barrierIds: [] },
      keyboardEdgeSourceId: null,
      connectionDraft: { pointerId: 5, sourceId: "node-a", current: { x: 10, y: 20 } },
    })

    expect(startBarrierDraftTransition(6, "node-b", { x: 30, y: 40 })).toEqual({
      selection: { nodeIds: ["node-b"], edgeIds: [], barrierIds: [] },
      keyboardEdgeSourceId: null,
      connectionDraft: null,
      barrierDraft: { pointerId: 6, sourceId: "node-b", current: { x: 30, y: 40 } },
    })
  })

  it("toggles keyboard connection source while selecting that source", () => {
    expect(keyboardConnectionSourceTransition(null, "node-a")).toEqual({
      selection: { nodeIds: ["node-a"], edgeIds: [], barrierIds: [] },
      keyboardEdgeSourceId: "node-a",
      inspectorMode: "inspector",
    })
    expect(keyboardConnectionSourceTransition("node-a", "node-a")).toEqual({
      selection: { nodeIds: ["node-a"], edgeIds: [], barrierIds: [] },
      keyboardEdgeSourceId: null,
      inspectorMode: "inspector",
    })
    expect(keyboardConnectionSourceTransition("node-a", "node-b")).toEqual({
      selection: { nodeIds: ["node-b"], edgeIds: [], barrierIds: [] },
      keyboardEdgeSourceId: "node-b",
      inspectorMode: "inspector",
    })
  })

  it("creates exclusive node, edge, and barrier selections", () => {
    expect(nodeOnlySelection("node-a")).toEqual({ nodeIds: ["node-a"], edgeIds: [], barrierIds: [] })
    expect(edgeOnlySelection("edge-a")).toEqual({ nodeIds: [], edgeIds: ["edge-a"], barrierIds: [] })
    expect(barrierOnlySelection("barrier-a")).toEqual({ nodeIds: [], edgeIds: [], barrierIds: ["barrier-a"] })
    expect(nodeOnlySelection(null)).toEqual({ nodeIds: [], edgeIds: [], barrierIds: [] })
    expect(edgeOnlySelection(null)).toEqual({ nodeIds: [], edgeIds: [], barrierIds: [] })
    expect(barrierOnlySelection(null)).toEqual({ nodeIds: [], edgeIds: [], barrierIds: [] })
  })

  it("derives node, edge, and barrier selections for replace or toggle modes", () => {
    const currentSelection = {
      nodeIds: ["node-a"],
      edgeIds: ["edge-a"],
      barrierIds: ["barrier-a"],
    }

    expect(canvasSelectionForNode(currentSelection, "node-b", "replace")).toEqual({
      nodeIds: ["node-b"],
      edgeIds: [],
      barrierIds: [],
    })
    expect(canvasSelectionForNode(currentSelection, "node-b", "toggle")).toEqual({
      nodeIds: ["node-a", "node-b"],
      edgeIds: ["edge-a"],
      barrierIds: ["barrier-a"],
    })
    expect(canvasSelectionForEdge(currentSelection, "edge-b", "replace")).toEqual({
      nodeIds: [],
      edgeIds: ["edge-b"],
      barrierIds: [],
    })
    expect(canvasSelectionForBarrier(currentSelection, "barrier-b", "replace")).toEqual({
      nodeIds: [],
      edgeIds: [],
      barrierIds: ["barrier-b"],
    })
  })

  it("builds canvas item selection transitions with keyboard connection cleanup", () => {
    const currentSelection = {
      nodeIds: ["node-a"],
      edgeIds: ["edge-a"],
      barrierIds: ["barrier-a"],
    }

    expect(canvasNodeSelectionTransition(currentSelection, "node-a", "replace", "node-a")).toEqual({
      selection: { nodeIds: ["node-a"], edgeIds: [], barrierIds: [] },
      keyboardEdgeSourceId: "node-a",
      inspectorMode: "inspector",
    })
    expect(canvasNodeSelectionTransition(currentSelection, "node-b", "toggle", "node-a")).toEqual({
      selection: { nodeIds: ["node-a", "node-b"], edgeIds: ["edge-a"], barrierIds: ["barrier-a"] },
      keyboardEdgeSourceId: null,
      inspectorMode: "inspector",
    })
    expect(canvasEdgeSelectionTransition(currentSelection, "edge-b", "replace")).toEqual({
      selection: { nodeIds: [], edgeIds: ["edge-b"], barrierIds: [] },
      keyboardEdgeSourceId: null,
      inspectorMode: "inspector",
    })
    expect(canvasBarrierSelectionTransition(currentSelection, "barrier-b", "toggle")).toEqual({
      selection: { nodeIds: ["node-a"], edgeIds: ["edge-a"], barrierIds: ["barrier-a", "barrier-b"] },
      keyboardEdgeSourceId: null,
      inspectorMode: "inspector",
    })
  })

  it("derives node drag start selection while preserving peers only for additive selection", () => {
    const currentSelection = {
      nodeIds: ["node-a"],
      edgeIds: ["edge-a"],
      barrierIds: ["barrier-a"],
    }

    expect(nodeDragStartSelection(currentSelection, "node-b", false)).toEqual({
      nodeIds: ["node-b"],
      edgeIds: [],
      barrierIds: [],
    })
    expect(nodeDragStartSelection(currentSelection, "node-b", true)).toEqual({
      nodeIds: ["node-a", "node-b"],
      edgeIds: ["edge-a"],
      barrierIds: ["barrier-a"],
    })
    expect(nodeDragStartSelection(currentSelection, "node-a", true)).toEqual({
      nodeIds: [],
      edgeIds: ["edge-a"],
      barrierIds: ["barrier-a"],
    })
  })

  it("builds node pointer-down transitions with selection and drag snapshot", () => {
    const currentSelection = {
      nodeIds: ["node-a"],
      edgeIds: ["edge-a"],
      barrierIds: ["barrier-a"],
    }
    const snapshotForSelection = (selection: { nodeIds: string[]; edgeIds: string[]; barrierIds: string[] }) => ({
      nodes,
      selectedNodeIds: selection.nodeIds,
      selectedEdgeIds: selection.edgeIds,
      selectedBarrierIds: selection.barrierIds,
    })

    expect(canvasNodePointerDownTransition({
      currentSelection,
      node: nodes[1],
      pointerId: 7,
      worldPoint: { x: 31, y: 42 },
      additive: false,
      snapshotForSelection,
    })).toEqual({
      selection: { nodeIds: ["node-b"], edgeIds: [], barrierIds: [] },
      inspectorMode: "inspector",
      dragState: {
        kind: "node",
        pointerId: 7,
        nodeId: "node-b",
        start: { x: 31, y: 42 },
        origin: { x: 30, y: 40 },
        snapshot: {
          nodes,
          selectedNodeIds: ["node-b"],
          selectedEdgeIds: [],
          selectedBarrierIds: [],
        },
      },
    })
  })

  it("detects editable keyboard shortcut targets", () => {
    expect(shortcutTargetIsEditable(document.createElement("input"))).toBe(true)
    expect(shortcutTargetIsEditable(document.createElement("textarea"))).toBe(true)
    expect(shortcutTargetIsEditable(document.createElement("select"))).toBe(true)
    expect(shortcutTargetIsEditable(document.createElement("button"))).toBe(false)
  })

  it("maps canvas keyboard input to editor actions", () => {
    const base = {
      key: "x",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      editableTarget: false,
      hasSelection: true,
    }

    expect(canvasKeyboardActionForInput({ ...base, editableTarget: true, key: "Delete" })).toEqual({ kind: "none" })
    expect(canvasKeyboardActionForInput({ ...base, altKey: true, key: "ArrowUp" })).toEqual({ kind: "none" })
    expect(canvasKeyboardActionForInput({ ...base, metaKey: true, key: "z" })).toEqual({ kind: "undo" })
    expect(canvasKeyboardActionForInput({ ...base, metaKey: true, shiftKey: true, key: "z" })).toEqual({ kind: "redo" })
    expect(canvasKeyboardActionForInput({ ...base, ctrlKey: true, key: "y" })).toEqual({ kind: "redo" })
    expect(canvasKeyboardActionForInput({ ...base, key: "Delete" })).toEqual({ kind: "delete" })
    expect(canvasKeyboardActionForInput({ ...base, key: "Backspace", hasSelection: false })).toEqual({ kind: "none" })
    expect(canvasKeyboardActionForInput({ ...base, key: "Escape" })).toEqual({ kind: "clear" })
    expect(canvasKeyboardActionForInput({ ...base, key: "ArrowLeft" })).toEqual({ kind: "nudge", delta: { x: -20, y: 0 } })
    expect(canvasKeyboardActionForInput(base)).toEqual({ kind: "none" })
    expect(canvasKeyboardTransitionForInput({ ...base, key: "Delete" })).toEqual({
      action: { kind: "delete" },
      shouldPreventDefault: true,
    })
    expect(canvasKeyboardTransitionForInput(base)).toEqual({
      action: { kind: "none" },
      shouldPreventDefault: false,
    })
  })

  it("nudges only selected nodes", () => {
    const result = nudgeFlowNodes(nodes, ["node-b"], { x: 5, y: -8 })

    expect(result.changed).toBe(true)
    expect(result.nodes[0]).toBe(nodes[0])
    expect(result.nodes[1].position).toEqual({ x: 35, y: 32 })
  })

  it("does not create new node arrays when no selected node exists", () => {
    const result = nudgeFlowNodes(nodes, ["missing"], { x: 5, y: -8 })

    expect(result.changed).toBe(false)
    expect(result.nodes).toBe(nodes)
  })

  it("builds a nudge transition only when selected nodes change", () => {
    expect(nudgeSelectedNodesTransition(nodes, ["missing"], { x: 5, y: -8 })).toBeNull()
    expect(nudgeSelectedNodesTransition(nodes, ["node-b"], { x: 5, y: -8 })).toEqual({
      nodes: [
        nodes[0],
        { ...nodes[1], position: { x: 35, y: 32 } },
      ],
    })
  })

  it("applies and detects node drag changes", () => {
    const nextNodes = applyNodePosition(nodes, "node-b", { x: 72, y: 88 })

    expect(nextNodes[0]).toBe(nodes[0])
    expect(nextNodes[1].position).toEqual({ x: 72, y: 88 })
    expect(nodeDragMoved({ nodes }, "node-b", { x: 30, y: 40 })).toBe(false)
    expect(nodeDragMoved({ nodes }, "node-b", { x: 72, y: 88 })).toBe(true)
    expect(nodeDragMoved({ nodes }, "missing", { x: 72, y: 88 })).toBe(true)
  })

  it("normalizes and applies edge/barrier labels", () => {
    expect(normalizeEdgeLabel("  TS path  ")).toBe("TS path")
    expect(normalizeEdgeLabel("   ")).toBe("path")
    expect(normalizeBarrierLabel("  ΔG  ")).toBe("ΔG")
    expect(normalizeBarrierLabel("   ")).toBeUndefined()

    expect(updateEdgeLabelTransition(edges, "missing", "new")).toBeNull()
    expect(updateEdgeLabelTransition(edges, "edge-a", "path")).toBeNull()
    expect(updateEdgeLabelTransition(edges, "edge-a", "  IRC  ")).toEqual({
      items: [
        { ...edges[0], label: "IRC" },
        edges[1],
      ],
      selection: { nodeIds: [], edgeIds: ["edge-a"], barrierIds: [] },
      inspectorMode: "inspector",
    })

    expect(updateBarrierLabelTransition(barriers, "missing", "new")).toBeNull()
    expect(updateBarrierLabelTransition(barriers, "barrier-a", "12.3")).toBeNull()
    expect(updateBarrierLabelTransition(barriers, "barrier-a", "  ")).toEqual({
      items: [
        { id: "barrier-a", sourceId: "node-a", targetId: "node-b", label: undefined },
        barriers[1],
      ],
      selection: { nodeIds: [], edgeIds: [], barrierIds: ["barrier-a"] },
      inspectorMode: "inspector",
    })
  })

  it("normalizes and applies node coefficients", () => {
    expect(normalizeNodeCoefficient(0)).toBeNull()
    expect(normalizeNodeCoefficient(Number.NaN)).toBeNull()
    expect(normalizeNodeCoefficient(1.23456789)).toBe(1.234568)
    expect(updateNodeCoefficientTransition(nodes, "missing", 2)).toBeNull()
    expect(updateNodeCoefficientTransition(nodes, "node-a", 1)).toBeNull()
    expect(updateNodeCoefficientTransition(nodes, "node-b", 2.5)).toEqual({
      items: [
        nodes[0],
        { ...nodes[1], coefficient: 2.5 },
      ],
      selection: { nodeIds: ["node-b"], edgeIds: [], barrierIds: [] },
      inspectorMode: "inspector",
    })
  })

  it("finishes node drag with snapped position and moved status", () => {
    const drag = {
      kind: "node" as const,
      pointerId: 7,
      nodeId: "node-b",
      start: { x: 30, y: 40 },
      origin: { x: 30, y: 40 },
      snapshot: { nodes },
    }

    expect(finishNodeDragForPointer(drag, 8, { x: 33, y: 45 })).toBeNull()
    expect(finishNodeDragForPointer(drag, 7, { x: 33, y: 45 })).toEqual({
      nodeId: "node-b",
      finalPosition: { x: 32, y: 48 },
      snapshot: { nodes },
      moved: true,
    })
  })

  it("derives rubber-band selected node ids", () => {
    const selectedIds = nodeIdsInSelectionRect(nodes, { x: 100, y: 70, width: 160, height: 130 })

    expect(selectedIds).toEqual(["node-a", "node-b"])
    expect(rubberBandSelection(["node-a"], ["node-b"], true)).toEqual(["node-a", "node-b"])
    expect(rubberBandSelection(["node-a"], ["node-b"], false)).toEqual(["node-b"])
    const rect = canvasSelectionRectFromPoints({ x: 80, y: 120 }, { x: 20, y: 40 })
    expect(rect).toEqual({ x: 20, y: 40, width: 60, height: 80 })
    expect(canvasSelectionRectIsClick(rect)).toBe(false)
    expect(canvasSelectionRectIsClick({ x: 0, y: 0, width: 4, height: 5 })).toBe(true)
  })

  it("finishes rubber-band drag into full selection state", () => {
    const drag = {
      kind: "rubber" as const,
      pointerId: 9,
      start: { x: 0, y: 0 },
      current: { x: 0, y: 0 },
      additive: false,
    }
    const currentSelection = {
      nodeIds: ["node-a"],
      edgeIds: ["edge-a"],
      barrierIds: ["barrier-a"],
    }

    expect(finishRubberBandSelectionForPointer(drag, 8, { x: 240, y: 220 }, nodes, currentSelection)).toBeNull()
    expect(finishRubberBandSelectionForPointer(drag, 9, { x: 240, y: 220 }, nodes, currentSelection)).toEqual({
      selectedIds: ["node-a", "node-b"],
      selection: {
        nodeIds: ["node-a", "node-b"],
        edgeIds: [],
        barrierIds: [],
      },
      shouldInspect: true,
    })

    expect(finishRubberBandSelectionForPointer({ ...drag, additive: true }, 9, { x: 240, y: 220 }, nodes, currentSelection)).toEqual({
      selectedIds: ["node-a", "node-b"],
      selection: {
        nodeIds: ["node-a", "node-b"],
        edgeIds: ["edge-a"],
        barrierIds: ["barrier-a"],
      },
      shouldInspect: true,
    })
  })

  it("finishes canvas drag transitions for pan, node drag, and rubber-band selection", () => {
    const panDrag = {
      kind: "pan" as const,
      pointerId: 3,
      start: { x: 0, y: 0 },
      origin: { x: 10, y: 20 },
    }
    const nodeDrag = {
      kind: "node" as const,
      pointerId: 7,
      nodeId: "node-b",
      start: { x: 30, y: 40 },
      origin: { x: 30, y: 40 },
      snapshot: { nodes },
    }
    const rubberDrag = {
      kind: "rubber" as const,
      pointerId: 9,
      start: { x: 0, y: 0 },
      current: { x: 0, y: 0 },
      additive: false,
    }
    const currentSelection = {
      nodeIds: ["node-a"],
      edgeIds: ["edge-a"],
      barrierIds: ["barrier-a"],
    }

    expect(finishCanvasDragTransition(panDrag, 4, { x: 1, y: 2 }, nodes, currentSelection)).toBeNull()
    expect(finishCanvasDragTransition(panDrag, 3, { x: 1, y: 2 }, nodes, currentSelection)).toEqual({
      nodeDrag: null,
      rubberBand: null,
      dragState: null,
      inspectorMode: null,
    })
    expect(finishCanvasDragTransition(nodeDrag, 7, { x: 33, y: 45 }, nodes, currentSelection)).toEqual({
      nodeDrag: {
        nodeId: "node-b",
        finalPosition: { x: 32, y: 48 },
        snapshot: { nodes },
        moved: true,
      },
      rubberBand: null,
      dragState: null,
      inspectorMode: null,
    })
    expect(finishCanvasDragTransition(rubberDrag, 9, { x: 240, y: 220 }, nodes, currentSelection)).toEqual({
      nodeDrag: null,
      rubberBand: {
        selectedIds: ["node-a", "node-b"],
        selection: {
          nodeIds: ["node-a", "node-b"],
          edgeIds: [],
          barrierIds: [],
        },
        shouldInspect: true,
      },
      dragState: null,
      inspectorMode: "inspector",
    })
  })

  it("updates link drafts and derives valid draft targets", () => {
    const draft = { pointerId: 7, sourceId: "node-a", current: { x: 1, y: 2 } }

    expect(draftMatchesPointer(draft, 7)).toBe(true)
    expect(draftMatchesPointer(draft, 8)).toBe(false)
    expect(updateDraftCurrentForPointer(draft, 7, { x: 4, y: 9 })).toEqual({
      pointerId: 7,
      sourceId: "node-a",
      current: { x: 4, y: 9 },
    })
    expect(updateDraftCurrentForPointer(draft, 8, { x: 4, y: 9 })).toBe(draft)
    expect(validLinkTarget("node-a", "node-b")).toEqual({ sourceId: "node-a", targetId: "node-b" })
    expect(validLinkTarget("node-a", "node-a")).toBeNull()
    expect(validLinkTarget(null, "node-b")).toBeNull()
    expect(validLinkTarget("node-a", null)).toBeNull()
    expect(linkTargetFromDraft(draft, 7, "node-b")).toEqual({ sourceId: "node-a", targetId: "node-b" })
    expect(linkTargetFromDraft(draft, 8, "node-b")).toBeNull()
  })

  it("completes connection drafts by clearing the draft and returning an optional target", () => {
    const draft = { pointerId: 7, sourceId: "node-a", current: { x: 1, y: 2 } }

    expect(completeConnectionDraftTransition(draft, 8, "node-b")).toBeNull()
    expect(completeConnectionDraftTransition(draft, 7, "node-a")).toEqual({
      target: null,
      connectionDraft: null,
    })
    expect(completeConnectionDraftTransition(draft, 7, "node-b")).toEqual({
      target: { sourceId: "node-a", targetId: "node-b" },
      connectionDraft: null,
    })
  })

  it("appends connection edges and barrier annotations from valid targets", () => {
    const target = { sourceId: "node-a", targetId: "node-c" }

    expect(appendConnectionEdge(edges, "edge-c", target)).toEqual([
      ...edges,
      { id: "edge-c", sourceId: "node-a", targetId: "node-c", label: "path" },
    ])
    expect(appendBarrierAnnotation(barriers, "barrier-c", target)).toEqual([
      ...barriers,
      { id: "barrier-c", sourceId: "node-a", targetId: "node-c" },
    ])
  })

  it("creates edge and barrier transitions with exclusive selection", () => {
    expect(createConnectionEdgeTransition(edges, "edge-c", "node-a", "node-a")).toBeNull()
    expect(createConnectionEdgeTransition(edges, "edge-c", "node-a", "node-c")).toEqual({
      target: { sourceId: "node-a", targetId: "node-c" },
      items: [
        ...edges,
        { id: "edge-c", sourceId: "node-a", targetId: "node-c", label: "path" },
      ],
      selection: { nodeIds: [], edgeIds: ["edge-c"], barrierIds: [] },
    })

    const draft = { pointerId: 11, sourceId: "node-b", current: { x: 0, y: 0 } }
    expect(createBarrierAnnotationTransition(barriers, "barrier-c", draft, 12, "node-c")).toBeNull()
    expect(createBarrierAnnotationTransition(barriers, "barrier-c", draft, 11, "node-c")).toEqual({
      target: { sourceId: "node-b", targetId: "node-c" },
      items: [
        ...barriers,
        { id: "barrier-c", sourceId: "node-b", targetId: "node-c" },
      ],
      selection: { nodeIds: [], edgeIds: [], barrierIds: ["barrier-c"] },
    })
  })

  it("completes barrier drafts with optional annotation creation and draft cleanup", () => {
    const draft = { pointerId: 11, sourceId: "node-b", current: { x: 0, y: 0 } }

    expect(completeBarrierDraftTransition(barriers, "barrier-c", draft, 12, "node-c")).toBeNull()
    expect(completeBarrierDraftTransition(barriers, "barrier-c", draft, 11, "node-b")).toEqual({
      creation: null,
      barrierDraft: null,
      inspectorMode: null,
    })
    expect(completeBarrierDraftTransition(barriers, "barrier-c", draft, 11, "node-c")).toEqual({
      creation: {
        target: { sourceId: "node-b", targetId: "node-c" },
        items: [
          ...barriers,
          { id: "barrier-c", sourceId: "node-b", targetId: "node-c" },
        ],
        selection: { nodeIds: [], edgeIds: [], barrierIds: ["barrier-c"] },
      },
      barrierDraft: null,
      inspectorMode: "inspector",
    })
  })

  it("creates keyboard edge transitions only for valid node pairs", () => {
    expect(keyboardConnectionEdgeTransition("edge-c", null, "node-c")).toBeNull()
    expect(keyboardConnectionEdgeTransition("edge-c", "node-a", "node-a")).toBeNull()
    expect(keyboardConnectionEdgeTransition("edge-c", "node-a", "node-c")).toEqual({
      edge: { id: "edge-c", sourceId: "node-a", targetId: "node-c", label: "path" },
      selection: { nodeIds: [], edgeIds: ["edge-c"], barrierIds: [] },
      keyboardEdgeSourceId: null,
      inspectorMode: "inspector",
    })
  })

  it("deletes selected nodes and dependent edge/barrier records", () => {
    const result = deleteCanvasSelection({ nodes, edges, barriers }, {
      nodeIds: ["node-a"],
      edgeIds: [],
      barrierIds: ["barrier-b"],
    })

    expect(result.nodes.map((node) => node.id)).toEqual(["node-b"])
    expect(result.edges.map((edge) => edge.id)).toEqual(["edge-b"])
    expect(result.barriers).toEqual([])
  })

  it("builds delete-selection transitions with interaction cleanup", () => {
    expect(deleteCanvasSelectionTransition({ nodes, edges, barriers }, {
      nodeIds: [],
      edgeIds: [],
      barrierIds: [],
    })).toBeNull()

    expect(deleteCanvasSelectionTransition({ nodes, edges, barriers }, {
      nodeIds: [],
      edgeIds: ["edge-a"],
      barrierIds: ["barrier-b"],
    })).toEqual({
      collections: {
        nodes,
        edges: [edges[1]],
        barriers: [barriers[0]],
      },
      interaction: {
        selection: { nodeIds: [], edgeIds: [], barrierIds: [] },
        keyboardEdgeSourceId: null,
        connectionDraft: null,
        barrierDraft: null,
      },
    })
  })
})
