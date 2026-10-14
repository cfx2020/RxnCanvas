const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { recordRecentProjectState } = require("./recent-projects.cjs")
const { exportProjectWorkspaceArchive, importProjectWorkspaceArchive, materializeImportSourceFile, readProjectContent, saveProjectContent } = require("./project-store.cjs")

const mainPath = path.join(__dirname, "main.cjs")
const mainSource = fs.readFileSync(mainPath, "utf8")
const preloadPath = path.join(__dirname, "preload.cjs")
const preloadSource = fs.readFileSync(preloadPath, "utf8")

function handlerSource(channel, nextChannel) {
  const start = mainSource.indexOf(`ipcMain.handle("${channel}"`)
  const end = mainSource.indexOf(`ipcMain.handle("${nextChannel}"`, start)
  assert.notEqual(start, -1, `${channel} handler missing`)
  assert.notEqual(end, -1, `${nextChannel} handler missing`)
  return mainSource.slice(start, end)
}

test("confirming archive export preserves imports completed while its dialog was open", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-export-during-import-"))
  t.after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }))
  const projectDirectory = path.join(tempDirectory, "study")
  const sourcePath = path.join(tempDirectory, "gas.log")
  fs.writeFileSync(sourcePath, "complete calculation", "utf8")
  const pendingFile = {
    id: "gas",
    name: "gas.log",
    kind: "Gaussian",
    status: "staged",
    size: fs.statSync(sourcePath).size,
    preview: "",
    parse: { parsed: false, warnings: [{ code: "parse_deferred" }] },
  }
  const pendingPackage = {
    schemaVersion: 2,
    packageKind: "rxncanvas-project",
    project: { id: "study", label: "Study" },
    files: [pendingFile],
    canvases: [],
    activeCanvasId: "canvas-1",
  }
  const pendingContent = JSON.stringify(pendingPackage)
  await saveProjectContent(projectDirectory, pendingContent)
  let confirmDialog
  let dialogOpened
  const opened = new Promise((resolve) => { dialogOpened = resolve })
  const confirmation = new Promise((resolve) => { confirmDialog = resolve })
  let exportHandler
  const dependencies = {
    ipcMain: { handle: (_channel, handler) => { exportHandler = handler } },
    dialog: { showSaveDialog: () => { dialogOpened(); return confirmation } },
    archiveDefaultPath: (name) => name,
    projectIdentityFromContent: (content) => JSON.parse(content).project,
    projectDirectoryForIdentity: () => projectDirectory,
    saveProjectContent,
    exportProjectWorkspaceArchive,
    readProjectContent,
    activateProjectDirectory: () => {},
    rememberRecentProject: async () => {},
    validateProjectPackageContent: async () => ({ valid: true, issues: [] }),
  }
  new Function(...Object.keys(dependencies), handlerSource(
    "rxncanvas:save-project-package",
    "rxncanvas:autosave-project-package",
  ))(...Object.values(dependencies))

  const exporting = exportHandler({}, { content: pendingContent, defaultName: "study.rxncanvas.zip" })
  await opened
  const { sourcePath: _sourcePath, ...materialized } = await materializeImportSourceFile(projectDirectory, { ...pendingFile, sourcePath }, 0)
  const completedContent = JSON.stringify({
    ...pendingPackage,
    files: [{ ...materialized, status: "parsed", parse: { parsed: true, warnings: [] }, parseChecksum: materialized.checksum }],
  })
  await saveProjectContent(projectDirectory, completedContent)
  const archivePath = path.join(tempDirectory, "study.rxncanvas.zip")
  confirmDialog({ canceled: false, filePath: archivePath })
  await exporting

  const saved = JSON.parse(await readProjectContent(projectDirectory))
  assert.equal(saved.files[0].parse.parsed, true, "export overwrote the completed import with its pre-dialog snapshot")
  assert.equal(fs.readFileSync(path.join(projectDirectory, materialized.storedPath), "utf8"), "complete calculation")
  const restored = await importProjectWorkspaceArchive(archivePath, path.join(tempDirectory, "restored"))
  const archived = JSON.parse(await readProjectContent(restored.projectDirectory))
  assert.equal(archived.files[0].parse.parsed, true)
  assert.equal(fs.readFileSync(path.join(restored.projectDirectory, materialized.storedPath), "utf8"), "complete calculation")
})

