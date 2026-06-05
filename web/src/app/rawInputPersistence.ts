import {
  BrowserProjectRepositoryError,
  checksumBrowserStorageBytes,
  type BrowserProjectRef,
  type BrowserProjectRepository,
  type BrowserProjectRepositoryErrorPayload,
  type BrowserWriteReceipt,
} from "../repository"
import type { JsonObject, JsonValue } from "../shell"
import { projectManifestPath, projectSchemaVersion } from "./projectContentBridge"
import type { WebImportFile } from "./importInboxState"

export type RawPersistenceSkippedReason =
  | "no_active_project"
  | "path_source"
  | "oversized_inline_file"

export type BrowserRawResource = JsonObject & {
  id: string
  kind: "raw_file"
  path: string
  checksum: string
  metadata: {
    source_name: string
    byte_size: number
    mime_type?: string | null
    last_modified?: number | null
  }
}

export type RawPersistenceState =
  | { state: "idle" }
  | { state: "persisted"; resource: BrowserRawResource }
  | { state: "skipped"; reason: RawPersistenceSkippedReason }
  | { state: "error"; error: BrowserProjectRepositoryErrorPayload }

export type PersistRawInputResult =
  | {
      ok: true
      fileName: string
      resource: BrowserRawResource
      receipt: BrowserWriteReceipt
      manifestReceipt: BrowserWriteReceipt
    }
  | {
      ok: false
      fileName: string
      error: BrowserProjectRepositoryErrorPayload
    }

export async function persistImportFilesAsRawInputs(
  repository: BrowserProjectRepository,
  activeProject: BrowserProjectRef | undefined,
  files: readonly WebImportFile[],
): Promise<WebImportFile[]> {
  if (!activeProject) {
    return files.map((file) => withRawPersistence(file, {
      state: "skipped",
      reason: "no_active_project",
    }))
  }

  const nextFiles: WebImportFile[] = []
  for (const file of files) {
    if (!file.file) {
      nextFiles.push(withRawPersistence(file, {
        state: "skipped",
        reason: "path_source",
      }))
      continue
    }

    const result = await persistRawInputFile(repository, activeProject.projectRef, file.file)
    if (result.ok) {
      nextFiles.push(withRawPersistence({
        ...file,
        storagePath: result.resource.path,
        sourceKind: "path",
      }, {
        state: "persisted",
        resource: result.resource,
      }))
    } else {
      nextFiles.push(withRawPersistence(file, {
        state: "error",
        error: result.error,
      }))
    }
  }
  return nextFiles
}

export async function persistRawInputFile(
  repository: BrowserProjectRepository,
  projectRef: string,
  file: File,
): Promise<PersistRawInputResult> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer()) as Uint8Array<ArrayBuffer>
    const checksum = await checksumBrowserStorageBytes(bytes)
    const resource = browserRawResourceForFile(file, checksum)
    const receipt = await repository.writeObject(projectRef, {
      path: resource.path,
      bytes,
      checksum,
      metadata: {
        kind: "raw_file",
        source_name: resource.metadata.source_name,
        byte_size: resource.metadata.byte_size,
        mime_type: resource.metadata.mime_type ?? null,
        last_modified: resource.metadata.last_modified ?? null,
      },
    })
    const manifestReceipt = await mergeBrowserRawResource(repository, projectRef, resource)
    return {
      ok: true,
      fileName: file.name,
      resource,
      receipt,
      manifestReceipt,
    }
  } catch (error) {
    return {
      ok: false,
      fileName: file.name,
      error: rawPersistenceErrorPayload(error),
    }
  }
}

export function browserRawResourceForFile(file: File, checksum: string): BrowserRawResource {
  const sha12 = checksum.replace(/^sha256:/, "").slice(0, 12)
  const sourceName = safeBaseName(file.name)
  return {
    id: `raw-${sha12}`,
    kind: "raw_file",
    path: `inputs/raw/${sha12}-${sourceName}`,
    checksum,
    metadata: {
      source_name: sourceName,
      byte_size: file.size,
      mime_type: file.type || null,
      last_modified: Number.isFinite(file.lastModified) ? file.lastModified : null,
    },
  }
}

export function safeBaseName(name: string): string {
  const parts = name.split(/[\\/]+/).filter(Boolean)
  const baseName = parts.at(-1)?.trim() || "raw-input"
  return baseName.replaceAll("/", "-").replaceAll("\\", "-")
}

function withRawPersistence(file: WebImportFile, rawPersistence: RawPersistenceState): WebImportFile {
  return { ...file, rawPersistence }
}

async function mergeBrowserRawResource(
  repository: BrowserProjectRepository,
  projectRef: string,
  resource: BrowserRawResource,
): Promise<BrowserWriteReceipt> {
  const object = await repository.readObject(projectRef, projectManifestPath)
  const manifest = parseBrowserProjectManifest(object.bytes)
  const currentResources = manifest.resources
  const existing = currentResources.find((item) =>
    item.kind === "raw_file" && item.checksum === resource.checksum
  )
  const nextResources = existing ? currentResources : [...currentResources, resource]
  const updatedAt = existing && typeof manifest.updated_at === "string"
    ? manifest.updated_at
    : new Date().toISOString()
  const nextManifest: JsonObject = {
    ...manifest,
    updated_at: updatedAt,
    resources: nextResources,
  }
  return repository.writeObject(projectRef, {
    path: projectManifestPath,
    bytes: jsonBytes(nextManifest),
    metadata: { kind: "project_manifest" },
  })
}

function parseBrowserProjectManifest(bytes: Uint8Array<ArrayBuffer>): JsonObject & {
  resources: JsonObject[]
  updated_at?: JsonValue
} {
  const data = JSON.parse(textDecoder.decode(bytes)) as JsonValue
  if (!isJsonObject(data) || data.schema_version !== projectSchemaVersion) {
    throw new BrowserProjectRepositoryError({
      code: "invalid_input",
      message: "Browser project manifest is not project-v1.",
      target: projectManifestPath,
    })
  }
  if (!Array.isArray(data.resources)) {
    throw new BrowserProjectRepositoryError({
      code: "invalid_input",
      message: "Browser project manifest resources must be a list.",
      target: `${projectManifestPath}.resources`,
    })
  }
  for (const [index, resource] of data.resources.entries()) {
    if (!isJsonObject(resource)) {
      throw new BrowserProjectRepositoryError({
        code: "invalid_input",
        message: "Browser project manifest resource must be an object.",
        target: `${projectManifestPath}.resources[${index}]`,
      })
    }
  }
  return data as JsonObject & { resources: JsonObject[]; updated_at?: JsonValue }
}

function rawPersistenceErrorPayload(error: unknown): BrowserProjectRepositoryErrorPayload {
  if (error instanceof BrowserProjectRepositoryError) {
    return error.toJSON()
  }
  return {
    code: "storage_failed",
    message: error instanceof Error ? error.message : "Raw input persistence failed.",
    target: "raw_input",
  }
}

function jsonBytes(data: JsonObject): Uint8Array<ArrayBuffer> {
  return textEncoder.encode(`${JSON.stringify(data, null, 2)}\n`) as Uint8Array<ArrayBuffer>
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
