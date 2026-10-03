# RxnFlow

RxnFlow is a local-first desktop workbench for registering computational chemistry results, assembling reaction-path graphs, inspecting structures and energies, and exporting visual reports.

Version: **0.1.0**

## Current scope

- Import Gaussian, ORCA, XYZ/extxyz and MAPLE-style text outputs through the shared Python engine.
- Review multi-structure parser candidates before registering nodes.
- Edit multi-canvas reaction graphs with nodes, edges, barriers, text and image annotations.
- Inspect 2D structures, 3D coordinates and the primary vibrational mode when displacement data is available.
- Export PNG, CDXML and XLSX reports.
- Store projects as local workspace folders and exchange them as `.rxnflow.zip` archives.

Import support is intentionally conservative. Exact program versions and task types that have not been validated with a real fixture are considered experimental; see [supported import formats](docs/user/supported-import-formats.md).

## Development

Requirements:

- Node.js 22 or newer
- npm
- Python 3.12 or 3.13
- `uv` for reproducible bundled-engine builds

```bash
python3 -m unittest discover
cd web
npm ci
npm run test
node --test electron/*.test.cjs
npm run build
npm run dev
```

Open `http://127.0.0.1:5173/` for the Web workbench. Desktop verification commands are documented in [desktop rebuild verification](docs/dev/desktop-rebuild-verification.md).

`npm run test` runs frontend and selected script tests; Electron regression tests
run separately with `node --test electron/*.test.cjs`. Parser, bundle and browser
performance checks are available as `perf:parser`, `perf:bundle`, and `perf:e2e`.
See the verification guide for coverage and prerequisites.

Browser development uploads complete file bytes to the same-origin local Python
parser. Initial dependency setup may need network access; serving `dist/` alone
does not provide parsing. See [Python parser development](docs/dev/python-parser.md).

## Release status

As of 2026-10-02, [v0.1.0-beta.12](https://github.com/cfx2020/rxnflow/releases/tag/v0.1.0-beta.12)
is a private prerelease with macOS arm64 and Windows x64 downloads. Its Windows
installer and macOS runtime passed CI; the macOS Beta is ad-hoc signed and
unnotarized. Current source changes require their own release verification.

## Data and privacy

RxnFlow currently operates locally and does not include accounts, cloud sync or telemetry. See [PRIVACY.md](PRIVACY.md) for file locations and network behavior.

## License and notices

RxnFlow itself is currently distributed as all rights reserved; no open-source license is granted. Bundled third-party components retain their own licenses. See [LICENSE](LICENSE) and [third-party notices](web/legal/THIRD_PARTY_NOTICES.md).
