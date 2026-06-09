import type { ShellError } from "../shell"
import type { GraphEdgeSummary, GraphNodeSummary, GraphPathSummary, WorkspaceSummary } from "./workbenchState"
import { graphNodePosition } from "./graphNodeLayout"
import { normalizeGraphViewport, type GraphViewport } from "./graphViewport"

export type GraphEditorHistoryKind = "layout" | "viewport" | "selection" | "nudge" | "remove"

export type GraphEditorNodePositionSnapshot = {
  nodeId: string
  position: [number, number]
}

export type GraphEditorSelectionSnapshot = {
  nodeIds: string[]
  edgeIds: string[]
  pathIds: string[]
}

export type GraphEditorHistoryNodeEntry = {
  id: string
  kind: "layout" | "nudge"
  label: string
  before: GraphEditorNodePositionSnapshot[]
  after: GraphEditorNodePositionSnapshot[]
  beforeViewport?: GraphViewport | null
  afterViewport?: GraphViewport | null
  createdAt: string
}

export type GraphEditorHistoryViewportEntry = {
  id: string
  kind: "viewport"
  label: string
  before: GraphViewport
  after: GraphViewport
  createdAt: string
}

export type GraphEditorHistorySelectionEntry = {
  id: string
  kind: "selection"
  label: string
  before: GraphEditorSelectionSnapshot
  after: GraphEditorSelectionSnapshot
  createdAt: string
}

export type GraphEditorGraphSnapshot = {
  nodes: GraphNodeSummary[]
  edges: GraphEdgeSummary[]
  paths: GraphPathSummary[]
  activePathId?: string | null
  viewport?: GraphViewport | null
  selection: GraphEditorSelectionSnapshot
}

export type GraphEditorHistoryRemoveEntry = {
  id: string
  kind: "remove"
  label: string
  before: GraphEditorGraphSnapshot
  after: GraphEditorGraphSnapshot
  createdAt: string
}

export type GraphEditorHistoryEntry =
  | GraphEditorHistoryNodeEntry
  | GraphEditorHistoryViewportEntry
  | GraphEditorHistorySelectionEntry
  | GraphEditorHistoryRemoveEntry

export type GraphEditorHistoryState = {
  undo: GraphEditorHistoryEntry[]
  redo: GraphEditorHistoryEntry[]
  running: "undo" | "redo" | null
  error: ShellError | null
  limit: number
}

export type GraphEditorHistoryReferenceSet = {
  nodeIds: readonly string[]
  edgeIds: readonly string[]
  pathIds: readonly string[]
}

export const graphEditorHistoryLimit = 20

export const initialGraphEditorHistoryState: GraphEditorHistoryState = {
  undo: [],
  redo: [],
  running: null,
  error: null,
  limit: graphEditorHistoryLimit,
}

export function pushGraphEditorHistoryEntry(
  state: GraphEditorHistoryState,
  entry: GraphEditorHistoryEntry,
): GraphEditorHistoryState {
  if (isGraphEditorHistoryEntryNoop(entry)) return state
  const limit = normalizedHistoryLimit(state.limit)
  return {
    ...state,
    undo: [...state.undo, entry].slice(-limit),
    redo: [],
    error: null,
    limit,
  }
}

export function clearGraphEditorHistory(
  state: GraphEditorHistoryState = initialGraphEditorHistoryState,
): GraphEditorHistoryState {
  return {
    ...state,
    undo: [],
    redo: [],
    running: null,
    error: null,
  }
}

export function startGraphEditorHistoryReplay(
  state: GraphEditorHistoryState,
  direction: "undo" | "redo",
): GraphEditorHistoryState {
  return {
    ...state,
    running: direction,
    error: null,
  }
}

export function failGraphEditorHistoryReplay(
  state: GraphEditorHistoryState,
  error: ShellError,
): GraphEditorHistoryState {
  return {
    ...state,
    running: null,
    error,
  }
}

export function completeGraphEditorHistoryReplay(
  state: GraphEditorHistoryState,
  direction: "undo" | "redo",
): GraphEditorHistoryState {
  if (direction === "undo") {
    const entry = state.undo.at(-1)
    if (!entry) return { ...state, running: null }
    return {
      ...state,
      undo: state.undo.slice(0, -1),
      redo: [...state.redo, entry].slice(-normalizedHistoryLimit(state.limit)),
      running: null,
      error: null,
    }
  }
  const entry = state.redo.at(-1)
  if (!entry) return { ...state, running: null }
  return {
    ...state,
    undo: [...state.undo, entry].slice(-normalizedHistoryLimit(state.limit)),
    redo: state.redo.slice(0, -1),
    running: null,
    error: null,
  }
}

export function peekGraphEditorHistoryEntry(
  state: GraphEditorHistoryState,
  direction: "undo" | "redo",
): GraphEditorHistoryEntry | null {
  const stack = direction === "undo" ? state.undo : state.redo
  return stack.at(-1) ?? null
}

export function graphEditorHistoryReplayLabel(
  state: GraphEditorHistoryState,
  direction: "undo" | "redo",
): string | null {
  return peekGraphEditorHistoryEntry(state, direction)?.label ?? null
}

export function isGraphEditorHistoryEntryNoop(entry: GraphEditorHistoryEntry): boolean {
  if (entry.kind === "viewport") return sameViewport(entry.before, entry.after)
  if (entry.kind === "selection") return sameSelectionSnapshot(entry.before, entry.after)
  if (entry.kind === "remove") return sameGraphSnapshot(entry.before, entry.after)
  return sameNodePositionSnapshots(entry.before, entry.after)
    && sameOptionalViewport(entry.beforeViewport ?? null, entry.afterViewport ?? null)
}

