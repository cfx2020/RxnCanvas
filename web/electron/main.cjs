const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, shell } = require("electron")
const fs = require("node:fs/promises")
const path = require("node:path")
const { getEngineStatus, runEngineRequest } = require("./engine-bridge.cjs")
const {
  exportProjectWorkspaceArchive,
  materializeImportSourceFile,
  readProjectContent,
  resolveProjectStatePath,
  saveProjectContent,
  saveProjectReportArtifact,
  slimProjectPackageForPersistence,
} = require("./project-store.cjs")
const {
  loadRecentProjectsState,
  saveRecentProjectsState,
  recordRecentProjectState,
  removeRecentProjectState,
  recentProjectLabel,
} = require("./recent-projects.cjs")
const {
  loadPreferences,
  patchPreferences,
  savePreferences,
} = require("./preferences-store.cjs")
const {
  appLabel,
  openFileWithApp,
  resolveOpenerApp,
  sourceOpenerProfile,
} = require("./source-openers.cjs")

const devServerUrl = process.env.RXNFLOW_DESKTOP_DEV_SERVER
const runtimeSmokeExit = process.argv.includes("--rxnflow-smoke-exit")
const runtimeStartupRestoreSmoke = process.env.RXNFLOW_DESKTOP_SMOKE_STARTUP_RESTORE === "1"
const runtimeSmokeTimeoutMs = Number.parseInt(process.env.RXNFLOW_DESKTOP_SMOKE_TIMEOUT_MS || "12000", 10)
const userDataDirectoryOverride = process.env.RXNFLOW_DESKTOP_USER_DATA_DIR
const macTrafficLightPosition = { x: 18, y: 12 }
let recentProjectPaths = []
let activeProjectPath = null
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
    titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
    ...(process.platform === "darwin" ? { trafficLightPosition: macTrafficLightPosition } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  installMacWindowControls(window)
  installWindowStateBridge(window)

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

function windowStatePayload(window) {
  return {
    isFullScreen: typeof window.isFullScreen === "function" ? window.isFullScreen() : false,
    isMaximized: typeof window.isMaximized === "function" ? window.isMaximized() : false,
  }
}

function sendWindowState(window) {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return
  window.webContents.send("rxnflow:window-state-changed", windowStatePayload(window))
}

function installWindowStateBridge(window) {
  const notifySoon = () => {
    sendWindowState(window)
    setTimeout(() => sendWindowState(window), 0)
  }
  window.on("maximize", notifySoon)
  window.on("unmaximize", notifySoon)
  window.on("enter-full-screen", notifySoon)
  window.on("leave-full-screen", notifySoon)
  window.on("restore", notifySoon)
  window.webContents.on("did-finish-load", notifySoon)
}

function installMacWindowControls(window) {
  if (process.platform !== "darwin") return
  const keepControlsVisible = () => {
    if (window.isDestroyed()) return
    if (typeof window.setWindowButtonVisibility === "function") {
      window.setWindowButtonVisibility(true)
    }
    if (typeof window.setWindowButtonPosition === "function") {
      window.setWindowButtonPosition(macTrafficLightPosition)
    }
  }
  const keepControlsVisibleAfterNativeStateChange = () => {
    keepControlsVisible()
    setTimeout(keepControlsVisible, 0)
  }

  keepControlsVisible()
  window.on("show", keepControlsVisibleAfterNativeStateChange)
  window.on("focus", keepControlsVisibleAfterNativeStateChange)
  window.on("blur", keepControlsVisibleAfterNativeStateChange)
  window.on("enter-full-screen", keepControlsVisibleAfterNativeStateChange)
  window.on("leave-full-screen", keepControlsVisibleAfterNativeStateChange)
}

function prepareStartupProjectRestore() {
  startupProjectRestoreConsumed = false
  startupProjectRestorePromise = restoreRecentProjectPayloads()
}

async function restoreRecentProjectPayloads() {
  for (const filePath of startupRestoreProjectPaths()) {
    try {
      const startupDirectory = await projectDirectoryForStartupRestore(filePath)
      if (!startupDirectory) {
        await forgetRecentProject(filePath)
        continue
      }
      const projectPackage = await readProjectPackageWithValidation(filePath)
      activateProjectDirectory(projectPackage.content, projectPackage.projectDirectory)
      const restoredPath = projectPackage.projectDirectory ?? filePath
      const state = recordRecentProjectState(
        { projectPaths: recentProjectPaths, activeProjectPath },
        restoredPath,
      )
      recentProjectPaths = state.projectPaths
      activeProjectPath = state.activeProjectPath
      await persistRecentProjects()
      return [{
        filePath,
        projectDirectory: projectPackage.projectDirectory,
        content: projectPackage.content,
        validation: projectPackage.validation,
        replaceProjects: true,
        source: "startup",
      }]
    } catch (error) {
      await forgetRecentProject(filePath)
      console.warn(`Could not restore recent RxnFlow project ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return []
}

function startupRestoreProjectPaths() {
  const paths = uniqueRuntimeProjectPaths(recentProjectPaths)
  const activeKey = activeProjectPath ? runtimeProjectComparisonKey(activeProjectPath) : null
  const withoutActive = activeKey
    ? paths.filter((filePath) => runtimeProjectComparisonKey(filePath) !== activeKey)
    : paths
  const ordered = []
  if (activeProjectPath) ordered.push(activeProjectPath)
  ordered.push(...withoutActive)
  return uniqueRuntimeProjectPaths(ordered)
}

async function projectDirectoryForStartupRestore(filePath) {
  const projectDirectory = await projectDirectoryForOpenedPath(filePath)
  if (!projectDirectory) return null
  if (isBundledOrManagedRuntimeProjectDirectory(projectDirectory)) return null
  return projectDirectory
}

function isBundledOrManagedRuntimeProjectDirectory(projectDirectory) {
  const userDataRoot = path.resolve(userDataDirectory())
  const managedProjectsRoot = path.join(userDataRoot, "projects")
  return isPathInside(projectDirectory, managedProjectsRoot)
}

function userDataDirectory() {
  return userDataDirectoryOverride || app.getPath("userData")
}

async function updatePreferences(patch) {
  const preferences = await patchPreferences(userDataDirectory(), patch)
  nativeTheme.themeSource = preferences.appearance
  broadcastPreferencesChanged(preferences)
  return preferences
}

function broadcastPreferencesChanged(preferences) {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) window.webContents.send("rxnflow:preferences-changed", preferences)
  })
}

async function chooseExternalApplication(profile) {
  const result = await dialog.showOpenDialog({
    title: profile === "gaussian" ? "Choose GaussView" : "Choose text editor",
    message: profile === "gaussian" ? "Choose the application used to open Gaussian source files." : "Choose the application used to open text output files.",
    properties: process.platform === "darwin" ? ["openFile", "openDirectory"] : ["openFile"],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const appPath = path.resolve(result.filePaths[0])
  return {
    appPath,
    label: appLabel(appPath),
  }
}

const chemicalClipboardFormatPattern = /(cdxml|chem|chemical|molfile|mdl|mol|rxn|skc|com\.cambridgesoft|public\.utf8|text|xml|html)/i
const maxClipboardPayloadChars = 2 * 1024 * 1024

function chemicalClipboardPayloads(formats) {
  const payloads = []
  const seen = new Set()
  for (const format of formats) {
    if (!chemicalClipboardFormatPattern.test(format)) continue
    try {
      const buffer = clipboard.readBuffer(format)
      const decoded = decodeClipboardBuffer(buffer)
      if (!decoded || seen.has(decoded)) continue
      seen.add(decoded)
      payloads.push({ format, text: clampClipboardText(decoded) })
    } catch (_error) {
      // Some native pasteboard flavors advertise a format but cannot be read
      // from the sandboxed renderer path. Ignore those and keep the readable
      // formats; the renderer will try each candidate in priority order.
    }
  }
  return payloads
}

function clampClipboardText(text) {
  return text.length > maxClipboardPayloadChars ? text.slice(0, maxClipboardPayloadChars) : text
}

function decodeClipboardBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return ""
  const hasUtf16Pattern = buffer.length > 3 && (
    (buffer[0] === 0xff && buffer[1] === 0xfe)
    || (buffer[0] === 0xfe && buffer[1] === 0xff)
    || buffer.subarray(0, Math.min(buffer.length, 80)).filter((byte, index) => index % 2 === 1 && byte === 0).length > 12
  )
  const utf8 = buffer.toString("utf8").replace(/\u0000/g, "").trim()
  const utf16 = hasUtf16Pattern ? buffer.toString("utf16le").replace(/^\ufeff/, "").replace(/\u0000/g, "").trim() : ""
  const decoded = utf16.length > utf8.length ? utf16 : utf8
  if (!decoded) return ""
  const printableRatio = decoded.replace(/[^\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]/g, "").length / Math.max(decoded.length, 1)
  return printableRatio > 0.72 ? decoded : ""
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
              && Boolean(document.querySelector(".project-rail"))
              && Boolean(document.querySelector(".floating-export-trigger"))
            if (hasWorkbench) {
              try {
                const hasNodeSidebar = Boolean(document.querySelector(".inspector-panel .node-inspector-stack"))
                const hasExportTrigger = Boolean(document.querySelector(".floating-export-trigger"))
                if (!hasNodeSidebar || !hasExportTrigger) {
                  reject(new Error("desktop renderer must expose node inspector and floating export trigger"))
                  return
                }
                const lowerText = text.toLowerCase()
                const forbiddenHits = forbiddenRuntimeUiTerms.filter((term) => lowerText.includes(term.toLowerCase()))
                if (forbiddenHits.length > 0) {
                  reject(new Error("desktop renderer exposed inactive UI: " + forbiddenHits.join(", ")))
                  return
                }
                if (startupRestoreSmoke) {
                  const stillShowingDemoProjects = ["Diels-Alder Study", "Nickel catalysis", "Ir screening", "Older Restore Smoke"]
                    .filter((label) => text.includes(label))
                  if (!text.includes("Startup Restore Smoke") || stillShowingDemoProjects.length > 0) {
                    if (Date.now() <= deadline) {
                      window.setTimeout(poll, 100)
                      return
                    }
                    reject(new Error("desktop renderer did not restore the active recent workspace without demo projects"))
                    return
                  }
                }
                const exportTrigger = document.querySelector(".floating-export-trigger")
                if (!exportTrigger) {
                  reject(new Error("desktop renderer floating export trigger is missing"))
                  return
                }
                exportTrigger.click()
                await new Promise((resolve) => window.setTimeout(resolve, 0))
                const exportPanel = document.querySelector(".export-float-panel .export-panel")
                const exportFormats = Array.from(document.querySelectorAll(".export-menu-item"))
                  .map((button) => button.textContent?.trim())
                  .filter(Boolean)
                if (!exportPanel || exportFormats.join("|") !== "PNG|XLSX|CDXML") {
                  reject(new Error("desktop renderer export formats must be PNG, XLSX, CDXML"))
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
                const cclib = status.data.dependencies?.cclib
                if (status.data.runtime !== "bundled-python" || cclib?.available !== true) {
                  reject(new Error("desktop packaged runtime must use bundled Python engine with cclib"))
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
                    schemaVersion: 2,
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
                    canvases: [{
                      id: "canvas-1",
                      label: "画布 1",
                      nodes: [],
                      edges: [],
                      barriers: [],
                      viewport: { x: 0, y: 0, zoom: 1 },
                      selectedNodeIds: [],
                      selectedEdgeIds: [],
                      selectedBarrierIds: [],
                    }],
                    activeCanvasId: "canvas-1",
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
                  cclibVersion: cclib.version || "unknown",
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
      finish(0, `RXNFLOW_DESKTOP_RUNTIME_SMOKE_OK ${result.engineVersion} ${result.runtime} cclib=${result.cclibVersion}`)
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
  const state = recordRecentProjectState({ projectPaths: recentProjectPaths, activeProjectPath }, filePath)
  recentProjectPaths = state.projectPaths
  activeProjectPath = state.activeProjectPath
  await persistRecentProjects()
  installApplicationMenu()
}

async function forgetRecentProject(filePath) {
  const state = removeRecentProjectState({ projectPaths: recentProjectPaths, activeProjectPath }, filePath)
  recentProjectPaths = state.projectPaths
  activeProjectPath = state.activeProjectPath
  await persistRecentProjects()
  installApplicationMenu()
}

async function clearRecentProjects() {
  recentProjectPaths = []
  activeProjectPath = null
  await persistRecentProjects()
  installApplicationMenu()
}

async function persistRecentProjects() {
  if (!recentProjectsStorePath) return
  const state = await saveRecentProjectsState(recentProjectsStorePath, { projectPaths: recentProjectPaths, activeProjectPath })
  recentProjectPaths = state.projectPaths
  activeProjectPath = state.activeProjectPath
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

ipcMain.handle("rxnflow:get-window-state", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  return window ? windowStatePayload(window) : { isFullScreen: false, isMaximized: false }
})

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
    files,
  }
})

ipcMain.handle("rxnflow:show-import-issues", async (event, payload) => {
  const issue = importIssueMessagePayload(payload)
  if (issue.entries.length === 0) return { ok: true, shown: false }
  const window = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()
  const options = {
    type: issue.type,
    buttons: ["OK"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    message: issue.title,
    detail: importIssueMessageDetail(issue.entries),
  }
  if (window) {
    await dialog.showMessageBox(window, options)
  } else {
    await dialog.showMessageBox(options)
  }
  return { ok: true, shown: true }
})

ipcMain.handle("rxnflow:import-source-files", async (_event, payload) => {
  const files = Array.isArray(payload?.files)
    ? payload.files.map(importSourceFilePayload).filter(Boolean)
    : []
  if (files.length === 0) {
    return invalidEngineInput("Source import requires at least one file.")
  }

  const projectId = typeof payload?.projectId === "string" && payload.projectId ? payload.projectId : null
  let projectDirectory = projectId ? projectDirectoriesById.get(projectId) : currentProjectDirectory
  if (!projectDirectory && projectId) {
    projectDirectory = await projectDirectoryFromActiveProjectPayload(projectId, payload)
  }
  const warnings = []
  if (!projectDirectory) {
    warnings.push({
      code: "project_folder_required",
      message: "No project folder is bound, so imported sources could not be copied into sources/ before parsing.",
    })
  }

  const usedStoredPaths = new Set()
  const stagedFiles = await Promise.all(files.map(async (file, index) => {
    if (!projectDirectory) return importSourceFileForPreview(file)
    try {
      const materialized = await materializeImportSourceFile(projectDirectory, file, index, { usedStoredPaths })
      return {
        ...materialized,
        parseSourcePath: materialized.sourcePath,
      }
    } catch (error) {
      return {
        ...importSourceFileForPreview(file),
        error: {
          code: "source_materialize_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }))

  const parseTargets = stagedFiles.filter((file) => !file.error)
  if (parseTargets.length === 0) {
    return {
      ok: true,
      data: {
        files: stagedFiles.map(importSourceFileRendererPayload),
      },
      ...(warnings.length > 0 ? { warnings } : {}),
    }
  }

  const preview = await runEngineRequest({
    command: "import.preview",
    files: parseTargets.map((file) => ({
      name: file.name,
      size: file.size,
      preview: file.preview,
      ...(file.parseSourcePath ? { sourcePath: file.parseSourcePath } : {}),
    })),
  }, { timeoutMs: 60000 })

  if (!preview.ok || !Array.isArray(preview.data?.files)) {
    return {
      ok: true,
      data: {
        files: stagedFiles.map(importSourceFileRendererPayload),
      },
      warnings: [
        ...warnings,
        {
          code: preview.error?.code || "import_preview_failed",
          message: preview.error?.message || "The local parser did not return import preview data.",
        },
      ],
    }
  }

  return {
    ok: true,
    data: {
      files: stagedFiles.map((file) => {
        if (file.error) return importSourceFileRendererPayload(file)
        const parseIndex = parseTargets.indexOf(file)
        return {
          ...importSourceFileRendererPayload(file),
          parse: preview.data.files[parseIndex]?.parse,
        }
      }),
    },
    ...(warnings.length > 0 ? { warnings } : {}),
  }
})

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


ipcMain.handle("rxnflow:parse-source-preview", async (_event, payload) => {
  const projectId = typeof payload?.projectId === "string" ? payload.projectId : null
  const projectDirectory = projectId ? projectDirectoriesById.get(projectId) : currentProjectDirectory
  const candidates = []
  const storedPath = typeof payload?.storedPath === "string" ? payload.storedPath : null
  if (projectDirectory && storedPath && isSafeProjectRelativePath(storedPath)) {
    candidates.push(path.join(projectDirectory, storedPath))
  }
  const sourcePath = typeof payload?.sourcePath === "string" ? payload.sourcePath : null
  if (sourcePath && path.isAbsolute(sourcePath)) candidates.push(sourcePath)
  const sourceFilePath = candidates[0] ?? null
  const response = await runEngineRequest({
    command: "import.preview",
    files: [{
      name: typeof payload?.name === "string" && payload.name ? payload.name : (sourceFilePath ? path.basename(sourceFilePath) : "source"),
      size: Number.isFinite(payload?.size) ? payload.size : 0,
      preview: typeof payload?.preview === "string" ? payload.preview : "",
      ...(sourceFilePath ? { sourcePath: sourceFilePath } : {}),
    }],
  }, { timeoutMs: 20000 })
  if (!response.ok) return response
  const parse = response.data?.files?.[0]?.parse ?? null
  return { ok: true, data: { parse } }
})

function importSourceFilePayload(file) {
  if (!file || typeof file !== "object") return null
  const id = typeof file.id === "string" && file.id ? file.id : null
  const name = typeof file.name === "string" && file.name ? file.name : null
  if (!id || !name) return null
  const size = Number.isFinite(file.size) ? file.size : 0
  const preview = typeof file.preview === "string" ? file.preview : ""
  const sourcePath = typeof file.sourcePath === "string" && path.isAbsolute(file.sourcePath) ? file.sourcePath : undefined
  const storedPath = typeof file.storedPath === "string" && isSafeProjectRelativePath(file.storedPath) ? file.storedPath : undefined
  return {
    id,
    name,
    size,
    preview,
    ...(sourcePath ? { sourcePath } : {}),
    ...(storedPath ? { storedPath } : {}),
  }
}

function importSourceFileForPreview(file) {
  const sourcePath = typeof file.sourcePath === "string" && path.isAbsolute(file.sourcePath) ? file.sourcePath : null
  return {
    id: file.id,
    name: file.name,
    size: Number.isFinite(file.size) ? file.size : 0,
    preview: typeof file.preview === "string" ? file.preview : "",
    ...(typeof file.storedPath === "string" ? { storedPath: file.storedPath } : {}),
    ...(sourcePath ? { sourcePath, parseSourcePath: sourcePath } : {}),
  }
}

function importSourceFileRendererPayload(file) {
  const {
    parseSourcePath: _parseSourcePath,
    ...rest
  } = file
  if (rest.storedPath) delete rest.sourcePath
  return rest
}

function importIssueMessagePayload(payload) {
  const entries = Array.isArray(payload?.entries)
    ? payload.entries.map(importIssueEntryPayload).filter(Boolean)
    : []
  const hasUnsupported = entries.some((entry) => entry.code === "unsupported_format")
  const title = typeof payload?.title === "string" && payload.title.trim()
    ? payload.title.trim()
    : hasUnsupported
      ? "Unsupported import format"
      : "Import failed"
  return {
    title,
    type: hasUnsupported ? "warning" : "error",
    entries,
  }
}

function importIssueEntryPayload(entry) {
  if (!entry || typeof entry !== "object") return null
  const fileName = typeof entry.fileName === "string" && entry.fileName.trim()
    ? entry.fileName.trim()
    : "Source file"
  const code = typeof entry.code === "string" ? entry.code : ""
  const message = typeof entry.message === "string" && entry.message.trim()
    ? entry.message.trim()
    : "This source could not be imported."
  return { fileName, code, message }
}

function importIssueMessageDetail(entries) {
  const visibleEntries = entries.slice(0, 8)
  const lines = visibleEntries.flatMap((entry) => [
    entry.fileName,
    entry.message,
    "",
  ])
  if (entries.length > visibleEntries.length) {
    lines.push(`${entries.length - visibleEntries.length} more files failed.`)
  }
  return lines.join("\n").trim()
}

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
    ...(typeof file.storedPath === "string" && file.storedPath ? { storedPath: file.storedPath } : {}),
    ...(typeof file.checksum === "string" && file.checksum ? { checksum: file.checksum } : {}),
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
    defaultPath: app.getPath("documents"),
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
  }
})

ipcMain.handle("rxnflow:create-project-folder", async (_event, payload) => {
  const content = typeof payload?.content === "string" ? payload.content : "{}"
  const identity = projectIdentityFromContent(content)
  const folderName = safeWorkspaceFolderName(payload?.projectLabel || identity?.label || "RxnFlow Project")
  const result = await dialog.showOpenDialog({
    title: "Choose where to create the RxnFlow project folder",
    buttonLabel: "Create Project Folder Here",
    defaultPath: app.getPath("documents"),
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

ipcMain.handle("rxnflow:set-active-project", async (_event, payload) => {
  const projectId = typeof payload?.projectId === "string" ? payload.projectId : null
  if (!projectId) return { ok: false }
  let projectDirectory = projectDirectoriesById.get(projectId)
  if (!projectDirectory) {
    projectDirectory = await projectDirectoryFromActiveProjectPayload(projectId, payload)
  }
  if (!projectDirectory) return { ok: false }
  currentProjectId = projectId
  currentProjectDirectory = projectDirectory
  projectDirectoriesById.set(projectId, projectDirectory)
  await rememberRecentProject(projectDirectory)
  return { ok: true, projectDirectory }
})

ipcMain.handle("rxnflow:forget-project", async (_event, payload) => {
  const projectId = typeof payload?.projectId === "string" ? payload.projectId : null
  if (!projectId) return { ok: false }
  const projectDirectory = projectDirectoriesById.get(projectId)
  if (!projectDirectory) return { ok: false }
  projectDirectoriesById.delete(projectId)
  if (currentProjectId === projectId) {
    currentProjectId = null
    currentProjectDirectory = null
  }
  await forgetRecentProject(projectDirectory)
  return { ok: true, projectDirectory }
})

ipcMain.handle("rxnflow:get-preferences", async () => {
  const preferences = await loadPreferences(userDataDirectory())
  nativeTheme.themeSource = preferences.appearance
  return { ok: true, preferences }
})

ipcMain.handle("rxnflow:set-preferences", async (_event, patch) => {
  const preferences = await updatePreferences(patch && typeof patch === "object" ? patch : {})
  return { ok: true, preferences }
})

ipcMain.handle("rxnflow:choose-external-app", async (_event, payload) => {
  const profile = payload?.profile === "gaussian" ? "gaussian" : "text"
  const selected = await chooseExternalApplication(profile)
  if (!selected) return { canceled: true }
  const preferences = await updatePreferences({
    sourceOpeners: {
      [profile]: selected,
    },
  })
  return { canceled: false, ...selected, preferences }
})

ipcMain.handle("rxnflow:read-chemical-clipboard", async () => {
  try {
    const formats = clipboard.availableFormats("clipboard")
    const text = clipboard.readText("clipboard")
    const html = clipboard.readHTML("clipboard")
    const payloads = chemicalClipboardPayloads(formats)
    return {
      ok: true,
      formats,
      ...(text ? { text: clampClipboardText(text) } : {}),
      ...(html ? { html: clampClipboardText(html) } : {}),
      payloads,
    }
  } catch (error) {
    return {
      ok: false,
      formats: [],
      error: error instanceof Error ? error.message : "Could not read clipboard.",
    }
  }
})

ipcMain.handle("rxnflow:open-source-file", async (_event, payload) => {
  const candidates = []
  const projectId = typeof payload?.projectId === "string" ? payload.projectId : null
  const projectDirectory = projectId ? projectDirectoriesById.get(projectId) : currentProjectDirectory
  const storedPath = typeof payload?.storedPath === "string" ? payload.storedPath : null
  if (projectDirectory && storedPath && isSafeProjectRelativePath(storedPath)) {
    candidates.push(path.join(projectDirectory, storedPath))
  }
  const sourcePath = typeof payload?.sourcePath === "string" ? payload.sourcePath : null
  if (sourcePath && path.isAbsolute(sourcePath)) candidates.push(sourcePath)

  for (const candidate of candidates) {
    const filePath = path.resolve(candidate)
    try {
      const stats = await fs.stat(filePath)
      if (!stats.isFile()) continue
      const profile = sourceOpenerProfile(payload)
      let preferences = await loadPreferences(userDataDirectory())
      let opener = await resolveOpenerApp({ profile, preferences, platform: process.platform })
      if (!opener) {
        const selected = await chooseExternalApplication(profile)
        if (!selected) return { ok: false, canceled: true, filePath, profile }
        preferences = await updatePreferences({ sourceOpeners: { [profile]: selected } })
        opener = { ...selected, source: "selected" }
      }
      const result = await openFileWithApp({ appPath: opener.appPath, filePath, platform: process.platform })
      if (result.ok) return { ok: true, filePath, profile, appPath: opener.appPath }
      return { ok: false, filePath, profile, appPath: opener.appPath, error: result.error }
    } catch {
      // Try the next candidate.
    }
  }
  return { ok: false, error: "Raw source file is not available in the project folder." }
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
  let projectPackage
  try {
    projectPackage = JSON.parse(content)
  } catch {
    return content
  }
  const files = Array.isArray(projectPackage?.files) ? projectPackage.files : []
  const slimContent = () => `${JSON.stringify(slimProjectPackageForPersistence(projectPackage))}\n`
  if (!projectDirectory) return slimContent()
  const targets = files.flatMap((file, index) => {
    if (!shouldHydrateStoredSourceFile(file)) return []
    const sourcePath = path.join(projectDirectory, file.storedPath)
    return [{
      index,
      file,
      sourcePath,
    }]
  })
  if (targets.length === 0) return slimContent()

  const preview = await runEngineRequest({
    command: "import.preview",
    files: targets.map((target) => ({
      name: typeof target.file.name === "string" && target.file.name ? target.file.name : path.basename(target.sourcePath),
      size: Number.isFinite(target.file.size) ? target.file.size : 0,
      preview: typeof target.file.preview === "string" ? target.file.preview : "",
      sourcePath: target.sourcePath,
    })),
  }, { timeoutMs: 20000 })
  if (!preview.ok || !Array.isArray(preview.data?.files)) return slimContent()

  let changed = false
  const nextFiles = [...files]
  targets.forEach((target, resultIndex) => {
    const parse = preview.data.files[resultIndex]?.parse
    if (!shouldReplaceStoredSourceParse(target.file.parse, parse)) return
    nextFiles[target.index] = {
      ...target.file,
      kind: typeof parse.sourceKind === "string" && parse.sourceKind ? parse.sourceKind : target.file.kind,
      status: parse.parsed ? "parsed" : target.file.status === "ready" ? "parsed" : target.file.status,
      parse,
    }
    changed = true
  })

  const nextProjectPackage = slimProjectPackageForPersistence({ ...projectPackage, files: changed ? nextFiles : files })
  return `${JSON.stringify(nextProjectPackage)}\n`
}

function shouldHydrateStoredSourceFile(file) {
  if (!file || typeof file !== "object") return false
  if (typeof file.storedPath !== "string" || !isSafeProjectRelativePath(file.storedPath)) return false
  const sourceKind = String(file.parse?.sourceKind || file.kind || "").toLowerCase()
  const likelyCoordinateSource = ["gaussian", "orca", "xyz", "extxyz", "maple"].some((kind) => sourceKind.includes(kind))
  const missingFullFileMetadata = !parseHasComputationMetadata(file.parse) || !parseHasBasisFunctionCount(file.parse)
  if (!likelyCoordinateSource && file.parse && !missingFullFileMetadata) return false
  return !parseHasCoordinateAtoms(file.parse) || missingFullFileMetadata
}

function shouldReplaceStoredSourceParse(currentParse, nextParse) {
  if (!nextParse) return false
  if (!currentParse) return true
  if (sourceParseHasPendingDesktopJob(currentParse)) return true
  if (parseHasCoordinateAtoms(nextParse) && !parseHasCoordinateAtoms(currentParse)) return true
  if (parseHasComputationMetadata(nextParse) && !parseHasComputationMetadata(currentParse)) return true
  if (parseHasBasisFunctionCount(nextParse) && !parseHasBasisFunctionCount(currentParse)) return true
  return false
}

function sourceParseHasPendingDesktopJob(parse) {
  if (!parse || typeof parse !== "object" || !Array.isArray(parse.warnings)) return false
  return parse.warnings.some((warning) => (
    warning?.code === "parse_deferred"
    || warning?.code === "parse_queued"
    || warning?.code === "parse_running"
  ))
}

function parseHasCoordinateAtoms(parse) {
  if (!parse || typeof parse !== "object") return false
  if (coordinatePreviewHasAtoms(parse.coordinatePreview)) return true
  return Array.isArray(parse.candidates) && parse.candidates.some((candidate) => coordinatePreviewHasAtoms(candidate?.coordinatePreview))
}

function parseHasComputationMetadata(parse) {
  if (!parse || typeof parse !== "object") return false
  const terminationStatus = typeof parse.terminationStatus === "string" ? parse.terminationStatus : ""
  return ["normal", "error"].includes(terminationStatus)
    || typeof parse.jobCpuTime === "string"
    || typeof parse.elapsedTime === "string"
}

function parseHasBasisFunctionCount(parse) {
  if (!parse || typeof parse !== "object") return false
  if (energyTableHasBasisFunctionCount(parse.energyTable)) return true
  return Array.isArray(parse.candidates) && parse.candidates.some((candidate) => energyTableHasBasisFunctionCount(candidate?.energyTable))
}

function energyTableHasBasisFunctionCount(table) {
  if (!table || typeof table !== "object") return false
  return Number.isFinite(table.gasBasisFunctions) || Number.isFinite(table.solBasisFunctions)
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
    }, { timeoutMs: 5000 })
    return response.ok ? response.data : null
  } catch {
    return null
  }
}

async function readDesktopSourceFile(filePath) {
  const stats = await fs.stat(filePath)
  return {
    name: path.basename(filePath),
    size: stats.size,
    preview: "",
    sourcePath: filePath,
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

async function projectDirectoryFromActiveProjectPayload(projectId, payload) {
  const projectDirectory = typeof payload?.projectDirectory === "string" ? payload.projectDirectory : null
  if (!projectDirectory) return null
  const resolvedDirectory = await projectDirectoryForOpenedPath(projectDirectory)
  if (!resolvedDirectory) return null
  const projectPackage = await readProjectPackageWithValidation(resolvedDirectory)
  const identity = projectIdentityFromContent(projectPackage.content)
  if (identity?.id !== projectId) return null
  activateProjectDirectory(projectPackage.content, projectPackage.projectDirectory)
  return projectPackage.projectDirectory
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

function uniqueRuntimeProjectPaths(projectPaths) {
  const seen = new Set()
  const result = []
  for (const projectPath of projectPaths) {
    if (typeof projectPath !== "string" || !projectPath.trim()) continue
    const resolved = path.resolve(projectPath)
    const key = runtimeProjectComparisonKey(resolved)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(resolved)
  }
  return result
}

function runtimeProjectComparisonKey(projectPath) {
  return process.platform === "win32" ? path.resolve(projectPath).toLowerCase() : path.resolve(projectPath)
}

function isPathInside(candidatePath, parentPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(candidatePath))
  return relativePath === "" || (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath))
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
  recentProjectsStorePath = path.join(userDataDirectory(), "recent-projects.json")
  const preferences = await loadPreferences(userDataDirectory())
  nativeTheme.themeSource = preferences.appearance
  const recentProjectState = await loadRecentProjectsState(recentProjectsStorePath)
  recentProjectPaths = recentProjectState.projectPaths
  activeProjectPath = recentProjectState.activeProjectPath
  installApplicationMenu()
  createMainWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
