import type { CanvasViewport, FlowEdge, FlowNode, Point } from "../domain/projectPackages"
import { energyTableRows, nodeEnergyForRelativeKcal, type EnergyDisplayOptions } from "./energyDisplay"

export type SurfaceSize = {
  width: number
  height: number
}

export type CanvasSelectionRect = {
  x: number
  y: number
  width: number
  height: number
}

export type NodeDragGeometry = {
  start: Point
  origin: Point
}

export type MinimapGeometry = {
  scale: number
  offset: Point
  nodes: Array<{
    id: string
    left: number
    top: number
    width: number
    height: number
  }>
  viewportWindow: {
    left: number
    top: number
    width: number
    height: number
  }
}

export const nodeWidth = 210
export const nodeHeight = 214
export const minNodeWidth = 168
export const minNodeHeight = 148
export const maxNodeWidth = 380
export const maxNodeHeight = 360
export const canvasGridSize = 8
export const minCanvasZoom = 0.16
export const maxCanvasZoom = 1.65
export const minimapSize: SurfaceSize = { width: 176, height: 104 }
export const fallbackCanvasSize: SurfaceSize = { width: 900, height: 640 }

const graphBounds = {
  minX: -440,
  minY: -170,
  maxX: 520 + nodeWidth,
  maxY: 310 + nodeHeight,
}
const primaryFocusNode = { x: 10, y: -140 }

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function flowNodeSize(node: Pick<FlowNode, "size"> | null | undefined): SurfaceSize {
  const width = node?.size?.width
  const height = node?.size?.height
  return clampNodeSize({
    width: typeof width === "number" && Number.isFinite(width) ? width : nodeWidth,
    height: typeof height === "number" && Number.isFinite(height) ? height : nodeHeight,
  })
}

export function clampNodeSize(size: SurfaceSize): SurfaceSize {
  return {
    width: clamp(size.width, minNodeWidth, maxNodeWidth),
    height: clamp(size.height, minNodeHeight, maxNodeHeight),
  }
}

export function snappedNodeSize(size: SurfaceSize): SurfaceSize {
  const clamped = clampNodeSize(size)
  return clampNodeSize({
    width: Math.round(clamped.width / canvasGridSize) * canvasGridSize,
    height: Math.round(clamped.height / canvasGridSize) * canvasGridSize,
  })
}

export function resizedNodeSize(
  origin: SurfaceSize,
  start: Point,
  current: Point,
  snap = false,
): SurfaceSize {
  const next = {
    width: origin.width + current.x - start.x,
    height: origin.height + current.y - start.y,
  }
  return snap ? snappedNodeSize(next) : clampNodeSize(next)
}

export function snappedCanvasPoint(point: Point): Point {
  return {
    x: Math.round(point.x / canvasGridSize) * canvasGridSize,
    y: Math.round(point.y / canvasGridSize) * canvasGridSize,
  }
}

export function nodeDragPosition(drag: NodeDragGeometry, world: Point, snap = false): Point {
  const position = {
    x: drag.origin.x + world.x - drag.start.x,
    y: drag.origin.y + world.y - drag.start.y,
  }
  return snap ? snappedCanvasPoint(position) : position
}


export function worldPointFromClientPoint(
  clientPoint: Point,
  canvasOffset: Point,
  viewport: CanvasViewport,
): Point {
  return {
    x: (clientPoint.x - canvasOffset.x - viewport.x) / viewport.zoom,
    y: (clientPoint.y - canvasOffset.y - viewport.y) / viewport.zoom,
  }
}

export function pannedViewportFromDrag(
  current: CanvasViewport,
  drag: NodeDragGeometry,
  clientPoint: Point,
): CanvasViewport {
  return {
    ...current,
    x: drag.origin.x + clientPoint.x - drag.start.x,
    y: drag.origin.y + clientPoint.y - drag.start.y,
  }
}

