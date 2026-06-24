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

function flowNode(id: string, position: { x: number; y: number }, energyGas = 0, energySolution = 0): FlowNode {
  return {
    id,
    label: id,
    formula: "H2",
    kind: "reactant",
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

  it("creates connection and barrier draft preview paths", () => {
    const source = flowNode("source", { x: 0, y: 0 })

    expect(createConnectionPreviewPath(source, { x: 500, y: 180 }))
      .toBe("M 210 107 C 331.8 107, 378.2 180, 500 180")
    expect(createBarrierDraftPreviewPath(source, { x: 250, y: 422 }))
      .toBe("M 105 222 C 105 294, 250 350, 250 422")
  })

  it("creates expanded and compact barrier annotation geometry", () => {
    const source = flowNode("source", { x: 0, y: 0 }, 0, 0)
    const target = flowNode("target", { x: 320, y: 80 }, 5, 7)
    const nodeMap = new Map([source, target].map((node) => [node.id, node]))
    const barrier: FlowBarrier = { id: "barrier-a", sourceId: source.id, targetId: target.id }

    expect(createBarrierSegment(barrier, nodeMap, defaultEnergyDisplayOptions)).toEqual({
      id: "barrier-a",
      arrowPath: "M 105 187 L 105 236",
      guidePath: "M 105 226 L 105 236 M 320 187 L 105 187",
      label: "ΔG‡ 7.00",
      defaultLabel: "ΔG‡ 7.00",
      labelPoint: { x: 127, y: 211.5 },
      sourceLabel: "source",
      targetLabel: "target",
    })

    const compactTarget = flowNode("compact", { x: 320, y: 20 }, 2, 4)
    const compactMap = new Map([source, compactTarget].map((node) => [node.id, node]))

    expect(createBarrierSegment(
      { id: "barrier-b", sourceId: source.id, targetId: compactTarget.id, label: " custom " },
      compactMap,
      defaultEnergyDisplayOptions,
    )).toMatchObject({
      arrowPath: "M 105 127 L 105 236",
      guidePath: "M 105 226 L 105 236 M 320 127 L 105 127",
      label: "ΔG‡ 4.00",
      defaultLabel: "ΔG‡ 4.00",
      labelPoint: { x: 127, y: 181.5 },
    })
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
