import type { CanvasViewport, FlowNode, NodeSize, Point } from "../domain/projectPackages"
import {
  flowNodeSize,
  nodeContainedInSelectionRect,
  nodeDragPosition,
  type CanvasSelectionRect,
} from "./canvasGeometry"
import type { CanvasEditSnapshot } from "./projectWorkspace"
import {
  toggleIdSelection,
  uniqueIds,
  type CanvasSelectionIds,
} from "./canvasSelectionState"

export type CanvasTool = "select" | "pan"

export type CanvasPointerDraft = {
  pointerId: number
  sourceId: string
  current: Point
  snapTargetId?: string
  snapTargetSide?: "left" | "right"
  snapStepRole?: "release"
  stepRole?: "addition"
}

export type CanvasNodeDragSubject = {
  nodeId: string
  origin: Point
}

export type CanvasNodeDragPosition = {
  nodeId: string
  position: Point
}

export type CanvasNodeDragMode = "move" | "copy"

export type CanvasDragState<TSnapshot = unknown> =
  | { kind: "pan"; pointerId: number; start: Point; origin: Point }
  | {
    kind: "node"
    pointerId: number
    nodeId: string
    start: Point
    subjects: CanvasNodeDragSubject[]
    mode: CanvasNodeDragMode
    snapshot: TSnapshot
  }
  | { kind: "rubber"; pointerId: number; start: Point; current: Point; additive: boolean }

export type CanvasSurfaceDragState = Extract<CanvasDragState, { kind: "pan" | "rubber" }>

export type CanvasDragMove<TSnapshot = unknown> =
  | { kind: "none" }
  | { kind: "pan"; drag: Extract<CanvasDragState<TSnapshot>, { kind: "pan" }>; clientPoint: Point }
  | { kind: "rubber"; drag: Extract<CanvasDragState<TSnapshot>, { kind: "rubber" }> }
  | { kind: "node"; positions: CanvasNodeDragPosition[]; mode: CanvasNodeDragMode }

export type CanvasPointerMove<TSnapshot = unknown> =
  | CanvasDragMove<TSnapshot>
  | { kind: "connection-draft"; connectionDraft: CanvasPointerDraft | null }
  | { kind: "barrier-draft"; barrierDraft: CanvasPointerDraft | null }

export type CanvasSurfacePointerDown =
  | { kind: "clear-connection-draft"; connectionDraft: null }
  | { kind: "clear-barrier-draft"; barrierDraft: null }
  | { kind: "surface-drag"; dragState: CanvasSurfaceDragState }

export type CanvasNodePointerDown<TSnapshot extends Pick<CanvasEditSnapshot, "nodes">> = {
  selection: CanvasSelectionIds
  inspectorMode: "inspector"
  dragState: Extract<CanvasDragState<TSnapshot>, { kind: "node" }>
}

export type FinishedNodeDrag<TSnapshot extends Pick<CanvasEditSnapshot, "nodes">> = {
  positions: CanvasNodeDragPosition[]
  mode: CanvasNodeDragMode
  snapshot: TSnapshot
  moved: boolean
}

export type FinishedRubberBandSelection = {
  selectedIds: string[]
  selection: CanvasSelectionIds
  shouldInspect: boolean
}

export type FinishedCanvasDrag<TSnapshot extends Pick<CanvasEditSnapshot, "nodes">> = {
  nodeDrag: FinishedNodeDrag<TSnapshot> | null
  rubberBand: FinishedRubberBandSelection | null
  dragState: null
  inspectorMode: "inspector" | null
}

export type NudgeSelectedNodesTransition = {
  nodes: FlowNode[]
}

export function canvasDragStateFromPointer({
  tool,
  pointerId,
  clientPoint,
  worldPoint,
  viewport,
  additive,
}: {
  tool: CanvasTool
  pointerId: number
  clientPoint: Point
  worldPoint: Point
  viewport: CanvasViewport
  additive: boolean
}): CanvasSurfaceDragState {
  if (tool === "select") {
    return {
      kind: "rubber",
      pointerId,
      start: worldPoint,
      current: worldPoint,
      additive,
    }
  }

  return {
    kind: "pan",
    pointerId,
    start: clientPoint,
    origin: { x: viewport.x, y: viewport.y },
  }
}

