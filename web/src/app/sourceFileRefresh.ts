import { normalizeSourceFileForPersistence, type SourceFile } from "../domain/projectPackages"
import type { RxnflowDesktopApi } from "./appRuntimeEffects"
import { sourceFileDisplayGroupKey } from "./fileDisplay"
import { reconcileProjectWorkspaceSourceNodes } from "./importWorkspace"
import { projectWorkspaceSnapshot, type ProjectWorkspaceSnapshot } from "./projectWorkspace"

export type ProjectSourceRefreshResult = {
  files: SourceFile[]
  refreshedFileIds: Set<string>
}

export function sourceFileGroupIds(files: SourceFile[], fileIds: readonly string[]): Set<string> {
  const selectedIds = new Set(fileIds)
  const groupKeys = new Set(files
    .filter((file) => selectedIds.has(file.id))
    .map(sourceFileDisplayGroupKey))
  return new Set(files
    .filter((file) => groupKeys.has(sourceFileDisplayGroupKey(file)))
    .map((file) => file.id))
}

export function mergeRefreshedProjectSourceFiles(
  currentFiles: SourceFile[],
  refreshedFiles: SourceFile[],
  refreshedFileIds: ReadonlySet<string>,
): SourceFile[] {
  if (refreshedFileIds.size === 0) return currentFiles
  const refreshedById = new Map(refreshedFiles.map((file) => [file.id, file]))
  let changed = false
  const nextFiles = currentFiles.map((file) => {
    if (!refreshedFileIds.has(file.id)) return file
    const refreshed = refreshedById.get(file.id)
    if (!refreshed) return file
    changed = true
    return refreshed
  })
  return changed ? nextFiles : currentFiles
}

export function projectWorkspaceWithRefreshedSourceFiles(
  snapshot: ProjectWorkspaceSnapshot,
  refreshedFiles: SourceFile[],
  refreshedFileIds: ReadonlySet<string>,
): ProjectWorkspaceSnapshot {
  const files = mergeRefreshedProjectSourceFiles(snapshot.files, refreshedFiles, refreshedFileIds)
  if (files === snapshot.files) return snapshot
  return reconcileProjectWorkspaceSourceNodes(projectWorkspaceSnapshot({ ...snapshot, files }), refreshedFileIds, true)
}

export async function refreshProjectSourceFiles({
  desktopApi,
  projectId,
  projectDirectory,
  files,
  forceFileIds = new Set(),
}: {
  desktopApi: RxnflowDesktopApi | undefined
  projectId: string
  projectDirectory?: string | null
  files: SourceFile[]
  forceFileIds?: ReadonlySet<string>
}): Promise<ProjectSourceRefreshResult> {
  const storedFiles = files.filter((file): file is SourceFile & { storedPath: string } => Boolean(file.storedPath))
  if (!desktopApi?.inspectProjectSourceFiles || storedFiles.length === 0) {
    return { files, refreshedFileIds: new Set() }
  }

  const inspection = await desktopApi.inspectProjectSourceFiles({
    projectId,
    projectDirectory,
    files: storedFiles.map((file) => ({ id: file.id, storedPath: file.storedPath })),
  })
  if (!inspection.ok || !inspection.data?.files) {
    return { files, refreshedFileIds: new Set() }
  }

  const metadataById = new Map(inspection.data.files.map((file) => [file.id, file]))
  const refreshedFileIds = new Set<string>()
  const nextFiles = await Promise.all(files.map(async (file) => {
    const metadata = metadataById.get(file.id)
    if (!metadata || metadata.error || !metadata.checksum || !Number.isFinite(metadata.size)) return file
    const diskSize = Number(metadata.size)
    const diskChanged = metadata.checksum !== file.checksum || diskSize !== file.size
    const parseIsStale = Boolean(file.parse && file.parseChecksum && file.parseChecksum !== metadata.checksum)
    const forced = forceFileIds.has(file.id)
    if (!diskChanged && !parseIsStale && !forced) return file

    const diskFile = normalizeSourceFileForPersistence({
      ...file,
      size: diskSize,
      checksum: metadata.checksum,
    })
    const parsed = await desktopApi.parseSourcePreview?.({
      projectId,
      name: file.name,
      size: diskSize,
      preview: file.preview,
      storedPath: file.storedPath,
    })
    const parse = parsed?.ok ? parsed.data?.parse : null
    if (!parse) {
      if (!diskChanged && !parseIsStale && !forced) return diskFile
      refreshedFileIds.add(file.id)
      return normalizeSourceFileForPersistence({
        ...diskFile,
        status: "staged",
        parse: undefined,
        parseChecksum: undefined,
      })
    }

    const parsedData = parsed?.data
    const checksum = parsedData?.checksum ?? metadata.checksum
    refreshedFileIds.add(file.id)
    return normalizeSourceFileForPersistence({
      ...diskFile,
      size: parsedData?.size ?? diskSize,
      checksum,
      parseChecksum: parsedData?.parseChecksum ?? checksum,
      kind: parse.sourceKind,
      status: parse.parsed ? "parsed" : "staged",
      parse,
    })
  }))

  return { files: nextFiles, refreshedFileIds }
}
