import { describe, expect, it } from "vitest"
import {
  createGraphPathOrderDraft,
  graphPathDraftChanged,
  moveGraphPathDraftNode,
} from "./graphPathOrderDraft"

describe("graphPathOrderDraft", () => {
  it("creates a UI-only path order draft from path node ids", () => {
    const draft = createGraphPathOrderDraft("path-main", ["node-a", "node-b"])

    expect(draft).toEqual({
      pathId: "path-main",
      nodeIds: ["node-a", "node-b"],
    })
  })

  it("moves draft nodes up and down without mutating the original draft", () => {
    const draft = createGraphPathOrderDraft("path-main", ["node-a", "node-b", "node-c"])
    const movedUp = moveGraphPathDraftNode(draft, "node-c", "up")
    const movedDown = moveGraphPathDraftNode(movedUp, "node-c", "down")

    expect(draft.nodeIds).toEqual(["node-a", "node-b", "node-c"])
    expect(movedUp.nodeIds).toEqual(["node-a", "node-c", "node-b"])
    expect(movedDown.nodeIds).toEqual(["node-a", "node-b", "node-c"])
  })

  it("keeps boundary and missing node moves as no-ops", () => {
    const draft = createGraphPathOrderDraft("path-main", ["node-a", "node-b"])

    expect(moveGraphPathDraftNode(draft, "node-a", "up")).toBe(draft)
    expect(moveGraphPathDraftNode(draft, "node-b", "down")).toBe(draft)
    expect(moveGraphPathDraftNode(draft, "node-missing", "up")).toBe(draft)
  })

  it("detects whether draft order differs from the shell path order", () => {
    const draft = createGraphPathOrderDraft("path-main", ["node-b", "node-a"])

    expect(graphPathDraftChanged(draft, ["node-a", "node-b"])).toBe(true)
    expect(graphPathDraftChanged(draft, ["node-b", "node-a"])).toBe(false)
    expect(graphPathDraftChanged(null, ["node-b", "node-a"])).toBe(false)
  })
})
