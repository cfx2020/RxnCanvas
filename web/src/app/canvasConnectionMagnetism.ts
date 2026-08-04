import type { EdgeStepRole, FlowNode, Point } from "../domain/projectPackages"
import { stepConnectorOffsetY } from "./canvasDrawing"
import { flowNodeSize } from "./canvasGeometry"
import type { CanvasPointerDraft } from "./canvasDragState"

export const connectionSnapRadiusPx = 44

export type ConnectionMagnetTarget = {
  targetId: string
  point: Point
  distance: number
  stepRole?: Extract<EdgeStepRole, "release">
}

export function connectionTargetAnchor(node: FlowNode, stepRole?: Extract<EdgeStepRole, "release">): Point {
  const size = flowNodeSize(node)
  return {
    x: node.position.x,
    y: node.position.y + size.height * 0.5 - (stepRole === "release" ? stepConnectorOffsetY : 0),
  }
}

export function nearestConnectionMagnetTarget({
  nodes,
  sourceId,
  current,
  radius,
  sourceStepRole,
}: {
  nodes: FlowNode[]
  sourceId: string
  current: Point
  radius: number
  sourceStepRole?: Extract<EdgeStepRole, "addition">
}): ConnectionMagnetTarget | null {
  let nearest: ConnectionMagnetTarget | null = null

  for (const node of nodes) {
    if (node.id === sourceId) continue
    for (const candidate of connectionMagnetCandidates(node, sourceStepRole)) {
      const distance = Math.hypot(current.x - candidate.point.x, current.y - candidate.point.y)
      if (distance > radius) continue
      if (
        !nearest
        || distance < nearest.distance
        || (distance === nearest.distance && candidate.stepRole === "release" && nearest.stepRole !== "release")
      ) {
        nearest = {
          targetId: node.id,
          point: candidate.point,
          distance,
          stepRole: candidate.stepRole,
        }
      }
    }
  }

  return nearest
}

function connectionMagnetCandidates(
  node: FlowNode,
  sourceStepRole?: Extract<EdgeStepRole, "addition">,
): Array<{ point: Point; stepRole?: Extract<EdgeStepRole, "release"> }> {
  const candidates: Array<{ point: Point; stepRole?: Extract<EdgeStepRole, "release"> }> = []
  if (sourceStepRole !== "addition") {
    candidates.push({ point: connectionTargetAnchor(node, "release"), stepRole: "release" })
  }
  candidates.push({ point: connectionTargetAnchor(node) })
  return candidates
}

export function updateConnectionDraftWithMagnetTarget<TDraft extends CanvasPointerDraft>({
  draft,
  pointerId,
  current,
  nodes,
  radius,
}: {
  draft: TDraft | null
  pointerId: number
  current: Point
  nodes: FlowNode[]
  radius: number
}): TDraft | null {
  if (draft?.pointerId !== pointerId) return draft

  const target = nearestConnectionMagnetTarget({
    nodes,
    sourceId: draft.sourceId,
    current,
    radius,
    sourceStepRole: draft.stepRole,
  })

  if (target) {
    const { snapStepRole: _previousSnapStepRole, ...draftWithoutStepRole } = draft
    return {
      ...draftWithoutStepRole,
      current: target.point,
      snapTargetId: target.targetId,
      ...(target.stepRole ? { snapStepRole: target.stepRole } : {}),
    } as TDraft
  }

  const { snapTargetId: _snapTargetId, snapStepRole: _snapStepRole, ...rest } = draft
  return {
    ...rest,
    current,
  } as TDraft
}
