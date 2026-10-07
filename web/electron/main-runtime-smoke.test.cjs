const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const vm = require("node:vm")

const mainSource = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8")
const smokeSource = mainSource.match(/function installRuntimeSmokeExit\(window\) \{[\s\S]*?\n\}/)?.[0]
assert.ok(smokeSource, "runtime smoke handler missing")

async function runSmoke(t, { delayMs, response, rendererHangs = false }) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] })
  const handlers = new Map()
  const messages = []
  const exits = []
  let rendererChecks = 0
  let cleanedUp = false
  let requestStarted
  const started = new Promise((resolve) => { requestStarted = resolve })
  let rendererStarted
  const rendererReady = new Promise((resolve) => { rendererStarted = resolve })
  const context = {
    Date,
    setTimeout,
    clearTimeout,
    runtimeSmokeTimeoutMs: 45000,
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
        rendererStarted()
        if (rendererHangs) return new Promise(() => {})
        return { engineVersion: "0.1.0", runtime: "bundled-python", cclibVersion: "1.8.1" }
      },
    },
  })
  const completed = handlers.get("did-finish-load")()
  await started
  t.mock.timers.tick(delayMs)
  if (rendererHangs) {
    await rendererReady
    t.mock.timers.tick(45000 - delayMs)
  } else {
    await completed
  }
  assert.equal(cleanedUp, true)
  return { exits, messages, rendererChecks }
}

test("runtime smoke accepts a cold engine that responds within the startup budget", async (t) => {
  const result = await runSmoke(t, {
    delayMs: 21000,
    response: { ok: true, data: { files: [{ parse: { parsed: true, parseScope: "full-file" } }] } },
  })
  assert.deepEqual(result.exits, [0])
  assert.equal(result.rendererChecks, 1)
  assert.match(result.messages[0], /RXNFLOW_DESKTOP_RUNTIME_SMOKE_OK/)
})

test("runtime smoke reports engine failures without retrying", async (t) => {
  const result = await runSmoke(t, {
    delayMs: 1000,
    response: { ok: false, error: { code: "engine_unavailable", message: "Engine failed to start" } },
  })
  assert.deepEqual(result.exits, [1])
  assert.equal(result.rendererChecks, 0)
  assert.match(result.messages[0], /engine_unavailable/)
})

test("runtime smoke enforces the total deadline across engine and renderer startup", async (t) => {
  const result = await runSmoke(t, {
    delayMs: 1000,
    response: { ok: true, data: { files: [{ parse: { parsed: true, parseScope: "full-file" } }] } },
    rendererHangs: true,
  })
  assert.deepEqual(result.exits, [1])
  assert.equal(result.rendererChecks, 1)
  assert.match(result.messages[0], /did not complete within 45000ms/)
})
