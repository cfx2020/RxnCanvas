const { spawn } = require("node:child_process")
const path = require("node:path")
const { runEmbeddedEngineRequest } = require("./embedded-engine.cjs")

const defaultRepoRoot = path.resolve(__dirname, "..", "..")
const defaultTimeoutMs = 5000

function getEngineStatus(options = {}) {
  return runEngineRequest({ command: "engine.status" }, options)
}

async function runEngineRequest(request, options = {}) {
  if (options.preferEmbedded || process.env.RXNFLOW_ENGINE_RUNTIME === "embedded") {
    return runEmbeddedEngineRequest(request)
  }
  const response = await runPythonEngineRequest(request, options)
  if (!shouldFallbackToEmbedded(response)) return response
  const embeddedResponse = await runEmbeddedEngineRequest(request)
  if (!embeddedResponse.ok) return embeddedResponse
  return {
    ...embeddedResponse,
    warnings: [
      ...(Array.isArray(embeddedResponse.warnings) ? embeddedResponse.warnings : []),
      {
        code: "python_engine_unavailable",
        message: response.error?.message || "Python engine unavailable; using embedded desktop engine.",
      },
    ],
  }
}

function runPythonEngineRequest(request, options = {}) {
  const repoRoot = options.repoRoot || defaultRepoRoot
  const timeoutMs = options.timeoutMs || defaultTimeoutMs
  const [command, args] = resolveEngineCommand()

  return new Promise((resolve) => {
    let settled = false
    let stdout = ""
    let stderr = ""
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: engineEnvironment(repoRoot),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })

    const finish = (response) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(response)
    }

    const timer = setTimeout(() => {
      child.kill()
      finish({
        ok: false,
        error: {
          code: "engine_timeout",
          message: `RxnFlow local engine did not respond within ${timeoutMs}ms.`,
        },
      })
    }, timeoutMs)

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8")
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8")
    })
    child.stdin.on("error", (error) => {
      finish({
        ok: false,
        error: {
          code: "engine_write_failed",
          message: error.message,
        },
      })
    })
    child.on("error", (error) => {
      finish({
        ok: false,
        error: {
          code: "engine_unavailable",
          message: error.message,
        },
      })
    })
    child.on("close", () => {
      if (settled) return
      const parsed = parseEngineResponse(stdout)
      if (parsed) {
        finish(parsed)
        return
      }
      finish({
        ok: false,
        error: {
          code: "engine_bad_response",
          message: stderr.trim() || "RxnFlow local engine returned an unreadable response.",
        },
      })
    })

    child.stdin.end(`${JSON.stringify(request)}\n`)
  })
}

function shouldFallbackToEmbedded(response) {
  if (response?.ok) return false
  return ["engine_unavailable", "engine_timeout", "engine_bad_response", "engine_write_failed"].includes(response?.error?.code)
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
  return [process.env.RXNFLOW_PYTHON || "python3", ["-m", "rxnflow.engine_ipc"]]
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
  runEngineRequest,
}
