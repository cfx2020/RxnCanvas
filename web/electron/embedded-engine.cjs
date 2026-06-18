const crypto = require("node:crypto")
const fs = require("node:fs/promises")
const path = require("node:path")
const {
  readProjectContent,
  saveProjectContent,
} = require("./project-store.cjs")

const engineVersion = "rxnflow-embedded-engine-v1"
const projectPackageKind = "rxnflow-project"
const projectDirectoryExtension = ".rxnflow"
const projectMetadataDirectory = ".rxnflow"
const legacyProjectStateFile = "project.json"
const projectStateFile = path.join(projectMetadataDirectory, "project.json")
const exportManifestPath = path.join("exports", "manifest.json")
const parserVersion = "0.2.1"
const evToHartree = 0.03674932217565499
const oneMStandardStateCorrectionHartree = 0.003019
const numberPattern = "[-+]?\\d+(?:\\.\\d+)?(?:[EeDd][-+]?\\d+)?"

const gaussianScfPattern = new RegExp(`SCF Done:\\s+E\\(([^)]+)\\)\\s+=\\s+(${numberPattern})`, "i")
const gaussianGibbsCorrectionPattern = new RegExp(`Thermal correction to Gibbs Free Energy\\s+=\\s+(${numberPattern})`, "i")
const gaussianFreeEnergyPattern = new RegExp(`Sum of electronic and thermal Free Energies=\\s*(${numberPattern})`, "i")
const gaussianBasisFunctionPattern = /\bNBasis=\s*(\d+)/i
const gaussianRoutePattern = /^\s*#\s*[PpNnTt]?\s+(.+)$/m
const gaussianChargeMultiplicityPattern = /Charge\s*=\s*([-+]?\d+)\s+Multiplicity\s*=\s*(\d+)/g
const orcaEnergyPattern = new RegExp(`FINAL SINGLE POINT ENERGY\\s+(${numberPattern})`, "i")
const orcaTotalEnergyPattern = new RegExp(`Total Energy\\s*:\\s*(${numberPattern})(?:\\s*Eh)?`, "i")
const orcaSolvationPattern = new RegExp(`(?:CPCM|SMD|PCM)\\s+SOLVATION ENERGY\\s+=\\s+(${numberPattern})`, "i")
const orcaBasisFunctionPattern = /(?:Number of basis functions|#\s*of\s*contracted\s*basis\s*functions)\s*(?:[:=]|\.\.\.)?\s*(\d+)/i
const orcaRoutePattern = /^\s*!\s+(.+)$/m
const orcaChargePattern = /Total Charge\s+Charge\s+(?:\.+\s*)?([-+]?\d+)/i
const orcaMultiplicityPattern = /Multiplicity\s+Mult\s+(?:\.+\s*)?(\d+)/i
const orcaXyzDirectivePattern = /^\s*\*\s*xyz(?:file)?\s+([-+]?\d+)\s+(\d+)\b/im
const maplePointPattern = new RegExp(`IRC point\\s+\\d+\\s+energy\\s+(${numberPattern})`, "gi")
const mapleOutputEnergyPattern = new RegExp(`Energy:\\s*(${numberPattern})\\s*(Hartree)?`, "gi")
const mapleTaskPattern = /^\s*Task:\s*(.+?)\s*$/im
const mapleModelPattern = /^\s*model\s*:\s*(.+?)\s*$/im
const mapleCoordinatePattern = new RegExp(`^\\s*\\d+\\s+([A-Z][a-z]?)\\s+(${numberPattern})\\s+(${numberPattern})\\s+(${numberPattern})\\s*$`)
const mapleXyzCommentPattern = /^\s*(?:(?:Iter|Iteration)\s+\d+\s+)?(?:Image|Frame)\s+\d+\s+Energy\s*=|^\s*Iteration\s+\d+\s+Energy\s*=/i
const commentEnergyPattern = new RegExp(`\\b(?:energy|E)\\s*=\\s*(${numberPattern})(?:\\s*(Hartree|Ha|eV))?`, "i")
const xyzFrameLabelPattern = /^\s*((?:(?:Iter|Iteration)\s+\d+\s+)?(?:Image|Frame)\s+\d+|Iteration\s+\d+)\b/i
const formulaPattern = /\b(?:Formula|Stoichiometry)\s*(?:[:=]\s*)?([A-Z][A-Za-z0-9]*)\b/i
const extxyzMetadataPattern = /([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S+)/g
const extxyzNumberPattern = new RegExp(`^${numberPattern}$`)
const checksumPattern = /^sha256:([a-f0-9]{64})$/i
const mapleBannerMarkers = ["M   A   P   L   E", "MAchine-learning Potential for Landscape Exploration"]

const capabilities = [
  "flow.demo",
  "import.full_file",
  "import.preview",
  "import.register_selection",
  "import.register_all",
  "project.validate",
  "project.open",
  "project.save",
]

async function runEmbeddedEngineRequest(request) {
  try {
    switch (request?.command) {
      case "engine.status":
        return ok({
          status: "ready",
          engineVersion,
          runtime: "embedded-node",
          capabilities,
        })
      case "flow.demo": {
        const flow = demoFlow()
        return ok({ flow, json: `${JSON.stringify(flow, null, 2)}\n` })
      }
      case "import.preview":
        if (!Array.isArray(request.files)) return invalidInput("import.preview requires a files array.")
        return ok({ files: await previewSources(request.files) })
      case "import.register_selection":
        if (!Array.isArray(request.files)) return invalidInput("import.register_selection requires a files array.")
        return ok(registerImportCandidates(request.files, request.selections, false))
      case "import.register_all":
        if (!Array.isArray(request.files)) return invalidInput("import.register_all requires a files array.")
        return ok(registerImportCandidates(request.files, null, true))
      case "project.validate":
        if (typeof request.content !== "string") return invalidInput("project.validate requires JSON content.")
        return ok(await validateProjectContent(request.content, request.projectPath))
      case "project.open": {
        if (typeof request.projectPath !== "string" || !request.projectPath) return invalidInput("project.open requires projectPath.")
        const project = await openProject(request.projectPath)
        return ok(project)
      }
      case "project.save": {
        if (typeof request.projectPath !== "string" || !request.projectPath) return invalidInput("project.save requires projectPath.")
        if (typeof request.content !== "string") return invalidInput("project.save requires JSON content.")
        const project = await saveProject(request.projectPath, request.content)
        return ok(project)
      }
      default:
        return {
          ok: false,
          error: {
            code: "unknown_command",
            message: `Unknown engine command: ${request?.command ?? "missing"}`,
          },
        }
    }
  } catch (error) {
    if (error instanceof EmbeddedInputError) return invalidInput(error.message, error.target)
    return {
      ok: false,
      error: {
        code: "embedded_engine_error",
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

function ok(data) {
  return { ok: true, data }
}

function invalidInput(message, target = null) {
  return {
    ok: false,
    error: {
      code: "invalid_input",
      message,
      ...(target ? { target } : {}),
    },
  }
}

class EmbeddedInputError extends Error {
  constructor(message, target = null) {
    super(message)
    this.target = target
  }
}

function demoFlow() {
  return {
    id: "demo-diels-alder",
    title: "Diels-Alder Study",
    nodes: [
      flowNode("butadiene", "1,3-Butadiene", "C4H6", "reactant", -0.88, -1.32, -440, -170),
      flowNode("maleic", "Maleic Anhydride", "C4H2O3", "reactant", -29.11, -30.21, -440, 210),
      flowNode("ts-endo", "TS1 (Endo)", "C10H12", "transition", 18.27, 19.64, 10, -140),
      flowNode("endo", "Endo Adduct", "C10H16", "product", -11.02, -12.41, 520, -60),
    ],
    edges: [
      { id: "edge-1", source_id: "butadiene", target_id: "ts-endo", label: "+ Diene" },
      { id: "edge-2", source_id: "maleic", target_id: "ts-endo", label: "+ Dienophile" },
      { id: "edge-3", source_id: "ts-endo", target_id: "endo", label: "-18.53" },
    ],
  }
}

function flowNode(id, label, formula, kind, gas, solution, x, y) {
  return { id, label, formula, kind, energy: { gas, solution, unit: "kcal/mol" }, x, y }
}

async function previewSources(files) {
  return Promise.all(files.map(async (file) => {
    const name = stringOrDefault(file?.name, "source")
    const sourcePath = optionalString(file?.sourcePath)
    return {
      name,
      parse: await parseSourceFile(name, stringOrDefault(file?.preview, ""), sourcePath),
    }
  }))
}

async function parseSourceFile(name, preview, sourcePath = null) {
  if (!sourcePath) return parseSourcePreview(name, preview, "preview", "low")
  try {
    const fullText = await fs.readFile(sourcePath, "utf8")
    return parseSourcePreview(name, fullText, "full-file", "high")
  } catch (error) {
    const fallback = parseSourcePreview(name, preview, "preview", "low")
    return {
      ...fallback,
      warnings: [
        ...(fallback.warnings ?? []),
        {
          code: "full_file_read_failed",
          message: `Could not read full source file; parser used the preview sample. ${error instanceof Error ? error.message : String(error)}`,
          target: sourcePath,
        },
      ],
    }
  }
}

function registerImportCandidates(files, selections = null, registerAll = false) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new EmbeddedInputError("Import registration requires at least one file.", "files")
  }

  const fileById = new Map(files.map((file) => [sourceFileId(file), file]))
  const work = registerAll
    ? files.map((file) => [sourceFileId(file), null])
    : selectedFileIndices(selections, fileById)
  const registeredObjects = []
  const fileResults = []

  for (const [fileId, objectIndices] of work) {
    const file = fileById.get(fileId)
    const parse = sourceParseResultFromFilePayload(file)
    const candidates = parse.candidates ?? []
    if (candidates.length === 0) {
      throw new EmbeddedInputError("Source preview does not contain registerable candidates.", fileId)
    }
    const selectedCandidates = selectParseCandidates(candidates, objectIndices, fileId)
    const objects = selectedCandidates.map((candidate) => registeredImportObject(file, parse, candidate))
    registeredObjects.push(...objects)
    fileResults.push({
      fileId,
      sourceName: stringOrDefault(file?.name, "source"),
      parserId: parse.parserId,
      parserVersion: parse.parserVersion,
      registeredObjectIds: objects.map((object) => object.id),
      objectIndices: objects.map((object) => object.sourceObjectIndex),
    })
  }

  return { registeredObjects, files: fileResults }
}

function selectedFileIndices(selections, fileById) {
  if (!Array.isArray(selections) || selections.length === 0) {
    throw new EmbeddedInputError("Import registration requires at least one selection.", "selections")
  }
  const seen = new Set()
  return selections.map((selection, index) => {
    if (!selection || typeof selection !== "object") {
      throw new EmbeddedInputError("Import selection must be an object.", `selections[${index}]`)
    }
    const fileId = stringOrDefault(selection.fileId, "")
    if (!fileId) throw new EmbeddedInputError("Import selection requires fileId.", `selections[${index}].fileId`)
    if (!fileById.has(fileId)) throw new EmbeddedInputError(`Import selection fileId '${fileId}' does not match an imported file.`, fileId)
    if (seen.has(fileId)) throw new EmbeddedInputError(`Import selection fileId '${fileId}' is duplicated.`, fileId)
    seen.add(fileId)
    if (!Array.isArray(selection.objectIndices) || selection.objectIndices.length === 0) {
      throw new EmbeddedInputError("Import selection requires at least one object index.", fileId)
    }
    return [fileId, selection.objectIndices.map((objectIndex) => {
      if (!Number.isInteger(objectIndex)) throw new EmbeddedInputError("Import object index must be an integer.", fileId)
      return objectIndex
    })]
  })
}

function selectParseCandidates(candidates, objectIndices, target) {
  if (objectIndices === null) return candidates
  const normalized = []
  for (const index of objectIndices) {
    const resolved = index >= 0 ? index : candidates.length + index
    if (resolved < 0 || resolved >= candidates.length) {
      throw new EmbeddedInputError(`Import object index '${index}' is out of range.`, target)
    }
    if (normalized.includes(resolved)) {
      throw new EmbeddedInputError(`Import object index '${index}' is duplicated.`, target)
    }
    normalized.push(resolved)
  }
  return normalized.map((index) => candidates[index])
}

function sourceParseResultFromFilePayload(file) {
  if (file?.parse && typeof file.parse === "object") return sourceParseResultFromPayload(file.parse, stringOrDefault(file?.name, "source"))
  return parseSourcePreview(stringOrDefault(file?.name, "source"), stringOrDefault(file?.preview, ""))
}

function sourceParseResultFromPayload(payload, sourceName) {
  const label = stringOrDefault(payload.label, basenameWithoutExtension(sourceName))
  const candidates = arrayOrEmpty(payload.candidates).map(parseCandidateFromPayload)
  const energyUnit = energyUnitOrDefault(payload.energyUnit, "kcal/mol")
  const warnings = arrayOrEmpty(payload.warnings).map(parseWarningFromPayload)
  const energyTable = energyTableFromPayload(payload.energyTable)
  if (candidates.length === 0 && payload.parsed) {
    candidates.push(parseCandidate({
      objectIndex: 0,
      label,
      formula: stringOrDefault(payload.formula, "pending"),
      charge: optionalInteger(payload.charge),
      spinMultiplicity: optionalInteger(payload.spinMultiplicity),
      method: stringOrDefault(payload.method, "unassigned"),
      energyGas: optionalNumber(payload.energyGas),
      energySolution: optionalNumber(payload.energySolution),
      energyUnit,
      coordinatePreview: coordinatePreviewFromPayload(payload.coordinatePreview),
      roleHint: stringOrDefault(payload.roleHint, roleHintFromName(sourceName)),
      warnings,
      energyTable,
    }))
  }

  return {
    label,
    sourceKind: stringOrDefault(payload.sourceKind, "Raw"),
    formula: stringOrDefault(payload.formula, candidates[0]?.formula ?? "pending"),
    kind: nodeKindOrDefault(payload.kind, inferNodeKind(sourceName)),
    method: stringOrDefault(payload.method, candidates[0]?.method ?? "unassigned"),
    solvent: stringOrDefault(payload.solvent, "unassigned"),
    energyGas: optionalNumber(payload.energyGas),
    energySolution: optionalNumber(payload.energySolution),
    energyUnit,
    parsed: Boolean(payload.parsed) || candidates.length > 0,
    parserId: optionalString(payload.parserId),
    parserVersion: optionalString(payload.parserVersion),
    objectCount: optionalInteger(payload.objectCount) ?? candidates.length,
    warnings,
    candidates,
    coordinatePreview: coordinatePreviewFromPayload(payload.coordinatePreview),
    energyTable: energyTable ?? candidates[0]?.energyTable ?? null,
    parseScope: parseScopeOrDefault(payload.parseScope, "preview"),
    confidence: parseConfidenceOrDefault(payload.confidence, "low"),
  }
}

function parseCandidateFromPayload(payload) {
  if (!payload || typeof payload !== "object") throw new EmbeddedInputError("Parse candidate must be an object.", "candidate")
  const label = stringOrDefault(payload.label, "Imported object")
  const objectIndex = optionalInteger(payload.objectIndex)
  if (objectIndex === null) throw new EmbeddedInputError("Parse candidate requires objectIndex.", label)
  return parseCandidate({
    objectIndex,
    label,
    formula: stringOrDefault(payload.formula, "pending"),
    charge: optionalInteger(payload.charge),
    spinMultiplicity: optionalInteger(payload.spinMultiplicity),
    method: stringOrDefault(payload.method, "unassigned"),
    energyGas: optionalNumber(payload.energyGas),
    energySolution: optionalNumber(payload.energySolution),
    energyUnit: energyUnitOrDefault(payload.energyUnit, "kcal/mol"),
    coordinatePreview: coordinatePreviewFromPayload(payload.coordinatePreview),
    roleHint: stringOrDefault(payload.roleHint, "unknown"),
    warnings: arrayOrEmpty(payload.warnings).map(parseWarningFromPayload),
    candidateId: stringOrDefault(payload.candidateId, ""),
    energyTable: energyTableFromPayload(payload.energyTable),
  })
}

function registeredImportObject(file, parse, candidate) {
  const fileId = sourceFileId(file)
  return {
    id: `object-${safeIdentifier(fileId)}-${safeIdentifier(candidate.candidateId)}`,
    label: candidate.label,
    formula: candidate.formula,
    kind: nodeKindFromCandidate(candidate, parse.kind),
    method: candidate.method || parse.method,
    solvent: parse.solvent,
    energyGas: candidate.energyGas,
    energySolution: candidate.energySolution,
    energyUnit: candidate.energyUnit,
    sourceStatus: "parsed",
    sourceFileId: fileId,
    sourceFileName: stringOrDefault(file?.name, "source"),
    sourceCandidateId: candidate.candidateId,
    sourceObjectIndex: candidate.objectIndex,
    parserId: parse.parserId,
    parserVersion: parse.parserVersion,
    roleHint: candidate.roleHint,
    charge: candidate.charge,
    spinMultiplicity: candidate.spinMultiplicity,
    coordinatePreview: candidate.coordinatePreview,
    warnings: candidate.warnings,
    energyTable: candidate.energyTable ?? parse.energyTable ?? null,
  }
}

function nodeKindFromCandidate(candidate, fallback) {
  if (candidate.roleHint === "transition") return "transition"
  if (candidate.roleHint === "path-point") return "intermediate"
  if (candidate.roleHint === "final" && fallback === "intermediate") return "product"
  return fallback
}

function parseSourcePreview(name, preview, parseScope = "preview", confidence = "low") {
  const label = basenameWithoutExtension(name)
  const guessedKind = inferNodeKind(name)
  const gaussian = parseGaussian(preview)
  if (gaussian) {
    const atoms = gaussianAtomsFromText(preview)
    const formula = inferFormulaFromText(preview) ?? (atoms.length > 0 ? formulaFromAtoms(atoms) : "pending")
    const [charge, spinMultiplicity] = gaussianChargeMultiplicity(preview)
    const energyTable = gaussianEnergyTable(preview)
    return sourceResultFromCandidates({
      label,
      sourceKind: "Gaussian",
      kind: guessedKind,
      solvent: inferSolvent(preview),
      parserId: parserIdForScope("gaussian-log-text", parseScope),
      candidates: [parseCandidate({
        objectIndex: 0,
        label,
        formula,
        charge,
        spinMultiplicity,
        method: gaussian.method,
        energyGas: gaussian.energyGas,
        energySolution: gaussian.energySolution,
        energyUnit: "hartree",
        coordinatePreview: coordinatePreviewFromAtoms(atoms),
        roleHint: roleHintFromName(name),
        energyTable,
      })],
      energyTable,
      parseScope,
      confidence,
    })
  }

  const orca = parseOrca(preview)
  if (orca) {
    const atoms = orcaAtomsFromText(preview)
    const [charge, spinMultiplicity] = orcaChargeMultiplicity(preview)
    const energyTable = orcaEnergyTable(preview)
    return sourceResultFromCandidates({
      label,
      sourceKind: "ORCA",
      kind: guessedKind,
      solvent: inferSolvent(preview),
      parserId: parserIdForScope("orca-output-text", parseScope),
      candidates: [parseCandidate({
        objectIndex: 0,
        label,
        formula: inferFormulaFromText(preview) ?? (atoms.length > 0 ? formulaFromAtoms(atoms) : "pending"),
        charge,
        spinMultiplicity,
        method: orcaMethodFromText(preview) ?? "ORCA single point",
        energyGas: orca.energyGas,
        energySolution: orca.energySolution,
        energyUnit: "hartree",
        coordinatePreview: coordinatePreviewFromAtoms(atoms),
        roleHint: roleHintFromName(name),
        energyTable,
      })],
      energyTable,
      parseScope,
      confidence,
    })
  }

  const extxyz = parseExtxyzPreview(name, preview)
  if (extxyz) {
    return sourceResultFromCandidates({
      label,
      sourceKind: "extxyz",
      kind: guessedKind,
      solvent: "unassigned",
      parserId: "xyz-ase-text-preview",
      candidates: extxyz.candidates,
      warnings: extxyz.warnings,
      parseScope,
      confidence,
    })
  }

  const maple = parseMaplePreview(name, preview)
  if (maple) {
    return sourceResultFromCandidates({
      label,
      sourceKind: "MAPLE",
      kind: guessedKind,
      solvent: "unassigned",
      parserId: "maple-output-text-preview",
      candidates: maple.candidates,
      warnings: maple.warnings,
      parseScope,
      confidence,
    })
  }

  const xyz = parseXyzPreview(name, preview)
  if (xyz) {
    return sourceResultFromCandidates({
      label,
      sourceKind: "XYZ",
      kind: guessedKind,
      solvent: "unassigned",
      parserId: "xyz-text-preview",
      candidates: xyz.candidates,
      warnings: xyz.warnings,
      parseScope,
      confidence,
    })
  }

  if (looksLikeXyzInput(name, preview)) {
    return failedSourceResult({
      label,
      sourceKind: "XYZ",
      kind: guessedKind,
      parserId: "xyz-text-preview",
      warning: { code: "parse_failed", message: "XYZ atom count does not match the number of coordinate lines.", target: name },
      parseScope,
      confidence,
    })
  }

  return {
    label,
    sourceKind: "Raw",
    formula: "pending",
    kind: guessedKind,
    method: "unparsed source",
    solvent: "unassigned",
    energyGas: null,
    energySolution: null,
    energyUnit: "kcal/mol",
    parsed: false,
    parserId: null,
    parserVersion: null,
    objectCount: 0,
    warnings: [{ code: "unsupported_format", message: `No supported parser recognized this source ${parseScope}.`, target: name }],
    candidates: [],
    coordinatePreview: null,
    energyTable: null,
    parseScope,
    confidence,
  }
}

function failedSourceResult(input) {
  return {
    label: input.label,
    sourceKind: input.sourceKind,
    formula: "pending",
    kind: input.kind,
    method: "unparsed source",
    solvent: "unassigned",
    energyGas: null,
    energySolution: null,
    energyUnit: "kcal/mol",
    parsed: false,
    parserId: input.parserId,
    parserVersion,
    objectCount: 0,
    warnings: [input.warning],
    candidates: [],
    coordinatePreview: null,
    energyTable: null,
    parseScope: input.parseScope ?? "preview",
    confidence: input.confidence ?? "low",
  }
}

function sourceResultFromCandidates(input) {
  const primary = primaryCandidate(input.candidates)
  const parserWarnings = [...(input.warnings ?? [])].sort((left, right) => String(left.code).localeCompare(String(right.code)))
  const warnings = input.candidates.length > 1
    ? [...parserWarnings, { code: "candidate_selection_available", message: `Parser preview produced ${input.candidates.length} candidates.`, target: input.label }]
    : parserWarnings
  return {
    label: primary.label,
    sourceKind: input.sourceKind,
    formula: primary.formula,
    kind: input.kind,
    method: primary.method,
    solvent: input.solvent,
    energyGas: primary.energyGas,
    energySolution: primary.energySolution,
    energyUnit: primary.energyUnit,
    parsed: true,
    parserId: input.parserId,
    parserVersion,
    objectCount: input.candidates.length,
    warnings,
    candidates: input.candidates,
    coordinatePreview: primary.coordinatePreview,
    energyTable: input.energyTable ?? primary.energyTable ?? null,
    parseScope: input.parseScope ?? "preview",
    confidence: input.confidence ?? "low",
  }
}

function primaryCandidate(candidates) {
  return [...candidates].reverse().find((candidate) => candidate.roleHint === "final") ?? candidates[candidates.length - 1]
}

function parseCandidate(input) {
  return {
    ...input,
    candidateId: input.candidateId || `candidate-${input.objectIndex + 1}-${safeIdentifier(input.label)}`,
    warnings: input.warnings ?? [],
  }
}

function parserIdForScope(baseId, parseScope) {
  return `${baseId}-${parseScope === "full-file" ? "full-file" : "preview"}`
}

function parseGaussian(preview) {
  const match = lastMatch(gaussianScfPattern, preview)
  if (!match) return null
  const energyGas = parseNumber(match[2])
  if (energyGas === null) return null
  const freeEnergy = numberFromMatch(lastMatch(gaussianFreeEnergyPattern, preview))
  const correction = numberFromMatch(lastMatch(gaussianGibbsCorrectionPattern, preview))
  return {
    method: gaussianMethodFromText(preview) ?? match[1] ?? "Gaussian",
    energyGas,
    energySolution: freeEnergy ?? (typeof correction === "number" ? energyGas + correction : null),
  }
}

function gaussianEnergyTable(preview) {
  const scfMatch = lastMatch(gaussianScfPattern, preview)
  const egasHartree = scfMatch ? parseNumber(scfMatch[2]) : null
  const freeEnergy = numberFromMatch(lastMatch(gaussianFreeEnergyPattern, preview))
  const correction = numberFromMatch(lastMatch(gaussianGibbsCorrectionPattern, preview))
  const ggasHartree = typeof freeEnergy === "number"
    ? freeEnergy
    : (typeof egasHartree === "number" && typeof correction === "number" ? egasHartree + correction : null)
  const gasBasisFunctions = optionalIntegerFromText(firstGroup(gaussianBasisFunctionPattern, preview))
  const table = {
    egasHartree,
    gasBasisFunctions,
    ggasHartree,
    ggas1mHartree: typeof ggasHartree === "number" ? ggasHartree + oneMStandardStateCorrectionHartree : null,
    ggasShermoHartree: null,
    ggasShermo1mHartree: null,
    esolHartree: null,
    solBasisFunctions: null,
    sgauTran: null,
    swhitTran: null,
    entropyDelta: null,
    entropyCorrectionHartree: null,
    standardStateCorrectionHartree: typeof ggasHartree === "number" ? oneMStandardStateCorrectionHartree : null,
    gsolHartree: null,
  }
  return Object.values(table).some((value) => typeof value === "number" && Number.isFinite(value)) ? table : null
}

function parseOrca(preview) {
  const energyGas = numberFromMatch(lastMatch(orcaEnergyPattern, preview)) ?? numberFromMatch(lastMatch(orcaTotalEnergyPattern, preview))
  if (typeof energyGas !== "number") return null
  const solvation = numberFromMatch(lastMatch(orcaSolvationPattern, preview))
  return {
    energyGas,
    energySolution: typeof solvation === "number" ? energyGas + solvation : null,
  }
}

function orcaEnergyTable(preview) {
  const egasHartree = numberFromMatch(lastMatch(orcaEnergyPattern, preview)) ?? numberFromMatch(lastMatch(orcaTotalEnergyPattern, preview))
  const gasBasisFunctions = optionalIntegerFromText(firstGroup(orcaBasisFunctionPattern, preview))
  const table = {
    egasHartree,
    gasBasisFunctions,
    ggasHartree: null,
    ggas1mHartree: null,
    ggasShermoHartree: null,
    ggasShermo1mHartree: null,
    esolHartree: null,
    solBasisFunctions: null,
    sgauTran: null,
    swhitTran: null,
    entropyDelta: null,
    entropyCorrectionHartree: null,
    standardStateCorrectionHartree: null,
    gsolHartree: null,
  }
  return Object.values(table).some((value) => typeof value === "number" && Number.isFinite(value)) ? table : null
}

function orcaAtomsFromText(preview) {
  const lines = preview.split(/\r?\n/)
  let bestAtoms = []
  lines.forEach((line, index) => {
    if (!/CARTESIAN COORDINATES/i.test(line)) return
    const atoms = orcaCoordinateBlock(lines, index + 1)
    if (atoms.length > 0) bestAtoms = atoms
  })
  return bestAtoms
}

function orcaCoordinateBlock(lines, start) {
  const atoms = []
  for (const line of lines.slice(start)) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (atoms.length > 0) break
      continue
    }
    if (/^-+$/.test(trimmed)) continue
    const parts = trimmed.split(/\s+/)
    const symbol = /^[A-Z][a-z]?$/.test(parts[0])
      ? parts[0]
      : (/^\d+$/.test(parts[0]) && /^[A-Z][a-z]?$/.test(parts[1]) ? parts[1] : null)
    if (!symbol) {
      if (atoms.length > 0) break
      continue
    }
    const coordinates = parts.slice(-3)
    if (coordinates.length < 3 || coordinates.some((value) => parseNumber(value) === null)) {
      if (atoms.length > 0) break
      continue
    }
    atoms.push({ element: symbol, x: parseNumber(coordinates[0]), y: parseNumber(coordinates[1]), z: parseNumber(coordinates[2]) })
  }
  return atoms
}

function orcaChargeMultiplicity(preview) {
  const xyz = preview.match(orcaXyzDirectivePattern)
  if (xyz) return [Number.parseInt(xyz[1], 10), Number.parseInt(xyz[2], 10)]
  return [
    optionalIntegerFromText(preview.match(orcaChargePattern)?.[1]),
    optionalIntegerFromText(preview.match(orcaMultiplicityPattern)?.[1]),
  ]
}

function orcaMethodFromText(preview) {
  const route = preview.match(orcaRoutePattern)?.[1]?.trim()
  return route ? route.split(/\s+/).slice(0, 4).join(" ") : null
}

function parseExtxyzPreview(name, preview) {
  const frames = parseXyzFrames(preview, name)
  if (frames.length === 0 || !frames.some((frame) => looksLikeExtxyzComment(frame.comment))) return null

  const warnings = []
  const candidates = frames.map((frame, index) => {
    const metadata = parseExtxyzMetadata(frame.comment)
    const energy = extxyzEnergyFromMetadata(metadata, name)
    warnings.push(...energy.warnings)
    return parseCandidate({
      objectIndex: index,
      label: extxyzFrameLabel(name, metadata, index, frames.length),
      formula: formulaFromAtoms(frame.atoms),
      charge: optionalIntegerFromText(metadata.charge),
      spinMultiplicity: optionalIntegerFromText(metadata.spin_multiplicity ?? metadata.spin),
      method: "ASE extxyz",
      energyGas: energy.value,
      energySolution: null,
      energyUnit: energy.value === null ? "kcal/mol" : "hartree",
      coordinatePreview: coordinatePreviewFromAtoms(frame.atoms),
      roleHint: frames.length > 1 ? (index === frames.length - 1 ? "final" : "path-point") : roleHintFromName(name),
      warnings: energy.warnings,
    })
  })
  return { candidates, warnings }
}

function parseExtxyzMetadata(comment) {
  const metadata = {}
  for (const match of comment.matchAll(extxyzMetadataPattern)) {
    let value = match[2] ?? ""
    if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === "\"" || value[0] === "'")) {
      value = value.slice(1, -1)
    }
    metadata[match[1] ?? ""] = value
  }
  return metadata
}

