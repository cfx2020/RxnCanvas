import type { SourceFile } from "../domain/projectPackages"
import { sourceKindFromName } from "./fileDisplay"
import type { DesktopSourceFile, ImportSourceFile } from "./importRegistrationTypes"

export async function browserImportSourceFilesFromFiles(fileList: FileList | File[], idPrefix = "file"): Promise<ImportSourceFile[]> {
  const selectedFiles = Array.from(fileList)
  const timestamp = Date.now()
  return Promise.all(selectedFiles.map(async (file, index): Promise<ImportSourceFile> => ({
    id: `${idPrefix}-${timestamp}-${index}`,
    name: file.name,
    kind: sourceKindFromName(file.name),
    size: file.size,
    status: "staged",
    preview: await readFilePreview(file),
  })))
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
    parse: file.parse,
  }))
}

export function sourceFilesFromIds(files: SourceFile[], fileIds: string[]): SourceFile[] {
  const fileById = new Map(files.map((file) => [file.id, file]))
  return fileIds
    .map((fileId) => fileById.get(fileId))
    .filter((file): file is SourceFile => Boolean(file))
}

async function readFilePreview(file: File): Promise<string> {
  try {
    const text = await file.text()
    return sourcePreviewSample(text)
  } catch {
    return "Preview unavailable."
  }
}

export function sourcePreviewSample(text: string): string {
  const maxFullPreviewLength = 512 * 1024
  if (text.length <= maxFullPreviewLength) return text

  const head = text.slice(0, 64 * 1024)
  const focusMarkers = [
    "Charge =",
    "Stoichiometry",
    "Input orientation:",
    "Standard orientation:",
    "SCF Done:",
    "Thermal correction to Gibbs Free Energy",
    "Sum of electronic and thermal Free Energies",
    "FINAL SINGLE POINT ENERGY",
    "CARTESIAN COORDINATES",
  ]
  const positions = focusMarkers
    .map((marker) => text.lastIndexOf(marker))
    .filter((position) => position >= 0)
  if (positions.length === 0) {
    return `${head}\n\n[... RxnFlow preview truncated ${text.length - head.length} characters ...]\n\n${text.slice(-128 * 1024)}`
  }

  const focusStart = Math.max(0, Math.min(...positions) - 16 * 1024)
  const focusEnd = Math.min(text.length, Math.max(...positions) + 192 * 1024)
  const focus = text.slice(focusStart, focusEnd)
  return [
    head,
    `\n\n[... RxnFlow preview focused excerpt ${focusStart}-${focusEnd} of ${text.length} ...]\n\n`,
    focus,
  ].join("")
}
