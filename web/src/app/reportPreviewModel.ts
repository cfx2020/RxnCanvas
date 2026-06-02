import type {
  EnergyProfileSummary,
  JsonObject,
  ShellWarning,
  WorkbenchArtifactSummary,
  WorkspaceSummary,
} from "../shell"

export type ReportPreviewAssetKey = "energy_diagram" | "energy_table" | "graph_snapshot"
export type ReportPreviewAssetStatus = "ready" | "pending" | "warning" | "unavailable"
export type ReportPreviewPersistenceLabel = "browser-local" | "download-only"

export type ReportPreviewModel = {
  project: {
    hasActiveBrowserProject: boolean
    persistenceLabel: ReportPreviewPersistenceLabel
  }
  graph?: {
    graphId: string
    nodeCount: number
    edgeCount: number
    pathCount: number
    activePathId?: string | null
    snapshotArtifactId?: string | null
  }
  profile?: {
    profileId: string
    pointCount: number
    missingPointCount: number
    correctionPointCount: number
    outputUnit: string
  }
  energyTable?: {
    schemaVersion: "energy-table-v1"
    columnCount: number
    rowCount?: number | null
    artifactId: string
    format: "xlsx" | "csv"
  }
  assets: Array<{
    key: ReportPreviewAssetKey
    labelKey: string
    status: ReportPreviewAssetStatus
    artifactIds: string[]
    formats: string[]
  }>
  artifacts: Array<{
    id: string
    format: string
    persisted: boolean
    hasInlineBytes: boolean
    checksum?: string | null
    path?: string | null
  }>
  warnings: Array<{ code: string; message: string; target?: string | null }>
}

export type ReportPreviewModelInput = {
  workspace?: WorkspaceSummary | null
  profile?: EnergyProfileSummary | null
  artifacts: WorkbenchArtifactSummary[]
  warnings: ShellWarning[]
  hasActiveBrowserProject: boolean
  includeBytes: boolean
  selectedFormats: readonly string[]
}

export function buildReportPreviewModel(input: ReportPreviewModelInput): ReportPreviewModel {
  const profile = input.profile ? profileSummary(input.profile) : undefined
  const energyDiagramArtifacts = matchingArtifacts(input.artifacts, ["energy_diagram"], ["png", "cdxml"])
  const energyTableArtifacts = matchingArtifacts(input.artifacts, ["energy_table"], ["xlsx", "csv"])
  const graphSnapshotArtifacts = matchingArtifacts(input.artifacts, ["graph_snapshot"], ["svg"])
  const energyTable = energyTableSummary(energyTableArtifacts)
  const graphSnapshotArtifact = graphSnapshotArtifacts[0]

  return {
    project: {
      hasActiveBrowserProject: input.hasActiveBrowserProject,
      persistenceLabel: input.hasActiveBrowserProject && input.includeBytes ? "browser-local" : "download-only",
    },
    graph: input.workspace ? {
      graphId: input.workspace.graph.id,
      nodeCount: input.workspace.graph.node_count,
      edgeCount: input.workspace.graph.edge_count,
      pathCount: input.workspace.graph.path_count,
      activePathId: input.workspace.active_path_id ?? null,
      snapshotArtifactId: graphSnapshotArtifact?.id ?? null,
    } : undefined,
    profile,
    energyTable,
    assets: [
      {
        key: "energy_diagram",
        labelKey: "reportPreview.assets.energyDiagram",
        status: energyDiagramStatus(profile, energyDiagramArtifacts),
        artifactIds: energyDiagramArtifacts.map((artifact) => artifact.id),
        formats: assetFormats(energyDiagramArtifacts, input.selectedFormats, ["png", "cdxml"]),
      },
      {
        key: "energy_table",
        labelKey: "reportPreview.assets.energyTable",
        status: tableOrSnapshotStatus(Boolean(profile), energyTableArtifacts),
        artifactIds: energyTableArtifacts.map((artifact) => artifact.id),
        formats: assetFormats(energyTableArtifacts, input.selectedFormats, ["xlsx", "csv"]),
      },
      {
        key: "graph_snapshot",
        labelKey: "reportPreview.assets.graphSnapshot",
        status: tableOrSnapshotStatus(Boolean(input.workspace), graphSnapshotArtifacts),
        artifactIds: graphSnapshotArtifacts.map((artifact) => artifact.id),
        formats: assetFormats(graphSnapshotArtifacts, input.selectedFormats, ["svg"]),
      },
    ],
    artifacts: input.artifacts.map((artifact) => ({
      id: artifact.id,
      format: artifact.format,
      persisted: artifact.persisted,
      hasInlineBytes: artifact.has_inline_bytes,
      checksum: artifact.checksum ?? null,
      path: artifact.path ?? null,
    })),
    warnings: previewWarnings(input.warnings, input.profile),
  }
}

