import type { GraphEdgeSummary, GraphSummary } from "../shell"
import {
  clampGraphNodeLayoutPosition,
  graphNodeLayoutBounds,
  graphNodePosition,
  snapGraphNodeLayoutPosition,
  type GraphNodeLayoutPosition,
} from "./graphNodeLayout"
import { fitGraphViewportToNodes, type GraphViewport } from "./graphViewport"

export type GraphLayoutStrategy = "layered-left-to-right" | "grid-compact"

export type GraphLayoutWarning = {
  code: string
  message: string
  target?: string | null
}

export type GraphLayoutPlan = {
  graphId: string
  strategy: GraphLayoutStrategy
  nodePositions: Record<string, [number, number]>
  changedNodeIds: string[]
  viewportIntent?: GraphViewport | null
  warnings: GraphLayoutWarning[]
}

export type GraphLayoutPlanInput = {
  graph: GraphSummary
  fitAfterLayout?: boolean
}

export function createGraphLayoutPlan({
  graph,
  fitAfterLayout = true,
}: GraphLayoutPlanInput): GraphLayoutPlan {
  const nodes = [...graph.nodes].sort(compareGraphNodes)
  if (nodes.length === 0) {
    return {
      graphId: graph.id,
      strategy: "grid-compact",
      nodePositions: {},
      changedNodeIds: [],
      viewportIntent: null,
      warnings: [],
    }
  }

  const layerResult = createLayeredNodePositions(graph)
  const strategy = layerResult ? "layered-left-to-right" : "grid-compact"
  const warnings = layerResult?.warnings ?? [{
    code: usableGraphEdges(graph).length > 0 ? "layout_cycle_fallback" : "layout_grid_fallback",
    message: usableGraphEdges(graph).length > 0
      ? "Graph contains a cycle or cannot be layered; compact grid layout was used."
      : "Graph has no directed edges; compact grid layout was used.",
    target: graph.id,
  }]
  const positions = layerResult?.positions ?? createGridNodePositions(nodes.map((node) => node.id))
  const nodePositions = Object.fromEntries(
    Object.entries(positions).map(([nodeId, position]) => [nodeId, tuplePosition(position)]),
  )
  const changedNodeIds = nodes
    .map((node) => node.id)
    .filter((nodeId) => !samePosition(graphNodePosition(nodes.find((node) => node.id === nodeId)!), positions[nodeId]))
  const plannedNodes = nodes.map((node) => ({
    ...node,
    position: tuplePosition(positions[node.id]),
  }))

  return {
    graphId: graph.id,
    strategy,
    nodePositions,
    changedNodeIds,
    viewportIntent: fitAfterLayout ? fitGraphViewportToNodes(plannedNodes, graphNodeLayoutBounds) : null,
    warnings,
  }
}

function createLayeredNodePositions(graph: GraphSummary): {
  positions: Record<string, GraphNodeLayoutPosition>
  warnings: GraphLayoutWarning[]
} | null {
  const nodeIds = graph.nodes.map((node) => node.id)
  const edges = usableGraphEdges(graph)
  if (edges.length === 0) return null

  const incoming = new Map(nodeIds.map((nodeId) => [nodeId, 0]))
  const outgoing = new Map(nodeIds.map((nodeId) => [nodeId, [] as string[]]))
  for (const edge of edges) {
    outgoing.get(edge.source)?.push(edge.target)
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
  }

  const ready = nodeIds.filter((nodeId) => (incoming.get(nodeId) ?? 0) === 0).sort()
  const order: string[] = []
  const layers = new Map(nodeIds.map((nodeId) => [nodeId, 0]))
  while (ready.length > 0) {
    const nodeId = ready.shift()!
    order.push(nodeId)
    for (const target of [...(outgoing.get(nodeId) ?? [])].sort()) {
      layers.set(target, Math.max(layers.get(target) ?? 0, (layers.get(nodeId) ?? 0) + 1))
      incoming.set(target, (incoming.get(target) ?? 0) - 1)
      if (incoming.get(target) === 0) ready.push(target)
    }
    ready.sort()
  }

  if (order.length !== nodeIds.length) return null
  return {
    positions: positionsFromLayers(nodeIds, layers),
    warnings: [],
  }
}

