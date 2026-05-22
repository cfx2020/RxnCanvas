import { describe, expect, it } from "vitest"
import {
  BrowserProjectRepositoryError,
  checksumBrowserStorageBytes,
  MemoryBrowserProjectRepository,
  type BrowserStorageObject,
} from "../repository"
import { projectManifestPath } from "./projectContentBridge"
import { createBrowserProjectBundleArchive, type BrowserProjectBundleEntry } from "./projectBundleArchive"
import {
  browserProjectBundleImportConflictPolicy,
  bundleEntryToStorageObject,
  importedProjectName,
  importBrowserProjectBundle,
  importedBundleObjectMetadata,
} from "./projectBundleImport"

const encoder = new TextEncoder()

describe("project bundle import action", () => {
  it("imports a safe project bundle into a new browser-local project", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const file = await bundleFile({
      rootName: "source.rxnflow",
      fileName: "source.rxnflow.zip",
      entries: {
        [projectManifestPath]: JSON.stringify({
          id: "project-source",
          name: "Imported Demo",
          schema_version: "project-v1",
          resources: [],
        }),
        ".rxnflow/state/project-content.json": '{"schema_version":"project-content-v1"}',
        "inputs/raw/demo.xyz": "2\nDemo\n",
        "exports/profile.png": "png",
      },
    })

    const result = await importBrowserProjectBundle(repository, {
      file,
      conflictPolicy: browserProjectBundleImportConflictPolicy,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.name).toBe("Imported Demo")
    expect(result.summary).toMatchObject({
      bundleName: "source.rxnflow.zip",
      rootName: "source.rxnflow",
      projectName: "Imported Demo",
      fileCount: 4,
    })
    expect(result.receipts.map((receipt) => receipt.path)).toEqual([
      ".rxnflow/manifest.json",
      ".rxnflow/state/project-content.json",
      "exports/profile.png",
      "inputs/raw/demo.xyz",
    ])

    const projects = await repository.listProjects()
    expect(projects).toHaveLength(1)
    expect(projects[0].projectRef).toBe(result.project.projectRef)
    const importedObjects = await repository.listObjects(result.project.projectRef, ".rxnflow")
    expect(importedObjects.map((object) => object.path)).toEqual([
      ".rxnflow/manifest.json",
      ".rxnflow/state/project-content.json",
    ])
    const rawObject = await repository.readObject(result.project.projectRef, "inputs/raw/demo.xyz")
    expect(rawObject.metadata).toMatchObject({
      kind: "raw_file",
      imported_from_bundle: true,
      source_name: "demo.xyz",
      byte_size: 7,
    })
  })

  it("uses root name and file name fallbacks for imported project names", async () => {
    expect(importedProjectName({
      projectName: "  Pd/Ni bundle  ",
      rootName: "ignored.rxnflow",
    }, "ignored.rxnflow.zip")).toBe("Pd Ni bundle")
    expect(importedProjectName({
      projectName: null,
      rootName: "root-demo.rxnflow",
    }, "ignored.rxnflow.zip")).toBe("root-demo")
    expect(importedProjectName({
      projectName: null,
      rootName: "----.rxnflow",
    }, "file-fallback.rxnflow.zip")).toBe("file-fallback")
    expect(importedProjectName({
      projectName: null,
      rootName: "----.rxnflow",
    }, "----.rxnflow.zip")).toBe("Imported Project")
  })

  it("maps bundle entries to browser storage metadata", async () => {
    const manifest = await bundleEntry(projectManifestPath, "{}")
    const section = await bundleEntry(".rxnflow/state/chemical-objects.json", "{}")
    const raw = await bundleEntry("inputs/raw/water.xyz", "2\nwater\n")
    const exported = await bundleEntry("exports/profile.png", "png")

    expect(bundleEntryToStorageObject(manifest)).toMatchObject({
      path: projectManifestPath,
      metadata: { kind: "project_manifest", imported_from_bundle: true },
    })
    expect(importedBundleObjectMetadata(section)).toMatchObject({
      kind: "chemical_objects",
      imported_from_bundle: true,
    })
    expect(importedBundleObjectMetadata(raw)).toMatchObject({
      kind: "raw_file",
      source_name: "water.xyz",
      byte_size: 8,
    })
    expect(importedBundleObjectMetadata(exported)).toMatchObject({
      kind: "export_artifact",
      source_name: "profile.png",
      byte_size: 3,
    })
  })

  it("rejects unsupported conflict policies before reading or writing", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const file = new File(["not-read"], "demo.rxnflow.zip", { type: "application/zip" })

    const result = await importBrowserProjectBundle(repository, {
      file,
      conflictPolicy: "overwrite" as typeof browserProjectBundleImportConflictPolicy,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: "unsupported_bundle",
        message: "Browser project bundle import only supports creating a new browser-local project.",
        target: "conflictPolicy",
        details: { fileName: "demo.rxnflow.zip" },
      },
    })
    expect(await repository.listProjects()).toHaveLength(0)
  })

  it("does not create a project for invalid bundle bytes", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const file = new File(["not a zip"], "bad.rxnflow.zip", { type: "application/zip" })

    const result = await importBrowserProjectBundle(repository, {
      file,
      conflictPolicy: browserProjectBundleImportConflictPolicy,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("invalid_bundle")
    expect(result.error.details).toMatchObject({ fileName: "bad.rxnflow.zip" })
    expect(await repository.listProjects()).toHaveLength(0)
  })

  it("maps createProject storage failures without writing objects", async () => {
    const repository = new FailingCreateRepository()
    const file = await bundleFile({
      rootName: "demo.rxnflow",
      fileName: "demo.rxnflow.zip",
      entries: {
        [projectManifestPath]: '{"id":"project-demo","name":"Demo","schema_version":"project-v1"}',
      },
    })

    const result = await importBrowserProjectBundle(repository, {
      file,
      conflictPolicy: browserProjectBundleImportConflictPolicy,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: "storage_failed",
        message: "Browser local project name is not writable.",
        target: "name",
        details: { fileName: "demo.rxnflow.zip", storageTarget: "name" },
      },
    })
    expect(repository.writeAttempts).toBe(0)
  })

  it("returns partial import risk when object writes fail after project creation", async () => {
    const repository = new FailingImportWriteRepository()
    const file = await bundleFile({
      rootName: "partial.rxnflow",
      fileName: "partial.rxnflow.zip",
      entries: {
        [projectManifestPath]: '{"id":"project-partial","name":"Partial","schema_version":"project-v1"}',
        ".rxnflow/state/project-content.json": "{}",
        "inputs/raw/demo.xyz": "2\nDemo\n",
      },
    })

    const result = await importBrowserProjectBundle(repository, {
      file,
      conflictPolicy: browserProjectBundleImportConflictPolicy,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatchObject({
      code: "storage_failed",
      message: "Browser local storage quota would be exceeded.",
      target: "inputs/raw/demo.xyz",
      details: {
        writtenCount: 2,
        fileName: "partial.rxnflow.zip",
        storageTarget: "quota",
      },
    })
    expect(result.error.details?.partialProjectRef).toMatch(/^browser-project:/)
    expect(await repository.listProjects()).toHaveLength(1)
    expect(await repository.listObjects(result.error.details?.partialProjectRef ?? "", ".rxnflow")).toHaveLength(2)
  })
})

