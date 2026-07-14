import type { SourceParseResult } from "../domain/sourceParsers"
import type { SourceFile } from "../domain/projectPackages"
import type { RxnflowDesktopApi } from "./appRuntimeEffects"
import type { ImportSourceFile } from "./importRegistration"

const defaultDesktopImportConcurrency = 3

export type DesktopImportReplacementTarget = {
  fileId: string
  storedPath: string
}

export function desktopImportFilesWithProjectTargets(
  importedFiles: ImportSourceFile[],
  existingFiles: SourceFile[],
): {
  files: ImportSourceFile[]
  replacementsByImportId: Map<string, DesktopImportReplacementTarget>
} {
  const existingByName = new Map<string, SourceFile>()
  for (const file of existingFiles) {
    if (!file.storedPath) continue
    const key = normalizedImportFileName(file.name)
    if (!existingByName.has(key)) existingByName.set(key, file)
  }

  const replacementsByImportId = new Map<string, DesktopImportReplacementTarget>()
  const files = importedFiles.map((file) => {
    const existing = existingByName.get(normalizedImportFileName(file.name))
    if (!existing?.storedPath) return file
    replacementsByImportId.set(file.id, {
      fileId: existing.id,
      storedPath: existing.storedPath,
    })
    return {
      ...file,
      storedPath: existing.storedPath,
    }
  })
  return { files, replacementsByImportId }
}

export function desktopImportFileWithReplacementIdentity(
  file: ImportSourceFile,
  replacement: DesktopImportReplacementTarget | undefined,
): ImportSourceFile {
  if (!replacement || !file.storedPath) return file
  return {
    ...file,
    id: replacement.fileId,
    storedPath: replacement.storedPath,
  }
}

function normalizedImportFileName(name: string): string {
  return name.trim().toLowerCase()
}

export type AnimationFrameBatcher<T> = {
  enqueue: (value: T, order: number) => void
  flush: () => Promise<void>
  cancel: () => void
}

export function createAnimationFrameBatcher<T>({
  onFlush,
  requestFrame = (callback) => window.requestAnimationFrame(callback),
  cancelFrame = (frameId) => window.cancelAnimationFrame(frameId),
}: {
  onFlush: (values: T[], lastQueuedValue: T) => void | Promise<void>
  requestFrame?: (callback: FrameRequestCallback) => number
  cancelFrame?: (frameId: number) => void
}): AnimationFrameBatcher<T> {
  let queuedValues: Array<{ value: T; order: number; sequence: number }> = []
  let nextSequence = 0
  let scheduledFrameId: number | null = null
  let activeFlush = Promise.resolve()
  let flushFailure: unknown = null
  let hasFlushFailure = false
  let canceled = false

  const cancelScheduledFrame = () => {
    if (scheduledFrameId === null) return
    cancelFrame(scheduledFrameId)
    scheduledFrameId = null
  }

  const runQueuedBatch = () => {
    if (canceled || hasFlushFailure || queuedValues.length === 0) return activeFlush
    const batch = queuedValues
    queuedValues = []
    const orderedValues = [...batch]
      .sort((left, right) => left.order - right.order || left.sequence - right.sequence)
      .map(({ value }) => value)
    const lastQueuedValue = batch[batch.length - 1].value
    const currentFlush = activeFlush.then(async () => {
      if (canceled || hasFlushFailure) return
      await onFlush(orderedValues, lastQueuedValue)
    })
    activeFlush = currentFlush.catch((error: unknown) => {
      hasFlushFailure = true
      flushFailure = error
      queuedValues = []
      cancelScheduledFrame()
    })
    return currentFlush
  }

  const flushScheduledBatch = () => {
    scheduledFrameId = null
    void runQueuedBatch().catch(() => undefined)
  }

  return {
    enqueue(value, order) {
      if (canceled || hasFlushFailure) return
      queuedValues.push({ value, order, sequence: nextSequence })
      nextSequence += 1
      if (scheduledFrameId !== null) return
      scheduledFrameId = requestFrame(flushScheduledBatch)
    },
    async flush() {
      if (canceled) return
      cancelScheduledFrame()
      while (!canceled) {
        if (hasFlushFailure) throw flushFailure
        if (queuedValues.length > 0) {
          await runQueuedBatch()
        } else {
          await activeFlush
        }
        if (hasFlushFailure) throw flushFailure
        if (queuedValues.length === 0) return
        cancelScheduledFrame()
      }
    },
    cancel() {
      if (canceled) return
      canceled = true
      queuedValues = []
      cancelScheduledFrame()
    },
  }
}