function positionsFromLayers(
  nodeIds: string[],
  layers: Map<string, number>,
): Record<string, GraphNodeLayoutPosition> {
  const layerGroups = new Map<number, string[]>()
  for (const nodeId of nodeIds) {
    const layer = layers.get(nodeId) ?? 0
    layerGroups.set(layer, [...(layerGroups.get(layer) ?? []), nodeId])
  }
  const sortedLayers = [...layerGroups.keys()].sort((a, b) => a - b)
  const maxLayer = Math.max(0, ...sortedLayers)
  const xPadding = 80
  const yPadding = 72
  const positions: Record<string, GraphNodeLayoutPosition> = {}

  for (const layer of sortedLayers) {
    const ids = [...(layerGroups.get(layer) ?? [])].sort()
    const x = maxLayer === 0
      ? graphNodeLayoutBounds.width / 2
      : xPadding + (layer / maxLayer) * (graphNodeLayoutBounds.width - xPadding * 2)
    ids.forEach((nodeId, index) => {
      const y = ids.length === 1
        ? graphNodeLayoutBounds.height / 2
        : yPadding + (index / (ids.length - 1)) * (graphNodeLayoutBounds.height - yPadding * 2)
      positions[nodeId] = normalizeLayoutPosition({ x, y })
    })
  }

  return positions
}

function createGridNodePositions(nodeIds: string[]): Record<string, GraphNodeLayoutPosition> {
  const sortedIds = [...nodeIds].sort()
  const columns = Math.max(1, Math.ceil(Math.sqrt(sortedIds.length)))
  const rows = Math.max(1, Math.ceil(sortedIds.length / columns))
  const xPadding = 90
  const yPadding = 72
  const positions: Record<string, GraphNodeLayoutPosition> = {}

  sortedIds.forEach((nodeId, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const x = columns === 1
      ? graphNodeLayoutBounds.width / 2
      : xPadding + (column / (columns - 1)) * (graphNodeLayoutBounds.width - xPadding * 2)
    const y = rows === 1
      ? graphNodeLayoutBounds.height / 2
      : yPadding + (row / (rows - 1)) * (graphNodeLayoutBounds.height - yPadding * 2)
    positions[nodeId] = normalizeLayoutPosition({ x, y })
  })

  return positions
}

function usableGraphEdges(graph: GraphSummary): Array<{ source: string; target: string }> {
  const nodeIds = new Set(graph.nodes.map((node) => node.id))
  return graph.edges
    .map((edge) => ({
      source: edgeSource(edge),
      target: edgeTarget(edge),
    }))
    .filter((edge) => edge.source && edge.target && edge.source !== edge.target && nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .sort((left, right) => `${left.source}:${left.target}`.localeCompare(`${right.source}:${right.target}`))
}

function normalizeLayoutPosition(position: GraphNodeLayoutPosition): GraphNodeLayoutPosition {
  return snapGraphNodeLayoutPosition(clampGraphNodeLayoutPosition(position))
}

function compareGraphNodes(
  left: GraphSummary["nodes"][number],
  right: GraphSummary["nodes"][number],
): number {
  return `${left.label}:${left.id}`.localeCompare(`${right.label}:${right.id}`)
}

function edgeSource(edge: GraphEdgeSummary): string {
  return edge.from_node ?? edge.source ?? ""
}

function edgeTarget(edge: GraphEdgeSummary): string {
  return edge.to_node ?? edge.target ?? ""
}

function tuplePosition(position: GraphNodeLayoutPosition): [number, number] {
  return [position.x, position.y]
}

function samePosition(nodePosition: GraphNodeLayoutPosition, plannedPosition: GraphNodeLayoutPosition): boolean {
  return nodePosition.x === plannedPosition.x && nodePosition.y === plannedPosition.y
}
