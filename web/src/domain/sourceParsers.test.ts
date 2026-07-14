import { describe, expect, it, vi } from "vitest"
import { __sourceParserTestHooks, parseSourcePreview } from "./sourceParsers"
import { createGaussianVibrationIndex, parseGaussianVibrationalModes } from "./vibrations"

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

  it("characterizes the complete result for a large ORCA output", () => {
    const parsed = parseSourcePreview({
      name: "orca-large-characterization.out",
      preview: largeOrcaCharacterizationText(),
    })
    const warning = {
      code: "vibration_unavailable",
      message: "ORCA vibration data needs the full-file cclib parser or a recognized normal-mode block.",
      target: "orca-large-characterization.out",
    }
    const energyTable = { egasHartree: -500.123456789, gasBasisFunctions: 777 }
    const coordinatePreview = {
      atomCount: 7,
      has3d: true,
      elements: ["C", "H", "O"],
      atoms: [
        { element: "C", x: 0.1, y: 0.2, z: 0.3 },
        { element: "O", x: 1.1, y: 1.2, z: 1.3 },
        { element: "C", x: -0.1, y: -0.2, z: -0.3 },
        { element: "H", x: 2.1, y: 2.2, z: 2.3 },
        { element: "H", x: -2.1, y: -2.2, z: -2.3 },
        { element: "H", x: 3.1, y: 3.2, z: 3.3 },
        { element: "H", x: -3.1, y: -3.2, z: -3.3 },
      ],
      previewKind: "text",
    }
    const candidate = {
      candidateId: "candidate-1-orca-large-characterization",
      objectIndex: 0,
      label: "orca-large-characterization",
      formula: "C2H4O",
      charge: -1,
      spinMultiplicity: 2,
      method: "UKS B3LYP D3BJ def2-TZVP",
      energyGas: -500.123456789,
      energySolution: -500.13580178899997,
      energyUnit: "hartree",
      coordinatePreview,
      roleHint: "transition",
      warnings: [warning],
      energyTable,
    }

    expect(parsed).toEqual({
      label: "orca-large-characterization",
      sourceKind: "ORCA",
      formula: "C2H4O",
      kind: "transition",
      method: "UKS B3LYP D3BJ def2-TZVP",
      solvent: "implicit solvent",
      energyGas: -500.123456789,
      energySolution: -500.13580178899997,
      energyUnit: "hartree",
      parsed: true,
      parserId: "orca-output-text-preview",
      parserVersion: "0.2.1",
      objectCount: 1,
      warnings: [warning],
      candidates: [candidate],
      coordinatePreview,
      energyTable,
      parseScope: "preview",
      confidence: "low",
      terminationStatus: "normal",
      terminationLabel: "normal",
      jobCpuTime: null,
      elapsedTime: "0d 1h 2m 3.4s",
    })
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

  it("characterizes a large Gaussian Link1 opt and freq result", () => {
    const source = largeGaussianCharacterizationText()
    expect(source.length).toBeGreaterThanOrEqual(150_000)
    expect(source.length).toBeLessThanOrEqual(300_000)

    const parsed = parseSourcePreview({ name: "gaussian-large-characterization.log", preview: source })
    const warning = {
      code: "vibration_parse_partial",
      message: "Gaussian frequency lines were found, but normal-mode displacements were not recognized.",
      target: "gaussian-large-characterization.log",
    }
    const energyTable = {
      egasHartree: -500.123456789,
      gasBasisFunctions: 777,
      ggasHartree: -499.987654321,
      ggas1mHartree: -499.984635321,
      standardStateCorrectionHartree: 0.003019,
    }
    const atoms = [
      { element: "C", x: 0.1, y: 0.2, z: 0.3 },
      { element: "O", x: 1.1, y: 1.2, z: 1.3 },
      { element: "H", x: -0.1, y: -0.2, z: -0.3 },
      { element: "H", x: 2.1, y: 2.2, z: 2.3 },
    ]

    expect(parsed).toMatchObject({
      label: "gaussian-large-characterization",
      sourceKind: "Gaussian",
      formula: "C2H5NO",
      kind: "transition",
      method: "wb97xd",
      solvent: "Toluene",
      energyGas: -500.123456789,
      energySolution: -499.987654321,
      energyUnit: "hartree",
      parsed: true,
      parserId: "gaussian-log-text-preview",
      parserVersion: "0.2.1",
      objectCount: 1,
      warnings: [warning],
      energyTable,
      parseScope: "preview",
      confidence: "low",
      terminationStatus: "normal",
      terminationLabel: "normal",
      jobCpuTime: "1d 2h 3m 4.5s",
      elapsedTime: "1d 2h 4m 5.6s",
      coordinatePreview: {
        atomCount: 4,
        has3d: true,
        elements: ["C", "H", "O"],
        atoms,
        previewKind: "text",
      },
      candidates: [{
        candidateId: "candidate-1-gaussian-large-characterization",
        objectIndex: 0,
        label: "gaussian-large-characterization",
        formula: "C2H5NO",
        charge: 2,
        spinMultiplicity: 3,
        method: "wb97xd",
        energyGas: -500.123456789,
        energySolution: -499.987654321,
        energyUnit: "hartree",
        coordinatePreview: { atomCount: 4, has3d: true, elements: ["C", "H", "O"], atoms, previewKind: "text" },
        roleHint: "transition",
        warnings: [warning],
        energyTable,
      }],
    })
    const modes = parsed.coordinatePreview?.vibrationModes ?? []
    expect(modes).toHaveLength(3)
    expect(parsed.candidates[0]?.coordinatePreview?.vibrationModes).toEqual(modes)
    expect(modes[0]).toEqual({
      modeId: "mode-1-imaginary-423.12",
      modeIndex: 0,
      frequencyCm1: -423.12,
      kind: "imaginary",
      displacements: [
        { atomIndex: 0, dx: 0.01, dy: 0, dz: 0 },
        { atomIndex: 1, dx: -0.01, dy: 0, dz: 0 },
        { atomIndex: 2, dx: 0, dy: 0.01, dz: 0 },
        { atomIndex: 3, dx: 0, dy: -0.01, dz: 0 },
      ],
      reducedMassAmu: 1.1,
      forceConstant: 0.4,
      irIntensityKmMol: 10,
      ramanActivity: 4,
      source: "rxnflow-text",
    })
  })

  it("builds one Gaussian snapshot for each preview parse", () => {
    const snapshot = vi.spyOn(__sourceParserTestHooks, "gaussianTextSnapshot")
    const vibrationIndex = vi.spyOn(__sourceParserTestHooks, "gaussianVibrationIndex")

    const parsed = parseSourcePreview({
      name: "gaussian-single-snapshot.log",
      preview: largeGaussianCharacterizationText(2),
    })

    expect(parsed.sourceKind).toBe("Gaussian")
    expect(snapshot).toHaveBeenCalledTimes(1)
    expect(vibrationIndex).toHaveBeenCalledTimes(1)
    snapshot.mockRestore()
    vibrationIndex.mockRestore()
  })

  it("reuses a Gaussian vibration index while preserving Link1, partial, and shape semantics", () => {
    const source = [
      "Frequencies -- -100.0000",
      "Red. masses -- 1.1000",
      "Atom AN X Y Z",
      "1 6 0.010 0.000 0.000",
      "2 1 -0.010 0.000 0.000",
      "Normal termination of Gaussian 16",
      "Link1:",
      "Frequencies -- 200.0000",
      "frequency block without displacement rows",
      ...Array.from({ length: 24 }, (_, index) => `partial block filler ${index}`),
      "Link1:",
      "Frequencies -- 300.0000",
      "Atom AN X Y Z",
      "1 6 0.030 0.000 0.000",
      "Link1:",
      "Frequencies -- 400.0000",
      "Atom AN X Y Z",
      "1 6 0.040 0.000 0.000",
      "2 1 -0.040 0.000 0.000",
    ].join("\n")
    const index = createGaussianVibrationIndex(source)

    expect(index.frequencyLineIndices).toHaveLength(4)
    const fromText = parseGaussianVibrationalModes(source, 2, "multi-link1.log")
    const fromIndex = parseGaussianVibrationalModes(index, 2, "multi-link1.log")

    expect(fromIndex).toEqual(fromText)
    expect(fromIndex.warnings).toEqual([
      {
        code: "vibration_parse_partial",
        message: "Gaussian frequency lines were found, but normal-mode displacements were not recognized.",
        target: "multi-link1.log",
      },
      {
        code: "vibration_shape_mismatch",
        message: "Vibration mode 2 displacement count does not match atom count.",
        target: "multi-link1.log",
      },
    ])
    expect(fromIndex.modes.map((mode) => ({
      modeId: mode.modeId,
      modeIndex: mode.modeIndex,
      frequencyCm1: mode.frequencyCm1,
      displacementCount: mode.displacements.length,
    }))).toEqual([
      { modeId: "mode-1-imaginary-100.00", modeIndex: 0, frequencyCm1: -100, displacementCount: 2 },
      { modeId: "mode-2-real-400.00", modeIndex: 1, frequencyCm1: 400, displacementCount: 2 },
    ])
  })

  it("preserves Gaussian Link1 first-last fields and ignores a malformed final orientation", () => {
    const source = [
      "Entering Gaussian System",
      "#p wb97xd/def2tzvp opt=(ts,calcfc) scrf=(smd,solvent=toluene)",
      "Stoichiometry C2H6",
      "NBasis= 111 RedAO= T",
      "Charge = 0 Multiplicity = 1",
      ...gaussianOrientationLines([[6, 0, 0, 0], [1, 1, 0, 0]]),
      "SCF Done: E(RwB97XD) = -100.0 A.U.",
      "Normal termination of Gaussian 16",
      "Link1:",
      "#p m062x/def2svp freq scrf=(pcm,solvent=water)",
      "Stoichiometry H2O",
      "NBasis= 222 RedAO= T",
      "Charge = -2 Multiplicity = 3",
      ...gaussianOrientationLines([[8, 0.1, 0.2, 0.3], [1, 1.1, 1.2, 1.3]]),
      "SCF Done: E(UM06-2X) = -200.0 A.U.",
      "Thermal correction to Gibbs Free Energy = 0.25",
      "Standard orientation:",
      " ---------------------------------------------------------------------",
      " Center Atomic Atomic Coordinates",
      " ---------------------------------------------------------------------",
      " malformed trailing orientation",
    ].join("\n")

    const snapshot = __sourceParserTestHooks.gaussianTextSnapshot(source)
    expect(snapshot).toMatchObject({
      scfEnergy: -200,
      scfMethodLabel: "UM06-2X",
      freeEnergy: null,
      gibbsCorrection: 0.25,
      basisFunctions: 111,
      route: "wb97xd/def2tzvp opt=(ts,calcfc) scrf=(smd,solvent=toluene)",
      method: "wb97xd",
      formula: "C2H6",
      charge: -2,
      spinMultiplicity: 3,
      solvent: "Toluene",
      continuationAfterNormal: true,
      computation: {
        terminationStatus: "running",
        terminationLabel: "running",
        jobCpuTime: null,
        elapsedTime: null,
      },
    })
    expect(snapshot.atoms).toEqual([
      { element: "O", x: 0.1, y: 0.2, z: 0.3 },
      { element: "H", x: 1.1, y: 1.2, z: 1.3 },
    ])
    const parsed = parseSourcePreview({ name: "gaussian-link1.log", preview: source })
    expect(parsed.energySolution).toBe(-199.75)
    expect(parsed.method).toBe("wb97xd")
  })
})

