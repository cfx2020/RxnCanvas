import type {
  CorrectionSummary,
  EnergyComputeData,
  ExportFormat,
  ExportProfileData,
  EnergyOutputUnit,
  EnergyProfilePointSummary,
  EnergyProfileSummary,
  GraphEdgeSummary,
  GraphNodeSummary,
  GraphPathSummary,
  ImportBatchSummary,
  ImportPreviewData,
  ImportRegisterAllData,
  ObjectSummary,
  JsonObject,
  JsonValue,
  RegistryApplyCorrectionData,
  ShellArtifact,
  ShellCommandPayload,
  ShellResponse,
  ShellTransport,
  WorkbenchSnapshotData,
  WorkspaceCommandData,
  WorkspaceSelectionSummary,
  WorkspaceSummary,
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
const fixtureImportBatch = importBatchSummary("needs_confirmation")
const fixtureRegisteredObjectIds = ["object-imported-water"]
let fixtureWorkspace = baseWorkspaceSummary()
let fixtureProfile = profileSummary({
  pathId: "path-a-b",
  outputUnit: "kcal_mol",
  energyKey: "electronic",
  baselineNodeId: "node-a",
})
const initialFixtureObjects: ObjectSummary[] = [
  objectSummary("object-a", "Object A") as ObjectSummary,
  objectSummary("object-b", "Object B", {
    formula: "H2",
    charge: 0,
    spin_multiplicity: 1,
    method: "B3LYP/def2-SVP",
    parser_id: "fixture-parser",
    source_file_id: "fixture-source",
    warnings: [
      {
        code: "unit_assumed",
        message: "Fixture object B energy unit was assumed during projection.",
        target: "object-b",
      },
    ],
  }) as ObjectSummary,
  {
    id: "object-imported-water",
    label: "water.xyz",
    formula: "H2O",
    charge: 0,
    spin_multiplicity: 1,
    method: "xyz geometry",
    source_file_id: "raw-water-xyz",
    energy_keys: ["electronic"],
    thermochemistry_keys: [],
    provenance: {
      source_file_id: "raw-water-xyz",
      parser_id: "xyz-ase",
      parser_version: "fixture-web",
      parsed_at: "2026-05-20T00:00:00Z",
    },
    correction_count: 0,
    warnings: [
      {
        code: "missing_section",
        message: "Imported fixture object has no thermochemistry section.",
        target: "object-imported-water",
      },
    ],
  },
]
let fixtureObjects: ObjectSummary[] = cloneObjects(initialFixtureObjects.slice(0, 2))

export const fixtureTransport: ShellTransport = {
  kind: "in-process-test",

  async run(payload: ShellCommandPayload<string>): Promise<ShellResponse> {
    if (payload.command === "fixture.run") {
      return fixtureRunResponse()
    }

    if (payload.command === "workbench.snapshot") {
      return fixtureWorkbenchSnapshotResponse(payload.args)
    }

    if (payload.command === "project.open") {
      return fixtureProjectOpenResponse(payload.args)
    }

    if (payload.command === "project.save_content") {
      return fixtureProjectSaveContentResponse(payload.args)
    }

    if (payload.command === "import.preview") {
      return fixtureImportPreviewResponse(payload.args)
    }

    if (payload.command === "import.register_all") {
      return fixtureImportRegisterAllResponse(payload.args)
    }

    if (payload.command === "registry.apply_correction") {
      return fixtureRegistryApplyCorrectionResponse(payload.args)
    }

    if (payload.command === "workspace.open") {
      return fixtureWorkspaceOpenResponse(payload.args)
    }

    if (payload.command === "workspace.add_node") {
      return fixtureWorkspaceAddNodeResponse(payload.args)
    }

    if (payload.command === "workspace.set_node_composition") {
      return fixtureWorkspaceSetNodeCompositionResponse(payload.args)
    }

    if (payload.command === "workspace.move_node") {
      return fixtureWorkspaceMoveNodeResponse(payload.args)
    }

    if (payload.command === "workspace.remove") {
      return fixtureWorkspaceRemoveResponse(payload.args)
    }

    if (payload.command === "workspace.set_viewport") {
      return fixtureWorkspaceSetViewportResponse(payload.args)
    }

    if (payload.command === "workspace.select") {
      return fixtureWorkspaceSelectResponse(payload.args)
    }

    if (payload.command === "workspace.connect") {
      return fixtureWorkspaceConnectResponse(payload.args)
    }

    if (payload.command === "workspace.set_path") {
      return fixtureWorkspaceSetPathResponse(payload.args)
    }

    if (payload.command === "energy.compute") {
      return fixtureEnergyComputeResponse(payload.args)
    }

    if (payload.command === "export.profile") {
      return fixtureExportProfileResponse(payload.args)
    }

    return invalidCommandResponse(payload.command)
  },
}

function fixtureRunResponse(): ShellResponse<FixtureRunData> {
  fixtureWorkspace = baseWorkspaceSummary()
  fixtureObjects = cloneObjects(initialFixtureObjects.slice(0, 2))
  fixtureProfile = profileSummary({
    pathId: "path-a-b",
    outputUnit: "kcal_mol",
    energyKey: "electronic",
    baselineNodeId: "node-a",
  })
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

function fixtureWorkbenchSnapshotResponse(args: JsonObject): ShellResponse<WorkbenchSnapshotData> {
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
      profile_id: fixtureProfile.id,
      active: {
        workspace_id: fixtureWorkspaceId,
        graph_id: fixtureGraphId,
        profile_id: fixtureProfile.id,
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
        ...cloneObjects(fixtureObjects.filter((object) => object.id === "object-a" || object.id === "object-b")),
      ],
      imports: [],
      workspace: fixtureWorkspace,
      profile: fixtureProfile,
      artifacts: [],
      warnings: [],
    },
    error: null,
    warnings: [],
    artifacts: [],
  }
}

function fixtureProjectOpenResponse(args: JsonObject): ShellResponse {
  if (!Array.isArray(args.content_files)) {
    return {
      ok: false,
      data: null,
      error: {
        code: "invalid_input",
        message: "Fixture project open requires content_files.",
        target: "content_files",
      },
      warnings: [],
      artifacts: [],
    }
  }
  fixtureWorkspace = workspaceFromProjectContentFiles(args.content_files) ?? baseWorkspaceSummary()
  fixtureProfile = profileSummary({
    pathId: fixtureWorkspace.active_path_id ?? fixtureWorkspace.graph.paths[0]?.id ?? "path-a-b",
    outputUnit: "kcal_mol",
    energyKey: "electronic",
    baselineNodeId: fixtureWorkspace.graph.paths[0]?.node_ids[0] ?? "node-a",
  })
  return {
    ok: true,
    data: {
      command: "project.open",
      session_id: fixtureSessionId,
      project_id: fixtureProject.id,
      workspace_id: fixtureWorkspaceId,
      graph_id: fixtureGraphId,
      profile_id: fixtureProfile.id,
      object_count: 2,
      graph_count: 1,
      workspace_count: 1,
      profile_count: 1,
      artifact_count: 0,
      project: {
        ...fixtureProject,
        resource_count: 0,
      },
      load_content: args.load_content !== false,
    },
    error: null,
    warnings: [],
    artifacts: [],
  }
}

