import type { FlowNode, Point } from "../domain/projectPackages"
import { flowNodeSize } from "./canvasGeometry"
import type { CanvasPointerDraft } from "./canvasDragState"

export const connectionSnapRadiusPx = 44

export type ConnectionMagnetTarget = {
  targetId: string
  point: Point
  distance: number
}

export function connectionTargetAnchor(node: FlowNode): Point {
  const size = flowNodeSize(node)
  return {
    x: node.position.x,
    y: node.position.y + size.height * 0.5,
  }
}

export function nearestConnectionMagnetTarget({
  nodes,
  sourceId,
  current,
  radius,
}: {
  nodes: FlowNode[]
  sourceId: string
  current: Point
  radius: number
}): ConnectionMagnetTarget | null {
  let nearest: ConnectionMagnetTarget | null = null

  for (const node of nodes) {
    if (node.id === sourceId) continue
    const point = connectionTargetAnchor(node)
    const distance = Math.hypot(current.x - point.x, current.y - point.y)
    if (distance > radius) continue
    if (!nearest || distance < nearest.distance) {
      nearest = {
        targetId: node.id,
        point,
        distance,
      }
    }
  }

  return nearest
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
  })

  if (target) {
    return {
      ...draft,
      current: target.point,
      snapTargetId: target.targetId,
    }
  }

  const { snapTargetId: _snapTargetId, ...rest } = draft
  return {
    ...rest,
    current,
  } as TDraft
}
