import {
  BrowserProjectRepositoryError,
  checksumBrowserStorageBytes,
  type BrowserProjectRef,
  type BrowserProjectRepository,
  type BrowserStorageObject,
} from "../repository"
import { projectManifestPath } from "./projectContentBridge"
import {
  browserProjectBundleSuffix,
  createBrowserProjectBundleArchive,
  type BrowserProjectBundleEntry,
  type BrowserProjectBundleError,
  type BrowserProjectBundleSummary,
} from "./projectBundleArchive"

export const browserProjectBundleExportPrefixes = [".rxnflow", "inputs/raw", "exports"] as const

export type BrowserProjectBundleExportPrefix = typeof browserProjectBundleExportPrefixes[number]

export type ExportBrowserBundleErrorCode =
  | "active_project_required"
  | "project_content_missing"
  | "bundle_invalid"
  | "storage_failed"
  | "zip_failed"

export type ExportBrowserBundleError = {
  code: ExportBrowserBundleErrorCode
  message: string
  target?: string | null
}

export type ExportBrowserBundleRequest = {
  projectRef: string
  rootName?: string
  includePrefixes: typeof browserProjectBundleExportPrefixes
}

export type ExportBrowserBundleResult =
  | {
      ok: true
      summary: BrowserProjectBundleSummary
      blob: Blob
      fileName: `${string}.rxnflow.zip`
    }
  | {
      ok: false
      error: ExportBrowserBundleError
    }

export type ExportBundleStatus =
  | { state: "idle" }
  | { state: "exporting" }
  | { state: "success"; fileName: string; summary: BrowserProjectBundleSummary }
  | { state: "error"; error: ExportBrowserBundleError }

export async function exportBrowserProjectBundle(
  repository: BrowserProjectRepository,
  activeProject?: BrowserProjectRef,
): Promise<ExportBrowserBundleResult> {
  if (!activeProject) {
    return {
      ok: false,
      error: {
        code: "active_project_required",
        message: "Active browser project is required before exporting a project bundle.",
        target: "active_project",
      },
    }
  }

  const rootName = bundleRootNameForProject(activeProject)
  const request: ExportBrowserBundleRequest = {
    projectRef: activeProject.projectRef,
    rootName,
    includePrefixes: browserProjectBundleExportPrefixes,
  }

  let objects: BrowserStorageObject[]
  try {
    objects = await collectBrowserProjectBundleObjects(repository, request)
  } catch (error) {
    if (error instanceof BrowserProjectRepositoryError) {
      return {
        ok: false,
        error: {
          code: "storage_failed",
          message: error.message,
          target: error.target ?? null,
        },
      }
    }
    throw error
  }

  if (!objects.some((object) => object.path === projectManifestPath)) {
    return {
      ok: false,
      error: {
        code: "project_content_missing",
        message: "Browser project bundle export requires .rxnflow/manifest.json.",
        target: projectManifestPath,
      },
    }
  }

  const entries = await bundleEntriesFromStorageObjects(objects)
  const fileName = bundleFileNameForRootName(rootName)
  const archive = await createBrowserProjectBundleArchive({
    bundleName: fileName,
    rootName,
    entries,
  })
  if (!archive.ok) {
    return { ok: false, error: mapArchiveExportError(archive.error) }
  }

  return {
    ok: true,
    summary: archive.summary,
    blob: new Blob([archive.bytes], { type: "application/zip" }),
    fileName,
  }
}

export async function collectBrowserProjectBundleObjects(
  repository: BrowserProjectRepository,
  request: ExportBrowserBundleRequest,
): Promise<BrowserStorageObject[]> {
  const byPath = new Map<string, BrowserStorageObject>()
  for (const prefix of request.includePrefixes) {
    const objects = await repository.listObjects(request.projectRef, prefix)
    for (const object of objects) {
      byPath.set(object.path, object)
    }
  }
  return Array.from(byPath.values()).sort((left, right) => left.path.localeCompare(right.path))
}

export async function bundleEntriesFromStorageObjects(
  objects: readonly BrowserStorageObject[],
): Promise<BrowserProjectBundleEntry[]> {
  const entries: BrowserProjectBundleEntry[] = []
  for (const object of objects) {
    entries.push({
      name: object.path.split("/").at(-1) ?? object.path,
      projectRelativePath: object.path,
      bytes: object.bytes,
      byteSize: object.bytes.byteLength,
      checksum: (object.checksum ?? await checksumBrowserStorageBytes(object.bytes)) as `sha256:${string}`,
    })
  }
  return entries
}

export function bundleRootNameForProject(project: BrowserProjectRef): string {
  const fromName = sanitizeBundleBaseName(project.name)
  if (fromName) {
    return `${fromName}.rxnflow`
  }
  const fromId = sanitizeBundleBaseName(project.id) || "browser-project"
  return `${fromId}.rxnflow`
}

export function bundleFileNameForRootName(rootName: string): `${string}.rxnflow.zip` {
  const baseName = rootName.endsWith(".rxnflow")
    ? rootName.slice(0, -".rxnflow".length)
    : rootName
  return `${baseName || "browser-project"}${browserProjectBundleSuffix}` as `${string}.rxnflow.zip`
}

function sanitizeBundleBaseName(value: string): string {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\.rxnflow(?:\.zip)?$/i, "")
    .slice(0, 80)
}

function mapArchiveExportError(error: BrowserProjectBundleError): ExportBrowserBundleError {
  if (error.code === "zip_failed") {
    return {
      code: "zip_failed",
      message: error.message,
      target: error.target ?? null,
    }
  }
  return {
    code: "bundle_invalid",
    message: error.message,
    target: error.target ?? null,
  }
}
