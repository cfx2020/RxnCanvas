import { normalizeSourceFileForPersistence, type FlowNode, type Point, type SourceFile } from "../domain/projectPackages"
import { parseSourcePreview, type ParsedEnergyTableData, type SourceParseResult } from "../domain/sourceParsers"
import { candidateReviewEntries, candidateReviewStateFromPlan } from "./candidateReview"
import { automaticImportNodesFromPlan } from "./desktopImportRegistration"
import { nodeFromCandidate, nodeFromParsedFallback } from "./importNodes"
import type {
  CanvasRawFileDropImportTransition,
  CandidateReviewRegistrationApplyTransition,
  DesktopImportFilesTransition,
  ImportPickerTransition,
  ImportPlan,
  ImportSourceFile,
  StageSourceFilesOptions,
  PendingImportProjectTransition,
  PreparedProjectWorkspaceImport,
  PrepareProjectWorkspaceImportOptions,
  ProjectWorkspaceImportApplyTransition,
  ProjectWorkspaceImportOptions,
} from "./importRegistrationTypes"
import { desktopImportSourceFilesFromFiles, sourceFilesFromIds } from "./importSources"
import {
  sourceFileDisplayGroupKey,
  sourceFileLooksLikeParsedSolutionLog,
  sourceFileLooksLikeSolutionLog,
  sourceKindFromName,
} from "./fileDisplay"
import { importLayoutFromPoint } from "./importLayout"
import {
  activeCanvasSnapshot,
  projectWorkspaceSnapshot,
  projectWorkspaceWithActiveCanvas,
  type ProjectWorkspaceSnapshot,
} from "./projectWorkspace"

export function projectWorkspaceImportApplyTransition(
  prepared: PreparedProjectWorkspaceImport,
): ProjectWorkspaceImportApplyTransition {
  return {
    snapshot: prepared.snapshot,
    reviewState: prepared.reviewState,
    shouldPushEditHistory: prepared.autoNodes.length > 0,
    keyboardEdgeSourceId: null,
  }
}

export function pendingImportProjectTransition(
  activeProjectId: string,
  pendingImportProjectId: string | null,
): PendingImportProjectTransition {
  return {
    projectId: pendingImportProjectId ?? activeProjectId,
    pendingImportProjectId: null,
  }
}

export function importPickerTransition(projectId: string, hasDesktopBridge: boolean): ImportPickerTransition {
  return {
    projectId,
    pendingImportProjectId: hasDesktopBridge ? null : projectId,
    shouldImportDesktop: hasDesktopBridge,
    shouldOpenBrowserPicker: !hasDesktopBridge,
  }
}

export function desktopImportFilesTransition(result: { canceled: boolean; files: Parameters<typeof desktopImportSourceFilesFromFiles>[0] } | null | undefined): DesktopImportFilesTransition {
  if (!result || result.canceled) return null
  return { importedFiles: desktopImportSourceFilesFromFiles(result.files) }
}

export function canvasRawFileDropImportTransition(
  drop: { kind: "external-files"; files: File[]; position: Point } | { kind: "project-files"; fileIds: string[]; position: Point },
  files: SourceFile[],
): CanvasRawFileDropImportTransition | null {
  const layout = importLayoutFromPoint(drop.position)
  const options: StageSourceFilesOptions = { layout, autoRegister: true }
  if (drop.kind === "external-files") {
    return {
      kind: "external-files",
      files: drop.files,
      idPrefix: "file-drop",
      layout,
      options,
    }
  }

  const droppedFiles = sourceFilesFromIds(files, drop.fileIds)
  if (droppedFiles.length === 0) return null

  return {
    kind: "project-files",
    files: droppedFiles,
    layout,
    options: { ...options, fileMode: "update" },
  }
}