function extxyzEnergyFromMetadata(metadata, target) {
  if (metadata.energy === undefined) {
    return {
      value: null,
      warnings: [{ code: "missing_section", message: "extxyz frame does not include energy metadata.", target }],
    }
  }
  const energy = optionalNumberFromText(metadata.energy)
  if (energy === null) {
    return {
      value: null,
      warnings: [{ code: "ambiguous_value", message: "extxyz energy metadata is not numeric.", target }],
    }
  }
  return {
    value: energy * evToHartree,
    warnings: [{ code: "unit_assumed", message: "extxyz energy metadata was treated as eV and converted to hartree.", target }],
  }
}

function extxyzFrameLabel(name, metadata, index, total) {
  const label = metadata.label || (total > 1 ? `${basenameWithoutExtension(name)} frame ${index + 1}` : basenameWithoutExtension(name))
  return label.slice(0, 80)
}

function parseMaplePreview(name, preview) {
  if (looksLikeMapleXyz(preview)) return parseXyzPreview(name, preview, "MAPLE trajectory", "hartree")

  if (mapleBannerMarkers.some((marker) => preview.slice(0, 8000).includes(marker))) {
    const atoms = lastMapleCoordinateBlock(preview)
    if (atoms.length === 0) return null
    const energyGas = lastMapleOutputEnergy(preview)
    const task = firstGroup(mapleTaskPattern, preview)
    const model = firstGroup(mapleModelPattern, preview)
    const warnings = energyGas === null
      ? [{ code: "missing_section", message: "MAPLE output does not contain an electronic energy.", target: name }]
      : []
    return {
      warnings,
      candidates: [parseCandidate({
        objectIndex: 0,
        label: task ? `MAPLE ${task}` : basenameWithoutExtension(name),
        formula: formulaFromAtoms(atoms),
        charge: null,
        spinMultiplicity: null,
        method: [task, model].filter(Boolean).join(" ") || "MAPLE output",
        energyGas,
        energySolution: null,
        energyUnit: energyGas === null ? "kcal/mol" : "hartree",
        coordinatePreview: coordinatePreviewFromAtoms(atoms),
        roleHint: roleHintFromName(name),
        warnings,
      })],
    }
  }

  const matches = Array.from(preview.matchAll(maplePointPattern))
  const last = matches.at(-1)
  if (!last) return null
  const energyGas = parseNumber(last[1])
  if (energyGas === null) return null
  return {
    warnings: [],
    candidates: [parseCandidate({
      objectIndex: 0,
      label: basenameWithoutExtension(name),
      formula: inferFormulaFromText(preview) ?? "pending",
      charge: null,
      spinMultiplicity: null,
      method: "MAPLE IRC",
      energyGas,
      energySolution: null,
      energyUnit: "hartree",
      coordinatePreview: null,
      roleHint: roleHintFromName(name),
    })],
  }
}

