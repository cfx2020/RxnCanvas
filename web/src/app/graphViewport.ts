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
  normalizeSurfaceSize(surfaceSize)
  const positions = nodes.map((node) => graphNodePosition(node))
  const minX = Math.min(...positions.map((position) => position.x))
  const maxX = Math.max(...positions.map((position) => position.x))
  const minY = Math.min(...positions.map((position) => position.y))
  const maxY = Math.max(...positions.map((position) => position.y))
  const padding = 48
  const width = Math.max(1, maxX - minX + padding * 2)
  const height = Math.max(1, maxY - minY + padding * 2)
  const zoom = clampGraphViewportZoom(Math.min(
    graphNodeLayoutBounds.width / width,
    graphNodeLayoutBounds.height / height,
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

export function resetGraphViewport(): GraphViewport {
  return defaultGraphViewport
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

function roundViewportNumber(value: number): number {
  return Math.round(value * 1000) / 1000
}
