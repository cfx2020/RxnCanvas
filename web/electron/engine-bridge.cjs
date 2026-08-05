const { spawn } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const defaultRepoRoot = path.resolve(__dirname, "..", "..")
const defaultTimeoutMs = 5000
const maxWorkerCount = 3
const pendingRequests = []
const workers = new Set()

let dispatchScheduled = false
let materializedCleanupRegistered = false
let materializedPackagedEngine = null
let shutdownPromise = null

function getEngineStatus(options = {}) {
  return runEngineRequest({ command: "engine.status" }, options)
}

async function runEngineRequest(request, options = {}) {
  return runPythonEngineRequest(request, options)
}

function runPythonEngineRequest(request, options = {}) {
  const repoRoot = options.repoRoot || defaultRepoRoot
  const timeoutMs = options.timeoutMs || defaultTimeoutMs
  const payload = JSON.stringify(request)
  const config = resolveWorkerConfig(repoRoot)

  return new Promise((resolve) => {
    if (shutdownPromise) {
      resolve(engineUnavailableResponse("RxnFlow local engine is shutting down."))
      return
    }
    pendingRequests.push({ config, payload, resolve, timeoutMs, timer: null, worker: null })
    scheduleDispatch()
  })
}

function resolveWorkerConfig(repoRoot) {
  const [command, args] = resolveEngineCommand()
  const env = engineEnvironment(repoRoot)
  const environmentKey = Object.keys(env).sort().map((key) => `${key}=${env[key]}`).join("\n")
  return {
    command,
    args,
    cwd: repoRoot,
    env,
    key: JSON.stringify([command, args, repoRoot, environmentKey]),
  }
}

function scheduleDispatch() {
  if (dispatchScheduled || shutdownPromise) return
  dispatchScheduled = true
  queueMicrotask(() => {
    dispatchScheduled = false
    dispatchRequests()
  })
}

function dispatchRequests() {
  if (shutdownPromise) return
  while (pendingRequests.length > 0) {
    const request = pendingRequests[0]
    let worker = findIdleWorker(request.config.key)
    if (!worker && workers.size < maxWorkerCount) {
      worker = createWorker(request.config)
    }
    if (!worker) {
      const incompatibleWorker = [...workers].find((candidate) => (
        !candidate.activeRequest
        && !candidate.retiring
        && candidate.config.key !== request.config.key
      ))
      if (incompatibleWorker) retireWorker(incompatibleWorker)
      return
    }
    pendingRequests.shift()
    assignRequest(worker, request)
  }
}

function findIdleWorker(configKey) {
  return [...workers].find((worker) => (
    worker.spawned
    && !worker.closed
    && !worker.retiring
    && !worker.activeRequest
    && worker.config.key === configKey
  ))
}

function createWorker(config) {
  const child = spawn(config.command, config.args, {
    cwd: config.cwd,
    env: config.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })
  const worker = {
    activeRequest: null,
    child,
    closed: false,
    config,
    retiring: false,
    spawned: false,
    stderr: "",
    stdout: "",
  }
  workers.add(worker)

  child.once("spawn", () => {
    worker.spawned = true
    if (worker.activeRequest) writeActiveRequest(worker)
    scheduleDispatch()
  })
  child.stdout.on("data", (chunk) => handleWorkerStdout(worker, chunk))
  child.stderr.on("data", (chunk) => {
    worker.stderr += chunk.toString("utf8")
  })
  child.stdin.on("error", (error) => {
    if (!worker.spawned || !worker.activeRequest) return
    failActiveRequest(worker, {
      ok: false,
      error: { code: "engine_write_failed", message: error.message },
    })
    retireWorker(worker)
  })
  child.on("error", (error) => {
    failActiveRequest(worker, engineUnavailableResponse(error.message))
    retireWorker(worker)
  })
  child.on("close", () => handleWorkerClose(worker))
  return worker
}

function assignRequest(worker, request) {
  worker.activeRequest = request
  worker.stderr = ""
  request.worker = worker
  request.timer = setTimeout(() => {
    if (worker.activeRequest !== request) return
    failActiveRequest(worker, {
      ok: false,
      error: {
        code: "engine_timeout",
        message: `RxnFlow local engine did not respond within ${request.timeoutMs}ms.`,
      },
    })
    retireWorker(worker)
  }, request.timeoutMs)
  if (worker.spawned) writeActiveRequest(worker)
}

function writeActiveRequest(worker) {
  const request = worker.activeRequest
  if (!request || worker.closed || worker.retiring) return
  worker.child.stdin.write(`${request.payload}\n`, (error) => {
    if (!error || worker.activeRequest !== request) return
    failActiveRequest(worker, {
      ok: false,
      error: { code: "engine_write_failed", message: error.message },
    })
    retireWorker(worker)
  })
}

function handleWorkerStdout(worker, chunk) {
  worker.stdout += chunk.toString("utf8")
  while (true) {
    const newlineIndex = worker.stdout.indexOf("\n")
    if (newlineIndex < 0) return
    const line = worker.stdout.slice(0, newlineIndex).replace(/\r$/, "")
    worker.stdout = worker.stdout.slice(newlineIndex + 1)
    if (!line.trim()) continue
    if (!worker.activeRequest) {
      retireWorker(worker)
      return
    }
    const parsed = parseEngineResponse(line)
    if (!parsed) {
      failActiveRequest(worker, badResponse(worker.stderr))
      retireWorker(worker)
      return
    }
    finishActiveRequest(worker, parsed)
    if (worker.stdout.split(/\r?\n/).some((extraLine) => extraLine.trim())) {
      retireWorker(worker)
      return
    }
  }
}

