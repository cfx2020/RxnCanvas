`npm run desktop:engine` writes the bundled PyInstaller Python+cclib executable
here as `rxncanvas-engine` (`rxncanvas-engine.exe` on Windows). Packaged Electron apps
load it from application resources.

Development runs Python source through `python -m rxncanvas.engine_ipc` using the
pinned environment prepared by `scripts/dev-engine.cjs`, or an explicit
`RXNCANVAS_PYTHON` / `RXNCANVAS_ENGINE_COMMAND` override. It does not select this
previously built binary. See [Python development](../../docs/dev/python-parser.md).
