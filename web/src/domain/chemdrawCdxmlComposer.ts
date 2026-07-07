export type ChemDrawCdxmlEnergyLevel = {
  nodeId: string
  label: string
  kind: string
  relative: number | null
  x: number
  y: number
  structureY: number
  lineWidth: number
  structureCdxml?: string
}

export type ChemDrawCdxmlEnergyLink = {
  source: {
    x: number
    y: number
    lineWidth: number
  }
  target: {
    x: number
    y: number
    lineWidth: number
  }
  role: string
}

export type ChemDrawCdxmlArrowAnchor = {
  x: number
  y: number
  tangentX?: number
  tangentY?: number
}

export type ChemDrawCdxmlSideSpecies = {
  role: "addition" | "release"
  label: string
  structureCdxml?: string
  anchor: {
    x: number
    y: number
    structureY: number
    lineWidth: number
  }
  arrowAnchor?: ChemDrawCdxmlArrowAnchor
  lane: number
}

export type ChemDrawCdxmlEnergyDiagram = {
  title: string
  subtitle: string
  width: number
  height: number
  plot: {
    left: number
    right: number
    top: number
    bottom: number
  }
  yMin: number
  yMax: number
  levels: ChemDrawCdxmlEnergyLevel[]
  links: ChemDrawCdxmlEnergyLink[]
  sideSpecies?: ChemDrawCdxmlSideSpecies[]
}

type CdxmlAttributes = Record<string, string | number | boolean | null | undefined>
type CdxmlChild = CdxmlElement | string

type CdxmlElement = {
  tag: string
  attributes?: CdxmlAttributes
  children?: CdxmlChild[]
}

type CoordinateBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const fontIds = {
  label: "148",
  bold: "150",
} as const

const colors = [
  { r: "1", g: "1", b: "1" },
  { r: "0", g: "0", b: "0" },
  { r: "1", g: "0", b: "0" },
  { r: "1", g: "1", b: "0" },
  { r: "0", g: "1", b: "0" },
  { r: "0", g: "1", b: "1" },
  { r: "0", g: "0", b: "1" },
  { r: "1", g: "0", b: "1" },
]

const idReferenceAttributes = new Set([
  "B",
  "E",
  "object",
  "SupersededBy",
  "BracketedObjects",
  "CrossingBonds",
  "BondOrdering",
  "ConnectionOrder",
  "ExternalConnectionPoint",
  "HeadAttachment",
  "TailAttachment",
  "ContainedObjects",
])

const coordinateAttributes = new Set([
  "p",
  "BoundingBox",
  "Head3D",
  "Tail3D",
  "Center3D",
  "MajorAxisEnd3D",
  "MinorAxisEnd3D",
  "CurvePoints",
])

const colorAttributes = new Set(["color", "bgcolor", "FillColor"])

class CdxmlIdAllocator {
  private current: number

  constructor(start = 900000) {
    this.current = start
  }

  next(): string {
    const id = String(this.current)
    this.current += 1
    return id
  }
}

export function composeChemDrawEnergyDiagramCdxml(diagram: ChemDrawCdxmlEnergyDiagram): string {
  const ids = new CdxmlIdAllocator()
  const body = [
    ...diagram.links.map((link) => cdxmlConnector(ids, link)),
    ...diagram.levels.flatMap((level) => cdxmlEnergyLevel(ids, level)),
    ...diagram.levels.flatMap((level) => cdxmlStructure(ids, level)),
    ...(diagram.sideSpecies ?? []).flatMap((species) => cdxmlSideSpecies(ids, species, diagram.width, diagram.height)),
  ]
  const root = cdxmlElement("CDXML", chemDrawRootAttributes(diagram), [
    cdxmlElement("colortable", {}, colors.map((color) => cdxmlElement("color", color))),
    cdxmlElement("fonttable", {}, [
      cdxmlElement("font", { id: fontIds.label, charset: "x-mac-roman", name: "Arial" }),
      cdxmlElement("font", { id: fontIds.bold, charset: "x-mac-roman", name: "Arial Bold" }),
    ]),
    cdxmlElement("page", {
      id: ids.next(),
      BoundingBox: `0 0 ${round(diagram.width)} ${round(diagram.height)}`,
      HeaderPosition: 36,
      FooterPosition: round(diagram.height - 36),
      PrintTrimMarks: "yes",
      HeightPages: 1,
      WidthPages: Math.max(1, Math.ceil(diagram.width / 540)),
    }, body),
  ])
  const cdxml = `<?xml version="1.0" encoding="UTF-8" ?>\n<!DOCTYPE CDXML SYSTEM "https://static.chemistry.revvitycloud.com/cdxml/CDXML.dtd" >\n${serializeCdxml(root)}`
  preflightChemDrawCdxml(cdxml)
  return cdxml
}

