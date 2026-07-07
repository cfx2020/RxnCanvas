import {
  createReportArtifact,
  type ReportExportArtifact,
  type ReportExportContext,
  type ReportExportOptions,
} from "../domain/reportExports"
import { bytesToBase64, downloadData } from "./browserDownloads"

export type SavedReportArtifact = ReportExportArtifact & {
  destination?: string
}

export type ReportArtifactSaveResult = {
  canceled: boolean
  destination?: string
}

export type DesktopReportArtifactBridge = {
  saveReportArtifact: (payload: {
    defaultName: string
    mimeType: string
    encoding: "utf8" | "base64"
    content: string
  }) => Promise<{
    canceled: boolean
    filePath?: string
  }>
}

type ReportExportWorkflowContext = Omit<ReportExportContext, "basename" | "title">

export async function createAndSaveReportArtifacts(
  options: ReportExportOptions,
  context: ReportExportWorkflowContext,
  saveArtifact: (artifact: ReportExportArtifact) => Promise<ReportArtifactSaveResult>,
): Promise<{ artifacts: SavedReportArtifact[]; status: string }> {
  const artifacts = await Promise.all(options.formats.map((format) => createReportArtifact(format, {
    ...context,
    basename: options.basename,
    title: options.title,
  })))
  return saveReportArtifacts(artifacts, saveArtifact)
}

export async function saveReportArtifacts(
  artifacts: ReportExportArtifact[],
  saveArtifact: (artifact: ReportExportArtifact) => Promise<ReportArtifactSaveResult>,
): Promise<{ artifacts: SavedReportArtifact[]; status: string }> {
  const savedArtifacts: SavedReportArtifact[] = []
  let canceledCount = 0

  for (const artifact of artifacts) {
    const result = await saveArtifact(artifact)
    if (result.canceled) {
      canceledCount += 1
    } else {
      savedArtifacts.push({
        ...artifact,
        destination: result.destination,
      })
    }
  }

  return {
    artifacts: savedArtifacts,
    status: reportExportStatus(savedArtifacts.length, canceledCount),
  }
}

export function reportExportStatus(exportedCount: number, canceledCount: number): string {
  if (exportedCount === 0) {
    return canceledCount > 0 ? "Export canceled." : "No files exported."
  }
  const canceledSuffix = canceledCount > 0 ? ` ${canceledCount} canceled.` : ""
  return `Exported ${exportedCount} file${exportedCount === 1 ? "" : "s"}.${canceledSuffix}`
}

export async function saveReportArtifactToDestination(
  artifact: ReportExportArtifact,
  desktopBridge?: DesktopReportArtifactBridge,
): Promise<ReportArtifactSaveResult> {
  if (desktopBridge) {
    const payload = artifact.data instanceof Uint8Array
      ? {
          defaultName: artifact.fileName,
          mimeType: artifact.mimeType,
          encoding: "base64" as const,
          content: bytesToBase64(artifact.data),
        }
      : {
          defaultName: artifact.fileName,
          mimeType: artifact.mimeType,
          encoding: "utf8" as const,
          content: artifact.data,
        }
    const result = await desktopBridge.saveReportArtifact(payload)
    return {
      canceled: result.canceled,
      destination: result.filePath,
    }
  }

  downloadData(artifact.fileName, artifact.data, artifact.mimeType)
  return { canceled: false, destination: "browser-download" }
}
