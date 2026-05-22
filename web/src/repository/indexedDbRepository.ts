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

const databaseName = "rxnflow-browser-projects"
const databaseVersion = 1
const projectStoreName = "projects"
const objectStoreName = "objects"
const objectProjectRefIndex = "projectRef"

type ProjectObjectRecord = {
  key: string
  projectRef: string
  path: string
  bytes: ArrayBuffer
  checksum: string
  metadata: BrowserStorageObject["metadata"]
  byteSize: number
  updatedAt: string
}

export class IndexedDbBrowserProjectRepository implements BrowserProjectRepository {
  constructor(private readonly indexedDb: IDBFactory = getIndexedDbFactory()) {}

  async listProjects(): Promise<BrowserProjectRef[]> {
    const db = await this.openDatabase()
    try {
      const transaction = db.transaction(projectStoreName, "readonly")
      const store = transaction.objectStore(projectStoreName)
      const projects = await requestToPromise<BrowserProjectRef[]>(store.getAll())
      await transactionDone(transaction)
      return projects.sort(compareProjects)
    } finally {
      db.close()
    }
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
    const id = createProjectId()
    const project: BrowserProjectRef = {
      id,
      name: input.name,
      backendId: browserProjectBackendId,
      projectRef: `browser-project:${id}`,
      createdAt: now,
      updatedAt: now,
      localOnly: true,
    }

    const db = await this.openDatabase()
    try {
      const transaction = db.transaction(projectStoreName, "readwrite")
      transaction.objectStore(projectStoreName).put(project)
      await transactionDone(transaction)
      return project
    } catch (error) {
      throw mapStorageError(error)
    } finally {
      db.close()
    }
  }

  async readObject(projectRef: string, path: string): Promise<BrowserStorageObject> {
    const record = await this.getObjectRecord(projectRef, path)
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
    const record: ProjectObjectRecord = {
      key: objectKey(safeProjectRef, path),
      projectRef: safeProjectRef,
      path,
      bytes: copyArrayBuffer(bytes),
      checksum,
      metadata: { ...object.metadata },
      byteSize: bytes.byteLength,
      updatedAt,
    }

    const db = await this.openDatabase()
    try {
      const transaction = db.transaction(objectStoreName, "readwrite")
      transaction.objectStore(objectStoreName).put(record)
      await transactionDone(transaction)
      return {
        path,
        checksum,
        byteSize: bytes.byteLength,
        updatedAt,
        backendId: browserProjectBackendId,
      }
    } catch (error) {
      throw mapStorageError(error)
    } finally {
      db.close()
    }
  }

  async exists(projectRef: string, path: string): Promise<boolean> {
    return (await this.getObjectRecord(projectRef, path)) !== undefined
  }

  async listObjects(projectRef: string, prefix: string): Promise<BrowserStorageObject[]> {
    const safeProjectRef = validateBrowserProjectRef(projectRef)
    const safePrefix = validateBrowserStoragePath(prefix)
    const prefixRoot = `${safePrefix.replace(/\/+$/, "")}/`

    const db = await this.openDatabase()
    try {
      const transaction = db.transaction(objectStoreName, "readonly")
      const store = transaction.objectStore(objectStoreName)
      const index = store.index(objectProjectRefIndex)
      const records = await requestToPromise<ProjectObjectRecord[]>(index.getAll(safeProjectRef))
      await transactionDone(transaction)
      return records
        .filter((record) => record.path === safePrefix || record.path.startsWith(prefixRoot))
        .sort((left, right) => left.path.localeCompare(right.path))
        .map(objectFromRecord)
    } finally {
      db.close()
    }
  }

  async deleteObject(projectRef: string, path: string): Promise<void> {
    const safeProjectRef = validateBrowserProjectRef(projectRef)
    const safePath = validateBrowserStoragePath(path)

    const db = await this.openDatabase()
    try {
      const transaction = db.transaction(objectStoreName, "readwrite")
      transaction.objectStore(objectStoreName).delete(objectKey(safeProjectRef, safePath))
      await transactionDone(transaction)
    } catch (error) {
      throw mapStorageError(error)
    } finally {
      db.close()
    }
  }

  private async getObjectRecord(projectRef: string, path: string): Promise<ProjectObjectRecord | undefined> {
    const safeProjectRef = validateBrowserProjectRef(projectRef)
    const safePath = validateBrowserStoragePath(path)

    const db = await this.openDatabase()
    try {
      const transaction = db.transaction(objectStoreName, "readonly")
      const store = transaction.objectStore(objectStoreName)
      const record = await requestToPromise<ProjectObjectRecord | undefined>(
        store.get(objectKey(safeProjectRef, safePath)),
      )
      await transactionDone(transaction)
      return record
    } finally {
      db.close()
    }
  }

  private async openDatabase(): Promise<IDBDatabase> {
    try {
      return await openRepositoryDatabase(this.indexedDb)
    } catch (error) {
      throw mapStorageError(error)
    }
  }
}

export function createBrowserProjectRepository(): BrowserProjectRepository {
  return new IndexedDbBrowserProjectRepository(getIndexedDbFactory())
}

function getIndexedDbFactory(): IDBFactory {
  if (typeof indexedDB === "undefined") {
    throw new BrowserProjectRepositoryError({
      code: "storage_unavailable",
      message: "IndexedDB is not available in this browser context.",
      target: "indexedDB",
    })
  }
  return indexedDB
}

function openRepositoryDatabase(indexedDb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(projectStoreName)) {
        db.createObjectStore(projectStoreName, { keyPath: "projectRef" })
      }
      if (!db.objectStoreNames.contains(objectStoreName)) {
        const objectStore = db.createObjectStore(objectStoreName, { keyPath: "key" })
        objectStore.createIndex(objectProjectRefIndex, "projectRef", { unique: false })
      }
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error("IndexedDB open request was blocked."))
    request.onsuccess = () => resolve(request.result)
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export function mapIndexedDbRepositoryError(error: unknown): BrowserProjectRepositoryError {
  if (error instanceof BrowserProjectRepositoryError) {
    return error
  }
  if (isDomException(error) && error.name === "QuotaExceededError") {
    return new BrowserProjectRepositoryError({
      code: "storage_quota_exceeded",
      message: "Browser local storage quota would be exceeded.",
      target: "quota",
      details: { name: error.name },
    })
  }
  if (isDomException(error) && (error.name === "InvalidStateError" || error.name === "NotSupportedError")) {
    return new BrowserProjectRepositoryError({
      code: "storage_unavailable",
      message: "IndexedDB is not available in this browser context.",
      target: "indexedDB",
      details: { name: error.name },
    })
  }
  return new BrowserProjectRepositoryError({
    code: "storage_failed",
    message: "Browser local storage operation failed.",
    target: "indexedDB",
    details: error instanceof Error ? { name: error.name, message: error.message } : null,
  })
}

const mapStorageError = mapIndexedDbRepositoryError

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

function objectFromRecord(record: ProjectObjectRecord): BrowserStorageObject {
  return {
    path: record.path,
    bytes: new Uint8Array(record.bytes),
    checksum: record.checksum,
    metadata: { ...record.metadata },
  }
}

function copyBytes(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes)
}

function copyArrayBuffer(bytes: Uint8Array<ArrayBuffer>): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

function createProjectId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isDomException(error: unknown): error is DOMException {
  return typeof DOMException !== "undefined" && error instanceof DOMException
}
