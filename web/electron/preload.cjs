const { contextBridge, ipcRenderer, webUtils } = require("electron")

contextBridge.exposeInMainWorld("rxnflowDesktop", {
  platform: process.platform,
  chooseFiles: () => ipcRenderer.invoke("rxnflow:choose-files"),
  getEngineStatus: () => ipcRenderer.invoke("rxnflow:engine-status"),
  importSourceFiles: (payload) => ipcRenderer.invoke("rxnflow:import-source-files", payload),
  filePathForFile: (file) => {
    try {
      return typeof webUtils?.getPathForFile === "function" ? webUtils.getPathForFile(file) : ""
    } catch {
      return ""
    }
  },
  registerImportCandidates: (payload) => ipcRenderer.invoke("rxnflow:register-import-candidates", payload),
  parseSourcePreview: (payload) => ipcRenderer.invoke("rxnflow:parse-source-preview", payload),
  saveJsonSnapshot: (payload) => ipcRenderer.invoke("rxnflow:save-json-snapshot", payload),
  saveReportArtifact: (payload) => ipcRenderer.invoke("rxnflow:save-report-artifact", payload),
  createProjectFolder: (payload) => ipcRenderer.invoke("rxnflow:create-project-folder", payload),
  openProjectPackage: () => ipcRenderer.invoke("rxnflow:open-project-package"),
  getStartupProjectContent: () => ipcRenderer.invoke("rxnflow:get-startup-project-content"),
  saveProjectPackage: (payload) => ipcRenderer.invoke("rxnflow:save-project-package", payload),
  autosaveProjectPackage: (payload) => ipcRenderer.invoke("rxnflow:autosave-project-package", payload),
  setActiveProject: (payload) => ipcRenderer.invoke("rxnflow:set-active-project", payload),
  forgetProject: (payload) => ipcRenderer.invoke("rxnflow:forget-project", payload),
  openSourceFile: (payload) => ipcRenderer.invoke("rxnflow:open-source-file", payload),
  getPreferences: () => ipcRenderer.invoke("rxnflow:get-preferences"),
  setPreferences: (payload) => ipcRenderer.invoke("rxnflow:set-preferences", payload),
  chooseExternalApp: (payload) => ipcRenderer.invoke("rxnflow:choose-external-app", payload),
  readChemicalClipboard: () => ipcRenderer.invoke("rxnflow:read-chemical-clipboard"),
  getWindowState: () => ipcRenderer.invoke("rxnflow:get-window-state"),
  onWindowStateChanged: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on("rxnflow:window-state-changed", listener)
    return () => ipcRenderer.removeListener("rxnflow:window-state-changed", listener)
  },
  onPreferencesChanged: (callback) => {
    const listener = (_event, preferences) => callback(preferences)
    ipcRenderer.on("rxnflow:preferences-changed", listener)
    return () => ipcRenderer.removeListener("rxnflow:preferences-changed", listener)
  },
  onMenuImportFiles: (callback) => {
    const listener = () => callback()
    ipcRenderer.on("rxnflow:menu-import-files", listener)
    return () => ipcRenderer.removeListener("rxnflow:menu-import-files", listener)
  },
  onMenuOpenProject: (callback) => {
    const listener = () => callback()
    ipcRenderer.on("rxnflow:menu-open-project", listener)
    return () => ipcRenderer.removeListener("rxnflow:menu-open-project", listener)
  },
  onMenuSaveProject: (callback) => {
    const listener = () => callback()
    ipcRenderer.on("rxnflow:menu-save-project", listener)
    return () => ipcRenderer.removeListener("rxnflow:menu-save-project", listener)
  },
  onOpenProjectContent: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on("rxnflow:open-project-content", listener)
    return () => ipcRenderer.removeListener("rxnflow:open-project-content", listener)
  },
})
