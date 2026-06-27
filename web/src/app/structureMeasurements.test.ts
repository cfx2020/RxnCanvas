import { describe, expect, it } from "vitest"
import {
  atomLabel,
  measurementModeForSelection,
  nextStructureAtomSelection,
  structureMeasurement,
  structureSelectionReadout,
} from "./structureMeasurements"

const atoms = [
  { element: "C", x: 0, y: 0, z: 0 },
  { element: "H", x: 1, y: 0, z: 0 },
  { element: "H", x: 1, y: 1, z: 0 },
  { element: "H", x: 1, y: 1, z: 1 },
]

describe("structureMeasurements", () => {
  it("calculates distance, angle, dihedral and element-index labels", () => {
    expect(structureMeasurement("distance", [0, 1], atoms)?.value).toBeCloseTo(1)
    expect(structureMeasurement("angle", [0, 1, 2], atoms)?.value).toBeCloseTo(90)
    expect(Math.abs(structureMeasurement("dihedral", [0, 1, 2, 3], atoms)?.value ?? 0)).toBeCloseTo(90)
    expect(atomLabel(atoms[0]!, 0)).toBe("C1")
  })

  it("derives inline inspection selection and lower-left readouts", () => {
    expect(nextStructureAtomSelection([], 0)).toEqual([0])
    expect(nextStructureAtomSelection([0], 1)).toEqual([0, 1])
    expect(nextStructureAtomSelection([0, 1], 1)).toEqual([0])
    expect(nextStructureAtomSelection([0, 1, 2, 3], 4)).toEqual([4])

    expect(measurementModeForSelection([0])).toBeNull()
    expect(measurementModeForSelection([0, 1])).toBe("distance")
    expect(measurementModeForSelection([0, 1, 2])).toBe("angle")
    expect(measurementModeForSelection([0, 1, 2, 3])).toBe("dihedral")

    expect(structureSelectionReadout([0], atoms)).toBe("C1")
    expect(structureSelectionReadout([0, 1], atoms)).toBe("C1 – H2 · 1.00 Å")
    expect(structureSelectionReadout([0, 1, 2], atoms)).toBe("C1 – H2 – H3 · 90.0 °")
    expect(structureSelectionReadout([0, 1, 2, 3], atoms)).toBe("C1 – H2 – H3 – H4 · -90.0 °")
  })
})