async function fixtureProjectSaveContentResponse(args: JsonObject): Promise<ShellResponse> {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }
  const contentFiles = args.include_content_files === true
    ? await fixtureProjectContentFiles()
    : undefined
  return {
    ok: true,
    data: {
      command: "project.save_content",
      session_id: fixtureSessionId,
      project_id: fixtureProject.id,
      workspace_id: fixtureWorkspaceId,
      graph_id: fixtureGraphId,
      profile_id: fixtureProfile.id,
      object_count: 2,
      graph_count: 1,
      workspace_count: 1,
      profile_count: 1,
      artifact_count: 0,
      saved: {
        schema_version: "project-content-v1",
        project_id: fixtureProject.id,
        file_count: 6,
        files: [],
      },
      ...(contentFiles ? { content_files: contentFiles } : {}),
    },
    error: null,
    warnings: [],
    artifacts: [],
  }
}

function fixtureWorkspaceOpenResponse(args: JsonObject): ShellResponse<WorkspaceCommandData> {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }
  return workspaceCommandResponse("workspace.open")
}

function fixtureWorkspaceAddNodeResponse(args: JsonObject): ShellResponse<WorkspaceCommandData> {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }
  const label = typeof args.label === "string" && args.label ? args.label : ""
  if (!label) {
    return invalidWorkspaceInput("Node label is required.", "label")
  }
  const kind = typeof args.kind === "string" && args.kind ? args.kind : "species"
  const objectIds = Array.isArray(args.chemical_object_ids)
    ? args.chemical_object_ids.map(String).filter(Boolean)
    : []
  const composition = compositionTermsFromArgs(args.composition, objectIds)
  const nodeIndex = fixtureWorkspace.graph.nodes.length + 1
  const position = Array.isArray(args.position) && args.position.length === 2
    ? [Number(args.position[0]), Number(args.position[1])] as [number, number]
    : [120 + nodeIndex * 120, 160] as [number, number]
  const node: GraphNodeSummary = {
    id: `node-web-${nodeIndex}`,
    kind,
    label,
    chemical_object_ids: objectIds,
    composition,
    position,
    metadata: {},
  }
  fixtureWorkspace = normalizeWorkspace({
    ...fixtureWorkspace,
    graph: {
      ...fixtureWorkspace.graph,
      nodes: [...fixtureWorkspace.graph.nodes, node],
    },
  })
  return workspaceCommandResponse("workspace.add_node")
}

function fixtureWorkspaceSetNodeCompositionResponse(args: JsonObject): ShellResponse<WorkspaceCommandData> {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }
  const nodeId = typeof args.node_id === "string" ? args.node_id : ""
  if (!nodeId) {
    return invalidWorkspaceInput("Node id is required.", "node_id")
  }
  if (!hasGraphNode(nodeId)) {
    return invalidWorkspaceInput("Graph node does not exist.", "node_id", "graph_invalid")
  }
  const composition = compositionTermsFromArgs(args.composition)
  if (composition.length === 0) {
    return invalidWorkspaceInput("Node composition must include at least one term.", "composition")
  }
  fixtureWorkspace = normalizeWorkspace({
    ...fixtureWorkspace,
    graph: {
      ...fixtureWorkspace.graph,
      nodes: fixtureWorkspace.graph.nodes.map((node) => (
        node.id === nodeId
          ? { ...node, composition, chemical_object_ids: objectIdsFromComposition(composition) }
          : node
      )),
    },
  })
  return workspaceCommandResponse("workspace.set_node_composition")
}

function fixtureWorkspaceMoveNodeResponse(args: JsonObject): ShellResponse<WorkspaceCommandData> {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }
  const nodeId = typeof args.node_id === "string" ? args.node_id : ""
  if (!nodeId) {
    return invalidWorkspaceInput("Node id is required.", "node_id")
  }
  if (!hasGraphNode(nodeId)) {
    return invalidWorkspaceInput("Graph node does not exist.", "node_id", "graph_invalid")
  }
  const position = positionFromArgs(args.position)
  if (!position) {
    return invalidWorkspaceInput("Node position must contain finite x and y numbers.", "position")
  }
  fixtureWorkspace = normalizeWorkspace({
    ...fixtureWorkspace,
    graph: {
      ...fixtureWorkspace.graph,
      nodes: fixtureWorkspace.graph.nodes.map((node) => (
        node.id === nodeId ? { ...node, position } : node
      )),
    },
  })
  return workspaceCommandResponse("workspace.move_node")
}

function fixtureWorkspaceRemoveResponse(args: JsonObject): ShellResponse<WorkspaceCommandData> {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }
  const nodeIds = idsFromArgs(args.node_ids)
  const edgeIds = idsFromArgs(args.edge_ids)
  if (nodeIds.length === 0 && edgeIds.length === 0) {
    return invalidWorkspaceInput("At least one graph node or edge id is required.", "selection")
  }
  const graphNodeIds = new Set(fixtureWorkspace.graph.nodes.map((node) => node.id))
  const graphEdgeIds = new Set(fixtureWorkspace.graph.edges.map((edge) => edge.id))
  const missingNodeId = nodeIds.find((nodeId) => !graphNodeIds.has(nodeId))
  if (missingNodeId) {
    return invalidWorkspaceInput("Graph node does not exist.", "node_id", "graph_invalid")
  }
  const incidentEdgeIds = new Set(
    fixtureWorkspace.graph.edges
      .filter((edge) => nodeIds.includes(edgeSource(edge)) || nodeIds.includes(edgeTarget(edge)))
      .map((edge) => edge.id),
  )
  const edgeIdsToRemove = edgeIds.filter((edgeId) => !incidentEdgeIds.has(edgeId))
  const missingEdgeId = edgeIdsToRemove.find((edgeId) => !graphEdgeIds.has(edgeId))
  if (missingEdgeId) {
    return invalidWorkspaceInput("Graph edge does not exist.", "edge_id", "graph_invalid")
  }
  fixtureWorkspace = normalizeWorkspace({
    ...fixtureWorkspace,
    graph: {
      ...fixtureWorkspace.graph,
      nodes: fixtureWorkspace.graph.nodes.filter((node) => !nodeIds.includes(node.id)),
      edges: fixtureWorkspace.graph.edges.filter((edge) => (
        !edgeIdsToRemove.includes(edge.id)
        && !nodeIds.includes(edgeSource(edge))
        && !nodeIds.includes(edgeTarget(edge))
      )),
      paths: fixtureWorkspace.graph.paths.filter((path) => !path.node_ids.some((nodeId) => nodeIds.includes(nodeId))),
    },
  })
  if (fixtureWorkspace.active_path_id && !fixtureWorkspace.graph.paths.some((path) => path.id === fixtureWorkspace.active_path_id)) {
    fixtureWorkspace = normalizeWorkspace({
      ...fixtureWorkspace,
      active_path_id: null,
    })
  }
  return workspaceCommandResponse("workspace.remove")
}

function fixtureWorkspaceSetViewportResponse(args: JsonObject): ShellResponse<WorkspaceCommandData> {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }
  const viewportResult = viewportFromArgs(args.viewport)
  if ("error" in viewportResult) {
    return invalidWorkspaceInput(viewportResult.error.message, viewportResult.error.target)
  }
  fixtureWorkspace = normalizeWorkspace({
    ...fixtureWorkspace,
    viewport: viewportResult.viewport,
  })
  return workspaceCommandResponse("workspace.set_viewport")
}

