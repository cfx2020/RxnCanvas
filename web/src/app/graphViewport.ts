import type { CanvasViewportSummary } from "../shell"
import type { GraphNodeSummary } from "./workbenchState"
import {
  graphNodeLayoutBounds,
  graphNodePosition,
  type GraphNodeLayoutPosition,
} from "./graphNodeLayout"

export type GraphViewport = {
  x: number
  y: number
  zoom: number
}

export type GraphSurfaceSize = {
  width: number
  height: number
}

export type ViewportInputIntent =
  | { kind: "wheel-zoom"; anchor: GraphNodeLayoutPosition; deltaY: number; ctrlOrMeta?: boolean }
  | { kind: "minimap-center"; center: GraphNodeLayoutPosition }
  | { kind: "minimap-drag"; center: GraphNodeLayoutPosition }

export type GraphMinimapBounds = {
  left: number
  top: number
  right: number
  bottom: number
}

export type GraphMinimapRect = {
  left: number
  top: number
  width: number
  height: number
}

export type GraphMinimapGeometry = {
  scale: number
  offset: GraphNodeLayoutPosition
  graphBounds: GraphMinimapBounds
  viewportWindow: GraphMinimapRect
  nodes: Array<{ id: string; x: number; y: number }>
}

export const defaultGraphViewport: GraphViewport = {
  x: 0,
  y: 0,
  zoom: 1,
}

export const graphViewportZoomBounds = {
  min: 0.35,
  max: 2.5,
}

export function normalizeGraphViewport(value?: CanvasViewportSummary | null): GraphViewport {
  if (!value) return defaultGraphViewport
  const x = Number(value.x)
  const y = Number(value.y)
  const zoom = Number(value.zoom)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom) || zoom <= 0) {
    return defaultGraphViewport
  }
  return {
    x,
    y,
    zoom: clampGraphViewportZoom(zoom),
  }
}

export function graphViewportCssTransform(viewport: GraphViewport): string {
  const normalized = normalizeGraphViewport(viewport)
  const xPercent = -(normalized.x / graphNodeLayoutBounds.width) * 100 * normalized.zoom
  const yPercent = -(normalized.y / graphNodeLayoutBounds.height) * 100 * normalized.zoom
  return `translate(${roundViewportNumber(xPercent)}%, ${roundViewportNumber(yPercent)}%) scale(${roundViewportNumber(normalized.zoom)})`
}

export function screenPointToGraphPoint(
  point: GraphNodeLayoutPosition,
  surfaceSize: GraphSurfaceSize,
  viewport: GraphViewport,
): GraphNodeLayoutPosition {
  const size = normalizeSurfaceSize(surfaceSize)
  const normalized = normalizeGraphViewport(viewport)
  return {
    x: normalized.x + (point.x / size.width) * graphNodeLayoutBounds.width / normalized.zoom,
    y: normalized.y + (point.y / size.height) * graphNodeLayoutBounds.height / normalized.zoom,
  }
}

export function graphPointToScreenPoint(
  point: GraphNodeLayoutPosition,
  surfaceSize: GraphSurfaceSize,
  viewport: GraphViewport,
): GraphNodeLayoutPosition {
  const size = normalizeSurfaceSize(surfaceSize)
  const normalized = normalizeGraphViewport(viewport)
  return {
    x: ((point.x - normalized.x) * normalized.zoom / graphNodeLayoutBounds.width) * size.width,
    y: ((point.y - normalized.y) * normalized.zoom / graphNodeLayoutBounds.height) * size.height,
  }
}

export function zoomGraphViewport(
  viewport: GraphViewport,
  direction: "in" | "out",
  center?: GraphNodeLayoutPosition,
): GraphViewport {
  const normalized = normalizeGraphViewport(viewport)
  const factor = direction === "in" ? 1.2 : 1 / 1.2
  const zoom = clampGraphViewportZoom(normalized.zoom * factor)
  const targetCenter = center ?? graphViewportCenter(normalized)
  return {
    x: targetCenter.x - graphNodeLayoutBounds.width / (2 * zoom),
    y: targetCenter.y - graphNodeLayoutBounds.height / (2 * zoom),
    zoom,
  }
}

