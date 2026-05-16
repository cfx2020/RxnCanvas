import type {
  JsonObject,
  JsonValue,
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

const fixtureSessionId = "session-fixture-web"
const fixtureProject = {
  id: "project-fixture-minimal-reaction",
  name: "Fixture Minimal Reaction",
  schema_version: "project-v1",
}
const fixtureGraphId = "graph-a-b"
const fixtureProfileId = "profile-a-b-electronic"
const fixtureWorkspaceId = "workspace-fixture"

export const fixtureTransport: ShellTransport = {
  kind: "in-process-test",

  async run(payload: ShellCommandPayload<string>): Promise<ShellResponse> {
    if (payload.command === "fixture.run") {
      return fixtureRunResponse()
    }

    if (payload.command === "workbench.snapshot") {
      return fixtureWorkbenchSnapshotResponse(payload.args)
    }

    return invalidCommandResponse(payload.command)
  },
}

function fixtureRunResponse(): ShellResponse<FixtureRunData> {
  return {
    ok: true,
    data: {
      command: "fixture.run",
      session_id: fixtureSessionId,
      project: fixtureProject,
      graph: {
        id: fixtureGraphId,
      },
      profile: {
        id: fixtureProfileId,
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

function fixtureWorkbenchSnapshotResponse(args: JsonObject): ShellResponse {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }

  return {
    ok: true,
    data: {
      command: "workbench.snapshot",
      session_id: fixtureSessionId,
      project_id: fixtureProject.id,
      project_path: null,
      workspace_id: fixtureWorkspaceId,
      graph_id: fixtureGraphId,
      profile_id: fixtureProfileId,
      active: {
        workspace_id: fixtureWorkspaceId,
        graph_id: fixtureGraphId,
        profile_id: fixtureProfileId,
      },
      counts: {
        objects: 2,
        imports: 0,
        graphs: 1,
        workspaces: 1,
        profiles: 1,
        artifacts: 0,
      },
      project: {
        ...fixtureProject,
        resource_count: 0,
      },
      objects: [
        objectSummary("object-a", "Object A"),
        objectSummary("object-b", "Object B"),
      ],
      imports: [],
      workspace: {
        workspace_id: fixtureWorkspaceId,
        project_id: fixtureProject.id,
        active_path_id: "path-a-b",
        palette: [],
        graph: {
          id: fixtureGraphId,
          project_id: fixtureProject.id,
          node_count: 2,
          edge_count: 1,
          path_count: 1,
          nodes: [
            { id: "node-a", object_id: "object-a", label: "Object A" },
            { id: "node-b", object_id: "object-b", label: "Object B" },
          ],
          edges: [{ id: "edge-a-b", source: "node-a", target: "node-b" }],
          paths: [{ id: "path-a-b", node_ids: ["node-a", "node-b"] }],
        },
        preview: {
          graph_id: fixtureGraphId,
          active_path_id: "path-a-b",
          node_count: 2,
          edge_count: 1,
          path_count: 1,
          disconnected_node_ids: [],
          warnings: [],
        },
      },
      profile: {
        id: fixtureProfileId,
        graph_id: fixtureGraphId,
        path_id: "path-a-b",
        point_count: 2,
        output_unit: "kcal_mol",
        baseline_node_id: "node-a",
        points: [
          { node_id: "node-a", label: "Object A", relative_energy: 0, unit: "kcal_mol" },
          { node_id: "node-b", label: "Object B", relative_energy: -12.4, unit: "kcal_mol" },
        ],
      },
      artifacts: [],
      warnings: [],
    },
    error: null,
    warnings: [],
    artifacts: [],
  }
}

function objectSummary(id: string, label: string): JsonObject {
  const energyKeys: JsonValue[] = ["electronic"]
  return {
    id,
    label,
    source_file_id: "fixture-source",
    energy_keys: energyKeys,
  }
}

function invalidSessionResponse(): ShellResponse {
  return {
    ok: false,
    data: null,
    error: {
      code: "invalid_input",
      message: "Shell session not found for fixture snapshot.",
      target: "session_id",
    },
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
