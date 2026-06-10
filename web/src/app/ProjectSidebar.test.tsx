import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { browserProjectBackendId, type BrowserProjectRef } from "../repository"
import { graphRawFileDropMimeType, parseGraphRawFileDropPayload } from "./graphRawFileDropPayload"
import { I18nProvider } from "./i18n"
import { ProjectSidebar } from "./ProjectSidebar"
import type { ProjectFileEntry } from "./projectFiles"
import { initialProjectSidebarState, type ProjectSidebarState } from "./projectSidebarState"

describe("ProjectSidebar", () => {
  it("shows the project drawer empty state without projects", () => {
    renderSidebar(initialProjectSidebarState)

    expect(screen.queryByText("RXNFLOW")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New Project" })).toBeInTheDocument()
    const panel = screen.getByRole("region", { name: "Projects" })
    expect(within(panel).getByText("No projects yet")).toBeInTheDocument()
    expect(screen.queryByText("No project loaded")).not.toBeInTheDocument()
  })

  it("keeps floating project drawer content mounted while collapsed", () => {
    renderSidebar(initialProjectSidebarState, {
      collapsed: true,
    })

    expect(screen.queryByText("Rf")).not.toBeInTheDocument()
    expect(screen.queryByText("RXNFLOW")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New Project" })).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Project Sidebar" })).toHaveClass("project-sidebar--collapsed")
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

  it("opens an existing folder from the project header action", () => {
    const onOpenExistingFolder = vi.fn()
    renderSidebar(initialProjectSidebarState, {
      onOpenExistingFolder,
    })

    fireEvent.click(screen.getByRole("button", { name: "Open Existing Folder" }))

    expect(onOpenExistingFolder).toHaveBeenCalledTimes(1)
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
    expect(within(panel).queryByText("Graph")).not.toBeInTheDocument()
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
    const collapsedContents = folderButton.closest(".project-folder")?.querySelector(".project-folder-contents")
    expect(collapsedContents).toHaveAttribute("aria-hidden", "true")
    expect(collapsedContents).toHaveClass("project-folder-contents--collapsed")

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

  it("keeps project persistence and validation notices out of the file tree", () => {
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

    expect(screen.queryByRole("status", { name: "Project notices" })).not.toBeInTheDocument()
    expect(screen.queryByText("Project files need attention")).not.toBeInTheDocument()
    expect(screen.queryByText(/Project content file is missing/)).not.toBeInTheDocument()
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument()
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

  it("opens project actions and deletes a project from the compact menu", () => {
    const activeProject = browserProject("browser-project:project-1", "Pd Ni")
    const onDeleteProject = vi.fn(async () => undefined)
    renderSidebar({
      ...initialProjectSidebarState,
      status: "ready",
      projects: [activeProject],
      activeProjectRef: activeProject.projectRef,
      activeProject,
    }, vi.fn(), vi.fn(), vi.fn(), vi.fn(), onDeleteProject)

    fireEvent.click(screen.getByRole("button", { name: "Project actions" }))
    expect(screen.getByRole("menuitem", { name: "Delete project" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete project" }))

    expect(onDeleteProject).toHaveBeenCalledWith(activeProject.projectRef)
    expect(screen.queryByRole("menuitem", { name: "Delete project" })).not.toBeInTheDocument()
  })

  it("keeps project actions out of the file list layout", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Project actions" }))

    const folder = screen.getByRole("treeitem", { expanded: true })
    const row = folder.querySelector(".project-folder-row")
    const contents = folder.querySelector(".project-folder-contents")
    const popover = document.body.querySelector(".project-folder-popover")
    expect(row).toBeInstanceOf(HTMLElement)
    expect(contents).toBeInstanceOf(HTMLElement)
    expect(popover).toBeInstanceOf(HTMLElement)
    expect(folder.querySelector(".project-folder-menu")).toBeNull()
    expect(folder.querySelector(".project-folder-menu-anchor")).toBeNull()
    expect(within(row as HTMLElement).queryByRole("button", { name: "Delete project" })).not.toBeInTheDocument()
    expect(within(popover as HTMLElement).getByRole("menuitem", { name: "Delete project" })).toBeInTheDocument()
    expect(folder).not.toContainElement(popover as HTMLElement)
    expect(contents).not.toContainElement(within(popover as HTMLElement).getByRole("menuitem", { name: "Delete project" }))
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

  it("serializes selected project raw files as a batch drag payload", () => {
    const activeProject = browserProject("browser-project:project-1", "Pd Ni")
    renderSidebar({
      ...initialProjectSidebarState,
      status: "ready",
      projects: [activeProject],
      activeProjectRef: activeProject.projectRef,
      activeProject,
      projectFiles: [
        projectFile(activeProject.projectRef, "raw-a", "inputs/raw/aaaa-water.log", "water.log"),
        projectFile(activeProject.projectRef, "raw-b", "inputs/raw/bbbb-methane.log", "methane.log"),
      ],
    })

    const waterRow = screen.getByText("water.log").closest(".project-file-card")
    const methaneRow = screen.getByText("methane.log").closest(".project-file-card")
    if (!(waterRow instanceof HTMLElement) || !(methaneRow instanceof HTMLElement)) {
      throw new Error("Project file rows were not rendered.")
    }
    fireEvent.click(waterRow, { metaKey: true })
    fireEvent.click(methaneRow, { metaKey: true })
    const dataTransfer = new TestDataTransfer()

    fireEvent.dragStart(methaneRow, { dataTransfer })

    expect(waterRow).toHaveClass("project-file-card--selected")
    expect(methaneRow).toHaveClass("project-file-card--selected")
    expect(parseGraphRawFileDropPayload(dataTransfer.getData(graphRawFileDropMimeType))).toEqual({
      kind: "project-files",
      files: [
        { projectFileId: "raw-a", path: "inputs/raw/aaaa-water.log" },
        { projectFileId: "raw-b", path: "inputs/raw/bbbb-methane.log" },
      ],
    })
  })

  it("selects project raw files without adding them to the canvas", () => {
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
    fireEvent.click(row)

    expect(row).toHaveClass("project-file-card--selected")

    fireEvent.keyDown(row, { key: "Enter" })
    expect(row).toHaveClass("project-file-card--selected")
  })

  it("supports shift range project raw file selection", () => {
    const activeProject = browserProject("browser-project:project-1", "Pd Ni")
    renderSidebar({
      ...initialProjectSidebarState,
      status: "ready",
      projects: [activeProject],
      activeProjectRef: activeProject.projectRef,
      activeProject,
      projectFiles: [
        projectFile(activeProject.projectRef, "raw-a", "inputs/raw/aaaa-a.log", "a.log"),
        projectFile(activeProject.projectRef, "raw-b", "inputs/raw/bbbb-b.log", "b.log"),
        projectFile(activeProject.projectRef, "raw-c", "inputs/raw/cccc-c.log", "c.log"),
      ],
    })

    const aRow = screen.getByText("a.log").closest(".project-file-card")
    const bRow = screen.getByText("b.log").closest(".project-file-card")
    const cRow = screen.getByText("c.log").closest(".project-file-card")
    if (!(aRow instanceof HTMLElement) || !(bRow instanceof HTMLElement) || !(cRow instanceof HTMLElement)) {
      throw new Error("Project file rows were not rendered.")
    }

    fireEvent.click(aRow)
    fireEvent.click(cRow, { shiftKey: true })

    expect(aRow).toHaveClass("project-file-card--selected")
    expect(bRow).toHaveClass("project-file-card--selected")
    expect(cRow).toHaveClass("project-file-card--selected")
  })

  it("deletes a project raw file from the row action without adding it to the canvas", () => {
    const activeProject = browserProject("browser-project:project-1", "Pd Ni")
    const onDeleteProjectFile = vi.fn()
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
    }, {
      onDeleteProjectFile,
    })

    fireEvent.click(screen.getByRole("button", { name: "Remove water.extxyz from project" }))

    expect(onDeleteProjectFile).toHaveBeenCalledTimes(1)
    expect(onDeleteProjectFile.mock.calls[0]?.[0]).toMatchObject({
      id: "raw-abc123def456",
      path: "inputs/raw/abc123def456-water.extxyz",
    })
  })
})

function renderSidebar(
  state: ProjectSidebarState,
  optionsOrOnImportProjectFiles: unknown = vi.fn(),
  onImportProjectFiles: unknown = vi.fn(),
  onCreateProject: unknown = vi.fn(),
  onOpenProject: unknown = async () => undefined,
  onDeleteProject: unknown = async () => undefined,
) {
  const options: RenderSidebarOptions = isRenderSidebarOptions(optionsOrOnImportProjectFiles)
    ? optionsOrOnImportProjectFiles
    : {
        onImportProjectFiles: onImportProjectFiles as RenderSidebarOptions["onImportProjectFiles"],
        onCreateProject: onCreateProject as RenderSidebarOptions["onCreateProject"],
        onOpenExistingFolder: vi.fn(),
        onOpenProject: onOpenProject as RenderSidebarOptions["onOpenProject"],
        onDeleteProject: onDeleteProject as RenderSidebarOptions["onDeleteProject"],
      }
  return render(
    <I18nProvider initialLocale="en-US">
      <ProjectSidebar
        state={state}
        collapsed={options.collapsed ?? false}
        onCreateProject={options.onCreateProject ?? vi.fn()}
        onOpenExistingFolder={options.onOpenExistingFolder ?? vi.fn()}
        onOpenProject={options.onOpenProject ?? (async () => undefined)}
        onDeleteProject={options.onDeleteProject ?? (async () => undefined)}
        onImportProjectFiles={options.onImportProjectFiles ?? vi.fn()}
        onDeleteProjectFile={options.onDeleteProjectFile ?? vi.fn()}
      />
    </I18nProvider>,
  )
}

type RenderSidebarOptions = {
  collapsed?: boolean
  onImportProjectFiles?: (projectRef: string, files?: File[]) => void | Promise<void>
  onCreateProject?: (name: string) => void | Promise<void>
  onOpenExistingFolder?: () => void | Promise<void>
  onOpenProject?: (projectRef: string) => Promise<void>
  onDeleteProject?: (projectRef: string) => Promise<void>
  onDeleteProjectFile?: (file: ProjectFileEntry) => void | Promise<void>
}

function isRenderSidebarOptions(value: unknown): value is RenderSidebarOptions {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
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

function projectFile(projectRef: string, id: string, path: string, name: string): ProjectFileEntry {
  return {
    id,
    projectRef,
    path,
    name,
    kind: "gaussian-log",
    byteSize: 128,
    checksum: `sha256:${id}`,
    status: "stored",
    rawResourceId: id,
    registeredObjectIds: [],
    graphNodeIds: [],
    artifactIds: [],
    warnings: [],
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