function parseXyzPreview(name, preview, method = "XYZ geometry", defaultEnergyUnit = null) {
  const frames = parseXyzFrames(preview, name, defaultEnergyUnit)
  if (frames.length === 0) return null
  const warnings = []
  const candidates = frames.map((frame, index) => {
    const frameWarnings = frame.energyGas === null
      ? [...frame.energyWarnings, { code: "missing_section", message: "XYZ frame does not include an electronic energy.", target: name }]
      : frame.energyWarnings
    warnings.push(...frameWarnings)
    return parseCandidate({
      objectIndex: index,
      label: xyzFrameLabel(name, frame.comment, index, frames.length),
      formula: formulaFromAtoms(frame.atoms),
      charge: null,
      spinMultiplicity: null,
      method,
      energyGas: frame.energyGas,
      energySolution: null,
      energyUnit: frame.energyGas === null ? "kcal/mol" : "hartree",
      coordinatePreview: coordinatePreviewFromAtoms(frame.atoms),
      roleHint: frames.length > 1 ? (index === frames.length - 1 ? "final" : "path-point") : roleHintFromName(name),
      warnings: frameWarnings,
    })
  })
  return { candidates, warnings }
}

function parseXyzFrames(preview, target = "XYZ frame", defaultEnergyUnit = null) {
  const lines = preview.split(/\r?\n/).map((line) => line.trimEnd())
  const frames = []
  let index = 0
  while (index < lines.length) {
    if (!lines[index]?.trim()) {
      index += 1
      continue
    }
    const atomCount = Number.parseInt(lines[index]?.trim() ?? "", 10)
    if (!Number.isInteger(atomCount) || atomCount <= 0) return []
    const commentIndex = index + 1
    const atomLines = lines.slice(commentIndex + 1, commentIndex + 1 + atomCount)
    if (commentIndex >= lines.length || atomLines.length !== atomCount) return []
    const atoms = []
    for (const line of atomLines) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 4 || !/^[A-Z][a-z]?$/.test(parts[0])) return []
      if ([parts[1], parts[2], parts[3]].some((value) => parseNumber(value) === null)) return []
      atoms.push({
        element: parts[0],
        x: parseNumber(parts[1]),
        y: parseNumber(parts[2]),
        z: parseNumber(parts[3]),
      })
    }
    const comment = lines[commentIndex]?.trim() ?? ""
    const energy = xyzEnergyFromComment(comment, target, defaultEnergyUnit)
    frames.push({ atoms, comment, energyGas: energy.value, energyWarnings: energy.warnings })
    index = commentIndex + 1 + atomCount
  }
  return frames
}

