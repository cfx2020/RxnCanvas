const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, shell } = require("electron")
const { execFile } = require("node:child_process")
const fs = require("node:fs/promises")
const path = require("node:path")
const { fileURLToPath } = require("node:url")
const { getEngineStatus, runEngineRequest, shutdownEngineWorkers } = require("./engine-bridge.cjs")
const {
  defaultImportStoredPathForFile,
  exportProjectWorkspaceArchive,
  importProjectWorkspaceArchive,
  materializeImportSourceFile,
  projectStoredPathForSourcePath,
  readProjectContent,
  resolveProjectStatePath,
  saveProjectContent,
  slimProjectPackageForPersistence,
  sourceFileDiskMetadata,
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

const sourceParsePendingWarningCodes = new Set(["parse_deferred", "parse_queued", "parse_running"])
const desktopImportRejectedWarningCodes = new Set([
  "unsupported_format",
  "parse_failed",
  "import_parse_failed",
  "cclib_parse_empty",
  "cclib_parse_failed",
  "cclib_unavailable",
  "full_file_read_failed",
  "source_file_too_large",
  "source_materialize_failed",
  "import_preview_missing",
  "import_preview_failed",
])
const latestSourceImportGenerationByKey = new Map()
let sourceImportGeneration = 0

const devServerUrl = process.env.RXNCANVAS_DESKTOP_DEV_SERVER
const runtimeSmokeExit = process.argv.includes("--rxncanvas-smoke-exit")
const runtimeStartupRestoreSmoke = process.env.RXNCANVAS_DESKTOP_SMOKE_STARTUP_RESTORE === "1"
const runtimeSmokeTimeoutMs = Number.parseInt(process.env.RXNCANVAS_DESKTOP_SMOKE_TIMEOUT_MS || "12000", 10)
const userDataDirectoryOverride = process.env.RXNCANVAS_DESKTOP_USER_DATA_DIR
const macTrafficLightPosition = { x: 18, y: 12 }
let recentProjectPaths = []
let activeProjectPath = null
let recentProjectsStorePath = null
let currentProjectDirectory = null
let currentProjectId = null
let recentProjectsPersistence = Promise.resolve()
let startupProjectRestorePromise = null
let startupProjectRestoreConsumed = false
const projectDirectoriesById = new Map()
const projectLifecycleGenerationById = new Map()

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: "#eef6f8",
    icon: desktopWindowIconPath(),
    show: false,
    title: "RxnCanvas",
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
  installRendererNavigationGuards(window)

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

function installRendererNavigationGuards(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (rendererNavigationAllowed(targetUrl)) return
    event.preventDefault()
  })
}

function rendererNavigationAllowed(targetUrl) {
  try {
    const target = new URL(targetUrl)
    if (devServerUrl) return target.origin === new URL(devServerUrl).origin
    if (target.protocol !== "file:") return false
    const rendererEntry = path.resolve(__dirname, "..", "dist", "index.html")
    return path.resolve(fileURLToPath(target)) === rendererEntry
  } catch {
    return false
  }
}

function windowStatePayload(window) {
  return {
    isFullScreen: typeof window.isFullScreen === "function" ? window.isFullScreen() : false,
    isMaximized: typeof window.isMaximized === "function" ? window.isMaximized() : false,
  }
}

