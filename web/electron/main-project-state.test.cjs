const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const { recordRecentProjectState } = require("./recent-projects.cjs")

const mainPath = path.join(__dirname, "main.cjs")
const mainSource = fs.readFileSync(mainPath, "utf8")

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