function xyzEnergyFromComment(comment, target, defaultEnergyUnit = null) {
  const match = comment.match(commentEnergyPattern)
  if (!match) return { value: null, warnings: [] }
  const value = parseNumber(match[1])
  if (value === null) {
    return {
      value: null,
      warnings: [{ code: "ambiguous_value", message: "XYZ energy comment is not numeric.", target }],
    }
  }
  const unit = String(match[2] ?? defaultEnergyUnit ?? "").toLowerCase()
  if (unit === "hartree" || unit === "ha") return { value, warnings: [] }
  if (unit === "ev") return { value: value * evToHartree, warnings: [] }
  return {
    value,
    warnings: [{ code: "unit_assumed", message: "XYZ energy comment did not include a unit; assumed hartree.", target }],
  }
}

function xyzFrameLabel(name, comment, index, total) {
  const frameLabel = comment.match(xyzFrameLabelPattern)?.[1]?.trim()
  if (frameLabel) return frameLabel.slice(0, 80)
  if (comment && !comment.match(commentEnergyPattern)) return comment.slice(0, 80)
  if (total > 1) return `${basenameWithoutExtension(name)} frame ${index + 1}`
  return basenameWithoutExtension(name)
}

function looksLikeMapleXyz(preview) {
  const lines = preview.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return lines.length >= 2 && /^\d+$/.test(lines[0]) && mapleXyzCommentPattern.test(lines[1])
}

