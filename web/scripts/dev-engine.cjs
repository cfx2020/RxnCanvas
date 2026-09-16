const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const webRoot = path.resolve(__dirname, "..")
const repoRoot = path.dirname(webRoot)
const requirements = path.join(webRoot, "engine-requirements.lock")
const venv = path.join(webRoot, ".engine-build", "dev-venv")
const venvPython = process.platform === "win32" ? path.join(venv, "Scripts", "python.exe") : path.join(venv, "bin", "python")

function prepareDevEngine() {
  if (process.env.RXNFLOW_ENGINE_COMMAND) return
  if (process.env.RXNFLOW_PYTHON) {
    checkPython(process.env.RXNFLOW_PYTHON)
    return
  }
  const lockHash = require("node:crypto").createHash("sha256").update(fs.readFileSync(requirements)).digest("hex")
  const marker = path.join(venv, ".rxnflow-lock")
  if (!fs.existsSync(venvPython) || !fs.existsSync(marker) || fs.readFileSync(marker, "utf8") !== lockHash) {
    console.log("Preparing the RxnFlow Python + cclib development engine...")
    const hasUv = spawnSync("uv", ["--version"], { stdio: "ignore" }).status === 0
    if (!fs.existsSync(venvPython)) {
      if (hasUv) run("uv", ["venv", venv])
      else run(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-m", "venv", venv])
    }
    if (hasUv) run("uv", ["pip", "sync", "--python", venvPython, "--require-hashes", requirements])
    else run(venvPython, ["-m", "pip", "install", "--require-hashes", "-r", requirements])
    checkPython(venvPython)
    fs.writeFileSync(marker, lockHash)
  } else {
    checkPython(venvPython)
  }
  process.env.RXNFLOW_PYTHON = venvPython
}

function checkPython(python) {
  const result = spawnSync(python, ["-c", "import cclib; assert cclib.__version__ == '1.8.1'"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(`Python + cclib 1.8.1 is required: ${python}\n${result.error?.message || result.stderr || ""}`)
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}.`)
}

module.exports = { prepareDevEngine }
