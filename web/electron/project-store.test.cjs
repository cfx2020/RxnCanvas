const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const originalCreateReadStream = fs.createReadStream
let streamedFiles = []

function deferred() {
  let resolve
  const promise = new Promise((next) => {
    resolve = next
  })
  return { promise, resolve }
}

fs.createReadStream = function countedCreateReadStream(filePath, ...args) {
  streamedFiles.push(path.resolve(filePath))
  return originalCreateReadStream.call(this, filePath, ...args)
}

const {
  defaultImportStoredPathForFile,
  exportProjectWorkspaceArchive,
  importProjectWorkspaceArchive,
  materializeImportSourceFile,
  projectStoredPathForSourcePath,
  readProjectContent,
  saveProjectContent,
  saveProjectReportArtifact,
  sourceFileDiskMetadata,
  withArchiveDestinationLock,
  withProjectSaveLock,
  writeProjectFileAtomically,
  writeProjectWorkspaceArchiveAtomically,
} = require("./project-store.cjs")

test.after(() => {
  fs.createReadStream = originalCreateReadStream
})

test("project saves run in request order per directory and continue after failure", async () => {
  const firstRelease = deferred()
  const events = []
  const projectDirectory = "/tmp/serialized-project-save.rxncanvas"
  const first = withProjectSaveLock(projectDirectory, async () => {
    events.push("first-start")
    await firstRelease.promise
    events.push("first-fail")
    throw new Error("first save failed")
  })
  await Promise.resolve()
  const second = withProjectSaveLock(projectDirectory, async () => {
    events.push("second-start")
    events.push("second-complete")
    return "saved"
  })
  await Promise.resolve()

  assert.deepEqual(events, ["first-start"])
  firstRelease.resolve()
  await assert.rejects(first, /first save failed/)
  assert.equal(await second, "saved")
  assert.deepEqual(events, ["first-start", "first-fail", "second-start", "second-complete"])
})

test("different project directories can save concurrently", async () => {
  const release = deferred()
  const events = []
  const first = withProjectSaveLock("/tmp/project-a.rxncanvas", async () => {
    events.push("a-start")
    await release.promise
    events.push("a-complete")
  })
  const second = withProjectSaveLock("/tmp/project-b.rxncanvas", async () => {
    events.push("b-start")
    await release.promise
    events.push("b-complete")
  })
  await Promise.resolve()

  assert.deepEqual(events, ["a-start", "b-start"])
  release.resolve()
  await Promise.all([first, second])
})

test("source imports wait for an in-flight project save before mutating sources", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-project-save-import-lock-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const projectDirectory = path.join(tempDirectory, "locked-project.rxncanvas")
  const sourcePath = path.join(tempDirectory, "new.log")
  fs.writeFileSync(sourcePath, "new source", "utf8")
  const releaseSave = deferred()
  const save = withProjectSaveLock(projectDirectory, async () => {
    await releaseSave.promise
  })
  await Promise.resolve()

  let importCompleted = false
  const imported = materializeImportSourceFile(projectDirectory, {
    id: "new-source",
    name: "new.log",
    sourcePath,
  }, 0, { usedStoredPaths: new Set() }).then((result) => {
    importCompleted = true
    return result
  })
  await Promise.resolve()

  assert.equal(importCompleted, false)
  releaseSave.resolve()
  await save
  const result = await imported
  assert.equal(result.storedPath, "sources/new.log")
  assert.equal(fs.readFileSync(path.join(projectDirectory, result.storedPath), "utf8"), "new source")
})