function looksLikeExtxyzComment(comment) {
  return comment.includes("Properties=") || comment.includes("Lattice=")
}

function looksLikeXyzInput(name, preview) {
  if (!String(name).toLowerCase().endsWith(".xyz")) return false
  const firstLine = preview.split(/\r?\n/).find((line) => line.trim())?.trim() ?? ""
  return /^[-+]?\d+$/.test(firstLine)
}

function lastMapleCoordinateBlock(preview) {
  const blocks = []
  let current = []
  for (const line of preview.split(/\r?\n/)) {
    const match = line.match(mapleCoordinatePattern)
    if (!match) {
      if (current.length > 0) {
        blocks.push(current)
        current = []
      }
      continue
    }
    current.push({
      element: match[1],
      x: parseNumber(match[2]),
      y: parseNumber(match[3]),
      z: parseNumber(match[4]),
    })
  }
  if (current.length > 0) blocks.push(current)
  return blocks.at(-1) ?? []
}

function lastMapleOutputEnergy(preview) {
  const last = Array.from(preview.matchAll(mapleOutputEnergyPattern)).at(-1)
  return last ? parseNumber(last[1]) : null
}

function gaussianAtomsFromText(preview) {
  const lines = preview.split(/\r?\n/)
  let bestAtoms = []
  lines.forEach((line, index) => {
    if (!line.includes("Standard orientation:") && !line.includes("Input orientation:")) return
    const atoms = gaussianOrientationBlock(lines, index + 1)
    if (atoms.length > 0) bestAtoms = atoms
  })
  return bestAtoms
}

function gaussianOrientationBlock(lines, start) {
  let dashCount = 0
  const atoms = []
  for (const line of lines.slice(start)) {
    if (/^\s*-+\s*$/.test(line)) {
      dashCount += 1
      if (dashCount >= 3) break
      continue
    }
    if (dashCount < 2) continue
    const parts = line.trim().split(/\s+/)
    if (parts.length < 6) continue
    const atomicNumber = Number.parseInt(parts[1], 10)
    if (!Number.isInteger(atomicNumber)) continue
    if ([parts[3], parts[4], parts[5]].some((value) => parseNumber(value) === null)) continue
    atoms.push({
      element: symbolFromAtomicNumber(atomicNumber),
      x: parseNumber(parts[3]),
      y: parseNumber(parts[4]),
      z: parseNumber(parts[5]),
    })
  }
  return atoms
}

function gaussianChargeMultiplicity(preview) {
  const last = Array.from(preview.matchAll(gaussianChargeMultiplicityPattern)).at(-1)
  return last ? [Number.parseInt(last[1], 10), Number.parseInt(last[2], 10)] : [null, null]
}

function gaussianMethodFromText(preview) {
  const match = preview.match(gaussianRoutePattern)
  if (!match) return null
  return match[1].split(/\s+/).find((token) => token.includes("/"))?.split("/", 1)[0] ?? null
}

async function validateProjectContent(content, projectRoot = null) {
  let projectPackage
  try {
    projectPackage = JSON.parse(content)
  } catch (error) {
    return projectValidationResult(null, [{ severity: "error", code: "invalid_json", message: error.message }])
  }

  if (!projectPackage || typeof projectPackage !== "object" || Array.isArray(projectPackage)) {
    return projectValidationResult(null, [{ severity: "error", code: "invalid_project", message: "Project content must be a JSON object." }])
  }

  const issues = await validateProjectPackage(projectPackage, projectRoot ? path.resolve(projectRoot) : null)
  return projectValidationResult(projectPackage, issues)
}

async function openProject(projectPath) {
  const stats = await fs.stat(projectPath)
  const contentPath = stats.isDirectory() ? await resolveProjectStatePath(projectPath) : projectPath
  const content = await fs.readFile(contentPath, "utf8")
  const projectRoot = projectRootForContent(projectPath, contentPath, stats.isDirectory())
  return {
    projectPath,
    contentPath,
    content,
    validation: await validateProjectContent(content, projectRoot),
  }
}

async function saveProject(projectPath, content) {
  const validation = await validateProjectContent(content)
  if (!validation.valid) return { saved: false, validation }
  const saved = await saveProjectContent(projectPath, content)
  return {
    saved: true,
    projectPath: saved.filePath,
    contentPath: saved.projectDirectory ? path.join(saved.projectDirectory, projectStateFile) : saved.filePath,
    content: saved.content,
    validation: await validateProjectContent(saved.content, saved.projectDirectory),
  }
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
      // Try the legacy project.json location next.
    }
  }
  return candidates[0]
}

function projectRootForContent(requestedPath, contentPath, requestedPathIsDirectory) {
  if (requestedPathIsDirectory) return requestedPath
  if (path.basename(contentPath) === "project.json" && path.basename(path.dirname(contentPath)) === projectMetadataDirectory) {
    return path.dirname(path.dirname(contentPath))
  }
  if (path.basename(contentPath) === legacyProjectStateFile && path.extname(path.dirname(contentPath)) === projectDirectoryExtension) {
    return path.dirname(contentPath)
  }
  return null
}

