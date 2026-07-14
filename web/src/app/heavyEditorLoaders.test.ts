import { describe, expect, it, vi } from "vitest"
import { createRetryableImport } from "./retryableImport"
import { load3DmolModule, preload3Dmol } from "./Molecule3DmolViewer.loader"
import { loadKetcherEditorHostModule, preloadKetcherEditorHost } from "./KetcherEditorHost.loader"

vi.mock("3dmol", () => ({ createViewer: vi.fn() }))
vi.mock("./KetcherEditorHost", () => ({ KetcherEditorHost: vi.fn() }))

describe("heavy editor import loaders", () => {
  it("shares the 3Dmol import promise between preload and viewer load", async () => {
    const preloaded = preload3Dmol()

    expect(load3DmolModule()).toBe(preloaded)
    await expect(preloaded).resolves.toEqual(expect.objectContaining({ createViewer: expect.any(Function) }))
  })

  it("shares the Ketcher host import promise between preload and React.lazy load", async () => {
    const preloaded = preloadKetcherEditorHost()

    expect(loadKetcherEditorHostModule()).toBe(preloaded)
    await expect(preloaded).resolves.toEqual(expect.objectContaining({ KetcherEditorHost: expect.any(Function) }))
  })

  it("clears a rejected import so the next user intent can retry", async () => {
    const importedModule = { ready: true }
    const importModule = vi.fn<() => Promise<typeof importedModule>>()
      .mockRejectedValueOnce(new Error("synthetic chunk failure"))
      .mockResolvedValueOnce(importedModule)
    const loadModule = createRetryableImport(importModule)
    const failedImport = loadModule()

    expect(loadModule()).toBe(failedImport)
    await expect(failedImport).rejects.toThrow("synthetic chunk failure")

    const retriedImport = loadModule()
    expect(retriedImport).not.toBe(failedImport)
    await expect(retriedImport).resolves.toBe(importedModule)
    expect(importModule).toHaveBeenCalledTimes(2)
  })
})
