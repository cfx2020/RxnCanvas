type PathAutoExtendWorkspace = {
  active_path_id?: string | null
  graph: {
    nodes: Array<{ id: string }>
    paths: Array<{ id: string; node_ids: string[] }>
  }
}

export type PathAutoExtendResult =
  | { kind: "set-path"; pathId: string; nodeIds: string[]; reason: "create" | "append-tail" | "prepend-head" }
  | { kind: "manual"; reason: "branch" | "cycle" | "internal-edge" | "stale-path" | "no-change" }

export function resolvePathAutoExtendIntent(
  workspace: PathAutoExtendWorkspace,
  fromNodeId: string,
  toNodeId: string,
  fallbackPathId = "path-web-main",
): PathAutoExtendResult {
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
    return { kind: "manual", reason: "no-change" }
  }

  const nodeIds = new Set(workspace.graph.nodes.map((node) => node.id))
  if (!nodeIds.has(fromNodeId) || !nodeIds.has(toNodeId)) {
    return { kind: "manual", reason: "stale-path" }
  }

  const activePathId = workspace.active_path_id ?? ""
  if (!activePathId) {
    return {
      kind: "set-path",
      pathId: fallbackPathId,
      nodeIds: [fromNodeId, toNodeId],
      reason: "create",
    }
  }

  const activePath = workspace.graph.paths.find((path) => path.id === activePathId)
  if (!activePath || activePath.node_ids.length === 0) {
    return { kind: "manual", reason: "stale-path" }
  }

  const pathNodeIds = activePath.node_ids
  const headNodeId = pathNodeIds[0]
  const tailNodeId = pathNodeIds[pathNodeIds.length - 1]
  const fromInPath = pathNodeIds.includes(fromNodeId)
  const toInPath = pathNodeIds.includes(toNodeId)

  if (tailNodeId === fromNodeId && !toInPath) {
    return {
      kind: "set-path",
      pathId: activePath.id,
      nodeIds: [...pathNodeIds, toNodeId],
      reason: "append-tail",
    }
  }

  if (headNodeId === toNodeId && !fromInPath) {
    return {
      kind: "set-path",
      pathId: activePath.id,
      nodeIds: [fromNodeId, ...pathNodeIds],
      reason: "prepend-head",
    }
  }

  if (isPathAdjacentEdge(pathNodeIds, fromNodeId, toNodeId)) {
    return { kind: "manual", reason: "no-change" }
  }

  if ((tailNodeId === fromNodeId && toInPath) || (headNodeId === toNodeId && fromInPath)) {
    return { kind: "manual", reason: "cycle" }
  }

  if (fromInPath && toInPath) {
    return { kind: "manual", reason: "internal-edge" }
  }

  return { kind: "manual", reason: "branch" }
}

function isPathAdjacentEdge(pathNodeIds: string[], fromNodeId: string, toNodeId: string): boolean {
  return pathNodeIds.some((nodeId, index) => (
    nodeId === fromNodeId && pathNodeIds[index + 1] === toNodeId
  ))
}
