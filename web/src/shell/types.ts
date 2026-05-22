export type JsonPrimitive = null | string | number | boolean

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export type JsonObject = { [key: string]: JsonValue }

export type ShellCommandName =
  | "fixture.run"
  | "project.create"
  | "project.open"
  | "project.save_content"
  | "project.export_bundle"
  | "project.import_bundle"
  | "import.preview"
  | "import.register_all"
  | "registry.apply_correction"
  | "workspace.open"
  | "workspace.add_node"
  | "workspace.set_node_composition"
  | "workspace.move_node"
  | "workspace.remove"
  | "workspace.set_viewport"
  | "workspace.select"
  | "workspace.connect"
  | "workspace.set_path"
  | "energy.compute"
  | "export.profile"
  | "workbench.snapshot"

export type ShellCommandPayload<TCommand extends string = ShellCommandName> = {
  command: TCommand
  args: JsonObject
  requestId?: string
}

export type ShellError = {
  code: string
  message: string
  target?: string | null
  details?: JsonValue
}

export type ShellWarning = {
  code: string
  message: string
  target?: string | null
  details?: JsonValue
}

export type ProjectSummary = JsonObject & {
  id: string
  name: string | null
  schema_version: string | null
  resource_count: number | null
}

export type WorkbenchCounts = JsonObject & {
  objects: number
  imports: number
  graphs: number
  workspaces: number
  profiles: number
  artifacts: number
}

export type ActiveContent = JsonObject & {
  workspace_id?: string | null
  graph_id?: string | null
  profile_id?: string | null
}

export type ObjectSummary = JsonObject & {
  id: string
  label?: string | null
  formula?: string | null
  charge?: number | null
  spin_multiplicity?: number | null
  method?: string | null
  source_file_id?: string | null
  energy_keys?: JsonValue[]
  thermochemistry_keys?: JsonValue[]
  energy_channels?: EnergyChannelSummary[]
  provenance?: {
    source_file_id: string
    parser_id: string
    parser_version: string
    parsed_at?: string | null
  } | null
  correction_count?: number
  corrections?: CorrectionSummary[]
  warnings?: ShellWarning[]
}

export type CorrectionKind = "resonance" | "solvation" | "manual"

export type CorrectionSummary = JsonObject & {
  id: string
  kind: CorrectionKind | string
  energy: EnergyValueSummary | null
  created_at: string
  note?: string | null
}

export type RegistryApplyCorrectionData = JsonObject & {
  command: "registry.apply_correction"
  session_id: string
  object: ObjectSummary
}

export type EnergyChannelSource = "energies" | "thermochemistry"

export type EnergyChannelSelectionSource = EnergyChannelSource | "auto"

export type EnergyChannelSummary = JsonObject & {
  key: string
  source: EnergyChannelSource
  label: string
  unit: string
  reference?: string | null
  object_ids: string[]
}

export type ImportRawResourceSummary = JsonObject & {
  id: string
  kind: string
  path?: string | null
  checksum?: string | null
  metadata?: JsonObject
}

export type ImportParsePreviewSummary = JsonObject & {
  raw_resource_id: string
  parser_id: string
  parser_version: string
  object_count: number
  warnings: ShellWarning[]
}

export type ImportItemSummary = JsonObject & {
  id: string
  source_path: string
  status: string
  raw_resource?: ImportRawResourceSummary | null
  preview?: ImportParsePreviewSummary | null
  registered_object_ids: string[]
  error?: ShellError | null
  warnings: ShellWarning[]
}

export type ImportBatchSummary = JsonObject & {
  id: string
  project_id: string
  items: ImportItemSummary[]
}

export type ImportPreviewData = JsonObject & {
  command: "import.preview"
  session_id: string
  batch: ImportBatchSummary
}

export type ImportRegisterAllData = JsonObject & {
  command: "import.register_all"
  session_id: string
  batch: ImportBatchSummary
  registered_object_ids: string[]
  objects: ObjectSummary[]
}

export type ReactionNodeCompositionTermSummary = JsonObject & {
  object_id: string
  coefficient: number
  role?: string | null
  label?: string | null
  metadata?: JsonObject
}

export type GraphNodeSummary = JsonObject & {
  id: string
  kind: string
  label: string
  chemical_object_ids?: string[]
  composition?: ReactionNodeCompositionTermSummary[]
  position?: [number, number] | null
  metadata?: JsonObject
}

export type GraphEdgeSummary = JsonObject & {
  id: string
  from_node?: string
  to_node?: string
  source?: string
  target?: string
  label?: string | null
  metadata?: JsonObject
}

