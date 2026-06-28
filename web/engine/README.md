`npm run desktop:engine` writes the bundled RxnFlow Python engine executable
here as `rxnflow-engine` (`rxnflow-engine.exe` on Windows). Packaged Electron
apps load this executable from app resources; development runs can still spawn
`python3 -m rxnflow.engine_ipc` when this file has not been built.
