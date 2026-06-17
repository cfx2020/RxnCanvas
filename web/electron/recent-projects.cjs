const fs = require("node:fs/promises")
const path = require("node:path")

const recentProjectsVersion = 1
const defaultRecentProjectLimit = 8

async function loadRecentProjects(storePath) {
  try {
    const raw = await fs.readFile(storePath, "utf8")
    const value = JSON.parse(raw)
    const projectPaths = Array.isArray(value?.projectPaths) ? value.projectPaths : Array.isArray(value) ? value : []
    return uniqueProjectPaths(projectPaths).slice(0, defaultRecentProjectLimit)
  } catch (error) {
    if (error && error.code === "ENOENT") return []
    return []
  }
}

async function saveRecentProjects(storePath, projectPaths) {
  const safePaths = uniqueProjectPaths(projectPaths).slice(0, defaultRecentProjectLimit)
  await fs.mkdir(path.dirname(storePath), { recursive: true })
  await fs.writeFile(storePath, `${JSON.stringify({
    version: recentProjectsVersion,
    projectPaths: safePaths,
  }, null, 2)}\n`, "utf8")
  return safePaths
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
  saveRecentProjects,
  recordRecentProject,
  removeRecentProject,
  recentProjectLabel,
}