export function viewportFromCanvasWheel(
  current: CanvasViewport,
  canvasOffset: Point,
  clientPoint: Point,
  delta: Point,
  zoomGesture: boolean,
): CanvasViewport {
  if (!zoomGesture) {
    return {
      ...current,
      x: current.x - delta.x,
      y: current.y - delta.y,
    }
  }

  const before = worldPointFromClientPoint(clientPoint, canvasOffset, current)
  const nextZoom = clamp(current.zoom * (delta.y > 0 ? 0.9 : 1.1), minCanvasZoom, maxCanvasZoom)

  return {
    zoom: nextZoom,
    x: clientPoint.x - canvasOffset.x - before.x * nextZoom,
    y: clientPoint.y - canvasOffset.y - before.y * nextZoom,
  }
}

export function defaultCanvasViewportForSize(size: SurfaceSize): CanvasViewport {
  const { width, height } = size

  if (width < 560) {
    const zoom = 0.62
    return {
      zoom,
      x: Math.round(width / 2 - (nodeWidth * zoom) / 2 - primaryFocusNode.x * zoom),
      y: Math.round(134 - primaryFocusNode.y * zoom),
    }
  }

  const rangeX = graphBounds.maxX - graphBounds.minX
  const rangeY = graphBounds.maxY - graphBounds.minY
  const zoom = clamp(
    Math.min((width - 96) / rangeX, (height - 120) / rangeY),
    0.58,
    0.82,
  )

  return {
    zoom,
    x: Math.round((width - rangeX * zoom) / 2 - graphBounds.minX * zoom),
    y: Math.round((height - rangeY * zoom) / 2 - graphBounds.minY * zoom),
  }
}

export function fitViewportToNodesForSize(nodes: FlowNode[], size: SurfaceSize): CanvasViewport {
  if (nodes.length === 0) return defaultCanvasViewportForSize(size)
  const { width, height } = size
  const minX = Math.min(...nodes.map((node) => node.position.x))
  const minY = Math.min(...nodes.map((node) => node.position.y))
  const maxX = Math.max(...nodes.map((node) => node.position.x + flowNodeSize(node).width))
  const maxY = Math.max(...nodes.map((node) => node.position.y + flowNodeSize(node).height))
  const gutterX = width < 560 ? 44 : 96
  const gutterY = width < 560 ? 156 : 126
  const rangeX = Math.max(maxX - minX, nodeWidth)
  const rangeY = Math.max(maxY - minY, nodeHeight)
  const zoom = clamp(
    Math.min((width - gutterX) / rangeX, (height - gutterY) / rangeY),
    width < 560 ? minCanvasZoom : 0.3,
    0.95,
  )
  return {
    zoom,
    x: Math.round((width - rangeX * zoom) / 2 - minX * zoom),
    y: Math.round((height - rangeY * zoom) / 2 - minY * zoom),
  }
}

