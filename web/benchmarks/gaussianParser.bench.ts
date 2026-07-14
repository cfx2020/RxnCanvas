import { bench, describe } from "vitest"
import { parseSourcePreview } from "../src/domain/sourceParsers"

const source = largeGaussianText(176)

describe("Gaussian preview parser vibration-index reuse", () => {
  bench("parse 176-section Gaussian Link1 output with one vibration index", () => {
    const result = parseSourcePreview({ name: "gaussian-large-characterization.log", preview: source })
    const modes = result.coordinatePreview?.vibrationModes ?? []
    if (
      result.energyGas !== -500.123456789
      || result.formula !== "C2H5NO"
      || result.coordinatePreview?.atomCount !== 4
      || modes.length !== 3
      || modes[0]?.modeId !== "mode-1-imaginary-423.12"
      || result.warnings.map((warning) => warning.code).join(",") !== "vibration_parse_partial"
    ) {
      throw new Error("Gaussian benchmark result changed; run characterization tests before comparing timings.")
    }
  }, {
    warmupIterations: 10,
    iterations: 100,
    time: 1000,
  })
})

function largeGaussianText(iterations: number): string {
  const lines = [
    " Entering Gaussian System, Link 0=g16",
    " #p wb97xd/genecp opt=(ts,calcfc) freq scrf=(smd,solvent=toluene)",
    " Stoichiometry C2H5NO",
    " NBasis=   777 RedAO= T",
    " Charge = -1 Multiplicity = 2",
    ...orientation([[6, 0, 0, 0], [8, 1.2, 0, 0], [1, -0.6, 0.9, 0], [1, -0.6, -0.9, 0]], "Input orientation:"),
    " SCF Done:  E(RwB97XD) =  -400.000000000     A.U. after  12 cycles",
  ]
  for (let index = 0; index < iterations; index += 1) {
    const offset = index / 1000
    lines.push(...orientation([[6, offset, 0, 0], [8, 1.2 + offset, 0, 0], [1, -0.6 + offset, 0.9, 0], [1, -0.6 + offset, -0.9, 0]]))
    lines.push(` SCF Done:  E(RwB97XD) =  ${(-400 - offset).toFixed(9)}     A.U. after  10 cycles`)
    for (let filler = 0; filler < 12; filler += 1) lines.push(` Gaussian benchmark filler ${String(index).padStart(3, "0")} ${String(filler).padStart(2, "0")} keeps Link1 sections realistic`)
  }
  lines.push(
    " Job cpu time: 0 days 2 hours 3 minutes 4.5 seconds.",
    " Normal termination of Gaussian 16",
    " Link1: Proceeding to internal job step number 2.",
    " #p m062x/def2svp freq scrf=(pcm,solvent=water)",
    " Stoichiometry H2O",
    " NBasis= 888 RedAO= T",
    " Charge = 2 Multiplicity = 3",
    ...orientation([[6, 0.1, 0.2, 0.3], [8, 1.1, 1.2, 1.3], [1, -0.1, -0.2, -0.3], [1, 2.1, 2.2, 2.3]]),
    " SCF Done: E(UM06-2X) = -500.123456789 A.U.",
    " Sum of electronic and thermal Free Energies= -499.987654321",
    " Frequencies -- -423.1200 120.5000 345.6700",
    " Red. masses -- 1.1000 2.2000 3.3000",
    " Frc consts -- 0.4000 0.5000 0.6000",
    " IR Inten -- 10.0000 20.0000 30.0000",
    " Raman Activ -- 4.0000 5.0000 6.0000",
    " Atom AN X Y Z X Y Z X Y Z",
    " 1 6 0.010 0 0 0 0.020 0 0 0 0.030",
    " 2 8 -0.010 0 0 0 -0.020 0 0 0 -0.030",
    " 3 1 0 0.010 0 0 0 0.020 0.030 0 0",
    " 4 1 0 -0.010 0 0 0 -0.020 -0.030 0 0",
    " Frequencies -- 901.2300 1002.3400",
    " malformed frequency payload without displacement rows",
    " Standard orientation:",
    " ---------------------------------------------------------------------",
    " incomplete",
    " Elapsed time: 1 days 2 hours 4 minutes 5.6 seconds.",
    " Normal termination of Gaussian 16",
  )
  return lines.join("\n")
}

function orientation(atoms: Array<[number, number, number, number]>, label = "Standard orientation:"): string[] {
  return [
    label,
    " ---------------------------------------------------------------------",
    " Center Atomic Atomic Coordinates (Angstroms)",
    " Number Number Type X Y Z",
    " ---------------------------------------------------------------------",
    ...atoms.map(([atomicNumber, x, y, z], index) => `${index + 1} ${atomicNumber} 0 ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`),
    " ---------------------------------------------------------------------",
  ]
}
