import {
  buildCdxmlReport,
  buildReportSvg,
  buildXlsxWorkbook,
  createReportArtifact,
  defaultReportExportOptions,
  reportExportFormats,
  type ReportExportContext,
} from "./reportExports"
import { preflightChemDrawCdxml } from "./chemdrawCdxmlComposer"

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
      charge: 0,
      spinMultiplicity: 1,
      gas: -100,
      solution: -100.01,
      energyUnit: "hartree",
      energyTable: {
        egasHartree: -100,
        gasBasisFunctions: 120,
        ggasHartree: -99.9,
        ggas1mHartree: -99.899,
        esolHartree: -100.02,
        solBasisFunctions: 120,
        gsolHartree: -100.01,
      },
      relativeEnergyTable: {
        egasHartree: 0,
        gasBasisFunctions: 0,
        ggasHartree: 0,
        ggas1mHartree: 0,
        esolHartree: 0,
        solBasisFunctions: 0,
        gsolHartree: 0,
      },
      relative: 0,
      showInRelativeTable: true,
    },
    {
      nodeId: "node-ts",
      label: "TS & B",
      kind: "transition",
      formula: "C8H8",
      charge: 0,
      spinMultiplicity: 1,
      gas: -99.98,
      solution: -99.97,
      energyUnit: "hartree",
      energyTable: {
        egasHartree: -99.98,
        gasBasisFunctions: 180,
        ggasHartree: -99.95,
        ggas1mHartree: -99.949,
        esolHartree: -99.99,
        solBasisFunctions: 180,
        gsolHartree: -99.97,
      },
      relativeEnergyTable: {
        egasHartree: 0.02,
        gasBasisFunctions: 60,
        ggasHartree: -0.05,
        ggas1mHartree: -0.05,
        esolHartree: 0.03,
        solBasisFunctions: 60,
        gsolHartree: 0.04,
      },
      relative: 25.1,
      showInRelativeTable: true,
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
    expect(cdxml).toContain("CreationProgram=\"ChemDraw")
    expect(cdxml).toContain("Reactant &lt;A&gt;")
    expect(cdxml).toContain("TS &amp; B")
    expect(cdxml).toContain(">25.1<")
    expect(cdxml).toContain("<b id=")
    expect(cdxml).toContain("Display=\"Bold\"")
    expect(cdxml).toContain("Display=\"Dash\"")
    expect(cdxml).toContain("<fragment id=")
    expect(cdxml).not.toContain("Relative energy diagram")
    expect(cdxml).not.toContain("kcal/mol")
    expect(cdxml).toContain("bgcolor=\"1\"")
    expect(cdxml).not.toContain("<!--")
    expect(cdxml).not.toContain("<group")
    expect(() => preflightChemDrawCdxml(cdxml)).not.toThrow()
    expect(allCdxmlIdsAreUnique(cdxml)).toBe(true)
    expect(allCdxmlBondRefsExist(cdxml)).toBe(true)
    expect(Math.max(...boldBondLengths(cdxml))).toBeLessThanOrEqual(24)
  })

  it("renders side species terms with curved ChemDraw arrows", () => {
    const sideContext: ReportExportContext = {
      ...context,
      nodes: [
        ...context.nodes,
        {
          id: "node-product",
          label: "Product",
          formula: "C8H8",
          kind: "product",
          method: "dft",
          solvent: "gas",
          energyGas: null,
          energySolution: null,
          energyUnit: "hartree",
          position: { x: 320, y: 30 },
        },
        {
          id: "ligand",
          label: "L",
          formula: "L",
          kind: "intermediate",
          pathRole: "participant",
          method: "dft",
          solvent: "gas",
          energyGas: null,
          energySolution: null,
          energyUnit: "hartree",
          position: { x: 20, y: -120 },
        },
        {
          id: "n2",
          label: "N2",
          formula: "N2",
          kind: "intermediate",
          pathRole: "participant",
          method: "dft",
          solvent: "gas",
          energyGas: null,
          energySolution: null,
          energyUnit: "hartree",
          position: { x: 180, y: 120 },
        },
      ],
      edges: [
        ...context.edges,
        { id: "edge-ts-product", sourceId: "node-ts", targetId: "node-product", label: "step" },
        { id: "edge-l-ts", sourceId: "ligand", targetId: "node-ts", label: "addition", stepRole: "addition" },
        { id: "edge-ts-n2", sourceId: "node-ts", targetId: "n2", label: "release", stepRole: "release" },
      ],
      rows: [
        ...context.rows,
        {
          nodeId: "node-product",
          label: "Product",
          kind: "product",
          formula: "C8H8",
          gas: null,
          solution: null,
          energyUnit: "hartree",
          relative: -5,
          showInRelativeTable: true,
        },
      ],
    }
    const cdxml = buildCdxmlReport(sideContext)

    expect(cdxml).toContain("GraphicType=\"Arc\"")
    expect(cdxml).toContain("<arrow")
    expect(cdxml).toContain(">L<")
    expect(cdxml).toContain(">N2<")
    const arrows = cdxmlArrows(cdxml)
    const dashedSegments = dashedBondSegments(cdxml)
    expect(arrows.length).toBeGreaterThanOrEqual(2)
    expect(arrows.every((arrow) => dashedSegments.some((segment) => distancePointToSegment(arrow.center, segment) < 0.6))).toBe(true)
    const additionLabel = cdxmlTextPosition(cdxml, "L")
    const releaseLabel = cdxmlTextPosition(cdxml, "N2")
    const additionArrow = nearestArrow(additionLabel, arrows)
    const releaseArrow = nearestArrow(releaseLabel, arrows)
    expect(distance(additionLabel, additionArrow.tail)).toBeLessThan(distance(additionLabel, additionArrow.head))
    expect(distance(releaseLabel, releaseArrow.head)).toBeLessThan(distance(releaseLabel, releaseArrow.tail))
    expect(() => preflightChemDrawCdxml(cdxml)).not.toThrow()
  })

  it("keeps branch energy levels vertically parallel in CDXML", () => {
    const branchContext: ReportExportContext = {
      ...context,
      nodes: [
        context.nodes[0],
        {
          ...context.nodes[1],
          id: "ts-a",
          label: "TS-A",
          position: { x: 80, y: -60 },
        },
        {
          ...context.nodes[1],
          id: "ts-b",
          label: "TS-B",
          position: { x: 80, y: 80 },
        },
        {
          ...context.nodes[0],
          id: "product",
          label: "Product",
          kind: "product",
          position: { x: 280, y: 20 },
        },
      ],
      edges: [
        { id: "edge-a", sourceId: "node-a", targetId: "ts-a", label: "branch a" },
        { id: "edge-b", sourceId: "node-a", targetId: "ts-b", label: "branch b" },
        { id: "edge-a-product", sourceId: "ts-a", targetId: "product", label: "finish a" },
        { id: "edge-b-product", sourceId: "ts-b", targetId: "product", label: "finish b" },
      ],
      rows: [
        context.rows[0],
        { ...context.rows[1], nodeId: "ts-a", label: "TS-A", relative: 4.9 },
        { ...context.rows[1], nodeId: "ts-b", label: "TS-B", relative: 1.5 },
        { ...context.rows[0], nodeId: "product", label: "Product", kind: "product", relative: -10 },
      ],
    }
    const cdxml = buildCdxmlReport(branchContext)
    const tsA = cdxmlTextPosition(cdxml, "TS-A")
    const tsB = cdxmlTextPosition(cdxml, "TS-B")

    expect(tsA).toBeTruthy()
    expect(tsB).toBeTruthy()
    expect(Math.abs((tsA?.x ?? 0) - (tsB?.x ?? 0))).toBeLessThan(0.1)
    expect(Math.abs((tsA?.y ?? 0) - (tsB?.y ?? 0))).toBeGreaterThan(8)
    expect(() => preflightChemDrawCdxml(cdxml)).not.toThrow()
  })

  it("fails CDXML export before writing when an embedded structure fragment is malformed", () => {
    const badStructureContext: ReportExportContext = {
      ...context,
      nodes: context.nodes.map((node) => (
        node.id === "node-a"
          ? { ...node, manualStructureCdxml: "<CDXML><page><fragment id=\"broken\"></page></CDXML>" }
          : node
      )),
    }

    expect(() => buildCdxmlReport(badStructureContext)).toThrow(/structure fragment is not well-formed/)
  })

  it("preflights duplicate ids and missing bond endpoints", () => {
    const duplicateIds = `<CDXML LabelFont="148" CaptionFont="683" color="0" bgcolor="1">
      <colortable><color r="1" g="1" b="1"/><color r="0" g="0" b="0"/></colortable>
      <fonttable><font id="148" name="Arial"/><font id="683" name="Times New Roman"/></fonttable>
      <page id="1"><fragment id="2"><n id="3" p="0 0"/><n id="3" p="10 0"/><b id="4" B="3" E="3"/></fragment></page>
    </CDXML>`
    const missingEndpoint = `<CDXML LabelFont="148" CaptionFont="683" color="0" bgcolor="1">
      <colortable><color r="1" g="1" b="1"/><color r="0" g="0" b="0"/></colortable>
      <fonttable><font id="148" name="Arial"/><font id="683" name="Times New Roman"/></fonttable>
      <page id="1"><fragment id="2"><n id="3" p="0 0"/><b id="4" B="3" E="404"/></fragment></page>
    </CDXML>`

    expect(() => preflightChemDrawCdxml(duplicateIds)).toThrow(/duplicate id 3/)
    expect(() => preflightChemDrawCdxml(missingEndpoint)).toThrow(/missing end node 404/)
  })

  it("builds a minimal valid XLSX zip package", () => {
    const workbook = buildXlsxWorkbook(context)
    const decoded = new TextDecoder().decode(workbook)

    expect(Array.from(workbook.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(decoded).toContain("xl/workbook.xml")
    expect(decoded).toContain("Energy Table Relative")
    expect(decoded).toContain("Energy Table Absolute")
    expect(decoded).toContain("Import Files")
    expect(decoded).toContain("Export Metadata")
    expect(decoded).toContain("ΔEgas(Eh)")
    expect(decoded).toContain("Charge / Mult.")
    expect(decoded).toContain("Basisgas")
    expect(decoded).toContain("ΔEgas")
    expect(decoded).not.toContain("Formula")
    expect(decoded).not.toContain("*627.5095")
    expect(decoded).toContain("Reactant &lt;A&gt;")
    expect(decoded).toContain("rxnflow-renderer-xlsx-v1")
  })

  it("builds report SVG and PNG artifacts", async () => {
    const svg = buildReportSvg(context)
    const png = await createReportArtifact("png", context)

    expect(svg).toContain("<svg")
    expect(svg).toContain("Reaction path report")
    expect(svg).toContain("relative energy diagram")
    expect(png.fileName).toBe("main-route.png")
    expect(png.mimeType).toBe("image/png")
    expect(png.data).toBeInstanceOf(Uint8Array)
    expect(Array.from((png.data as Uint8Array).slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  })
})

function parseCdxml(cdxml: string): XMLDocument {
  return new DOMParser().parseFromString(cdxml, "application/xml")
}

function allCdxmlIdsAreUnique(cdxml: string): boolean {
  const document = parseCdxml(cdxml)
  const seen = new Set<string>()
  for (const element of Array.from(document.querySelectorAll("[id]"))) {
    const id = element.getAttribute("id")
    if (!id) continue
    if (seen.has(id)) return false
    seen.add(id)
  }
  return true
}

function allCdxmlBondRefsExist(cdxml: string): boolean {
  const document = parseCdxml(cdxml)
  const ids = new Set(Array.from(document.querySelectorAll("[id]")).map((element) => element.getAttribute("id")).filter(Boolean))
  return Array.from(document.getElementsByTagName("b")).every((bond) => (
    ids.has(bond.getAttribute("B"))
    && ids.has(bond.getAttribute("E"))
  ))
}

function boldBondLengths(cdxml: string): number[] {
  const document = parseCdxml(cdxml)
  const nodeById = new Map(
    Array.from(document.getElementsByTagName("n"))
      .map((node) => [node.getAttribute("id"), node.getAttribute("p")] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])),
  )
  return Array.from(document.getElementsByTagName("b"))
    .filter((bond) => bond.getAttribute("Display") === "Bold")
    .map((bond) => {
      const beginId = bond.getAttribute("B")
      const endId = bond.getAttribute("E")
      const begin = beginId ? nodeById.get(beginId) : undefined
      const end = endId ? nodeById.get(endId) : undefined
      if (!begin || !end) return Number.POSITIVE_INFINITY
      const [x1, y1] = begin.split(/\s+/).map(Number)
      const [x2, y2] = end.split(/\s+/).map(Number)
      return Math.hypot(x2 - x1, y2 - y1)
    })
}

