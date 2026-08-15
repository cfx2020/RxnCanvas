const fs = require("node:fs/promises")
const path = require("node:path")

const {
  defaultImportStoredPathForFile,
  exportProjectWorkspaceArchive,
  resolveProjectStatePath,
  saveProjectContent,
} = require("../electron/project-store.cjs")

async function main() {
  const projectDirectory = path.resolve(process.argv[2] || "")
  const shouldApply = process.argv.includes("--apply")
  if (!process.argv[2]) throw new Error("Usage: node scripts/normalize-project-source-paths.cjs <project-directory> [--apply]")

  const statePath = await resolveProjectStatePath(projectDirectory)
  const originalContent = await fs.readFile(statePath, "utf8")
  const projectPackage = JSON.parse(originalContent)
  if (!Array.isArray(projectPackage.files)) throw new Error("Project state does not contain a files array.")

  const sourceRoot = path.join(projectDirectory, "sources")
  const records = await Promise.all(projectPackage.files.map(async (file, index) => {
    const storedPath = safeStoredPath(file?.storedPath)
    const sourcePath = storedPath ? path.join(projectDirectory, storedPath) : null
    return {
      file,
      index,
      storedPath,
      sourcePath,
      exists: sourcePath ? await isFile(sourcePath) : false,
    }
  }))

  const physicalStoredPaths = await physicalSourceStoredPaths(sourceRoot)
  const existingStoredPaths = new Set(records.filter((record) => record.exists).map((record) => record.storedPath))
  const unreferencedStoredPaths = physicalStoredPaths.filter((storedPath) => !existingStoredPaths.has(storedPath))
  if (unreferencedStoredPaths.length > 0) {
    throw new Error(`Refusing to normalize while unreferenced source files exist: ${unreferencedStoredPaths.join(", ")}`)
  }

  const usedStoredPaths = new Set(records.filter((record) => !record.exists && record.storedPath).map((record) => record.storedPath))
  const plannedRecords = records.map((record) => {
    if (!record.exists) return { ...record, desiredStoredPath: record.storedPath }
    const baseStoredPath = defaultImportStoredPathForFile(record.file, record.index)
    const desiredStoredPath = nextAvailableStoredPath(baseStoredPath, usedStoredPaths)
    usedStoredPaths.add(desiredStoredPath)
    return { ...record, desiredStoredPath }
  })
  const changes = plannedRecords.filter((record) => record.exists && record.storedPath !== record.desiredStoredPath)
  const missing = plannedRecords.filter((record) => !record.exists)
  const summary = {
    projectDirectory,
    fileRecords: records.length,
    physicalFiles: physicalStoredPaths.length,
    renameCount: changes.length,
    unchangedCount: records.length - changes.length - missing.length,
    missingCount: missing.length,
    changes: changes.map((record) => ({
      id: record.file.id,
      name: record.file.name,
      from: record.storedPath,
      to: record.desiredStoredPath,
    })),
    missing: missing.map((record) => ({
      id: record.file.id,
      name: record.file.name,
      storedPath: record.storedPath,
    })),
  }

  if (!shouldApply || changes.length === 0) {
    process.stdout.write(`${JSON.stringify({ applied: false, ...summary }, null, 2)}\n`)
    return
  }

  const stamp = compactTimestamp(new Date())
  const backupPath = path.join(
    path.dirname(projectDirectory),
    `${path.basename(projectDirectory)}-before-source-normalize-${stamp}.rxnflow.zip`,
  )
  const stateBackupPath = `${statePath}.before-source-normalize-${stamp}.bak`
  await exportProjectWorkspaceArchive(projectDirectory, backupPath)
  await fs.copyFile(statePath, stateBackupPath)

  const staged = []
  try {
    for (const [changeIndex, record] of changes.entries()) {
      const temporaryPath = path.join(sourceRoot, `.rxnflow-normalize-${stamp}-${changeIndex}`)
      await fs.rename(record.sourcePath, temporaryPath)
      staged.push({ ...record, temporaryPath, movedToDesired: false })
    }
    for (const record of staged) {
      const desiredPath = path.join(projectDirectory, record.desiredStoredPath)
      await fs.mkdir(path.dirname(desiredPath), { recursive: true })
      await fs.rename(record.temporaryPath, desiredPath)
      record.movedToDesired = true
    }

    const desiredById = new Map(plannedRecords.map((record) => [record.file.id, record.desiredStoredPath]))
    const updatedPackage = {
      ...projectPackage,
      files: projectPackage.files.map((file) => ({
        ...file,
        storedPath: desiredById.get(file.id) ?? file.storedPath,
      })),
    }
    await saveProjectContent(projectDirectory, JSON.stringify(updatedPackage))
  } catch (error) {
    await rollbackRenames(projectDirectory, staged)
    await saveProjectContent(projectDirectory, originalContent).catch(() => undefined)
    throw error
  }

  process.stdout.write(`${JSON.stringify({
    applied: true,
    backupPath,
    stateBackupPath,
    ...summary,
  }, null, 2)}\n`)
}

function safeStoredPath(storedPath) {
  if (typeof storedPath !== "string" || path.isAbsolute(storedPath)) return null
  const normalized = storedPath.split(/[\\/]+/).join("/")
  const parts = normalized.split("/")
  return parts[0] === "sources" && parts.length > 1 && parts.every((part) => part && part !== "." && part !== "..")
    ? normalized
    : null
}

function nextAvailableStoredPath(baseStoredPath, usedStoredPaths) {
  if (!usedStoredPaths.has(baseStoredPath)) return baseStoredPath
  const extension = path.extname(baseStoredPath)
  const stem = baseStoredPath.slice(0, baseStoredPath.length - extension.length)
  let suffix = 2
  while (usedStoredPaths.has(`${stem}-${suffix}${extension}`)) suffix += 1
  return `${stem}-${suffix}${extension}`
}

async function physicalSourceStoredPaths(sourceRoot) {
  const storedPaths = []
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(entryPath)
      } else if (entry.isFile()) {
        storedPaths.push(path.relative(path.dirname(sourceRoot), entryPath).split(path.sep).join("/"))
      }
    }
  }
  await visit(sourceRoot)
  return storedPaths
}

async function rollbackRenames(projectDirectory, staged) {
  for (const record of [...staged].reverse()) {
    const currentPath = record.movedToDesired
      ? path.join(projectDirectory, record.desiredStoredPath)
      : record.temporaryPath
    if (!await isFile(currentPath)) continue
    await fs.mkdir(path.dirname(record.sourcePath), { recursive: true })
    await fs.rename(currentPath, record.sourcePath)
  }
}

async function isFile(filePath) {
  try {
    return (await fs.stat(filePath)).isFile()
  } catch {
    return false
  }
}

function compactTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
