import type { CanvasAnnotation, CanvasViewport, FlowBarrier, FlowEdge, FlowNode, RxnFlowProjectCanvas } from "../domain/projectPackages"

export type CanvasTabSnapshot = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  barriers: FlowBarrier[]
  annotations?: CanvasAnnotation[]
  viewport: CanvasViewport
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  selectedBarrierIds: string[]
}

export type CanvasTabState = {
  id: string
  label: string
  snapshot: CanvasTabSnapshot | null
  closed?: boolean
}

function openCanvasTab(tab: CanvasTabState): CanvasTabState {
  if (!tab.closed) return tab
  const { closed: _closed, ...openTab } = tab
  return openTab
}

export function initialCanvasTabs(projectLabel = "Untitled Study"): CanvasTabState[] {
  return [{ id: "canvas-1", label: projectLabel, snapshot: null }]
}

export function canvasTabSnapshotFromState(snapshot: CanvasTabSnapshot): CanvasTabSnapshot {
  return {
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    barriers: snapshot.barriers,
    annotations: snapshot.annotations ?? [],
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
  const nextTab = tabs.find((tab) => tab.id === nextTabId)
  if (!nextTab) return null
  if (nextTabId === activeTabId && !nextTab.closed) return null

  return {
    tabs: tabs.map((tab) => {
      if (tab.id === activeTabId) return openCanvasTab({ ...tab, snapshot: currentSnapshot })
      if (tab.id === nextTabId) return openCanvasTab(tab)
      return tab
    }),
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
  nextLabel,
}: {
  tabs: CanvasTabState[]
  activeTabId: string
  currentSnapshot: CanvasTabSnapshot
  blankSnapshot: CanvasTabSnapshot
  nextId: string
  nextLabel: string
}): { tabs: CanvasTabState[]; activeTabId: string; snapshotToApply: CanvasTabSnapshot } {
  return {
    tabs: [
      ...tabs.map((tab) => tab.id === activeTabId ? { ...tab, snapshot: currentSnapshot } : tab),
      { id: nextId, label: nextLabel, snapshot: blankSnapshot },
    ],
    activeTabId: nextId,
    snapshotToApply: blankSnapshot,
  }
}

export function renameCanvasTabState({
  tabs,
  tabId,
  label,
}: {
  tabs: CanvasTabState[]
  tabId: string
  label: string
}): CanvasTabState[] {
  const normalized = label.trim()
  if (!normalized) return tabs
  return tabs.map((tab) => tab.id === tabId ? { ...tab, label: normalized } : tab)
}

export function closeCanvasTabState({
  tabs,
  activeTabId,
  closedTabId,
  currentSnapshot,
}: {
  tabs: CanvasTabState[]
  activeTabId: string
  closedTabId: string
  currentSnapshot: CanvasTabSnapshot
}): { tabs: CanvasTabState[]; activeTabId: string; snapshotToApply: CanvasTabSnapshot } | null {
  const openTabs = tabs.filter((tab) => !tab.closed)
  if (openTabs.length <= 1) return null
  if (!tabs.some((tab) => tab.id === closedTabId)) return null
  const closedOpenIndex = openTabs.findIndex((tab) => tab.id === closedTabId)
  if (closedOpenIndex < 0) return null
  const nextTabs = tabs.map((tab) => {
    if (tab.id === closedTabId) {
      return {
        ...tab,
        snapshot: tab.id === activeTabId ? currentSnapshot : tab.snapshot,
        closed: true,
      }
    }
    if (tab.id === activeTabId) return openCanvasTab({ ...tab, snapshot: currentSnapshot })
    return tab
  })
  const remainingOpenTabs = openTabs.filter((tab) => tab.id !== closedTabId)
  const nextActiveTabId = closedTabId === activeTabId
    ? remainingOpenTabs[Math.max(0, closedOpenIndex - 1)]?.id ?? remainingOpenTabs[0]?.id
    : activeTabId
  const nextActiveTab = nextTabs.find((tab) => tab.id === nextActiveTabId) ?? nextTabs[0]
  if (!nextActiveTab) return null
  return {
    tabs: nextTabs,
    activeTabId: nextActiveTab.id,
    snapshotToApply: nextActiveTab.snapshot ?? currentSnapshot,
  }
}

export function deleteCanvasTabState({
  tabs,
  activeTabId,
  deletedTabId,
  currentSnapshot,
}: {
  tabs: CanvasTabState[]
  activeTabId: string
  deletedTabId: string
  currentSnapshot: CanvasTabSnapshot
}): { tabs: CanvasTabState[]; activeTabId: string; snapshotToApply: CanvasTabSnapshot } | null {
  if (tabs.length <= 1) return null
  const deletedIndex = tabs.findIndex((tab) => tab.id === deletedTabId)
  if (deletedIndex < 0) return null

  const savedTabs = tabs.map((tab) => tab.id === activeTabId ? openCanvasTab({ ...tab, snapshot: currentSnapshot }) : tab)
  const nextTabs = savedTabs.filter((tab) => tab.id !== deletedTabId)
  const nextActiveTabId = deletedTabId === activeTabId
    ? nextTabs[Math.max(0, deletedIndex - 1)]?.id ?? nextTabs[0]?.id
    : activeTabId
  const nextActiveTab = nextTabs.find((tab) => tab.id === nextActiveTabId) ?? nextTabs[0]
  if (!nextActiveTab) return null
  const reopenedTabs = nextTabs.map((tab) => tab.id === nextActiveTab.id ? openCanvasTab(tab) : tab)

  return {
    tabs: reopenedTabs,
    activeTabId: nextActiveTab.id,
    snapshotToApply: nextActiveTab.snapshot ?? currentSnapshot,
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
      annotations: canvas.annotations ?? [],
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
      annotations: snapshot.annotations ?? [],
      viewport: snapshot.viewport,
      selectedNodeIds: snapshot.selectedNodeIds,
      selectedEdgeIds: snapshot.selectedEdgeIds,
      selectedBarrierIds: snapshot.selectedBarrierIds,
    }
  }).filter((canvas, index, all) => all.findIndex((item) => item.id === canvas.id) === index)
}
