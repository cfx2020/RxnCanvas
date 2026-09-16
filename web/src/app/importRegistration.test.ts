import { describe, expect, it, vi } from "vitest"
import { defaultEnergyDisplayOptions } from "./energyDisplay"
import type { SourceFile } from "../domain/projectPackages"
import type { ProjectWorkspaceSnapshot } from "./projectWorkspace"
import type { ParseCandidate, SourceParseResult } from "../domain/sourceParseTypes"
import {
  browserImportSourceFilesFromFiles,
  canvasRawFileDropImportTransition,
  buildImportPlan,
  automaticImportNodesFromPlan,
  candidateReviewKey,
  candidateReviewEntriesForMode,
  candidateReviewStateForSourceFile,
  candidateReviewStateFromEntries,
  candidateReviewStateFromPlan,
  candidateReviewRegistrationApplyTransition,
  candidateReviewTransitionForSourceFile,
  defaultCandidateSelection,
  desktopImportFilesTransition,
  desktopImportSourceFilesFromFiles,
  desktopRegisteredNodesFromEntries,
  importLayoutFromCanvas,
  importLayoutFromPoint,
  importPickerTransition,
  importRegistrationFiles,
  importRegistrationSelections,
  nodeFromCandidate,
  nodeKindFromCandidate,
  pendingImportProjectTransition,
  prepareProjectWorkspaceImport,
  projectWorkspaceImportApplyTransition,
  rebasePreparedProjectWorkspaceImport,
  reconcileProjectWorkspaceSourceNodes,
  projectWorkspaceWithImportPlan,
  projectWorkspaceWithRegisteredImportNodes,
  registeredOrFallbackNodesFromEntries,
  sourceFilesFromIds,
  sourceFilesWithImportPlan,
  toggleCandidateReviewSelection,
  type CandidateReviewEntry,
  type ImportNodeLayout,
  type RegisteredImportObject,
} from "./importRegistration"

const layout: ImportNodeLayout = { origin: { x: 10, y: 20 }, columns: 2, idSuffix: "test" }

function candidate(overrides: Partial<ParseCandidate> = {}): ParseCandidate {
  return {
    candidateId: "cand-1",
    objectIndex: 0,
    label: "TS1",
    formula: "C2H4",
    charge: 0,
    spinMultiplicity: 1,
    method: "wB97X-D",
    energyGas: -1,
    energySolution: -2,
    energyUnit: "hartree",
    coordinatePreview: null,
    roleHint: "transition",
    warnings: [],
    ...overrides,
  }
}

function parseResult(candidates: ParseCandidate[]): SourceParseResult {
  return {
    label: "multi",
    sourceKind: "Gaussian",
    formula: "C2H4",
    kind: "intermediate",
    method: "DFT",
    solvent: "SMD",
    energyGas: -1,
    energySolution: -2,
    energyUnit: "hartree",
    parsed: true,
    parserId: "test-parser",
    parserVersion: "1",
    objectCount: candidates.length,
    warnings: [],
    candidates,
    coordinatePreview: null,
  }
}

function failedParseResult(code = "cclib_parse_empty"): SourceParseResult {
  return {
    ...parseResult([]),
    parsed: false,
    parserId: null,
    parserVersion: null,
    objectCount: 0,
    candidates: [],
    coordinatePreview: null,
    warnings: [{
      code,
      message: "cclib did not return parsed data; standard cclib fields were left empty.",
      target: "source.log",
    }],
  }
}

function deferredParseResult(): SourceParseResult {
  return {
    ...failedParseResult("parse_deferred"),
    warnings: [{
      code: "parse_deferred",
      message: "Source file is waiting for the desktop parser job.",
      target: "source.log",
    }],
  }
}

function sourceFile(id: string, parse?: SourceParseResult): SourceFile {
  return {
    id,
    name: `${id}.log`,
    kind: "Gaussian",
    size: 42,
    status: "staged",
    preview: "SCF Done: E(RB3LYP) = -1.0 A.U.",
    parse,
  }
}

function workspaceSnapshot(overrides: Partial<ProjectWorkspaceSnapshot> = {}): ProjectWorkspaceSnapshot {
  const nodes = overrides.nodes ?? []
  const edges = overrides.edges ?? []
  const barriers = overrides.barriers ?? []
  const viewport = overrides.viewport ?? { x: 0, y: 0, zoom: 1 }
  const selectedNodeIds = overrides.selectedNodeIds ?? []
  const selectedEdgeIds = overrides.selectedEdgeIds ?? []
  const selectedBarrierIds = overrides.selectedBarrierIds ?? []
  const canvases = overrides.canvases ?? [{
    id: "canvas-1",
    label: "画布 1",
    nodes,
    edges,
    barriers,
    viewport,
    selectedNodeIds,
    selectedEdgeIds,
    selectedBarrierIds,
  }]
  return {
    files: overrides.files ?? [],
    canvases,
    activeCanvasId: overrides.activeCanvasId ?? canvases[0]?.id ?? "canvas-1",
    nodes,
    edges,
    barriers,
    viewport,
    selectedNodeIds,
    selectedEdgeIds,
    selectedBarrierIds,
    selectedFileId: overrides.selectedFileId ?? null,
    selectedFileIds: overrides.selectedFileIds ?? [],
    lastSelectedFileId: overrides.lastSelectedFileId ?? null,
    energyDisplayOptions: overrides.energyDisplayOptions ?? defaultEnergyDisplayOptions,
    viewMode: overrides.viewMode ?? "canvas",
    inspectorMode: overrides.inspectorMode ?? "inspector",
  }
}

