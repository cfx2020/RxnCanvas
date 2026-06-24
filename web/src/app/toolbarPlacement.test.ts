import { describe, expect, it } from "vitest"
import {
  clampToolbarPlacement,
  defaultFloatingToolbarPlacement,
  toolbarEdgeGap,
  resolveToolbarDropPlacement,
  toolbarLayoutMode,
  type ToolbarMetrics,
  type ToolbarPlacement,
} from "./toolbarPlacement"

const metrics: ToolbarMetrics = {
  stageWidth: 1200,
  stageHeight: 720,
  toolbarWidth: 620,
  toolbarHeight: 50,
}

describe("toolbarPlacement", () => {
  it("defaults to a centered floating toolbar near the top edge", () => {
    expect(defaultFloatingToolbarPlacement(metrics)).toEqual({
      mode: "floating",
      x: 290,
      y: 10,
    })
  })

  it("keeps floating placement inside the canvas bounds", () => {
    const placement: ToolbarPlacement = { mode: "floating", x: -80, y: 999 }
    expect(clampToolbarPlacement(placement, metrics)).toEqual({
      mode: "floating",
      x: 10,
      y: 660,
    })
  })

  it("snaps near the right edge into right-docked mode", () => {
    expect(resolveToolbarDropPlacement({ x: 560, y: 180 }, metrics)).toEqual({
      mode: "right",
      y: 180,
    })
  })

  it("snaps near the left edge into left-docked mode", () => {
    expect(resolveToolbarDropPlacement({ x: 20, y: 220 }, metrics)).toEqual({
      mode: "left",
      y: 220,
    })
  })

  it("stays floating when released away from side edges", () => {
    expect(resolveToolbarDropPlacement({ x: 260, y: 200 }, metrics)).toEqual({
      mode: "floating",
      x: 260,
      y: 200,
    })
  })

  it("switches to vertical layout only for docked states", () => {
    expect(toolbarLayoutMode({ mode: "floating", x: 120, y: 48 })).toBe("horizontal")
    expect(toolbarLayoutMode({ mode: "left", y: 48 })).toBe("vertical")
    expect(toolbarLayoutMode({ mode: "right", y: 48 })).toBe("vertical")
  })

  it("returns to floating when a docked toolbar is dragged back toward center", () => {
    const constrainedMetrics: ToolbarMetrics = {
      stageWidth: 872,
      stageHeight: 914,
      toolbarWidth: 723.0625,
      toolbarHeight: 50,
    }
    const stageLeft = 248
    const releaseClientX = 700
    const dockedHandleRelease = {
      x: releaseClientX - stageLeft - constrainedMetrics.toolbarWidth / 2,
      y: 220,
    }
    expect(resolveToolbarDropPlacement(dockedHandleRelease, constrainedMetrics)).toEqual({
      mode: "floating",
      x: 90.46875,
      y: 220,
    })
    expect(dockedHandleRelease.x).toBeGreaterThan(toolbarEdgeGap)
  })

  it("does not let a wide toolbar consume the whole floating zone with snap gutters", () => {
    const constrainedMetrics: ToolbarMetrics = {
      stageWidth: 872,
      stageHeight: 914,
      toolbarWidth: 723.0625,
      toolbarHeight: 50,
    }
    expect(resolveToolbarDropPlacement({ x: 74.46875, y: 10 }, constrainedMetrics)).toEqual({
      mode: "floating",
      x: 74.46875,
      y: 10,
    })
  })
})