function fixtureWorkspaceSelectResponse(args: JsonObject): ShellResponse<WorkspaceCommandData> {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }
  const selectionResult = workspaceSelectionFromArgs(args.selection)
  if ("error" in selectionResult) {
    return invalidWorkspaceInput(selectionResult.error.message, selectionResult.error.target)
  }
  const validationError = validateWorkspaceSelection(selectionResult.selection)
  if (validationError) {
    return invalidWorkspaceInput(validationError.message, validationError.target, "graph_invalid")
  }
  fixtureWorkspace = normalizeWorkspace({
    ...fixtureWorkspace,
    selection: selectionResult.selection,
  })
  return workspaceCommandResponse("workspace.select")
}

function fixtureWorkspaceConnectResponse(args: JsonObject): ShellResponse<WorkspaceCommandData> {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }
  const fromNodeId = typeof args.from_node_id === "string" ? args.from_node_id : ""
  const toNodeId = typeof args.to_node_id === "string" ? args.to_node_id : ""
  if (!fromNodeId) {
    return invalidWorkspaceInput("Source node id is required.", "from_node_id")
  }
  if (!toNodeId) {
    return invalidWorkspaceInput("Target node id is required.", "to_node_id")
  }
  if (!hasGraphNode(fromNodeId) || !hasGraphNode(toNodeId)) {
    return invalidWorkspaceInput("Graph node does not exist.", "node_id", "graph_invalid")
  }
  const exists = fixtureWorkspace.graph.edges.some(
    (edge) => edgeSource(edge) === fromNodeId && edgeTarget(edge) === toNodeId,
  )
  if (!exists) {
    const edge: GraphEdgeSummary = {
      id: `edge-${fromNodeId}-${toNodeId}`,
      from_node: fromNodeId,
      to_node: toNodeId,
      label: typeof args.label === "string" ? args.label : null,
      metadata: {},
    }
    fixtureWorkspace = normalizeWorkspace({
      ...fixtureWorkspace,
      graph: {
        ...fixtureWorkspace.graph,
        edges: [...fixtureWorkspace.graph.edges, edge],
      },
    })
  }
  return workspaceCommandResponse("workspace.connect")
}

function fixtureWorkspaceSetPathResponse(args: JsonObject): ShellResponse<WorkspaceCommandData> {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }
  const pathId = typeof args.path_id === "string" && args.path_id ? args.path_id : ""
  const nodeIds = Array.isArray(args.node_ids) ? args.node_ids.map(String).filter(Boolean) : []
  if (!pathId) {
    return invalidWorkspaceInput("Path id is required.", "path_id")
  }
  if (nodeIds.length === 0) {
    return invalidWorkspaceInput("Path node ids are required.", "node_ids")
  }
  if (!nodeIds.every(hasGraphNode)) {
    return invalidWorkspaceInput("Path node does not exist.", "node_ids", "graph_invalid")
  }
  const path: GraphPathSummary = {
    id: pathId,
    label: typeof args.label === "string" && args.label ? args.label : "Canvas path",
    node_ids: nodeIds,
  }
  const existingPath = fixtureWorkspace.graph.paths.some((item) => item.id === pathId)
  fixtureWorkspace = normalizeWorkspace({
    ...fixtureWorkspace,
    active_path_id: pathId,
    graph: {
      ...fixtureWorkspace.graph,
      paths: existingPath
        ? fixtureWorkspace.graph.paths.map((item) => item.id === pathId ? path : item)
        : [...fixtureWorkspace.graph.paths, path],
    },
  })
  return workspaceCommandResponse("workspace.set_path")
}

function fixtureRegistryApplyCorrectionResponse(args: JsonObject): ShellResponse<RegistryApplyCorrectionData> {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }
  const objectId = typeof args.object_id === "string" ? args.object_id : ""
  if (!objectId) {
    return invalidRegistryInput("Object id is required.", "object_id")
  }
  const object = fixtureObjects.find((item) => item.id === objectId)
  if (!object) {
    return invalidRegistryInput("Chemical object is not registered in this project.", "object_id")
  }
  const correction = correctionFromArgs(args.correction, objectId)
  if ("error" in correction) {
    return invalidRegistryInput(correction.error.message, correction.error.target)
  }
  const existing = (object.corrections ?? []).find((item) => item.id === correction.correction.id)
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(correction.correction)) {
      return invalidRegistryInput("Correction id already exists with different content.", "correction.id")
    }
    return registryCommandResponse(object)
  }
  const updated = {
    ...object,
    corrections: [...(object.corrections ?? []), correction.correction],
    correction_count: (object.corrections ?? []).length + 1,
  }
  fixtureObjects = fixtureObjects.map((item) => item.id === objectId ? updated : item)
  return registryCommandResponse(updated)
}

function fixtureEnergyComputeResponse(args: JsonObject): ShellResponse<EnergyComputeData> {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }
  const pathId = typeof args.path_id === "string" && args.path_id
    ? args.path_id
    : fixtureWorkspace.active_path_id ?? fixtureWorkspace.graph.paths[0]?.id ?? ""
  if (!pathId) {
    return invalidEnergyInput("Path id is required to compute energy.", "path_id")
  }
  const path = fixtureWorkspace.graph.paths.find((item) => item.id === pathId)
  if (!path) {
    return invalidEnergyInput("Reaction path does not exist.", "path_id", "graph_invalid")
  }
  const outputUnit = args.output_unit === "kj_mol" ? "kj_mol" : "kcal_mol"
  const energyKey = typeof args.energy_key === "string" && args.energy_key
    ? args.energy_key
    : "electronic"
  const energySource = args.energy_source === "energies" || args.energy_source === "thermochemistry"
    ? args.energy_source
    : "auto"
  const correctionPolicy = correctionPolicyFromArgs(args.correction_policy)
  const baselineNodeId = typeof args.baseline_node_id === "string" && args.baseline_node_id
    ? args.baseline_node_id
    : path.node_ids[0] ?? null
  if (baselineNodeId && !path.node_ids.includes(baselineNodeId)) {
    return invalidEnergyInput("Baseline node is not in the selected path.", "baseline_node_id", "graph_invalid")
  }
  fixtureProfile = profileSummary({
    pathId,
    outputUnit,
    energyKey,
    energySource,
    correctionPolicy,
    baselineNodeId,
    includeCorrections: args.include_corrections === true,
  })
  const warnings = args.include_corrections === true
    ? [{
      code: "corrections_empty",
      message: "Fixture objects have no correction terms to include.",
      target: pathId,
    }]
    : []
  fixtureProfile = { ...fixtureProfile, warnings }
  return {
    ok: true,
    data: {
      command: "energy.compute",
      session_id: fixtureSessionId,
      profile: fixtureProfile,
    },
    error: null,
    warnings,
    artifacts: [],
  }
}

function fixtureExportProfileResponse(args: JsonObject): ShellResponse<ExportProfileData> {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }
  if (!fixtureProfile) {
    return invalidExportInput("Energy profile is required for export.", "profile_id")
  }
  const formats = exportFormatsFromArgs(args)
  if (formats.length === 0) {
    return invalidExportInput("At least one export format is required.", "formats")
  }
  const includeBytes = args.include_bytes === true
  const basename = typeof args.basename === "string" && args.basename.trim()
    ? args.basename.trim()
    : fixtureProfile.id
  const title = typeof args.title === "string" && args.title.trim()
    ? args.title.trim()
    : "RxnFlow energy profile"
  const artifacts = formats.map((format) => fixtureArtifact(format, basename, title, includeBytes))
  const warning = formats.includes("cdxml")
    ? [{
      code: "chemdraw_cdxml_only",
      message: "Fixture export returns CDXML; binary CDX is outside the Web MVP scope.",
      target: "cdxml",
    }]
    : []

  return {
    ok: true,
    data: {
      command: "export.profile",
      session_id: fixtureSessionId,
      profile: fixtureProfile,
      artifact_count: artifacts.length,
    },
    error: null,
    warnings: warning,
    artifacts,
  }
}