export async function desktopParsedImportSourceFiles({
  desktopApi,
  projectId,
  projectDirectory,
  importedFiles,
  rawFiles = [],
  concurrency = defaultDesktopImportConcurrency,
  referencedStoredPaths = [],
  onFileParsed,
}: {
  desktopApi: RxnflowDesktopApi | undefined
  projectId: string
  projectDirectory?: string | null
  importedFiles: ImportSourceFile[]
  rawFiles?: File[]
  concurrency?: number
  referencedStoredPaths?: string[]
  onFileParsed?: (parsedFile: ImportSourceFile, index: number) => void | Promise<void>
}): Promise<ImportSourceFile[]> {
  const importSourceFiles = desktopApi?.importSourceFiles
  if (!desktopApi || !importSourceFiles || importedFiles.length === 0) return []

  const results: Array<ImportSourceFile | undefined> = new Array(importedFiles.length)
  const workerCount = Math.min(importedFiles.length, normalizedImportConcurrency(concurrency))
  let nextIndex = 0
  let callbackError: unknown = null
  let callbackQueue = Promise.resolve()

  const emitParsedFile = (parsedFile: ImportSourceFile, index: number) => {
    if (!onFileParsed) return
    callbackQueue = callbackQueue.then(async () => {
      if (callbackError) return
      try {
        await onFileParsed(parsedFile, index)
      } catch (error) {
        callbackError = error
      }
    })
  }

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < importedFiles.length) {
      const index = nextIndex
      nextIndex += 1
      const source = importedFiles[index]
      const parsedFile = await desktopParsedImportSourceFile({
        desktopApi,
        importSourceFiles,
        projectId,
        projectDirectory,
        referencedStoredPaths,
        source,
        rawFile: rawFiles[index],
      })
      results[index] = parsedFile
      emitParsedFile(parsedFile, index)
    }
  }))

  await callbackQueue
  if (callbackError) throw callbackError
  return results.filter((file): file is ImportSourceFile => Boolean(file))
}

export function desktopSourceFilePathForRawFile(
  desktopApi: Pick<RxnflowDesktopApi, "filePathForFile"> | undefined,
  rawFile: File | undefined,
): string {
  if (!desktopApi || !rawFile) return ""
  const fromDesktop = desktopApi.filePathForFile?.(rawFile)
  if (fromDesktop) return fromDesktop
  const legacyPath = (rawFile as File & { path?: unknown }).path
  return typeof legacyPath === "string" ? legacyPath : ""
}

async function desktopParsedImportSourceFile({
  desktopApi,
  importSourceFiles,
  projectId,
  projectDirectory,
  referencedStoredPaths,
  source,
  rawFile,
}: {
  desktopApi: RxnflowDesktopApi
  importSourceFiles: NonNullable<RxnflowDesktopApi["importSourceFiles"]>
  projectId: string
  projectDirectory?: string | null
  referencedStoredPaths: string[]
  source: ImportSourceFile
  rawFile: File | undefined
}): Promise<ImportSourceFile> {
  try {
    const payloadFile = await desktopImportPayloadFile(desktopApi, source, rawFile)
    const response = await importSourceFiles({ projectId, projectDirectory, referencedStoredPaths, files: [payloadFile] })
    if (!response.ok) {
      return desktopImportFailureResult(
        source,
        response.error.message,
        response.error.code,
      )
    }
    if (!Array.isArray(response.data.files)) {
      return desktopImportFailureResult(source, "The desktop parser did not return import data for this file.", "import_preview_missing")
    }

    const file = response.data.files[0]
    if (!file) {
      return desktopImportFailureResult(source, "The desktop parser did not return import data for this file.", "import_preview_missing")
    }

    const merged = mergeDesktopImportResult(source, file)
    if (file.error) {
      return desktopImportFailureResult(merged, file.error.message, file.error.code)
    }
    if (!file.parse) {
      const warning = file.error
        ?? response.warnings?.[0]
        ?? {
          code: "import_preview_missing",
          message: "The desktop parser did not return import data for this file.",
        }
      return desktopImportFailureResult(merged, warning.message, warning.code)
    }
    return merged
  } catch (error) {
    return desktopImportFailureResult(
      source,
      error instanceof Error ? error.message : "The desktop parser could not finish this import file.",
      "import_parse_failed",
    )
  }
}

