import type { FlowBarrier, FlowEdge, FlowNode, Point } from "../domain/projectPackages"
import type { CanvasSelectionIds } from "./canvasSelectionState"

export type CanvasClipboardPayload = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  barriers: FlowBarrier[]
  sourceSelection: CanvasSelectionIds
}

export type CanvasClipboardCollections = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  barriers: FlowBarrier[]
}

export type PasteCanvasClipboardResult = {
  collections: CanvasClipboardCollections
  selection: CanvasSelectionIds
}

export type PasteCanvasClipboardOptions = {
  pasteIndex?: number
  offsetStep?: Point
  reservedIds?: CanvasSelectionIds
}

const defaultOffsetStep: Point = { x: 48, y: 48 }

export function selectAllCanvasItems(collections: CanvasClipboardCollections): CanvasSelectionIds {
  return {
    nodeIds: collections.nodes.map((node) => node.id),
    edgeIds: collections.edges.map((edge) => edge.id),
    barrierIds: collections.barriers.map((barrier) => barrier.id),
  }
}

export function copyCanvasSelection(
  collections: CanvasClipboardCollections,
  selection: CanvasSelectionIds,
): CanvasClipboardPayload | null {
  if (selection.nodeIds.length === 0 && selection.edgeIds.length === 0 && selection.barrierIds.length === 0) return null

  const selectedNodeIds = new Set(selection.nodeIds)
  const copiedNodes = collections.nodes.filter((node) => selectedNodeIds.has(node.id)).map(cloneNode)
  const copiedNodeIds = new Set(copiedNodes.map((node) => node.id))
  const copiedEdges = collections.edges
    .filter((edge) => copiedNodeIds.has(edge.sourceId) && copiedNodeIds.has(edge.targetId))
    .map((edge) => ({ ...edge }))
  const copiedBarriers = collections.barriers
    .filter((barrier) => copiedNodeIds.has(barrier.sourceId) && copiedNodeIds.has(barrier.targetId))
    .map((barrier) => ({ ...barrier }))

  if (copiedNodes.length === 0 && copiedEdges.length === 0 && copiedBarriers.length === 0) return null

  return {
    nodes: copiedNodes,
    edges: copiedEdges,
    barriers: copiedBarriers,
    sourceSelection: {
      nodeIds: [...selection.nodeIds],
      edgeIds: [...selection.edgeIds],
      barrierIds: [...selection.barrierIds],
    },
  }
}

export function pasteCanvasClipboard(
  collections: CanvasClipboardCollections,
  payload: CanvasClipboardPayload | null,
  options: PasteCanvasClipboardOptions = {},
): PasteCanvasClipboardResult | null {
  if (!payload || payload.nodes.length === 0) return null

  const pasteIndex = Math.max(1, Math.floor(options.pasteIndex ?? 1))
  const offsetStep = options.offsetStep ?? defaultOffsetStep
  const offset = {
    x: offsetStep.x * pasteIndex,
    y: offsetStep.y * pasteIndex,
  }
  const usedNodeIds = new Set([...collections.nodes.map((node) => node.id), ...(options.reservedIds?.nodeIds ?? [])])
  const usedEdgeIds = new Set([...collections.edges.map((edge) => edge.id), ...(options.reservedIds?.edgeIds ?? [])])
  const usedBarrierIds = new Set([...collections.barriers.map((barrier) => barrier.id), ...(options.reservedIds?.barrierIds ?? [])])
  const nodeIdMap = new Map<string, string>()

  const pastedNodes = payload.nodes.map((node) => {
    const nextId = nextAvailableId(`${node.id}-copy`, usedNodeIds)
    usedNodeIds.add(nextId)
    nodeIdMap.set(node.id, nextId)
    return {
      ...cloneNode(node),
      id: nextId,
      position: {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y,
      },
    }
  })

  const pastedEdges = payload.edges.flatMap((edge) => {
    const sourceId = nodeIdMap.get(edge.sourceId)
    const targetId = nodeIdMap.get(edge.targetId)
    if (!sourceId || !targetId) return []
    const nextId = nextAvailableId(`${edge.id}-copy`, usedEdgeIds)
    usedEdgeIds.add(nextId)
    return [{ ...edge, id: nextId, sourceId, targetId }]
  })

  const pastedBarriers = payload.barriers.flatMap((barrier) => {
    const sourceId = nodeIdMap.get(barrier.sourceId)
    const targetId = nodeIdMap.get(barrier.targetId)
    if (!sourceId || !targetId) return []
    const nextId = nextAvailableId(`${barrier.id}-copy`, usedBarrierIds)
    usedBarrierIds.add(nextId)
    return [{ ...barrier, id: nextId, sourceId, targetId }]
  })

  return {
    collections: {
      nodes: [...collections.nodes, ...pastedNodes],
      edges: [...collections.edges, ...pastedEdges],
      barriers: [...collections.barriers, ...pastedBarriers],
    },
    selection: {
      nodeIds: pastedNodes.map((node) => node.id),
      edgeIds: pastedEdges.map((edge) => edge.id),
      barrierIds: pastedBarriers.map((barrier) => barrier.id),
    },
  }
}

function cloneNode(node: FlowNode): FlowNode {
  return {
    ...node,
    position: { ...node.position },
    size: node.size ? { ...node.size } : undefined,
    corrections: node.corrections?.map((correction) => ({ ...correction })),
    energyTable: node.energyTable ? { ...node.energyTable } : node.energyTable,
  }
}

function nextAvailableId(baseId: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseId)) return baseId
  let index = 2
  while (usedIds.has(`${baseId}-${index}`)) index += 1
  return `${baseId}-${index}`
}