export function zoomGraphViewportAtScreenPoint(
  viewport: GraphViewport,
  surfaceSize: GraphSurfaceSize,
  anchor: GraphNodeLayoutPosition,
  deltaY: number,
  options: { ctrlOrMeta?: boolean } = {},
): GraphViewport {
  const normalized = normalizeGraphViewport(viewport)
  if (!Number.isFinite(deltaY) || deltaY === 0) return normalized
  const size = normalizeSurfaceSize(surfaceSize)
  const screenAnchor = clampPointToSurface(anchor, size)
  const graphAnchor = screenPointToGraphPoint(screenAnchor, size, normalized)
  const factor = options.ctrlOrMeta ? 1.2 : 1.1
  const zoom = clampGraphViewportZoom(normalized.zoom * (deltaY < 0 ? factor : 1 / factor))
  return {
    x: graphAnchor.x - (screenAnchor.x / size.width) * graphNodeLayoutBounds.width / zoom,
    y: graphAnchor.y - (screenAnchor.y / size.height) * graphNodeLayoutBounds.height / zoom,
    zoom,
  }
}

export function panGraphViewport(
  viewport: GraphViewport,
  delta: GraphNodeLayoutPosition,
): GraphViewport {
  const normalized = normalizeGraphViewport(viewport)
  const xDelta = Number.isFinite(delta.x) ? delta.x : 0
  const yDelta = Number.isFinite(delta.y) ? delta.y : 0
  return {
    x: normalized.x - xDelta,
    y: normalized.y - yDelta,
    zoom: normalized.zoom,
  }
}

export function fitGraphViewportToNodes(
  nodes: GraphNodeSummary[],
  surfaceSize: GraphSurfaceSize,
): GraphViewport {
  if (nodes.length === 0) return defaultGraphViewport
  const size = normalizeSurfaceSize(surfaceSize)
  const positions = nodes.map((node) => graphNodePosition(node))
  const minX = Math.min(...positions.map((position) => position.x))
  const maxX = Math.max(...positions.map((position) => position.x))
  const minY = Math.min(...positions.map((position) => position.y))
  const maxY = Math.max(...positions.map((position) => position.y))
  const nodeChrome = graphFitNodeChrome(size)
  const xSpanPixels = ((maxX - minX) / graphNodeLayoutBounds.width) * size.width
  const ySpanPixels = ((maxY - minY) / graphNodeLayoutBounds.height) * size.height
  const zoom = clampGraphViewportZoom(Math.min(
    1,
    size.width / Math.max(1, xSpanPixels + nodeChrome.width),
    size.height / Math.max(1, ySpanPixels + nodeChrome.height),
  ))
  const center = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  }
  return {
    x: center.x - graphNodeLayoutBounds.width / (2 * zoom),
    y: center.y - graphNodeLayoutBounds.height / (2 * zoom),
    zoom,
  }
}

function graphFitNodeChrome(surfaceSize: GraphSurfaceSize): { width: number; height: number } {
  const nodeWidth = clamp(surfaceSize.width * 0.24, 190, 236)
  const nodeHeight = 286
  const breathingRoom = 48
  return {
    width: nodeWidth + breathingRoom,
    height: nodeHeight + breathingRoom,
  }
}

export function resetGraphViewport(): GraphViewport {
  return defaultGraphViewport
}

export function createGraphMinimapGeometry(
  nodes: GraphNodeSummary[],
  viewport: GraphViewport,
  minimapSize: GraphSurfaceSize,
): GraphMinimapGeometry | null {
  if (nodes.length === 0) return null
  const size = normalizeSurfaceSize(minimapSize)
  const normalized = normalizeGraphViewport(viewport)
  const graphBounds = graphMinimapBoundsForNodesAndViewport(nodes, normalized)
  const graphWidth = Math.max(1, graphBounds.right - graphBounds.left)
  const graphHeight = Math.max(1, graphBounds.bottom - graphBounds.top)
  const padding = Math.min(12, Math.max(6, Math.min(size.width, size.height) * 0.08))
  const innerWidth = Math.max(1, size.width - padding * 2)
  const innerHeight = Math.max(1, size.height - padding * 2)
  const scale = Math.min(innerWidth / graphWidth, innerHeight / graphHeight)
  const drawnWidth = graphWidth * scale
  const drawnHeight = graphHeight * scale
  const offset = {
    x: (size.width - drawnWidth) / 2 - graphBounds.left * scale,
    y: (size.height - drawnHeight) / 2 - graphBounds.top * scale,
  }
  return {
    scale,
    offset,
    graphBounds,
    viewportWindow: graphMinimapViewportWindow(normalized, scale, offset),
    nodes: nodes.map((node) => {
      const position = graphNodePosition(node)
      return {
        id: node.id,
        x: position.x * scale + offset.x,
        y: position.y * scale + offset.y,
      }
    }),
  }
}

