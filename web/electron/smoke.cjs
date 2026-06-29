const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { getEngineStatus, runEngineRequest } = require("./engine-bridge.cjs")
const {
  exportManifestFile,
  exportProjectWorkspaceArchive,
  materializeImportSourceFile,
  projectManifestFile,
  projectStateFile,
  readProjectContent,
  saveProjectContent,
  saveProjectReportArtifact,
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

async function main() {
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing Electron desktop file: ${file}`)
    }
  }

  await verifyRecentProjectsStore()
  await verifyProjectDirectoryStore()
  await verifyLocalEngineFailureMode()
  await verifyLocalEngineParserCoverage()

  const status = await getEngineStatus({ timeoutMs: 5000 })
  if (!status.ok || status.data?.status !== "ready") {
    throw new Error(`RxnFlow local engine smoke failed: ${JSON.stringify(status)}`)
  }
  for (const capability of ["import.preview", "import.register_selection", "import.register_all", "project.validate", "project.open", "project.save"]) {
    if (!status.data.capabilities?.includes(capability)) {
      throw new Error(`RxnFlow local engine missing ${capability}: ${JSON.stringify(status)}`)
    }
  }

  const previewFile = {
    id: "smoke-log",
    name: "smoke.log",
    preview: "SCF Done: E(RwB97XD) = -100.0",
  }
  const preview = await runEngineRequest({
    command: "import.preview",
    files: [previewFile],
  }, { timeoutMs: 5000 })
  const smokeParse = preview.data?.files?.[0]?.parse
  if (
    !preview.ok
    || smokeParse?.sourceKind !== "Gaussian"
    || smokeParse?.parserId !== "gaussian-log-text-preview"
    || smokeParse?.objectCount !== 1
    || !Array.isArray(smokeParse?.candidates)
    || smokeParse.candidates.length !== 1
  ) {
    throw new Error(`RxnFlow import.preview smoke failed: ${JSON.stringify(preview)}`)
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
    throw new Error(`RxnFlow import.register_selection smoke failed: ${JSON.stringify(registeredSelection)}`)
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
    throw new Error(`RxnFlow import.register_all smoke failed: ${JSON.stringify(registeredAll)}`)
  }
  await verifyEngineProjectCommands()

  console.log("Electron desktop smoke files present")
  console.log("Electron recent projects store ready")
  console.log("Electron project directory store ready")
  console.log("RxnFlow local engine failure path ready")
  console.log("RxnFlow local parser coverage ready")
  console.log("RxnFlow project engine commands ready")
  console.log("RxnFlow import.preview ready")
  console.log("RxnFlow import.register ready")
  console.log(`RxnFlow local engine ready: ${status.data.engineVersion}`)
}

async function verifyLocalEngineFailureMode() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rxnflow-engine-unavailable-"))
  const enginePath = path.join(tempDir, "missing-engine")
  const previousCommand = process.env.RXNFLOW_ENGINE_COMMAND
  try {
    process.env.RXNFLOW_ENGINE_COMMAND = enginePath
    const response = await runEngineRequest({ command: "engine.status" }, { timeoutMs: 1000 })
    if (response.ok || response.error?.code !== "engine_unavailable") {
      throw new Error(`RxnFlow local engine unavailable smoke failed: ${JSON.stringify(response)}`)
    }
  } finally {
    if (previousCommand === undefined) {
      delete process.env.RXNFLOW_ENGINE_COMMAND
    } else {
      process.env.RXNFLOW_ENGINE_COMMAND = previousCommand
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

async function verifyLocalEngineParserCoverage() {
  const sourceFile = {
    id: "local-log",
    name: "local.log",
    preview: "SCF Done: E(RwB97XD) = -100.0",
  }
  const preview = await runEngineRequest({
    command: "import.preview",
    files: [sourceFile],
  }, { timeoutMs: 5000 })
  if (
    !preview.ok
    || preview.data?.files?.[0]?.parse?.sourceKind !== "Gaussian"
    || preview.data.files[0].parse?.parserId !== "gaussian-log-text-preview"
  ) {
    throw new Error(`RxnFlow local import.preview smoke failed: ${JSON.stringify(preview)}`)
  }

  const extxyzPreview = await runEngineRequest({
    command: "import.preview",
    files: [{
      id: "local-extxyz",
      name: "h2.xyz",
      preview: [
        "2",
        'Properties=species:S:1:pos:R:3 energy=-1.5 charge=0 spin_multiplicity=1 label="h2-extxyz"',
        "H 0.0 0.0 0.0",
        "H 0.0 0.0 0.74",
      ].join("\n"),
    }],
  }, { timeoutMs: 5000 })
  const extxyzParse = extxyzPreview.data?.files?.[0]?.parse
  if (
    !extxyzPreview.ok
    || extxyzParse?.sourceKind !== "extxyz"
    || extxyzParse?.parserId !== "xyz-ase-text-preview"
    || extxyzParse?.candidates?.[0]?.charge !== 0
    || extxyzParse?.candidates?.[0]?.spinMultiplicity !== 1
    || Math.abs((extxyzParse?.energyGas ?? 0) - -0.05512398326348249) > 1e-12
    || !extxyzParse?.warnings?.some((warning) => warning.code === "unit_assumed")
  ) {
    throw new Error(`RxnFlow local extxyz import.preview smoke failed: ${JSON.stringify(extxyzPreview)}`)
  }

  const xyzPreview = await runEngineRequest({
    command: "import.preview",
    files: [{
      id: "local-xyz",
      name: "h2.xyz",
      preview: [
        "2",
        "energy=-1.5 eV",
        "H 0.0 0.0 0.0",
        "H 0.0 0.0 0.74",
      ].join("\n"),
    }],
  }, { timeoutMs: 5000 })
  const xyzParse = xyzPreview.data?.files?.[0]?.parse
  if (
    !xyzPreview.ok
    || xyzParse?.sourceKind !== "XYZ"
    || Math.abs((xyzParse?.energyGas ?? 0) - -0.05512398326348249) > 1e-12
    || xyzParse?.warnings?.some((warning) => warning.code === "unit_assumed")
  ) {
    throw new Error(`RxnFlow local XYZ energy-unit smoke failed: ${JSON.stringify(xyzPreview)}`)
  }

  const badXyzPreview = await runEngineRequest({
    command: "import.preview",
    files: [{
      id: "local-bad-xyz",
      name: "xyz-bad-atom-count.xyz",
      preview: [
        "3",
        "bad atom count",
        "H 0.0 0.0 0.0",
      ].join("\n"),
    }],
  }, { timeoutMs: 5000 })
  const badXyzParse = badXyzPreview.data?.files?.[0]?.parse
  if (
    !badXyzPreview.ok
    || badXyzParse?.parsed !== false
    || badXyzParse?.sourceKind !== "XYZ"
    || badXyzParse?.parserId !== "xyz-text-preview"
    || badXyzParse?.warnings?.[0]?.code !== "parse_failed"
  ) {
    throw new Error(`RxnFlow local bad XYZ parse-failed smoke failed: ${JSON.stringify(badXyzPreview)}`)
  }

  const maplePreview = await runEngineRequest({
    command: "import.preview",
    files: [{
      id: "local-maple-xyz",
      name: "path.xyz",
      preview: [
        "2",
        "Image 1 Energy=-10.0",
        "H 0.0 0.0 0.0",
        "H 0.0 0.0 0.7",
        "2",
        "Image 2 Energy=-11.0",
        "H 0.0 0.0 0.0",
        "H 0.0 0.0 0.8",
      ].join("\n"),
    }],
  }, { timeoutMs: 5000 })
  const mapleParse = maplePreview.data?.files?.[0]?.parse
  if (
    !maplePreview.ok
    || mapleParse?.sourceKind !== "MAPLE"
    || mapleParse?.candidates?.[0]?.label !== "Image 1"
    || mapleParse?.candidates?.[1]?.label !== "Image 2"
    || mapleParse?.warnings?.some((warning) => warning.code === "unit_assumed")
  ) {
    throw new Error(`RxnFlow local MAPLE trajectory label smoke failed: ${JSON.stringify(maplePreview)}`)
  }

  const orcaPreview = await runEngineRequest({
    command: "import.preview",
    files: [{
      id: "local-orca",
      name: "water.out",
      preview: [
        "! B3LYP def2-SVP Opt",
        "* xyz 0 1",
        "O 0.0 0.0 0.0",
        "H 0.0 0.0 0.96",
        "H 0.92 0.0 -0.24",
        "*",
        "CARTESIAN COORDINATES (ANGSTROEM)",
        "---------------------------------",
        "O      0.000000    0.000000    0.000000",
        "H      0.000000    0.000000    0.960000",
        "H      0.920000    0.000000   -0.240000",
        "---------------------------------",
        "Total Charge           Charge          ....    0",
        "Multiplicity           Mult            ....    1",
        "TOTAL SCF ENERGY",
        "Total Energy       :          -76.34567890 Eh           -2077.47334 eV",
      ].join("\n"),
    }],
  }, { timeoutMs: 5000 })
  const orcaParse = orcaPreview.data?.files?.[0]?.parse
  if (
    !orcaPreview.ok
    || orcaParse?.sourceKind !== "ORCA"
    || orcaParse?.formula !== "H2O"
    || Math.abs((orcaParse?.energyGas ?? 0) - -76.34567890) > 1e-12
    || orcaParse?.coordinatePreview?.atomCount !== 3
    || orcaParse?.coordinatePreview?.atoms?.[0]?.element !== "O"
    || Math.abs((orcaParse?.coordinatePreview?.atoms?.[1]?.z ?? 0) - 0.96) > 1e-12
    || orcaParse?.candidates?.[0]?.charge !== 0
    || orcaParse?.candidates?.[0]?.spinMultiplicity !== 1
  ) {
    throw new Error(`RxnFlow local ORCA geometry smoke failed: ${JSON.stringify(orcaPreview)}`)
  }

  const irPreview = await runEngineRequest({
    command: "import.preview",
    files: [{
      id: "local-ir",
      name: "ir-complex.log",
      preview: [
        "Stoichiometry C2H6IrN",
        "Input orientation:",
        "---------------------------------------------------------------------",
        "Center     Atomic      Atomic             Coordinates (Angstroms)",
        "Number     Number       Type             X           Y           Z",
        "---------------------------------------------------------------------",
        "     1         77           0        0.000000    0.000000    0.000000",
        "     2          6           0        1.900000    0.000000    0.000000",
        "     3          7           0       -1.800000    0.000000    0.000000",
        "---------------------------------------------------------------------",
        "SCF Done: E(RwB97XD) = -4749.26415609 A.U.",
      ].join("\n"),
    }],
  }, { timeoutMs: 5000 })
  const irParse = irPreview.data?.files?.[0]?.parse
  if (
    !irPreview.ok
    || irParse?.coordinatePreview?.elements?.join("|") !== "C|Ir|N"
    || irParse?.coordinatePreview?.atoms?.[0]?.element !== "Ir"
  ) {
    throw new Error(`RxnFlow local Gaussian Ir coordinate smoke failed: ${JSON.stringify(irPreview)}`)
  }

  const registered = await runEngineRequest({
    command: "import.register_all",
    files: [{
      ...sourceFile,
      parse: preview.data.files[0].parse,
    }],
  }, { timeoutMs: 5000 })
  if (
    !registered.ok
    || registered.data?.registeredObjects?.length !== 1
    || registered.data.registeredObjects[0]?.parserId !== "gaussian-log-text-preview"
  ) {
    throw new Error(`RxnFlow local import.register_all smoke failed: ${JSON.stringify(registered)}`)
  }

  const invalidProject = await runEngineRequest({
    command: "project.validate",
    content: badProjectReferenceContent(),
  }, { timeoutMs: 5000 })
  assertProjectReferenceValidation(invalidProject, "RxnFlow local project reference validation smoke failed")
}

async function verifyRecentProjectsStore() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rxnflow-recent-"))
  try {
    const storePath = path.join(tempDir, "recent-projects.json")
    const firstProject = path.join(tempDir, "alpha-study.rxnflow.json")
    const secondProject = path.join(tempDir, "beta-study.rxnflow.json")
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
    if (recentProjectLabel(path.join(tempDir, "gamma-study.rxnflow")) !== "gamma study") {
      throw new Error("Recent .rxnflow project label failed")
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

async function verifyProjectDirectoryStore() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rxnflow-project-store-"))
  try {
    const rawFilePath = path.join(tempDir, "gaussian.log")
    fs.writeFileSync(rawFilePath, "SCF Done: E(RwB97XD) = -100.0", "utf8")
    const projectPath = path.join(tempDir, "Alpha Study")
    const projectContent = JSON.stringify({
      schemaVersion: 2,
      packageKind: "rxnflow-project",
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

    const legacyJsonPath = path.join(tempDir, "alpha-study.rxnflow.json")
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
      defaultName: "rxnflow-profile.png",
      mimeType: "image/png",
      encoding: "base64",
      content: artifactContent.toString("base64"),
    })
    if (!fs.existsSync(artifactResult.filePath)) {
      throw new Error(`Project artifact was not written: ${JSON.stringify(artifactResult)}`)
    }
    const exportManifest = JSON.parse(fs.readFileSync(path.join(projectPath, exportManifestFile), "utf8"))
    if (exportManifest.artifacts?.[0]?.path !== "exports/rxnflow-profile.png") {
      throw new Error(`Project export manifest was not updated: ${JSON.stringify(exportManifest)}`)
    }

    const archivePath = path.join(tempDir, "alpha-study.rxnflow.zip")
    await exportProjectWorkspaceArchive(projectPath, archivePath)
    const archiveBytes = fs.readFileSync(archivePath)
    for (const entryName of [".rxnflow/project.json", ".rxnflow/manifest.json", "sources/gaussian.log", "exports/manifest.json"]) {
      if (!archiveBytes.includes(Buffer.from(entryName))) {
        throw new Error(`Project archive is missing ${entryName}`)
      }
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

async function verifyEngineProjectCommands() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rxnflow-engine-project-"))
  try {
    const projectPath = path.join(tempDir, "Engine Study")
    const projectContent = JSON.stringify({
      schemaVersion: 2,
      packageKind: "rxnflow-project",
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
      throw new Error(`RxnFlow project.validate smoke failed: ${JSON.stringify(validation)}`)
    }

    const invalidProject = await runEngineRequest({
      command: "project.validate",
      content: badProjectReferenceContent(),
    }, { timeoutMs: 5000 })
    assertProjectReferenceValidation(invalidProject, "RxnFlow project reference validation smoke failed")

    const saved = await runEngineRequest({
      command: "project.save",
      projectPath,
      content: projectContent,
    }, { timeoutMs: 5000 })
    if (!saved.ok || !fs.existsSync(path.join(projectPath, projectStateFile))) {
      throw new Error(`RxnFlow project.save smoke failed: ${JSON.stringify(saved)}`)
    }
    if (saved.data.content.includes("sourcePath")) {
      throw new Error("RxnFlow project.save leaked session sourcePath")
    }
    const savedPackage = JSON.parse(saved.data.content)
    const storedPath = savedPackage.files?.[0]?.storedPath
    if (!storedPath || !savedPackage.files?.[0]?.checksum?.startsWith("sha256:")) {
      throw new Error(`RxnFlow project.save did not persist source checksum: ${saved.data.content}`)
    }
    if (savedPackage.importLedger?.entries?.[0]?.registeredNodeIds?.[0] !== "node-1") {
      throw new Error(`RxnFlow project.save did not persist import ledger: ${saved.data.content}`)
    }

    const opened = await runEngineRequest({
      command: "project.open",
      projectPath,
    }, { timeoutMs: 5000 })
    if (!opened.ok || !opened.data?.validation?.valid || opened.data.validation.summary?.projectId !== "engine-study") {
      throw new Error(`RxnFlow project.open smoke failed: ${JSON.stringify(opened)}`)
    }

    fs.writeFileSync(path.join(projectPath, storedPath), "changed", "utf8")
    const changedSource = await runEngineRequest({
      command: "project.open",
      projectPath,
    }, { timeoutMs: 5000 })
    const changedSourceCodes = new Set(changedSource.data?.validation?.issues?.map((issue) => issue.code) || [])
    if (!changedSource.ok || !changedSourceCodes.has("source_checksum_mismatch")) {
      throw new Error(`RxnFlow source checksum validation smoke failed: ${JSON.stringify(changedSource)}`)
    }

    const exportArtifactPath = path.join(projectPath, "exports", "rxnflow-profile.png")
    fs.writeFileSync(exportArtifactPath, "png-bytes", "utf8")
    fs.writeFileSync(path.join(projectPath, "exports", "manifest.json"), `${JSON.stringify({
      schemaVersion: 1,
      packageKind: "rxnflow-export-artifacts",
      artifacts: [{
        id: "artifact-rxnflow-profile",
        fileName: "rxnflow-profile.png",
        path: "exports/rxnflow-profile.png",
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
      throw new Error(`RxnFlow export checksum validation smoke failed: ${JSON.stringify(changedExport)}`)
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function badProjectReferenceContent() {
  return JSON.stringify({
    schemaVersion: 2,
    packageKind: "rxnflow-project",
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

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
