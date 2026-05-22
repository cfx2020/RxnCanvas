import { describe, expect, it } from "vitest"
import {
  clearGraphEditorPendingEdge,
  completeGraphEditorConnection,
  endGraphEditorCanvasDrag,
  initialGraphEditorInteractionState,
  pruneGraphEditorInteractionState,
  selectGraphEditorEdge,
  selectGraphEditorNode,
  selectGraphEditorPath,
  setGraphEditorMode,
  startGraphEditorCanvasDrag,
  startGraphEditorConnection,
  updateGraphEditorCanvasDrag,
  type GraphEditorInteractionState,
} from "./graphEditorInteractionState"

describe("graphEditorInteractionState", () => {
  it("selects a node using the array selection protocol", () => {
    const state = selectGraphEditorNode(initialGraphEditorInteractionState, "node-a")

    expect(state.mode).toBe("select")
    expect(state.selection).toEqual({
      nodeIds: ["node-a"],
      edgeIds: [],
      pathIds: [],
    })
    expect(state.pendingEdge).toBeNull()
  })

  it("selects an edge and path using mutually exclusive graph item selection", () => {
    const nodeSelected = selectGraphEditorNode(initialGraphEditorInteractionState, "node-a")
    const edgeSelected = selectGraphEditorEdge(nodeSelected, "edge-a-b")
    const pathSelected = selectGraphEditorPath(edgeSelected, "path-a-b")

    expect(edgeSelected.mode).toBe("select")
    expect(edgeSelected.selection).toEqual({
      nodeIds: [],
      edgeIds: ["edge-a-b"],
      pathIds: [],
    })
    expect(edgeSelected.pendingEdge).toBeNull()
    expect(pathSelected.selection).toEqual({
      nodeIds: [],
      edgeIds: [],
      pathIds: ["path-a-b"],
    })
  })

  it("starts, completes, and clears a pending edge", () => {
    const selected = selectGraphEditorNode(initialGraphEditorInteractionState, "node-a")
    const pending = startGraphEditorConnection(selected)

    expect(pending.mode).toBe("connect")
    expect(pending.pendingEdge).toEqual({ fromNodeId: "node-a" })

    const completed = completeGraphEditorConnection(pending, "node-b")
    expect(completed.mode).toBe("select")
    expect(completed.pendingEdge).toBeNull()
    expect(completed.selection.nodeIds).toEqual(["node-b"])

    const cleared = clearGraphEditorPendingEdge(pending)
    expect(cleared.mode).toBe("select")
    expect(cleared.pendingEdge).toBeNull()
    expect(cleared.selection.nodeIds).toEqual(["node-a"])
  })

  it("does not start a pending edge without a selected node", () => {
    const pending = startGraphEditorConnection(initialGraphEditorInteractionState)

    expect(pending).toBe(initialGraphEditorInteractionState)
  })

  it("switches modes while clearing pending edge and transient dragging state", () => {
    const pending = startGraphEditorConnection(selectGraphEditorNode(initialGraphEditorInteractionState, "node-a"))
    const dragging: GraphEditorInteractionState = {
      ...pending,
      dragging: { kind: "canvas", origin: { x: 0, y: 0 }, current: { x: 1, y: 1 } },
    }

    expect(setGraphEditorMode(dragging, "pan")).toMatchObject({
      mode: "pan",
      pendingEdge: null,
      dragging: null,
    })
  })

  it("tracks transient canvas dragging only in pan mode", () => {
    const ignored = startGraphEditorCanvasDrag(initialGraphEditorInteractionState, { x: 0, y: 0 })
    const pan = setGraphEditorMode(initialGraphEditorInteractionState, "pan")
    const started = startGraphEditorCanvasDrag(pan, { x: 10, y: 20 })
    const updated = updateGraphEditorCanvasDrag(started, { x: 30, y: 25 })
    const ended = endGraphEditorCanvasDrag(updated)

    expect(ignored).toBe(initialGraphEditorInteractionState)
    expect(started.dragging).toEqual({
      kind: "canvas",
      origin: { x: 10, y: 20 },
      current: { x: 10, y: 20 },
    })
    expect(updated.dragging).toEqual({
      kind: "canvas",
      origin: { x: 10, y: 20 },
      current: { x: 30, y: 25 },
    })
    expect(ended.dragging).toBeNull()
  })

  it("prunes stale selection, hover, pending edge, and dragging node references", () => {
    const state: GraphEditorInteractionState = {
      mode: "connect",
      selection: {
        nodeIds: ["node-missing", "node-b"],
        edgeIds: ["edge-missing", "edge-a-b"],
        pathIds: ["path-missing", "path-a-b"],
      },
      hover: { kind: "node", id: "node-missing" },
      dragging: {
        kind: "node",
        nodeIds: ["node-missing", "node-b"],
        origin: { x: 0, y: 0 },
        current: { x: 1, y: 1 },
      },
      pendingEdge: { fromNodeId: "node-missing" },
    }

    const pruned = pruneGraphEditorInteractionState(state, {
      nodeIds: ["node-a", "node-b"],
      edgeIds: ["edge-a-b"],
      pathIds: ["path-a-b"],
    })

    expect(pruned.mode).toBe("select")
    expect(pruned.selection).toEqual({
      nodeIds: ["node-b"],
      edgeIds: ["edge-a-b"],
      pathIds: ["path-a-b"],
    })
    expect(pruned.hover).toBeNull()
    expect(pruned.pendingEdge).toBeNull()
    expect(pruned.dragging).toEqual({
      kind: "node",
      nodeIds: ["node-b"],
      origin: { x: 0, y: 0 },
      current: { x: 1, y: 1 },
    })
  })

  it("uses a valid fallback node when the current node selection is gone", () => {
    const state = selectGraphEditorNode(initialGraphEditorInteractionState, "node-missing")
    const pruned = pruneGraphEditorInteractionState(
      state,
      { nodeIds: ["node-a"], edgeIds: [], pathIds: [] },
      { fallbackNodeId: "node-a" },
    )

    expect(pruned.selection.nodeIds).toEqual(["node-a"])
  })

  it("does not reset non-connect modes during prune", () => {
    const state: GraphEditorInteractionState = {
      ...initialGraphEditorInteractionState,
      mode: "pan",
    }
    const pruned = pruneGraphEditorInteractionState(state, {
      nodeIds: [],
      edgeIds: [],
      pathIds: [],
    })

    expect(pruned.mode).toBe("pan")
  })
})
