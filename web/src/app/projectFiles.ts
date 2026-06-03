import type { BrowserProjectRef, BrowserProjectRepository, BrowserStorageObject } from "../repository"

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
  const [rawObjects, exportObjects] = await Promise.all([
    repository.listObjects(activeProject.projectRef, "inputs/raw"),
    repository.listObjects(activeProject.projectRef, "exports"),
  ])
  return [
    ...rawObjects.map((object) => rawProjectFileEntry(activeProject.projectRef, object)),
    ...exportObjects.map((object) => exportProjectFileEntry(activeProject.projectRef, object)),
  ].sort((left, right) => left.path.localeCompare(right.path))
}

function rawProjectFileEntry(projectRef: string, object: BrowserStorageObject): ProjectFileEntry {
  return {
    id: rawResourceId(object),
    projectRef,
    path: object.path,
    name: baseName(object.path),
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

function exportProjectFileEntry(projectRef: string, object: BrowserStorageObject): ProjectFileEntry {
  const artifactId = typeof object.metadata.artifact_id === "string" ? object.metadata.artifact_id : undefined
  return {
    id: artifactId ?? `export:${object.path}`,
    projectRef,
    path: object.path,
    name: baseName(object.path),
    kind: "export-artifact",
    byteSize: object.bytes.byteLength,
    checksum: object.checksum,
    status: "exported",
    rawResourceId: null,
    registeredObjectIds: [],
    graphNodeIds: [],
    artifactIds: artifactId ? [artifactId] : [],
    warnings: [],
  }
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