export function staleGraphEditorHistoryReference(
  entry: GraphEditorHistoryEntry,
  references: GraphEditorHistoryReferenceSet,
): string | null {
  const validNodeIds = new Set(references.nodeIds)
  const validEdgeIds = new Set(references.edgeIds)
  const validPathIds = new Set(references.pathIds)
  if (entry.kind === "viewport") return null
  if (entry.kind === "remove") return null
  if (entry.kind === "selection") {
    return staleId(entry.before.nodeIds, validNodeIds, "node_id")
      ?? staleId(entry.before.edgeIds, validEdgeIds, "edge_id")
      ?? staleId(entry.before.pathIds, validPathIds, "path_id")
      ?? staleId(entry.after.nodeIds, validNodeIds, "node_id")
      ?? staleId(entry.after.edgeIds, validEdgeIds, "edge_id")
      ?? staleId(entry.after.pathIds, validPathIds, "path_id")
  }
  return staleId(entry.before.map((item) => item.nodeId), validNodeIds, "node_id")
    ?? staleId(entry.after.map((item) => item.nodeId), validNodeIds, "node_id")
}

export function snapshotGraphEditorGraph(workspace: WorkspaceSummary | null | undefined): GraphEditorGraphSnapshot {
  return {
    nodes: (workspace?.graph.nodes ?? []).map((node) => ({ ...node })),
    edges: (workspace?.graph.edges ?? []).map((edge) => ({ ...edge })),
    paths: (workspace?.graph.paths ?? []).map((path) => ({ ...path, node_ids: [...path.node_ids] })),
    activePathId: workspace?.active_path_id ?? null,
    viewport: workspace?.viewport ? normalizeGraphViewport(workspace.viewport) : null,
    selection: snapshotGraphEditorSelection(workspace?.selection),
  }
}

export function snapshotGraphEditorSelection(selection?: {
  node_ids?: string[]
  edge_ids?: string[]
  path_ids?: string[]
} | null): GraphEditorSelectionSnapshot {
  return {
    nodeIds: [...(selection?.node_ids ?? [])],
    edgeIds: [...(selection?.edge_ids ?? [])],
    pathIds: [...(selection?.path_ids ?? [])],
  }
}

export function snapshotGraphEditorNodePositions(
  nodes: readonly GraphNodeSummary[],
  nodeIds?: readonly string[],
): GraphEditorNodePositionSnapshot[] {
  const filter = nodeIds ? new Set(nodeIds) : null
  return nodes
    .filter((node) => !filter || filter.has(node.id))
    .map((node) => ({
      nodeId: node.id,
      position: tuplePosition(graphNodePosition(node)),
    }))
}

export function graphEditorHistoryTargetForReplay(
  entry: GraphEditorHistoryEntry,
  direction: "undo" | "redo",
): GraphEditorHistoryEntry["before"] {
  return direction === "undo" ? entry.before : entry.after
}

export function graphEditorHistoryViewportTargetForReplay(
  entry: GraphEditorHistoryNodeEntry,
  direction: "undo" | "redo",
): GraphViewport | null {
  return direction === "undo" ? entry.beforeViewport ?? null : entry.afterViewport ?? null
}

function sameNodePositionSnapshots(
  left: readonly GraphEditorNodePositionSnapshot[],
  right: readonly GraphEditorNodePositionSnapshot[],
): boolean {
  if (left.length !== right.length) return false
  return left.every((item, index) => {
    const other = right[index]
    return other
      && item.nodeId === other.nodeId
      && samePosition(item.position, other.position)
  })
}

function sameSelectionSnapshot(
  left: GraphEditorSelectionSnapshot,
  right: GraphEditorSelectionSnapshot,
): boolean {
  return sameStringArray(left.nodeIds, right.nodeIds)
    && sameStringArray(left.edgeIds, right.edgeIds)
    && sameStringArray(left.pathIds, right.pathIds)
}

function sameGraphSnapshot(left: GraphEditorGraphSnapshot, right: GraphEditorGraphSnapshot): boolean {
  return JSON.stringify({
    nodes: left.nodes,
    edges: left.edges,
    paths: left.paths,
    activePathId: left.activePathId ?? null,
    viewport: left.viewport ? normalizeGraphViewport(left.viewport) : null,
    selection: left.selection,
  }) === JSON.stringify({
    nodes: right.nodes,
    edges: right.edges,
    paths: right.paths,
    activePathId: right.activePathId ?? null,
    viewport: right.viewport ? normalizeGraphViewport(right.viewport) : null,
    selection: right.selection,
  })
}

function sameViewport(left: GraphViewport, right: GraphViewport): boolean {
  const normalizedLeft = normalizeGraphViewport(left)
  const normalizedRight = normalizeGraphViewport(right)
  return closeNumber(normalizedLeft.x, normalizedRight.x)
    && closeNumber(normalizedLeft.y, normalizedRight.y)
    && closeNumber(normalizedLeft.zoom, normalizedRight.zoom)
}

function sameOptionalViewport(left: GraphViewport | null, right: GraphViewport | null): boolean {
  if (!left && !right) return true
  if (!left || !right) return false
  return sameViewport(left, right)
}

function samePosition(left: [number, number], right: [number, number]): boolean {
  return closeNumber(left[0], right[0]) && closeNumber(left[1], right[1])
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function staleId(ids: readonly string[], validIds: Set<string>, target: string): string | null {
  return ids.some((id) => !validIds.has(id)) ? target : null
}

function normalizedHistoryLimit(limit: number): number {
  return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : graphEditorHistoryLimit
}

function tuplePosition(position: { x: number; y: number }): [number, number] {
  return [position.x, position.y]
}

function closeNumber(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-9
}
