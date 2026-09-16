import type { SourceFile } from "../domain/projectPackages"
import { sourceKindFromName } from "./fileDisplay"
import type { DesktopSourceFile, ImportSourceFile } from "./importRegistrationTypes"

export function browserImportSourceFilesFromFiles(
  fileList: FileList | File[],
  idPrefix = "file",
  options: {
    prepareFile?: (file: File, index: number) => Partial<ImportSourceFile> | undefined
  } = {},
): ImportSourceFile[] {
  const timestamp = Date.now()
  return Array.from(fileList).map((file, index) => ({
    id: `${idPrefix}-${timestamp}-${index}`,
    name: file.name,
    kind: sourceKindFromName(file.name),
    size: file.size,
    status: "staged",
    preview: "",
    ...options.prepareFile?.(file, index),
  }))
}

export function desktopImportSourceFilesFromFiles(files: DesktopSourceFile[], idPrefix = "desktop-file"): ImportSourceFile[] {
  const timestamp = Date.now()
  return files.map((file, index): ImportSourceFile => ({
    id: file.id ?? `${idPrefix}-${timestamp}-${index}`,
    name: file.name,
    kind: sourceKindFromName(file.name),
    size: file.size,
    status: "staged",
    preview: file.preview,
    sourcePath: file.sourcePath,
    storedPath: file.storedPath,
    checksum: file.checksum,
    parseChecksum: file.parseChecksum,
    parse: file.parse,
  }))
}

export function sourceFilesFromIds(files: SourceFile[], fileIds: string[]): SourceFile[] {
  const fileById = new Map(files.map((file) => [file.id, file]))
  return fileIds
    .map((fileId) => fileById.get(fileId))
    .filter((file): file is SourceFile => Boolean(file))
}
