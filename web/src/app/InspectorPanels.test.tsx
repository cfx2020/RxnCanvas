import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { FlowNode, SourceFile } from "../domain/projectPackages"
import type { ParseCandidate, SourceParseResult } from "../domain/sourceParsers"
import {
  CandidateReviewSheet,
  InspectorPanel,
  StructurePreviewDialog,
  sourceFileForNode,
} from "./InspectorPanels"
import { defaultEnergyDisplayOptions } from "./energyDisplay"
import { candidateReviewKey, nodeKindFromCandidate, type CandidateReviewEntry } from "./importRegistration"

const baseNode: FlowNode = {
  id: "ts-node",
  label: "TS node",
  formula: "C2H4",
  kind: "transition",
  method: "wB97X-D",
  solvent: "Toluene",
  energyGas: -100.1,
  energySolution: -100.05,
  energyUnit: "hartree",
  sourceStatus: "parsed",
  sourceFileId: "source-a",
  sourceCandidateId: "candidate-a",
  charge: 0,
  spinMultiplicity: 1,
  position: { x: 0, y: 0 },
}

const candidate: ParseCandidate = {
  candidateId: "candidate-a",
  objectIndex: 0,
  label: "TS candidate",
  formula: "C2H4",
  charge: 0,
  spinMultiplicity: 1,
  method: "wB97X-D",
  energyGas: -100.1,
  energySolution: -100.05,
  energyUnit: "hartree",
  coordinatePreview: {
    atomCount: 3,
    has3d: true,
    elements: ["C", "H", "O"],
    atoms: [
      { element: "C", x: 0, y: 0, z: 0 },
      { element: "O", x: 1.2, y: 0, z: 0 },
      { element: "H", x: -0.5, y: 0.9, z: 0.2 },
    ],
    previewKind: "text",
  },
  roleHint: "final",
  warnings: [],
}

function sourceParseResult(candidates: ParseCandidate[] = [candidate]): SourceParseResult {
  return {
    label: "geometry",
    sourceKind: "Gaussian",
    formula: "C2H4",
    kind: "intermediate",
    method: "wB97X-D",
    solvent: "Toluene",
    energyGas: -100.1,
    energySolution: -100.05,
    energyUnit: "hartree",
    parsed: true,
    parserId: "gaussian-log-text-preview",
    parserVersion: "0.2.1",
    objectCount: candidates.length,
    warnings: [{ code: "multiple_candidates", message: "Choose the candidate to register.", target: "geometry.log" }],
    candidates,
    coordinatePreview: candidate.coordinatePreview,
  }
}

function sourceFile(parse = sourceParseResult()): SourceFile {
  return {
    id: "source-a",
    name: "geometry.log",
    kind: "Gaussian",
    size: 2048,
    status: "parsed",
    preview: "SCF Done: E(RwB97XD) = -100.1",
    parse,
  }
}

describe("InspectorPanels", () => {
  it("does not render a standalone source panel when no node is selected", () => {
    const onReviewCandidates = vi.fn()
    const file = sourceFile(sourceParseResult([
      candidate,
      { ...candidate, candidateId: "candidate-b", objectIndex: 1, label: "Product candidate" },
    ]))

    render(
      <InspectorPanel
        node={null}
        edge={null}
        barrier={null}
        nodeMap={new Map([[baseNode.id, baseNode]])}
        file={file}
        rows={[]}
        files={[file]}
        energyDisplayOptions={{ ...defaultEnergyDisplayOptions }}
        onReviewCandidates={onReviewCandidates}
        onUpdateEdgeLabel={vi.fn()}
        onUpdateBarrierLabel={vi.fn()}
        onOpenStructure={vi.fn()}
        onEdit2DStructure={vi.fn()}
        onReset2DStructure={vi.fn()}
        onOpenSourceFile={vi.fn()}
      />,
    )

    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeInTheDocument()
    expect(screen.getByText("No node selected")).toBeInTheDocument()
    expect(screen.queryByText("geometry.log")).not.toBeInTheDocument()
    expect(screen.queryByText("gaussian-log-text-preview")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Review candidates" })).not.toBeInTheDocument()
    expect(onReviewCandidates).not.toHaveBeenCalled()
  })

  it("keeps candidate review selection keys and display labels stable", () => {
    const entry: CandidateReviewEntry = {
      file: sourceFile(),
      parsed: sourceParseResult(),
      candidate,
    }
    const key = candidateReviewKey(entry)
    const onToggleCandidate = vi.fn()
    const onRegisterSelected = vi.fn()

    render(
      <CandidateReviewSheet
        review={{ id: "review", entries: [entry], selectedKeys: [key] }}
        busy={false}
        onToggleCandidate={onToggleCandidate}
        onClose={vi.fn()}
        onRegisterSelected={onRegisterSelected}
        onRegisterAll={vi.fn()}
      />,
    )

    expect(screen.getByRole("dialog", { name: "Import candidates" })).toBeInTheDocument()
    expect(screen.getByText("TS candidate")).toBeInTheDocument()
    expect(screen.getByText("product / final")).toBeInTheDocument()
    expect(screen.getByText("-100.050000 Eh")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("checkbox", { name: "Select TS candidate" }))
    expect(onToggleCandidate).toHaveBeenCalledWith("source-a:candidate-a")

    fireEvent.click(screen.getByRole("button", { name: "Register selected" }))
    expect(onRegisterSelected).toHaveBeenCalled()
  })

  it("resolves source files and renders structure coordinate summaries", () => {
    const file = sourceFile()
    expect(sourceFileForNode(baseNode, [file])).toBe(file)
    expect(nodeKindFromCandidate(candidate, "intermediate")).toBe("product")

    render(
      <StructurePreviewDialog
        node={baseNode}
        file={file}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole("dialog", { name: "3D Structure" })).toBeInTheDocument()
    expect(screen.getByText("TS node")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
    expect(screen.getByText("C, H, O")).toBeInTheDocument()
    expect(screen.getByText("geometry.log")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "3Dmol ball-and-stick model with 3 atoms" })).toBeInTheDocument()
    expect(screen.getByText("3Dmol.js")).toBeInTheDocument()
  })
})