test("a stale pending snapshot cannot prune a completed external import", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-import-stale-save-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const projectDirectory = path.join(tempDirectory, "study")
  await saveProjectContent(projectDirectory, projectContent(null))
  const sourcePath = path.join(tempDirectory, "gas.log")
  fs.writeFileSync(sourcePath, "complete gas calculation", "utf8")
  const pendingFile = {
    id: "gas",
    name: "gas.log",
    kind: "Gaussian",
    size: fs.statSync(sourcePath).size,
    status: "staged",
    preview: "",
    parse: { parsed: false, warnings: [{ code: "parse_deferred" }] },
  }
  const imported = await materializeImportSourceFile(projectDirectory, { ...pendingFile, sourcePath }, 0)
  const storedSourcePath = path.join(projectDirectory, imported.storedPath)
  assert.equal(fs.readFileSync(storedSourcePath, "utf8"), "complete gas calculation")

  await saveProjectContent(projectDirectory, projectContent(pendingFile))
  assert.equal(fs.existsSync(storedSourcePath), true, "a pending snapshot deleted the source before receiving its import result")

  const { sourcePath: _sourcePath, ...completedFile } = imported
  const saved = await saveProjectContent(projectDirectory, projectContent({
    ...completedFile,
    status: "parsed",
    parse: { parsed: true, warnings: [] },
    parseChecksum: imported.checksum,
  }))
  const savedFile = JSON.parse(saved.content).files[0]
  assert.equal(savedFile.checksum, imported.checksum)
  assert.equal(savedFile.parseChecksum, imported.checksum)
  assert.equal(fs.readFileSync(storedSourcePath, "utf8"), "complete gas calculation")

  await saveProjectContent(projectDirectory, projectContent(null))
  assert.equal(fs.existsSync(storedSourcePath), false, "removing a saved source should still delete its project copy")
})

test("same-directory project snapshots commit in request order", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-project-save-order-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const projectDirectory = path.join(tempDirectory, "ordered-project.rxncanvas")
  const releaseBlocker = deferred()
  const blocker = withProjectSaveLock(projectDirectory, async () => {
    await releaseBlocker.promise
  })
  await Promise.resolve()
  const olderPackage = JSON.parse(projectContent(null))
  olderPackage.project.label = "Older snapshot"
  const newerPackage = JSON.parse(projectContent(null))
  newerPackage.project.label = "Newer snapshot"

  const olderSave = saveProjectContent(projectDirectory, JSON.stringify(olderPackage))
  const newerSave = saveProjectContent(projectDirectory, JSON.stringify(newerPackage))
  releaseBlocker.resolve()
  await blocker
  await Promise.all([olderSave, newerSave])

  const finalPackage = JSON.parse(await readProjectContent(projectDirectory))
  assert.equal(finalPackage.project.label, "Newer snapshot")
})

test("project reads wait for the active directory mutation", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-project-read-lock-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const projectDirectory = path.join(tempDirectory, "read-locked-project.rxncanvas")
  await saveProjectContent(projectDirectory, projectContent(null))
  const releaseMutation = deferred()
  const updatedPackage = JSON.parse(projectContent(null))
  updatedPackage.project.label = "Updated while locked"
  const mutation = withProjectSaveLock(projectDirectory, async () => {
    await releaseMutation.promise
    await writeProjectFileAtomically(
      path.join(projectDirectory, ".rxncanvas", "project.json"),
      `${JSON.stringify(updatedPackage)}\n`,
    )
  })
  await Promise.resolve()

  let readCompleted = false
  const read = readProjectContent(projectDirectory).then((content) => {
    readCompleted = true
    return content
  })
  await Promise.resolve()
  assert.equal(readCompleted, false)

  releaseMutation.resolve()
  await mutation
  const restored = JSON.parse(await read)
  assert.equal(restored.project.label, "Updated while locked")
})

test("atomic project file writes replace complete files and clean failed temporaries", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-project-atomic-write-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const targetPath = path.join(tempDirectory, "project.json")
  fs.writeFileSync(targetPath, "old", "utf8")

  await writeProjectFileAtomically(targetPath, "new")
  assert.equal(fs.readFileSync(targetPath, "utf8"), "new")
  assert.deepEqual(fs.readdirSync(tempDirectory).filter((name) => name.includes(".rxncanvas-write-")), [])

  const directoryTarget = path.join(tempDirectory, "directory-target")
  fs.mkdirSync(directoryTarget)
  await assert.rejects(() => writeProjectFileAtomically(directoryTarget, "cannot replace a directory"))
  assert.equal(fs.statSync(directoryTarget).isDirectory(), true)
  assert.deepEqual(fs.readdirSync(tempDirectory).filter((name) => name.includes(".rxncanvas-write-")), [])
})

