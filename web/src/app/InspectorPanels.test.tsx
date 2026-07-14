import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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

const heavyEditorPreloadMocks = vi.hoisted(() => ({
  preload3Dmol: vi.fn(() => Promise.resolve({})),
  preloadKetcherEditorHost: vi.fn(() => Promise.resolve({})),
}))

vi.mock("./Molecule3DmolViewer.loader", () => ({
  load3DmolModule: vi.fn(() => Promise.resolve({})),
  preload3Dmol: heavyEditorPreloadMocks.preload3Dmol,
}))

vi.mock("./KetcherEditorHost.loader", () => ({
  loadKetcherEditorHostModule: vi.fn(() => Promise.resolve({})),
  preloadKetcherEditorHost: heavyEditorPreloadMocks.preloadKetcherEditorHost,
}))

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
  beforeEach(() => {
    heavyEditorPreloadMocks.preload3Dmol.mockClear()
    heavyEditorPreloadMocks.preloadKetcherEditorHost.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("preloads 3Dmol immediately from inspector hover and keyboard focus", () => {
    render(
      <InspectorPanel
        node={baseNode}
        file={sourceFile()}
        rows={[]}
        files={[sourceFile()]}
        energyDisplayOptions={{ ...defaultEnergyDisplayOptions }}
        onReviewCandidates={vi.fn()}
        onOpenStructure={vi.fn()}
        onEdit2DStructure={vi.fn()}
        onReset2DStructure={vi.fn()}
        onOpenSourceFile={vi.fn()}
      />,
    )

    const open3D = screen.getByRole("button", { name: "Open 3D Structure" })
    fireEvent.mouseEnter(open3D)
    expect(heavyEditorPreloadMocks.preload3Dmol).toHaveBeenCalledTimes(1)

    fireEvent.focus(open3D)
    expect(heavyEditorPreloadMocks.preload3Dmol).toHaveBeenCalledTimes(2)
  })

  it("waits for Ketcher hover intent, cancels on leave, and preloads immediately on focus", () => {
    vi.useFakeTimers()
    const view = render(
      <StructurePreviewDialog
        node={baseNode}
        file={sourceFile()}
        onClose={vi.fn()}
        onEdit2DStructure={vi.fn()}
      />,
    )
    const edit2D = screen.getByRole("button", { name: "Edit 2D structure for TS node" })

    fireEvent.mouseEnter(edit2D)
    vi.advanceTimersByTime(199)
    expect(heavyEditorPreloadMocks.preloadKetcherEditorHost).not.toHaveBeenCalled()

    fireEvent.mouseLeave(edit2D)
    vi.advanceTimersByTime(1)
    expect(heavyEditorPreloadMocks.preloadKetcherEditorHost).not.toHaveBeenCalled()

    fireEvent.mouseEnter(edit2D)
    vi.advanceTimersByTime(200)
    expect(heavyEditorPreloadMocks.preloadKetcherEditorHost).toHaveBeenCalledTimes(1)

    fireEvent.mouseEnter(edit2D)
    fireEvent.focus(edit2D)
    expect(heavyEditorPreloadMocks.preloadKetcherEditorHost).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(200)
    expect(heavyEditorPreloadMocks.preloadKetcherEditorHost).toHaveBeenCalledTimes(2)

    fireEvent.mouseEnter(edit2D)
    view.unmount()
    vi.advanceTimersByTime(200)
    expect(heavyEditorPreloadMocks.preloadKetcherEditorHost).toHaveBeenCalledTimes(2)
  })

  it("shows source details when a file is selected and no node is selected", () => {
    const onReviewCandidates = vi.fn()
    const file = sourceFile(sourceParseResult([
      candidate,
      { ...candidate, candidateId: "candidate-b", objectIndex: 1, label: "Product candidate" },
    ]))

    render(
      <InspectorPanel
        node={null}
        file={file}
        rows={[]}
        files={[file]}
        energyDisplayOptions={{ ...defaultEnergyDisplayOptions }}
        onReviewCandidates={onReviewCandidates}
        onOpenStructure={vi.fn()}
        onEdit2DStructure={vi.fn()}
        onReset2DStructure={vi.fn()}
        onOpenSourceFile={vi.fn()}
      />,
    )

    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeInTheDocument()
    expect(screen.queryByText("No node selected")).not.toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Source summary" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Source inspector" })).toBeInTheDocument()
    expect(screen.getAllByText("geometry.log")).toHaveLength(2)
    expect(screen.queryByText("gaussian-log-text-preview")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Review candidates" })).toBeInTheDocument()
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
    expect(screen.queryByText("C, H, O")).not.toBeInTheDocument()
    expect(screen.queryByText("geometry.log")).not.toBeInTheDocument()
    expect(screen.getByRole("img", { name: "3Dmol ball-and-stick model with 3 atoms" })).toBeInTheDocument()
    expect(screen.queryByText("3Dmol.js")).not.toBeInTheDocument()
    expect(screen.queryByText("全屏打开")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open 3D structure fullscreen" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Play vibration" })).toBeInTheDocument()
  })

  it("hydrates and plays the first vibration mode from a single click", async () => {
    const vibrationAtoms = candidate.coordinatePreview?.atoms ?? []
    const firstModeMetadata = {
      modeId: "mode-1-real-120.00",
      modeIndex: 0,
      frequencyCm1: 120,
      kind: "real" as const,
      source: "cclib" as const,
      displacements: [],
    }
    const secondModeWithDisplacements = {
      modeId: "mode-2-imaginary-300.00",
      modeIndex: 1,
      frequencyCm1: -300,
      kind: "imaginary" as const,
      source: "cclib" as const,
      displacements: vibrationAtoms.map((_atom, atomIndex) => ({ atomIndex, dx: 0, dy: 0.1, dz: 0 })),
    }
    const metadataCandidate: ParseCandidate = {
      ...candidate,
      coordinatePreview: {
        ...candidate.coordinatePreview!,
        vibrationModes: [firstModeMetadata, secondModeWithDisplacements],
      },
    }
    const hydratedCandidate: ParseCandidate = {
      ...metadataCandidate,
      coordinatePreview: {
        ...metadataCandidate.coordinatePreview!,
        vibrationModes: [{
          ...firstModeMetadata,
          displacements: vibrationAtoms.map((_atom, atomIndex) => ({ atomIndex, dx: 0.1, dy: 0, dz: 0 })),
        }, secondModeWithDisplacements],
      },
    }
    const onHydrateSourceParse = vi.fn().mockResolvedValue(sourceParseResult([hydratedCandidate]))

    render(
      <StructurePreviewDialog
        node={baseNode}
        file={sourceFile(sourceParseResult([metadataCandidate]))}
        onClose={vi.fn()}
        onHydrateSourceParse={onHydrateSourceParse}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Play vibration" }))

    await waitFor(() => expect(onHydrateSourceParse).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause vibration" })).toBeInTheDocument())
  })

  it("uses disabled icons instead of visible copy for missing structure previews", () => {
    render(
      <StructurePreviewDialog
        node={{ ...baseNode, sourceFileId: undefined, sourceCandidateId: undefined }}
        file={null}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole("img", { name: "TS node 2D unavailable" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Coordinate preview unavailable" })).toBeInTheDocument()
    expect(screen.queryByText("2D unavailable")).not.toBeInTheDocument()
    expect(screen.queryByText("No 3D coordinates in this source")).not.toBeInTheDocument()
    expect(screen.queryByText("Import coordinate blocks to preview the structure.")).not.toBeInTheDocument()
  })
})
