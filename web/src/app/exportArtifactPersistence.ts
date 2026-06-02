import {
  type BrowserProjectRepository,
  type BrowserWriteReceipt,
} from "../repository"
import type { JsonObject, ShellArtifact, ShellError, WorkbenchArtifactSummary } from "../shell"
import type { ExportFormat } from "../shell/types"
import {
  exportArtifactsPath,
  projectContentIndexPath,
} from "./projectContentBridge"
import { extensionForExportFormat, supportsBrowserPersistence } from "./exportFormatCapabilities"

const exportArtifactsSchemaVersion = "export-artifacts-v1" as const
const exportArtifactCreatedAt = "2026-05-05T00:00:00Z" as const
const projectContentTime = "2026-05-05T00:00:00Z" as const
export type BrowserPersistedArtifactRecord = JsonObject & {
  id: string
  format: ExportFormat
  path: `exports/${string}`
  checksum: string
  created_at: string
  metadata: JsonObject
}

export type ExportArtifactPersistenceResult = {
  artifactId: string
  persisted: boolean
  path?: string
  checksum?: string
  receipt?: BrowserWriteReceipt
  error?: ShellError
}

export type PersistExportArtifactsOptions = {
  basename: string
}

export async function persistExportArtifacts(
  repository: BrowserProjectRepository,
  projectRef: string,
  artifacts: readonly ShellArtifact[],
  options: PersistExportArtifactsOptions,
): Promise<ExportArtifactPersistenceResult[]> {
  const results: ExportArtifactPersistenceResult[] = []
  const persistedRecords: BrowserPersistedArtifactRecord[] = []

  for (const artifact of artifacts) {
    const result = await persistOneArtifact(repository, projectRef, artifact, options.basename)
    results.push(result)
    if (result.persisted && result.path && result.checksum && isSupportedFormat(artifact.format)) {
      persistedRecords.push({
        id: artifact.id,
        format: artifact.format,
        path: result.path as `exports/${string}`,
        checksum: result.checksum,
        created_at: exportArtifactCreatedAt,
        metadata: jsonSafeObject(artifact.metadata),
      })
    }
  }

  if (persistedRecords.length > 0) {
    await upsertExportArtifactRecords(repository, projectRef, persistedRecords)
  }

  return results
}

export function applyArtifactPersistenceResults(
  artifacts: WorkbenchArtifactSummary[],
  results: readonly ExportArtifactPersistenceResult[],
): WorkbenchArtifactSummary[] {
  const byArtifactId = new Map(results.map((result) => [result.artifactId, result]))
  return artifacts.map((artifact) => {
    const result = byArtifactId.get(artifact.id)
    if (!result?.persisted) {
      return artifact
    }
    const updated: WorkbenchArtifactSummary = {
      ...artifact,
      path: result.path ?? artifact.path ?? null,
      persisted: true,
    }
    const checksum = result.checksum ?? artifact.checksum
    if (checksum) {
      updated.checksum = checksum
    }
    return updated
  })
}

async function persistOneArtifact(
  repository: BrowserProjectRepository,
  projectRef: string,
  artifact: ShellArtifact,
  basename: string,
): Promise<ExportArtifactPersistenceResult> {
  if (!isSupportedFormat(artifact.format)) {
    return skippedArtifact(artifact, "unsupported_format", "Export artifact format is not supported for browser persistence.", "format")
  }
  if (typeof artifact.bytes_base64 !== "string" || artifact.bytes_base64.length === 0) {
    return skippedArtifact(artifact, "missing_inline_bytes", "Export artifact does not include inline bytes.", "bytes_base64")
  }

  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = base64ToBytes(artifact.bytes_base64)
  } catch (error) {
    return {
      artifactId: artifact.id,
      persisted: false,
      error: {
        code: "invalid_input",
        message: error instanceof Error ? error.message : "Export artifact bytes could not be decoded.",
        target: "bytes_base64",
      },
    }
  }

  const path = exportPathForArtifact(artifact, basename)
  const receipt = await repository.writeObject(projectRef, {
    path,
    bytes,
    metadata: {
      kind: "export_artifact",
      artifact_id: artifact.id,
      format: artifact.format,
      ...jsonSafeObject(artifact.metadata),
    },
  })

  return {
    artifactId: artifact.id,
    persisted: true,
    path,
    checksum: receipt.checksum,
    receipt,
  }
}

