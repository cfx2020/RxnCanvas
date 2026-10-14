const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const archiver = require("archiver")
const assert = require("node:assert/strict")
const { getEngineStatus, runEngineRequest, shutdownEngineWorkers } = require("./engine-bridge.cjs")
const {
  exportManifestFile,
  exportProjectWorkspaceArchive,
  importProjectWorkspaceArchive,
  materializeImportSourceFile,
  projectManifestFile,
  projectStateFile,
  readProjectContent,
  saveProjectContent,
  saveProjectReportArtifact,
  slimProjectPackageForPersistence,
} = require("./project-store.cjs")
const {
  loadRecentProjects,
  loadRecentProjectsState,
  saveRecentProjects,
  saveRecentProjectsState,
  recordRecentProject,
  recordRecentProjectState,
  removeRecentProject,
  removeRecentProjectState,
  recentProjectLabel,
} = require("./recent-projects.cjs")

const requiredFiles = [
  path.join(__dirname, "main.cjs"),
  path.join(__dirname, "preload.cjs"),
  path.join(__dirname, "engine-bridge.cjs"),
  path.join(__dirname, "project-store.cjs"),
  path.join(__dirname, "..", "dist", "index.html"),
]
const fixtureDirectory = path.resolve(__dirname, "../../tests/fixtures")