export function preflightChemDrawCdxml(cdxml: string): void {
  if (cdxml.includes("<!--")) {
    throw new Error("CDXML preflight failed: generated document contains XML comments.")
  }
  const document = parseCdxml(cdxml, "generated document")
  if (document.documentElement.tagName !== "CDXML") {
    throw new Error("CDXML preflight failed: root element is not CDXML.")
  }

  const ids = new Set<string>()
  forEachElement(document.documentElement, (element) => {
    const id = element.getAttribute("id")
    if (!id) return
    if (ids.has(id)) throw new Error(`CDXML preflight failed: duplicate id ${id}.`)
    ids.add(id)
  })

  for (const bond of Array.from(document.getElementsByTagName("b"))) {
    const begin = bond.getAttribute("B")
    const end = bond.getAttribute("E")
    if (!begin || !end) throw new Error(`CDXML preflight failed: bond ${bond.getAttribute("id") ?? "(unlabeled)"} is missing B/E references.`)
    if (!ids.has(begin)) throw new Error(`CDXML preflight failed: bond ${bond.getAttribute("id") ?? "(unlabeled)"} references missing begin node ${begin}.`)
    if (!ids.has(end)) throw new Error(`CDXML preflight failed: bond ${bond.getAttribute("id") ?? "(unlabeled)"} references missing end node ${end}.`)
  }

  const availableFonts = new Set(Array.from(document.getElementsByTagName("font")).map((font) => font.getAttribute("id")).filter(Boolean))
  forEachElement(document.documentElement, (element) => {
    for (const attribute of ["font", "LabelFont", "CaptionFont"]) {
      const value = element.getAttribute(attribute)
      if (value && !availableFonts.has(value)) {
        throw new Error(`CDXML preflight failed: ${attribute} references missing font ${value}.`)
      }
    }
  })

  const colorCount = document.getElementsByTagName("color").length
  forEachElement(document.documentElement, (element) => {
    for (const attribute of colorAttributes) {
      const value = element.getAttribute(attribute)
      if (value == null || value === "") continue
      const index = Number(value)
      if (!Number.isInteger(index) || index < 0 || index >= colorCount) {
        throw new Error(`CDXML preflight failed: ${attribute} references missing color ${value}.`)
      }
    }
  })
}

function chemDrawRootAttributes(diagram: ChemDrawCdxmlEnergyDiagram): CdxmlAttributes {
  return {
    CreationProgram: "ChemDraw 25.0.2.7",
    Name: `${diagram.title}.cdxml`,
    BoundingBox: `0 0 ${round(diagram.width)} ${round(diagram.height)}`,
    WindowPosition: "0 0",
    WindowSize: "0 0",
    FractionalWidths: "yes",
    InterpretChemically: "yes",
    ShowAtomQuery: "yes",
    ShowAtomStereo: "no",
    ShowAtomEnhancedStereo: "yes",
    ShowAtomNumber: "no",
    ShowResidueID: "no",
    ShowBondQuery: "yes",
    ShowBondRxn: "yes",
    ShowBondStereo: "no",
    ShowTerminalCarbonLabels: "no",
    ShowNonTerminalCarbonLabels: "no",
    HideImplicitHydrogens: "no",
    LabelFont: fontIds.label,
    LabelSize: "10",
    LabelFace: "96",
    CaptionFont: fontIds.label,
    CaptionSize: "10",
    HashSpacing: "2.49",
    MarginWidth: "1.59",
    LineWidth: "0.60",
    BoldWidth: "2.01",
    BondLength: "14.40",
    BondSpacing: "18",
    ChainAngle: "120",
    LabelJustification: "Auto",
    CaptionJustification: "Left",
    AminoAcidTermini: "HOH",
    ShowSequenceTermini: "yes",
    ShowSequenceBonds: "yes",
    ShowSequenceUnlinkedBranches: "no",
    ShowPrimeLabels: "no",
    ResidueWrapCount: "40",
    PrintMargins: "36 36 36 36",
    ChemPropName: "",
    ChemPropFormula: "Chemical Formula: ",
    ChemPropExactMass: "Exact Mass: ",
    ChemPropMolWt: "Molecular Weight: ",
    ChemPropMOverZ: "m/z: ",
    ChemPropAnalysis: "Elemental Analysis: ",
    ChemPropBoilingPt: "Boiling Point: ",
    ChemPropMeltingPt: "Melting Point: ",
    ChemPropCritTemp: "Critical Temp: ",
    ChemPropCritPres: "Critical Pres: ",
    ChemPropCritVol: "Critical Vol: ",
    ChemPropGibbs: "Gibbs Energy: ",
    ChemPropLogP: "Log P: ",
    ChemPropMR: "MR: ",
    ChemPropHenry: "Henry's Law: ",
    ChemProptPSA: "tPSA: ",
    ChemPropID: "",
    ChemPropFragmentLabel: "",
    color: "0",
    bgcolor: "1",
    RxnAutonumberStart: "1",
    RxnAutonumberConditions: "no",
    RxnAutonumberStyle: "Roman",
    RxnAutonumberFormat: "(#)",
  }
}

