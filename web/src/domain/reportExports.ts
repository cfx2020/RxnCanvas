import {
  energyTableCellText,
  energyTableColumnSpecs,
  energyTablePlainHeaders,
  sortedEnergyTableRows,
  visibleEnergyTableRows,
  type EnergyTableRow,
  type EnergyTableMode,
} from "../app/energyDisplay"
import { composeChemDrawEnergyDiagramCdxml, type ChemDrawCdxmlSideSpecies } from "./chemdrawCdxmlComposer"
import type { EdgeStepRole, NodeKind, NodePathRole } from "./projectPackages"
import type { ParsedEnergyTableData, ParsedEnergyUnit } from "./sourceParsers"

export type ReportExportFormat = "png" | "cdxml" | "xlsx"

export type ReportExportOptions = {
  formats: ReportExportFormat[]
  basename: string
  title: string
}

export type ReportExportNode = {
  id: string
  label: string
  formula: string
  kind: NodeKind
  pathRole?: NodePathRole
  coefficient?: number
  method: string
  solvent: string
  energyGas: number | null
  energySolution: number | null
  energyUnit: ParsedEnergyUnit
  manualStructureCdxml?: string
  position: { x: number; y: number }
}

export type ReportExportEdge = {
  id: string
  sourceId: string
  targetId: string
  label: string
  stepRole?: EdgeStepRole
}

export type ReportExportFile = {
  id: string
  name: string
  kind: string
  size: number
  status: string
}

export type ReportExportEnergyRow = {
  nodeId: string
  label: string
  kind: NodeKind
  formula: string
  charge?: number | null
  spinMultiplicity?: number | null
  gas: number | null
  solution: number | null
  energyUnit: ParsedEnergyUnit
  energyTable?: ParsedEnergyTableData | null
  relativeEnergyTable?: ParsedEnergyTableData | null
  relative: number | null
  showInRelativeTable?: boolean
}

export type ReportExportContext = {
  projectLabel: string
  basename: string
  title: string
  nodes: ReportExportNode[]
  edges: ReportExportEdge[]
  files: ReportExportFile[]
  rows: ReportExportEnergyRow[]
}

export type ReportExportArtifact = {
  id: string
  format: ReportExportFormat
  fileName: string
  mimeType: string
  byteLength: number
  data: string | Uint8Array
}

type ReportExportCapability = {
  format: ReportExportFormat
  extension: string
  mimeType: string
  label: string
}

const imageWidth = 960
const imageHeight = 620
const encoder = new TextEncoder()

export const defaultReportExportOptions: ReportExportOptions = {
  formats: ["png", "cdxml", "xlsx"],
  basename: "rxnflow-report",
  title: "Reaction path report",
}

export const reportExportCapabilities: readonly ReportExportCapability[] = [
  { format: "png", extension: "png", mimeType: "image/png", label: "PNG" },
  { format: "cdxml", extension: "cdxml", mimeType: "chemical/x-cdxml", label: "CDXML" },
  {
    format: "xlsx",
    extension: "xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "XLSX",
  },
]

export function reportExportFormats(): ReportExportFormat[] {
  return reportExportCapabilities.map((capability) => capability.format)
}

export function reportExportCapability(format: ReportExportFormat): ReportExportCapability {
  return reportExportCapabilities.find((capability) => capability.format === format) ?? reportExportCapabilities[0]
}

export async function createReportArtifact(
  format: ReportExportFormat,
  context: ReportExportContext,
): Promise<ReportExportArtifact> {
  const capability = reportExportCapability(format)
  const fileName = `${safeBasename(context.basename || context.projectLabel)}.${capability.extension}`
  if (format === "cdxml") {
    const data = buildCdxmlReport(context)
    return {
      id: `${format}-${Date.now()}`,
      format,
      fileName,
      mimeType: capability.mimeType,
      byteLength: encoder.encode(data).byteLength,
      data,
    }
  }
  if (format === "xlsx") {
    const data = buildXlsxWorkbook(context)
    return {
      id: `${format}-${Date.now()}`,
      format,
      fileName,
      mimeType: capability.mimeType,
      byteLength: data.byteLength,
      data,
    }
  }

  const data = await buildPngReport(context)
  return {
    id: `${format}-${Date.now()}`,
    format,
    fileName,
    mimeType: capability.mimeType,
    byteLength: data.byteLength,
    data,
  }
}

