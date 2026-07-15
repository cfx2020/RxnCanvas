const crypto = require("node:crypto")
const fsSync = require("node:fs")
const fs = require("node:fs/promises")
const path = require("node:path")
const archiver = require("archiver")
const extractZip = require("extract-zip")

const projectDirectoryExtension = ".rxnflow"
const projectMetadataDirectory = ".rxnflow"
const legacyProjectStateFile = "project.json"
const legacyProjectManifestFile = "manifest.json"
const projectStateFile = path.join(projectMetadataDirectory, "project.json")
const projectManifestFile = path.join(projectMetadataDirectory, "manifest.json")
const sourcesDirectory = "sources"
const exportsDirectory = "exports"
const exportManifestFile = path.join(exportsDirectory, "manifest.json")
const maxProjectStateBytes = 64 * 1024 * 1024
const maxProjectArchiveBytes = 2 * 1024 * 1024 * 1024
const maxArchiveEntryBytes = 1024 * 1024 * 1024
const maxArchiveExpandedBytes = 4 * 1024 * 1024 * 1024
const maxArchiveEntries = 20_000
const maxFileHashCacheEntries = 256
const maxFileHashAttempts = 3
const fileHashCache = new Map()
const sourceMaterializationTails = new Map()
const projectSaveTails = new Map()

async function readProjectContent(projectPath) {
  const stats = await fs.stat(projectPath)
  if (stats.isDirectory()) {
    const statePath = await resolveProjectStatePath(projectPath)
    return readUtf8FileWithLimit(statePath, maxProjectStateBytes, "RxnFlow project state")
  }
  return readUtf8FileWithLimit(projectPath, maxProjectStateBytes, "RxnFlow project package")
}

async function readUtf8FileWithLimit(filePath, maxBytes, label) {
  const stats = await fs.stat(filePath)
  if (!stats.isFile()) throw new Error(`${label} is not a file: ${filePath}`)
  if (stats.size > maxBytes) {
    throw new Error(`${label} is too large (${stats.size} bytes; maximum ${maxBytes} bytes).`)
  }
  return fs.readFile(filePath, "utf8")
}

async function resolveProjectStatePath(projectDirectory) {
  const candidates = [
    path.join(projectDirectory, projectStateFile),
    path.join(projectDirectory, legacyProjectStateFile),
  ]
  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate)
      if (stats.isFile()) return candidate
    } catch {
      // Try the legacy state-file location next.
    }
  }
  return candidates[0]
}

async function saveProjectContent(targetPath, content, options = {}) {
  if (targetPath.toLowerCase().endsWith(".json")) {
    const projectPackage = parseProjectPackageContent(content)
    const savedContent = `${JSON.stringify(slimProjectPackageForPersistence(projectPackage))}\n`
    await fs.writeFile(targetPath, savedContent, "utf8")
    return { filePath: targetPath, projectDirectory: null, content: savedContent }
  }

  return saveProjectDirectory(targetPath, content, options)
}

async function saveProjectDirectory(projectPath, content, options = {}) {
  const projectDirectory = normalizeProjectDirectoryPath(projectPath)
  return withProjectSaveLock(projectDirectory, () => saveProjectDirectoryUnlocked(projectDirectory, content, options))
}

async function saveProjectDirectoryUnlocked(projectDirectory, content, options = {}) {
  const projectPackage = parseProjectPackageContent(content)

  await fs.mkdir(projectDirectory, { recursive: true })
  await fs.mkdir(path.join(projectDirectory, projectMetadataDirectory), { recursive: true })
  await fs.mkdir(path.join(projectDirectory, sourcesDirectory), { recursive: true })
  await fs.mkdir(path.join(projectDirectory, exportsDirectory), { recursive: true })

  const files = Array.isArray(projectPackage.files) ? projectPackage.files : []
  const persistedFiles = []
  const usedStoredPaths = new Set()
  for (const [index, file] of files.entries()) {
    persistedFiles.push(await persistSourceFile(projectDirectory, file, index, {
      previousProjectDirectory: options.previousProjectDirectory,
      usedStoredPaths,
    }))
  }

  const savedPackage = slimProjectPackageForPersistence({
    ...projectPackage,
    files: persistedFiles,
  })
  const savedContent = `${JSON.stringify(savedPackage)}\n`

  await fs.writeFile(path.join(projectDirectory, projectStateFile), savedContent, "utf8")
  await writeProjectManifest(projectDirectory, savedPackage)
  await ensureExportManifest(projectDirectory, savedPackage)
  await pruneUnreferencedSourceFiles(projectDirectory, savedPackage.files)

  return {
    filePath: projectDirectory,
    projectDirectory,
    content: savedContent,
  }
}

