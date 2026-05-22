import { unzipSync, zipSync, type Zippable } from "fflate"
import { checksumBrowserStorageBytes } from "../repository"
import type { JsonObject, JsonValue } from "../shell"
import { projectManifestPath } from "./projectContentBridge"

export const browserProjectBundleSuffix = ".rxnflow.zip" as const
export const browserProjectBundleTime = new Date(Date.UTC(2026, 4, 14, 0, 0, 0))

export type BrowserProjectBundleEntry = {
  name: string
  projectRelativePath: string
  bytes: Uint8Array<ArrayBuffer>
  byteSize: number
  checksum: `sha256:${string}`
}

export type BrowserProjectBundleValidationState = "not_checked" | "valid" | "warning" | "error"

export type BrowserProjectBundleSummary = {
  bundleName: string
  rootName: string
  projectId?: string | null
  projectName?: string | null
  fileCount: number
  byteSize: number
  checksum: `sha256:${string}`
  validation: {
    state: BrowserProjectBundleValidationState
    issueCount: number
  }
}

export type BrowserProjectBundleErrorCode =
  | "invalid_bundle"
  | "invalid_input"
  | "zip_failed"

export type BrowserProjectBundleError = {
  code: BrowserProjectBundleErrorCode
  message: string
  target?: string | null
  details?: unknown
}

export type BrowserProjectBundleArchiveResult =
  | { ok: true; summary: BrowserProjectBundleSummary; bytes: Uint8Array<ArrayBuffer> }
  | { ok: false; error: BrowserProjectBundleError }

export type BrowserProjectBundleReadResult =
  | { ok: true; summary: BrowserProjectBundleSummary; entries: BrowserProjectBundleEntry[] }
  | { ok: false; error: BrowserProjectBundleError }

type CreateBrowserProjectBundleArchiveInput = {
  bundleName?: string
  rootName: string
  entries: readonly BrowserProjectBundleEntry[]
}

type ReadBrowserProjectBundleArchiveInput = {
  bundleName: string
  bytes: Uint8Array<ArrayBuffer>
}

type CentralDirectoryEntry = {
  name: string
  isDirectory: boolean
  externalAttributes: number
}

type SafeBundleEntry = {
  name: string
  projectRelativePath: string
  bytes: Uint8Array<ArrayBuffer>
}

const allowedProjectRoots = new Set([".rxnflow", "inputs", "exports"])
const skippedFileNames = new Set([".DS_Store"])
const textDecoder = new TextDecoder()

export async function createBrowserProjectBundleArchive(
  input: CreateBrowserProjectBundleArchiveInput,
): Promise<BrowserProjectBundleArchiveResult> {
  try {
    const rootName = validateBundleRootName(input.rootName)
    const safeEntries = input.entries
      .filter((entry) => !shouldSkipProjectRelativePath(entry.projectRelativePath))
      .map((entry) => safeEntryFromProjectEntry(entry))
      .sort((left, right) => left.projectRelativePath.localeCompare(right.projectRelativePath))
    const manifest = safeEntries.find((entry) => entry.projectRelativePath === projectManifestPath)
    if (!manifest) {
      return {
        ok: false,
        error: invalidInput(
          "Browser project bundle requires .rxnflow/manifest.json.",
          projectManifestPath,
        ),
      }
    }

    const zippable: Zippable = {}
    for (const entry of safeEntries) {
      zippable[`${rootName}/${entry.projectRelativePath}`] = [
        entry.bytes,
        {
          mtime: browserProjectBundleTime,
          os: 3,
          attrs: 0o644 << 16,
        },
      ]
    }

    const bytes = zipSync(zippable, { level: 6 }) as Uint8Array<ArrayBuffer>
    const checksum = await checksumBrowserStorageBytes(bytes)
    const manifestSummary = manifestProjectSummary(manifest.bytes)
    return {
      ok: true,
      bytes,
      summary: {
        bundleName: input.bundleName ?? `${rootName}${browserProjectBundleSuffix}`,
        rootName,
        projectId: manifestSummary.projectId,
        projectName: manifestSummary.projectName,
        fileCount: safeEntries.length,
        byteSize: bytes.byteLength,
        checksum: checksum as `sha256:${string}`,
        validation: manifestSummary.validation,
      },
    }
  } catch (error) {
    return { ok: false, error: bundleErrorPayload(error, "zip_failed", "Failed to create project bundle archive.") }
  }
}

