import type { ExportFormat } from "../shell/types"

export type ExportFormatStatus = "supported" | "experimental" | "unsupported"

export type ExportFormatCapability = {
  format: string
  extension: string
  mimeType: string
  writerId: string | null
  fixtureWriterId: string | null
  artifactKind: string
  supportsInlineBytes: boolean
  supportsBrowserPersistence: boolean
  webDefaultEnabled: boolean
  status: ExportFormatStatus
  unsupportedReason?: string
}

export const exportFormatCapabilities: readonly ExportFormatCapability[] = [
  {
    format: "png",
    extension: "png",
    mimeType: "image/png",
    writerId: "pillow-energy-plot-v1",
    fixtureWriterId: "fixture-png-energy-plot-v1",
    artifactKind: "energy_diagram",
    supportsInlineBytes: true,
    supportsBrowserPersistence: true,
    webDefaultEnabled: true,
    status: "supported",
  },
  {
    format: "cdxml",
    extension: "cdxml",
    mimeType: "chemical/x-cdxml",
    writerId: "rxnflow-cdxml-energy-v1",
    fixtureWriterId: "fixture-cdxml-energy-v1",
    artifactKind: "energy_diagram",
    supportsInlineBytes: true,
    supportsBrowserPersistence: true,
    webDefaultEnabled: true,
    status: "supported",
  },
  {
    format: "xlsx",
    extension: "xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    writerId: "xlsxwriter-energy-workbook-v1",
    fixtureWriterId: "fixture-xlsx-energy-table-v1",
    artifactKind: "energy_table",
    supportsInlineBytes: true,
    supportsBrowserPersistence: true,
    webDefaultEnabled: true,
    status: "supported",
  },
  {
    format: "csv",
    extension: "csv",
    mimeType: "text/csv",
    writerId: "python-csv-energy-table-v1",
    fixtureWriterId: "fixture-csv-energy-table-v1",
    artifactKind: "energy_table",
    supportsInlineBytes: true,
    supportsBrowserPersistence: true,
    webDefaultEnabled: false,
    status: "supported",
  },
  {
    format: "svg",
    extension: "svg",
    mimeType: "image/svg+xml",
    writerId: "python-svg-graph-snapshot-v1",
    fixtureWriterId: "fixture-svg-graph-snapshot-v1",
    artifactKind: "graph_snapshot",
    supportsInlineBytes: true,
    supportsBrowserPersistence: true,
    webDefaultEnabled: false,
    status: "supported",
  },
  {
    format: "pdf",
    extension: "pdf",
    mimeType: "application/pdf",
    writerId: null,
    fixtureWriterId: null,
    artifactKind: "report_document",
    supportsInlineBytes: true,
    supportsBrowserPersistence: false,
    webDefaultEnabled: false,
    status: "unsupported",
    unsupportedReason: "PDF writer dependency and rendering boundary are not decided.",
  },
  {
    format: "pptx",
    extension: "pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    writerId: null,
    fixtureWriterId: null,
    artifactKind: "report_document",
    supportsInlineBytes: true,
    supportsBrowserPersistence: false,
    webDefaultEnabled: false,
    status: "unsupported",
    unsupportedReason: "PPTX writer dependency and slide contract are not decided.",
  },
  {
    format: "cdx",
    extension: "cdx",
    mimeType: "chemical/x-cdx",
    writerId: null,
    fixtureWriterId: null,
    artifactKind: "external_conversion",
    supportsInlineBytes: false,
    supportsBrowserPersistence: false,
    webDefaultEnabled: false,
    status: "unsupported",
    unsupportedReason: "ChemDraw CDX binary writer/converter is not available.",
  },
]

export function exportFormatCapability(format: string): ExportFormatCapability | undefined {
  return exportFormatCapabilities.find((capability) => capability.format === format)
}

export function supportedExportFormats(): ExportFormat[] {
  return exportFormatCapabilities
    .filter((capability) => capability.status === "supported")
    .map((capability) => capability.format as ExportFormat)
}

export function isSupportedExportFormat(format: string): format is ExportFormat {
  return supportedExportFormats().includes(format as ExportFormat)
}

export function reportExportFormats(): ExportFormat[] {
  return exportFormatCapabilities
    .filter((capability) => capability.status === "supported" && capability.webDefaultEnabled)
    .map((capability) => capability.format as ExportFormat)
}

export function supportsBrowserPersistence(format: string): boolean {
  return exportFormatCapability(format)?.supportsBrowserPersistence === true
}

export function mimeTypeForExportFormat(format: string): string {
  return exportFormatCapability(format)?.mimeType ?? "application/octet-stream"
}

export function extensionForExportFormat(format: string): string {
  return exportFormatCapability(format)?.extension ?? format
}

export function writerIdForExportFormat(format: ExportFormat, fixture = false): string {
  const capability = exportFormatCapability(format)
  return (fixture ? capability?.fixtureWriterId : capability?.writerId) ?? `unknown-${format}-writer`
}
