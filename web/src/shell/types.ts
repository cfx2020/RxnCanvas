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
  | "workspace.open"
  | "workspace.add_node"
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
  source_file_id?: string | null
  energy_keys?: JsonValue[]
}

export type ImportBatchSummary = JsonObject & {
  id: string
  project_id: string
  items: JsonValue[]
}

export type WorkspaceSummary = JsonObject & {
  workspace_id: string
  project_id: string
  active_path_id?: string | null
  palette: JsonValue[]
  graph: JsonObject
  preview: JsonObject
}

export type EnergyProfileSummary = JsonObject & {
  id: string
  graph_id: string
  path_id: string
  point_count: number
  output_unit: string
  baseline_node_id?: string | null
  points: JsonValue[]
}

export type WorkbenchArtifactSummary = JsonObject & {
  id: string
  format: string
  path?: string | null
  bytes_base64?: null
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

export type ShellTransportKind = "in-process-test"

export type ShellTransport = {
  kind: ShellTransportKind
  run(payload: ShellCommandPayload<string>): Promise<ShellResponse>
}