export async function inspectBrowserProjectBundleArchive(
  input: ReadBrowserProjectBundleArchiveInput,
): Promise<BrowserProjectBundleReadResult> {
  return readBrowserProjectBundleArchive(input)
}

export async function readBrowserProjectBundleArchive(
  input: ReadBrowserProjectBundleArchiveInput,
): Promise<BrowserProjectBundleReadResult> {
  try {
    const centralEntries = inspectZipCentralDirectory(input.bytes)
    const inspection = inspectBundleEntries(centralEntries)
    if (!inspection.ok) return inspection

    const unzipped = unzipSync(input.bytes)
    const entries: BrowserProjectBundleEntry[] = []
    for (const centralEntry of inspection.entries) {
      const bytes = unzipped[centralEntry.name]
      if (!bytes) {
        return {
          ok: false,
          error: invalidBundle("Project bundle entry could not be read from zip data.", centralEntry.name),
        }
      }
      const projectRelativePath = entryProjectRelativePath(centralEntry.name)
      entries.push({
        name: centralEntry.name,
        projectRelativePath,
        bytes: bytes as Uint8Array<ArrayBuffer>,
        byteSize: bytes.byteLength,
        checksum: await checksumBrowserStorageBytes(bytes as Uint8Array<ArrayBuffer>) as `sha256:${string}`,
      })
    }

    const manifest = entries.find((entry) => entry.projectRelativePath === projectManifestPath)
    if (!manifest) {
      return {
        ok: false,
        error: invalidBundle("Project bundle is missing .rxnflow/manifest.json.", `${inspection.rootName}/${projectManifestPath}`),
      }
    }

    const checksum = await checksumBrowserStorageBytes(input.bytes)
    const manifestSummary = manifestProjectSummary(manifest.bytes)
    return {
      ok: true,
      entries,
      summary: {
        bundleName: input.bundleName,
        rootName: inspection.rootName,
        projectId: manifestSummary.projectId,
        projectName: manifestSummary.projectName,
        fileCount: entries.length,
        byteSize: input.bytes.byteLength,
        checksum: checksum as `sha256:${string}`,
        validation: manifestSummary.validation,
      },
    }
  } catch (error) {
    return { ok: false, error: bundleErrorPayload(error, "zip_failed", "Failed to read project bundle archive.") }
  }
}

function safeEntryFromProjectEntry(entry: BrowserProjectBundleEntry): SafeBundleEntry {
  const projectRelativePath = validateProjectRelativeBundlePath(entry.projectRelativePath)
  return {
    name: entry.name || basename(projectRelativePath),
    projectRelativePath,
    bytes: entry.bytes,
  }
}

function inspectBundleEntries(
  entries: readonly CentralDirectoryEntry[],
): { ok: true; rootName: string; entries: CentralDirectoryEntry[] } | { ok: false; error: BrowserProjectBundleError } {
  if (entries.length === 0) {
    return { ok: false, error: invalidBundle("Project bundle is empty.", "zip_entry") }
  }

  const roots = new Set<string>()
  const seenNames = new Set<string>()
  let manifestSeen = false
  const fileEntries: CentralDirectoryEntry[] = []

  for (const entry of entries) {
    const normalized = normalizeBundleEntryName(entry.name, entry.isDirectory)
    const pathError = validateBundleEntryName(normalized, entry.isDirectory)
    if (pathError) return { ok: false, error: pathError }
    if (isSymlinkExternalAttributes(entry.externalAttributes)) {
      return { ok: false, error: invalidBundle("Project bundle entry must not be a symlink.", normalized) }
    }
    if (seenNames.has(normalized)) {
      return { ok: false, error: invalidBundle("Project bundle contains duplicate entries.", normalized) }
    }
    seenNames.add(normalized)

    const parts = pathParts(normalized)
    const rootName = parts[0]
    roots.add(rootName)
    if (roots.size > 1) {
      return {
        ok: false,
        error: invalidBundle("Project bundle must contain exactly one project root.", normalized, {
          roots: Array.from(roots).sort(),
        }),
      }
    }
    if (!entry.isDirectory) {
      fileEntries.push({ ...entry, name: normalized })
      if (normalized === `${rootName}/${projectManifestPath}`) {
        manifestSeen = true
      }
    }
  }

  const rootName = Array.from(roots)[0]
  if (!manifestSeen) {
    return {
      ok: false,
      error: invalidBundle("Project bundle is missing .rxnflow/manifest.json.", `${rootName}/${projectManifestPath}`),
    }
  }
  return { ok: true, rootName, entries: fileEntries }
}

