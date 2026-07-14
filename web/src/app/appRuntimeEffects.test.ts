import { describe, expect, it, vi } from "vitest"
import {
  autosaveProjectPackageToRuntime,
  forgetProjectInRuntime,
  openProjectPackageFromRuntime,
  saveProjectPackageToRuntime,
  restoreStartupProjectFromRuntime,
  setActiveProjectInRuntime,
  subscribeProjectPackageRuntimeMenus,
  watchDesktopEngineStatus,
  type RxnflowDesktopApi,
  type ProjectPackageOpenPayload,
  type ProjectPackageOpenResult,
} from "./appRuntimeEffects"
import type { DesktopEngineStatus } from "./desktopRuntime"

function desktopApi(overrides: Partial<RxnflowDesktopApi> = {}): RxnflowDesktopApi {
  return {
    platform: "darwin",
    chooseFiles: vi.fn(),
    getEngineStatus: vi.fn(async () => ({ ok: true, data: { status: "ready", engineVersion: "test", capabilities: [] } }) as DesktopEngineStatus),
    saveJsonSnapshot: vi.fn(),
    saveReportArtifact: vi.fn(),
    openProjectPackage: vi.fn(async () => ({ canceled: false, content: "{}", validation: null })),
    saveProjectPackage: vi.fn(async () => ({ canceled: false, validation: null })),
    onMenuImportFiles: vi.fn(() => vi.fn()),
    onMenuOpenProject: vi.fn(() => vi.fn()),
    onMenuSaveProject: vi.fn(() => vi.fn()),
    onOpenProjectContent: vi.fn(() => vi.fn()),
    ...overrides,
  }
}

