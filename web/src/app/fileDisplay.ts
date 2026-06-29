import type { FlowNode, SourceFile } from "../domain/projectPackages"

export const projectFileDragMimeType = "application/x-rxnflow-raw-file"

export type SourceFileGroup = {
  id: string
  files: SourceFile[]
  primaryFile: SourceFile
  displayName: string
  displayKind: string
  hasGasLog: boolean
  hasSolutionLog: boolean
}

export type SourceFileSelectionOptions = {
  additive?: boolean
  range?: boolean
}

export type SourceFileDeletionTransition = {
  files: SourceFile[]
  selectedFileId: string | null
  selectedFileIds: string[]
  lastSelectedFileId: string | null
  inspectorMode: "inspector"
}

export type SourceFileSelectionTransition = {
  selectedFileId: string
  selectedFileIds: string[]
  lastSelectedFileId: string
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  selectedBarrierIds: string[]
  keyboardEdgeSourceId: null
  inspectorMode: "inspector"
}

export type NodeSourceDetailsSelection = {
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  selectedBarrierIds: string[]
  selectedFileId: string
  selectedFileIds: string[]
  lastSelectedFileId: string
  keyboardEdgeSourceId: null
  inspectorMode: "inspector"
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function sourceKindFromName(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith(".log")) return "Gaussian"
  if (lower.endsWith(".out")) return "ORCA"
  if (lower.endsWith(".xyz") || lower.endsWith(".extxyz")) return "XYZ"
  return "Raw"
}

export function displayExportDestination(destination: string): string {
  if (destination === "browser-download") return "browser download"
  const normalized = destination.replace(/\\/g, "/")
  if (normalized.startsWith("exports/")) return normalized
  const parts = normalized.split("/").filter(Boolean)
  if (parts.length <= 2) return normalized
  return `.../${parts.slice(-2).join("/")}`
}

export function projectFileDragPath(file: SourceFile): string {
  return file.storedPath ?? `inputs/raw/${safeRawFileName(file.id)}-${safeRawFileName(file.name)}`
}

export function projectFileIdsFromDataTransfer(dataTransfer: DataTransfer): string[] {
  const value = dataTransfer.getData(projectFileDragMimeType)
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!isObjectRecord(parsed)) return []
    if (parsed.kind === "project-file" && typeof parsed.projectFileId === "string") return [parsed.projectFileId]
    if (parsed.kind === "project-files" && Array.isArray(parsed.files)) {
      return parsed.files
        .map((file) => isObjectRecord(file) && typeof file.projectFileId === "string" ? file.projectFileId : null)
        .filter((fileId): fileId is string => Boolean(fileId))
    }
    return []
  } catch {
    return []
  }
}

export function filesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.files ?? []).filter(
    (file): file is File => isObjectRecord(file) && typeof file.name === "string" && typeof file.size === "number",
  )
}

export function dataTransferTypes(dataTransfer: DataTransfer): string[] {
  return Array.from(dataTransfer.types ?? [])
}

export function dataTransferHasFiles(dataTransfer: DataTransfer): boolean {
  if (filesFromDataTransfer(dataTransfer).length > 0) return true
  if (dataTransferTypes(dataTransfer).includes("Files")) return true
  return Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file")
}

export function sourceFileGroupsForDisplay(files: SourceFile[]): SourceFileGroup[] {
  const groupsByKey = new Map<string, SourceFile[]>()
  const orderedKeys: string[] = []
  for (const file of files) {
    const key = sourceFileDisplayGroupKey(file)
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, [])
      orderedKeys.push(key)
    }
    groupsByKey.get(key)?.push(file)
  }
  return orderedKeys
    .map((key) => sourceFileGroupFromFiles(key, groupsByKey.get(key) ?? []))
    .filter((group): group is SourceFileGroup => Boolean(group))
}