test("report artifacts and their manifest commit inside the project mutation lock", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-project-artifact-lock-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const projectDirectory = path.join(tempDirectory, "artifact-project.rxncanvas")
  await saveProjectContent(projectDirectory, projectContent(null))
  const releaseMutation = deferred()
  const mutation = withProjectSaveLock(projectDirectory, async () => {
    await releaseMutation.promise
  })
  await Promise.resolve()

  let artifactCompleted = false
  const artifact = saveProjectReportArtifact(projectDirectory, {
    defaultName: "report.txt",
    content: "artifact content",
    mimeType: "text/plain",
  }).then((result) => {
    artifactCompleted = true
    return result
  })
  await Promise.resolve()
  assert.equal(artifactCompleted, false)

  releaseMutation.resolve()
  await mutation
  const result = await artifact
  assert.equal(fs.readFileSync(result.filePath, "utf8"), "artifact content")
  const manifest = JSON.parse(fs.readFileSync(path.join(projectDirectory, "exports", "manifest.json"), "utf8"))
  assert.equal(manifest.artifacts[0].path, result.projectArtifactPath)
  assert.equal(manifest.artifacts[0].checksum, sha256("artifact content"))
})

test("archive export waits for project mutations and atomically replaces its target", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-project-archive-lock-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const projectDirectory = path.join(tempDirectory, "archive-project.rxncanvas")
  const archivePath = path.join(tempDirectory, "archive-project.rxncanvas.zip")
  await saveProjectContent(projectDirectory, projectContent(null))
  const releaseMutation = deferred()
  const mutation = withProjectSaveLock(projectDirectory, async () => {
    await releaseMutation.promise
  })
  await Promise.resolve()

  let archiveCompleted = false
  const archive = exportProjectWorkspaceArchive(projectDirectory, archivePath).then((result) => {
    archiveCompleted = true
    return result
  })
  await Promise.resolve()
  assert.equal(archiveCompleted, false)
  assert.equal(fs.existsSync(archivePath), false)

  releaseMutation.resolve()
  await mutation
  const result = await archive
  assert.equal(result.filePath, archivePath)
  assert.ok(fs.statSync(archivePath).size > 0)
  assert.deepEqual(fs.readdirSync(tempDirectory).filter((name) => name.includes(".rxncanvas-write-")), [])

  const directoryTarget = path.join(tempDirectory, "archive-directory-target")
  fs.mkdirSync(directoryTarget)
  await assert.rejects(() => writeProjectWorkspaceArchiveAtomically(projectDirectory, directoryTarget))
  assert.equal(fs.statSync(directoryTarget).isDirectory(), true)
  assert.deepEqual(fs.readdirSync(tempDirectory).filter((name) => name.includes(".rxncanvas-write-")), [])

})

test("archive destination requests commit in order across different projects", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-archive-destination-order-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const projectA = path.join(tempDirectory, "project-a.rxncanvas")
  const projectB = path.join(tempDirectory, "project-b.rxncanvas")
  const packageA = JSON.parse(projectContent(null))
  packageA.project = { id: "project-a", label: "Project A", meta: "open" }
  const packageB = JSON.parse(projectContent(null))
  packageB.project = { id: "project-b", label: "Project B", meta: "open" }
  await Promise.all([
    saveProjectContent(projectA, JSON.stringify(packageA)),
    saveProjectContent(projectB, JSON.stringify(packageB)),
  ])
  const archiveBasePath = path.join(tempDirectory, "shared-export")
  const archivePath = `${archiveBasePath}.rxncanvas.zip`
  const releaseDestination = deferred()
  const blocker = withArchiveDestinationLock(archivePath, async () => {
    await releaseDestination.promise
  })
  await Promise.resolve()

  const first = exportProjectWorkspaceArchive(projectA, archiveBasePath)
  const second = exportProjectWorkspaceArchive(projectB, archiveBasePath)
  await Promise.resolve()
  assert.equal(fs.existsSync(archivePath), false)

  releaseDestination.resolve()
  await blocker
  const [firstResult, secondResult] = await Promise.all([first, second])
  assert.equal(firstResult.filePath, archivePath)
  assert.equal(secondResult.filePath, archivePath)

  const extractedDirectory = path.join(tempDirectory, "extracted.rxncanvas")
  await importProjectWorkspaceArchive(archivePath, extractedDirectory)
  const finalPackage = JSON.parse(await readProjectContent(extractedDirectory))
  assert.equal(finalPackage.project.id, "project-b")
  assert.deepEqual(fs.readdirSync(tempDirectory).filter((name) => name.includes(".rxncanvas-write-")), [])
})

