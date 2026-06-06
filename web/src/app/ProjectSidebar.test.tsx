import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { browserProjectBackendId, type BrowserProjectRef } from "../repository"
import { graphRawFileDropMimeType } from "./graphRawFileDropPayload"
import { I18nProvider } from "./i18n"
import { ProjectSidebar } from "./ProjectSidebar"
import { initialProjectSidebarState, type ProjectSidebarState } from "./projectSidebarState"

describe("ProjectSidebar", () => {
  it("shows project file empty state without an active project", () => {
    renderSidebar(initialProjectSidebarState)

    const panel = screen.getByRole("region", { name: "Project tree" })
    expect(within(panel).getByRole("heading", { name: "Project tree" })).toBeInTheDocument()
    expect(within(panel).getByRole("button", { name: "Import files into project" })).toBeDisabled()
    expect(within(panel).getByText("Open a project to view its files.")).toBeInTheDocument()
    expect(screen.queryByText("No project loaded")).not.toBeInTheDocument()
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

    const panel = screen.getByRole("region", { name: "Project tree" })
    expect(within(panel).getByText("1 file")).toBeInTheDocument()
    expect(within(panel).getByText("Pd Ni")).toBeInTheDocument()
    expect(within(panel).getByText("water.extxyz")).toBeInTheDocument()
    expect(within(panel).queryByText("inputs/raw/abc123def456-water.extxyz")).not.toBeInTheDocument()
    expect(within(panel).queryByText("sha256:abc123def4567890")).not.toBeInTheDocument()
    expect(within(panel).getByText("ExtXYZ")).toBeInTheDocument()
    expect(within(panel).getByText("Stored")).toBeInTheDocument()
  })

  it("opens the import tray from the project tree action", () => {
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

    expect(onImportProjectFiles).toHaveBeenCalledTimes(1)
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

  it("can add a project raw file to the canvas from the row action", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Add to canvas" }))

    expect(onAddProjectFileToCanvas).toHaveBeenCalledTimes(1)
    expect(onAddProjectFileToCanvas.mock.calls[0]?.[0]).toMatchObject({
      id: "raw-abc123def456",
      path: "inputs/raw/abc123def456-water.extxyz",
    })
  })
})

function renderSidebar(
  state: ProjectSidebarState,
  onAddProjectFileToCanvas = vi.fn(),
  onImportProjectFiles = vi.fn(),
) {
  return render(
    <I18nProvider initialLocale="en-US">
      <ProjectSidebar
        state={state}
        onOpenProject={async () => undefined}
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
