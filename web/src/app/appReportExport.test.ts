import { beforeEach, describe, expect, it, vi } from "vitest"
import { defaultReportExportOptions } from "../domain/reportExports"
import { exportSelectedReportFormats } from "./appReportExport"

const createAndSaveReportArtifactsMock = vi.fn()

vi.mock("./reportExportWorkflow", () => ({
  createAndSaveReportArtifacts: (...args: unknown[]) => createAndSaveReportArtifactsMock(...args),
  saveReportArtifactToDestination: vi.fn(async () => "browser-download"),
}))

describe("appReportExport", () => {
  beforeEach(() => {
    createAndSaveReportArtifactsMock.mockReset()
  })

  it("does nothing when no formats are selected", async () => {
    const setExportBusy = vi.fn()
    await exportSelectedReportFormats({
      exportOptions: { ...defaultReportExportOptions, formats: [] },
      projectLabel: "Project",
      nodes: [],
      edges: [],
      files: [],
      rows: [],
      desktopApi: undefined,
      setExportBusy,
      setExportStatus: vi.fn(),
      setExportArtifacts: vi.fn(),
    })
    expect(setExportBusy).not.toHaveBeenCalled()
    expect(createAndSaveReportArtifactsMock).not.toHaveBeenCalled()
  })

  it("updates busy/status/artifacts for a successful export", async () => {
    createAndSaveReportArtifactsMock.mockResolvedValue({
      artifacts: [{ format: "png", destination: "browser-download" }],
      status: "Exported 1 artifact.",
    })
    const setExportBusy = vi.fn()
    const setExportStatus = vi.fn()
    const setExportArtifacts = vi.fn()
    await exportSelectedReportFormats({
      exportOptions: { ...defaultReportExportOptions, formats: ["png"] },
      projectLabel: "Project",
      nodes: [],
      edges: [],
      files: [],
      rows: [],
      desktopApi: undefined,
      setExportBusy,
      setExportStatus,
      setExportArtifacts,
    })
    expect(setExportBusy).toHaveBeenNthCalledWith(1, true)
    expect(setExportStatus).toHaveBeenCalledWith("Preparing report artifacts...")
    expect(setExportArtifacts).toHaveBeenCalledWith([{ format: "png", destination: "browser-download" }])
    expect(setExportStatus).toHaveBeenCalledWith("Exported 1 artifact.")
    expect(setExportBusy).toHaveBeenLastCalledWith(false)
  })
})
