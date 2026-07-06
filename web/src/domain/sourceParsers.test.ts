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
    expect(parsed.kind).toBe("intermediate")
    expect(parsed.candidates[0]?.roleHint).toBe("unknown")
    expect(parsed.formula).toBe("C10H12")
    expect(parsed.method).toBe("RwB97XD")
    expect(parsed.energyGas).toBeCloseTo(-232.487921)
    expect(parsed.energySolution).toBeCloseTo(-232.278807)
    expect(parsed.energyUnit).toBe("hartree")
    expect(parsed.parserId).toBe("gaussian-log-text-preview")
    expect(parsed.objectCount).toBe(1)
    expect(parsed.candidates[0]?.formula).toBe("C10H12")
  })

  it("classifies Gaussian transition states from route evidence instead of filename", () => {
    const parsed = parseSourcePreview({
      name: "generic.log",
      preview: [
        "#p wb97xd/genecp opt=(ts,calcfc) freq",
        "Stoichiometry C10H12",
        "SCF Done: E(RwB97XD) = -232.487921 A.U.",
      ].join("\n"),
    })

    expect(parsed.kind).toBe("transition")
    expect(parsed.candidates[0]?.roleHint).toBe("transition")
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

  it("extracts Gaussian normal-mode vibration displacements", () => {
    const parsed = parseSourcePreview({
      name: "ts-vibration.log",
      preview: [
        " Stoichiometry    H2O",
        "                          Standard orientation:",
        " ---------------------------------------------------------------------",
        " Center     Atomic      Atomic             Coordinates (Angstroms)",
        " Number     Number       Type             X           Y           Z",
        " ---------------------------------------------------------------------",
        "      1          8           0        0.000000    0.000000    0.000000",
        "      2          1           0        0.000000    0.000000    0.960000",
        "      3          1           0        0.920000    0.000000   -0.240000",
        " ---------------------------------------------------------------------",
        " SCF Done:  E(RB3LYP) =  -76.431000     A.U.",
        " Frequencies --   -423.1200    1580.5000    3650.1000",
        " Red. masses --      1.2345       1.1111       1.2222",
        " Frc consts  --      0.1234       0.2222       0.3333",
        " IR Inten    --     12.3000       2.0000       3.0000",
        " Raman Activ --      1.0000       2.0000       3.0000",
        " Atom  AN      X      Y      Z        X      Y      Z        X      Y      Z",
        "   1   8     0.010  0.000  0.000    0.000  0.020  0.000    0.000  0.000  0.030",
        "   2   1    -0.010  0.000  0.000    0.000 -0.020  0.000    0.000  0.000 -0.030",
        "   3   1     0.000  0.010  0.000    0.000  0.000  0.020    0.030  0.000  0.000",
      ].join("\n"),
    })

    const modes = parsed.coordinatePreview?.vibrationModes ?? []
    expect(parsed.kind).toBe("transition")
    expect(parsed.candidates[0]?.roleHint).toBe("transition")
    expect(modes).toHaveLength(3)
    expect(modes[0]).toMatchObject({
      modeId: "mode-1-imaginary-423.12",
      modeIndex: 0,
      frequencyCm1: -423.12,
      kind: "imaginary",
      reducedMassAmu: 1.2345,
      forceConstant: 0.1234,
      irIntensityKmMol: 12.3,
      ramanActivity: 1,
      source: "rxnflow-text",
    })
    expect(modes[0]?.displacements).toHaveLength(3)
    expect(modes[0]?.displacements[0]).toEqual({ atomIndex: 0, dx: 0.01, dy: 0, dz: 0 })
    expect(parsed.warnings.map((warning) => warning.code)).not.toContain("vibration_shape_mismatch")
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

  it("classifies ORCA transition states from route evidence instead of filename", () => {
    const parsed = parseSourcePreview({
      name: "generic.out",
      preview: [
        "! wB97X-D3 def2-TZVP OptTS Freq",
        "FINAL SINGLE POINT ENERGY     -231.884002",
      ].join("\n"),
    })

    expect(parsed.kind).toBe("transition")
    expect(parsed.candidates[0]?.roleHint).toBe("transition")
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

  it("extracts Gaussian termination and runtime metadata", () => {
    const parsed = parseSourcePreview({
      name: "water.log",
      preview: [
        "SCF Done: E(RwB97XD) = -76.431 A.U.",
        "Job cpu time:       0 days  1 hours  2 minutes  3.4 seconds.",
        "Elapsed time:       0 days  1 hours  3 minutes  4.5 seconds.",
        "Normal termination of Gaussian 16",
      ].join("\n"),
    })

    expect(parsed.terminationStatus).toBe("normal")
    expect(parsed.terminationLabel).toBe("normal")
    expect(parsed.jobCpuTime).toBe("0d 1h 2m 3.4s")
    expect(parsed.elapsedTime).toBe("0d 1h 3m 4.5s")
  })

  it("does not treat an earlier Gaussian normal termination as final when a later freq step is incomplete", () => {
    const parsed = parseSourcePreview({
      name: "opt-freq-truncated.log",
      preview: [
        "SCF Done: E(RwB97XD) = -7149.383937 A.U.",
        "Job cpu time:      51 days  2 hours 12 minutes  3.0 seconds.",
        "Elapsed time:       1 days 20 hours 42 minutes  7.6 seconds.",
        "Normal termination of Gaussian 16",
        "Link1:  Proceeding to internal job step number  2.",
        "# wb97xd/genecp freq",
        "Charge =  1 Multiplicity = 1",
        "Standard orientation:",
        "SCF Done: E(RwB97XD) = -7149.383937 A.U.",
      ].join("\n"),
    })

    expect(parsed.parsed).toBe(true)
    expect(parsed.energyGas).toBeCloseTo(-7149.383937)
    expect(parsed.energySolution).toBeNull()
    expect(parsed.terminationStatus).toBe("running")
    expect(parsed.terminationLabel).toBe("running")
    expect(parsed.jobCpuTime).toBe("51d 2h 12m 3.0s")
    expect(parsed.elapsedTime).toBe("1d 20h 42m 7.6s")
  })
})
