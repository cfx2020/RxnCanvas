import { describe, expect, it } from "vitest"
import { MemoryBrowserProjectRepository } from "../repository"
import { ensureEmptyProjectContent, projectManifestPath } from "./projectContentBridge"
import {
  browserRawResourceForFile,
  persistImportFilesAsRawInputs,
  persistRawInputFile,
  safeBaseName,
} from "./rawInputPersistence"

describe("raw input persistence", () => {
  it("writes browser raw input objects and appends manifest raw resources", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Raw Inputs" })
    await ensureEmptyProjectContent(repository, project)

    const file = new File(["2\nwater\n"], "water.xyz", { type: "chemical/x-xyz", lastModified: 1700000000000 })
    const result = await persistRawInputFile(repository, project.projectRef, file)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.resource).toMatchObject({
      id: expect.stringMatching(/^raw-[a-f0-9]{12}$/),
      kind: "raw_file",
      path: expect.stringMatching(/^inputs\/raw\/[a-f0-9]{12}-water\.xyz$/),
      checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      metadata: {
        source_name: "water.xyz",
        byte_size: 8,
        mime_type: "chemical/x-xyz",
        last_modified: 1700000000000,
      },
    })
    await expect(repository.readObject(project.projectRef, result.resource.path)).resolves.toMatchObject({
      path: result.resource.path,
      checksum: result.resource.checksum,
      metadata: expect.objectContaining({
        kind: "raw_file",
        source_name: "water.xyz",
      }),
    })
    const manifest = await readManifest(repository, project.projectRef)
    expect(manifest.resources).toEqual([
      expect.objectContaining({
        id: result.resource.id,
        kind: "raw_file",
        path: result.resource.path,
        checksum: result.resource.checksum,
      }),
    ])
  })

  it("keeps existing manifest resources and does not duplicate matching raw checksums", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Idempotent Raw" })
    await ensureEmptyProjectContent(repository, project)
    const manifest = await readManifest(repository, project.projectRef)
    await repository.writeObject(project.projectRef, {
      path: projectManifestPath,
      bytes: jsonBytes({
        ...manifest,
        resources: [
          {
            id: "object-a",
            kind: "chemical_object",
            path: null,
            checksum: null,
            metadata: {},
          },
        ],
      }),
      metadata: { kind: "project_manifest" },
    })

    const file = new File(["2\nwater\n"], "water.xyz")
    const first = await persistRawInputFile(repository, project.projectRef, file)
    const second = await persistRawInputFile(repository, project.projectRef, file)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    const updated = await readManifest(repository, project.projectRef)
    expect(updated.resources).toHaveLength(2)
    expect(updated.resources[0]).toMatchObject({ id: "object-a", kind: "chemical_object" })
    expect(updated.resources.filter((resource) => resource.kind === "raw_file")).toHaveLength(1)
  })

  it("marks no active project and path sources as skipped import file states", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const file = {
      id: "water",
      name: "water.xyz",
      size: 8,
      storagePath: "inbox/water.xyz",
      file: new File(["2\nwater\n"], "water.xyz"),
    }
    const noProject = await persistImportFilesAsRawInputs(repository, undefined, [file])
    expect(noProject[0].rawPersistence).toEqual({
      state: "skipped",
      reason: "no_active_project",
    })

    const project = await repository.createProject({ name: "Path Source" })
    await ensureEmptyProjectContent(repository, project)
    const pathSource = await persistImportFilesAsRawInputs(repository, project, [{
      id: "fixture",
      name: "fixture-source",
      size: 0,
      storagePath: "fixture-source",
      sourceKind: "path",
    }])
    expect(pathSource[0].rawPersistence).toEqual({
      state: "skipped",
      reason: "path_source",
    })
  })

  it("returns structured errors for invalid project manifests", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Bad Manifest" })
    await ensureEmptyProjectContent(repository, project)
    await repository.writeObject(project.projectRef, {
      path: projectManifestPath,
      bytes: jsonBytes({ schema_version: "bad", resources: [] }),
      metadata: { kind: "project_manifest" },
    })

    const result = await persistRawInputFile(repository, project.projectRef, new File(["bad"], "bad.log"))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatchObject({
      code: "invalid_input",
      target: projectManifestPath,
    })
  })

  it("returns structured errors for bad manifest resource shapes", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Bad Resources" })
    await ensureEmptyProjectContent(repository, project)
    const manifest = await readManifest(repository, project.projectRef)
    await repository.writeObject(project.projectRef, {
      path: projectManifestPath,
      bytes: jsonBytes({ ...manifest, resources: ["bad-resource"] }),
      metadata: { kind: "project_manifest" },
    })

    const result = await persistRawInputFile(repository, project.projectRef, new File(["bad"], "bad.log"))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatchObject({
      code: "invalid_input",
      target: `${projectManifestPath}.resources[0]`,
    })
  })

  it("derives Python-compatible resource paths from the file basename and checksum", () => {
    const resource = browserRawResourceForFile(
      new File(["x"], "nested\\folder/demo.log"),
      "sha256:aaaaaaaaaaaabbbbbbbbbbbbccccccccccccddddddddddddeeeeeeeeeeeeffff",
    )

    expect(safeBaseName("../demo.log")).toBe("demo.log")
    expect(resource).toMatchObject({
      id: "raw-aaaaaaaaaaaa",
      path: "inputs/raw/aaaaaaaaaaaa-demo.log",
    })
  })
})

async function readManifest(repository: MemoryBrowserProjectRepository, projectRef: string) {
  const object = await repository.readObject(projectRef, projectManifestPath)
  return JSON.parse(new TextDecoder().decode(object.bytes)) as {
    resources: Array<{ id: string; kind: string; path?: string | null; checksum?: string | null }>
  }
}

function jsonBytes(value: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`) as Uint8Array<ArrayBuffer>
}
