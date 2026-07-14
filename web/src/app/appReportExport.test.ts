import { beforeEach, describe, expect, it, vi } from "vitest"
import { defaultReportExportOptions } from "../domain/reportExports"
import { exportSelectedReportFormats } from "./appReportExport"

const createAndSaveReportArtifactsMock = vi.fn()
const ketcherMocks = vi.hoisted(() => ({
  convert: vi.fn(),
  destroy: vi.fn(),
  createStructService: vi.fn(),
  runtimeDestroyed: false,
}))

vi.mock("./reportExportWorkflow", () => ({
  createAndSaveReportArtifacts: (...args: unknown[]) => createAndSaveReportArtifactsMock(...args),
  saveReportArtifactToDestination: vi.fn(async () => "browser-download"),
}))

vi.mock("ketcher-standalone/dist/jsNoRender", () => ({
  StandaloneStructServiceProvider: vi.fn(function StandaloneStructServiceProvider() {
    return {
      createStructService: ketcherMocks.createStructService,
    }
  }),
}))

describe("appReportExport", () => {
  beforeEach(() => {
    createAndSaveReportArtifactsMock.mockReset()
    ketcherMocks.convert.mockReset()
    ketcherMocks.destroy.mockReset()
    ketcherMocks.createStructService.mockReset()
    ketcherMocks.runtimeDestroyed = false
    ketcherMocks.createStructService.mockReturnValue({
      convert: (...args: Parameters<typeof ketcherMocks.convert>) => {
        if (ketcherMocks.runtimeDestroyed) {
          return Promise.reject(new Error("Ketcher runtime was destroyed."))
        }
        return ketcherMocks.convert(...args)
      },
      destroy: () => {
        ketcherMocks.runtimeDestroyed = true
        ketcherMocks.destroy()
      },
    })
    ketcherMocks.convert.mockResolvedValue({
      struct: "<CDXML><page id=\"1\"><fragment id=\"2\"><n id=\"3\" p=\"0 0\" Element=\"6\"/></fragment></page></CDXML>",
    })
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
      status: "Exported 1 file.",
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
    expect(setExportStatus).toHaveBeenCalledWith("Preparing export...")
    expect(setExportArtifacts).toHaveBeenCalledWith([{ format: "png", destination: "browser-download" }])
    expect(setExportStatus).toHaveBeenCalledWith("Exported 1 file.")
    expect(setExportBusy).toHaveBeenLastCalledWith(false)
    expect(ketcherMocks.createStructService).not.toHaveBeenCalled()
  })

  it("surfaces export failure reasons in the status text", async () => {
    createAndSaveReportArtifactsMock.mockRejectedValue(new Error("CDXML preflight failed: duplicate id 3."))
    const setExportStatus = vi.fn()
    const onError = vi.fn()

    await exportSelectedReportFormats({
      exportOptions: { ...defaultReportExportOptions, formats: ["png"] },
      projectLabel: "Project",
      nodes: [],
      edges: [],
      files: [],
      rows: [],
      desktopApi: undefined,
      setExportBusy: vi.fn(),
      setExportStatus,
      setExportArtifacts: vi.fn(),
      onError,
    })

    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect(setExportStatus).toHaveBeenCalledWith("Export failed: CDXML preflight failed: duplicate id 3.")
  })

  it("adds Ketcher CDXML structures from parsed coordinate previews before exporting CDXML", async () => {
    createAndSaveReportArtifactsMock.mockResolvedValue({
      artifacts: [{ format: "cdxml", destination: "browser-download" }],
      status: "Exported 1 file.",
    })

    await exportSelectedReportFormats({
      exportOptions: { ...defaultReportExportOptions, formats: ["cdxml"] },
      projectLabel: "Project",
      nodes: [{
        id: "node-a",
        label: "A",
        formula: "CO",
        kind: "intermediate",
        method: "dft",
        solvent: "gas",
        energyGas: -1,
        energySolution: null,
        energyUnit: "hartree",
        sourceFileId: "file-a",
        sourceCandidateId: "candidate-a",
        position: { x: 0, y: 0 },
      }],
      edges: [],
      files: [{
        id: "file-a",
        name: "a.log",
        kind: "Gaussian",
        size: 10,
        status: "parsed",
        preview: "",
        parse: {
          parserId: "test",
          parserVersion: "1",
          parsed: true,
          objectCount: 1,
          parseScope: "full",
          confidence: "high",
          sourceKind: "Gaussian",
          terminationStatus: "normal",
          warnings: [],
          candidates: [{
            candidateId: "candidate-a",
            objectIndex: 0,
            label: "A",
            formula: "CO",
            roleHint: "intermediate",
            energyGas: -1,
            energySolution: null,
            energyUnit: "hartree",
            method: "dft",
            solvent: "gas",
            charge: 0,
            spinMultiplicity: 1,
            energyTable: null,
            coordinatePreview: {
              atomCount: 2,
              elements: ["C", "O"],
              has3d: true,
              atoms: [
                { element: "C", x: 0, y: 0, z: 0 },
                { element: "O", x: 1.2, y: 0, z: 0 },
              ],
            },
          }],
          coordinatePreview: null,
          energyTable: null,
        },
      }] as any,
      rows: [],
      desktopApi: undefined,
      setExportBusy: vi.fn(),
      setExportStatus: vi.fn(),
      setExportArtifacts: vi.fn(),
    })

    const context = createAndSaveReportArtifactsMock.mock.calls[0][1]
    expect(ketcherMocks.convert).toHaveBeenCalledWith({
      struct: expect.stringContaining("RxnFlow 2D depiction"),
      input_format: "chemical/x-mdl-molfile",
      output_format: "chemical/x-cdxml",
    })
    expect(ketcherMocks.destroy).not.toHaveBeenCalled()
    expect(context.nodes[0].manualStructureCdxml).toContain("<CDXML>")
  })

  it("keeps the Ketcher runtime available across consecutive CDXML exports", async () => {
    createAndSaveReportArtifactsMock.mockResolvedValue({
      artifacts: [{ format: "cdxml", destination: "browser-download" }],
      status: "Exported 1 file.",
    })
    const request = {
      exportOptions: { ...defaultReportExportOptions, formats: ["cdxml" as const] },
      projectLabel: "Project",
      nodes: [{
        id: "node-a",
        label: "A",
        formula: "C",
        kind: "intermediate" as const,
        method: "dft",
        solvent: "gas",
        energyGas: -1,
        energySolution: null,
        energyUnit: "hartree" as const,
        manualStructureMolfile: "RxnFlow\n  test\n\n  0  0  0  0  0  0  0  0  0  0999 V2000\nM  END",
        position: { x: 0, y: 0 },
      }],
      edges: [],
      files: [],
      rows: [],
      desktopApi: undefined,
      setExportBusy: vi.fn(),
      setExportStatus: vi.fn(),
      setExportArtifacts: vi.fn(),
    }

    await exportSelectedReportFormats(request)
    await exportSelectedReportFormats(request)

    expect(ketcherMocks.createStructService).toHaveBeenCalledTimes(2)
    expect(ketcherMocks.convert).toHaveBeenCalledTimes(2)
    expect(ketcherMocks.destroy).not.toHaveBeenCalled()
    expect(createAndSaveReportArtifactsMock).toHaveBeenCalledTimes(2)
  })
})