function validateBundleRootName(rootName: string): string {
  if (typeof rootName !== "string" || rootName.trim() === "") {
    throw invalidInput("Project bundle root name is required.", "rootName")
  }
  if (rootName.includes("/") || rootName.includes("\\")) {
    throw invalidInput("Project bundle root name must be a single POSIX segment.", rootName)
  }
  if (rootName === "." || rootName === ".." || rootName === "__MACOSX") {
    throw invalidInput("Project bundle root name is invalid.", rootName)
  }
  return rootName
}

function validateBundleEntryName(name: string, isDirectory: boolean): BrowserProjectBundleError | null {
  if (name.trim() === "") {
    return invalidBundle("Project bundle entry path is required.", "zip_entry")
  }
  if (name.includes("\\")) {
    return invalidBundle("Project bundle entry path must be POSIX relative.", name)
  }
  if (name.startsWith("/")) {
    return invalidBundle("Project bundle entry path must be relative.", name)
  }
  const parts = pathParts(name)
  if (parts.length === 0 || parts.includes(".") || parts.includes("..") || parts.some((part) => part === "")) {
    return invalidBundle("Project bundle entry path must be safe and project-relative.", name)
  }
  const rootError = validateBundleRootNameForEntry(parts[0], name)
  if (rootError) return rootError
  if (parts.length === 1) {
    return isDirectory
      ? null
      : invalidBundle("Project bundle entries must be under the project root directory.", name)
  }
  return validateProjectRelativeBundlePathError(parts.slice(1).join("/"), name, isDirectory)
}

function validateBundleRootNameForEntry(rootName: string, target: string): BrowserProjectBundleError | null {
  if (rootName === "__MACOSX") {
    return invalidBundle("Project bundle must not contain __MACOSX metadata.", target)
  }
  if (rootName === "" || rootName === "." || rootName === ".." || rootName.includes("\\")) {
    return invalidBundle("Project bundle root name is invalid.", target)
  }
  return null
}

function validateProjectRelativeBundlePath(path: string): string {
  const pathError = validateProjectRelativeBundlePathError(path, path)
  if (pathError) throw pathError
  return path
}

function validateProjectRelativeBundlePathError(
  path: string,
  target: string,
  isDirectory = false,
): BrowserProjectBundleError | null {
  if (typeof path !== "string" || path.trim() === "") {
    return invalidBundle("Project bundle project-relative path is required.", target)
  }
  if (path.includes("\\")) {
    return invalidBundle("Project bundle project-relative path must be POSIX relative.", target)
  }
  if (path.startsWith("/")) {
    return invalidBundle("Project bundle project-relative path must be safe.", target)
  }
  const parts = pathParts(path)
  if (
    parts.length === 0 ||
    parts.includes(".") ||
    parts.includes("..") ||
    parts.some((part) => part === "")
  ) {
    return invalidBundle("Project bundle project-relative path must be safe.", target)
  }
  if (parts.some((part) => part === "__MACOSX")) {
    return invalidBundle("Project bundle must not contain __MACOSX metadata.", target)
  }
  if (parts.length === 1 && !isDirectory) {
    return invalidBundle("Project bundle entries must be files under an allowed content root.", target)
  }
  if (!allowedProjectRoots.has(parts[0])) {
    return invalidBundle("Project bundle entry is outside the allowed project content roots.", target)
  }
  if (parts[0] === "inputs" && parts[1] !== "raw") {
    return invalidBundle("Project bundle inputs entries must be under inputs/raw/.", target)
  }
  return null
}

function shouldSkipProjectRelativePath(path: string): boolean {
  const parts = pathParts(path)
  return parts.some((part) => part === "__MACOSX") || skippedFileNames.has(parts.at(-1) ?? "")
}

function normalizeBundleEntryName(name: string, isDirectory: boolean): string {
  return isDirectory ? name.replace(/\/+$/, "") : name
}

function pathParts(path: string): string[] {
  return path.split("/")
}

function entryProjectRelativePath(entryName: string): string {
  return pathParts(entryName).slice(1).join("/")
}

function basename(path: string): string {
  return pathParts(path).at(-1) ?? path
}

