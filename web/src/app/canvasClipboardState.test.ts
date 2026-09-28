import { describe, expect, it } from "vitest"
import type { FlowBarrier, FlowEdge, FlowNode } from "../domain/projectPackages"
import {
  copyCanvasSelection,
  pasteCanvasClipboard,
  selectAllCanvasItems,
} from "./canvasClipboardState"

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
    energyTable: { egasHartree: -1 },
    corrections: [{ id: "corr-a", kind: "manual", value: 1, unit: "kcal/mol" }],
    position: { x: 10, y: 20 },
    size: { width: 180, height: 112 },
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
  {
    id: "node-c",
    label: "C",
    formula: "H2",
    kind: "intermediate",
    method: "demo",
    solvent: "none",
    energyGas: null,
    energySolution: null,
    energyUnit: "hartree",
    position: { x: 150, y: 220 },
  },
]

const edges: FlowEdge[] = [
  { id: "edge-ab", sourceId: "node-a", targetId: "node-b", label: "path" },
  { id: "edge-bc", sourceId: "node-b", targetId: "node-c", label: "path" },
]

const barriers: FlowBarrier[] = [
  { id: "barrier-ab", sourceId: "node-a", targetId: "node-b", label: "12.3" },
  { id: "barrier-bc", sourceId: "node-b", targetId: "node-c", label: "9.1" },
]

const collections = { nodes, edges, barriers }

describe("canvasClipboardState", () => {
  it("selects all canvas graph items", () => {
    expect(selectAllCanvasItems(collections)).toEqual({
      nodeIds: ["node-a", "node-b", "node-c"],
      edgeIds: ["edge-ab", "edge-bc"],
      barrierIds: ["barrier-ab", "barrier-bc"],
    })
  })

  it("copies selected nodes with only fully contained edges and barriers", () => {
    const payload = copyCanvasSelection(collections, {
      nodeIds: ["node-a", "node-b"],
      edgeIds: ["edge-bc"],
      barrierIds: ["barrier-bc"],
    })

    expect(payload?.nodes.map((node) => node.id)).toEqual(["node-a", "node-b"])
    expect(payload?.edges.map((edge) => edge.id)).toEqual(["edge-ab"])
    expect(payload?.barriers.map((barrier) => barrier.id)).toEqual(["barrier-ab"])
    expect(payload?.sourceSelection).toEqual({
      nodeIds: ["node-a", "node-b"],
      edgeIds: ["edge-bc"],
      barrierIds: ["barrier-bc"],
    })
    expect(payload?.nodes[0].position).not.toBe(nodes[0].position)
    expect(payload?.nodes[0].size).not.toBe(nodes[0].size)
    expect(payload?.nodes[0].corrections?.[0]).not.toBe(nodes[0].corrections?.[0])
  })

  it("does not copy edge-only or barrier-only selections into dangling graph items", () => {
    expect(copyCanvasSelection(collections, {
      nodeIds: [],
      edgeIds: ["edge-ab"],
      barrierIds: ["barrier-ab"],
    })).toBeNull()
  })

  it("pastes copied graph items with new ids, offset positions, and clone selection", () => {
    const payload = copyCanvasSelection(collections, {
      nodeIds: ["node-a", "node-b"],
      edgeIds: [],
      barrierIds: [],
    })
    const result = pasteCanvasClipboard(collections, payload)

    expect(result?.collections.nodes.map((node) => node.id)).toEqual([
      "node-a",
      "node-b",
      "node-c",
      "node-a-copy",
      "node-b-copy",
    ])
    expect(result?.collections.nodes.at(-2)?.position).toEqual({ x: 58, y: 68 })
    expect(result?.collections.nodes.at(-1)?.position).toEqual({ x: 128, y: 168 })
    expect(result?.collections.nodes.at(-2)?.label).toBe("A")
    expect(result?.collections.edges.at(-1)).toEqual({
      id: "edge-ab-copy",
      sourceId: "node-a-copy",
      targetId: "node-b-copy",
      label: "path",
    })
    expect(result?.collections.barriers.at(-1)).toEqual({
      id: "barrier-ab-copy",
      sourceId: "node-a-copy",
      targetId: "node-b-copy",
      label: "12.3",
    })
    expect(result?.selection).toEqual({
      nodeIds: ["node-a-copy", "node-b-copy"],
      edgeIds: ["edge-ab-copy"],
      barrierIds: ["barrier-ab-copy"],
    })
  })

  it("offsets consecutive pastes and avoids id collisions", () => {
    const payload = copyCanvasSelection(collections, {
      nodeIds: ["node-a", "node-b"],
      edgeIds: [],
      barrierIds: [],
    })
    const firstPaste = pasteCanvasClipboard(collections, payload)
    const secondPaste = pasteCanvasClipboard(firstPaste?.collections ?? collections, payload, { pasteIndex: 2 })

    expect(secondPaste?.selection.nodeIds).toEqual(["node-a-copy-2", "node-b-copy-2"])
    expect(secondPaste?.collections.nodes.at(-2)?.position).toEqual({ x: 106, y: 116 })
    expect(secondPaste?.collections.nodes.at(-1)?.position).toEqual({ x: 176, y: 216 })
    expect(secondPaste?.selection.edgeIds).toEqual(["edge-ab-copy-2"])
    expect(secondPaste?.selection.barrierIds).toEqual(["barrier-ab-copy-2"])
  })

  it("avoids ids already used on another canvas in the same project", () => {
    const payload = copyCanvasSelection(collections, {
      nodeIds: ["node-a", "node-b"],
      edgeIds: [],
      barrierIds: [],
    })
    const result = pasteCanvasClipboard(
      { nodes: [], edges: [], barriers: [] },
      payload,
      {
        reservedIds: {
          nodeIds: ["node-a", "node-b", "node-a-copy", "node-b-copy"],
          edgeIds: ["edge-ab", "edge-ab-copy"],
          barrierIds: ["barrier-ab", "barrier-ab-copy"],
        },
      },
    )

    expect(result?.selection).toEqual({
      nodeIds: ["node-a-copy-2", "node-b-copy-2"],
      edgeIds: ["edge-ab-copy-2"],
      barrierIds: ["barrier-ab-copy-2"],
    })
    expect(result?.collections.edges[0]).toMatchObject({
      sourceId: "node-a-copy-2",
      targetId: "node-b-copy-2",
    })
  })

  it("preserves node labels for every copy path", () => {
    const payload = copyCanvasSelection(collections, {
      nodeIds: ["node-a", "node-b"],
      edgeIds: [],
      barrierIds: [],
    })
    const result = pasteCanvasClipboard(collections, payload, {
      offsetStep: { x: 0, y: 0 },
    })

    expect(result?.collections.nodes.at(-2)?.label).toBe("A")
    expect(result?.collections.nodes.at(-1)?.label).toBe("B")
  })
})
