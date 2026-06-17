import { describe, expect, it } from "vitest"
import type { FlowNode } from "../domain/projectPackages"
import {
  defaultEnergyDisplayOptions,
  energyTableNodeSelectionTransition,
  energyTableRows,
  energyToKcal,
  formatCoefficientValue,
  formatEnergy,
  formatRelativeEnergy,
  nodeCoefficient,
  nodeFooterText,
  relativeEnergyZeroNode,
  relativeEnergyZeroSelectionTransition,
} from "./energyDisplay"

const baseNode: FlowNode = {
  id: "node-a",
  label: "A",
  formula: "H2",
  kind: "reactant",
  method: "",
  solvent: "",
  energyGas: -10,
  energySolution: -12,
  energyUnit: "kcal/mol",
  sourceStatus: "parsed",
  position: { x: 0, y: 0 },
}

describe("energyDisplay", () => {
  it("derives relative energy rows from the selected source and baseline", () => {
    const rows = energyTableRows([
      baseNode,
      { ...baseNode, id: "node-b", label: "B", energyGas: -8, energySolution: -9 },
    ], defaultEnergyDisplayOptions)

    expect(rows.map((row) => [row.nodeId, row.relative])).toEqual([
      ["node-a", 0],
      ["node-b", 3],
    ])
    expect(relativeEnergyZeroNode([baseNode], defaultEnergyDisplayOptions)?.id).toBe("node-a")

    expect(relativeEnergyZeroSelectionTransition(defaultEnergyDisplayOptions, "node-b")).toEqual({
      energyDisplayOptions: { ...defaultEnergyDisplayOptions, baselineNodeId: "node-b" },
      selection: { nodeIds: ["node-b"], edgeIds: [], barrierIds: [] },
      keyboardEdgeSourceId: null,
      inspectorMode: "inspector",
    })
    expect(energyTableNodeSelectionTransition("node-b")).toEqual({
      selection: { nodeIds: ["node-b"], edgeIds: [], barrierIds: [] },
      inspectorMode: "inspector",
      viewMode: "canvas",
    })
  })

  it("converts hartree and formats visible energy labels", () => {
    expect(energyToKcal(1, "hartree")).toBeCloseTo(627.509474)
    expect(formatEnergy(-1.23456789, "hartree")).toBe("-1.234568 Eh")
    expect(formatEnergy(-1.234, "kcal/mol")).toBe("-1.23 kcal/mol")
    expect(formatRelativeEnergy(4.184, "kj/mol")).toBe("17.51 kJ/mol")
  })

  it("normalizes node coefficients and footer labels", () => {
    expect(nodeCoefficient({ ...baseNode, coefficient: 2 })).toBe(2)
    expect(nodeCoefficient({ ...baseNode, coefficient: 0 })).toBe(1)
    expect(formatCoefficientValue(1.23456789)).toBe("1.234568")
    expect(nodeFooterText(baseNode)).toBe("Parsed source")
    expect(nodeFooterText({ ...baseNode, sourceStatus: "staged", energyGas: null, energySolution: null })).toBe("Staged source")
    expect(nodeFooterText({ ...baseNode, sourceStatus: "demo", kind: "transition" })).toBe("Transition state")
  })
})
