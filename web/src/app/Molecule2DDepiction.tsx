import { useMemo } from "react"
import type { CoordinateAtom } from "../domain/sourceParseTypes"
import { StructureUnavailableIcon } from "./StructureUnavailableIcon"

type Molecule2DDepictionProps = {
  atoms: CoordinateAtom[]
  formula: string
  manualMolfile?: string
  label: string
  width: number
  height: number
  className?: string
  emptyText?: string
}

type SketchAtom = {
  element: string
  x: number
  y: number
}

const svgCache = new Map<string, string>()

export function Molecule2DDepiction({
  atoms,
  formula,
  manualMolfile,
  label,
  width,
  height,
  className = "",
  emptyText = "2D depiction unavailable",
}: Molecule2DDepictionProps) {
  const svg = useMemo(() => {
    if (atoms.length === 0 && !manualMolfile) return null
    const cacheKey = depictionCacheKey(atoms, width, height, manualMolfile)
    const cached = svgCache.get(cacheKey)
    if (cached) return cached
    const rendered = manualMolfile ? svgFromMolfile(manualMolfile, width, height) : svgFromAtoms(atoms, width, height)
    if (rendered) svgCache.set(cacheKey, rendered)
    return rendered
  }, [atoms, height, manualMolfile, width])

  if (svg) {
    return (
      <div
        className={`molecule-2d-depiction ${className}`.trim()}
        role="img"
        aria-label={`${label} 2D structure depiction`}
        title={formula}
        data-testid="molecule-2d-depiction"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }

  return (
    <div
      className={`molecule-2d-depiction molecule-2d-depiction-placeholder ${className}`.trim()}
      role="img"
      aria-label={`${label} ${emptyText}`}
      title={formula}
      data-testid="molecule-2d-depiction-placeholder"
    >
      <StructureUnavailableIcon className="structure-unavailable-icon" />
    </div>
  )
}

export function molfileFromAtoms(atoms: CoordinateAtom[]): string {
  const inferredBonds = inferDepictionBonds(atoms)
  const carbonHydrogens = terminalCarbonHydrogenIndexes(atoms, inferredBonds)
  const displayAtoms = atoms.filter((_, index) => !carbonHydrogens.has(index))
  const displayIndexByOriginalIndex = new Map<number, number>()
  atoms.forEach((_, originalIndex) => {
    if (!carbonHydrogens.has(originalIndex)) displayIndexByOriginalIndex.set(originalIndex, displayIndexByOriginalIndex.size)
  })
  const displayBonds = inferredBonds.flatMap(([from, to]) => {
    const displayFrom = displayIndexByOriginalIndex.get(from)
    const displayTo = displayIndexByOriginalIndex.get(to)
    return displayFrom === undefined || displayTo === undefined ? [] : [[displayFrom, displayTo] as [number, number]]
  })
  return [
    "RxnFlow 2D depiction",
    "  RxnFlow",
    "",
    `${countField(displayAtoms.length)}${countField(displayBonds.length)}  0  0  0  0            999 V2000`,
    ...displayAtoms.map((atom) => `${coordinateField(atom.x)}${coordinateField(atom.y)}${coordinateField(0)} ${atom.element.padEnd(3, " ")} 0  0  0  0  0  0  0  0  0  0  0  0`),
    ...displayBonds.map(([from, to]) => `${countField(from + 1)}${countField(to + 1)}  1  0  0  0  0`),
    "M  END",
    "",
  ].join("\n")
}

export function svgFromAtoms(atoms: CoordinateAtom[], width: number, height: number): string | null {
  if (atoms.length === 0) return null
  const bonds = inferDepictionBonds(atoms)
  const hiddenHydrogens = terminalCarbonHydrogenIndexes(atoms, bonds)
  const displayIndexByOriginalIndex = new Map<number, number>()
  const displayAtoms = atoms.flatMap((atom, index) => {
    if (hiddenHydrogens.has(index)) return []
    displayIndexByOriginalIndex.set(index, displayIndexByOriginalIndex.size)
    return [{ element: atom.element, x: atom.x, y: atom.y }]
  })
  const displayBonds = bonds.flatMap(([from, to]) => {
    const displayFrom = displayIndexByOriginalIndex.get(from)
    const displayTo = displayIndexByOriginalIndex.get(to)
    return displayFrom === undefined || displayTo === undefined ? [] : [[displayFrom, displayTo] as [number, number]]
  })
  return sketchSvg(displayAtoms, displayBonds, width, height)
}

export function svgFromMolfile(molfile: string, width: number, height: number): string | null {
  const parsed = parseV2000Molfile(molfile) ?? parseV3000Molfile(molfile)
  if (!parsed || parsed.atoms.length === 0) return null
  return sketchSvg(parsed.atoms, parsed.bonds, width, height)
}

export function inferDepictionBonds(atoms: CoordinateAtom[]): Array<[number, number]> {
  const bonds: Array<[number, number]> = []
  for (let start = 0; start < atoms.length; start += 1) {
    for (let end = start + 1; end < atoms.length; end += 1) {
      const distance = Math.hypot(atoms[start].x - atoms[end].x, atoms[start].y - atoms[end].y, atoms[start].z - atoms[end].z)
      const threshold = Math.min(2.28, (covalentRadius(atoms[start].element) + covalentRadius(atoms[end].element)) * 1.28)
      if (distance > 0.25 && distance <= threshold) bonds.push([start, end])
    }
  }
  return bonds.slice(0, 999)
}

function sketchSvg(atoms: SketchAtom[], bonds: Array<[number, number]>, width: number, height: number): string {
  const bounds = atomBounds(atoms)
  const padding = Math.max(12, Math.min(width, height) * 0.12)
  const spanX = Math.max(bounds.maxX - bounds.minX, 0.001)
  const spanY = Math.max(bounds.maxY - bounds.minY, 0.001)
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY, 38)
  const projected = atoms.map((atom) => ({
    ...atom,
    x: width / 2 + (atom.x - (bounds.minX + spanX / 2)) * scale,
    y: height / 2 - (atom.y - (bounds.minY + spanY / 2)) * scale,
  }))
  const bondLines = bonds.map(([from, to]) => {
    const a = projected[from]
    const b = projected[to]
    if (!a || !b) return ""
    return `<line x1="${round(a.x)}" y1="${round(a.y)}" x2="${round(b.x)}" y2="${round(b.y)}" stroke="#253445" stroke-width="2.2" stroke-linecap="round"/>`
  }).join("")
  const atomLabels = projected.map((atom) => {
    const visibleLabel = atom.element !== "C" || projected.length <= 3
    if (!visibleLabel) return ""
    return `<g><circle cx="${round(atom.x)}" cy="${round(atom.y)}" r="9" fill="rgba(255,255,255,0.86)"/><text x="${round(atom.x)}" y="${round(atom.y + 4)}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="800" fill="${atomColor(atom.element)}">${xmlEscape(atom.element)}</text></g>`
  }).join("")
  return `<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="16" fill="rgba(255,255,255,0.42)"/>${bondLines}${atomLabels}</svg>`
}

