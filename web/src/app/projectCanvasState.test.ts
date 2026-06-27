import { describe, expect, it } from "vitest"

import {
  canvasTabSnapshotFromState,
  closeCanvasTabState,
  createCanvasTabState,
  deleteCanvasTabState,
  initialCanvasTabs,
  switchCanvasTabState,
  type CanvasTabSnapshot,
} from "./projectCanvasState"

function snapshot(id: string): CanvasTabSnapshot {
  return {
    nodes: [{
      id,
      label: id,
      formula: "pending",
      kind: "intermediate",
      method: "test",
      solvent: "test",
      energyGas: null,
      energySolution: null,
      energyUnit: "hartree",
      position: { x: 0, y: 0 },
    }],
    edges: [],
    barriers: [],
    annotations: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeIds: [id],
    selectedEdgeIds: [],
    selectedBarrierIds: [],
  }
}

describe("projectCanvasState", () => {
  it("provides a default first canvas tab", () => {
    expect(initialCanvasTabs()).toEqual([{ id: "canvas-1", label: "Untitled Study", snapshot: null }])
  })

  it("creates a new canvas tab while preserving the current snapshot on the previous tab", () => {
    const currentSnapshot = snapshot("node-a")
    const blankSnapshot = snapshot("node-b")
    const transition = createCanvasTabState({
      tabs: initialCanvasTabs(),
      activeTabId: "canvas-1",
      currentSnapshot,
      blankSnapshot,
      nextId: "canvas-2",
      nextLabel: "Diels-Alder Study 1",
    })

    expect(transition.activeTabId).toBe("canvas-2")
    expect(transition.snapshotToApply).toEqual(blankSnapshot)
    expect(transition.tabs).toEqual([
      { id: "canvas-1", label: "Untitled Study", snapshot: currentSnapshot },
      { id: "canvas-2", label: "Diels-Alder Study 1", snapshot: blankSnapshot },
    ])
  })

  it("switches to an existing tab and returns the stored snapshot", () => {
    const tabOne = snapshot("node-a")
    const tabTwo = snapshot("node-b")
    const transition = switchCanvasTabState({
      tabs: [
        { id: "canvas-1", label: "Untitled Study", snapshot: tabOne },
        { id: "canvas-2", label: "Diels-Alder Study 1", snapshot: tabTwo },
      ],
      activeTabId: "canvas-1",
      nextTabId: "canvas-2",
      currentSnapshot: canvasTabSnapshotFromState(tabOne),
    })

    expect(transition).toEqual({
      tabs: [
        { id: "canvas-1", label: "Untitled Study", snapshot: tabOne },
        { id: "canvas-2", label: "Diels-Alder Study 1", snapshot: tabTwo },
      ],
      activeTabId: "canvas-2",
      snapshotToApply: tabTwo,
    })
  })

  it("closes a canvas tab without removing its saved canvas", () => {
    const tabOne = snapshot("node-a")
    const tabTwo = snapshot("node-b")
    const transition = closeCanvasTabState({
      tabs: [
        { id: "canvas-1", label: "Untitled Study", snapshot: tabOne },
        { id: "canvas-2", label: "Diels-Alder Study 1", snapshot: tabTwo },
      ],
      activeTabId: "canvas-2",
      closedTabId: "canvas-2",
      currentSnapshot: tabTwo,
    })

    expect(transition?.activeTabId).toBe("canvas-1")
    expect(transition?.snapshotToApply).toEqual(tabOne)
    expect(transition?.tabs).toEqual([
      { id: "canvas-1", label: "Untitled Study", snapshot: tabOne },
      { id: "canvas-2", label: "Diels-Alder Study 1", snapshot: tabTwo, closed: true },
    ])
  })

  it("reopens a closed canvas when switching to it from the sidebar", () => {
    const tabOne = snapshot("node-a")
    const tabTwo = snapshot("node-b")
    const transition = switchCanvasTabState({
      tabs: [
        { id: "canvas-1", label: "Untitled Study", snapshot: tabOne },
        { id: "canvas-2", label: "Diels-Alder Study 1", snapshot: tabTwo, closed: true },
      ],
      activeTabId: "canvas-1",
      nextTabId: "canvas-2",
      currentSnapshot: tabOne,
    })

    expect(transition?.activeTabId).toBe("canvas-2")
    expect(transition?.snapshotToApply).toEqual(tabTwo)
    expect(transition?.tabs).toEqual([
      { id: "canvas-1", label: "Untitled Study", snapshot: tabOne },
      { id: "canvas-2", label: "Diels-Alder Study 1", snapshot: tabTwo },
    ])
  })

  it("deletes a canvas only through the explicit delete transition", () => {
    const tabOne = snapshot("node-a")
    const tabTwo = snapshot("node-b")
    const transition = deleteCanvasTabState({
      tabs: [
        { id: "canvas-1", label: "Untitled Study", snapshot: tabOne },
        { id: "canvas-2", label: "Diels-Alder Study 1", snapshot: tabTwo },
      ],
      activeTabId: "canvas-2",
      deletedTabId: "canvas-2",
      currentSnapshot: tabTwo,
    })

    expect(transition).toEqual({
      tabs: [{ id: "canvas-1", label: "Untitled Study", snapshot: tabOne }],
      activeTabId: "canvas-1",
      snapshotToApply: tabOne,
    })
  })
})
