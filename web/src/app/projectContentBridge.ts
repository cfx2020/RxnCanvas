import {
  BrowserProjectRepositoryError,
  checksumBrowserStorageBytes,
  type BrowserProjectRef,
  type BrowserProjectRepository,
  type BrowserStorageObject,
  type BrowserWriteReceipt,
} from "../repository"
import type { JsonObject } from "../shell"

export const projectManifestPath = ".rxnflow/manifest.json" as const
export const projectContentIndexPath = ".rxnflow/state/project-content.json" as const
export const chemicalObjectsPath = ".rxnflow/state/chemical-objects.json" as const
export const reactionGraphsPath = ".rxnflow/state/reaction-graphs.json" as const
export const workspacesPath = ".rxnflow/state/workspaces.json" as const
export const energyProfilesPath = ".rxnflow/state/energy-profiles.json" as const
export const importLedgerPath = ".rxnflow/state/import-ledger.json" as const
export const exportArtifactsPath = ".rxnflow/state/export-artifacts.json" as const

export const projectContentSchemaVersion = "project-content-v1" as const
export const projectSchemaVersion = "project-v1" as const
export const projectContentTime = "2026-05-05T00:00:00Z" as const
export const projectManifestTime = "2026-05-02T00:00:00Z" as const

export const projectContentSectionPaths = [
  chemicalObjectsPath,
  reactionGraphsPath,
  workspacesPath,
  energyProfilesPath,
  importLedgerPath,
  exportArtifactsPath,
] as const

export type ProjectContentSectionPath = typeof projectContentSectionPaths[number]

export type BrowserProjectContentFile = {
  path: string
  bytes: Uint8Array<ArrayBuffer>
  checksum?: string
  metadata: JsonObject
}

export type ShellProjectContentFile = JsonObject & {
  path: string
  bytes_base64: string
  checksum?: string | null
  metadata?: JsonObject
}

export type ProjectSaveContentData = JsonObject & {
  command: "project.save_content"
  session_id: string
  content_files?: ShellProjectContentFile[]
}

export type BrowserContentValidation = {
  state: "missing" | "valid" | "error"
  path?: string
  checksum?: string
  checkedAt: string
  error?: {
    code: string
    message: string
    target?: string | null
  }
}

type ProjectContentIndexFile = {
  kind: string
  path: ProjectContentSectionPath
  checksum: string
  updated_at: string
}

