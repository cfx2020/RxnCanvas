import {
  BrowserProjectRepositoryError,
  browserProjectBackendId,
  checksumBrowserStorageBytes,
  validateBrowserProjectRef,
  validateBrowserStoragePath,
  type BrowserProjectRef,
  type BrowserProjectRepository,
  type BrowserStorageObject,
  type BrowserWriteReceipt,
} from "./types"

type ObjectRecord = {
  projectRef: string
  path: string
  bytes: Uint8Array<ArrayBuffer>
  checksum: string
  metadata: BrowserStorageObject["metadata"]
  updatedAt: string
}

export type MemoryBrowserProjectRepositoryOptions = {
  quotaBytes?: number
}

export class MemoryBrowserProjectRepository implements BrowserProjectRepository {
  private readonly projects = new Map<string, BrowserProjectRef>()
  private readonly objects = new Map<string, ObjectRecord>()
  private nextId = 1

  constructor(private readonly options: MemoryBrowserProjectRepositoryOptions = {}) {}

  async listProjects(): Promise<BrowserProjectRef[]> {
    return Array.from(this.projects.values()).sort(compareProjects)
  }

  async createProject(input: { name: string }): Promise<BrowserProjectRef> {
    if (typeof input.name !== "string" || input.name.trim() === "") {
      throw new BrowserProjectRepositoryError({
        code: "invalid_input",
        message: "Browser local project name is required.",
        target: "name",
      })
    }

    const now = new Date().toISOString()
    const id = `project-${this.nextId++}`
    const project: BrowserProjectRef = {
      id,
      name: input.name,
      backendId: browserProjectBackendId,
      projectRef: `browser-project:${id}`,
      createdAt: now,
      updatedAt: now,
      localOnly: true,
    }
    this.projects.set(project.projectRef, project)
    return { ...project }
  }

  async readObject(projectRef: string, path: string): Promise<BrowserStorageObject> {
    const record = this.getObjectRecord(projectRef, path)
    if (!record) {
      throw new BrowserProjectRepositoryError({
        code: "object_not_found",
        message: "Browser local storage object does not exist.",
        target: "path",
        details: { path },
      })
    }
    return objectFromRecord(record)
  }

  async writeObject(
    projectRef: string,
    object: BrowserStorageObject,
  ): Promise<BrowserWriteReceipt> {
    const safeProjectRef = validateBrowserProjectRef(projectRef)
    const path = validateBrowserStoragePath(object.path)
    const bytes = copyBytes(object.bytes)
    const checksum = await checksumBrowserStorageBytes(bytes)
    const updatedAt = new Date().toISOString()
    this.assertWithinQuota(safeProjectRef, path, bytes.byteLength)

    this.objects.set(objectKey(safeProjectRef, path), {
      projectRef: safeProjectRef,
      path,
      bytes,
      checksum,
      metadata: { ...object.metadata },
      updatedAt,
    })

    return {
      path,
      checksum,
      byteSize: bytes.byteLength,
      updatedAt,
      backendId: browserProjectBackendId,
    }
  }

  async exists(projectRef: string, path: string): Promise<boolean> {
    const safeProjectRef = validateBrowserProjectRef(projectRef)
    const safePath = validateBrowserStoragePath(path)
    return this.objects.has(objectKey(safeProjectRef, safePath))
  }

  async listObjects(projectRef: string, prefix: string): Promise<BrowserStorageObject[]> {
    const safeProjectRef = validateBrowserProjectRef(projectRef)
    const safePrefix = validateBrowserStoragePath(prefix)
    const prefixRoot = `${safePrefix.replace(/\/+$/, "")}/`
    return Array.from(this.objects.values())
      .filter(
        (record) =>
          record.projectRef === safeProjectRef &&
          (record.path === safePrefix || record.path.startsWith(prefixRoot)),
      )
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(objectFromRecord)
  }

  async deleteObject(projectRef: string, path: string): Promise<void> {
    const safeProjectRef = validateBrowserProjectRef(projectRef)
    const safePath = validateBrowserStoragePath(path)
    this.objects.delete(objectKey(safeProjectRef, safePath))
  }

  private getObjectRecord(projectRef: string, path: string): ObjectRecord | undefined {
    const safeProjectRef = validateBrowserProjectRef(projectRef)
    const safePath = validateBrowserStoragePath(path)
    return this.objects.get(objectKey(safeProjectRef, safePath))
  }

  private assertWithinQuota(projectRef: string, path: string, byteSize: number): void {
    if (this.options.quotaBytes === undefined) {
      return
    }

    let currentBytes = 0
    for (const record of this.objects.values()) {
      if (record.projectRef === projectRef) {
        currentBytes += record.bytes.byteLength
      }
    }
    const existingBytes = this.objects.get(objectKey(projectRef, path))?.bytes.byteLength ?? 0
    const requestedBytes = currentBytes - existingBytes + byteSize
    if (requestedBytes <= this.options.quotaBytes) {
      return
    }

    throw new BrowserProjectRepositoryError({
      code: "storage_quota_exceeded",
      message: "Browser local storage quota would be exceeded.",
      target: "quota",
      details: {
        quotaBytes: this.options.quotaBytes,
        requestedBytes,
        currentBytes,
      },
    })
  }
}

function compareProjects(left: BrowserProjectRef, right: BrowserProjectRef): number {
  return (
    left.name.localeCompare(right.name) ||
    left.updatedAt.localeCompare(right.updatedAt) ||
    left.id.localeCompare(right.id)
  )
}

function objectKey(projectRef: string, path: string): string {
  return `${projectRef}\u0000${path}`
}

function objectFromRecord(record: ObjectRecord): BrowserStorageObject {
  return {
    path: record.path,
    bytes: copyBytes(record.bytes),
    checksum: record.checksum,
    metadata: { ...record.metadata },
  }
}

function copyBytes(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes)
}