export function buildReportSvg(context: ReportExportContext): string {
  const diagram = buildEnergyDiagramModel(context)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${diagram.width}" height="${diagram.height}" viewBox="0 0 ${diagram.width} ${diagram.height}">
  <defs>
    <filter id="soft-shadow" x="-20%" y="-40%" width="140%" height="180%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#243447" flood-opacity="0.10"/>
    </filter>
  </defs>
  <rect width="${diagram.width}" height="${diagram.height}" rx="0" fill="#ffffff"/>
  <rect x="30" y="26" width="${diagram.width - 60}" height="${diagram.height - 54}" rx="8" fill="#fbfcfd" stroke="#dfe7ee"/>
  <text x="54" y="64" fill="#172333" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800">${xmlEscape(context.title || context.projectLabel)}</text>
  <text x="55" y="88" fill="#627386" font-family="Inter, Arial, sans-serif" font-size="13">${xmlEscape(context.projectLabel)} / relative energy diagram / kcal/mol</text>
  <line x1="${diagram.plot.left}" y1="${diagram.plot.bottom}" x2="${diagram.plot.right}" y2="${diagram.plot.bottom}" stroke="#d8e0e8" stroke-width="1"/>
  <g stroke-linecap="round" stroke-linejoin="round">
    ${diagram.links.map((link) => svgEnergyConnector(link)).join("\n    ")}
  </g>
  <g>
    ${diagram.levels.map((level) => svgEnergyLevel(level)).join("\n    ")}
  </g>
</svg>`
}

export function buildCdxmlReport(context: ReportExportContext): string {
  const diagram = buildEnergyDiagramModel(context, { minWidth: 1120, height: 720, xStep: 170, sideMargin: 98, branchLaneOffset: 0 })
  const cdxmlLevels = diagram.levels.map((level, index) => ({
    ...level,
    structureY: cdxmlStructureY(level, index, diagram),
  }))
  const sideSpecies = cdxmlSideSpecies(context, diagram, cdxmlLevels)
  return composeChemDrawEnergyDiagramCdxml({
    title: context.title || context.projectLabel,
    subtitle: "Relative energy diagram (kcal/mol)",
    width: diagram.width,
    height: diagram.height,
    plot: diagram.plot,
    yMin: diagram.yMin,
    yMax: diagram.yMax,
    levels: cdxmlLevels.map((level) => ({
      nodeId: level.nodeId,
      label: level.label,
      kind: level.kind,
      relative: level.relative,
      x: level.x,
      y: level.y,
      structureY: level.structureY,
      lineWidth: level.lineWidth,
      structureCdxml: level.node?.manualStructureCdxml,
    })),
    links: diagram.links.map((link) => ({
      source: {
        x: link.source.x,
        y: link.source.y,
        lineWidth: link.source.lineWidth,
      },
      target: {
        x: link.target.x,
        y: link.target.y,
        lineWidth: link.target.lineWidth,
      },
      role: link.role,
    })),
    sideSpecies,
  })
}

type EnergyDiagramLevel = {
  nodeId: string
  label: string
  kind: NodeKind
  node?: ReportExportNode
  relative: number | null
  x: number
  y: number
  structureY: number
  depth: number
  lane: number
  columnSize: number
  lineWidth: number
}

function cdxmlStructureY(level: EnergyDiagramLevel, index: number, diagram: EnergyDiagramModel): number {
  const stagger = level.columnSize > 1 ? level.lane * 112 : (index % 2 === 0 ? 0 : 46)
  return clamp(level.y + 76 + stagger, diagram.plot.top + 74, diagram.height - 132)
}

function cdxmlSideSpecies(
  context: ReportExportContext,
  diagram: EnergyDiagramModel,
  cdxmlLevels: EnergyDiagramLevel[],
): ChemDrawCdxmlSideSpecies[] {
  const nodeById = new Map(context.nodes.map((node) => [node.id, node]))
  const participantIds = new Set(context.nodes.filter((node) => node.pathRole === "participant").map((node) => node.id))
  const levelByNodeId = new Map(cdxmlLevels.map((level) => [level.nodeId, level]))
  const laneByPathId = new Map<string, number>()
  const sideSpecies: ChemDrawCdxmlSideSpecies[] = []
  context.edges.forEach((edge) => {
    if (edge.stepRole !== "addition" && edge.stepRole !== "release") return
    const participantId = participantIds.has(edge.sourceId)
      ? edge.sourceId
      : participantIds.has(edge.targetId)
        ? edge.targetId
        : null
    if (!participantId) return
    const pathId = edge.sourceId === participantId ? edge.targetId : edge.sourceId
    const participant = nodeById.get(participantId)
    const anchor = levelByNodeId.get(pathId)
    if (!participant || !anchor) return
    const arrowAnchor = cdxmlSideSpeciesArrowAnchor(edge.stepRole, pathId, diagram)
    const lane = laneByPathId.get(pathId) ?? 0
    laneByPathId.set(pathId, lane + 1)
    sideSpecies.push({
      role: edge.stepRole,
      label: participant.label || participant.formula || "species",
      structureCdxml: participant.manualStructureCdxml,
      anchor: {
        x: anchor.x,
        y: anchor.y,
        structureY: anchor.structureY,
        lineWidth: anchor.lineWidth,
      },
      arrowAnchor,
      lane,
    })
  })
  return sideSpecies
}

function cdxmlSideSpeciesArrowAnchor(
  role: "addition" | "release",
  pathId: string,
  diagram: EnergyDiagramModel,
): { x: number; y: number; tangentX?: number; tangentY?: number } | undefined {
  const link = role === "addition"
    ? diagram.links.find((item) => item.target.nodeId === pathId)
    : diagram.links.find((item) => item.source.nodeId === pathId)
  if (!link) {
    const level = diagram.levels.find((item) => item.nodeId === pathId)
    if (!level) return undefined
    const direction = role === "addition" ? -1 : 1
    return { x: level.x + direction * 26, y: level.y, tangentX: 1, tangentY: 0 }
  }
  const source = {
    x: link.source.x + Math.min(Math.max(link.source.lineWidth * 0.34, 18), 24) / 2,
    y: link.source.y,
  }
  const target = {
    x: link.target.x - Math.min(Math.max(link.target.lineWidth * 0.34, 18), 24) / 2,
    y: link.target.y,
  }
  return role === "addition"
    ? { ...interpolatePoint(target, source, 0.16), tangentX: target.x - source.x, tangentY: target.y - source.y }
    : { ...interpolatePoint(source, target, 0.16), tangentX: target.x - source.x, tangentY: target.y - source.y }
}

function interpolatePoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  amount: number,
): { x: number; y: number } {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  }
}

type EnergyDiagramLink = {
  source: EnergyDiagramLevel
  target: EnergyDiagramLevel
  role: EdgeStepRole | "sequential"
}

type EnergyDiagramModel = {
  width: number
  height: number
  plot: {
    left: number
    right: number
    top: number
    bottom: number
  }
  structureBand: {
    y: number
    height: number
  }
  yMin: number
  yMax: number
  levels: EnergyDiagramLevel[]
  links: EnergyDiagramLink[]
}

function buildEnergyDiagramModel(
  context: ReportExportContext,
  options: { minWidth?: number; height?: number; xStep?: number; sideMargin?: number; branchLaneOffset?: number } = {},
): EnergyDiagramModel {
  const rows = visibleEnergyTableRows(sortedReportRows(context), "relative")
  const levelsSource = rows.length > 0 ? rows : sortedReportRows(context)
  const layout = graphDepthLayout(context, levelsSource)
  const xStep = options.xStep ?? 118
  const widestColumn = Math.max(...Array.from(layout.columnSizeByDepth.values()), 1)
  const sideMargin = options.sideMargin ?? 86
  const width = Math.max(
    options.minWidth ?? imageWidth,
    (layout.maxDepth + 1) * xStep + sideMargin * 2 + Math.max(0, widestColumn - 1) * 42,
  )
  const height = options.height ?? imageHeight
  const plot = { left: sideMargin, right: width - sideMargin, top: 126, bottom: height - 252 }
  const structureBand = { y: plot.bottom + 64, height: 118 }
  const finiteValues = levelsSource
    .map((row) => row.relative)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  const minValue = finiteValues.length > 0 ? Math.min(...finiteValues) : 0
  const maxValue = finiteValues.length > 0 ? Math.max(...finiteValues) : 0
  const padding = Math.max((maxValue - minValue) * 0.12, 3)
  const yMin = minValue - padding
  const yMax = maxValue + padding
  const ySpan = Math.max(yMax - yMin, 1)
  const nodeById = new Map(context.nodes.map((node) => [node.id, node]))
  const levels: EnergyDiagramLevel[] = levelsSource.map((row) => {
    const depth = layout.depthByNodeId.get(row.nodeId) ?? 0
    const lane = layout.laneByNodeId.get(row.nodeId) ?? 0
    const columnSize = layout.columnSizeByDepth.get(depth) ?? 1
    const baseX = layout.maxDepth === 0
      ? width / 2
      : plot.left + depth * ((plot.right - plot.left) / Math.max(layout.maxDepth, 1))
    const branchLaneOffset = options.branchLaneOffset ?? Math.min(46, xStep / Math.max(columnSize, 2))
    const laneOffset = columnSize > 1 ? (lane - (columnSize - 1) / 2) * branchLaneOffset : 0
    const x = baseX + laneOffset
    const relative = typeof row.relative === "number" && Number.isFinite(row.relative) ? row.relative : null
    const y = relative == null
      ? plot.top + (plot.bottom - plot.top) / 2
      : plot.bottom - ((relative - yMin) / ySpan) * (plot.bottom - plot.top)
    return {
      nodeId: row.nodeId,
      label: row.label,
      kind: row.kind,
      node: nodeById.get(row.nodeId),
      relative,
      x,
      y,
      structureY: structureBand.y + (lane % 2) * 72,
      depth,
      lane,
      columnSize,
      lineWidth: 66,
    }
  })
  const levelByNodeId = new Map(levels.map((level) => [level.nodeId, level]))
  const graphLinks = context.edges.flatMap((edge): EnergyDiagramLink[] => {
    if (edge.stepRole === "addition" || edge.stepRole === "release") return []
    const source = levelByNodeId.get(edge.sourceId)
    const target = levelByNodeId.get(edge.targetId)
    if (!source || !target) return []
    return [{ source, target, role: edge.stepRole ?? "path" }]
  })
  const links = graphLinks.length > 0
    ? graphLinks
    : levels.slice(0, -1).map((source, index) => ({ source, target: levels[index + 1], role: "sequential" as const }))
  return { width, height, plot, structureBand, yMin, yMax, levels, links }
}

type DiagramGraphLayout = {
  depthByNodeId: Map<string, number>
  laneByNodeId: Map<string, number>
  columnSizeByDepth: Map<number, number>
  maxDepth: number
}

function graphDepthLayout(context: ReportExportContext, rows: EnergyTableRow[]): DiagramGraphLayout {
  const rowIds = new Set(rows.map((row) => row.nodeId))
  const sortedIds = rows.map((row) => row.nodeId)
  const sortedIndex = new Map(sortedIds.map((nodeId, index) => [nodeId, index]))
  const pathEdges = context.edges.filter((edge) => (
    edge.stepRole !== "addition"
    && edge.stepRole !== "release"
    && rowIds.has(edge.sourceId)
    && rowIds.has(edge.targetId)
  ))

  const depthByNodeId = new Map<string, number>()
  if (pathEdges.length === 0) {
    sortedIds.forEach((nodeId, index) => depthByNodeId.set(nodeId, index))
  } else {
    sortedIds.forEach((nodeId) => depthByNodeId.set(nodeId, 0))
    const orderedEdges = [...pathEdges].sort((left, right) => (
      (sortedIndex.get(left.sourceId) ?? 0) - (sortedIndex.get(right.sourceId) ?? 0)
      || (sortedIndex.get(left.targetId) ?? 0) - (sortedIndex.get(right.targetId) ?? 0)
    ))
    for (let pass = 0; pass < sortedIds.length; pass += 1) {
      let changed = false
      for (const edge of orderedEdges) {
        const sourceDepth = depthByNodeId.get(edge.sourceId) ?? 0
        const targetDepth = depthByNodeId.get(edge.targetId) ?? 0
        if (targetDepth <= sourceDepth) {
          depthByNodeId.set(edge.targetId, sourceDepth + 1)
          changed = true
        }
      }
      if (!changed) break
    }
  }

  const columns = new Map<number, string[]>()
  sortedIds.forEach((nodeId) => {
    const depth = depthByNodeId.get(nodeId) ?? 0
    columns.set(depth, [...(columns.get(depth) ?? []), nodeId])
  })
  const laneByNodeId = new Map<string, number>()
  const columnSizeByDepth = new Map<number, number>()
  for (const [depth, nodeIds] of columns.entries()) {
    nodeIds.sort((left, right) => (sortedIndex.get(left) ?? 0) - (sortedIndex.get(right) ?? 0))
    columnSizeByDepth.set(depth, nodeIds.length)
    nodeIds.forEach((nodeId, index) => laneByNodeId.set(nodeId, index))
  }

  return {
    depthByNodeId,
    laneByNodeId,
    columnSizeByDepth,
    maxDepth: Math.max(...Array.from(depthByNodeId.values()), 0),
  }
}

function sortedReportRows(context: ReportExportContext): EnergyTableRow[] {
  return sortedEnergyTableRows(context.rows.map(reportRowToEnergyTableRow), context.nodes, context.edges)
}

function reportRowToEnergyTableRow(row: ReportExportEnergyRow): EnergyTableRow {
  return {
    nodeId: row.nodeId,
    label: row.label,
    kind: row.kind,
    formula: row.formula,
    charge: row.charge ?? null,
    spinMultiplicity: row.spinMultiplicity ?? null,
    gas: row.gas,
    solution: row.solution,
    energyUnit: row.energyUnit,
    energyTable: row.energyTable ?? null,
    relativeEnergyTable: row.relativeEnergyTable ?? null,
    relative: row.relative,
    relativeRole: "path-point",
    showInRelativeTable: row.showInRelativeTable ?? true,
    expressionTerms: [],
    relativeExpressionTerms: [],
  }
}

function svgEnergyConnector(link: EnergyDiagramLink): string {
  const sourceX = link.source.x + link.source.lineWidth / 2
  const targetX = link.target.x - link.target.lineWidth / 2
  const stroke = link.role === "addition" ? "#2b9f78" : link.role === "release" ? "#c4821f" : "#718ba3"
  const dash = link.role === "addition" || link.role === "release" ? ` stroke-dasharray="7 6"` : ""
  const dx = targetX - sourceX
  const curve = Math.max(18, Math.abs(dx) * 0.42)
  const path = dx >= 0
    ? `M ${round(sourceX)} ${round(link.source.y)} C ${round(sourceX + curve)} ${round(link.source.y)}, ${round(targetX - curve)} ${round(link.target.y)}, ${round(targetX)} ${round(link.target.y)}`
    : `M ${round(sourceX)} ${round(link.source.y)} C ${round(sourceX + 36)} ${round(link.source.y)}, ${round(targetX - 36)} ${round(link.target.y)}, ${round(targetX)} ${round(link.target.y)}`
  return `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="2.2"${dash}/>`
}

function svgEnergyLevel(level: EnergyDiagramLevel): string {
  const color = level.kind === "transition" ? "#dc4033" : level.kind === "product" ? "#188b64" : "#147b68"
  const x1 = level.x - level.lineWidth / 2
  const x2 = level.x + level.lineWidth / 2
  return `<g>
      <line x1="${round(x1)}" y1="${round(level.y)}" x2="${round(x2)}" y2="${round(level.y)}" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
      <text x="${round(level.x)}" y="${round(level.y - 16)}" fill="#172333" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="800" text-anchor="middle">${xmlEscape(formatMaybeRelative(level.relative))}</text>
      <text x="${round(level.x)}" y="${round(level.y + 30)}" fill="#26384c" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" text-anchor="middle">${xmlEscape(shortText(level.label, 20))}</text>
    </g>`
}

type XlsxFormulaCell = {
  formula: string
  value?: number | string | null
}

type XlsxCell = string | number | null | undefined | XlsxFormulaCell

function formulaCell(formula: string, value?: number | string | null): XlsxFormulaCell {
  return { formula, value }
}

function buildEnergyWorksheetRows(context: ReportExportContext, mode: EnergyTableMode): XlsxCell[][] {
  const rows = visibleEnergyTableRows(sortedReportRows(context), mode)
  return [
    energyTablePlainHeaders(mode),
    ...rows.map((row) => energyTableColumnSpecs.map((column) => energyTableCellText(row, column, mode))),
  ]
}

export function buildXlsxWorkbook(context: ReportExportContext): Uint8Array {
  const relativeEnergyRows = buildEnergyWorksheetRows(context, "relative")
  const absoluteEnergyRows = buildEnergyWorksheetRows(context, "absolute")
  const sheets = [
    {
      name: "Energy Table Relative",
      path: "xl/worksheets/sheet1.xml",
      rows: relativeEnergyRows,
      columnWidths: [22, 14, 16, 18, 12, 16, 18, 17, 21, 16, 18, 12, 18],
    },
    {
      name: "Energy Table Absolute",
      path: "xl/worksheets/sheet2.xml",
      rows: absoluteEnergyRows,
      columnWidths: [22, 14, 16, 18, 12, 16, 18, 17, 21, 16, 18, 12, 18],
    },
    {
      name: "Import Files",
      path: "xl/worksheets/sheet3.xml",
      rows: [
        ["Name", "Kind", "Size bytes", "Status"],
        ...context.files.map((file) => [file.name, file.kind, file.size, file.status]),
      ],
    },
    {
      name: "Export Metadata",
      path: "xl/worksheets/sheet4.xml",
      rows: [
        ["Key", "Value"],
        ["project", context.projectLabel],
        ["title", context.title],
        ["nodes", context.nodes.length],
        ["edges", context.edges.length],
        ["source_files", context.files.length],
        ["writer", "rxnflow-renderer-xlsx-v1"],
      ],
    },
  ]

  const files: Record<string, string | Uint8Array> = {
    "[Content_Types].xml": contentTypesXml(sheets.length),
    "_rels/.rels": packageRelationshipsXml(),
    "docProps/app.xml": appPropertiesXml(),
    "docProps/core.xml": corePropertiesXml(context),
    "xl/workbook.xml": workbookXml(sheets.map((sheet) => sheet.name)),
    "xl/_rels/workbook.xml.rels": workbookRelationshipsXml(sheets),
  }
  sheets.forEach((sheet) => {
    files[sheet.path] = worksheetXml(sheet.rows, sheet.columnWidths)
  })
  return buildZip(files)
}

async function buildPngReport(context: ReportExportContext): Promise<Uint8Array> {
  const diagram = buildEnergyDiagramModel(context)
  const svg = buildReportSvg(context)
  const rasterized = await rasterizeSvgToPng(svg, diagram.width, diagram.height)
  return rasterized ?? buildFallbackPng(context)
}

async function rasterizeSvgToPng(svg: string, width: number, height: number): Promise<Uint8Array | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return null
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context || typeof canvas.toBlob !== "function") return null

  canvas.width = width
  canvas.height = height
  const image = new Image()
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  const loaded = new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
  })
  image.src = source
  if (!await loaded) return null
  context.drawImage(image, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null
}

function layoutNodes(
  nodes: ReportExportNode[],
  width: number,
  height: number,
  frame = { x: 54, y: 124, width: 430, height: 360 },
): Map<string, { x: number; y: number }> {
  const layout = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) return layout
  const minX = Math.min(...nodes.map((node) => node.position.x))
  const maxX = Math.max(...nodes.map((node) => node.position.x))
  const minY = Math.min(...nodes.map((node) => node.position.y))
  const maxY = Math.max(...nodes.map((node) => node.position.y))
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  const scale = Math.min(frame.width / spanX, frame.height / spanY, 1)
  nodes.forEach((node, index) => {
    const x = frame.x + (node.position.x - minX) * scale + (spanX === 1 ? (index % 3) * 120 : 0)
    const y = frame.y + (node.position.y - minY) * scale + (spanY === 1 ? Math.floor(index / 3) * 92 : 0)
    layout.set(node.id, {
      x: clamp(x, 42, width - 172),
      y: clamp(y, 96, height - 140),
    })
  })
  return layout
}

function layoutEnergyProfile(
  nodes: ReportExportNode[],
  rows: ReportExportEnergyRow[],
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const layout = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) return layout
  const rowByNodeId = new Map(rows.map((row) => [row.nodeId, row]))
  const ordered = [...nodes].sort((a, b) => (a.position.x - b.position.x) || (a.position.y - b.position.y))
  const values = ordered.map((node) => {
    const relative = rowByNodeId.get(node.id)?.relative
    if (typeof relative === "number" && Number.isFinite(relative)) return relative
    const fallback = node.energySolution ?? node.energyGas
    return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : 0
  })
  const min = Math.min(...values) - 2
  const max = Math.max(...values) + 2
  const spread = Math.max(max - min, 1)
  const left = 82
  const right = width - 82
  const top = 136
  const bottom = height - 128
  ordered.forEach((node, index) => {
    const x = ordered.length === 1 ? width / 2 : left + index * ((right - left) / (ordered.length - 1))
    const y = bottom - ((values[index] - min) / spread) * (bottom - top)
    layout.set(node.id, { x, y })
  })
  return layout
}

function svgNode(
  node: ReportExportNode,
  point: { x: number; y: number } | undefined,
  row: ReportExportEnergyRow | undefined,
): string {
  if (!point) return ""
  const accent = node.kind === "transition" ? "#f46f61" : node.kind === "product" ? "#4fbf87" : "#1fa283"
  return `<g transform="translate(${round(point.x)} ${round(point.y)})">
      <rect x="0" y="0" width="154" height="92" rx="18" fill="#ffffff" opacity="0.78" stroke="#d6e2e8" filter="url(#card-shadow)"/>
      <circle cx="22" cy="28" r="8" fill="${accent}"/>
      <text x="40" y="25" fill="#213348" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="800">${xmlEscape(shortText(node.label, 18))}</text>
      <text x="40" y="45" fill="#718496" font-family="Inter, Arial, sans-serif" font-size="11">${xmlEscape(node.formula)}</text>
      <text x="18" y="72" fill="#26384c" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700">${xmlEscape(formatMaybeRelative(row?.relative))}</text>
    </g>`
}

function svgEdge(edge: ReportExportEdge, layout: Map<string, { x: number; y: number }>): string {
  const source = layout.get(edge.sourceId)
  const target = layout.get(edge.targetId)
  if (!source || !target) return ""
  const start = { x: source.x + 154, y: source.y + 46 }
  const end = { x: target.x, y: target.y + 46 }
  const bend = Math.max(56, Math.abs(end.x - start.x) * 0.38)
  const path = `M ${round(start.x)} ${round(start.y)} C ${round(start.x + bend)} ${round(start.y)}, ${round(end.x - bend)} ${round(end.y)}, ${round(end.x)} ${round(end.y)}`
  return `<path d="${path}" fill="none" stroke="#86a0b4" stroke-width="3" opacity="0.72"/>`
}

function buildEnergySummaryPath(
  rows: ReportExportEnergyRow[],
  x: number,
  y: number,
  width: number,
  height: number,
): { path: string; points: { x: number; y: number }[] } {
  if (rows.length === 0) return { path: `M ${x} ${y + height / 2} L ${x + width} ${y + height / 2}`, points: [] }
  const values = rows.map((row) => row.relative as number)
  const min = Math.min(...values) - 2
  const max = Math.max(...values) + 2
  const spread = Math.max(max - min, 1)
  const points = rows.map((row, index) => ({
    x: x + index * (width / Math.max(rows.length - 1, 1)),
    y: y + height - (((row.relative as number) - min) / spread) * height,
  }))
  return {
    path: points.map((point, index) => `${index === 0 ? "M" : "L"} ${round(point.x)} ${round(point.y)}`).join(" "),
    points,
  }
}

function buildFallbackPng(context: ReportExportContext): Uint8Array {
  const pixels = new Uint8Array(imageWidth * imageHeight * 4)
  fillRect(pixels, imageWidth, 0, 0, imageWidth, imageHeight, [244, 249, 250, 255])
  fillRect(pixels, imageWidth, 0, 0, imageWidth, 112, [232, 247, 244, 255])
  const layout = layoutNodes(context.nodes, imageWidth, imageHeight)
  context.edges.forEach((edge) => {
    const source = layout.get(edge.sourceId)
    const target = layout.get(edge.targetId)
    if (source && target) drawLine(pixels, imageWidth, source.x + 77, source.y + 46, target.x + 77, target.y + 46, [134, 160, 180, 255])
  })
  context.nodes.forEach((node) => {
    const point = layout.get(node.id)
    if (!point) return
    const color: [number, number, number, number] = node.kind === "transition" ? [244, 111, 97, 255] : [79, 191, 135, 255]
    fillRect(pixels, imageWidth, point.x, point.y, 154, 92, [255, 255, 255, 235])
    fillRect(pixels, imageWidth, point.x + 18, point.y + 22, 18, 18, color)
    fillRect(pixels, imageWidth, point.x + 42, point.y + 24, 86, 10, [38, 55, 74, 255])
    fillRect(pixels, imageWidth, point.x + 18, point.y + 64, 112, 9, [91, 132, 168, 255])
  })
  return encodePng(imageWidth, imageHeight, pixels)
}

function worksheetXml(rows: XlsxCell[][], columnWidths: number[] = []): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${columnWidths.length > 0 ? `<cols>${columnWidths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>` : ""}
  <sheetData>
    ${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => worksheetCell(cell, rowIndex + 1, columnIndex + 1)).join("")}</row>`).join("\n    ")}
  </sheetData>