describe("importRegistration", () => {
  it("builds an import plan with staged files, auto nodes, and multi-candidate review entries", () => {
    const single = sourceFile("single", parseResult([candidate({ candidateId: "only", roleHint: "final" })]))
    const multi = sourceFile("multi", parseResult([
      candidate({ candidateId: "path", objectIndex: 0, roleHint: "path-point", label: "Image 1" }),
      candidate({ candidateId: "final", objectIndex: 1, roleHint: "final", label: "Product" }),
    ]))

    const plan = buildImportPlan([single, multi], layout)

    expect(plan.stagedFiles.map((file) => [file.id, file.status, file.kind])).toEqual([
      ["single", "parsed", "Gaussian"],
      ["multi", "parsed", "Gaussian"],
    ])
    expect(plan.autoEntries).toHaveLength(1)
    expect(plan.fallbackNodes).toHaveLength(1)
    expect(plan.fallbackNodes[0]).toMatchObject({
      id: "imported-single-only-test",
      kind: "product",
      sourceFileId: "single",
      sourceCandidateId: "only",
      position: { x: 10, y: 20 },
    })
    expect(plan.reviewEntries.map(candidateReviewKey)).toEqual(["multi:path", "multi:final"])
    expect(defaultCandidateSelection(plan.reviewEntries)).toEqual(["multi:final"])
    expect(candidateReviewStateFromPlan(plan, "review-test")).toMatchObject({
      id: "review-test",
      selectedKeys: ["multi:final"],
      layout,
    })
    expect(candidateReviewStateFromEntries([], layout, "empty")).toBeNull()
  })

  it("pairs gas and solution single-candidate logs into one automatic graph node", () => {
    const gas = sourceFile("bfix-gas", parseResult([candidate({
      candidateId: "gas",
      label: "Bfix6-ts",
      energyGas: -101,
      energySolution: -100.9,
      formula: "C2H4",
      energyTable: {
        egasHartree: -101,
        ggasHartree: -100.9,
        ggas1mHartree: -100.896981,
        gasBasisFunctions: 120,
      },
    })]))
    const sol = {
      ...sourceFile("bfix-sol", parseResult([candidate({
        candidateId: "sol",
        label: "Bfix6-ts-sol",
        energyGas: -101.2,
        energySolution: null,
        formula: "C2H4",
        energyTable: {
          egasHartree: -101.2,
          gasBasisFunctions: 140,
        },
      })])),
      name: "Bfix6-ts-sol.log",
    }
    gas.name = "Bfix6-ts.log"

    const plan = buildImportPlan([gas, sol], layout)

    expect(plan.stagedFiles.map((file) => file.id)).toEqual(["bfix-gas", "bfix-sol"])
    expect(plan.autoEntries).toHaveLength(0)
    expect(plan.fallbackNodes).toHaveLength(1)
    expect(plan.fallbackNodes[0]).toMatchObject({
      id: "imported-bfix-gas-gas-test",
      label: "Bfix6-ts",
      sourceFileId: "bfix-gas",
      energyGas: -101,
      energySolution: -101.2,
      energyTable: {
        egasHartree: -101,
        gasBasisFunctions: 120,
        ggasHartree: -100.9,
        ggas1mHartree: -100.896981,
        esolHartree: -101.2,
        solBasisFunctions: 140,
        gsolHartree: -101.096981,
      },
    })
  })

  it("pairs common solution suffix variants while preserving the gas file as the primary node", () => {
    const gas = { ...sourceFile("ir-gas", parseResult([candidate({ candidateId: "gas", label: "4b+", energyGas: -5208.1 })])), name: "4b+.log" }
    const sol = { ...sourceFile("ir-sol", parseResult([candidate({ candidateId: "sol", label: "4b+_sol", energyGas: -5208.3, energySolution: null })])), name: "4b+_sol.log" }

    const plan = buildImportPlan([sol, gas], layout)

    expect(plan.fallbackNodes).toHaveLength(1)
    expect(plan.fallbackNodes[0]).toMatchObject({
      label: "4b+",
      sourceFileId: "ir-gas",
      energyGas: -5208.1,
      energySolution: -5208.3,
    })
  })

  it("does not pair failed solution logs with parsed gas imports", () => {
    const gas = { ...sourceFile("i1p6-gas", parseResult([candidate({ candidateId: "gas", label: "i1p6", energyGas: -6665.3 })])), name: "i1p6.log" }
    const sol = { ...sourceFile("i1p6-sol", failedParseResult()), name: "i1p6-sol.log", storedPath: "sources/i1p6-sol.log" }

    const plan = buildImportPlan([gas, sol], layout)

    expect(plan.stagedFiles.map((file) => [file.id, file.status, file.parse?.parsed])).toEqual([
      ["i1p6-gas", "parsed", true],
      ["i1p6-sol", "staged", false],
    ])
    expect(plan.fallbackNodes).toHaveLength(1)
    expect(plan.fallbackNodes[0]).toMatchObject({
      label: "i1p6",
      sourceFileId: "i1p6-gas",
      solvent: "SMD",
      energyGas: -6665.3,
      energySolution: -2,
    })
  })

  it("prepares desktop registration payloads without duplicating source files", () => {
    const parsed = parseResult([
      candidate({ candidateId: "a", objectIndex: 4 }),
      candidate({ candidateId: "b", objectIndex: 8 }),
    ])
    const entries: CandidateReviewEntry[] = parsed.candidates.map((item) => ({
      file: sourceFile("shared", parsed),
      parsed,
      candidate: item,
    }))

    expect(importRegistrationFiles(entries)).toHaveLength(1)
    expect(importRegistrationSelections(entries)).toEqual([{ fileId: "shared", objectIndices: [4, 8] }])
  })

  it("derives review state and selected entries for a source file", () => {
    const parsed = parseResult([
      candidate({ candidateId: "image-1", objectIndex: 0, roleHint: "path-point" }),
      candidate({ candidateId: "final", objectIndex: 1, roleHint: "final" }),
    ])
    const review = candidateReviewStateForSourceFile(sourceFile("multi", parsed), layout, "review-file")

    expect(review).toMatchObject({
      id: "review-file",
      selectedKeys: ["multi:final"],
      layout,
    })
    expect(candidateReviewEntriesForMode(review!, "selected").map(candidateReviewKey)).toEqual(["multi:final"])
    expect(candidateReviewEntriesForMode(review!, "all").map(candidateReviewKey)).toEqual(["multi:image-1", "multi:final"])
    expect(toggleCandidateReviewSelection(review, "multi:image-1")?.selectedKeys).toEqual(["multi:final", "multi:image-1"])
    expect(toggleCandidateReviewSelection(review, "multi:final")?.selectedKeys).toEqual([])
    expect(toggleCandidateReviewSelection(null, "multi:final")).toBeNull()
    expect(candidateReviewStateForSourceFile(sourceFile("single", parseResult([candidate()])), layout)).toBeNull()
    expect(candidateReviewStateForSourceFile(sourceFile("raw"), layout)).toBeNull()
  })

  it("builds source selection together with candidate review state", () => {
    const parsed = parseResult([
      candidate({ candidateId: "image-1", objectIndex: 0, roleHint: "path-point" }),
      candidate({ candidateId: "final", objectIndex: 1, roleHint: "final" }),
    ])
    const transition = candidateReviewTransitionForSourceFile(sourceFile("multi", parsed), layout, "review-transition")

    expect(transition?.reviewState).toMatchObject({
      id: "review-transition",
      selectedKeys: ["multi:final"],
      layout,
    })
    expect(transition?.selection).toEqual({
      selectedFileId: "multi",
      selectedFileIds: ["multi"],
      lastSelectedFileId: "multi",
      selectedEdgeIds: [],
      selectedBarrierIds: [],
    })
    expect(candidateReviewTransitionForSourceFile(sourceFile("single", parseResult([candidate()])), layout)).toBeNull()
  })

  it("creates automatic and review registration nodes with desktop fallback behavior", async () => {
    const single = sourceFile("single", parseResult([candidate({ candidateId: "only", roleHint: "final" })]))
    const plan = buildImportPlan([single], layout)

    await expect(automaticImportNodesFromPlan(undefined, plan)).resolves.toEqual(plan.fallbackNodes)

    const desktopRegister = vi.fn(async () => ({
      ok: true as const,
      data: {
        registeredObjects: [{
          id: "desktop-only",
          label: "Desktop Product",
          formula: "C2H4",
          kind: "product" as const,
          method: "M06-2X",
          solvent: "SMD",
          energyGas: -10,
          energySolution: -11,
          energyUnit: "hartree" as const,
          sourceStatus: "parsed" as const,
          sourceFileId: "single",
          sourceFileName: "single.log",
          sourceCandidateId: "only",
          sourceObjectIndex: 0,
          parserId: "ipc",
          parserVersion: "1",
          roleHint: "final",
          charge: 0,
          spinMultiplicity: 1,
        }],
        files: [],
      },
    }))

    const desktopNodes = await automaticImportNodesFromPlan(desktopRegister, plan)

    expect(desktopNodes[0]).toMatchObject({
      id: "imported-desktop-only-test",
      label: "Desktop Product",
      kind: "product",
    })

    const fallbackNodes = await registeredOrFallbackNodesFromEntries(undefined, plan.autoEntries, "selected", layout)
    expect(fallbackNodes[0]).toMatchObject({
      id: "imported-single-only-test",
      sourceFileId: "single",
      sourceCandidateId: "only",
    })
  })

  it("keeps paired fallback nodes when desktop registration handles other files", async () => {
    const gas = { ...sourceFile("pair-gas", parseResult([candidate({ candidateId: "pair-gas", label: "Pair" })])), name: "pair.log" }
    const solution = { ...sourceFile("pair-sol", parseResult([candidate({ candidateId: "pair-sol", label: "Pair solution" })])), name: "pair_sol.log" }
    const single = { ...sourceFile("single", parseResult([candidate({ candidateId: "single", label: "Single" })])), name: "single.log" }
    const plan = buildImportPlan([gas, solution, single], layout)
    const desktopRegister = vi.fn(async () => ({
      ok: true as const,
      data: {
        registeredObjects: [{
          id: "desktop-single",
          label: "Desktop Single",
          formula: "C2H4",
          kind: "product" as const,
          method: "M06-2X",
          solvent: "SMD",
          energyGas: -10,
          energySolution: -11,
          energyUnit: "hartree" as const,
          sourceStatus: "parsed" as const,
          sourceFileId: "single",
          sourceFileName: "single.log",
          sourceCandidateId: "single",
          sourceObjectIndex: 0,
          parserId: "ipc",
          parserVersion: "1",
          roleHint: "final",
          charge: 0,
          spinMultiplicity: 1,
        }],
        files: [],
      },
    }))

    const nodes = await automaticImportNodesFromPlan(desktopRegister, plan)

    expect(nodes).toHaveLength(2)
    expect(nodes.map((node) => node.label)).toEqual(["Pair", "Desktop Single"])
    expect(nodes[0]).toMatchObject({ sourceFileId: "pair-gas", sourceCandidateId: "pair-gas", position: { x: 10, y: 20 } })
    expect(nodes[1]).toMatchObject({ sourceFileId: "single", sourceCandidateId: "single", position: { x: 10, y: 280 } })
  })

  it("selects source files by ids while preserving requested order and ignoring missing ids", () => {
    const files = [sourceFile("a"), sourceFile("b"), sourceFile("c")]

    expect(sourceFilesFromIds(files, ["c", "missing", "a"]).map((file) => file.id)).toEqual(["c", "a"])
  })

  it("maps desktop registered objects to sanitized graph nodes", async () => {
    const registered: RegisteredImportObject = {
      id: "desktop-node",
      label: "Desktop TS",
      formula: "C4H6",
      kind: "transition",
      method: "M06-2X",
      solvent: "SMD",
      energyGas: Number.NaN,
      energySolution: -123.4,
      energyUnit: "hartree",
      sourceStatus: "parsed",
      sourceFileId: "file-1",
      sourceFileName: "file-1.log",
      sourceCandidateId: "cand-1",
      sourceObjectIndex: 3,
      parserId: "ipc",
      parserVersion: "1",
      roleHint: "transition",
      charge: 1,
      spinMultiplicity: 2,
    }
    const parsed = parseResult([candidate()])
    const register = vi.fn(async () => ({
      ok: true as const,
      data: { registeredObjects: [registered], files: [] },
    }))

    const nodes = await desktopRegisteredNodesFromEntries(register, [{
      file: sourceFile("file-1", parsed),
      parsed,
      candidate: candidate(),
    }], "selected", layout)

    expect(register).toHaveBeenCalledWith(expect.objectContaining({ mode: "selected" }))
    expect(nodes?.[0]).toMatchObject({
      id: "imported-desktop-node-test",
      label: "Desktop TS",
      kind: "transition",
      energyGas: null,
      energySolution: -123.4,
      sourceObjectIndex: 3,
      position: { x: 10, y: 20 },
    })
  })

  it("applies an import plan to a target project workspace snapshot", () => {
    const imported = sourceFile("single", parseResult([candidate({ candidateId: "only", roleHint: "final" })]))
    const plan = buildImportPlan([imported], layout)
    const targetSnapshot = workspaceSnapshot({
      files: [sourceFile("existing")],
      nodes: [{
        id: "existing-node",
        label: "Existing",
        formula: "H2",
        kind: "reactant" as const,
        method: "DFT",
        solvent: "none",
        energyGas: null,
        energySolution: null,
        energyUnit: "hartree" as const,
        position: { x: 1, y: 2 },
      }],
      edges: [],
      barriers: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedNodeIds: ["existing-node"],
      selectedEdgeIds: ["edge-old"],
      selectedBarrierIds: ["barrier-old"],
      selectedFileId: "existing",
      selectedFileIds: ["existing"],
      lastSelectedFileId: "existing",
      energyDisplayOptions: defaultEnergyDisplayOptions,
      viewMode: "table" as const,
      inspectorMode: "inspector" as const,
    })

    const next = projectWorkspaceWithImportPlan(targetSnapshot, [imported], plan, plan.fallbackNodes)

    expect(next.files.map((file) => file.id)).toEqual(["single", "existing"])
    expect(next.nodes.map((node) => node.id)).toEqual(["existing-node", "imported-single-only-test"])
    expect(next.selectedNodeIds).toEqual(["imported-single-only-test"])
    expect(next.selectedEdgeIds).toEqual([])
    expect(next.selectedBarrierIds).toEqual([])
    expect(next.selectedFileId).toBe("single")
    expect(next.selectedFileIds).toEqual(["single"])
    expect(next.lastSelectedFileId).toBe("single")
    expect(next.inspectorMode).toBe("inspector")
    expect(next.viewMode).toBe("canvas")

    next.nodes[0].position.x = 999
    expect(targetSnapshot.nodes[0].position.x).toBe(1)
  })

  it("keeps deferred canvas imports on their original canvas", () => {
    const imported = sourceFile("deferred-canvas", parseResult([
      candidate({ candidateId: "only", roleHint: "final" }),
    ]))
    const plan = buildImportPlan([imported], layout)
    const canvasOne = workspaceSnapshot({
      nodes: [],
      selectedNodeIds: [],
    }).canvases[0]
    const canvasTwo = {
      ...canvasOne,
      id: "canvas-2",
      label: "画布 2",
    }
    const targetSnapshot = workspaceSnapshot({
      canvases: [canvasOne, canvasTwo],
      activeCanvasId: "canvas-2",
      nodes: canvasTwo.nodes,
      edges: canvasTwo.edges,
      barriers: canvasTwo.barriers,
      selectedNodeIds: canvasTwo.selectedNodeIds,
      selectedEdgeIds: canvasTwo.selectedEdgeIds,
      selectedBarrierIds: canvasTwo.selectedBarrierIds,
    })

    const next = projectWorkspaceWithImportPlan(
      targetSnapshot,
      [imported],
      plan,
      plan.fallbackNodes,
      { targetCanvasId: "canvas-1" },
    )

    expect(next.activeCanvasId).toBe("canvas-2")
    expect(next.nodes).toEqual([])
    expect(next.canvases.find((canvas) => canvas.id === "canvas-1")?.nodes.map((node) => node.id))
      .toEqual(["imported-deferred-canvas-only-test"])
    expect(next.canvases.find((canvas) => canvas.id === "canvas-2")?.nodes).toEqual([])
  })

  it("does not redirect deferred nodes after their target canvas is deleted", () => {
    const imported = sourceFile("deleted-canvas", parseResult([
      candidate({ candidateId: "only", roleHint: "final" }),
    ]))
    const plan = buildImportPlan([imported], layout)
    const targetSnapshot = workspaceSnapshot()

    const next = projectWorkspaceWithImportPlan(
      targetSnapshot,
      [imported],
      plan,
      plan.fallbackNodes,
      { targetCanvasId: "deleted-canvas" },
    )

    expect(next.files.map((file) => file.id)).toEqual(["deleted-canvas"])
    expect(next.nodes).toEqual([])
  })

  it("rebases delayed registration onto the latest canvas state", async () => {
    const imported = sourceFile("delayed-canvas", parseResult([
      candidate({ candidateId: "only", roleHint: "final" }),
    ]))
    let resolveRegistration!: (value: {
      ok: true
      data: {
        registeredObjects: RegisteredImportObject[]
        files: []
      }
    }) => void
    const registration = new Promise<{
      ok: true
      data: {
        registeredObjects: RegisteredImportObject[]
        files: []
      }
    }>((resolve) => {
      resolveRegistration = resolve
    })
    const canvasOne = workspaceSnapshot({ nodes: [], selectedNodeIds: [] }).canvases[0]
    const canvasTwo = {
      ...canvasOne,
      id: "canvas-2",
      label: "Canvas 2",
      nodes: [{
        id: "canvas-2-edit",
        label: "Canvas 2 edit",
        formula: "H2",
        kind: "intermediate" as const,
        method: "DFT",
        solvent: "none",
        energyGas: null,
        energySolution: null,
        energyUnit: "hartree" as const,
        position: { x: 40, y: 50 },
      }],
    }
    const initialSnapshot = workspaceSnapshot({
      canvases: [canvasOne, { ...canvasTwo, nodes: [] }],
      activeCanvasId: "canvas-1",
      nodes: canvasOne.nodes,
    })
    const preparing = prepareProjectWorkspaceImport({
      targetSnapshot: initialSnapshot,
      importedFiles: [imported],
      layout,
      options: {
        targetCanvasId: "canvas-1",
        registerImportCandidates: () => registration,
      },
    })
    const latestSnapshot = workspaceSnapshot({
      canvases: [canvasOne, canvasTwo],
      activeCanvasId: "canvas-2",
      nodes: canvasTwo.nodes,
      selectedNodeIds: [],
    })

    resolveRegistration({
      ok: true,
      data: {
        registeredObjects: [{
          id: "registered-delayed",
          label: "Delayed product",
          formula: "C2H4",
          kind: "product",
          method: "M06-2X",
          solvent: "SMD",
          energyGas: -10,
          energySolution: -11,
          energyUnit: "hartree",
          sourceStatus: "parsed",
          sourceFileId: imported.id,
          sourceFileName: imported.name,
          sourceCandidateId: "only",
          sourceObjectIndex: 0,
          parserId: "ipc",
          parserVersion: "1",
          roleHint: "final",
          charge: 0,
          spinMultiplicity: 1,
        }],
        files: [],
      },
    })
    const prepared = await preparing
    expect(prepared).not.toBeNull()

    const rebased = rebasePreparedProjectWorkspaceImport(
      prepared!,
      latestSnapshot,
      { targetCanvasId: "canvas-1" },
    )

    expect(rebased.snapshot.activeCanvasId).toBe("canvas-2")
    expect(rebased.snapshot.nodes.map((node) => node.id)).toEqual(["canvas-2-edit"])
    expect(rebased.snapshot.canvases.find((canvas) => canvas.id === "canvas-1")?.nodes.map((node) => node.id))
      .toEqual(["imported-registered-delayed-test"])
  })

  it("refreshes existing canvas nodes when a matching solution log is imported later", () => {
    const gas = {
      ...sourceFile("late-pair-gas", parseResult([candidate({
        candidateId: "gas",
        label: "late-pair-ts",
        energyGas: -101,
        energySolution: -100.9,
        energyTable: {
          egasHartree: -101,
          ggasHartree: -100.9,
          ggas1mHartree: -100.896981,
          gasBasisFunctions: 120,
        },
      })])),
      name: "late-pair-ts.log",
      status: "parsed" as const,
    }
    const sol = {
      ...sourceFile("late-pair-sol", parseResult([candidate({
        candidateId: "sol",
        label: "late-pair-ts-sol",
        energyGas: -101.2,
        energySolution: null,
        energyTable: {
          egasHartree: -101.2,
          gasBasisFunctions: 140,
        },
      })])),
      name: "late-pair-ts-sol.log",
    }
    const existingNode = {
      id: "existing-gas-node",
      label: "User label",
      formula: "C2H4",
      kind: "transition" as const,
      method: "wB97X-D",
      solvent: "unassigned",
      energyGas: -101,
      energySolution: -100.9,
      energyUnit: "hartree" as const,
      energyTable: gas.parse?.candidates[0]?.energyTable,
      sourceStatus: "parsed" as const,
      sourceFileId: gas.id,
      position: { x: 41, y: 73 },
      size: { width: 240, height: 210 },
      manualStructureMolfile: "manual molfile",
    }
    const inactiveCanvasNode = {
      ...existingNode,
      id: "inactive-gas-node",
      position: { x: 9, y: 11 },
    }
    const edge = { id: "edge-existing", sourceId: "reference", targetId: existingNode.id, label: "path" }
    const targetSnapshot = workspaceSnapshot({
      files: [gas],
      nodes: [existingNode],
      edges: [edge],
      canvases: [
        {
          id: "canvas-1",
          label: "Active",
          nodes: [existingNode],
          edges: [edge],
          barriers: [],
          viewport: { x: 0, y: 0, zoom: 1 },
          selectedNodeIds: [existingNode.id],
          selectedEdgeIds: [],
          selectedBarrierIds: [],
        },
        {
          id: "canvas-2",
          label: "Inactive",
          nodes: [inactiveCanvasNode],
          edges: [],
          barriers: [],
          viewport: { x: 5, y: 6, zoom: 0.8 },
          selectedNodeIds: [],
          selectedEdgeIds: [],
          selectedBarrierIds: [],
        },
      ],
      activeCanvasId: "canvas-1",
    })
    const plan = buildImportPlan([sol], layout)

    const next = projectWorkspaceWithImportPlan(targetSnapshot, [sol], plan, [], { fileMode: "update" })

    expect(next.nodes).toHaveLength(1)
    expect(next.nodes[0]).toMatchObject({
      id: existingNode.id,
      label: "User label",
      position: { x: 41, y: 73 },
      size: { width: 240, height: 210 },
      manualStructureMolfile: "manual molfile",
      energyGas: -101,
      energySolution: -101.2,
      solvent: "SMD",
      energyTable: {
        egasHartree: -101,
        ggasHartree: -100.9,
        ggas1mHartree: -100.896981,
        gasBasisFunctions: 120,
        esolHartree: -101.2,
        solBasisFunctions: 140,
        gsolHartree: -101.096981,
      },
    })
    expect(next.edges).toEqual([edge])
    expect(next.canvases[1].nodes[0]).toMatchObject({
      id: inactiveCanvasNode.id,
      position: { x: 9, y: 11 },
      energySolution: -101.2,
      energyTable: { gsolHartree: -101.096981 },
    })
  })

  it("does not refresh existing nodes from an unparsed solution log", () => {
    const gas = {
      ...sourceFile("failed-pair-gas", parseResult([candidate({ candidateId: "gas", energyGas: -80, energySolution: -79.9 })])),
      name: "failed-pair.log",
      status: "parsed" as const,
    }
    const failedSol = {
      ...sourceFile("failed-pair-sol", failedParseResult()),
      name: "failed-pair-sol.log",
    }
    const existingNode = {
      id: "failed-pair-node",
      label: "Failed pair",
      formula: "C2H4",
      kind: "intermediate" as const,
      method: "DFT",
      solvent: "unassigned",
      energyGas: -80,
      energySolution: -79.9,
      energyUnit: "hartree" as const,
      sourceFileId: gas.id,
      position: { x: 1, y: 2 },
    }
    const targetSnapshot = workspaceSnapshot({ files: [gas], nodes: [existingNode] })
    const plan = buildImportPlan([failedSol], layout)

    const next = projectWorkspaceWithImportPlan(targetSnapshot, [failedSol], plan, [], { fileMode: "update" })

    expect(next.nodes[0]).toEqual(existingNode)
  })

  it("repairs stale paired node energy when an existing project snapshot is reopened", () => {
    const gas = {
      ...sourceFile("saved-pair-gas", parseResult([candidate({
        candidateId: "gas",
        energyGas: -60,
        energySolution: -59.8,
        energyTable: {
          egasHartree: -60,
          ggas1mHartree: -59.8,
        },
      })])),
      name: "saved-pair.log",
      status: "parsed" as const,
    }
    const sol = {
      ...sourceFile("saved-pair-sol", parseResult([candidate({
        candidateId: "sol",
        energyGas: -60.25,
        energySolution: null,
        energyTable: { egasHartree: -60.25 },
      })])),
      name: "saved-pair-sol.log",
      status: "parsed" as const,
    }
    const staleNode = {
      id: "saved-stale-node",
      label: "Saved node",
      formula: "C2H4",
      kind: "intermediate" as const,
      method: "DFT",
      solvent: "unassigned",
      energyGas: -60,
      energySolution: -59.8,
      energyUnit: "hartree" as const,
      energyTable: { egasHartree: -60, ggas1mHartree: -59.8 },
      sourceFileId: gas.id,
      position: { x: 12, y: 34 },
    }
    const savedSnapshot = workspaceSnapshot({ files: [gas, sol], nodes: [staleNode] })

    const reopened = reconcileProjectWorkspaceSourceNodes(savedSnapshot)

    expect(reopened.nodes[0]).toMatchObject({
      id: staleNode.id,
      position: staleNode.position,
      energySolution: -60.25,
      energyTable: {
        egasHartree: -60,
        esolHartree: -60.25,
        gsolHartree: -60.05,
      },
    })
  })

  it("replaces a failed same-name staged placeholder when a source is reimported", () => {
    const staleSol = {
      ...sourceFile("old-sol", failedParseResult()),
      name: "i1fix8p6-tsf-sol.log",
    }
    const gas = {
      ...sourceFile("gas", parseResult([candidate({ label: "i1fix8p6-tsf" })])),
      name: "i1fix8p6-tsf.log",
      status: "parsed" as const,
      storedPath: "sources/i1fix8p6-tsf.log",
    }
    const freshSol = {
      ...sourceFile("fresh-sol", parseResult([candidate({ label: "i1fix8p6-tsf-sol" })])),
      name: "i1fix8p6-tsf-sol.log",
      storedPath: "sources/i1fix8p6-tsf-sol.log",
      checksum: `sha256:${"1".repeat(64)}`,
    }
    const plan = buildImportPlan([freshSol], layout)

    const next = sourceFilesWithImportPlan([staleSol, gas], plan, "prepend")

    expect(next.map((file) => [file.id, file.name, file.storedPath])).toEqual([
      ["fresh-sol", "i1fix8p6-tsf-sol.log", "sources/i1fix8p6-tsf-sol.log"],
      ["gas", "i1fix8p6-tsf.log", "sources/i1fix8p6-tsf.log"],
    ])
  })

  it("replaces a resolved same-name source in place and refreshes its existing node", () => {
    const oldSource = {
      ...sourceFile("stable-source", parseResult([candidate({
        candidateId: "structure-1",
        formula: "C2H4",
        method: "old-method",
        energyGas: -10,
        energySolution: -9.8,
      })])),
      name: "opt.log",
      status: "parsed" as const,
      storedPath: "sources/opt.log",
      checksum: `sha256:${"1".repeat(64)}`,
    }
    const pendingSource = {
      ...sourceFile("incoming-operation", deferredParseResult()),
      name: "opt.log",
    }
    const refreshedSource = {
      ...sourceFile("stable-source", parseResult([candidate({
        candidateId: "structure-1",
        formula: "C3H6",
        method: "new-method",
        energyGas: -20,
        energySolution: -19.7,
        charge: 1,
        spinMultiplicity: 2,
        energyTable: { egasHartree: -20, gsolHartree: -19.7 },
      })])),
      name: "opt.log",
      size: 84,
      status: "parsed" as const,
      storedPath: "sources/opt.log",
      checksum: `sha256:${"2".repeat(64)}`,
    }
    const existingNode = {
      id: "existing-node",
      label: "User label",
      formula: "C2H4",
      kind: "intermediate" as const,
      method: "old-method",
      solvent: "SMD",
      energyGas: -10,
      energySolution: -9.8,
      energyUnit: "hartree" as const,
      sourceStatus: "parsed" as const,
      sourceFileId: oldSource.id,
      sourceCandidateId: "structure-1",
      sourceObjectIndex: 0,
      charge: 0,
      spinMultiplicity: 1,
      position: { x: 120, y: 80 },
      size: { width: 300, height: 220 },
      manualStructureMolfile: "manual molfile",
    }
    const targetSnapshot = workspaceSnapshot({
      files: [pendingSource, oldSource],
      nodes: [existingNode],
    })
    const plan = buildImportPlan([refreshedSource], layout)
    const duplicateAutoNode = {
      ...existingNode,
      id: "duplicate-node",
      sourceFileId: "stable-source",
    }

    const next = projectWorkspaceWithImportPlan(
      targetSnapshot,
      [refreshedSource],
      plan,
      [duplicateAutoNode],
      { fileMode: "update" },
    )

    expect(next.files).toHaveLength(1)
    expect(next.nodes).toHaveLength(1)
    expect(next.files[0]).toMatchObject({
      id: "stable-source",
      name: "opt.log",
      size: 84,
      storedPath: "sources/opt.log",
      checksum: `sha256:${"2".repeat(64)}`,
    })
    expect(next.selectedFileId).toBe("stable-source")
    expect(next.nodes[0]).toMatchObject({
      id: "existing-node",
      label: "User label",
      formula: "C3H6",
      method: "new-method",
      energyGas: -20,
      energySolution: -19.7,
      energyTable: { egasHartree: -20, gsolHartree: -19.7 },
      sourceFileId: "stable-source",
      charge: 1,
      spinMultiplicity: 2,
      position: { x: 120, y: 80 },
      size: { width: 300, height: 220 },
      manualStructureMolfile: "manual molfile",
    })
  })

  it("still creates an auto node when the replaced source was not on the target canvas", () => {
    const oldSource = {
      ...sourceFile("stable-source", parseResult([candidate({ candidateId: "structure-1" })])),
      name: "opt.log",
      status: "parsed" as const,
      storedPath: "sources/opt.log",
    }
    const pendingSource = {
      ...sourceFile("incoming-operation", deferredParseResult()),
      name: "opt.log",
    }
    const refreshedSource = {
      ...sourceFile("stable-source", parseResult([candidate({ candidateId: "structure-1", energyGas: -22 })])),
      name: "opt.log",
      status: "parsed" as const,
      storedPath: "sources/opt.log",
    }
    const autoNode = nodeFromCandidate(refreshedSource, refreshedSource.parse!, refreshedSource.parse!.candidates![0], 0, layout)
    const targetSnapshot = workspaceSnapshot({ files: [pendingSource, oldSource], nodes: [] })
    const plan = buildImportPlan([refreshedSource], layout)

    const next = projectWorkspaceWithImportPlan(
      targetSnapshot,
      [refreshedSource],
      plan,
      [autoNode],
      { fileMode: "update" },
    )

    expect(next.nodes).toHaveLength(1)
    expect(next.nodes[0]).toMatchObject({
      id: autoNode.id,
      sourceFileId: "stable-source",
      energyGas: -22,
    })
  })

  it("removes a failed same-name placeholder when a deferred desktop import finishes", () => {
    const pendingSol = {
      ...sourceFile("fresh-sol", deferredParseResult()),
      name: "i1fix8p6-tsf-sol.log",
    }
    const staleSol = {
      ...sourceFile("old-sol", failedParseResult()),
      name: "i1fix8p6-tsf-sol.log",
    }
    const gas = {
      ...sourceFile("gas", parseResult([candidate({ label: "i1fix8p6-tsf" })])),
      name: "i1fix8p6-tsf.log",
      status: "parsed" as const,
      storedPath: "sources/i1fix8p6-tsf.log",
    }
    const parsedSol = {
      ...sourceFile("fresh-sol", parseResult([candidate({ label: "i1fix8p6-tsf-sol" })])),
      name: "i1fix8p6-tsf-sol.log",
      storedPath: "sources/i1fix8p6-tsf-sol.log",
      checksum: `sha256:${"2".repeat(64)}`,
    }
    const plan = buildImportPlan([parsedSol], layout)

    const next = sourceFilesWithImportPlan([pendingSol, staleSol, gas], plan, "update")

    expect(next.map((file) => [file.id, file.name, file.status, file.storedPath])).toEqual([
      ["fresh-sol", "i1fix8p6-tsf-sol.log", "parsed", "sources/i1fix8p6-tsf-sol.log"],
      ["gas", "i1fix8p6-tsf.log", "parsed", "sources/i1fix8p6-tsf.log"],
    ])
  })

  it("replaces older same-name pending placeholders when a duplicate desktop import resolves", () => {
    const olderPendingSol = {
      ...sourceFile("older-sol", deferredParseResult()),
      name: "7a-1fix-tsf-sol.log",
    }
    const currentPendingSol = {
      ...sourceFile("fresh-sol", deferredParseResult()),
      name: "7a-1fix-tsf-sol.log",
    }
    const gas = {
      ...sourceFile("gas", parseResult([candidate({ label: "7a-1fix-tsf" })])),
      name: "7a-1fix-tsf.log",
      status: "parsed" as const,
      storedPath: "sources/7a-1fix-tsf.log",
    }
    const parsedSol = {
      ...sourceFile("fresh-sol", parseResult([candidate({ label: "7a-1fix-tsf-sol" })])),
      name: "7a-1fix-tsf-sol.log",
      storedPath: "sources/7a-1fix-tsf-sol.log",
      checksum: `sha256:${"3".repeat(64)}`,
    }
    const plan = buildImportPlan([parsedSol], layout)

    const next = sourceFilesWithImportPlan([olderPendingSol, currentPendingSol, gas], plan, "update")

    expect(next.map((file) => [file.id, file.name, file.status, file.storedPath])).toEqual([
      ["fresh-sol", "7a-1fix-tsf-sol.log", "parsed", "sources/7a-1fix-tsf-sol.log"],
      ["gas", "7a-1fix-tsf.log", "parsed", "sources/7a-1fix-tsf.log"],
    ])
  })

  it("replaces a deferred placeholder even when it keeps the project stored path", () => {
    const pendingSol = {
      ...sourceFile("incoming-sol", deferredParseResult()),
      name: "s-s-i8-fix-t-tsr-radNi_sol.log",
      storedPath: "sources/s-s-i8-fix-t-tsr-radni_sol.log",
    }
    const existingSol = {
      ...sourceFile("stable-sol", parseResult([candidate({ label: "old-sol", energyGas: -10 })])),
      name: "s-s-i8-fix-t-tsr-radNi_sol.log",
      status: "parsed" as const,
      storedPath: "sources/s-s-i8-fix-t-tsr-radni_sol.log",
    }
    const refreshedSol = {
      ...sourceFile("stable-sol", parseResult([candidate({ label: "new-sol", energyGas: -20 })])),
      name: "s-s-i8-fix-t-tsr-radNi_sol.log",
      status: "parsed" as const,
      storedPath: "sources/s-s-i8-fix-t-tsr-radni_sol.log",
    }
    const plan = buildImportPlan([refreshedSol], layout)

    expect(sourceFilesWithImportPlan([pendingSol, existingSol], plan, "update").map((file) => file.id)).toEqual(["stable-sol"])
  })

  it("collapses resolved same-name source copies when the stable record is refreshed", () => {
    const stableSol = {
      ...sourceFile("stable-sol", parseResult([candidate({ label: "new-sol", energyGas: -20 })])),
      name: "s-s-i8-fix-t-tsr-radNi_sol.log",
      status: "parsed" as const,
      storedPath: "sources/s-s-i8-fix-t-tsr-radni_sol.log",
    }
    const duplicateSol = {
      ...sourceFile("duplicate-sol", parseResult([candidate({ label: "old-sol", energyGas: -10 })])),
      name: "s-s-i8-fix-t-tsr-radNi_sol.log",
      status: "parsed" as const,
      storedPath: "sources/s-s-i8-fix-t-tsr-radni_sol-2.log",
    }
    const plan = buildImportPlan([stableSol], layout)
    const next = projectWorkspaceWithImportPlan(
      workspaceSnapshot({
        files: [stableSol, duplicateSol],
        nodes: [{
          id: "duplicate-node",
          label: "Duplicate",
          formula: "C2H4",
          kind: "intermediate" as const,
          method: "DFT",
          solvent: "SMD",
          energyGas: -10,
          energySolution: null,
          energyUnit: "hartree" as const,
          sourceStatus: "parsed" as const,
          sourceFileId: "duplicate-sol",
          position: { x: 1, y: 2 },
        }],
      }),
      [stableSol],
      plan,
      [],
      { fileMode: "update" },
    )

    expect(next.files.map((file) => file.id)).toEqual(["stable-sol"])
    expect(next.nodes[0]).toMatchObject({ sourceFileId: "stable-sol" })
  })

  it("ignores stale same-name desktop parse completions after a duplicate import already resolved", () => {
    const parsedSol = {
      ...sourceFile("fresh-sol", parseResult([candidate({ label: "7a-1fix-tsf-sol" })])),
      name: "7a-1fix-tsf-sol.log",
      status: "parsed" as const,
      storedPath: "sources/7a-1fix-tsf-sol.log",
    }
    const gas = {
      ...sourceFile("gas", parseResult([candidate({ label: "7a-1fix-tsf" })])),
      name: "7a-1fix-tsf.log",
      status: "parsed" as const,
      storedPath: "sources/7a-1fix-tsf.log",
    }
    const staleParsedSol = {
      ...sourceFile("older-sol", parseResult([candidate({ label: "7a-1fix-tsf-sol" })])),
      name: "7a-1fix-tsf-sol.log",
      storedPath: "sources/7a-1fix-tsf-sol-2.log",
      checksum: `sha256:${"4".repeat(64)}`,
    }
    const plan = buildImportPlan([staleParsedSol], layout)

    const next = sourceFilesWithImportPlan([parsedSol, gas], plan, "update")

    expect(next.map((file) => [file.id, file.name, file.status, file.storedPath])).toEqual([
      ["fresh-sol", "7a-1fix-tsf-sol.log", "parsed", "sources/7a-1fix-tsf-sol.log"],
      ["gas", "7a-1fix-tsf.log", "parsed", "sources/7a-1fix-tsf.log"],
    ])
  })

  it("applies import plans with update file mode while preserving requested view mode", () => {
    const imported = sourceFile("existing", parseResult([candidate({ candidateId: "only", roleHint: "final" })]))
    const plan = buildImportPlan([imported], layout)
    const targetSnapshot = workspaceSnapshot({
      files: [{ ...sourceFile("existing"), preview: "old preview" }, sourceFile("other")],
      nodes: [],
      edges: [],
      barriers: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedNodeIds: ["old-node"],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
      selectedFileId: "other",
      selectedFileIds: ["other"],
      lastSelectedFileId: "other",
      energyDisplayOptions: defaultEnergyDisplayOptions,
      viewMode: "table" as const,
      inspectorMode: "inspector" as const,
    })

    expect(sourceFilesWithImportPlan(targetSnapshot.files, plan, "update").map((file) => [file.id, file.preview])).toEqual([
      ["existing", "SCF Done: E(RB3LYP) = -1.0 A.U."],
      ["other", "SCF Done: E(RB3LYP) = -1.0 A.U."],
    ])

    const next = projectWorkspaceWithImportPlan(targetSnapshot, [imported], plan, [], {
      fileMode: "update",
      viewMode: targetSnapshot.viewMode,
    })

    expect(next.files.map((file) => file.id)).toEqual(["existing", "other"])
    expect(next.nodes).toEqual([])
    expect(next.selectedNodeIds).toEqual([])
    expect(next.selectedFileId).toBe("existing")
    expect(next.viewMode).toBe("table")
    expect(next.inspectorMode).toBe("inspector")
  })

  it("prepares an import plan, auto nodes, review state, and workspace snapshot together", async () => {
    const single = sourceFile("single", parseResult([candidate({ candidateId: "only", roleHint: "final" })]))
    const multi = sourceFile("multi", parseResult([
      candidate({ candidateId: "image", objectIndex: 0, roleHint: "path-point" }),
      candidate({ candidateId: "final", objectIndex: 1, roleHint: "final" }),
    ]))
    const targetSnapshot = workspaceSnapshot({
      files: [sourceFile("existing")],
      nodes: [],
      edges: [],
      barriers: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedNodeIds: [],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
      selectedFileId: null,
      selectedFileIds: [],
      lastSelectedFileId: null,
      energyDisplayOptions: defaultEnergyDisplayOptions,
      viewMode: "table" as const,
      inspectorMode: "inspector" as const,
    })

    const prepared = await prepareProjectWorkspaceImport({
      targetSnapshot,
      importedFiles: [single, multi],
      layout,
      options: { viewMode: targetSnapshot.viewMode },
    })

    expect(prepared?.autoNodes.map((node) => node.id)).toEqual(["imported-single-only-test"])
    expect(prepared?.reviewState?.selectedKeys).toEqual(["multi:final"])
    expect(prepared?.snapshot.files.map((file) => file.id)).toEqual(["single", "multi", "existing"])
    expect(prepared?.snapshot.nodes.map((node) => node.id)).toEqual(["imported-single-only-test"])
    expect(prepared?.snapshot.selectedNodeIds).toEqual(["imported-single-only-test"])
    expect(prepared?.snapshot.selectedFileId).toBe("single")
    expect(prepared?.snapshot.viewMode).toBe("table")

    expect(prepared).not.toBeNull()
    const transition = projectWorkspaceImportApplyTransition(prepared!)

    expect(transition.snapshot).toBe(prepared!.snapshot)
    expect(transition.reviewState).toBe(prepared!.reviewState)
    expect(transition.shouldPushEditHistory).toBe(true)
    expect(transition.keyboardEdgeSourceId).toBeNull()

    await expect(prepareProjectWorkspaceImport({
      targetSnapshot,
      importedFiles: [],
      layout,
    })).resolves.toBeNull()
  })

  it("can stage imported source files without auto-placing nodes on the canvas", async () => {
    const single = sourceFile("single", parseResult([candidate({ candidateId: "only", roleHint: "final" })]))
    const multi = sourceFile("multi", parseResult([
      candidate({ candidateId: "image", objectIndex: 0, roleHint: "path-point" }),
      candidate({ candidateId: "final", objectIndex: 1, roleHint: "final" }),
    ]))
    const targetSnapshot = workspaceSnapshot({
      files: [sourceFile("existing")],
      nodes: [{
        id: "existing-node",
        label: "Existing",
        formula: "H2",
        kind: "reactant" as const,
        method: "DFT",
        solvent: "none",
        energyGas: null,
        energySolution: null,
        energyUnit: "hartree" as const,
        position: { x: 1, y: 2 },
      }],
      selectedNodeIds: ["existing-node"],
      selectedFileId: "existing",
      selectedFileIds: ["existing"],
      lastSelectedFileId: "existing",
      viewMode: "canvas" as const,
    })

    const prepared = await prepareProjectWorkspaceImport({
      targetSnapshot,
      importedFiles: [single, multi],
      layout,
      options: { autoRegister: false, viewMode: targetSnapshot.viewMode },
    })

    expect(prepared).not.toBeNull()
    expect(prepared?.autoNodes).toEqual([])
    expect(prepared?.reviewState).toBeNull()
    expect(prepared?.snapshot.files.map((file) => file.id)).toEqual(["single", "multi", "existing"])
    expect(prepared?.snapshot.nodes.map((node) => node.id)).toEqual(["existing-node"])
    expect(prepared?.snapshot.selectedNodeIds).toEqual([])
    expect(prepared?.snapshot.selectedFileId).toBe("single")
    expect(prepared?.snapshot.viewMode).toBe("canvas")

    const transition = projectWorkspaceImportApplyTransition(prepared!)
    expect(transition.shouldPushEditHistory).toBe(false)
    expect(transition.reviewState).toBeNull()
  })

  it("applies registered candidate-review nodes to a workspace snapshot", () => {
    const targetSnapshot = workspaceSnapshot({
      files: [sourceFile("file-1")],
      nodes: [{
        id: "existing-node",
        label: "Existing",
        formula: "H2",
        kind: "reactant" as const,
        method: "DFT",
        solvent: "none",
        energyGas: null,
        energySolution: null,
        energyUnit: "hartree" as const,
        position: { x: 1, y: 2 },
      }],
      edges: [{ id: "edge-old", sourceId: "a", targetId: "b", label: "old" }],
      barriers: [{ id: "barrier-old", sourceId: "a", targetId: "b", label: "old" }],
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedNodeIds: ["existing-node"],
      selectedEdgeIds: ["edge-old"],
      selectedBarrierIds: ["barrier-old"],
      selectedFileId: "file-1",
      selectedFileIds: ["file-1"],
      lastSelectedFileId: "file-1",
      energyDisplayOptions: defaultEnergyDisplayOptions,
      viewMode: "table" as const,
      inspectorMode: "inspector" as const,
    })
    const createdNodes = [{
      id: "registered-node",
      label: "Registered",
      formula: "C2H4",
      kind: "product" as const,
      method: "DFT",
      solvent: "SMD",
      energyGas: -1,
      energySolution: -2,
      energyUnit: "hartree" as const,
      sourceFileId: "file-1",
      position: { x: 10, y: 20 },
    }]

    const next = projectWorkspaceWithRegisteredImportNodes(targetSnapshot, createdNodes)

    expect(next.nodes.map((node) => node.id)).toEqual(["existing-node", "registered-node"])
    expect(next.selectedNodeIds).toEqual(["registered-node"])
    expect(next.selectedEdgeIds).toEqual([])
    expect(next.selectedBarrierIds).toEqual([])
    expect(next.selectedFileId).toBe("file-1")
    expect(next.selectedFileIds).toEqual(["file-1"])
    expect(next.lastSelectedFileId).toBe("file-1")
    expect(next.inspectorMode).toBe("inspector")
    expect(next.viewMode).toBe("table")

    next.nodes[0].position.x = 999
    expect(targetSnapshot.nodes[0].position.x).toBe(1)

    const noNodes = projectWorkspaceWithRegisteredImportNodes(targetSnapshot, [])
    expect(noNodes.selectedNodeIds).toEqual([])
    expect(noNodes.selectedFileId).toBeNull()
    expect(noNodes.inspectorMode).toBe("inspector")

    const transition = candidateReviewRegistrationApplyTransition(targetSnapshot, createdNodes)
    expect(transition.snapshot.nodes.map((node) => node.id)).toEqual(["existing-node", "registered-node"])
    expect(transition.snapshot.selectedNodeIds).toEqual(["registered-node"])
    expect(transition.shouldPushEditHistory).toBe(true)
    expect(transition.keyboardEdgeSourceId).toBeNull()
    expect(transition.candidateReview).toBeNull()
  })

  it("resolves pending import project target and clears the pending state", () => {
    expect(pendingImportProjectTransition("active", null)).toEqual({
      projectId: "active",
      pendingImportProjectId: null,
    })
    expect(pendingImportProjectTransition("active", "target")).toEqual({
      projectId: "target",
      pendingImportProjectId: null,
    })
  })

  it("routes the import picker through browser input or desktop bridge", () => {
    expect(importPickerTransition("target", false)).toEqual({
      projectId: "target",
      pendingImportProjectId: "target",
      shouldImportDesktop: false,
      shouldOpenBrowserPicker: true,
    })
    expect(importPickerTransition("target", true)).toEqual({
      projectId: "target",
      pendingImportProjectId: null,
      shouldImportDesktop: true,
      shouldOpenBrowserPicker: false,
    })
  })

  it("plans raw file drop imports for external files and existing source files", () => {
    vi.spyOn(Date, "now").mockReturnValue(77)
    const existing = [sourceFile("a"), sourceFile("b")]

    expect(canvasRawFileDropImportTransition({
      kind: "project-files",
      fileIds: ["b", "missing"],
      position: { x: 10.2, y: 20.8 },
    }, existing)).toMatchObject({
      kind: "project-files",
      files: [existing[1]],
      options: {
        fileMode: "update",
        layout: { origin: { x: 10, y: 21 }, columns: 1, idSuffix: "drop-10-21-77" },
      },
    })
    expect(canvasRawFileDropImportTransition({
      kind: "project-files",
      fileIds: ["missing"],
      position: { x: 0, y: 0 },
    }, existing)).toBeNull()
    expect(canvasRawFileDropImportTransition({
      kind: "external-files",
      files: [new File(["abc"], "ts.log")],
      position: { x: 2, y: 3 },
    }, existing)).toMatchObject({
      kind: "external-files",
      idPrefix: "file-drop",
      options: { layout: { origin: { x: 2, y: 3 }, columns: 1, idSuffix: "drop-2-3-77" } },
    })
  })

  it("converts browser and desktop files into staged import sources", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234)
    const browserFiles = await browserImportSourceFilesFromFiles([new File(["abc"], "orca.out")])
    const noPreviewFile = new File(["should not be read"], "queued.log")
    const textSpy = vi.spyOn(noPreviewFile, "text")
    const noPreviewFiles = browserImportSourceFilesFromFiles([noPreviewFile], "file")
    const desktopFiles = desktopImportSourceFilesFromFiles([{ name: "scan.xyz", size: 3, preview: "2\nenergy=-1\nH 0 0 0\nH 0 0 1" }])

    expect(browserFiles[0]).toMatchObject({ id: "file-1234-0", kind: "ORCA", preview: "" })
    expect(noPreviewFiles[0]).toMatchObject({ id: "file-1234-0", kind: "Gaussian", preview: "" })
    expect(textSpy).not.toHaveBeenCalled()
    expect(desktopFiles[0]).toMatchObject({ id: "desktop-file-1234-0", kind: "XYZ", status: "staged" })
    expect(desktopImportFilesTransition({ canceled: true, files: [] })).toBeNull()
    expect(desktopImportFilesTransition({ canceled: false, files: [{ name: "ts.log", size: 3, preview: "SCF Done" }] })?.importedFiles[0]).toMatchObject({
      id: "desktop-file-1234-0",
      kind: "Gaussian",
      preview: "SCF Done",
    })
  })

  it("stages large browser files without reading or sampling them", async () => {
    const largeFile = new File([
      "Gaussian header\n".padEnd(64 * 1024, "."),
      "middle".padEnd(520 * 1024, "x"),
      "\nSCF Done: E(RB3LYP) = -76.431 A.U.\n",
    ], "large.log")
    const textSpy = vi.spyOn(largeFile, "text")

    const [source] = await browserImportSourceFilesFromFiles([largeFile])

    expect(textSpy).not.toHaveBeenCalled()
    expect(source.preview).toBe("")
    expect(source.size).toBe(largeFile.size)
  })

  it("keeps import layout math deterministic for canvas and dropped points", () => {
    vi.spyOn(Date, "now").mockReturnValue(55)
    const canvas = {
      getBoundingClientRect: () => ({ width: 500 }),
    } as HTMLDivElement

    expect(importLayoutFromCanvas(canvas, { x: -20, y: -40, zoom: 2 })).toEqual({
      origin: { x: 14, y: 62 },
      columns: 1,
    })
    expect(importLayoutFromCanvas({
      getBoundingClientRect: () => ({ width: 900 }),
    } as HTMLDivElement, { x: 0, y: 0, zoom: 1 })).toEqual({
      origin: { x: 28, y: 116 },
      columns: 2,
    })
    expect(importLayoutFromPoint({ x: 12.4, y: 99.6 })).toEqual({
      origin: { x: 12, y: 100 },
      columns: 1,
      idSuffix: "drop-12-100-55",
    })
  })

  it("derives candidate node kind from parser role hints", () => {
    expect(nodeKindFromCandidate(candidate({ roleHint: "transition" }), "reactant")).toBe("transition")
    expect(nodeKindFromCandidate(candidate({ roleHint: "path-point" }), "product")).toBe("intermediate")
    expect(nodeKindFromCandidate(candidate({ roleHint: "final" }), "intermediate")).toBe("product")
    expect(nodeFromCandidate(sourceFile("raw"), parseResult([candidate({ roleHint: "unknown" })]), candidate({ roleHint: "unknown" }), 2, layout).position).toEqual({ x: 10, y: 280 })
  })
})
