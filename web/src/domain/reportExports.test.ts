import {
  buildCdxmlReport,
  buildReportSvg,
  buildXlsxWorkbook,
  createReportArtifact,
  defaultReportExportOptions,
  reportExportFormats,
  type ReportExportContext,
} from "./reportExports"

const context: ReportExportContext = {
  projectLabel: "Diels-Alder Study",
  basename: "Main Route",
  title: "Reaction path report",
  files: [
    { id: "file-a", name: "gaussian.log", kind: "Gaussian", size: 4800, status: "parsed" },
  ],
  nodes: [
    {
      id: "node-a",
      label: "Reactant <A>",
      formula: "C4H6",
      kind: "reactant",
      method: "wB97X-D",
      solvent: "Toluene",
      energyGas: -100,
      energySolution: -100.01,
      energyUnit: "hartree",
      manualStructureCdxml: "<CDXML><page id=\"1\"><fragment id=\"2\"><n id=\"3\" p=\"0 0\" Element=\"6\"/></fragment></page></CDXML>",
      position: { x: -180, y: 40 },
    },
    {
      id: "node-ts",
      label: "TS & B",
      formula: "C8H8",
      kind: "transition",
      method: "wB97X-D",
      solvent: "Toluene",
      energyGas: -99.98,
      energySolution: -99.97,
      energyUnit: "hartree",
      position: { x: 90, y: -30 },
    },
  ],
  edges: [
    { id: "edge-a-ts", sourceId: "node-a", targetId: "node-ts", label: "step" },
  ],
  rows: [
    {
      nodeId: "node-a",
      label: "Reactant <A>",
      kind: "reactant",
      formula: "C4H6",
      gas: -100,
      solution: -100.01,
      energyUnit: "hartree",
      relative: 0,
    },
    {
      nodeId: "node-ts",
      label: "TS & B",
      kind: "transition",
      formula: "C8H8",
      gas: -99.98,
      solution: -99.97,
      energyUnit: "hartree",
      relative: 25.1,
    },
  ],
}

describe("report exports", () => {
  it("exposes only the original web-default report formats", () => {
    expect(reportExportFormats()).toEqual(["png", "cdxml", "xlsx"])
    expect(defaultReportExportOptions.formats).toEqual(["png", "cdxml", "xlsx"])
  })

  it("builds escaped CDXML diagram content", () => {
    const cdxml = buildCdxmlReport(context)

    expect(cdxml).toContain("<CDXML")
    expect(cdxml).toContain("CreationProgram=\"RxnFlow\"")
    expect(cdxml).toContain("Reactant &lt;A&gt;")
    expect(cdxml).toContain("TS &amp; B")
    expect(cdxml).toContain("25.10 kcal/mol")
    expect(cdxml).toContain("GraphicType=\"Line\"")
    expect(cdxml).toContain("RxnFlow manual molecule CDXML")
    expect(cdxml).toContain("<fragment id=\"")
    expect(cdxml).toContain("p=\"81.4 238\"")
  })

  it("builds a minimal valid XLSX zip package", () => {
    const workbook = buildXlsxWorkbook(context)
    const decoded = new TextDecoder().decode(workbook)

    expect(Array.from(workbook.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(decoded).toContain("xl/workbook.xml")
    expect(decoded).toContain("Energy Table")
    expect(decoded).toContain("Import Files")
    expect(decoded).toContain("Export Metadata")
    expect(decoded).toContain("Egas")
    expect(decoded).toContain("ΔEgas")
    expect(decoded).toContain("B2*627.5095")
    expect(decoded).toContain("B3-B$2")
    expect(decoded).toContain("Reactant &lt;A&gt;")
    expect(decoded).toContain("rxnflow-renderer-xlsx-v1")
  })

  it("builds report SVG and PNG artifacts", async () => {
    const svg = buildReportSvg(context)
    const png = await createReportArtifact("png", context)

    expect(svg).toContain("<svg")
    expect(svg).toContain("Reaction path report")
    expect(svg).toContain("Energy summary")
    expect(png.fileName).toBe("main-route.png")
    expect(png.mimeType).toBe("image/png")
    expect(png.data).toBeInstanceOf(Uint8Array)
    expect(Array.from((png.data as Uint8Array).slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  })
})
