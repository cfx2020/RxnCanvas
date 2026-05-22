import type { JsonObject, JsonValue } from "../shell"

export const browserProjectBackendId = "browser-local-indexeddb-opfs-v1" as const

export type BrowserProjectRef = {
  id: string
  name: string
  backendId: typeof browserProjectBackendId
  projectRef: string
  createdAt: string
  updatedAt: string
  localOnly: true
}

export type BrowserStorageObject = {
  path: string
  bytes: Uint8Array<ArrayBuffer>
  checksum?: string
  metadata: JsonObject
}

export type BrowserWriteReceipt = {
  path: string
  checksum: string
  byteSize: number
  updatedAt: string
  backendId: typeof browserProjectBackendId
}

export type BrowserProjectRepositoryErrorCode =
  | "invalid_input"
  | "object_not_found"
  | "storage_unavailable"
  | "storage_quota_exceeded"
  | "storage_failed"

export type BrowserProjectRepositoryErrorPayload = JsonObject & {
  code: BrowserProjectRepositoryErrorCode
  message: string
  target?: string | null
  details?: JsonValue
}

export class BrowserProjectRepositoryError extends Error {
  readonly code: BrowserProjectRepositoryErrorCode
  readonly target?: string | null
  readonly details?: JsonValue

  constructor(payload: BrowserProjectRepositoryErrorPayload) {
    super(payload.message)
    this.name = "BrowserProjectRepositoryError"
    this.code = payload.code
    this.target = payload.target
    this.details = payload.details
  }

  toJSON(): BrowserProjectRepositoryErrorPayload {
    const payload: BrowserProjectRepositoryErrorPayload = {
      code: this.code,
      message: this.message,
      target: this.target ?? null,
    }
    if (this.details !== undefined) {
      payload.details = this.details
    }
    return payload
  }
}

export interface BrowserProjectRepository {
  listProjects(): Promise<BrowserProjectRef[]>
  createProject(input: { name: string }): Promise<BrowserProjectRef>
  readObject(projectRef: string, path: string): Promise<BrowserStorageObject>
  writeObject(
    projectRef: string,
    object: BrowserStorageObject,
  ): Promise<BrowserWriteReceipt>
  exists(projectRef: string, path: string): Promise<boolean>
  listObjects(projectRef: string, prefix: string): Promise<BrowserStorageObject[]>
  deleteObject(projectRef: string, path: string): Promise<void>
}

export function validateBrowserProjectRef(projectRef: string): string {
  if (typeof projectRef !== "string" || projectRef.trim() === "") {
    throw new BrowserProjectRepositoryError({
      code: "invalid_input",
      message: "Browser local project reference is required.",
      target: "project_ref",
    })
  }
  return projectRef
}

export function validateBrowserStoragePath(path: string): string {
  if (typeof path !== "string" || path.trim() === "") {
    throw invalidPathError("Project storage path is required.")
  }
  if (path.includes("\\")) {
    throw invalidPathError("Project storage path must be POSIX relative.")
  }
  if (
    path.startsWith("/") ||
    path === "." ||
    path.split("/").some((part) => part === "..")
  ) {
    throw invalidPathError("Project storage path must be project-relative.")
  }
  return path
}

export async function checksumBrowserStorageBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digestInput =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const digest = await crypto.subtle.digest("SHA-256", digestInput)
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
  return `sha256:${hex}`
}

function invalidPathError(message: string): BrowserProjectRepositoryError {
  return new BrowserProjectRepositoryError({
    code: "invalid_input",
    message,
    target: "path",
  })
}
