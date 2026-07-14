const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const originalCreateReadStream = fs.createReadStream
let streamedFiles = []

fs.createReadStream = function countedCreateReadStream(filePath, ...args) {
  streamedFiles.push(path.resolve(filePath))
  return originalCreateReadStream.call(this, filePath, ...args)
}

const {
  defaultImportStoredPathForFile,
  materializeImportSourceFile,
  saveProjectContent,
} = require("./project-store.cjs")

test.after(() => {
  fs.createReadStream = originalCreateReadStream
})

test("planned source paths are stable for the same name and distinct after sanitization", () => {
  assert.equal(
    defaultImportStoredPathForFile({ name: "OPT.LOG" }, 0),
    defaultImportStoredPathForFile({ name: "opt.log" }, 1),
  )
  assert.notEqual(
    defaultImportStoredPathForFile({ name: "a b.log" }, 0),
    defaultImportStoredPathForFile({ name: "a@b.log" }, 1),
  )
  assert.notEqual(
    defaultImportStoredPathForFile({ name: "a.foo!" }, 0),
    defaultImportStoredPathForFile({ name: "a.foo" }, 1),
  )
  assert.notEqual(
    defaultImportStoredPathForFile({ name: "a.abcdefghijklmnopq1" }, 0),
    defaultImportStoredPathForFile({ name: "a.abcdefghijklmnopq2" }, 1),
  )
})

test("same-name imports replace the project source in request order", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxnflow-import-collision-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const firstSourceDirectory = path.join(tempDirectory, "first")
  const secondSourceDirectory = path.join(tempDirectory, "second")
  fs.mkdirSync(firstSourceDirectory, { recursive: true })
  fs.mkdirSync(secondSourceDirectory, { recursive: true })
  const firstSourcePath = path.join(firstSourceDirectory, "shared.log")
  const secondSourcePath = path.join(secondSourceDirectory, "shared.log")
  fs.writeFileSync(firstSourcePath, "first source", "utf8")
  fs.writeFileSync(secondSourcePath, "second source", "utf8")

  for (const [scenario, usedStoredPathSets] of [
    ["within one batch", [new Set(), null]],
    ["across independent batches", [new Set(), new Set()]],
  ]) {
    await t.test(scenario, async () => {
      const projectDirectory = path.join(tempDirectory, `${scenario.replaceAll(" ", "-")}.rxnflow`)
      const firstUsedStoredPaths = usedStoredPathSets[0]
      const secondUsedStoredPaths = usedStoredPathSets[1] || firstUsedStoredPaths
      const [first, second] = await Promise.all([
        materializeImportSourceFile(projectDirectory, {
          id: "first",
          name: "shared.log",
          storedPath: "sources/shared.log",
          sourcePath: firstSourcePath,
        }, 0, { usedStoredPaths: firstUsedStoredPaths }),
        materializeImportSourceFile(projectDirectory, {
          id: "second",
          name: "shared.log",
          storedPath: "sources/shared.log",
          sourcePath: secondSourcePath,
        }, 1, { usedStoredPaths: secondUsedStoredPaths }),
      ])

      assert.equal(first.storedPath, "sources/shared.log")
      assert.equal(second.storedPath, "sources/shared.log")
      assert.equal(fs.readFileSync(path.join(projectDirectory, first.storedPath), "utf8"), "second source")
      assert.equal(first.checksum, sha256("first source"))
      assert.equal(second.checksum, sha256("second source"))
    })
  }

  await t.test("after staggered independent imports", async () => {
    const projectDirectory = path.join(tempDirectory, "staggered-independent-imports.rxnflow")
    const first = await materializeImportSourceFile(projectDirectory, {
      id: "first",
      name: "shared.log",
      sourcePath: firstSourcePath,
    }, 0, { usedStoredPaths: new Set(), referencedStoredPaths: [] })
    const second = await materializeImportSourceFile(projectDirectory, {
      id: "second",
      name: "shared.log",
      storedPath: "sources/shared.log",
      sourcePath: secondSourcePath,
    }, 1, { usedStoredPaths: new Set(), referencedStoredPaths: [] })

    assert.equal(first.storedPath, "sources/shared.log")
    assert.equal(second.storedPath, "sources/shared.log")
    assert.equal(fs.readFileSync(path.join(projectDirectory, first.storedPath), "utf8"), "second source")
  })
})