function cdxmlConnector(ids: CdxmlIdAllocator, link: ChemDrawCdxmlEnergyLink): CdxmlElement {
  const sourceWidth = displayLevelWidth(link.source.lineWidth)
  const targetWidth = displayLevelWidth(link.target.lineWidth)
  return cdxmlBondLine(ids, link.source.x + sourceWidth / 2, link.source.y, link.target.x - targetWidth / 2, link.target.y, "0", {
    dashed: true,
  })
}

function cdxmlEnergyLevel(ids: CdxmlIdAllocator, level: ChemDrawCdxmlEnergyLevel): CdxmlElement[] {
  const width = displayLevelWidth(level.lineWidth)
  return [
    cdxmlBondLine(ids, level.x - width / 2, level.y, level.x + width / 2, level.y, "0", { bold: true }),
    cdxmlText(ids, level.x, level.y - 14, formatRelative(level.relative), { size: 10, color: "0", width: 78, bold: true }),
    cdxmlText(ids, level.x, level.y + 20, shortText(level.label, 24), { size: 10, color: "0", width: 112, bold: true }),
  ]
}

function cdxmlStructure(ids: CdxmlIdAllocator, level: ChemDrawCdxmlEnergyLevel): CdxmlElement[] {
  if (!level.structureCdxml) return []
  return importCdxmlPageElements(ids, level.structureCdxml, {
    x: level.x - 50,
    y: level.structureY,
    width: 100,
    height: 90,
  })
}

function cdxmlSideSpecies(
  ids: CdxmlIdAllocator,
  species: ChemDrawCdxmlSideSpecies,
  pageWidth: number,
  pageHeight: number,
): CdxmlElement[] {
  const direction = species.role === "addition" ? -1 : 1
  const arrowCenterX = species.arrowAnchor?.x ?? (species.anchor.x + direction * 24)
  const arrowCenterY = species.arrowAnchor?.y ?? species.anchor.y
  const clockwise = species.role === "release"
  const arrowGeometry = arcArrowGeometry(arrowCenterX, arrowCenterY, 12, clockwise, species.arrowAnchor)
  const attachment = species.role === "addition" ? arrowGeometry.tail : arrowGeometry.head
  const laneOffset = species.lane * 18
  const sideCenterX = clamp(
    attachment.x + arrowGeometry.sideNormal.x * (54 + laneOffset) + arrowGeometry.tangent.x * laneOffset * 0.35,
    42,
    pageWidth - 42,
  )
  const sideCenterY = clamp(
    attachment.y + arrowGeometry.sideNormal.y * (44 + laneOffset) + arrowGeometry.tangent.y * laneOffset * 0.35,
    46,
    pageHeight - 46,
  )
  const sideX = sideCenterX
  const sideY = sideCenterY - 26
  const structure = species.structureCdxml
    ? importCdxmlPageElements(ids, species.structureCdxml, {
      x: sideX - 30,
      y: sideY,
      width: 60,
      height: 52,
    })
    : []
  const labelY = structure.length > 0 ? sideY + 72 : sideY + 14
  return [
    ...structure,
    cdxmlText(ids, sideX, labelY, shortText(species.label, 18), { size: 10, color: "0", width: 70, bold: true }),
    ...cdxmlArcArrow(ids, arrowCenterX, arrowCenterY, 12, clockwise, species.arrowAnchor),
  ]
}