export function buildImportPlan(
  importedFiles: ImportSourceFile[],
  layout: ImportPlan["layout"],
  options: { parseMode?: "fallback" | "defer" } = {},
): ImportPlan {
  const parsedImports = parsedImportFiles(importedFiles, options.parseMode)
  const stagedFiles = parsedImports.map(({ file, parsed }) => stagedSourceFile(file, parsed))
  const importGroups = parsedImportGroups(parsedImports)
  const autoEntries = importGroups.flatMap((group) => automaticEntriesForParsedGroup(group))
  const fallbackNodes = importGroups.flatMap((group, groupIndex) => fallbackNodesForParsedGroup(group, groupIndex, layout))

  return {
    layout,
    parsedImports,
    stagedFiles,
    autoEntries,
    fallbackNodes,
    reviewEntries: candidateReviewEntries(parsedImports),
  }
}

export function parsedImportGroups(parsedImports: ImportPlan["parsedImports"]): ImportPlan["parsedImports"][] {
  const groupsByKey = new Map<string, ImportPlan["parsedImports"]>()
  const orderedKeys: string[] = []
  for (const item of parsedImports) {
    const key = sourceFileDisplayGroupKey(stagedSourceFile(item.file, item.parsed))
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, [])
      orderedKeys.push(key)
    }
    groupsByKey.get(key)?.push(item)
  }
  return orderedKeys.map((key) => groupsByKey.get(key) ?? []).filter((group) => group.length > 0)
}

function automaticEntriesForParsedGroup(group: ImportPlan["parsedImports"]): ImportPlan["autoEntries"] {
  if (shouldPairParsedGroup(group)) return []
  return group.flatMap(({ file, parsed }) => {
    const candidates = parsed.candidates ?? []
    if (candidates.length > 1) return []
    if (candidates.length === 1) {
      return [{
        file: stagedSourceFile(file, parsed),
        parsed,
        candidate: candidates[0],
      }]
    }
    return []
  })
}

function fallbackNodesForParsedGroup(
  group: ImportPlan["parsedImports"],
  groupIndex: number,
  layout: ImportPlan["layout"],
): FlowNode[] {
  if (group.every(({ parsed }) => parseWasDeferred(parsed))) return []
  if (shouldPairParsedGroup(group)) {
    const pairedNode = pairedGasSolutionNode(group, groupIndex, layout)
    return pairedNode ? [pairedNode] : []
  }

  return group.flatMap(({ file, index, parsed }) => {
    if (!parsed.parsed || parseWasDeferred(parsed)) return []
    const candidates = parsed.candidates ?? []
    if (candidates.length > 1) return []
    if (candidates.length === 1) return [nodeFromCandidate(stagedSourceFile(file, parsed), parsed, candidates[0], index, layout)]
    return [nodeFromParsedFallback(file, parsed, index, layout)]
  })
}

function parseWasDeferred(parsed: SourceParseResult): boolean {
  return parsed.warnings.some((warning) => warning.code === "parse_deferred")
}

function shouldPairParsedGroup(group: ImportPlan["parsedImports"]): boolean {
  if (group.length < 2) return false
  const stagedFiles = group.map(({ file, parsed }) => stagedSourceFile(file, parsed))
  const hasSolution = stagedFiles.some(sourceFileLooksLikeParsedSolutionLog)
  const hasGas = stagedFiles.some((file) => !sourceFileLooksLikeSolutionLog(file))
  const hasReviewCandidates = group.some(({ parsed }) => (parsed.candidates ?? []).length > 1)
  return hasSolution && hasGas && !hasReviewCandidates
}

