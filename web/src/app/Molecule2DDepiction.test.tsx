import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Molecule2DDepiction, inferDepictionBonds, molfileFromAtoms, svgFromMolfile } from "./Molecule2DDepiction"
import type { CoordinateAtom } from "../domain/sourceParsers"

const waterAtoms: CoordinateAtom[] = [
  { element: "O", x: 0, y: 0, z: 0 },
  { element: "H", x: 0, y: 0, z: 0.96 },
  { element: "H", x: 0.92, y: 0, z: -0.24 },
]

const methaneAtoms: CoordinateAtom[] = [
  { element: "C", x: 0, y: 0, z: 0 },
  { element: "H", x: 0, y: 0, z: 1.09 },
  { element: "H", x: 1.02, y: 0, z: -0.36 },
  { element: "H", x: -0.51, y: 0.88, z: -0.36 },
  { element: "H", x: -0.51, y: -0.88, z: -0.36 },
]

const nitrogenAtoms: CoordinateAtom[] = [
  { element: "N", x: 0, y: 0, z: 0 },
  { element: "N", x: 1.1, y: 0, z: 0 },
]

describe("Molecule2DDepiction", () => {
  it("builds a molfile with inferred bonds from coordinate atoms", () => {
    expect(inferDepictionBonds(waterAtoms)).toHaveLength(2)
    const molfile = molfileFromAtoms(waterAtoms)
    expect(molfile).toContain("  3  2")
    expect(molfile).toContain(" O  ")
    expect(molfile).toContain(" H  ")
  })

  it("omits terminal carbon hydrogens and clears z coordinates for ChemDraw-like sketches", () => {
    const molfile = molfileFromAtoms(methaneAtoms)
    expect(molfile).toContain("  1  0")
    expect(molfile).toContain("    0.0000 C  ")
    expect(molfile).not.toContain(" H  ")
    expect(molfile).not.toContain("    1.0900 C  ")
  })

  it("does not show implicit hydrogens that are absent from coordinate atoms", () => {
    render(<Molecule2DDepiction atoms={nitrogenAtoms} formula="N2" label="nitrogen" width={160} height={78} />)

    expect(screen.getByRole("img", { name: "nitrogen 2D structure depiction" })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/H2N|NH2|NH/)
  })

  it("renders a lightweight SVG depiction without an external renderer", () => {
    render(<Molecule2DDepiction atoms={waterAtoms} formula="H2O" label="water" width={160} height={78} />)

    expect(screen.getByRole("img", { name: "water 2D structure depiction" })).toBeInTheDocument()
    expect(document.querySelector("svg")).toBeInTheDocument()
  })

  it("renders stored manual SVG before falling back to molfile parsing", () => {
    render(<Molecule2DDepiction atoms={[]} formula="H2O" label="manual" width={160} height={78} manualSvg="<svg><text>manual sketch</text></svg>" />)

    expect(screen.getByText("manual sketch")).toBeInTheDocument()
  })

  it("builds a fallback SVG from V2000 molfile content", () => {
    expect(svgFromMolfile(molfileFromAtoms(waterAtoms), 160, 78)).toContain("<svg")
  })
})
