# Changelog

All notable user-visible changes are recorded here.

## [Unreleased]

- Updated vulnerable npm dependencies, including Electron and Vitest; release CI now audits the full dependency tree and runs Electron regression tests.

- Shared full-file Python parsing for browser development and Electron.
- Repeatable parser, bundle and browser performance budgets.
- Workbench visual tokens and Inspector alignment updates.
- Corrected canvas wheel pan direction.

## [0.1.0-beta.12] - 2026-09-19

- Published macOS arm64 DMG/ZIP and Windows x64 setup/portable artifacts with unified checksums and a release manifest.
- Passed macOS packaged runtime and Windows install/launch/uninstall CI checks.
- macOS artifacts use ad-hoc signing and are not notarized.

## Initial desktop baseline - 2026-07-10

This records the development baseline, not a stable release.

### Added

- Local workspace folders with project/source/export manifests and checksums.
- Multi-canvas reaction graph editing, annotations and project archive import/export.
- Gaussian, ORCA, XYZ/extxyz and MAPLE-style import paths.
- 2D editing, 3D structure inspection, primary vibration playback and PNG/CDXML/XLSX exports.
- Reproducible bundled Python/cclib engine dependency lock.

### Security

- Removed stored project SVG from the active schema so project content cannot inject executable SVG into the renderer.
- Added renderer CSP, navigation/new-window guards and packaged macOS network/privacy hardening.
- Added project, source, image and archive resource limits.

### Fixed

- Text and image canvas annotations now survive save, autosave, archive export and project restore.
- `.rxnflow.zip` archives can be imported into a new workspace.
- Release version and artifact lookup no longer use `0.0.0` hard-coded paths.

### Packaging

- Reduced macOS application size by keeping renderer-only dependencies out of the Electron runtime dependency tree.
- Added production npm dependency audit (`--omit=dev`) and locked Python dependency audit to release CI.
