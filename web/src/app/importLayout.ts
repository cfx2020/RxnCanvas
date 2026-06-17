import type { CanvasViewport, Point } from "../domain/projectPackages"
import type { ImportNodeLayout } from "./importRegistrationTypes"

export function importLayoutFromCanvas(canvas: HTMLDivElement | null, viewport: CanvasViewport): ImportNodeLayout {
  const rect = canvas?.getBoundingClientRect()
  const narrow = (rect?.width ?? 900) < 640
  const localX = narrow ? 8 : 28
  const localY = narrow ? 84 : 116
  return {
    origin: {
      x: (localX - viewport.x) / viewport.zoom,
      y: (localY - viewport.y) / viewport.zoom,
    },
    columns: narrow ? 1 : 2,
  }
}

export function importLayoutFromPoint(point: Point): ImportNodeLayout {
  return {
    origin: {
      x: Math.round(point.x),
      y: Math.round(point.y),
    },
    columns: 1,
    idSuffix: `drop-${Math.round(point.x)}-${Math.round(point.y)}-${Date.now()}`,
  }
}

export function importNodeId(baseId: string, layout: ImportNodeLayout): string {
  return layout.idSuffix ? `${baseId}-${layout.idSuffix}` : baseId
}

export function importNodePosition(index: number, layout: ImportNodeLayout): Point {
  const column = index % layout.columns
  const row = Math.floor(index / layout.columns)
  return {
    x: layout.origin.x + column * 250,
    y: layout.origin.y + row * 260,
  }
}
