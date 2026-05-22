import { describe, expect, it } from "vitest"
import type { WorkspaceSummary } from "../shell"
import {
  addCompositionDraftRow,
  compositionDraftFromSelectedNode,
  initialCompositionDraftState,
  reconcileCompositionDraft,
  removeCompositionDraftRow,
  updateCompositionDraftRow,
  type CompositionDraftState,
} from "./compositionDraftState"

describe("compositionDraftState", () => {
  it("initializes a Composition Draft from the selected graph node composition", () => {
    const draft = compositionDraftFromSelectedNode(workspaceWithSelection("node-b"))

    expect(draft).toEqual({
      nodeId: "node-b",
      rows: [
        {
          objectId: "object-b",
          coefficient: "2",
          role: "reagent",
          label: "H2 partner",
        },
      ],
      dirty: false,
    })
  })

  it("falls back to chemical object ids when a graph node has no composition projection", () => {
    const draft = compositionDraftFromSelectedNode(workspaceWithSelection("node-legacy"))

    expect(draft).toEqual({
      nodeId: "node-legacy",
      rows: [
        { objectId: "object-a", coefficient: "1", role: "", label: "" },
        { objectId: "object-b", coefficient: "1", role: "", label: "" },
      ],
      dirty: false,
    })
  })

  it("keeps dirty rows for the same selected node but rebuilds when selection changes", () => {
    const current: CompositionDraftState = {
      nodeId: "node-a",
      rows: [{ objectId: "object-a", coefficient: "3", role: "reactant", label: "draft" }],
      dirty: true,
    }

    expect(reconcileCompositionDraft(current, workspaceWithSelection("node-a"))).toBe(current)
    expect(reconcileCompositionDraft(current, workspaceWithSelection("node-b"))).toEqual({
      nodeId: "node-b",
      rows: [{ objectId: "object-b", coefficient: "2", role: "reagent", label: "H2 partner" }],
      dirty: false,
    })
  })

  it("prunes stale node ids after the selected node disappears", () => {
    const current: CompositionDraftState = {
      nodeId: "node-a",
      rows: [{ objectId: "object-a", coefficient: "1", role: "", label: "" }],
      dirty: true,
    }
    const workspace = workspaceWithSelection("node-a")
    workspace.graph.nodes = workspace.graph.nodes.filter((node) => node.id !== "node-a")

    expect(reconcileCompositionDraft(current, workspace)).toEqual(initialCompositionDraftState)
    expect(reconcileCompositionDraft(current, undefined)).toEqual(initialCompositionDraftState)
  })

  it("updates, adds, and removes Composition Draft rows without mutating the source draft", () => {
    const current = compositionDraftFromSelectedNode(workspaceWithSelection("node-a"))
    const updated = updateCompositionDraftRow(current, 0, "coefficient", "2")
    const added = addCompositionDraftRow(updated, "object-b")
    const removed = removeCompositionDraftRow(added, 0)

    expect(current.rows[0].coefficient).toBe("1")
    expect(updated).toMatchObject({
      nodeId: "node-a",
      rows: [{ objectId: "object-a", coefficient: "2" }],
      dirty: true,
    })
    expect(added.rows).toHaveLength(2)
    expect(added.rows[1]).toEqual({ objectId: "object-b", coefficient: "1", role: "", label: "" })
    expect(removed.rows).toEqual([{ objectId: "object-b", coefficient: "1", role: "", label: "" }])
  })
})

function workspaceWithSelection(selectedNodeId: string): WorkspaceSummary {
  return {
    workspace_id: "workspace-test",
    project_id: "project-test",
    active_path_id: "path-test",
    selection: {
      node_ids: [selectedNodeId],
      edge_ids: [],
      path_ids: [],
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    palette: [],
    graph: {
      id: "graph-test",
      project_id: "project-test",
      node_count: 3,
      edge_count: 0,
      path_count: 1,
      nodes: [
        {
          id: "node-a",
          kind: "species",
          label: "Object A",
          chemical_object_ids: ["object-a"],
          composition: [{ object_id: "object-a", coefficient: 1, role: null, label: null, metadata: {} }],
          position: [120, 160],
          metadata: {},
        },
        {
          id: "node-b",
          kind: "species",
          label: "Object B",
          chemical_object_ids: ["object-b"],
          composition: [{ object_id: "object-b", coefficient: 2, role: "reagent", label: "H2 partner", metadata: {} }],
          position: [320, 160],
          metadata: {},
        },
        {
          id: "node-legacy",
          kind: "species",
          label: "Legacy Mix",
          chemical_object_ids: ["object-a", "object-b"],
          position: [520, 160],
          metadata: {},
        },
      ],
      edges: [],
      paths: [{ id: "path-test", label: "Path", node_ids: ["node-a", "node-b"] }],
    },
    preview: {
      graph_id: "graph-test",
      active_path_id: "path-test",
      node_count: 3,
      edge_count: 0,
      path_count: 1,
      disconnected_node_ids: [],
      warnings: [],
    },
  }
}