function sendWindowState(window) {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return
  window.webContents.send("rxncanvas:window-state-changed", windowStatePayload(window))
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
  const payloads = []
  let activePayload = null
  let state = { projectPaths: recentProjectPaths, activeProjectPath }
  let removedInvalidRecentProject = false
  for (const filePath of startupRestoreProjectPaths()) {
    try {
      const startupDirectory = await projectDirectoryForStartupRestore(filePath)
      if (!startupDirectory) {
        state = removeRecentProjectState(state, filePath)
        removedInvalidRecentProject = true
        continue
      }
      const projectPackage = await readProjectPackageWithValidation(filePath)
      const restoredPath = projectPackage.projectDirectory ?? filePath
      state = recordRecentProjectState(state, restoredPath, { active: false })
      const payload = {
        filePath,
        projectDirectory: projectPackage.projectDirectory,
        content: projectPackage.content,
        validation: projectPackage.validation,
        replaceProjects: true,
        source: "startup",
      }
      payloads.push(payload)
      if (!activePayload && activeProjectPath && runtimeProjectComparisonKey(restoredPath) === runtimeProjectComparisonKey(activeProjectPath)) {
        activePayload = payload
      }
    } catch (error) {
      state = removeRecentProjectState(state, filePath)
      removedInvalidRecentProject = true
      console.warn(`Could not restore recent RxnCanvas project ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (payloads.length === 0 && !removedInvalidRecentProject) return []
  if (payloads.length > 0) {
    activePayload = activePayload ?? payloads[0]
    const activePath = activePayload.projectDirectory ?? activePayload.filePath
    state = recordRecentProjectState(state, activePath)
  }
  recentProjectPaths = state.projectPaths
  activeProjectPath = state.activeProjectPath
  await persistRecentProjects()
  if (removedInvalidRecentProject) installApplicationMenu()
  if (!activePayload) return []
  const orderedPayloads = [
    ...payloads.filter((payload) => payload !== activePayload),
    activePayload,
  ]
  registerRestoredProjectDirectories(orderedPayloads)
  return orderedPayloads
}

function registerRestoredProjectDirectories(payloads) {
  for (const payload of payloads) {
    if (!payload.projectDirectory) continue
    const identity = projectIdentityFromContent(payload.content)
    if (identity?.id) projectDirectoriesById.set(identity.id, payload.projectDirectory)
  }
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
    if (!window.isDestroyed()) window.webContents.send("rxncanvas:preferences-changed", preferences)
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

const chemicalClipboardFormatPattern = /(cdif|stru|chms|cdxm|cdx|cdxml|chem|chemical|molfile|mdl|mol|rxn|skc|com\.cambridgesoft|public\.utf8|text|xml|html)/i
const maxClipboardPayloadChars = 2 * 1024 * 1024
const chemDrawAppleScriptTimeoutMs = 5000
const chemicalClipboardWriteFormats = {
  cdxml: [
    "chemical/x-cdxml",
    "com.revvity.cdxml",
    "com.perkinelmer.cdxml",
    "com.cambridgesoft.cdxml",
    "CdxM",
    "com.cambridgesoft.CDXML",
    "com.cambridgesoft.ChemDraw CDXML",
    "public.xml",
  ],
  cdx: [
    "chemical/x-cdx",
    "com.revvity.cdx",
    "com.perkinelmer.cdx",
    "com.revvity.chemdraw.cdx-clipboard",
    "com.perkinelmer.chemdraw.cdx-clipboard",
    "com.revvity.chemdraw.structure",
    "com.perkinelmer.chemdraw.structure",
    "com.cambridgesoft.cdx",
    "com.cambridgesoft.CDX",
    "com.cambridgesoft.ChemDraw CDX",
    "CHMS",
    "CDIF",
    "STRU",
  ],
  molfile: [
    "chemical/x-mdl-molfile",
    "chemical/x-mdl-mol",
    "com.revvity.external.mdl3000",
    "com.perkinelmer.external.mdl3000",
    "com.mdli.molfile",
  ],
  ket: [
    "chemical/x-indigo-ket",
    "application/x-indigo-ket",
  ],
}

function chemicalClipboardPayloads(formats) {
  const payloads = []
  const seen = new Set()
  for (const format of formats) {
    if (!chemicalClipboardFormatPattern.test(format)) continue
    try {
      const buffer = clipboard.readBuffer(format)
      const decoded = cdxBase64FromClipboardBuffer(format, buffer) || decodeClipboardBuffer(buffer)
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

async function chemDrawSelectionClipboardPayload(formats) {
  if (process.platform !== "darwin") return null
  const hasImageOnlyChemDrawClipboard = formats.some((format) => /^image\/|png|tiff/i.test(format))
    && !formats.some((format) => chemicalClipboardFormatPattern.test(format))
  if (!hasImageOnlyChemDrawClipboard) return null
  try {
    const output = await runAppleScript([
      "use framework \"AppKit\"",
      "use scripting additions",
      "set pasteboardSource to ((current application's NSPasteboard's generalPasteboard())'s stringForType:\"org.nspasteboard.source\")",
      "if pasteboardSource is missing value then set pasteboardSource to \"\"",
      "set pasteboardSource to pasteboardSource as text",
      "if pasteboardSource does not contain \"ChemDraw\" and pasteboardSource is not \"com.revvity.ChemDraw\" and pasteboardSource is not \"com.perkinelmer.ChemDraw\" and pasteboardSource is not \"com.cambridgesoft.ChemDraw\" then return \"\"",
      "tell application id \"com.revvity.ChemDraw\"",
      "  if (count of documents) is 0 then return \"\"",
      "  tell document 1",
      "    set selectedSmiles to SMILES of selection",
      "    if selectedSmiles is missing value then return \"\"",
      "    return selectedSmiles as text",
      "  end tell",
      "end tell",
    ], chemDrawAppleScriptTimeoutMs)
    const smiles = output.trim()
    if (!smiles) return null
    return { format: "chemical/x-daylight-smiles", text: clampClipboardText(smiles) }
  } catch (error) {
    console.warn(`Could not read ChemDraw selection through AppleScript: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function runAppleScript(lines, timeoutMs) {
  return new Promise((resolve, reject) => {
    const args = lines.flatMap((line) => ["-e", line])
    execFile("osascript", args, { timeout: timeoutMs, maxBuffer: 64 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message))
        return
      }
      resolve(stdout)
    })
  })
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

function cdxBase64FromClipboardBuffer(format, buffer) {
  if (!isCdxClipboardFormat(format) || !Buffer.isBuffer(buffer) || buffer.length === 0) return ""
  const compactText = buffer.toString("utf8").replace(/\s+/g, "")
  if (isBase64CdxText(compactText)) return compactText
  if (buffer.subarray(0, 8).toString("ascii") === "VjCD0100") return buffer.toString("base64")
  return ""
}

function isCdxClipboardFormat(format) {
  return /(cdif|stru|chms|\bcdx\b|x-cdx|cdx-clipboard|chemdraw\.structure|com\.(revvity|perkinelmer|cambridgesoft)\.cdx)/i.test(format)
}

function isBase64CdxText(value) {
  if (!value || value.length < 16 || value.length % 4 !== 0 || !/^[a-z0-9+/]+={0,2}$/i.test(value)) return false
  try {
    return Buffer.from(value, "base64").subarray(0, 8).toString("ascii") === "VjCD0100"
  } catch (_error) {
    return false
  }
}

function writeChemicalClipboardPayload(payload) {
  const cdxml = normalizedClipboardText(payload?.cdxml)
  const cdx = normalizedClipboardText(payload?.cdx)
  const molfile = normalizedClipboardText(payload?.molfile)
  const ket = normalizedClipboardText(payload?.ket)
  const text = normalizedClipboardText(payload?.text) || cdxml || molfile || ket || cdx
  const writtenFormats = []

  clipboard.clear("clipboard")
  if (text) {
    clipboard.writeText(text, "clipboard")
    writtenFormats.push("text/plain")
  }
  if (cdxml) writeClipboardTextFormats(chemicalClipboardWriteFormats.cdxml, cdxml, writtenFormats)
  if (molfile) writeClipboardTextFormats(chemicalClipboardWriteFormats.molfile, molfile, writtenFormats)
  if (ket) writeClipboardTextFormats(chemicalClipboardWriteFormats.ket, ket, writtenFormats)

  const cdxBuffer = cdxBufferFromClipboardText(cdx)
  if (cdxBuffer) {
    for (const format of chemicalClipboardWriteFormats.cdx) {
      clipboard.writeBuffer(format, cdxBuffer, "clipboard")
      writtenFormats.push(format)
    }
  } else if (cdx) {
    writeClipboardTextFormats(chemicalClipboardWriteFormats.cdx, cdx, writtenFormats)
  }

  return writtenFormats
}

function normalizedClipboardText(value) {
  return typeof value === "string" && value.trim() ? clampClipboardText(value.trim()) : ""
}

function writeClipboardTextFormats(formats, text, writtenFormats) {
  const buffer = Buffer.from(text, "utf8")
  for (const format of formats) {
    clipboard.writeBuffer(format, buffer, "clipboard")
    writtenFormats.push(format)
  }
}

function cdxBufferFromClipboardText(value) {
  if (!value) return null
  const compact = value.replace(/\s+/g, "")
  if (!/^[a-z0-9+/]+={0,2}$/i.test(compact) || compact.length < 16) return null
  try {
    const buffer = Buffer.from(compact, "base64")
    return buffer.length > 0 ? buffer : null
  } catch (_error) {
    return null
  }
}

function installRuntimeSmokeExit(window) {
  const deadline = Date.now() + runtimeSmokeTimeoutMs
  const timeout = setTimeout(() => {
    console.error(`RXNCANVAS_DESKTOP_RUNTIME_SMOKE_FAILED: runtime smoke did not complete within ${runtimeSmokeTimeoutMs}ms`)
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
    finish(1, `RXNCANVAS_DESKTOP_RUNTIME_SMOKE_FAILED: ${errorCode} ${errorDescription} ${validatedUrl}`)
  })

  window.webContents.once("did-finish-load", async () => {
    try {
      const directory = await fs.mkdtemp(path.join(app.getPath("temp"), "rxncanvas-runtime-source-"))
      let sourceParse
      try {
        const sourcePath = path.join(directory, "runtime-smoke.xyz")
        await fs.writeFile(sourcePath, "2\nenergy=-1.0 hartree\nH 0 0 0\nH 0 0 0.74\n")
        const response = await runEngineRequest({
          command: "import.preview",
          files: [{ name: "runtime-smoke.xyz", sourcePath }],
        }, { timeoutMs: Math.max(1, deadline - Date.now()) })
        sourceParse = response.ok ? response.data?.files?.[0]?.parse : null
        if (!sourceParse?.parsed || sourceParse.parseScope !== "full-file") {
          throw new Error(`desktop runtime full-file parsing smoke failed: ${JSON.stringify(response.error || sourceParse)}`)
        }
      } finally {
        await fs.rm(directory, { recursive: true, force: true })
      }
      const result = await window.webContents.executeJavaScript(`
        new Promise((resolve, reject) => {
          const rendererDeadline = ${JSON.stringify(deadline)}
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
                  const stillShowingDemoProjects = ["Diels-Alder Study", "Nickel catalysis", "Ir screening"]
                    .filter((label) => text.includes(label))
                  if (!text.includes("Startup Restore Smoke") || !text.includes("Older Restore Smoke") || stillShowingDemoProjects.length > 0) {
                    if (Date.now() <= rendererDeadline) {
                      window.setTimeout(poll, 100)
                      return
                    }
                    reject(new Error("desktop renderer did not restore all recent workspaces without demo projects"))
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
                const desktop = window.rxncanvasDesktop
                if (!desktop?.getEngineStatus || !desktop?.registerImportCandidates || !desktop?.createProjectFolder || !desktop?.autosaveProjectPackage) {
                  reject(new Error("desktop preload engine API is unavailable"))
                  return
                }
                const status = await desktop.getEngineStatus()
                if (!status?.ok || !status.data?.capabilities?.includes("import.register_all")) {
                  throw new Error("desktop engine status smoke failed: " + JSON.stringify(status))
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
                    name: "runtime-smoke.xyz",
                    size: 48,
                    preview: "",
                    parse: ${JSON.stringify(sourceParse)},
                  }],
                })
                if (!registered?.ok || registered.data?.registeredObjects?.[0]?.parserId !== "xyz-text-full-file") {
                  reject(new Error("desktop engine registration smoke failed"))
                  return
                }
                const autosaved = await desktop.autosaveProjectPackage({
                  defaultName: "runtime-smoke.rxncanvas",
                  content: JSON.stringify({
                    schemaVersion: 2,
                    packageKind: "rxncanvas-project",
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
            if (Date.now() > rendererDeadline) {
              const root = document.querySelector("#root")
              const diagnostic = [
                "readyState=" + document.readyState,
                "rootChildren=" + (root?.children.length ?? -1),
                "rootHtml=" + (root?.innerHTML || "").slice(0, 240).replace(/\\s+/g, " "),
                "bodyText=" + text.slice(0, 240).replace(/\\s+/g, " "),
              ].join("; ")
              reject(new Error("renderer loaded without the RxnCanvas workbench (" + diagnostic + ")"))
              return
            }
            window.setTimeout(poll, 100)
          }
          poll()
        })
      `)
      finish(0, `RXNCANVAS_DESKTOP_RUNTIME_SMOKE_OK ${result.engineVersion} ${result.runtime} cclib=${result.cclibVersion}`)
    } catch (error) {
      finish(1, `RXNCANVAS_DESKTOP_RUNTIME_SMOKE_FAILED: ${error instanceof Error ? error.message : String(error)}`)
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
            if (focusedWindow) focusedWindow.webContents.send("rxncanvas:menu-import-files")
          },
        },
        {
          label: "Open RxnCanvas Project Folder",
          accelerator: "CmdOrCtrl+Shift+O",
          click: (item, focusedWindow) => {
            if (focusedWindow) focusedWindow.webContents.send("rxncanvas:menu-open-project")
          },
        },
        {
          label: "Open Recent",
          submenu: recentProjectsMenuItems(),
        },
        {
          label: "Export RxnCanvas Project Zip",
          accelerator: "CmdOrCtrl+S",
          click: (item, focusedWindow) => {
            if (focusedWindow) focusedWindow.webContents.send("rxncanvas:menu-save-project")
          },
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        ...(devServerUrl ? [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
        ] : []),
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
          label: "About RxnCanvas",
          click: () => {
            void dialog.showMessageBox({
              type: "info",
              title: "About RxnCanvas",
              message: `RxnCanvas ${app.getVersion()}`,
              detail: [
                "Local-first reaction pathway workbench for computational chemistry results.",
                "Project data stays in the workspace folders you choose.",
                `Application data: ${app.getPath("userData")}`,
                "Support and security contact are not configured for this unpublished build.",
              ].join("\n"),
              buttons: ["OK"],
            })
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

async function rememberRecentProject(filePath, options = {}) {
  const state = recordRecentProjectState({ projectPaths: recentProjectPaths, activeProjectPath }, filePath, options)
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

function persistRecentProjects() {
  if (!recentProjectsStorePath) return Promise.resolve()
  const requestedState = {
    projectPaths: [...recentProjectPaths],
    activeProjectPath,
  }
  recentProjectsPersistence = recentProjectsPersistence
    .catch(() => undefined)
    .then(async () => {
      const state = await saveRecentProjectsState(recentProjectsStorePath, requestedState)
      const currentState = {
        projectPaths: recentProjectPaths,
        activeProjectPath,
      }
      if (recentProjectStatesEqual(currentState, requestedState)) {
        recentProjectPaths = state.projectPaths
        activeProjectPath = state.activeProjectPath
      }
    })
  return recentProjectsPersistence
}

function recentProjectStatesEqual(left, right) {
  return left.activeProjectPath === right.activeProjectPath
    && left.projectPaths.length === right.projectPaths.length
    && left.projectPaths.every((projectPath, index) => projectPath === right.projectPaths[index])
}

async function openRecentProject(filePath, focusedWindow) {
  try {
    const projectPackage = await readProjectPackageWithValidation(filePath)
    await rememberRecentProject(filePath)
    activateProjectDirectory(projectPackage.content, projectPackage.projectDirectory)
    const targetWindow = focusedWindow ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (targetWindow) {
      targetWindow.webContents.send("rxncanvas:open-project-content", {
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
      message: "Could not open recent RxnCanvas project",
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}

ipcMain.handle("rxncanvas:get-window-state", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  return window ? windowStatePayload(window) : { isFullScreen: false, isMaximized: false }
})

ipcMain.handle("rxncanvas:choose-files", async () => {
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

ipcMain.handle("rxncanvas:show-import-issues", async (event, payload) => {
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

ipcMain.handle("rxncanvas:import-source-files", async (_event, payload) => {
  let files = Array.isArray(payload?.files)
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
  if (projectDirectory) {
    files = files.map((file) => {
      if (file.storedPath) return file
      const storedPath = projectStoredPathForSourcePath(projectDirectory, file.sourcePath)
      return storedPath ? { ...file, storedPath } : file
    })
  }
  const warnings = []
  if (!projectDirectory) {
    warnings.push({
      code: "project_folder_required",
      message: "No project folder is bound, so imported sources could not be copied into sources/ before parsing.",
    })
  }
  const referencedStoredPaths = importReferencedStoredPaths(payload)
  const importRequests = registerSourceImportRequests(projectDirectory, projectId, files)

  const previewFiles = files.map(importSourceFileForPreview)
  const parseTargets = previewFiles.filter((file) => !file.error)
  if (parseTargets.length === 0) {
    return {
      ok: true,
      data: {
        files: previewFiles.map(importSourceFileRendererPayload),
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
        files: previewFiles.map(importSourceFileRendererPayload),
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
      files: await parsedImportSourceFilePayloads({
        files: previewFiles,
        parseTargets,
        previewFiles: preview.data.files,
        projectDirectory,
        importRequests,
        referencedStoredPaths,
      }),
    },
    ...(warnings.length > 0 ? { warnings } : {}),
  }
})

async function parsedImportSourceFilePayloads({
  files,
  parseTargets,
  previewFiles,
  projectDirectory,
  importRequests,
  referencedStoredPaths,
}) {
  const usedStoredPaths = new Set()
  const parseResultsByFile = new Map()
  parseTargets.forEach((file, index) => {
    parseResultsByFile.set(file.id, previewFiles[index] ?? null)
  })

  return Promise.all(files.map(async (file, index) => {
    if (file.error) return importSourceFileRendererPayload(file)
    const previewFile = parseResultsByFile.get(file.id)
    const parse = previewFile?.parse
    const rejection = desktopImportParseRejection(parse)
    if (rejection) {
      return {
        ...importSourceFileRendererPayload(file),
        parse,
        error: rejection,
      }
    }
    if (!projectDirectory) {
      return {
        ...importSourceFileRendererPayload(file),
        parse,
      }
    }

    const importRequest = importRequests[index]
    if (!isLatestSourceImportRequest(importRequest)) {
      return supersededImportSourceFilePayload(file, parse)
    }

    try {
      const materialized = await materializeImportSourceFile(projectDirectory, file, index, {
        usedStoredPaths,
        referencedStoredPaths,
        shouldCommit: () => isLatestSourceImportRequest(importRequest),
      })
      return {
        ...importSourceFileRendererPayload(materialized),
        parseChecksum: materialized.checksum,
        parse,
      }
    } catch (error) {
      if (error?.code === "source_import_superseded") {
        return supersededImportSourceFilePayload(file, parse)
      }
      return {
        ...importSourceFileRendererPayload(file),
        parse,
        error: {
          code: "source_materialize_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }))
}

function registerSourceImportRequests(projectDirectory, projectId, files) {
  const projectKey = projectDirectory ? path.resolve(projectDirectory) : (projectId || "unbound-project")
  return files.map((file, index) => {
    const key = `${projectKey}\0${file.name.trim().toLowerCase()}`
    if (projectDirectory && !file.storedPath) {
      file.storedPath = defaultImportStoredPathForFile(file, index)
    }
    sourceImportGeneration += 1
    const request = { key, generation: sourceImportGeneration }
    latestSourceImportGenerationByKey.set(key, request.generation)
    return request
  })
}

function isLatestSourceImportRequest(request) {
  return Boolean(request && latestSourceImportGenerationByKey.get(request.key) === request.generation)
}

function supersededImportSourceFilePayload(file, parse) {
  return {
    ...importSourceFileRendererPayload(file),
    parse,
    error: {
      code: "source_import_superseded",
      message: "A newer import of the same source file replaced this request.",
    },
  }
}

function desktopImportParseRejection(parse) {
  if (!parse) {
    return {
      code: "import_preview_failed",
      message: "The local parser did not return parsed source data.",
    }
  }
  const warnings = Array.isArray(parse.warnings) ? parse.warnings : []
  const rejectedWarning = warnings.find((warning) => desktopImportRejectedWarningCodes.has(warning?.code))
  if (rejectedWarning) {
    return {
      code: rejectedWarning.code || "import_preview_failed",
      message: rejectedWarning.message || "This source could not be imported.",
    }
  }
  if (parse.terminationStatus === "error") {
    return {
      code: "calculation_error_termination",
      message: parse.terminationLabel && parse.terminationLabel !== "error"
        ? `Calculation ended with ${parse.terminationLabel}.`
        : "Calculation output ended with error termination.",
    }
  }
  if (parse.terminationStatus === "running") {
    return {
      code: "calculation_incomplete",
      message: "Calculation output is incomplete or still running.",
    }
  }
  if (parse.parsed !== true) {
    const warning = warnings.find((item) => !sourceParsePendingWarningCodes.has(item?.code)) ?? warnings[0]
    return {
      code: warning?.code || "import_preview_failed",
      message: warning?.message || "The local parser did not return parsed source data.",
    }
  }
  return null
}

function importReferencedStoredPaths(payload) {
  return Array.isArray(payload?.referencedStoredPaths)
    ? payload.referencedStoredPaths.filter((storedPath) => typeof storedPath === "string" && isSafeProjectRelativePath(storedPath))
    : []
}

ipcMain.handle("rxncanvas:register-import-candidates", async (_event, payload) => {
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

ipcMain.handle("rxncanvas:parse-source-preview", async (_event, payload) => {
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
  const metadata = sourceFilePath
    ? await sourceFileDiskMetadata(sourceFilePath).catch(() => null)
    : null
  return {
    ok: true,
    data: {
      parse,
      ...(metadata ? { ...metadata, parseChecksum: metadata.checksum } : {}),
    },
  }
})

ipcMain.handle("rxncanvas:inspect-project-source-files", async (_event, payload) => {
  const projectId = typeof payload?.projectId === "string" ? payload.projectId : null
  let projectDirectory = projectId ? projectDirectoriesById.get(projectId) : currentProjectDirectory
  if (!projectDirectory && projectId) {
    projectDirectory = await projectDirectoryFromActiveProjectPayload(projectId, payload)
  }
  if (!projectDirectory) {
    return invalidEngineInput("Project source inspection requires an open project folder.")
  }

  const files = Array.isArray(payload?.files) ? payload.files : []
  const inspected = await Promise.all(files.map(async (file) => {
    const id = typeof file?.id === "string" ? file.id : null
    const storedPath = typeof file?.storedPath === "string" ? file.storedPath : null
    if (!id || !storedPath || !isSafeProjectRelativePath(storedPath)) return null
    try {
      const metadata = await sourceFileDiskMetadata(path.join(projectDirectory, storedPath))
      return { id, storedPath, ...metadata }
    } catch (error) {
      return {
        id,
        storedPath,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }))

  return {
    ok: true,
    data: {
      files: inspected.filter(Boolean),
    },
  }
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

function reportArtifactFilterName(extension) {
  switch (extension) {
    case "png":
      return "PNG Image"
    case "xlsx":
      return "Excel Workbook"
    case "cdxml":
      return "ChemDraw CDXML"
    default:
      return "Export File"
  }
}

ipcMain.handle("rxncanvas:save-json-snapshot", async (_event, payload) => {
  const defaultPath = payload?.defaultName || "rxncanvas-flow.json"
  const content = typeof payload?.content === "string" ? payload.content : "{}"
  const result = await dialog.showSaveDialog({
    title: "Export RxnCanvas snapshot",
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

ipcMain.handle("rxncanvas:save-report-artifact", async (_event, payload) => {
  const requestedDefaultName = typeof payload?.defaultName === "string" && payload.defaultName.trim()
    ? payload.defaultName
    : "rxncanvas-export"
  const defaultName = path.basename(requestedDefaultName)
  const encoding = payload?.encoding === "base64" ? "base64" : "utf8"
  const content = typeof payload?.content === "string" ? payload.content : ""
  const extension = path.extname(defaultName).replace(".", "") || "*"
  const defaultPath = path.join(app.getPath("documents"), defaultName)

  const result = await dialog.showSaveDialog({
    title: "Export RxnCanvas file",
    buttonLabel: "Export",
    defaultPath,
    filters: [
      { name: reportArtifactFilterName(extension), extensions: [extension] },
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

ipcMain.handle("rxncanvas:open-project-package", async () => {
  const result = await dialog.showOpenDialog({
    title: "Open RxnCanvas project folder or archive",
    buttonLabel: "Open Project",
    defaultPath: app.getPath("documents"),
    properties: ["openFile", "openDirectory"],
    filters: [
      { name: "RxnCanvas projects", extensions: ["zip", "json", "rxncanvas"] },
      { name: "All files", extensions: ["*"] },
    ],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  const selectedPath = result.filePaths[0]
  const importedArchive = selectedPath.toLowerCase().endsWith(".zip")
    ? await importProjectWorkspaceArchive(
        selectedPath,
        await uniqueProjectDirectory(path.join(path.dirname(selectedPath), importedArchiveFolderName(selectedPath))),
      )
    : null
  const filePath = importedArchive?.projectDirectory ?? selectedPath
  const projectPackage = await readProjectPackageWithValidation(filePath)
  activateProjectDirectory(projectPackage.content, projectPackage.projectDirectory)
  await rememberRecentProject(projectPackage.projectDirectory ?? filePath)
  return {
    canceled: false,
    filePath,
    ...(importedArchive ? { sourceArchivePath: importedArchive.filePath } : {}),
    projectDirectory: projectPackage.projectDirectory,
    content: projectPackage.content,
    validation: projectPackage.validation,
    replaceProjects: Boolean(projectPackage.projectDirectory),
  }
})

ipcMain.handle("rxncanvas:get-startup-project-content", async () => {
  if (startupProjectRestoreConsumed) return { canceled: true }
  if (!startupProjectRestorePromise) return { canceled: true }
  startupProjectRestoreConsumed = true
  const payloads = await startupProjectRestorePromise
  if (!payloads || payloads.length === 0) return { canceled: true }
  return {
    canceled: false,
    projectContents: payloads,
  }
})

ipcMain.handle("rxncanvas:create-project-folder", async (_event, payload) => {
  const content = typeof payload?.content === "string" ? payload.content : "{}"
  const identity = projectIdentityFromContent(content)
  const folderName = safeWorkspaceFolderName(payload?.projectLabel || identity?.label || "RxnCanvas Project")
  const result = await dialog.showOpenDialog({
    title: "Choose where to create the RxnCanvas project folder",
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

ipcMain.handle("rxncanvas:save-project-package", async (_event, payload) => {
  const defaultPath = archiveDefaultPath(payload?.defaultName || "rxncanvas-project.rxncanvas.zip")
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

  // Imports can finish while the dialog is open, so commit this snapshot before waiting.
  await saveProjectContent(exportProjectDirectory, content, {
    previousProjectDirectory: exportProjectDirectory,
  })
  const result = await dialog.showSaveDialog({
    title: "Export RxnCanvas project archive",
    defaultPath,
    filters: [
      { name: "RxnCanvas project archive", extensions: ["zip"] },
      { name: "All files", extensions: ["*"] },
    ],
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  const archivedProject = await exportProjectWorkspaceArchive(exportProjectDirectory, result.filePath)
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

ipcMain.handle("rxncanvas:autosave-project-package", async (_event, payload) => {
  const defaultPath = payload?.defaultName || "rxncanvas-project.rxncanvas"
  const content = typeof payload?.content === "string" ? payload.content : "{}"
  const identity = projectIdentityFromContent(content)
  const lifecycleGeneration = identity?.id ? projectLifecycleGeneration(identity.id) : null
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
  const lifecycleIsCurrent = Boolean(identity?.id && lifecycleGeneration === projectLifecycleGeneration(identity.id))
  if (lifecycleIsCurrent) {
    if (savedProject.projectDirectory) {
      projectDirectoriesById.set(identity.id, savedProject.projectDirectory)
    }
    await rememberRecentProject(savedProject.filePath, { active: false })
  }
  const validation = lifecycleIsCurrent
    ? await validateProjectPackageContent(savedProject.content, savedProject.projectDirectory)
    : null
  return {
    canceled: false,
    filePath: savedProject.filePath,
    projectDirectory: savedProject.projectDirectory,
    content: savedProject.content,
    validation,
  }
})

ipcMain.handle("rxncanvas:set-active-project", async (_event, payload) => {
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

ipcMain.handle("rxncanvas:forget-project", async (_event, payload) => {
  const projectId = typeof payload?.projectId === "string" ? payload.projectId : null
  if (!projectId) return { ok: false }
  invalidateProjectLifecycle(projectId)
  const mappedDirectory = projectDirectoriesById.get(projectId)
  const payloadProject = mappedDirectory ? null : await projectPayloadForProjectId(projectId, payload)
  const projectDirectory = mappedDirectory ?? payloadProject?.projectDirectory ?? null
  if (!projectDirectory) return { ok: false, error: "Project directory is unavailable for recent-project removal." }
  try {
    await forgetRecentProject(projectDirectory)
  } catch (error) {
    return {
      ok: false,
      projectDirectory,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  projectDirectoriesById.delete(projectId)
  if (currentProjectId === projectId) {
    currentProjectId = null
    currentProjectDirectory = null
  }
  return { ok: true, projectDirectory }
})

ipcMain.handle("rxncanvas:get-preferences", async () => {
  const preferences = await loadPreferences(userDataDirectory())
  nativeTheme.themeSource = preferences.appearance
  return { ok: true, preferences }
})

ipcMain.handle("rxncanvas:set-preferences", async (_event, patch) => {
  const preferences = await updatePreferences(patch && typeof patch === "object" ? patch : {})
  return { ok: true, preferences }
})

ipcMain.handle("rxncanvas:choose-external-app", async (_event, payload) => {
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

ipcMain.handle("rxncanvas:read-chemical-clipboard", async () => {
  try {
    const formats = clipboard.availableFormats("clipboard")
    const text = clipboard.readText("clipboard")
    const html = clipboard.readHTML("clipboard")
    const payloads = chemicalClipboardPayloads(formats)
    const chemDrawSelectionPayload = payloads.length === 0
      ? await chemDrawSelectionClipboardPayload(formats)
      : null
    if (chemDrawSelectionPayload) payloads.push(chemDrawSelectionPayload)
    const visibleFormats = chemDrawSelectionPayload
      ? [...formats, chemDrawSelectionPayload.format]
      : formats
    return {
      ok: true,
      formats: visibleFormats,
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

ipcMain.handle("rxncanvas:write-chemical-clipboard", async (_event, payload) => {
  try {
    const formats = writeChemicalClipboardPayload(payload && typeof payload === "object" ? payload : {})
    return {
      ok: true,
      formats,
    }
  } catch (error) {
    return {
      ok: false,
      formats: [],
      error: error instanceof Error ? error.message : "Could not write clipboard.",
    }
  }
})

ipcMain.handle("rxncanvas:open-source-file", async (_event, payload) => {
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

ipcMain.handle("rxncanvas:engine-status", async () => getEngineStatus(runtimeSmokeExit ? { timeoutMs: runtimeSmokeTimeoutMs } : {}))

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

function projectLifecycleGeneration(projectId) {
  return projectLifecycleGenerationById.get(projectId) ?? 0
}

function invalidateProjectLifecycle(projectId) {
  const nextGeneration = projectLifecycleGeneration(projectId) + 1
  projectLifecycleGenerationById.set(projectId, nextGeneration)
  return nextGeneration
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
  const projectPayload = await projectPayloadForProjectId(projectId, payload)
  if (!projectPayload) return null
  activateProjectDirectory(projectPayload.content, projectPayload.projectDirectory)
  return projectPayload.projectDirectory
}

async function projectPayloadForProjectId(projectId, payload) {
  const projectDirectory = typeof payload?.projectDirectory === "string" ? payload.projectDirectory : null
  if (!projectDirectory) return null
  const resolvedDirectory = await projectDirectoryForOpenedPath(projectDirectory)
  if (!resolvedDirectory) return null
  const content = await readProjectContent(resolvedDirectory)
  const identity = projectIdentityFromContent(content)
  if (identity?.id !== projectId) return null
  return { projectDirectory: resolvedDirectory, content }
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
  if (stateFileName === "project.json" && metadataDirectory === ".rxncanvas") {
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
  const stem = String(defaultName || "rxncanvas-project")
    .replace(/\.rxncanvas\.zip$/i, "")
    .replace(/\.rxncanvas$/i, "")
    .replace(/\.json$/i, "")
  return `${safeProjectPathStem(stem) || "rxncanvas-project"}.rxncanvas.zip`
}

function importedArchiveFolderName(archivePath) {
  const stem = path.basename(archivePath)
    .replace(/\.rxncanvas\.zip$/i, "")
    .replace(/\.zip$/i, "")
  return safeWorkspaceFolderName(stem)
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
  return cleaned || "RxnCanvas Project"
}

app.whenReady().then(async () => {
  app.setName("RxnCanvas")
  recentProjectsStorePath = path.join(userDataDirectory(), "recent-projects.json")
  const [preferences, recentProjectState] = await Promise.all([
    loadPreferences(userDataDirectory()),
    loadRecentProjectsState(recentProjectsStorePath),
  ])
  nativeTheme.themeSource = preferences.appearance
  recentProjectPaths = recentProjectState.projectPaths
  activeProjectPath = recentProjectState.activeProjectPath
  installApplicationMenu()
  createMainWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on("before-quit", () => {
  void shutdownEngineWorkers()
})

app.on("window-all-closed", () => {
  if (devServerUrl || process.platform !== "darwin") app.quit()
})
