import { describe, expect, it } from "vitest"
import { browserPreviewEngineStatus, engineStatusFailure } from "./desktopRuntime"

describe("desktopRuntime", () => {
  it("builds browser preview engine status", () => {
    expect(browserPreviewEngineStatus()).toEqual({
      ok: false,
      error: {
        code: "browser_preview",
        message: "Browser preview",
      },
    })
  })

  it("normalizes engine status failures", () => {
    expect(engineStatusFailure(new Error("boom"))).toEqual({
      ok: false,
      error: {
        code: "engine_status_failed",
        message: "boom",
      },
    })
    expect(engineStatusFailure("nope")).toEqual({
      ok: false,
      error: {
        code: "engine_status_failed",
        message: "Engine status unavailable",
      },
    })
  })
})
