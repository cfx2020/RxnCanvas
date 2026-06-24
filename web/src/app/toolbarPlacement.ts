export type ToolbarPlacement =
  | { mode: "floating"; x: number; y: number }
  | { mode: "left" | "right"; y: number }

export type ToolbarMetrics = {
  stageWidth: number
  stageHeight: number
  toolbarWidth: number
  toolbarHeight: number
}

export const toolbarEdgeGap = 10
export const toolbarSnapThreshold = 72

export function toolbarLayoutMode(placement: ToolbarPlacement): "horizontal" | "vertical" {
  return placement.mode === "floating" ? "horizontal" : "vertical"
}

export function defaultFloatingToolbarPlacement(metrics: ToolbarMetrics): ToolbarPlacement {
  return {
    mode: "floating",
    x: clampFloatingToolbarX((metrics.stageWidth - metrics.toolbarWidth) / 2, metrics),
    y: clampFloatingToolbarY(toolbarEdgeGap, metrics),
  }
}

export function clampToolbarPlacement(placement: ToolbarPlacement, metrics: ToolbarMetrics): ToolbarPlacement {
  if (placement.mode === "floating") {
    return {
      mode: "floating",
      x: clampFloatingToolbarX(placement.x, metrics),
      y: clampFloatingToolbarY(placement.y, metrics),
    }
  }
  return {
    mode: placement.mode,
    y: clampDockedToolbarY(placement.y, metrics),
  }
}

export function resolveToolbarDropPlacement(
  candidate: { x: number; y: number },
  metrics: ToolbarMetrics,
): ToolbarPlacement {
  const floatingX = clampFloatingToolbarX(candidate.x, metrics)
  const floatingY = clampFloatingToolbarY(candidate.y, metrics)
  const snapThreshold = effectiveToolbarSnapThreshold(metrics)
  const distanceToLeftEdge = floatingX
  const distanceToRightEdge = Math.max(0, metrics.stageWidth - (floatingX + metrics.toolbarWidth))

  if (distanceToRightEdge <= snapThreshold) {
    return {
      mode: "right",
      y: clampDockedToolbarY(floatingY, metrics),
    }
  }

  if (distanceToLeftEdge <= snapThreshold) {
    return {
      mode: "left",
      y: clampDockedToolbarY(floatingY, metrics),
    }
  }

  return {
    mode: "floating",
    x: floatingX,
    y: floatingY,
  }
}

export function clampFloatingToolbarX(x: number, metrics: ToolbarMetrics): number {
  return clampWithinToolbarBounds(x, metrics.stageWidth, metrics.toolbarWidth)
}

export function clampFloatingToolbarY(y: number, metrics: ToolbarMetrics): number {
  return clampWithinToolbarBounds(y, metrics.stageHeight, metrics.toolbarHeight)
}

export function clampDockedToolbarY(y: number, metrics: ToolbarMetrics): number {
  return clampWithinToolbarBounds(y, metrics.stageHeight, metrics.toolbarHeight)
}

function clampWithinToolbarBounds(value: number, container: number, item: number): number {
  const min = toolbarEdgeGap
  const max = Math.max(min, container - item - toolbarEdgeGap)
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

function effectiveToolbarSnapThreshold(metrics: ToolbarMetrics): number {
  const movableX = Math.max(0, metrics.stageWidth - metrics.toolbarWidth)
  return Math.min(toolbarSnapThreshold, Math.max(16, movableX / 4))
}
