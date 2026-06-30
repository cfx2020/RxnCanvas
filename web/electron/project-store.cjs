const crypto = require("node:crypto")
const fs = require("node:fs/promises")
const path = require("node:path")
const zlib = require("node:zlib")

const projectDirectoryExtension = ".rxnflow"
const projectMetadataDirectory = ".rxnflow"
const legacyProjectStateFile = "project.json"
const legacyProjectManifestFile = "manifest.json"
const projectStateFile = path.join(projectMetadataDirectory, "project.json")
const projectManifestFile = path.join(projectMetadataDirectory, "manifest.json")
const sourcesDirectory = "sources"
const exportsDirectory = "exports"
const exportManifestFile = path.join(exportsDirectory, "manifest.json")

async function readProjectContent(projectPath) {
  const stats = await fs.stat(projectPath)
  if (stats.isDirectory()) {
    const statePath = await resolveProjectStatePath(projectPath)
    return fs.readFile(statePath, "utf8")
  }
  return fs.readFile(projectPath, "utf8")
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
  const entries = await collectProjectArchiveEntries(workspaceDirectory, archivePath)
  await fs.writeFile(archivePath, buildZipArchive(entries))
  return {
    canceled: false,
    filePath: archivePath,
    projectDirectory: workspaceDirectory,
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
  } else if (!sourcePath && hasNonEmptyPreview(file)) {
    await fs.writeFile(targetPath, file.preview, "utf8")
  } else if (!sourcePath) {
    const { sourcePath: _sourcePath, storedPath: _computedStoredPath, checksum: _checksum, ...rest } = file
    return {
      ...rest,
      ...(typeof file?.storedPath === "string" && isSafeStoredSourcePath(file.storedPath)
        ? { storedPath: toProjectPath(file.storedPath) }
        : {}),
    }
  }

  const stats = await fs.stat(targetPath)
  const buffer = await fs.readFile(targetPath)
  const { sourcePath: _sourcePath, ...rest } = file
  return {
    ...rest,
    size: stats.size,
    checksum: `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`,
    storedPath,
  }
}

async function materializeImportSourceFile(projectDirectory, file, index, options = {}) {
  const usedStoredPaths = options.usedStoredPaths
  const referencedStoredPaths = normalizedStoredPathSet(options.referencedStoredPaths)
  const storedPath = await importStoredPathForFile(projectDirectory, file, index, usedStoredPaths, referencedStoredPaths)
  usedStoredPaths?.add(storedPath)
  const targetPath = path.join(projectDirectory, storedPath)
  const sourcePath = typeof file?.sourcePath === "string" && path.isAbsolute(file.sourcePath)
    ? file.sourcePath
    : null

  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  if (sourcePath && path.resolve(sourcePath) !== path.resolve(targetPath)) {
    await fs.copyFile(sourcePath, targetPath)
  } else if (sourcePath && path.resolve(sourcePath) === path.resolve(targetPath)) {
    // The source is already materialized in the project folder.
  } else {
    throw new Error("Could not copy source file because the import payload did not include a readable native file path.")
  }

  const stats = await fs.stat(targetPath)
  const buffer = await fs.readFile(targetPath)
  return {
    id: typeof file?.id === "string" ? file.id : undefined,
    name: typeof file?.name === "string" && file.name ? file.name : safeSourceFileName(file, index),
    preview: typeof file?.preview === "string" ? file.preview : "",
    size: stats.size,
    checksum: `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`,
    storedPath,
    sourcePath: targetPath,
  }
}

async function importStoredPathForFile(projectDirectory, file, index, usedStoredPaths, referencedStoredPaths) {
  if (typeof file?.storedPath === "string" && isSafeStoredSourcePath(file.storedPath)) {
    const storedPath = toProjectPath(file.storedPath)
    if (!usedStoredPaths?.has(storedPath)) return storedPath
  }

  const baseName = safeSourceFileName(file, index)
  let storedPath = toProjectPath(path.join(sourcesDirectory, baseName))
  let suffix = 2
  while (usedStoredPaths?.has(storedPath) || await projectSourcePathConflicts(projectDirectory, storedPath, referencedStoredPaths)) {
    storedPath = toProjectPath(path.join(sourcesDirectory, withFileNameSuffix(baseName, suffix)))
    suffix += 1
  }
  return storedPath
}

function normalizedStoredPathSet(paths) {
  if (!Array.isArray(paths)) return null
  return new Set(paths
    .filter(isSafeStoredSourcePath)
    .map(toProjectPath))
}

async function projectSourcePathConflicts(projectDirectory, storedPath, referencedStoredPaths) {
  if (referencedStoredPaths && !referencedStoredPaths.has(storedPath)) return false
  return projectSourcePathExists(projectDirectory, storedPath)
}

