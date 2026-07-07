import type { ChemicalMimeType, StructService } from "ketcher-core"
import type { FlowEdge, FlowNode, SourceFile } from "../domain/projectPackages"
import type { ReportExportNode, ReportExportOptions } from "../domain/reportExports"
import type { EnergyTableRow } from "./energyDisplay"
import { molfileFromAtoms } from "./Molecule2DDepiction"
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
  setExportStatus("Preparing export...")
  try {
    const exportNodes = await reportExportNodesWithStructures(nodes, files, exportOptions.formats)
    const result = await createAndSaveReportArtifacts(exportOptions, {
      projectLabel,
      nodes: exportNodes,
      edges,
      files,
      rows,
    }, (artifact) => saveReportArtifactToDestination(artifact, desktopApi))
    setExportArtifacts(result.artifacts)
    setExportStatus(result.status)
  } catch (error) {
    onError(error)
    const message = error instanceof Error && error.message ? error.message : "Unknown error."
    setExportStatus(`Export failed: ${message}`)
  } finally {
    setExportBusy(false)
  }
}

type KetcherStructService = Pick<StructService, "convert" | "destroy">

type StructureConversionInput = {
  struct: string
  inputFormat: ChemicalMimeType
}

const chemicalMimeTypes = {
  cdxml: "chemical/x-cdxml" as ChemicalMimeType,
  ket: "chemical/x-indigo-ket" as ChemicalMimeType,
  mol: "chemical/x-mdl-molfile" as ChemicalMimeType,
} as const

async function reportExportNodesWithStructures(
  nodes: FlowNode[],
  files: SourceFile[],
  formats: ReportExportOptions["formats"],
): Promise<ReportExportNode[]> {
  if (!formats.includes("cdxml")) return nodes
  const inputs = nodes.map((node) => structureConversionInput(node, files))
  if (inputs.every((input, index) => nodes[index].manualStructureCdxml || !input)) return nodes

  const service = await createKetcherStructService()
  try {
    const exportNodes: ReportExportNode[] = []
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]
      const input = inputs[index]
      if (node.manualStructureCdxml || !input) {
        exportNodes.push(node)
        continue
      }
      const cdxml = await convertStructureToKetcherCdxml(service, input)
      exportNodes.push({ ...node, manualStructureCdxml: cdxml })
    }
    return exportNodes
  } finally {
    service.destroy?.()
  }
}

async function createKetcherStructService(): Promise<KetcherStructService> {
  const { StandaloneStructServiceProvider } = await import("ketcher-standalone/dist/jsNoRender")
  const provider = new StandaloneStructServiceProvider()
  return provider.createStructService({})
}

async function convertStructureToKetcherCdxml(
  service: KetcherStructService,
  input: StructureConversionInput,
): Promise<string> {
  const result = await service.convert({
    struct: input.struct,
    input_format: input.inputFormat,
    output_format: chemicalMimeTypes.cdxml,
  })
  const cdxml = result.struct.trim()
  if (!cdxml) throw new Error("Ketcher returned an empty CDXML structure.")
  return cdxml
}

function structureConversionInput(node: FlowNode, files: SourceFile[]): StructureConversionInput | null {
  if (node.manualStructureCdxml) return null
  if (node.manualStructureKet?.trim()) {
    return {
      struct: node.manualStructureKet,
      inputFormat: chemicalMimeTypes.ket,
    }
  }
  const molfile = node.manualStructureMolfile ?? molfileFromCoordinatePreview(node, files)
  if (!molfile?.trim()) return null
  return {
    struct: molfile,
    inputFormat: chemicalMimeTypes.mol,
  }
}

function molfileFromCoordinatePreview(node: FlowNode, files: SourceFile[]): string | undefined {
  if (!node.sourceFileId) return undefined
  const parse = files.find((file) => file.id === node.sourceFileId)?.parse
  if (!parse) return undefined
  const candidate = node.sourceCandidateId
    ? parse.candidates.find((item) => item.candidateId === node.sourceCandidateId)
    : undefined
  const atoms = candidate?.coordinatePreview?.atoms ?? parse.coordinatePreview?.atoms ?? []
  return atoms.length > 0 ? molfileFromAtoms(atoms) : undefined
}