async function upsertExportArtifactRecords(
  repository: BrowserProjectRepository,
  projectRef: string,
  records: readonly BrowserPersistedArtifactRecord[],
): Promise<void> {
  const currentSection = await readExportArtifactsSection(repository, projectRef)
  const incomingIds = new Set(records.map((record) => record.id))
  const incomingPaths = new Set(records.map((record) => record.path))
  const keptExisting = currentSection.artifacts.filter(
    (record) => !incomingIds.has(record.id) && !incomingPaths.has(record.path),
  )
  const nextArtifacts = [...keptExisting, ...records].sort((left, right) => left.path.localeCompare(right.path))
  const sectionBytes = jsonBytes({
    schema_version: exportArtifactsSchemaVersion,
    project_id: currentSection.project_id,
    artifacts: nextArtifacts,
  })
  const sectionReceipt = await repository.writeObject(projectRef, {
    path: exportArtifactsPath,
    bytes: sectionBytes,
    metadata: { kind: "export_artifacts" },
  })
  await updateProjectContentIndexChecksum(repository, projectRef, sectionReceipt.checksum)
}

async function readExportArtifactsSection(
  repository: BrowserProjectRepository,
  projectRef: string,
): Promise<{ project_id: string; artifacts: BrowserPersistedArtifactRecord[] }> {
  const object = await repository.readObject(projectRef, exportArtifactsPath)
  const data = JSON.parse(textDecoder.decode(object.bytes)) as {
    schema_version?: unknown
    project_id?: unknown
    artifacts?: unknown
  }
  if (data.schema_version !== exportArtifactsSchemaVersion || typeof data.project_id !== "string") {
    throw new Error("Browser export artifact section is not export-artifacts-v1.")
  }
  const artifacts = Array.isArray(data.artifacts)
    ? data.artifacts.map((record) => normalizeExportArtifactRecord(record)).filter((record): record is BrowserPersistedArtifactRecord => record !== undefined)
    : []
  return { project_id: data.project_id, artifacts }
}

async function updateProjectContentIndexChecksum(
  repository: BrowserProjectRepository,
  projectRef: string,
  exportArtifactsChecksum: string,
): Promise<void> {
  const object = await repository.readObject(projectRef, projectContentIndexPath)
  const data = JSON.parse(textDecoder.decode(object.bytes)) as {
    schema_version?: unknown
    project_id?: unknown
    files?: unknown
  }
  if (
    data.schema_version !== "project-content-v1" ||
    typeof data.project_id !== "string" ||
    !Array.isArray(data.files)
  ) {
    throw new Error("Browser project content index files must be a list.")
  }
  const files = data.files.map((file): JsonObject => {
    if (
      file &&
      typeof file === "object" &&
      !Array.isArray(file) &&
      (file as { path?: unknown }).path === exportArtifactsPath
    ) {
      const current = file as JsonObject
      return {
        ...current,
        checksum: exportArtifactsChecksum,
        updated_at: projectContentTime,
      }
    }
    if (file && typeof file === "object" && !Array.isArray(file)) {
      return file as JsonObject
    }
    throw new Error("Browser project content index file must be an object.")
  })
  const bytes = jsonBytes({
    schema_version: data.schema_version,
    project_id: data.project_id,
    files,
  })
  await repository.writeObject(projectRef, {
    path: projectContentIndexPath,
    bytes,
    metadata: object.metadata,
  })
}

function normalizeExportArtifactRecord(value: unknown): BrowserPersistedArtifactRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  const record = value as Record<string, unknown>
  const format = record.format
  if (
    typeof record.id !== "string" ||
    typeof format !== "string" ||
    !isSupportedFormat(format) ||
    typeof record.path !== "string" ||
    !record.path.startsWith("exports/") ||
    typeof record.checksum !== "string" ||
    typeof record.created_at !== "string" ||
    !record.metadata ||
    typeof record.metadata !== "object" ||
    Array.isArray(record.metadata)
  ) {
    return undefined
  }
  return {
    id: record.id,
    format,
    path: record.path as `exports/${string}`,
    checksum: record.checksum,
    created_at: record.created_at,
    metadata: jsonSafeObject(record.metadata as JsonObject),
  }
}

function skippedArtifact(
  artifact: ShellArtifact,
  code: string,
  message: string,
  target: string,
): ExportArtifactPersistenceResult {
  return {
    artifactId: artifact.id,
    persisted: false,
    error: { code, message, target },
  }
}

function exportPathForArtifact(artifact: ShellArtifact, basename: string): `exports/${string}` {
  const safeBasename = safePathSegment(basename || artifact.id || "rxnflow-export")
  const safeFormat = safePathSegment(extensionForExportFormat(artifact.format))
  return `exports/${safeBasename}.${safeFormat}`
}

function safePathSegment(value: string): string {
  const normalized = value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
  if (!normalized || normalized === "." || normalized === "..") {
    return "rxnflow-export"
  }
  return normalized
}

function isSupportedFormat(format: string): format is BrowserPersistedArtifactRecord["format"] {
  return supportsBrowserPersistence(format)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes as Uint8Array<ArrayBuffer>
}

function jsonSafeObject(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject
}

function jsonBytes(data: JsonObject): Uint8Array<ArrayBuffer> {
  return textEncoder.encode(`${JSON.stringify(data, null, 2)}\n`) as Uint8Array<ArrayBuffer>
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
