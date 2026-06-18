import { describe, expect, it } from "vitest"

import {
  canvasTabSnapshotFromState,
  createCanvasTabState,
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
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeIds: [id],
    selectedEdgeIds: [],
    selectedBarrierIds: [],
  }
}

describe("projectCanvasState", () => {
  it("provides a default first canvas tab", () => {
    expect(initialCanvasTabs()).toEqual([{ id: "canvas-1", label: "画布 1", snapshot: null }])
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
    })

    expect(transition.activeTabId).toBe("canvas-2")
    expect(transition.snapshotToApply).toEqual(blankSnapshot)
    expect(transition.tabs).toEqual([
      { id: "canvas-1", label: "画布 1", snapshot: currentSnapshot },
      { id: "canvas-2", label: "画布 2", snapshot: blankSnapshot },
    ])
  })

  it("switches to an existing tab and returns the stored snapshot", () => {
    const tabOne = snapshot("node-a")
    const tabTwo = snapshot("node-b")
    const transition = switchCanvasTabState({
      tabs: [
        { id: "canvas-1", label: "画布 1", snapshot: tabOne },
        { id: "canvas-2", label: "画布 2", snapshot: tabTwo },
      ],
      activeTabId: "canvas-1",
      nextTabId: "canvas-2",
      currentSnapshot: canvasTabSnapshotFromState(tabOne),
    })

    expect(transition).toEqual({
      tabs: [
        { id: "canvas-1", label: "画布 1", snapshot: tabOne },
        { id: "canvas-2", label: "画布 2", snapshot: tabTwo },
      ],
      activeTabId: "canvas-2",
      snapshotToApply: tabTwo,
    })
  })
})