function cdxmlBondLine(
  ids: CdxmlIdAllocator,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = "0",
  options: { dashed?: boolean; bold?: boolean } = {},
): CdxmlElement {
  const fragmentId = ids.next()
  const beginId = ids.next()
  const endId = ids.next()
  const bondId = ids.next()
  return cdxmlElement("fragment", {
    id: fragmentId,
    BoundingBox: `${round(Math.min(x1, x2))} ${round(Math.min(y1, y2))} ${round(Math.max(x1, x2))} ${round(Math.max(y1, y2))}`,
    Z: fragmentId,
  }, [
    cdxmlElement("n", { id: beginId, p: `${round(x1)} ${round(y1)}`, Z: beginId, AS: "N" }),
    cdxmlElement("n", { id: endId, p: `${round(x2)} ${round(y2)}`, Z: endId, AS: "N" }),
    cdxmlElement("b", {
      id: bondId,
      Z: bondId,
      color,
      B: beginId,
      E: endId,
      Display: options.bold ? "Bold" : options.dashed ? "Dash" : undefined,
      BS: "N",
    }),
  ])
}

function cdxmlText(
  ids: CdxmlIdAllocator,
  x: number,
  y: number,
  value: string,
  options: { size?: number; color?: string; justification?: "Center" | "Right"; width?: number; bold?: boolean } = {},
): CdxmlElement {
  const size = options.size ?? 10
  const width = options.width ?? Math.max(44, value.length * size * 0.55)
  const height = Math.max(14, size * 1.35)
  const justification = options.justification ?? "Center"
  const left = justification === "Right" ? x - width : x - width / 2
  const right = justification === "Right" ? x : x + width / 2
  return cdxmlElement("t", {
    id: ids.next(),
    p: `${round(x)} ${round(y)}`,
    BoundingBox: `${round(left)} ${round(y - height)} ${round(right)} ${round(y + height * 0.35)}`,
    CaptionJustification: justification,
    Justification: justification,
    LineHeight: "auto",
    Z: ids.next(),
    color: options.color ?? "0",
    Warning: "Chemical Interpretation is not possible for this label",
  }, [
    cdxmlElement("s", {
      font: options.bold ? fontIds.bold : fontIds.label,
      size: String(size),
      color: options.color ?? "0",
      face: options.bold ? "1" : "0",
    }, [value]),
  ])
}

function cdxmlArcArrow(
  ids: CdxmlIdAllocator,
  centerX: number,
  centerY: number,
  radius: number,
  clockwise: boolean,
  anchor?: ChemDrawCdxmlArrowAnchor,
): CdxmlElement[] {
  const graphicId = ids.next()
  const arrowId = ids.next()
  const geometry = arcArrowGeometry(centerX, centerY, radius, clockwise, anchor)
  const { tail, head, major, minor } = geometry
  const bounds = coordinateBoundsFromPoints([tail, head, { x: centerX - radius, y: centerY - radius }, { x: centerX + radius, y: centerY + radius }])
  const common = {
    BoundingBox: `${round(bounds.minX)} ${round(bounds.minY)} ${round(bounds.maxX)} ${round(bounds.maxY)}`,
    Z: graphicId,
  }
  return [
    cdxmlElement("graphic", {
      id: graphicId,
      SupersededBy: arrowId,
      ...common,
      GraphicType: "Arc",
      ArrowType: "FullHead",
      HeadSize: "1000",
      AngularSize: "120",
    }),
    cdxmlElement("arrow", {
      id: arrowId,
      ...common,
      FillType: "None",
      ArrowheadHead: "Full",
      ArrowheadType: "Solid",
      HeadSize: "800",
      ArrowheadCenterSize: "700",
      ArrowheadWidth: "200",
      AngularSize: "120",
      Head3D: `${round(head.x)} ${round(head.y)} 0`,
      Tail3D: `${round(tail.x)} ${round(tail.y)} 0`,
      Center3D: `${round(centerX)} ${round(centerY)} 0`,
      MajorAxisEnd3D: `${round(major.x)} ${round(major.y)} 0`,
      MinorAxisEnd3D: `${round(minor.x)} ${round(minor.y)} 0`,
    }),
  ]
}

