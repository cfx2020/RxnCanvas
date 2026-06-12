import type { WorkspaceSummary } from "../shell"

export type GraphRelativeEnergyTerm = {
  object_id: string
  coefficient: number
}

type GraphNode = WorkspaceSummary["graph"]["nodes"][number]
type GraphEdge = WorkspaceSummary["graph"]["edges"][number]

export function graphNodeEnergyCompositionTerms(node: GraphNode): GraphRelativeEnergyTerm[] {
  const composition = node.composition ?? []
  const sourceTerms = composition.length > 0
    ? composition
    : (node.chemical_object_ids ?? []).map((objectId) => ({ object_id: objectId, coefficient: 1 }))
  return sourceTerms
    .map((term) => ({
      object_id: term.object_id,
      coefficient: Number(term.coefficient ?? 1),
    }))
    .filter((term) => term.object_id && Number.isFinite(term.coefficient) && term.coefficient !== 0)
}

export function graphNodeUsesManualCompositionExpression(node: GraphNode): boolean {
  const composition = node.composition ?? []
  return composition.some((term) => Number(term.coefficient ?? 1) !== 1)
}

export function relativeMainPathNodeIds(
  workspace: WorkspaceSummary | null | undefined,
  referenceNodeId: string | null | undefined,
): string[] {
  if (!workspace) return []
  const graph = workspace.graph
  const nodeIds = graph.nodes.map((node) => node.id)
  if (nodeIds.length === 0) return []
  const validNodeIds = new Set(nodeIds)
  const activePath = workspace.active_path_id
    ? graph.paths.find((path) => path.id === workspace.active_path_id)
    : undefined
  const activePathNodeIds = (activePath ?? graph.paths[0])?.node_ids.filter((nodeId) => validNodeIds.has(nodeId)) ?? []
  const reference = referenceNodeId && validNodeIds.has(referenceNodeId)
    ? referenceNodeId
    : activePathNodeIds[0] ?? nodeIds[0]
  const directed = longestDirectedPathFrom(graph.edges, reference, validNodeIds, activePathNodeIds)
  if (directed.length > 1) return directed
  const referenceIndex = activePathNodeIds.indexOf(reference)
  if (referenceIndex >= 0) return activePathNodeIds.slice(referenceIndex)
  return [reference, ...activePathNodeIds.filter((nodeId) => nodeId !== reference)]
}

export function relativeEnergyExpressionTermsByNodeId(
  workspace: WorkspaceSummary | null | undefined,
  referenceNodeId: string | null | undefined,
): Map<string, GraphRelativeEnergyTerm[]> {
  if (!workspace || !referenceNodeId) return new Map()
  const nodeById = new Map(workspace.graph.nodes.map((node) => [node.id, node]))
  const referenceNode = nodeById.get(referenceNodeId)
  if (!referenceNode) return new Map()
  const mainPathNodeIds = relativeMainPathNodeIds(workspace, referenceNodeId)
  const mainIndexByNodeId = new Map(mainPathNodeIds.map((nodeId, index) => [nodeId, index]))
  if (!mainIndexByNodeId.has(referenceNodeId)) return new Map()
  const sideEvents = relativeSideSpeciesEvents(workspace, mainIndexByNodeId)
  const result = new Map<string, GraphRelativeEnergyTerm[]>()

  for (const [nodeId, index] of mainIndexByNodeId) {
    if (nodeId === referenceNodeId) continue
    const node = nodeById.get(nodeId)
    if (!node) continue
    if (graphNodeUsesManualCompositionExpression(node)) {
      result.set(nodeId, graphNodeEnergyCompositionTerms(node))
      continue
    }
    const termMap = new Map<string, number>()
    addNodeTerms(termMap, node, 1)
    for (const event of sideEvents) {
      if (event.sign > 0 && event.mainIndex < index) {
        addNodeTerms(termMap, event.node, 1)
      }
      if (event.sign < 0 && event.mainIndex <= index) {
        addNodeTerms(termMap, event.node, -1)
      }
    }
    addNodeTerms(termMap, referenceNode, -1)
    const terms = termsFromMap(termMap)
    if (terms.length > 0) result.set(nodeId, terms)
  }

  return result
}

