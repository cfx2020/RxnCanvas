const fs = require("node:fs/promises")
const path = require("node:path")

const recentProjectsVersion = 1
const defaultRecentProjectLimit = 8

async function loadRecentProjects(storePath) {
  const state = await loadRecentProjectsState(storePath)
  return state.projectPaths
}

async function loadRecentProjectsState(storePath) {
  try {
    const raw = await fs.readFile(storePath, "utf8")
    const value = JSON.parse(raw)
    const projectPaths = Array.isArray(value?.projectPaths) ? value.projectPaths : Array.isArray(value) ? value : []
    return normalizeRecentProjectState({
      projectPaths,
      activeProjectPath: typeof value?.activeProjectPath === "string" ? value.activeProjectPath : null,
    })
  } catch (error) {
    if (error && error.code === "ENOENT") return emptyRecentProjectState()
    return emptyRecentProjectState()
  }
}

async function saveRecentProjects(storePath, projectPaths) {
  const state = await saveRecentProjectsState(storePath, { projectPaths })
  return state.projectPaths
}

async function saveRecentProjectsState(storePath, state) {
  const safeState = normalizeRecentProjectState(state)
  await fs.mkdir(path.dirname(storePath), { recursive: true })
  await fs.writeFile(storePath, `${JSON.stringify({
    version: recentProjectsVersion,
    activeProjectPath: safeState.activeProjectPath,
    projectPaths: safeState.projectPaths,
  }, null, 2)}\n`, "utf8")
  return safeState
}

function recordRecentProject(projectPaths, filePath, limit = defaultRecentProjectLimit) {
  const normalized = normalizeProjectPath(filePath)
  if (!normalized) return uniqueProjectPaths(projectPaths).slice(0, limit)
  return uniqueProjectPaths([normalized, ...projectPaths]).slice(0, limit)
}

function removeRecentProject(projectPaths, filePath) {
  const normalized = normalizeProjectPath(filePath)
  if (!normalized) return uniqueProjectPaths(projectPaths)
  const normalizedKey = comparisonKey(normalized)
  return uniqueProjectPaths(projectPaths).filter((projectPath) => comparisonKey(projectPath) !== normalizedKey)
}

function recordRecentProjectState(state, filePath, options = {}) {
  const normalized = normalizeProjectPath(filePath)
  const projectPaths = recordRecentProject(state?.projectPaths ?? [], filePath, options.limit)
  const activeProjectPath = options.active === false
    ? activeProjectPathForPaths(state?.activeProjectPath, projectPaths)
    : activeProjectPathForPaths(normalized, projectPaths)
  return normalizeRecentProjectState({ projectPaths, activeProjectPath })
}

function removeRecentProjectState(state, filePath) {
  const projectPaths = removeRecentProject(state?.projectPaths ?? [], filePath)
  return normalizeRecentProjectState({
    projectPaths,
    activeProjectPath: activeProjectPathForPaths(state?.activeProjectPath, projectPaths),
  })
}

function recentProjectLabel(filePath) {
  const basename = path.basename(filePath)
  return basename
    .replace(/\.rxnflow$/i, "")
    .replace(/\.rxnflow\.json$/i, "")
    .replace(/\.json$/i, "")
    .replace(/[-_]+/g, " ")
    .trim() || basename
}

function uniqueProjectPaths(projectPaths) {
  const seen = new Set()
  const result = []
  for (const projectPath of projectPaths) {
    const normalized = normalizeProjectPath(projectPath)
    if (!normalized) continue
    const key = comparisonKey(normalized)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

function normalizeRecentProjectState(state = {}) {
  const normalizedActive = normalizeProjectPath(state.activeProjectPath)
  const projectPaths = uniqueProjectPaths([
    ...(normalizedActive ? [normalizedActive] : []),
    ...(Array.isArray(state.projectPaths) ? state.projectPaths : []),
  ]).slice(0, defaultRecentProjectLimit)
  return {
    projectPaths,
    activeProjectPath: activeProjectPathForPaths(normalizedActive, projectPaths),
  }
}

function activeProjectPathForPaths(activeProjectPath, projectPaths) {
  const normalizedActive = normalizeProjectPath(activeProjectPath)
  if (normalizedActive) {
    const activeKey = comparisonKey(normalizedActive)
    const match = uniqueProjectPaths(projectPaths).find((projectPath) => comparisonKey(projectPath) === activeKey)
    if (match) return match
  }
  return uniqueProjectPaths(projectPaths)[0] ?? null
}

function emptyRecentProjectState() {
  return {
    activeProjectPath: null,
    projectPaths: [],
  }
}

function normalizeProjectPath(filePath) {
  if (typeof filePath !== "string") return null
  const trimmed = filePath.trim()
  if (!trimmed) return null
  return path.resolve(trimmed)
}

function comparisonKey(filePath) {
  return process.platform === "win32" ? filePath.toLowerCase() : filePath
}

module.exports = {
  defaultRecentProjectLimit,
  loadRecentProjects,
  loadRecentProjectsState,
  saveRecentProjects,
  saveRecentProjectsState,
  recordRecentProject,
  recordRecentProjectState,
  removeRecentProject,
  removeRecentProjectState,
  recentProjectLabel,
}