function arcArrowGeometry(
  centerX: number,
  centerY: number,
  radius: number,
  clockwise: boolean,
  anchor?: ChemDrawCdxmlArrowAnchor,
): {
  tail: { x: number; y: number }
  head: { x: number; y: number }
  major: { x: number; y: number }
  minor: { x: number; y: number }
  tangent: { x: number; y: number }
  sideNormal: { x: number; y: number }
} {
  const tangent = normalizedVector(anchor?.tangentX, anchor?.tangentY)
  const sideNormal = clockwise
    ? { x: -tangent.y, y: tangent.x }
    : { x: tangent.y, y: -tangent.x }
  const angle = Math.atan2(tangent.y, tangent.x) * 180 / Math.PI
  const tailAngle = clockwise ? angle + 210 : angle + 150
  const headAngle = clockwise ? angle + 330 : angle + 30
  return {
    tail: pointOnCircle(centerX, centerY, radius, tailAngle),
    head: pointOnCircle(centerX, centerY, radius, headAngle),
    major: { x: centerX + tangent.x * radius, y: centerY + tangent.y * radius },
    minor: { x: centerX + sideNormal.x * radius, y: centerY + sideNormal.y * radius },
    tangent,
    sideNormal,
  }
}

function normalizedVector(x = 1, y = 0): { x: number; y: number } {
  const length = Math.hypot(x, y)
  if (!Number.isFinite(length) || length < 0.0001) return { x: 1, y: 0 }
  return { x: x / length, y: y / length }
}

function importCdxmlPageElements(
  ids: CdxmlIdAllocator,
  cdxml: string,
  target: { x: number; y: number; width: number; height: number },
): CdxmlElement[] {
  const document = parseCdxml(cdxml, "structure fragment")
  const source = document.getElementsByTagName("page")[0] ?? document.documentElement
  const sourceElements = Array.from(source.childNodes).filter((child): child is Element => (
    child.nodeType === 1 && !["colortable", "fonttable"].includes((child as Element).tagName)
  ))
  if (sourceElements.length === 0) return []

  const idMap = new Map<string, string>()
  sourceElements.forEach((element) => collectSourceIds(element, idMap, ids))
  const imported = sourceElements
    .map((element) => cloneCdxmlElement(element, idMap))
    .filter((element): element is CdxmlElement => Boolean(element))
  const bounds = coordinateBounds(imported)
  if (!bounds) return imported

  const sourceWidth = Math.max(bounds.maxX - bounds.minX, 1)
  const sourceHeight = Math.max(bounds.maxY - bounds.minY, 1)
  const scale = Math.min(target.width / sourceWidth, target.height / sourceHeight, 1.25)
  const offsetX = target.x + (target.width - sourceWidth * scale) / 2 - bounds.minX * scale
  const offsetY = target.y + (target.height - sourceHeight * scale) / 2 - bounds.minY * scale
  imported.forEach((element) => transformCoordinates(element, scale, offsetX, offsetY))
  return imported
}

function collectSourceIds(element: Element, idMap: Map<string, string>, ids: CdxmlIdAllocator): void {
  const id = element.getAttribute("id")
  if (id && !idMap.has(id)) idMap.set(id, ids.next())
  Array.from(element.children).forEach((child) => collectSourceIds(child, idMap, ids))
}

function cloneCdxmlElement(element: Element, idMap: Map<string, string>): CdxmlElement | null {
  if (["colortable", "fonttable", "page", "CDXML"].includes(element.tagName)) return null
  const attributes: CdxmlAttributes = {}
  Array.from(element.attributes).forEach((attribute) => {
    attributes[attribute.name] = rewriteImportedAttribute(attribute.name, attribute.value, idMap)
  })
  const children: CdxmlChild[] = []
  Array.from(element.childNodes).forEach((child) => {
    if (child.nodeType === 1) {
      const cloned = cloneCdxmlElement(child as Element, idMap)
      if (cloned) children.push(cloned)
      return
    }
    if (child.nodeType === 3) {
      const text = child.textContent ?? ""
      if (text.trim()) children.push(text)
    }
  })
  return cdxmlElement(element.tagName, attributes, children)
}

function rewriteImportedAttribute(name: string, value: string, idMap: Map<string, string>): string {
  if (name === "id") return idMap.get(value) ?? value
  if (idReferenceAttributes.has(name)) {
    return value.split(/\s+/).map((part) => idMap.get(part) ?? part).join(" ")
  }
  if (name === "font" || name === "LabelFont" || name === "CaptionFont") return fontIds.label
  if (colorAttributes.has(name)) return normalizeColorReference(value)
  return value
}