function workspaceCommandResponse(command: WorkspaceCommandData["command"]): ShellResponse<WorkspaceCommandData> {
  return {
    ok: true,
    data: {
      command,
      session_id: fixtureSessionId,
      workspace: fixtureWorkspace,
    },
    error: null,
    warnings: fixtureWorkspace.preview.warnings,
    artifacts: [],
  }
}

function registryCommandResponse(object: ObjectSummary): ShellResponse<RegistryApplyCorrectionData> {
  return {
    ok: true,
    data: {
      command: "registry.apply_correction",
      session_id: fixtureSessionId,
      object,
    },
    error: null,
    warnings: [],
    artifacts: [],
  }
}

function exportFormatsFromArgs(args: JsonObject): ExportFormat[] {
  const rawFormats = Array.isArray(args.formats)
    ? args.formats
    : Array.isArray(args.export_formats)
      ? args.export_formats
      : []
  const formats: ExportFormat[] = []
  for (const value of rawFormats) {
    if ((value === "png" || value === "cdxml" || value === "xlsx") && !formats.includes(value)) {
      formats.push(value)
    }
  }
  return formats
}

function fixtureArtifact(
  format: ExportFormat,
  basename: string,
  title: string,
  includeBytes: boolean,
): ShellArtifact {
  const bytes = fixtureArtifactBytes(format, basename, title)
  return {
    id: `artifact-${format}-${basename}`,
    format,
    path: null,
    bytes_base64: includeBytes ? bytes : null,
    metadata: {
      basename,
      title,
      profile_id: fixtureProfile.id,
      graph_id: fixtureProfile.graph_id,
      path_id: fixtureProfile.path_id,
      writer_id: fixtureWriterId(format),
      byte_size: atobLength(bytes),
      encoding: includeBytes ? "base64" : null,
      ...(format === "xlsx"
        ? {
          energy_table_schema_version: "energy-table-v1",
          energy_table_column_count: 20,
        }
        : {}),
    },
  }
}

function fixtureArtifactBytes(format: ExportFormat, basename: string, title: string): string {
  const payload = `RxnFlow fixture ${format} export\nbasename=${basename}\ntitle=${title}\nprofile=${fixtureProfile.id}\n`
  return btoaAscii(payload)
}

async function fixtureProjectContentFiles(): Promise<JsonObject[]> {
  const sectionData: Array<[string, string, JsonObject]> = [
    [".rxnflow/state/chemical-objects.json", "chemical_objects", {
      schema_version: "chemical-objects-v1",
      project_id: fixtureProject.id,
      objects: fixtureChemicalObjectsSection(),
    }],
    [".rxnflow/state/reaction-graphs.json", "reaction_graphs", {
      schema_version: "reaction-graphs-v1",
      project_id: fixtureProject.id,
      graphs: [reactionGraphSectionFromWorkspace(fixtureWorkspace)],
    }],
    [".rxnflow/state/workspaces.json", "workspaces", {
      schema_version: "workspaces-v1",
      project_id: fixtureProject.id,
      workspaces: [workspaceSectionFromWorkspace(fixtureWorkspace)],
    }],
    [".rxnflow/state/energy-profiles.json", "energy_profiles", {
      schema_version: "energy-profiles-v1",
      project_id: fixtureProject.id,
      profiles: [],
    }],
    [".rxnflow/state/import-ledger.json", "import_ledger", {
      schema_version: "import-ledger-v1",
      project_id: fixtureProject.id,
      batches: [],
    }],
    [".rxnflow/state/export-artifacts.json", "export_artifacts", {
      schema_version: "export-artifacts-v1",
      project_id: fixtureProject.id,
      artifacts: [],
    }],
  ]
  const sectionFiles = await Promise.all(sectionData.map(([path, kind, data]) => fixtureProjectContentFile(path, kind, data)))
  const files = [
    await fixtureProjectContentFile(".rxnflow/manifest.json", "project_manifest", {
      id: fixtureProject.id,
      name: fixtureProject.name,
      created_at: "2026-05-02T00:00:00Z",
      updated_at: "2026-05-02T00:00:00Z",
      schema_version: "project-v1",
      resources: [],
    }),
    await fixtureProjectContentFile(".rxnflow/state/project-content.json", "project_content_index", {
      schema_version: "project-content-v1",
      project_id: fixtureProject.id,
      updated_at: "2026-05-05T00:00:00Z",
      files: sectionFiles.map((file) => {
        const metadata = file.metadata as JsonObject
        return sectionIndexFile(String(metadata.kind), String(file.path), String(file.checksum))
      }),
    }),
    ...sectionFiles,
  ]
  return files
}

async function fixtureProjectContentFile(path: string, kind: string, data: JsonObject): Promise<JsonObject> {
  const payload = `${JSON.stringify(data, null, 2)}\n`
  return {
    path,
    bytes_base64: btoaAscii(payload),
    checksum: await sha256Text(payload),
    metadata: { kind },
  }
}

function sectionIndexFile(kind: string, path: JsonValue, checksum: string): JsonObject {
  return {
    kind,
    path,
    checksum,
    updated_at: "2026-05-05T00:00:00Z",
  }
}

function fixtureChemicalObjectsSection(): JsonObject[] {
  const objectIds = new Set<string>()
  for (const object of fixtureObjects) {
    objectIds.add(object.id)
  }
  for (const node of fixtureWorkspace.graph.nodes) {
    for (const objectId of node.chemical_object_ids ?? []) {
      objectIds.add(objectId)
    }
  }
  return Array.from(objectIds).sort().map((objectId, index) => fixtureChemicalObject(objectId, index))
}

function fixtureChemicalObject(objectId: string, index: number): JsonObject {
  const object = fixtureObjects.find((item) => item.id === objectId)
  return {
    id: objectId,
    label: object?.label ?? objectId,
    formula: object?.formula ?? null,
    charge: object?.charge ?? null,
    spin_multiplicity: object?.spin_multiplicity ?? null,
    method: object?.method ?? null,
    geometry: [],
    energies: {
      electronic: {
        value: objectId === "object-b" ? -1.02 : -1.0 - index * 0.01,
        unit: "hartree",
        reference: "fixture-electronic",
      },
    },
    thermochemistry: {},
    source_file_id: object?.source_file_id ?? "fixture-source",
    corrections: (object?.corrections ?? []).map((correction) => ({
      id: correction.id,
      kind: correction.kind,
      energy: correction.energy,
      created_at: correction.created_at,
      note: correction.note ?? null,
    })),
    provenance: object?.provenance ?? {
      source_file_id: object?.source_file_id ?? "fixture-source",
      parser_id: "fixture-parser",
      parser_version: "fixture-web",
      parsed_at: "2026-05-20T00:00:00Z",
    },
    registry_fingerprint: null,
  }
}

