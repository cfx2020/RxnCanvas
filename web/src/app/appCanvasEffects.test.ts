import { describe, expect, it, vi } from "vitest"
import type { FlowNode } from "../domain/projectPackages"
import { subscribeCanvasWheel, subscribeConnectionDraftPointer } from "./appCanvasEffects"

function flowNode(id: string, position: { x: number; y: number }): FlowNode {
  return {
    id,
    label: id,
    formula: "H2",
    kind: "reactant",
    method: "wB97X-D",
    solvent: "SMD",
    energyGas: 0,
    energySolution: 0,
    energyUnit: "kcal/mol",
    sourceStatus: "parsed",
    position,
  }
}

describe("appCanvasEffects", () => {
  it("updates viewport from wheel events and disposes listener", async () => {
    const canvas = document.createElement("div")
    canvas.getBoundingClientRect = vi.fn(() => ({ left: 10, top: 20, width: 100, height: 100, right: 110, bottom: 120, x: 10, y: 20, toJSON: () => ({}) }))
    let viewport = { x: 0, y: 0, zoom: 1 }
    const setViewport = vi.fn((updater) => {
      viewport = updater(viewport)
    })
    const dispose = subscribeCanvasWheel({ canvas, setViewport })
    canvas.dispatchEvent(new WheelEvent("wheel", { clientX: 50, clientY: 60, deltaX: 5, deltaY: 10, ctrlKey: true, cancelable: true }))
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    expect(setViewport).toHaveBeenCalledTimes(1)
    expect(viewport.zoom).not.toBe(1)
    dispose()
    canvas.dispatchEvent(new WheelEvent("wheel", { clientX: 50, clientY: 60, deltaY: 10, cancelable: true }))
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    expect(setViewport).toHaveBeenCalledTimes(1)
  })

  it("previews wheel movement immediately and commits once after the wheel burst", async () => {
    const canvas = document.createElement("div")
    canvas.getBoundingClientRect = vi.fn(() => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }))
    let viewport = { x: 0, y: 0, zoom: 1 }
    let preview = viewport
    const finishPreview = vi.fn()
    const setViewport = vi.fn((updater) => {
      viewport = updater(viewport)
    })
    const dispose = subscribeCanvasWheel({
      canvas,
      setViewport,
      getViewport: () => preview,
      previewViewport: (next) => {
        preview = next
      },
      finishPreview,
    })

    canvas.dispatchEvent(new WheelEvent("wheel", { clientX: 50, clientY: 60, deltaX: 5, deltaY: 10, cancelable: true }))
    canvas.dispatchEvent(new WheelEvent("wheel", { clientX: 50, clientY: 60, deltaX: 7, deltaY: 11, cancelable: true }))

    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    expect(preview).toEqual({ x: -12, y: -21, zoom: 1 })
    expect(setViewport).not.toHaveBeenCalled()

    await new Promise((resolve) => window.setTimeout(resolve, 80))
    expect(setViewport).toHaveBeenCalledTimes(1)
    expect(viewport).toEqual(preview)
    expect(finishPreview).toHaveBeenCalledTimes(1)
    dispose()
  })

  it("tracks connection draft pointer movement and completion", async () => {
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
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    expect(setConnectionDraft).toHaveBeenCalledTimes(1)
    expect(draft.current).toEqual({ x: 11, y: 22 })
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7, clientX: 30, clientY: 40 }))
    expect(finishConnectionDraftAtClientPoint).toHaveBeenCalledWith(7, 30, 40)
    dispose()
  })

  it("snaps connection draft movement to nearby input ports", async () => {
    let draft = { pointerId: 7, sourceId: "source", current: { x: 0, y: 0 } }
    const setConnectionDraft = vi.fn((updater) => {
      draft = updater(draft)
    })
    const dispose = subscribeConnectionDraftPointer({
      draft,
      nodes: [
        flowNode("source", { x: 0, y: 0 }),
        flowNode("target", { x: 320, y: 80 }),
      ],
      snapRadiusWorld: 36,
      screenToWorld: (point) => point,
      setConnectionDraft,
      finishConnectionDraftAtClientPoint: vi.fn(() => true),
    })

    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 7, clientX: 330, clientY: 190 }))
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

    expect(draft).toEqual({
      pointerId: 7,
      sourceId: "source",
      current: { x: 320, y: 187 },
      snapTargetId: "target",
    })

    dispose()
  })
})
