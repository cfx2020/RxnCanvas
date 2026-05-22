import type {
  JsonObject,
  JsonValue,
  ShellCommandPayload,
  ShellResponse,
  ShellTransport,
} from "./types"

export type HttpShellTransportOptions = {
  endpoint: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export function createHttpShellTransport(options: HttpShellTransportOptions): ShellTransport {
  const endpoint = options.endpoint.trim()
  const timeoutMs = options.timeoutMs ?? 30_000
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis)

  return {
    kind: "http-api",
    async run(payload: ShellCommandPayload<string>): Promise<ShellResponse> {
      if (!endpoint) {
        return transportUnavailable(endpoint, "HTTP shell endpoint is not configured.")
      }
      if (!fetchImpl) {
        return transportUnavailable(endpoint, "Fetch API is not available in this runtime.")
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
        const rawText = await response.text()
        const parsed = parseShellResponse(rawText)
        if (!parsed.ok) {
          return transportUnavailable(endpoint, parsed.message, { status: response.status })
        }
        if (!response.ok && parsed.response.ok) {
          return transportUnavailable(endpoint, `HTTP shell bridge returned ${response.status}.`, {
            status: response.status,
          })
        }
        return parsed.response
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        return transportUnavailable(endpoint, "HTTP shell bridge is unavailable.", { reason })
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

function parseShellResponse(text: string):
  | { ok: true; response: ShellResponse }
  | { ok: false; message: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, message: "HTTP shell bridge returned invalid JSON." }
  }
  if (!isShellResponse(parsed)) {
    return { ok: false, message: "HTTP shell bridge returned a malformed ShellResponse." }
  }
  return { ok: true, response: parsed }
}

function isShellResponse(value: unknown): value is ShellResponse {
  if (!isJsonObject(value)) return false
  if (typeof value.ok !== "boolean") return false
  if (!Array.isArray(value.warnings)) return false
  if (!Array.isArray(value.artifacts)) return false
  if (value.data !== undefined && value.data !== null && !isJsonValue(value.data)) return false
  if (value.error !== undefined && value.error !== null && !isJsonObject(value.error)) return false
  return true
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue)
  }
  if (isJsonObject(value)) {
    return Object.values(value).every(isJsonValue)
  }
  return false
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function transportUnavailable(
  endpoint: string,
  message: string,
  details: JsonObject = {},
): ShellResponse {
  return {
    ok: false,
    data: null,
    error: {
      code: "transport_unavailable",
      message,
      target: "http-api",
      details: {
        endpoint,
        ...details,
      },
    },
    warnings: [],
    artifacts: [],
  }
}
