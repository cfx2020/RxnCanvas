import type { ParsedEnergyUnit } from "./sourceParsers"

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
  kind: string
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
  kind: string
  formula: string
  gas: number | null
  solution: number | null
  energyUnit: ParsedEnergyUnit
  relative: number | null
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
  const layout = layoutNodes(context.nodes, imageWidth, imageHeight)
  const rowByNodeId = new Map(context.rows.map((row) => [row.nodeId, row]))
  const relativeRows = context.rows.filter((row) => typeof row.relative === "number")
  const energyPath = buildEnergySummaryPath(relativeRows, 570, 495, 330, 88)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">
  <defs>
    <linearGradient id="rxnflow-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8fbfd"/>
      <stop offset="0.48" stop-color="#eef7fa"/>
      <stop offset="1" stop-color="#f4f8f2"/>
    </linearGradient>
    <filter id="card-shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#33495a" flood-opacity="0.16"/>
    </filter>
  </defs>
  <rect width="${imageWidth}" height="${imageHeight}" rx="28" fill="url(#rxnflow-bg)"/>
  <circle cx="472" cy="16" r="220" fill="#b1f3e5" opacity="0.22"/>
  <text x="42" y="56" fill="#1f2f42" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800">${xmlEscape(context.title || context.projectLabel)}</text>
  <text x="43" y="84" fill="#6a7d8e" font-family="Inter, Arial, sans-serif" font-size="14">${xmlEscape(context.projectLabel)} / ${context.nodes.length} nodes / ${context.edges.length} edges</text>
  <g stroke-linecap="round" stroke-linejoin="round">
    ${context.edges.map((edge) => svgEdge(edge, layout)).join("\n    ")}
  </g>
  <g>
    ${context.nodes.map((node) => svgNode(node, layout.get(node.id), rowByNodeId.get(node.id))).join("\n    ")}
  </g>
  <g>
    <rect x="526" y="402" width="388" height="152" rx="22" fill="#ffffff" opacity="0.68" stroke="#d7e4ea" filter="url(#card-shadow)"/>
    <text x="554" y="440" fill="#26384c" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="800">Energy summary</text>
    <text x="554" y="462" fill="#718496" font-family="Inter, Arial, sans-serif" font-size="12">${relativeRows.length} relative values in kcal/mol</text>
    <path d="${energyPath.path}" fill="none" stroke="#4a8de8" stroke-width="4"/>
    ${energyPath.points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#ffffff" stroke="#119c7e" stroke-width="3"/>`).join("\n    ")}
  </g>
</svg>`
}

export function buildCdxmlReport(context: ReportExportContext): string {
  const layout = layoutEnergyProfile(context.nodes, context.rows, 720, 460)
  const rowByNodeId = new Map(context.rows.map((row) => [row.nodeId, row]))
  let id = 900000
  const nextId = () => String(id++)
  const profileLines = cdxmlEnergyProfileLines(layout, nextId)
  const textNodes = context.nodes.map((node) => {
    const point = layout.get(node.id) ?? { x: 80, y: 120 }
    const row = rowByNodeId.get(node.id)
    const label = `${node.label}  ${formatMaybeRelative(row?.relative)}`
    return cdxmlText(nextId(), point.x, point.y + 48, label)
  })
  const structureNodes = context.nodes.map((node) => {
    const point = layout.get(node.id) ?? { x: 80, y: 120 }
    return cdxmlManualStructure(nextId, node, point.x - 55, point.y - 118, 110, 76)
      || cdxmlText(nextId(), point.x, point.y - 76, node.formula || node.kind, "9")
  }).filter(Boolean)

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE CDXML SYSTEM "https://static.chemistry.revvitycloud.com/cdxml/CDXML.dtd" >
<CDXML CreationProgram="RxnFlow" Name="${xmlAttribute(context.title || context.projectLabel)}" BoundingBox="0 0 720 460" LabelFont="1" LabelSize="10" CaptionFont="1" CaptionSize="10" LineWidth="1" BoldWidth="2" BondLength="14.4" color="1" bgcolor="0">
  <colortable>
    <color r="1" g="1" b="1"/>
    <color r="0.12" g="0.18" b="0.26"/>
    <color r="0.07" g="0.61" b="0.49"/>
    <color r="0.32" g="0.48" b="0.62"/>
  </colortable>
  <fonttable>
    <font id="1" charset="iso-8859-1" name="Arial"/>
  </fonttable>
  <page id="${nextId()}" BoundingBox="0 0 720 460" HeaderPosition="36" FooterPosition="424">
    <group id="${nextId()}" Integral="yes" BoundingBox="0 0 720 460" Z="1">
      ${cdxmlText(nextId(), 360, 42, context.title || context.projectLabel, "14")}
      ${profileLines.join("\n      ")}
      ${structureNodes.join("\n      ")}
      ${textNodes.join("\n      ")}
      ${cdxmlText(nextId(), 360, 426, "2D structures and relative energy profile generated by RxnFlow", "9")}
    </group>
  </page>
</CDXML>`
}

