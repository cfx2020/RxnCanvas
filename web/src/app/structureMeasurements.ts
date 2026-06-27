import type { CoordinateAtom } from "../domain/sourceParsers"

export type StructureMeasurementMode = "distance" | "angle" | "dihedral" | null

export type StructureMeasurement = {
  id: string
  mode: "distance" | "angle" | "dihedral"
  atomIndices: number[]
  value: number
  unit: "Å" | "°"
  label: string
}

export type AtomLabelMode = "none" | "element-index"

export function requiredAtomsForMeasurement(mode: StructureMeasurementMode): number {
  if (mode === "distance") return 2
  if (mode === "angle") return 3
  if (mode === "dihedral") return 4
  return 0
}

export function measurementModeForSelection(atomIndices: number[]): Exclude<StructureMeasurementMode, null> | null {
  if (atomIndices.length === 2) return "distance"
  if (atomIndices.length === 3) return "angle"
  if (atomIndices.length === 4) return "dihedral"
  return null
}

export function nextStructureAtomSelection(currentAtomIndices: number[], atomIndex: number): number[] {
  if (currentAtomIndices.includes(atomIndex)) {
    return currentAtomIndices.filter((index) => index !== atomIndex)
  }
  if (currentAtomIndices.length >= 4) return [atomIndex]
  return [...currentAtomIndices, atomIndex]
}

export function structureSelectionReadout(atomIndices: number[], atoms: CoordinateAtom[]): string | null {
  const labels = atomIndices
    .map((atomIndex) => {
      const atom = atoms[atomIndex]
      return atom ? atomLabel(atom, atomIndex) : null
    })
    .filter((label): label is string => Boolean(label))
  if (labels.length === 0) return null

  const mode = measurementModeForSelection(atomIndices)
  if (!mode) return labels.join(" – ")

  const measurement = structureMeasurement(mode, atomIndices, atoms)
  if (!measurement) return labels.join(" – ")
  return `${labels.join(" – ")} · ${measurement.value.toFixed(mode === "distance" ? 2 : 1)} ${measurement.unit}`
}

export function structureMeasurement(mode: Exclude<StructureMeasurementMode, null>, atomIndices: number[], atoms: CoordinateAtom[]): StructureMeasurement | null {
  const required = requiredAtomsForMeasurement(mode)
  if (atomIndices.length !== required) return null
  const selectedAtoms = atomIndices.map((index) => atoms[index])
  if (selectedAtoms.some((atom) => !atom)) return null
  const value = mode === "distance"
    ? distance(selectedAtoms[0]!, selectedAtoms[1]!)
    : mode === "angle"
      ? angle(selectedAtoms[0]!, selectedAtoms[1]!, selectedAtoms[2]!)
      : dihedral(selectedAtoms[0]!, selectedAtoms[1]!, selectedAtoms[2]!, selectedAtoms[3]!)
  const unit = mode === "distance" ? "Å" : "°"
  return {
    id: `${mode}-${atomIndices.join("-")}-${value.toFixed(3)}`,
    mode,
    atomIndices,
    value,
    unit,
    label: `${measurementName(mode)} ${value.toFixed(mode === "distance" ? 2 : 1)} ${unit}`,
  }
}

export function atomLabel(atom: CoordinateAtom, atomIndex: number): string {
  return `${atom.element}${atomIndex + 1}`
}

function distance(a: CoordinateAtom, b: CoordinateAtom): number {
  return norm(subtract(a, b))
}

function angle(a: CoordinateAtom, b: CoordinateAtom, c: CoordinateAtom): number {
  const ba = subtract(a, b)
  const bc = subtract(c, b)
  const denominator = norm(ba) * norm(bc)
  if (denominator === 0) return 0
  return radiansToDegrees(Math.acos(clamp(dot(ba, bc) / denominator, -1, 1)))
}

function dihedral(a: CoordinateAtom, b: CoordinateAtom, c: CoordinateAtom, d: CoordinateAtom): number {
  const b0 = subtract(b, a)
  const b1 = subtract(c, b)
  const b2 = subtract(d, c)
  const b1Norm = normalize(b1)
  const v = subtractVector(b0, scale(b1Norm, dot(b0, b1Norm)))
  const w = subtractVector(b2, scale(b1Norm, dot(b2, b1Norm)))
  const x = dot(v, w)
  const y = dot(cross(b1Norm, v), w)
  const degrees = radiansToDegrees(Math.atan2(y, x))
  return Object.is(degrees, -0) ? 0 : degrees
}

function measurementName(mode: Exclude<StructureMeasurementMode, null>): string {
  if (mode === "distance") return "Distance"
  if (mode === "angle") return "Angle"
  return "Dihedral"
}

type Vector = { x: number; y: number; z: number }

function subtract(a: CoordinateAtom, b: CoordinateAtom): Vector {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function subtractVector(a: Vector, b: Vector): Vector {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function scale(vector: Vector, scalar: number): Vector {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar }
}

function dot(a: Vector, b: Vector): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross(a: Vector, b: Vector): Vector {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function norm(vector: Vector): number {
  return Math.sqrt(dot(vector, vector))
}

function normalize(vector: Vector): Vector {
  const length = norm(vector)
  return length === 0 ? { x: 0, y: 0, z: 0 } : scale(vector, 1 / length)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function radiansToDegrees(value: number): number {
  return value * 180 / Math.PI
}
