import { describe, expect, it } from "vitest"
import {
  flowNodeHitTargetSelector,
  flowNodeIdAtClientPoint,
  flowNodeIdFromElementStack,
} from "./canvasHitTesting"

describe("canvasHitTesting", () => {
  it("finds the first known flow node id from nested hit-test elements", () => {
    const node = document.createElement("article")
    node.dataset.flowNodeId = "node-a"
    const child = document.createElement("button")
    node.append(child)

    expect(flowNodeHitTargetSelector).toBe("[data-flow-node-id]")
    expect(flowNodeIdFromElementStack([child], "node-b", new Set(["node-a", "node-b"]))).toBe("node-a")
  })

  it("ignores excluded, unknown, and non-node hit-test elements", () => {
    const excluded = document.createElement("article")
    excluded.dataset.flowNodeId = "node-a"
    const unknown = document.createElement("article")
    unknown.dataset.flowNodeId = "node-z"
    const plain = document.createElement("span")

    expect(flowNodeIdFromElementStack([plain, unknown, excluded], "node-a", new Set(["node-a", "node-b"]))).toBeNull()
  })

  it("uses the target elementsFromPoint stack for client-point hit testing", () => {
    const node = document.createElement("article")
    node.dataset.flowNodeId = "node-b"
    const target = {
      elementsFromPoint: (x: number, y: number) => (x === 100 && y === 200 ? [node] : []),
    }

    expect(flowNodeIdAtClientPoint(target, 100, 200, "node-a", new Set(["node-a", "node-b"]))).toBe("node-b")
    expect(flowNodeIdAtClientPoint({}, 100, 200, "node-a", new Set(["node-a", "node-b"]))).toBeNull()
  })
})