export function autoLayoutFlowNodes(nodes: FlowNode[], options: EnergyDisplayOptions, edges: FlowEdge[] = []): FlowNode[] {
  const rows = energyTableRows(nodes, options, edges)
  const relativeById = new Map(rows.map((row) => [row.nodeId, row.relative]))
  const visibleById = new Map(rows.map((row) => [row.nodeId, row.showInRelativeTable]))
  const sourceIndexById = new Map(nodes.map((node, index) => [node.id, index]))
  const baselineId = options.baselineNodeId ?? rows.find((row) => row.relativeRole === "baseline")?.nodeId ?? null
  const depthById = graphDepthsFromBaseline(nodes, edges, baselineId)
  const sorted = [...nodes].sort((left, right) => compareLayoutNodes({
    left,
    right,
    baselineId,
    visibleById,
    relativeById,
    depthById,
    sourceIndexById,
  }))
  const finiteValues = nodes
    .map((node) => relativeById.get(node.id))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  const maxMagnitude = finiteValues.length > 0 ? Math.max(...finiteValues.map((value) => Math.abs(value)), 1) : 1
  const layoutGraph = createLayoutGraph(nodes, edges, sourceIndexById)
  const ownFiniteEnergyById = new Map(nodes.map((node) => {
    const value = nodeEnergyForRelativeKcal(node, options)
    return [node.id, typeof value === "number" && Number.isFinite(value)]
  }))
  const mainPathIds = mainPathForLayout({
    nodes: sorted,
    graph: layoutGraph,
    baselineId,
    visibleById,
    relativeById,
    ownFiniteEnergyById,
  })
  const mainPathIdSet = new Set(mainPathIds)
  const mainIndexById = new Map(mainPathIds.map((id, index) => [id, index]))
  const sideLaneCountByAnchor = new Map<number, number>()
  const leftX = -320
  const stepX = 300
  const mainBaseY = 184
  const mainBaseEnergyY = mainBaseY + nodeHeight * 0.5
  const energyAmplitude = 220
  const unknownMainY = 264
  const highestMainY = Math.min(
    ...mainPathIds
      .map((id) => sorted.find((node) => node.id === id))
      .filter((node): node is FlowNode => Boolean(node))
      .map((node) => {
        const relative = relativeById.get(node.id)
        return typeof relative === "number" && Number.isFinite(relative)
          ? mainEnergyAnchorY(relative, maxMagnitude, mainBaseEnergyY, energyAmplitude) - layoutEnergyAnchorOffset(node)
          : unknownMainY
      }),
    mainBaseY,
  )
  const tallestSideNode = Math.max(
    nodeHeight,
    ...sorted
      .filter((node) => !mainPathIdSet.has(node.id))
      .map((node) => flowNodeSize(node).height),
  )
  const sideBaseY = Math.round((highestMainY - tallestSideNode - 32) / canvasGridSize) * canvasGridSize
  const sideLaneStepY = Math.round((tallestSideNode + 24) / canvasGridSize) * canvasGridSize

  return sorted.map((node, index) => {
    const relative = relativeById.get(node.id)
    const finite = typeof relative === "number" && Number.isFinite(relative)
    const mainIndex = mainIndexById.get(node.id)
    if (typeof mainIndex === "number") {
      const signedEnergyRatio = finite ? relative / maxMagnitude : 0
      const x = leftX + mainIndex * stepX
      const y = finite
        ? mainEnergyAnchorY(relative, maxMagnitude, mainBaseEnergyY, energyAmplitude) - layoutEnergyAnchorOffset(node)
        : unknownMainY
      return {
        ...node,
        position: {
          x: Math.round(x / canvasGridSize) * canvasGridSize,
          y: Math.round(y / canvasGridSize) * canvasGridSize,
        },
      }
    }

    const anchorIndex = sideAnchorIndex(node.id, layoutGraph, edges, mainIndexById, mainPathIds.length, index)
    const laneIndex = sideLaneCountByAnchor.get(anchorIndex) ?? 0
    sideLaneCountByAnchor.set(anchorIndex, laneIndex + 1)
    const x = leftX + anchorIndex * stepX
    const y = sideBaseY - laneIndex * sideLaneStepY
    return {
      ...node,
      position: {
        x: Math.round(x / canvasGridSize) * canvasGridSize,
        y: Math.round(y / canvasGridSize) * canvasGridSize,
      },
    }
  })
}

function mainEnergyAnchorY(
  relative: number,
  maxMagnitude: number,
  mainBaseEnergyY: number,
  energyAmplitude: number,
): number {
  return mainBaseEnergyY - (relative / maxMagnitude) * energyAmplitude
}

function layoutEnergyAnchorOffset(node: FlowNode): number {
  const size = flowNodeSize(node)
  return node.kind === "transition" ? size.height + 28 : size.height * 0.5
}

type LayoutGraph = {
  incoming: Map<string, string[]>
  outgoing: Map<string, string[]>
}

function createLayoutGraph(
  nodes: FlowNode[],
  edges: FlowEdge[],
  sourceIndexById: Map<string, number>,
): LayoutGraph {
  const ids = new Set(nodes.map((node) => node.id))
  const participantIds = new Set(nodes.filter((node) => node.pathRole === "participant").map((node) => node.id))
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  for (const node of nodes) {
    incoming.set(node.id, [])
    outgoing.set(node.id, [])
  }
  for (const edge of edges) {
    if (!ids.has(edge.sourceId) || !ids.has(edge.targetId)) continue
    if (edge.stepRole === "addition" || edge.stepRole === "release") continue
    if (participantIds.has(edge.sourceId) || participantIds.has(edge.targetId)) continue
    outgoing.get(edge.sourceId)?.push(edge.targetId)
    incoming.get(edge.targetId)?.push(edge.sourceId)
  }
  const bySourceOrder = (left: string, right: string) => (sourceIndexById.get(left) ?? 0) - (sourceIndexById.get(right) ?? 0)
  for (const [, ids] of incoming) ids.sort(bySourceOrder)
  for (const [, ids] of outgoing) ids.sort(bySourceOrder)
  return { incoming, outgoing }
}

