const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { materializeEngineExecutable, runEngineRequest, shutdownEngineWorkers } = require("./engine-bridge.cjs")

test("materialized packaged engine remains stable when its source is replaced", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-engine-materialized-"))
  const sourcePath = path.join(tempDir, "source", "rxncanvas-engine")
  const runtimeDirectory = path.join(tempDir, "runtime")
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true })
  fs.writeFileSync(sourcePath, "engine-before-rebuild", "utf8")
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))

  const executablePath = materializeEngineExecutable(sourcePath, runtimeDirectory)
  fs.writeFileSync(sourcePath, "engine-after-rebuild", "utf8")

  assert.equal(fs.readFileSync(executablePath, "utf8"), "engine-before-rebuild")
  if (process.platform !== "win32") {
    assert.notEqual(fs.statSync(executablePath).mode & 0o111, 0)
  }
})

test("engine worker pool reuses processes, recovers, and shuts down", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-engine-pool-"))
  const fakeEnginePath = path.join(tempDir, "fake-engine.cjs")
  const previousCommand = process.env.RXNCANVAS_ENGINE_COMMAND
  fs.writeFileSync(fakeEnginePath, `
const fs = require("node:fs")
const readline = require("node:readline")
const input = readline.createInterface({ input: process.stdin })

input.on("line", (line) => {
  const request = JSON.parse(line)
  if (request.logPath) fs.appendFileSync(request.logPath, request.requestId + "\\n")
  if (request.command === "test.crash") process.exit(17)
  if (request.command === "test.hang") return
  const respond = () => process.stdout.write(JSON.stringify({
    ok: true,
    data: { pid: process.pid, requestId: request.requestId || null },
  }) + "\\n")
  setTimeout(respond, request.delayMs || 0)
})
`, "utf8")
  process.env.RXNCANVAS_ENGINE_COMMAND = `${process.execPath} ${fakeEnginePath}`

  t.after(async () => {
    await shutdownEngineWorkers()
    if (previousCommand === undefined) {
      delete process.env.RXNCANVAS_ENGINE_COMMAND
    } else {
      process.env.RXNCANVAS_ENGINE_COMMAND = previousCommand
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  const first = await runEngineRequest({ command: "engine.status" })
  const second = await runEngineRequest({ command: "engine.status" })
  assert.equal(first.ok, true)
  assert.equal(second.data.pid, first.data.pid)

  const concurrent = await Promise.all(Array.from({ length: 9 }, (_, index) => (
    runEngineRequest({ command: "test.delay", delayMs: 30, requestId: index })
  )))
  const concurrentPids = new Set(concurrent.map((response) => response.data.pid))
  assert.equal(concurrent.every((response) => response.ok), true)
  assert.equal(concurrentPids.size, 3)

  const fifoLogPath = path.join(tempDir, "fifo.log")
  await Promise.all([
    runEngineRequest({ command: "test.delay", delayMs: 250, requestId: "block-a", logPath: fifoLogPath }),
    runEngineRequest({ command: "test.delay", delayMs: 250, requestId: "block-b", logPath: fifoLogPath }),
    runEngineRequest({ command: "test.delay", delayMs: 20, requestId: "fifo-1", logPath: fifoLogPath }),
    runEngineRequest({ command: "test.delay", requestId: "fifo-2", logPath: fifoLogPath }),
    runEngineRequest({ command: "test.delay", requestId: "fifo-3", logPath: fifoLogPath }),
  ])
  const fifoStarts = fs.readFileSync(fifoLogPath, "utf8").trim().split(/\r?\n/)
  assert.ok(fifoStarts.indexOf("fifo-1") < fifoStarts.indexOf("fifo-2"))
  assert.ok(fifoStarts.indexOf("fifo-2") < fifoStarts.indexOf("fifo-3"))

  const crashPid = (await runEngineRequest({ command: "engine.status" })).data.pid
  const crashed = await runEngineRequest({ command: "test.crash" })
  assert.equal(crashed.error.code, "engine_bad_response")
  const recoveredAfterCrash = await runEngineRequest({ command: "engine.status" })
  assert.equal(recoveredAfterCrash.ok, true)
  assert.notEqual(recoveredAfterCrash.data.pid, crashPid)

  const timeoutPid = recoveredAfterCrash.data.pid
  const timedOut = await runEngineRequest({ command: "test.hang" }, { timeoutMs: 50 })
  assert.equal(timedOut.error.code, "engine_timeout")
  const recoveredAfterTimeout = await runEngineRequest({ command: "engine.status" })
  assert.equal(recoveredAfterTimeout.ok, true)
  assert.notEqual(recoveredAfterTimeout.data.pid, timeoutPid)

  const livePids = new Set(concurrentPids)
  for (let index = 0; index < 3; index += 1) {
    livePids.add((await runEngineRequest({ command: "engine.status" })).data.pid)
  }
  livePids.add(recoveredAfterTimeout.data.pid)
  const interruptedRequests = Array.from({ length: 5 }, (_, index) => (
    runEngineRequest({ command: "test.delay", delayMs: 500, requestId: `shutdown-${index}` })
  ))
  await new Promise((resolve) => setTimeout(resolve, 20))
  await shutdownEngineWorkers()
  const interruptedResponses = await Promise.all(interruptedRequests)
  assert.equal(interruptedResponses.every((response) => response.error?.code === "engine_unavailable"), true)
  for (const pid of livePids) await assertProcessExited(pid)

  const restarted = await runEngineRequest({ command: "engine.status" })
  assert.equal(restarted.ok, true)
})

test("engine worker pool preserves engine_unavailable", async (t) => {
  const previousCommand = process.env.RXNCANVAS_ENGINE_COMMAND
  process.env.RXNCANVAS_ENGINE_COMMAND = path.join(os.tmpdir(), `rxncanvas-missing-engine-${process.pid}`)
  t.after(async () => {
    await shutdownEngineWorkers()
    if (previousCommand === undefined) {
      delete process.env.RXNCANVAS_ENGINE_COMMAND
    } else {
      process.env.RXNCANVAS_ENGINE_COMMAND = previousCommand
    }
  })

  const response = await runEngineRequest({ command: "engine.status" }, { timeoutMs: 1000 })
  assert.equal(response.error.code, "engine_unavailable")
})

async function assertProcessExited(pid) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      if (error.code === "ESRCH") return
      throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.fail(`engine worker ${pid} was still running after shutdown`)
}
