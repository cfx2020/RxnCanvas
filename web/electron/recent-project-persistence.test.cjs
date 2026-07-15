const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const mainPath = path.join(__dirname, "main.cjs")
const mainSource = fs.readFileSync(mainPath, "utf8")

function deferred() {
  let resolve
  const promise = new Promise((next) => {
    resolve = next
  })
  return { promise, resolve }
}

test("recent project persistence is serialized and protects newer in-memory state", () => {
  const persistBody = mainSource.match(/function persistRecentProjects\(\) \{([\s\S]*?)\n\}/)?.[1]
  assert.ok(persistBody, "persistRecentProjects body missing")
  assert.match(persistBody, /recentProjectsPersistence = recentProjectsPersistence/)
  assert.match(persistBody, /requestedState = \{/)
  assert.match(persistBody, /recentProjectStatesEqual\(currentState, requestedState\)/)
  assert.match(mainSource, /function recentProjectStatesEqual\(left, right\)/)
})

test("recent project state comparison detects active and ordering changes", () => {
  const match = mainSource.match(/function recentProjectStatesEqual\(left, right\) \{([\s\S]*?)\n\}/)
  assert.ok(match, "recentProjectStatesEqual body missing")
  const statesEqual = new Function(
    `return function recentProjectStatesEqual(left, right) {${match[1]}\n}`,
  )()
  const base = { activeProjectPath: "/projects/B", projectPaths: ["/projects/B", "/projects/A"] }

  assert.equal(statesEqual(base, { ...base, projectPaths: [...base.projectPaths] }), true)
  assert.equal(statesEqual(base, { ...base, activeProjectPath: "/projects/A" }), false)
  assert.equal(statesEqual(base, { ...base, projectPaths: ["/projects/A", "/projects/B"] }), false)
})

test("an older recent-project write cannot replace newer active state", async () => {
  const persistMatch = mainSource.match(/function persistRecentProjects\(\) \{([\s\S]*?)\n\}/)
  const equalMatch = mainSource.match(/function recentProjectStatesEqual\(left, right\) \{([\s\S]*?)\n\}/)
  assert.ok(persistMatch, "persistRecentProjects body missing")
  assert.ok(equalMatch, "recentProjectStatesEqual body missing")

  const writes = []
  const runtime = new Function("saveRecentProjectsState", `
    let recentProjectPaths = []
    let activeProjectPath = null
    let recentProjectsStorePath = "/tmp/recent-projects.json"
    let recentProjectsPersistence = Promise.resolve()
    function recentProjectStatesEqual(left, right) {${equalMatch[1]}\n}
    function persistRecentProjects() {${persistMatch[1]}\n}
    return {
      persistRecentProjects,
      setState(state) {
        recentProjectPaths = [...state.projectPaths]
        activeProjectPath = state.activeProjectPath
      },
      getState() {
        return { projectPaths: [...recentProjectPaths], activeProjectPath }
      },
    }
  `)(async (_storePath, state) => {
    const write = deferred()
    writes.push({ state, write })
    await write.promise
    return state
  })

  const stateA = { projectPaths: ["/projects/A"], activeProjectPath: "/projects/A" }
  const stateB = { projectPaths: ["/projects/B", "/projects/A"], activeProjectPath: "/projects/B" }
  runtime.setState(stateA)
  const firstPersistence = runtime.persistRecentProjects()
  await Promise.resolve()
  runtime.setState(stateB)
  const secondPersistence = runtime.persistRecentProjects()
  await Promise.resolve()

  assert.equal(writes.length, 1)
  assert.deepEqual(writes[0].state, stateA)
  writes[0].write.resolve()
  await firstPersistence
  await Promise.resolve()
  assert.deepEqual(runtime.getState(), stateB)
  assert.equal(writes.length, 2)
  assert.deepEqual(writes[1].state, stateB)

  writes[1].write.resolve()
  await secondPersistence
  assert.deepEqual(runtime.getState(), stateB)
})