function pairedGasSolutionNode(
  group: ImportPlan["parsedImports"],
  groupIndex: number,
  layout: ImportPlan["layout"],
): FlowNode | null {
  const gasImport = group.find(({ file, parsed }) => !sourceFileLooksLikeSolutionLog(stagedSourceFile(file, parsed))) ?? group[0]
  const solutionImport = group.find(({ file, parsed }) => sourceFileLooksLikeParsedSolutionLog(stagedSourceFile(file, parsed)))
  const primaryImport = gasImport ?? solutionImport
  if (!primaryImport) return null

  const primaryCandidate = primaryImport.parsed.candidates?.[0]
  const sourceNode = primaryCandidate
    ? nodeFromCandidate(stagedSourceFile(primaryImport.file, primaryImport.parsed), primaryImport.parsed, primaryCandidate, groupIndex, layout)
    : nodeFromParsedFallback(primaryImport.file, primaryImport.parsed, groupIndex, layout)

  const gasEnergy = parsedGasEnergy(gasImport)
  const solutionEnergy = parsedSolutionEnergy(solutionImport)
  const solutionCandidate = solutionImport?.parsed.candidates?.[0]
  const solutionParsed = solutionImport?.parsed

  return {
    ...sourceNode,
    formula: preferText(sourceNode.formula, solutionCandidate?.formula, solutionParsed?.formula, "pending"),
    method: preferText(sourceNode.method, solutionCandidate?.method, solutionParsed?.method, "unassigned"),
    solvent: preferText(solutionParsed?.solvent, sourceNode.solvent, "unassigned"),
    energyGas: gasEnergy,
    energySolution: solutionEnergy,
    energyTable: pairedEnergyTable(gasImport, solutionImport),
    charge: sourceNode.charge ?? solutionCandidate?.charge ?? null,
    spinMultiplicity: sourceNode.spinMultiplicity ?? solutionCandidate?.spinMultiplicity ?? null,
    sourceStatus: group.some(({ parsed }) => parsed.parsed) ? "parsed" : "staged",
  }
}

function pairedEnergyTable(
  gasImport: ImportPlan["parsedImports"][number] | undefined,
  solutionImport: ImportPlan["parsedImports"][number] | undefined,
): ParsedEnergyTableData | undefined {
  const gasTable = parsedEnergyTable(gasImport)
  const solutionTable = parsedEnergyTable(solutionImport)
  const table: ParsedEnergyTableData = {
    ...gasTable,
    esolHartree: finiteEnergy(solutionTable?.esolHartree) ?? finiteEnergy(solutionTable?.egasHartree) ?? finiteEnergy(solutionImport?.parsed.energyGas),
    solBasisFunctions: finiteEnergy(solutionTable?.solBasisFunctions) ?? finiteEnergy(solutionTable?.gasBasisFunctions),
  }
  table.gsolHartree = finiteEnergy(gasTable?.gsolHartree)
    ?? derivedSolutionFreeEnergyHartree(table)
    ?? finiteEnergy(solutionTable?.gsolHartree)
  return Object.values(table).some((value) => typeof value === "number" && Number.isFinite(value)) ? table : undefined
}

function parsedEnergyTable(item: ImportPlan["parsedImports"][number] | undefined): ParsedEnergyTableData | undefined {
  if (!item) return undefined
  return item.parsed.candidates?.[0]?.energyTable ?? item.parsed.energyTable ?? undefined
}

function derivedSolutionFreeEnergyHartree(table: ParsedEnergyTableData): number | null {
  const ggas1m = finiteEnergy(table.ggas1mHartree)
  const egas = finiteEnergy(table.egasHartree)
  const esol = finiteEnergy(table.esolHartree)
  return typeof ggas1m === "number" && typeof egas === "number" && typeof esol === "number"
    ? ggas1m - egas + esol
    : null
}

function parsedGasEnergy(item: ImportPlan["parsedImports"][number] | undefined): number | null {
  if (!item) return null
  const candidate = item.parsed.candidates?.[0]
  return finiteEnergy(candidate?.energyGas) ?? finiteEnergy(item.parsed.energyGas)
}

function parsedSolutionEnergy(item: ImportPlan["parsedImports"][number] | undefined): number | null {
  if (!item) return null
  const candidate = item.parsed.candidates?.[0]
  return finiteEnergy(candidate?.energySolution)
    ?? finiteEnergy(candidate?.energyGas)
    ?? finiteEnergy(item.parsed.energySolution)
    ?? finiteEnergy(item.parsed.energyGas)
}