test("archive destination failures release only their target lock", async () => {
  const failedTarget = "/tmp/failed-archive-target.zip"
  const otherTarget = "/tmp/other-archive-target.zip"
  const events = []
  const first = withArchiveDestinationLock(failedTarget, async () => {
    events.push("failed-start")
    throw new Error("archive failed")
  })
  const second = withArchiveDestinationLock(failedTarget, async () => {
    events.push("retry-start")
    return "retry-complete"
  })
  const other = withArchiveDestinationLock(otherTarget, async () => {
    events.push("other-start")
    return "other-complete"
  })

  await assert.rejects(first, /archive failed/)
  assert.equal(await second, "retry-complete")
  assert.equal(await other, "other-complete")
  assert.ok(events.indexOf("retry-start") > events.indexOf("failed-start"))
  assert.ok(events.includes("other-start"))
})

test("planned source paths preserve the original filename casing", () => {
  assert.equal(defaultImportStoredPathForFile({ name: "Bfix8-ts.log" }, 0), "sources/Bfix8-ts.log")
  assert.equal(defaultImportStoredPathForFile({ name: "Bfix6-ts1.LOG" }, 0), "sources/Bfix6-ts1.LOG")
  assert.notEqual(
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

test("keeps normal hyphenated and underscored solution log filenames without adding a hash", () => {
  assert.equal(
    defaultImportStoredPathForFile({ name: "7a-1fix-ts-sol.log" }, 0),
    "sources/7a-1fix-ts-sol.log",
  )
  assert.equal(
    defaultImportStoredPathForFile({ name: "7a-1fix-ts_sol.log" }, 0),
    "sources/7a-1fix-ts_sol.log",
  )
})

test("materializes an underscored solution log without adding a hash", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-underscore-sol-name-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const projectDirectory = path.join(tempDirectory, "underscore-sol.rxncanvas")
  const sourcePath = path.join(tempDirectory, "7a-1fix-ts_sol.log")
  fs.mkdirSync(projectDirectory, { recursive: true })
  fs.writeFileSync(sourcePath, "solution source", "utf8")

  const materialized = await materializeImportSourceFile(projectDirectory, {
    id: "underscore-sol",
    name: "7a-1fix-ts_sol.log",
    sourcePath,
  }, 0)

  assert.equal(materialized.storedPath, "sources/7a-1fix-ts_sol.log")
  assert.equal(fs.readFileSync(path.join(projectDirectory, materialized.storedPath), "utf8"), "solution source")
})

test("materializes a project-internal source in place without creating a suffixed copy", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-project-source-reparse-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const projectDirectory = path.join(tempDirectory, "study.rxncanvas")
  const sourcePath = path.join(projectDirectory, "sources", "scan.log")
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true })
  fs.writeFileSync(sourcePath, "project source", "utf8")

  const materialized = await materializeImportSourceFile(projectDirectory, {
    id: "scan",
    name: "scan.log",
    sourcePath,
  }, 0)

  assert.equal(projectStoredPathForSourcePath(projectDirectory, sourcePath), "sources/scan.log")
  assert.equal(materialized.storedPath, "sources/scan.log")
  assert.equal(fs.readFileSync(sourcePath, "utf8"), "project source")
  assert.equal(fs.existsSync(path.join(projectDirectory, "sources", "scan-2.log")), false)
})