export function selectedFileIdsForAction({
  files,
  currentSelectedFileIds,
  lastSelectedFileId,
  fileId,
  options = {},
}: {
  files: SourceFile[]
  currentSelectedFileIds: string[]
  lastSelectedFileId: string | null
  fileId: string
  options?: SourceFileSelectionOptions
}): string[] {
  if (options.range && lastSelectedFileId) {
    const anchorIndex = files.findIndex((file) => file.id === lastSelectedFileId)
    const targetIndex = files.findIndex((file) => file.id === fileId)
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const start = Math.min(anchorIndex, targetIndex)
      const end = Math.max(anchorIndex, targetIndex)
      return files.slice(start, end + 1).map((file) => file.id)
    }
  }

  if (options.additive) {
    return currentSelectedFileIds.includes(fileId)
      ? currentSelectedFileIds.filter((id) => id !== fileId)
      : [...currentSelectedFileIds, fileId]
  }

  return [fileId]
}

export function selectSourceFileTransition({
  files,
  currentSelectedFileIds,
  lastSelectedFileId,
  fileId,
  options = {},
}: {
  files: SourceFile[]
  currentSelectedFileIds: string[]
  lastSelectedFileId: string | null
  fileId: string
  options?: SourceFileSelectionOptions
}): SourceFileSelectionTransition {
  return {
    selectedFileId: fileId,
    selectedFileIds: selectedFileIdsForAction({
      files,
      currentSelectedFileIds,
      lastSelectedFileId,
      fileId,
      options,
    }),
    lastSelectedFileId: fileId,
    selectedNodeIds: [],
    selectedEdgeIds: [],
    selectedBarrierIds: [],
    keyboardEdgeSourceId: null,
    inspectorMode: "inspector",
  }
}

export function deleteSourceFileTransition({
  files,
  selectedFileId,
  selectedFileIds,
  lastSelectedFileId,
  deletedFileId,
}: {
  files: SourceFile[]
  selectedFileId: string | null
  selectedFileIds: string[]
  lastSelectedFileId: string | null
  deletedFileId: string
}): SourceFileDeletionTransition {
  const nextFiles = files.filter((file) => file.id !== deletedFileId)
  const fallbackFileId = nextFiles[0]?.id ?? null
  const nextSelectedFileIds = selectedFileIds.filter((id) => id !== deletedFileId)
  return {
    files: nextFiles,
    selectedFileId: selectedFileId === deletedFileId ? fallbackFileId : selectedFileId,
    selectedFileIds: nextSelectedFileIds.length > 0 ? nextSelectedFileIds : fallbackFileId ? [fallbackFileId] : [],
    lastSelectedFileId: lastSelectedFileId === deletedFileId ? fallbackFileId : lastSelectedFileId,
    inspectorMode: "inspector",
  }
}

export function nodeSourceDetailsSelection({
  nodes,
  files,
  nodeId,
}: {
  nodes: FlowNode[]
  files: SourceFile[]
  nodeId: string
}): NodeSourceDetailsSelection | null {
  const node = nodes.find((item) => item.id === nodeId)
  const sourceFileId = node?.sourceFileId
  if (!sourceFileId || !files.some((file) => file.id === sourceFileId)) return null

  return {
    selectedNodeIds: [node.id],
    selectedEdgeIds: [],
    selectedBarrierIds: [],
    selectedFileId: sourceFileId,
    selectedFileIds: [sourceFileId],
    lastSelectedFileId: sourceFileId,
    keyboardEdgeSourceId: null,
    inspectorMode: "inspector",
  }
}