</worksheet>`
}

function worksheetCell(value: XlsxCell, row: number, column: number): string {
  const ref = `${columnName(column)}${row}`
  if (isFormulaCell(value)) {
    const cached = value.value
    const cachedXml = typeof cached === "number" && Number.isFinite(cached)
      ? `<v>${cached}</v>`
      : typeof cached === "string"
        ? `<v>${xmlEscape(cached)}</v>`
        : ""
    return `<c r="${ref}"><f>${xmlEscape(value.formula)}</f>${cachedXml}</c>`
  }
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value == null ? "" : String(value))}</t></is></c>`
}

function isFormulaCell(value: XlsxCell): value is XlsxFormulaCell {
  return typeof value === "object" && value !== null && "formula" in value
}

function contentTypesXml(sheetCount: number): string {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("")
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${sheetOverrides}
</Types>`
}

function packageRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
}

function workbookXml(sheetNames: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheetNames.map((name, index) => `<sheet name="${xmlAttribute(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("\n    ")}
  </sheets>
</workbook>`
}

function workbookRelationshipsXml(sheets: { path: string }[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${sheet.path.replace(/^xl\//, "")}"/>`).join("\n  ")}
</Relationships>`
}

function appPropertiesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>RxnFlow</Application>
</Properties>`
}

function corePropertiesXml(context: ReportExportContext): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${xmlEscape(context.title)}</dc:title>
  <dc:creator>RxnFlow</dc:creator>
