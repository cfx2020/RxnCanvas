const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const webRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(webRoot, "..")
const engineDir = path.join(webRoot, "engine")
const buildRoot = path.join(webRoot, ".engine-build")
const entryPath = path.join(webRoot, "scripts", "engine-entry.py")
const requirementsLockPath = path.join(webRoot, "engine-requirements.lock")
const executableBaseName = "rxnflow-engine"
const executableName = process.platform === "win32" ? `${executableBaseName}.exe` : executableBaseName
const executablePath = path.join(engineDir, executableName)

function main() {
  fs.mkdirSync(engineDir, { recursive: true })
  fs.mkdirSync(buildRoot, { recursive: true })
  assert(fs.existsSync(requirementsLockPath), `Missing locked engine dependencies: ${requirementsLockPath}`)
  for (const staleName of ["rxnflow-engine", "rxnflow-engine.exe"]) {
    fs.rmSync(path.join(engineDir, staleName), { force: true })
  }

  const args = pyinstallerArgs()
  if (commandAvailable("uv", ["--version"])) {
    run("uv", [
      "run",
      "--with-requirements",
      requirementsLockPath,
      "python",
      "-m",
      "PyInstaller",
      ...args,
    ])
  } else {
    const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3")
    const venvDir = path.join(buildRoot, "venv")
    const venvPython = process.platform === "win32"
      ? path.join(venvDir, "Scripts", "python.exe")
      : path.join(venvDir, "bin", "python")
    fs.rmSync(venvDir, { recursive: true, force: true })
    run(python, ["-m", "venv", venvDir])
    run(venvPython, ["-m", "pip", "install", "--require-hashes", "-r", requirementsLockPath])
    run(venvPython, ["-m", "PyInstaller", ...args])
  }

  assert(fs.existsSync(executablePath), `PyInstaller did not create ${executablePath}`)
  if (process.platform !== "win32") {
    fs.chmodSync(executablePath, 0o755)
  }
  verifyEngineExecutable()
  console.log(`RxnFlow bundled Python engine ready: ${path.relative(webRoot, executablePath)}`)
}

function pyinstallerArgs() {
  return [
    "--clean",
    "--noconfirm",
    "--onefile",
    "--name",
    executableBaseName,
    "--paths",
    repoRoot,
    "--collect-all",
    "cclib",
    "--distpath",
    engineDir,
    "--workpath",
    path.join(buildRoot, "work"),
    "--specpath",
    path.join(buildRoot, "spec"),
    entryPath,
  ]
}

function verifyEngineExecutable() {
  const result = spawnSync(executablePath, {
    input: `${JSON.stringify({ command: "engine.status" })}\n`,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  })
  if (result.error) throw result.error
  const output = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
  let response = null
  try {
    response = output ? JSON.parse(output) : null
  } catch {
    response = null
  }
  const cclib = response?.data?.dependencies?.cclib
  if (!response?.ok || response.data?.runtime !== "bundled-python" || cclib?.available !== true) {
    throw new Error([
      "Bundled engine status check failed.",
      `stdout: ${result.stdout.trim()}`,
      `stderr: ${result.stderr.trim()}`,
    ].join("\n"))
  }
}

function commandAvailable(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "ignore",
    shell: process.platform === "win32",
  })
  return result.status === 0
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main()