function cdxmlManualStructure(
  nextId: () => string,
  node: ReportExportNode,
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  const id = nextId()
  const fragment = extractCdxmlPageContent(node.manualStructureCdxml)
  if (!fragment) return ""
  const transformed = transformCdxmlFragment(fragment, nextId, x, y, width, height)
  return `<group id="${id}" Integral="yes" RxnFlowManualStructureNode="${xmlAttribute(node.id)}" BoundingBox="${round(x)} ${round(y)} ${round(x + width)} ${round(y + height)}" Z="${id}">
        <!-- RxnFlow manual molecule CDXML for ${xmlCommentText(node.label)} -->
        ${transformed}
      </group>`
}

function extractCdxmlPageContent(cdxml: string | undefined): string {
  if (!cdxml) return ""
  const withoutDeclaration = cdxml.replace(/<\?xml[\s\S]*?\?>/gi, "").trim()
  const pageMatch = withoutDeclaration.match(/<page\b[^>]*>([\s\S]*?)<\/page>/i)
  const content = (pageMatch?.[1] ?? withoutDeclaration.replace(/<\/?CDXML\b[^>]*>/gi, "")).trim()
  return content
    .replace(/<colortable>[\s\S]*?<\/colortable>/gi, "")
    .replace(/<fonttable>[\s\S]*?<\/fonttable>/gi, "")
    .trim()
}

function transformCdxmlFragment(
  fragment: string,
  nextId: () => string,
  targetX: number,
  targetY: number,
  targetWidth: number,
  targetHeight: number,
): string {
  const idMap = new Map<string, string>()
  let rewritten = fragment.replace(/\bid="([^"]+)"/g, (_match, value: string) => {
    const mapped = idMap.get(value) ?? nextId()
    idMap.set(value, mapped)
    return `id="${mapped}"`
  })
  rewritten = rewritten.replace(/\b(object|SupersededBy|B|E)="([^"]+)"/g, (match, name: string, value: string) => {
    const mapped = value.split(/\s+/).map((part) => idMap.get(part) ?? part).join(" ")
    return `${name}="${mapped}"`
  })

  const bounds = cdxmlCoordinateBounds(rewritten)
  if (!bounds) return rewritten
  const sourceWidth = Math.max(bounds.maxX - bounds.minX, 1)
  const sourceHeight = Math.max(bounds.maxY - bounds.minY, 1)
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight, 1.15)
  const offsetX = targetX + (targetWidth - sourceWidth * scale) / 2 - bounds.minX * scale
  const offsetY = targetY + (targetHeight - sourceHeight * scale) / 2 - bounds.minY * scale

  return rewritten.replace(
    /\b(p|BoundingBox|Head3D|Tail3D|Center3D|MajorAxisEnd3D|MinorAxisEnd3D)="([^"]+)"/g,
    (_match, name: string, value: string) => `${name}="${transformCoordinateAttribute(name, value, scale, offsetX, offsetY)}"`,
  )
}

