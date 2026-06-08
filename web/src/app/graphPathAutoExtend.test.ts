import { describe, expect, it } from "vitest"
import { resolvePathAutoExtendIntent } from "./graphPathAutoExtend"

describe("graphPathAutoExtend", () => {
  it("creates path-web-main when no active path exists", () => {
    expect(resolvePathAutoExtendIntent(workspace({ activePathId: null }), "node-a", "node-b")).toEqual({
      kind: "set-path",
      pathId: "path-web-main",
      nodeIds: ["node-a", "node-b"],
      reason: "create",
    })
  })

  it("appends to active path tail and prepends to active path head", () => {
    expect(resolvePathAutoExtendIntent(workspace(), "node-b", "node-c")).toEqual({
      kind: "set-path",
      pathId: "path-main",
      nodeIds: ["node-a", "node-b", "node-c"],
      reason: "append-tail",
    })

    expect(resolvePathAutoExtendIntent(workspace(), "node-c", "node-a")).toEqual({
      kind: "set-path",
      pathId: "path-main",
      nodeIds: ["node-c", "node-a", "node-b"],
      reason: "prepend-head",
    })
  })

  it("keeps internal, cycle, stale node, and repeated connections manual", () => {
    expect(resolvePathAutoExtendIntent(workspace(), "node-a", "node-b")).toEqual({
      kind: "manual",
      reason: "no-change",
    })
    expect(resolvePathAutoExtendIntent(workspace({
      pathNodeIds: ["node-a", "node-b", "node-c"],
    }), "node-a", "node-c")).toEqual({
      kind: "manual",
      reason: "internal-edge",
    })
    expect(resolvePathAutoExtendIntent(workspace(), "node-b", "node-a")).toEqual({
      kind: "manual",
      reason: "cycle",
    })
    expect(resolvePathAutoExtendIntent(workspace(), "node-a", "node-missing")).toEqual({
      kind: "manual",
      reason: "no-change",
    })
  })

  it("turns branch and stale active paths into active connection paths", () => {
    expect(resolvePathAutoExtendIntent(workspace(), "node-a", "node-c")).toEqual({
      kind: "set-path",
      pathId: "path-web-main-node-a-node-c",
      nodeIds: ["node-a", "node-c"],
      reason: "branch",
    })

    expect(resolvePathAutoExtendIntent(workspace({ activePathId: "path-missing" }), "node-a", "node-b")).toEqual({
      kind: "set-path",
      pathId: "path-web-main",
      nodeIds: ["node-a", "node-b"],
      reason: "stale-path",
    })
  })
})

function workspace({
  activePathId = "path-main",
  pathNodeIds = ["node-a", "node-b"],
}: {
  activePathId?: string | null
  pathNodeIds?: string[]
} = {}) {
  return {
    active_path_id: activePathId,
    graph: {
      nodes: ["node-a", "node-b", "node-c"].map((id) => ({ id })),
      paths: [{ id: "path-main", node_ids: pathNodeIds }],
    },
  }
}
