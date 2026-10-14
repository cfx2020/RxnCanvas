const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const http = require("node:http")
const test = require("node:test")
const { createBrowserEngineMiddleware } = require("./browser-engine.cjs")

async function startServer(t, runRequest, options = {}) {
  const middleware = createBrowserEngineMiddleware({ runRequest, ...options })
  const server = http.createServer((request, response) => {
    middleware(request, response, () => {
      response.writeHead(404).end()
    })
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

function upload(base, content, { name = "calculation.log", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(`${base}/api/import/preview?name=${encodeURIComponent(name)}`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "content-length": Buffer.byteLength(content),
        "x-rxncanvas-request": "1",
        origin: base,
        ...headers,
      },
    }, (response) => {
      const chunks = []
      response.on("data", (chunk) => chunks.push(chunk))
      response.on("error", reject)
      response.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode })))
    })
    request.on("error", reject)
    request.end(content)
  })
}

test("browser import sends the complete bytes to the Python command and removes the temporary source", async (t) => {
  const content = `${"head\n".repeat(15000)}SCF Done: E(RB3LYP) = -76.431 A.U.\n${"tail\n".repeat(120000)}`
  let uploadedPath
  const parse = { parsed: true, parserId: "gaussian-log-cclib+rxncanvas-text-full-file", energyGas: -76.431 }
  const base = await startServer(t, async (request) => {
    assert.equal(request.command, "import.preview")
    assert.equal(request.files.length, 1)
    assert.equal(request.files[0].name, "calculation.log")
    uploadedPath = request.files[0].sourcePath
    assert.equal(await fs.readFile(uploadedPath, "utf8"), content)
    return { ok: true, data: { files: [{ name: "calculation.log", parse }] } }
  })
  const response = await upload(base, content)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, data: { parse } })
  await assert.rejects(fs.stat(uploadedPath), { code: "ENOENT" })
})

test("browser import rejects cross-site requests, paths, and oversized files without invoking the engine", async (t) => {
  const base = await startServer(t, async () => assert.fail("Engine must not run"), { maxSourceBytes: 32 })
  assert.equal((await upload(base, "data", { headers: { origin: "https://untrusted.example" } })).status, 403)
  assert.equal((await upload(base, "data", { headers: { host: "untrusted.example" } })).status, 403)
  assert.equal((await upload(base, "data", { headers: { "sec-fetch-site": "same-site" } })).status, 403)
  assert.equal((await upload(base, "data", { headers: { "x-rxncanvas-request": "" } })).status, 403)
  assert.equal((await upload(base, "data", { name: "../private.log" })).status, 400)
  assert.equal((await upload(base, "data", { name: "C:\\private.log" })).status, 400)
  assert.equal((await upload(base, "x".repeat(33))).status, 413)
  const response = await fetch(`${base}/api/import/preview?name=a.log&sourcePath=/etc/passwd`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-rxncanvas-request": "1", origin: base },
    body: JSON.stringify({ sourcePath: "/etc/passwd" }),
  })
  assert.equal(response.status, 400)
})

test("browser import reports engine failure and cleans up its upload", async (t) => {
  let uploadedPath
  const base = await startServer(t, async (request) => {
    uploadedPath = request.files[0].sourcePath
    return { ok: false, error: { code: "engine_unavailable", message: "Python is unavailable." } }
  })
  const response = await upload(base, "source")
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, "engine_unavailable")
  await assert.rejects(fs.stat(uploadedPath), { code: "ENOENT" })
})

test("browser imports bound concurrent uploads and release capacity after a thrown engine error", async (t) => {
  const jobs = []
  let allStarted
  const started = new Promise((resolve) => { allStarted = resolve })
  const base = await startServer(t, (request) => new Promise((resolve, reject) => {
    jobs.push({ resolve, reject, sourcePath: request.files[0].sourcePath })
    if (jobs.length === 3) allStarted()
  }))
  const responses = Array.from({ length: 3 }, () => upload(base, "source"))
  await started
  try {
    assert.equal((await upload(base, "fourth")).status, 503)
  } finally {
    for (const job of jobs) job.reject(new Error("Engine exited."))
  }
  for (const response of await Promise.all(responses)) assert.equal(response.status, 500)
  for (const job of jobs) await assert.rejects(fs.stat(job.sourcePath), { code: "ENOENT" })
  const retry = upload(base, "retry")
  while (jobs.length < 4) await new Promise((resolve) => setTimeout(resolve, 5))
  jobs[3].resolve({ ok: false, error: { code: "engine_unavailable", message: "Offline." } })
  assert.equal((await retry).status, 503)
  assert.equal(jobs.length, 4)
})
