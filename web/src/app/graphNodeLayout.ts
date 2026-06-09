import type { GraphNodeSummary } from "./workbenchState"

export type GraphNodeLayoutPosition = {
  x: number
  y: number
}

export type GraphNodeLayoutBounds = {
  width: number
  height: number
  grid: number
}

export const graphNodeLayoutBounds: GraphNodeLayoutBounds = {
  width: 600,
  height: 360,
  grid: 20,
}

export function graphNodePosition(node: GraphNodeSummary): GraphNodeLayoutPosition {
  if (Array.isArray(node.position) && node.position.length === 2) {
    const x = Number(node.position[0])
    const y = Number(node.position[1])
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y }
  }
  const match = node.id.match(/(\d+)$/)
  const index = match ? Number(match[1]) : 1
  return clampGraphNodeLayoutPosition({
    x: 120 + index * 100,
    y: 180,
  })
}

export function graphNodeCssPosition(
  position: GraphNodeLayoutPosition,
): { left: string; top: string } {
  return {
    left: `${(finiteOrZero(position.x) / graphNodeLayoutBounds.width) * 100}%`,
    top: `${(finiteOrZero(position.y) / graphNodeLayoutBounds.height) * 100}%`,
  }
}

export function canvasPointToGraphNodePosition(point: GraphNodeLayoutPosition): GraphNodeLayoutPosition {
  return snapGraphNodeLayoutPosition(point)
}

export function moveGraphNodePosition(
  origin: GraphNodeLayoutPosition,
  delta: GraphNodeLayoutPosition,
): GraphNodeLayoutPosition {
  return canvasPointToGraphNodePosition({
    x: origin.x + delta.x,
    y: origin.y + delta.y,
  })
}

export function snapGraphNodeLayoutPosition(
  position: GraphNodeLayoutPosition,
): GraphNodeLayoutPosition {
  const grid = graphNodeLayoutBounds.grid
  return {
    x: Math.round(finiteOrZero(position.x) / grid) * grid,
    y: Math.round(finiteOrZero(position.y) / grid) * grid,
  }
}

export function clampGraphNodeLayoutPosition(
  position: GraphNodeLayoutPosition,
): GraphNodeLayoutPosition {
  return {
    x: clampFinite(position.x, 0, graphNodeLayoutBounds.width),
    y: clampFinite(position.y, 0, graphNodeLayoutBounds.height),
  }
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}
