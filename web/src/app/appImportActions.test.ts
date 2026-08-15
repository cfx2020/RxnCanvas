import { describe, expect, it, vi } from "vitest"
import {
  handleCanvasRawFileDropAction,
  importDesktopFilesAction,
  importFilesForProjectAction,
  openImportPickerAction,
  toggleCandidateReviewSelectionAction,
} from "./appImportActions"

describe("appImportActions", () => {
  it("opens browser picker and stores pending project without desktop runtime", () => {
    const setPendingImportProjectId = vi.fn()
    const importDesktopFiles = vi.fn()
    const openBrowserPicker = vi.fn()
    openImportPickerAction({
      projectId: "p1",
      hasDesktopRuntime: false,
      setPendingImportProjectId,
      importDesktopFiles,
      openBrowserPicker,
    })
    expect(setPendingImportProjectId).toHaveBeenCalledWith("p1")
    expect(openBrowserPicker).toHaveBeenCalledTimes(1)
    expect(importDesktopFiles).not.toHaveBeenCalled()
  })

  it("imports desktop files immediately when desktop runtime exists", () => {
    const setPendingImportProjectId = vi.fn()
    const importDesktopFiles = vi.fn()
    openImportPickerAction({
      projectId: "p2",
      hasDesktopRuntime: true,
      setPendingImportProjectId,
      importDesktopFiles,
      openBrowserPicker: vi.fn(),
    })
    expect(setPendingImportProjectId).toHaveBeenCalledWith(null)
    expect(importDesktopFiles).toHaveBeenCalledWith("p2")
  })

  it("passes desktop-selected files to project staging", async () => {
    const stageSourceFilesForProject = vi.fn()
    await importDesktopFilesAction({
      projectId: "p3",
      chooseFiles: vi.fn(async () => ({
        canceled: false,
        files: [{ name: "a.log", size: 5, preview: "SCF Done: E = -1.0" }],
      })),
      stageSourceFilesForProject,
    })
    expect(stageSourceFilesForProject).toHaveBeenCalledTimes(1)
    expect(stageSourceFilesForProject.mock.calls[0][0]).toBe("p3")
    expect(stageSourceFilesForProject.mock.calls[0][1][0].name).toBe("a.log")
    expect(stageSourceFilesForProject.mock.calls[0][2]).toEqual({ autoRegister: false })
  })

  it("stages browser-selected imports in the project sidebar without auto-registering canvas nodes", async () => {
    const stageSourceFilesForProject = vi.fn()
    await importFilesForProjectAction({
      fileList: [new File(["SCF Done: E = -1.0"], "picked.log")],
      projectId: "p4",
      stageSourceFilesForProject,
    })

    expect(stageSourceFilesForProject).toHaveBeenCalledTimes(1)
    expect(stageSourceFilesForProject.mock.calls[0][0]).toBe("p4")
    expect(stageSourceFilesForProject.mock.calls[0][1][0].name).toBe("picked.log")
    expect(stageSourceFilesForProject.mock.calls[0][2]).toEqual({ autoRegister: false })
  })

  it("keeps native paths out of deferred staged placeholders", async () => {
    const stageSourceFilesForProject = vi.fn()
    const importedFiles = await importFilesForProjectAction({
      fileList: [new File([""], "finder.log")],
      projectId: "p5",
      stageSourceFilesForProject,
      previewMode: "none",
      prepareFile: () => ({ sourcePath: "/Users/linsay/Gaussian/finder.log" }),
      stageOptions: { autoRegister: false, parseMode: "defer" },
    })

    expect(stageSourceFilesForProject).toHaveBeenCalledTimes(1)
    expect(stageSourceFilesForProject.mock.calls[0][1][0]).toMatchObject({
      name: "finder.log",
      preview: "",
    })
    expect(stageSourceFilesForProject.mock.calls[0][1][0].sourcePath).toBeUndefined()
    expect(importedFiles[0].sourcePath).toBe("/Users/linsay/Gaussian/finder.log")
  })

  it("keeps confirmed project stored paths in deferred placeholders", async () => {
    const stageSourceFilesForProject = vi.fn()
    const importedFiles = await importFilesForProjectAction({
      fileList: [new File([""], "project.log")],
      projectId: "p5",
      stageSourceFilesForProject,
      previewMode: "none",
      prepareFile: () => ({ sourcePath: "/Users/linsay/Study/sources/project.log" }),
      prepareImportedFiles: (files) => files.map((file) => ({ ...file, storedPath: "sources/project.log" })),
      stageOptions: { autoRegister: false, parseMode: "defer" },
    })

    expect(stageSourceFilesForProject.mock.calls[0][1][0]).toMatchObject({
      name: "project.log",
      storedPath: "sources/project.log",
    })
    expect(stageSourceFilesForProject.mock.calls[0][1][0].sourcePath).toBeUndefined()
    expect(importedFiles[0].sourcePath).toBe("/Users/linsay/Study/sources/project.log")
  })

  it("keeps native paths out of deferred desktop dialog placeholders", async () => {
    const stageSourceFilesForProject = vi.fn()
    const importedFiles = await importDesktopFilesAction({
      projectId: "p6",
      chooseFiles: vi.fn(async () => ({
        canceled: false,
        files: [{ name: "dialog.log", size: 5, preview: "", sourcePath: "/Users/linsay/Gaussian/dialog.log" }],
      })),
      stageSourceFilesForProject,
      stageOptions: { autoRegister: false, parseMode: "defer" },
    })

    expect(stageSourceFilesForProject).toHaveBeenCalledTimes(1)
    expect(stageSourceFilesForProject.mock.calls[0][1][0]).toMatchObject({
      name: "dialog.log",
      preview: "",
    })
    expect(stageSourceFilesForProject.mock.calls[0][1][0].sourcePath).toBeUndefined()
    expect(importedFiles[0].sourcePath).toBe("/Users/linsay/Gaussian/dialog.log")
  })

  it("stages project-file drops with update mode", async () => {
    const stageCurrentProjectSourceFiles = vi.fn()
    await handleCanvasRawFileDropAction({
      drop: { kind: "project-files", fileIds: ["file-1"], position: { x: 20, y: 30 } },
      files: [{ id: "file-1", name: "a.log", kind: "Gaussian", size: 1, status: "parsed", preview: "" }],
      stageCurrentProjectSourceFiles,
    })
    expect(stageCurrentProjectSourceFiles).toHaveBeenCalledTimes(1)
    expect(stageCurrentProjectSourceFiles.mock.calls[0][0][0].id).toBe("file-1")
    expect(stageCurrentProjectSourceFiles.mock.calls[0][1].fileMode).toBe("update")
    expect(stageCurrentProjectSourceFiles.mock.calls[0][1].autoRegister).toBe(true)
  })

  it("leaves null candidate review unchanged", () => {
    expect(toggleCandidateReviewSelectionAction(null, "missing")).toBeNull()
  })
})
