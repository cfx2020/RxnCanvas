import { describe, expect, it, vi } from "vitest"
import { subscribeCanvasWheel, subscribeConnectionDraftPointer } from "./appCanvasEffects"

describe("appCanvasEffects", () => {
  it("updates viewport from wheel events and disposes listener", () => {
    const canvas = document.createElement("div")
    canvas.getBoundingClientRect = vi.fn(() => ({ left: 10, top: 20, width: 100, height: 100, right: 110, bottom: 120, x: 10, y: 20, toJSON: () => ({}) }))
    let viewport = { x: 0, y: 0, zoom: 1 }
    const setViewport = vi.fn((updater) => {
      viewport = updater(viewport)
    })
    const dispose = subscribeCanvasWheel({ canvas, setViewport })
    canvas.dispatchEvent(new WheelEvent("wheel", { clientX: 50, clientY: 60, deltaX: 5, deltaY: 10, ctrlKey: true, cancelable: true }))
    expect(setViewport).toHaveBeenCalledTimes(1)
    expect(viewport.zoom).not.toBe(1)
    dispose()
    canvas.dispatchEvent(new WheelEvent("wheel", { clientX: 50, clientY: 60, deltaY: 10, cancelable: true }))
    expect(setViewport).toHaveBeenCalledTimes(1)
  })

  it("tracks connection draft pointer movement and completion", () => {
    let draft = { pointerId: 7, sourceId: "source", current: { x: 0, y: 0 } }
    const setConnectionDraft = vi.fn((updater) => {
      draft = updater(draft)
    })
    const finishConnectionDraftAtClientPoint = vi.fn(() => true)
    const dispose = subscribeConnectionDraftPointer({
      draft,
      screenToWorld: (point) => ({ x: point.x + 1, y: point.y + 2 }),
      setConnectionDraft,
      finishConnectionDraftAtClientPoint,
    })
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 7, clientX: 10, clientY: 20 }))
    expect(setConnectionDraft).toHaveBeenCalledTimes(1)
    expect(draft.current).toEqual({ x: 11, y: 22 })
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7, clientX: 30, clientY: 40 }))
    expect(finishConnectionDraftAtClientPoint).toHaveBeenCalledWith(7, 30, 40)
    dispose()
  })
})
