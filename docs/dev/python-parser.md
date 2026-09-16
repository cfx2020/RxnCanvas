# Python Parser Development

Web and Electron use the same Python engine. Gaussian and ORCA standard fields
come from cclib; Python also handles XYZ, ASE extxyz, MAPLE, and application
metadata. There is no TypeScript source parser or preview-text fallback.

## Start The Workbench

Run these commands from `web/`:

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:5173/>. On first startup, RxnFlow creates
`web/.engine-build/dev-venv` and installs the pinned engine dependencies from
`web/engine-requirements.lock`. It uses `uv` when available, otherwise Python 3
with `venv` and `pip`. First-time dependency installation needs network access.

For Electron with frontend hot reload:

```sh
npm run desktop:dev
```

This starts Vite and Electron together without building an app bundle. It uses
an available local port when another development server is already running.
Closing Electron stops its development server. React changes hot-reload; restart
the command after changing Python, Electron main-process, or preload code.

To preview the production frontend with the same local parser:

```sh
npm run build
npm run preview
```

Serving `dist/` as static files alone does not provide a Python parser.

## Runtime Selection

Development runs Python source, never a previously built engine binary.
`RXNFLOW_PYTHON` selects an existing Python environment with cclib 1.8.1;
`RXNFLOW_ENGINE_COMMAND` overrides the complete engine command. Packaged apps
continue using their bundled engine and do not require a user-installed Python.

## Import Boundary

- Browser imports upload the original File bytes to the same-origin loopback
  endpoint. The endpoint does not accept filesystem paths, cross-origin
  requests, or files larger than 512 MiB.
- Temporary browser uploads are deleted after parsing. Browser projects retain
  structured results, including all available vibration displacements, and do
  not acquire a desktop `sources/` directory.
- Electron retains project-owned source files and calls the same engine over
  IPC. Its stored paths, checksums, source refresh, and lazy vibration loading
  are unchanged.
- A missing full source, unavailable engine, or failed cclib parse is an explicit
  failure. Preview text is never substituted for a complete file.

## Verification

```sh
python3 -m unittest discover
```

From `web/`:

```sh
npm run test
node --test electron/*.test.cjs
npm run build
npm run desktop:smoke
```

The desktop smoke test uses the real Python engine and project-authored
Gaussian/ORCA/XYZ fixtures in `tests/fixtures/`. Their illustrative values are
test inputs, not scientific results or a claim of broad program-version support.
