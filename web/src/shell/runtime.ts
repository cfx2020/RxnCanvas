import { ShellClient } from "./ShellClient"
import { fixtureTransport } from "./fixtureTransport"
import { createHttpShellTransport } from "./httpTransport"
import type { ShellRuntimeInfo, ShellTransport } from "./types"

export type ShellRuntimeEnv = Record<string, string | boolean | undefined> & {
  VITE_RXNFLOW_SHELL_TRANSPORT?: string
  VITE_RXNFLOW_SHELL_ENDPOINT?: string
}

export type ConfiguredShellRuntime = {
  shellClient: ShellClient
  transport: ShellTransport
  runtimeInfo: ShellRuntimeInfo
}

const defaultLocalHttpEndpoint = "http://127.0.0.1:8765/api/shell"

export function createConfiguredShellRuntime(env: ShellRuntimeEnv): ConfiguredShellRuntime {
  const mode = env.VITE_RXNFLOW_SHELL_TRANSPORT === "local-http" ? "local-http" : "fixture"
  if (mode === "local-http") {
    const endpoint = env.VITE_RXNFLOW_SHELL_ENDPOINT?.trim() || defaultLocalHttpEndpoint
    const transport = createHttpShellTransport({ endpoint })
    return {
      shellClient: new ShellClient(transport),
      transport,
      runtimeInfo: {
        mode,
        endpoint,
        transportKind: transport.kind,
      },
    }
  }

  return {
    shellClient: new ShellClient(fixtureTransport),
    transport: fixtureTransport,
    runtimeInfo: {
      mode: "fixture",
      transportKind: fixtureTransport.kind,
    },
  }
}
