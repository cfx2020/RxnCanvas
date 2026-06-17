const { spawn } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const projectRoot = path.join(__dirname, "..")
const releaseDir = path.join(projectRoot, "release")
const timeoutMs = Number.parseInt(process.env.RXNFLOW_DESKTOP_RUNTIME_SMOKE_TIMEOUT_MS || "30000", 10)

async function main() {
  const executablePath = findPackagedExecutable()
  if (!executablePath) {
    throw new Error("No packaged RxnFlow app was found. Run desktop:pack or desktop:pack:win first.")
  }

  const marker = await runPackagedApp(executablePath)
  const startupMarker = await runStartupRestoreSmoke(executablePath)
  console.log(`RxnFlow packaged runtime smoke passed: ${path.relative(projectRoot, executablePath)} (${marker}; ${startupMarker})`)
}

function findPackagedExecutable() {
  if (!fs.existsSync(releaseDir)) return null

  if (process.platform === "win32") {
    return existingPath(path.join(releaseDir, "win-unpacked", "RxnFlow.exe"))
  }

  if (process.platform === "darwin") {
    const candidateDirs = fs.readdirSync(releaseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(releaseDir, entry.name, "RxnFlow.app", "Contents", "MacOS", "RxnFlow"))
    return candidateDirs.find((candidate) => fs.existsSync(candidate)) ?? null
  }

  return existingPath(path.join(releaseDir, "linux-unpacked", "rxnflow"))
}

function existingPath(filePath) {
  return fs.existsSync(filePath) ? filePath : null
}

function runPackagedApp(executablePath, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    let stdout = ""
    let stderr = ""
    const child = spawn(executablePath, ["--rxnflow-smoke-exit"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        RXNFLOW_DESKTOP_SMOKE_TIMEOUT_MS: "15000",
        ...(options.env || {}),
      },
      windowsHide: true,
    })

    const timer = setTimeout(() => {
      child.kill()
      finish(new Error(`Packaged app did not exit within ${timeoutMs}ms.\nstdout:\n${stdout}\nstderr:\n${stderr}`))
    }, timeoutMs)

    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) {
        reject(error)
      } else {
        resolve(stdout.split(/\r?\n/).find((line) => line.includes("RXNFLOW_DESKTOP_RUNTIME_SMOKE_OK"))?.trim() || "RXNFLOW_DESKTOP_RUNTIME_SMOKE_OK")
      }
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8")
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8")
    })
    child.on("error", finish)
    child.on("close", (code) => {
      if (code !== 0 || !stdout.includes("RXNFLOW_DESKTOP_RUNTIME_SMOKE_OK")) {
        finish(new Error(`Packaged app runtime smoke failed with exit code ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`))
        return
      }
      finish(null)
    })
  })
}

async function runStartupRestoreSmoke(executablePath) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rxnflow-startup-restore-"))
  try {
    const userDataDir = path.join(tempRoot, "user-data")
    const projectDirectory = writeSmokeProjectDirectory(tempRoot, {
      directoryName: "Startup Restore Smoke.rxnflow",
      projectId: "startup-restore-smoke",
      projectLabel: "Startup Restore Smoke",
      fileId: "startup-restore-log",
      fileName: "startup-restore.log",
      nodeId: "startup-restore-node",
      nodeLabel: "Startup Restore TS",
      energy: -321,
    })
    const olderProjectDirectory = writeSmokeProjectDirectory(tempRoot, {
      directoryName: "Older Restore Smoke.rxnflow",
      projectId: "older-restore-smoke",
      projectLabel: "Older Restore Smoke",
      fileId: "older-restore-log",
      fileName: "older-restore.log",
      nodeId: "older-restore-node",
      nodeLabel: "Older Restore TS",
      energy: -123,
    })
    fs.mkdirSync(userDataDir, { recursive: true })
    fs.writeFileSync(path.join(userDataDir, "recent-projects.json"), `${JSON.stringify({
      version: 1,
      projectPaths: [projectDirectory, olderProjectDirectory],
    }, null, 2)}\n`, "utf8")

    return await runPackagedApp(executablePath, {
      env: {
        RXNFLOW_DESKTOP_USER_DATA_DIR: userDataDir,
        RXNFLOW_DESKTOP_SMOKE_STARTUP_RESTORE: "1",
      },
    })
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function writeSmokeProjectDirectory(tempRoot, options) {
  const projectDirectory = path.join(tempRoot, options.directoryName)
  const metadataDirectory = path.join(projectDirectory, ".rxnflow")
  const sourcesDirectory = path.join(projectDirectory, "sources")
  fs.mkdirSync(metadataDirectory, { recursive: true })
  fs.mkdirSync(sourcesDirectory, { recursive: true })
  const storedFileName = `01-${options.fileName}`
  fs.writeFileSync(path.join(sourcesDirectory, storedFileName), `SCF Done: E(RwB97XD) = ${options.energy}.0\n`, "utf8")
  fs.writeFileSync(path.join(metadataDirectory, "project.json"), `${JSON.stringify({
    schemaVersion: 1,
    packageKind: "rxnflow-project",
    project: { id: options.projectId, label: options.projectLabel, meta: "open" },
    files: [{
      id: options.fileId,
      name: options.fileName,
      kind: "Gaussian",
      size: 31,
      status: "parsed",
      preview: `SCF Done: E(RwB97XD) = ${options.energy}.0`,
      storedPath: `sources/${storedFileName}`,
    }],
    nodes: [{
      id: options.nodeId,
      label: options.nodeLabel,
      formula: "C2H4",
      kind: "transition",
      method: "wB97X-D",
      solvent: "SMD",
      energyGas: options.energy,
      energySolution: options.energy + 0.1,
      energyUnit: "hartree",
      sourceStatus: "parsed",
      sourceFileId: options.fileId,
      position: { x: 40, y: 64 },
    }],
    edges: [],
    barriers: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    importLedger: { schemaVersion: 1, entries: [] },
    savedAt: "2026-06-17T00:00:00.000Z",
  }, null, 2)}\n`, "utf8")
  return projectDirectory
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
