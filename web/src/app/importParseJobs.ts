import type { SourceParseResult } from "../domain/sourceParseTypes"
import type { SourceFile } from "../domain/projectPackages"
import type { RxnflowDesktopApi } from "./appRuntimeEffects"
import type { ImportSourceFile } from "./importRegistration"
import { BrowserEngineError, parseBrowserSourceFile } from "./browserEngine"

const defaultImportConcurrency = 3

export type DesktopImportReplacementTarget = {
  fileId: string
  storedPath: string
}

export function desktopImportFilesWithProjectTargets(
  importedFiles: ImportSourceFile[],
  existingFiles: SourceFile[],
  projectDirectory?: string | null,
): {
  files: ImportSourceFile[]
  replacementsByImportId: Map<string, DesktopImportReplacementTarget>
} {
  const existingByName = new Map<string, SourceFile>()
  const existingByStoredPath = new Map<string, SourceFile>()
  for (const file of existingFiles) {
    if (!file.storedPath) continue
    const key = normalizedImportFileName(file.name)
    if (!existingByName.has(key)) existingByName.set(key, file)
    existingByStoredPath.set(normalizedStoredPath(file.storedPath), file)
  }

  const replacementsByImportId = new Map<string, DesktopImportReplacementTarget>()
  const files = importedFiles.map((file) => {
    const projectStoredPath = desktopProjectStoredPathForSourcePath(projectDirectory, file.sourcePath)
    const existing = (projectStoredPath ? existingByStoredPath.get(normalizedStoredPath(projectStoredPath)) : undefined)
      ?? existingByName.get(normalizedImportFileName(file.name))
    if (projectStoredPath && existing?.storedPath) {
      return {
        ...file,
        id: existing.id,
        name: existing.name,
        storedPath: existing.storedPath,
        projectSourceReparse: true,
      }
    }
    if (projectStoredPath) {
      return {
        ...file,
        storedPath: projectStoredPath,
        projectSourceReparse: true,
      }
    }
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

export function accumulatedDesktopImportFiles(
  completedFilesById: Map<string, ImportSourceFile>,
  parsedFiles: ImportSourceFile[],
): ImportSourceFile[] {
  for (const parsedFile of parsedFiles) completedFilesById.set(parsedFile.id, parsedFile)
  return Array.from(completedFilesById.values())
}

function normalizedImportFileName(name: string): string {
  return name.trim().toLowerCase()
}

function normalizedStoredPath(storedPath: string): string {
  return storedPath.replaceAll("\\", "/").toLowerCase()
}

export function desktopProjectStoredPathForSourcePath(
  projectDirectory: string | null | undefined,
  sourcePath: string | null | undefined,
): string {
  if (!projectDirectory || !sourcePath) return ""
  const projectRoot = normalizedDesktopAbsolutePath(projectDirectory)
  const normalizedSource = normalizedDesktopAbsolutePath(sourcePath)
  const sourcesPrefix = `${projectRoot}/sources/`
  const caseInsensitive = /^[a-z]:\//i.test(projectRoot)
  const comparableSource = caseInsensitive ? normalizedSource.toLowerCase() : normalizedSource
  const comparablePrefix = caseInsensitive ? sourcesPrefix.toLowerCase() : sourcesPrefix
  if (!comparableSource.startsWith(comparablePrefix)) return ""

  const relativeSourcePath = normalizedSource.slice(sourcesPrefix.length)
  const segments = relativeSourcePath.split("/")
  if (segments.length === 0 || segments.some((segment) => !segment || segment === "." || segment === "..")) return ""
  return `sources/${relativeSourcePath}`
}

function normalizedDesktopAbsolutePath(value: string): string {
  const normalized = value.trim().replaceAll("\\", "/").replace(/\/{2,}/g, "/")
  return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized
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

export async function parsedImportSourceFiles({
  desktopApi,
  projectId,
  projectDirectory,
  importedFiles,
  rawFiles = [],
  concurrency = defaultImportConcurrency,
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
  if (importedFiles.length === 0) return []

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
      const parsedFile = desktopApi
        ? desktopApi.importSourceFiles
          ? await desktopParsedImportSourceFile({
              desktopApi,
              importSourceFiles: desktopApi.importSourceFiles,
              projectId,
              projectDirectory,
              referencedStoredPaths,
              source,
              rawFile: rawFiles[index],
            })
          : source.parse
            ? source
            : importFailureResult(source, "The desktop parser is unavailable.", "engine_unavailable")
        : await browserParsedImportSourceFile(source, rawFiles[index])
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
  const preserveStoredPath = source.projectSourceReparse === true
  try {
    const payloadFile = await desktopImportPayloadFile(desktopApi, source, rawFile)
    const response = await importSourceFiles({ projectId, projectDirectory, referencedStoredPaths, files: [payloadFile] })
    if (!response.ok) {
      return importFailureResult(
        source,
        response.error.message,
        response.error.code,
        preserveStoredPath,
      )
    }
    if (!Array.isArray(response.data.files)) {
      return importFailureResult(source, "The desktop parser did not return import data for this file.", "import_preview_missing", preserveStoredPath)
    }

    const file = response.data.files[0]
    if (!file) {
      return importFailureResult(source, "The desktop parser did not return import data for this file.", "import_preview_missing", preserveStoredPath)
    }

    const merged = mergeDesktopImportResult(source, file)
    if (file.error) {
      return importFailureResult(merged, file.error.message, file.error.code, preserveStoredPath)
    }
    if (!file.parse) {
      const warning = file.error
        ?? response.warnings?.[0]
        ?? {
          code: "import_preview_missing",
          message: "The desktop parser did not return import data for this file.",
        }
      return importFailureResult(merged, warning.message, warning.code, preserveStoredPath)
    }
    return merged
  } catch (error) {
    return importFailureResult(
      source,
      error instanceof Error ? error.message : "The desktop parser could not finish this import file.",
      "import_parse_failed",
      preserveStoredPath,
    )
  }
}

async function browserParsedImportSourceFile(source: ImportSourceFile, rawFile: File | undefined): Promise<ImportSourceFile> {
  if (!rawFile) return importFailureResult(source, "A complete source file is required for parsing.", "full_file_required")
  try {
    const parse = await parseBrowserSourceFile(rawFile)
    if (parse.terminationStatus === "error" || parse.terminationStatus === "running") {
      return importFailureResult(
        { ...source, parse, kind: parse.sourceKind },
        parse.terminationStatus === "error" ? "Calculation output ended with error termination." : "Calculation output is incomplete or still running.",
        parse.terminationStatus === "error" ? "calculation_error_termination" : "calculation_incomplete",
      )
    }
    return { ...source, parse, kind: parse.sourceKind, status: parse.parsed ? "parsed" : "staged" }
  } catch (error) {
    return importFailureResult(
      source,
      error instanceof Error ? error.message : "The Python parser could not finish this import file.",
      error instanceof BrowserEngineError ? error.code : "import_parse_failed",
    )
  }
}

function normalizedImportConcurrency(concurrency: number): number {
  if (!Number.isFinite(concurrency)) return defaultImportConcurrency
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

function importFailureResult(
  source: ImportSourceFile,
  message: string,
  code: string,
  preserveStoredPath = false,
): ImportSourceFile {
  const failedSource = { ...source }
  delete failedSource.sourcePath
  if (!preserveStoredPath) delete failedSource.storedPath
  delete failedSource.checksum
  return {
    ...failedSource,
    status: "staged",
    parse: failedParseResult(source, message, code),
  }
}

function failedParseResult(
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
    parseChecksum?: string
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
    parseChecksum: file.parseChecksum ?? (file.parse && file.checksum ? file.checksum : source?.parseChecksum),
    parse,
  }
}
