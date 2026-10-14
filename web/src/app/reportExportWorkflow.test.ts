import { describe, expect, it, vi } from "vitest"
import type { ReportExportArtifact, ReportExportOptions } from "../domain/reportExports"
import {
  createAndSaveReportArtifacts,
  reportExportStatus,
  saveReportArtifactToDestination,
  saveReportArtifacts,
} from "./reportExportWorkflow"

const cdxmlArtifact: ReportExportArtifact = {
  id: "cdxml-1",
  format: "cdxml",
  fileName: "rxncanvas-report.cdxml",
  mimeType: "chemical/x-cdxml",
  byteLength: 14,
  data: "<CDXML></CDXML>",
}

const xlsxArtifact: ReportExportArtifact = {
  id: "xlsx-1",
  format: "xlsx",
  fileName: "rxncanvas-report.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  byteLength: 3,
  data: new Uint8Array([65, 66, 67]),
}

describe("reportExportWorkflow", () => {
  it("summarizes report export results", () => {
    expect(reportExportStatus(0, 0)).toBe("No files exported.")
    expect(reportExportStatus(0, 3)).toBe("Export canceled.")
    expect(reportExportStatus(1, 0)).toBe("Exported 1 file.")
    expect(reportExportStatus(2, 1)).toBe("Exported 2 files. 1 canceled.")
  })

  it("keeps canceled artifacts out of the saved artifact list", async () => {
    const result = await saveReportArtifacts([cdxmlArtifact, xlsxArtifact], async (artifact) => ({
      canceled: artifact.format === "xlsx",
      destination: `exports/${artifact.fileName}`,
    }))

    expect(result.status).toBe("Exported 1 file. 1 canceled.")
    expect(result.artifacts).toEqual([{
      ...cdxmlArtifact,
      destination: "exports/rxncanvas-report.cdxml",
    }])
  })

  it("creates active report formats and delegates saving", async () => {
    const options: ReportExportOptions = {
      formats: ["cdxml", "xlsx"],
      basename: "engine-preview",
      title: "Engine Preview",
    }
    const saveArtifact = vi.fn(async (artifact: ReportExportArtifact) => ({
      canceled: false,
      destination: `exports/${artifact.fileName}`,
    }))

    const result = await createAndSaveReportArtifacts(options, {
      projectLabel: "Diels-Alder Study",
      nodes: [{
        id: "node-1",
        label: "TS1",
        formula: "C2H4",
        kind: "transition",
        method: "wB97X-D",
        solvent: "Toluene",
        energyGas: -10,
        energySolution: -9.5,
        energyUnit: "hartree",
        position: { x: 10, y: 20 },
      }],
      edges: [],
      files: [{
        id: "file-1",
        name: "gaussian.log",
        kind: "Gaussian",
        size: 124,
        status: "parsed",
      }],
      rows: [{
        nodeId: "node-1",
        label: "TS1",
        kind: "transition",
        formula: "C2H4",
        gas: -10,
        solution: -9.5,
        energyUnit: "hartree",
        relative: 0,
      }],
    }, saveArtifact)

    expect(saveArtifact).toHaveBeenCalledTimes(2)
    expect(saveArtifact.mock.calls.map((call) => call[0].fileName)).toEqual([
      "engine-preview.cdxml",
      "engine-preview.xlsx",
    ])
    expect(result.status).toBe("Exported 2 files.")
    expect(result.artifacts.map((artifact) => artifact.destination)).toEqual([
      "exports/engine-preview.cdxml",
      "exports/engine-preview.xlsx",
    ])
  })

  it("saves string and binary artifacts through the desktop bridge", async () => {
    const bridge = {
      saveReportArtifact: vi.fn(async (payload: { defaultName: string }) => ({
        canceled: false,
        filePath: `/tmp/${payload.defaultName}`,
      })),
    }

    const cdxmlResult = await saveReportArtifactToDestination(cdxmlArtifact, bridge)
    const xlsxResult = await saveReportArtifactToDestination(xlsxArtifact, bridge)

    expect(bridge.saveReportArtifact.mock.calls[0][0]).toMatchObject({
      defaultName: "rxncanvas-report.cdxml",
      mimeType: "chemical/x-cdxml",
      encoding: "utf8",
      content: "<CDXML></CDXML>",
    })
    expect(bridge.saveReportArtifact.mock.calls[1][0]).toMatchObject({
      defaultName: "rxncanvas-report.xlsx",
      encoding: "base64",
      content: "QUJD",
    })
    expect(cdxmlResult.destination).toBe("/tmp/rxncanvas-report.cdxml")
    expect(xlsxResult.destination).toBe("/tmp/rxncanvas-report.xlsx")
  })
})
