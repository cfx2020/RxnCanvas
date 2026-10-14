from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rxncanvas.engine import parse_source_preview


def large_orca_text(iterations: int) -> str:
    lines = [
        "                              O   R   C   A",
        "! UKS B3LYP D3BJ def2-TZVP OptTS Freq TightSCF",
        "* xyz -1 2",
        "Number of basis functions : 777",
        "ORCA finished by error",
    ]
    for index in range(iterations):
        offset = index / 1000
        lines.extend([
            "CARTESIAN COORDINATES (ANGSTROEM)",
            "---------------------------------",
            f"C      {offset:.6f}    0.000000    0.000000",
            f"H      {offset:.6f}    0.000000    1.000000",
            "",
            f"FINAL SINGLE POINT ENERGY     {-400.0 - offset:.9f}",
            f"CPCM SOLVATION ENERGY = {-0.001 - offset / 100:.9f}",
            *(f"ORCA benchmark filler {index:03d} {filler:02d}" for filler in range(12)),
        ])
    lines.extend([
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
    ])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Repeatable ORCA preview parser timing baseline with a p95 budget.")
    parser.add_argument("--sections", type=int, default=256)
    parser.add_argument("--samples", type=int, default=7)
    parser.add_argument("--parses-per-sample", type=int, default=10)
    parser.add_argument("--max-p95-ms", type=float, default=250.0)
    args = parser.parse_args()
    source = large_orca_text(args.sections)

    for _ in range(5):
        parse_source_preview("orca-large-characterization.out", source)

    samples_ms: list[float] = []
    result = None
    for _ in range(args.samples):
        started = time.perf_counter()
        for _ in range(args.parses_per_sample):
            result = parse_source_preview("orca-large-characterization.out", source)
        samples_ms.append((time.perf_counter() - started) * 1000 / args.parses_per_sample)

    if result is None or result.energyGas != -500.123456789 or result.formula != "C2H4O":
        raise RuntimeError("ORCA benchmark result changed; run characterization tests before comparing timings.")
    ordered = sorted(samples_ms)
    p95_index = min(len(ordered) - 1, round(0.95 * (len(ordered) - 1)))
    p95_ms = round(ordered[p95_index], 3)
    if p95_ms > args.max_p95_ms:
        raise RuntimeError(
            f"ORCA parser p95 budget exceeded: {p95_ms:.3f} ms > {args.max_p95_ms:.3f} ms."
        )
    print(json.dumps({
        "sections": args.sections,
        "sourceCharacters": len(source),
        "samples": args.samples,
        "parsesPerSample": args.parses_per_sample,
        "medianMsPerParse": round(statistics.median(samples_ms), 3),
        "p95MsPerParse": p95_ms,
        "p95BudgetMs": args.max_p95_ms,
        "minMsPerParse": round(min(samples_ms), 3),
        "resultFingerprint": {
            "energyGas": result.energyGas,
            "formula": result.formula,
            "atomCount": result.coordinatePreview.atomCount if result.coordinatePreview else 0,
            "warningCodes": [warning.code for warning in result.warnings],
        },
    }, indent=2))


if __name__ == "__main__":
    main()