test("concurrent project-internal reparses survive interleaved project saves", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-project-source-batch-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const projectDirectory = path.join(tempDirectory, "study.rxncanvas")
  const names = ["a.log", "b.log", "c.log", "d.log"]
  fs.mkdirSync(path.join(projectDirectory, "sources"), { recursive: true })
  names.forEach((name) => fs.writeFileSync(path.join(projectDirectory, "sources", name), `source ${name}`, "utf8"))
  const stagedFiles = names.map((name, index) => ({
    id: `file-${index}`,
    name,
    kind: "Gaussian",
    size: Buffer.byteLength(`source ${name}`),
    status: "staged",
    preview: "",
    storedPath: `sources/${name}`,
    parse: { parsed: false },
  }))

  await saveProjectContent(projectDirectory, projectContentForFiles(stagedFiles))
  const materialized = await Promise.all(names.map((name, index) => materializeImportSourceFile(projectDirectory, {
    id: `file-${index}`,
    name,
    sourcePath: path.join(projectDirectory, "sources", name),
  }, index)))
  await Promise.all(materialized.map((file, index) => saveProjectContent(
    projectDirectory,
    projectContentForFiles(stagedFiles.map((staged, stagedIndex) => stagedIndex <= index ? {
      ...staged,
      ...materialized[stagedIndex],
      status: "parsed",
      parse: { parsed: true },
    } : staged)),
  )))

  assert.deepEqual(materialized.map((file) => file.storedPath), names.map((name) => `sources/${name}`))
  names.forEach((name) => {
    assert.equal(fs.readFileSync(path.join(projectDirectory, "sources", name), "utf8"), `source ${name}`)
    assert.equal(fs.existsSync(path.join(projectDirectory, "sources", name.replace(/\.log$/, "-2.log"))), false)
  })
})

test("same-name imports replace the project source in request order", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-import-collision-"))
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
      const projectDirectory = path.join(tempDirectory, `${scenario.replaceAll(" ", "-")}.rxncanvas`)
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
    const projectDirectory = path.join(tempDirectory, "staggered-independent-imports.rxncanvas")
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
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-import-reservation-release-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const projectDirectory = path.join(tempDirectory, "release-study.rxncanvas")
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
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-import-replacement-failure-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const projectDirectory = path.join(tempDirectory, "replacement-study.rxncanvas")
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
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-import-sanitized-collision-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const projectDirectory = path.join(tempDirectory, "sanitized-collision.rxncanvas")
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

test("project save never materializes preview text as source content", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-preview-source-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const projectDirectory = path.join(tempDirectory, "preview-study.rxncanvas")
  const preview = [
    "head of calculation",
    "[... RxnCanvas preview skipped 900000 bytes ...]",
    "tail of calculation",
  ].join("\n")
  const saved = await saveProjectContent(projectDirectory, projectContent({
    id: "large-preview",
    name: "large.log",
    kind: "Gaussian",
    size: 900_100,
    status: "parsed",
    preview,
    parse: { parsed: true },
  }))
  const savedFile = JSON.parse(saved.content).files[0]

  assert.equal(savedFile.storedPath, "sources/large.log")
  assert.equal(savedFile.checksum, undefined)
  assert.equal(savedFile.size, 900_100)
  assert.equal(savedFile.preview, preview)
  assert.equal(fs.existsSync(path.join(projectDirectory, savedFile.storedPath)), false)
})

test("pending preview-only imports stay pending without a fake stored path", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-pending-preview-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const projectDirectory = path.join(tempDirectory, "pending-preview-study.rxncanvas")
  const saved = await saveProjectContent(projectDirectory, projectContent({
    id: "pending-preview",
    name: "pending.log",
    kind: "Gaussian",
    size: 800_000,
    status: "staged",
    preview: "sampled preview",
    storedPath: "sources/pending.log",
    parse: {
      parsed: false,
      warnings: [{ code: "parse_deferred", message: "waiting" }],
    },
  }))
  const savedFile = JSON.parse(saved.content).files[0]

  assert.equal(savedFile.storedPath, undefined)
  assert.equal(savedFile.checksum, undefined)
  assert.equal(fs.existsSync(path.join(projectDirectory, "sources", "pending.log")), false)
})

