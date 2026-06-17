import { describe, expect, it } from "vitest"
import { parseSourcePreview } from "./sourceParsers"

describe("parseSourcePreview", () => {
  it("extracts Gaussian SCF and Gibbs-corrected energies", () => {
    const parsed = parseSourcePreview({
      name: "ts-endo.log",
      preview: [
        "Stoichiometry C10H12",
        "SCF Done: E(RwB97XD) = -232.487921 A.U.",
        "Thermal correction to Gibbs Free Energy = 0.209114",
      ].join("\n"),
    })

    expect(parsed.parsed).toBe(true)
    expect(parsed.kind).toBe("transition")
    expect(parsed.formula).toBe("C10H12")
    expect(parsed.method).toBe("RwB97XD")
    expect(parsed.energyGas).toBeCloseTo(-232.487921)
    expect(parsed.energySolution).toBeCloseTo(-232.278807)
    expect(parsed.energyUnit).toBe("hartree")
    expect(parsed.parserId).toBe("gaussian-log-text-preview")
    expect(parsed.objectCount).toBe(1)
    expect(parsed.candidates[0]?.formula).toBe("C10H12")
  })

  it("extracts Ir atoms from Gaussian orientation atomic numbers", () => {
    const parsed = parseSourcePreview({
      name: "ir-complex.log",
      preview: [
        " Charge =  1 Multiplicity = 1",
        " Stoichiometry    C2H6IrN(1+)",
        "                          Input orientation:",
        " ---------------------------------------------------------------------",
        " Center     Atomic      Atomic             Coordinates (Angstroms)",
        " Number     Number       Type             X           Y           Z",
        " ---------------------------------------------------------------------",
        "      1         77           0        0.000000    0.000000    0.000000",
        "      2          6           0        1.900000    0.000000    0.000000",
        "      3          7           0       -1.800000    0.000000    0.000000",
        " ---------------------------------------------------------------------",
        " SCF Done:  E(RwB97XD) =  -4749.26415609     A.U. after   20 cycles",
      ].join("\n"),
    })

    expect(parsed.parsed).toBe(true)
    expect(parsed.formula).toBe("C2H6IrN")
    expect(parsed.coordinatePreview?.elements).toEqual(["C", "Ir", "N"])
    expect(parsed.coordinatePreview?.atoms?.[0]).toEqual({ element: "Ir", x: 0, y: 0, z: 0 })
  })

  it("extracts ORCA final energy and implicit solvent correction", () => {
    const parsed = parseSourcePreview({
      name: "adduct.out",
      preview: [
        "FINAL SINGLE POINT ENERGY     -231.884002",
        "CPCM SOLVATION ENERGY = -0.010241",
      ].join("\n"),
    })

    expect(parsed.parsed).toBe(true)
    expect(parsed.kind).toBe("product")
    expect(parsed.energyGas).toBeCloseTo(-231.884002)
    expect(parsed.energySolution).toBeCloseTo(-231.894243)
    expect(parsed.solvent).toBe("implicit solvent")
  })

  it("extracts ORCA geometry, charge, and multiplicity summaries", () => {
    const parsed = parseSourcePreview({
      name: "water.out",
      preview: [
        "! B3LYP def2-SVP Opt",
        "* xyz 0 1",
        "O 0.0 0.0 0.0",
        "H 0.0 0.0 0.96",
        "H 0.92 0.0 -0.24",
        "*",
        "CARTESIAN COORDINATES (ANGSTROEM)",
        "---------------------------------",
        "O      0.000000    0.000000    0.000000",
        "H      0.000000    0.000000    0.960000",
        "H      0.920000    0.000000   -0.240000",
        "---------------------------------",
        "FINAL SINGLE POINT ENERGY     -76.431",
        "CPCM SOLVATION ENERGY = -0.001",
      ].join("\n"),
    })

    expect(parsed.sourceKind).toBe("ORCA")
    expect(parsed.formula).toBe("H2O")
    expect(parsed.method).toBe("B3LYP def2-SVP Opt")
    expect(parsed.energyGas).toBeCloseTo(-76.431)
    expect(parsed.energySolution).toBeCloseTo(-76.432)
    expect(parsed.coordinatePreview?.atomCount).toBe(3)
    expect(parsed.coordinatePreview?.elements).toEqual(["H", "O"])
    expect(parsed.coordinatePreview?.atoms?.[0]).toEqual({ element: "O", x: 0, y: 0, z: 0 })
    expect(parsed.coordinatePreview?.atoms?.[1]).toEqual({ element: "H", x: 0, y: 0, z: 0.96 })
    expect(parsed.candidates[0]?.charge).toBe(0)
    expect(parsed.candidates[0]?.spinMultiplicity).toBe(1)
  })

  it("parses ORCA total SCF energy output shape", () => {
    const parsed = parseSourcePreview({
      name: "orca-sp-water-synthetic-minimal.out",
      preview: [
        "                              O   R   C   A",
        "|  1> ! B3LYP def2-SVP SP",
        "|  2> * xyz 0 1",
        "CARTESIAN COORDINATES (ANGSTROEM)",
        "---------------------------------",
        "  O      0.000000    0.000000    0.000000",
        "  H      0.000000    0.000000    0.957200",
        "  H      0.926600    0.000000   -0.239600",
        "",
        "General Settings:",
        " Total Charge           Charge          ....    0",
        " Multiplicity           Mult            ....    1",
        "----------------",
        "TOTAL SCF ENERGY",
        "----------------",
        "Total Energy       :          -76.34567890 Eh           -2077.47334 eV",
      ].join("\n"),
    })

    expect(parsed.parsed).toBe(true)
    expect(parsed.sourceKind).toBe("ORCA")
    expect(parsed.formula).toBe("H2O")
    expect(parsed.energyGas).toBeCloseTo(-76.34567890)
    expect(parsed.coordinatePreview?.atomCount).toBe(3)
    expect(parsed.candidates[0]?.charge).toBe(0)
    expect(parsed.candidates[0]?.spinMultiplicity).toBe(1)
  })

  it("extracts XYZ formula and optional comment energy", () => {
    const parsed = parseSourcePreview({
      name: "water.xyz",
      preview: [
        "3",
        "energy=-76.431",
        "O 0.0 0.0 0.0",
        "H 0.0 0.0 1.0",
        "H 1.0 0.0 0.0",
      ].join("\n"),
    })

    expect(parsed.parsed).toBe(true)
    expect(parsed.formula).toBe("H2O")
    expect(parsed.energyGas).toBeCloseTo(-76.431)
    expect(parsed.energyUnit).toBe("hartree")
    expect(parsed.coordinatePreview?.atomCount).toBe(3)
    expect(parsed.coordinatePreview?.atoms).toEqual([
      { element: "O", x: 0, y: 0, z: 0 },
      { element: "H", x: 0, y: 0, z: 1 },
      { element: "H", x: 1, y: 0, z: 0 },
    ])
  })

  it("converts explicit XYZ eV comment energies and preserves Hartree aliases", () => {
    const evParsed = parseSourcePreview({
      name: "h2.xyz",
      preview: [
        "2",
        "energy=-1.5 eV",
        "H 0.0 0.0 0.0",
        "H 0.0 0.0 0.74",
      ].join("\n"),
    })
    const hartreeParsed = parseSourcePreview({
      name: "water.xyz",
      preview: [
        "3",
        "E=-76.431 Ha",
        "O 0.0 0.0 0.0",
        "H 0.0 0.0 1.0",
        "H 1.0 0.0 0.0",
      ].join("\n"),
    })

    expect(evParsed.sourceKind).toBe("XYZ")
    expect(evParsed.energyGas).toBeCloseTo(-0.05512398326348249)
    expect(evParsed.warnings.some((warning) => warning.code === "unit_assumed")).toBe(false)
    expect(hartreeParsed.energyGas).toBeCloseTo(-76.431)
    expect(hartreeParsed.energyUnit).toBe("hartree")
  })

  it("projects malformed XYZ input as parse_failed", () => {
    const parsed = parseSourcePreview({
      name: "xyz-bad-atom-count.xyz",
      preview: [
        "3",
        "bad atom count",
        "H 0.0 0.0 0.0",
      ].join("\n"),
    })

    expect(parsed.parsed).toBe(false)
    expect(parsed.sourceKind).toBe("XYZ")
    expect(parsed.parserId).toBe("xyz-text-preview")
    expect(parsed.objectCount).toBe(0)
    expect(parsed.warnings.map((warning) => warning.code)).toEqual(["parse_failed"])
    expect(parsed.warnings[0]?.message).toContain("atom count")
  })

  it("extracts ASE extxyz metadata and converts eV energy to hartree", () => {
    const parsed = parseSourcePreview({
      name: "h2.xyz",
      preview: [
        "2",
        'Properties=species:S:1:pos:R:3 energy=-1.5 charge=0 spin_multiplicity=1 label="h2-extxyz" pbc="F F F"',
        "H 0.0 0.0 0.0",
        "H 0.0 0.0 0.74",
      ].join("\n"),
    })

    expect(parsed.parsed).toBe(true)
    expect(parsed.sourceKind).toBe("extxyz")
    expect(parsed.parserId).toBe("xyz-ase-text-preview")
    expect(parsed.label).toBe("h2-extxyz")
    expect(parsed.formula).toBe("H2")
    expect(parsed.method).toBe("ASE extxyz")
    expect(parsed.energyGas).toBeCloseTo(-0.05512398326348249)
    expect(parsed.energyUnit).toBe("hartree")
    expect(parsed.candidates[0]?.charge).toBe(0)
    expect(parsed.candidates[0]?.spinMultiplicity).toBe(1)
    expect(parsed.coordinatePreview?.atomCount).toBe(2)
    expect(parsed.warnings.some((warning) => warning.code === "unit_assumed")).toBe(true)
  })

  it("returns ASE extxyz metadata candidates for multi-frame files", () => {
    const parsed = parseSourcePreview({
      name: "path.xyz",
      preview: [
        "2",
        "Properties=species:S:1:pos:R:3 label=co-calc-energy charge=0 spin_multiplicity=1 energy=-14.25",
        "C 0.0 0.0 0.0",
        "O 0.0 0.0 1.13",
        "1",
        "Properties=species:S:1:pos:R:3 label=he-missing-energy charge=0 spin_multiplicity=1",
        "He 0.0 0.0 0.0",
      ].join("\n"),
    })

    expect(parsed.sourceKind).toBe("extxyz")
    expect(parsed.objectCount).toBe(2)
    expect(parsed.candidates.map((candidate) => candidate.label)).toEqual(["co-calc-energy", "he-missing-energy"])
    expect(parsed.candidates.map((candidate) => candidate.roleHint)).toEqual(["path-point", "final"])
    expect(parsed.candidates[0]?.energyGas).toBeCloseTo(-0.5236778410030837)
    expect(parsed.candidates[1]?.energyGas).toBeNull()
    expect(parsed.warnings.map((warning) => warning.code)).toEqual([
      "missing_section",
      "unit_assumed",
      "candidate_selection_available",
    ])
  })

  it("returns MAPLE trajectory candidates for multi-frame XYZ", () => {
    const parsed = parseSourcePreview({
      name: "path.xyz",
      preview: [
        "2",
        "Image 1 Energy=-10.0",
        "H 0.0 0.0 0.0",
        "H 0.0 0.0 0.7",
        "2",
        "Image 2 Energy=-11.0",
        "H 0.0 0.0 0.0",
        "H 0.0 0.0 0.8",
      ].join("\n"),
    })

    expect(parsed.parsed).toBe(true)
    expect(parsed.sourceKind).toBe("MAPLE")
    expect(parsed.objectCount).toBe(2)
    expect(parsed.energyGas).toBeCloseTo(-11.0)
    expect(parsed.candidates.map((candidate) => candidate.label)).toEqual(["Image 1", "Image 2"])
    expect(parsed.candidates.map((candidate) => candidate.roleHint)).toEqual(["path-point", "final"])
    expect(parsed.warnings.some((warning) => warning.code === "candidate_selection_available")).toBe(true)
    expect(parsed.warnings.some((warning) => warning.code === "unit_assumed")).toBe(false)
  })

  it("extracts Gaussian geometry, charge, and multiplicity summaries", () => {
    const parsed = parseSourcePreview({
      name: "water.log",
      preview: [
        "#p wb97xd/def2svp opt",
        "Charge = 0 Multiplicity = 1",
        "Standard orientation:",
        " ---------------------------------------------------------------------",
        " Center     Atomic      Atomic             Coordinates (Angstroms)",
        " Number     Number       Type             X           Y           Z",
        " ---------------------------------------------------------------------",
        "      1          8           0        0.000000    0.000000    0.000000",
        "      2          1           0        0.000000    0.000000    0.960000",
        "      3          1           0        0.920000    0.000000   -0.240000",
        " ---------------------------------------------------------------------",
        "SCF Done: E(RwB97XD) = -76.431 A.U.",
      ].join("\n"),
    })

    expect(parsed.formula).toBe("H2O")
    expect(parsed.method).toBe("wb97xd")
    expect(parsed.candidates[0]?.charge).toBe(0)
    expect(parsed.candidates[0]?.spinMultiplicity).toBe(1)
    expect(parsed.coordinatePreview?.atomCount).toBe(3)
  })
})
