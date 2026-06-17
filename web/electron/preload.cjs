const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("rxnflowDesktop", {
  platform: process.platform,
  chooseFiles: () => ipcRenderer.invoke("rxnflow:choose-files"),
  getEngineStatus: () => ipcRenderer.invoke("rxnflow:engine-status"),
  registerImportCandidates: (payload) => ipcRenderer.invoke("rxnflow:register-import-candidates", payload),
  saveJsonSnapshot: (payload) => ipcRenderer.invoke("rxnflow:save-json-snapshot", payload),
  saveReportArtifact: (payload) => ipcRenderer.invoke("rxnflow:save-report-artifact", payload),
  createProjectFolder: (payload) => ipcRenderer.invoke("rxnflow:create-project-folder", payload),
  openProjectPackage: () => ipcRenderer.invoke("rxnflow:open-project-package"),
  getStartupProjectContent: () => ipcRenderer.invoke("rxnflow:get-startup-project-content"),
  saveProjectPackage: (payload) => ipcRenderer.invoke("rxnflow:save-project-package", payload),
  autosaveProjectPackage: (payload) => ipcRenderer.invoke("rxnflow:autosave-project-package", payload),
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
