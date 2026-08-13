const assert = require("node:assert/strict")
const test = require("node:test")

const { analyzeManifest, mib } = require("./check-bundle-budgets.cjs")

function fixtureManifest() {
  return {
    "index.html": {
      file: "assets/index.js",
      imports: ["_runtime.js"],
      dynamicImports: ["heavy.js"],
      css: ["assets/index.css"],
    },
    "_runtime.js": {
      file: "assets/runtime.js",
    },
    "heavy.js": {
      file: "assets/heavy.js",
      imports: ["_runtime.js"],
      isDynamicEntry: true,
    },
  }
}

function fixtureMeasurements(sizes) {
  return {
    fileSize: (file) => sizes[file] ?? 0,
    gzipSize: (file) => Math.ceil((sizes[file] ?? 0) / 3),
  }
}

test("calculates unique static entry files without following dynamic imports", () => {
  const results = analyzeManifest(fixtureManifest(), [{
    id: "startup",
    entry: "index.html",
    maxBytes: mib(1),
    forbiddenStaticEntries: ["heavy.js"],
  }], fixtureMeasurements({
    "assets/index.js": 400,
    "assets/runtime.js": 100,
    "assets/index.css": 200,
    "assets/heavy.js": 900,
  }))

  assert.equal(results[0].totalBytes, 700)
  assert.deepEqual(results[0].files, ["assets/index.css", "assets/index.js", "assets/runtime.js"])
})

test("rejects a heavy entry that leaks into the startup static graph", () => {
  const manifest = fixtureManifest()
  manifest["index.html"].imports.push("heavy.js")

  assert.throws(() => analyzeManifest(manifest, [{
    id: "startup",
    entry: "index.html",
    maxBytes: mib(1),
    forbiddenStaticEntries: ["heavy.js"],
  }], fixtureMeasurements({})), /forbidden static entry/)
})

test("rejects missing and no-longer-dynamic feature entries", () => {
  assert.throws(() => analyzeManifest(fixtureManifest(), [{
    id: "missing",
    entry: "missing.js",
    maxBytes: mib(1),
  }], fixtureMeasurements({})), /missing required entry/)

  const manifest = fixtureManifest()
  manifest["index.html"].dynamicImports = []
  assert.throws(() => analyzeManifest(manifest, [{
    id: "heavy",
    entry: "heavy.js",
    maxBytes: mib(1),
    mustBeDynamicFrom: "index.html",
  }], fixtureMeasurements({})), /must remain dynamically imported/)
})

test("rejects a static closure over its byte budget", () => {
  assert.throws(() => analyzeManifest(fixtureManifest(), [{
    id: "heavy",
    entry: "heavy.js",
    maxBytes: 500,
    mustBeDynamicFrom: "index.html",
  }], fixtureMeasurements({
    "assets/runtime.js": 100,
    "assets/heavy.js": 500,
  })), /exceeded: 600 B > 500 B/)
})
