const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron")
const fs = require("node:fs/promises")
const path = require("node:path")
const { getEngineStatus, runEngineRequest } = require("./engine-bridge.cjs")
const {
  exportProjectWorkspaceArchive,
  readProjectContent,
  resolveProjectStatePath,
  saveProjectContent,
  saveProjectReportArtifact,
} = require("./project-store.cjs")
const {
  loadRecentProjects,
  saveRecentProjects,
  recordRecentProject,
  removeRecentProject,
  recentProjectLabel,
} = require("./recent-projects.cjs")

const devServerUrl = process.env.RXNFLOW_DESKTOP_DEV_SERVER
const runtimeSmokeExit = process.argv.includes("--rxnflow-smoke-exit")
const runtimeStartupRestoreSmoke = process.env.RXNFLOW_DESKTOP_SMOKE_STARTUP_RESTORE === "1"
const runtimeSmokeTimeoutMs = Number.parseInt(process.env.RXNFLOW_DESKTOP_SMOKE_TIMEOUT_MS || "12000", 10)
const userDataDirectoryOverride = process.env.RXNFLOW_DESKTOP_USER_DATA_DIR
const projectValidationEmbeddedThresholdBytes = 1024 * 1024
let recentProjectPaths = []
let recentProjectsStorePath = null
let currentProjectDirectory = null
let currentProjectId = null
let startupProjectRestorePromise = null
let startupProjectRestoreConsumed = false
const projectDirectoriesById = new Map()

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: "#eef6f8",
    icon: desktopWindowIconPath(),
    show: false,
    title: "RxnFlow",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (runtimeSmokeExit) {
    if (runtimeStartupRestoreSmoke) prepareStartupProjectRestore()
    installRuntimeSmokeExit(window)
  } else {
    prepareStartupProjectRestore()
    window.once("ready-to-show", () => {
      window.show()
    })
  }

  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(path.join(__dirname, "..", "dist", "index.html"))
  }

  return window
}

function prepareStartupProjectRestore() {
  startupProjectRestoreConsumed = false
  startupProjectRestorePromise = restoreRecentProjectPayloads()
}