</cp:coreProperties>`
}

function buildZip(files: Record<string, string | Uint8Array>): Uint8Array {
  const entries = Object.entries(files).map(([name, value]) => ({
    name,
    nameBytes: encoder.encode(name),
    data: typeof value === "string" ? encoder.encode(value) : value,
    offset: 0,
  }))
  const localParts: Uint8Array[] = []
  let offset = 0
  entries.forEach((entry) => {
    entry.offset = offset
    const header = zipLocalHeader(entry.nameBytes, entry.data)
    localParts.push(header, entry.data)
    offset += header.byteLength + entry.data.byteLength
  })
  const centralParts = entries.map((entry) => zipCentralDirectoryHeader(entry.nameBytes, entry.data, entry.offset))
  const centralSize = centralParts.reduce((size, part) => size + part.byteLength, 0)
  const end = zipEndOfCentralDirectory(entries.length, centralSize, offset)
  return concatBytes([...localParts, ...centralParts, end])
}

function zipLocalHeader(name: Uint8Array, data: Uint8Array): Uint8Array {
  const header = new Uint8Array(30 + name.byteLength)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 0x0800, true)
  view.setUint16(8, 0, true)
  view.setUint16(10, 0, true)
  view.setUint16(12, 33, true)
  view.setUint32(14, crc32(data), true)
  view.setUint32(18, data.byteLength, true)
  view.setUint32(22, data.byteLength, true)
  view.setUint16(26, name.byteLength, true)
  header.set(name, 30)
  return header
}

function zipCentralDirectoryHeader(name: Uint8Array, data: Uint8Array, offset: number): Uint8Array {
  const header = new Uint8Array(46 + name.byteLength)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 20, true)
  view.setUint16(8, 0x0800, true)
  view.setUint16(10, 0, true)
  view.setUint16(12, 0, true)
  view.setUint16(14, 33, true)
  view.setUint32(16, crc32(data), true)
  view.setUint32(20, data.byteLength, true)
  view.setUint32(24, data.byteLength, true)
  view.setUint16(28, name.byteLength, true)
  view.setUint32(42, offset, true)
  header.set(name, 46)
  return header
}

function zipEndOfCentralDirectory(entryCount: number, centralSize: number, centralOffset: number): Uint8Array {
  const header = new Uint8Array(22)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x06054b50, true)
  view.setUint16(8, entryCount, true)
  view.setUint16(10, entryCount, true)
  view.setUint32(12, centralSize, true)
  view.setUint32(16, centralOffset, true)
  return header
}

function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const scanlines = new Uint8Array((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1)
    scanlines[rowOffset] = 0
    scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowOffset + 1)
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width, false)
  view.setUint32(4, height, false)
  ihdr.set([8, 6, 0, 0, 0], 8)
  return concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlibStore(scanlines)),
    pngChunk("IEND", new Uint8Array()),
  ])
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = encoder.encode(type)
  const chunk = new Uint8Array(12 + data.byteLength)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.byteLength, false)
  chunk.set(typeBytes, 4)
  chunk.set(data, 8)
  view.setUint32(8 + data.byteLength, crc32(concatBytes([typeBytes, data])), false)
  return chunk
}

function zlibStore(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])]
  let offset = 0
  while (offset < data.byteLength) {
    const length = Math.min(65_535, data.byteLength - offset)
    const block = new Uint8Array(5 + length)
    block[0] = offset + length >= data.byteLength ? 1 : 0
    block[1] = length & 0xff
    block[2] = (length >> 8) & 0xff
    const nlen = (~length) & 0xffff
    block[3] = nlen & 0xff
    block[4] = (nlen >> 8) & 0xff
    block.set(data.subarray(offset, offset + length), 5)
    blocks.push(block)
    offset += length
  }
  const checksum = new Uint8Array(4)
  new DataView(checksum.buffer).setUint32(0, adler32(data), false)
  blocks.push(checksum)
  return concatBytes(blocks)
}

function fillRect(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  color: [number, number, number, number],
): void {
  const left = Math.max(0, Math.round(x))
  const top = Math.max(0, Math.round(y))
  const right = Math.min(width, Math.round(x + rectWidth))
  const bottom = Math.min(Math.floor(pixels.byteLength / 4 / width), Math.round(y + rectHeight))
  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) {
      const offset = (row * width + column) * 4
      pixels.set(color, offset)
    }
  }
}

function drawLine(
  pixels: Uint8Array,
  width: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: [number, number, number, number],
): void {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1)
  for (let index = 0; index <= steps; index += 1) {
    const x = x1 + (x2 - x1) * (index / steps)
    const y = y1 + (y2 - y1) * (index / steps)
    fillRect(pixels, width, x - 2, y - 2, 4, 4, color)
  }
}

function formatMaybeRelative(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} kcal/mol` : "pending"
}

function columnName(column: number): string {
  let current = column
  let name = ""
  while (current > 0) {
    const remainder = (current - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    current = Math.floor((current - 1) / 26)
  }
  return name
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function xmlAttribute(value: string): string {
  return xmlEscape(value).replace(/"/g, "&quot;")
}

function shortText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value
}

function safeBasename(value: string): string {
  const basename = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return basename || "rxnflow-export"
}

function round(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1).replace(/\.0$/, "") : "0"
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((size, part) => size + part.byteLength, 0)
  const result = new Uint8Array(total)
  let offset = 0
  parts.forEach((part) => {
    result.set(part, offset)
    offset += part.byteLength
  })
  return result
}

let crcTable: Uint32Array | null = null

function crc32(data: Uint8Array): number {
  const table = crcTable ?? buildCrcTable()
  crcTable = table
  let crc = 0xffffffff
  data.forEach((byte) => {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  })
  return (crc ^ 0xffffffff) >>> 0
}

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let current = index
    for (let bit = 0; bit < 8; bit += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1
    }
    table[index] = current >>> 0
  }
  return table
}

function adler32(data: Uint8Array): number {
  let a = 1
  let b = 0
  data.forEach((byte) => {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  })
  return ((b << 16) | a) >>> 0
}
