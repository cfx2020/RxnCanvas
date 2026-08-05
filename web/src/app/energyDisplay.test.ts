import { describe, expect, it } from "vitest"
import type { FlowEdge, FlowNode } from "../domain/projectPackages"
import {
  defaultEnergyDisplayOptions,
  energyTableNodeSelectionTransition,
  energyTableRows,
  energyToKcal,
  formatCoefficientValue,
  formatEnergy,
  formatRelativeEnergy,
  kcalPerHartree,
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

  it("derives Ir-style relative energy expressions only from explicit path semantics", () => {
    const nodes: FlowNode[] = [
      irNode("tsr", "i1N2fix14-tsr", -6774.84468, -6774.46879252),
      irNode("tsf", "i1N2fix14-tsf", -6774.830559, -6774.44492798),
      irNode("ts", "i1N2fix14-ts", -6774.817266, -6774.43530137, "transition"),
      irNode("base", "4b-1", -5209.716178, -5209.21691981),
      irNode("four-b", "4b+", -4749.27926427, -4748.79778908),
      irNode("one", "1", -2025.48052593, -2025.64916099, "intermediate", "participant"),
      irNode("cl", "Cl", -460.232419976, -460.391177522, "intermediate", "participant"),
      irNode("n2", "N2", -109.478913, -109.521554, "intermediate", "participant"),
    ]
    const explicitEdges: FlowEdge[] = [
      edge("base", "four-b"),
      edge("four-b", "tsf"),
      edge("tsf", "ts"),
      edge("ts", "tsr"),
      edge("base", "cl", "release"),
      edge("one", "tsf", "addition"),
      edge("tsr", "n2", "release"),
    ]

    const gasRows = energyTableRows(nodes, { ...defaultEnergyDisplayOptions, energySource: "gas" }, explicitEdges)
    expect(relativeEnergyZeroNode(nodes, defaultEnergyDisplayOptions, explicitEdges)?.id).toBe("base")
    expect(gasRows.find((row) => row.nodeId === "base")?.showInRelativeTable).toBe(true)
    expect(gasRows.find((row) => row.nodeId === "base")?.relative).toBeCloseTo(0)
    expect(gasRows.find((row) => row.nodeId === "one")?.relativeRole).toBe("addition-term")
    expect(gasRows.find((row) => row.nodeId === "cl")?.relativeRole).toBe("release-term")
    expect(gasRows.find((row) => row.nodeId === "n2")?.relativeRole).toBe("release-term")
    expect(gasRows.find((row) => row.nodeId === "cl")?.relative).toBeNull()
    expect(gasRows.find((row) => row.nodeId === "n2")?.relative).toBeNull()
    expect(expressionSignature(rowById(gasRows, "four-b"))).toEqual(["1:4b+", "1:Cl", "-1:4b-1"])
    expect(relativeExpressionSignature(rowById(gasRows, "four-b"))).toEqual(["1:4b+", "1:Cl", "-1:4b-1"])
    expect(expressionSignature(rowById(gasRows, "tsf"))).toEqual(["1:i1N2fix14-tsf", "1:Cl", "-1:4b-1", "-1:1"])
    expect(relativeExpressionSignature(rowById(gasRows, "tsf"))).toEqual(["1:i1N2fix14-tsf", "1:Cl", "-1:4b-1", "-1:1"])
    expect(expressionSignature(rowById(gasRows, "tsr"))).toEqual(["1:i1N2fix14-tsr", "1:Cl", "-1:4b-1", "-1:1"])
    expect(gasRows.find((row) => row.nodeId === "four-b")?.relative).toBeCloseTo(128.3218, 3)
    expect(gasRows.find((row) => row.nodeId === "tsf")?.relative).toBeCloseTo(83.9137, 3)
    expect(gasRows.find((row) => row.nodeId === "ts")?.relative).toBeCloseTo(92.2552, 3)
    expect(gasRows.find((row) => row.nodeId === "tsr")?.relative).toBeCloseTo(75.0526, 3)

    const shiftedRows = energyTableRows(nodes, {
      ...defaultEnergyDisplayOptions,
      baselineNodeId: "ts",
      energySource: "gas",
    }, explicitEdges)
    expect(shiftedRows.find((row) => row.nodeId === "ts")?.relative).toBeCloseTo(0)
    expect(shiftedRows.find((row) => row.nodeId === "four-b")?.relative).toBeCloseTo(36.0666, 3)
    expect(relativeExpressionSignature(rowById(shiftedRows, "four-b"))).toEqual(["1:4b+", "-1:i1N2fix14-ts", "1:1"])

    const solutionRows = energyTableRows(nodes, defaultEnergyDisplayOptions, explicitEdges)
    expect(solutionRows.find((row) => row.nodeId === "four-b")?.relative).toBeCloseTo(17.5410, 3)
    expect(solutionRows.find((row) => row.nodeId === "tsf")?.relative).toBeCloseTo(18.8099, 3)
    expect(solutionRows.find((row) => row.nodeId === "ts")?.relative).toBeCloseTo(24.8503, 3)
    expect(solutionRows.find((row) => row.nodeId === "tsr")?.relative).toBeCloseTo(3.8344, 3)
    expect((solutionRows.find((row) => row.nodeId === "four-b")?.relativeEnergyTable?.gsolHartree ?? 0) * kcalPerHartree).toBeCloseTo(17.5410, 3)

    const unmarkedNodes = nodes.map((node) => ({ ...node, pathRole: undefined }))
    const unmarkedRows = energyTableRows(unmarkedNodes, defaultEnergyDisplayOptions, [
      edge("base", "four-b"),
      edge("base", "cl"),
      edge("four-b", "tsf"),
      edge("tsf", "ts"),
      edge("ts", "tsr"),
      edge("one", "tsf"),
    ])
    expect(unmarkedRows.find((row) => row.nodeId === "one")?.relativeRole).toBe("standalone")
    expect(unmarkedRows.find((row) => row.nodeId === "cl")?.relativeRole).toBe("path-point")
    expect(expressionSignature(rowById(unmarkedRows, "four-b"))).toEqual(["1:4b+", "-1:4b-1"])
    expect(expressionSignature(rowById(unmarkedRows, "tsf"))).toEqual(["1:i1N2fix14-tsf", "-1:4b-1"])

    const orphan = irNode("orphan", "newly imported log", -101, -100)
    const rowsWithOrphan = energyTableRows([...nodes, orphan], defaultEnergyDisplayOptions, explicitEdges)
    expect(rowsWithOrphan.find((row) => row.nodeId === "orphan")?.relativeRole).toBe("standalone")
    expect(rowsWithOrphan.find((row) => row.nodeId === "orphan")?.showInRelativeTable).toBe(true)
    expect(rowsWithOrphan.find((row) => row.nodeId === "orphan")?.relative).not.toBeNull()
  })

  it("keeps participant terms path-local when branch alternatives converge", () => {
    const nodes: FlowNode[] = [
      kcalNode("base", "base", 0),
      kcalNode("lower", "lower branch", 20),
      kcalNode("upper", "upper branch", 10),
      kcalNode("product", "4b-1", 100),
      kcalNode("released-upper", "3", 5, "participant"),
      kcalNode("released-lower", "3 copy", null, "participant"),
      kcalNode("cl-upper", "Cl", 2, "participant"),
      kcalNode("cl-lower", "Cl", 3, "participant"),
    ]
    const edges: FlowEdge[] = [
      edge("base", "lower", "branch"),
      edge("lower", "product", "branch"),
      edge("base", "upper", "branch"),
      edge("upper", "product", "branch"),
      edge("upper", "released-upper", "release"),
      edge("lower", "released-lower", "release"),
      edge("cl-upper", "product", "addition"),
      edge("cl-lower", "product", "addition"),
    ]

    const rows = energyTableRows(nodes, defaultEnergyDisplayOptions, edges)
    const product = rowById(rows, "product")

    expect(expressionSignature(product)).toEqual(["1:4b-1", "1:3", "-1:base", "-1:Cl"])
    expect(product.relative).toBeCloseTo(103)
  })

  it("keeps repeated participant occurrences across steps while deduplicating copies within one step", () => {
    const nodes: FlowNode[] = [
      kcalNode("base", "base", 0),
      kcalNode("step", "step", 20),
      kcalNode("product", "product", 100),
      kcalNode("released-early", "i3-2", 5, "participant"),
      kcalNode("released-early-copy", "i3-2", 5, "participant"),
      kcalNode("added-early", "s-i1", 2, "participant"),
    ]
    const edges: FlowEdge[] = [
      edge("base", "step"),
      edge("step", "product"),
      edge("base", "released-early", "release"),
      edge("base", "released-early-copy", "release"),
      edge("step", "released-early", "release"),
      edge("added-early", "step", "addition"),
      edge("added-early", "product", "addition"),
    ]

    const product = rowById(energyTableRows(nodes, defaultEnergyDisplayOptions, edges), "product")

    expect(expressionSignature(product)).toEqual([
      "1:product",
      "2:i3-2",
      "-1:base",
      "-2:s-i1",
    ])
    expect(product.relative).toBeCloseTo(106)
  })

  it("keeps branched expressions rooted at the selected zero while disconnected path fragments use standalone values", () => {
    const nodes: FlowNode[] = [
      kcalNode("base", "shared baseline", 1000),
      kcalNode("upper-ts", "singlet TS", 1030),
      kcalNode("lower-ts", "triplet TS", 1020),
      kcalNode("upper-product", "singlet product", 1100),
      kcalNode("upper-tail", "singlet tail", 1110),
      kcalNode("upper-end", "singlet end", 1120),
      kcalNode("lower-product", "triplet product", 1090),
      kcalNode("lower-tail", "triplet tail", 1100),
      kcalNode("released", "released species", 40, "participant"),
      kcalNode("upper-added", "singlet additive", 10, "participant"),
      kcalNode("lower-added", "triplet additive", 5, "participant"),
    ]
    const edges: FlowEdge[] = [
      edge("base", "upper-ts"),
      edge("base", "lower-ts"),
      edge("base", "released", "release"),
      edge("upper-added", "upper-ts", "addition"),
      edge("lower-added", "lower-ts", "addition"),
      edge("upper-product", "upper-tail"),
      edge("upper-tail", "upper-end"),
      edge("lower-product", "lower-tail"),
    ]
    const options = { ...defaultEnergyDisplayOptions, baselineNodeId: "base" }

    const disconnectedRows = energyTableRows(nodes, options, edges)
    expect(rowById(disconnectedRows, "upper-ts").relative).toBeCloseTo(60)
    expect(rowById(disconnectedRows, "lower-ts").relative).toBeCloseTo(55)
    expect(rowById(disconnectedRows, "upper-product").relative).toBeCloseTo(100)
    expect(rowById(disconnectedRows, "lower-product").relative).toBeCloseTo(90)
    expect(rowById(disconnectedRows, "upper-product").showInRelativeTable).toBe(true)
    expect(rowById(disconnectedRows, "lower-product").showInRelativeTable).toBe(true)

    const connectedRows = energyTableRows(nodes, options, [
      ...edges,
      edge("upper-ts", "upper-product"),
    ])
    expect(rowById(connectedRows, "upper-ts").relative).toBeCloseTo(60)
    expect(rowById(connectedRows, "lower-ts").relative).toBeCloseTo(55)
    expect(rowById(connectedRows, "upper-product").relative).toBeCloseTo(130)
    expect(rowById(connectedRows, "lower-product").relative).toBeCloseTo(90)
  })

  it("keeps standalone nodes relative when a path edge introduces a zero expression", () => {
    const nodes = [
      irNode("base", "base", -100, -100),
      irNode("connected", "connected", -99.9, -99.9),
      irNode("standalone", "standalone", -99.8, -99.8),
    ]

    const rows = energyTableRows(nodes, defaultEnergyDisplayOptions, [edge("base", "connected")])

    expect(rowById(rows, "base").relative).toBeCloseTo(0)
    expect(rowById(rows, "connected").relative).toBeCloseTo(62.7509, 3)
    expect(rowById(rows, "standalone").relative).toBeCloseTo(125.5019, 3)
    expect((rowById(rows, "standalone").relativeEnergyTable?.gsolHartree ?? 0)).toBeCloseTo(0.2, 8)

    const explicitlyRootedRows = energyTableRows(nodes, {
      ...defaultEnergyDisplayOptions,
      baselineNodeId: "base",
    }, [edge("base", "connected")])
    expect(rowById(explicitlyRootedRows, "standalone").relative).toBeCloseTo(125.5019, 3)
  })

  it("restores disconnected stale participants to standalone relative energy", () => {
    const nodes = [
      kcalNode("base", "zero", 0),
      kcalNode("released", "i3-2", 15, "participant"),
    ]

    const released = rowById(energyTableRows(nodes, defaultEnergyDisplayOptions), "released")

    expect(released.relativeRole).toBe("standalone")
    expect(released.showInRelativeTable).toBe(true)
    expect(released.relative).toBeCloseTo(15)
  })

  it("ignores a stale participant role when current edges make the node a path point", () => {
    const nodes = [
      kcalNode("base", "base", 0),
      kcalNode("additive", "6a", 10, "participant"),
      kcalNode("target", "S-s-i8-fix-t-tsr", 40, "participant"),
      kcalNode("next", "next", 50),
    ]
    const edges = [
      edge("base", "target"),
      edge("additive", "target", "addition"),
      edge("target", "next"),
    ]

    const target = rowById(energyTableRows(nodes, defaultEnergyDisplayOptions, edges), "target")

    expect(target.relativeRole).toBe("path-point")
    expect(target.relative).toBeCloseTo(30)
  })
})

