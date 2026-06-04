import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { browserProjectBackendId, type BrowserProjectRef } from "../repository"
import { graphRawFileDropMimeType } from "./graphRawFileDropPayload"
import { I18nProvider } from "./i18n"
import { ProjectSidebar } from "./ProjectSidebar"
import { initialProjectSidebarState, type ProjectSidebarState } from "./projectSidebarState"
import { initialWorkbenchDomainState } from "./workbenchState"

describe("ProjectSidebar", () => {
  it("shows project file empty state without an active project", () => {
    renderSidebar(initialProjectSidebarState)

    const panel = screen.getByRole("region", { name: "Project files" })
    expect(within(panel).getByRole("heading", { name: "Files" })).toBeInTheDocument()
    expect(within(panel).getByText("0 files")).toBeInTheDocument()
    expect(within(panel).getByText("Open a project to view its files.")).toBeInTheDocument()
    expect(screen.queryByText("No project loaded")).not.toBeInTheDocument()
  })

  it("renders raw inputs and export artifacts from project file state", () => {
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
          name: "abc123def456-water.extxyz",
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
        {
          id: "artifact-profile-cdxml",
          projectRef: activeProject.projectRef,
          path: "exports/profile.cdxml",
          name: "profile.cdxml",
          kind: "export-artifact",
          byteSize: 2048,
          checksum: "sha256:def456abc1237890",
          status: "exported",
          rawResourceId: null,
          registeredObjectIds: [],
          graphNodeIds: [],
          artifactIds: ["artifact-profile-cdxml"],
          warnings: [],
        },
      ],
    })

    const panel = screen.getByRole("region", { name: "Project files" })
    expect(within(panel).getByText("2 files")).toBeInTheDocument()
    expect(within(panel).getByText("abc123def456-water.extxyz")).toBeInTheDocument()
    expect(within(panel).getByText("inputs/raw/abc123def456-water.extxyz")).toBeInTheDocument()
    expect(within(panel).getByText("ExtXYZ")).toBeInTheDocument()
    expect(within(panel).getByText("Stored")).toBeInTheDocument()
    expect(within(panel).getByText("profile.cdxml")).toBeInTheDocument()
    expect(within(panel).getByText("Export")).toBeInTheDocument()
    expect(within(panel).getByText("Exported")).toBeInTheDocument()
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
          name: "abc123def456-water.extxyz",
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

    const row = screen.getByText("abc123def456-water.extxyz").closest(".project-file-card")
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
})

function renderSidebar(state: ProjectSidebarState) {
  return render(
    <I18nProvider initialLocale="en-US">
      <ProjectSidebar
        state={state}
        workbenchState={initialWorkbenchDomainState}
        exportBundleStatus={{ state: "idle" }}
        importBundleStatus={{ state: "idle" }}
        onRefreshProjects={async () => undefined}
        onCreateProject={async () => state}
        onOpenProject={async () => undefined}
        onSaveProjectContent={async () => undefined}
        onOpenBridgeSession={async () => undefined}
        onSaveBridgeSession={async () => undefined}
        onExportBundle={async () => undefined}
        onImportBundleFileSelected={async () => undefined}
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
