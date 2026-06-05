import { describe, expect, it } from "vitest"
import { MemoryBrowserProjectRepository } from "../repository"
import { initialWorkbenchDomainState } from "./workbenchState"
import { listProjectFileEntries, projectFileEntriesWithWorkbenchProjection } from "./projectFiles"

const encoder = new TextEncoder()

describe("project file projection", () => {
  it("returns no files without an active browser project", async () => {
    const repository = new MemoryBrowserProjectRepository()

    await expect(listProjectFileEntries(repository, undefined)).resolves.toEqual([])
  })

  it("projects only raw inputs into stable project file entries", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Pd Ni" })

    const rawReceipt = await repository.writeObject(project.projectRef, {
      path: "inputs/raw/water.extxyz",
      bytes: encoder.encode("3\nwater\n") as Uint8Array<ArrayBuffer>,
      metadata: { kind: "raw_file", source_name: "water.extxyz" },
    })
    await repository.writeObject(project.projectRef, {
      path: "exports/profile.cdxml",
      bytes: encoder.encode("<CDXML />") as Uint8Array<ArrayBuffer>,
      metadata: { kind: "export_artifact", artifact_id: "artifact-profile-cdxml" },
    })

    await repository.writeObject(project.projectRef, {
      path: ".rxnflow/state/project-content.json",
      bytes: encoder.encode("{}") as Uint8Array<ArrayBuffer>,
      metadata: { kind: "project_content_index" },
    })

    await expect(listProjectFileEntries(repository, project)).resolves.toEqual([
      {
        id: `raw-${rawReceipt.checksum.replace(/^sha256:/, "").slice(0, 12)}`,
        projectRef: project.projectRef,
        path: "inputs/raw/water.extxyz",
        name: "water.extxyz",
        sourceName: "water.extxyz",
        kind: "extxyz",
        byteSize: 8,
        checksum: rawReceipt.checksum,
        status: "stored",
        rawResourceId: `raw-${rawReceipt.checksum.replace(/^sha256:/, "").slice(0, 12)}`,
        registeredObjectIds: [],
        graphNodeIds: [],
        artifactIds: [],
        warnings: [],
      },
    ])
  })

  it("projects registered objects and graph nodes back onto raw project files", () => {
    const entries = [
      {
        id: "raw-water",
        projectRef: "browser-project:pd-ni",
        path: "inputs/raw/water.xyz",
        name: "water.xyz",
        kind: "xyz" as const,
        byteSize: 8,
        checksum: "sha256:abc",
        status: "stored" as const,
        rawResourceId: "raw-water",
        registeredObjectIds: [],
        graphNodeIds: [],
        artifactIds: [],
        warnings: [],
      },
    ]

    const projected = projectFileEntriesWithWorkbenchProjection(entries, {
      ...initialWorkbenchDomainState,
      imports: [
        {
          id: "import-batch-1",
          project_id: "project-1",
          source_count: 1,
          object_count: 1,
          status: "registered",
          items: [
            {
              id: "import-item-water",
              item_id: "import-item-water",
              source_path: "inputs/raw/water.xyz",
              expected_format: "xyz",
              parser: "fixture-parser",
              status: "registered",
              object_count: 1,
              registered_object_ids: ["object-water"],
              preview: {
                raw_resource_id: "raw-water",
                parser_id: "fixture-parser",
                parser_version: "fixture-web",
                object_count: 1,
                candidates: [],
                warnings: [],
              },
              raw_resource: {
                id: "raw-water",
                kind: "raw_file",
                path: "inputs/raw/water.xyz",
                checksum: "sha256:abc",
              },
              warnings: [],
            },
          ],
        },
      ],
      objects: [
        {
          id: "object-water",
          label: "water",
          formula: "H2O",
          source_file_id: "raw-water",
        },
      ],
      workspace: {
        workspace_id: "workspace-1",
        project_id: "project-1",
        active_path_id: null,
        selection: { node_ids: [], edge_ids: [], path_ids: [] },
        viewport: { x: 0, y: 0, zoom: 1 },
        palette: [],
        graph: {
          id: "graph-1",
          project_id: "project-1",
          node_count: 1,
          edge_count: 0,
          path_count: 0,
          nodes: [
            {
              id: "node-water",
              kind: "species",
              label: "water",
              chemical_object_ids: ["object-water"],
              composition: [
                {
                  object_id: "object-water",
                  coefficient: 1,
                  role: "species",
                  label: "water",
                },
              ],
              position: [120, 180],
              metadata: {},
            },
          ],
          edges: [],
          paths: [],
        },
        preview: {
          graph_id: "graph-1",
          active_path_id: null,
          node_count: 1,
          edge_count: 0,
          path_count: 0,
          disconnected_node_ids: [],
          warnings: [],
        },
      },
    })

    expect(projected[0]).toMatchObject({
      status: "used-in-graph",
      registeredObjectIds: ["object-water"],
      graphNodeIds: ["node-water"],
    })
  })
})
