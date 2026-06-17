import type { FlowNode } from "../domain/projectPackages"
import { nodeFromCandidate, nodeFromRegisteredImportObject } from "./importNodes"
import type {
  CandidateReviewEntry,
  DesktopImportRegistrationPayload,
  ImportNodeLayout,
  ImportPlan,
  RegisterImportCandidates,
} from "./importRegistrationTypes"

export async function desktopRegisteredNodesFromEntries(
  registerImportCandidates: RegisterImportCandidates | undefined,
  entries: CandidateReviewEntry[],
  mode: "selected" | "all",
  layout: ImportNodeLayout,
): Promise<FlowNode[] | null> {
  if (!registerImportCandidates || entries.length === 0) return null
  try {
    const response = await registerImportCandidates({
      mode,
      files: importRegistrationFiles(entries),
      ...(mode === "selected" ? { selections: importRegistrationSelections(entries) } : {}),
    })
    const registeredObjects = response.ok ? response.data?.registeredObjects : null
    if (!Array.isArray(registeredObjects) || registeredObjects.length === 0) return null
    return registeredObjects.map((registeredObject, index) =>
      nodeFromRegisteredImportObject(registeredObject, index, layout),
    )
  } catch {
    return null
  }
}

export async function automaticImportNodesFromPlan(
  registerImportCandidates: RegisterImportCandidates | undefined,
  importPlan: ImportPlan,
): Promise<FlowNode[]> {
  const desktopNodes = await desktopRegisteredNodesFromEntries(
    registerImportCandidates,
    importPlan.autoEntries,
    "selected",
    importPlan.layout,
  )
  return desktopNodes ?? importPlan.fallbackNodes
}

export async function registeredOrFallbackNodesFromEntries(
  registerImportCandidates: RegisterImportCandidates | undefined,
  entries: CandidateReviewEntry[],
  mode: "selected" | "all",
  layout: ImportNodeLayout,
): Promise<FlowNode[]> {
  const desktopNodes = await desktopRegisteredNodesFromEntries(registerImportCandidates, entries, mode, layout)
  return desktopNodes ?? entries.map((entry, index) =>
    nodeFromCandidate(entry.file, entry.parsed, entry.candidate, index, layout),
  )
}

export function importRegistrationFiles(entries: CandidateReviewEntry[]): DesktopImportRegistrationPayload["files"] {
  const files = new Map<string, DesktopImportRegistrationPayload["files"][number]>()
  entries.forEach((entry) => {
    if (files.has(entry.file.id)) return
    files.set(entry.file.id, {
      id: entry.file.id,
      name: entry.file.name,
      size: entry.file.size,
      preview: entry.file.preview,
      sourcePath: entry.file.sourcePath,
      storedPath: entry.file.storedPath,
      checksum: entry.file.checksum,
      parse: entry.parsed,
    })
  })
  return Array.from(files.values())
}

export function importRegistrationSelections(entries: CandidateReviewEntry[]): NonNullable<DesktopImportRegistrationPayload["selections"]> {
  const selections = new Map<string, number[]>()
  entries.forEach((entry) => {
    selections.set(entry.file.id, [
      ...(selections.get(entry.file.id) ?? []),
      entry.candidate.objectIndex,
    ])
  })
  return Array.from(selections.entries()).map(([fileId, objectIndices]) => ({
    fileId,
    objectIndices,
  }))
}
