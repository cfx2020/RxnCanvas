import { describe, expect, it } from "vitest"
import {
  canvasPointToGraphNodePosition,
  graphNodeCssPosition,
  graphNodeLayoutBounds,
  graphNodePosition,
  moveGraphNodePosition,
  snapGraphNodeLayoutPosition,
} from "./graphNodeLayout"
import type { GraphNodeSummary } from "./workbenchState"

describe("graphNodeLayout", () => {
  it("uses an existing finite node position", () => {
    expect(graphNodePosition(node({ id: "node-a", position: [120, 160] }))).toEqual({
      x: 120,
      y: 160,
    })
  })

  it("falls back to a stable position when a node has no position", () => {
    expect(graphNodePosition(node({ id: "node-web-3" }))).toEqual({
      x: 420,
      y: 180,
    })
  })

  it("snaps positions without clamping them to the visible virtual canvas", () => {
    expect(snapGraphNodeLayoutPosition({ x: 127, y: 173 })).toEqual({ x: 120, y: 180 })
    expect(canvasPointToGraphNodePosition({ x: -30, y: 999 })).toEqual({
      x: -20,
      y: 1000,
    })
  })

  it("moves positions by deltas with snap and clamp", () => {
    expect(moveGraphNodePosition({ x: 360, y: 160 }, { x: 55, y: 27 })).toEqual({
      x: 420,
      y: 180,
    })
  })

  it("maps workspace positions to CSS percentages", () => {
    expect(graphNodeCssPosition({ x: 300, y: 180 })).toEqual({
      left: "50%",
      top: "50%",
    })
  })
})

function node(overrides: Partial<GraphNodeSummary>): GraphNodeSummary {
  return {
    id: "node-a",
    kind: "species",
    label: "Node A",
    chemical_object_ids: ["object-a"],
    metadata: {},
    ...overrides,
  }
}
