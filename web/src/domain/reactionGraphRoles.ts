import type { FlowEdge, FlowNode } from "./projectPackages"

export function sideSpeciesParticipantNodeId(edge: FlowEdge): string | null {
  if (edge.stepRole === "addition") return edge.sourceId
  if (edge.stepRole === "release") return edge.targetId
  return null
}

export function sideSpeciesParticipantNodeIds(edges: FlowEdge[]): Set<string> {
  const participantIds = new Set<string>()
  for (const edge of edges) {
    const participantId = sideSpeciesParticipantNodeId(edge)
    if (participantId) participantIds.add(participantId)
  }
  return participantIds
}

export function reconcileEdgeDerivedPathRoles(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const participantIds = sideSpeciesParticipantNodeIds(edges)
  return nodes.map((node) => {
    if (participantIds.has(node.id)) {
      return node.pathRole === "participant" ? node : { ...node, pathRole: "participant" }
    }
    if (node.pathRole !== "participant") return node
    const { pathRole: _pathRole, ...pathNode } = node
    return pathNode
  })
}
