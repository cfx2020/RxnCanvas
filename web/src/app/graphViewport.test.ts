import { describe, expect, it } from "vitest"
import {
  defaultGraphViewport,
  fitGraphViewportToNodes,
  graphPointToScreenPoint,
  graphViewportCssTransform,
  graphViewportZoomBounds,
  normalizeGraphViewport,
  panGraphViewport,
  resetGraphViewport,
  screenPointToGraphPoint,
  zoomGraphViewport,
} from "./graphViewport"
import type { GraphNodeSummary } from "./workbenchState"

describe("graphViewport", () => {
  it("falls back to the default viewport for missing or invalid summaries", () => {
    expect(normalizeGraphViewport(null)).toEqual(defaultGraphViewport)
    expect(normalizeGraphViewport({ x: Number.NaN, y: 0, zoom: 1 })).toEqual(defaultGraphViewport)
    expect(normalizeGraphViewport({ x: 0, y: 0, zoom: 0 })).toEqual(defaultGraphViewport)
  })

  it("clamps zoom while preserving finite viewport offsets", () => {
    expect(normalizeGraphViewport({ x: 12, y: -8, zoom: 99 })).toEqual({
      x: 12,
      y: -8,
      zoom: graphViewportZoomBounds.max,
    })
    expect(normalizeGraphViewport({ x: 12, y: -8, zoom: 0.1 })).toEqual({
      x: 12,
      y: -8,
      zoom: graphViewportZoomBounds.min,
    })
  })

  it("converts between screen and graph coordinates through the viewport", () => {
    const viewport = { x: 60, y: 30, zoom: 2 }
    const surfaceSize = { width: 1200, height: 720 }
    const graphPoint = screenPointToGraphPoint({ x: 600, y: 360 }, surfaceSize, viewport)

    expect(graphPoint).toEqual({ x: 210, y: 120 })
    expect(graphPointToScreenPoint(graphPoint, surfaceSize, viewport)).toEqual({ x: 600, y: 360 })
  })

  it("zooms around the current viewport center and clamps at both bounds", () => {
    expect(zoomGraphViewport({ x: 0, y: 0, zoom: 2.4 }, "in").zoom).toBe(graphViewportZoomBounds.max)
    expect(zoomGraphViewport({ x: 0, y: 0, zoom: 0.4 }, "out").zoom).toBe(graphViewportZoomBounds.min)

    const centered = zoomGraphViewport({ x: 0, y: 0, zoom: 1 }, "in")
    expect(centered.zoom).toBeCloseTo(1.2)
    expect(centered.x).toBeCloseTo(50)
    expect(centered.y).toBeCloseTo(30)
  })

  it("pans by graph-space deltas without changing zoom", () => {
    expect(panGraphViewport({ x: 10, y: 20, zoom: 1.5 }, { x: 30, y: -10 })).toEqual({
      x: -20,
      y: 30,
      zoom: 1.5,
    })
  })

  it("fits graph nodes into the virtual canvas and keeps resulting screen points visible", () => {
    const nodes = [
      node({ id: "node-a", position: [120, 160] }),
      node({ id: "node-b", position: [360, 160] }),
    ]
    const viewport = fitGraphViewportToNodes(nodes, { width: 900, height: 420 })
    const a = graphPointToScreenPoint({ x: 120, y: 160 }, { width: 900, height: 420 }, viewport)
    const b = graphPointToScreenPoint({ x: 360, y: 160 }, { width: 900, height: 420 }, viewport)

    expect(Number.isFinite(viewport.x)).toBe(true)
    expect(Number.isFinite(viewport.y)).toBe(true)
    expect(viewport.zoom).toBeGreaterThan(1)
    expect(a.x).toBeGreaterThan(0)
    expect(a.y).toBeGreaterThan(0)
    expect(b.x).toBeLessThan(900)
    expect(b.y).toBeLessThan(420)
  })

  it("resets and serializes a CSS transform for the normalized viewport", () => {
    expect(resetGraphViewport()).toEqual(defaultGraphViewport)
    expect(graphViewportCssTransform({ x: 120, y: 36, zoom: 2 })).toBe("translate(-40%, -20%) scale(2)")
  })
})

function node(overrides: Partial<GraphNodeSummary>): GraphNodeSummary {
  return {
    id: "node-a",
    kind: "species",
    label: "Node A",
    chemical_object_ids: ["object-a"],
    metadata: {},
    ...overrides,
  }
}
