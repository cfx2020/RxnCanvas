import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { browserProjectBackendId, type BrowserProjectRef } from "../repository"
import { graphRawFileDropMimeType } from "./graphRawFileDropPayload"
import { I18nProvider } from "./i18n"
import { ProjectSidebar } from "./ProjectSidebar"
import { initialProjectSidebarState, type ProjectSidebarState } from "./projectSidebarState"

describe("ProjectSidebar", () => {
  it("shows the project drawer empty state without projects", () => {
    renderSidebar(initialProjectSidebarState)

    expect(screen.getByRole("button", { name: "New Project" })).toBeInTheDocument()
    const panel = screen.getByRole("region", { name: "Projects" })
    expect(within(panel).getByText("No projects yet")).toBeInTheDocument()
    expect(screen.queryByText("No project loaded")).not.toBeInTheDocument()
  })

  it("creates projects from the sidebar drawer action", () => {
    const onCreateProject = vi.fn()
    renderSidebar(initialProjectSidebarState, vi.fn(), vi.fn(), onCreateProject)

    fireEvent.click(screen.getByRole("button", { name: "New Project" }))
    const form = screen.getByRole("form", { name: "Create project" })
    fireEvent.change(within(form).getByLabelText("Project name"), {
      target: { value: "Catalyst Screen" },
    })
    fireEvent.click(within(form).getByRole("button", { name: "Create Project" }))

    expect(onCreateProject).toHaveBeenCalledWith("Catalyst Screen")
  })

  it("renders raw inputs from project file state", () => {
    const activeProject = browserProject("browser-project:project-1", "Pd Ni")
    renderSidebar({
      ...initialProjectSidebarState,
      status: "ready",
      projects: [activeProject],
      activeProjectRef: activeProject.projectRef,
      activeProject,
      persistence: "persisted",
      projectFiles: [
        {
          id: "raw-abc123def456",
          projectRef: activeProject.projectRef,
          path: "inputs/raw/abc123def456-water.extxyz",
          name: "water.extxyz",
          kind: "extxyz",
          byteSize: 128,
          checksum: "sha256:abc123def4567890",
          status: "stored",
          rawResourceId: "raw-abc123def456",
          registeredObjectIds: [],
          graphNodeIds: [],
          artifactIds: [],
          warnings: [],
        },
      ],
    })

    const panel = screen.getByRole("region", { name: "Projects" })
    expect(within(panel).getByText("1 file")).toBeInTheDocument()
    expect(within(panel).getByText("Pd Ni")).toBeInTheDocument()
    expect(within(panel).getByText("water.extxyz")).toBeInTheDocument()
    expect(within(panel).queryByText("inputs/raw/abc123def456-water.extxyz")).not.toBeInTheDocument()
    expect(within(panel).queryByText("sha256:abc123def4567890")).not.toBeInTheDocument()
    expect(within(panel).queryByText("Persistence")).not.toBeInTheDocument()
    expect(within(panel).queryByText("Validation")).not.toBeInTheDocument()
    expect(within(panel).queryByText("Project content files are readable.")).not.toBeInTheDocument()
    expect(within(panel).getByRole("treeitem", { name: "water.extxyz, ExtXYZ, Stored" })).toBeInTheDocument()
    expect(within(panel).getByText("X")).toBeInTheDocument()
    expect(within(panel).queryByText("ExtXYZ")).not.toBeInTheDocument()
    expect(within(panel).queryByText("Stored")).not.toBeInTheDocument()
  })

  it("uses the project folder row itself to collapse and expand files", () => {
    const activeProject = browserProject("browser-project:project-1", "Pd Ni")
    renderSidebar({
      ...initialProjectSidebarState,
      status: "ready",
      projects: [activeProject],
      activeProjectRef: activeProject.projectRef,
      activeProject,
      projectFiles: [
        {
          id: "raw-abc123def456",
          projectRef: activeProject.projectRef,
          path: "inputs/raw/abc123def456-water.extxyz",
          name: "water.extxyz",
          kind: "extxyz",
          byteSize: 128,
          checksum: "sha256:abc123def4567890",
          status: "stored",
          rawResourceId: "raw-abc123def456",
          registeredObjectIds: [],
          graphNodeIds: [],
          artifactIds: [],
          warnings: [],
        },
      ],
    })

    const panel = screen.getByRole("region", { name: "Projects" })
    const folderButton = within(panel).getByText("Pd Ni").closest("button")
    if (!(folderButton instanceof HTMLElement)) {
      throw new Error("Project folder button was not rendered.")
    }

    expect(screen.queryByRole("button", { name: "Toggle folder" })).not.toBeInTheDocument()
    expect(folderButton).toHaveAttribute("aria-expanded", "true")
    expect(within(panel).getByText("water.extxyz")).toBeInTheDocument()

    fireEvent.click(folderButton)

    expect(folderButton).toHaveAttribute("aria-expanded", "false")
    expect(within(panel).queryByText("water.extxyz")).not.toBeInTheDocument()

    fireEvent.click(folderButton)

    expect(folderButton).toHaveAttribute("aria-expanded", "true")
    expect(within(panel).getByText("water.extxyz")).toBeInTheDocument()
  })

  it("opens inactive project folders from the folder row", () => {
    const inactiveProject = browserProject("browser-project:project-1", "Ni fxc")
    const activeProject = browserProject("browser-project:project-2", "Pd Ni")
    const onOpenProject = vi.fn(async () => undefined)
    renderSidebar({
      ...initialProjectSidebarState,
      status: "ready",
      projects: [inactiveProject, activeProject],
      activeProjectRef: activeProject.projectRef,
      activeProject,
    }, vi.fn(), vi.fn(), vi.fn(), onOpenProject)

    const panel = screen.getByRole("region", { name: "Projects" })
    const inactiveFolderButton = within(panel).getByText("Ni fxc").closest("button")
    if (!(inactiveFolderButton instanceof HTMLElement)) {
      throw new Error("Inactive project folder button was not rendered.")
    }

    expect(inactiveFolderButton).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(inactiveFolderButton)

    expect(inactiveFolderButton).toHaveAttribute("aria-expanded", "true")
    expect(onOpenProject).toHaveBeenCalledWith(inactiveProject.projectRef)
    expect(within(panel).queryByText("Open this project to view its files.")).not.toBeInTheDocument()
    expect(within(panel).queryByText("Drop calculation files here to import into this project.")).not.toBeInTheDocument()
  })

  it("shows project notices only for unsaved or invalid project state", () => {
    const activeProject = browserProject("browser-project:project-1", "Pd Ni")
    renderSidebar({
      ...initialProjectSidebarState,
      status: "ready",
      projects: [activeProject],
      activeProjectRef: activeProject.projectRef,
      activeProject,
      persistence: "dirty",
      validation: {
        state: "missing",
        messageKey: "projectSidebar.validation.contentMissing",
        messageParams: { path: ".rxnflow/state/project-content.json" },
      },
    })

    const notices = screen.getByRole("status", { name: "Project notices" })
    expect(within(notices).getByText("Unsaved changes")).toBeInTheDocument()
    expect(within(notices).getByText("Project files need attention")).toBeInTheDocument()
    expect(within(notices).getByText(/Project content file is missing/)).toBeInTheDocument()
    expect(screen.queryByText("Persisted")).not.toBeInTheDocument()
    expect(screen.queryByText("Valid")).not.toBeInTheDocument()
  })

  it("opens the import tray from a project folder action", () => {
    const activeProject = browserProject("browser-project:project-1", "Pd Ni")
    const onImportProjectFiles = vi.fn()
    renderSidebar({
      ...initialProjectSidebarState,
      status: "ready",
      projects: [activeProject],
      activeProjectRef: activeProject.projectRef,
      activeProject,
    }, vi.fn(), onImportProjectFiles)

    fireEvent.click(screen.getByRole("button", { name: "Import files into project" }))

    expect(onImportProjectFiles).toHaveBeenCalledWith(activeProject.projectRef)
  })

  it("opens project actions and deletes a project after confirmation", () => {
    const activeProject = browserProject("browser-project:project-1", "Pd Ni")
    const onDeleteProject = vi.fn(async () => undefined)
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)
    renderSidebar({
      ...initialProjectSidebarState,
      status: "ready",
      projects: [activeProject],
      activeProjectRef: activeProject.projectRef,
      activeProject,
    }, vi.fn(), vi.fn(), vi.fn(), vi.fn(), onDeleteProject)

    fireEvent.click(screen.getByRole("button", { name: "Project actions" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete project" }))

    expect(confirmSpy).toHaveBeenCalledWith(
      "Delete Pd Ni? This will remove the project and its stored files from this browser.",
    )
    expect(onDeleteProject).toHaveBeenCalledWith(activeProject.projectRef)
    confirmSpy.mockRestore()
  })

  it("opens the import tray with local files dropped onto a project folder", () => {
    const activeProject = browserProject("browser-project:project-1", "Pd Ni")
    const onImportProjectFiles = vi.fn()
    const file = new File(["water"], "water.log", { type: "text/plain" })
    renderSidebar({
      ...initialProjectSidebarState,
      status: "ready",
      projects: [activeProject],
      activeProjectRef: activeProject.projectRef,
      activeProject,
    }, vi.fn(), onImportProjectFiles)

    const folder = screen.getByRole("treeitem", { expanded: true })
    fireEvent.drop(folder, {
      dataTransfer: {
        files: [file],
        dropEffect: "none",
      },
    })

    expect(onImportProjectFiles).toHaveBeenCalledWith(activeProject.projectRef, [file])
  })

  it("serializes project raw file drag payloads from raw file rows", () => {
    const activeProject = browserProject("browser-project:project-1", "Pd Ni")
    renderSidebar({
      ...initialProjectSidebarState,
      status: "ready",
      projects: [activeProject],
      activeProjectRef: activeProject.projectRef,
      activeProject,
      projectFiles: [
        {
          id: "raw-abc123def456",
          projectRef: activeProject.projectRef,
          path: "inputs/raw/abc123def456-water.extxyz",
          name: "water.extxyz",
          kind: "extxyz",
          byteSize: 128,
          checksum: "sha256:abc123def4567890",
          status: "stored",
          rawResourceId: "raw-abc123def456",
          registeredObjectIds: [],
          graphNodeIds: [],
          artifactIds: [],
          warnings: [],
        },
      ],
    })

    const row = screen.getByText("water.extxyz").closest(".project-file-card")
    if (!(row instanceof HTMLElement)) {
      throw new Error("Project file row was not rendered.")
    }
    const dataTransfer = new TestDataTransfer()

    fireEvent.dragStart(row, { dataTransfer })

    expect(dataTransfer.effectAllowed).toBe("copy")
    expect(dataTransfer.getData(graphRawFileDropMimeType)).toBe(
      JSON.stringify({
        kind: "project-file",
        projectFileId: "raw-abc123def456",
        path: "inputs/raw/abc123def456-water.extxyz",
      }),
    )
  })

  it("can add a project raw file to the canvas from the file row", () => {
    const activeProject = browserProject("browser-project:project-1", "Pd Ni")
    const onAddProjectFileToCanvas = vi.fn()
    renderSidebar({
      ...initialProjectSidebarState,
      status: "ready",
      projects: [activeProject],
      activeProjectRef: activeProject.projectRef,
      activeProject,
      projectFiles: [
        {
          id: "raw-abc123def456",
          projectRef: activeProject.projectRef,
          path: "inputs/raw/abc123def456-water.extxyz",
          name: "water.extxyz",
          kind: "extxyz",
          byteSize: 128,
          checksum: "sha256:abc123def4567890",
          status: "stored",
          rawResourceId: "raw-abc123def456",
          registeredObjectIds: [],
          graphNodeIds: [],
          artifactIds: [],
          warnings: [],
        },
      ],
    }, onAddProjectFileToCanvas)

    const row = screen.getByText("water.extxyz").closest(".project-file-card")
    if (!(row instanceof HTMLElement)) {
      throw new Error("Project file row was not rendered.")
    }
    fireEvent.click(row)

    expect(onAddProjectFileToCanvas).toHaveBeenCalledTimes(1)
    expect(onAddProjectFileToCanvas.mock.calls[0]?.[0]).toMatchObject({
      id: "raw-abc123def456",
      path: "inputs/raw/abc123def456-water.extxyz",
    })

    fireEvent.keyDown(row, { key: "Enter" })
    expect(onAddProjectFileToCanvas).toHaveBeenCalledTimes(2)
  })
})

function renderSidebar(
  state: ProjectSidebarState,
  onAddProjectFileToCanvas = vi.fn(),
  onImportProjectFiles = vi.fn(),
  onCreateProject = vi.fn(),
  onOpenProject: (projectRef: string) => Promise<void> = async () => undefined,
  onDeleteProject: (projectRef: string) => Promise<void> = async () => undefined,
) {
  return render(
    <I18nProvider initialLocale="en-US">
      <ProjectSidebar
        state={state}
        onCreateProject={onCreateProject}
        onOpenProject={onOpenProject}
        onDeleteProject={onDeleteProject}
        onImportProjectFiles={onImportProjectFiles}
        onAddProjectFileToCanvas={onAddProjectFileToCanvas}
      />
    </I18nProvider>,
  )
}

function browserProject(projectRef: string, name: string): BrowserProjectRef {
  return {
    id: projectRef.split(":").at(-1) ?? projectRef,
    name,
    backendId: browserProjectBackendId,
    projectRef,
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
    localOnly: true,
  }
}

class TestDataTransfer {
  dropEffect = "none"
  effectAllowed = "all"
  private readonly store = new Map<string, string>()

  get types() {
    return Array.from(this.store.keys())
  }

  setData(type: string, value: string) {
    this.store.set(type, value)
  }

  getData(type: string) {
    return this.store.get(type) ?? ""
  }
}
