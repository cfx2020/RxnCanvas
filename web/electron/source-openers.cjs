const childProcess = require("node:child_process")
const fs = require("node:fs/promises")
const path = require("node:path")

function sourceOpenerProfile(payload) {
  const sourceKind = String(payload?.sourceKind || payload?.kind || "").toLowerCase()
  const parserId = String(payload?.parserId || "").toLowerCase()
  const name = String(payload?.name || "").toLowerCase()
  if (sourceKind.includes("gaussian") || parserId.includes("gaussian") || /\.(log|gjf|com)$/.test(name)) return "gaussian"
  return "text"
}

async function resolveOpenerApp({ profile, preferences, platform }) {
  const configured = preferences?.sourceOpeners?.[profile]?.appPath
  if (configured && await isUsableAppPath(configured)) {
    return { appPath: configured, label: preferences.sourceOpeners[profile].label || appLabel(configured), source: "preference" }
  }
  for (const candidate of defaultAppCandidates(profile, platform)) {
    if (await isUsableAppPath(candidate)) return { appPath: candidate, label: appLabel(candidate), source: "default" }
  }
  return null
}

async function isUsableAppPath(appPath) {
  if (typeof appPath !== "string" || !path.isAbsolute(appPath)) return false
  try {
    const stats = await fs.stat(appPath)
    return stats.isFile() || stats.isDirectory()
  } catch {
    return false
  }
}

function defaultAppCandidates(profile, platform = process.platform) {
  if (profile === "gaussian") {
    if (platform === "darwin") return ["/Applications/GaussView 6.app", "/Applications/GaussView.app", "/Applications/GaussView 5.app"]
    if (platform === "win32") {
      return [
        "C:\\Program Files\\Gaussian\\GaussView 6.0\\gview.exe",
        "C:\\Program Files\\Gaussian\\GaussView 6\\gview.exe",
        "C:\\G16W\\gview.exe",
        "C:\\G09W\\gview.exe",
      ]
    }
    return ["/usr/local/bin/gview", "/usr/bin/gview", "/opt/gaussian/gview/gview"]
  }
  if (platform === "darwin") return ["/System/Applications/TextEdit.app", "/Applications/TextEdit.app"]
  if (platform === "win32") return ["C:\\Windows\\System32\\notepad.exe"]
  return ["/usr/bin/gedit", "/usr/bin/kate", "/usr/bin/xdg-open"]
}

function openFileWithApp({ appPath, filePath, platform = process.platform }) {
  return new Promise((resolve) => {
    const command = platform === "darwin" ? "/usr/bin/open" : appPath
    const args = platform === "darwin" ? ["-a", appPath, filePath] : [filePath]
    const child = childProcess.spawn(command, args, {
      detached: true,
      stdio: "ignore",
      shell: false,
      windowsHide: true,
    })
    child.once("error", (error) => resolve({ ok: false, error: error.message }))
    child.once("spawn", () => {
      child.unref()
      resolve({ ok: true })
    })
  })
}

function appLabel(appPath) {
  const base = path.basename(appPath)
  return base.endsWith(".app") ? base.slice(0, -4) : base
}

module.exports = {
  appLabel,
  defaultAppCandidates,
  isUsableAppPath,
  openFileWithApp,
  resolveOpenerApp,
  sourceOpenerProfile,
}
