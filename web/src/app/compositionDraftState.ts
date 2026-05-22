import type { GraphNodeSummary, ReactionNodeCompositionTermSummary, WorkspaceSummary } from "../shell"

export type CompositionDraftRow = {
  objectId: string
  coefficient: string
  role: string
  label: string
}

export type CompositionDraftState = {
  nodeId: string | null
  rows: CompositionDraftRow[]
  dirty: boolean
}

export const initialCompositionDraftState: CompositionDraftState = {
  nodeId: null,
  rows: [],
  dirty: false,
}

export function compositionDraftFromSelectedNode(
  workspace: WorkspaceSummary | undefined,
): CompositionDraftState {
  const selectedNodeId = singleSelectedNodeId(workspace)
  if (!workspace || !selectedNodeId) return initialCompositionDraftState
  const node = workspace.graph.nodes.find((item) => item.id === selectedNodeId)
  if (!node) return initialCompositionDraftState
  return compositionDraftFromNode(node)
}

export function compositionDraftFromNode(node: GraphNodeSummary): CompositionDraftState {
  return {
    nodeId: node.id,
    rows: compositionRowsFromNode(node),
    dirty: false,
  }
}

export function reconcileCompositionDraft(
  current: CompositionDraftState,
  workspace: WorkspaceSummary | undefined,
): CompositionDraftState {
  const selectedNodeId = singleSelectedNodeId(workspace)
  if (!workspace || !selectedNodeId) return initialCompositionDraftState
  const node = workspace.graph.nodes.find((item) => item.id === selectedNodeId)
  if (!node) return initialCompositionDraftState
  if (current.nodeId !== node.id) {
    return compositionDraftFromNode(node)
  }
  if (current.dirty) {
    return current
  }
  const next = compositionDraftFromNode(node)
  return compositionDraftEquals(current, next) ? current : next
}

export function compositionDraftEquals(
  left: CompositionDraftState,
  right: CompositionDraftState,
): boolean {
  if (left.nodeId !== right.nodeId || left.dirty !== right.dirty || left.rows.length !== right.rows.length) {
    return false
  }
  return left.rows.every((row, index) => compositionDraftRowEquals(row, right.rows[index]))
}

export function updateCompositionDraftRow(
  current: CompositionDraftState,
  index: number,
  field: keyof CompositionDraftRow,
  value: string,
): CompositionDraftState {
  if (!current.nodeId || index < 0 || index >= current.rows.length) return current
  return {
    ...current,
    rows: current.rows.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )),
    dirty: true,
  }
}

export function addCompositionDraftRow(
  current: CompositionDraftState,
  objectId: string,
): CompositionDraftState {
  if (!current.nodeId || !objectId) return current
  return {
    ...current,
    rows: [
      ...current.rows,
      {
        objectId,
        coefficient: "1",
        role: "",
        label: "",
      },
    ],
    dirty: true,
  }
}

export function removeCompositionDraftRow(
  current: CompositionDraftState,
  index: number,
): CompositionDraftState {
  if (!current.nodeId || index < 0 || index >= current.rows.length) return current
  return {
    ...current,
    rows: current.rows.filter((_, rowIndex) => rowIndex !== index),
    dirty: true,
  }
}

function compositionRowsFromNode(node: GraphNodeSummary): CompositionDraftRow[] {
  const composition = node.composition?.length
    ? node.composition
    : compositionFromObjectIds(node.chemical_object_ids ?? [])
  return composition.map(compositionRowFromTerm)
}

function singleSelectedNodeId(workspace: WorkspaceSummary | undefined): string | null {
  const selection = workspace?.selection
  if (!selection) return null
  if (selection.node_ids.length !== 1 || selection.edge_ids.length !== 0 || selection.path_ids.length !== 0) {
    return null
  }
  return selection.node_ids[0]
}

function compositionFromObjectIds(objectIds: string[]): ReactionNodeCompositionTermSummary[] {
  return objectIds.map((objectId) => ({
    object_id: objectId,
    coefficient: 1,
    role: null,
    label: null,
    metadata: {},
  }))
}

function compositionRowFromTerm(term: ReactionNodeCompositionTermSummary): CompositionDraftRow {
  return {
    objectId: term.object_id,
    coefficient: String(term.coefficient),
    role: term.role ?? "",
    label: term.label ?? "",
  }
}

function compositionDraftRowEquals(
  left: CompositionDraftRow,
  right: CompositionDraftRow | undefined,
): boolean {
  if (!right) return false
  return left.objectId === right.objectId
    && left.coefficient === right.coefficient
    && left.role === right.role
    && left.label === right.label
}
