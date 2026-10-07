const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const vm = require("node:vm")

const mainSource = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8")
const smokeSource = mainSource.match(/function installRuntimeSmokeExit\(window\) \{[\s\S]*?\n\}/)?.[0]
assert.ok(smokeSource, "runtime smoke handler missing")

async function runSmoke(t, { delayMs, response }) {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const handlers = new Map()
  const messages = []
  const exits = []
  let rendererChecks = 0
  let cleanedUp = false
  let requestStarted
  const started = new Promise((resolve) => { requestStarted = resolve })
  const context = {
    setTimeout,
    clearTimeout,
    runtimeSmokeTimeoutMs: 45000,
    runtimeRendererReadyTimeoutMs: 15000,
    runtimeEngineReadyTimeoutMs: 20000,
    runtimeStartupRestoreSmoke: false,
    app: { getPath: () => "/tmp", exit: (code) => exits.push(code) },
    path,
    fs: {
      mkdtemp: async () => "/tmp/runtime-source",
      writeFile: async () => {},
      rm: async () => { cleanedUp = true },
    },
    console: { log: (message) => messages.push(message), error: (message) => messages.push(message) },
    runEngineRequest: (_request, options = {}) => new Promise((resolve) => {
      const replyTimer = setTimeout(() => {
        clearTimeout(deadlineTimer)
        resolve(response)
      }, delayMs)
      const deadlineTimer = setTimeout(() => {
        clearTimeout(replyTimer)
        resolve({ ok: false, error: { code: "engine_timeout", message: "Engine startup exceeded request deadline" } })
      }, options.timeoutMs || 5000)
      requestStarted()
    }),
  }
  const install = vm.runInNewContext(`(${smokeSource})`, context)
  install({
    webContents: {
      once: (event, callback) => handlers.set(event, callback),
      executeJavaScript: async () => {
        rendererChecks++
        return { engineVersion: "0.1.0", runtime: "bundled-python", cclibVersion: "1.8.1" }
      },
    },
  })
  const completed = handlers.get("did-finish-load")()
  await started
  t.mock.timers.tick(delayMs)
  await completed
  assert.equal(cleanedUp, true)
  return { exits, messages, rendererChecks }
}

test("runtime smoke accepts a cold engine that responds within the startup budget", async (t) => {
  const result = await runSmoke(t, {
    delayMs: 6000,
    response: { ok: true, data: { files: [{ parse: { parsed: true, parseScope: "full-file" } }] } },
  })
  assert.deepEqual(result.exits, [0])
  assert.equal(result.rendererChecks, 1)
  assert.match(result.messages[0], /RXNFLOW_DESKTOP_RUNTIME_SMOKE_OK/)
})

test("runtime smoke still fails when the engine exceeds the startup budget and reports why", async (t) => {
  const result = await runSmoke(t, { delayMs: 21000, response: { ok: true } })
  assert.deepEqual(result.exits, [1])
  assert.equal(result.rendererChecks, 0)
  assert.match(result.messages[0], /engine_timeout/)
})
