import { describe, expect, it, vi } from "vitest"
import type { SourceFile } from "../domain/projectPackages"
import type { SourceParseResult } from "../domain/sourceParsers"
import type { RxnflowDesktopApi } from "./appRuntimeEffects"
import {
  mergeRefreshedProjectSourceFiles,
  projectWorkspaceWithRefreshedSourceFiles,
  refreshProjectSourceFiles,
  sourceFileGroupIds,
} from "./sourceFileRefresh"

function parse(spinMultiplicity: number, energyGas: number): SourceParseResult {
  return {
    label: "solution",
    sourceKind: "Gaussian",
    formula: "Ni",
    kind: "intermediate",
    method: "wb97xd",
    solvent: "implicit solvent",
    energyGas,
    energySolution: null,
    energyUnit: "hartree",
    parsed: true,
    parserId: "gaussian",
    parserVersion: "1",
    objectCount: 1,
    warnings: [],
    candidates: [{
      candidateId: "candidate-1",
      objectIndex: 0,
      label: "solution",
      formula: "Ni",
      charge: 0,
      spinMultiplicity,
      method: "wb97xd",
      energyGas,
      energySolution: null,
      energyUnit: "hartree",
      coordinatePreview: null,
      roleHint: "intermediate",
      warnings: [],
    }],
    coordinatePreview: null,
    parseScope: "full-file",
    confidence: "high",
    terminationStatus: "normal",
    terminationLabel: "normal",
    jobCpuTime: null,
    elapsedTime: null,
  }
}

function source(): SourceFile {
  return {
    id: "solution",
    name: "solution_sol.log",
    kind: "Gaussian",
    size: 100,
    status: "parsed",
    preview: "",
    storedPath: "sources/solution_sol.log",
    checksum: "sha256:old",
    parseChecksum: "sha256:old",
    parse: parse(3, -10),
  }
}

