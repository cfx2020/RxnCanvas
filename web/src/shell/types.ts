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
