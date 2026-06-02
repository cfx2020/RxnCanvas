import { describe, expect, it } from "vitest"
import type { EnergyProfileSummary, WorkbenchArtifactSummary, WorkspaceSummary } from "../shell"
import { buildReportPreviewModel } from "./reportPreviewModel"

describe("report preview model", () => {
  it("shows profile and graph summaries with pending assets before export artifacts exist", () => {
    const model = buildReportPreviewModel({
      workspace: fixtureWorkspace(),
      profile: fixtureProfile({ missing: true, corrections: true }),
      artifacts: [],
      warnings: [{ code: "chemdraw_cdxml_only", message: "CDXML only.", target: "cdxml" }],
      hasActiveBrowserProject: false,
      includeBytes: true,
      selectedFormats: ["png", "cdxml", "xlsx", "csv", "svg"],
    })

    expect(model.project.persistenceLabel).toBe("download-only")
    expect(model.graph).toMatchObject({
      graphId: "graph-a",
      nodeCount: 2,
      edgeCount: 1,
      pathCount: 1,
      activePathId: "path-main",
      snapshotArtifactId: null,
    })
    expect(model.profile).toMatchObject({
      profileId: "profile-a",
      pointCount: 2,
      missingPointCount: 1,
      correctionPointCount: 1,
      outputUnit: "kcal_mol",
    })
    expect(model.assets).toEqual([
      expect.objectContaining({ key: "energy_diagram", status: "warning", artifactIds: [], formats: ["png", "cdxml"] }),
      expect.objectContaining({ key: "energy_table", status: "pending", artifactIds: [], formats: ["xlsx", "csv"] }),
      expect.objectContaining({ key: "graph_snapshot", status: "pending", artifactIds: [], formats: ["svg"] }),
    ])
    expect(model.warnings).toEqual([
      { code: "chemdraw_cdxml_only", message: "CDXML only.", target: "cdxml" },
      { code: "missing_energy", message: "Missing energy.", target: "node-b" },
    ])
  })

  it("marks energy table and graph snapshot ready from artifact metadata", () => {
    const model = buildReportPreviewModel({
      workspace: fixtureWorkspace(),
      profile: fixtureProfile(),
      artifacts: [
        fixtureArtifact("artifact-csv", "csv", {
          artifact_kind: "energy_table",
          energy_table_schema_version: "energy-table-v1",
          energy_table_column_count: 20,
          energy_table_row_count: 2,
        }),
        fixtureArtifact("artifact-svg", "svg", {
          artifact_kind: "graph_snapshot",
          graph_id: "graph-a",
          workspace_id: "workspace-a",
          node_count: 2,
          edge_count: 1,
          path_count: 1,
        }),
      ],
      warnings: [],
      hasActiveBrowserProject: true,
      includeBytes: true,
      selectedFormats: ["csv", "svg"],
    })

    expect(model.project.persistenceLabel).toBe("browser-local")
    expect(model.graph?.snapshotArtifactId).toBe("artifact-svg")
    expect(model.energyTable).toEqual({
      schemaVersion: "energy-table-v1",
      columnCount: 20,
      rowCount: 2,
      artifactId: "artifact-csv",
      format: "csv",
    })
    expect(model.assets.find((asset) => asset.key === "energy_table")).toMatchObject({
      status: "ready",
      artifactIds: ["artifact-csv"],
      formats: ["csv"],
    })
    expect(model.assets.find((asset) => asset.key === "graph_snapshot")).toMatchObject({
      status: "ready",
      artifactIds: ["artifact-svg"],
      formats: ["svg"],
    })
    expect(model.artifacts).toEqual([
      expect.objectContaining({
        id: "artifact-csv",
        format: "csv",
        persisted: true,
        hasInlineBytes: true,
        path: "exports/artifact-csv.csv",
      }),
      expect.objectContaining({
        id: "artifact-svg",
        format: "svg",
        checksum: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    ])
  })

  it("keeps missing inline bytes visible without pretending persistence will happen", () => {
    const { checksum: _checksum, ...artifactWithoutChecksum } = fixtureArtifact("artifact-png", "png", { artifact_kind: "energy_diagram" })
    const model = buildReportPreviewModel({
      workspace: fixtureWorkspace(),
      profile: fixtureProfile(),
      artifacts: [
        {
          ...artifactWithoutChecksum,
          bytes_base64: null,
          has_inline_bytes: false,
          persisted: false,
          path: null,
        },
      ],
      warnings: [],
      hasActiveBrowserProject: true,
      includeBytes: false,
      selectedFormats: ["png"],
    })

    expect(model.project.persistenceLabel).toBe("download-only")
    expect(model.assets.find((asset) => asset.key === "energy_diagram")).toMatchObject({
      status: "ready",
      artifactIds: ["artifact-png"],
    })
    expect(model.artifacts[0]).toMatchObject({
      id: "artifact-png",
      hasInlineBytes: false,
      persisted: false,
      path: null,
      checksum: null,
    })
  })
})

function fixtureWorkspace(): WorkspaceSummary {
  return {
    workspace_id: "workspace-a",
    project_id: "project-a",
    active_path_id: "path-main",
    selection: { node_ids: [], edge_ids: [], path_ids: [] },
    viewport: { x: 0, y: 0, zoom: 1 },
    palette: [],
    graph: {
      id: "graph-a",
      project_id: "project-a",
      node_count: 2,
      edge_count: 1,
      path_count: 1,
      nodes: [
        { id: "node-a", kind: "species", label: "A" },
        { id: "node-b", kind: "species", label: "B" },
      ],
      edges: [{ id: "edge-a-b", from_node: "node-a", to_node: "node-b" }],
      paths: [{ id: "path-main", node_ids: ["node-a", "node-b"] }],
    },
    preview: {
      graph_id: "graph-a",
      active_path_id: "path-main",
      node_count: 2,
      edge_count: 1,
      path_count: 1,
      disconnected_node_ids: [],
      warnings: [],
    },
  }
}

function fixtureProfile(options: { missing?: boolean; corrections?: boolean } = {}): EnergyProfileSummary {
  return {
    id: "profile-a",
    graph_id: "graph-a",
    path_id: "path-main",
    point_count: 2,
    output_unit: "kcal_mol",
    baseline_node_id: "node-a",
    points: [
      {
        node_id: "node-a",
        label: "A",
        relative_energy: { value: 0, unit: "kcal_mol" },
        expression: options.corrections ? {
          node_id: "node-a",
          terms: [],
          corrections: [
            {
              object_id: "object-a",
              correction_id: "corr-a",
              kind: "manual",
              coefficient: 1,
              raw_energy: null,
              converted_energy: null,
              contribution: null,
            },
          ],
          total: { value: -1, unit: "kcal_mol" },
          missing: [],
        } : null,
      },
      {
        node_id: "node-b",
        label: "B",
        relative_energy: options.missing ? null : { value: 4.2, unit: "kcal_mol" },
        missing_reason: options.missing ? "missing_energy" : null,
        warnings: options.missing ? [{ code: "missing_energy", message: "Missing energy.", target: "node-b" }] : [],
      },
    ],
    warnings: [],
  }
}

function fixtureArtifact(
  id: string,
  format: string,
  metadata: WorkbenchArtifactSummary["metadata"],
): WorkbenchArtifactSummary {
  return {
    id,
    format,
    path: `exports/${id}.${format}`,
    bytes_base64: "ZmFrZQ==",
    checksum: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    metadata,
    persisted: true,
    has_inline_bytes: true,
  }
}
