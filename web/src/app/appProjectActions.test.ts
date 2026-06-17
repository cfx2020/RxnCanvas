import { describe, expect, it } from "vitest"
import {
  createProjectAction,
  deleteProjectAction,
  openProjectAction,
} from "./appProjectActions"
import { emptyProjectWorkspace } from "./projectWorkspace"

const viewport = { x: 0, y: 0, zoom: 1 }
const activeWorkspace = emptyProjectWorkspace(viewport)
const otherWorkspace = emptyProjectWorkspace({ x: 10, y: 10, zoom: 0.8 })

describe("appProjectActions", () => {
  it("creates a project transition with validation cleared", () => {
    const transition = createProjectAction({
      projects: [{ id: "active", label: "Active", meta: "open" }],
      workspaces: { active: activeWorkspace },
      activeProjectId: "active",
      currentSnapshot: activeWorkspace,
      emptyViewport: viewport,
      projectLabel: "New Study",
      now: 1,
    })
    expect(transition.validation).toBeNull()
    const createdProject = transition.projects?.find((project) => project.id === transition.activeProjectId)
    expect(createdProject?.label).toBe("New Study")
  })

  it("opens an existing project", () => {
    const transition = openProjectAction({
      workspaces: { active: activeWorkspace, other: otherWorkspace },
      activeProjectId: "active",
      targetProjectId: "other",
      currentSnapshot: activeWorkspace,
      emptyViewport: viewport,
    })
    expect(transition?.activeProjectId).toBe("other")
    expect(transition?.activeSnapshot.viewport).toEqual(otherWorkspace.viewport)
    expect(transition?.validation).toBeNull()
  })

  it("returns an inactive delete action without activating another project", () => {
    const action = deleteProjectAction({
      projects: [
        { id: "active", label: "Active", meta: "open" },
        { id: "other", label: "Other", meta: "empty" },
      ],
      workspaces: { active: activeWorkspace, other: otherWorkspace },
      activeProjectId: "active",
      deletedProjectId: "other",
      currentSnapshot: activeWorkspace,
      emptyViewport: viewport,
      now: 1,
    })
    expect(action.kind).toBe("delete-inactive")
    if (action.kind === "delete-inactive") expect(action.projects.map((project) => project.id)).toEqual(["active"])
  })
})