async function restoreRecentProjectPayloads() {
  const payloads = []
  for (const filePath of [...recentProjectPaths].reverse()) {
    try {
      const projectPackage = await readProjectPackageWithValidation(filePath)
      activateProjectDirectory(projectPackage.content, projectPackage.projectDirectory)
      await rememberRecentProject(projectPackage.projectDirectory ?? filePath)
      payloads.push({
        filePath,
        projectDirectory: projectPackage.projectDirectory,
        content: projectPackage.content,
        validation: projectPackage.validation,
        replaceProjects: true,
        source: "startup",
      })
    } catch (error) {
      await forgetRecentProject(filePath)
      console.warn(`Could not restore recent RxnFlow project ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return payloads
}

function installRuntimeSmokeExit(window) {
  const timeout = setTimeout(() => {
    console.error(`RXNFLOW_DESKTOP_RUNTIME_SMOKE_FAILED: renderer did not become ready within ${runtimeSmokeTimeoutMs}ms`)
    app.exit(1)
  }, runtimeSmokeTimeoutMs)

  const finish = (code, message) => {
    clearTimeout(timeout)
    if (message) {
      const writer = code === 0 ? console.log : console.error
      writer(message)
    }
    app.exit(code)
  }

  window.webContents.once("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    finish(1, `RXNFLOW_DESKTOP_RUNTIME_SMOKE_FAILED: ${errorCode} ${errorDescription} ${validatedUrl}`)
  })

  window.webContents.once("did-finish-load", async () => {
    try {
      const result = await window.webContents.executeJavaScript(`
        new Promise((resolve, reject) => {
          const deadline = Date.now() + 6000
          const startupRestoreSmoke = ${JSON.stringify(runtimeStartupRestoreSmoke)}
          const forbiddenRuntimeUiTerms = [
            "Computer Profile",
            "Objects",
            "Object Registry",
            "Apply correction",
            "Compute",
            "Profile",
            "Search flows",
            "Settings",
            "Preferences",
            "More canvas actions",
            "Add Node",
            "local-http",
            "Python bridge",
            "ShellClient",
          ]
          const poll = async () => {
            const text = document.body?.innerText || ""
            const hasWorkbench = Boolean(document.querySelector(".app-shell"))
              && text.includes("RxnFlow")
              && text.includes("Import")
              && text.includes("Export")
            if (hasWorkbench) {
              try {
                const inspectorTabs = Array.from(document.querySelectorAll(".inspector-panel .panel-tabs button"))
                  .map((button) => button.textContent?.trim())
                  .filter(Boolean)
                if (inspectorTabs.join("|") !== "Node|Source|Export") {
                  reject(new Error("desktop renderer inspector tabs must be Node, Source, Export"))
                  return
                }
                const lowerText = text.toLowerCase()
                const forbiddenHits = forbiddenRuntimeUiTerms.filter((term) => lowerText.includes(term.toLowerCase()))
                if (forbiddenHits.length > 0) {
                  reject(new Error("desktop renderer exposed inactive UI: " + forbiddenHits.join(", ")))
                  return
                }
                if (startupRestoreSmoke) {
                  const stillShowingDemoProjects = ["Diels-Alder Study", "Nickel catalysis", "Ir screening"]
                    .filter((label) => text.includes(label))
                  if (!text.includes("Startup Restore Smoke") || !text.includes("Older Restore Smoke") || stillShowingDemoProjects.length > 0) {
                    if (Date.now() <= deadline) {
                      window.setTimeout(poll, 100)
                      return
                    }
                    reject(new Error("desktop renderer did not restore multiple recent workspaces without demo projects"))
                    return
                  }
                }
                const exportTab = Array.from(document.querySelectorAll(".inspector-panel .panel-tabs button"))
                  .find((button) => button.textContent?.trim() === "Export")
                if (!exportTab) {
                  reject(new Error("desktop renderer export tab is missing"))
                  return
                }
                exportTab.click()
                await new Promise((resolve) => window.setTimeout(resolve, 0))
                const exportPanel = document.querySelector(".export-panel")
                const exportFormats = Array.from(document.querySelectorAll(".export-format-grid label"))
                  .map((label) => label.textContent?.trim())
                  .filter(Boolean)
                if (!exportPanel || exportFormats.join("|") !== "PNG|CDXML|XLSX") {
                  reject(new Error("desktop renderer export formats must be PNG, CDXML, XLSX"))
                  return
                }
                const inactiveExportFormats = ["CSV", "SVG", "PDF", "PPTX", "CDX", "JSON"]
                  .filter((format) => exportFormats.includes(format))
                if (inactiveExportFormats.length > 0) {
                  reject(new Error("desktop renderer exposed inactive export formats: " + inactiveExportFormats.join(", ")))
                  return
                }
                const desktop = window.rxnflowDesktop
                if (!desktop?.getEngineStatus || !desktop?.registerImportCandidates || !desktop?.createProjectFolder || !desktop?.autosaveProjectPackage) {
                  reject(new Error("desktop preload engine API is unavailable"))
                  return
                }
                const status = await desktop.getEngineStatus()
                if (!status?.ok || !status.data?.capabilities?.includes("import.register_all")) {
                  reject(new Error("desktop engine status is not ready"))
                  return
                }
                const registered = await desktop.registerImportCandidates({
                  mode: "all",
                  files: [{
                    id: "runtime-smoke-log",
                    name: "runtime-smoke.log",
                    size: 31,
                    preview: "SCF Done: E(RwB97XD) = -100.0",
                  }],
                })
                if (!registered?.ok || registered.data?.registeredObjects?.[0]?.parserId !== "gaussian-log-text-preview") {
                  reject(new Error("desktop engine registration smoke failed"))
                  return
                }
                const autosaved = await desktop.autosaveProjectPackage({
                  defaultName: "runtime-smoke.rxnflow",
                  content: JSON.stringify({
                    schemaVersion: 1,
                    packageKind: "rxnflow-project",
                    project: { id: "runtime-smoke", label: "Runtime Smoke", meta: "open" },
                    files: [{
                      id: "runtime-smoke-log",
                      name: "runtime-smoke.log",
                      kind: "Gaussian",
                      size: 31,
                      status: "parsed",
                      preview: "SCF Done: E(RwB97XD) = -100.0",
                    }],
                    nodes: [],
                    edges: [],
                    barriers: [],
                    viewport: { x: 0, y: 0, zoom: 1 },
                    importLedger: { schemaVersion: 1, entries: [] },
                    savedAt: "2026-06-17T00:00:00.000Z",
                  }),
                })
                const autosaveCodes = new Set((autosaved?.validation?.issues || []).map((issue) => issue.code))
                if (autosaved?.projectDirectory || !autosaveCodes.has("project_folder_required")) {
                  reject(new Error("desktop autosave should require an explicit workspace folder before writing"))
                  return
                }
                resolve({
                  engineVersion: status.data.engineVersion,
                  runtime: status.data.runtime || "python",
                })
              } catch (error) {
                reject(error)
              }
              return
            }
            if (Date.now() > deadline) {
              reject(new Error("renderer loaded without the RxnFlow workbench"))
              return
            }
            window.setTimeout(poll, 100)
          }
          poll()
        })
      `)
      finish(0, `RXNFLOW_DESKTOP_RUNTIME_SMOKE_OK ${result.engineVersion} ${result.runtime}`)
    } catch (error) {
      finish(1, `RXNFLOW_DESKTOP_RUNTIME_SMOKE_FAILED: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

function desktopWindowIconPath() {
  return path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png")
}

function installApplicationMenu() {
  const isMac = process.platform === "darwin"
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "Import Files",
          accelerator: "CmdOrCtrl+O",
          click: (item, focusedWindow) => {
            if (focusedWindow) focusedWindow.webContents.send("rxnflow:menu-import-files")
          },
        },
        {
          label: "Open RxnFlow Project Folder",
          accelerator: "CmdOrCtrl+Shift+O",
          click: (item, focusedWindow) => {
            if (focusedWindow) focusedWindow.webContents.send("rxnflow:menu-open-project")
          },
        },
        {
          label: "Open Recent",
          submenu: recentProjectsMenuItems(),
        },
        {
          label: "Export RxnFlow Project Zip",
          accelerator: "CmdOrCtrl+S",
          click: (item, focusedWindow) => {
            if (focusedWindow) focusedWindow.webContents.send("rxnflow:menu-save-project")
          },
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac ? [
          { type: "separator" },
          { role: "front" },
        ] : [
          { role: "close" },
        ]),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "RxnFlow Roadmap",
          click: () => {
            void shell.openExternal("https://github.com/")
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function recentProjectsMenuItems() {
  if (recentProjectPaths.length === 0) {
    return [{ label: "No Recent Projects", enabled: false }]
  }

  return [
    ...recentProjectPaths.map((filePath) => ({
      label: recentProjectLabel(filePath),
      toolTip: filePath,
      click: (_item, focusedWindow) => {
        void openRecentProject(filePath, focusedWindow)
      },
    })),
    { type: "separator" },
    {
      label: "Clear Recent Projects",
      click: () => {
        void clearRecentProjects()
      },
    },
  ]
}

async function rememberRecentProject(filePath) {
  recentProjectPaths = recordRecentProject(recentProjectPaths, filePath)
  await persistRecentProjects()
  installApplicationMenu()
}

async function forgetRecentProject(filePath) {
  recentProjectPaths = removeRecentProject(recentProjectPaths, filePath)
  await persistRecentProjects()
  installApplicationMenu()
}

async function clearRecentProjects() {
  recentProjectPaths = []
  await persistRecentProjects()
  installApplicationMenu()
}

async function persistRecentProjects() {
  if (!recentProjectsStorePath) return
  recentProjectPaths = await saveRecentProjects(recentProjectsStorePath, recentProjectPaths)
}

async function openRecentProject(filePath, focusedWindow) {
  try {
    const projectPackage = await readProjectPackageWithValidation(filePath)
    await rememberRecentProject(filePath)
    activateProjectDirectory(projectPackage.content, projectPackage.projectDirectory)
    const targetWindow = focusedWindow ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (targetWindow) {
      targetWindow.webContents.send("rxnflow:open-project-content", {
        filePath,
        projectDirectory: projectPackage.projectDirectory,
        content: projectPackage.content,
        validation: projectPackage.validation,
        replaceProjects: Boolean(projectPackage.projectDirectory),
        source: "recent",
      })
    }
  } catch (error) {
    await forgetRecentProject(filePath)
    await dialog.showMessageBox({
      type: "error",
      message: "Could not open recent RxnFlow project",
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}

ipcMain.handle("rxnflow:choose-files", async () => {
  const result = await dialog.showOpenDialog({
    title: "Import calculation files",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Calculation outputs", extensions: ["log", "out", "xyz", "extxyz", "csv", "txt"] },
      { name: "All files", extensions: ["*"] },
    ],
  })

  if (result.canceled) {
    return { canceled: true, files: [] }
  }

  const files = await Promise.all(result.filePaths.map(readDesktopSourceFile))
  return {
    canceled: false,
    files: await attachEngineImportPreview(files),
  }
})

async function attachEngineImportPreview(files) {
  const preview = await runEngineRequest({
    command: "import.preview",
    files: files.map((file) => ({
      name: file.name,
      size: file.size,
      preview: file.preview,
      sourcePath: file.sourcePath,
    })),
  })
  if (!preview.ok || !Array.isArray(preview.data?.files)) return files

  return files.map((file, index) => ({
    ...file,
    parse: preview.data.files[index]?.parse,
  }))
}

ipcMain.handle("rxnflow:register-import-candidates", async (_event, payload) => {
  const mode = payload?.mode === "all" ? "all" : "selected"
  const files = Array.isArray(payload?.files)
    ? payload.files.map(registerFilePayload).filter(Boolean)
    : []
  if (files.length === 0) {
    return invalidEngineInput("Import registration requires at least one file.")
  }

  const request = {
    command: mode === "all" ? "import.register_all" : "import.register_selection",
    files,
  }
  if (mode === "selected") {
    const selections = Array.isArray(payload?.selections)
      ? payload.selections.map(registerSelectionPayload).filter(Boolean)
      : []
    if (selections.length === 0) {
      return invalidEngineInput("Import registration requires at least one selection.")
    }
    request.selections = selections
  }

  return runEngineRequest(request)
})

function registerFilePayload(file) {
  if (!file || typeof file !== "object") return null
  const id = typeof file.id === "string" && file.id ? file.id : null
  const name = typeof file.name === "string" && file.name ? file.name : null
  if (!id || !name) return null
  return {
    id,
    name,
    size: Number.isFinite(file.size) ? file.size : 0,
    preview: typeof file.preview === "string" ? file.preview : "",
    ...(typeof file.sourcePath === "string" && file.sourcePath ? { sourcePath: file.sourcePath } : {}),
    ...(file.parse && typeof file.parse === "object" ? { parse: file.parse } : {}),
  }
}

function registerSelectionPayload(selection) {
  if (!selection || typeof selection !== "object") return null
  const fileId = typeof selection.fileId === "string" && selection.fileId ? selection.fileId : null
  const objectIndices = Array.isArray(selection.objectIndices)
    ? selection.objectIndices.filter((index) => Number.isInteger(index))
    : []
  if (!fileId || objectIndices.length === 0) return null
  return { fileId, objectIndices }
}

function invalidEngineInput(message) {
  return {
    ok: false,
    error: {
      code: "invalid_input",
      message,
    },
  }
}

ipcMain.handle("rxnflow:save-json-snapshot", async (_event, payload) => {
  const defaultPath = payload?.defaultName || "rxnflow-flow.json"
  const content = typeof payload?.content === "string" ? payload.content : "{}"
  const result = await dialog.showSaveDialog({
    title: "Export RxnFlow snapshot",
    defaultPath,
    filters: [
      { name: "JSON", extensions: ["json"] },
      { name: "All files", extensions: ["*"] },
    ],
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  await fs.writeFile(result.filePath, content, "utf8")
  return { canceled: false, filePath: result.filePath }
})

ipcMain.handle("rxnflow:save-report-artifact", async (_event, payload) => {
  const defaultPath = payload?.defaultName || "rxnflow-export"
  const encoding = payload?.encoding === "base64" ? "base64" : "utf8"
  const content = typeof payload?.content === "string" ? payload.content : ""
  if (currentProjectDirectory) {
    return saveProjectReportArtifact(currentProjectDirectory, {
      defaultName: defaultPath,
      mimeType: payload?.mimeType,
      encoding,
      content,
    })
  }

  const result = await dialog.showSaveDialog({
    title: "Export RxnFlow report artifact",
    defaultPath,
    filters: [
      { name: "Report artifact", extensions: [path.extname(defaultPath).replace(".", "") || "*"] },
      { name: "All files", extensions: ["*"] },
    ],
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  if (encoding === "base64") {
    await fs.writeFile(result.filePath, Buffer.from(content, "base64"))
  } else {
    await fs.writeFile(result.filePath, content, "utf8")
  }
  return { canceled: false, filePath: result.filePath }
})

ipcMain.handle("rxnflow:open-project-package", async () => {
  const result = await dialog.showOpenDialog({
    title: "Open RxnFlow project folder",
    buttonLabel: "Open Folder",
    properties: ["openDirectory"],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  const filePath = result.filePaths[0]
  const projectPackage = await readProjectPackageWithValidation(filePath)
  activateProjectDirectory(projectPackage.content, projectPackage.projectDirectory)
  await rememberRecentProject(projectPackage.projectDirectory ?? filePath)
  return {
    canceled: false,
    filePath,
    projectDirectory: projectPackage.projectDirectory,
    content: projectPackage.content,
    validation: projectPackage.validation,
    replaceProjects: Boolean(projectPackage.projectDirectory),
  }
})

ipcMain.handle("rxnflow:get-startup-project-content", async () => {
  if (startupProjectRestoreConsumed) return { canceled: true }
  if (!startupProjectRestorePromise) return { canceled: true }
  startupProjectRestoreConsumed = true
  const payloads = await startupProjectRestorePromise
  if (!payloads || payloads.length === 0) return { canceled: true }
  const lastPayload = payloads[payloads.length - 1]
  return {
    canceled: false,
    ...lastPayload,
    projectContents: payloads,
  }
})

ipcMain.handle("rxnflow:create-project-folder", async (_event, payload) => {
  const content = typeof payload?.content === "string" ? payload.content : "{}"
  const identity = projectIdentityFromContent(content)
  const folderName = safeWorkspaceFolderName(payload?.projectLabel || identity?.label || "RxnFlow Project")
  const result = await dialog.showOpenDialog({
    title: "Choose where to create the RxnFlow project folder",
    buttonLabel: "Create Project Folder Here",
    properties: ["openDirectory", "createDirectory"],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  const projectDirectory = await uniqueProjectDirectory(path.join(result.filePaths[0], folderName))
  const savedProject = await saveProjectContent(projectDirectory, content, {
    previousProjectDirectory: currentProjectDirectory,
  })
  activateProjectDirectory(savedProject.content, savedProject.projectDirectory)
  await rememberRecentProject(savedProject.projectDirectory)
  const validation = await validateProjectPackageContent(savedProject.content, savedProject.projectDirectory)
  return {
    canceled: false,
    filePath: savedProject.filePath,
    projectDirectory: savedProject.projectDirectory,
    content: savedProject.content,
    validation,
  }
})

ipcMain.handle("rxnflow:save-project-package", async (_event, payload) => {
  const defaultPath = archiveDefaultPath(payload?.defaultName || "rxnflow-project.rxnflow.zip")
  const content = typeof payload?.content === "string" ? payload.content : "{}"
  const identity = projectIdentityFromContent(content)
  const exportProjectDirectory = projectDirectoryForIdentity(identity)
  if (!exportProjectDirectory) {
    return {
      canceled: false,
      projectDirectory: null,
      content,
      validation: projectFolderRequiredValidation("Export project needs an open project folder. Create or open a workspace folder first."),
    }
  }

  const result = await dialog.showSaveDialog({
    title: "Export RxnFlow project archive",
    defaultPath,
    filters: [
      { name: "RxnFlow project archive", extensions: ["zip"] },
      { name: "All files", extensions: ["*"] },
    ],
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  const archivedProject = await exportProjectWorkspaceArchive(exportProjectDirectory, result.filePath, {
    content,
    previousProjectDirectory: exportProjectDirectory,
  })
  const savedContent = await readProjectContent(archivedProject.projectDirectory)
  activateProjectDirectory(savedContent, archivedProject.projectDirectory)
  await rememberRecentProject(archivedProject.projectDirectory)
  const validation = await validateProjectPackageContent(savedContent, archivedProject.projectDirectory)
  return {
    canceled: false,
    filePath: archivedProject.filePath,
    projectDirectory: archivedProject.projectDirectory,
    content: savedContent,
    validation,
  }
})

ipcMain.handle("rxnflow:autosave-project-package", async (_event, payload) => {
  const defaultPath = payload?.defaultName || "rxnflow-project.rxnflow"
  const content = typeof payload?.content === "string" ? payload.content : "{}"
  const identity = projectIdentityFromContent(content)
  const projectDirectory = autosaveProjectDirectory(identity, defaultPath)
  if (!projectDirectory) {
    return {
      canceled: false,
      filePath: null,
      projectDirectory: null,
      content,
      validation: projectFolderRequiredValidation("Create or open a project folder before autosave can copy source files."),
    }
  }
  const previousProjectDirectory = identity?.id
    ? projectDirectoriesById.get(identity.id) ?? currentProjectDirectory
    : currentProjectDirectory
  const savedProject = await saveProjectContent(projectDirectory, content, {
    previousProjectDirectory,
  })
  activateProjectDirectory(savedProject.content, savedProject.projectDirectory)
  await rememberRecentProject(savedProject.filePath)
  const validation = await validateProjectPackageContent(savedProject.content, savedProject.projectDirectory)
  return {
    canceled: false,
    filePath: savedProject.filePath,
    projectDirectory: savedProject.projectDirectory,
    content: savedProject.content,
    validation,
  }
})

ipcMain.handle("rxnflow:engine-status", async () => getEngineStatus())

async function readProjectPackageWithValidation(filePath) {
  const rawContent = await readProjectContent(filePath)
  const projectDirectory = await projectDirectoryForOpenedPath(filePath)
  const content = await enrichProjectContentWithStoredSourceCoordinates(rawContent, projectDirectory)
  const validation = await validateProjectPackageContent(content, projectDirectory)
  return {
    content,
    projectDirectory,
    validation,
  }
}

async function enrichProjectContentWithStoredSourceCoordinates(content, projectDirectory) {
  if (!projectDirectory) return content
  let projectPackage
  try {
    projectPackage = JSON.parse(content)
  } catch {
    return content
  }
  const files = Array.isArray(projectPackage?.files) ? projectPackage.files : []
  const targets = files.flatMap((file, index) => {
    if (!shouldHydrateStoredSourceFile(file)) return []
    const sourcePath = path.join(projectDirectory, file.storedPath)
    return [{
      index,
      file,
      sourcePath,
    }]
  })
  if (targets.length === 0) return content

  const preview = await runEngineRequest({
    command: "import.preview",
    files: targets.map((target) => ({
      name: typeof target.file.name === "string" && target.file.name ? target.file.name : path.basename(target.sourcePath),
      size: Number.isFinite(target.file.size) ? target.file.size : 0,
      preview: typeof target.file.preview === "string" ? target.file.preview : "",
      sourcePath: target.sourcePath,
    })),
  }, { timeoutMs: 20000, preferEmbedded: true })
  if (!preview.ok || !Array.isArray(preview.data?.files)) return content

  let changed = false
  const nextFiles = [...files]
  targets.forEach((target, resultIndex) => {
    const parse = preview.data.files[resultIndex]?.parse
    if (!parse || (!parseHasCoordinateAtoms(parse) && target.file.parse)) return
    nextFiles[target.index] = {
      ...target.file,
      kind: typeof parse.sourceKind === "string" && parse.sourceKind ? parse.sourceKind : target.file.kind,
      status: target.file.status === "ready" ? "parsed" : target.file.status,
      parse,
    }
    changed = true
  })

  if (!changed) return content
  return `${JSON.stringify({ ...projectPackage, files: nextFiles }, null, 2)}\n`
}

function shouldHydrateStoredSourceFile(file) {
  if (!file || typeof file !== "object") return false
  if (typeof file.storedPath !== "string" || !isSafeProjectRelativePath(file.storedPath)) return false
  const sourceKind = String(file.parse?.sourceKind || file.kind || "").toLowerCase()
  const likelyCoordinateSource = ["gaussian", "orca", "xyz", "extxyz", "maple"].some((kind) => sourceKind.includes(kind))
  if (!likelyCoordinateSource && file.parse) return false
  return !parseHasCoordinateAtoms(file.parse)
}

function parseHasCoordinateAtoms(parse) {
  if (!parse || typeof parse !== "object") return false
  if (coordinatePreviewHasAtoms(parse.coordinatePreview)) return true
  return Array.isArray(parse.candidates) && parse.candidates.some((candidate) => coordinatePreviewHasAtoms(candidate?.coordinatePreview))
}

function coordinatePreviewHasAtoms(coordinatePreview) {
  return Array.isArray(coordinatePreview?.atoms) && coordinatePreview.atoms.length > 0
}

async function validateProjectPackageContent(content, projectDirectory) {
  try {
    const response = await runEngineRequest({
      command: "project.validate",
      content,
      ...(projectDirectory ? { projectPath: projectDirectory } : {}),
    }, {
      timeoutMs: 5000,
      preferEmbedded: Buffer.byteLength(content, "utf8") > projectValidationEmbeddedThresholdBytes,
    })
    return response.ok ? response.data : null
  } catch {
    return null
  }
}

async function readDesktopSourceFile(filePath) {
  const stats = await fs.stat(filePath)
  const handle = await fs.open(filePath, "r")
  try {
    const length = Math.min(stats.size, 64 * 1024)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, 0)
    return {
      name: path.basename(filePath),
      size: stats.size,
      preview: buffer.toString("utf8"),
      sourcePath: filePath,
    }
  } finally {
    await handle.close()
  }
}

function activateProjectDirectory(content, projectDirectory) {
  const identity = projectIdentityFromContent(content)
  currentProjectId = identity?.id ?? currentProjectId
  if (!projectDirectory) {
    currentProjectDirectory = null
    return
  }
  currentProjectDirectory = projectDirectory
  if (identity?.id) projectDirectoriesById.set(identity.id, projectDirectory)
}

function autosaveProjectDirectory(identity, defaultPath) {
  const projectDirectory = projectDirectoryForIdentity(identity)
  if (projectDirectory) return projectDirectory
  return null
}

function projectDirectoryForIdentity(identity) {
  if (identity?.id) {
    const mappedDirectory = projectDirectoriesById.get(identity.id)
    if (mappedDirectory) return mappedDirectory
  }
  if (identity?.id && currentProjectDirectory && currentProjectId === identity.id) {
    return currentProjectDirectory
  }
  return null
}

async function projectDirectoryForOpenedPath(openedPath) {
  try {
    const stats = await fs.stat(openedPath)
    if (stats.isDirectory()) {
      await resolveProjectStatePath(openedPath)
      return path.resolve(openedPath)
    }
  } catch {
    return null
  }

  const stateFileName = path.basename(openedPath)
  const metadataDirectory = path.basename(path.dirname(openedPath))
  if (stateFileName === "project.json" && metadataDirectory === ".rxnflow") {
    return path.dirname(path.dirname(openedPath))
  }
  return null
}

function isSafeProjectRelativePath(projectPath) {
  if (typeof projectPath !== "string" || !projectPath) return false
  if (path.isAbsolute(projectPath)) return false
  return !projectPath.split(/[\\/]+/).includes("..")
}

function projectFolderRequiredValidation(message) {
  return {
    valid: true,
    summary: {},
    issues: [{
      severity: "warning",
      code: "project_folder_required",
      message,
    }],
  }
}

function archiveDefaultPath(defaultName) {
  const stem = String(defaultName || "rxnflow-project")
    .replace(/\.rxnflow\.zip$/i, "")
    .replace(/\.rxnflow$/i, "")
    .replace(/\.json$/i, "")
  return `${safeProjectPathStem(stem) || "rxnflow-project"}.rxnflow.zip`
}

async function uniqueProjectDirectory(preferredPath) {
  const resolved = path.resolve(preferredPath)
  try {
    await fs.access(resolved)
  } catch {
    return resolved
  }

  const parent = path.dirname(resolved)
  const basename = path.basename(resolved)
  for (let index = 2; index < 1000; index += 1) {
    const candidate = path.join(parent, `${basename} ${index}`)
    try {
      await fs.access(candidate)
    } catch {
      return candidate
    }
  }
  return path.join(parent, `${basename} ${Date.now()}`)
}

function projectIdentityFromContent(content) {
  try {
    const value = JSON.parse(content)
    const project = value?.project
    if (!project || typeof project !== "object") return null
    const id = typeof project.id === "string" && project.id ? project.id : null
    const label = typeof project.label === "string" && project.label ? project.label : null
    if (!id && !label) return null
    return { id, label }
  } catch {
    return null
  }
}

function safeProjectPathStem(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
}

function safeWorkspaceFolderName(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[<>:\"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 96)
    .trim()
  return cleaned || "RxnFlow Project"
}

app.whenReady().then(async () => {
  app.setName("RxnFlow")
  recentProjectsStorePath = path.join(userDataDirectoryOverride || app.getPath("userData"), "recent-projects.json")
  recentProjectPaths = await loadRecentProjects(recentProjectsStorePath)
  installApplicationMenu()
  createMainWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