function normalizeColorReference(value: string): string {
  const index = Number(value)
  if (!Number.isInteger(index) || index < 0 || index >= colors.length) return "0"
  return value
}

function coordinateBounds(elements: CdxmlElement[]): CoordinateBounds | null {
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
  const visit = (element: CdxmlElement) => {
    Object.entries(element.attributes ?? {}).forEach(([name, value]) => {
      if (!coordinateAttributes.has(name) || typeof value !== "string") return
      const numbers = numericAttributeValues(value)
      const stride = name.endsWith("3D") ? 3 : 2
      for (let index = 0; index + 1 < numbers.length; index += stride) addPoint(numbers[index], numbers[index + 1])
    })
    element.children?.forEach((child) => {
      if (typeof child !== "string") visit(child)
    })
  }
  elements.forEach(visit)
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null
}

function transformCoordinates(element: CdxmlElement, scale: number, offsetX: number, offsetY: number): void {
  Object.entries(element.attributes ?? {}).forEach(([name, value]) => {
    if (!coordinateAttributes.has(name) || typeof value !== "string") return
    element.attributes = {
      ...element.attributes,
      [name]: transformCoordinateAttribute(name, value, scale, offsetX, offsetY),
    }
  })
  element.children?.forEach((child) => {
    if (typeof child !== "string") transformCoordinates(child, scale, offsetX, offsetY)
  })
}

function transformCoordinateAttribute(name: string, value: string, scale: number, offsetX: number, offsetY: number): string {
  const values = numericAttributeValues(value)
  if (values.length === 0) return value
  const stride = name.endsWith("3D") ? 3 : 2
  return values.map((number, index) => {
    const position = index % stride
    if (position === 0) return round(number * scale + offsetX)
    if (position === 1) return round(number * scale + offsetY)
    return round(number)
  }).join(" ")
}

function numericAttributeValues(value: string): number[] {
  return value.split(/\s+/).map((part) => Number(part)).filter((number) => Number.isFinite(number))
}

function cdxmlElement(tag: string, attributes: CdxmlAttributes = {}, children: CdxmlChild[] = []): CdxmlElement {
  return { tag, attributes, children }
}

function serializeCdxml(element: CdxmlElement): string {
  const attributes = Object.entries(element.attributes ?? {})
    .filter((entry): entry is [string, string | number | boolean] => entry[1] != null && entry[1] !== false)
    .map(([name, value]) => ` ${name}="${xmlAttribute(String(value))}"`)
    .join("")
  const children = element.children ?? []
  if (children.length === 0) return `<${element.tag}${attributes}/>`
  return `<${element.tag}${attributes}>${children.map((child) => (
    typeof child === "string" ? xmlEscape(child) : serializeCdxml(child)
  )).join("")}</${element.tag}>`
}

function parseCdxml(cdxml: string, label: string): XMLDocument {
  if (typeof DOMParser === "undefined") {
    throw new Error("CDXML preflight failed: DOMParser is unavailable in this runtime.")
  }
  const document = new DOMParser().parseFromString(cdxml, "application/xml")
  const parserError = document.getElementsByTagName("parsererror")[0]
  if (parserError) {
    const detail = parserError.textContent?.trim().replace(/\s+/g, " ").slice(0, 160)
    throw new Error(`CDXML preflight failed: ${label} is not well-formed${detail ? ` (${detail})` : ""}.`)
  }
  return document
}

function forEachElement(element: Element, visitor: (element: Element) => void): void {
  visitor(element)
  Array.from(element.children).forEach((child) => forEachElement(child, visitor))
}

function formatRelative(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "pending"
}

function shortText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value
}

function displayLevelWidth(lineWidth: number): number {
  return Math.min(Math.max(lineWidth * 0.34, 18), 24)
}

function pointOnCircle(centerX: number, centerY: number, radius: number, degrees: number): { x: number; y: number } {
  const radians = degrees * Math.PI / 180
  return {
    x: centerX + Math.cos(radians) * radius,
    y: centerY + Math.sin(radians) * radius,
  }
}

function coordinateBoundsFromPoints(points: { x: number; y: number }[]): CoordinateBounds {
  return points.reduce<CoordinateBounds>((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1).replace(/\.0$/, "") : "0"
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function xmlAttribute(value: string): string {
  return xmlEscape(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