test("failed parsed imports do not create a source file", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-failed-parse-source-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const projectDirectory = path.join(tempDirectory, "failed-parse-study.rxncanvas")
  const saved = await saveProjectContent(projectDirectory, projectContent({
    id: "failed-parse",
    name: "Bfix8-ts.log",
    kind: "Gaussian",
    size: 800_000,
    status: "parsed",
    preview: "failed calculation",
    storedPath: "sources/Bfix8-ts.log",
    parse: {
      parsed: true,
      terminationStatus: "error",
      warnings: [{ code: "parse_failed", message: "Calculation output ended with error termination." }],
    },
  }))
  const savedFile = JSON.parse(saved.content).files[0]

  assert.equal(savedFile.storedPath, undefined)
  assert.equal(savedFile.checksum, undefined)
  assert.equal(fs.existsSync(path.join(projectDirectory, "sources", "Bfix8-ts.log")), false)
})

test("project save preserves an existing full source instead of replacing it with preview", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-existing-source-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const projectDirectory = path.join(tempDirectory, "existing-source-study.rxncanvas")
  const storedPath = "sources/full.log"
  const storedSourcePath = path.join(projectDirectory, storedPath)
  fs.mkdirSync(path.dirname(storedSourcePath), { recursive: true })
  fs.writeFileSync(storedSourcePath, "complete source bytes", "utf8")
  const saved = await saveProjectContent(projectDirectory, projectContent({
    id: "full-source",
    name: "full.log",
    kind: "Gaussian",
    size: 999_999,
    status: "parsed",
    preview: "truncated preview",
    storedPath,
    parse: { parsed: true },
  }))
  const savedFile = JSON.parse(saved.content).files[0]

  assert.equal(fs.readFileSync(storedSourcePath, "utf8"), "complete source bytes")
  assert.equal(savedFile.size, Buffer.byteLength("complete source bytes"))
  assert.equal(savedFile.checksum, sha256("complete source bytes"))
  assert.equal(savedFile.storedPath, storedPath)
})

test("project save keeps the stored project source ahead of a stale external source path", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-stored-source-authority-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const projectDirectory = path.join(tempDirectory, "stored-source-study.rxncanvas")
  const storedPath = "sources/solution.log"
  const storedSourcePath = path.join(projectDirectory, storedPath)
  const staleExternalPath = path.join(tempDirectory, "solution.log")
  fs.mkdirSync(path.dirname(storedSourcePath), { recursive: true })
  fs.writeFileSync(storedSourcePath, "new singlet source", "utf8")
  fs.writeFileSync(staleExternalPath, "old triplet source", "utf8")

  const saved = await saveProjectContent(projectDirectory, projectContent({
    id: "solution-source",
    name: "solution.log",
    kind: "Gaussian",
    size: 18,
    status: "parsed",
    preview: "",
    sourcePath: staleExternalPath,
    storedPath,
    checksum: sha256("old triplet source"),
    parse: { parsed: true, spinMultiplicity: 3 },
  }), { previousProjectDirectory: projectDirectory })
  const savedFile = JSON.parse(saved.content).files[0]

  assert.equal(fs.readFileSync(storedSourcePath, "utf8"), "new singlet source")
  assert.equal(savedFile.size, Buffer.byteLength("new singlet source"))
  assert.equal(savedFile.checksum, sha256("new singlet source"))
  assert.equal(savedFile.parseChecksum, sha256("old triplet source"))
  assert.equal(savedFile.storedPath, storedPath)
  assert.equal(savedFile.sourcePath, undefined)
})

test("project source hashes use a shared bounded fingerprint cache with safe invalidation", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-project-hash-cache-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))

  const projectDirectory = path.join(tempDirectory, "cache-study.rxncanvas")
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

test("source file disk metadata returns the current size and checksum", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-source-metadata-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const sourcePath = path.join(tempDirectory, "source.log")
  fs.writeFileSync(sourcePath, "singlet source", "utf8")

  assert.deepEqual(await sourceFileDiskMetadata(sourcePath), {
    size: Buffer.byteLength("singlet source"),
    checksum: sha256("singlet source"),
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
  return projectContentForFiles(file ? [file] : [])
}

function projectContentForFiles(files) {
  return JSON.stringify({
    schemaVersion: 2,
    packageKind: "rxncanvas-project",
    project: { id: "cache-study", label: "Cache Study", meta: "open" },
    files,
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