export type GraphPathSummary = JsonObject & {
  id: string
  label?: string | null
  node_ids: string[]
}

export type GraphSummary = JsonObject & {
  id: string
  project_id: string
  node_count: number
  edge_count: number
  path_count: number
  nodes: GraphNodeSummary[]
  edges: GraphEdgeSummary[]
  paths: GraphPathSummary[]
}

export type NetworkPreviewSummary = JsonObject & {
  graph_id: string
  active_path_id?: string | null
  node_count: number
  edge_count: number
  path_count: number
  disconnected_node_ids: string[]
  warnings: ShellWarning[]
}

export type CanvasViewportSummary = JsonObject & {
  x: number
  y: number
  zoom: number
}

export type WorkspaceSelectionSummary = JsonObject & {
  node_ids: string[]
  edge_ids: string[]
  path_ids: string[]
}

export type WorkspaceSummary = JsonObject & {
  workspace_id: string
  project_id: string
  active_path_id?: string | null
  selection?: WorkspaceSelectionSummary | null
  viewport?: CanvasViewportSummary | null
  palette: JsonValue[]
  graph: GraphSummary
  preview: NetworkPreviewSummary
}

export type WorkspaceCommandData = JsonObject & {
  command:
    | "workspace.open"
    | "workspace.add_node"
    | "workspace.set_node_composition"
    | "workspace.move_node"
    | "workspace.remove"
    | "workspace.set_viewport"
    | "workspace.select"
    | "workspace.connect"
    | "workspace.set_path"
  session_id: string
  workspace: WorkspaceSummary
}

export type EnergyOutputUnit = "kcal_mol" | "kj_mol"

export type EnergyValueSummary = JsonObject & {
  value: number
  unit: string
  reference?: string | null
}

export type EnergyProfilePointSummary = JsonObject & {
  node_id: string
  label: string
  relative_energy?: EnergyValueSummary | number | null
  unit?: string | null
  missing_reason?: string | null
  warnings?: ShellWarning[]
}

export type EnergyProfileSummary = JsonObject & {
  id: string
  graph_id: string
  path_id: string
  point_count: number
  energy_key?: string | null
  energy_source?: EnergyChannelSelectionSource | string | null
  correction_policy?: CorrectionPolicySummary | null
  output_unit: string
  baseline_node_id?: string | null
  points: EnergyProfilePointSummary[]
  warnings?: ShellWarning[]
}

export type CorrectionPolicySummary = JsonObject & {
  mode: "none" | "all" | "kinds" | "ids" | string
  kinds?: string[]
  ids?: string[]
}

export type EnergyComputeData = JsonObject & {
  command: "energy.compute"
  session_id: string
  profile: EnergyProfileSummary
}

export type ExportFormat = "png" | "cdxml" | "xlsx"

export type ExportProfileData = JsonObject & {
  command: "export.profile"
  session_id: string
  profile?: EnergyProfileSummary | null
  artifact_count: number
}

export type WorkbenchArtifactSummary = JsonObject & {
  id: string
  format: string
  path?: string | null
  bytes_base64?: string | null
  checksum?: string
  metadata: JsonObject
  persisted: boolean
  has_inline_bytes: boolean
}

export type WorkbenchSnapshotData = JsonObject & {
  command: "workbench.snapshot"
  session_id: string
  project_id?: string | null
  project_path?: string | null
  workspace_id?: string | null
  graph_id?: string | null
  profile_id?: string | null
  active: ActiveContent
  counts: WorkbenchCounts
  project?: ProjectSummary | null
  objects: ObjectSummary[]
  imports: ImportBatchSummary[]
  workspace?: WorkspaceSummary | null
  profile?: EnergyProfileSummary | null
  artifacts: WorkbenchArtifactSummary[]
  warnings: ShellWarning[]
}

export type ShellArtifact = {
  id: string
  format: "png" | "cdxml" | "xlsx" | string
  path?: string | null
  bytes_base64?: string | null
  metadata: JsonObject
}

export type ShellResponse<TData extends JsonObject = JsonObject> = {
  ok: boolean
  data?: TData | null
  error?: ShellError | null
  warnings: ShellWarning[]
  artifacts: ShellArtifact[]
}

export type ShellTransportKind = "in-process-test" | "http-api"

export type WebShellRuntimeMode = "fixture" | "local-http"

export type ShellRuntimeInfo = {
  mode: WebShellRuntimeMode
  transportKind: ShellTransportKind
  endpoint?: string
}

export type ShellTransport = {
  kind: ShellTransportKind
  run(payload: ShellCommandPayload<string>): Promise<ShellResponse>
}