function mainPathForLayout({
  nodes,
  graph,
  baselineId,
  visibleById,
  relativeById,
  ownFiniteEnergyById,
}: {
  nodes: FlowNode[]
  graph: LayoutGraph
  baselineId: string | null
  visibleById: Map<string, boolean>
  relativeById: Map<string, number | null>
  ownFiniteEnergyById: Map<string, boolean>
}): string[] {
  if (nodes.length === 0) return []
  if (graph.outgoing.size === 0 || Array.from(graph.outgoing.values()).every((targets) => targets.length === 0)) {
    return nodes.map((node) => node.id)
  }

  const nodeIdSet = new Set(nodes.map((node) => node.id))
  const rootIds = nodes
    .map((node) => node.id)
    .filter((id) => (graph.incoming.get(id) ?? []).length === 0)
  const starts = baselineId && nodeIdSet.has(baselineId)
    ? [baselineId, ...rootIds.filter((id) => id !== baselineId)]
    : rootIds.length > 0
      ? rootIds
      : [nodes[0].id]

  let bestPath: string[] = []
  for (const start of starts) {
    const path = trimTrailingAuxiliaryLayoutNodes(
      longestDirectedPathFrom(start, graph, visibleById, relativeById, ownFiniteEnergyById),
      ownFiniteEnergyById,
    )
    if (compareLayoutPaths(path, bestPath, visibleById, relativeById, ownFiniteEnergyById) > 0) bestPath = path
  }
  return bestPath.length > 0 ? bestPath : nodes.map((node) => node.id)
}

function longestDirectedPathFrom(
  startId: string,
  graph: LayoutGraph,
  visibleById: Map<string, boolean>,
  relativeById: Map<string, number | null>,
  ownFiniteEnergyById: Map<string, boolean>,
): string[] {
  const visit = (id: string, seen: Set<string>): string[] => {
    if (seen.has(id)) return []
    const nextSeen = new Set(seen)
    nextSeen.add(id)
    const children = (graph.outgoing.get(id) ?? []).filter((child) => !nextSeen.has(child))
    if (children.length === 0) return [id]
    let bestChildPath: string[] = []
    for (const child of children) {
      const childPath = visit(child, nextSeen)
      if (compareLayoutPaths(childPath, bestChildPath, visibleById, relativeById, ownFiniteEnergyById) > 0) bestChildPath = childPath
    }
    return [id, ...bestChildPath]
  }
  return visit(startId, new Set())
}

function trimTrailingAuxiliaryLayoutNodes(
  path: string[],
  ownFiniteEnergyById: Map<string, boolean>,
): string[] {
  const trimmed = [...path]
  while (trimmed.length > 1 && !ownFiniteEnergyById.get(trimmed[trimmed.length - 1])) {
    trimmed.pop()
  }
  return trimmed
}

function compareLayoutPaths(
  left: string[],
  right: string[],
  visibleById: Map<string, boolean>,
  relativeById: Map<string, number | null>,
  ownFiniteEnergyById: Map<string, boolean>,
): number {
  const leftOwnFinite = left.filter((id) => ownFiniteEnergyById.get(id)).length
  const rightOwnFinite = right.filter((id) => ownFiniteEnergyById.get(id)).length
  if (leftOwnFinite !== rightOwnFinite) return leftOwnFinite - rightOwnFinite
  const leftFinite = left.filter((id) => {
    const value = relativeById.get(id)
    return typeof value === "number" && Number.isFinite(value)
  }).length
  const rightFinite = right.filter((id) => {
    const value = relativeById.get(id)
    return typeof value === "number" && Number.isFinite(value)
  }).length
  if (leftFinite !== rightFinite) return leftFinite - rightFinite
  const leftVisibleFinite = left.filter((id) => {
    const value = relativeById.get(id)
    return (visibleById.get(id) ?? true) && typeof value === "number" && Number.isFinite(value)
  }).length
  const rightVisibleFinite = right.filter((id) => {
    const value = relativeById.get(id)
    return (visibleById.get(id) ?? true) && typeof value === "number" && Number.isFinite(value)
  }).length
  if (leftVisibleFinite !== rightVisibleFinite) return leftVisibleFinite - rightVisibleFinite
  if (left.length !== right.length) return left.length - right.length
  return 0
}

