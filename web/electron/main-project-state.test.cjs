const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const { recordRecentProjectState } = require("./recent-projects.cjs")

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

test("autosave records its project without changing the active project", () => {
  const autosaveBody = handlerSource(
    "rxnflow:autosave-project-package",
    "rxnflow:set-active-project",
  )

  assert.doesNotMatch(autosaveBody, /activateProjectDirectory\(/)
  assert.match(autosaveBody, /const lifecycleGeneration = identity\?\.id \? projectLifecycleGeneration\(identity\.id\) : null/)
  assert.match(autosaveBody, /const lifecycleIsCurrent = Boolean\(identity\?\.id && lifecycleGeneration === projectLifecycleGeneration\(identity\.id\)\)/)
  assert.match(autosaveBody, /projectDirectoriesById\.set\(identity\.id, savedProject\.projectDirectory\)/)
  assert.match(autosaveBody, /rememberRecentProject\(savedProject\.filePath, \{ active: false \}\)/)
})

test("inactive autosave keeps the selected recent project active", () => {
  const projectA = "/projects/A.rxnflow"
  const projectB = "/projects/B.rxnflow"
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
  const forgetBody = handlerSource("rxnflow:forget-project", "rxnflow:get-preferences")
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
    "rxnflow:inspect-project-source-files",
    "rxnflow:save-json-snapshot",
  )

  assert.match(inspectionBody, /projectDirectoriesById\.get\(projectId\)/)
  assert.match(inspectionBody, /isSafeProjectRelativePath\(storedPath\)/)
  assert.match(inspectionBody, /sourceFileDiskMetadata\(path\.join\(projectDirectory, storedPath\)\)/)
  assert.match(inspectionBody, /return \{ id, storedPath, \.\.\.metadata \}/)
})

test("source preview parsing prefers the project copy and returns its checksum", () => {
  const previewBody = handlerSource(
    "rxnflow:parse-source-preview",
    "rxnflow:inspect-project-source-files",
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
    /inspectProjectSourceFiles: \(payload\) => ipcRenderer\.invoke\("rxnflow:inspect-project-source-files", payload\)/,
  )
})