function largeOrcaCharacterizationText(iterations = 96): string {
  const lines = [
    "                              O   R   C   A",
    "! UKS B3LYP D3BJ def2-TZVP OptTS Freq TightSCF",
    "* xyz -1 2",
    "Number of basis functions : 777",
    "ORCA finished by error",
  ]
  for (let index = 0; index < iterations; index += 1) {
    const offset = index / 1000
    lines.push(
      "CARTESIAN COORDINATES (ANGSTROEM)",
      "---------------------------------",
      `C      ${offset.toFixed(6)}    0.000000    0.000000`,
      `H      ${offset.toFixed(6)}    0.000000    1.000000`,
      "",
      `FINAL SINGLE POINT ENERGY     ${(-400 - offset).toFixed(9)}`,
      `CPCM SOLVATION ENERGY = ${(-0.001 - offset / 100).toFixed(9)}`,
    )
    for (let filler = 0; filler < 12; filler += 1) {
      lines.push(`ORCA characterization filler ${String(index).padStart(3, "0")} ${String(filler).padStart(2, "0")}`)
    }
  }
  lines.push(
    "! HF def2-SVP SP",
    "* xyz 2 5",
    "# of contracted basis functions .... 888",
    "Total Charge           Charge          ....    3",
    "Multiplicity           Mult            ....    4",
    "CARTESIAN COORDINATES (ANGSTROEM)",
    "---------------------------------",
    "1 C      0.100000    0.200000    0.300000",
    "2 O      1.100000    1.200000    1.300000",
    "3 C     -0.100000   -0.200000   -0.300000",
    "4 H      2.100000    2.200000    2.300000",
    "5 H     -2.100000   -2.200000   -2.300000",
    "6 H      3.100000    3.200000    3.300000",
    "7 H     -3.100000   -3.200000   -3.300000",
    "---------------------------------",
    "VIBRATIONAL FREQUENCIES",
    "NORMAL MODES",
    "FINAL SINGLE POINT ENERGY     -500.123456789",
    "SMD SOLVATION ENERGY = -0.012345000",
    "Total Energy       :          -999.999999999 Eh",
    "ORCA TERMINATED NORMALLY",
    "TOTAL RUN TIME: 0 days 1 hours 2 minutes 3.4 seconds",
  )
  return lines.join("\n")
}

