import type { BrowserProjectRef, BrowserProjectRepository, BrowserStorageObject } from "../repository"
import type { WorkbenchDomainState } from "./workbenchState"

export type ProjectFileKind =
  | "gaussian-log"
  | "orca-output"
  | "maple-output"
  | "xyz"
  | "extxyz"
  | "export-artifact"
  | "unknown"

export type ProjectFileStatus =
  | "stored"
  | "previewed"
  | "registered"
  | "used-in-graph"
  | "exported"
  | "error"

export type ProjectFileEntry = {
  id: string
  projectRef: string
  path: string
  name: string
  sourceName?: string
  kind: ProjectFileKind
  byteSize?: number
  checksum?: string
  status: ProjectFileStatus
  rawResourceId?: string | null
  registeredObjectIds: string[]
  graphNodeIds: string[]
  artifactIds: string[]
  warnings: string[]
}

export async function listProjectFileEntries(
  repository: BrowserProjectRepository,
  activeProject: BrowserProjectRef | undefined,
): Promise<ProjectFileEntry[]> {
  if (!activeProject) return []
  const rawObjects = await repository.listObjects(activeProject.projectRef, "inputs/raw")
  return rawObjects
    .map((object) => rawProjectFileEntry(activeProject.projectRef, object))
    .sort((left, right) => left.path.localeCompare(right.path))
}

export function projectFileEntriesWithWorkbenchProjection(
  entries: ProjectFileEntry[],
  workbench: WorkbenchDomainState,
): ProjectFileEntry[] {
  if (entries.length === 0) return entries

  const entryIdsByObjectId = new Map<string, Set<string>>()
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]))
  const entryByRawResourceId = new Map(entries.flatMap((entry) => (
    entry.rawResourceId ? [[entry.rawResourceId, entry] as const] : []
  )))
  const uniqueEntryBySourceName = uniqueProjectFileEntriesBySourceName(entries)

  for (const batch of workbench.imports) {
    for (const item of batch.items) {
      const entry = entryForImportItem(item, entryByPath, entryByRawResourceId)
      if (!entry) continue
      for (const objectId of item.registered_object_ids) {
        addMapSetValue(entryIdsByObjectId, objectId, entry.id)
      }
    }
  }

  for (const object of workbench.objects) {
    const sourceId = object.source_file_id ?? object.provenance?.source_file_id ?? null
    const entry = sourceId
      ? entryByRawResourceId.get(sourceId) ?? entryForObjectSource(sourceId, object.label, uniqueEntryBySourceName)
      : entryForObjectSource(null, object.label, uniqueEntryBySourceName)
    if (entry) addMapSetValue(entryIdsByObjectId, object.id, entry.id)
  }

  const registeredObjectIdsByEntryId = new Map<string, Set<string>>()
  for (const [objectId, entryIds] of entryIdsByObjectId.entries()) {
    for (const entryId of entryIds) {
      addMapSetValue(registeredObjectIdsByEntryId, entryId, objectId)
    }
  }

  const graphNodeIdsByEntryId = new Map<string, Set<string>>()
  for (const node of workbench.workspace?.graph.nodes ?? []) {
    for (const objectId of node.chemical_object_ids ?? []) {
      const entryIds = entryIdsByObjectId.get(objectId) ?? new Set<string>()
      for (const entryId of entryIds) {
        addMapSetValue(graphNodeIdsByEntryId, entryId, node.id)
      }
    }
  }

  return entries.map((entry) => {
    const registeredObjectIds = sortedSetValues(registeredObjectIdsByEntryId.get(entry.id))
    const graphNodeIds = sortedSetValues(graphNodeIdsByEntryId.get(entry.id))
    if (registeredObjectIds.length === 0 && graphNodeIds.length === 0) return entry
    return {
      ...entry,
      status: graphNodeIds.length > 0 ? "used-in-graph" : "registered",
      registeredObjectIds,
      graphNodeIds,
    }
  })
}