describe("appRuntimeEffects", () => {
  const canvases = [{
    id: "canvas-1",
    label: "画布 1",
    nodes: [],
    edges: [],
    barriers: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeIds: [],
    selectedEdgeIds: [],
    selectedBarrierIds: [],
  }]

  it("opens browser file picker when no desktop open API exists", async () => {
    const click = vi.fn()
    const restoreProjectPackage = vi.fn()
    await openProjectPackageFromRuntime({
      desktopApi: undefined,
      projectInput: { click } as unknown as HTMLInputElement,
      restoreProjectPackage,
    })
    expect(click).toHaveBeenCalledTimes(1)
    expect(restoreProjectPackage).not.toHaveBeenCalled()
  })

  it("opens a desktop project package and restores content", async () => {
    const api = desktopApi()
    const restoreProjectPackage = vi.fn()
    await openProjectPackageFromRuntime({ desktopApi: api, projectInput: null, restoreProjectPackage })
    expect(api.openProjectPackage).toHaveBeenCalledTimes(1)
    expect(restoreProjectPackage).toHaveBeenCalledWith("{}", null, {
      replaceProjects: false,
      projectDirectory: undefined,
    })
  })

  it("opens a desktop project folder as a workspace replacement", async () => {
    const api = desktopApi({
      openProjectPackage: vi.fn(async () => ({
        canceled: false,
        content: "{}",
        projectDirectory: "/tmp/ir.rxnflow",
        validation: null,
      })),
    })
    const restoreProjectPackage = vi.fn()
    await openProjectPackageFromRuntime({ desktopApi: api, projectInput: null, restoreProjectPackage })
    expect(restoreProjectPackage).toHaveBeenCalledWith("{}", null, {
      replaceProjects: true,
      projectDirectory: "/tmp/ir.rxnflow",
    })
  })

  it("saves a desktop project package and applies validation", async () => {
    const api = desktopApi()
    const setProjectValidation = vi.fn()
    await saveProjectPackageToRuntime({
      desktopApi: api,
      project: { id: "p", label: "Project", meta: "open" },
      files: [],
      canvases,
      activeCanvasId: "canvas-1",
      setProjectValidation,
    })
    expect(api.saveProjectPackage).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.saveProjectPackage).mock.calls[0]?.[0].defaultName).toBe("project.rxnflow.zip")
    expect(setProjectValidation).toHaveBeenCalledWith(null)
  })

  it("autosaves a desktop project package without a save dialog", async () => {
    const autosaveProjectPackage: RxnflowDesktopApi["autosaveProjectPackage"] = vi.fn(async () => ({
      canceled: false,
      content: "{}",
      projectDirectory: "/tmp/project.rxnflow",
      validation: null,
    }))
    const api = desktopApi({ autosaveProjectPackage })
    const setProjectValidation = vi.fn()
    const result = await autosaveProjectPackageToRuntime({
      desktopApi: api,
      project: { id: "p", label: "Project", meta: "open" },
      files: [],
      canvases,
      activeCanvasId: "canvas-1",
      setProjectValidation,
    })
    expect(autosaveProjectPackage).toHaveBeenCalledTimes(1)
    expect(vi.mocked(autosaveProjectPackage).mock.calls[0]?.[0].defaultName).toBe("project.rxnflow")
    expect(result?.projectDirectory).toBe("/tmp/project.rxnflow")
    expect(setProjectValidation).toHaveBeenCalledWith(null)
  })

  it("subscribes and disposes project package menu listeners", () => {
    const openDispose = vi.fn()
    const saveDispose = vi.fn()
    const contentDispose = vi.fn()
    const api = desktopApi({
      onMenuOpenProject: vi.fn(() => openDispose),
      onMenuSaveProject: vi.fn(() => saveDispose),
      onOpenProjectContent: vi.fn(() => contentDispose),
    })
    const dispose = subscribeProjectPackageRuntimeMenus({
      desktopApi: api,
      openProjectPackage: vi.fn(),
      saveProjectPackage: vi.fn(),
      restoreProjectPackage: vi.fn(),
    })
    dispose()
    expect(openDispose).toHaveBeenCalledTimes(1)
    expect(saveDispose).toHaveBeenCalledTimes(1)
    expect(contentDispose).toHaveBeenCalledTimes(1)
  })

  it("restores menu-opened desktop project content with its project directory", () => {
    let openProjectContent: ((payload: ProjectPackageOpenPayload) => void) | null = null
    const api = desktopApi({
      onOpenProjectContent: vi.fn((callback) => {
        openProjectContent = callback
        return vi.fn()
      }),
    })
    const restoreProjectPackage = vi.fn()
    subscribeProjectPackageRuntimeMenus({
      desktopApi: api,
      openProjectPackage: vi.fn(),
      saveProjectPackage: vi.fn(),
      restoreProjectPackage,
    })

    expect(openProjectContent).not.toBeNull()
    const emitOpenProjectContent = openProjectContent as unknown as (payload: ProjectPackageOpenPayload) => void
    emitOpenProjectContent({
      content: "{\"packageKind\":\"rxnflow-project\"}",
      projectDirectory: "/tmp/recent.rxnflow",
      validation: null,
      replaceProjects: true,
    })

    expect(restoreProjectPackage).toHaveBeenCalledWith("{\"packageKind\":\"rxnflow-project\"}", null, {
      replaceProjects: true,
      projectDirectory: "/tmp/recent.rxnflow",
    })
  })

  it("restores startup project content from the desktop runtime once available", async () => {
    const getStartupProjectContent = vi.fn(async () => ({
      canceled: false,
      content: "{\"packageKind\":\"rxnflow-project\"}",
      projectDirectory: "/tmp/ir.rxnflow",
      validation: null,
      replaceProjects: true,
      source: "startup",
    }))
    const api = desktopApi({ getStartupProjectContent })
    const restoreProjectPackages = vi.fn()
    const dispose = restoreStartupProjectFromRuntime({ desktopApi: api, restoreProjectPackages })
    await Promise.resolve()
    expect(getStartupProjectContent).toHaveBeenCalledTimes(1)
    expect(restoreProjectPackages).toHaveBeenCalledTimes(1)
    expect(restoreProjectPackages).toHaveBeenCalledWith([{
      canceled: false,
      content: "{\"packageKind\":\"rxnflow-project\"}",
      projectDirectory: "/tmp/ir.rxnflow",
      validation: null,
      replaceProjects: true,
      source: "startup",
    }])
    dispose()
  })

  it("delivers every startup project content as one ordered batch", async () => {
    const getStartupProjectContent = vi.fn(async () => ({
      canceled: false,
      projectContents: [
        { content: "{\"id\":\"older\"}", projectDirectory: "/tmp/older.rxnflow", validation: null, replaceProjects: true, source: "startup" },
        { content: "{\"id\":\"newer\"}", projectDirectory: "/tmp/newer.rxnflow", validation: null, replaceProjects: true, source: "startup" },
      ],
    }))
    const api = desktopApi({ getStartupProjectContent })
    const restoreProjectPackages = vi.fn()
    restoreStartupProjectFromRuntime({ desktopApi: api, restoreProjectPackages })
    await Promise.resolve()
    expect(restoreProjectPackages).toHaveBeenCalledTimes(1)
    expect(restoreProjectPackages.mock.calls[0][0]).toEqual([
      { content: "{\"id\":\"older\"}", projectDirectory: "/tmp/older.rxnflow", validation: null, replaceProjects: true, source: "startup" },
      { content: "{\"id\":\"newer\"}", projectDirectory: "/tmp/newer.rxnflow", validation: null, replaceProjects: true, source: "startup" },
    ])
  })

  it("shares an in-flight startup request while keeping subscription cancellation isolated", async () => {
    let resolveStartup!: (result: ProjectPackageOpenResult) => void
    const startupRequest = new Promise<ProjectPackageOpenResult>((resolve) => {
      resolveStartup = resolve
    })
    const getStartupProjectContent = vi.fn(() => startupRequest)
    const api = desktopApi({ getStartupProjectContent })
    const firstRestore = vi.fn()
    const firstSettled = vi.fn()
    const secondRestore = vi.fn()
    const secondSettled = vi.fn()

    const disposeFirst = restoreStartupProjectFromRuntime({
      desktopApi: api,
      restoreProjectPackages: firstRestore,
      onSettled: firstSettled,
    })
    restoreStartupProjectFromRuntime({
      desktopApi: api,
      restoreProjectPackages: secondRestore,
      onSettled: secondSettled,
    })
    disposeFirst()

    expect(getStartupProjectContent).toHaveBeenCalledTimes(1)

    resolveStartup({
      canceled: false,
      content: "{\"id\":\"restored\"}",
      projectDirectory: "/tmp/restored.rxnflow",
      validation: null,
      source: "startup",
    })
    await startupRequest
    await Promise.resolve()

    expect(firstRestore).not.toHaveBeenCalled()
    expect(firstSettled).not.toHaveBeenCalled()
    expect(secondRestore).toHaveBeenCalledWith([{
      canceled: false,
      content: "{\"id\":\"restored\"}",
      projectDirectory: "/tmp/restored.rxnflow",
      validation: null,
      source: "startup",
    }])
    await vi.waitFor(() => expect(secondSettled).toHaveBeenCalledTimes(1))
  })

  it("starts a fresh startup request after the shared request settles", async () => {
    const getStartupProjectContent = vi.fn()
      .mockResolvedValueOnce({ canceled: true })
      .mockResolvedValueOnce({
        canceled: false,
        content: "{\"id\":\"next\"}",
        validation: null,
        source: "startup",
      })
    const api = desktopApi({ getStartupProjectContent })
    const firstSettled = vi.fn()

    restoreStartupProjectFromRuntime({
      desktopApi: api,
      restoreProjectPackages: vi.fn(),
      onSettled: firstSettled,
    })
    await Promise.resolve()
    await Promise.resolve()

    const secondRestore = vi.fn()
    restoreStartupProjectFromRuntime({
      desktopApi: api,
      restoreProjectPackages: secondRestore,
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(getStartupProjectContent).toHaveBeenCalledTimes(2)
    expect(firstSettled).toHaveBeenCalledTimes(1)
    expect(secondRestore).toHaveBeenCalledWith([{
      canceled: false,
      content: "{\"id\":\"next\"}",
      validation: null,
      source: "startup",
    }])
  })

  it("persists the active desktop project when the renderer switches workspaces", async () => {
    const setActiveProject = vi.fn(async () => ({ ok: true, projectDirectory: "/tmp/ir.rxnflow" }))
    setActiveProjectInRuntime({
      desktopApi: desktopApi({ setActiveProject }),
      projectId: "ir-workspace",
      projectDirectory: "/tmp/ir.rxnflow",
    })
    await Promise.resolve()
    expect(setActiveProject).toHaveBeenCalledWith({
      projectId: "ir-workspace",
      projectDirectory: "/tmp/ir.rxnflow",
    })
  })

  it("forgets a desktop project when removed from the sidebar", async () => {
    const forgetProject = vi.fn(async () => ({ ok: true, projectDirectory: "/tmp/ir.rxnflow" }))
    forgetProjectInRuntime({ desktopApi: desktopApi({ forgetProject }), projectId: "ir-workspace" })
    await Promise.resolve()
    expect(forgetProject).toHaveBeenCalledWith({ projectId: "ir-workspace" })
  })

  it("watches desktop engine status", async () => {
    const setEngineStatus = vi.fn()
    const dispose = watchDesktopEngineStatus({ desktopApi: desktopApi(), setEngineStatus })
    await Promise.resolve()
    expect(setEngineStatus).toHaveBeenCalledWith(null)
    expect(setEngineStatus).toHaveBeenCalledWith({ ok: true, data: { status: "ready", engineVersion: "test", capabilities: [] } })
    dispose()
  })
})
