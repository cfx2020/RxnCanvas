import { describe, expect, it } from "vitest"
import {
  BrowserProjectRepositoryError,
  browserProjectBackendId,
  checksumBrowserStorageBytes,
  validateBrowserProjectRef,
  validateBrowserStoragePath,
  type BrowserProjectRef,
  type BrowserStorageObject,
  type BrowserWriteReceipt,
} from "."

describe("Browser Project Repository contract helpers", () => {
  it("keeps project refs, storage objects, and write receipts JSON-safe", () => {
    const projectRef: BrowserProjectRef = {
      id: "project-a",
      name: "Demo",
      backendId: browserProjectBackendId,
      projectRef: "origin-local-project-a",
      createdAt: "2026-05-16T00:00:00.000Z",
      updatedAt: "2026-05-16T00:00:00.000Z",
      localOnly: true,
    }
    const storageObject: BrowserStorageObject = {
      path: ".rxnflow/state/project-content.json",
      bytes: new Uint8Array([123, 125]),
      checksum: "sha256:sample",
      metadata: {
        kind: "project-content-index",
      },
    }
    const receipt: BrowserWriteReceipt = {
      path: storageObject.path,
      checksum: "sha256:sample",
      byteSize: storageObject.bytes.byteLength,
      updatedAt: projectRef.updatedAt,
      backendId: browserProjectBackendId,
    }

    expect(() => JSON.stringify(projectRef)).not.toThrow()
    expect(() => JSON.stringify({ ...storageObject, bytes: Array.from(storageObject.bytes) })).not.toThrow()
    expect(() => JSON.stringify(receipt)).not.toThrow()
  })

  it("validates browser project refs", () => {
    expect(validateBrowserProjectRef("project-a")).toBe("project-a")
    expect(() => validateBrowserProjectRef("")).toThrow(BrowserProjectRepositoryError)
    expectRepositoryError(() => validateBrowserProjectRef(" "), "invalid_input", "project_ref")
  })

  it("validates project-relative POSIX storage paths", () => {
    expect(validateBrowserStoragePath(".rxnflow/state/project-content.json")).toBe(
      ".rxnflow/state/project-content.json",
    )
    expect(validateBrowserStoragePath("inputs/raw/demo.log")).toBe("inputs/raw/demo.log")

    for (const unsafePath of ["", " ", "/absolute/path", ".", "../escape", "safe/../escape", "safe\\bad"]) {
      expectRepositoryError(
        () => validateBrowserStoragePath(unsafePath),
        "invalid_input",
        "path",
      )
    }
  })

  it("computes sha256 checksums for browser storage bytes", async () => {
    const checksum = await checksumBrowserStorageBytes(new TextEncoder().encode("rxnflow"))

    expect(checksum).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(checksum).toBe("sha256:b304d3a3fc5541a94fc4d3b4fdc1963183785e9c334ecec13cf0cc0d11e3373c")
  })
})

function expectRepositoryError(
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
