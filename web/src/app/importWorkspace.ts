import type { FlowNode, Point, SourceFile } from "../domain/projectPackages"
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
import { sourceFileDisplayGroupKey, sourceFileLooksLikeSolutionLog } from "./fileDisplay"
import { importLayoutFromPoint } from "./importLayout"
import { projectWorkspaceSnapshot, type ProjectWorkspaceSnapshot } from "./projectWorkspace"

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
  const options: StageSourceFilesOptions = { layout }
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

export function buildImportPlan(importedFiles: ImportSourceFile[], layout: ImportPlan["layout"]): ImportPlan {
  const parsedImports = parsedImportFiles(importedFiles)
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
  if (shouldPairParsedGroup(group)) {
    const pairedNode = pairedGasSolutionNode(group, groupIndex, layout)
    return pairedNode ? [pairedNode] : []
  }

  return group.flatMap(({ file, index, parsed }) => {
    const candidates = parsed.candidates ?? []
    if (candidates.length > 1) return []
    if (candidates.length === 1) return [nodeFromCandidate(stagedSourceFile(file, parsed), parsed, candidates[0], index, layout)]
    return [nodeFromParsedFallback(file, parsed, index, layout)]
  })
}

function shouldPairParsedGroup(group: ImportPlan["parsedImports"]): boolean {
  if (group.length < 2) return false
  const stagedFiles = group.map(({ file, parsed }) => stagedSourceFile(file, parsed))
  const hasSolution = stagedFiles.some(sourceFileLooksLikeSolutionLog)
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
  const solutionImport = group.find(({ file, parsed }) => sourceFileLooksLikeSolutionLog(stagedSourceFile(file, parsed)))
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
  if (fileMode === "prepend") return [...importPlan.stagedFiles, ...currentFiles]

  const stagedById = new Map(importPlan.stagedFiles.map((file) => [file.id, file]))
  return currentFiles.map((file) => stagedById.get(file.id) ?? file)
}

export function projectWorkspaceWithImportPlan(
  targetSnapshot: ProjectWorkspaceSnapshot,
  importedFiles: ImportSourceFile[],
  importPlan: ImportPlan,
  autoNodes: FlowNode[],
  options: ProjectWorkspaceImportOptions = {},
): ProjectWorkspaceSnapshot {
  const fileMode = options.fileMode ?? "prepend"
  return projectWorkspaceSnapshot({
    ...targetSnapshot,
    files: sourceFilesWithImportPlan(targetSnapshot.files, importPlan, fileMode),
    nodes: [
      ...targetSnapshot.nodes,
      ...autoNodes,
    ],
    selectedNodeIds: autoNodes[0]?.id ? [autoNodes[0].id] : [],
    selectedEdgeIds: [],
    selectedBarrierIds: [],
    selectedFileId: importedFiles[0]?.id ?? null,
    selectedFileIds: importedFiles[0]?.id ? [importedFiles[0].id] : [],
    lastSelectedFileId: importedFiles[0]?.id ?? null,
    inspectorMode: "inspector",
    viewMode: options.viewMode ?? "canvas",
  })
}

export function projectWorkspaceWithRegisteredImportNodes(
  targetSnapshot: ProjectWorkspaceSnapshot,
  createdNodes: FlowNode[],
): ProjectWorkspaceSnapshot {
  const firstNode = createdNodes[0]
  return projectWorkspaceSnapshot({
    ...targetSnapshot,
    nodes: [
      ...targetSnapshot.nodes,
      ...createdNodes,
    ],
    selectedNodeIds: firstNode?.id ? [firstNode.id] : [],
    selectedEdgeIds: [],
    selectedBarrierIds: [],
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

  const importPlan = buildImportPlan(importedFiles, layout)
  const reviewState = candidateReviewStateFromPlan(importPlan)
  const autoNodes = await automaticImportNodesFromPlan(options.registerImportCandidates, importPlan)
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

export function parsedImportFiles(importedFiles: ImportSourceFile[]): ImportPlan["parsedImports"] {
  return importedFiles.map((file, index) => ({
    file,
    index,
    parsed: file.parse ?? parseSourcePreview({ name: file.name, preview: file.preview }),
  }))
}

export function stagedSourceFile(file: ImportSourceFile, parsed: SourceParseResult): SourceFile {
  return {
    ...file,
    parse: parsed,
    kind: parsed.sourceKind,
    status: parsed.parsed ? "parsed" : "staged",
  }
}