async function main() {
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing Electron desktop file: ${file}`)
    }
  }

  await verifyRecentProjectsStore()
  verifyVibrationPayloadSlimming()
  await verifyProjectDirectoryStore()
  await verifyLocalEngineFailureMode()
  await verifyLocalEngineParserCoverage()

  const status = await getEngineStatus({ timeoutMs: 5000 })
  if (!status.ok || status.data?.status !== "ready") {
    throw new Error(`RxnCanvas local engine smoke failed: ${JSON.stringify(status)}`)
  }
  for (const capability of ["import.preview", "import.register_selection", "import.register_all", "project.validate", "project.open", "project.save"]) {
    if (!status.data.capabilities?.includes(capability)) {
      throw new Error(`RxnCanvas local engine missing ${capability}: ${JSON.stringify(status)}`)
    }
  }

  const previewFile = {
    id: "smoke-log",
    name: "gaussian-water.log",
    sourcePath: path.join(fixtureDirectory, "gaussian-water.log"),
  }
  const preview = await runEngineRequest({
    command: "import.preview",
    files: [previewFile],
  }, { timeoutMs: 5000 })
  const smokeParse = preview.data?.files?.[0]?.parse
  if (
    !preview.ok
    || smokeParse?.sourceKind !== "Gaussian"
    || smokeParse?.parserId !== "gaussian-log-cclib+rxncanvas-text-full-file"
    || smokeParse?.parseScope !== "full-file"
    || smokeParse?.objectCount !== 1
    || !Array.isArray(smokeParse?.candidates)
    || smokeParse.candidates.length !== 1
  ) {
    throw new Error(`RxnCanvas import.preview smoke failed: ${JSON.stringify(preview)}`)
  }
  const sourceWithParse = {
    ...previewFile,
    parse: smokeParse,
  }
  const registeredSelection = await runEngineRequest({
    command: "import.register_selection",
    files: [sourceWithParse],
    selections: [{
      fileId: previewFile.id,
      objectIndices: [0],
    }],
  }, { timeoutMs: 5000 })
  if (
    !registeredSelection.ok
    || registeredSelection.data?.registeredObjects?.length !== 1
    || registeredSelection.data.registeredObjects[0]?.sourceCandidateId !== smokeParse.candidates[0].candidateId
  ) {
    throw new Error(`RxnCanvas import.register_selection smoke failed: ${JSON.stringify(registeredSelection)}`)
  }
  const registeredAll = await runEngineRequest({
    command: "import.register_all",
    files: [sourceWithParse],
  }, { timeoutMs: 5000 })
  if (
    !registeredAll.ok
    || registeredAll.data?.registeredObjects?.length !== smokeParse.objectCount
    || registeredAll.data.files?.[0]?.registeredObjectIds?.length !== smokeParse.objectCount
  ) {
    throw new Error(`RxnCanvas import.register_all smoke failed: ${JSON.stringify(registeredAll)}`)
  }
  await verifyEngineProjectCommands()

  console.log("Electron desktop smoke files present")
  console.log("Electron recent projects store ready")
  console.log("Electron project directory store ready")
  console.log("RxnCanvas local engine failure path ready")
  console.log("RxnCanvas local parser coverage ready")
  console.log("RxnCanvas project engine commands ready")
  console.log("RxnCanvas import.preview ready")
  console.log("RxnCanvas import.register ready")
  console.log(`RxnCanvas local engine ready: ${status.data.engineVersion}`)
}

function verifyVibrationPayloadSlimming() {
  const firstDisplacements = [{ atomIndex: 0, dx: 0.1, dy: 0, dz: 0 }]
  const secondDisplacements = [{ atomIndex: 0, dx: 0, dy: 0.1, dz: 0 }]
  const preview = {
    atomCount: 1,
    vibrationModes: [
      { modeId: "mode-1", frequencyCm1: -300, displacements: firstDisplacements },
      { modeId: "mode-2", frequencyCm1: 120, displacements: secondDisplacements },
    ],
  }
  const slimmed = slimProjectPackageForPersistence({
    files: [{
      parse: {
        coordinatePreview: preview,
        candidates: [{ coordinatePreview: preview }],
      },
    }],
  })
  const previews = [
    slimmed.files?.[0]?.parse?.coordinatePreview,
    slimmed.files?.[0]?.parse?.candidates?.[0]?.coordinatePreview,
  ]
  for (const slimmedPreview of previews) {
    const modes = slimmedPreview?.vibrationModes ?? []
    if (JSON.stringify(modes[0]?.displacements) !== JSON.stringify(firstDisplacements)) {
      throw new Error("RxnCanvas project persistence did not retain the first vibration mode")
    }
    if (!Array.isArray(modes[1]?.displacements) || modes[1].displacements.length !== 0) {
      throw new Error("RxnCanvas project persistence retained non-primary vibration displacements")
    }
  }
}

async function verifyLocalEngineFailureMode() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-engine-unavailable-"))
  const enginePath = path.join(tempDir, "missing-engine")
  const previousCommand = process.env.RXNCANVAS_ENGINE_COMMAND
  try {
    process.env.RXNCANVAS_ENGINE_COMMAND = enginePath
    const response = await runEngineRequest({ command: "engine.status" }, { timeoutMs: 1000 })
    if (response.ok || response.error?.code !== "engine_unavailable") {
      throw new Error(`RxnCanvas local engine unavailable smoke failed: ${JSON.stringify(response)}`)
    }
  } finally {
    if (previousCommand === undefined) {
      delete process.env.RXNCANVAS_ENGINE_COMMAND
    } else {
      process.env.RXNCANVAS_ENGINE_COMMAND = previousCommand
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

async function verifyLocalEngineParserCoverage() {
  const fixtures = [
    ["gaussian-water.log", "Gaussian", -76.431, 3],
    ["orca-water.out", "ORCA", -76.34567890, 3],
    ["h2.xyz", "XYZ", -0.05512398326348249, 2],
    ["ase-h2.xyz", "extxyz", -0.05512398326348249, 2],
    ["path.xyz", "MAPLE", -11, 2],
  ]
  for (const [name, sourceKind, energy, atomCount] of fixtures) {
    const result = await runEngineRequest({
      command: "import.preview",
      files: [{ name, sourcePath: path.join(fixtureDirectory, name) }],
    }, { timeoutMs: 5000 })
    assert.equal(result.ok, true, JSON.stringify(result))
    const parse = result.data.files[0].parse
    assert.equal(parse.parsed, true, JSON.stringify(parse))
    assert.equal(parse.parseScope, "full-file")
    assert.equal(parse.sourceKind, sourceKind)
    assert.ok(Math.abs(parse.energyGas - energy) < 1e-12)
    assert.equal(parse.coordinatePreview.atomCount, atomCount)
    if (sourceKind === "Gaussian" || sourceKind === "ORCA") {
      assert.ok(parse.parserId.includes("cclib"))
      assert.equal(parse.candidates[0].charge, 0)
      assert.equal(parse.candidates[0].spinMultiplicity, 1)
      assert.equal(parse.coordinatePreview.atoms[0].element, "O")
    }
    if (sourceKind === "MAPLE") assert.deepEqual(parse.candidates.map((candidate) => candidate.label), ["Image 1", "Image 2"])
    if (sourceKind === "extxyz") assert.ok(parse.warnings.some((warning) => warning.code === "unit_assumed"))
  }
  const invalidSource = await runEngineRequest({
    command: "import.preview",
    files: [{ name: "invalid.xyz", sourcePath: path.join(fixtureDirectory, "invalid.xyz") }],
  })
  assert.equal(invalidSource.data.files[0].parse.parsed, false)
  assert.equal(invalidSource.data.files[0].parse.warnings[0].code, "parse_failed")
  const previewOnly = await runEngineRequest({
    command: "import.preview",
    files: [{ name: "missing.log", preview: "SCF Done: E(RB3LYP) = -100.0 A.U." }],
  })
  assert.equal(previewOnly.data.files[0].parse.parsed, false)
  assert.equal(previewOnly.data.files[0].parse.warnings[0].code, "full_file_required")

  const invalidProject = await runEngineRequest({
    command: "project.validate",
    content: badProjectReferenceContent(),
  }, { timeoutMs: 5000 })
  assertProjectReferenceValidation(invalidProject, "RxnCanvas local project reference validation smoke failed")
}

async function verifyRecentProjectsStore() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-recent-"))
  try {
    const storePath = path.join(tempDir, "recent-projects.json")
    const firstProject = path.join(tempDir, "alpha-study.rxncanvas.json")
    const secondProject = path.join(tempDir, "beta-study.rxncanvas.json")
    let projectPaths = recordRecentProject([], firstProject)
    projectPaths = recordRecentProject(projectPaths, secondProject)
    projectPaths = recordRecentProject(projectPaths, firstProject)

    if (projectPaths[0] !== firstProject || projectPaths[1] !== secondProject) {
      throw new Error(`Recent project ordering failed: ${JSON.stringify(projectPaths)}`)
    }

    await saveRecentProjects(storePath, projectPaths)
    const loadedPaths = await loadRecentProjects(storePath)
    if (JSON.stringify(loadedPaths) !== JSON.stringify(projectPaths)) {
      throw new Error(`Recent project persistence failed: ${JSON.stringify(loadedPaths)}`)
    }
    const loadedState = await loadRecentProjectsState(storePath)
    if (loadedState.activeProjectPath !== firstProject) {
      throw new Error(`Recent active project fallback failed: ${JSON.stringify(loadedState)}`)
    }

    const activeStorePath = path.join(tempDir, "recent-projects-active.json")
    let projectState = recordRecentProjectState({ projectPaths: [], activeProjectPath: null }, firstProject)
    projectState = recordRecentProjectState(projectState, secondProject)
    projectState = recordRecentProjectState(projectState, firstProject)
    await saveRecentProjectsState(activeStorePath, projectState)
    const reloadedState = await loadRecentProjectsState(activeStorePath)
    if (reloadedState.activeProjectPath !== firstProject || reloadedState.projectPaths[0] !== firstProject) {
      throw new Error(`Recent active project persistence failed: ${JSON.stringify(reloadedState)}`)
    }

    const remainingPaths = removeRecentProject(loadedPaths, firstProject)
    if (remainingPaths.includes(firstProject) || remainingPaths[0] !== secondProject) {
      throw new Error(`Recent project removal failed: ${JSON.stringify(remainingPaths)}`)
    }
    const remainingState = removeRecentProjectState(reloadedState, firstProject)
    if (remainingState.activeProjectPath !== secondProject || remainingState.projectPaths.includes(firstProject)) {
      throw new Error(`Recent active project removal failed: ${JSON.stringify(remainingState)}`)
    }

    if (recentProjectLabel(firstProject) !== "alpha study") {
      throw new Error(`Recent project label failed: ${recentProjectLabel(firstProject)}`)
    }
    if (recentProjectLabel(path.join(tempDir, "gamma-study.rxncanvas")) !== "gamma study") {
      throw new Error("Recent .rxncanvas project label failed")
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

async function verifyProjectDirectoryStore() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-project-store-"))
  try {
    const rawFilePath = path.join(tempDir, "gaussian.log")
    fs.writeFileSync(rawFilePath, "SCF Done: E(RwB97XD) = -100.0", "utf8")
    const projectPath = path.join(tempDir, "Alpha Study")
    const projectContent = JSON.stringify({
      schemaVersion: 2,
      packageKind: "rxncanvas-project",
      project: { id: "alpha-study", label: "Alpha Study", meta: "open" },
      files: [{
        id: "gaussian-log",
        name: "gaussian.log",
        kind: "Gaussian",
        size: 31,
        status: "parsed",
        preview: "SCF Done: E(RwB97XD) = -100.0",
        sourcePath: rawFilePath,
      }],
      canvases: [{
        id: "canvas-1",
        label: "画布 1",
        nodes: [],
        edges: [],
        barriers: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        selectedNodeIds: [],
        selectedEdgeIds: [],
        selectedBarrierIds: [],
      }],
      activeCanvasId: "canvas-1",
      savedAt: "2026-06-14T00:00:00.000Z",
    })

    const legacyJsonPath = path.join(tempDir, "alpha-study.rxncanvas.json")
    const legacyProject = await saveProjectContent(legacyJsonPath, projectContent)
    if (JSON.parse(legacyProject.content).files?.[0]?.sourcePath) {
      throw new Error("Legacy JSON project save leaked sourcePath")
    }

    const savedProject = await saveProjectContent(projectPath, projectContent)
    if (savedProject.projectDirectory !== projectPath) {
      throw new Error(`Project directory path mismatch: ${JSON.stringify(savedProject)}`)
    }
    if (
      !fs.existsSync(path.join(projectPath, projectStateFile))
      || !fs.existsSync(path.join(projectPath, projectManifestFile))
      || !fs.existsSync(path.join(projectPath, "sources"))
      || !fs.existsSync(path.join(projectPath, "exports"))
    ) {
      throw new Error("Project workspace state files were not written")
    }

    const restored = JSON.parse(await readProjectContent(projectPath))
    const storedPath = restored.files?.[0]?.storedPath
    if (!storedPath || restored.files[0].sourcePath || !restored.files[0].checksum?.startsWith("sha256:")) {
      throw new Error(`Project source metadata not normalized: ${JSON.stringify(restored.files?.[0])}`)
    }
    const storedRaw = fs.readFileSync(path.join(projectPath, storedPath), "utf8")
    if (!storedRaw.includes("SCF Done")) {
      throw new Error(`Project source copy failed: ${storedRaw}`)
    }

    let missingPayloadFailed = false
    try {
      await materializeImportSourceFile(projectPath, {
        id: "missing-source-payload",
        name: "missing-source-payload.log",
        size: 0,
        preview: "",
      }, 99, { usedStoredPaths: new Set() })
    } catch (error) {
      missingPayloadFailed = /readable native file path/.test(error instanceof Error ? error.message : String(error))
    }
    if (!missingPayloadFailed) {
      throw new Error("Project source import without file path or content did not fail")
    }
    if (fs.existsSync(path.join(projectPath, "sources", "missing-source-payload.log"))) {
      throw new Error("Project source import wrote an empty source file for a missing payload")
    }

    const orphanRawPath = path.join(tempDir, "orphan-name.log")
    fs.writeFileSync(orphanRawPath, "SCF Done: E(RwB97XD) = -111.0", "utf8")
    fs.writeFileSync(path.join(projectPath, "sources", "orphan-name.log"), "old orphan bytes", "utf8")
    const rematerializedOrphan = await materializeImportSourceFile(projectPath, {
      id: "orphan-name",
      name: "orphan-name.log",
      size: 31,
      preview: "",
      storedPath: "sources/orphan-name.log",
      sourcePath: orphanRawPath,
    }, 0, { usedStoredPaths: new Set(), referencedStoredPaths: [storedPath] })
    if (rematerializedOrphan.storedPath !== "sources/orphan-name.log") {
      throw new Error(`Project source import did not reuse the same-name source path: ${JSON.stringify(rematerializedOrphan)}`)
    }
    if (!fs.readFileSync(path.join(projectPath, "sources", "orphan-name.log"), "utf8").includes("-111.0")) {
      throw new Error("Project source import did not replace existing same-name bytes")
    }

    const referencedRawPath = path.join(tempDir, "referenced-name.log")
    fs.writeFileSync(referencedRawPath, "SCF Done: E(RwB97XD) = -112.0", "utf8")
    fs.writeFileSync(path.join(projectPath, "sources", "referenced-name.log"), "referenced bytes", "utf8")
    const materializedReferenced = await materializeImportSourceFile(projectPath, {
      id: "referenced-name",
      name: "referenced-name.log",
      size: 31,
      preview: "",
      storedPath: "sources/referenced-name.log",
      sourcePath: referencedRawPath,
    }, 0, { usedStoredPaths: new Set(), referencedStoredPaths: [storedPath, "sources/referenced-name.log"] })
    if (materializedReferenced.storedPath !== "sources/referenced-name.log") {
      throw new Error(`Project source import did not replace the referenced same-name source: ${JSON.stringify(materializedReferenced)}`)
    }
    if (!fs.readFileSync(path.join(projectPath, "sources", "referenced-name.log"), "utf8").includes("-112.0")) {
      throw new Error("Project source import did not update referenced same-name bytes")
    }

    const emptyPreviewSavePath = path.join(tempDir, "Empty Preview Study")
    const emptyPreviewProject = {
      ...JSON.parse(projectContent),
      project: { id: "empty-preview-study", label: "Empty Preview Study", meta: "open" },
      files: [{
        id: "empty-preview-source",
        name: "empty-preview.log",
        kind: "Gaussian",
        size: 0,
        status: "staged",
        preview: "",
      }],
    }
    const savedEmptyPreview = await saveProjectContent(emptyPreviewSavePath, JSON.stringify(emptyPreviewProject))
    const restoredEmptyPreview = JSON.parse(savedEmptyPreview.content)
    if (restoredEmptyPreview.files?.[0]?.storedPath || restoredEmptyPreview.files?.[0]?.checksum) {
      throw new Error(`Project save persisted metadata for an empty source payload: ${savedEmptyPreview.content}`)
    }
    if (fs.existsSync(path.join(emptyPreviewSavePath, "sources", "empty-preview.log"))) {
      throw new Error("Project save wrote an empty source file for an empty preview payload")
    }

    const sampledPreviewSavePath = path.join(tempDir, "Sampled Preview Study")
    const sampledPreviewProject = {
      ...JSON.parse(projectContent),
      project: { id: "sampled-preview-study", label: "Sampled Preview Study", meta: "open" },
      files: [{
        id: "sampled-preview-source",
        name: "sampled-preview.log",
        kind: "Gaussian",
        size: 900100,
        status: "parsed",
        preview: "head\n[... RxnCanvas preview skipped 900000 bytes ...]\ntail",
        parse: { parsed: true },
      }],
    }
    const savedSampledPreview = await saveProjectContent(sampledPreviewSavePath, JSON.stringify(sampledPreviewProject))
    const restoredSampledPreview = JSON.parse(savedSampledPreview.content)
    const sampledStoredPath = restoredSampledPreview.files?.[0]?.storedPath
    if (!sampledStoredPath || restoredSampledPreview.files[0].checksum) {
      throw new Error(`Project save did not preserve missing-source metadata: ${savedSampledPreview.content}`)
    }
    if (fs.existsSync(path.join(sampledPreviewSavePath, sampledStoredPath))) {
      throw new Error("Project save materialized sampled preview text as a source file")
    }
    const sampledValidation = await runEngineRequest({
      command: "project.validate",
      content: savedSampledPreview.content,
      projectPath: sampledPreviewSavePath,
    }, { timeoutMs: 5000 })
    if (!sampledValidation.ok || !sampledValidation.data?.issues?.some((issue) => issue.code === "source_missing")) {
      throw new Error(`Sampled preview missing-source validation failed: ${JSON.stringify(sampledValidation)}`)
    }

    const rawFilePathB = path.join(tempDir, "4b.log")
    const rawFilePathC = path.join(tempDir, "4b-sol.log")
    fs.writeFileSync(rawFilePathB, "SCF Done: E(RwB97XD) = -101.0", "utf8")
    fs.writeFileSync(rawFilePathC, "SCF Done: E(RwB97XD) = -102.0", "utf8")
    const multiSourceProject = {
      ...JSON.parse(projectContent),
      files: [
        JSON.parse(projectContent).files[0],
        {
          id: "desktop-file-4b",
          name: "4b.log",
          kind: "Gaussian",
          size: 31,
          status: "parsed",
          preview: "SCF Done: E(RwB97XD) = -101.0",
          sourcePath: rawFilePathB,
        },
        {
          id: "desktop-file-4b-sol",
          name: "4b-sol.log",
          kind: "Gaussian",
          size: 31,
          status: "parsed",
          preview: "SCF Done: E(RwB97XD) = -102.0",
          sourcePath: rawFilePathC,
        },
      ],
    }
    const savedMultiSource = await saveProjectContent(projectPath, JSON.stringify(multiSourceProject), {
      previousProjectDirectory: projectPath,
    })
    const restoredMultiSource = JSON.parse(savedMultiSource.content)
    const keptSourcePathBeforeDelete = restoredMultiSource.files?.[2]?.storedPath
    const deletedMiddleSourceProject = {
      ...restoredMultiSource,
      files: [restoredMultiSource.files[0], restoredMultiSource.files[2]],
    }
    const savedAfterDelete = await saveProjectContent(projectPath, JSON.stringify(deletedMiddleSourceProject), {
      previousProjectDirectory: projectPath,
    })
    const restoredAfterDelete = JSON.parse(savedAfterDelete.content)
    if (restoredAfterDelete.files?.length !== 2) {
      throw new Error(`Project source deletion did not persist file count: ${savedAfterDelete.content}`)
    }
    if (restoredAfterDelete.files?.[1]?.storedPath !== keptSourcePathBeforeDelete) {
      throw new Error(`Project source deletion renumbered a kept source: ${JSON.stringify({
        before: keptSourcePathBeforeDelete,
        after: restoredAfterDelete.files?.[1]?.storedPath,
      })}`)
    }
    if (!fs.readFileSync(path.join(projectPath, keptSourcePathBeforeDelete), "utf8").includes("-102.0")) {
      throw new Error("Project source deletion did not preserve kept source bytes")
    }
    if (fs.existsSync(path.join(projectPath, restoredMultiSource.files?.[1]?.storedPath))) {
      throw new Error("Project source deletion left an unreferenced middle source copy")
    }

    const artifactContent = Buffer.from("png-bytes")
    const artifactResult = await saveProjectReportArtifact(projectPath, {
      defaultName: "rxncanvas-profile.png",
      mimeType: "image/png",
      encoding: "base64",
      content: artifactContent.toString("base64"),
    })
    if (!fs.existsSync(artifactResult.filePath)) {
      throw new Error(`Project artifact was not written: ${JSON.stringify(artifactResult)}`)
    }
    const exportManifest = JSON.parse(fs.readFileSync(path.join(projectPath, exportManifestFile), "utf8"))
    if (exportManifest.artifacts?.[0]?.path !== "exports/rxncanvas-profile.png") {
      throw new Error(`Project export manifest was not updated: ${JSON.stringify(exportManifest)}`)
    }

    const archivePath = path.join(tempDir, "alpha-study.rxncanvas.zip")
    await exportProjectWorkspaceArchive(projectPath, archivePath)
    const archiveBytes = fs.readFileSync(archivePath)
    for (const entryName of [".rxncanvas/project.json", ".rxncanvas/manifest.json", "sources/gaussian.log", "exports/manifest.json"]) {
      if (!archiveBytes.includes(Buffer.from(entryName))) {
        throw new Error(`Project archive is missing ${entryName}`)
      }
    }

    const importedProjectPath = path.join(tempDir, "Imported Alpha Study")
    const importedArchive = await importProjectWorkspaceArchive(archivePath, importedProjectPath)
    const importedContent = JSON.parse(await readProjectContent(importedArchive.projectDirectory))
    if (importedContent.project?.id !== "alpha-study") {
      throw new Error(`Imported project archive did not restore project content: ${JSON.stringify(importedContent.project)}`)
    }
    if (!fs.existsSync(path.join(importedProjectPath, "sources", "gaussian.log"))) {
      throw new Error("Imported project archive did not restore source files")
    }

    const symlinkArchivePath = path.join(tempDir, "symlink-escape.rxncanvas.zip")
    await writeSymlinkArchive(symlinkArchivePath, projectContent)
    const symlinkImportPath = path.join(tempDir, "Symlink Escape")
    const escapedFilePath = path.join(tempDir, "outside-project.log")
    let symlinkArchiveRejected = false
    try {
      await importProjectWorkspaceArchive(symlinkArchivePath, symlinkImportPath)
    } catch (error) {
      symlinkArchiveRejected = /symbolic link or unsupported file type/.test(error instanceof Error ? error.message : String(error))
    }
    if (!symlinkArchiveRejected) {
      throw new Error("Project archive import did not reject a symbolic link entry")
    }
    if (fs.existsSync(symlinkImportPath) || fs.existsSync(escapedFilePath)) {
      throw new Error("Rejected symbolic link archive wrote files outside its temporary import directory")
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function writeSymlinkArchive(archivePath, projectContent) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(archivePath)
    const archive = archiver("zip")
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
    archive.append(projectContent, { name: projectStateFile })
    archive.symlink("sources/escape.log", "../../outside-project.log")
    archive.finalize().catch(finish)
  })
}

async function verifyEngineProjectCommands() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rxncanvas-engine-project-"))
  try {
    const projectPath = path.join(tempDir, "Engine Study")
    const projectContent = JSON.stringify({
      schemaVersion: 2,
      packageKind: "rxncanvas-project",
      project: { id: "engine-study", label: "Engine Study", meta: "open" },
      files: [{
        id: "file-1",
        name: "engine.log",
        kind: "Gaussian",
        size: 31,
        status: "parsed",
        preview: "SCF Done: E(RwB97XD) = -100.0",
        sourcePath: "/tmp/session-only.log",
        storedPath: "sources/01-file-1-engine.log",
      }],
      canvases: [{
        id: "canvas-1",
        label: "画布 1",
        nodes: [{
          id: "node-1",
          label: "Engine TS",
          formula: "C2H4",
          kind: "transition",
          method: "wB97X-D",
          solvent: "Toluene",
          energyGas: -100,
          energySolution: -99.8,
          energyUnit: "hartree",
          sourceStatus: "parsed",
          sourceFileId: "file-1",
          sourceCandidateId: "candidate-1-engine-ts",
          sourceObjectIndex: 0,
          parserId: "gaussian-log-text-preview",
          parserVersion: "0.2.1",
          position: { x: 0, y: 0 },
        }],
        edges: [],
        barriers: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        selectedNodeIds: ["node-1"],
        selectedEdgeIds: [],
        selectedBarrierIds: [],
      }],
      activeCanvasId: "canvas-1",
      importLedger: {
        schemaVersion: 1,
        entries: [{
          id: "import-file-1-candidate-1-engine-ts",
          fileId: "file-1",
          sourceName: "engine.log",
          sourceKind: "Gaussian",
          status: "registered",
          parserId: "gaussian-log-text-preview",
          parserVersion: "0.2.1",
          candidateId: "candidate-1-engine-ts",
          objectIndex: 0,
          registeredNodeIds: ["node-1"],
          warningCodes: [],
        }],
      },
      savedAt: "2026-06-14T00:00:00.000Z",
    })

    const validation = await runEngineRequest({
      command: "project.validate",
      content: projectContent,
    }, { timeoutMs: 5000 })
    if (
      !validation.ok
      || !validation.data?.valid
      || validation.data.summary?.nodeCount !== 1
      || validation.data.summary?.importLedgerEntryCount !== 1
    ) {
      throw new Error(`RxnCanvas project.validate smoke failed: ${JSON.stringify(validation)}`)
    }

    const invalidProject = await runEngineRequest({
      command: "project.validate",
      content: badProjectReferenceContent(),
    }, { timeoutMs: 5000 })
    assertProjectReferenceValidation(invalidProject, "RxnCanvas project reference validation smoke failed")

    fs.mkdirSync(path.join(projectPath, "sources"), { recursive: true })
    fs.writeFileSync(path.join(projectPath, "sources", "01-file-1-engine.log"), "complete engine source", "utf8")
    const saved = await runEngineRequest({
      command: "project.save",
      projectPath,
      content: projectContent,
    }, { timeoutMs: 5000 })
    if (!saved.ok || !fs.existsSync(path.join(projectPath, projectStateFile))) {
      throw new Error(`RxnCanvas project.save smoke failed: ${JSON.stringify(saved)}`)
    }
    if (saved.data.content.includes("sourcePath")) {
      throw new Error("RxnCanvas project.save leaked session sourcePath")
    }
    const savedPackage = JSON.parse(saved.data.content)
    const storedPath = savedPackage.files?.[0]?.storedPath
    if (!storedPath || !savedPackage.files?.[0]?.checksum?.startsWith("sha256:")) {
      throw new Error(`RxnCanvas project.save did not persist source checksum: ${saved.data.content}`)
    }
    if (savedPackage.importLedger?.entries?.[0]?.registeredNodeIds?.[0] !== "node-1") {
      throw new Error(`RxnCanvas project.save did not persist import ledger: ${saved.data.content}`)
    }

    const opened = await runEngineRequest({
      command: "project.open",
      projectPath,
    }, { timeoutMs: 5000 })
    if (!opened.ok || !opened.data?.validation?.valid || opened.data.validation.summary?.projectId !== "engine-study") {
      throw new Error(`RxnCanvas project.open smoke failed: ${JSON.stringify(opened)}`)
    }

    fs.writeFileSync(path.join(projectPath, storedPath), "changed", "utf8")
    const changedSource = await runEngineRequest({
      command: "project.open",
      projectPath,
    }, { timeoutMs: 5000 })
    const changedSourceCodes = new Set(changedSource.data?.validation?.issues?.map((issue) => issue.code) || [])
    if (!changedSource.ok || !changedSourceCodes.has("source_checksum_mismatch")) {
      throw new Error(`RxnCanvas source checksum validation smoke failed: ${JSON.stringify(changedSource)}`)
    }

    const exportArtifactPath = path.join(projectPath, "exports", "rxncanvas-profile.png")
    fs.writeFileSync(exportArtifactPath, "png-bytes", "utf8")
    fs.writeFileSync(path.join(projectPath, "exports", "manifest.json"), `${JSON.stringify({
      schemaVersion: 1,
      packageKind: "rxncanvas-export-artifacts",
      artifacts: [{
        id: "artifact-rxncanvas-profile",
        fileName: "rxncanvas-profile.png",
        path: "exports/rxncanvas-profile.png",
        mimeType: "image/png",
        size: 9,
        checksum: `sha256:${"0".repeat(64)}`,
      }],
    }, null, 2)}\n`, "utf8")
    const changedExport = await runEngineRequest({
      command: "project.open",
      projectPath,
    }, { timeoutMs: 5000 })
    const changedExportCodes = new Set(changedExport.data?.validation?.issues?.map((issue) => issue.code) || [])
    if (!changedExport.ok || !changedExportCodes.has("artifact_checksum_mismatch")) {
      throw new Error(`RxnCanvas export checksum validation smoke failed: ${JSON.stringify(changedExport)}`)
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function badProjectReferenceContent() {
  return JSON.stringify({
    schemaVersion: 2,
    packageKind: "rxncanvas-project",
    project: { id: "bad-project", label: "Bad Project", meta: "open" },
    files: [
      {
        id: "file-1",
        name: "engine.log",
        kind: "Gaussian",
        size: 31,
        status: "parsed",
        preview: "SCF Done: E(RwB97XD) = -100.0",
      },
      {
        id: "file-1",
        name: "duplicate.log",
        kind: "Gaussian",
        size: -1,
        status: "archived",
        preview: "",
      },
    ],
    canvases: [{
      id: "canvas-1",
      label: "画布 1",
      nodes: [
        {
          id: "node-1",
          label: "Broken TS",
          formula: "C2H4",
          kind: "transition",
          method: "wB97X-D",
          solvent: "Toluene",
          energyGas: "bad",
          energySolution: -99.8,
          energyUnit: "eV",
          sourceStatus: "parsed",
          sourceFileId: "missing-file",
          sourceObjectIndex: -1,
          position: { x: 0, y: "bad" },
        },
        {
          id: "node-1",
          label: "Duplicate",
          formula: "C2H4",
          kind: "intermediate",
          method: "wB97X-D",
          solvent: "Toluene",
          energyGas: -100,
          energySolution: -99.8,
          energyUnit: "hartree",
          position: { x: 10, y: 20 },
        },
      ],
      edges: [
        { id: "edge-1", sourceId: "node-1", targetId: "ghost-node", label: "step" },
        { id: "edge-1", sourceId: "", targetId: "node-1", label: "broken" },
        { id: "edge-self", sourceId: "node-1", targetId: "node-1", label: "loop" },
      ],
      barriers: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedNodeIds: ["node-1"],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
    }],
    activeCanvasId: "canvas-1",
    savedAt: "2026-06-14T00:00:00.000Z",
  })
}

function assertProjectReferenceValidation(validation, message) {
  const codes = new Set(validation.data?.issues?.map((issue) => issue.code) || [])
  const expectedCodes = [
    "duplicate_file_id",
    "invalid_file_size",
    "unknown_file_status",
    "duplicate_node_id",
    "invalid_energy_unit",
    "invalid_node_energy",
    "invalid_node_position",
    "node_missing_source_file",
    "invalid_source_object_index",
    "edge_missing_node",
    "duplicate_edge_id",
    "invalid_edge_endpoint",
    "self_edge",
  ]
  if (!validation.ok || validation.data?.valid !== false || !expectedCodes.every((code) => codes.has(code))) {
    throw new Error(`${message}: ${JSON.stringify(validation)}`)
  }
}

main().finally(() => shutdownEngineWorkers()).catch((error) => {
  console.error(error)
  process.exit(1)
})
