# RxnFlow

RxnFlow is a local-first desktop workbench for registering computational chemistry results, assembling reaction-path graphs, inspecting structures and energies, and exporting visual reports.

Version: **0.1.0**

## Current scope

- Import lightweight Gaussian, ORCA, XYZ/extxyz and MAPLE-style text outputs.
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
npm run build
npm run dev
```

Open `http://127.0.0.1:5173/` for the Web workbench. Desktop verification commands are documented in [desktop rebuild verification](docs/dev/desktop-rebuild-verification.md).

## Data and privacy

RxnFlow currently operates locally and does not include accounts, cloud sync or telemetry. See [PRIVACY.md](PRIVACY.md) for file locations and network behavior.

## License and notices

RxnFlow itself is currently distributed as all rights reserved; no open-source license is granted. Bundled third-party components retain their own licenses. See [LICENSE](LICENSE) and [third-party notices](web/legal/THIRD_PARTY_NOTICES.md).
