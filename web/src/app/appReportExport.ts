import type { FlowEdge, FlowNode, SourceFile } from "../domain/projectPackages"
import type { ReportExportOptions } from "../domain/reportExports"
import type { EnergyTableRow } from "./energyDisplay"
import type { ExportedReportArtifact } from "./ReportPanels"
import {
  createAndSaveReportArtifacts,
  saveReportArtifactToDestination,
} from "./reportExportWorkflow"
import type { RxnflowDesktopApi } from "./appRuntimeEffects"

export async function exportSelectedReportFormats({
  exportOptions,
  projectLabel,
  nodes,
  edges,
  files,
  rows,
  desktopApi,
  setExportBusy,
  setExportStatus,
  setExportArtifacts,
  onError = console.error,
}: {
  exportOptions: ReportExportOptions
  projectLabel: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  files: SourceFile[]
  rows: EnergyTableRow[]
  desktopApi: RxnflowDesktopApi | undefined
  setExportBusy: (busy: boolean) => void
  setExportStatus: (status: string) => void
  setExportArtifacts: (artifacts: ExportedReportArtifact[]) => void
  onError?: (error: unknown) => void
}): Promise<void> {
  if (exportOptions.formats.length === 0) return
  setExportBusy(true)
  setExportStatus("Preparing report artifacts...")
  try {
    const result = await createAndSaveReportArtifacts(exportOptions, {
      projectLabel,
      nodes,
      edges,
      files,
      rows,
    }, (artifact) => saveReportArtifactToDestination(artifact, desktopApi))
    setExportArtifacts(result.artifacts)
    setExportStatus(result.status)
  } catch (error) {
    onError(error)
    setExportStatus("Export failed. Check the developer console for details.")
  } finally {
    setExportBusy(false)
  }
}
