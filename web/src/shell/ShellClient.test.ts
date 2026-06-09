import { describe, expect, it, vi } from "vitest"
import { createConfiguredShellRuntime, createHttpShellTransport, fixtureTransport, ShellClient } from "."
import type {
  EnergyComputeData,
  ExportProfileData,
  FixtureRunData,
  ImportPreviewData,
  ImportRegisterAllData,
  ImportRegisterSelectionData,
  RegistryApplyCorrectionData,
  WorkbenchSnapshotData,
  WorkspaceCommandData,
} from "."

describe("ShellClient", () => {
  it("uses fixture transport by default in configured runtime", () => {
    const runtime = createConfiguredShellRuntime({})

    expect(runtime.transport.kind).toBe("in-process-test")
    expect(runtime.runtimeInfo.mode).toBe("fixture")
    expect(runtime.runtimeInfo.transportKind).toBe("in-process-test")
  })

  it("uses http-api transport when local-http runtime env is selected", () => {
    const runtime = createConfiguredShellRuntime({
      VITE_RXNFLOW_SHELL_TRANSPORT: "local-http",
      VITE_RXNFLOW_SHELL_ENDPOINT: "http://127.0.0.1:8765/api/shell",
    })

    expect(runtime.transport.kind).toBe("http-api")
    expect(runtime.runtimeInfo.mode).toBe("local-http")
    expect(runtime.runtimeInfo.transportKind).toBe("http-api")
    expect(runtime.runtimeInfo.endpoint).toBe("http://127.0.0.1:8765/api/shell")
  })

  it("posts shell payloads through http-api transport", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      data: { command: "fixture.run" },
      error: null,
      warnings: [],
      artifacts: [],
    })))
    const transport = createHttpShellTransport({
      endpoint: "http://127.0.0.1:8765/api/shell",
      fetchImpl,
    })

    const response = await transport.run({ command: "fixture.run", args: {} })

    expect(response.ok).toBe(true)
    expect(response.data?.command).toBe("fixture.run")
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/api/shell",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "fixture.run", args: {} }),
      }),
    )
  })

  it("normalizes http-api fetch failures to transport_unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("connection refused")
    })
    const transport = createHttpShellTransport({
      endpoint: "http://127.0.0.1:8765/api/shell",
      fetchImpl,
    })

    const response = await transport.run({ command: "fixture.run", args: {} })

    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe("transport_unavailable")
    expect(response.error?.target).toBe("http-api")
    expect(response.error?.details).toMatchObject({
      endpoint: "http://127.0.0.1:8765/api/shell",
      reason: "connection refused",
    })
  })

  it("normalizes missing http-api endpoints to transport_unavailable without fetch", async () => {
    const fetchImpl = vi.fn()
    const transport = createHttpShellTransport({
      endpoint: "   ",
      fetchImpl,
    })

    const response = await transport.run({ command: "fixture.run", args: {} })

    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe("transport_unavailable")
    expect(response.error?.target).toBe("http-api")
    expect(response.error?.details).toMatchObject({ endpoint: "" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("preserves bridge shell errors from non-2xx http-api responses", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      data: null,
      error: {
        code: "invalid_json",
        message: "Invalid JSON body.",
        target: "body",
        details: null,
      },
      warnings: [],
      artifacts: [],
    }), { status: 400 }))
    const transport = createHttpShellTransport({
      endpoint: "http://127.0.0.1:8765/api/shell",
      fetchImpl,
    })

    const response = await transport.run({ command: "fixture.run", args: {} })

    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe("invalid_json")
    expect(response.error?.target).toBe("body")
  })

  it("normalizes non-ok http-api responses with ok shell bodies to transport_unavailable", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      data: { command: "fixture.run" },
      error: null,
      warnings: [],
      artifacts: [],
    }), { status: 502 }))
    const transport = createHttpShellTransport({
      endpoint: "http://127.0.0.1:8765/api/shell",
      fetchImpl,
    })

    const response = await transport.run({ command: "fixture.run", args: {} })

    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe("transport_unavailable")
    expect(response.error?.target).toBe("http-api")
    expect(response.error?.details).toMatchObject({
      endpoint: "http://127.0.0.1:8765/api/shell",
      status: 502,
    })
  })

  it("normalizes malformed http-api responses to transport_unavailable", async () => {
    const transport = createHttpShellTransport({
      endpoint: "http://127.0.0.1:8765/api/shell",
      fetchImpl: vi.fn(async () => new Response("not-json")),
    })

    const response = await transport.run({ command: "fixture.run", args: {} })

    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe("transport_unavailable")
    expect(response.error?.target).toBe("http-api")
  })

  it("returns a JSON-safe fixture.run response", async () => {
    const shellClient = new ShellClient(fixtureTransport)

    const response = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })

    expect(response.ok).toBe(true)
    expect(response.data?.command).toBe("fixture.run")
    expect(response.data?.profile.id).toBe("profile-a-b-electronic")
    expect(response.data?.object_count).toBe(2)
    expect(() => JSON.stringify(response)).not.toThrow()
  })

  it("returns a JSON-safe workbench.snapshot response for the fixture session", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })

    const response = await shellClient.run<WorkbenchSnapshotData>({
      command: "workbench.snapshot",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
      },
    })

    expect(response.ok).toBe(true)
    expect(response.data?.command).toBe("workbench.snapshot")
    expect(response.data?.counts.objects).toBe(2)
    expect(response.data?.workspace?.graph.node_count).toBe(2)
    expect(response.data?.profile?.point_count).toBe(2)
    expect(() => JSON.stringify(response)).not.toThrow()
  })

  it("returns invalid_input when fixture snapshot has no session", async () => {
    const shellClient = new ShellClient(fixtureTransport)

    const response = await shellClient.run({
      command: "workbench.snapshot",
      args: {},
    })

    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe("invalid_input")
    expect(response.error?.target).toBe("session_id")
  })

  it("normalizes unknown commands to invalid_input responses", async () => {
    const shellClient = new ShellClient(fixtureTransport)

    const response = await shellClient.run({
      command: "missing.command",
      args: {},
    })

    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe("invalid_input")
    expect(response.error?.target).toBe("command")
    expect(() => JSON.stringify(response)).not.toThrow()
  })

  it("returns a JSON-safe import.preview response with success, failure, and warnings", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })

    const response = await shellClient.run<ImportPreviewData>({
      command: "import.preview",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        source_paths: ["transient/water.xyz", "transient/bad-count.xyz"],
        expected_format: "xyz",
        strict: false,
      },
    })

    expect(response.ok).toBe(true)
    expect(response.data?.command).toBe("import.preview")
    expect(response.data?.batch.items.map((item) => item.status)).toEqual([
      "needs_confirmation",
      "failed",
    ])
    expect(response.data?.batch.items[0].preview?.parser_id).toBe("xyz-ase")
    expect(response.data?.batch.items[0].preview?.object_count).toBe(1)
    expect(response.data?.batch.items[0].preview?.candidates?.[0]).toMatchObject({
      object_index: 0,
      label: "water.xyz",
      coordinate_preview: {
        atom_count: 3,
        has3d: true,
        preview_kind: "text",
      },
    })
    expect(response.data?.batch.items[0].warnings[0].code).toBe("missing_section")
    expect(response.data?.batch.items[1].error?.code).toBe("parse_failed")
    expect(response.warnings[0].code).toBe("unit_assumed")
    expect(() => JSON.stringify(response)).not.toThrow()
  })

  it("does not label non-water fixture imports as water", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })

    const response = await shellClient.run<ImportPreviewData>({
      command: "import.preview",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        source_paths: ["inputs/raw/Bfix6-ts.log"],
      },
    })

    expect(response.ok).toBe(true)
    expect(response.data?.batch.items[0].preview?.candidates?.[0]).toMatchObject({
      label: "Bfix6-ts.log",
      coordinate_preview: {
        preview_kind: "unavailable",
      },
    })
  })

  it("parses inline Gaussian fixture geometry for project-file graph drops", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })
    const stalePreview = await shellClient.run<ImportPreviewData>({
      command: "import.preview",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        source_paths: ["inputs/raw/Bfix6-ts.log"],
      },
    })
    const staleRegistered = await shellClient.run<ImportRegisterAllData>({
      command: "import.register_all",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        batch_id: stalePreview.data?.batch.id ?? "",
      },
    })
    const staleObject = staleRegistered.data?.objects.find((object) => object.label === "Bfix6-ts.log")
    expect(staleObject?.geometry).toHaveLength(0)

    const gaussianLog = [
      " Charge = 0 Multiplicity = 1",
      " SCF Done:  E(RB3LYP) =  -123.456789     A.U. after   10 cycles",
      " Standard orientation:",
      " ---------------------------------------------------------------------",
      " Center     Atomic      Atomic             Coordinates (Angstroms)",
      " Number     Number       Type             X           Y           Z",
      " ---------------------------------------------------------------------",
      "      1          6           0        0.000000    0.000000    0.000000",
      "      2          1           0        0.000000    0.000000    1.089000",
      " ---------------------------------------------------------------------",
    ].join("\n")

    const preview = await shellClient.run<ImportPreviewData>({
      command: "import.preview",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        sources: [
          {
            kind: "inline_bytes",
            filename: "Bfix6-ts.log",
            bytes_base64: btoa(gaussianLog),
            mime_type: "text/plain",
          },
        ],
      },
    })

    expect(preview.ok).toBe(true)
    expect(preview.warnings).toHaveLength(0)
    expect(preview.data?.batch.items[0].preview?.candidates?.[0]).toMatchObject({
      label: "Bfix6-ts.log",
      charge: 0,
      spin_multiplicity: 1,
      display_energy: {
        value: -123.456789,
        unit: "hartree",
      },
      coordinate_preview: {
        atom_count: 2,
        has3d: true,
        preview_kind: "text",
      },
    })

    const registered = await shellClient.run<ImportRegisterAllData>({
      command: "import.register_all",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        batch_id: preview.data?.batch.id ?? "",
      },
    })

    expect(registered.ok).toBe(true)
    const importedObject = registered.data?.objects.find((object) => object.label === "Bfix6-ts.log")
    expect(importedObject?.geometry).toHaveLength(2)
    expect(importedObject).toMatchObject({
      formula: "CH",
      charge: 0,
      spin_multiplicity: 1,
      method: "Gaussian log",
    })
  })

  it("registers the fixture import batch idempotently", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })
    const preview = await shellClient.run<ImportPreviewData>({
      command: "import.preview",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        source_paths: ["transient/water.xyz"],
      },
    })

    const first = await shellClient.run<ImportRegisterAllData>({
      command: "import.register_all",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        batch_id: preview.data?.batch.id ?? "",
      },
    })
    const repeated = await shellClient.run<ImportRegisterAllData>({
      command: "import.register_all",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        batch_id: preview.data?.batch.id ?? "",
      },
    })

    expect(first.ok).toBe(true)
    expect(first.data?.registered_object_ids).toEqual(["object-imported-water"])
    expect(first.data?.batch.items[0].status).toBe("registered")
    expect(first.data?.objects.map((object) => object.id)).toContain("object-imported-water")
    expect(repeated.data?.registered_object_ids).toEqual(first.data?.registered_object_ids)
    expect(() => JSON.stringify(first)).not.toThrow()
  })

  it("registers selected fixture import candidates", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })
    const preview = await shellClient.run<ImportPreviewData>({
      command: "import.preview",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        source_paths: ["transient/multi.extxyz"],
      },
    })

    expect(preview.data?.batch.items[0].preview?.object_count).toBe(2)
    expect(preview.data?.batch.items[0].preview?.candidates?.map((candidate) => candidate.label)).toEqual([
      "Frame 1",
      "Frame 2",
    ])

    const selected = await shellClient.run<ImportRegisterSelectionData>({
      command: "import.register_selection",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        batch_id: preview.data?.batch.id ?? "",
        item_id: preview.data?.batch.items[0].id ?? "",
        object_indices: [1],
      },
    })
    const invalid = await shellClient.run<ImportRegisterSelectionData>({
      command: "import.register_selection",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        batch_id: preview.data?.batch.id ?? "",
        item_id: preview.data?.batch.items[0].id ?? "",
        object_indices: [9],
      },
    })

    expect(selected.ok).toBe(true)
    expect(selected.data?.command).toBe("import.register_selection")
    expect(selected.data?.registered_object_ids).toEqual(["object-imported-frame-2"])
    expect(selected.data?.objects.map((object) => object.id)).toContain("object-imported-frame-2")
    expect(invalid.ok).toBe(false)
    expect(invalid.error?.target).toBe("object_indices")
    expect(() => JSON.stringify(selected)).not.toThrow()
  })

  it("returns invalid_input when import.preview has no source paths", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })

    const response = await shellClient.run({
      command: "import.preview",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
      },
    })

    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe("invalid_input")
    expect(response.error?.target).toBe("source_path")
  })

  it("runs fixture workspace commands with JSON-safe graph projection", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })
    const sessionId = fixtureResponse.data?.session_id ?? ""

    const opened = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.open",
      args: { session_id: sessionId },
    })
    expect(opened.ok).toBe(true)
    expect(opened.data?.workspace.graph.nodes.map((node) => node.id)).toEqual(["node-a", "node-b"])

    const added = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.add_node",
      args: {
        session_id: sessionId,
        kind: "species",
        label: "Water node",
        chemical_object_ids: ["object-a"],
        position: [520, 180],
      },
    })
    expect(added.ok).toBe(true)
    expect(added.data?.workspace.graph.node_count).toBe(3)
    expect(added.data?.workspace.graph.nodes[2].chemical_object_ids).toEqual(["object-a"])
    expect(added.data?.workspace.graph.nodes[2].composition).toEqual([
      { object_id: "object-a", coefficient: 1, role: null, label: null, metadata: {} },
    ])

    const composition = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.set_node_composition",
      args: {
        session_id: sessionId,
        node_id: "node-web-3",
        composition: [
          { object_id: "object-a", coefficient: 1 },
          { object_id: "object-b", coefficient: 2, role: "reagent" },
        ],
      },
    })
    expect(composition.ok).toBe(true)
    expect(composition.data?.command).toBe("workspace.set_node_composition")
    expect(composition.data?.workspace.graph.nodes[2].chemical_object_ids).toEqual(["object-a", "object-b"])
    expect(composition.data?.workspace.graph.nodes[2].composition?.[1].coefficient).toBe(2)

    const moved = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.move_node",
      args: {
        session_id: sessionId,
        node_id: "node-web-3",
        position: [420, 220],
      },
    })
    expect(moved.ok).toBe(true)
    expect(moved.data?.command).toBe("workspace.move_node")
    expect(moved.data?.workspace.graph.nodes[2].position).toEqual([420, 220])

    const selected = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.select",
      args: {
        session_id: sessionId,
        selection: {
          node_ids: ["node-web-3"],
        },
      },
    })
    expect(selected.ok).toBe(true)
    expect(selected.data?.command).toBe("workspace.select")
    expect(selected.data?.workspace.selection).toEqual({
      node_ids: ["node-web-3"],
      edge_ids: [],
      path_ids: [],
    })

    const connected = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.connect",
      args: {
        session_id: sessionId,
        from_node_id: "node-b",
        to_node_id: "node-web-3",
      },
    })
    const repeated = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.connect",
      args: {
        session_id: sessionId,
        from_node_id: "node-b",
        to_node_id: "node-web-3",
      },
    })
    expect(connected.ok).toBe(true)
    expect(repeated.data?.workspace.graph.edge_count).toBe(2)
    const edgeId = connected.data?.workspace.graph.edges.find((edge) => edge.to_node === "node-web-3")?.id

    const edgeLabel = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.update_edge",
      args: {
        session_id: sessionId,
        edge_id: edgeId ?? "",
        label: "TS search",
      },
    })
    expect(edgeLabel.ok).toBe(true)
    expect(edgeLabel.data?.command).toBe("workspace.update_edge")
    expect(edgeLabel.data?.workspace.graph.edges.find((edge) => edge.id === edgeId)?.label).toBe("TS search")

    const clearedEdgeLabel = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.update_edge",
      args: {
        session_id: sessionId,
        edge_id: edgeId ?? "",
        label: "   ",
      },
    })
    expect(clearedEdgeLabel.ok).toBe(true)
    expect(clearedEdgeLabel.data?.workspace.graph.edges.find((edge) => edge.id === edgeId)?.label).toBeNull()

    const path = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.set_path",
      args: {
        session_id: sessionId,
        path_id: "path-web-main",
        node_ids: ["node-a", "node-b", "node-web-3"],
      },
    })
    expect(path.ok).toBe(true)
    expect(path.data?.workspace.active_path_id).toBe("path-web-main")
    expect(path.data?.workspace.graph.paths.map((item) => item.id)).toContain("path-web-main")
    expect(() => JSON.stringify(path)).not.toThrow()

    const removedPath = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.remove",
      args: {
        session_id: sessionId,
        path_ids: ["path-web-main"],
      },
    })
    expect(removedPath.ok).toBe(true)
    expect(removedPath.data?.command).toBe("workspace.remove")
    expect(removedPath.data?.workspace.graph.node_count).toBe(3)
    expect(removedPath.data?.workspace.graph.edge_count).toBe(2)
    expect(removedPath.data?.workspace.graph.paths.map((item) => item.id)).not.toContain("path-web-main")
    expect(removedPath.data?.workspace.active_path_id).toBeNull()

    const restoredPath = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.set_path",
      args: {
        session_id: sessionId,
        path_id: "path-web-main",
        node_ids: ["node-a", "node-b", "node-web-3"],
      },
    })
    expect(restoredPath.ok).toBe(true)

    const removedEdge = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.remove",
      args: {
        session_id: sessionId,
        edge_ids: [edgeId ?? ""],
      },
    })
    expect(removedEdge.ok).toBe(true)
    expect(removedEdge.data?.command).toBe("workspace.remove")
    expect(removedEdge.data?.workspace.graph.edge_count).toBe(1)
    expect(removedEdge.data?.workspace.graph.node_count).toBe(3)

    const removedNode = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.remove",
      args: {
        session_id: sessionId,
        node_ids: ["node-web-3"],
      },
    })
    expect(removedNode.ok).toBe(true)
    expect(removedNode.data?.workspace.graph.nodes.map((node) => node.id)).not.toContain("node-web-3")
    expect(removedNode.data?.workspace.graph.paths.map((item) => item.id)).not.toContain("path-web-main")
    expect(removedNode.data?.workspace.selection?.node_ids).toEqual([])
  })

  it("allocates fixture graph node ids without reusing existing ids after deletion", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })
    const sessionId = fixtureResponse.data?.session_id ?? ""

    await shellClient.run<WorkspaceCommandData>({
      command: "workspace.open",
      args: { session_id: sessionId },
    })
    await shellClient.run<WorkspaceCommandData>({
      command: "workspace.add_node",
      args: {
        session_id: sessionId,
        kind: "species",
        label: "First added node",
        chemical_object_ids: ["object-a"],
      },
    })
    await shellClient.run<WorkspaceCommandData>({
      command: "workspace.add_node",
      args: {
        session_id: sessionId,
        kind: "species",
        label: "Second added node",
        chemical_object_ids: ["object-b"],
      },
    })
    await shellClient.run<WorkspaceCommandData>({
      command: "workspace.remove",
      args: {
        session_id: sessionId,
        node_ids: ["node-web-3"],
      },
    })

    const added = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.add_node",
      args: {
        session_id: sessionId,
        kind: "species",
        label: "Replacement node",
        chemical_object_ids: ["object-a"],
      },
    })

    expect(added.ok).toBe(true)
    expect(added.data?.workspace.graph.nodes.map((node) => node.id)).toEqual([
      "node-a",
      "node-b",
      "node-web-4",
      "node-web-5",
    ])
  })

  it("repairs duplicate graph ids when opening persisted project content", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const response = await shellClient.run({
      command: "project.open",
      args: {
        content_files: [
          projectContentFile(".rxnflow/state/reaction-graphs.json", {
            graphs: [
              {
                id: "graph-duplicate",
                project_id: "project-duplicate",
                nodes: [
                  { id: "node-web-3", kind: "species", label: "TS", position: [120, 160] },
                  { id: "node-web-3", kind: "species", label: "TS copy", position: [360, 160] },
                ],
                edges: [
                  { id: "edge-duplicate", from_node: "node-web-3", to_node: "node-web-3" },
                ],
                paths: [
                  { id: "path-duplicate", label: "Path", node_ids: ["node-web-3", "node-web-3"] },
                ],
              },
            ],
          }),
          projectContentFile(".rxnflow/state/workspaces.json", {
            workspaces: [
              {
                workspace_id: "workspace-duplicate",
                project_id: "project-duplicate",
                graph_id: "graph-duplicate",
                active_path_id: "path-duplicate",
                selection: {},
                viewport: { x: 0, y: 0, zoom: 1 },
              },
            ],
          }),
        ],
      },
    })

    expect(response.ok).toBe(true)
    const opened = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.open",
      args: { session_id: "session-fixture-web" },
    })

    expect(opened.ok).toBe(true)
    expect(opened.data?.workspace.graph.nodes.map((node) => node.id)).toEqual([
      "node-web-3",
      "node-web-3-2",
    ])
    expect(opened.data?.workspace.graph.edges[0]).toMatchObject({
      from_node: "node-web-3",
      to_node: "node-web-3-2",
    })
    expect(opened.data?.workspace.graph.paths[0].node_ids).toEqual(["node-web-3", "node-web-3-2"])
  })

  it("returns structured errors for invalid fixture workspace selections", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })
    const sessionId = fixtureResponse.data?.session_id ?? ""

    const missingSelection = await shellClient.run({
      command: "workspace.select",
      args: { session_id: sessionId },
    })
    expect(missingSelection.ok).toBe(false)
    expect(missingSelection.error?.code).toBe("invalid_input")
    expect(missingSelection.error?.target).toBe("selection")

    const missingNode = await shellClient.run({
      command: "workspace.select",
      args: {
        session_id: sessionId,
        selection: { node_ids: ["node-missing"] },
      },
    })
    expect(missingNode.ok).toBe(false)
    expect(missingNode.error?.code).toBe("graph_invalid")
    expect(missingNode.error?.target).toBe("node_id")

    const cleared = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.select",
      args: {
        session_id: sessionId,
        selection: {},
      },
    })
    expect(cleared.ok).toBe(true)
    expect(cleared.data?.workspace.selection).toEqual({
      node_ids: [],
      edge_ids: [],
      path_ids: [],
    })
  })

  it("returns structured errors for invalid fixture node moves", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })
    const sessionId = fixtureResponse.data?.session_id ?? ""

    const missingNode = await shellClient.run({
      command: "workspace.move_node",
      args: {
        session_id: sessionId,
        node_id: "node-missing",
        position: [100, 100],
      },
    })
    expect(missingNode.ok).toBe(false)
    expect(missingNode.error?.code).toBe("graph_invalid")
    expect(missingNode.error?.target).toBe("node_id")

    const invalidPosition = await shellClient.run({
      command: "workspace.move_node",
      args: {
        session_id: sessionId,
        node_id: "node-a",
        position: ["bad", 100],
      },
    })
    expect(invalidPosition.ok).toBe(false)
    expect(invalidPosition.error?.code).toBe("invalid_input")
    expect(invalidPosition.error?.target).toBe("position")
  })

  it("updates fixture workspace viewport without changing graph state", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })
    const sessionId = fixtureResponse.data?.session_id ?? ""
    const snapshot = await shellClient.run<WorkbenchSnapshotData>({
      command: "workbench.snapshot",
      args: { session_id: sessionId },
    })
    const graphBefore = snapshot.data?.workspace?.graph

    expect(snapshot.ok).toBe(true)
    expect(snapshot.data?.workspace?.viewport).toEqual({ x: 0, y: 0, zoom: 1 })

    const updated = await shellClient.run<WorkspaceCommandData>({
      command: "workspace.set_viewport",
      args: {
        session_id: sessionId,
        viewport: { x: 12, y: -8, zoom: 1.5 },
      },
    })

    expect(updated.ok).toBe(true)
    expect(updated.data?.command).toBe("workspace.set_viewport")
    expect(updated.data?.workspace.viewport).toEqual({ x: 12, y: -8, zoom: 1.5 })
    expect(updated.data?.workspace.graph).toEqual(graphBefore)
    expect(() => JSON.stringify(updated)).not.toThrow()

    const zeroZoom = await shellClient.run({
      command: "workspace.set_viewport",
      args: {
        session_id: sessionId,
        viewport: { x: 0, y: 0, zoom: 0 },
      },
    })
    expect(zeroZoom.ok).toBe(false)
    expect(zeroZoom.error?.code).toBe("invalid_input")
    expect(zeroZoom.error?.target).toBe("viewport.zoom")

    const afterInvalid = await shellClient.run<WorkbenchSnapshotData>({
      command: "workbench.snapshot",
      args: { session_id: sessionId },
    })
    expect(afterInvalid.data?.workspace?.viewport).toEqual({ x: 12, y: -8, zoom: 1.5 })
    expect(afterInvalid.data?.workspace?.graph).toEqual(graphBefore)
  })

  it("returns structured errors for invalid fixture workspace viewports", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })
    const sessionId = fixtureResponse.data?.session_id ?? ""

    const missingSession = await shellClient.run({
      command: "workspace.set_viewport",
      args: {
        session_id: "missing-session",
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(missingSession.ok).toBe(false)
    expect(missingSession.error?.code).toBe("invalid_input")
    expect(missingSession.error?.target).toBe("session_id")

    const missingViewport = await shellClient.run({
      command: "workspace.set_viewport",
      args: { session_id: sessionId },
    })
    expect(missingViewport.ok).toBe(false)
    expect(missingViewport.error?.code).toBe("invalid_input")
    expect(missingViewport.error?.target).toBe("viewport")

    const badNumber = await shellClient.run({
      command: "workspace.set_viewport",
      args: {
        session_id: sessionId,
        viewport: { x: Number.NaN, y: 0, zoom: 1 },
      },
    })
    expect(badNumber.ok).toBe(false)
    expect(badNumber.error?.code).toBe("invalid_input")
    expect(badNumber.error?.target).toBe("viewport")
  })

  it("returns structured errors for invalid fixture removes", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })
    const sessionId = fixtureResponse.data?.session_id ?? ""

    const empty = await shellClient.run({
      command: "workspace.remove",
      args: { session_id: sessionId },
    })
    expect(empty.ok).toBe(false)
    expect(empty.error?.code).toBe("invalid_input")
    expect(empty.error?.target).toBe("selection")

    const missingNode = await shellClient.run({
      command: "workspace.remove",
      args: { session_id: sessionId, node_ids: ["node-missing"] },
    })
    expect(missingNode.ok).toBe(false)
    expect(missingNode.error?.code).toBe("graph_invalid")
    expect(missingNode.error?.target).toBe("node_id")

    const missingEdge = await shellClient.run({
      command: "workspace.remove",
      args: { session_id: sessionId, edge_ids: ["edge-missing"] },
    })
    expect(missingEdge.ok).toBe(false)
    expect(missingEdge.error?.code).toBe("graph_invalid")
    expect(missingEdge.error?.target).toBe("edge_id")

    const missingPath = await shellClient.run({
      command: "workspace.remove",
      args: { session_id: sessionId, path_ids: ["path-missing"] },
    })
    expect(missingPath.ok).toBe(false)
    expect(missingPath.error?.code).toBe("graph_invalid")
    expect(missingPath.error?.target).toBe("path_id")
  })

  it("returns graph_invalid when connecting a missing fixture node", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })

    const response = await shellClient.run({
      command: "workspace.connect",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        from_node_id: "node-a",
        to_node_id: "missing-node",
      },
    })

    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe("graph_invalid")
    expect(response.error?.target).toBe("node_id")
  })

  it("returns structured errors for invalid fixture edge label updates", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })
    const sessionId = fixtureResponse.data?.session_id ?? ""

    const missingEdge = await shellClient.run({
      command: "workspace.update_edge",
      args: {
        session_id: sessionId,
        edge_id: "edge-missing",
        label: "TS search",
      },
    })
    expect(missingEdge.ok).toBe(false)
    expect(missingEdge.error?.code).toBe("graph_invalid")
    expect(missingEdge.error?.target).toBe("edge_id")

    const missingEdgeId = await shellClient.run({
      command: "workspace.update_edge",
      args: {
        session_id: sessionId,
        label: "TS search",
      },
    })
    expect(missingEdgeId.ok).toBe(false)
    expect(missingEdgeId.error?.code).toBe("invalid_input")
    expect(missingEdgeId.error?.target).toBe("edge_id")

    const badLabel = await shellClient.run({
      command: "workspace.update_edge",
      args: {
        session_id: sessionId,
        edge_id: "edge-a-b",
        label: 1,
      },
    })
    expect(badLabel.ok).toBe(false)
    expect(badLabel.error?.code).toBe("invalid_input")
    expect(badLabel.error?.target).toBe("edge_label")
  })

  it("computes a JSON-safe fixture energy profile from the active path", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })

    const response = await shellClient.run<EnergyComputeData>({
      command: "energy.compute",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        path_id: "path-a-b",
        output_unit: "kj_mol",
        include_corrections: true,
        energy_key: "electronic",
        baseline_node_id: "node-a",
        energy_source: "thermochemistry",
        correction_policy: { mode: "kinds", kinds: ["solvation"] },
      },
    })

    expect(response.ok).toBe(true)
    expect(response.data?.command).toBe("energy.compute")
    expect(response.data?.profile.path_id).toBe("path-a-b")
    expect(response.data?.profile.output_unit).toBe("kj_mol")
    expect(response.data?.profile.energy_key).toBe("electronic")
    expect(response.data?.profile.energy_source).toBe("thermochemistry")
    expect(response.data?.profile.correction_policy).toEqual({
      mode: "kinds",
      kinds: ["solvation"],
      ids: [],
    })
    expect(response.data?.profile.points).toHaveLength(2)
    expect(response.data?.profile.points[0].label).toBe("Object A")
    expect(response.data?.profile.points[1].relative_energy).toMatchObject({
      unit: "kj_mol",
      reference: "fixture-electronic",
    })
    expect(response.warnings[0].code).toBe("corrections_empty")
    expect(() => JSON.stringify(response)).not.toThrow()
  })

  it("projects fixture object energy channels", async () => {
    const shellClient = new ShellClient(fixtureTransport)

    const response = await shellClient.run<WorkbenchSnapshotData>({
      command: "workbench.snapshot",
      args: { session_id: "session-fixture-web" },
    })

    expect(response.ok).toBe(true)
    expect(response.data?.objects[0].energy_keys).toEqual(["electronic"])
    expect(response.data?.objects[0].thermochemistry_keys).toEqual(["gibbs"])
    expect(response.data?.objects[0].energy_channels).toEqual([
      expect.objectContaining({ key: "electronic", source: "energies" }),
      expect.objectContaining({ key: "gibbs", source: "thermochemistry" }),
    ])
  })

  it("applies fixture object corrections and reflects them in snapshots", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })
    const sessionId = fixtureResponse.data?.session_id ?? ""

    const applied = await shellClient.run<RegistryApplyCorrectionData>({
      command: "registry.apply_correction",
      args: {
        session_id: sessionId,
        object_id: "object-b",
        correction: {
          kind: "solvation",
          energy: { value: -2.4, unit: "kcal_mol", reference: "SMD" },
          note: "fixture solvation",
        },
      },
    })

    expect(applied.ok).toBe(true)
    expect(applied.data?.command).toBe("registry.apply_correction")
    expect(applied.data?.object.id).toBe("object-b")
    expect(applied.data?.object.correction_count).toBe(1)
    expect(applied.data?.object.corrections?.[0]).toMatchObject({
      id: expect.stringMatching(/^corr-object-b-solvation-/),
      kind: "solvation",
      energy: { value: -2.4, unit: "kcal_mol", reference: "SMD" },
      note: "fixture solvation",
    })

    const repeated = await shellClient.run<RegistryApplyCorrectionData>({
      command: "registry.apply_correction",
      args: {
        session_id: sessionId,
        object_id: "object-b",
        correction: {
          kind: "solvation",
          energy: { value: -2.4, unit: "kcal_mol", reference: "SMD" },
          note: "fixture solvation",
        },
      },
    })
    expect(repeated.ok).toBe(true)
    expect(repeated.data?.object.correction_count).toBe(1)

    const snapshot = await shellClient.run<WorkbenchSnapshotData>({
      command: "workbench.snapshot",
      args: { session_id: sessionId },
    })
    const objectB = snapshot.data?.objects.find((object) => object.id === "object-b")
    expect(objectB?.correction_count).toBe(1)
    expect(objectB?.corrections?.[0].kind).toBe("solvation")
    expect(() => JSON.stringify(snapshot)).not.toThrow()
  })

  it("returns invalid_input for invalid fixture correction payloads", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })
    const sessionId = fixtureResponse.data?.session_id ?? ""

    const invalidKind = await shellClient.run({
      command: "registry.apply_correction",
      args: {
        session_id: sessionId,
        object_id: "object-b",
        correction: {
          kind: "bad",
          energy: { value: -2.4, unit: "kcal_mol" },
        },
      },
    })
    expect(invalidKind.ok).toBe(false)
    expect(invalidKind.error?.target).toBe("correction.kind")

    const invalidUnit = await shellClient.run({
      command: "registry.apply_correction",
      args: {
        session_id: sessionId,
        object_id: "object-b",
        correction: {
          kind: "manual",
          energy: { value: -2.4, unit: "eV" },
        },
      },
    })
    expect(invalidUnit.ok).toBe(false)
    expect(invalidUnit.error?.target).toBe("correction.energy.unit")

    const missingObject = await shellClient.run({
      command: "registry.apply_correction",
      args: {
        session_id: sessionId,
        object_id: "object-missing",
        correction: {
          kind: "manual",
          energy: { value: -2.4, unit: "kcal_mol" },
        },
      },
    })
    expect(missingObject.ok).toBe(false)
    expect(missingObject.error?.target).toBe("object_id")
  })

  it("returns graph_invalid when computing a missing fixture energy path", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })

    const response = await shellClient.run({
      command: "energy.compute",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        path_id: "missing-path",
      },
    })

    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe("graph_invalid")
    expect(response.error?.target).toBe("path_id")
  })

  it("exports JSON-safe fixture profile artifacts with inline bytes", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })

    const response = await shellClient.run<ExportProfileData>({
      command: "export.profile",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        formats: ["png", "cdxml", "xlsx", "csv", "svg"],
        include_bytes: true,
        basename: "fixture-export",
        title: "Fixture Export",
      },
    })

    expect(response.ok).toBe(true)
    expect(response.data?.command).toBe("export.profile")
    expect(response.data?.artifact_count).toBe(5)
    expect(response.artifacts.map((artifact) => artifact.format)).toEqual(["png", "cdxml", "xlsx", "csv", "svg"])
    expect(response.artifacts[0].id).toBe("artifact-png-fixture-export")
    expect(response.artifacts[0].bytes_base64).toEqual(expect.any(String))
    expect(response.artifacts[0].metadata).toMatchObject({
      basename: "fixture-export",
      title: "Fixture Export",
      profile_id: "profile-a-b-electronic",
      writer_id: "fixture-png-energy-plot-v1",
      extension: "png",
      mime_type: "image/png",
      artifact_kind: "energy_diagram",
      format_status: "supported",
      encoding: "base64",
    })
    expect(response.artifacts[1].metadata).toMatchObject({
      writer_id: "fixture-cdxml-energy-v1",
      mime_type: "chemical/x-cdxml",
      extension: "cdxml",
    })
    expect(response.artifacts[2].metadata).toMatchObject({
      writer_id: "fixture-xlsx-energy-table-v1",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
      artifact_kind: "energy_table",
    })
    expect(response.artifacts[3].metadata).toMatchObject({
      writer_id: "fixture-csv-energy-table-v1",
      mime_type: "text/csv",
      extension: "csv",
      artifact_kind: "energy_table",
      energy_table_schema_version: "energy-table-v1",
      energy_table_row_count: 2,
    })
    expect(response.artifacts[4].metadata).toMatchObject({
      writer_id: "fixture-svg-graph-snapshot-v1",
      mime_type: "image/svg+xml",
      extension: "svg",
      artifact_kind: "graph_snapshot",
      workspace_id: "workspace-fixture",
      svg_width: 720,
      svg_height: 432,
    })
    expect(atob(response.artifacts[4].bytes_base64 ?? "")).toContain("<svg")
    expect(response.warnings[0].code).toBe("chemdraw_cdxml_only")
    expect(() => JSON.stringify(response)).not.toThrow()
  })

  it("exports fixture artifacts without inline bytes when include_bytes is false", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })

    const response = await shellClient.run<ExportProfileData>({
      command: "export.profile",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        formats: ["png"],
        include_bytes: false,
      },
    })

    expect(response.ok).toBe(true)
    expect(response.artifacts).toHaveLength(1)
    expect(response.artifacts[0].bytes_base64).toBeNull()
    expect(response.artifacts[0].metadata.encoding).toBeNull()
  })

  it("returns invalid_input when exporting without formats", async () => {
    const shellClient = new ShellClient(fixtureTransport)
    const fixtureResponse = await shellClient.run<FixtureRunData>({
      command: "fixture.run",
      args: {},
    })

    const response = await shellClient.run({
      command: "export.profile",
      args: {
        session_id: fixtureResponse.data?.session_id ?? "",
        formats: [],
      },
    })

    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe("invalid_input")
    expect(response.error?.target).toBe("formats")
  })
})

function projectContentFile(path: string, value: unknown) {
  return {
    path,
    bytes_base64: btoa(JSON.stringify(value)),
    metadata: {},
  }
}
