import { describe, expect, it } from "vitest"
import { MemoryBrowserProjectRepository } from "../repository"
import { listProjectFileEntries } from "./projectFiles"

const encoder = new TextEncoder()

describe("project file projection", () => {
  it("returns no files without an active browser project", async () => {
    const repository = new MemoryBrowserProjectRepository()

    await expect(listProjectFileEntries(repository, undefined)).resolves.toEqual([])
  })

  it("projects raw inputs and exports into stable project file entries", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Pd Ni" })

    const rawReceipt = await repository.writeObject(project.projectRef, {
      path: "inputs/raw/water.extxyz",
      bytes: encoder.encode("3\nwater\n") as Uint8Array<ArrayBuffer>,
      metadata: { kind: "raw_file", source_name: "water.extxyz" },
    })
    const exportReceipt = await repository.writeObject(project.projectRef, {
      path: "exports/profile.cdxml",
      bytes: encoder.encode("<CDXML />") as Uint8Array<ArrayBuffer>,
      metadata: { kind: "export_artifact", artifact_id: "artifact-profile-cdxml" },
    })

    await repository.writeObject(project.projectRef, {
      path: ".rxnflow/state/project-content.json",
      bytes: encoder.encode("{}") as Uint8Array<ArrayBuffer>,
      metadata: { kind: "project_content_index" },
    })

    await expect(listProjectFileEntries(repository, project)).resolves.toEqual([
      {
        id: "artifact-profile-cdxml",
        projectRef: project.projectRef,
        path: "exports/profile.cdxml",
        name: "profile.cdxml",
        kind: "export-artifact",
        byteSize: 9,
        checksum: exportReceipt.checksum,
        status: "exported",
        rawResourceId: null,
        registeredObjectIds: [],
        graphNodeIds: [],
        artifactIds: ["artifact-profile-cdxml"],
        warnings: [],
      },
      {
        id: `raw-${rawReceipt.checksum.replace(/^sha256:/, "").slice(0, 12)}`,
        projectRef: project.projectRef,
        path: "inputs/raw/water.extxyz",
        name: "water.extxyz",
        kind: "extxyz",
        byteSize: 8,
        checksum: rawReceipt.checksum,
        status: "stored",
        rawResourceId: `raw-${rawReceipt.checksum.replace(/^sha256:/, "").slice(0, 12)}`,
        registeredObjectIds: [],
        graphNodeIds: [],
        artifactIds: [],
        warnings: [],
      },
    ])
  })
})
