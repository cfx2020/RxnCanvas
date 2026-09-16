import type { SourceFile } from "../domain/projectPackages"
import type { SourceParseResult } from "../domain/sourceParseTypes"
import type {
  CandidateReviewEntry,
  CandidateReviewState,
  CandidateReviewViewState,
  ImportNodeLayout,
  ImportPlan,
  ParsedImportFile,
  SourceCandidateReviewTransition,
} from "./importRegistrationTypes"
import { stagedSourceFile } from "./importWorkspace"

export function candidateReviewEntries(parsedImports: ParsedImportFile[]): CandidateReviewEntry[] {
  return parsedImports.flatMap(({ file, parsed }) => {
    const candidates = parsed.candidates ?? []
    if (candidates.length <= 1) return []
    const sourceFile = stagedSourceFile(file, parsed)
    return candidates.map((candidate) => ({
      file: sourceFile,
      parsed,
      candidate,
    }))
  })
}

export function defaultCandidateSelection(entries: CandidateReviewEntry[]): string[] {
  const byFile = new Map<string, CandidateReviewEntry[]>()
  entries.forEach((entry) => {
    byFile.set(entry.file.id, [...(byFile.get(entry.file.id) ?? []), entry])
  })
  return Array.from(byFile.values()).flatMap((fileEntries) => {
    const defaultEntry = fileEntries.find((entry) => entry.candidate.roleHint === "final") ?? fileEntries.at(-1)
    return defaultEntry ? [candidateReviewKey(defaultEntry)] : []
  })
}

export function candidateReviewStateFromEntries(
  entries: CandidateReviewEntry[],
  layout: ImportNodeLayout,
  id = `candidate-review-${Date.now()}`,
): CandidateReviewState | null {
  if (entries.length === 0) return null
  return {
    id,
    entries,
    selectedKeys: defaultCandidateSelection(entries),
    layout,
  }
}

export function candidateReviewStateFromPlan(
  importPlan: ImportPlan,
  id = `candidate-review-${Date.now()}`,
): CandidateReviewState | null {
  return candidateReviewStateFromEntries(importPlan.reviewEntries, importPlan.layout, id)
}

export function candidateReviewStateForSourceFile(
  file: SourceFile | null | undefined,
  layout: ImportNodeLayout,
  id = `candidate-review-${Date.now()}`,
): CandidateReviewState | null {
  if (!file?.parse || (file.parse.candidates?.length ?? 0) < 2) return null
  const entries = (file.parse.candidates ?? []).map((candidate): CandidateReviewEntry => ({
    file,
    parsed: file.parse as SourceParseResult,
    candidate,
  }))
  return candidateReviewStateFromEntries(entries, layout, id)
}

export function candidateReviewTransitionForSourceFile(
  file: SourceFile | null | undefined,
  layout: ImportNodeLayout,
  id = `candidate-review-${Date.now()}`,
): SourceCandidateReviewTransition | null {
  const reviewState = candidateReviewStateForSourceFile(file, layout, id)
  if (!file || !reviewState) return null
  return {
    reviewState,
    selection: {
      selectedFileId: file.id,
      selectedFileIds: [file.id],
      lastSelectedFileId: file.id,
      selectedEdgeIds: [],
      selectedBarrierIds: [],
    },
  }
}

export function toggleCandidateReviewSelection<T extends CandidateReviewViewState | null>(
  review: T,
  key: string,
): T {
  if (!review) return review
  const selectedKeys = review.selectedKeys.includes(key)
    ? review.selectedKeys.filter((item) => item !== key)
    : [...review.selectedKeys, key]
  return { ...review, selectedKeys } as T
}

export function candidateReviewEntriesForMode(
  review: CandidateReviewViewState,
  mode: "selected" | "all",
): CandidateReviewEntry[] {
  const selected = new Set(mode === "all"
    ? review.entries.map(candidateReviewKey)
    : review.selectedKeys)
  return review.entries.filter((entry) => selected.has(candidateReviewKey(entry)))
}

export function candidateReviewKey(entry: CandidateReviewEntry): string {
  return `${entry.file.id}:${entry.candidate.candidateId}`
}
