import { describe, expect, it } from "vitest"
import type { ShellError } from "../shell"
import {
  clearGraphEditorHistory,
  completeGraphEditorHistoryReplay,
  failGraphEditorHistoryReplay,
  graphEditorHistoryReplayLabel,
  initialGraphEditorHistoryState,
  isGraphEditorHistoryEntryNoop,
  peekGraphEditorHistoryEntry,
  pushGraphEditorHistoryEntry,
  snapshotGraphEditorNodePositions,
  snapshotGraphEditorSelection,
  staleGraphEditorHistoryReference,
  startGraphEditorHistoryReplay,
  type GraphEditorHistoryEntry,
} from "./graphEditorHistory"
import type { GraphNodeSummary } from "./workbenchState"

describe("graphEditorHistory", () => {
  it("pushes bounded undo entries and clears redo entries", () => {
    let state = {
      ...initialGraphEditorHistoryState,
      limit: 3,
      redo: [viewportEntry("redo", 1, 1.2)],
    }

    for (let index = 0; index < 5; index += 1) {
      state = pushGraphEditorHistoryEntry(state, viewportEntry(`viewport-${index}`, index, index + 1))
    }

    expect(state.undo.map((entry) => entry.id)).toEqual(["viewport-2", "viewport-3", "viewport-4"])
    expect(state.redo).toEqual([])
    expect(state.error).toBeNull()
  })

  it("skips no-op viewport, selection, and node position entries", () => {
    const viewportNoop: GraphEditorHistoryEntry = {
      id: "viewport",
      kind: "viewport",
      label: "Viewport",
      before: { x: 0, y: 0, zoom: 1 },
      after: { x: 0, y: 0, zoom: 1 },
      createdAt: "2026-05-24T00:00:00.000Z",
    }
    const selectionNoop: GraphEditorHistoryEntry = {
      id: "selection",
      kind: "selection",
      label: "Select node",
      before: { nodeIds: ["node-a"], edgeIds: [], pathIds: [] },
      after: { nodeIds: ["node-a"], edgeIds: [], pathIds: [] },
      createdAt: "2026-05-24T00:00:00.000Z",
    }
    const nudgeNoop: GraphEditorHistoryEntry = {
      id: "nudge",
      kind: "nudge",
      label: "Nudge nodes",
      before: [{ nodeId: "node-a", position: [120, 160] }],
      after: [{ nodeId: "node-a", position: [120, 160] }],
      createdAt: "2026-05-24T00:00:00.000Z",
    }

    expect(isGraphEditorHistoryEntryNoop(viewportNoop)).toBe(true)
    expect(isGraphEditorHistoryEntryNoop(selectionNoop)).toBe(true)
    expect(isGraphEditorHistoryEntryNoop(nudgeNoop)).toBe(true)
    expect(pushGraphEditorHistoryEntry(initialGraphEditorHistoryState, viewportNoop).undo).toHaveLength(0)
  })

  it("moves entries between undo and redo only after replay completes", () => {
    const entry = viewportEntry("viewport", 1, 1.2)
    let state = pushGraphEditorHistoryEntry(initialGraphEditorHistoryState, entry)

    state = startGraphEditorHistoryReplay(state, "undo")
    expect(state.running).toBe("undo")
    expect(peekGraphEditorHistoryEntry(state, "undo")?.id).toBe("viewport")

    state = completeGraphEditorHistoryReplay(state, "undo")
    expect(state.running).toBeNull()
    expect(state.undo).toHaveLength(0)
    expect(state.redo.map((item) => item.id)).toEqual(["viewport"])

    state = completeGraphEditorHistoryReplay(startGraphEditorHistoryReplay(state, "redo"), "redo")
    expect(state.undo.map((item) => item.id)).toEqual(["viewport"])
    expect(state.redo).toHaveLength(0)
  })

  it("keeps entries in place when replay fails", () => {
    const error: ShellError = {
      code: "graph_invalid",
      message: "Node is stale.",
      target: "node_id",
      details: null,
    }
    const started = startGraphEditorHistoryReplay(
      pushGraphEditorHistoryEntry(initialGraphEditorHistoryState, viewportEntry("viewport", 1, 1.2)),
      "undo",
    )
    const failed = failGraphEditorHistoryReplay(started, error)

    expect(failed.running).toBeNull()
    expect(failed.error).toBe(error)
    expect(failed.undo.map((entry) => entry.id)).toEqual(["viewport"])
    expect(failed.redo).toHaveLength(0)
  })

  it("reports stale references before replaying selection and node entries", () => {
    const selectionEntry: GraphEditorHistoryEntry = {
      id: "selection",
      kind: "selection",
      label: "Select node",
      before: { nodeIds: ["node-a"], edgeIds: [], pathIds: [] },
      after: { nodeIds: ["node-missing"], edgeIds: [], pathIds: [] },
      createdAt: "2026-05-24T00:00:00.000Z",
    }
    const nudgeEntry: GraphEditorHistoryEntry = {
      id: "nudge",
      kind: "nudge",
      label: "Nudge nodes",
      before: [{ nodeId: "node-a", position: [120, 160] }],
      after: [{ nodeId: "node-b", position: [140, 160] }],
      createdAt: "2026-05-24T00:00:00.000Z",
    }

    expect(staleGraphEditorHistoryReference(selectionEntry, {
      nodeIds: ["node-a"],
      edgeIds: [],
      pathIds: [],
    })).toBe("node_id")
    expect(staleGraphEditorHistoryReference(nudgeEntry, {
      nodeIds: ["node-a"],
      edgeIds: [],
      pathIds: [],
    })).toBe("node_id")
    expect(staleGraphEditorHistoryReference(viewportEntry("viewport", 1, 1.2), {
      nodeIds: [],
      edgeIds: [],
      pathIds: [],
    })).toBeNull()
  })

  it("snapshots shell-style selection and graph node positions", () => {
    expect(snapshotGraphEditorSelection({
      node_ids: ["node-a"],
      edge_ids: ["edge-a-b"],
      path_ids: ["path-a-b"],
    })).toEqual({
      nodeIds: ["node-a"],
      edgeIds: ["edge-a-b"],
      pathIds: ["path-a-b"],
    })
    expect(snapshotGraphEditorNodePositions([
      node("node-a", [120, 160]),
      node("node-b", [360, 160]),
    ], ["node-b"])).toEqual([
      { nodeId: "node-b", position: [360, 160] },
    ])
  })

  it("exposes replay labels and clears runtime state", () => {
    const state = pushGraphEditorHistoryEntry(initialGraphEditorHistoryState, viewportEntry("viewport", 1, 1.2))

    expect(graphEditorHistoryReplayLabel(state, "undo")).toBe("Viewport")
    expect(graphEditorHistoryReplayLabel(state, "redo")).toBeNull()
    expect(clearGraphEditorHistory(state)).toEqual(initialGraphEditorHistoryState)
  })
})

function viewportEntry(id: string, beforeZoom: number, afterZoom: number): GraphEditorHistoryEntry {
  return {
    id,
    kind: "viewport",
    label: "Viewport",
    before: { x: 0, y: 0, zoom: beforeZoom },
    after: { x: 10, y: 5, zoom: afterZoom },
    createdAt: "2026-05-24T00:00:00.000Z",
  }
}

function node(id: string, position: [number, number]): GraphNodeSummary {
  return {
    id,
    kind: "species",
    label: id,
    chemical_object_ids: ["object-a"],
    position,
    metadata: {},
  }
}