async function withProjectSaveLock(projectDirectory, operation) {
  const projectKey = path.resolve(projectDirectory)
  const previous = projectSaveTails.get(projectKey) || Promise.resolve()
  let release
  const turn = new Promise((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => turn)
  projectSaveTails.set(projectKey, tail)

  await previous
  try {
    return await operation()
  } finally {
    release()
    if (projectSaveTails.get(projectKey) === tail) {
      projectSaveTails.delete(projectKey)
    }
  }
}

async function saveProjectReportArtifact(projectDirectory, payload) {
  const fileName = safeFileName(payload?.defaultName || "rxnflow-export")
  const encoding = payload?.encoding === "base64" ? "base64" : "utf8"
  const content = typeof payload?.content === "string" ? payload.content : ""
  const buffer = encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8")
  const artifactPath = path.join(exportsDirectory, fileName)
  const targetPath = path.join(projectDirectory, artifactPath)

  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.writeFile(targetPath, buffer)

  const record = {
    id: `artifact-${safeStem(fileName)}`,
    fileName,
    path: toProjectPath(artifactPath),
    mimeType: typeof payload?.mimeType === "string" && payload.mimeType ? payload.mimeType : "application/octet-stream",
    size: buffer.byteLength,
    checksum: `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`,
    createdAt: new Date().toISOString(),
  }
  await upsertExportArtifactRecord(projectDirectory, record)

  return {
    canceled: false,
    filePath: targetPath,
    projectArtifactPath: record.path,
  }
}

async function exportProjectWorkspaceArchive(projectDirectory, targetArchivePath, options = {}) {
  const workspaceDirectory = normalizeProjectDirectoryPath(projectDirectory)
  if (typeof options.content === "string") {
    await saveProjectDirectory(workspaceDirectory, options.content, {
      previousProjectDirectory: options.previousProjectDirectory,
    })
  }

  const archivePath = normalizeProjectArchivePath(targetArchivePath)
  await fs.mkdir(path.dirname(archivePath), { recursive: true })
  await writeProjectWorkspaceArchive(workspaceDirectory, archivePath)
  return {
    canceled: false,
    filePath: archivePath,
    projectDirectory: workspaceDirectory,
  }
}

async function importProjectWorkspaceArchive(sourceArchivePath, targetProjectDirectory) {
  const archivePath = path.resolve(sourceArchivePath)
  const archiveStats = await fs.stat(archivePath)
  if (!archiveStats.isFile()) throw new Error(`RxnFlow project archive is not a file: ${archivePath}`)
  if (archiveStats.size > maxProjectArchiveBytes) {
    throw new Error(`RxnFlow project archive is too large (${archiveStats.size} bytes; maximum ${maxProjectArchiveBytes} bytes).`)
  }

  const projectDirectory = normalizeProjectDirectoryPath(targetProjectDirectory)
  const temporaryDirectory = `${projectDirectory}.import-${process.pid}-${Date.now()}`
  await fs.rm(temporaryDirectory, { recursive: true, force: true })
  await fs.mkdir(temporaryDirectory, { recursive: true })

  let entryCount = 0
  let expandedBytes = 0
  try {
    await extractZip(archivePath, {
      dir: temporaryDirectory,
      onEntry: (entry) => {
        entryCount += 1
        const entryBytes = Number(entry.uncompressedSize) || 0
        expandedBytes += entryBytes
        if (entryCount > maxArchiveEntries) throw new Error(`RxnFlow project archive has too many entries (maximum ${maxArchiveEntries}).`)
        if (entryBytes > maxArchiveEntryBytes) throw new Error(`RxnFlow project archive entry is too large: ${entry.fileName}`)
        if (expandedBytes > maxArchiveExpandedBytes) throw new Error(`RxnFlow project archive expands beyond ${maxArchiveExpandedBytes} bytes.`)
      },
    })

    const statePath = await resolveProjectStatePath(temporaryDirectory)
    await readUtf8FileWithLimit(statePath, maxProjectStateBytes, "RxnFlow imported project state")
    await fs.mkdir(path.dirname(projectDirectory), { recursive: true })
    await fs.rename(temporaryDirectory, projectDirectory)
    return {
      filePath: archivePath,
      projectDirectory,
    }
  } catch (error) {
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
    throw error
  }
}

function isProjectDirectoryPath(projectPath) {
  return path.extname(projectPath).toLowerCase() === projectDirectoryExtension
}

function normalizeProjectDirectoryPath(projectPath) {
  return path.resolve(projectPath)
}

function normalizeProjectArchivePath(archivePath) {
  const resolved = path.resolve(archivePath)
  return resolved.toLowerCase().endsWith(".zip") ? resolved : `${resolved}.rxnflow.zip`
}

function parseProjectPackageContent(content) {
  let value
  try {
    value = JSON.parse(content)
  } catch (error) {
    throw new Error(`Invalid RxnFlow project JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  if ((value?.schemaVersion !== 1 && value?.schemaVersion !== 2) || value?.packageKind !== "rxnflow-project") {
    throw new Error("Invalid RxnFlow project package envelope")
  }
  if (!value.project || !Array.isArray(value.files) || (!Array.isArray(value.canvases) && (!Array.isArray(value.nodes) || !Array.isArray(value.edges)))) {
    throw new Error("Invalid RxnFlow project package content")
  }
  return value
}

async function persistSourceFile(projectDirectory, file, index, options) {
  const storedPath = sourceStoredPathForFile(file, index, options.usedStoredPaths)
  options.usedStoredPaths?.add(storedPath)
  const targetPath = path.join(projectDirectory, storedPath)
  const sourcePath = await resolveSourcePath(projectDirectory, file, options.previousProjectDirectory)

  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  if (sourcePath && path.resolve(sourcePath) !== path.resolve(targetPath)) {
    await fs.copyFile(sourcePath, targetPath)
    invalidateFileHash(targetPath)
  } else if (!sourcePath) {
    const { sourcePath: _sourcePath, storedPath: _computedStoredPath, checksum: _checksum, ...rest } = file
    return {
      ...rest,
      ...(sourceFileRequiresStoredContent(file)
        ? typeof file?.storedPath === "string" && isSafeStoredSourcePath(file.storedPath)
          ? { storedPath: toProjectPath(file.storedPath) }
          : { storedPath }
        : {}),
    }
  }

  const hashedFile = await sha256File(targetPath)
  const { sourcePath: _sourcePath, ...rest } = file
  return {
    ...rest,
    size: hashedFile.size,
    checksum: `sha256:${hashedFile.digest}`,
    storedPath,
  }
}

async function materializeImportSourceFile(projectDirectory, file, index, options = {}) {
  const workspaceDirectory = normalizeProjectDirectoryPath(projectDirectory)
  return withProjectSaveLock(workspaceDirectory, () => materializeImportSourceFileUnlocked(workspaceDirectory, file, index, options))
}

async function materializeImportSourceFileUnlocked(projectDirectory, file, index, options = {}) {
  const reservation = await reserveImportStoredPath(projectDirectory, file, index)
  const { storedPath } = reservation
  const targetPath = path.join(projectDirectory, storedPath)
  let committed = false
  try {
    const materialized = await withSourceMaterializationLock(targetPath, async () => {
      const sourcePath = typeof file?.sourcePath === "string" && path.isAbsolute(file.sourcePath)
        ? file.sourcePath
        : null

      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      if (sourcePath && path.resolve(sourcePath) !== path.resolve(targetPath)) {
        const temporaryPath = path.join(
          path.dirname(targetPath),
          `.rxnflow-import-${crypto.randomUUID()}${path.extname(targetPath) || ".tmp"}`,
        )
        try {
          await fs.copyFile(sourcePath, temporaryPath)
          const hashedFile = await sha256File(temporaryPath)
          if (options.shouldCommit && !options.shouldCommit()) {
            throw sourceImportSupersededError()
          }
          await fs.rename(temporaryPath, targetPath)
          committed = true
          invalidateFileHash(temporaryPath)
          invalidateFileHash(targetPath)
          try {
            await cacheKnownFileHash(targetPath, hashedFile)
          } catch {
            // The committed source remains valid even if the optional hash cache cannot be refreshed.
          }
          return materializedSourceFile(file, index, storedPath, targetPath, hashedFile)
        } finally {
          await fs.rm(temporaryPath, { force: true })
        }
      }
      if (sourcePath && path.resolve(sourcePath) === path.resolve(targetPath)) {
        if (options.shouldCommit && !options.shouldCommit()) {
          throw sourceImportSupersededError()
        }
        const hashedFile = await sha256File(targetPath)
        return materializedSourceFile(file, index, storedPath, targetPath, hashedFile)
      }
      throw new Error("Could not copy source file because the import payload did not include a readable native file path.")
    })
    committed = true
    return materialized
  } finally {
    if (reservation.createdPlaceholder && !committed) {
      await fs.rm(targetPath, { force: true })
    }
  }
}

function sourceImportSupersededError() {
  const error = new Error("A newer import of the same source file replaced this request.")
  error.code = "source_import_superseded"
  return error
}

async function cacheKnownFileHash(filePath, result) {
  const fingerprint = await statFileFingerprint(path.resolve(filePath))
  if (Number(fingerprint.size) !== result.size) return
  cacheFileHash(fingerprint.key, path.resolve(filePath), result)
}

function materializedSourceFile(file, index, storedPath, targetPath, hashedFile) {
  return {
    id: typeof file?.id === "string" ? file.id : undefined,
    name: typeof file?.name === "string" && file.name ? file.name : safeSourceFileName(file, index),
    preview: typeof file?.preview === "string" ? file.preview : "",
    size: hashedFile.size,
    checksum: `sha256:${hashedFile.digest}`,
    storedPath,
    sourcePath: targetPath,
  }
}

async function withSourceMaterializationLock(targetPath, operation) {
  const targetKey = path.resolve(targetPath)
  const previous = sourceMaterializationTails.get(targetKey) || Promise.resolve()
  let release
  const turn = new Promise((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => turn)
  sourceMaterializationTails.set(targetKey, tail)

  await previous
  try {
    return await operation()
  } finally {
    release()
    if (sourceMaterializationTails.get(targetKey) === tail) {
      sourceMaterializationTails.delete(targetKey)
    }
  }
}

async function reserveImportStoredPath(projectDirectory, file, index) {
  if (typeof file?.storedPath === "string" && isSafeStoredSourcePath(file.storedPath)) {
    return { storedPath: toProjectPath(file.storedPath), createdPlaceholder: false }
  }

  const sourceRoot = path.join(projectDirectory, sourcesDirectory)
  await fs.mkdir(sourceRoot, { recursive: true })
  const baseName = path.basename(defaultImportStoredPathForFile(file, index))
  let suffix = 1
  while (true) {
    const candidateName = suffix === 1 ? baseName : withFileNameSuffix(baseName, suffix)
    const storedPath = toProjectPath(path.join(sourcesDirectory, candidateName))
    const targetPath = path.join(projectDirectory, storedPath)
    try {
      const handle = await fs.open(targetPath, "wx")
      await handle.close()
      return { storedPath, createdPlaceholder: true }
    } catch (error) {
      if (error?.code !== "EEXIST") throw error
      suffix += 1
    }
  }
}

function defaultImportStoredPathForFile(file, index) {
  return toProjectPath(path.join(sourcesDirectory, safeSourceFileName(file, index)))
}

async function sha256File(filePath) {
  const absolutePath = path.resolve(filePath)
  for (let attempt = 1; attempt <= maxFileHashAttempts; attempt += 1) {
    const before = await statFileFingerprint(absolutePath)
    const cached = takeCachedFileHash(before.key)
    if (cached) return cached

    const digest = await streamSha256(absolutePath)
    const after = await statFileFingerprint(absolutePath)
    if (before.key === after.key) {
      const result = { digest, size: Number(after.size) }
      cacheFileHash(after.key, absolutePath, result)
      return result
    }
  }
  throw new Error(`Source file changed while computing its checksum: ${absolutePath}`)
}

async function statFileFingerprint(absolutePath) {
  const stats = await fs.stat(absolutePath, { bigint: true })
  if (!stats.isFile()) throw new Error(`Source path is not a file: ${absolutePath}`)
  return {
    key: [
      absolutePath,
      stats.dev,
      stats.ino,
      stats.size,
      stats.mtimeNs,
      stats.ctimeNs,
    ].join("\0"),
    size: stats.size,
  }
}

async function streamSha256(filePath) {
  const hash = crypto.createHash("sha256")
  for await (const chunk of fsSync.createReadStream(filePath)) {
    hash.update(chunk)
  }
  return hash.digest("hex")
}

function takeCachedFileHash(fingerprint) {
  const cached = fileHashCache.get(fingerprint)
  if (!cached) return null
  fileHashCache.delete(fingerprint)
  fileHashCache.set(fingerprint, cached)
  return cached.result
}

function cacheFileHash(fingerprint, absolutePath, result) {
  fileHashCache.delete(fingerprint)
  fileHashCache.set(fingerprint, { absolutePath, result })
  while (fileHashCache.size > maxFileHashCacheEntries) {
    fileHashCache.delete(fileHashCache.keys().next().value)
  }
}

function invalidateFileHash(filePath) {
  const absolutePath = path.resolve(filePath)
  for (const [fingerprint, cached] of fileHashCache) {
    if (cached.absolutePath === absolutePath) fileHashCache.delete(fingerprint)
  }
}

function sourceFileRequiresStoredContent(file) {
  return file?.status === "ready" || file?.status === "parsed" || file?.parse?.parsed === true
}

function sourceStoredPathForFile(file, index, usedStoredPaths) {
  if (typeof file?.storedPath === "string" && isSafeStoredSourcePath(file.storedPath)) {
    const storedPath = toProjectPath(file.storedPath)
    if (!usedStoredPaths?.has(storedPath)) return storedPath
  }

  const baseName = safeSourceFileName(file, index)
  let storedPath = toProjectPath(path.join(sourcesDirectory, baseName))
  let suffix = 2
  while (usedStoredPaths?.has(storedPath)) {
    storedPath = toProjectPath(path.join(sourcesDirectory, withFileNameSuffix(baseName, suffix)))
    suffix += 1
  }
  return storedPath
}

async function pruneUnreferencedSourceFiles(projectDirectory, files) {
  const referenced = new Set(
    (Array.isArray(files) ? files : [])
      .map((file) => file?.storedPath)
      .filter(isSafeStoredSourcePath)
      .map(toProjectPath),
  )
  const sourceRoot = path.join(projectDirectory, sourcesDirectory)
  let dirents
  try {
    dirents = await fs.readdir(sourceRoot, { withFileTypes: true })
  } catch {
    return
  }

  await Promise.all(dirents.map(async (dirent) => {
    if (!dirent.isFile()) return
    const storedPath = toProjectPath(path.join(sourcesDirectory, dirent.name))
    if (referenced.has(storedPath)) return
    const sourcePath = path.join(sourceRoot, dirent.name)
    await fs.unlink(sourcePath).then(
      () => invalidateFileHash(sourcePath),
      () => undefined,
    )
  }))
}

async function resolveSourcePath(projectDirectory, file, previousProjectDirectory) {
  const candidates = []
  if (typeof file?.sourcePath === "string" && file.sourcePath) {
    candidates.push(file.sourcePath)
  }
  if (typeof file?.storedPath === "string" && isSafeProjectPath(file.storedPath)) {
    if (previousProjectDirectory) candidates.push(path.join(previousProjectDirectory, file.storedPath))
    candidates.push(path.join(projectDirectory, file.storedPath))
  }

  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate)
      if (stats.isFile()) return candidate
    } catch {
      // Try the next candidate; preview text is still enough for a degraded copy.
    }
  }
  return null
}


function slimProjectPackageForPersistence(projectPackage) {
  const stripped = stripSessionSourcePaths(projectPackage)
  return {
    ...stripped,
    files: Array.isArray(stripped.files) ? stripped.files.map(slimSourceFileForPersistence) : [],
  }
}

function slimSourceFileForPersistence(file) {
  if (!file || typeof file !== "object") return file
  return {
    ...file,
    parse: slimParseForPersistence(file.parse),
  }
}

function slimParseForPersistence(parse) {
  if (!parse || typeof parse !== "object") return parse
  return {
    ...parse,
    coordinatePreview: slimCoordinatePreviewForPersistence(parse.coordinatePreview),
    candidates: Array.isArray(parse.candidates)
      ? parse.candidates.map((candidate) => ({
          ...candidate,
          coordinatePreview: slimCoordinatePreviewForPersistence(candidate?.coordinatePreview),
        }))
      : [],
  }
}

function slimCoordinatePreviewForPersistence(preview) {
  if (!preview || typeof preview !== "object") return preview ?? null
  const modes = Array.isArray(preview.vibrationModes)
    ? preview.vibrationModes.map((mode, index) => slimVibrationModeForPersistence(mode, index === 0)).filter(Boolean)
    : []
  return {
    ...preview,
    ...(modes.length > 0 ? { vibrationModes: modes } : { vibrationModes: undefined }),
  }
}

function slimVibrationModeForPersistence(mode, retainDisplacements) {
  if (!mode || typeof mode !== "object") return null
  const {
    displacements,
    ...rest
  } = mode
  return {
    ...rest,
    displacements: retainDisplacements && Array.isArray(displacements) ? displacements : [],
  }
}

function stripSessionSourcePaths(projectPackage) {
  return {
    ...projectPackage,
    files: Array.isArray(projectPackage.files)
      ? projectPackage.files.map((file) => {
          const { sourcePath: _sourcePath, ...rest } = file
          return rest
        })
      : [],
  }
}

async function writeProjectManifest(projectDirectory, projectPackage) {
  const manifest = {
    schemaVersion: 1,
    packageKind: "rxnflow-project-workspace",
    project: projectPackage.project,
    savedAt: projectPackage.savedAt,
    stateFile: projectStateFile,
    metadataDirectory: projectMetadataDirectory,
    sourcesDirectory,
    exportsDirectory,
    sources: projectPackage.files.map((file) => ({
      id: file.id,
      name: file.name,
      kind: file.kind,
      size: file.size,
      checksum: file.checksum,
      status: file.status,
      storedPath: file.storedPath,
    })),
  }
  await fs.mkdir(path.join(projectDirectory, projectMetadataDirectory), { recursive: true })
  await fs.writeFile(path.join(projectDirectory, projectManifestFile), `${JSON.stringify(manifest)}\n`, "utf8")
}

async function ensureExportManifest(projectDirectory, projectPackage) {
  const manifestPath = path.join(projectDirectory, exportManifestFile)
  const existingArtifacts = await readExportArtifactRecords(projectDirectory)
  const manifest = {
    schemaVersion: 1,
    packageKind: "rxnflow-export-artifacts",
    project: projectPackage.project,
    artifacts: existingArtifacts,
  }
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8")
}

async function upsertExportArtifactRecord(projectDirectory, record) {
  const manifestPath = path.join(projectDirectory, exportManifestFile)
  const artifacts = await readExportArtifactRecords(projectDirectory)
  const nextArtifacts = [
    record,
    ...artifacts.filter((artifact) => artifact?.path !== record.path),
  ]
  const manifest = {
    schemaVersion: 1,
    packageKind: "rxnflow-export-artifacts",
    artifacts: nextArtifacts,
  }
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8")
}

async function readExportArtifactRecords(projectDirectory) {
  try {
    const raw = await fs.readFile(path.join(projectDirectory, exportManifestFile), "utf8")
    const value = JSON.parse(raw)
    return Array.isArray(value?.artifacts) ? value.artifacts : []
  } catch {
    return []
  }
}

function writeProjectWorkspaceArchive(projectDirectory, archivePath) {
  const archivePathKey = path.resolve(archivePath)
  return new Promise((resolve, reject) => {
    const output = fsSync.createWriteStream(archivePath)
    const archive = archiver("zip", { zlib: { level: 6 } })
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve()
    }

    output.on("close", () => finish())
    output.on("error", finish)
    archive.on("warning", finish)
    archive.on("error", finish)
    archive.pipe(output)
    archive.directory(projectDirectory, false, (entry) => {
      const absolutePath = path.resolve(projectDirectory, entry.name)
      return absolutePath === archivePathKey ? false : entry
    })
    archive.finalize().catch(finish)
  })
}

function safeSourceFileName(file, index) {
  const originalName = typeof file?.name === "string" && file.name ? file.name : `source-${index + 1}.txt`
  const normalizedOriginalName = path.basename(originalName).trim().toLowerCase()
  const extension = safeExtension(path.extname(originalName))
  const originalStem = path.basename(originalName, path.extname(originalName)).trim().toLowerCase()
  const baseName = safeStem(originalStem) || "source"
  const safeName = `${baseName}${extension}`
  const uniqueBaseName = normalizedOriginalName === safeName
    ? baseName
    : `${baseName}-${crypto.createHash("sha256").update(normalizedOriginalName).digest("hex").slice(0, 16)}`
  return `${uniqueBaseName}${extension}`
}

function withFileNameSuffix(fileName, suffix) {
  const extension = path.extname(fileName)
  const baseName = path.basename(fileName, extension)
  return `${baseName}-${suffix}${extension || ".txt"}`
}

function safeFileName(fileName) {
  const extension = safeExtension(path.extname(fileName))
  const baseName = safeStem(path.basename(fileName, path.extname(fileName))) || "rxnflow-export"
  return `${baseName}${extension}`
}

function safeStem(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function safeExtension(extension) {
  const safe = extension.toLowerCase().replace(/[^.a-z0-9]/g, "")
  return safe && safe !== "." ? safe.slice(0, 18) : ".txt"
}

function isSafeProjectPath(projectPath) {
  if (typeof projectPath !== "string" || !projectPath) return false
  if (path.isAbsolute(projectPath)) return false
  return !projectPath.split(/[\\/]+/).includes("..")
}

function isSafeStoredSourcePath(projectPath) {
  if (!isSafeProjectPath(projectPath)) return false
  const parts = toProjectPath(projectPath).split("/")
  return parts[0] === sourcesDirectory && parts.length > 1 && parts.every(Boolean)
}

function toProjectPath(projectPath) {
  return String(projectPath).split(/[\\/]+/).join("/")
}

module.exports = {
  defaultImportStoredPathForFile,
  exportManifestFile,
  exportProjectWorkspaceArchive,
  exportsDirectory,
  isProjectDirectoryPath,
  importProjectWorkspaceArchive,
  legacyProjectManifestFile,
  legacyProjectStateFile,
  materializeImportSourceFile,
  projectDirectoryExtension,
  projectManifestFile,
  projectMetadataDirectory,
  projectStateFile,
  readProjectContent,
  resolveProjectStatePath,
  saveProjectContent,
  saveProjectDirectory,
  saveProjectReportArtifact,
  slimProjectPackageForPersistence,
  sourcesDirectory,
  withProjectSaveLock,
}