function cdxmlTextPosition(cdxml: string, value: string): { x: number; y: number } | null {
  const document = parseCdxml(cdxml)
  const text = Array.from(document.getElementsByTagName("t")).find((item) => item.textContent === value)
  const point = text?.getAttribute("p")
  if (!point) return null
  const [x, y] = point.split(/\s+/).map(Number)
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

function cdxmlArrows(cdxml: string): Array<{ center: { x: number; y: number }; tail: { x: number; y: number }; head: { x: number; y: number } }> {
  const document = parseCdxml(cdxml)
  return Array.from(document.getElementsByTagName("arrow")).flatMap((arrow) => {
    const center = cdxmlPoint3D(arrow.getAttribute("Center3D"))
    const tail = cdxmlPoint3D(arrow.getAttribute("Tail3D"))
    const head = cdxmlPoint3D(arrow.getAttribute("Head3D"))
    return center && tail && head ? [{ center, tail, head }] : []
  })
}

function dashedBondSegments(cdxml: string): Array<{ start: { x: number; y: number }; end: { x: number; y: number } }> {
  const document = parseCdxml(cdxml)
  const nodeById = new Map(
    Array.from(document.getElementsByTagName("n"))
      .map((node) => [node.getAttribute("id"), node.getAttribute("p")] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])),
  )
  return Array.from(document.getElementsByTagName("b"))
    .filter((bond) => bond.getAttribute("Display") === "Dash")
    .flatMap((bond) => {
      const beginId = bond.getAttribute("B")
      const endId = bond.getAttribute("E")
      const begin = beginId ? nodeById.get(beginId) : undefined
      const end = endId ? nodeById.get(endId) : undefined
      if (!begin || !end) return []
      const [x1, y1] = begin.split(/\s+/).map(Number)
      const [x2, y2] = end.split(/\s+/).map(Number)
      if (![x1, y1, x2, y2].every(Number.isFinite)) return []
      return [{ start: { x: x1, y: y1 }, end: { x: x2, y: y2 } }]
    })
}