export function graphPointFromMinimapPoint(
  point: GraphNodeLayoutPosition,
  geometry: GraphMinimapGeometry,
): GraphNodeLayoutPosition {
  const scale = Number.isFinite(geometry.scale) && geometry.scale > 0 ? geometry.scale : 1
  return {
    x: (point.x - geometry.offset.x) / scale,
    y: (point.y - geometry.offset.y) / scale,
  }
}

export function graphViewportFromMinimapCenter(
  viewport: GraphViewport,
  center: GraphNodeLayoutPosition,
): GraphViewport {
  const normalized = normalizeGraphViewport(viewport)
  return {
    x: center.x - graphNodeLayoutBounds.width / (2 * normalized.zoom),
    y: center.y - graphNodeLayoutBounds.height / (2 * normalized.zoom),
    zoom: normalized.zoom,
  }
}

export function graphViewportFromMinimapPoint(
  viewport: GraphViewport,
  point: GraphNodeLayoutPosition,
  geometry: GraphMinimapGeometry,
): GraphViewport {
  return graphViewportFromMinimapCenter(viewport, graphPointFromMinimapPoint(point, geometry))
}

export function clampGraphViewportZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return defaultGraphViewport.zoom
  return Math.min(graphViewportZoomBounds.max, Math.max(graphViewportZoomBounds.min, zoom))
}

function graphViewportCenter(viewport: GraphViewport): GraphNodeLayoutPosition {
  return {
    x: viewport.x + graphNodeLayoutBounds.width / (2 * viewport.zoom),
    y: viewport.y + graphNodeLayoutBounds.height / (2 * viewport.zoom),
  }
}

function normalizeSurfaceSize(surfaceSize: GraphSurfaceSize): GraphSurfaceSize {
  if (
    Number.isFinite(surfaceSize.width)
    && Number.isFinite(surfaceSize.height)
    && surfaceSize.width > 0
    && surfaceSize.height > 0
  ) {
    return surfaceSize
  }
  return {
    width: graphNodeLayoutBounds.width,
    height: graphNodeLayoutBounds.height,
  }
}

function clampPointToSurface(
  point: GraphNodeLayoutPosition,
  surfaceSize: GraphSurfaceSize,
): GraphNodeLayoutPosition {
  return {
    x: clamp(point.x, 0, surfaceSize.width),
    y: clamp(point.y, 0, surfaceSize.height),
  }
}

function graphMinimapBoundsForNodesAndViewport(
  nodes: GraphNodeSummary[],
  viewport: GraphViewport,
): GraphMinimapBounds {
  const positions = nodes.map((node) => graphNodePosition(node))
  const visibleBounds = {
    left: viewport.x,
    top: viewport.y,
    right: viewport.x + graphNodeLayoutBounds.width / viewport.zoom,
    bottom: viewport.y + graphNodeLayoutBounds.height / viewport.zoom,
  }
  const nodePadding = 48
  return {
    left: Math.min(...positions.map((position) => position.x), visibleBounds.left) - nodePadding,
    top: Math.min(...positions.map((position) => position.y), visibleBounds.top) - nodePadding,
    right: Math.max(...positions.map((position) => position.x), visibleBounds.right) + nodePadding,
    bottom: Math.max(...positions.map((position) => position.y), visibleBounds.bottom) + nodePadding,
  }
}

function graphMinimapViewportWindow(
  viewport: GraphViewport,
  scale: number,
  offset: GraphNodeLayoutPosition,
): GraphMinimapRect {
  return {
    left: viewport.x * scale + offset.x,
    top: viewport.y * scale + offset.y,
    width: (graphNodeLayoutBounds.width / viewport.zoom) * scale,
    height: (graphNodeLayoutBounds.height / viewport.zoom) * scale,
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function roundViewportNumber(value: number): number {
  return Math.round(value * 1000) / 1000
}
