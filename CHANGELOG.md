# Changelog

All notable user-visible changes are recorded here.

## [Unreleased]

- macOS Developer ID signing/notarization and current Windows release artifacts remain pending external release credentials and CI publication.
- Real-program parser fixture coverage and the public support matrix continue to expand.

## [0.1.0] - 2026-07-10

### Added

- Local workspace folders with project/source/export manifests and checksums.
- Multi-canvas reaction graph editing, annotations and project archive import/export.
- Gaussian, ORCA, XYZ/extxyz and MAPLE-style lightweight import paths.
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
- Added full npm audit and locked Python dependency audit to release CI.
