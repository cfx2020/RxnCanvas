import type {
  JsonObject,
  ShellCommandPayload,
  ShellResponse,
  ShellTransport,
} from "./types"

let requestCounter = 0

export class ShellClient {
  constructor(private readonly transport: ShellTransport) {}

  async run<TData extends JsonObject = JsonObject>(
    payload: ShellCommandPayload<string>,
  ): Promise<ShellResponse<TData>> {
    const requestId = payload.requestId ?? nextRequestId()
    const response = await this.transport.run({
      ...payload,
      requestId,
      args: payload.args ?? {},
    })
    return normalizeShellResponse(response) as ShellResponse<TData>
  }
}

export function normalizeShellResponse<TData extends JsonObject>(
  response: ShellResponse<TData>,
): ShellResponse<TData> {
  return {
    ok: response.ok,
    data: response.data ?? null,
    error: response.error ?? null,
    warnings: response.warnings ?? [],
    artifacts: response.artifacts ?? [],
  }
}

function nextRequestId(): string {
  requestCounter += 1
  return `web-shell-${requestCounter}`
}
