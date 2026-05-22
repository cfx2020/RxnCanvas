import {
  BrowserProjectRepositoryError,
  type BrowserProjectRef,
  type BrowserProjectRepository,
  type BrowserStorageObject,
  type BrowserWriteReceipt,
} from "../repository"
import {
  chemicalObjectsPath,
  energyProfilesPath,
  exportArtifactsPath,
  importLedgerPath,
  projectContentIndexPath,
  projectManifestPath,
  reactionGraphsPath,
  workspacesPath,
} from "./projectContentBridge"
import {
  readBrowserProjectBundleArchive,
  type BrowserProjectBundleEntry,
  type BrowserProjectBundleError,
  type BrowserProjectBundleSummary,
} from "./projectBundleArchive"

export const browserProjectBundleImportConflictPolicy = "create_new_project" as const

export type ImportBrowserBundleErrorCode =
  | "invalid_bundle"
  | "unsupported_bundle"
  | "storage_failed"
  | "zip_failed"

export type ImportBrowserBundleError = {
  code: ImportBrowserBundleErrorCode
  message: string
  target?: string | null
  details?: {
    partialProjectRef?: string
    writtenCount?: number
    fileName?: string
    storageTarget?: string | null
  }
}

export type ImportBrowserBundleRequest = {
  file: File
  conflictPolicy: typeof browserProjectBundleImportConflictPolicy
}

export type ImportBrowserBundleResult =
  | {
      ok: true
      project: BrowserProjectRef
      summary: BrowserProjectBundleSummary
      receipts: BrowserWriteReceipt[]
    }
  | {
      ok: false
      error: ImportBrowserBundleError
    }

export type ImportBundleStatus =
  | { state: "idle" }
  | { state: "importing"; fileName: string }
  | {
      state: "success"
      project: BrowserProjectRef
      summary: BrowserProjectBundleSummary
      receiptCount: number
    }
  | { state: "error"; error: ImportBrowserBundleError }

export async function importBrowserProjectBundle(
  repository: BrowserProjectRepository,
  request: ImportBrowserBundleRequest,
): Promise<ImportBrowserBundleResult> {
  if (request.conflictPolicy !== browserProjectBundleImportConflictPolicy) {
    return {
      ok: false,
      error: {
        code: "unsupported_bundle",
        message: "Browser project bundle import only supports creating a new browser-local project.",
        target: "conflictPolicy",
        details: { fileName: request.file.name },
      },
    }
  }

  const bytes = new Uint8Array(await request.file.arrayBuffer()) as Uint8Array<ArrayBuffer>
  const archive = await readBrowserProjectBundleArchive({
    bundleName: request.file.name || "project.rxnflow.zip",
    bytes,
  })
  if (!archive.ok) {
    return { ok: false, error: mapArchiveImportError(archive.error, request.file.name) }
  }

  let project: BrowserProjectRef
  try {
    project = await repository.createProject({
      name: importedProjectName(archive.summary, request.file.name),
    })
  } catch (error) {
    if (error instanceof BrowserProjectRepositoryError) {
      return {
        ok: false,
        error: {
          code: "storage_failed",
          message: error.message,
          target: error.target ?? null,
          details: { fileName: request.file.name, storageTarget: error.target ?? null },
        },
      }
    }
    throw error
  }

  const receipts: BrowserWriteReceipt[] = []
  for (const entry of archive.entries.slice().sort(compareBundleEntries)) {
    try {
      receipts.push(await repository.writeObject(project.projectRef, bundleEntryToStorageObject(entry)))
    } catch (error) {
      if (error instanceof BrowserProjectRepositoryError) {
        return {
          ok: false,
          error: {
            code: "storage_failed",
            message: error.message,
            target: entry.projectRelativePath,
            details: {
              partialProjectRef: project.projectRef,
              writtenCount: receipts.length,
              fileName: request.file.name,
              storageTarget: error.target ?? null,
            },
          },
        }
      }
      throw error
    }
  }

  return {
    ok: true,
    project,
    summary: archive.summary,
    receipts,
  }
}

export function importedProjectName(
  summary: Pick<BrowserProjectBundleSummary, "projectName" | "rootName">,
  fileName: string,
): string {
  return (
    cleanProjectNameCandidate(summary.projectName) ??
    cleanProjectNameCandidate(stripBundleSuffix(summary.rootName)) ??
    cleanProjectNameCandidate(stripBundleSuffix(fileName)) ??
    "Imported Project"
  )
}

export function bundleEntryToStorageObject(entry: BrowserProjectBundleEntry): BrowserStorageObject {
  return {
    path: entry.projectRelativePath,
    bytes: entry.bytes,
    checksum: entry.checksum,
    metadata: importedBundleObjectMetadata(entry),
  }
}

export function importedBundleObjectMetadata(entry: BrowserProjectBundleEntry): BrowserStorageObject["metadata"] {
  const path = entry.projectRelativePath
  if (path === projectManifestPath) {
    return { kind: "project_manifest", imported_from_bundle: true }
  }
  if (path === projectContentIndexPath) {
    return { kind: "project_content_index", imported_from_bundle: true }
  }
  const knownSectionKind = projectContentSectionKinds[path]
  if (knownSectionKind) {
    return { kind: knownSectionKind, imported_from_bundle: true }
  }
  if (path.startsWith(".rxnflow/state/")) {
    return { kind: "project_content_file", imported_from_bundle: true }
  }
  if (path.startsWith("inputs/raw/")) {
    return {
      kind: "raw_file",
      imported_from_bundle: true,
      source_name: basename(path),
      byte_size: entry.byteSize,
    }
  }
  if (path.startsWith("exports/")) {
    return {
      kind: "export_artifact",
      imported_from_bundle: true,
      source_name: basename(path),
      byte_size: entry.byteSize,
    }
  }
  return { kind: "bundle_file", imported_from_bundle: true }
}

function mapArchiveImportError(error: BrowserProjectBundleError, fileName: string): ImportBrowserBundleError {
  if (error.code === "zip_failed") {
    return {
      code: "zip_failed",
      message: error.message,
      target: error.target ?? null,
      details: { fileName },
    }
  }
  return {
    code: "invalid_bundle",
    message: error.message,
    target: error.target ?? null,
    details: { fileName },
  }
}

function cleanProjectNameCandidate(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const cleaned = stripBundleSuffix(value)
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!cleaned || !/[A-Za-z0-9]/.test(cleaned)) {
    return null
  }
  return cleaned.slice(0, 120)
}

function stripBundleSuffix(value: string): string {
  return value
    .trim()
    .replace(/\.rxnflow\.zip$/i, "")
    .replace(/\.rxnflow$/i, "")
    .replace(/\.zip$/i, "")
}

function compareBundleEntries(left: BrowserProjectBundleEntry, right: BrowserProjectBundleEntry): number {
  return left.projectRelativePath.localeCompare(right.projectRelativePath)
}

function basename(path: string): string {
  return path.split("/").at(-1) ?? path
}

const projectContentSectionKinds: Record<string, string> = {
  [chemicalObjectsPath]: "chemical_objects",
  [reactionGraphsPath]: "reaction_graphs",
  [workspacesPath]: "workspaces",
  [energyProfilesPath]: "energy_profiles",
  [importLedgerPath]: "import_ledger",
  [exportArtifactsPath]: "export_artifacts",
}