function reactionGraphSectionFromWorkspace(workspace: WorkspaceSummary): JsonObject {
  return {
    id: workspace.graph.id,
    project_id: workspace.graph.project_id,
    nodes: workspace.graph.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      label: node.label,
      chemical_object_ids: node.chemical_object_ids ?? [],
      composition: node.composition ?? compositionTermsFromArgs(undefined, node.chemical_object_ids ?? []),
      position: node.position ?? null,
      metadata: node.metadata ?? {},
    })),
    edges: workspace.graph.edges.map((edge) => ({
      id: edge.id,
      from_node: edgeSource(edge),
      to_node: edgeTarget(edge),
      label: edge.label ?? null,
      metadata: edge.metadata ?? {},
    })),
    paths: workspace.graph.paths.map((path) => ({
      id: path.id,
      label: path.label ?? path.id,
      node_ids: path.node_ids,
    })),
  }
}

function workspaceSectionFromWorkspace(workspace: WorkspaceSummary): JsonObject {
  const selection = workspace.selection ?? { node_ids: [], edge_ids: [], path_ids: [] }
  return {
    workspace_id: workspace.workspace_id,
    project_id: workspace.project_id,
    graph_id: workspace.graph.id,
    selection: {
      node_ids: selection.node_ids,
      edge_ids: selection.edge_ids,
      path_ids: selection.path_ids,
    },
    viewport: workspace.viewport ?? { x: 0, y: 0, zoom: 1 },
    active_path_id: workspace.active_path_id ?? null,
    updated_at: "2026-05-05T00:00:00Z",
  }
}

function workspaceFromProjectContentFiles(files: JsonValue[]): WorkspaceSummary | null {
  const reactionGraphs = projectContentJson(files, ".rxnflow/state/reaction-graphs.json")
  const workspaces = projectContentJson(files, ".rxnflow/state/workspaces.json")
  const rawGraphs = reactionGraphs?.graphs
  const rawWorkspaces = workspaces?.workspaces
  const rawGraph = Array.isArray(rawGraphs) ? rawGraphs[0] : null
  const rawWorkspace = Array.isArray(rawWorkspaces) ? rawWorkspaces[0] : null
  if (!rawGraph || typeof rawGraph !== "object" || Array.isArray(rawGraph)) return null
  if (!rawWorkspace || typeof rawWorkspace !== "object" || Array.isArray(rawWorkspace)) return null
  const graphObject = rawGraph as JsonObject
  const workspaceObject = rawWorkspace as JsonObject
  const graph = graphSummaryFromSection(graphObject)
  if (!graph) return null
  const selectionResult = workspaceSelectionFromArgs(workspaceObject.selection ?? {})
  const viewportResult = viewportFromArgs(workspaceObject.viewport)
  return normalizeWorkspace({
    workspace_id: typeof workspaceObject.workspace_id === "string" ? workspaceObject.workspace_id : fixtureWorkspaceId,
    project_id: typeof workspaceObject.project_id === "string" ? workspaceObject.project_id : fixtureProject.id,
    active_path_id: typeof workspaceObject.active_path_id === "string" ? workspaceObject.active_path_id : null,
    selection: "selection" in selectionResult ? selectionResult.selection : { node_ids: [], edge_ids: [], path_ids: [] },
    viewport: "viewport" in viewportResult ? viewportResult.viewport : { x: 0, y: 0, zoom: 1 },
    palette: [],
    graph,
    preview: {
      graph_id: graph.id,
      active_path_id: typeof workspaceObject.active_path_id === "string" ? workspaceObject.active_path_id : null,
      node_count: graph.nodes.length,
      edge_count: graph.edges.length,
      path_count: graph.paths.length,
      disconnected_node_ids: [],
      warnings: [],
    },
  })
}

function projectContentJson(files: JsonValue[], path: string): JsonObject | null {
  const file = files.find((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false
    return (item as JsonObject).path === path
  })
  if (!file || typeof file !== "object" || Array.isArray(file)) return null
  const bytesBase64 = (file as JsonObject).bytes_base64
  if (typeof bytesBase64 !== "string") return null
  try {
    const parsed = JSON.parse(atobAscii(bytesBase64))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function graphSummaryFromSection(graph: JsonObject): WorkspaceSummary["graph"] | null {
  if (typeof graph.id !== "string" || typeof graph.project_id !== "string") return null
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.paths)) return null
  const nodes = graph.nodes
    .filter((node): node is JsonObject => Boolean(node) && typeof node === "object" && !Array.isArray(node))
    .map((node): GraphNodeSummary => ({
      id: String(node.id ?? ""),
      kind: String(node.kind ?? "species"),
      label: String(node.label ?? node.id ?? ""),
      chemical_object_ids: Array.isArray(node.chemical_object_ids) ? node.chemical_object_ids.map(String) : [],
      composition: Array.isArray(node.composition)
        ? compositionTermsFromArgs(node.composition)
        : compositionTermsFromArgs(undefined, Array.isArray(node.chemical_object_ids) ? node.chemical_object_ids.map(String) : []),
      position: positionFromArgs(node.position) ?? null,
      metadata: node.metadata && typeof node.metadata === "object" && !Array.isArray(node.metadata) ? node.metadata as JsonObject : {},
    }))
    .filter((node) => node.id)
  const edges = graph.edges
    .filter((edge): edge is JsonObject => Boolean(edge) && typeof edge === "object" && !Array.isArray(edge))
    .map((edge): GraphEdgeSummary => ({
      id: String(edge.id ?? ""),
      from_node: String(edge.from_node ?? edge.source ?? ""),
      to_node: String(edge.to_node ?? edge.target ?? ""),
      label: typeof edge.label === "string" ? edge.label : null,
      metadata: edge.metadata && typeof edge.metadata === "object" && !Array.isArray(edge.metadata) ? edge.metadata as JsonObject : {},
    }))
    .filter((edge) => edge.id)
  const paths = graph.paths
    .filter((path): path is JsonObject => Boolean(path) && typeof path === "object" && !Array.isArray(path))
    .map((path): GraphPathSummary => ({
      id: String(path.id ?? ""),
      label: typeof path.label === "string" ? path.label : null,
      node_ids: Array.isArray(path.node_ids) ? path.node_ids.map(String) : [],
    }))
    .filter((path) => path.id)
  return {
    id: graph.id,
    project_id: graph.project_id,
    node_count: nodes.length,
    edge_count: edges.length,
    path_count: paths.length,
    nodes,
    edges,
    paths,
  }
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `sha256:${hex}`
}

function fixtureWriterId(format: ExportFormat): string {
  if (format === "png") return "fixture-png-energy-plot-v1"
  if (format === "cdxml") return "fixture-cdxml-energy-v1"
  return "fixture-xlsx-energy-table-v1"
}

function btoaAscii(value: string): string {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(value)
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  let output = ""
  for (let index = 0; index < value.length; index += 3) {
    const first = value.charCodeAt(index) & 0xff
    const second = index + 1 < value.length ? value.charCodeAt(index + 1) & 0xff : 0
    const third = index + 2 < value.length ? value.charCodeAt(index + 2) & 0xff : 0
    const triplet = (first << 16) | (second << 8) | third
    output += alphabet[(triplet >> 18) & 0x3f]
    output += alphabet[(triplet >> 12) & 0x3f]
    output += index + 1 < value.length ? alphabet[(triplet >> 6) & 0x3f] : "="
    output += index + 2 < value.length ? alphabet[triplet & 0x3f] : "="
  }
  return output
}

