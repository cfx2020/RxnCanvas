import type { CanvasViewport, FlowBarrier, FlowEdge, FlowNode, RxnFlowProjectCanvas } from "../domain/projectPackages"

export type CanvasTabSnapshot = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  barriers: FlowBarrier[]
  viewport: CanvasViewport
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  selectedBarrierIds: string[]
}

export type CanvasTabState = {
  id: string
  label: string
  snapshot: CanvasTabSnapshot | null
}

export function initialCanvasTabs(): CanvasTabState[] {
  return [{ id: "canvas-1", label: "画布 1", snapshot: null }]
}

export function canvasTabSnapshotFromState(snapshot: CanvasTabSnapshot): CanvasTabSnapshot {
  return {
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    barriers: snapshot.barriers,
    viewport: snapshot.viewport,
    selectedNodeIds: snapshot.selectedNodeIds,
    selectedEdgeIds: snapshot.selectedEdgeIds,
    selectedBarrierIds: snapshot.selectedBarrierIds,
  }
}

export function switchCanvasTabState({
  tabs,
  activeTabId,
  nextTabId,
  currentSnapshot,
}: {
  tabs: CanvasTabState[]
  activeTabId: string
  nextTabId: string
  currentSnapshot: CanvasTabSnapshot
}): { tabs: CanvasTabState[]; activeTabId: string; snapshotToApply: CanvasTabSnapshot } | null {
  if (nextTabId === activeTabId) return null
  const nextTab = tabs.find((tab) => tab.id === nextTabId)
  if (!nextTab) return null

  return {
    tabs: tabs.map((tab) => tab.id === activeTabId ? { ...tab, snapshot: currentSnapshot } : tab),
    activeTabId: nextTabId,
    snapshotToApply: nextTab.snapshot ?? currentSnapshot,
  }
}

export function createCanvasTabState({
  tabs,
  activeTabId,
  currentSnapshot,
  blankSnapshot,
  nextId,
}: {
  tabs: CanvasTabState[]
  activeTabId: string
  currentSnapshot: CanvasTabSnapshot
  blankSnapshot: CanvasTabSnapshot
  nextId: string
}): { tabs: CanvasTabState[]; activeTabId: string; snapshotToApply: CanvasTabSnapshot } {
  const tabIndex = tabs.length + 1

  return {
    tabs: [
      ...tabs.map((tab) => tab.id === activeTabId ? { ...tab, snapshot: currentSnapshot } : tab),
      { id: nextId, label: `画布 ${tabIndex}`, snapshot: blankSnapshot },
    ],
    activeTabId: nextId,
    snapshotToApply: blankSnapshot,
  }
}

export function canvasTabsFromProjectCanvases(canvases: RxnFlowProjectCanvas[]): CanvasTabState[] {
  return canvases.map((canvas) => ({
    id: canvas.id,
    label: canvas.label,
    snapshot: canvasTabSnapshotFromState({
      nodes: canvas.nodes,
      edges: canvas.edges,
      barriers: canvas.barriers,
      viewport: canvas.viewport,
      selectedNodeIds: canvas.selectedNodeIds,
      selectedEdgeIds: canvas.selectedEdgeIds,
      selectedBarrierIds: canvas.selectedBarrierIds,
    }),
  }))
}

export function projectCanvasesFromCanvasTabs({
  tabs,
  activeTabId,
  activeSnapshot,
}: {
  tabs: CanvasTabState[]
  activeTabId: string
  activeSnapshot: CanvasTabSnapshot
}): RxnFlowProjectCanvas[] {
  return tabs.map((tab, index) => {
    const snapshot = tab.id === activeTabId ? activeSnapshot : (tab.snapshot ?? activeSnapshot)
    return {
      id: tab.id,
      label: tab.label,
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      barriers: snapshot.barriers,
      viewport: snapshot.viewport,
      selectedNodeIds: snapshot.selectedNodeIds,
      selectedEdgeIds: snapshot.selectedEdgeIds,
      selectedBarrierIds: snapshot.selectedBarrierIds,
    }
  }).filter((canvas, index, all) => all.findIndex((item) => item.id === canvas.id) === index)
}