function irNode(
  id: string,
  label: string,
  egasHartree: number,
  gsolHartree: number,
  kind: FlowNode["kind"] = "intermediate",
  pathRole?: FlowNode["pathRole"],
): FlowNode {
  return {
    id,
    label,
    formula: label,
    kind,
    pathRole,
    method: "Gaussian",
    solvent: "implicit",
    energyGas: egasHartree,
    energySolution: gsolHartree,
    energyUnit: "hartree",
    sourceStatus: "parsed",
    energyTable: { egasHartree, gsolHartree },
    position: { x: 0, y: 0 },
  }
}

function edge(sourceId: string, targetId: string, stepRole?: FlowEdge["stepRole"]): FlowEdge {
  return { id: `${sourceId}-${targetId}`, sourceId, targetId, label: "path", stepRole }
}

function kcalNode(
  id: string,
  label: string,
  energy: number | null,
  pathRole?: FlowNode["pathRole"],
): FlowNode {
  return {
    id,
    label,
    formula: label.replace(/\s+branch$/, ""),
    kind: "intermediate",
    pathRole,
    method: "demo",
    solvent: "implicit",
    energyGas: energy,
    energySolution: energy,
    energyUnit: "kcal/mol",
    sourceStatus: energy === null ? "staged" : "parsed",
    position: { x: 0, y: 0 },
  }
}

function rowById(rows: ReturnType<typeof energyTableRows>, nodeId: string) {
  const row = rows.find((item) => item.nodeId === nodeId)
  if (!row) throw new Error(`Missing row ${nodeId}`)
  return row
}

function expressionSignature(row: ReturnType<typeof energyTableRows>[number]): string[] {
  return row.expressionTerms.map((term) => `${term.coefficient}:${term.label}`)
}

function relativeExpressionSignature(row: ReturnType<typeof energyTableRows>[number]): string[] {
  return row.relativeExpressionTerms.map((term) => `${term.coefficient}:${term.label}`)
}