function atobAscii(value: string): string {
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(value)
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  const clean = value.replace(/=+$/, "")
  let output = ""
  let buffer = 0
  let bits = 0
  for (const char of clean) {
    const index = alphabet.indexOf(char)
    if (index < 0) continue
    buffer = (buffer << 6) | index
    bits += 6
    if (bits >= 8) {
      bits -= 8
      output += String.fromCharCode((buffer >> bits) & 0xff)
    }
  }
  return output
}

function atobLength(value: string): number {
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(value).length
  }
  return Math.max(0, Math.floor((value.length * 3) / 4) - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0))
}

function profileSummary(options: {
  pathId: string
  outputUnit: EnergyOutputUnit
  energyKey: string
  energySource?: "energies" | "thermochemistry" | "auto"
  correctionPolicy?: { mode: string; kinds?: string[]; ids?: string[] } | null
  baselineNodeId?: string | null
  includeCorrections?: boolean
}): EnergyProfileSummary {
  const path = fixtureWorkspace.graph.paths.find((item) => item.id === options.pathId)
  const nodeIds = path?.node_ids ?? ["node-a", "node-b"]
  const points = nodeIds.map((nodeId, index) => profilePoint(nodeId, index, options.outputUnit))
  return {
    id: profileId(options.pathId, options.energyKey, options.outputUnit, options.energySource ?? "auto"),
    graph_id: fixtureGraphId,
    path_id: options.pathId,
    point_count: points.length,
    energy_key: options.energyKey,
    energy_source: options.energySource ?? "auto",
    correction_policy: options.correctionPolicy ?? null,
    output_unit: options.outputUnit,
    baseline_node_id: options.baselineNodeId ?? nodeIds[0] ?? null,
    points,
    warnings: options.includeCorrections ? [{
      code: "corrections_empty",
      message: "Fixture objects have no correction terms to include.",
      target: options.pathId,
    }] : [],
  }
}

const supportedCorrectionKinds = ["resonance", "solvation", "manual"] as const
const supportedCorrectionUnits = ["hartree", "kcal_mol", "kj_mol"] as const

function correctionFromArgs(value: JsonValue | undefined, objectId: string): { correction: CorrectionSummary } | { error: { message: string; target: string } } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: { message: "Correction must be an object.", target: "correction" } }
  }
  const correction = value as JsonObject
  const kind = typeof correction.kind === "string" ? correction.kind : ""
  if (!supportedCorrectionKinds.includes(kind as typeof supportedCorrectionKinds[number])) {
    return { error: { message: "Correction kind is unsupported.", target: "correction.kind" } }
  }
  const energyValue = correction.energy
  if (!energyValue || typeof energyValue !== "object" || Array.isArray(energyValue)) {
    return { error: { message: "Correction energy must be an object.", target: "correction.energy" } }
  }
  const energy = energyValue as JsonObject
  const unit = typeof energy.unit === "string" ? energy.unit : ""
  if (!supportedCorrectionUnits.includes(unit as typeof supportedCorrectionUnits[number])) {
    return { error: { message: "Correction energy unit is unsupported.", target: "correction.energy.unit" } }
  }
  const numericValue = Number(energy.value)
  if (!Number.isFinite(numericValue)) {
    return { error: { message: "Correction energy value must be finite.", target: "correction.energy.value" } }
  }
  const note = typeof correction.note === "string" ? correction.note : null
  const reference = typeof energy.reference === "string" ? energy.reference : null
  return {
    correction: {
      id: typeof correction.id === "string" && correction.id
        ? correction.id
        : generatedCorrectionId(objectId, kind, numericValue, unit, reference, note),
      kind,
      energy: {
        value: numericValue,
        unit,
        reference,
      },
      created_at: "1970-01-01T00:00:00Z",
      note,
    },
  }
}

function generatedCorrectionId(
  objectId: string,
  kind: string,
  value: number,
  unit: string,
  reference: string | null,
  note: string | null,
): string {
  const source = `${objectId}|${kind}|${value}|${unit}|${reference ?? ""}|${note ?? ""}`
  let hash = 0
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) >>> 0
  }
  return `corr-${slugId(objectId)}-${kind}-${hash.toString(16).padStart(8, "0")}`
}

function slugId(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return slug || "object"
}

function profileId(pathId: string, energyKey: string, outputUnit: EnergyOutputUnit, energySource = "auto"): string {
  if (pathId === "path-a-b" && energyKey === "electronic" && outputUnit === "kcal_mol" && energySource === "auto") {
    return fixtureProfileId
  }
  const sourceSlug = energySource === "auto" ? "" : `-${energySource}`
  return `profile-${pathId}-${energyKey}${sourceSlug}-${outputUnit}`
}

function correctionPolicyFromArgs(value: JsonValue | undefined): { mode: string; kinds?: string[]; ids?: string[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const policy = value as JsonObject
  const mode = typeof policy.mode === "string" ? policy.mode : ""
  const kinds = Array.isArray(policy.kinds) ? policy.kinds.map(String) : []
  const ids = Array.isArray(policy.ids) ? policy.ids.map(String) : []
  return { mode, kinds, ids }
}

function profilePoint(
  nodeId: string,
  index: number,
  outputUnit: EnergyOutputUnit,
): EnergyProfilePointSummary {
  const node = fixtureWorkspace.graph.nodes.find((item) => item.id === nodeId)
  const objectId = node?.chemical_object_ids?.[0]
  if (objectId && objectId !== "object-a" && objectId !== "object-b") {
    return {
      node_id: nodeId,
      label: node?.label ?? nodeId,
      relative_energy: null,
      missing_reason: "missing_energy",
      warnings: [{
        code: "missing_energy",
        message: "Fixture object does not expose an electronic energy value.",
        target: nodeId,
      }],
    }
  }
  const kcalValue = index === 0 ? 0 : -12.4 + (index - 1) * 7.2
  const value = outputUnit === "kj_mol" ? Number((kcalValue * 4.184).toFixed(3)) : kcalValue
  return {
    node_id: nodeId,
    label: node?.label ?? nodeId,
    relative_energy: {
      value,
      unit: outputUnit,
      reference: "fixture-electronic",
    },
    missing_reason: null,
    warnings: [],
  }
}

function fixtureImportPreviewResponse(args: JsonObject): ShellResponse<ImportPreviewData> {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }

  const sourcePaths = sourcePathsFromArgs(args)
  if (sourcePaths.length === 0) {
    return {
      ok: false,
      data: null,
      error: {
        code: "invalid_input",
        message: "At least one source path is required.",
        target: "source_path",
      },
      warnings: [],
      artifacts: [],
    }
  }

  return {
    ok: true,
    data: {
      command: "import.preview",
      session_id: fixtureSessionId,
      batch: importBatchSummary("needs_confirmation", sourcePaths),
    },
    error: null,
    warnings: [
      {
        code: "unit_assumed",
        message: "Fixture import preview uses hartree for the queued XYZ energy.",
        target: sourcePaths[0],
      },
    ],
    artifacts: [],
  }
}

