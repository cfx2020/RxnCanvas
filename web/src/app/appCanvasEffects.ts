import type { CanvasViewport, FlowNode, Point } from "../domain/projectPackages"
import {
  connectionSnapRadiusPx,
  updateConnectionDraftWithMagnetTarget,
} from "./canvasConnectionMagnetism"
import { viewportFromCanvasWheel } from "./canvasGeometry"
import { updateDraftCurrentForPointer, type CanvasPointerDraft } from "./canvasEditState"
import type { Setter } from "./appStateAppliers"

export type ScreenToWorld = (point: Point) => Point

export function subscribeCanvasWheel({
  canvas,
  setViewport,
  getViewport,
  previewViewport,
}: {
  canvas: HTMLDivElement | null
  setViewport: Setter<CanvasViewport>
  getViewport?: () => CanvasViewport
  previewViewport?: (viewport: CanvasViewport) => void
}): () => void {
  if (!canvas) return () => undefined

  let pendingWheel: {
    delta: Point
    clientPoint: Point
    canvasOffset: Point
    zoomGesture: boolean
  } | null = null
  let wheelFrame: number | null = null
  let commitTimer: number | null = null
  let liveViewport: CanvasViewport | null = null

  const clearCommitTimer = () => {
    if (commitTimer === null) return
    window.clearTimeout(commitTimer)
    commitTimer = null
  }

  const commitLiveViewport = () => {
    clearCommitTimer()
    const committedViewport = liveViewport
    if (!committedViewport) return
    liveViewport = null
    setViewport(() => committedViewport)
  }

  const scheduleCommit = () => {
    clearCommitTimer()
    commitTimer = window.setTimeout(commitLiveViewport, 70)
  }

  const applyPendingWheel = () => {
    wheelFrame = null
    const wheel = pendingWheel
    pendingWheel = null
    if (!wheel) return

    if (previewViewport && getViewport) {
      const nextViewport = viewportFromCanvasWheel(
        liveViewport ?? getViewport(),
        wheel.canvasOffset,
        wheel.clientPoint,
        wheel.delta,
        wheel.zoomGesture,
      )
      liveViewport = nextViewport
      previewViewport(nextViewport)
      scheduleCommit()
      return
    }

    setViewport((current) => viewportFromCanvasWheel(
      current,
      wheel.canvasOffset,
      wheel.clientPoint,
      wheel.delta,
      wheel.zoomGesture,
    ))
  }

  const queueWheel = (wheel: NonNullable<typeof pendingWheel>) => {
    if (pendingWheel && pendingWheel.zoomGesture === wheel.zoomGesture) {
      pendingWheel = {
        ...wheel,
        delta: {
          x: pendingWheel.delta.x + wheel.delta.x,
          y: pendingWheel.delta.y + wheel.delta.y,
        },
      }
    } else {
      if (pendingWheel) applyPendingWheel()
      pendingWheel = wheel
    }
    if (wheelFrame !== null) return
    wheelFrame = window.requestAnimationFrame(applyPendingWheel)
  }

  const handleCanvasWheel = (event: WheelEvent) => {
    event.preventDefault()
    const rect = canvas.getBoundingClientRect()
    queueWheel({
      canvasOffset: { x: rect.left, y: rect.top },
      clientPoint: { x: event.clientX, y: event.clientY },
      delta: { x: event.deltaX, y: event.deltaY },
      zoomGesture: event.ctrlKey || event.metaKey,
    })
  }

  const dispose = () => {
    canvas.removeEventListener("wheel", handleCanvasWheel)
    if (wheelFrame !== null) window.cancelAnimationFrame(wheelFrame)
    wheelFrame = null
    if (pendingWheel) {
      const wheel = pendingWheel
      pendingWheel = null
      if (previewViewport && getViewport) {
        liveViewport = viewportFromCanvasWheel(
          liveViewport ?? getViewport(),
          wheel.canvasOffset,
          wheel.clientPoint,
          wheel.delta,
          wheel.zoomGesture,
        )
      } else {
        setViewport((current) => viewportFromCanvasWheel(
          current,
          wheel.canvasOffset,
          wheel.clientPoint,
          wheel.delta,
          wheel.zoomGesture,
        ))
      }
    }
    commitLiveViewport()
  }

  canvas.addEventListener("wheel", handleCanvasWheel, { passive: false })
  return dispose
}

export function subscribeConnectionDraftPointer({
  draft,
  nodes = [],
  snapRadiusWorld = connectionSnapRadiusPx,
  screenToWorld,
  setConnectionDraft,
  finishConnectionDraftAtClientPoint,
}: {
  draft: CanvasPointerDraft | null
  nodes?: FlowNode[]
  snapRadiusWorld?: number
  screenToWorld: ScreenToWorld
  setConnectionDraft: Setter<CanvasPointerDraft | null>
  finishConnectionDraftAtClientPoint: (pointerId: number, clientX: number, clientY: number) => boolean
}): () => void {
  if (!draft) return () => undefined

  const handleWindowPointerMove = (event: globalThis.PointerEvent) => {
    if (event.pointerId !== draft.pointerId) return
    const current = screenToWorld({ x: event.clientX, y: event.clientY })
    setConnectionDraft((currentDraft) => (
      nodes.length > 0
        ? updateConnectionDraftWithMagnetTarget({
          draft: currentDraft,
          pointerId: event.pointerId,
          current,
          nodes,
          radius: snapRadiusWorld,
        })
        : updateDraftCurrentForPointer(currentDraft, event.pointerId, current)
    ))
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
