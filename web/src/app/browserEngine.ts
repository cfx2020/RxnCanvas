import type { SourceParseResult } from "../domain/sourceParseTypes"
import type { DesktopEngineStatus } from "./desktopRuntime"

export class BrowserEngineError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

export async function parseBrowserSourceFile(file: File): Promise<SourceParseResult> {
  const result = await engineRequest<{ parse: SourceParseResult }>(
    `/api/import/preview?${new URLSearchParams({ name: file.name })}`,
    { method: "POST", body: file, headers: { "content-type": "application/octet-stream" } },
  )
  if (!result.ok) throw new BrowserEngineError(result.error.code, result.error.message)
  const parse = result.data?.parse
  if (!parse || typeof parse.parsed !== "boolean" || parse.parseScope !== "full-file") {
    throw new BrowserEngineError("engine_bad_response", "The Python engine did not return a full-file parse result.")
  }
  return parse
}

export async function getBrowserEngineStatus(): Promise<DesktopEngineStatus> {
  return engineRequest<Extract<DesktopEngineStatus, { ok: true }>["data"]>("/api/engine/status")
}

async function engineRequest<T>(url: string, init: RequestInit = {}): Promise<
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { ...init.headers, "x-rxncanvas-request": "1" },
      signal: AbortSignal.timeout(130000),
    })
    const result = await response.json()
    if (result?.ok === false && typeof result.error?.message === "string") return result
    if (!response.ok || result?.ok !== true || !result.data) {
      throw new Error("Invalid engine response.")
    }
    return result
  } catch {
    return {
      ok: false,
      error: {
        code: "engine_unavailable",
        message: "Python parser unavailable. Start the workbench with npm run dev or npm run preview.",
      },
    }
  }
}