export function canvasSurfacePointerDownTransition({
  connectionDraft,
  barrierDraft,
  tool,
  pointerId,
  clientPoint,
  worldPoint,
  viewport,
  additive,
}: {
  connectionDraft: CanvasPointerDraft | null
  barrierDraft: CanvasPointerDraft | null
  tool: CanvasTool
  pointerId: number
  clientPoint: Point
  worldPoint: Point
  viewport: CanvasViewport
  additive: boolean
}): CanvasSurfacePointerDown {
  if (connectionDraft) return { kind: "clear-connection-draft", connectionDraft: null }
  if (barrierDraft) return { kind: "clear-barrier-draft", barrierDraft: null }
  return {
    kind: "surface-drag",
    dragState: canvasDragStateFromPointer({
      tool,
      pointerId,
      clientPoint,
      worldPoint,
      viewport,
      additive,
    }),
  }
}

export function canvasNodePointerDownTransition<TSnapshot extends Pick<CanvasEditSnapshot, "nodes">>({
  currentSelection,
  node,
  pointerId,
  worldPoint,
  additive,
  snapshotForSelection,
}: {
  currentSelection: CanvasSelectionIds
  node: Pick<FlowNode, "id" | "position">
  pointerId: number
  worldPoint: Point
  additive: boolean
  snapshotForSelection: (selection: CanvasSelectionIds) => TSnapshot
}): CanvasNodePointerDown<TSnapshot> {
  const selection = nodeDragStartSelection(currentSelection, node.id, additive)
  const snapshot = snapshotForSelection(selection)
  return {
    selection,
    inspectorMode: "inspector",
    dragState: {
      kind: "node",
      pointerId,
      nodeId: node.id,
      start: worldPoint,
      subjects: nodeDragSubjects(snapshot.nodes, selection, node),
      mode: "move",
      snapshot,
    },
  }
}

export function nodeDragStartSelection(
  currentSelection: CanvasSelectionIds,
  nodeId: string,
  additive: boolean,
): CanvasSelectionIds {
  const nodeIds = additive
    ? toggleIdSelection(currentSelection.nodeIds, nodeId)
    : currentSelection.nodeIds.includes(nodeId)
      ? currentSelection.nodeIds
      : [nodeId]
  return {
    nodeIds,
    edgeIds: additive || currentSelection.nodeIds.includes(nodeId) ? currentSelection.edgeIds : [],
    barrierIds: additive || currentSelection.nodeIds.includes(nodeId) ? currentSelection.barrierIds : [],
  }
}

export function canvasDragMoveForPointer<TSnapshot>(
  drag: CanvasDragState<TSnapshot> | null,
  pointerId: number,
  clientPoint: Point,
  worldPoint: Point,
): CanvasDragMove<TSnapshot> {
  if (!drag || drag.pointerId !== pointerId) return { kind: "none" }
  if (drag.kind === "pan") return { kind: "pan", drag, clientPoint }
  if (drag.kind === "rubber") return { kind: "rubber", drag: { ...drag, current: worldPoint } }
  return {
    kind: "node",
    positions: nodeDragPositions(drag, worldPoint),
    mode: drag.mode,
  }
}

export function canvasPointerMoveTransition<TSnapshot>({
  connectionDraft,
  barrierDraft,
  dragState,
  pointerId,
  clientPoint,
  worldPoint,
}: {
  connectionDraft: CanvasPointerDraft | null
  barrierDraft: CanvasPointerDraft | null
  dragState: CanvasDragState<TSnapshot> | null
  pointerId: number
  clientPoint: Point
  worldPoint: Point
}): CanvasPointerMove<TSnapshot> {
  if (connectionDraft?.pointerId === pointerId) {
    return {
      kind: "connection-draft",
      connectionDraft: updateDraftCurrentForPointer(connectionDraft, pointerId, worldPoint),
    }
  }
  if (barrierDraft?.pointerId === pointerId) {
    return {
      kind: "barrier-draft",
      barrierDraft: updateDraftCurrentForPointer(barrierDraft, pointerId, worldPoint),
    }
  }
  return canvasDragMoveForPointer(dragState, pointerId, clientPoint, worldPoint)
}

