export type DesktopEngineStatus =
  | {
      ok: true
      data: {
        status: "ready"
        engineVersion: string
        pythonVersion?: string
        capabilities: string[]
      }
    }
  | {
      ok: false
      error: {
        code: string
        message: string
      }
    }

export function browserPreviewEngineStatus(): DesktopEngineStatus {
  return {
    ok: false,
    error: {
      code: "browser_preview",
      message: "Browser preview",
    },
  }
}

export function engineStatusFailure(error: unknown): DesktopEngineStatus {
  return {
    ok: false,
    error: {
      code: "engine_status_failed",
      message: error instanceof Error ? error.message : "Engine status unavailable",
    },
  }
}