function manifestProjectSummary(bytes: Uint8Array<ArrayBuffer>): {
  projectId: string | null
  projectName: string | null
  validation: BrowserProjectBundleSummary["validation"]
} {
  try {
    const data = JSON.parse(textDecoder.decode(bytes)) as JsonValue
    if (!isJsonObject(data)) {
      return { projectId: null, projectName: null, validation: { state: "warning", issueCount: 1 } }
    }
    return {
      projectId: typeof data.id === "string" ? data.id : null,
      projectName: typeof data.name === "string" ? data.name : null,
      validation: {
        state: data.schema_version === "project-v1" ? "not_checked" : "warning",
        issueCount: data.schema_version === "project-v1" ? 0 : 1,
      },
    }
  } catch {
    return { projectId: null, projectName: null, validation: { state: "warning", issueCount: 1 } }
  }
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function inspectZipCentralDirectory(bytes: Uint8Array<ArrayBuffer>): CentralDirectoryEntry[] {
  const eocdOffset = findEndOfCentralDirectory(bytes)
  const diskNumber = readUint16(bytes, eocdOffset + 4)
  const centralDirectoryDisk = readUint16(bytes, eocdOffset + 6)
  const entryCount = readUint16(bytes, eocdOffset + 10)
  const centralDirectorySize = readUint32(bytes, eocdOffset + 12)
  const centralDirectoryOffset = readUint32(bytes, eocdOffset + 16)
  if (diskNumber !== 0 || centralDirectoryDisk !== 0) {
    throw invalidBundle("Project bundle must not use multi-disk zip archives.", "zip_entry")
  }
  if (
    entryCount === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw invalidBundle("Project bundle Zip64 archives are not supported.", "zip_entry")
  }
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize
  if (
    centralDirectoryOffset >= bytes.length ||
    centralDirectoryEnd > eocdOffset ||
    centralDirectoryEnd < centralDirectoryOffset
  ) {
    throw invalidBundle("Project bundle central directory is truncated.", "zip_entry")
  }

  const entries: CentralDirectoryEntry[] = []
  let offset = centralDirectoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(bytes, offset) !== 0x02014b50) {
      throw invalidBundle("Project bundle central directory is malformed.", "zip_entry")
    }

    const fileNameLength = readUint16(bytes, offset + 28)
    const extraLength = readUint16(bytes, offset + 30)
    const commentLength = readUint16(bytes, offset + 32)
    const externalAttributes = readUint32(bytes, offset + 38)
    const fileNameStart = offset + 46
    const fileNameEnd = fileNameStart + fileNameLength
    const nextOffset = fileNameEnd + extraLength + commentLength
    if (nextOffset > centralDirectoryEnd) {
      throw invalidBundle("Project bundle central directory is truncated.", "zip_entry")
    }
    const name = textDecoder.decode(bytes.slice(fileNameStart, fileNameEnd))
    entries.push({
      name,
      isDirectory: name.endsWith("/"),
      externalAttributes,
    })
    offset = nextOffset
  }
  if (entries.length === 0 || offset !== centralDirectoryEnd) {
    throw invalidBundle("Project bundle is not a valid zip file.", "zip_entry")
  }
  return entries
}

function findEndOfCentralDirectory(bytes: Uint8Array<ArrayBuffer>): number {
  const minimumOffset = Math.max(0, bytes.length - 22 - 0xffff)
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) {
      return offset
    }
  }
  throw invalidBundle("Project bundle is not a valid zip file.", "zip_entry")
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0
}

function isSymlinkExternalAttributes(externalAttributes: number): boolean {
  return ((externalAttributes >>> 16) & 0o170000) === 0o120000
}

function invalidInput(message: string, target: string, details?: unknown): BrowserProjectBundleError {
  return { code: "invalid_input", message, target, details }
}

function invalidBundle(message: string, target: string, details?: unknown): BrowserProjectBundleError {
  return { code: "invalid_bundle", message, target, details }
}

function bundleErrorPayload(
  error: unknown,
  fallbackCode: BrowserProjectBundleErrorCode,
  fallbackMessage: string,
): BrowserProjectBundleError {
  if (isBundleError(error)) return error
  return {
    code: fallbackCode,
    message: error instanceof Error ? error.message : fallbackMessage,
    target: "project_bundle",
  }
}

function isBundleError(error: unknown): error is BrowserProjectBundleError {
  if (!error || typeof error !== "object" || Array.isArray(error)) return false
  const data = error as { code?: unknown; message?: unknown }
  return (
    (data.code === "invalid_bundle" || data.code === "invalid_input" || data.code === "zip_failed") &&
    typeof data.message === "string"
  )
}