async function validateProjectPackage(projectPackage, projectRoot) {
  const issues = []
  if (![1, 2].includes(projectPackage.schemaVersion) || projectPackage.packageKind !== projectPackageKind) {
    issues.push({ severity: "error", code: "invalid_envelope", message: "Expected schemaVersion 1 or 2 and packageKind rxnflow-project." })
  }
  const project = projectPackage.project
  if (!project || typeof project !== "object") {
    issues.push({ severity: "error", code: "invalid_project", message: "Project metadata is required." })
  } else if (!project.id || !project.label) {
    issues.push({ severity: "warning", code: "project_metadata_incomplete", message: "Project id or label is missing." })
  }
  const hasCanvasArray = Array.isArray(projectPackage.canvases)
  for (const key of hasCanvasArray ? ["files", "canvases"] : ["files", "nodes", "edges"]) {
    if (!Array.isArray(projectPackage[key])) issues.push({ severity: "error", code: `invalid_${key}`, message: `${key} must be an array.` })
  }
  if (!hasCanvasArray && projectPackage.barriers !== undefined && !Array.isArray(projectPackage.barriers)) {
    issues.push({ severity: "error", code: "invalid_barriers", message: "barriers must be an array when present." })
  }
  if (!hasCanvasArray) {
    const viewport = projectPackage.viewport
    if (!viewport || typeof viewport !== "object" || !isNumber(viewport.x) || !isNumber(viewport.y) || !isNumber(viewport.zoom) || viewport.zoom <= 0) {
      issues.push({ severity: "error", code: "invalid_viewport", message: "viewport must contain finite x, y and positive zoom." })
    }
  } else if (!Array.isArray(projectPackage.canvases) || projectPackage.canvases.length === 0) {
    issues.push({ severity: "error", code: "invalid_canvases", message: "canvases must contain at least one canvas." })
  } else if (typeof projectPackage.activeCanvasId !== "string" || !projectPackage.activeCanvasId) {
    issues.push({ severity: "error", code: "invalid_active_canvas", message: "activeCanvasId is required when canvases are present." })
  }

  const files = Array.isArray(projectPackage.files) ? projectPackage.files : []
  const fileIds = new Set()
  for (const [index, file] of files.entries()) {
    if (!file || typeof file !== "object") {
      issues.push({ severity: "error", code: "invalid_file", message: `files[${index}] must be an object.` })
      continue
    }
    if (typeof file.id !== "string" || !file.id) {
      issues.push({ severity: "error", code: "invalid_file_id", message: `files[${index}].id is required.` })
    } else if (fileIds.has(file.id)) {
      issues.push({ severity: "error", code: "duplicate_file_id", message: `Duplicate file id: ${file.id}.` })
    } else {
      fileIds.add(file.id)
    }
    if (typeof file.name !== "string" || !file.name) {
      issues.push({ severity: "warning", code: "file_metadata_incomplete", message: `files[${index}].name is missing.` })
    }
    if (!["ready", "parsed", "staged"].includes(file.status)) {
      issues.push({ severity: "warning", code: "unknown_file_status", message: `files[${index}].status is not supported.` })
    }
    if (file.size !== undefined && optionalFileSize(file.size) === null) {
      issues.push({ severity: "error", code: "invalid_file_size", message: `files[${index}].size must be a non-negative integer.` })
    }

    const storedPath = file.storedPath
    if (storedPath !== undefined && !isSafeProjectPath(storedPath)) {
      issues.push({ severity: "error", code: "unsafe_stored_path", message: `files[${index}].storedPath must be project-relative.` })
    } else if (storedPath !== undefined && projectRoot) {
      issues.push(...await validateStoredSourceFile(projectRoot, storedPath, file, index))
    }
  }

  const flattened = flattenProjectGraph(projectPackage)
  const nodes = flattened.nodes
  const edges = flattened.edges
  const barriers = flattened.barriers
  const nodeIds = new Set()
  nodes.forEach((node, index) => {
    if (!node || typeof node !== "object") {
      issues.push({ severity: "error", code: "invalid_node", message: `nodes[${index}] must be an object.` })
      return
    }
    if (typeof node.id !== "string" || !node.id) {
      issues.push({ severity: "error", code: "invalid_node_id", message: `nodes[${index}].id is required.` })
    } else if (nodeIds.has(node.id)) {
      issues.push({ severity: "error", code: "duplicate_node_id", message: `Duplicate node id: ${node.id}.` })
    } else {
      nodeIds.add(node.id)
    }
    if (!["reactant", "transition", "intermediate", "product"].includes(node.kind)) {
      issues.push({ severity: "warning", code: "unknown_node_kind", message: `nodes[${index}].kind is not a supported node kind.` })
    }
    if (typeof node.label !== "string" || !node.label) {
      issues.push({ severity: "warning", code: "node_metadata_incomplete", message: `nodes[${index}].label is missing.` })
    }
    if (!["kcal/mol", "hartree"].includes(node.energyUnit)) {
      issues.push({ severity: "error", code: "invalid_energy_unit", message: `nodes[${index}].energyUnit must be kcal/mol or hartree.` })
    }
    for (const field of ["energyGas", "energySolution"]) {
      if (node[field] !== null && node[field] !== undefined && !isNumber(node[field])) {
        issues.push({ severity: "error", code: "invalid_node_energy", message: `nodes[${index}].${field} must be a finite number or null.` })
      }
    }
    if (node.coefficient !== null && node.coefficient !== undefined && (!isNumber(node.coefficient) || node.coefficient === 0)) {
      issues.push({ severity: "error", code: "invalid_node_coefficient", message: `nodes[${index}].coefficient must be a non-zero finite number when present.` })
    }
    if (!node.position || typeof node.position !== "object" || !isNumber(node.position.x) || !isNumber(node.position.y)) {
      issues.push({ severity: "error", code: "invalid_node_position", message: `nodes[${index}].position must contain finite x and y.` })
    }
    if (typeof node.sourceFileId === "string" && node.sourceFileId && !fileIds.has(node.sourceFileId)) {
      issues.push({ severity: "warning", code: "node_missing_source_file", message: `nodes[${index}].sourceFileId references missing file ${node.sourceFileId}.` })
    }
    if (node.sourceObjectIndex !== null && node.sourceObjectIndex !== undefined) {
      const sourceObjectIndex = optionalInteger(node.sourceObjectIndex)
      if (sourceObjectIndex === null || sourceObjectIndex < 0) {
        issues.push({ severity: "error", code: "invalid_source_object_index", message: `nodes[${index}].sourceObjectIndex must be a non-negative integer.` })
      }
    }
  })

  issues.push(...validateImportLedger(projectPackage.importLedger, fileIds, nodeIds, nodes))

  const edgeIds = new Set()
  edges.forEach((edge, index) => {
    if (!edge || typeof edge !== "object") {
      issues.push({ severity: "error", code: "invalid_edge", message: `edges[${index}] must be an object.` })
      return
    }
    if (typeof edge.id !== "string" || !edge.id) {
      issues.push({ severity: "error", code: "invalid_edge_id", message: `edges[${index}].id is required.` })
    } else if (edgeIds.has(edge.id)) {
      issues.push({ severity: "error", code: "duplicate_edge_id", message: `Duplicate edge id: ${edge.id}.` })
    } else {
      edgeIds.add(edge.id)
    }
    for (const field of ["sourceId", "targetId"]) {
      if (typeof edge[field] !== "string" || !edge[field]) {
        issues.push({ severity: "error", code: "invalid_edge_endpoint", message: `edges[${index}].${field} is required.` })
      } else if (!nodeIds.has(edge[field])) {
        issues.push({ severity: "warning", code: "edge_missing_node", message: `edges[${index}].${field} references missing node ${edge[field]}.` })
      }
    }
    if (typeof edge.sourceId === "string" && edge.sourceId && edge.sourceId === edge.targetId) {
      issues.push({ severity: "warning", code: "self_edge", message: `edges[${index}] connects a node to itself.` })
    }
  })

  const barrierIds = new Set()
  barriers.forEach((barrier, index) => {
    if (!barrier || typeof barrier !== "object") {
      issues.push({ severity: "error", code: "invalid_barrier", message: `barriers[${index}] must be an object.` })
      return
    }
    if (typeof barrier.id !== "string" || !barrier.id) {
      issues.push({ severity: "error", code: "invalid_barrier_id", message: `barriers[${index}].id is required.` })
    } else if (barrierIds.has(barrier.id)) {
      issues.push({ severity: "error", code: "duplicate_barrier_id", message: `Duplicate barrier id: ${barrier.id}.` })
    } else {
      barrierIds.add(barrier.id)
    }
    for (const field of ["sourceId", "targetId"]) {
      if (typeof barrier[field] !== "string" || !barrier[field]) {
        issues.push({ severity: "error", code: "invalid_barrier_endpoint", message: `barriers[${index}].${field} is required.` })
      } else if (!nodeIds.has(barrier[field])) {
        issues.push({ severity: "warning", code: "barrier_missing_node", message: `barriers[${index}].${field} references missing node ${barrier[field]}.` })
      }
    }
    if (barrier.label !== undefined && typeof barrier.label !== "string") {
      issues.push({ severity: "error", code: "invalid_barrier_label", message: `barriers[${index}].label must be a string when present.` })
    }
  })

  if (projectRoot) issues.push(...await validateExportManifest(projectRoot))
  return issues
}

