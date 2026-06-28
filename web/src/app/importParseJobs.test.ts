import { describe, expect, it, vi } from "vitest"
import type { SourceParseResult } from "../domain/sourceParsers"
import type { RxnflowDesktopApi } from "./appRuntimeEffects"
import { desktopParsedImportSourceFiles } from "./importParseJobs"
import type { ImportSourceFile } from "./importRegistration"

function importSourceFile(id: string): ImportSourceFile {
  return {
    id,
    name: `${id}.log`,
    kind: "Gaussian",
    size: 10,
    status: "staged",
    preview: "",
  }
}

function parseResult(label: string): SourceParseResult {
  return {
    label,
    sourceKind: "Gaussian",
    formula: "H2",
    kind: "intermediate",
    method: "DFT",
    solvent: "unassigned",
    energyGas: null,
    energySolution: null,
    energyUnit: "hartree",
    parsed: true,
    parserId: "gaussian-output-cclib+rxnflow-text-full-file",
    parserVersion: "1",
    objectCount: 1,
    warnings: [],
    candidates: [{
      candidateId: `candidate-${label}`,
      objectIndex: 0,
      label,
      formula: "H2",
      charge: null,
      spinMultiplicity: null,
      method: "DFT",
      energyGas: null,
      energySolution: null,
      energyUnit: "hartree",
      coordinatePreview: null,
      roleHint: "final",
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

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve())
}

describe("importParseJobs", () => {
  it("runs desktop parser imports as bounded per-file jobs", async () => {
    const pending: Array<{
      payload: Parameters<NonNullable<RxnflowDesktopApi["importSourceFiles"]>>[0]
      resolve: (value: Awaited<ReturnType<NonNullable<RxnflowDesktopApi["importSourceFiles"]>>>) => void
    }> = []
    let inFlight = 0
    let maxInFlight = 0
    const importSourceFiles = vi.fn((payload: Parameters<NonNullable<RxnflowDesktopApi["importSourceFiles"]>>[0]) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      return new Promise<Awaited<ReturnType<NonNullable<RxnflowDesktopApi["importSourceFiles"]>>>>((resolve) => {
        pending.push({
          payload,
          resolve: (value) => {
            inFlight -= 1
            resolve(value)
          },
        })
      })
    })
    const onFileParsed = vi.fn()
    const importedFiles = ["a", "b", "c", "d"].map(importSourceFile)

    const job = desktopParsedImportSourceFiles({
      desktopApi: { platform: "darwin", importSourceFiles } as unknown as RxnflowDesktopApi,
      projectId: "p1",
      importedFiles,
      concurrency: 2,
      onFileParsed,
    })

    await flushPromises()
    expect(importSourceFiles).toHaveBeenCalledTimes(2)
    expect(maxInFlight).toBe(2)
    expect(pending.map((entry) => entry.payload.files)).toEqual([
      [expect.objectContaining({ id: "a", preview: "" })],
      [expect.objectContaining({ id: "b", preview: "" })],
    ])

    pending.shift()?.resolve({
      ok: true,
      data: { files: [{ id: "a", name: "a.log", size: 10, preview: "", storedPath: "sources/a.log", parse: parseResult("a") }] },
    })
    pending.shift()?.resolve({
      ok: true,
      data: { files: [{ id: "b", name: "b.log", size: 10, preview: "", storedPath: "sources/b.log", parse: parseResult("b") }] },
    })
    await flushPromises()

    expect(importSourceFiles).toHaveBeenCalledTimes(4)
    expect(pending.map((entry) => entry.payload.files)).toEqual([
      [expect.objectContaining({ id: "c", preview: "" })],
      [expect.objectContaining({ id: "d", preview: "" })],
    ])

    pending.shift()?.resolve({
      ok: true,
      data: { files: [{ id: "c", name: "c.log", size: 10, preview: "", storedPath: "sources/c.log", parse: parseResult("c") }] },
    })
    pending.shift()?.resolve({
      ok: true,
      data: { files: [{ id: "d", name: "d.log", size: 10, preview: "", storedPath: "sources/d.log", parse: parseResult("d") }] },
    })

    const parsedFiles = await job
    expect(parsedFiles.map((file) => file.id)).toEqual(["a", "b", "c", "d"])
    expect(onFileParsed).toHaveBeenCalledTimes(4)
    expect(importSourceFiles.mock.calls.every(([payload]) => payload.files.length === 1)).toBe(true)
  })

  it("replaces deferred parse state with a failure warning when a file job fails", async () => {
    const source = {
      ...importSourceFile("failed"),
      parse: {
        ...parseResult("failed"),
        parsed: false,
        objectCount: 0,
        parserId: null,
        warnings: [{ code: "parse_deferred", message: "waiting" }],
        candidates: [],
      },
    } satisfies ImportSourceFile
    const importSourceFiles = vi.fn(async () => ({
      ok: false as const,
      error: { code: "engine_down", message: "Engine unavailable." },
    }))

    const [parsedFile] = await desktopParsedImportSourceFiles({
      desktopApi: { platform: "darwin", importSourceFiles } as unknown as RxnflowDesktopApi,
      projectId: "p1",
      importedFiles: [source],
    })

    expect(parsedFile.parse?.warnings).toEqual([{
      code: "engine_down",
      message: "Engine unavailable.",
      target: "failed.log",
    }])
  })
})
