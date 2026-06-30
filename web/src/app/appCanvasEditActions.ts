import type { EdgeStepRole, FlowBarrier, FlowEdge, FlowNode, ManualStructurePayload, NodeKind, NodePathRole, Point } from "../domain/projectPackages"
import {
  appendCanvasEditHistory,
  redoCanvasEditHistory,
  undoCanvasEditHistory,
} from "./canvasEditHistory"
import {
  clearCanvasInteractionTransition,
  deleteCanvasSelectionTransition,
  nudgeSelectedNodesTransition,
  updateBarrierLabelTransition,
  updateEdgeLabelTransition,
  updateEdgeStepRoleTransition,
  updateNodeCoefficientTransition,
  updateNodeKindTransition,
  updateNodeManualStructureTransition,
  updateNodePathRoleTransition,
  type CanvasSelectionIds,
} from "./canvasEditState"
import type { CanvasEditSnapshot } from "./projectWorkspace"
import {
  applyCanvasEditSnapshotRestoreState,
  applyCanvasSelectionState,
  type ProjectWorkspaceStateSetters,
  type Setter,
} from "./appStateAppliers"
import {
  applyFlowBarrierCollectionUpdateState,
  applyFlowEdgeCollectionUpdateState,
  applyFlowNodeCollectionUpdateState,
} from "./appSelectionAppliers"

export type CanvasEditHistorySetters = {
  setHistoryPast: Setter<CanvasEditSnapshot[]>
  setHistoryFuture: Setter<CanvasEditSnapshot[]>
}

export type PushCanvasEditHistory = (snapshot?: CanvasEditSnapshot) => void

export function clearCanvasEditHistoryState(setters: CanvasEditHistorySetters): void {
  setters.setHistoryPast([])
  setters.setHistoryFuture([])
}

export function pushCanvasEditHistoryState(
  setters: CanvasEditHistorySetters,
  snapshot: CanvasEditSnapshot,
): void {
  setters.setHistoryPast((current) => appendCanvasEditHistory(current, snapshot))
  setters.setHistoryFuture([])
}

export function undoCanvasEditAction({
  historyPast,
  historyFuture,
  currentSnapshot,
  setters,
  appStateSetters,
}: {
  historyPast: CanvasEditSnapshot[]
  historyFuture: CanvasEditSnapshot[]
  currentSnapshot: CanvasEditSnapshot
  setters: CanvasEditHistorySetters
  appStateSetters: ProjectWorkspaceStateSetters
}): void {
  const transition = undoCanvasEditHistory({ past: historyPast, future: historyFuture }, currentSnapshot)
  if (!transition) return
  setters.setHistoryPast(transition.past)
  setters.setHistoryFuture(transition.future)
  applyCanvasEditSnapshotRestoreState(appStateSetters, transition.snapshot)
}

export function redoCanvasEditAction({
  historyPast,
  historyFuture,
  currentSnapshot,
  setters,
  appStateSetters,
}: {
  historyPast: CanvasEditSnapshot[]
  historyFuture: CanvasEditSnapshot[]
  currentSnapshot: CanvasEditSnapshot
  setters: CanvasEditHistorySetters
  appStateSetters: ProjectWorkspaceStateSetters
}): void {
  const transition = redoCanvasEditHistory({ past: historyPast, future: historyFuture }, currentSnapshot)
  if (!transition) return
  setters.setHistoryPast(transition.past)
  setters.setHistoryFuture(transition.future)
  applyCanvasEditSnapshotRestoreState(appStateSetters, transition.snapshot)
}

export function updateEdgeLabelAction({
  edges,
  edgeId,
  label,
  appStateSetters,
  pushEditHistory,
}: {
  edges: FlowEdge[]
  edgeId: string
  label: string
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
}): void {
  const transition = updateEdgeLabelTransition(edges, edgeId, label)
  if (!transition) return
  pushEditHistory()
  applyFlowEdgeCollectionUpdateState(appStateSetters, transition)
}

export function updateEdgeStepRoleAction({
  edges,
  edgeId,
  stepRole,
  appStateSetters,
  pushEditHistory,
}: {
  edges: FlowEdge[]
  edgeId: string
  stepRole: EdgeStepRole
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
}): void {
  const transition = updateEdgeStepRoleTransition(edges, edgeId, stepRole)
  if (!transition) return
  pushEditHistory()
  applyFlowEdgeCollectionUpdateState(appStateSetters, transition)
}

