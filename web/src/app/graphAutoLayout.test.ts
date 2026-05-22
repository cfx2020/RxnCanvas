import { describe, expect, it } from "vitest"
import { createGraphLayoutPlan } from "./graphAutoLayout"
import { graphNodeLayoutBounds } from "./graphNodeLayout"
import type { GraphEdgeSummary, GraphNodeSummary, GraphSummary } from "../shell"

describe("graphAutoLayout", () => {
  it("returns a stable empty plan for a graph without nodes", () => {
    const plan = createGraphLayoutPlan({ graph: graph({ nodes: [], edges: [] }) })

    expect(plan).toMatchObject({
      strategy: "grid-compact",
      nodePositions: {},
      changedNodeIds: [],
      warnings: [],
    })
  })

  it("places a single node at a finite snapped position", () => {
    const plan = createGraphLayoutPlan({ graph: graph({ nodes: [node("node-a")] }) })

    expect(plan.nodePositions["node-a"]).toEqual([300, 180])
    expect(plan.changedNodeIds).toEqual(["node-a"])
  })

  it("layers directed source nodes to the left of target nodes", () => {
    const input = graph({
      nodes: [node("node-c"), node("node-a"), node("node-b")],
      edges: [
        edge("edge-a-b", "node-a", "node-b"),
        edge("edge-b-c", "node-b", "node-c"),
      ],
    })

    const first = createGraphLayoutPlan({ graph: input })
    const second = createGraphLayoutPlan({ graph: input })

    expect(first.strategy).toBe("layered-left-to-right")
    expect(first.nodePositions).toEqual(second.nodePositions)
    expect(first.nodePositions["node-a"][0]).toBeLessThan(first.nodePositions["node-b"][0])
    expect(first.nodePositions["node-b"][0]).toBeLessThan(first.nodePositions["node-c"][0])
  })

  it("keeps all planned positions snapped and inside the virtual canvas", () => {
    const plan = createGraphLayoutPlan({
      graph: graph({
        nodes: ["node-a", "node-b", "node-c", "node-d", "node-e"].map((id) => node(id)),
      }),
    })

    for (const [x, y] of Object.values(plan.nodePositions)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(graphNodeLayoutBounds.width)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(graphNodeLayoutBounds.height)
      expect(x % graphNodeLayoutBounds.grid).toBe(0)
      expect(y % graphNodeLayoutBounds.grid).toBe(0)
    }
  })

  it("falls back to compact grid layout with a warning when the graph has a cycle", () => {
    const plan = createGraphLayoutPlan({
      graph: graph({
        nodes: [node("node-a"), node("node-b")],
        edges: [
          edge("edge-a-b", "node-a", "node-b"),
          edge("edge-b-a", "node-b", "node-a"),
        ],
      }),
    })

    expect(plan.strategy).toBe("grid-compact")
    expect(plan.warnings).toEqual([
      expect.objectContaining({ code: "layout_cycle_fallback" }),
    ])
  })

  it("does not mark nodes changed when they are already at the planned positions", () => {
    const initial = graph({
      nodes: [node("node-a"), node("node-b")],
      edges: [edge("edge-a-b", "node-a", "node-b")],
    })
    const first = createGraphLayoutPlan({ graph: initial })
    const second = createGraphLayoutPlan({
      graph: graph({
        nodes: [
          node("node-a", first.nodePositions["node-a"]),
          node("node-b", first.nodePositions["node-b"]),
        ],
        edges: initial.edges,
      }),
    })

    expect(second.changedNodeIds).toEqual([])
  })
})

function graph({
  nodes = [node("node-a"), node("node-b")],
  edges = [],
}: {
  nodes?: GraphNodeSummary[]
  edges?: GraphEdgeSummary[]
} = {}): GraphSummary {
  return {
    id: "graph-test",
    project_id: "project-test",
    node_count: nodes.length,
    edge_count: edges.length,
    path_count: 0,
    nodes,
    edges,
    paths: [],
  }
}

function node(id: string, position?: [number, number]): GraphNodeSummary {
  return {
    id,
    kind: "species",
    label: id.toUpperCase(),
    chemical_object_ids: [`object-${id}`],
    composition: [{ object_id: `object-${id}`, coefficient: 1, role: null, label: null, metadata: {} }],
    position: position ?? null,
    metadata: {},
  }
}

function edge(id: string, source: string, target: string): GraphEdgeSummary {
  return {
    id,
    from_node: source,
    to_node: target,
    label: null,
    metadata: {},
  }
}
