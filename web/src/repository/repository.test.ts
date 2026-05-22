import { describe, expect, it } from "vitest"
import {
  BrowserProjectRepositoryError,
  MemoryBrowserProjectRepository,
  browserProjectBackendId,
  createBrowserProjectRepository,
  mapIndexedDbRepositoryError,
} from "."

describe("Browser Project Repository CRUD", () => {
  it("creates and lists browser local project refs with stable sorting", async () => {
    const repository = new MemoryBrowserProjectRepository()

    const beta = await repository.createProject({ name: "Beta" })
    const alpha = await repository.createProject({ name: "Alpha" })

    expect(beta).toMatchObject({
      name: "Beta",
      backendId: browserProjectBackendId,
      localOnly: true,
    })
    expect(beta.id).toBeTruthy()
    expect(beta.projectRef).toBeTruthy()
    expect(new Date(beta.createdAt).toString()).not.toBe("Invalid Date")
    expect(beta.updatedAt).toBe(beta.createdAt)

    await expect(repository.listProjects()).resolves.toEqual([alpha, beta])
  })

  it("writes, reads, lists, checks, and deletes project objects", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Demo" })
    const projectRef = project.projectRef
    const encoder = new TextEncoder()

    const receipt = await repository.writeObject(projectRef, {
      path: ".rxnflow/state/project-content.json",
      bytes: encoder.encode('{"project":"demo"}') as Uint8Array<ArrayBuffer>,
      metadata: { kind: "project-content" },
    })

    expect(receipt).toMatchObject({
      path: ".rxnflow/state/project-content.json",
      byteSize: 18,
      backendId: browserProjectBackendId,
    })
    expect(receipt.checksum).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(await repository.exists(projectRef, ".rxnflow/state/project-content.json")).toBe(true)
    expect(await repository.exists(projectRef, "exports/missing.png")).toBe(false)

    const stored = await repository.readObject(projectRef, ".rxnflow/state/project-content.json")
    expect(new TextDecoder().decode(stored.bytes)).toBe('{"project":"demo"}')
    expect(stored.checksum).toBe(receipt.checksum)
    expect(stored.metadata).toEqual({ kind: "project-content" })

    await repository.writeObject(projectRef, {
      path: ".rxnflow/state/reaction-graphs.json",
      bytes: encoder.encode("{}") as Uint8Array<ArrayBuffer>,
      metadata: { kind: "reaction-graphs" },
    })
    await repository.writeObject(projectRef, {
      path: "exports/profile.png",
      bytes: encoder.encode("png") as Uint8Array<ArrayBuffer>,
      metadata: { kind: "export" },
    })

    await expect(repository.listObjects(projectRef, ".rxnflow/state")).resolves.toEqual([
      expect.objectContaining({ path: ".rxnflow/state/project-content.json" }),
      expect.objectContaining({ path: ".rxnflow/state/reaction-graphs.json" }),
    ])
    await expect(repository.listObjects(projectRef, ".rxnflow/state/project-content.json")).resolves.toEqual([
      expect.objectContaining({ path: ".rxnflow/state/project-content.json" }),
    ])

    await repository.deleteObject(projectRef, ".rxnflow/state/project-content.json")
    expect(await repository.exists(projectRef, ".rxnflow/state/project-content.json")).toBe(false)
    await expect(repository.deleteObject(projectRef, ".rxnflow/state/project-content.json")).resolves.toBeUndefined()
  })

  it("isolates identical paths across project refs", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const encoder = new TextEncoder()
    const first = await repository.createProject({ name: "First" })
    const second = await repository.createProject({ name: "Second" })

    await repository.writeObject(first.projectRef, {
      path: ".rxnflow/state/project-content.json",
      bytes: encoder.encode("first") as Uint8Array<ArrayBuffer>,
      metadata: { project: "first" },
    })
    await repository.writeObject(second.projectRef, {
      path: ".rxnflow/state/project-content.json",
      bytes: encoder.encode("second") as Uint8Array<ArrayBuffer>,
      metadata: { project: "second" },
    })

    await expect(readText(repository, first.projectRef, ".rxnflow/state/project-content.json")).resolves.toBe("first")
    await expect(readText(repository, second.projectRef, ".rxnflow/state/project-content.json")).resolves.toBe("second")
    await expect(repository.listObjects(first.projectRef, ".rxnflow/state")).resolves.toHaveLength(1)
  })

  it("overwrites a single project object without preserving stale bytes or metadata", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const encoder = new TextEncoder()
    const project = await repository.createProject({ name: "Demo" })

    const first = await repository.writeObject(project.projectRef, {
      path: "inputs/raw/demo.log",
      bytes: encoder.encode("old") as Uint8Array<ArrayBuffer>,
      metadata: { version: "old" },
    })
    const replacement = await repository.writeObject(project.projectRef, {
      path: "inputs/raw/demo.log",
      bytes: encoder.encode("new content") as Uint8Array<ArrayBuffer>,
      metadata: { version: "new" },
    })

    const stored = await repository.readObject(project.projectRef, "inputs/raw/demo.log")
    expect(new TextDecoder().decode(stored.bytes)).toBe("new content")
    expect(stored.metadata).toEqual({ version: "new" })
    expect(replacement.checksum).not.toBe(first.checksum)
    expect(replacement.byteSize).toBe(11)
    await expect(repository.listObjects(project.projectRef, "inputs/raw")).resolves.toHaveLength(1)
  })

  it("throws structured errors for invalid input and missing objects", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Demo" })

    await expectRepositoryError(
      () => repository.exists(project.projectRef, "../escape"),
      "invalid_input",
      "path",
    )
    await expectRepositoryError(
      () => repository.readObject(project.projectRef, "exports/missing.png"),
      "object_not_found",
      "path",
    )
    await expectRepositoryError(
      () => repository.writeObject("", {
        path: "inputs/raw/demo.log",
        bytes: new Uint8Array(),
        metadata: {},
      }),
      "invalid_input",
      "project_ref",
    )
  })

  it("simulates quota failures without partially overwriting existing objects", async () => {
    const repository = new MemoryBrowserProjectRepository({ quotaBytes: 5 })
    const encoder = new TextEncoder()
    const project = await repository.createProject({ name: "Demo" })

    await repository.writeObject(project.projectRef, {
      path: "inputs/raw/demo.log",
      bytes: encoder.encode("12345") as Uint8Array<ArrayBuffer>,
      metadata: {},
    })

    await expectRepositoryError(
      () =>
        repository.writeObject(project.projectRef, {
          path: "inputs/raw/demo.log",
          bytes: encoder.encode("123456") as Uint8Array<ArrayBuffer>,
          metadata: {},
        }),
      "storage_quota_exceeded",
      "quota",
    )
    await expect(readText(repository, project.projectRef, "inputs/raw/demo.log")).resolves.toBe("12345")
  })

  it("maps unavailable IndexedDB and quota errors to repository errors", () => {
    expectRepositoryErrorSync(createBrowserProjectRepository, "storage_unavailable", "indexedDB")

    const quotaError = mapIndexedDbRepositoryError(new DOMException("full", "QuotaExceededError"))
    expect(quotaError.code).toBe("storage_quota_exceeded")
    expect(quotaError.target).toBe("quota")

    const unavailableError = mapIndexedDbRepositoryError(new DOMException("closed", "InvalidStateError"))
    expect(unavailableError.code).toBe("storage_unavailable")
    expect(unavailableError.target).toBe("indexedDB")
  })
})

async function readText(
  repository: MemoryBrowserProjectRepository,
  projectRef: string,
  path: string,
): Promise<string> {
  const object = await repository.readObject(projectRef, path)
  return new TextDecoder().decode(object.bytes)
}

async function expectRepositoryError(
  action: () => Promise<unknown>,
  code: string,
  target: string,
): Promise<void> {
  try {
    await action()
  } catch (error) {
    expect(error).toBeInstanceOf(BrowserProjectRepositoryError)
    const repositoryError = error as BrowserProjectRepositoryError
    expect(repositoryError.code).toBe(code)
    expect(repositoryError.target).toBe(target)
    expect(() => JSON.stringify(repositoryError.toJSON())).not.toThrow()
    return
  }

  throw new Error("Expected repository error")
}

function expectRepositoryErrorSync(
  action: () => unknown,
  code: string,
  target: string,
): void {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(BrowserProjectRepositoryError)
    const repositoryError = error as BrowserProjectRepositoryError
    expect(repositoryError.code).toBe(code)
    expect(repositoryError.target).toBe(target)
    expect(() => JSON.stringify(repositoryError.toJSON())).not.toThrow()
    return
  }

  throw new Error("Expected repository error")
}