export function updateBarrierLabelAction({
  barriers,
  barrierId,
  label,
  appStateSetters,
  pushEditHistory,
}: {
  barriers: FlowBarrier[]
  barrierId: string
  label: string | null
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
}): void {
  const transition = updateBarrierLabelTransition(barriers, barrierId, label)
  if (!transition) return
  pushEditHistory()
  applyFlowBarrierCollectionUpdateState(appStateSetters, transition)
}

export function updateNodeCoefficientAction({
  nodes,
  nodeId,
  coefficient,
  appStateSetters,
  pushEditHistory,
}: {
  nodes: FlowNode[]
  nodeId: string
  coefficient: number
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
}): void {
  const transition = updateNodeCoefficientTransition(nodes, nodeId, coefficient)
  if (!transition) return
  pushEditHistory()
  applyFlowNodeCollectionUpdateState(appStateSetters, transition)
}

export function updateNodePathRoleAction({
  nodes,
  nodeId,
  pathRole,
  appStateSetters,
  pushEditHistory,
}: {
  nodes: FlowNode[]
  nodeId: string
  pathRole: NodePathRole
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
}): void {
  const transition = updateNodePathRoleTransition(nodes, nodeId, pathRole)
  if (!transition) return
  pushEditHistory()
  applyFlowNodeCollectionUpdateState(appStateSetters, transition)
}

export function updateNodeKindAction({
  nodes,
  nodeId,
  kind,
  appStateSetters,
  pushEditHistory,
}: {
  nodes: FlowNode[]
  nodeId: string
  kind: NodeKind
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
}): void {
  const transition = updateNodeKindTransition(nodes, nodeId, kind)
  if (!transition) return
  pushEditHistory()
  applyFlowNodeCollectionUpdateState(appStateSetters, transition)
}

export function updateNodeManualStructureAction({
  nodes,
  nodeId,
  structure,
  appStateSetters,
  pushEditHistory,
}: {
  nodes: FlowNode[]
  nodeId: string
  structure: ManualStructurePayload | null
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
}): void {
  const transition = updateNodeManualStructureTransition(nodes, nodeId, structure)
  if (!transition) return
  pushEditHistory()
  applyFlowNodeCollectionUpdateState(appStateSetters, transition)
}

export function clearCanvasSelectionAction(appStateSetters: ProjectWorkspaceStateSetters): void {
  const transition = clearCanvasInteractionTransition()
  applyCanvasSelectionState(appStateSetters, transition.selection)
  appStateSetters.setKeyboardEdgeSourceId(transition.keyboardEdgeSourceId)
  appStateSetters.setConnectionDraft(transition.connectionDraft)
  appStateSetters.setBarrierDraft(transition.barrierDraft)
}

export function nudgeSelectedNodesAction({
  nodes,
  selectedNodeIds,
  delta,
  appStateSetters,
  pushEditHistory,
}: {
  nodes: FlowNode[]
  selectedNodeIds: string[]
  delta: Point
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
}): void {
  const transition = nudgeSelectedNodesTransition(nodes, selectedNodeIds, delta)
  if (!transition) return
  pushEditHistory()
  appStateSetters.setNodes(transition.nodes)
}

export function deleteCanvasSelectionAction({
  nodes,
  edges,
  barriers,
  selection,
  appStateSetters,
  pushEditHistory,
}: {
  nodes: FlowNode[]
  edges: FlowEdge[]
  barriers: FlowBarrier[]
  selection: CanvasSelectionIds
  appStateSetters: ProjectWorkspaceStateSetters
  pushEditHistory: PushCanvasEditHistory
}): void {
  const transition = deleteCanvasSelectionTransition({ nodes, edges, barriers }, selection)
  if (!transition) return
  pushEditHistory()
  appStateSetters.setNodes(transition.collections.nodes)
  appStateSetters.setEdges(transition.collections.edges)
  appStateSetters.setBarriers(transition.collections.barriers)
  applyCanvasSelectionState(appStateSetters, transition.interaction.selection)
  appStateSetters.setKeyboardEdgeSourceId(transition.interaction.keyboardEdgeSourceId)
  appStateSetters.setConnectionDraft(transition.interaction.connectionDraft)
  appStateSetters.setBarrierDraft(transition.interaction.barrierDraft)
}