function cdxmlPoint3D(value: string | null): { x: number; y: number } | null {
  if (!value) return null
  const [x, y] = value.split(/\s+/).map(Number)
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

function nearestArrow(
  point: { x: number; y: number } | null,
  arrows: Array<{ center: { x: number; y: number }; tail: { x: number; y: number }; head: { x: number; y: number } }>,
): { center: { x: number; y: number }; tail: { x: number; y: number }; head: { x: number; y: number } } {
  if (!point || arrows.length === 0) throw new Error("Missing arrow geometry")
  return arrows.reduce((nearest, arrow) => (
    Math.hypot(arrow.center.x - point.x, arrow.center.y - point.y) < Math.hypot(nearest.center.x - point.x, nearest.center.y - point.y)
      ? arrow
      : nearest
  ))
}

function distance(left: { x: number; y: number } | null, right: { x: number; y: number }): number {
  if (!left) return Number.POSITIVE_INFINITY
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function distancePointToSegment(
  point: { x: number; y: number },
  segment: { start: { x: number; y: number }; end: { x: number; y: number } },
): number {
  const dx = segment.end.x - segment.start.x
  const dy = segment.end.y - segment.start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - segment.start.x, point.y - segment.start.y)
  const amount = Math.max(0, Math.min(1, ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (segment.start.x + amount * dx), point.y - (segment.start.y + amount * dy))
}