function cdxmlCoordinateBounds(fragment: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const addPoint = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  for (const match of fragment.matchAll(/\b(p|BoundingBox|Head3D|Tail3D|Center3D|MajorAxisEnd3D|MinorAxisEnd3D)="([^"]+)"/g)) {
    const name = match[1]
    const values = numericAttributeValues(match[2])
    if (name.endsWith("3D")) {
      for (let index = 0; index + 1 < values.length; index += 3) addPoint(values[index], values[index + 1])
    } else {
      for (let index = 0; index + 1 < values.length; index += 2) addPoint(values[index], values[index + 1])
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null
}

function transformCoordinateAttribute(name: string, value: string, scale: number, offsetX: number, offsetY: number): string {
  const values = numericAttributeValues(value)
  if (values.length === 0) return value
  const stride = name.endsWith("3D") ? 3 : 2
  const transformed = values.map((number, index) => {
    const position = index % stride
    if (position === 0) return round(number * scale + offsetX)
    if (position === 1) return round(number * scale + offsetY)
    return round(number)
  })
  return transformed.join(" ")
}

function numericAttributeValues(value: string): number[] {
  return value.split(/\s+/).map((part) => Number(part)).filter((part) => Number.isFinite(part))
}

function xmlCommentText(value: string): string {
  return value.replace(/--/g, "—")
}

type XlsxFormulaCell = {
  formula: string
  value?: number | string | null
}

type XlsxCell = string | number | null | undefined | XlsxFormulaCell

function formulaCell(formula: string, value?: number | string | null): XlsxFormulaCell {
  return { formula, value }
}

function buildEnergyWorksheetRows(context: ReportExportContext): XlsxCell[][] {
  const absoluteHeader = ["Structure", "Egas", "Egas kcal/mol", "Gsol", "Gsol kcal/mol", "Type", "Formula", "Energy unit"]
  const relativeHeader = ["Structure", "ΔEgas", "ΔEgas kcal/mol", "ΔGsol", "ΔGsol kcal/mol", "Type", "Formula", "Relative kcal/mol"]
  const baseline = context.rows[0]
  const absoluteRows = context.rows.map((row, index) => {
    const sheetRow = index + 2
    return [
      row.label,
      row.gas,
      energyKcalFormulaCell(`B${sheetRow}`, row.gas, row.energyUnit),
      row.solution,
      energyKcalFormulaCell(`D${sheetRow}`, row.solution, row.energyUnit),
      row.kind,
      row.formula,
      row.energyUnit,
    ]
  })
  const relativeStartRow = absoluteRows.length + 4
  const relativeRows = context.rows.map((row, index) => {
    const absoluteSheetRow = index + 2
    const sheetRow = relativeStartRow + index
    const deltaGas = finiteDelta(row.gas, baseline?.gas)
    const deltaSolution = finiteDelta(row.solution, baseline?.solution)
    return [
      row.label,
      deltaGas == null ? null : formulaCell(`B${absoluteSheetRow}-B$2`, deltaGas),
      deltaGas == null ? null : energyKcalFormulaCell(`B${sheetRow}`, deltaGas, row.energyUnit),
      deltaSolution == null ? null : formulaCell(`D${absoluteSheetRow}-D$2`, deltaSolution),
      deltaSolution == null ? null : energyKcalFormulaCell(`D${sheetRow}`, deltaSolution, row.energyUnit),
      row.kind,
      row.formula,
      row.relative,
    ]
  })
  return [
    absoluteHeader,
    ...absoluteRows,
    [],
    relativeHeader,
    ...relativeRows,
  ]
}

function energyKcalFormulaCell(ref: string, value: number | null | undefined, unit: ParsedEnergyUnit): XlsxCell {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return formulaCell(unit === "hartree" ? `${ref}*627.5095` : ref, unit === "hartree" ? value * 627.5095 : value)
}

function finiteDelta(value: number | null | undefined, baseline: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  if (typeof baseline !== "number" || !Number.isFinite(baseline)) return null
  return value - baseline
}

export function buildXlsxWorkbook(context: ReportExportContext): Uint8Array {
  const energyRows = buildEnergyWorksheetRows(context)
  const sheets = [
    {
      name: "Energy Table",
      path: "xl/worksheets/sheet1.xml",
      rows: energyRows,
      columnWidths: [22, 15, 16, 15, 16, 14, 18, 15],
    },
    {
      name: "Import Files",
      path: "xl/worksheets/sheet2.xml",
      rows: [
        ["Name", "Kind", "Size bytes", "Status"],
        ...context.files.map((file) => [file.name, file.kind, file.size, file.status]),
      ],
    },
    {
      name: "Export Metadata",
      path: "xl/worksheets/sheet3.xml",
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
  const svg = buildReportSvg(context)
  const rasterized = await rasterizeSvgToPng(svg)
  return rasterized ?? buildFallbackPng(context)
}

async function rasterizeSvgToPng(svg: string): Promise<Uint8Array | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return null
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context || typeof canvas.toBlob !== "function") return null

  canvas.width = imageWidth
  canvas.height = imageHeight
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

function cdxmlEnergyProfileLines(
  layout: Map<string, { x: number; y: number }>,
  nextId: () => string,
): string[] {
  const points = Array.from(layout.values()).sort((a, b) => a.x - b.x)
  const lines: string[] = []
  const halfWidth = 28
  points.forEach((point, index) => {
    lines.push(cdxmlLine(nextId(), point.x - halfWidth, point.y, point.x + halfWidth, point.y, "2.2", "3"))
    const next = points[index + 1]
    if (next) lines.push(cdxmlLine(nextId(), point.x + halfWidth, point.y, next.x - halfWidth, next.y, "1.3", "4"))
  })
  return lines
}

function cdxmlLine(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineWidth = "1",
  color = "1",
): string {
  return `<graphic id="${id}" GraphicType="Line" LineWidth="${lineWidth}" color="${color}" Tail3D="${round(x1)} ${round(y1)} 0" Head3D="${round(x2)} ${round(y2)} 0" BoundingBox="${round(Math.min(x1, x2))} ${round(Math.min(y1, y2))} ${round(Math.max(x1, x2))} ${round(Math.max(y1, y2))}" Z="${id}"/>`
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

function cdxmlText(id: string, x: number, y: number, value: string, size = "10"): string {
  return `<t id="${id}" p="${round(x)} ${round(y)}" BoundingBox="${round(x - 120)} ${round(y - 14)} ${round(x + 120)} ${round(y + 14)}" CaptionJustification="Center" Justification="Center" LineHeight="auto" Z="${id}"><s font="1" size="${size}" color="1" face="0">${xmlEscape(value)}</s></t>`
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
