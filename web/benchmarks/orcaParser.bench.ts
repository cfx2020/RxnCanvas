import { bench, describe } from "vitest"
import { parseSourcePreview } from "../src/domain/sourceParsers"

const source = largeOrcaText(256)

describe("ORCA preview parser baseline", () => {
  bench("parse 256-section ORCA output", () => {
    const result = parseSourcePreview({ name: "orca-large-characterization.out", preview: source })
    if (result.energyGas !== -500.123456789 || result.formula !== "C2H4O" || result.coordinatePreview?.atomCount !== 7) {
      throw new Error("ORCA benchmark result changed; run characterization tests before comparing timings.")
    }
  }, {
    warmupIterations: 10,
    iterations: 100,
    time: 1000,
  })
})

function largeOrcaText(iterations: number): string {
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
      lines.push(`ORCA benchmark filler ${String(index).padStart(3, "0")} ${String(filler).padStart(2, "0")}`)
    }
  }
  lines.push(
    "! HF def2-SVP SP",
    "* xyz 2 5",
    "# of contracted basis functions .... 888",
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
    "FINAL SINGLE POINT ENERGY     -500.123456789",
    "SMD SOLVATION ENERGY = -0.012345000",
    "Total Energy       :          -999.999999999 Eh",
    "ORCA TERMINATED NORMALLY",
  )
  return lines.join("\n")
}
