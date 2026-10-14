const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { Transform } = require("node:stream")
const { pipeline } = require("node:stream/promises")
const { runEngineRequest } = require("../electron/engine-bridge.cjs")

const maxSourceFileBytes = 512 * 1024 * 1024

function createBrowserEngineMiddleware({
  runRequest = runEngineRequest,
  maxSourceBytes = maxSourceFileBytes,
} = {}) {
  let activeImports = 0

  return (request, response, next) => {
    const url = new URL(request.url, "http://127.0.0.1")
    if (url.pathname !== "/api/import/preview" && url.pathname !== "/api/engine/status") return next()
    void handle(request, response, url).catch((error) => {
      send(response, error.status || 500, {
        ok: false,
        error: { code: error.code || "import_failed", message: error.message },
      })
    })
  }

  async function handle(request, response, url) {
    assertLocalRequest(request)
    if (url.pathname === "/api/engine/status") {
      if (request.method !== "GET") throw requestError(405, "invalid_method", "Expected GET.")
      const result = await runRequest({ command: "engine.status" }, { timeoutMs: 20000 })
      send(response, result.ok ? 200 : 503, result)
      return
    }
    if (request.method !== "POST") throw requestError(405, "invalid_method", "Expected POST.")
    const name = url.searchParams.get("name")
    if (!name || name.length > 255 || /[/\\\x00-\x1f]/.test(name) || name === "." || name === ".."
      || [...url.searchParams.keys()].some((key) => key !== "name")
      || url.searchParams.getAll("name").length !== 1) {
      throw requestError(400, "invalid_input", "Expected a filename, not a source path.")
    }
    if (request.headers["content-type"] !== "application/octet-stream") {
      throw requestError(415, "invalid_content_type", "Expected complete file bytes.")
    }
    const contentLength = Number(request.headers["content-length"] ?? 0)
    if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > maxSourceBytes) {
      throw requestError(413, "source_file_too_large", `Source files are limited to ${maxSourceBytes} bytes.`)
    }
    if (activeImports >= 3) throw requestError(503, "engine_busy", "The parser is busy. Retry the import shortly.")
    activeImports += 1
    let directory
    let result
    try {
      directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "rxncanvas-import-"))
      const sourcePath = path.join(directory, `source${path.extname(name)}`)
      let size = 0
      const limit = new Transform({
        transform(chunk, _encoding, callback) {
          size += chunk.length
          callback(size > maxSourceBytes
            ? requestError(413, "source_file_too_large", `Source files are limited to ${maxSourceBytes} bytes.`)
            : null, chunk)
        },
      })
      request.setTimeout(120000, () => request.destroy(new Error("File upload timed out.")))
      await pipeline(request, limit, fs.createWriteStream(sourcePath, { flags: "wx", mode: 0o600 }))
      result = await runRequest({
        command: "import.preview",
        files: [{ name, size, sourcePath }],
      }, { timeoutMs: 120000 })
    } finally {
      try {
        if (directory) await fs.promises.rm(directory, { recursive: true, force: true })
      } finally {
        activeImports -= 1
      }
    }
    if (!result.ok) {
      send(response, 503, result)
      return
    }
    const parse = result.data?.files?.[0]?.parse
    if (!parse || typeof parse !== "object") {
      throw requestError(502, "engine_bad_response", "The Python engine did not return a parse result.")
    }
    send(response, 200, { ok: true, data: { parse } })
  }
}

function assertLocalRequest(request) {
  const host = request.headers.host
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress)
    || typeof host !== "string" || !/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)
    || request.headers["x-rxncanvas-request"] !== "1"
    || (request.headers["sec-fetch-site"] && !["same-origin", "none"].includes(request.headers["sec-fetch-site"]))) {
    throw requestError(403, "forbidden", "Only same-origin local requests are allowed.")
  }
  const origin = request.headers.origin
  if (origin && origin !== `${request.socket.encrypted ? "https" : "http"}://${host}`) {
    throw requestError(403, "forbidden", "Only same-origin local requests are allowed.")
  }
}

function requestError(status, code, message) {
  return Object.assign(new Error(message), { status, code })
}

function send(response, status, payload) {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" })
  response.end(JSON.stringify(payload))
}

module.exports = { createBrowserEngineMiddleware }
