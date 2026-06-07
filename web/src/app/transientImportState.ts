import type { ImportBatchSummary, ImportRegisterAllData, JsonObject, ShellError, ShellWarning } from "../shell"
import type { RawPersistenceState } from "./rawInputPersistence"

export const defaultInlineImportByteLimit = 12 * 1024 * 1024

export type ImportPreviewSourceKind = "path" | "inline_bytes"

export type WebImportFile = {
  id: string
  name: string
  size: number
  mimeType?: string
  lastModified?: number
  storagePath?: string
  file?: File
  sourceKind?: ImportPreviewSourceKind
  rawPersistence?: RawPersistenceState
}

export type TransientImportStatus =
  | "idle"
  | "selecting"
  | "previewing"
  | "ready"
  | "registering"
  | "registered"
  | "error"

export type TransientImportState = {
  status: TransientImportStatus
  selectedFiles: WebImportFile[]
  expectedFormat: string
  strict: boolean
  activeBatch?: ImportBatchSummary
  registeredObjectIds: string[]
  warnings: ShellWarning[]
  error?: ShellError
}

export const importFormatOptions = [
  "auto",
  "gaussian-log",
  "orca-output",
  "xyz",
  "extxyz",
  "maple-output",
  "maple-xyz",
] as const

export type ImportFormatOption = (typeof importFormatOptions)[number]

export const initialTransientImportState: TransientImportState = {
  status: "idle",
  selectedFiles: [],
  expectedFormat: "auto",
  strict: false,
  registeredObjectIds: [],
  warnings: [],
}

export function filesToWebImportFiles(files: FileList | File[]): WebImportFile[] {
  return Array.from(files).map((file, index) => ({
    id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
    name: file.name,
    size: file.size,
    mimeType: file.type || undefined,
    lastModified: file.lastModified || undefined,
    storagePath: `transient/${file.name}`,
    file,
    sourceKind: "path",
  }))
}

export function importPreviewArgs(state: TransientImportState, sessionId?: string): JsonObject {
  const sourcePaths = state.selectedFiles
    .map((file) => file.storagePath)
    .filter((path): path is string => Boolean(path))

  return {
    session_id: sessionId ?? "",
    source_paths: sourcePaths,
    ...(state.expectedFormat === "auto" ? {} : { expected_format: state.expectedFormat }),
    strict: state.strict,
  }
}

export type ImportPreviewArgsBuildResult =
  | { ok: true; args: JsonObject; files: WebImportFile[] }
  | { ok: false; error: ShellError; files: WebImportFile[] }

export async function importPreviewArgsFromFiles(
  state: TransientImportState,
  sessionId?: string,
  options: { preferInlineBytes?: boolean; inlineByteLimit?: number } = {},
): Promise<ImportPreviewArgsBuildResult> {
  const preferInlineBytes = options.preferInlineBytes ?? false
  const inlineByteLimit = options.inlineByteLimit ?? defaultInlineImportByteLimit
  if (!preferInlineBytes) {
    return {
      ok: true,
      args: importPreviewArgs(state, sessionId),
      files: state.selectedFiles.map((file) => ({ ...file, sourceKind: "path" })),
    }
  }

  const sources = []
  const files: WebImportFile[] = []
  for (const selectedFile of state.selectedFiles) {
    if (selectedFile.file) {
      if (selectedFile.file.size > inlineByteLimit) {
        return {
          ok: false,
          error: {
            code: "payload_too_large",
            message: `Import file exceeds the ${formatFileSize(inlineByteLimit)} inline preview limit.`,
            target: "bytes_base64",
            details: {
              filename: selectedFile.name,
              byte_size: selectedFile.file.size,
              limit: inlineByteLimit,
            },
          },
          files: state.selectedFiles.map((file) => ({
            ...file,
            sourceKind: file.file ? "inline_bytes" : "path",
          })),
        }
      }
      sources.push({
        kind: "inline_bytes",
        filename: selectedFile.name,
        bytes_base64: await fileToBase64(selectedFile.file),
        mime_type: selectedFile.mimeType ?? null,
      })
      files.push({ ...selectedFile, sourceKind: "inline_bytes" })
      continue
    }

    if (selectedFile.storagePath) {
      sources.push({
        kind: "path",
        source_path: selectedFile.storagePath,
      })
      files.push({ ...selectedFile, sourceKind: "path" })
    }
  }

  return {
    ok: true,
    args: {
      session_id: sessionId ?? "",
      sources,
      ...(state.expectedFormat === "auto" ? {} : { expected_format: state.expectedFormat }),
      strict: state.strict,
    },
    files,
  }
}

export function canPreviewImport(state: TransientImportState): boolean {
  return state.selectedFiles.length > 0 && state.status !== "previewing" && state.status !== "registering"
}

export function canRegisterImport(state: TransientImportState): boolean {
  return (
    state.status !== "registering" &&
    Boolean(state.activeBatch?.items.some((item) => item.status === "needs_confirmation" && item.preview))
  )
}

export function mergeRegisteredObjects(
  currentObjects: ImportRegisterAllData["objects"],
  nextObjects: ImportRegisterAllData["objects"],
): ImportRegisterAllData["objects"] {
  const order: string[] = []
  const byId = new Map<string, ImportRegisterAllData["objects"][number]>()
  for (const object of currentObjects) {
    if (!byId.has(object.id)) order.push(object.id)
    byId.set(object.id, object)
  }
  for (const object of nextObjects) {
    if (!byId.has(object.id)) order.push(object.id)
    byId.set(object.id, object)
  }
  return order
    .map((id) => byId.get(id))
    .filter((object): object is ImportRegisterAllData["objects"][number] => Boolean(object))
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}
