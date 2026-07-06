import { describe, expect, it } from "vitest"
import type { FlowEdge, FlowNode } from "../domain/projectPackages"
import {
  attachNodeToStepComposition,
  stepCompositionDropTargetAtPoint,
  stepCompositionDropZones,
  stepCompositionFormulaForEdge,
} from "./stepCompositionAuthoring"

describe("stepCompositionAuthoring", () => {
  it("projects add and release drop zones from path steps", () => {
    const nodes = [node("a", "A", 0, 0), node("b", "B", 280, 0), node("cl", "Cl", 120, -120)]
    const edges = [edge("step", "a", "b")]
    const zones = stepCompositionDropZones(nodes, edges)

    expect(zones.map((zone) => `${zone.pathNodeId}:${zone.role}:${zone.label}`)).toEqual([
      "a:addition:Add before A",
      "a:release:Release after A",
      "b:addition:Add before B",
      "b:release:Release after B",
    ])
    const additionZone = zones.find((zone) => zone.pathNodeId === "b" && zone.role === "addition")
    if (!additionZone) throw new Error("Missing target addition zone")
    expect(stepCompositionDropTargetAtPoint({
      nodes,
      edges,
      point: centerOf(additionZone),
      draggedNodeIds: ["cl"],
    })).toEqual({ pathNodeId: "b", role: "addition" })
  })

  it("attaches a node as an addition before a step target", () => {
    const nodes = [node("a", "A", 0, 0), node("b", "B", 280, 0), node("cl", "Cl", 120, -120)]
    const edges = [edge("step", "a", "b")]

    const result = attachNodeToStepComposition({
      nodes,
      edges,
      nodeId: "cl",
      target: { pathNodeId: "b", role: "addition" },
      now: 1,
    })

    expect(result?.nodes.find((item) => item.id === "cl")?.pathRole).toBe("participant")
    expect(result?.edges).toContainEqual({
      id: "edge-addition-cl-b-1",
      sourceId: "cl",
      targetId: "b",
      label: "path",
      stepRole: "addition",
    })
    expect(stepCompositionFormulaForEdge(edges[0], result?.nodes ?? [], result?.edges ?? [])).toBe("A + Cl -> B")
  })

  it("attaches a node as a release after a step source", () => {
    const nodes = [node("a", "A", 0, 0), node("b", "B", 280, 0), node("three", "3", 120, 120)]
    const edges = [edge("step", "a", "b")]

    const result = attachNodeToStepComposition({
      nodes,
      edges,
      nodeId: "three",
      target: { pathNodeId: "a", role: "release" },
      now: 2,
    })

    expect(result?.nodes.find((item) => item.id === "three")?.pathRole).toBe("participant")
    expect(result?.edges).toContainEqual({
      id: "edge-release-three-a-2",
      sourceId: "a",
      targetId: "three",
      label: "path",
      stepRole: "release",
    })
    expect(stepCompositionFormulaForEdge(edges[0], result?.nodes ?? [], result?.edges ?? [])).toBe("A -> B + 3")
  })

  it("replaces prior side-species edges when a participant is reattached", () => {
    const nodes = [
      node("a", "A", 0, 0),
      node("b", "B", 280, 0),
      node("c", "C", 560, 0),
      { ...node("cl", "Cl", 120, -120), pathRole: "participant" as const },
    ]
    const edges = [
      edge("step-ab", "a", "b"),
      edge("step-bc", "b", "c"),
      edge("old-addition", "cl", "b", "addition"),
    ]

    const result = attachNodeToStepComposition({
      nodes,
      edges,
      nodeId: "cl",
      target: { pathNodeId: "c", role: "addition" },
      now: 3,
    })

    expect(result?.edges.some((item) => item.id === "old-addition")).toBe(false)
    expect(result?.edges).toContainEqual({
      id: "edge-addition-cl-c-3",
      sourceId: "cl",
      targetId: "c",
      label: "path",
      stepRole: "addition",
    })
  })
})

function node(id: string, label: string, x: number, y: number): FlowNode {
  return {
    id,
    label,
    formula: label,
    kind: "intermediate",
    method: "demo",
    solvent: "implicit",
    energyGas: 0,
    energySolution: 0,
    energyUnit: "kcal/mol",
    sourceStatus: "parsed",
    position: { x, y },
  }
}

function edge(id: string, sourceId: string, targetId: string, stepRole?: FlowEdge["stepRole"]): FlowEdge {
  return { id, sourceId, targetId, label: "path", stepRole }
}

function centerOf(zone: ReturnType<typeof stepCompositionDropZones>[number]) {
  return {
    x: zone.rect.x + zone.rect.width / 2,
    y: zone.rect.y + zone.rect.height / 2,
  }
}
