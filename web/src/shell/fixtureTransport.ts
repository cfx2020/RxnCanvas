import type {
  JsonObject,
  ShellCommandPayload,
  ShellResponse,
  ShellTransport,
} from "./types"

export type FixtureRunData = JsonObject & {
  command: "fixture.run"
  session_id: string
  project: {
    id: string
    name: string
    schema_version: string
  }
  graph: {
    id: string
  }
  profile: {
    id: string
    point_count: number
    output_unit: "kcal_mol"
  }
  object_count: number
  artifact_count: number
}

export const fixtureTransport: ShellTransport = {
  kind: "in-process-test",

  async run(payload: ShellCommandPayload<string>): Promise<ShellResponse> {
    if (payload.command === "fixture.run") {
      return fixtureRunResponse()
    }

    return invalidCommandResponse(payload.command)
  },
}

function fixtureRunResponse(): ShellResponse<FixtureRunData> {
  return {
    ok: true,
    data: {
      command: "fixture.run",
      session_id: "session-fixture-web",
      project: {
        id: "project-fixture-minimal-reaction",
        name: "Fixture Minimal Reaction",
        schema_version: "project-v1",
      },
      graph: {
        id: "graph-a-b",
      },
      profile: {
        id: "profile-a-b-electronic",
        point_count: 2,
        output_unit: "kcal_mol",
      },
      object_count: 2,
      artifact_count: 0,
    },
    error: null,
    warnings: [],
    artifacts: [],
  }
}

function invalidCommandResponse(command: string): ShellResponse {
  return {
    ok: false,
    data: null,
    error: {
      code: "invalid_input",
      message: `Unknown shell command: ${command}`,
      target: "command",
    },
    warnings: [],
    artifacts: [],
  }
}
