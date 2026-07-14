const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const mainPath = path.join(__dirname, "main.cjs")
const mainSource = fs.readFileSync(mainPath, "utf8")

test("startup restore registers every project directory in final payload order", () => {
  const match = mainSource.match(/function registerRestoredProjectDirectories\(payloads\) \{([\s\S]*?)\n\}/)
  assert.ok(match, "registerRestoredProjectDirectories must remain directly testable")

  const projectDirectoriesById = new Map()
  const projectIdentityFromContent = (content) => JSON.parse(content).project
  const register = new Function(
    "projectDirectoriesById",
    "projectIdentityFromContent",
    `return function registerRestoredProjectDirectories(payloads) {${match[1]}\n}`,
  )(projectDirectoriesById, projectIdentityFromContent)

  register([
    { projectDirectory: "/projects/older", content: JSON.stringify({ project: { id: "shared" } }) },
    { projectDirectory: "/projects/other", content: JSON.stringify({ project: { id: "other" } }) },
    { projectDirectory: "/projects/active", content: JSON.stringify({ project: { id: "shared" } }) },
  ])

  assert.deepEqual([...projectDirectoriesById], [
    ["shared", "/projects/active"],
    ["other", "/projects/other"],
  ])
})

test("startup restore batches invalid recent cleanup and leaves current project untouched", () => {
  const restoreBody = mainSource.match(/async function restoreRecentProjectPayloads\(\) \{([\s\S]*?)\n\}\n\nfunction startupRestoreProjectPaths/)?.[1]
  assert.ok(restoreBody, "restoreRecentProjectPayloads body missing")
  assert.doesNotMatch(restoreBody, /forgetRecentProject\(/)
  assert.match(restoreBody, /removeRecentProjectState\(state, filePath\)/)
  assert.equal((restoreBody.match(/await persistRecentProjects\(\)/g) || []).length, 1)
  assert.equal((restoreBody.match(/installApplicationMenu\(\)/g) || []).length, 1)
  assert.doesNotMatch(restoreBody, /activateProjectDirectory\(/)
  assert.match(restoreBody, /registerRestoredProjectDirectories\(orderedPayloads\)/)
})

test("application readiness loads preferences and recent projects concurrently", () => {
  const readyBody = mainSource.match(/app\.whenReady\(\)\.then\(async \(\) => \{([\s\S]*?)\n\}\)/)?.[1]
  assert.ok(readyBody, "app.whenReady callback missing")
  assert.match(readyBody, /const \[preferences, recentProjectState\] = await Promise\.all\(\[/)
  assert.match(readyBody, /loadPreferences\(userDataDirectory\(\)\)/)
  assert.match(readyBody, /loadRecentProjectsState\(recentProjectsStorePath\)/)
})