function sideAnchorIndex(
  nodeId: string,
  graph: LayoutGraph,
  edges: FlowEdge[],
  mainIndexById: Map<string, number>,
  mainPathLength: number,
  fallbackIndex: number,
): number {
  const semanticAnchor = semanticSideAnchorIndex(nodeId, edges, mainIndexById)
  if (typeof semanticAnchor === "number") return semanticAnchor
  const incomingMain = (graph.incoming.get(nodeId) ?? [])
    .map((id) => mainIndexById.get(id))
    .filter((index): index is number => typeof index === "number")
  const outgoingMain = (graph.outgoing.get(nodeId) ?? [])
    .map((id) => mainIndexById.get(id))
    .filter((index): index is number => typeof index === "number")
  const connected = [...incomingMain, ...outgoingMain]
  if (connected.length > 0) return Math.min(...connected)
  return Math.min(Math.max(fallbackIndex, 0), Math.max(mainPathLength - 1, 0))
}

function semanticSideAnchorIndex(
  nodeId: string,
  edges: FlowEdge[],
  mainIndexById: Map<string, number>,
): number | null {
  const anchors = edges
    .filter((edge) => edge.stepRole === "addition" || edge.stepRole === "release")
    .filter((edge) => edge.sourceId === nodeId || edge.targetId === nodeId)
    .map((edge) => edge.sourceId === nodeId ? edge.targetId : edge.sourceId)
    .map((id) => mainIndexById.get(id))
    .filter((index): index is number => typeof index === "number")
  return anchors.length > 0 ? Math.min(...anchors) : null
}

function graphDepthsFromBaseline(nodes: FlowNode[], edges: FlowEdge[], baselineId: string | null): Map<string, number> {
  const ids = new Set(nodes.map((node) => node.id))
  const participantIds = new Set(nodes.filter((node) => node.pathRole === "participant").map((node) => node.id))
  if (!baselineId || !ids.has(baselineId)) return new Map()
  const outgoing = new Map<string, string[]>()
  const undirected = new Map<string, string[]>()
  edges.forEach((edge) => {
    if (!ids.has(edge.sourceId) || !ids.has(edge.targetId)) return
    if (edge.stepRole === "addition" || edge.stepRole === "release") return
    if (participantIds.has(edge.sourceId) || participantIds.has(edge.targetId)) return
    outgoing.set(edge.sourceId, [...(outgoing.get(edge.sourceId) ?? []), edge.targetId])
    undirected.set(edge.sourceId, [...(undirected.get(edge.sourceId) ?? []), edge.targetId])
    undirected.set(edge.targetId, [...(undirected.get(edge.targetId) ?? []), edge.sourceId])
  })
  const directedDepths = breadthFirstDepths(baselineId, outgoing)
  if (directedDepths.size > 1) return directedDepths
  return breadthFirstDepths(baselineId, undirected)
}

function breadthFirstDepths(startId: string, adjacency: Map<string, string[]>): Map<string, number> {
  const depths = new Map<string, number>([[startId, 0]])
  const queue = [startId]
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    const nextDepth = (depths.get(current) ?? 0) + 1
    for (const next of adjacency.get(current) ?? []) {
      if (depths.has(next)) continue
      depths.set(next, nextDepth)
      queue.push(next)
    }
  }
  return depths
}

function compareLayoutNodes({
  left,
  right,
  baselineId,
  visibleById,
  relativeById,
  depthById,
  sourceIndexById,
}: {
  left: FlowNode
  right: FlowNode
  baselineId: string | null
  visibleById: Map<string, boolean>
  relativeById: Map<string, number | null>
  depthById: Map<string, number>
  sourceIndexById: Map<string, number>
}): number {
  if (left.id === baselineId && right.id !== baselineId) return -1
  if (right.id === baselineId && left.id !== baselineId) return 1
  const leftVisible = visibleById.get(left.id) ?? true
  const rightVisible = visibleById.get(right.id) ?? true
  if (leftVisible !== rightVisible) return leftVisible ? -1 : 1
  const leftDepth = depthById.get(left.id)
  const rightDepth = depthById.get(right.id)
  if (typeof leftDepth === "number" && typeof rightDepth === "number" && leftDepth !== rightDepth) return leftDepth - rightDepth
  if (typeof leftDepth === "number" && typeof rightDepth !== "number") return -1
  if (typeof rightDepth === "number" && typeof leftDepth !== "number") return 1
  const leftValue = relativeById.get(left.id)
  const rightValue = relativeById.get(right.id)
  if (typeof leftValue === "number" && typeof rightValue === "number") return leftValue - rightValue
  if (typeof leftValue === "number") return -1
  if (typeof rightValue === "number") return 1
  return (sourceIndexById.get(left.id) ?? 0) - (sourceIndexById.get(right.id) ?? 0)
}