test("failed source materialization releases its stored-path lock", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxnflow-import-reservation-release-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const projectDirectory = path.join(tempDirectory, "release-study.rxnflow")
  const missingSourcePath = path.join(tempDirectory, "missing", "shared.log")
  await assert.rejects(() => materializeImportSourceFile(projectDirectory, {
    id: "missing",
    name: "shared.log",
    sourcePath: missingSourcePath,
  }, 0, { usedStoredPaths: new Set() }))

  const validSourcePath = path.join(tempDirectory, "shared.log")
  fs.writeFileSync(validSourcePath, "valid source", "utf8")
  const materialized = await materializeImportSourceFile(projectDirectory, {
    id: "valid",
    name: "shared.log",
    sourcePath: validSourcePath,
  }, 0, { usedStoredPaths: new Set() })

  assert.equal(materialized.storedPath, "sources/shared.log")
  assert.equal(fs.readFileSync(path.join(projectDirectory, materialized.storedPath), "utf8"), "valid source")
})

test("superseded or failed replacement keeps the previous project source bytes", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxnflow-import-replacement-failure-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const projectDirectory = path.join(tempDirectory, "replacement-study.rxnflow")
  const targetPath = path.join(projectDirectory, "sources", "shared.log")
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, "previous source", "utf8")
  const olderSourcePath = path.join(tempDirectory, "older.log")
  fs.writeFileSync(olderSourcePath, "older replacement", "utf8")
  let latestGeneration = 1

  const olderReplacement = materializeImportSourceFile(projectDirectory, {
    id: "older",
    name: "shared.log",
    storedPath: "sources/shared.log",
    sourcePath: olderSourcePath,
  }, 0, { shouldCommit: () => latestGeneration === 1 })
  latestGeneration = 2
  const failedLatestReplacement = materializeImportSourceFile(projectDirectory, {
    id: "latest",
    name: "shared.log",
    storedPath: "sources/shared.log",
    sourcePath: path.join(tempDirectory, "missing.log"),
  }, 0, { shouldCommit: () => latestGeneration === 2 })

  await assert.rejects(olderReplacement, (error) => error?.code === "source_import_superseded")
  await assert.rejects(failedLatestReplacement)
  assert.equal(fs.readFileSync(targetPath, "utf8"), "previous source")
})

test("different source names that sanitize alike keep separate stored paths", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxnflow-import-sanitized-collision-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const projectDirectory = path.join(tempDirectory, "sanitized-collision.rxnflow")
  const firstPath = path.join(tempDirectory, "first.log")
  const secondPath = path.join(tempDirectory, "second.log")
  fs.writeFileSync(firstPath, "first", "utf8")
  fs.writeFileSync(secondPath, "second", "utf8")
  const [first, second] = await Promise.all([
    materializeImportSourceFile(projectDirectory, {
      id: "space",
      name: "a b.log",
      sourcePath: firstPath,
    }, 0),
    materializeImportSourceFile(projectDirectory, {
      id: "symbol",
      name: "a@b.log",
      sourcePath: secondPath,
    }, 1),
  ])

  assert.notEqual(first.storedPath, second.storedPath)
  assert.equal(fs.readFileSync(path.join(projectDirectory, first.storedPath), "utf8"), "first")
  assert.equal(fs.readFileSync(path.join(projectDirectory, second.storedPath), "utf8"), "second")
})

