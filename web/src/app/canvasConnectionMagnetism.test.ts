import { describe, expect, it } from "vitest"
import type { FlowNode } from "../domain/projectPackages"
import {
  connectionTargetAnchor,
  nearestConnectionMagnetTarget,
  updateConnectionDraftWithMagnetTarget,
} from "./canvasConnectionMagnetism"

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

describe("canvasConnectionMagnetism", () => {
  it("anchors connection magnets at node input ports", () => {
    expect(connectionTargetAnchor(flowNode("target", { x: 320, y: 80 }))).toEqual({
      x: 320,
      y: 187,
    })
    expect(connectionTargetAnchor(flowNode("target", { x: 320, y: 80 }), "release")).toEqual({
      x: 320,
      y: 149,
    })
  })

  it("finds the nearest eligible input port inside the snap radius", () => {
    const source = flowNode("source", { x: 0, y: 0 })
    const target = flowNode("target", { x: 320, y: 80 })
    const closer = flowNode("closer", { x: 340, y: 90 })

    expect(nearestConnectionMagnetTarget({
      nodes: [source, target, closer],
      sourceId: source.id,
      current: { x: 338, y: 196 },
      radius: 42,
    })).toMatchObject({
      targetId: "closer",
      point: { x: 340, y: 197 },
    })

    expect(nearestConnectionMagnetTarget({
      nodes: [source, target],
      sourceId: source.id,
      current: { x: 210, y: 187 },
      radius: 42,
    })).toBeNull()
  })

  it("finds the visible release connector on the target node", () => {
    const source = flowNode("source", { x: 0, y: 0 })
    const target = flowNode("target", { x: 320, y: 80 })

    expect(nearestConnectionMagnetTarget({
      nodes: [source, target],
      sourceId: source.id,
      current: { x: 322, y: 151 },
      radius: 44,
    })).toMatchObject({
      targetId: "target",
      point: { x: 320, y: 149 },
      stepRole: "release",
    })
  })

  it("falls back to the middle input while drafting an addition edge near a release connector", () => {
    const source = flowNode("source", { x: 0, y: 0 })
    const target = flowNode("target", { x: 320, y: 80 })

    expect(nearestConnectionMagnetTarget({
      nodes: [source, target],
      sourceId: source.id,
      current: { x: 322, y: 151 },
      radius: 44,
      sourceStepRole: "addition",
    })).toMatchObject({
      targetId: "target",
      point: { x: 320, y: 187 },
      stepRole: undefined,
    })
  })

  it("snaps draft endpoints to ports and clears stale snap state outside the radius", () => {
    const source = flowNode("source", { x: 0, y: 0 })
    const target = flowNode("target", { x: 320, y: 80 })
    const draft = { pointerId: 7, sourceId: source.id, current: { x: 10, y: 10 } }

    const snapped = updateConnectionDraftWithMagnetTarget({
      draft,
      pointerId: 7,
      current: { x: 328, y: 190 },
      nodes: [source, target],
      radius: 32,
    })

    expect(snapped).toEqual({
      pointerId: 7,
      sourceId: source.id,
      current: { x: 320, y: 187 },
      snapTargetId: target.id,
    })

    expect(updateConnectionDraftWithMagnetTarget({
      draft: snapped,
      pointerId: 7,
      current: { x: 220, y: 190 },
      nodes: [source, target],
      radius: 32,
    })).toEqual({
      pointerId: 7,
      sourceId: source.id,
      current: { x: 220, y: 190 },
    })
  })

  it("stores release snap role on draft endpoints and clears it when leaving the magnet", () => {
    const source = flowNode("source", { x: 0, y: 0 })
    const target = flowNode("target", { x: 320, y: 80 })
    const draft = { pointerId: 7, sourceId: source.id, current: { x: 10, y: 10 } }

    const snapped = updateConnectionDraftWithMagnetTarget({
      draft,
      pointerId: 7,
      current: { x: 322, y: 151 },
      nodes: [source, target],
      radius: 44,
    })

    expect(snapped).toEqual({
      pointerId: 7,
      sourceId: source.id,
      current: { x: 320, y: 149 },
      snapTargetId: target.id,
      snapStepRole: "release",
    })

    expect(updateConnectionDraftWithMagnetTarget({
      draft: snapped,
      pointerId: 7,
      current: { x: 220, y: 151 },
      nodes: [source, target],
      radius: 44,
    })).toEqual({
      pointerId: 7,
      sourceId: source.id,
      current: { x: 220, y: 151 },
    })
  })
})
