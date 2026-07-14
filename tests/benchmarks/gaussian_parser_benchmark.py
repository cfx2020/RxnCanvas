from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rxnflow.engine import parse_source_preview
from tests.test_engine import large_gaussian_characterization_text


def main() -> None:
    parser = argparse.ArgumentParser(description="Repeatable Gaussian preview parser timing baseline; no absolute-time assertion.")
    parser.add_argument("--sections", type=int, default=176)
    parser.add_argument("--samples", type=int, default=7)
    parser.add_argument("--parses-per-sample", type=int, default=10)
    args = parser.parse_args()
    source = large_gaussian_characterization_text(args.sections)

    for _ in range(5):
        parse_source_preview("gaussian-large-characterization.log", source)

    samples_ms: list[float] = []
    result = None
    for _ in range(args.samples):
        started = time.perf_counter()
        for _ in range(args.parses_per_sample):
            result = parse_source_preview("gaussian-large-characterization.log", source)
        samples_ms.append((time.perf_counter() - started) * 1000 / args.parses_per_sample)

    modes = result.coordinatePreview.vibrationModes if result and result.coordinatePreview else ()
    if result is None or result.energyGas != -500.123456789 or result.formula != "C2H5NO" or len(modes) != 3:
        raise RuntimeError("Gaussian benchmark result changed; run characterization tests before comparing timings.")
    ordered = sorted(samples_ms)
    p95_index = min(len(ordered) - 1, round(0.95 * (len(ordered) - 1)))
    print(json.dumps({
        "sections": args.sections,
        "sourceCharacters": len(source),
        "samples": args.samples,
        "parsesPerSample": args.parses_per_sample,
        "medianMsPerParse": round(statistics.median(samples_ms), 3),
        "p95MsPerParse": round(ordered[p95_index], 3),
        "minMsPerParse": round(min(samples_ms), 3),
        "resultFingerprint": {
            "energyGas": result.energyGas,
            "formula": result.formula,
            "atomCount": result.coordinatePreview.atomCount if result.coordinatePreview else 0,
            "modeCount": len(modes),
            "warningCodes": [warning.code for warning in result.warnings],
        },
    }, indent=2))


if __name__ == "__main__":
    main()