function fixtureImportRegisterAllResponse(args: JsonObject): ShellResponse<ImportRegisterAllData> {
  if (args.session_id !== fixtureSessionId) {
    return invalidSessionResponse()
  }
  const batchId = typeof args.batch_id === "string" ? args.batch_id : ""
  if (batchId !== fixtureImportBatch.id) {
    return {
      ok: false,
      data: null,
      error: {
        code: "invalid_input",
        message: "Import batch is not registered in this fixture session.",
        target: "batch_id",
      },
      warnings: [],
      artifacts: [],
    }
  }

  for (const object of initialFixtureObjects) {
    if (!fixtureObjects.some((item) => item.id === object.id)) {
      fixtureObjects = [...fixtureObjects, JSON.parse(JSON.stringify(object)) as ObjectSummary]
    }
  }
  return {
    ok: true,
    data: {
      command: "import.register_all",
      session_id: fixtureSessionId,
      batch: importBatchSummary("registered"),
      registered_object_ids: fixtureRegisteredObjectIds,
      objects: cloneObjects(fixtureObjects),
    },
    error: null,
    warnings: [],
    artifacts: [],
  }
}

function importBatchSummary(
  successStatus: "needs_confirmation" | "registered",
  sourcePaths: string[] = ["inbox/water.xyz", "inbox/bad-count.xyz"],
): ImportBatchSummary {
  const [successPath = "inbox/water.xyz", failedPath = "inbox/bad-count.xyz"] = sourcePaths
  return {
    id: "import-batch-fixture-web-1",
    project_id: fixtureProject.id,
    items: [
      {
        id: "import-item-water",
        source_path: successPath,
        status: successStatus,
        raw_resource: {
          id: "raw-water-xyz",
          kind: "raw_file",
          path: "inputs/raw/water.xyz",
          checksum: "sha256:fixturewater00000000000000000000000000000000000000000000000000",
          metadata: {
            source_name: "water.xyz",
            byte_size: 74,
          },
        },
        preview: {
          raw_resource_id: "raw-water-xyz",
          parser_id: "xyz-ase",
          parser_version: "fixture-web",
          object_count: 1,
          warnings: [
            {
              code: "missing_section",
              message: "Fixture XYZ preview has no thermochemistry section.",
              target: successPath,
            },
          ],
        },
        registered_object_ids: successStatus === "registered" ? fixtureRegisteredObjectIds : [],
        error: null,
        warnings: [
          {
            code: "missing_section",
            message: "Fixture XYZ preview has no thermochemistry section.",
            target: successPath,
          },
        ],
      },
      {
        id: "import-item-bad-count",
        source_path: failedPath,
        status: "failed",
        raw_resource: {
          id: "raw-bad-count-xyz",
          kind: "raw_file",
          path: "inputs/raw/bad-count.xyz",
          checksum: "sha256:fixturebad000000000000000000000000000000000000000000000000000",
          metadata: {
            source_name: "bad-count.xyz",
            byte_size: 40,
          },
        },
        preview: null,
        registered_object_ids: [],
        error: {
          code: "parse_failed",
          message: "XYZ atom count does not match coordinate rows.",
          target: failedPath,
        },
        warnings: [],
      },
    ],
  }
}

function objectSummary(
  id: string,
  label: string,
  options: {
    formula?: string | null
    charge?: number | null
    spin_multiplicity?: number | null
    method?: string | null
    source_file_id?: string
    parser_id?: string
    warnings?: ObjectSummary["warnings"]
  } = {},
): JsonObject {
  const energyKeys: JsonValue[] = ["electronic"]
  const thermochemistryKeys: JsonValue[] = ["gibbs"]
  const sourceFileId = options.source_file_id ?? "fixture-source"
  return {
    id,
    label,
    formula: options.formula ?? null,
    charge: options.charge ?? null,
    spin_multiplicity: options.spin_multiplicity ?? null,
    method: options.method ?? null,
    source_file_id: sourceFileId,
    energy_keys: energyKeys,
    thermochemistry_keys: thermochemistryKeys,
    energy_channels: [
      {
        key: "electronic",
        source: "energies",
        label: "electronic (energies)",
        unit: "hartree",
        reference: null,
        object_ids: [id],
      },
      {
        key: "gibbs",
        source: "thermochemistry",
        label: "gibbs (thermochemistry)",
        unit: "hartree",
        reference: null,
        object_ids: [id],
      },
    ],
    provenance: {
      source_file_id: sourceFileId,
      parser_id: options.parser_id ?? "fixture-parser",
      parser_version: "fixture-web",
      parsed_at: "2026-05-20T00:00:00Z",
    },
    correction_count: 0,
    corrections: [],
    warnings: options.warnings ?? [],
  }
}

function cloneObjects(objects: ObjectSummary[]): ObjectSummary[] {
  return objects.map((object) => JSON.parse(JSON.stringify(object)) as ObjectSummary)
}

function baseWorkspaceSummary(): WorkspaceSummary {
  return normalizeWorkspace({
    workspace_id: fixtureWorkspaceId,
    project_id: fixtureProject.id,
    active_path_id: "path-a-b",
    selection: {
      node_ids: [],
      edge_ids: [],
      path_ids: [],
    },
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    palette: [],
    graph: {
      id: fixtureGraphId,
      project_id: fixtureProject.id,
      node_count: 0,
      edge_count: 0,
      path_count: 0,
      nodes: [
        {
          id: "node-a",
          kind: "species",
          label: "Object A",
          chemical_object_ids: ["object-a"],
          composition: [{ object_id: "object-a", coefficient: 1, role: null, label: null, metadata: {} }],
          position: [120, 160],
          metadata: {},
        },
        {
          id: "node-b",
          kind: "species",
          label: "Object B",
          chemical_object_ids: ["object-b"],
          composition: [{ object_id: "object-b", coefficient: 1, role: null, label: null, metadata: {} }],
          position: [360, 160],
          metadata: {},
        },
      ],
      edges: [{ id: "edge-a-b", from_node: "node-a", to_node: "node-b", label: null, metadata: {} }],
      paths: [{ id: "path-a-b", label: "Fixture path", node_ids: ["node-a", "node-b"] }],
    },
    preview: {
      graph_id: fixtureGraphId,
      active_path_id: "path-a-b",
      node_count: 0,
      edge_count: 0,
      path_count: 0,
      disconnected_node_ids: [],
      warnings: [],
    },
  })
}

function normalizeWorkspace(workspace: WorkspaceSummary): WorkspaceSummary {
  const disconnectedNodeIds = disconnectedNodes(workspace.graph.nodes, workspace.graph.edges)
  const warnings = disconnectedNodeIds.map((nodeId) => ({
    code: "disconnected_node",
    message: "Fixture graph node is not connected to any edge.",
    target: nodeId,
  }))
  const selection = pruneWorkspaceSelection(workspace.selection ?? {
    node_ids: [],
    edge_ids: [],
    path_ids: [],
  }, workspace)
  return {
    ...workspace,
    selection,
    viewport: workspace.viewport ?? { x: 0, y: 0, zoom: 1 },
    graph: {
      ...workspace.graph,
      node_count: workspace.graph.nodes.length,
      edge_count: workspace.graph.edges.length,
      path_count: workspace.graph.paths.length,
    },
    preview: {
      graph_id: workspace.graph.id,
      active_path_id: workspace.active_path_id ?? null,
      node_count: workspace.graph.nodes.length,
      edge_count: workspace.graph.edges.length,
      path_count: workspace.graph.paths.length,
      disconnected_node_ids: disconnectedNodeIds,
      warnings,
    },
  }
}