test("autosave records its project without changing the active project", () => {
  const autosaveBody = handlerSource(
    "rxncanvas:autosave-project-package",
    "rxncanvas:set-active-project",
  )

  assert.doesNotMatch(autosaveBody, /activateProjectDirectory\(/)
  assert.match(autosaveBody, /const lifecycleGeneration = identity\?\.id \? projectLifecycleGeneration\(identity\.id\) : null/)
  assert.match(autosaveBody, /const lifecycleIsCurrent = Boolean\(identity\?\.id && lifecycleGeneration === projectLifecycleGeneration\(identity\.id\)\)/)
  assert.match(autosaveBody, /projectDirectoriesById\.set\(identity\.id, savedProject\.projectDirectory\)/)
  assert.match(autosaveBody, /rememberRecentProject\(savedProject\.filePath, \{ active: false \}\)/)
})

test("inactive autosave keeps the selected recent project active", () => {
  const projectA = "/projects/A.rxncanvas"
  const projectB = "/projects/B.rxncanvas"
  const state = recordRecentProjectState({
    projectPaths: [projectB],
    activeProjectPath: projectB,
  }, projectA, { active: false })

  assert.equal(state.activeProjectPath, path.resolve(projectB))
  assert.deepEqual(state.projectPaths, [path.resolve(projectB), path.resolve(projectA)])
})

test("main recent-project wrapper forwards active-state options", () => {
  const rememberBody = mainSource.match(/async function rememberRecentProject\(filePath, options = \{\}\) \{([\s\S]*?)\n\}/)?.[1]
  assert.ok(rememberBody, "rememberRecentProject body missing")
  assert.match(rememberBody, /recordRecentProjectState\([^\n]+, filePath, options\)/)
})

test("forget invalidates autosaves before checking the project directory", () => {
  const forgetBody = handlerSource("rxncanvas:forget-project", "rxncanvas:get-preferences")
  const invalidateIndex = forgetBody.indexOf("invalidateProjectLifecycle(projectId)")
  const directoryIndex = forgetBody.indexOf("projectDirectoriesById.get(projectId)")
  const persistIndex = forgetBody.indexOf("await forgetRecentProject(projectDirectory)")
  const deleteIndex = forgetBody.indexOf("projectDirectoriesById.delete(projectId)")

  assert.notEqual(invalidateIndex, -1)
  assert.notEqual(directoryIndex, -1)
  assert.notEqual(persistIndex, -1)
  assert.notEqual(deleteIndex, -1)
  assert.ok(invalidateIndex < directoryIndex)
  assert.ok(directoryIndex < persistIndex)
  assert.ok(persistIndex < deleteIndex)
  assert.match(forgetBody, /projectPayloadForProjectId\(projectId, payload\)/)
})

test("project lifecycle generations invalidate only the deleted project", () => {
  const generationMatch = mainSource.match(/function projectLifecycleGeneration\(projectId\) \{([\s\S]*?)\n\}/)
  const invalidateMatch = mainSource.match(/function invalidateProjectLifecycle\(projectId\) \{([\s\S]*?)\n\}/)
  assert.ok(generationMatch, "projectLifecycleGeneration body missing")
  assert.ok(invalidateMatch, "invalidateProjectLifecycle body missing")

  const lifecycle = new Function(`
    const projectLifecycleGenerationById = new Map()
    function projectLifecycleGeneration(projectId) {${generationMatch[1]}\n}
    function invalidateProjectLifecycle(projectId) {${invalidateMatch[1]}\n}
    return { projectLifecycleGeneration, invalidateProjectLifecycle }
  `)()

  assert.equal(lifecycle.projectLifecycleGeneration("project-a"), 0)
  assert.equal(lifecycle.projectLifecycleGeneration("project-b"), 0)
  assert.equal(lifecycle.invalidateProjectLifecycle("project-a"), 1)
  assert.equal(lifecycle.projectLifecycleGeneration("project-a"), 1)
  assert.equal(lifecycle.projectLifecycleGeneration("project-b"), 0)
})

test("project source inspection returns project-owned file metadata", () => {
  const inspectionBody = handlerSource(
    "rxncanvas:inspect-project-source-files",
    "rxncanvas:save-json-snapshot",
  )

  assert.match(inspectionBody, /projectDirectoriesById\.get\(projectId\)/)
  assert.match(inspectionBody, /isSafeProjectRelativePath\(storedPath\)/)
  assert.match(inspectionBody, /sourceFileDiskMetadata\(path\.join\(projectDirectory, storedPath\)\)/)
  assert.match(inspectionBody, /return \{ id, storedPath, \.\.\.metadata \}/)
})

test("source preview parsing prefers the project copy and returns its checksum", () => {
  const previewBody = handlerSource(
    "rxncanvas:parse-source-preview",
    "rxncanvas:inspect-project-source-files",
  )
  const storedPathIndex = previewBody.indexOf("candidates.push(path.join(projectDirectory, storedPath))")
  const sourcePathIndex = previewBody.indexOf("candidates.push(sourcePath)")

  assert.notEqual(storedPathIndex, -1)
  assert.notEqual(sourcePathIndex, -1)
  assert.ok(storedPathIndex < sourcePathIndex)
  assert.match(previewBody, /sourceFileDiskMetadata\(sourceFilePath\)/)
  assert.match(previewBody, /parseChecksum: metadata\.checksum/)
})

test("preload exposes project source inspection to the renderer", () => {
  assert.match(
    preloadSource,
    /inspectProjectSourceFiles: \(payload\) => ipcRenderer\.invoke\("rxncanvas:inspect-project-source-files", payload\)/,
  )
})
