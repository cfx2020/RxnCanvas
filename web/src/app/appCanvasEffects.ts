import type { CanvasViewport, Point } from "../domain/projectPackages"
import { viewportFromCanvasWheel } from "./canvasGeometry"
import { updateDraftCurrentForPointer, type CanvasPointerDraft } from "./canvasEditState"
import type { Setter } from "./appStateAppliers"

export type ScreenToWorld = (point: Point) => Point

export function subscribeCanvasWheel({
  canvas,
  setViewport,
}: {
  canvas: HTMLDivElement | null
  setViewport: Setter<CanvasViewport>
}): () => void {
  if (!canvas) return () => undefined

  const handleCanvasWheel = (event: WheelEvent) => {
    event.preventDefault()
    const rect = canvas.getBoundingClientRect()
    setViewport((current) => viewportFromCanvasWheel(
      current,
      { x: rect.left, y: rect.top },
      { x: event.clientX, y: event.clientY },
      { x: event.deltaX, y: event.deltaY },
      event.ctrlKey || event.metaKey,
    ))
  }

  canvas.addEventListener("wheel", handleCanvasWheel, { passive: false })
  return () => canvas.removeEventListener("wheel", handleCanvasWheel)
}

export function subscribeConnectionDraftPointer({
  draft,
  screenToWorld,
  setConnectionDraft,
  finishConnectionDraftAtClientPoint,
}: {
  draft: CanvasPointerDraft | null
  screenToWorld: ScreenToWorld
  setConnectionDraft: Setter<CanvasPointerDraft | null>
  finishConnectionDraftAtClientPoint: (pointerId: number, clientX: number, clientY: number) => boolean
}): () => void {
  if (!draft) return () => undefined

  const handleWindowPointerMove = (event: globalThis.PointerEvent) => {
    if (event.pointerId !== draft.pointerId) return
    const current = screenToWorld({ x: event.clientX, y: event.clientY })
    setConnectionDraft((currentDraft) => updateDraftCurrentForPointer(currentDraft, event.pointerId, current))
  }
  const handleWindowPointerEnd = (event: globalThis.PointerEvent) => {
    finishConnectionDraftAtClientPoint(event.pointerId, event.clientX, event.clientY)
  }

  window.addEventListener("pointermove", handleWindowPointerMove)
  window.addEventListener("pointerup", handleWindowPointerEnd)
  window.addEventListener("pointercancel", handleWindowPointerEnd)
  return () => {
    window.removeEventListener("pointermove", handleWindowPointerMove)
    window.removeEventListener("pointerup", handleWindowPointerEnd)
    window.removeEventListener("pointercancel", handleWindowPointerEnd)
  }
}