function handleWorkerClose(worker) {
  if (worker.closed) return
  worker.closed = true
  if (worker.activeRequest) {
    const parsed = parseEngineResponse(worker.stdout)
    finishActiveRequest(worker, parsed || badResponse(worker.stderr))
  }
  workers.delete(worker)
  scheduleDispatch()
}

function finishActiveRequest(worker, response) {
  const request = worker.activeRequest
  if (!request) return
  worker.activeRequest = null
  clearTimeout(request.timer)
  request.resolve(response)
  scheduleDispatch()
}

function failActiveRequest(worker, response) {
  finishActiveRequest(worker, response)
}

function retireWorker(worker) {
  if (worker.retiring || worker.closed) return
  worker.retiring = true
  worker.child.kill()
}

function badResponse(stderr) {
  return {
    ok: false,
    error: {
      code: "engine_bad_response",
      message: stderr.trim() || "RxnFlow local engine returned an unreadable response.",
    },
  }
}

function engineUnavailableResponse(message) {
  return {
    ok: false,
    error: { code: "engine_unavailable", message },
  }
}

function shutdownEngineWorkers() {
  if (shutdownPromise) return shutdownPromise
  const response = engineUnavailableResponse("RxnFlow local engine is shutting down.")
  for (const request of pendingRequests.splice(0)) request.resolve(response)

  const activeWorkers = [...workers]
  const workerClosures = activeWorkers.map(waitForWorkerClose)
  for (const worker of activeWorkers) {
    failActiveRequest(worker, response)
    retireWorker(worker)
  }
  shutdownPromise = Promise.all(workerClosures).then(() => {
    cleanupMaterializedPackagedEngine()
    shutdownPromise = null
  })
  return shutdownPromise
}

function waitForWorkerClose(worker) {
  if (worker.closed) return Promise.resolve()
  return new Promise((resolve) => {
    worker.child.once("close", resolve)
  })
}

function parseEngineResponse(output) {
  const line = output.trim().split(/\r?\n/).filter(Boolean).at(-1)
  if (!line) return null
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function resolveEngineCommand() {
  if (process.env.RXNFLOW_ENGINE_COMMAND) {
    const parts = process.env.RXNFLOW_ENGINE_COMMAND.split(" ").filter(Boolean)
    return [parts[0], parts.slice(1)]
  }
  const executableName = engineExecutableName()
  if (isPackagedAppRuntime() && process.resourcesPath) {
    return [resolveMaterializedPackagedEngine(path.join(process.resourcesPath, "engine", executableName)), []]
  }
  const bundledEngine = bundledEngineCommand()
  if (bundledEngine) return bundledEngine
  return [process.env.RXNFLOW_PYTHON || "python3", ["-m", "rxnflow.engine_ipc"]]
}

function bundledEngineCommand() {
  const executableName = engineExecutableName()
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, "engine", executableName) : null,
    path.join(__dirname, "..", "engine", executableName),
  ].filter(Boolean)
  const enginePath = candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile()
    } catch {
      return false
    }
  })
  return enginePath ? [enginePath, []] : null
}

function engineExecutableName() {
  return process.platform === "win32" ? "rxnflow-engine.exe" : "rxnflow-engine"
}

function isPackagedAppRuntime() {
  return __dirname.split(path.sep).includes("app.asar")
}

function resolveMaterializedPackagedEngine(sourcePath) {
  if (materializedPackagedEngine?.sourcePath === sourcePath && fs.existsSync(materializedPackagedEngine.executablePath)) {
    return materializedPackagedEngine.executablePath
  }
  const runtimeDirectory = path.join(os.tmpdir(), "rxnflow-engine-runtime", String(process.pid))
  const executablePath = materializeEngineExecutable(sourcePath, runtimeDirectory)
  materializedPackagedEngine = { executablePath, runtimeDirectory, sourcePath }
  if (!materializedCleanupRegistered) {
    materializedCleanupRegistered = true
    process.once("exit", cleanupMaterializedPackagedEngine)
  }
  return executablePath
}

function materializeEngineExecutable(sourcePath, runtimeDirectory) {
  fs.mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 })
  const executablePath = path.join(runtimeDirectory, path.basename(sourcePath))
  const temporaryPath = `${executablePath}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.copyFileSync(sourcePath, temporaryPath)
    if (process.platform !== "win32") fs.chmodSync(temporaryPath, 0o755)
    fs.renameSync(temporaryPath, executablePath)
  } finally {
    fs.rmSync(temporaryPath, { force: true })
  }
  return executablePath
}

function cleanupMaterializedPackagedEngine() {
  if (!materializedPackagedEngine) return
  try {
    fs.rmSync(materializedPackagedEngine.runtimeDirectory, { recursive: true, force: true })
  } catch {}
  materializedPackagedEngine = null
}

function engineEnvironment(repoRoot) {
  return {
    ...process.env,
    PYTHONPATH: process.env.PYTHONPATH
      ? `${repoRoot}${path.delimiter}${process.env.PYTHONPATH}`
      : repoRoot,
  }
}

module.exports = {
  getEngineStatus,
  materializeEngineExecutable,
  runEngineRequest,
  shutdownEngineWorkers,
}