export function sourceFileGroupFromFiles(key: string, files: SourceFile[]): SourceFileGroup | null {
  if (files.length === 0) return null
  const sortedFiles = [...files].sort(sourceFileGroupSort)
  const primaryFile = sortedFiles.find((file) => !sourceFileLooksLikeSolutionLog(file)) ?? sortedFiles[0]
  const hasSolutionLog = sortedFiles.some(sourceFileLooksLikeSolutionLog)
  const hasGasLog = sortedFiles.some((file) => isRawLogSourceFile(file) && !sourceFileLooksLikeSolutionLog(file))
  const groupedStructure = hasSolutionLog && sortedFiles.length > 1
  return {
    id: primaryFile.id,
    files: sortedFiles,
    primaryFile,
    displayName: groupedStructure ? sourceFileStructureName(primaryFile, key) : primaryFile.name,
    displayKind: primaryFile.kind,
    hasGasLog,
    hasSolutionLog,
  }
}

export function sourceFileDisplayGroupKey(file: SourceFile): string {
  if (!isRawLogSourceFile(file)) return file.id
  const withoutExtension = stripKnownRawExtension(stripChecksumPrefix(baseName(file.name)))
  const withoutSolutionSuffix = stripSolutionSuffix(withoutExtension)
  return withoutSolutionSuffix.trim().toLowerCase() || file.id
}

export function sourceFileLooksLikeSolutionLog(file: SourceFile): boolean {
  return Boolean(solutionLogSuffixForStem(stripKnownRawExtension(stripChecksumPrefix(baseName(file.name)))))
}

export function sourceFileHasUsableParsedData(file: SourceFile): boolean {
  const parse = file.parse
  if (!parse) return file.status === "parsed"
  if (!parse.parsed) return false
  if ((parse.candidates?.length ?? 0) > 0) return true
  if (typeof parse.energyGas === "number" || typeof parse.energySolution === "number") return true
  if (parse.energyTable && Object.values(parse.energyTable).some((value) => typeof value === "number" && Number.isFinite(value))) return true
  return Boolean(parse.coordinatePreview)
}

export function sourceFileLooksLikeParsedSolutionLog(file: SourceFile): boolean {
  return sourceFileLooksLikeSolutionLog(file) && sourceFileHasUsableParsedData(file)
}

export function safeRawFileName(value: string): string {
  return value
    .trim()
    .replace(/[\\/]/g, "-")
    .replace(/[^A-Za-z0-9._+-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "source"
}

function sourceFileGroupSort(left: SourceFile, right: SourceFile): number {
  const leftSolution = sourceFileLooksLikeSolutionLog(left)
  const rightSolution = sourceFileLooksLikeSolutionLog(right)
  if (leftSolution !== rightSolution) return leftSolution ? 1 : -1
  return left.name.localeCompare(right.name)
}

function sourceFileStructureName(file: SourceFile, key: string): string {
  if (!isRawLogSourceFile(file)) return file.name
  const displayName = stripSolutionSuffix(stripKnownRawExtension(stripChecksumPrefix(baseName(file.name)))).trim()
  return displayName || key || file.name
}

function isRawLogSourceFile(file: SourceFile): boolean {
  return file.kind === "Gaussian"
    || file.kind === "ORCA"
    || file.kind === "MAPLE"
    || /\.(log|out)$/i.test(baseName(file.name))
}

function solutionLogSuffixForStem(stem: string): string | null {
  const lowered = stem.toLowerCase()
  for (const suffix of [
    "-sol",
    "_sol",
    ".sol",
    " sol",
    "-solution",
    "_solution",
    ".solution",
    " solution",
    "-solv",
    "_solv",
    ".solv",
    " solv",
    "-smd",
    "_smd",
    ".smd",
    " smd",
  ]) {
    if (lowered.endsWith(suffix)) return suffix
  }
  return null
}

function stripSolutionSuffix(value: string): string {
  const suffix = solutionLogSuffixForStem(value)
  return suffix ? value.slice(0, -suffix.length) : value
}

function stripKnownRawExtension(value: string): string {
  return value.replace(/\.(log|out|xyz|extxyz)$/i, "")
}

function stripChecksumPrefix(value: string): string {
  return value.replace(/^[a-f0-9]{12}-/i, "")
}

function baseName(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
