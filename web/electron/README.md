# RxnCanvas Electron shell

The desktop shell hosts the React/Vite workbench and provides native file dialogs,
workspace persistence, preferences, external source openers and a Python engine
pool. Run the following commands from `web/`.

## Development and validation

- `npm run desktop:dev`: prepare the pinned Python environment and run Vite plus Electron with renderer hot reload.
- `npm run desktop`: build the renderer and launch Electron against it.
- `npm run desktop:smoke`: check shell files, the real Python engine, project/source persistence, checksums and archives; requires a built renderer and a usable Python environment.
- `node --test electron/*.test.cjs`: run project, import, recent-project, restore and engine-pool regression tests. This is separate from `npm run test`.
- `npm run desktop:runtime:smoke`: launch the current platform's existing packaged app and verify renderer/preload/engine/restore behavior.
- `npm run desktop:release:smoke`: generate icons and check builder configuration and available artifact structure.

## Packages

- `npm run desktop:engine`: build the PyInstaller Python+cclib executable from the hashed dependency lock.
- `npm run desktop:icons`: generate PNG/ICNS/ICO from `build/icon.svg`.
- `npm run desktop:pack`: build an unsigned macOS unpacked app.
- `npm run desktop:pack:win`: build a Windows x64 unpacked app.
- `npm run desktop:dist:mac`: build macOS DMG/ZIP using the configured signing environment.
- `npm run desktop:dist:mac:unsigned`: build ad-hoc-signed, unnotarized macOS Beta DMG/ZIP.
- `npm run desktop:notarize:mac`: submit a signed DMG, staple app/DMG and run Gatekeeper assessment using Apple credentials.
- `npm run desktop:dist:win`: build Windows x64 NSIS/portable executables.
- `npm run desktop:installer:smoke:win`: install, launch and uninstall the NSIS app in an isolated directory on Windows; skips on other platforms.
- `npm run desktop:release:manifest`: write SHA256SUMS.txt and release-manifest.json for current artifacts.

## Runtime and data

`engine-bridge.cjs` reuses up to three Python subprocesses. Development executes
Python source using the prepared environment or RXNCANVAS_PYTHON; packaged apps
use their bundled executable. Packaged binaries are copied to a process-specific
temporary path so rebuilding the installed source cannot corrupt a running engine.

`project-store.cjs` stores project state under `.rxncanvas/`, full source copies
under `sources/`, and reports plus their manifest under `exports/`. Mutations are
serialized per workspace, file replacement is atomic, and archives use a separate
destination lock. ZIP import validates paths and resource limits before placing
a new workspace. Project removal from the sidebar does not delete the directory.

`preferences-store.cjs` and `recent-projects.cjs` store machine-local settings
and recent workspace paths in Electron userData. `source-openers.cjs` launches
configured local applications with project-owned files.

Browser development uses Vite's same-origin loopback parser endpoints; the
Electron renderer uses preload IPC. Both call the same Python parser.

See [verification and release evidence](../../docs/dev/desktop-rebuild-verification.md)
and [current product scope](../../docs/dev/release-scope-boundary.md).