function finiteEnergy(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function preferText(...values: Array<string | null | undefined>): string {
  return values.find((value) => typeof value === "string" && value.trim().length > 0 && value !== "pending")?.trim() ?? "pending"
}

export function sourceFilesWithImportPlan(
  currentFiles: SourceFile[],
  importPlan: ImportPlan,
  fileMode: "prepend" | "update" = "prepend",
): SourceFile[] {
  const stagedById = new Map(importPlan.stagedFiles.map((file) => [file.id, file]))
  const replacementByKey = new Map(importPlan.stagedFiles.map((file) => [sourceFileReplacementKey(file), file]))
  const stableResolvedReplacementIds = stableResolvedReplacementIdsForImport(currentFiles, importPlan.stagedFiles)
  const withoutStaleReplacedFiles = currentFiles.filter((file) => {
    if (stagedById.has(file.id)) return true
    const stableReplacementId = stableResolvedReplacementIds.get(sourceFileReplacementKey(file))
    if (stableReplacementId && sourceFileIsResolvedImport(file)) return false
    const replacement = replacementByKey.get(sourceFileReplacementKey(file))
    if (!replacement) return true
    return !sourceFileShouldYieldToReplacement(file, replacement)
  })

  if (fileMode === "prepend") {
    return [
      ...importPlan.stagedFiles,
      ...withoutStaleReplacedFiles.filter((file) => !stagedById.has(file.id)),
    ]
  }

  const seen = new Set<string>()
  const updatedFiles = withoutStaleReplacedFiles.map((file) => {
    const staged = stagedById.get(file.id)
    if (staged) seen.add(file.id)
    return staged ?? file
  })
  const resolvedReplacementKeys = new Set(
    updatedFiles
      .filter(sourceFileIsResolvedImport)
      .map(sourceFileReplacementKey),
  )
  const missingStagedFiles = importPlan.stagedFiles.filter((file) => (
    !seen.has(file.id)
    && !sourceFileResolvedReplacementAlreadyExists(file, resolvedReplacementKeys)
  ))
  return [...missingStagedFiles, ...updatedFiles]
}

function sourceFileReplacementKey(file: SourceFile): string {
  const role = sourceFileLooksLikeSolutionLog(file) ? "solution" : "primary"
  return [
    sourceFileDisplayGroupKey(file),
    role,
    file.name.trim().toLowerCase(),
  ].join("\u0000")
}

function sourceFileIsFailedImportPlaceholder(file: SourceFile): boolean {
  if (file.storedPath) return false
  if (file.status !== "staged") return false
  const parse = file.parse
  if (!parse) return true
  if (parse.parsed) return false
  return !parseWasDeferred(parse)
}

function sourceFileShouldYieldToReplacement(file: SourceFile, replacement: SourceFile): boolean {
  if (sourceFileIsFailedImportPlaceholder(file)) return true
  return sourceFileIsPendingImportPlaceholder(file) && sourceFileIsResolvedImport(replacement)
}

function sourceFileIsPendingImportPlaceholder(file: SourceFile): boolean {
  if (file.status !== "staged") return false
  const parse = file.parse
  return Boolean(parse && parseWasDeferred(parse))
}

function sourceFileIsResolvedImport(file: SourceFile): boolean {
  if (sourceFileIsPendingImportPlaceholder(file)) return false
  const parse = file.parse
  if (parse && parseWasDeferred(parse)) return false
  return file.status === "parsed" || Boolean(file.storedPath) || parse?.parsed === true
}

function sourceFileResolvedReplacementAlreadyExists(file: SourceFile, resolvedReplacementKeys: Set<string>): boolean {
  return sourceFileIsResolvedImport(file) && resolvedReplacementKeys.has(sourceFileReplacementKey(file))
}

function stableResolvedReplacementIdsForImport(
  currentFiles: SourceFile[],
  stagedFiles: SourceFile[],
): Map<string, string> {
  const currentIds = new Set(currentFiles.map((file) => file.id))
  const stableIdsByKey = new Map<string, string>()
  for (const file of stagedFiles) {
    if (!currentIds.has(file.id) || !sourceFileIsResolvedImport(file)) continue
    const key = sourceFileReplacementKey(file)
    if (!stableIdsByKey.has(key)) stableIdsByKey.set(key, file.id)
  }
  return stableIdsByKey
}

function sourceFileIdReplacementsForImport(
  currentFiles: SourceFile[],
  stagedFiles: SourceFile[],
): Map<string, string> {
  const stableIdsByKey = stableResolvedReplacementIdsForImport(currentFiles, stagedFiles)
  const replacements = new Map<string, string>()
  for (const file of currentFiles) {
    if (!sourceFileIsResolvedImport(file)) continue
    const stableId = stableIdsByKey.get(sourceFileReplacementKey(file))
    if (stableId && stableId !== file.id) replacements.set(file.id, stableId)
  }
  return replacements
}

export function projectWorkspaceWithImportPlan(
  targetSnapshot: ProjectWorkspaceSnapshot,
  importedFiles: ImportSourceFile[],
  importPlan: ImportPlan,
  autoNodes: FlowNode[],
  options: ProjectWorkspaceImportOptions = {},
): ProjectWorkspaceSnapshot {
  const fileMode = options.fileMode ?? "prepend"
  const activeCanvas = activeCanvasSnapshot(targetSnapshot)
  const nextFiles = sourceFilesWithImportPlan(targetSnapshot.files, importPlan, fileMode)
  const sourceFileIdReplacements = sourceFileIdReplacementsForImport(targetSnapshot.files, importPlan.stagedFiles)
  const remapNodeSourceFile = (node: FlowNode): FlowNode => {
    const sourceFileId = node.sourceFileId ? sourceFileIdReplacements.get(node.sourceFileId) : undefined
    return sourceFileId ? { ...node, sourceFileId } : node
  }
  const replacementSourceFileIds = new Set(importPlan.stagedFiles
    .filter((stagedFile) => targetSnapshot.files.some((currentFile) => (
      currentFile.id !== stagedFile.id
      && sourceFileIsPendingImportPlaceholder(currentFile)
      && sourceFileReplacementKey(currentFile) === sourceFileReplacementKey(stagedFile)
    )))
    .map((file) => file.id))
  const existingNodeSourceFileIds = new Set(activeCanvas.nodes
    .map((node) => node.sourceFileId)
    .filter((sourceFileId): sourceFileId is string => Boolean(sourceFileId)))
  const suppressedAutoNodeSourceFileIds = new Set([...replacementSourceFileIds]
    .filter((sourceFileId) => existingNodeSourceFileIds.has(sourceFileId)))
  const appendedAutoNodes = autoNodes.filter((node) => (
    !node.sourceFileId || !suppressedAutoNodeSourceFileIds.has(node.sourceFileId)
  ))
  const workspaceWithActiveCanvas = projectWorkspaceWithActiveCanvas(targetSnapshot, {
    ...activeCanvas,
    nodes: [
      ...activeCanvas.nodes,
      ...appendedAutoNodes,
    ],
    selectedNodeIds: appendedAutoNodes[0]?.id
      ? [appendedAutoNodes[0].id]
      : suppressedAutoNodeSourceFileIds.size > 0 ? activeCanvas.selectedNodeIds : [],
    selectedEdgeIds: suppressedAutoNodeSourceFileIds.size > 0 ? activeCanvas.selectedEdgeIds : [],
    selectedBarrierIds: suppressedAutoNodeSourceFileIds.size > 0 ? activeCanvas.selectedBarrierIds : [],
    viewport: activeCanvas.viewport,
  })
  const remappedCanvases = workspaceWithActiveCanvas.canvases.map((canvas) => ({
    ...canvas,
    nodes: canvas.nodes.map(remapNodeSourceFile),
  }))
  const remappedActiveCanvas = remappedCanvases.find((canvas) => canvas.id === workspaceWithActiveCanvas.activeCanvasId)
    ?? remappedCanvases[0]
  const workspaceWithRemappedSourceIds = remappedActiveCanvas
    ? projectWorkspaceSnapshot({
        ...workspaceWithActiveCanvas,
        files: nextFiles,
        canvases: remappedCanvases,
        activeCanvasId: remappedActiveCanvas.id,
        nodes: remappedActiveCanvas.nodes,
        edges: remappedActiveCanvas.edges,
        barriers: remappedActiveCanvas.barriers,
        annotations: remappedActiveCanvas.annotations ?? [],
        viewport: remappedActiveCanvas.viewport,
        selectedNodeIds: remappedActiveCanvas.selectedNodeIds,
        selectedEdgeIds: remappedActiveCanvas.selectedEdgeIds,
        selectedBarrierIds: remappedActiveCanvas.selectedBarrierIds,
        selectedFileId: importedFiles[0]?.id ?? null,
        selectedFileIds: importedFiles[0]?.id ? [importedFiles[0].id] : [],
        lastSelectedFileId: importedFiles[0]?.id ?? null,
        inspectorMode: "inspector",
        viewMode: options.viewMode ?? "canvas",
      })
    : projectWorkspaceSnapshot({
        ...workspaceWithActiveCanvas,
        files: nextFiles,
        selectedFileId: importedFiles[0]?.id ?? null,
        selectedFileIds: importedFiles[0]?.id ? [importedFiles[0].id] : [],
        lastSelectedFileId: importedFiles[0]?.id ?? null,
        inspectorMode: "inspector",
        viewMode: options.viewMode ?? "canvas",
      })
  return reconcileProjectWorkspaceSourceNodes(workspaceWithRemappedSourceIds, new Set(importPlan.stagedFiles.map((file) => file.id)))
}

export function reconcileProjectWorkspaceSourceNodes(
  snapshot: ProjectWorkspaceSnapshot,
  refreshedSourceFileIds: ReadonlySet<string> = new Set(),
  refreshPairedGroups = false,
): ProjectWorkspaceSnapshot {
  const reconciledCanvases = snapshot.canvases.map((canvas) => ({
    ...canvas,
    nodes: reconcileNodesWithPairedSourceFiles(canvas.nodes, snapshot.files, refreshedSourceFileIds, refreshPairedGroups),
  }))
  const activeCanvas = reconciledCanvases.find((canvas) => canvas.id === snapshot.activeCanvasId)
    ?? reconciledCanvases[0]
  if (!activeCanvas) return projectWorkspaceSnapshot(snapshot)
  return projectWorkspaceSnapshot({
    ...snapshot,
    canvases: reconciledCanvases,
    nodes: activeCanvas.nodes,
    edges: activeCanvas.edges,
    barriers: activeCanvas.barriers,
    annotations: activeCanvas.annotations ?? [],
    viewport: activeCanvas.viewport,
    selectedNodeIds: activeCanvas.selectedNodeIds,
    selectedEdgeIds: activeCanvas.selectedEdgeIds,
    selectedBarrierIds: activeCanvas.selectedBarrierIds,
  })
}

function reconcileNodesWithPairedSourceFiles(
  nodes: FlowNode[],
  files: SourceFile[],
  refreshedSourceFileIds: ReadonlySet<string>,
  refreshPairedGroups: boolean,
): FlowNode[] {
  const parsedImports = files.flatMap((file, index) => (
    file.parse && (!file.checksum || !file.parseChecksum || file.parseChecksum === file.checksum)
      ? [{ file, index, parsed: file.parse }]
      : []
  ))
  const pairedNodeByGroupKey = new Map<string, FlowNode>()
  for (const [groupIndex, group] of parsedImportGroups(parsedImports).entries()) {
    if (!shouldPairParsedGroup(group)) continue
    const stagedGroupFiles = group.map(({ file, parsed }) => stagedSourceFile(file, parsed))
    const gasFiles = stagedGroupFiles.filter((file) => !sourceFileLooksLikeSolutionLog(file))
    const solutionFiles = stagedGroupFiles.filter(sourceFileLooksLikeParsedSolutionLog)
    if (gasFiles.length !== 1 || solutionFiles.length !== 1) continue
    const pairedNode = pairedGasSolutionNode(group, groupIndex, {
      origin: { x: 0, y: 0 },
      columns: 1,
      idSuffix: "source-refresh",
    })
    const sourceFile = group[0]?.file
    if (pairedNode && sourceFile) pairedNodeByGroupKey.set(sourceFileDisplayGroupKey(sourceFile), pairedNode)
  }

  const fileById = new Map(files.map((file) => [file.id, file]))
  const refreshedGroupKeys = new Set(files
    .filter((file) => refreshedSourceFileIds.has(file.id))
    .map(sourceFileDisplayGroupKey))
  return nodes.map((node) => {
    if (!node.sourceFileId) return node
    const sourceFile = fileById.get(node.sourceFileId)
    if (!sourceFile) return node
    const sourceGroupKey = sourceFileDisplayGroupKey(sourceFile)
    const refreshedNode = refreshedSourceFileIds.has(sourceFile.id) || (refreshPairedGroups && refreshedGroupKeys.has(sourceGroupKey))
      ? nodeWithRefreshedSourceData(node, sourceFile)
      : node
    const pairedNode = pairedNodeByGroupKey.get(sourceGroupKey)
    if (!pairedNode) return refreshedNode
    return {
      ...refreshedNode,
      energyGas: pairedNode.energyGas,
      energySolution: pairedNode.energySolution,
      energyUnit: pairedNode.energyUnit,
      energyTable: pairedNode.energyTable,
      solvent: pairedNode.solvent,
      sourceStatus: pairedNode.sourceStatus,
    }
  })
}

function nodeWithRefreshedSourceData(node: FlowNode, file: SourceFile): FlowNode {
  const parsed = file.parse
  if (!parsed?.parsed || (file.checksum && file.parseChecksum && file.parseChecksum !== file.checksum)) {
    return {
      ...node,
      formula: "pending",
      method: "unassigned",
      solvent: "unassigned",
      energyGas: null,
      energySolution: null,
      energyTable: undefined,
      parserId: parsed?.parserId ?? null,
      parserVersion: parsed?.parserVersion ?? null,
      charge: null,
      spinMultiplicity: null,
      sourceStatus: "staged",
    }
  }
  const candidates = parsed.candidates ?? []
  const candidate = candidates.find((item) => item.candidateId === node.sourceCandidateId)
    ?? candidates.find((item) => item.objectIndex === node.sourceObjectIndex)
    ?? (candidates.length === 1 ? candidates[0] : null)
  if (candidates.length > 1 && !candidate) return node

  return {
    ...node,
    formula: candidate?.formula ?? parsed.formula,
    method: candidate?.method || parsed.method,
    solvent: parsed.solvent,
    energyGas: candidate ? candidate.energyGas : parsed.energyGas,
    energySolution: candidate ? candidate.energySolution : parsed.energySolution,
    energyUnit: candidate?.energyUnit ?? parsed.energyUnit,
    energyTable: candidate?.energyTable ?? parsed.energyTable ?? undefined,
    parserId: parsed.parserId,
    parserVersion: parsed.parserVersion,
    sourceCandidateId: candidate?.candidateId ?? (candidates.length === 0 ? undefined : node.sourceCandidateId),
    sourceObjectIndex: candidate?.objectIndex ?? (candidates.length === 0 ? undefined : node.sourceObjectIndex),
    roleHint: candidate?.roleHint ?? node.roleHint,
    charge: candidate ? candidate.charge : node.charge ?? null,
    spinMultiplicity: candidate ? candidate.spinMultiplicity : node.spinMultiplicity ?? null,
    sourceStatus: "parsed",
  }
}

export function projectWorkspaceWithRegisteredImportNodes(
  targetSnapshot: ProjectWorkspaceSnapshot,
  createdNodes: FlowNode[],
): ProjectWorkspaceSnapshot {
  const firstNode = createdNodes[0]
  const activeCanvas = activeCanvasSnapshot(targetSnapshot)
  return projectWorkspaceSnapshot({
    ...projectWorkspaceWithActiveCanvas(targetSnapshot, {
      ...activeCanvas,
      nodes: [
        ...activeCanvas.nodes,
        ...createdNodes,
      ],
      selectedNodeIds: firstNode?.id ? [firstNode.id] : [],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
    }),
    selectedFileId: firstNode?.sourceFileId ?? null,
    selectedFileIds: firstNode?.sourceFileId ? [firstNode.sourceFileId] : [],
    lastSelectedFileId: firstNode?.sourceFileId ?? null,
    inspectorMode: "inspector",
  })
}

export function candidateReviewRegistrationApplyTransition(
  targetSnapshot: ProjectWorkspaceSnapshot,
  createdNodes: FlowNode[],
): CandidateReviewRegistrationApplyTransition {
  return {
    snapshot: projectWorkspaceWithRegisteredImportNodes(targetSnapshot, createdNodes),
    shouldPushEditHistory: true,
    keyboardEdgeSourceId: null,
    candidateReview: null,
  }
}

export async function prepareProjectWorkspaceImport({
  targetSnapshot,
  importedFiles,
  layout,
  options = {},
}: {
  targetSnapshot: ProjectWorkspaceSnapshot
  importedFiles: ImportSourceFile[]
  layout: ImportPlan["layout"]
  options?: PrepareProjectWorkspaceImportOptions
}): Promise<PreparedProjectWorkspaceImport | null> {
  if (importedFiles.length === 0) return null

  const importPlan = buildImportPlan(importedFiles, layout, { parseMode: options.parseMode })
  const autoRegister = options.autoRegister ?? true
  const reviewState = autoRegister ? candidateReviewStateFromPlan(importPlan) : null
  const autoNodes = autoRegister
    ? await automaticImportNodesFromPlan(options.registerImportCandidates, importPlan)
    : []
  const snapshot = projectWorkspaceWithImportPlan(
    targetSnapshot,
    importedFiles,
    importPlan,
    autoNodes,
    options,
  )

  return {
    importPlan,
    reviewState,
    autoNodes,
    snapshot,
  }
}

export function parsedImportFiles(
  importedFiles: ImportSourceFile[],
  parseMode: "fallback" | "defer" = "fallback",
): ImportPlan["parsedImports"] {
  return importedFiles.map((file, index) => {
    const parsed = file.parse ?? (
      parseMode === "defer"
        ? deferredSourceParseResult(file)
        : parseSourcePreview({ name: file.name, preview: file.preview })
    )
    const stagedFile = stagedSourceFile(file, parsed)
    return {
      file: stagedFile,
      index,
      parsed: stagedFile.parse ?? parsed,
    }
  })
}

export function stagedSourceFile(file: ImportSourceFile, parsed: SourceParseResult): SourceFile {
  return normalizeSourceFileForPersistence({
    ...file,
    parseChecksum: file.parseChecksum ?? (file.checksum && parsed.parsed ? file.checksum : undefined),
    parse: parsed,
    kind: parsed.sourceKind,
    status: parsed.parsed ? "parsed" : "staged",
  })
}

function deferredSourceParseResult(file: ImportSourceFile): SourceParseResult {
  return {
    label: fileLabelFromName(file.name),
    sourceKind: file.kind || sourceKindFromName(file.name),
    formula: "pending",
    kind: "intermediate",
    method: "unassigned",
    solvent: "unassigned",
    energyGas: null,
    energySolution: null,
    energyUnit: "hartree",
    parsed: false,
    parserId: null,
    parserVersion: null,
    objectCount: 0,
    warnings: [{
      code: "parse_deferred",
      message: "Source file is waiting for the desktop parser job.",
      target: file.name,
    }],
    candidates: [],
    coordinatePreview: null,
    parseScope: "preview",
    confidence: "low",
    terminationStatus: "unknown",
    terminationLabel: "unknown",
    jobCpuTime: null,
    elapsedTime: null,
  }
}

function fileLabelFromName(name: string): string {
  return String(name || "source").replace(/\.[^.\\/]+$/, "") || "source"
}
