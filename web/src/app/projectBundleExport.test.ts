import { describe, expect, it } from "vitest"
import { BrowserProjectRepositoryError, MemoryBrowserProjectRepository, type BrowserStorageObject } from "../repository"
import { createEmptyProjectContentFiles, projectManifestPath } from "./projectContentBridge"
import {
  browserProjectBundleExportPrefixes,
  bundleEntriesFromStorageObjects,
  bundleFileNameForRootName,
  bundleRootNameForProject,
  collectBrowserProjectBundleObjects,
  exportBrowserProjectBundle,
} from "./projectBundleExport"
import { readBrowserProjectBundleArchive } from "./projectBundleArchive"

const encoder = new TextEncoder()

describe("project bundle export action", () => {
  it("exports current browser repository bytes as a downloadable project bundle", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Pd Ni LZD" })
    for (const file of await createEmptyProjectContentFiles(project)) {
      await repository.writeObject(project.projectRef, file)
    }
    await writeText(repository, project.projectRef, "inputs/raw/demo.xyz", "2\nDemo\n")
    await writeText(repository, project.projectRef, "exports/profile.png", "png")
    await writeText(repository, project.projectRef, "notes/outside.txt", "skip")

    const result = await exportBrowserProjectBundle(repository, project)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fileName).toBe("Pd-Ni-LZD.rxnflow.zip")
    expect(result.blob.type).toBe("application/zip")
    expect(result.summary).toMatchObject({
      bundleName: "Pd-Ni-LZD.rxnflow.zip",
      rootName: "Pd-Ni-LZD.rxnflow",
      projectName: "Pd Ni LZD",
      fileCount: 10,
    })

    const bytes = new Uint8Array(await result.blob.arrayBuffer()) as Uint8Array<ArrayBuffer>
    const read = await readBrowserProjectBundleArchive({ bundleName: result.fileName, bytes })
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.entries.map((entry) => entry.projectRelativePath)).toEqual([
      ".rxnflow/manifest.json",
      ".rxnflow/state/chemical-objects.json",
      ".rxnflow/state/energy-profiles.json",
      ".rxnflow/state/export-artifacts.json",
      ".rxnflow/state/import-ledger.json",
      ".rxnflow/state/project-content.json",
      ".rxnflow/state/reaction-graphs.json",
      ".rxnflow/state/workspaces.json",
      "exports/profile.png",
      "inputs/raw/demo.xyz",
    ])
  })

  it("returns active_project_required without an active browser project", async () => {
    const repository = new MemoryBrowserProjectRepository()

    const result = await exportBrowserProjectBundle(repository, undefined)

    expect(result).toEqual({
      ok: false,
      error: {
        code: "active_project_required",
        message: "Active browser project is required before exporting a project bundle.",
        target: "active_project",
      },
    })
  })

  it("returns project_content_missing when the manifest is absent", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Missing Manifest" })
    await writeText(repository, project.projectRef, "inputs/raw/demo.xyz", "2\nDemo\n")

    const result = await exportBrowserProjectBundle(repository, project)

    expect(result).toEqual({
      ok: false,
      error: {
        code: "project_content_missing",
        message: "Browser project bundle export requires .rxnflow/manifest.json.",
        target: projectManifestPath,
      },
    })
  })

  it("collects only bundle prefixes and deduplicates exact paths", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Collect" })
    await writeText(repository, project.projectRef, projectManifestPath, "{}")
    await writeText(repository, project.projectRef, ".rxnflow/state/project-content.json", "{}")
    await writeText(repository, project.projectRef, "inputs/raw/demo.xyz", "xyz")
    await writeText(repository, project.projectRef, "exports/profile.png", "png")
    await writeText(repository, project.projectRef, "inputs/cache/tmp.bin", "skip")

    const objects = await collectBrowserProjectBundleObjects(repository, {
      projectRef: project.projectRef,
      rootName: "Collect.rxnflow",
      includePrefixes: browserProjectBundleExportPrefixes,
    })

    expect(objects.map((object) => object.path)).toEqual([
      ".rxnflow/manifest.json",
      ".rxnflow/state/project-content.json",
      "exports/profile.png",
      "inputs/raw/demo.xyz",
    ])
  })

  it("computes missing storage object checksums when mapping entries", async () => {
    const bytes = encoder.encode("{}") as Uint8Array<ArrayBuffer>
    const objects: BrowserStorageObject[] = [
      { path: projectManifestPath, bytes, metadata: { kind: "project_manifest" } },
    ]

    const entries = await bundleEntriesFromStorageObjects(objects)

    expect(entries).toEqual([
      expect.objectContaining({
        name: "manifest.json",
        projectRelativePath: projectManifestPath,
        byteSize: 2,
        checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      }),
    ])
  })

  it("maps repository errors to storage_failed", async () => {
    const repository = new FailingListRepository()
    const project = await repository.createProject({ name: "Failing" })

    const result = await exportBrowserProjectBundle(repository, project)

    expect(result).toEqual({
      ok: false,
      error: {
        code: "storage_failed",
        message: "Listing browser local objects failed.",
        target: "listObjects",
      },
    })
  })

  it("maps archive validation failures to bundle_invalid", async () => {
    const repository = new UnsafeListRepository()
    const project = await repository.createProject({ name: "Unsafe" })

    const result = await exportBrowserProjectBundle(repository, project)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("bundle_invalid")
  })

  it("sanitizes bundle root names and filenames", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "  Pd/Ni β screen.rxnflow.zip  " })

    expect(bundleRootNameForProject(project)).toBe("Pd-Ni-screen.rxnflow")
    expect(bundleFileNameForRootName("Pd-Ni-screen.rxnflow")).toBe("Pd-Ni-screen.rxnflow.zip")
  })
})

async function writeText(
  repository: MemoryBrowserProjectRepository,
  projectRef: string,
  path: string,
  value: string,
) {
  await repository.writeObject(projectRef, {
    path,
    bytes: encoder.encode(value) as Uint8Array<ArrayBuffer>,
    metadata: { kind: "fixture" },
  })
}

class FailingListRepository extends MemoryBrowserProjectRepository {
  async listObjects(): Promise<BrowserStorageObject[]> {
    throw new BrowserProjectRepositoryError({
      code: "storage_failed",
      message: "Listing browser local objects failed.",
      target: "listObjects",
    })
  }
}

class UnsafeListRepository extends MemoryBrowserProjectRepository {
  async listObjects(projectRef: string, prefix: string) {
    if (prefix === ".rxnflow") {
      return [
        {
          path: projectManifestPath,
          bytes: encoder.encode("{}") as Uint8Array<ArrayBuffer>,
          metadata: { kind: "project_manifest" },
        },
      ]
    }
    if (prefix === "inputs/raw") {
      return [
        {
          path: "inputs/raw/../evil.xyz",
          bytes: encoder.encode("evil") as Uint8Array<ArrayBuffer>,
          metadata: { kind: "raw_file" },
        },
      ]
    }
    return super.listObjects(projectRef, prefix)
  }
}