const sectionKinds: Record<ProjectContentSectionPath, string> = {
  [chemicalObjectsPath]: "chemical_objects",
  [reactionGraphsPath]: "reaction_graphs",
  [workspacesPath]: "workspaces",
  [energyProfilesPath]: "energy_profiles",
  [importLedgerPath]: "import_ledger",
  [exportArtifactsPath]: "export_artifacts",
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export async function createEmptyProjectContentFiles(
  project: BrowserProjectRef,
): Promise<BrowserProjectContentFile[]> {
  const projectId = projectIdFromBrowserProject(project)
  const sectionFiles: BrowserProjectContentFile[] = []
  for (const path of projectContentSectionPaths) {
    const bytes = jsonBytes(emptySection(path, projectId))
    const checksum = await checksumBrowserStorageBytes(bytes)
    sectionFiles.push({
      path,
      bytes,
      checksum,
      metadata: { kind: sectionKinds[path] },
    })
  }

  const indexFiles: ProjectContentIndexFile[] = sectionFiles.map((file) => ({
    kind: String(file.metadata.kind),
    path: file.path as ProjectContentSectionPath,
    checksum: file.checksum ?? "",
    updated_at: projectContentTime,
  }))
  const indexBytes = jsonBytes({
    schema_version: projectContentSchemaVersion,
    project_id: projectId,
    updated_at: projectContentTime,
    files: indexFiles,
  })
  const manifestBytes = jsonBytes({
    id: projectId,
    name: project.name,
    created_at: projectManifestTime,
    updated_at: projectManifestTime,
    schema_version: projectSchemaVersion,
    resources: [],
  })

  return [
    {
      path: projectManifestPath,
      bytes: manifestBytes,
      checksum: await checksumBrowserStorageBytes(manifestBytes),
      metadata: { kind: "project_manifest" },
    },
    {
      path: projectContentIndexPath,
      bytes: indexBytes,
      checksum: await checksumBrowserStorageBytes(indexBytes),
      metadata: { kind: "project_content_index" },
    },
    ...sectionFiles,
  ]
}

export async function writeProjectContentFiles(
  repository: BrowserProjectRepository,
  projectRef: string,
  files: BrowserProjectContentFile[],
): Promise<BrowserWriteReceipt[]> {
  const receipts: BrowserWriteReceipt[] = []
  for (const file of files) {
    receipts.push(await repository.writeObject(projectRef, {
      path: file.path,
      bytes: file.bytes,
      checksum: file.checksum,
      metadata: file.metadata,
    }))
  }
  return receipts
}

export async function ensureEmptyProjectContent(
  repository: BrowserProjectRepository,
  project: BrowserProjectRef,
): Promise<BrowserWriteReceipt[]> {
  const files = await createEmptyProjectContentFiles(project)
  return writeProjectContentFiles(repository, project.projectRef, files)
}

export async function readProjectContentFiles(
  repository: BrowserProjectRepository,
  projectRef: string,
): Promise<BrowserProjectContentFile[]> {
  const indexObject = await repository.readObject(projectRef, projectContentIndexPath)
  const index = parseProjectContentIndex(indexObject.bytes)
  const paths = [projectManifestPath, projectContentIndexPath, ...index.files.map((file) => file.path)]
  const files: BrowserProjectContentFile[] = []
  for (const path of unique(paths)) {
    const object = await repository.readObject(projectRef, path)
    files.push(browserObjectToContentFile(object))
  }
  return files
}

export async function validateBrowserProjectContent(
  repository: BrowserProjectRepository,
  projectRef: string,
): Promise<BrowserContentValidation> {
  try {
    const files = await readProjectContentFiles(repository, projectRef)
    const indexFile = files.find((file) => file.path === projectContentIndexPath)
    const checksum = indexFile?.checksum ?? (indexFile ? await checksumBrowserStorageBytes(indexFile.bytes) : undefined)
    const index = indexFile ? parseProjectContentIndex(indexFile.bytes) : undefined
    for (const expected of index?.files ?? []) {
      const file = files.find((item) => item.path === expected.path)
      if (!file) {
        return { state: "missing", path: expected.path, checkedAt: new Date().toISOString() }
      }
      const actualChecksum = file.checksum ?? (await checksumBrowserStorageBytes(file.bytes))
      if (actualChecksum !== expected.checksum) {
        return { state: "error", path: expected.path, checkedAt: new Date().toISOString(), error: {
          code: "checksum_mismatch",
          message: "Browser project content file checksum does not match the index.",
          target: expected.path,
        } }
      }
    }
    return { state: "valid", checksum, checkedAt: new Date().toISOString() }
  } catch (error) {
    if (error instanceof BrowserProjectRepositoryError && error.code === "object_not_found") {
      const details = error.details && typeof error.details === "object" && !Array.isArray(error.details)
        ? error.details as JsonObject
        : {}
      return {
        state: "missing",
        path: typeof details.path === "string" ? details.path : projectContentIndexPath,
        checkedAt: new Date().toISOString(),
      }
    }
    if (error instanceof BrowserProjectRepositoryError) {
      return {
        state: "error",
        checkedAt: new Date().toISOString(),
        error: {
          code: error.code,
          message: error.message,
          target: error.target,
        },
      }
    }
    throw error
  }
}

export async function contentFilesToShellPayload(
  files: BrowserProjectContentFile[],
): Promise<ShellProjectContentFile[]> {
  const payload: ShellProjectContentFile[] = []
  for (const file of files) {
    payload.push({
      path: file.path,
      bytes_base64: bytesToBase64(file.bytes),
      checksum: file.checksum ?? await checksumBrowserStorageBytes(file.bytes),
      metadata: file.metadata,
    })
  }
  return payload
}

export function shellPayloadToContentFiles(
  files: readonly ShellProjectContentFile[],
): BrowserProjectContentFile[] {
  return files.map((file) => ({
    path: file.path,
    bytes: base64ToBytes(file.bytes_base64),
    checksum: typeof file.checksum === "string" ? file.checksum : undefined,
    metadata: file.metadata ?? {},
  }))
}

export function projectIdFromBrowserProject(project: BrowserProjectRef): string {
  return `project-${project.id}`
}

function browserObjectToContentFile(object: BrowserStorageObject): BrowserProjectContentFile {
  return {
    path: object.path,
    bytes: object.bytes,
    checksum: object.checksum,
    metadata: object.metadata,
  }
}

function parseProjectContentIndex(bytes: Uint8Array<ArrayBuffer>): {
  schema_version: string
  project_id: string
  files: ProjectContentIndexFile[]
} {
  const data = JSON.parse(textDecoder.decode(bytes)) as {
    schema_version?: unknown
    project_id?: unknown
    files?: unknown
  }
  if (data.schema_version !== projectContentSchemaVersion || typeof data.project_id !== "string") {
    throw new BrowserProjectRepositoryError({
      code: "invalid_input",
      message: "Browser project content index is not project-content-v1.",
      target: projectContentIndexPath,
    })
  }
  if (!Array.isArray(data.files)) {
    throw new BrowserProjectRepositoryError({
      code: "invalid_input",
      message: "Browser project content index files must be a list.",
      target: projectContentIndexPath,
    })
  }
  return {
    schema_version: data.schema_version,
    project_id: data.project_id,
    files: data.files.map((file, index) => {
      if (!file || typeof file !== "object" || Array.isArray(file)) {
        throw new BrowserProjectRepositoryError({
          code: "invalid_input",
          message: "Browser project content index file must be an object.",
          target: `files[${index}]`,
        })
      }
      const value = file as Record<string, unknown>
      if (typeof value.kind !== "string" || typeof value.path !== "string" || typeof value.checksum !== "string") {
        throw new BrowserProjectRepositoryError({
          code: "invalid_input",
          message: "Browser project content index file is missing kind, path, or checksum.",
          target: `files[${index}]`,
        })
      }
      return {
        kind: value.kind,
        path: value.path as ProjectContentSectionPath,
        checksum: value.checksum,
        updated_at: typeof value.updated_at === "string" ? value.updated_at : projectContentTime,
      }
    }),
  }
}

function emptySection(path: ProjectContentSectionPath, projectId: string): JsonObject {
  if (path === chemicalObjectsPath) {
    return { schema_version: "chemical-objects-v1", project_id: projectId, objects: [] }
  }
  if (path === reactionGraphsPath) {
    return { schema_version: "reaction-graphs-v1", project_id: projectId, graphs: [] }
  }
  if (path === workspacesPath) {
    return { schema_version: "workspaces-v1", project_id: projectId, workspaces: [] }
  }
  if (path === energyProfilesPath) {
    return { schema_version: "energy-profiles-v1", project_id: projectId, profiles: [] }
  }
  if (path === importLedgerPath) {
    return { schema_version: "import-ledger-v1", project_id: projectId, batches: [] }
  }
  return { schema_version: "export-artifacts-v1", project_id: projectId, artifacts: [] }
}

function jsonBytes(data: JsonObject): Uint8Array<ArrayBuffer> {
  return textEncoder.encode(`${JSON.stringify(data, null, 2)}\n`) as Uint8Array<ArrayBuffer>
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes as Uint8Array<ArrayBuffer>
}