function parseV2000Molfile(molfile: string): { atoms: SketchAtom[]; bonds: Array<[number, number]> } | null {
  const lines = molfile.split(/\r?\n/)
  const counts = lines[3]
  if (!counts || !counts.includes("V2000")) return null
  const atomCount = Number.parseInt(counts.slice(0, 3), 10)
  const bondCount = Number.parseInt(counts.slice(3, 6), 10)
  if (!Number.isFinite(atomCount) || atomCount <= 0) return null
  const atoms = lines.slice(4, 4 + atomCount).map((line) => ({
    x: Number.parseFloat(line.slice(0, 10)),
    y: Number.parseFloat(line.slice(10, 20)),
    element: line.slice(31, 34).trim() || "C",
  }))
  const bonds = lines.slice(4 + atomCount, 4 + atomCount + Math.max(0, bondCount)).flatMap((line) => {
    const from = Number.parseInt(line.slice(0, 3), 10) - 1
    const to = Number.parseInt(line.slice(3, 6), 10) - 1
    return Number.isFinite(from) && Number.isFinite(to) ? [[from, to] as [number, number]] : []
  })
  return { atoms: atoms.filter((atom) => Number.isFinite(atom.x) && Number.isFinite(atom.y)), bonds }
}

function parseV3000Molfile(molfile: string): { atoms: SketchAtom[]; bonds: Array<[number, number]> } | null {
  const lines = molfile.split(/\r?\n/)
  if (!lines.some((line) => line.includes("V3000"))) return null
  const atomLines = sectionLines(lines, "BEGIN ATOM", "END ATOM")
  const bondLines = sectionLines(lines, "BEGIN BOND", "END BOND")
  const atomIdToIndex = new Map<string, number>()
  const atoms = atomLines.flatMap((line) => {
    const parts = line.replace(/^M\s+V30\s+/, "").trim().split(/\s+/)
    if (parts.length < 5) return []
    atomIdToIndex.set(parts[0], atomIdToIndex.size)
    return [{ element: parts[1], x: Number.parseFloat(parts[2]), y: Number.parseFloat(parts[3]) }]
  })
  if (atoms.length === 0) return null
  const bonds = bondLines.flatMap((line) => {
    const parts = line.replace(/^M\s+V30\s+/, "").trim().split(/\s+/)
    const from = atomIdToIndex.get(parts[2])
    const to = atomIdToIndex.get(parts[3])
    return from === undefined || to === undefined ? [] : [[from, to] as [number, number]]
  })
  return { atoms, bonds }
}

