const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsPromises = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  loadRecentProjectsState,
  saveRecentProjectsState,
} = require("./recent-projects.cjs")

function temporaryWriteFiles(directory) {
  return fs.readdirSync(directory).filter((name) => name.includes(".rxncanvas-write-"))
}

test("recent project state saves through an atomic replacement", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-recent-projects-atomic-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const storePath = path.join(tempDirectory, "recent-projects.json")
  fs.writeFileSync(storePath, '{"projectPaths":["/projects/old.rxncanvas"]}\n', "utf8")

  const expectedState = await saveRecentProjectsState(storePath, {
    activeProjectPath: "/projects/new.rxncanvas",
    projectPaths: ["/projects/new.rxncanvas", "/projects/old.rxncanvas"],
  })

  assert.deepEqual(await loadRecentProjectsState(storePath), expectedState)
  assert.equal(JSON.parse(fs.readFileSync(storePath, "utf8")).version, 1)
  assert.deepEqual(temporaryWriteFiles(tempDirectory), [])
})

test("a failed recent project replacement preserves the previous store", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-recent-projects-failed-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const storePath = path.join(tempDirectory, "recent-projects.json")
  const previousContent = '{"activeProjectPath":"/projects/old.rxncanvas","projectPaths":["/projects/old.rxncanvas"]}\n'
  fs.writeFileSync(storePath, previousContent, "utf8")
  const originalRename = fsPromises.rename
  fsPromises.rename = async () => {
    const error = new Error("simulated rename failure")
    error.code = "EACCES"
    throw error
  }
  t.after(() => {
    fsPromises.rename = originalRename
  })

  await assert.rejects(
    () => saveRecentProjectsState(storePath, {
      activeProjectPath: "/projects/new.rxncanvas",
      projectPaths: ["/projects/new.rxncanvas"],
    }),
    /simulated rename failure/,
  )

  assert.equal(fs.readFileSync(storePath, "utf8"), previousContent)
  assert.deepEqual(temporaryWriteFiles(tempDirectory), [])
})

test("atomic recent project persistence creates a missing store directory", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-recent-projects-create-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const storePath = path.join(tempDirectory, "nested", "recent-projects.json")

  const expectedState = await saveRecentProjectsState(storePath, {
    activeProjectPath: "/projects/created.rxncanvas",
    projectPaths: ["/projects/created.rxncanvas"],
  })

  assert.deepEqual(await loadRecentProjectsState(storePath), expectedState)
  assert.deepEqual(temporaryWriteFiles(path.dirname(storePath)), [])
})
