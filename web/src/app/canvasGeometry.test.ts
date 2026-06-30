import { describe, expect, it } from "vitest"
import type { FlowNode, NodeKind } from "../domain/projectPackages"
import { defaultEnergyDisplayOptions } from "./energyDisplay"
import {
  autoLayoutFlowNodes,
  canvasGridSize,
  createMinimapGeometry,
  defaultCanvasViewportForSize,
  fallbackCanvasSize,
  fitViewportToNodesForSize,
  maxCanvasZoom,
  minimapRectStyle,
  minimapSize,
  nodeContainedInSelectionRect,
  nodeDragPosition,
  pannedViewportFromDrag,
  snappedCanvasPoint,
  viewportFromCanvasWheel,
  viewportFromMinimapPoint,
  visibleWorldRect,
  worldPointFromClientPoint,
} from "./canvasGeometry"

function flowNode(
  id: string,
  energySolution: number | null,
  position = { x: 0, y: 0 },
  kind: NodeKind = "reactant",
): FlowNode {
  return {
    id,
    label: id,
    formula: "H2",
    kind,
    method: "wB97X-D",
    solvent: "SMD",
    energyGas: null,
    energySolution,
    energyUnit: "kcal/mol",
    sourceStatus: "parsed",
    position,
  }
}

describe("canvasGeometry", () => {
  it("snaps canvas points and node drags to the grid", () => {
    expect(snappedCanvasPoint({ x: 10, y: 13 })).toEqual({ x: 8, y: 16 })
    expect(snappedCanvasPoint({ x: -5, y: -13 })).toEqual({ x: -8, y: -16 })

    const drag = {
      start: { x: 10, y: 10 },
      origin: { x: 100, y: 40 },
    }

    expect(nodeDragPosition(drag, { x: 25, y: 5 })).toEqual({ x: 115, y: 35 })
    expect(nodeDragPosition(drag, { x: 25, y: 5 }, true)).toEqual({ x: 112, y: 32 })
  })

  it("derives stable default viewports for desktop and narrow screens", () => {
    const desktop = defaultCanvasViewportForSize(fallbackCanvasSize)
    expect(desktop.zoom).toBeCloseTo(0.687179487)
    expect(desktop.x).toBe(350)
    expect(desktop.y).toBe(198)

    expect(defaultCanvasViewportForSize({ width: 390, height: 900 })).toEqual({
      zoom: 0.62,
      x: 124,
      y: 221,
    })
  })

  it("converts client points and wheel gestures into viewport updates", () => {
    const viewport = { zoom: 0.5, x: 100, y: 50 }

    expect(worldPointFromClientPoint({ x: 500, y: 320 }, { x: 20, y: 40 }, viewport)).toEqual({
      x: 760,
      y: 460,
    })
    expect(pannedViewportFromDrag(viewport, { start: { x: 100, y: 100 }, origin: { x: 10, y: 20 } }, { x: 125, y: 85 })).toEqual({
      zoom: 0.5,
      x: 35,
      y: 5,
    })
    expect(viewportFromCanvasWheel(viewport, { x: 20, y: 40 }, { x: 500, y: 320 }, { x: 18, y: -24 }, false)).toEqual({
      zoom: 0.5,
      x: 118,
      y: 26,
    })
    const zoomed = viewportFromCanvasWheel(viewport, { x: 20, y: 40 }, { x: 500, y: 320 }, { x: 0, y: -120 }, true)
    expect(zoomed.zoom).toBeCloseTo(0.55)
    expect(zoomed.x).toBeCloseTo(62)
    expect(zoomed.y).toBeCloseTo(27)
  })

  it("fits populated and empty node sets inside the viewport", () => {
    expect(fitViewportToNodesForSize([], fallbackCanvasSize)).toEqual(defaultCanvasViewportForSize(fallbackCanvasSize))

    const viewport = fitViewportToNodesForSize([
      flowNode("a", 0, { x: 0, y: 0 }),
      flowNode("b", 5, { x: 520, y: 300 }),
    ], fallbackCanvasSize)

    expect(viewport).toEqual({ zoom: 0.95, x: 103, y: 76 })
  })

  it("auto-layout sorts finite relative energies and keeps positions snapped", () => {
    const laidOut = autoLayoutFlowNodes([
      flowNode("high", 10),
      flowNode("unknown", null),
      flowNode("low", 0),
    ], {
      ...defaultEnergyDisplayOptions,
      baselineNodeId: "low",
    })

    expect(laidOut.map((node) => node.id)).toEqual(["low", "high", "unknown"])
    expect(laidOut.map((node) => node.position)).toEqual([
      { x: -320, y: 184 },
      { x: -16, y: -32 },
      { x: 280, y: 264 },
    ])
    for (const node of laidOut) {
      expect(Math.abs(node.position.x % canvasGridSize)).toBe(0)
      expect(Math.abs(node.position.y % canvasGridSize)).toBe(0)
    }
  })

  it("auto-layout keeps off-path participants above the main reaction path without overlap", () => {
    const laidOut = autoLayoutFlowNodes([
      flowNode("reactant", 0),
      flowNode("ts", 12),
      flowNode("product", 3),
      { ...flowNode("added-1", null), pathRole: "participant" },
      { ...flowNode("added-2", null), pathRole: "participant" },
      { ...flowNode("released", null), pathRole: "participant" },
    ], {
      ...defaultEnergyDisplayOptions,
      baselineNodeId: "reactant",
    }, [
      { id: "e-reactant-ts", sourceId: "reactant", targetId: "ts", label: "" },
      { id: "e-ts-product", sourceId: "ts", targetId: "product", label: "" },
      { id: "e-added-1-ts", sourceId: "added-1", targetId: "ts", label: "", stepRole: "addition" },
      { id: "e-added-2-ts", sourceId: "added-2", targetId: "ts", label: "", stepRole: "addition" },
      { id: "e-product-released", sourceId: "product", targetId: "released", label: "", stepRole: "release" },
    ])

    const byId = new Map(laidOut.map((node) => [node.id, node]))
    expect(["reactant", "ts", "product"].map((id) => byId.get(id)?.position.x)).toEqual([-320, -16, 280])
    expect(byId.get("added-1")?.position.y).toBeLessThan(byId.get("ts")?.position.y ?? 0)
    expect(byId.get("added-2")?.position.y).toBeLessThan(byId.get("added-1")?.position.y ?? 0)
    expect(byId.get("released")?.position.y).toBe(byId.get("added-1")?.position.y)
    expect(byId.get("added-1")?.position).not.toEqual(byId.get("added-2")?.position)
    expect(byId.get("released")?.position.x).toBe(byId.get("product")?.position.x)
  })

  it("auto-layout aligns transition barriers to the same energy ruler scale", () => {
    const laidOut = autoLayoutFlowNodes([
      flowNode("reactant", 0),
      flowNode("ts", 12, { x: 0, y: 0 }, "transition"),
      flowNode("product", 3),
    ], {
      ...defaultEnergyDisplayOptions,
      baselineNodeId: "reactant",
    }, [
      { id: "e-reactant-ts", sourceId: "reactant", targetId: "ts", label: "" },
      { id: "e-ts-product", sourceId: "ts", targetId: "product", label: "" },
    ])

    const byId = new Map(laidOut.map((node) => [node.id, node]))
    expect(byId.get("reactant")?.position).toEqual({ x: -320, y: 184 })
    expect(byId.get("ts")?.position).toEqual({ x: -16, y: -168 })
    expect(byId.get("product")?.position).toEqual({ x: 280, y: 128 })
  })

  it("tests selection containment by node center", () => {
    const node = flowNode("selected", 0)

    expect(nodeContainedInSelectionRect(node, { x: 96, y: 96, width: 24, height: 24 })).toBe(true)
    expect(nodeContainedInSelectionRect(node, { x: 0, y: 0, width: 40, height: 40 })).toBe(false)
  })

  it("converts between viewport, world, and minimap geometry", () => {
    const viewport = { zoom: 1, x: 100, y: 80 }
    expect(visibleWorldRect(viewport, fallbackCanvasSize)).toEqual({
      left: -100,
      top: -80,
      right: 800,
      bottom: 560,
    })

    const geometry = createMinimapGeometry([
      flowNode("a", 0, { x: -120, y: 80 }),
      flowNode("b", 4, { x: 420, y: 320 }),
    ], viewport, fallbackCanvasSize, minimapSize)

    expect(geometry.scale).toBeGreaterThan(0)
    expect(geometry.nodes).toHaveLength(2)
    expect(geometry.viewportWindow.width).toBeGreaterThanOrEqual(16)
    expect(minimapRectStyle(geometry.viewportWindow).left).toMatch(/px$/)

    const nextViewport = viewportFromMinimapPoint(
      { x: minimapSize.width / 2, y: minimapSize.height / 2 },
      geometry,
      { ...viewport, zoom: 2 },
      fallbackCanvasSize,
    )
    expect(nextViewport.zoom).toBe(maxCanvasZoom)
    expect(Number.isFinite(nextViewport.x)).toBe(true)
    expect(Number.isFinite(nextViewport.y)).toBe(true)
  })
})
