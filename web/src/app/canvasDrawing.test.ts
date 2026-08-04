import { describe, expect, it } from "vitest"
import type { FlowBarrier, FlowNode } from "../domain/projectPackages"
import { defaultEnergyDisplayOptions } from "./energyDisplay"
import {
  createBarrierDraftPreviewPath,
  createBarrierSegment,
  createConnectionPreviewPath,
  createEdgeSegment,
  defaultBarrierLabel,
  energyDeltaKcal,
  roundPathCoordinate,
} from "./canvasDrawing"

function flowNode(
  id: string,
  position: { x: number; y: number },
  energyGas = 0,
  energySolution = 0,
  kind: FlowNode["kind"] = "reactant",
): FlowNode {
  return {
    id,
    label: id,
    formula: "H2",
    kind,
    method: "wB97X-D",
    solvent: "SMD",
    energyGas,
    energySolution,
    energyUnit: "kcal/mol",
    sourceStatus: "parsed",
    position,
  }
}

describe("canvasDrawing", () => {
  it("creates stable reaction edge paths and label positions", () => {
    const segment = createEdgeSegment(
      flowNode("source", { x: 0, y: 0 }),
      flowNode("target", { x: 320, y: 80 }),
    )

    expect(segment.path).toBe("M 210 107 C 247.4 107, 282.6 187, 320 187")
    expect(segment.labelPoint).toEqual({ x: 265, y: 147 })
  })

  it("anchors side-species edges to the visible step connector dots", () => {
    const source = flowNode("source", { x: 0, y: 0 })
    const target = flowNode("target", { x: 320, y: 80 })

    expect(createEdgeSegment(source, target, "addition").path)
      .toBe("M 210 69 C 247.4 69, 282.6 187, 320 187")
    expect(createEdgeSegment(source, target, "release").path)
      .toBe("M 210 107 C 247.4 107, 282.6 149, 320 149")
  })

  it("creates connection and barrier draft preview paths", () => {
    const source = flowNode("source", { x: 0, y: 0 })

    expect(createConnectionPreviewPath(source, { x: 500, y: 180 }))
      .toBe("M 210 107 C 331.8 107, 378.2 180, 500 180")
    expect(createConnectionPreviewPath(source, { x: 500, y: 180 }, "addition"))
      .toBe("M 210 69 C 331.8 69, 378.2 180, 500 180")
    expect(createConnectionPreviewPath(source, { x: 500, y: 180 }, "release"))
      .toBe("M 210 107 C 331.8 107, 378.2 180, 500 180")
    expect(createBarrierDraftPreviewPath(source, { x: 250, y: 422 }))
      .toBe("M 105 222 C 105 294, 250 350, 250 422")
  })

  it("creates an energy-ruler barrier annotation geometry", () => {
    const source = flowNode("source", { x: 0, y: 320 }, 0, 0)
    const target = flowNode("target", { x: 320, y: 40 }, 5, 7)
    const nodeMap = new Map([source, target].map((node) => [node.id, node]))
    const barrier: FlowBarrier = { id: "barrier-a", sourceId: source.id, targetId: target.id }

    expect(createBarrierSegment(barrier, nodeMap, defaultEnergyDisplayOptions)).toEqual({
      id: "barrier-a",
      arrowPath: "M 425 282 L 425 427",
      guidePath: "M 210 427 L 425 427",
      label: "ΔG‡ 7.00",
      defaultLabel: "ΔG‡ 7.00",
      labelPoint: { x: 425, y: 354.5 },
      sourceLabel: "source",
      targetLabel: "target",
    })

    const compactTarget = flowNode("compact", { x: 320, y: 80 }, 2, 4)
    const compactMap = new Map([source, compactTarget].map((node) => [node.id, node]))

    expect(createBarrierSegment(
      { id: "barrier-b", sourceId: source.id, targetId: compactTarget.id, label: " custom " },
      compactMap,
      defaultEnergyDisplayOptions,
    )).toMatchObject({
      arrowPath: "M 425 322 L 425 427",
      guidePath: "M 210 427 L 425 427",
      label: "custom",
      defaultLabel: "ΔG‡ 4.00",
      labelPoint: { x: 425, y: 374.5 },
    })
  })

  it("anchors reversed transition barriers under the transition peak", () => {
    const intermediate = flowNode("tsf", { x: 0, y: 320 }, 0, 0, "intermediate")
    const transition = flowNode("ts", { x: 320, y: 40 }, 5, 7, "transition")
    const nodeMap = new Map([intermediate, transition].map((node) => [node.id, node]))
    const relativeLookup = new Map([["tsf", 18.81], ["ts", 24.85]])

    expect(createBarrierSegment(
      { id: "forward", sourceId: intermediate.id, targetId: transition.id },
      nodeMap,
      defaultEnergyDisplayOptions,
      relativeLookup,
    )).toMatchObject({
      arrowPath: "M 425 282 L 425 427",
      guidePath: "M 210 427 L 425 427",
      label: "ΔG‡ 6.04",
      sourceLabel: "tsf",
      targetLabel: "ts",
    })

    expect(createBarrierSegment(
      { id: "reversed", sourceId: transition.id, targetId: intermediate.id },
      nodeMap,
      defaultEnergyDisplayOptions,
      relativeLookup,
    )).toMatchObject({
      arrowPath: "M 425 282 L 425 427",
      guidePath: "M 210 427 L 425 427",
      label: "ΔG‡ 6.04",
      sourceLabel: "tsf",
      targetLabel: "ts",
    })
  })

  it("keeps a minimum visible ruler span when nodes are too close", () => {
    const source = flowNode("source", { x: 0, y: 0 }, 0, 0)
    const nearbyTarget = flowNode("target", { x: 320, y: 68 }, 5, 7)
    const nodeMap = new Map([source, nearbyTarget].map((node) => [node.id, node]))

    const segment = createBarrierSegment(
      { id: "barrier-a", sourceId: source.id, targetId: nearbyTarget.id },
      nodeMap,
      defaultEnergyDisplayOptions,
    )

    expect(segment?.arrowPath).toBe("M 425 310 L 425 386")
    expect(segment?.guidePath).toBe("M 210 107 L 210 386 L 425 386")
    expect(segment?.labelPoint).toEqual({ x: 425, y: 348 })
  })

  it("formats barrier labels from path-relative energy rows when available", () => {
    const source = flowNode("source", { x: 0, y: 0 }, 0, 0)
    const target = flowNode("target", { x: 0, y: 0 }, 2, 6)

    expect(defaultBarrierLabel(
      source,
      target,
      defaultEnergyDisplayOptions,
      new Map([["source", 0], ["target", 12.34]]),
    )).toBe("ΔG‡ 12.34")

    expect(defaultBarrierLabel(
      { ...target, kind: "transition" },
      source,
      defaultEnergyDisplayOptions,
      new Map([["source", 0], ["target", 12.34]]),
    )).toBe("ΔG‡ 12.34")

    expect(defaultBarrierLabel(
      source,
      target,
      defaultEnergyDisplayOptions,
      new Map([["source", null], ["target", 12.34]]),
    )).toBe("ΔG‡ pending")

    expect(defaultBarrierLabel(
      source,
      target,
      defaultEnergyDisplayOptions,
      new Map([["target", 12.34]]),
    )).toBe("ΔG‡ pending")
  })

  it("formats barrier labels from selected energy display and falls back", () => {
    expect(defaultBarrierLabel(
      flowNode("source", { x: 0, y: 0 }, 0, 0),
      flowNode("target", { x: 0, y: 0 }, 2, 6),
      defaultEnergyDisplayOptions,
    )).toBe("ΔG‡ 6.00")

    expect(defaultBarrierLabel(
      { ...flowNode("source", { x: 0, y: 0 }, 0, 0), energyGas: null },
      { ...flowNode("target", { x: 0, y: 0 }, 2, 6), energyGas: null },
      defaultEnergyDisplayOptions,
    )).toBe("ΔG‡ 6.00")

    expect(defaultBarrierLabel(
      { ...flowNode("source", { x: 0, y: 0 }), energyGas: null, energySolution: null },
      { ...flowNode("target", { x: 0, y: 0 }), energyGas: null, energySolution: null },
      defaultEnergyDisplayOptions,
    )).toBe("ΔG‡ pending")
  })

  it("normalizes drawing support values", () => {
    expect(energyDeltaKcal(0, "kcal/mol", 1, "hartree")).toBeCloseTo(627.509474)
    expect(energyDeltaKcal(null, "kcal/mol", 1, "kcal/mol")).toBeNull()
    expect(roundPathCoordinate(12.345)).toBe(12.3)
    expect(roundPathCoordinate(12.35)).toBe(12.4)
  })
})