type RelativeSideSpeciesEvent = {
  mainIndex: number
  node: GraphNode
  sign: 1 | -1
}

function relativeSideSpeciesEvents(
  workspace: WorkspaceSummary,
  mainIndexByNodeId: Map<string, number>,
): RelativeSideSpeciesEvent[] {
  const nodeById = new Map(workspace.graph.nodes.map((node) => [node.id, node]))
  const events: RelativeSideSpeciesEvent[] = []
  const seen = new Set<string>()
  for (const edge of workspace.graph.edges) {
    const source = graphEdgeSource(edge)
    const target = graphEdgeTarget(edge)
    const sourceIndex = mainIndexByNodeId.get(source)
    const targetIndex = mainIndexByNodeId.get(target)
    if (typeof sourceIndex === "number" && typeof targetIndex !== "number") {
      const node = nodeById.get(target)
      if (node && graphNodeEnergyCompositionTerms(node).length > 0) {
        const key = `${target}:release:${sourceIndex}`
        if (!seen.has(key)) {
          seen.add(key)
          events.push({ mainIndex: sourceIndex, node, sign: 1 })
        }
      }
    }
    if (typeof sourceIndex !== "number" && typeof targetIndex === "number") {
      if (targetIndex === 0) continue
      const node = nodeById.get(source)
      if (node && graphNodeEnergyCompositionTerms(node).length > 0) {
        const key = `${source}:consume:${targetIndex}`
        if (!seen.has(key)) {
          seen.add(key)
          events.push({ mainIndex: targetIndex, node, sign: -1 })
        }
      }
    }
  }
  return events.sort((left, right) => left.mainIndex - right.mainIndex || left.node.id.localeCompare(right.node.id))
}

function addNodeTerms(termMap: Map<string, number>, node: GraphNode, multiplier: number): void {
  for (const term of graphNodeEnergyCompositionTerms(node)) {
    termMap.set(term.object_id, (termMap.get(term.object_id) ?? 0) + term.coefficient * multiplier)
  }
}

function termsFromMap(termMap: Map<string, number>): GraphRelativeEnergyTerm[] {
  return Array.from(termMap.entries())
    .map(([object_id, coefficient]) => ({ object_id, coefficient }))
    .filter((term) => Math.abs(term.coefficient) > 1e-12)
}

function longestDirectedPathFrom(
  edges: GraphEdge[],
  referenceNodeId: string,
  validNodeIds: Set<string>,
  activePathNodeIds: string[],
): string[] {
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    const source = graphEdgeSource(edge)
    const target = graphEdgeTarget(edge)
    if (!validNodeIds.has(source) || !validNodeIds.has(target) || source === target) continue
    outgoing.set(source, [...(outgoing.get(source) ?? []), target])
  }
  const activeRank = new Map(activePathNodeIds.map((nodeId, index) => [nodeId, index]))
  const path = [referenceNodeId]
  const visited = new Set(path)
  while (path.length <= validNodeIds.size) {
    const current = path[path.length - 1]
    const candidates = (outgoing.get(current) ?? []).filter((nodeId) => !visited.has(nodeId))
    if (candidates.length === 0) break
    const next = candidates
      .map((nodeId) => ({
        nodeId,
        depth: downstreamDepth(nodeId, outgoing, new Set(visited)),
        rank: activeRank.get(nodeId) ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((left, right) => right.depth - left.depth || left.rank - right.rank || left.nodeId.localeCompare(right.nodeId))[0]?.nodeId
    if (!next) break
    path.push(next)
    visited.add(next)
  }
  return path
}

function downstreamDepth(
  nodeId: string,
  outgoing: Map<string, string[]>,
  visited: Set<string>,
): number {
  if (visited.has(nodeId)) return 0
  visited.add(nodeId)
  const depths = (outgoing.get(nodeId) ?? []).map((target) => downstreamDepth(target, outgoing, new Set(visited)))
  return 1 + (depths.length > 0 ? Math.max(...depths) : 0)
}

function graphEdgeSource(edge: GraphEdge): string {
  return edge.from_node ?? edge.source ?? ""
}

function graphEdgeTarget(edge: GraphEdge): string {
  return edge.to_node ?? edge.target ?? ""
}
