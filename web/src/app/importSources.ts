import type { SourceFile } from "../domain/projectPackages"
import { sourceKindFromName } from "./fileDisplay"
import type { DesktopSourceFile, ImportSourceFile } from "./importRegistrationTypes"

const maxFullPreviewLength = 512 * 1024
const largeFilePreviewHeadBytes = 64 * 1024
const largeFilePreviewTailBytes = maxFullPreviewLength - largeFilePreviewHeadBytes - 1024

export async function browserImportSourceFilesFromFiles(
  fileList: FileList | File[],
  idPrefix = "file",
  options: {
    previewMode?: "full" | "head" | "none"
    prepareFile?: (file: File, index: number) => Partial<ImportSourceFile> | undefined
  } = {},
): Promise<ImportSourceFile[]> {
  const selectedFiles = Array.from(fileList)
  const timestamp = Date.now()
  return Promise.all(selectedFiles.map(async (file, index): Promise<ImportSourceFile> => {
    const prepared = options.prepareFile?.(file, index) ?? {}
    return {
      id: `${idPrefix}-${timestamp}-${index}`,
      name: file.name,
      kind: sourceKindFromName(file.name),
      size: file.size,
      status: "staged",
      preview: await readFilePreview(file, options.previewMode ?? "full"),
      ...prepared,
    }
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

async function readFilePreview(file: File, mode: "full" | "head" | "none"): Promise<string> {
  if (mode === "none") return ""
  try {
    const text = mode === "head"
      ? await file.slice(0, largeFilePreviewHeadBytes).text()
      : file.size <= maxFullPreviewLength
        ? await file.text()
        : await largeFilePreview(file)
    return sourcePreviewSample(text)
  } catch {
    return "Preview unavailable."
  }
}

async function largeFilePreview(file: File): Promise<string> {
  const [head, tail] = await Promise.all([
    file.slice(0, largeFilePreviewHeadBytes).text(),
    file.slice(Math.max(0, file.size - largeFilePreviewTailBytes)).text(),
  ])
  return `${head}\n\n[... RxnFlow preview skipped ${Math.max(0, file.size - maxFullPreviewLength)} bytes ...]\n\n${tail}`
}

export function sourcePreviewSample(text: string): string {
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
