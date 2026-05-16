import { describe, expect, it } from "vitest"
import type { ShellResponse } from "../shell"
import {
  projectWorkbenchSnapshot,
  type WorkbenchSnapshotData,
} from "./workbenchState"

describe("workbench state projection", () => {
  it("projects successful workbench snapshots into domain state", () => {
    const response: ShellResponse<WorkbenchSnapshotData> = {
      ok: true,
      data: {
        command: "workbench.snapshot",
        session_id: "session-1",
        project_id: "project-demo",
        project_path: "/tmp/demo",
        workspace_id: "workspace-a",
        graph_id: "graph-a",
        profile_id: "profile-a",
        active: {
          workspace_id: "workspace-a",
          graph_id: "graph-a",
          profile_id: "profile-a",
        },
        counts: {
          objects: 2,
          imports: 1,
          graphs: 1,
          workspaces: 1,
          profiles: 1,
          artifacts: 1,
        },
        project: {
          id: "project-demo",
          name: "Demo",
          schema_version: "project-v1",
          resource_count: 3,
        },
        objects: [
          {
            id: "object-a",
            label: "A",
            source_file_id: "raw-a",
            energy_keys: ["electronic"],
          },
        ],
        imports: [
          {
            id: "batch-a",
            project_id: "project-demo",
            items: [],
          },
        ],
        workspace: null,
        profile: {
          id: "profile-a",
          graph_id: "graph-a",
          path_id: "path-a",
          point_count: 2,
          output_unit: "kcal_mol",
          baseline_node_id: "node-a",
          points: [],
        },
        artifacts: [
          {
            id: "artifact-a",
            format: "png",
            path: "exports/a.png",
            bytes_base64: null,
            metadata: {},
            persisted: true,
            has_inline_bytes: false,
          },
        ],
        warnings: [],
      },
      warnings: [],
      artifacts: [],
    }

    const state = projectWorkbenchSnapshot(response)

    expect(state.status).toBe("success")
    expect(state.sessionId).toBe("session-1")
    expect(state.project?.name).toBe("Demo")
    expect(state.active.graphId).toBe("graph-a")
    expect(state.counts.objects).toBe(2)
    expect(state.objects[0].energy_keys).toEqual(["electronic"])
    expect(state.profile?.point_count).toBe(2)
    expect(state.artifacts[0].persisted).toBe(true)
  })

  it("preserves shell errors when snapshot projection fails", () => {
    const response: ShellResponse<WorkbenchSnapshotData> = {
      ok: false,
      data: null,
      error: {
        code: "invalid_input",
        message: "Session id is required.",
        target: "session_id",
      },
      warnings: [
        {
          code: "note",
          message: "warning survives",
          target: "session_id",
        },
      ],
      artifacts: [],
    }

    const state = projectWorkbenchSnapshot(response)

    expect(state.status).toBe("error")
    expect(state.error?.code).toBe("invalid_input")
    expect(state.error?.target).toBe("session_id")
    expect(state.warnings[0].code).toBe("note")
    expect(state.counts.objects).toBe(0)
  })
})
