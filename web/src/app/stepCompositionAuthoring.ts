import type { EdgeStepRole, FlowEdge, FlowNode, Point } from "../domain/projectPackages"
import { flowNodeSize } from "./canvasGeometry"

export type StepCompositionRole = Extract<EdgeStepRole, "addition" | "release">

export type StepCompositionDropTarget = {
  pathNodeId: string
  role: StepCompositionRole
}

export type StepCompositionDropZone = StepCompositionDropTarget & {
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
  label: string
}

export type StepCompositionAttachTransition = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  selection: {
    nodeIds: string[]
    edgeIds: string[]
    barrierIds: string[]
  }
}

const dropZoneSize = 34
const dropZoneVerticalOffset = 24

export function stepCompositionDropZones(nodes: FlowNode[], edges: FlowEdge[]): StepCompositionDropZone[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const pathNodeIds = new Set(
    edges
      .filter((edge) => isPathStepEdge(edge, nodeById))
      .flatMap((edge) => [edge.sourceId, edge.targetId]),
  )
  return Array.from(pathNodeIds).flatMap((pathNodeId) => {
    const node = nodeById.get(pathNodeId)
    if (!node) return []
    const size = flowNodeSize(node)
    return [
      {
        pathNodeId,
        role: "addition" as const,
        label: `Add before ${node.label}`,
        rect: {
          x: node.position.x - dropZoneSize / 2,
          y: node.position.y + dropZoneVerticalOffset,
          width: dropZoneSize,
          height: dropZoneSize,
        },
      },
      {
        pathNodeId,
        role: "release" as const,
        label: `Release after ${node.label}`,
        rect: {
          x: node.position.x + size.width - dropZoneSize / 2,
          y: node.position.y + dropZoneVerticalOffset,
          width: dropZoneSize,
          height: dropZoneSize,
        },
      },
    ]
  })
}

export function stepCompositionDropTargetAtPoint({
  nodes,
  edges,
  point,
  draggedNodeIds = [],
}: {
  nodes: FlowNode[]
  edges: FlowEdge[]
  point: Point
  draggedNodeIds?: string[]
}): StepCompositionDropTarget | null {
  const dragged = new Set(draggedNodeIds)
  const hits = stepCompositionDropZones(nodes, edges)
    .filter((zone) => {
      return !dragged.has(zone.pathNodeId) && pointInRect(point, zone.rect)
    })
    .sort((left, right) => rectCenterDistance(point, left.rect) - rectCenterDistance(point, right.rect))
  const hit = hits[0]
  return hit ? { pathNodeId: hit.pathNodeId, role: hit.role } : null
}

export function attachNodeToStepComposition({
  nodes,
  edges,
  nodeId,
  target,
  now = Date.now(),
}: {
  nodes: FlowNode[]
  edges: FlowEdge[]
  nodeId: string
  target: StepCompositionDropTarget
  now?: number
}): StepCompositionAttachTransition | null {
  const participant = nodes.find((node) => node.id === nodeId)
  if (!participant) return null
  if (target.pathNodeId === nodeId) return null
  if (!nodes.some((node) => node.id === target.pathNodeId && node.pathRole !== "participant")) return null

  const sourceId = target.role === "addition" ? nodeId : target.pathNodeId
  const targetId = target.role === "addition" ? target.pathNodeId : nodeId
  const existing = edges.find((edge) => (
    edge.stepRole === target.role
    && edgeConnects(edge, nodeId, target.pathNodeId)
  ))
  const sideEdge: FlowEdge = {
    id: existing?.id ?? `edge-${target.role}-${nodeId}-${target.pathNodeId}-${now}`,
    sourceId,
    targetId,
    label: "path",
    stepRole: target.role,
  }

  return {
    nodes: nodes.map((node) => node.id === nodeId ? { ...node, pathRole: "participant" } : node),
    edges: [
      ...edges.filter((edge) => !sideSpeciesEdgeInvolvingNode(edge, nodeId)),
      sideEdge,
    ],
    selection: {
      nodeIds: [nodeId],
      edgeIds: [sideEdge.id],
      barrierIds: [],
    },
  }
}

export function stepCompositionFormulaForEdge(edge: FlowEdge, nodes: FlowNode[], edges: FlowEdge[]): string | null {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  if (!isPathStepEdge(edge, nodeById)) return null
  const source = nodeById.get(edge.sourceId)
  const target = nodeById.get(edge.targetId)
  if (!source || !target) return null

  const additions = sideSpeciesLabelsForPathNode("addition", edge.targetId, nodeById, edges)
  const releases = sideSpeciesLabelsForPathNode("release", edge.sourceId, nodeById, edges)
  if (additions.length === 0 && releases.length === 0) return null

  return `${[source.label, ...additions].join(" + ")} -> ${[target.label, ...releases].join(" + ")}`
}

function isPathStepEdge(edge: FlowEdge, nodeById: Map<string, FlowNode>): boolean {
  if (edge.stepRole === "addition" || edge.stepRole === "release") return false
  const source = nodeById.get(edge.sourceId)
  const target = nodeById.get(edge.targetId)
  return Boolean(source && target && source.pathRole !== "participant" && target.pathRole !== "participant")
}

function sideSpeciesLabelsForPathNode(
  role: StepCompositionRole,
  pathNodeId: string,
  nodeById: Map<string, FlowNode>,
  edges: FlowEdge[],
): string[] {
  const labels: string[] = []
  const seen = new Set<string>()
  for (const edge of edges) {
    if (edge.stepRole !== role) continue
    if (role === "addition" && edge.targetId !== pathNodeId) continue
    if (role === "release" && edge.sourceId !== pathNodeId) continue
    const source = nodeById.get(edge.sourceId)
    const target = nodeById.get(edge.targetId)
    const participant = source?.pathRole === "participant" ? source : target?.pathRole === "participant" ? target : null
    const pathNode = source?.id === pathNodeId ? source : target?.id === pathNodeId ? target : null
    if (!participant || !pathNode || seen.has(participant.id)) continue
    seen.add(participant.id)
    labels.push(participant.label)
  }
  return labels
}

function sideSpeciesEdgeInvolvingNode(edge: FlowEdge, nodeId: string): boolean {
  return (edge.stepRole === "addition" || edge.stepRole === "release")
    && (edge.sourceId === nodeId || edge.targetId === nodeId)
}

function edgeConnects(edge: FlowEdge, leftId: string, rightId: string): boolean {
  return (edge.sourceId === leftId && edge.targetId === rightId)
    || (edge.sourceId === rightId && edge.targetId === leftId)
}

function pointInRect(point: Point, rect: StepCompositionDropZone["rect"]): boolean {
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height
}

function rectCenterDistance(point: Point, rect: StepCompositionDropZone["rect"]): number {
  const dx = point.x - (rect.x + rect.width / 2)
  const dy = point.y - (rect.y + rect.height / 2)
  return Math.hypot(dx, dy)
}