export function finishNodeDragForPointer<TSnapshot extends Pick<CanvasEditSnapshot, "nodes">>(
  drag: CanvasDragState<TSnapshot> | null,
  pointerId: number,
  worldPoint: Point,
): FinishedNodeDrag<TSnapshot> | null {
  if (!drag || drag.pointerId !== pointerId || drag.kind !== "node") return null
  const positions = nodeDragPositions(drag, worldPoint, true)
  return {
    positions,
    mode: drag.mode,
    snapshot: drag.snapshot,
    moved: nodeDragPositionsMoved(drag.snapshot, positions),
  }
}

export function canvasSelectionRectFromPoints(start: Point, current: Point): CanvasSelectionRect {
  const x = Math.min(start.x, current.x)
  const y = Math.min(start.y, current.y)
  return {
    x,
    y,
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  }
}

export function canvasSelectionRectIsClick(rect: CanvasSelectionRect): boolean {
  return rect.width < 6 && rect.height < 6
}

export function finishRubberBandSelectionForPointer(
  drag: CanvasDragState | null,
  pointerId: number,
  releasePoint: Point,
  nodes: FlowNode[],
  currentSelection: CanvasSelectionIds,
): FinishedRubberBandSelection | null {
  if (!drag || drag.pointerId !== pointerId || drag.kind !== "rubber") return null
  const rect = canvasSelectionRectFromPoints(drag.start, releasePoint)
  const selectedIds = canvasSelectionRectIsClick(rect) ? [] : nodeIdsInSelectionRect(nodes, rect)
  return {
    selectedIds,
    selection: {
      nodeIds: rubberBandSelection(drag.additive ? currentSelection.nodeIds : [], selectedIds, drag.additive),
      edgeIds: drag.additive ? currentSelection.edgeIds : [],
      barrierIds: drag.additive ? currentSelection.barrierIds : [],
    },
    shouldInspect: selectedIds.length > 0 || !drag.additive,
  }
}

export function finishCanvasDragTransition<TSnapshot extends Pick<CanvasEditSnapshot, "nodes">>(
  drag: CanvasDragState<TSnapshot> | null,
  pointerId: number,
  releasePoint: Point,
  nodes: FlowNode[],
  currentSelection: CanvasSelectionIds,
): FinishedCanvasDrag<TSnapshot> | null {
  if (!drag || drag.pointerId !== pointerId) return null
  const rubberBand = finishRubberBandSelectionForPointer(drag, pointerId, releasePoint, nodes, currentSelection)
  return {
    nodeDrag: finishNodeDragForPointer(drag, pointerId, releasePoint),
    rubberBand,
    dragState: null,
    inspectorMode: rubberBand?.shouldInspect ? "inspector" : null,
  }
}

export function nudgeFlowNodes(
  nodes: FlowNode[],
  selectedNodeIds: string[],
  delta: Point,
): { nodes: FlowNode[]; changed: boolean } {
  if (selectedNodeIds.length === 0) return { nodes, changed: false }

  const selectedNodeIdSet = new Set(selectedNodeIds)
  let changed = false
  const nextNodes = nodes.map((node) => {
    if (!selectedNodeIdSet.has(node.id)) return node
    changed = true
    return {
      ...node,
      position: {
        x: node.position.x + delta.x,
        y: node.position.y + delta.y,
      },
    }
  })

  return { nodes: changed ? nextNodes : nodes, changed }
}

export function nudgeSelectedNodesTransition(
  nodes: FlowNode[],
  selectedNodeIds: string[],
  delta: Point,
): NudgeSelectedNodesTransition | null {
  const result = nudgeFlowNodes(nodes, selectedNodeIds, delta)
  return result.changed ? { nodes: result.nodes } : null
}