function rawProjectFileEntry(projectRef: string, object: BrowserStorageObject): ProjectFileEntry {
  return {
    id: rawResourceId(object),
    projectRef,
    path: object.path,
    name: baseName(object.path),
    sourceName: rawSourceName(object),
    kind: detectRawProjectFileKind(object.path),
    byteSize: object.bytes.byteLength,
    checksum: object.checksum,
    status: "stored",
    rawResourceId: rawResourceId(object),
    registeredObjectIds: [],
    graphNodeIds: [],
    artifactIds: [],
    warnings: [],
  }
}

function uniqueProjectFileEntriesBySourceName(entries: ProjectFileEntry[]): Map<string, ProjectFileEntry | null> {
  const bySourceName = new Map<string, ProjectFileEntry | null>()
  for (const entry of entries) {
    for (const name of projectFileSourceNameCandidates(entry)) {
      const current = bySourceName.get(name)
      bySourceName.set(name, current === undefined ? entry : null)
    }
  }
  return bySourceName
}

function entryForObjectSource(
  sourceId: string | null,
  label: string | null | undefined,
  uniqueEntryBySourceName: Map<string, ProjectFileEntry | null>,
): ProjectFileEntry | undefined {
  const candidates = [
    ...(sourceId ? rawSourceIdNameCandidates(sourceId) : []),
    ...(label ? [label] : []),
  ]
  for (const candidate of candidates) {
    const entry = uniqueEntryBySourceName.get(candidate)
    if (entry) return entry
  }
  return undefined
}

function projectFileSourceNameCandidates(entry: ProjectFileEntry): string[] {
  return Array.from(new Set([
    entry.sourceName,
    entry.name,
    stripChecksumPrefix(entry.name),
  ].filter((value): value is string => Boolean(value))))
}

function rawSourceIdNameCandidates(sourceId: string): string[] {
  const raw = sourceId.replace(/^raw[-:]/, "")
  const values = [sourceId, raw]
  const extensionMatch = raw.match(/^(.+)-([a-z0-9]+)$/i)
  if (extensionMatch) {
    values.push(`${extensionMatch[1]}.${extensionMatch[2]}`)
  }
  return Array.from(new Set(values))
}

function stripChecksumPrefix(name: string): string {
  return name.replace(/^[a-f0-9]{12}-/i, "")
}

function rawSourceName(object: BrowserStorageObject): string | undefined {
  const sourceName = object.metadata?.source_name
  return typeof sourceName === "string" && sourceName ? sourceName : undefined
}

type ProjectImportItem = WorkbenchDomainState["imports"][number]["items"][number]

function entryForImportItem(
  item: ProjectImportItem,
  entryByPath: Map<string, ProjectFileEntry>,
  entryByRawResourceId: Map<string, ProjectFileEntry>,
): ProjectFileEntry | undefined {
  return entryByPath.get(item.source_path)
    ?? (item.raw_resource?.path ? entryByPath.get(item.raw_resource.path) : undefined)
    ?? (item.raw_resource?.id ? entryByRawResourceId.get(item.raw_resource.id) : undefined)
    ?? (item.preview?.raw_resource_id ? entryByRawResourceId.get(item.preview.raw_resource_id) : undefined)
}

function addMapSetValue(map: Map<string, Set<string>>, key: string, value: string): void {
  const current = map.get(key) ?? new Set<string>()
  current.add(value)
  map.set(key, current)
}

function sortedSetValues(values: Set<string> | undefined): string[] {
  return values ? Array.from(values).sort((left, right) => left.localeCompare(right)) : []
}

function rawResourceId(object: BrowserStorageObject): string {
  const checksum = object.checksum ?? ""
  const sha12 = checksum.replace(/^sha256:/, "").slice(0, 12)
  return sha12 ? `raw-${sha12}` : `raw:${object.path}`
}

function detectRawProjectFileKind(path: string): ProjectFileKind {
  const lower = path.toLowerCase()
  if (lower.endsWith(".extxyz")) return "extxyz"
  if (lower.endsWith(".xyz")) return "xyz"
  if (lower.endsWith(".log")) return "gaussian-log"
  if (lower.endsWith(".out") && lower.includes("orca")) return "orca-output"
  if (lower.endsWith(".out") && lower.includes("maple")) return "maple-output"
  return "unknown"
}

function baseName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path
}