function validateImportLedger(ledger, fileIds, nodeIds, nodes) {
  if (ledger === undefined || ledger === null) return []
  if (!ledger || typeof ledger !== "object" || Array.isArray(ledger)) {
    return [{ severity: "error", code: "invalid_import_ledger", message: "importLedger must be an object when present." }]
  }

  const issues = []
  if (ledger.schemaVersion !== 1) {
    issues.push({ severity: "error", code: "invalid_import_ledger_schema", message: "importLedger.schemaVersion must be 1." })
  }
  if (!Array.isArray(ledger.entries)) {
    issues.push({ severity: "error", code: "invalid_import_ledger_entries", message: "importLedger.entries must be an array." })
    return issues
  }

  const entryIds = new Set()
  const coveredNodeIds = new Set()
  ledger.entries.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push({ severity: "error", code: "invalid_import_ledger_entry", message: `importLedger.entries[${index}] must be an object.` })
      return
    }

    if (typeof entry.id !== "string" || !entry.id) {
      issues.push({ severity: "error", code: "invalid_import_ledger_entry_id", message: `importLedger.entries[${index}].id is required.` })
    } else if (entryIds.has(entry.id)) {
      issues.push({ severity: "error", code: "duplicate_import_ledger_entry_id", message: `Duplicate import ledger entry id: ${entry.id}.` })
    } else {
      entryIds.add(entry.id)
    }

    if (typeof entry.fileId !== "string" || !entry.fileId) {
      issues.push({ severity: "error", code: "invalid_import_ledger_file_id", message: `importLedger.entries[${index}].fileId is required.` })
    } else if (!fileIds.has(entry.fileId)) {
      issues.push({ severity: "warning", code: "import_ledger_missing_file", message: `importLedger.entries[${index}].fileId references missing file ${entry.fileId}.` })
    }

    if (!["registered", "staged", "failed"].includes(entry.status)) {
      issues.push({ severity: "error", code: "invalid_import_ledger_status", message: `importLedger.entries[${index}].status is not supported.` })
    }

    if (entry.candidateId !== undefined && entry.candidateId !== null && typeof entry.candidateId !== "string") {
      issues.push({ severity: "error", code: "invalid_import_ledger_candidate_id", message: `importLedger.entries[${index}].candidateId must be a string when present.` })
    }
    if (entry.objectIndex !== undefined && entry.objectIndex !== null) {
      const objectIndex = optionalInteger(entry.objectIndex)
      if (objectIndex === null || objectIndex < 0) {
        issues.push({ severity: "error", code: "invalid_import_ledger_object_index", message: `importLedger.entries[${index}].objectIndex must be a non-negative integer.` })
      }
    }

    if (!Array.isArray(entry.registeredNodeIds)) {
      issues.push({ severity: "error", code: "invalid_import_ledger_node_ids", message: `importLedger.entries[${index}].registeredNodeIds must be an array.` })
      return
    }
    entry.registeredNodeIds.forEach((nodeRef) => {
      if (typeof nodeRef !== "string" || !nodeRef) {
        issues.push({ severity: "error", code: "invalid_import_ledger_node_id", message: `importLedger.entries[${index}].registeredNodeIds contains an invalid node id.` })
      } else if (!nodeIds.has(nodeRef)) {
        issues.push({ severity: "warning", code: "import_ledger_missing_node", message: `importLedger.entries[${index}] references missing node ${nodeRef}.` })
      } else {
        coveredNodeIds.add(nodeRef)
      }
    })

    if (entry.warningCodes !== undefined && entry.warningCodes !== null && !Array.isArray(entry.warningCodes)) {
      issues.push({ severity: "error", code: "invalid_import_ledger_warning_codes", message: `importLedger.entries[${index}].warningCodes must be an array when present.` })
    }
  })

  nodes.forEach((node, index) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return
    if (typeof node.id !== "string" || !nodeIds.has(node.id)) return
    const hasImportProvenance = Boolean(node.sourceCandidateId) || node.sourceObjectIndex !== undefined && node.sourceObjectIndex !== null
    if (hasImportProvenance && !coveredNodeIds.has(node.id)) {
      issues.push({ severity: "warning", code: "node_missing_import_ledger", message: `nodes[${index}] has import provenance but is not referenced by importLedger.` })
    }
  })

  return issues
}

async function validateStoredSourceFile(projectRoot, storedPath, file, index) {
  const fullPath = path.join(projectRoot, storedPath)
  try {
    const stats = await fs.stat(fullPath)
    if (!stats.isFile()) throw new Error("not a file")
    const expectedSize = optionalFileSize(file.size)
    const issues = []
    if (expectedSize !== null && expectedSize !== stats.size) {
      issues.push({ severity: "warning", code: "source_size_mismatch", message: `files[${index}].size is ${expectedSize} but stored source is ${stats.size} bytes.` })
    }
    const expectedChecksum = sha256ChecksumValue(file.checksum)
    if (expectedChecksum && expectedChecksum !== await sha256File(fullPath)) {
      issues.push({ severity: "warning", code: "source_checksum_mismatch", message: `files[${index}].checksum does not match the stored source.` })
    }
    return issues
  } catch {
    return [{ severity: "warning", code: "source_missing", message: `files[${index}].storedPath does not exist in the workspace folder.` }]
  }
}

async function validateExportManifest(projectRoot) {
  const manifestPath = path.join(projectRoot, exportManifestPath)
  let manifest
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
  } catch (error) {
    return [{ severity: "warning", code: "export_manifest_invalid", message: `exports/manifest.json could not be read: ${error.message}` }]
  }
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.artifacts)) {
    return [{ severity: "warning", code: "export_manifest_invalid", message: "exports/manifest.json must contain an artifacts array." }]
  }
  const issues = []
  for (const [index, artifact] of manifest.artifacts.entries()) {
    if (!artifact || typeof artifact !== "object") {
      issues.push({ severity: "warning", code: "export_manifest_invalid", message: `artifacts[${index}] must be an object.` })
      continue
    }
    if (!isSafeProjectPath(artifact.path)) {
      issues.push({ severity: "error", code: "unsafe_artifact_path", message: `artifacts[${index}].path must be project-relative.` })
      continue
    }
    const fullPath = path.join(projectRoot, artifact.path)
    try {
      const stats = await fs.stat(fullPath)
      if (!stats.isFile()) throw new Error("not a file")
      const expectedSize = optionalFileSize(artifact.size)
      if (expectedSize !== null && expectedSize !== stats.size) {
        issues.push({ severity: "warning", code: "artifact_size_mismatch", message: `artifacts[${index}].size is ${expectedSize} but stored artifact is ${stats.size} bytes.` })
      }
      const expectedChecksum = sha256ChecksumValue(artifact.checksum)
      if (expectedChecksum && expectedChecksum !== await sha256File(fullPath)) {
        issues.push({ severity: "warning", code: "artifact_checksum_mismatch", message: `artifacts[${index}].checksum does not match the stored artifact.` })
      }
    } catch {
      issues.push({ severity: "warning", code: "artifact_missing", message: `artifacts[${index}].path does not exist in the workspace folder.` })
    }
  }
  return issues
}

function projectValidationResult(projectPackage, issues) {
  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    summary: projectSummary(projectPackage),
    issues,
  }
}

function projectSummary(projectPackage) {
  if (!projectPackage || typeof projectPackage !== "object") {
    return { projectId: null, projectLabel: null, fileCount: 0, nodeCount: 0, edgeCount: 0, barrierCount: 0, storedSourceCount: 0, importLedgerEntryCount: 0 }
  }
  const project = projectPackage.project && typeof projectPackage.project === "object" ? projectPackage.project : {}
  const files = Array.isArray(projectPackage.files) ? projectPackage.files : []
  const importLedger = projectPackage.importLedger && typeof projectPackage.importLedger === "object" ? projectPackage.importLedger : {}
  const importLedgerEntries = Array.isArray(importLedger.entries) ? importLedger.entries : []
  const flattened = flattenProjectGraph(projectPackage)
  return {
    projectId: project.id ?? null,
    projectLabel: project.label ?? null,
    fileCount: files.length,
    nodeCount: flattened.nodes.length,
    edgeCount: flattened.edges.length,
    barrierCount: flattened.barriers.length,
    storedSourceCount: files.filter((file) => file && typeof file === "object" && file.storedPath).length,
    importLedgerEntryCount: importLedgerEntries.length,
  }
}

function flattenProjectGraph(projectPackage) {
  if (Array.isArray(projectPackage.canvases)) {
    const canvases = projectPackage.canvases.filter((canvas) => canvas && typeof canvas === "object")
    return {
      nodes: canvases.flatMap((canvas) => Array.isArray(canvas.nodes) ? canvas.nodes : []),
      edges: canvases.flatMap((canvas) => Array.isArray(canvas.edges) ? canvas.edges : []),
      barriers: canvases.flatMap((canvas) => Array.isArray(canvas.barriers) ? canvas.barriers : []),
    }
  }
  return {
    nodes: Array.isArray(projectPackage.nodes) ? projectPackage.nodes : [],
    edges: Array.isArray(projectPackage.edges) ? projectPackage.edges : [],
    barriers: Array.isArray(projectPackage.barriers) ? projectPackage.barriers : [],
  }
}

function sourceFileId(file) {
  return stringOrDefault(file?.id, safeIdentifier(stringOrDefault(file?.name, "source")))
}

