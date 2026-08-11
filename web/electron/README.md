# RxnFlow Electron shell

This is the desktop shell for the current React/Vite renderer. It is local-first, does not use a local HTTP bridge or cloud sync, and probes the lightweight engine through stdin/stdout IPC.

## Scripts

- `npm run desktop`: build the renderer and launch Electron.
- `npm run desktop:engine`: build the bundled PyInstaller Python engine with cclib into `engine/`.
- `npm run desktop:smoke`: verify the built renderer, Electron shell files, recent projects store, workspace-folder project store, local engine import preview, lightweight project commands, file/node/edge/importLedger reference validation, and source/export checksum warnings.
- `npm run desktop:icons`: generate PNG/ICNS/ICO desktop icons from `build/icon.svg`.
- `npm run desktop:release:smoke`: generate desktop icons, then verify Electron builder metadata, icon assets, macOS/Windows targets, and the current-platform unpacked app structure when present.
- `npm run desktop:runtime:smoke`: launch the current-platform packaged unpacked app with `--rxnflow-smoke-exit` and verify the React workbench renders, active UI-only inspector tabs are present, inactive UI text is absent, and the process exits cleanly.
- `npm run desktop:pack`: build an unsigned local unpacked app for the current platform.
- `npm run desktop:pack:win`: build a Windows x64 unpacked app.
- `npm run desktop:dist:mac`: build macOS `dmg` and `zip` artifacts.
- `npm run desktop:dist:mac:unsigned`: build ad-hoc-signed, unnotarized macOS `dmg` and `zip` beta artifacts for trusted testers.
- `npm run desktop:notarize:mac`: submit a signed macOS DMG to Apple notarization using `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_SPECIFIC_PASSWORD`, then staple the app and DMG.
- `npm run desktop:dist:win`: build Windows x64 `nsis` and `portable` artifacts.
- `npm run desktop:installer:smoke:win`: on Windows, silently install the NSIS setup into a temporary directory, launch the installed app with the runtime smoke flag, verify the smoke marker, then silently uninstall it. On non-Windows hosts this command is a no-op skip.

## Current boundary

The shell provides:

- BrowserWindow setup for macOS and Windows.
- Release smoke coverage for Electron builder metadata, RxnFlow desktop icon assets, macOS targets, macOS hardened-runtime entitlements, Windows x64 targets, Windows installer smoke wiring, runtime smoke wiring, the release CI workflow, current-platform unpacked app shape, and existing Windows unpacked/installer/portable artifacts.
- Runtime smoke coverage for packaged apps through `web/electron/runtime-smoke.cjs`; it verifies the app process can start, load the packaged renderer, render the workbench with only `Node / Source / Export` inspector tabs, keep inactive UI text out of the packaged renderer, and exit cleanly on macOS/Windows CI runners.
- Windows installer smoke coverage through `web/electron/windows-installer-smoke.cjs` on Windows CI; it validates the generated NSIS setup can install, launch the installed app through `--rxnflow-smoke-exit`, emit `RXNFLOW_DESKTOP_RUNTIME_SMOKE_OK`, and uninstall from an isolated temporary directory.
- Bundled Python engine packaging via `scripts/build-engine.cjs`; packaged apps load `Resources/engine/rxnflow-engine` (`resources/engine/rxnflow-engine.exe` on Windows), while development runs can still spawn `python3 -m rxnflow.engine_ipc` when the bundled executable has not been built.
- Reproducible app icons in `build/icon.svg`, `build/icon.png`, `build/icon.icns`, and `build/icon.ico`; builder mac/win icon fields are wired to those assets.
- macOS hardened-runtime builder settings and `build/entitlements.mac.plist`; `scripts/notarize-mac.cjs` provides the signed release notarization/stapling step when Apple signing credentials are available.
- Native menu entries for importing files, opening RxnFlow project folders, exporting RxnFlow project zips, and reopening recent workspaces.
- Native file open dialog, source preview IPC, and preload `registerImportCandidates` for reviewed import candidates.
- Native save behavior for PNG/CDXML/XLSX exports through the system save dialog, with the renderer-provided filename as the default.
- Native create/open dialog for local workspace folders, `.rxnflow.zip` import/export for sharing and migration, legacy `.rxnflow.json` package read compatibility, plus a persisted recent projects menu. Archive import rejects unsafe paths and enforces compressed, entry, expanded-size, and entry-count limits.
- Workspace folder persistence in `project-store.cjs`: hidden `.rxnflow/project.json` with lightweight `importLedger`, `.rxnflow/manifest.json`, root `sources/` raw/source copies with size/sha256 metadata, root `exports/manifest.json` with artifact size/sha256 metadata, streaming zip export, and temporary-directory archive import with validation before atomic placement.
- Release traceability through `npm run desktop:release:manifest`, which writes `release/SHA256SUMS.txt` and `release/release-manifest.json`; CI uploads these alongside dependency inventories and platform artifacts.
- Renderer-side lightweight relative energy display and 3Dmol.js Structure coordinate viewer. These are persisted in renderer project state where applicable and do not require Electron-specific backend services. The old Compute/Profile panel and correction editing UI are not active UI.
- Local engine status, cclib dependency status, lightweight `import.preview` candidates/provenance/warnings, lightweight stateless `import.register_selection` / `import.register_all`, renderer candidate review with Electron engine register plus browser/failure fallback, lightweight `project.validate/open/save`, workspace `.rxnflow/project.json` file/node/edge/importLedger reference validation, node energy/position shape validation, and source/export existence/checksum warnings via `engine-bridge.cjs`. Development can use `python3 -m rxnflow.engine_ipc`; packaged apps use the bundled Python engine for the same active UI-carried commands.

Not included yet:

- Completed Apple Developer ID signing credentials, successful notarization evidence, auto-update, and installer publishing.
- Windows installer validation on a real end-user Windows machine or release channel outside CI. CI now exercises the NSIS install/launch/uninstall path on the Windows runner.
- Full ASE parser and old persisted import registry workflow, Project Content deep validation/migration/content index, complete artifact index cleanup/repair.
- The old `energy.compute` backend command, full correction policy engine, cloud sync, or user-facing Python bridge workflow.
