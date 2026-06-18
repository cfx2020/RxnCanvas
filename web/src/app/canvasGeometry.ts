import type { CanvasViewport, FlowEdge, FlowNode, Point } from "../domain/projectPackages"
import { energyTableRows, type EnergyDisplayOptions } from "./energyDisplay"

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
export const nodeHeight = 276
export const collapsedNodeHeight = 132
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
      x: current.x + delta.x,
      y: current.y + delta.y,
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
  const maxX = Math.max(...nodes.map((node) => node.position.x + nodeWidth))
  const maxY = Math.max(...nodes.map((node) => node.position.y + nodeHeight))
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
  const leftX = -360
  const stepX = 286
  const fallbackDepth = depthById.size > 0 ? Math.max(...Array.from(depthById.values()), 0) + 1 : 1
  const laneCounts = new Map<number, number>()

  return sorted.map((node, index) => {
    const relative = relativeById.get(node.id)
    const finite = typeof relative === "number" && Number.isFinite(relative)
    const signedEnergyRatio = finite ? relative / maxMagnitude : 0
    const depth = node.id === baselineId ? 0 : depthById.get(node.id) ?? fallbackDepth + index
    const laneIndex = laneCounts.get(depth) ?? 0
    laneCounts.set(depth, laneIndex + 1)
    const x = node.id === baselineId
      ? leftX
      : leftX + Math.max(1, depth) * stepX
    const y = finite
      ? 184 - signedEnergyRatio * 260 + laneIndex * 28
      : 264 + laneIndex * 86
    return {
      ...node,
      position: {
        x: Math.round(x / canvasGridSize) * canvasGridSize,
        y: Math.round(y / canvasGridSize) * canvasGridSize,
      },
    }
  })
}

function graphDepthsFromBaseline(nodes: FlowNode[], edges: FlowEdge[], baselineId: string | null): Map<string, number> {
  const ids = new Set(nodes.map((node) => node.id))
  if (!baselineId || !ids.has(baselineId)) return new Map()
  const outgoing = new Map<string, string[]>()
  const undirected = new Map<string, string[]>()
  edges.forEach((edge) => {
    if (!ids.has(edge.sourceId) || !ids.has(edge.targetId)) return
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
  const nodeCenter = {
    x: node.position.x + nodeWidth / 2,
    y: node.position.y + nodeHeight / 2,
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
  const maxX = Math.max(...nodes.map((node) => node.position.x + nodeWidth), visible.right, graphBounds.maxX) + nodePadding
  const maxY = Math.max(...nodes.map((node) => node.position.y + nodeHeight), visible.bottom, graphBounds.maxY) + nodePadding
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
    nodes: nodes.map((node) => ({
      id: node.id,
      left: node.position.x * scale + offset.x,
      top: node.position.y * scale + offset.y,
      width: Math.max(10, nodeWidth * scale),
      height: Math.max(8, nodeHeight * scale),
    })),
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