function largeGaussianCharacterizationText(iterations = 176): string {
  const lines = [
    " Entering Gaussian System, Link 0=g16",
    " #p wb97xd/genecp opt=(ts,calcfc) freq scrf=(smd,solvent=toluene)",
    " Stoichiometry C2H5NO",
    " NBasis=   777 RedAO= T",
    " Charge = -1 Multiplicity = 2",
    ...gaussianOrientationLines([[6, 0, 0, 0], [8, 1.2, 0, 0], [1, -0.6, 0.9, 0], [1, -0.6, -0.9, 0]], "Input orientation:"),
    " SCF Done:  E(RwB97XD) =  -400.000000000     A.U. after  12 cycles",
  ]
  for (let index = 0; index < iterations; index += 1) {
    const offset = index / 1000
    lines.push(
      ...gaussianOrientationLines([[6, offset, 0, 0], [8, 1.2 + offset, 0, 0], [1, -0.6 + offset, 0.9, 0], [1, -0.6 + offset, -0.9, 0]]),
      ` SCF Done:  E(RwB97XD) =  ${(-400 - offset).toFixed(9)}     A.U. after  10 cycles`,
    )
    for (let filler = 0; filler < 12; filler += 1) {
      lines.push(` Gaussian characterization filler ${String(index).padStart(3, "0")} ${String(filler).padStart(2, "0")} keeps Link1 sections realistic`)
    }
  }
  lines.push(
    " Job cpu time:       0 days  2 hours  3 minutes  4.5 seconds.",
    " Elapsed time:       0 days  2 hours  4 minutes  5.6 seconds.",
    " Normal termination of Gaussian 16 at Tue Jul 14 01:00:00 2026.",
    " Link1:  Proceeding to internal job step number  2.",
    " #p m062x/def2svp freq scrf=(pcm,solvent=water)",
    " Stoichiometry H2O",
    " NBasis=   888 RedAO= T",
    " Charge = 2 Multiplicity = 3",
    ...gaussianOrientationLines([[6, 0.1, 0.2, 0.3], [8, 1.1, 1.2, 1.3], [1, -0.1, -0.2, -0.3], [1, 2.1, 2.2, 2.3]]),
    " SCF Done:  E(UM06-2X) =  -500.123456789     A.U. after  8 cycles",
    " Thermal correction to Gibbs Free Energy=        0.135802468",
    " Sum of electronic and thermal Free Energies=   -499.987654321",
    " Frequencies --  -423.1200   120.5000   345.6700",
    " Red. masses --     1.1000     2.2000     3.3000",
    " Frc consts  --     0.4000     0.5000     0.6000",
    " IR Inten    --    10.0000    20.0000    30.0000",
    " Raman Activ --     4.0000     5.0000     6.0000",
    " Atom  AN      X      Y      Z        X      Y      Z        X      Y      Z",
    "   1   6     0.010  0.000  0.000    0.000  0.020  0.000    0.000  0.000  0.030",
    "   2   8    -0.010  0.000  0.000    0.000 -0.020  0.000    0.000  0.000 -0.030",
    "   3   1     0.000  0.010  0.000    0.000  0.000  0.020    0.030  0.000  0.000",
    "   4   1     0.000 -0.010  0.000    0.000  0.000 -0.020   -0.030  0.000  0.000",
    " Frequencies --   901.2300  1002.3400",
    " Red. masses --      4.4000     5.5000",
    " malformed frequency payload without an Atom AN displacement table",
    " Standard orientation:",
    " ---------------------------------------------------------------------",
    " Center     Atomic      Atomic             Coordinates (Angstroms)",
    " Number     Number       Type             X           Y           Z",
    " ---------------------------------------------------------------------",
    " this trailing orientation block is intentionally incomplete",
    " Job cpu time:       1 days  2 hours  3 minutes  4.5 seconds.",
    " Elapsed time:       1 days  2 hours  4 minutes  5.6 seconds.",
    " Normal termination of Gaussian 16 at Tue Jul 14 02:00:00 2026.",
  )
  return lines.join("\n")
}

function gaussianOrientationLines(atoms: Array<[number, number, number, number]>, label = "Standard orientation:"): string[] {
  return [
    `                          ${label}`,
    " ---------------------------------------------------------------------",
    " Center     Atomic      Atomic             Coordinates (Angstroms)",
    " Number     Number       Type             X           Y           Z",
    " ---------------------------------------------------------------------",
    ...atoms.map(([atomicNumber, x, y, z], index) => `${String(index + 1).padStart(7)} ${String(atomicNumber).padStart(10)}           0 ${x.toFixed(6).padStart(15)} ${y.toFixed(6).padStart(11)} ${z.toFixed(6).padStart(11)}`),
    " ---------------------------------------------------------------------",
  ]
}
