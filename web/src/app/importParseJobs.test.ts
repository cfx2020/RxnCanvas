import { describe, expect, it, vi } from "vitest"
import type { SourceParseResult } from "../domain/sourceParsers"
import type { RxnflowDesktopApi } from "./appRuntimeEffects"
import {
  accumulatedDesktopImportFiles,
  createAnimationFrameBatcher,
  desktopImportFilesWithProjectTargets,
  desktopImportFileWithReplacementIdentity,
  desktopParsedImportSourceFiles,
} from "./importParseJobs"
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

describe("desktop same-name source replacement", () => {
  it("targets the existing stored path and adopts the stable file id only after success", () => {
    const incoming = importSourceFile("incoming")
    incoming.name = "OPT.LOG"
    const existing = {
      ...importSourceFile("existing"),
      name: "opt.log",
      storedPath: "sources/opt.log",
      checksum: `sha256:${"1".repeat(64)}`,
    }

    const prepared = desktopImportFilesWithProjectTargets([incoming], [existing])
    expect(prepared.files[0]).toMatchObject({
      id: "incoming",
      storedPath: "sources/opt.log",
    })
    const replacement = prepared.replacementsByImportId.get("incoming")
    expect(desktopImportFileWithReplacementIdentity({
      ...prepared.files[0],
      status: "parsed",
      parse: parseResult("updated"),
    }, replacement)).toMatchObject({
      id: "existing",
      storedPath: "sources/opt.log",
    })
    expect(desktopImportFileWithReplacementIdentity({
      ...incoming,
      storedPath: undefined,
    }, replacement).id).toBe("incoming")
  })
})

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve())
}

