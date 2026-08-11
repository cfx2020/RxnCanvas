const { spawn } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const projectRoot = path.join(__dirname, "..")
const packageJson = require(path.join(projectRoot, "package.json"))
const releaseDir = path.join(projectRoot, "release")
const timeoutMs = Number.parseInt(process.env.RXNFLOW_WINDOWS_INSTALLER_SMOKE_TIMEOUT_MS || "60000", 10)
const appTimeoutMs = Math.max(20000, Math.min(45000, timeoutMs - 10000))

async function main() {
  if (process.platform !== "win32") {
    console.log("Windows installer smoke skipped: not running on Windows")
    return
  }

  const installerPath = path.join(releaseDir, `RxnFlow Setup ${packageJson.version}.exe`)
  if (!fs.existsSync(installerPath)) {
    throw new Error("Windows NSIS installer not found. Run npm run desktop:dist:win first.")
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rxnflow-install-"))
  const installDir = path.join(tempRoot, "RxnFlow")
  try {
    await runProcess(installerPath, ["/S", `/D=${installDir}`], {
      timeoutLabel: "Windows installer",
      timeoutMs,
    })

    const executablePath = findInstalledExecutable(installDir)
    if (!executablePath) {
      throw new Error(`Installed RxnFlow.exe was not found under ${installDir}`)
    }

    const marker = await runInstalledApp(executablePath)
    console.log(`RxnFlow Windows installer smoke launched installed app: ${marker}`)

    const uninstallerPath = findUninstaller(path.dirname(executablePath))
    if (!uninstallerPath) {
      throw new Error(`Installed RxnFlow uninstaller was not found under ${path.dirname(executablePath)}`)
    }
    await runProcess(uninstallerPath, ["/S"], {
      timeoutLabel: "Windows uninstaller",
      timeoutMs,
    })
    console.log(`RxnFlow Windows installer smoke passed: ${path.relative(projectRoot, installerPath)}`)
  } finally {
    cleanupTempRoot(tempRoot)
  }
}

function cleanupTempRoot(tempRoot) {
  try {
    fs.rmSync(tempRoot, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 250,
    })
  } catch (error) {
    if (["EBUSY", "EPERM", "ENOTEMPTY"].includes(error?.code)) {
      console.warn(`Windows installer smoke cleanup deferred: ${error.message}`)
      return
    }
    throw error
  }
}

function findInstalledExecutable(installDir) {
  const candidates = [
    path.join(installDir, "RxnFlow.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "RxnFlow", "RxnFlow.exe"),
  ]
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) ?? null
}

function findUninstaller(appDir) {
  const candidates = [
    path.join(appDir, "Uninstall RxnFlow.exe"),
    path.join(appDir, "Uninstall.exe"),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

function runInstalledApp(executablePath) {
  return runProcess(executablePath, ["--rxnflow-smoke-exit"], {
    timeoutLabel: "Installed RxnFlow runtime smoke",
    timeoutMs,
    marker: "RXNFLOW_DESKTOP_RUNTIME_SMOKE_OK",
    env: {
      ...process.env,
      RXNFLOW_DESKTOP_SMOKE_TIMEOUT_MS: String(appTimeoutMs),
    },
  })
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    let stdout = ""
    let stderr = ""
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: options.env || process.env,
      windowsHide: true,
    })

    const timer = setTimeout(() => {
      child.kill()
      finish(new Error(`${options.timeoutLabel || command} timed out after ${options.timeoutMs || timeoutMs}ms.\nstdout:\n${stdout}\nstderr:\n${stderr}`))
    }, options.timeoutMs || timeoutMs)

    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) {
        reject(error)
      } else {
        resolve(markerLine(stdout, options.marker))
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
      if (code !== 0) {
        finish(new Error(`${options.timeoutLabel || command} failed with exit code ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`))
        return
      }
      if (options.marker && !stdout.includes(options.marker)) {
        finish(new Error(`${options.timeoutLabel || command} did not emit ${options.marker}.\nstdout:\n${stdout}\nstderr:\n${stderr}`))
        return
      }
      finish(null)
    })
  })
}

function markerLine(output, marker) {
  if (!marker) return ""
  return output.split(/\r?\n/).find((line) => line.includes(marker))?.trim() || marker
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