export function nodeContainedInSelectionRect(node: FlowNode, rect: CanvasSelectionRect): boolean {
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  const size = flowNodeSize(node)
  const nodeCenter = {
    x: node.position.x + size.width / 2,
    y: node.position.y + size.height / 2,
  }
  return nodeCenter.x >= rect.x
    && nodeCenter.x <= right
    && nodeCenter.y >= rect.y
    && nodeCenter.y <= bottom
}

export function createMinimapGeometry(
  nodes: FlowNode[],
  viewport: CanvasViewport,
  canvasSize: SurfaceSize,
  size: SurfaceSize,
): MinimapGeometry {
  const visible = visibleWorldRect(viewport, canvasSize)
  const nodePadding = 120
  const minX = Math.min(...nodes.map((node) => node.position.x), visible.left, graphBounds.minX) - nodePadding
  const minY = Math.min(...nodes.map((node) => node.position.y), visible.top, graphBounds.minY) - nodePadding
  const maxX = Math.max(...nodes.map((node) => node.position.x + flowNodeSize(node).width), visible.right, graphBounds.maxX) + nodePadding
  const maxY = Math.max(...nodes.map((node) => node.position.y + flowNodeSize(node).height), visible.bottom, graphBounds.maxY) + nodePadding
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const padding = 14
  const innerWidth = Math.max(1, size.width - padding * 2)
  const innerHeight = Math.max(1, size.height - padding * 2)
  const scale = Math.min(innerWidth / width, innerHeight / height)
  const drawnWidth = width * scale
  const drawnHeight = height * scale
  const offset = {
    x: (size.width - drawnWidth) / 2 - minX * scale,
    y: (size.height - drawnHeight) / 2 - minY * scale,
  }

  return {
    scale,
    offset,
    nodes: nodes.map((node) => {
      const size = flowNodeSize(node)
      return {
        id: node.id,
        left: node.position.x * scale + offset.x,
        top: node.position.y * scale + offset.y,
        width: Math.max(10, size.width * scale),
        height: Math.max(8, size.height * scale),
      }
    }),
    viewportWindow: {
      left: visible.left * scale + offset.x,
      top: visible.top * scale + offset.y,
      width: Math.max(16, (visible.right - visible.left) * scale),
      height: Math.max(12, (visible.bottom - visible.top) * scale),
    },
  }
}

export function visibleWorldRect(viewport: CanvasViewport, canvasSize: SurfaceSize) {
  const zoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1
  return {
    left: -viewport.x / zoom,
    top: -viewport.y / zoom,
    right: (canvasSize.width - viewport.x) / zoom,
    bottom: (canvasSize.height - viewport.y) / zoom,
  }
}

export function viewportFromMinimapPoint(
  point: Point,
  geometry: MinimapGeometry,
  viewport: CanvasViewport,
  canvasSize: SurfaceSize,
): CanvasViewport {
  const scale = Number.isFinite(geometry.scale) && geometry.scale > 0 ? geometry.scale : 1
  const world = {
    x: (point.x - geometry.offset.x) / scale,
    y: (point.y - geometry.offset.y) / scale,
  }
  const zoom = clamp(viewport.zoom, minCanvasZoom, maxCanvasZoom)
  return {
    zoom,
    x: Math.round(canvasSize.width / 2 - world.x * zoom),
    y: Math.round(canvasSize.height / 2 - world.y * zoom),
  }
}

export function minimapRectStyle(rect: MinimapGeometry["viewportWindow"]) {
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
}