function sectionLines(lines: string[], begin: string, end: string): string[] {
  const start = lines.findIndex((line) => line.includes(begin))
  const stop = lines.findIndex((line, index) => index > start && line.includes(end))
  return start >= 0 && stop > start ? lines.slice(start + 1, stop) : []
}

function atomBounds(atoms: SketchAtom[]): { minX: number; maxX: number; minY: number; maxY: number } {
  return atoms.reduce((bounds, atom) => ({
    minX: Math.min(bounds.minX, atom.x),
    maxX: Math.max(bounds.maxX, atom.x),
    minY: Math.min(bounds.minY, atom.y),
    maxY: Math.max(bounds.maxY, atom.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
}

function terminalCarbonHydrogenIndexes(atoms: CoordinateAtom[], bonds: Array<[number, number]>): Set<number> {
  const bondedTo = new Map<number, number[]>()
  bonds.forEach(([from, to]) => {
    bondedTo.set(from, [...(bondedTo.get(from) ?? []), to])
    bondedTo.set(to, [...(bondedTo.get(to) ?? []), from])
  })
  const hiddenHydrogens = new Set<number>()
  atoms.forEach((atom, index) => {
    if (atom.element !== "H") return
    const neighbors = bondedTo.get(index) ?? []
    if (neighbors.length === 1 && atoms[neighbors[0]]?.element === "C") hiddenHydrogens.add(index)
  })
  return hiddenHydrogens
}

function depictionCacheKey(atoms: CoordinateAtom[], width: number, height: number, manualMolfile?: string): string {
  if (manualMolfile) return `${width}x${height}:manual:${hashText(manualMolfile)}`
  return `${width}x${height}:` + atoms.map((atom) => `${atom.element}:${atom.x.toFixed(3)},${atom.y.toFixed(3)},${atom.z.toFixed(3)}`).join(";")
}

function hashText(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return String(hash)
}

function countField(value: number): string {
  return String(Math.min(999, Math.max(0, value))).padStart(3, " ")
}

function coordinateField(value: number): string {
  return (Number.isFinite(value) ? value : 0).toFixed(4).padStart(10, " ")
}

function covalentRadius(element: string): number {
  return {
    H: 0.31,
    C: 0.76,
    N: 0.71,
    O: 0.66,
    F: 0.57,
    P: 1.07,
    S: 1.05,
    Cl: 1.02,
    Br: 1.2,
    I: 1.39,
    Ir: 1.41,
    Ni: 1.24,
    Pd: 1.39,
    Pt: 1.36,
  }[element] ?? 0.82
}

function atomColor(element: string): string {
  return {
    O: "#d84343",
    N: "#2962d9",
    S: "#b48714",
    P: "#b86123",
    Cl: "#178a46",
    Br: "#8f3d24",
    I: "#6f3eb2",
    Ir: "#146f7b",
    H: "#677384",
  }[element] ?? "#253445"
}

function round(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, "") : "0"
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