function profileSummary(profile: EnergyProfileSummary): ReportPreviewModel["profile"] {
  return {
    profileId: profile.id,
    pointCount: profile.point_count,
    missingPointCount: profile.points.filter((point) => Boolean(point.missing_reason)).length,
    correctionPointCount: profile.points.filter((point) => Boolean(point.expression?.corrections.length)).length,
    outputUnit: profile.output_unit,
  }
}

function matchingArtifacts(
  artifacts: WorkbenchArtifactSummary[],
  artifactKinds: string[],
  formats: string[],
): WorkbenchArtifactSummary[] {
  return artifacts.filter((artifact) => {
    const artifactKind = stringMetadata(artifact.metadata, "artifact_kind")
    return formats.includes(artifact.format) || (artifactKind !== null && artifactKinds.includes(artifactKind))
  })
}

function energyTableSummary(artifacts: WorkbenchArtifactSummary[]): ReportPreviewModel["energyTable"] {
  const artifact = artifacts.find((item) => (
    (item.format === "xlsx" || item.format === "csv")
    && stringMetadata(item.metadata, "energy_table_schema_version") === "energy-table-v1"
  ))
  if (!artifact || artifact.format !== "xlsx" && artifact.format !== "csv") {
    return undefined
  }
  return {
    schemaVersion: "energy-table-v1",
    columnCount: numberMetadata(artifact.metadata, "energy_table_column_count") ?? 0,
    rowCount: numberMetadata(artifact.metadata, "energy_table_row_count"),
    artifactId: artifact.id,
    format: artifact.format,
  }
}

function energyDiagramStatus(
  profile: ReportPreviewModel["profile"],
  artifacts: WorkbenchArtifactSummary[],
): ReportPreviewAssetStatus {
  if (!profile) return "unavailable"
  if (profile.missingPointCount > 0) return "warning"
  return artifacts.length > 0 ? "ready" : "pending"
}

function tableOrSnapshotStatus(hasSource: boolean, artifacts: WorkbenchArtifactSummary[]): ReportPreviewAssetStatus {
  if (artifacts.length > 0) return "ready"
  return hasSource ? "pending" : "unavailable"
}

function assetFormats(
  artifacts: WorkbenchArtifactSummary[],
  selectedFormats: readonly string[],
  fallbackFormats: string[],
): string[] {
  const formats = artifacts.length > 0
    ? artifacts.map((artifact) => artifact.format)
    : selectedFormats.filter((format) => fallbackFormats.includes(format))
  return Array.from(new Set(formats))
}

function previewWarnings(
  shellWarnings: ShellWarning[],
  profile?: EnergyProfileSummary | null,
): Array<{ code: string; message: string; target?: string | null }> {
  const warnings = [
    ...shellWarnings,
    ...(profile?.warnings ?? []),
    ...(profile?.points.flatMap((point) => point.warnings ?? []) ?? []),
  ]
  const seen = new Set<string>()
  return warnings.filter((warning) => {
    const key = `${warning.code}|${warning.message}|${warning.target ?? ""}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).map((warning) => ({
    code: warning.code,
    message: warning.message,
    target: warning.target ?? null,
  }))
}

function stringMetadata(metadata: JsonObject, key: string): string | null {
  const value = metadata[key]
  return typeof value === "string" ? value : null
}

function numberMetadata(metadata: JsonObject, key: string): number | null {
  const value = metadata[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