async function bundleFile(input: {
  rootName: string
  fileName: string
  entries: Record<string, string>
}): Promise<File> {
  const entries = await Promise.all(Object.entries(input.entries).map(([path, text]) => bundleEntry(path, text)))
  const archive = await createBrowserProjectBundleArchive({
    bundleName: input.fileName,
    rootName: input.rootName,
    entries,
  })
  if (!archive.ok) {
    throw new Error(archive.error.message)
  }
  return new File([archive.bytes], input.fileName, { type: "application/zip" })
}

async function bundleEntry(path: string, text: string): Promise<BrowserProjectBundleEntry> {
  const bytes = encoder.encode(text) as Uint8Array<ArrayBuffer>
  return {
    name: path.split("/").at(-1) ?? path,
    projectRelativePath: path,
    bytes,
    byteSize: bytes.byteLength,
    checksum: await checksumBrowserStorageBytes(bytes) as `sha256:${string}`,
  }
}

class FailingCreateRepository extends MemoryBrowserProjectRepository {
  writeAttempts = 0

  async createProject(): Promise<never> {
    throw new BrowserProjectRepositoryError({
      code: "storage_failed",
      message: "Browser local project name is not writable.",
      target: "name",
    })
  }

  async writeObject(projectRef: string, object: BrowserStorageObject) {
    this.writeAttempts += 1
    return super.writeObject(projectRef, object)
  }
}

class FailingImportWriteRepository extends MemoryBrowserProjectRepository {
  async writeObject(projectRef: string, object: BrowserStorageObject) {
    if (object.path.startsWith("inputs/raw/")) {
      throw new BrowserProjectRepositoryError({
        code: "storage_quota_exceeded",
        message: "Browser local storage quota would be exceeded.",
        target: "quota",
      })
    }
    return super.writeObject(projectRef, object)
  }
}
