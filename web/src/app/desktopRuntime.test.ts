import { describe, expect, it } from "vitest"
import { engineStatusFailure } from "./desktopRuntime"

describe("desktopRuntime", () => {
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