function disconnectedNodes(nodes: GraphNodeSummary[], edges: GraphEdgeSummary[]): string[] {
  if (nodes.length === 0) return []
  const connected = new Set<string>()
  for (const edge of edges) {
    connected.add(edgeSource(edge))
    connected.add(edgeTarget(edge))
  }
  return nodes.map((node) => node.id).filter((nodeId) => !connected.has(nodeId))
}

function hasGraphNode(nodeId: string): boolean {
  return fixtureWorkspace.graph.nodes.some((node) => node.id === nodeId)
}

function idsFromArgs(value: JsonValue | undefined): string[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return Array.from(new Set(value.map(String).filter(Boolean)))
  const id = String(value)
  return id ? [id] : []
}

function compositionTermsFromArgs(
  value: JsonValue | undefined,
  fallbackObjectIds: string[] = [],
): NonNullable<GraphNodeSummary["composition"]> {
  if (!Array.isArray(value)) {
    return fallbackObjectIds.map((objectId) => ({
      object_id: objectId,
      coefficient: 1,
      role: null,
      label: null,
      metadata: {},
    }))
  }
  return value
    .filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      object_id: String(item.object_id ?? ""),
      coefficient: Number(item.coefficient ?? 1),
      role: typeof item.role === "string" ? item.role : null,
      label: typeof item.label === "string" ? item.label : null,
      metadata: item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
        ? item.metadata as JsonObject
        : {},
    }))
    .filter((term) => term.object_id && Number.isFinite(term.coefficient) && term.coefficient !== 0)
}

function objectIdsFromComposition(composition: NonNullable<GraphNodeSummary["composition"]>): string[] {
  return Array.from(new Set(composition.map((term) => term.object_id).filter(Boolean)))
}

function positionFromArgs(value: JsonValue | undefined): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null
  const x = Number(value[0])
  const y = Number(value[1])
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
}

function viewportFromArgs(value: JsonValue | undefined): (
  | { viewport: NonNullable<WorkspaceSummary["viewport"]> }
  | { error: { message: string; target: string } }
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: { message: "Workspace viewport must be an object.", target: "viewport" } }
  }
  const viewport = value as JsonObject
  const x = Number(viewport.x)
  const y = Number(viewport.y)
  const zoom = Number(viewport.zoom)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) {
    return {
      error: {
        message: "Workspace viewport must contain finite x, y and zoom numbers.",
        target: "viewport",
      },
    }
  }
  if (zoom <= 0) {
    return { error: { message: "Workspace viewport zoom must be positive.", target: "viewport.zoom" } }
  }
  return { viewport: { x, y, zoom } }
}

function workspaceSelectionFromArgs(value: JsonValue | undefined): (
  | { selection: WorkspaceSelectionSummary }
  | { error: { message: string; target: string } }
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: { message: "Workspace selection must be an object.", target: "selection" } }
  }
  const selection = value as JsonObject
  return {
    selection: {
      node_ids: idsFromArgs(selection.node_ids),
      edge_ids: idsFromArgs(selection.edge_ids),
      path_ids: idsFromArgs(selection.path_ids),
    },
  }
}

function validateWorkspaceSelection(selection: WorkspaceSelectionSummary): { message: string; target: string } | null {
  const nodeIds = new Set(fixtureWorkspace.graph.nodes.map((node) => node.id))
  const edgeIds = new Set(fixtureWorkspace.graph.edges.map((edge) => edge.id))
  const pathIds = new Set(fixtureWorkspace.graph.paths.map((path) => path.id))
  if (selection.node_ids.some((nodeId) => !nodeIds.has(nodeId))) {
    return { message: "Workspace selection references a missing node.", target: "node_id" }
  }
  if (selection.edge_ids.some((edgeId) => !edgeIds.has(edgeId))) {
    return { message: "Workspace selection references a missing edge.", target: "edge_id" }
  }
  if (selection.path_ids.some((pathId) => !pathIds.has(pathId))) {
    return { message: "Workspace selection references a missing path.", target: "path_id" }
  }
  return null
}

function pruneWorkspaceSelection(selection: WorkspaceSelectionSummary, workspace: WorkspaceSummary): WorkspaceSelectionSummary {
  const nodeIds = new Set(workspace.graph.nodes.map((node) => node.id))
  const edgeIds = new Set(workspace.graph.edges.map((edge) => edge.id))
  const pathIds = new Set(workspace.graph.paths.map((path) => path.id))
  return {
    node_ids: selection.node_ids.filter((nodeId) => nodeIds.has(nodeId)),
    edge_ids: selection.edge_ids.filter((edgeId) => edgeIds.has(edgeId)),
    path_ids: selection.path_ids.filter((pathId) => pathIds.has(pathId)),
  }
}

function edgeSource(edge: GraphEdgeSummary): string {
  return edge.from_node ?? edge.source ?? ""
}

function edgeTarget(edge: GraphEdgeSummary): string {
  return edge.to_node ?? edge.target ?? ""
}

function sourcePathsFromArgs(args: JsonObject): string[] {
  if (Array.isArray(args.sources)) {
    return args.sources
      .map((source) => {
        if (!source || typeof source !== "object" || Array.isArray(source)) return ""
        const sourceObject = source as JsonObject
        if (sourceObject.kind === "inline_bytes" && typeof sourceObject.filename === "string") {
          return `inline/${sourceObject.filename}`
        }
        if (sourceObject.kind === "path" && typeof sourceObject.source_path === "string") {
          return sourceObject.source_path
        }
        return ""
      })
      .filter(Boolean)
  }
  if (args.source && typeof args.source === "object" && !Array.isArray(args.source)) {
    const source = args.source as JsonObject
    if (source.kind === "inline_bytes" && typeof source.filename === "string") {
      return [`inline/${source.filename}`]
    }
    if (source.kind === "path" && typeof source.source_path === "string") {
      return [source.source_path]
    }
  }
  if (Array.isArray(args.source_paths)) {
    return args.source_paths.map(String).filter(Boolean)
  }
  if (typeof args.source_path === "string" && args.source_path) {
    return [args.source_path]
  }
  return []
}

function invalidSessionResponse<TData extends JsonObject = JsonObject>(): ShellResponse<TData> {
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

function invalidWorkspaceInput<TData extends JsonObject = JsonObject>(
  message: string,
  target: string,
  code = "invalid_input",
): ShellResponse<TData> {
  return {
    ok: false,
    data: null,
    error: {
      code,
      message,
      target,
    },
    warnings: [],
    artifacts: [],
  }
}

function invalidEnergyInput<TData extends JsonObject = JsonObject>(
  message: string,
  target: string,
  code = "invalid_input",
): ShellResponse<TData> {
  return {
    ok: false,
    data: null,
    error: {
      code,
      message,
      target,
    },
    warnings: [],
    artifacts: [],
  }
}

function invalidRegistryInput<TData extends JsonObject = JsonObject>(
  message: string,
  target: string,
  code = "invalid_input",
): ShellResponse<TData> {
  return {
    ok: false,
    data: null,
    error: {
      code,
      message,
      target,
    },
    warnings: [],
    artifacts: [],
  }
}

function invalidExportInput<TData extends JsonObject = JsonObject>(
  message: string,
  target: string,
  code = "invalid_input",
): ShellResponse<TData> {
  return {
    ok: false,
    data: null,
    error: {
      code,
      message,
      target,
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
