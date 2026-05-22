import { describe, expect, it } from "vitest"
import { MemoryBrowserProjectRepository } from "../repository"
import {
  chemicalObjectsPath,
  contentFilesToShellPayload,
  createEmptyProjectContentFiles,
  ensureEmptyProjectContent,
  projectContentIndexPath,
  projectContentSchemaVersion,
  projectIdFromBrowserProject,
  projectManifestPath,
  projectSchemaVersion,
  readProjectContentFiles,
  shellPayloadToContentFiles,
  validateBrowserProjectContent,
  workspacesPath,
  writeProjectContentFiles,
} from "./projectContentBridge"

describe("project content bridge helpers", () => {
  it("builds real project manifest and project-content-v1 empty section files", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Catalyst Screen" })

    const files = await createEmptyProjectContentFiles(project)
    const paths = files.map((file) => file.path)
    const manifest = JSON.parse(text(files.find((file) => file.path === projectManifestPath)?.bytes))
    const index = JSON.parse(text(files.find((file) => file.path === projectContentIndexPath)?.bytes))
    const objects = JSON.parse(text(files.find((file) => file.path === chemicalObjectsPath)?.bytes))
    const workspaces = JSON.parse(text(files.find((file) => file.path === workspacesPath)?.bytes))

    expect(paths).toEqual([
      projectManifestPath,
      projectContentIndexPath,
      chemicalObjectsPath,
      ".rxnflow/state/reaction-graphs.json",
      workspacesPath,
      ".rxnflow/state/energy-profiles.json",
      ".rxnflow/state/import-ledger.json",
      ".rxnflow/state/export-artifacts.json",
    ])
    expect(manifest).toMatchObject({
      id: projectIdFromBrowserProject(project),
      name: "Catalyst Screen",
      schema_version: projectSchemaVersion,
      resources: [],
    })
    expect(index).toMatchObject({
      schema_version: projectContentSchemaVersion,
      project_id: projectIdFromBrowserProject(project),
    })
    expect(index.files).toHaveLength(6)
    expect(index.files[0]).toMatchObject({
      kind: "chemical_objects",
      path: chemicalObjectsPath,
      checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
    expect(objects).toEqual({
      schema_version: "chemical-objects-v1",
      project_id: projectIdFromBrowserProject(project),
      objects: [],
    })
    expect(workspaces).toEqual({
      schema_version: "workspaces-v1",
      project_id: projectIdFromBrowserProject(project),
      workspaces: [],
    })
  })

  it("writes, reads, and shallow-validates browser project content files", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Read Me" })

    const writtenReceipts = await ensureEmptyProjectContent(repository, project)
    const read = await readProjectContentFiles(repository, project.projectRef)
    const validation = await validateBrowserProjectContent(repository, project.projectRef)

    expect(read.map((file) => file.path)).toEqual(writtenReceipts.map((receipt) => receipt.path))
    expect(validation).toMatchObject({
      state: "valid",
      checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
  })

  it("reports missing and checksum mismatch browser content validation states", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Broken" })
    await ensureEmptyProjectContent(repository, project)

    await repository.deleteObject(project.projectRef, chemicalObjectsPath)
    const missing = await validateBrowserProjectContent(repository, project.projectRef)
    expect(missing).toMatchObject({
      state: "missing",
      path: chemicalObjectsPath,
    })

    await ensureEmptyProjectContent(repository, project)
    const file = await repository.readObject(project.projectRef, chemicalObjectsPath)
    await repository.writeObject(project.projectRef, {
      path: chemicalObjectsPath,
      bytes: new TextEncoder().encode('{"bad":true}\n') as Uint8Array<ArrayBuffer>,
      metadata: file.metadata,
    })
    const mismatch = await validateBrowserProjectContent(repository, project.projectRef)
    expect(mismatch).toMatchObject({
      state: "error",
      path: chemicalObjectsPath,
      error: {
        code: "checksum_mismatch",
      },
    })
  })

  it("converts browser content files to shell payload and back", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Payload" })
    const files = await createEmptyProjectContentFiles(project)
    await writeProjectContentFiles(repository, project.projectRef, files)

    const shellPayload = await contentFilesToShellPayload(files)
    const roundTripped = shellPayloadToContentFiles(shellPayload)

    expect(shellPayload[0]).toMatchObject({
      path: projectManifestPath,
      bytes_base64: expect.any(String),
      checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      metadata: { kind: "project_manifest" },
    })
    expect(text(roundTripped[0].bytes)).toBe(text(files[0].bytes))
    expect(roundTripped.map((file) => file.path)).toEqual(files.map((file) => file.path))

    const secondRepository = new MemoryBrowserProjectRepository()
    const secondProject = await secondRepository.createProject({ name: "Mirror" })
    await writeProjectContentFiles(secondRepository, secondProject.projectRef, roundTripped)
    await expect(readProjectContentFiles(secondRepository, secondProject.projectRef)).resolves.toHaveLength(8)
  })
})

function text(bytes?: Uint8Array<ArrayBuffer>): string {
  if (!bytes) {
    return ""
  }
  return new TextDecoder().decode(bytes)
}
