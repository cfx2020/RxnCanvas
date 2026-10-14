import { afterEach, describe, expect, it, vi } from "vitest"
import { getBrowserEngineStatus, parseBrowserSourceFile } from "./browserEngine"

afterEach(() => vi.unstubAllGlobals())

describe("browser Python engine", () => {
  it("uploads the original complete File, including data beyond the old preview limit", async () => {
    const file = new File(["x".repeat(700_000), "\nfinal coordinates\n"], "TS 1.log")
    const parse = { parsed: true, parseScope: "full-file", parserId: "gaussian-log-cclib+rxncanvas-text-full-file" }
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { parse } }) })
    vi.stubGlobal("fetch", fetch)

    await expect(parseBrowserSourceFile(file)).resolves.toEqual(parse)
    expect(fetch).toHaveBeenCalledWith("/api/import/preview?name=TS+1.log", expect.objectContaining({
      method: "POST",
      body: file,
      headers: { "content-type": "application/octet-stream", "x-rxncanvas-request": "1" },
    }))
  })

  it("rejects preview results and reports backend failures without local parsing", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: { parse: { parsed: true, parseScope: "preview" } } }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: { code: "engine_busy", message: "Parser busy." } }) })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    vi.stubGlobal("fetch", fetch)
    const file = new File(["SCF Done: E(RB3LYP) = -76.4 A.U."], "water.log")

    await expect(parseBrowserSourceFile(file)).rejects.toMatchObject({ code: "engine_bad_response" })
    await expect(parseBrowserSourceFile(file)).rejects.toMatchObject({ code: "engine_busy" })
    await expect(parseBrowserSourceFile(file)).rejects.toMatchObject({ code: "engine_unavailable" })
  })

  it("reads actual Python readiness in browser mode", async () => {
    const status = { ok: true, data: { status: "ready", engineVersion: "test", capabilities: ["import.full_file"] } }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => status }))
    await expect(getBrowserEngineStatus()).resolves.toEqual(status)
  })
})