function normalizedImportConcurrency(concurrency: number): number {
  if (!Number.isFinite(concurrency)) return defaultDesktopImportConcurrency
  return Math.max(1, Math.min(8, Math.floor(concurrency)))
}

async function desktopImportPayloadFile(
  desktopApi: RxnflowDesktopApi,
  source: ImportSourceFile,
  rawFile: File | undefined,
) {
  const sourcePath = source.sourcePath || desktopSourceFilePathForRawFile(desktopApi, rawFile)
  return {
    id: source.id,
    name: source.name,
    size: source.size,
    preview: source.preview,
    ...(sourcePath ? { sourcePath } : {}),
    ...(source.storedPath ? { storedPath: source.storedPath } : {}),
  }
}

function desktopImportFailureResult(
  source: ImportSourceFile,
  message: string,
  code: string,
): ImportSourceFile {
  const failedSource = { ...source }
  delete failedSource.sourcePath
  delete failedSource.storedPath
  delete failedSource.checksum
  return {
    ...failedSource,
    status: "staged",
    parse: failedDesktopParseResult(source, message, code),
  }
}

function failedDesktopParseResult(
  source: ImportSourceFile,
  message: string,
  code: string,
): SourceParseResult {
  const base = source.parse
  return {
    label: base?.label ?? fileLabelFromName(source.name),
    sourceKind: base?.sourceKind ?? source.kind ?? "Raw",
    formula: base?.formula ?? "pending",
    kind: base?.kind ?? "intermediate",
    method: base?.method ?? "unassigned",
    solvent: base?.solvent ?? "unassigned",
    energyGas: null,
    energySolution: null,
    energyUnit: base?.energyUnit ?? "hartree",
    parsed: false,
    parserId: null,
    parserVersion: null,
    objectCount: 0,
    warnings: [{
      code,
      message,
      target: source.name,
    }],
    candidates: [],
    coordinatePreview: null,
    parseScope: "full-file",
    confidence: "low",
    terminationStatus: "unknown",
    terminationLabel: "unknown",
    jobCpuTime: null,
    elapsedTime: null,
  }
}

function fileLabelFromName(name: string): string {
  const trimmed = name.trim()
  const withoutExtension = trimmed.replace(/\.[^.]+$/, "")
  return withoutExtension || trimmed || "source"
}

function mergeDesktopImportResult(
  source: ImportSourceFile | undefined,
  file: {
    id: string
    name: string
    size: number
    preview: string
    storedPath?: string
    checksum?: string
    parse?: SourceParseResult | null
    error?: {
      code: string
      message: string
    }
  },
): ImportSourceFile {
  const parse = file.parse ?? source?.parse ?? undefined
  return {
    ...(source ?? {
      id: file.id,
      name: file.name,
      kind: parse?.sourceKind ?? "Raw",
      size: file.size,
      status: "staged" as const,
      preview: file.preview,
    }),
    id: file.id,
    name: file.name,
    kind: parse?.sourceKind ?? source?.kind ?? "Raw",
    size: file.size,
    status: parse?.parsed ? "parsed" : "staged",
    preview: file.preview,
    sourcePath: file.storedPath ? undefined : source?.sourcePath,
    storedPath: file.storedPath ?? source?.storedPath,
    checksum: file.checksum ?? source?.checksum,
    parse,
  }
}
