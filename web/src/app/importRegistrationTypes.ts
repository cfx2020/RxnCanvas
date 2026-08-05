import type { FlowNode, NodeKind, Point, SourceFile } from "../domain/projectPackages"
import type { ParseCandidate, ParsedEnergyTableData, ParsedEnergyUnit, SourceParseResult } from "../domain/sourceParsers"
import type { ProjectWorkspaceSnapshot } from "./projectWorkspace"

export type DesktopSourceFile = {
  id?: string
  name: string
  size: number
  preview: string
  sourcePath?: string
  storedPath?: string
  checksum?: string
  parseChecksum?: string
  parse?: SourceParseResult
}

export type DesktopImportSourceFilesPayload = {
  projectId?: string
  projectDirectory?: string | null
  referencedStoredPaths?: string[]
  files: Array<{
    id: string
    name: string
    size: number
    preview: string
    sourcePath?: string
    storedPath?: string
  }>
}

export type DesktopImportSourceFilesResponse =
  | {
      ok: true
      data: {
        files: Array<{
          id: string
          name: string
          size: number
          preview: string
          storedPath?: string
          checksum?: string
          parseChecksum?: string
          parse?: SourceParseResult | null
          error?: {
            code: string
            message: string
          }
        }>
      }
      warnings?: Array<{ code: string; message: string }>
    }
  | {
      ok: false
      error: {
        code: string
        message: string
      }
    }

export type DesktopImportRegistrationPayload = {
  mode: "selected" | "all"
  files: Array<{
    id: string
    name: string
    size: number
    preview: string
    sourcePath?: string
    storedPath?: string
    checksum?: string
    parse?: SourceParseResult
  }>
  selections?: Array<{
    fileId: string
    objectIndices: number[]
  }>
}

export type RegisteredImportObject = {
  id: string
  label: string
  formula: string
  kind: NodeKind
  method: string
  solvent: string
  energyGas: number | null
  energySolution: number | null
  energyUnit: ParsedEnergyUnit
  sourceStatus: "parsed" | "staged"
  sourceFileId: string
  sourceFileName: string
  sourceCandidateId: string
  sourceObjectIndex: number
  parserId: string | null
  parserVersion: string | null
  roleHint: string
  charge: number | null
  spinMultiplicity: number | null
  energyTable?: ParsedEnergyTableData | null
}

export type DesktopImportRegistrationResponse =
  | {
      ok: true
      data: {
        registeredObjects: RegisteredImportObject[]
        files: Array<{
          fileId: string
          registeredObjectIds: string[]
          objectIndices: number[]
        }>
      }
    }
  | {
      ok: false
      error: {
        code: string
        message: string
      }
    }

export type RegisterImportCandidates = (payload: DesktopImportRegistrationPayload) => Promise<DesktopImportRegistrationResponse>

export type ImportSourceFile = SourceFile & {
  parse?: SourceParseResult
}

export type ParsedImportFile = {
  file: ImportSourceFile
  index: number
  parsed: SourceParseResult
}

export type ImportNodeLayout = {
  origin: Point
  columns: number
  idSuffix?: string
}

export type CandidateReviewEntry = {
  file: SourceFile
  parsed: SourceParseResult
  candidate: ParseCandidate
}

export type CandidateReviewViewState = {
  id: string
  entries: CandidateReviewEntry[]
  selectedKeys: string[]
}

export type CandidateReviewState = CandidateReviewViewState & {
  layout: ImportNodeLayout
}

export type SourceCandidateReviewSelection = {
  selectedFileId: string
  selectedFileIds: string[]
  lastSelectedFileId: string
  selectedEdgeIds: string[]
  selectedBarrierIds: string[]
}

export type SourceCandidateReviewTransition = {
  reviewState: CandidateReviewState
  selection: SourceCandidateReviewSelection
}

export type StageSourceFilesOptions = {
  layout?: ImportNodeLayout
  fileMode?: "prepend" | "update"
  autoRegister?: boolean
  parseMode?: "fallback" | "defer"
}

export type PendingImportProjectTransition = {
  projectId: string
  pendingImportProjectId: null
}

export type ImportPickerTransition = {
  projectId: string
  pendingImportProjectId: string | null
  shouldImportDesktop: boolean
  shouldOpenBrowserPicker: boolean
}

export type CanvasRawFileDropImportTransition =
  | {
      kind: "external-files"
      files: File[]
      idPrefix: string
      layout: ImportNodeLayout
      options: StageSourceFilesOptions
    }
  | {
      kind: "project-files"
      files: SourceFile[]
      layout: ImportNodeLayout
      options: StageSourceFilesOptions
    }

export type DesktopImportFilesTransition = {
  importedFiles: ImportSourceFile[]
} | null

export type ImportPlan = {
  layout: ImportNodeLayout
  parsedImports: ParsedImportFile[]
  stagedFiles: SourceFile[]
  autoEntries: CandidateReviewEntry[]
  fallbackNodes: FlowNode[]
  reviewEntries: CandidateReviewEntry[]
}

export type PreparedProjectWorkspaceImport = {
  importPlan: ImportPlan
  reviewState: CandidateReviewState | null
  autoNodes: FlowNode[]
  snapshot: ProjectWorkspaceSnapshot
}

export type ProjectWorkspaceImportApplyTransition = {
  snapshot: ProjectWorkspaceSnapshot
  reviewState: CandidateReviewState | null
  shouldPushEditHistory: boolean
  keyboardEdgeSourceId: null
}

export type CandidateReviewRegistrationApplyTransition = {
  snapshot: ProjectWorkspaceSnapshot
  shouldPushEditHistory: true
  keyboardEdgeSourceId: null
  candidateReview: null
}

export type ProjectWorkspaceImportOptions = {
  fileMode?: "prepend" | "update"
  viewMode?: ProjectWorkspaceSnapshot["viewMode"]
  autoRegister?: boolean
  parseMode?: "fallback" | "defer"
}

export type PrepareProjectWorkspaceImportOptions = ProjectWorkspaceImportOptions & {
  registerImportCandidates?: RegisterImportCandidates
}