test("project source hashes use a shared bounded fingerprint cache with safe invalidation", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxnflow-project-hash-cache-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const projectDirectory = path.join(tempDirectory, "cache-study.rxnflow")
  const externalSourcePath = path.join(tempDirectory, "source.log")
  fs.mkdirSync(path.join(projectDirectory, "sources"), { recursive: true })
  fs.writeFileSync(externalSourcePath, "AAAA", "utf8")

  const materialized = await materializeImportSourceFile(projectDirectory, {
    id: "source",
    name: "source.log",
    sourcePath: externalSourcePath,
  }, 0, { usedStoredPaths: new Set() })
  const storedSourcePath = path.join(projectDirectory, materialized.storedPath)
  assert.equal(streamCount(storedSourcePath), 0)

  await t.test("materialize and persist share unchanged-file hashes", async () => {
    const saved = await saveProjectContent(projectDirectory, projectContent({
      ...materialized,
      sourcePath: storedSourcePath,
    }))
    const savedFile = JSON.parse(saved.content).files[0]
    assert.equal(savedFile.checksum, materialized.checksum)
    assert.equal(streamCount(storedSourcePath), 0)
  })

  await t.test("same-size modification invalidates the fingerprint", async () => {
    fs.writeFileSync(storedSourcePath, "BBBB", "utf8")
    const changed = await rematerialize(projectDirectory, storedSourcePath, materialized.storedPath)
    assert.equal(changed.checksum, sha256("BBBB"))
    assert.equal(streamCount(storedSourcePath), 1)
  })

  await t.test("atomic replacement invalidates the inode fingerprint", async () => {
    const replacementPath = path.join(tempDirectory, "replacement.log")
    fs.writeFileSync(replacementPath, "CCCC", "utf8")
    fs.renameSync(replacementPath, storedSourcePath)
    const replaced = await rematerialize(projectDirectory, storedSourcePath, materialized.storedPath)
    assert.equal(replaced.checksum, sha256("CCCC"))
    assert.equal(streamCount(storedSourcePath), 2)
  })

  await t.test("a file changing during hashing is retried", async () => {
    let replaceOnNextRead = true
    fs.createReadStream = function replacingCreateReadStream(filePath, ...args) {
      const absolutePath = path.resolve(filePath)
      streamedFiles.push(absolutePath)
      if (absolutePath === storedSourcePath && replaceOnNextRead) {
        replaceOnNextRead = false
        fs.writeFileSync(storedSourcePath, "DDDD", "utf8")
      }
      return originalCreateReadStream.call(this, filePath, ...args)
    }
    try {
      fs.writeFileSync(storedSourcePath, "EEEE", "utf8")
      const before = streamCount(storedSourcePath)
      const retried = await rematerialize(projectDirectory, storedSourcePath, materialized.storedPath)
      assert.equal(retried.checksum, sha256("DDDD"))
      assert.equal(streamCount(storedSourcePath) - before, 2)
    } finally {
      fs.createReadStream = function countedCreateReadStream(filePath, ...args) {
        streamedFiles.push(path.resolve(filePath))
        return originalCreateReadStream.call(this, filePath, ...args)
      }
    }
  })

  await t.test("pruning a source removes its cached hash", async () => {
    await saveProjectContent(projectDirectory, projectContent(null))
    assert.equal(fs.existsSync(storedSourcePath), false)
    fs.writeFileSync(storedSourcePath, "FFFF", "utf8")
    const before = streamCount(storedSourcePath)
    const recreated = await rematerialize(projectDirectory, storedSourcePath, materialized.storedPath)
    assert.equal(recreated.checksum, sha256("FFFF"))
    assert.equal(streamCount(storedSourcePath) - before, 1)
  })

  await t.test("the LRU evicts the least recently used entry after 256 files", async () => {
    const paths = []
    for (let index = 0; index < 257; index += 1) {
      const storedPath = `sources/cache-${index}.log`
      const sourcePath = path.join(projectDirectory, storedPath)
      fs.writeFileSync(sourcePath, String(index), "utf8")
      paths.push({ sourcePath, storedPath })
      await rematerialize(projectDirectory, sourcePath, storedPath)
    }

    const lastBefore = streamCount(paths[256].sourcePath)
    await rematerialize(projectDirectory, paths[256].sourcePath, paths[256].storedPath)
    assert.equal(streamCount(paths[256].sourcePath), lastBefore)

    const firstBefore = streamCount(paths[0].sourcePath)
    await rematerialize(projectDirectory, paths[0].sourcePath, paths[0].storedPath)
    assert.equal(streamCount(paths[0].sourcePath), firstBefore + 1)
  })
})

function rematerialize(projectDirectory, sourcePath, storedPath) {
  return materializeImportSourceFile(projectDirectory, {
    id: path.basename(sourcePath),
    name: path.basename(sourcePath),
    sourcePath,
    storedPath,
  }, 0, { usedStoredPaths: new Set() })
}

function projectContent(file) {
  return JSON.stringify({
    schemaVersion: 2,
    packageKind: "rxnflow-project",
    project: { id: "cache-study", label: "Cache Study", meta: "open" },
    files: file ? [file] : [],
    canvases: [{
      id: "canvas-1",
      label: "Canvas 1",
      nodes: [],
      edges: [],
      barriers: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedNodeIds: [],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
    }],
    activeCanvasId: "canvas-1",
    savedAt: "2026-07-13T00:00:00.000Z",
  })
}

function streamCount(filePath) {
  const absolutePath = path.resolve(filePath)
  return streamedFiles.filter((entry) => entry === absolutePath).length
}

function sha256(content) {
  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`
}