function coordinatePreviewFromAtoms(atoms) {
  if (atoms.length === 0) return null
  const coordinateAtoms = atoms.every(isCoordinateAtom) ? atoms.map((atom) => ({ ...atom })) : undefined
  return {
    atomCount: atoms.length,
    has3d: Boolean(coordinateAtoms?.length),
    elements: Array.from(new Set(atoms.map(atomElement))).sort(),
    ...(coordinateAtoms ? { atoms: coordinateAtoms } : {}),
    previewKind: "text",
  }
}

function coordinatePreviewFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null
  const atomCount = optionalInteger(payload.atomCount)
  if (atomCount === null) return null
  const atoms = arrayOrEmpty(payload.atoms).map(coordinateAtomFromPayload).filter(Boolean)
  const elements = arrayOrEmpty(payload.elements).filter((value) => typeof value === "string")
  return {
    atomCount,
    has3d: Boolean(payload.has3d) || atoms.length > 0,
    elements: elements.length > 0 ? elements : Array.from(new Set(atoms.map((atom) => atom.element))).sort(),
    ...(atoms.length > 0 ? { atoms } : {}),
    previewKind: stringOrDefault(payload.previewKind, "text"),
  }
}

function coordinateAtomFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null
  if (typeof payload.element !== "string" || !payload.element) return null
  if (!isNumber(payload.x) || !isNumber(payload.y) || !isNumber(payload.z)) return null
  return { element: payload.element, x: payload.x, y: payload.y, z: payload.z }
}

function energyTableFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null
  const table = {
    egasHartree: optionalNumber(payload.egasHartree),
    gasBasisFunctions: optionalInteger(payload.gasBasisFunctions),
    ggasHartree: optionalNumber(payload.ggasHartree),
    ggas1mHartree: optionalNumber(payload.ggas1mHartree),
    ggasShermoHartree: optionalNumber(payload.ggasShermoHartree),
    ggasShermo1mHartree: optionalNumber(payload.ggasShermo1mHartree),
    esolHartree: optionalNumber(payload.esolHartree),
    solBasisFunctions: optionalInteger(payload.solBasisFunctions),
    sgauTran: optionalNumber(payload.sgauTran),
    swhitTran: optionalNumber(payload.swhitTran),
    entropyDelta: optionalNumber(payload.entropyDelta),
    entropyCorrectionHartree: optionalNumber(payload.entropyCorrectionHartree),
    standardStateCorrectionHartree: optionalNumber(payload.standardStateCorrectionHartree),
    gsolHartree: optionalNumber(payload.gsolHartree),
  }
  return Object.values(table).some((value) => typeof value === "number" && Number.isFinite(value)) ? table : null
}

function parseScopeOrDefault(value, fallback) {
  return value === "preview" || value === "full-file" ? value : fallback
}

function parseConfidenceOrDefault(value, fallback) {
  return value === "high" || value === "medium" || value === "low" ? value : fallback
}

function inferNodeKind(name) {
  const lower = name.toLowerCase()
  if (/\b(ts|transition|saddle)\b/.test(lower)) return "transition"
  if (/\b(product|adduct|prod|final)\b/.test(lower)) return "product"
  if (/\b(reactant|reagent|substrate)\b/.test(lower)) return "reactant"
  return "intermediate"
}

function inferSolvent(preview) {
  if (/toluene/i.test(preview)) return "Toluene"
  if (/water|h2o/i.test(preview)) return "Water"
  if (/acetonitrile|meCN/i.test(preview)) return "Acetonitrile"
  if (/(?:SMD|CPCM|PCM)/i.test(preview)) return "implicit solvent"
  return "unassigned"
}

function inferFormulaFromText(preview) {
  return preview.match(formulaPattern)?.[1] ?? null
}

function formulaFromAtoms(atoms) {
  const counts = new Map()
  atoms.forEach((atom) => {
    const element = atomElement(atom)
    counts.set(element, (counts.get(element) ?? 0) + 1)
  })
  const ordered = [
    ...["C", "H"].filter((atom) => counts.has(atom)),
    ...Array.from(counts.keys()).filter((atom) => atom !== "C" && atom !== "H").sort(),
  ]
  return ordered.map((atom) => `${atom}${counts.get(atom) === 1 ? "" : counts.get(atom)}`).join("")
}

function atomElement(atom) {
  return typeof atom === "string" ? atom : atom.element
}

function isCoordinateAtom(atom) {
  return Boolean(atom)
    && typeof atom === "object"
    && typeof atom.element === "string"
    && isNumber(atom.x)
    && isNumber(atom.y)
    && isNumber(atom.z)
}

function roleHintFromName(name) {
  const lower = name.toLowerCase()
  if (/\b(final|product|prod|adduct)\b/.test(lower)) return "final"
  if (/\b(ts|transition|saddle)\b/.test(lower)) return "transition"
  if (/\b(frame|image|irc|path)\b/.test(lower)) return "path-point"
  return "unknown"
}

function firstGroup(pattern, preview) {
  return preview.match(pattern)?.[1]?.trim() ?? null
}

function lastMatch(pattern, preview) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
  const globalPattern = new RegExp(pattern.source, flags)
  let result = null
  for (const match of preview.matchAll(globalPattern)) result = match
  return result
}

function numberFromMatch(match) {
  return match?.[1] ? parseNumber(match[1]) : null
}

function parseNumber(value) {
  const parsed = Number.parseFloat(String(value).replace(/[Dd]/g, "E"))
  return Number.isFinite(parsed) ? parsed : null
}

function optionalNumberFromText(value) {
  if (!value || !extxyzNumberPattern.test(String(value).trim())) return null
  return parseNumber(String(value))
}

function optionalIntegerFromText(value) {
  const parsed = optionalNumberFromText(value)
  return parsed !== null && Number.isInteger(parsed) ? parsed : null
}

function basenameWithoutExtension(name) {
  return String(name).replace(/\.[^.]+$/, "") || String(name)
}

function safeIdentifier(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "source"
}

function symbolFromAtomicNumber(number) {
  return elements[number] ?? `E${number}`
}

function optionalString(value) {
  return typeof value === "string" && value.length > 0 ? value : null
}

function stringOrDefault(value, fallback) {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

function optionalNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function optionalInteger(value) {
  return Number.isInteger(value) ? value : null
}

function optionalFileSize(value) {
  return Number.isInteger(value) && value >= 0 ? value : null
}

function energyUnitOrDefault(value, fallback) {
  return value === "hartree" || value === "kcal/mol" ? value : fallback
}

function nodeKindOrDefault(value, fallback) {
  return ["reactant", "transition", "intermediate", "product"].includes(value) ? value : fallback
}

function parseWarningFromPayload(payload) {
  if (!payload || typeof payload !== "object") return { code: "warning", message: String(payload) }
  return {
    code: stringOrDefault(payload.code, "warning"),
    message: stringOrDefault(payload.message, ""),
    target: optionalString(payload.target),
  }
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : []
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
}

function isSafeProjectPath(projectPath) {
  if (typeof projectPath !== "string" || !projectPath) return false
  if (path.isAbsolute(projectPath)) return false
  return !projectPath.split(/[\\/]+/).includes("..")
}

function sha256ChecksumValue(value) {
  if (typeof value !== "string") return null
  return value.match(checksumPattern)?.[1]?.toLowerCase() ?? null
}

async function sha256File(filePath) {
  const buffer = await fs.readFile(filePath)
  return crypto.createHash("sha256").update(buffer).digest("hex")
}

const elements = [
  "",
  "H",
  "He",
  "Li",
  "Be",
  "B",
  "C",
  "N",
  "O",
  "F",
  "Ne",
  "Na",
  "Mg",
  "Al",
  "Si",
  "P",
  "S",
  "Cl",
  "Ar",
  "K",
  "Ca",
  "Sc",
  "Ti",
  "V",
  "Cr",
  "Mn",
  "Fe",
  "Co",
  "Ni",
  "Cu",
  "Zn",
  "Ga",
  "Ge",
  "As",
  "Se",
  "Br",
  "Kr",
  "Rb",
  "Sr",
  "Y",
  "Zr",
  "Nb",
  "Mo",
  "Tc",
  "Ru",
  "Rh",
  "Pd",
  "Ag",
  "Cd",
  "In",
  "Sn",
  "Sb",
  "Te",
  "I",
  "Xe",
  "Cs",
  "Ba",
  "La",
  "Ce",
  "Pr",
  "Nd",
  "Pm",
  "Sm",
  "Eu",
  "Gd",
  "Tb",
  "Dy",
  "Ho",
  "Er",
  "Tm",
  "Yb",
  "Lu",
  "Hf",
  "Ta",
  "W",
  "Re",
  "Os",
  "Ir",
  "Pt",
  "Au",
  "Hg",
  "Tl",
  "Pb",
  "Bi",
  "Po",
  "At",
  "Rn",
]

module.exports = {
  engineVersion,
  parseSourcePreview,
  registerImportCandidates,
  runEmbeddedEngineRequest,
  validateProjectContent,
}
