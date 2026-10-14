const { spawn } = require("node:child_process")
const path = require("node:path")
const { prepareDevEngine } = require("./dev-engine.cjs")
const { shutdownEngineWorkers } = require("../electron/engine-bridge.cjs")

async function main() {
  prepareDevEngine()
  const electronExecutable = require("electron")
  const { createServer } = await import("vite")
  const server = await createServer({ root: path.resolve(__dirname, ".."), server: { host: "127.0.0.1" } })
  try {
    await server.listen()
  } catch (error) {
    await server.close()
    throw error
  }
  server.printUrls()
  const port = server.httpServer.address().port
  const electron = spawn(electronExecutable, ["electron/main.cjs", ...process.argv.slice(2)], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, RXNCANVAS_DESKTOP_DEV_SERVER: `http://127.0.0.1:${port}` },
    stdio: "inherit",
  })
  let closing = false
  const close = async (code = 0) => {
    if (closing) return
    closing = true
    electron.kill()
    await server.close()
    await shutdownEngineWorkers()
    process.exitCode = code
  }
  electron.once("exit", (code) => void close(code ?? 0))
  electron.once("error", (error) => {
    console.error(error.message)
    void close(1)
  })
  process.once("SIGINT", () => void close())
  process.once("SIGTERM", () => void close())
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