export function applyNodePosition(nodes: FlowNode[], nodeId: string, position: Point): FlowNode[] {
  return nodes.map((node) => (
    node.id === nodeId
      ? { ...node, position }
      : node
  ))
}

export function applyNodePositions(nodes: FlowNode[], positions: CanvasNodeDragPosition[]): FlowNode[] {
  if (positions.length === 0) return nodes
  const positionByNodeId = new Map(positions.map((item) => [item.nodeId, item.position]))
  return nodes.map((node) => {
    const position = positionByNodeId.get(node.id)
    return position ? { ...node, position } : node
  })
}

export function applyNodeSize(nodes: FlowNode[], nodeId: string, size: NodeSize): FlowNode[] {
  return nodes.map((node) => (
    node.id === nodeId
      ? { ...node, size }
      : node
  ))
}

export function nodeDragMoved(
  snapshot: Pick<CanvasEditSnapshot, "nodes">,
  nodeId: string,
  finalPosition: Point,
): boolean {
  const previousPosition = snapshot.nodes.find((node) => node.id === nodeId)?.position
  return !previousPosition
    || previousPosition.x !== finalPosition.x
    || previousPosition.y !== finalPosition.y
}

export function nodeDragPositions(
  drag: Extract<CanvasDragState, { kind: "node" }>,
  worldPoint: Point,
  snap = false,
): CanvasNodeDragPosition[] {
  return drag.subjects.map((subject) => ({
    nodeId: subject.nodeId,
    position: nodeDragPosition({ start: drag.start, origin: subject.origin }, worldPoint, snap),
  }))
}

export function nodeDragPositionsMoved(
  snapshot: Pick<CanvasEditSnapshot, "nodes">,
  positions: CanvasNodeDragPosition[],
): boolean {
  if (positions.length === 0) return false
  return positions.some(({ nodeId, position }) => nodeDragMoved(snapshot, nodeId, position))
}

export function nodeDragSubjects(
  nodes: Pick<FlowNode, "id" | "position">[],
  selection: CanvasSelectionIds,
  node: Pick<FlowNode, "id" | "position">,
): CanvasNodeDragSubject[] {
  const nodeById = new Map(nodes.map((item) => [item.id, item]))
  const subjectIds = selection.nodeIds.includes(node.id) ? selection.nodeIds : [node.id]
  const subjects = subjectIds.flatMap((nodeId) => {
    const subjectNode = nodeById.get(nodeId)
    return subjectNode ? [{ nodeId, origin: subjectNode.position }] : []
  })
  return subjects.length > 0 ? subjects : [{ nodeId: node.id, origin: node.position }]
}

export function nodeSizeChanged(
  snapshot: Pick<CanvasEditSnapshot, "nodes">,
  nodeId: string,
  finalSize: NodeSize,
): boolean {
  const previousNode = snapshot.nodes.find((node) => node.id === nodeId)
  if (!previousNode) return true
  const previousSize = flowNodeSize(previousNode)
  return previousSize.width !== finalSize.width || previousSize.height !== finalSize.height
}

export function nodeIdsInSelectionRect(nodes: FlowNode[], rect: CanvasSelectionRect): string[] {
  return nodes.filter((node) => nodeContainedInSelectionRect(node, rect)).map((node) => node.id)
}

export function rubberBandSelection(
  currentNodeIds: string[],
  selectedNodeIds: string[],
  additive: boolean,
): string[] {
  return additive ? uniqueIds([...currentNodeIds, ...selectedNodeIds]) : selectedNodeIds
}

export function draftMatchesPointer(draft: CanvasPointerDraft | null, pointerId: number): draft is CanvasPointerDraft {
  return draft?.pointerId === pointerId
}

export function updateDraftCurrentForPointer<TDraft extends CanvasPointerDraft>(
  draft: TDraft | null,
  pointerId: number,
  current: Point,
): TDraft | null {
  return draftMatchesPointer(draft, pointerId) ? { ...draft, current } : draft
}
