export const flowNodeHitTargetSelector = "[data-flow-node-id]"

export type ElementsFromPointTarget = {
  elementsFromPoint?: (x: number, y: number) => Element[]
}

export function flowNodeIdFromElementStack(
  elements: Element[],
  excludedNodeId: string,
  knownNodeIds: ReadonlySet<string>,
): string | null {
  for (const element of elements) {
    const nodeElement = element.closest?.(flowNodeHitTargetSelector) as HTMLElement | null
    const nodeId = nodeElement?.dataset.flowNodeId
    if (nodeId && nodeId !== excludedNodeId && knownNodeIds.has(nodeId)) return nodeId
  }
  return null
}

export function flowNodeIdAtClientPoint(
  target: ElementsFromPointTarget,
  clientX: number,
  clientY: number,
  excludedNodeId: string,
  knownNodeIds: ReadonlySet<string>,
): string | null {
  return flowNodeIdFromElementStack(
    target.elementsFromPoint?.(clientX, clientY) ?? [],
    excludedNodeId,
    knownNodeIds,
  )
}
