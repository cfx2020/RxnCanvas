import { describe, expect, it } from "vitest"
import { MemoryBrowserProjectRepository } from "../repository"
import { createProject, openProject, refreshProjects, saveProjectContent } from "./projectSidebarActions"
import {
  chemicalObjectsPath,
  projectContentIndexPath,
  projectContentSchemaVersion,
  projectManifestPath,
  projectSchemaVersion,
} from "./projectContentBridge"
import {
  initialProjectSidebarState,
} from "./projectSidebarState"

describe("project sidebar repository actions", () => {
  it("refreshes the browser-local project list without selecting a project", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const beta = await repository.createProject({ name: "Beta" })
    const alpha = await repository.createProject({ name: "Alpha" })

    const state = await refreshProjects(repository, initialProjectSidebarState)

    expect(state.status).toBe("ready")
    expect(state.projects).toEqual([alpha, beta])
    expect(state.activeProject).toBeUndefined()
    expect(state.persistence).toBe("empty")
    expect(state.validation.state).toBe("unknown")
  })

  it("creates a project, writes real project content files, and selects it", async () => {
    const repository = new MemoryBrowserProjectRepository()

    const state = await createProject(repository, initialProjectSidebarState, "Catalyst Screen")

    expect(state.status).toBe("ready")
    expect(state.projects).toHaveLength(1)
    expect(state.activeProject?.name).toBe("Catalyst Screen")
    expect(state.activeProjectRef).toBe(state.activeProject?.projectRef)
    expect(state.persistence).toBe("persisted")
    expect(state.validation).toMatchObject({
      state: "valid",
      checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
    expect(state.lastWrite).toMatchObject({
      path: projectContentIndexPath,
      checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })

    const manifestObject = await repository.readObject(
      state.activeProjectRef ?? "",
      projectManifestPath,
    )
    const indexObject = await repository.readObject(
      state.activeProjectRef ?? "",
      projectContentIndexPath,
    )
    const manifest = JSON.parse(new TextDecoder().decode(manifestObject.bytes))
    const index = JSON.parse(new TextDecoder().decode(indexObject.bytes))
    expect(manifestObject.metadata).toEqual({ kind: "project_manifest" })
    expect(indexObject.metadata).toEqual({ kind: "project_content_index" })
    expect(manifest).toMatchObject({
      schema_version: projectSchemaVersion,
      name: "Catalyst Screen",
    })
    expect(index).toMatchObject({
      schema_version: projectContentSchemaVersion,
      project_id: manifest.id,
    })
    expect(index.files).toHaveLength(6)
  })

  it("opens an existing project and validates existing project content", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const created = await createProject(repository, initialProjectSidebarState, "Open Me")

    const opened = await openProject(repository, initialProjectSidebarState, created.activeProjectRef ?? "")

    expect(opened.status).toBe("ready")
    expect(opened.activeProjectRef).toBe(created.activeProjectRef)
    expect(opened.activeProject?.name).toBe("Open Me")
    expect(opened.persistence).toBe("persisted")
    expect(opened.validation).toMatchObject({
      state: "valid",
      checksum: created.lastWrite?.checksum,
    })
  })

  it("opens a project with missing content without failing", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Needs Stub" })

    const opened = await openProject(repository, initialProjectSidebarState, project.projectRef)

    expect(opened.status).toBe("ready")
    expect(opened.activeProjectRef).toBe(project.projectRef)
    expect(opened.persistence).toBe("dirty")
    expect(opened.validation.state).toBe("missing")
    expect(opened.validation.messageKey).toBe("projectSidebar.validation.contentMissing")
    expect(opened.validation.messageParams).toEqual({ path: projectContentIndexPath })
  })

  it("saves the active project content by overwriting project content paths", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const missingProject = await repository.createProject({ name: "Save Me" })
    const opened = await openProject(repository, initialProjectSidebarState, missingProject.projectRef)

    const firstSave = await saveProjectContent(repository, opened)
    const secondSave = await saveProjectContent(repository, firstSave)

    expect(firstSave.status).toBe("ready")
    expect(secondSave.status).toBe("ready")
    expect(secondSave.persistence).toBe("persisted")
    expect(secondSave.validation).toMatchObject({
      state: "valid",
      checksum: secondSave.lastWrite?.checksum,
    })
    await expect(
      repository.listObjects(missingProject.projectRef, projectContentIndexPath),
    ).resolves.toHaveLength(1)
    await expect(
      repository.listObjects(missingProject.projectRef, chemicalObjectsPath),
    ).resolves.toHaveLength(1)
  })

  it("returns structured repository errors for sidebar rendering", async () => {
    const repository = new MemoryBrowserProjectRepository()

    const state = await saveProjectContent(repository, initialProjectSidebarState)

    expect(state.status).toBe("error")
    expect(state.persistence).toBe("error")
    expect(state.error).toEqual({
      code: "invalid_input",
      message: "Active browser project is required before saving project content.",
      target: "active_project",
    })
    expect(state.validation).toMatchObject({
      state: "error",
      messageKey: "projectSidebar.errorMessage",
      messageParams: { message: state.error?.message },
    })
  })
})
