import { describe, expect, it } from "vitest"
import {
  createGraphMinimapGeometry,
  defaultGraphViewport,
  fitGraphViewportToNodes,
  graphPointFromMinimapPoint,
  graphPointToScreenPoint,
  graphViewportFromMinimapCenter,
  graphViewportFromMinimapPoint,
  graphViewportCssTransform,
  graphViewportZoomBounds,
  normalizeGraphViewport,
  panGraphViewport,
  resetGraphViewport,
  screenPointToGraphPoint,
  zoomGraphViewport,
  zoomGraphViewportAtScreenPoint,
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

    expect(graphPoint).toEqual({ x: 460, y: 280 })
    expect(graphPointToScreenPoint(graphPoint, surfaceSize, viewport)).toEqual({ x: 600, y: 360 })
  })

  it("zooms around the current viewport center and clamps at both bounds", () => {
    expect(zoomGraphViewport({ x: 0, y: 0, zoom: 2.4 }, "in").zoom).toBe(graphViewportZoomBounds.max)
    expect(zoomGraphViewport({ x: 0, y: 0, zoom: 0.4 }, "out").zoom).toBe(graphViewportZoomBounds.min)

    const centered = zoomGraphViewport({ x: 0, y: 0, zoom: 1 }, "in")
    expect(centered.zoom).toBeCloseTo(1.2)
    expect(centered.x).toBeCloseTo(133.333)
    expect(centered.y).toBeCloseTo(83.333)
  })

  it("zooms wheel input around a screen anchor while preserving the graph point", () => {
    const viewport = { x: 60, y: 30, zoom: 1 }
    const surfaceSize = { width: 1200, height: 720 }
    const anchor = { x: 300, y: 180 }
    const graphAnchorBefore = screenPointToGraphPoint(anchor, surfaceSize, viewport)
    const next = zoomGraphViewportAtScreenPoint(viewport, surfaceSize, anchor, -120)
    const screenAnchorAfter = graphPointToScreenPoint(graphAnchorBefore, surfaceSize, next)

    expect(next.zoom).toBeCloseTo(1.1)
    expect(screenAnchorAfter.x).toBeCloseTo(anchor.x)
    expect(screenAnchorAfter.y).toBeCloseTo(anchor.y)
  })

  it("clamps wheel zoom and uses a stronger pinch-like factor for ctrl/meta input", () => {
    expect(zoomGraphViewportAtScreenPoint(
      { x: 0, y: 0, zoom: 2.5 },
      { width: 600, height: 360 },
      { x: 300, y: 180 },
      -100,
    ).zoom).toBe(graphViewportZoomBounds.max)
    expect(zoomGraphViewportAtScreenPoint(
      { x: 0, y: 0, zoom: 0.35 },
      { width: 600, height: 360 },
      { x: 300, y: 180 },
      100,
    ).zoom).toBe(graphViewportZoomBounds.min)

    const wheel = zoomGraphViewportAtScreenPoint(
      { x: 0, y: 0, zoom: 1 },
      { width: 600, height: 360 },
      { x: 300, y: 180 },
      -100,
    )
    const pinchLike = zoomGraphViewportAtScreenPoint(
      { x: 0, y: 0, zoom: 1 },
      { width: 600, height: 360 },
      { x: 300, y: 180 },
      -100,
      { ctrlOrMeta: true },
    )

    expect(wheel.zoom).toBeCloseTo(1.1)
    expect(pinchLike.zoom).toBeCloseTo(1.2)
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
    expect(viewport.zoom).toBeGreaterThanOrEqual(0.35)
    expect(viewport.zoom).toBeLessThanOrEqual(1)
    expect(a.x).toBeGreaterThan(0)
    expect(a.y).toBeGreaterThan(0)
    expect(b.x).toBeLessThan(900)
    expect(b.y).toBeLessThan(420)
  })

  it("derives minimap node dots and viewport window from graph nodes and viewport", () => {
    const geometry = createGraphMinimapGeometry(
      [
        node({ id: "node-a", position: [120, 160] }),
        node({ id: "node-b", position: [360, 220] }),
      ],
      { x: 60, y: 30, zoom: 1.2 },
      { width: 180, height: 108 },
    )

    expect(geometry).not.toBeNull()
    expect(geometry?.scale).toBeGreaterThan(0)
    expect(geometry?.nodes.map((entry) => entry.id)).toEqual(["node-a", "node-b"])
    expect(geometry?.viewportWindow.width).toBeGreaterThan(0)
    expect(geometry?.viewportWindow.height).toBeGreaterThan(0)
    expect(geometry?.viewportWindow.left).toBeCloseTo(60 * geometry!.scale + geometry!.offset.x)
    expect(geometry?.viewportWindow.top).toBeCloseTo(30 * geometry!.scale + geometry!.offset.y)
  })

  it("keeps minimap content geometry stable while the viewport pans", () => {
    const nodes = [
      node({ id: "node-a", position: [120, 160] }),
      node({ id: "node-b", position: [360, 220] }),
    ]
    const first = createGraphMinimapGeometry(nodes, { x: 0, y: 0, zoom: 1 }, { width: 180, height: 108 })
    const panned = createGraphMinimapGeometry(nodes, { x: -180, y: 80, zoom: 1 }, { width: 180, height: 108 })

    expect(first).not.toBeNull()
    expect(panned).not.toBeNull()
    expect(panned?.scale).toBeCloseTo(first!.scale)
    expect(panned?.offset.x).toBeCloseTo(first!.offset.x)
    expect(panned?.offset.y).toBeCloseTo(first!.offset.y)
    expect(panned?.nodes).toEqual(first!.nodes)
    expect(panned?.viewportWindow.left).toBeCloseTo(-180 * first!.scale + first!.offset.x)
    expect(panned?.viewportWindow.top).toBeCloseTo(80 * first!.scale + first!.offset.y)
  })

  it("maps minimap points back to graph points and viewport centers", () => {
    const geometry = createGraphMinimapGeometry(
      [
        node({ id: "node-a", position: [120, 160] }),
        node({ id: "node-b", position: [360, 220] }),
      ],
      { x: 0, y: 0, zoom: 1 },
      { width: 180, height: 108 },
    )
    expect(geometry).not.toBeNull()

    const graphPoint = { x: 300, y: 200 }
    const minimapPoint = {
      x: graphPoint.x * geometry!.scale + geometry!.offset.x,
      y: graphPoint.y * geometry!.scale + geometry!.offset.y,
    }

    const mappedGraphPoint = graphPointFromMinimapPoint(minimapPoint, geometry!)
    expect(mappedGraphPoint.x).toBeCloseTo(graphPoint.x)
    expect(mappedGraphPoint.y).toBeCloseTo(graphPoint.y)
    expect(graphViewportFromMinimapCenter({ x: 0, y: 0, zoom: 2 }, graphPoint)).toEqual({
      x: -100,
      y: -50,
      zoom: 2,
    })
    const viewportFromPoint = graphViewportFromMinimapPoint({ x: 0, y: 0, zoom: 2 }, minimapPoint, geometry!)
    expect(viewportFromPoint.x).toBeCloseTo(-100)
    expect(viewportFromPoint.y).toBeCloseTo(-50)
    expect(viewportFromPoint.zoom).toBe(2)
  })

  it("does not create minimap geometry for empty graphs", () => {
    expect(createGraphMinimapGeometry([], { x: 0, y: 0, zoom: 1 }, { width: 180, height: 108 })).toBeNull()
  })

  it("resets and serializes a CSS transform for the normalized viewport", () => {
    expect(resetGraphViewport()).toEqual(defaultGraphViewport)
    expect(graphViewportCssTransform({ x: 120, y: 36, zoom: 2 })).toBe("translate(-15%, -7.2%) scale(2)")
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
