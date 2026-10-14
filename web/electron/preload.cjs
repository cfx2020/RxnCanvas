const { contextBridge, ipcRenderer, webUtils } = require("electron")

contextBridge.exposeInMainWorld("rxncanvasDesktop", {
  platform: process.platform,
  chooseFiles: () => ipcRenderer.invoke("rxncanvas:choose-files"),
  getEngineStatus: () => ipcRenderer.invoke("rxncanvas:engine-status"),
  importSourceFiles: (payload) => ipcRenderer.invoke("rxncanvas:import-source-files", payload),
  showImportIssues: (payload) => ipcRenderer.invoke("rxncanvas:show-import-issues", payload),
  filePathForFile: (file) => {
    try {
      return typeof webUtils?.getPathForFile === "function" ? webUtils.getPathForFile(file) : ""
    } catch {
      return ""
    }
  },
  registerImportCandidates: (payload) => ipcRenderer.invoke("rxncanvas:register-import-candidates", payload),
  parseSourcePreview: (payload) => ipcRenderer.invoke("rxncanvas:parse-source-preview", payload),
  inspectProjectSourceFiles: (payload) => ipcRenderer.invoke("rxncanvas:inspect-project-source-files", payload),
  saveJsonSnapshot: (payload) => ipcRenderer.invoke("rxncanvas:save-json-snapshot", payload),
  saveReportArtifact: (payload) => ipcRenderer.invoke("rxncanvas:save-report-artifact", payload),
  createProjectFolder: (payload) => ipcRenderer.invoke("rxncanvas:create-project-folder", payload),
  openProjectPackage: () => ipcRenderer.invoke("rxncanvas:open-project-package"),
  getStartupProjectContent: () => ipcRenderer.invoke("rxncanvas:get-startup-project-content"),
  saveProjectPackage: (payload) => ipcRenderer.invoke("rxncanvas:save-project-package", payload),
  autosaveProjectPackage: (payload) => ipcRenderer.invoke("rxncanvas:autosave-project-package", payload),
  setActiveProject: (payload) => ipcRenderer.invoke("rxncanvas:set-active-project", payload),
  forgetProject: (payload) => ipcRenderer.invoke("rxncanvas:forget-project", payload),
  openSourceFile: (payload) => ipcRenderer.invoke("rxncanvas:open-source-file", payload),
  getPreferences: () => ipcRenderer.invoke("rxncanvas:get-preferences"),
  setPreferences: (payload) => ipcRenderer.invoke("rxncanvas:set-preferences", payload),
  chooseExternalApp: (payload) => ipcRenderer.invoke("rxncanvas:choose-external-app", payload),
  readChemicalClipboard: () => ipcRenderer.invoke("rxncanvas:read-chemical-clipboard"),
  writeChemicalClipboard: (payload) => ipcRenderer.invoke("rxncanvas:write-chemical-clipboard", payload),
  getWindowState: () => ipcRenderer.invoke("rxncanvas:get-window-state"),
  onWindowStateChanged: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on("rxncanvas:window-state-changed", listener)
    return () => ipcRenderer.removeListener("rxncanvas:window-state-changed", listener)
  },
  onPreferencesChanged: (callback) => {
    const listener = (_event, preferences) => callback(preferences)
    ipcRenderer.on("rxncanvas:preferences-changed", listener)
    return () => ipcRenderer.removeListener("rxncanvas:preferences-changed", listener)
  },
  onMenuImportFiles: (callback) => {
    const listener = () => callback()
    ipcRenderer.on("rxncanvas:menu-import-files", listener)
    return () => ipcRenderer.removeListener("rxncanvas:menu-import-files", listener)
  },
  onMenuOpenProject: (callback) => {
    const listener = () => callback()
    ipcRenderer.on("rxncanvas:menu-open-project", listener)
    return () => ipcRenderer.removeListener("rxncanvas:menu-open-project", listener)
  },
  onMenuSaveProject: (callback) => {
    const listener = () => callback()
    ipcRenderer.on("rxncanvas:menu-save-project", listener)
    return () => ipcRenderer.removeListener("rxncanvas:menu-save-project", listener)
  },
  onOpenProjectContent: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on("rxncanvas:open-project-content", listener)
    return () => ipcRenderer.removeListener("rxncanvas:open-project-content", listener)
  },
})