describe("refreshProjectSourceFiles", () => {
  it("expands one dragged file to its complete gas and solution group", () => {
    const gas = { ...source(), id: "gas", name: "structure.log" }
    const solution = { ...source(), id: "solution", name: "structure_sol.log" }
    const other = { ...source(), id: "other", name: "other.log" }

    expect(sourceFileGroupIds([gas, solution, other], [gas.id])).toEqual(new Set(["gas", "solution"]))
  })

  it("merges refreshed files without dropping newer unrelated state", () => {
    const current = [source(), { ...source(), id: "new-file", name: "new.log" }]
    const refreshed = [{ ...source(), checksum: "sha256:new" }]

    expect(mergeRefreshedProjectSourceFiles(current, refreshed, new Set(["solution"]))).toEqual([
      refreshed[0],
      current[1],
    ])
  })

  it("updates existing node energy from a refreshed source without changing its layout", () => {
    const current = source()
    const refreshed = {
      ...current,
      checksum: "sha256:new",
      parseChecksum: "sha256:new",
      parse: parse(1, -20),
    }
    const node = {
      id: "node-1",
      label: "User label",
      formula: "Ni",
      kind: "intermediate" as const,
      method: "wb97xd",
      solvent: "implicit solvent",
      energyGas: -10,
      energySolution: null,
      energyUnit: "hartree" as const,
      sourceStatus: "parsed" as const,
      sourceFileId: current.id,
      sourceCandidateId: "candidate-1",
      sourceObjectIndex: 0,
      charge: 0,
      spinMultiplicity: 3,
      position: { x: 120, y: 80 },
      size: { width: 300, height: 220 },
    }
    const canvas = {
      id: "canvas-1",
      label: "Canvas 1",
      nodes: [node],
      edges: [],
      barriers: [],
      annotations: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedNodeIds: [node.id],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
    }
    const snapshot = {
      files: [current],
      canvases: [canvas],
      activeCanvasId: canvas.id,
      nodes: [node],
      edges: [],
      barriers: [],
      annotations: [],
      viewport: canvas.viewport,
      selectedNodeIds: [node.id],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
      selectedFileId: current.id,
      selectedFileIds: [current.id],
      lastSelectedFileId: current.id,
      energyDisplayOptions: { baselineNodeId: null, energySource: "solution" as const, outputUnit: "kcal/mol" as const },
      viewMode: "canvas" as const,
      inspectorMode: "inspector" as const,
    }

    const next = projectWorkspaceWithRefreshedSourceFiles(snapshot, [refreshed], new Set([current.id]))

    expect(next.nodes[0]).toMatchObject({
      id: node.id,
      label: node.label,
      energyGas: -20,
      spinMultiplicity: 1,
      position: node.position,
      size: node.size,
    })
  })

  it("reparses changed project sources and binds the parse to the new checksum", async () => {
    const nextParse = parse(1, -20)
    const desktopApi = {
      inspectProjectSourceFiles: vi.fn(async () => ({
        ok: true,
        data: { files: [{ id: "solution", storedPath: "sources/solution_sol.log", size: 120, checksum: "sha256:new" }] },
      })),
      parseSourcePreview: vi.fn(async () => ({
        ok: true,
        data: { parse: nextParse, size: 120, checksum: "sha256:new", parseChecksum: "sha256:new" },
      })),
    } as unknown as RxnflowDesktopApi

    const result = await refreshProjectSourceFiles({ desktopApi, projectId: "p1", files: [source()] })

    expect(result.refreshedFileIds).toEqual(new Set(["solution"]))
    expect(result.files[0]).toMatchObject({
      size: 120,
      checksum: "sha256:new",
      parseChecksum: "sha256:new",
      parse: nextParse,
    })
  })

  it("forces a fresh parse before a project-file drop even when the checksum is unchanged", async () => {
    const current = source()
    const parseSourcePreview = vi.fn(async () => ({
      ok: true,
      data: { parse: parse(1, -20), checksum: current.checksum, parseChecksum: current.checksum },
    }))
    const desktopApi = {
      inspectProjectSourceFiles: vi.fn(async () => ({
        ok: true,
        data: { files: [{ id: current.id, storedPath: current.storedPath!, size: current.size, checksum: current.checksum! }] },
      })),
      parseSourcePreview,
    } as unknown as RxnflowDesktopApi

    const result = await refreshProjectSourceFiles({
      desktopApi,
      projectId: "p1",
      files: [current],
      forceFileIds: new Set([current.id]),
    })

    expect(parseSourcePreview).toHaveBeenCalledTimes(1)
    expect(result.files[0].parse?.candidates[0]?.spinMultiplicity).toBe(1)
  })

  it("does not reuse an old parse when a forced pre-drop refresh fails", async () => {
    const current = source()
    const desktopApi = {
      inspectProjectSourceFiles: vi.fn(async () => ({
        ok: true,
        data: { files: [{ id: current.id, storedPath: current.storedPath!, size: current.size, checksum: current.checksum! }] },
      })),
      parseSourcePreview: vi.fn(async () => ({ ok: false, error: { code: "parse_failed", message: "failed" } })),
    } as unknown as RxnflowDesktopApi

    const result = await refreshProjectSourceFiles({
      desktopApi,
      projectId: "p1",
      files: [current],
      forceFileIds: new Set([current.id]),
    })

    expect(result.refreshedFileIds).toEqual(new Set([current.id]))
    expect(result.files[0]).toMatchObject({ status: "staged", parse: undefined, parseChecksum: undefined })
  })

  it("clears an old parse when changed disk content cannot be reparsed", async () => {
    const desktopApi = {
      inspectProjectSourceFiles: vi.fn(async () => ({
        ok: true,
        data: { files: [{ id: "solution", storedPath: "sources/solution_sol.log", size: 120, checksum: "sha256:new" }] },
      })),
      parseSourcePreview: vi.fn(async () => ({ ok: false, error: { code: "parse_failed", message: "failed" } })),
    } as unknown as RxnflowDesktopApi

    const result = await refreshProjectSourceFiles({ desktopApi, projectId: "p1", files: [source()] })

    expect(result.files[0]).toMatchObject({
      status: "staged",
      checksum: "sha256:new",
      parseChecksum: undefined,
      parse: undefined,
    })
  })
})