async function projectSourcePathExists(projectDirectory, storedPath) {
  try {
    const stats = await fs.stat(path.join(projectDirectory, storedPath))
    return stats.isFile()
  } catch {
    return false
  }
}

function hasNonEmptyPreview(file) {
  return typeof file?.preview === "string" && file.preview.length > 0
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
    await fs.unlink(path.join(sourceRoot, dirent.name)).catch(() => undefined)
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
    ? preview.vibrationModes.map((mode) => slimVibrationModeForPersistence(mode)).filter(Boolean)
    : []
  return {
    ...preview,
    ...(modes.length > 0 ? { vibrationModes: modes } : { vibrationModes: undefined }),
  }
}

function slimVibrationModeForPersistence(mode) {
  if (!mode || typeof mode !== "object") return null
  const {
    displacements: _displacements,
    ...rest
  } = mode
  return {
    ...rest,
    displacements: [],
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

async function collectProjectArchiveEntries(projectDirectory, archivePath) {
  const entries = []
  const archivePathKey = path.resolve(archivePath)

  async function visit(currentDirectory, relativeDirectory = "") {
    const stats = await fs.stat(currentDirectory)
    if (relativeDirectory) {
      entries.push({
        name: `${toProjectPath(relativeDirectory)}/`,
        data: Buffer.alloc(0),
        directory: true,
        mtime: stats.mtime,
      })
    }

    const dirents = await fs.readdir(currentDirectory, { withFileTypes: true })
    dirents.sort((left, right) => left.name.localeCompare(right.name))
    for (const dirent of dirents) {
      const absolutePath = path.join(currentDirectory, dirent.name)
      if (path.resolve(absolutePath) === archivePathKey) continue
      const relativePath = relativeDirectory ? path.join(relativeDirectory, dirent.name) : dirent.name
      if (dirent.isDirectory()) {
        await visit(absolutePath, relativePath)
        continue
      }
      if (!dirent.isFile()) continue
      entries.push({
        name: toProjectPath(relativePath),
        data: await fs.readFile(absolutePath),
        directory: false,
        mtime: (await fs.stat(absolutePath)).mtime,
      })
    }
  }

  await visit(projectDirectory)
  return entries
}

function buildZipArchive(entries) {
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const entry of entries) {
    const fileName = Buffer.from(entry.name, "utf8")
    const rawData = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? "")
    const compressedData = entry.directory ? rawData : zlib.deflateRawSync(rawData, { level: 6 })
    const method = entry.directory ? 0 : 8
    const checksum = crc32(rawData)
    const { dosTime, dosDate } = dosDateTime(entry.mtime instanceof Date ? entry.mtime : new Date())

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt16LE(method, 8)
    localHeader.writeUInt16LE(dosTime, 10)
    localHeader.writeUInt16LE(dosDate, 12)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(compressedData.length, 18)
    localHeader.writeUInt32LE(rawData.length, 22)
    localHeader.writeUInt16LE(fileName.length, 26)
    localHeader.writeUInt16LE(0, 28)

    localParts.push(localHeader, fileName, compressedData)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(method, 10)
    centralHeader.writeUInt16LE(dosTime, 12)
    centralHeader.writeUInt16LE(dosDate, 14)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(compressedData.length, 20)
    centralHeader.writeUInt32LE(rawData.length, 24)
    centralHeader.writeUInt16LE(fileName.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(entry.directory ? 0x10 : 0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    centralParts.push(centralHeader, fileName)

    offset += localHeader.length + fileName.length + compressedData.length
  }

  const centralOffset = offset
  const centralDirectory = Buffer.concat(centralParts)
  const endRecord = Buffer.alloc(22)
  endRecord.writeUInt32LE(0x06054b50, 0)
  endRecord.writeUInt16LE(0, 4)
  endRecord.writeUInt16LE(0, 6)
  endRecord.writeUInt16LE(entries.length, 8)
  endRecord.writeUInt16LE(entries.length, 10)
  endRecord.writeUInt32LE(centralDirectory.length, 12)
  endRecord.writeUInt32LE(centralOffset, 16)
  endRecord.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDirectory, endRecord])
}

function dosDateTime(date) {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()))
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { dosTime, dosDate }
}

const crc32Table = new Uint32Array(256)
for (let index = 0; index < 256; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  crc32Table[index] = value >>> 0
}

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) {
    value = crc32Table[(value ^ byte) & 0xff] ^ (value >>> 8)
  }
  return (value ^ 0xffffffff) >>> 0
}

function safeSourceFileName(file, index) {
  const originalName = typeof file?.name === "string" && file.name ? file.name : `source-${index + 1}.txt`
  const extension = safeExtension(path.extname(originalName))
  const baseName = safeStem(path.basename(originalName, path.extname(originalName))) || "source"
  return `${baseName}${extension}`
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
  exportManifestFile,
  exportProjectWorkspaceArchive,
  exportsDirectory,
  isProjectDirectoryPath,
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
}
