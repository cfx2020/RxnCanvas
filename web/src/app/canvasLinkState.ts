import type { EdgeStepRole, FlowBarrier, FlowEdge, Point } from "../domain/projectPackages"
import { draftMatchesPointer, type CanvasPointerDraft } from "./canvasDragState"
import {
  barrierOnlySelection,
  edgeOnlySelection,
  nodeOnlySelection,
  type CanvasSelectionIds,
} from "./canvasSelectionState"

export type CanvasLinkTarget = {
  sourceId: string
  targetId: string
}

export type CanvasLinkCreation<TItem> = {
  target: CanvasLinkTarget
  items: TItem[]
  selection: CanvasSelectionIds
}

export type CompletedConnectionDraftTransition = {
  target: CanvasLinkTarget | null
  connectionDraft: null
}

export type CompletedBarrierDraftTransition = {
  creation: CanvasLinkCreation<FlowBarrier> | null
  barrierDraft: null
  inspectorMode: "inspector" | null
}

export type KeyboardConnectionEdgeTransition = {
  edge: FlowEdge
  selection: CanvasSelectionIds
  keyboardEdgeSourceId: null
  inspectorMode: "inspector"
}

export type StartConnectionDraftTransition = {
  selection: CanvasSelectionIds
  keyboardEdgeSourceId: null
  connectionDraft: CanvasPointerDraft
}

export type StartBarrierDraftTransition = {
  selection: CanvasSelectionIds
  keyboardEdgeSourceId: null
  connectionDraft: null
  barrierDraft: CanvasPointerDraft
}

export type KeyboardConnectionSourceTransition = {
  selection: CanvasSelectionIds
  keyboardEdgeSourceId: string | null
  inspectorMode: "inspector"
}

export function startConnectionDraftTransition(
  pointerId: number,
  sourceId: string,
  current: Point,
  stepRole?: Extract<EdgeStepRole, "addition">,
): StartConnectionDraftTransition {
  const connectionDraft: CanvasPointerDraft = { pointerId, sourceId, current }
  if (stepRole) connectionDraft.stepRole = stepRole
  return {
    selection: nodeOnlySelection(sourceId),
    keyboardEdgeSourceId: null,
    connectionDraft,
  }
}

export function startBarrierDraftTransition(
  pointerId: number,
  sourceId: string,
  current: Point,
): StartBarrierDraftTransition {
  return {
    selection: nodeOnlySelection(sourceId),
    keyboardEdgeSourceId: null,
    connectionDraft: null,
    barrierDraft: { pointerId, sourceId, current },
  }
}

export function keyboardConnectionSourceTransition(
  currentKeyboardEdgeSourceId: string | null,
  sourceId: string,
): KeyboardConnectionSourceTransition {
  return {
    selection: nodeOnlySelection(sourceId),
    keyboardEdgeSourceId: currentKeyboardEdgeSourceId === sourceId ? null : sourceId,
    inspectorMode: "inspector",
  }
}

export function validLinkTarget(sourceId: string | null, targetId: string | null): CanvasLinkTarget | null {
  if (!sourceId || !targetId || sourceId === targetId) return null
  return { sourceId, targetId }
}

export function linkTargetFromDraft(
  draft: CanvasPointerDraft | null,
  pointerId: number,
  targetId: string | null,
): CanvasLinkTarget | null {
  if (!draftMatchesPointer(draft, pointerId)) return null
  return validLinkTarget(draft.sourceId, targetId)
}

export function completeConnectionDraftTransition(
  draft: CanvasPointerDraft | null,
  pointerId: number,
  targetId: string | null,
): CompletedConnectionDraftTransition | null {
  if (!draftMatchesPointer(draft, pointerId)) return null
  return {
    target: validLinkTarget(draft.sourceId, targetId),
    connectionDraft: null,
  }
}

export function appendConnectionEdge(edges: FlowEdge[], id: string, target: CanvasLinkTarget, stepRole?: FlowEdge["stepRole"]): FlowEdge[] {
  const edge: FlowEdge = { id, sourceId: target.sourceId, targetId: target.targetId, label: "path" }
  if (stepRole) edge.stepRole = stepRole
  return [
    ...edges,
    edge,
  ]
}

export function createConnectionEdgeTransition(
  edges: FlowEdge[],
  id: string,
  sourceId: string,
  targetId: string,
  stepRole?: FlowEdge["stepRole"],
): CanvasLinkCreation<FlowEdge> | null {
  const target = validLinkTarget(sourceId, targetId)
  if (!target) return null
  return {
    target,
    items: appendConnectionEdge(edges, id, target, stepRole),
    selection: edgeOnlySelection(id),
  }
}

export function keyboardConnectionEdgeTransition(
  id: string,
  sourceId: string | null,
  targetId: string,
): KeyboardConnectionEdgeTransition | null {
  const target = validLinkTarget(sourceId, targetId)
  if (!target) return null
  return {
    edge: { id, sourceId: target.sourceId, targetId: target.targetId, label: "path" },
    selection: edgeOnlySelection(id),
    keyboardEdgeSourceId: null,
    inspectorMode: "inspector",
  }
}

export function appendBarrierAnnotation(
  barriers: FlowBarrier[],
  id: string,
  target: CanvasLinkTarget,
): FlowBarrier[] {
  return [
    ...barriers,
    { id, sourceId: target.sourceId, targetId: target.targetId },
  ]
}

export function createBarrierAnnotationTransition(
  barriers: FlowBarrier[],
  id: string,
  draft: CanvasPointerDraft | null,
  pointerId: number,
  targetId: string | null,
): CanvasLinkCreation<FlowBarrier> | null {
  const target = linkTargetFromDraft(draft, pointerId, targetId)
  if (!target) return null
  return {
    target,
    items: appendBarrierAnnotation(barriers, id, target),
    selection: barrierOnlySelection(id),
  }
}

export function completeBarrierDraftTransition(
  barriers: FlowBarrier[],
  id: string,
  draft: CanvasPointerDraft | null,
  pointerId: number,
  targetId: string | null,
): CompletedBarrierDraftTransition | null {
  if (!draftMatchesPointer(draft, pointerId)) return null
  const creation = createBarrierAnnotationTransition(barriers, id, draft, pointerId, targetId)
  return {
    creation,
    barrierDraft: null,
    inspectorMode: creation ? "inspector" : null,
  }
}