describe("importParseJobs", () => {
  it("keeps completed import results in later frame batches", () => {
    const completedFilesById = new Map<string, ImportSourceFile>()
    const first = { ...importSourceFile("first"), status: "parsed" as const, parse: parseResult("first") }
    const second = { ...importSourceFile("second"), status: "parsed" as const, parse: parseResult("second") }
    const updatedFirst = { ...first, checksum: `sha256:${"a".repeat(64)}` }

    expect(accumulatedDesktopImportFiles(completedFilesById, [first])).toEqual([first])
    expect(accumulatedDesktopImportFiles(completedFilesById, [second])).toEqual([first, second])
    expect(accumulatedDesktopImportFiles(completedFilesById, [updatedFirst])).toEqual([updatedFirst, second])
  })

  it("batches values queued in one animation frame by input order", async () => {
    let scheduledFrame: FrameRequestCallback | null = null
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledFrame = callback
      return 17
    })
    const cancelFrame = vi.fn()
    const onFlush = vi.fn(async () => undefined)
    const batcher = createAnimationFrameBatcher({ onFlush, requestFrame, cancelFrame })

    batcher.enqueue("third", 2)
    batcher.enqueue("first", 0)
    batcher.enqueue("second", 1)

    expect(requestFrame).toHaveBeenCalledTimes(1)
    expect(onFlush).not.toHaveBeenCalled()

    expect(scheduledFrame).not.toBeNull()
    const flushFrame = scheduledFrame as unknown as FrameRequestCallback
    flushFrame(16)
    await batcher.flush()

    expect(cancelFrame).not.toHaveBeenCalled()
    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(onFlush).toHaveBeenCalledWith(["first", "second", "third"], "second")
  })

  it("flushes the final queued batch immediately and cancels its pending frame", async () => {
    const requestFrame = vi.fn(() => 23)
    const cancelFrame = vi.fn()
    const onFlush = vi.fn(async () => undefined)
    const batcher = createAnimationFrameBatcher({ onFlush, requestFrame, cancelFrame })

    batcher.enqueue("final", 0)
    await batcher.flush()

    expect(cancelFrame).toHaveBeenCalledWith(23)
    expect(onFlush).toHaveBeenCalledWith(["final"], "final")
  })

  it("cancels a queued batch and retains flush failures for the job boundary", async () => {
    const requestFrame = vi.fn(() => 31)
    const cancelFrame = vi.fn()
    const canceledFlush = vi.fn(async () => undefined)
    const canceledBatcher = createAnimationFrameBatcher({ onFlush: canceledFlush, requestFrame, cancelFrame })

    canceledBatcher.enqueue("discarded", 0)
    canceledBatcher.cancel()
    await canceledBatcher.flush()

    expect(cancelFrame).toHaveBeenCalledWith(31)
    expect(canceledFlush).not.toHaveBeenCalled()

    const flushError = new Error("stage failed")
    const failingBatcher = createAnimationFrameBatcher({
      onFlush: async () => {
        throw flushError
      },
      requestFrame: () => 37,
      cancelFrame: vi.fn(),
    })
    failingBatcher.enqueue("failed", 0)

    await expect(failingBatcher.flush()).rejects.toBe(flushError)
    await expect(failingBatcher.flush()).rejects.toBe(flushError)
  })

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
      projectDirectory: "/tmp/p1.rxnflow",
      importedFiles,
      concurrency: 2,
      referencedStoredPaths: ["sources/existing.log"],
      onFileParsed,
    })

    await flushPromises()
    expect(importSourceFiles).toHaveBeenCalledTimes(2)
    expect(maxInFlight).toBe(2)
    expect(pending.map((entry) => entry.payload.files)).toEqual([
      [expect.objectContaining({ id: "a", preview: "" })],
      [expect.objectContaining({ id: "b", preview: "" })],
    ])
    expect(pending.map((entry) => entry.payload.projectDirectory)).toEqual([
      "/tmp/p1.rxnflow",
      "/tmp/p1.rxnflow",
    ])
    expect(pending.map((entry) => entry.payload.referencedStoredPaths)).toEqual([
      ["sources/existing.log"],
      ["sources/existing.log"],
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
    expect(pending.map((entry) => entry.payload.projectDirectory)).toEqual([
      "/tmp/p1.rxnflow",
      "/tmp/p1.rxnflow",
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

  it("stops pending progress without keeping successful import metadata when the backend returns no parse", async () => {
    const source = {
      ...importSourceFile("missing-parse"),
      parse: {
        ...parseResult("missing-parse"),
        parsed: false,
        objectCount: 0,
        parserId: null,
        warnings: [{ code: "parse_deferred", message: "waiting" }],
        candidates: [],
      },
    } satisfies ImportSourceFile
    const importSourceFiles = vi.fn(async () => ({
      ok: true as const,
      data: {
        files: [{
          id: "missing-parse",
          name: "missing-parse.log",
          size: 10,
          preview: "",
          storedPath: "sources/missing-parse.log",
          checksum: `sha256:${"a".repeat(64)}`,
        }],
      },
      warnings: [{
        code: "import_preview_failed",
        message: "The local parser did not return import preview data.",
      }],
    }))

    const [parsedFile] = await desktopParsedImportSourceFiles({
      desktopApi: { platform: "darwin", importSourceFiles } as unknown as RxnflowDesktopApi,
      projectId: "p1",
      importedFiles: [source],
    })

    expect(parsedFile.sourcePath).toBeUndefined()
    expect(parsedFile.storedPath).toBeUndefined()
    expect(parsedFile.checksum).toBeUndefined()
    expect(parsedFile.status).toBe("staged")
    expect(parsedFile.parse?.warnings).toEqual([{
      code: "import_preview_failed",
      message: "The local parser did not return import preview data.",
      target: "missing-parse.log",
    }])
  })

  it("keeps materialization failures ahead of parser fallback warnings", async () => {
    const source = {
      ...importSourceFile("missing-payload"),
      parse: {
        ...parseResult("missing-payload"),
        parsed: false,
        objectCount: 0,
        parserId: null,
        warnings: [{ code: "parse_deferred", message: "waiting" }],
        candidates: [],
      },
    } satisfies ImportSourceFile
    const fallbackParse = {
      ...parseResult("missing-payload"),
      parsed: false,
      sourceKind: "Raw",
      objectCount: 0,
      parserId: null,
      warnings: [{ code: "unsupported_format", message: "No supported parser recognized this source full-file." }],
      candidates: [],
    } satisfies SourceParseResult
    const importSourceFiles = vi.fn(async () => ({
      ok: true as const,
      data: {
        files: [{
          id: "missing-payload",
          name: "missing-payload.log",
          size: 0,
          preview: "",
          error: {
            code: "source_materialize_failed",
            message: "Could not copy source file because the import payload did not include a readable native file path.",
          },
          parse: fallbackParse,
        }],
      },
    }))

    const [parsedFile] = await desktopParsedImportSourceFiles({
      desktopApi: { platform: "darwin", importSourceFiles } as unknown as RxnflowDesktopApi,
      projectId: "p1",
      importedFiles: [source],
    })

    expect(parsedFile.parse?.warnings).toEqual([{
      code: "source_materialize_failed",
      message: "Could not copy source file because the import payload did not include a readable native file path.",
      target: "missing-payload.log",
    }])
  })

  it("drops stored source metadata when the backend rejects a parsed calculation output", async () => {
    const source = {
      ...importSourceFile("error-terminated"),
      parse: {
        ...parseResult("error-terminated"),
        parsed: false,
        objectCount: 0,
        parserId: null,
        warnings: [{ code: "parse_deferred", message: "waiting" }],
        candidates: [],
      },
    } satisfies ImportSourceFile
    const rejectedParse = {
      ...parseResult("error-terminated"),
      terminationStatus: "error",
      terminationLabel: "error",
    } satisfies SourceParseResult
    const importSourceFiles = vi.fn(async () => ({
      ok: true as const,
      data: {
        files: [{
          id: "error-terminated",
          name: "error-terminated.log",
          size: 10,
          preview: "",
          storedPath: "sources/error-terminated.log",
          checksum: `sha256:${"b".repeat(64)}`,
          parse: rejectedParse,
          error: {
            code: "calculation_error_termination",
            message: "Calculation output ended with error termination.",
          },
        }],
      },
    }))

    const [parsedFile] = await desktopParsedImportSourceFiles({
      desktopApi: { platform: "darwin", importSourceFiles } as unknown as RxnflowDesktopApi,
      projectId: "p1",
      importedFiles: [source],
    })

    expect(parsedFile.sourcePath).toBeUndefined()
    expect(parsedFile.storedPath).toBeUndefined()
    expect(parsedFile.checksum).toBeUndefined()
    expect(parsedFile.status).toBe("staged")
    expect(parsedFile.parse?.parsed).toBe(false)
    expect(parsedFile.parse?.warnings).toEqual([{
      code: "calculation_error_termination",
      message: "Calculation output ended with error termination.",
      target: "error-terminated.log",
    }])
  })
})
