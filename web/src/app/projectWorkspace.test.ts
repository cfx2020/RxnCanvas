import { describe, expect, it } from "vitest"
import type { FlowBarrier, FlowEdge, FlowNode, RxnFlowProjectPackage, SourceFile } from "../domain/projectPackages"
import type { SourceParseResult } from "../domain/sourceParsers"
import { defaultEnergyDisplayOptions } from "./energyDisplay"
import {
  canvasEditSnapshot,
  cloneFlowNodes,
  createLocalProjectWorkspaceTransition,
  createProjectWorkspaceTransition,
  deleteLocalProjectWorkspaceTransition,
  deleteProjectWorkspaceTransition,
  fallbackLocalProjectSummary,
  cloneSourceFiles,
  emptyProjectWorkspace,
  initialProjectWorkspaces,
  localProjectSummary,
  projectWorkspaceFromPackage,
  projectWorkspaceSnapshot,
  restoreCanvasEditSnapshot,
  restoreProjectWorkspaceApplyTransition,
  restoreProjectWorkspaceSnapshot,
  saveAndActivateProjectWorkspaceTransition,
  switchProjectWorkspaceTransition,
  type ProjectWorkspaceSnapshot,
} from "./projectWorkspace"

const parse: SourceParseResult = {
  label: "TS1",
  sourceKind: "Gaussian",
  formula: "C2H4",
  kind: "transition",
  method: "DFT",
  solvent: "SMD",
  energyGas: -1,
  energySolution: -2,
  energyUnit: "hartree",
  parsed: true,
  parserId: "gaussian-log-text-preview",
  parserVersion: "0.2.1",
  objectCount: 1,
  warnings: [{ code: "unit_assumed", message: "test warning" }],
  candidates: [{
    candidateId: "candidate-1",
    objectIndex: 0,
    label: "TS1",
    formula: "C2H4",
    charge: 0,
    spinMultiplicity: 1,
    method: "DFT",
    energyGas: -1,
    energySolution: -2,
    energyUnit: "hartree",
    coordinatePreview: null,
    roleHint: "transition",
    warnings: [],
  }],
  coordinatePreview: null,
}

const files: SourceFile[] = [{
  id: "file-1",
  name: "ts.log",
  kind: "Gaussian",
  size: 100,
  status: "parsed",
  preview: "SCF Done",
  parse,
}]

const nodes: FlowNode[] = [{
  id: "node-1",
  label: "TS1",
  formula: "C2H4",
  kind: "transition",
  method: "DFT",
  solvent: "SMD",
  energyGas: -1,
  energySolution: -2,
  energyUnit: "hartree",
  sourceFileId: "file-1",
  corrections: [{ id: "corr-1", kind: "manual", value: 1, unit: "kcal/mol" }],
  position: { x: 10, y: 20 },
}]

const edges: FlowEdge[] = [{ id: "edge-1", sourceId: "node-1", targetId: "node-2", label: "path" }]
const barriers: FlowBarrier[] = [{ id: "barrier-1", sourceId: "node-1", targetId: "node-2", label: "ΔG" }]

function workspace(): ProjectWorkspaceSnapshot {
  return {
    files,
    nodes,
    edges,
    barriers,
    viewport: { x: 1, y: 2, zoom: 0.75 },
    selectedNodeIds: ["node-1"],
    selectedEdgeIds: ["edge-1"],
    selectedBarrierIds: ["barrier-1"],
    selectedFileId: "file-1",
    selectedFileIds: ["file-1"],
    lastSelectedFileId: "file-1",
    energyDisplayOptions: { ...defaultEnergyDisplayOptions, energySource: "gas" },
    viewMode: "table",
    inspectorMode: "export",
  }
}

describe("projectWorkspace", () => {
  it("builds initial project workspaces from a shared default viewport", () => {
    const viewport = { x: 100, y: 200, zoom: 0.5 }
    const workspaces = initialProjectWorkspaces(viewport)

    expect(workspaces["diels-alder"].nodes).toHaveLength(6)
    expect(workspaces["diels-alder"].selectedNodeIds).toEqual(["ts-endo"])
    expect(workspaces.nickel).toMatchObject({
      files: [],
      nodes: [],
      viewport,
      inspectorMode: "source",
      viewMode: "canvas",
    })
  })

  it("creates empty project workspaces without sharing mutable options", () => {
    const first = emptyProjectWorkspace({ x: 0, y: 0, zoom: 1 })
    const second = emptyProjectWorkspace({ x: 10, y: 10, zoom: 0.5 })

    first.energyDisplayOptions.energySource = "gas"

    expect(second.energyDisplayOptions.energySource).toBe(defaultEnergyDisplayOptions.energySource)
    expect(second.viewport).toEqual({ x: 10, y: 10, zoom: 0.5 })
  })

  it("deep clones source files, nodes, and workspace selection arrays", () => {
    const snapshot = projectWorkspaceSnapshot(workspace())

    snapshot.files[0].parse?.warnings.push({ code: "new", message: "mutated" })
    snapshot.files[0].parse?.candidates?.[0].warnings.push({ code: "candidate", message: "mutated" })
    snapshot.nodes[0].position.x = 999
    snapshot.nodes[0].corrections?.push({ id: "corr-2", kind: "manual", value: 2, unit: "kcal/mol" })
    snapshot.selectedNodeIds.push("node-2")

    expect(files[0].parse?.warnings).toHaveLength(1)
    expect(files[0].parse?.candidates?.[0].warnings).toHaveLength(0)
    expect(nodes[0].position.x).toBe(10)
    expect(nodes[0].corrections).toHaveLength(1)
    expect(workspace().selectedNodeIds).toEqual(["node-1"])
    expect(cloneSourceFiles(files)[0]).not.toBe(files[0])
    expect(cloneFlowNodes(nodes)[0].position).not.toBe(nodes[0].position)
  })

  it("normalizes partial desktop parser payloads while cloning source files", () => {
    const partialFiles = [{
      ...files[0],
      parse: {
        ...parse,
        warnings: undefined,
        coordinatePreview: {
          atomCount: 2,
          has3d: true,
          elements: undefined,
          previewKind: "text",
        },
        candidates: [{
          ...parse.candidates[0],
          warnings: undefined,
          coordinatePreview: {
            atomCount: 2,
            has3d: true,
            elements: undefined,
            previewKind: "text",
          },
        }],
      },
    }] as unknown as SourceFile[]

    const cloned = cloneSourceFiles(partialFiles)

    expect(cloned[0].parse?.warnings).toEqual([])
    expect(cloned[0].parse?.coordinatePreview?.elements).toEqual([])
    expect(cloned[0].parse?.candidates?.[0].warnings).toEqual([])
    expect(cloned[0].parse?.candidates?.[0].coordinatePreview?.elements).toEqual([])
  })

  it("captures canvas edit snapshots as independent copies", () => {
    const snapshot = canvasEditSnapshot(nodes, edges, barriers, ["node-1"], ["edge-1"], ["barrier-1"])

    snapshot.nodes[0].position.y = 123
    snapshot.edges[0].label = "changed"
    snapshot.barriers[0].label = "changed"
    snapshot.selectedEdgeIds.push("edge-2")

    expect(nodes[0].position.y).toBe(20)
    expect(edges[0].label).toBe("path")
    expect(barriers[0].label).toBe("ΔG")
  })

  it("restores canvas edit snapshots as independent copies", () => {
    const snapshot = canvasEditSnapshot(nodes, edges, barriers, ["node-1"], ["edge-1"], ["barrier-1"])
    const restored = restoreCanvasEditSnapshot(snapshot)

    restored.nodes[0].position.x = 404
    restored.edges[0].label = "mutated"
    restored.barriers[0].label = "mutated"
    restored.selectedNodeIds.push("node-2")

    expect(snapshot.nodes[0].position.x).toBe(10)
    expect(snapshot.edges[0].label).toBe("path")
    expect(snapshot.barriers[0].label).toBe("ΔG")
    expect(snapshot.selectedNodeIds).toEqual(["node-1"])
  })

  it("restores project workspace snapshots as independent copies", () => {
    const snapshot = workspace()
    const restored = restoreProjectWorkspaceSnapshot(snapshot)

    restored.files[0].parse?.warnings.push({ code: "restored", message: "mutated" })
    restored.nodes[0].position.x = 505
    restored.edges[0].label = "mutated"
    restored.barriers[0].label = "mutated"
    restored.viewport.x = 909
    restored.selectedFileIds.push("file-2")
    restored.energyDisplayOptions.energySource = "solution"

    expect(snapshot.files[0].parse?.warnings).toHaveLength(1)
    expect(snapshot.nodes[0].position.x).toBe(10)
    expect(snapshot.edges[0].label).toBe("path")
    expect(snapshot.barriers[0].label).toBe("ΔG")
    expect(snapshot.viewport.x).toBe(1)
    expect(snapshot.selectedFileIds).toEqual(["file-1"])
    expect(snapshot.energyDisplayOptions.energySource).toBe("gas")
  })

  it("builds project workspace apply transitions with transient UI cleanup", () => {
    const snapshot = workspace()
    const transition = restoreProjectWorkspaceApplyTransition(snapshot)

    transition.workspace.nodes[0].position.x = 808

    expect(snapshot.nodes[0].position.x).toBe(10)
    expect(transition.workspace.selectedNodeIds).toEqual(["node-1"])
    expect(transition.keyboardEdgeSourceId).toBeNull()
    expect(transition.connectionDraft).toBeNull()
    expect(transition.barrierDraft).toBeNull()
    expect(transition.dragState).toBeNull()
    expect(transition.candidateReview).toBeNull()
    expect(transition.candidateRegisterBusy).toBe(false)
    expect(transition.structurePreviewNodeId).toBeNull()
    expect(transition.clearEditHistory).toBe(true)
  })

  it("builds a created-project workspace transition without sharing snapshots", () => {
    const currentSnapshot = workspace()
    const nextSnapshot = emptyProjectWorkspace({ x: 0, y: 0, zoom: 1 })
    const transition = createProjectWorkspaceTransition({
      workspaces: { active: currentSnapshot },
      activeProjectId: "active",
      currentSnapshot,
      nextProjectId: "next",
      nextSnapshot,
    })

    expect(transition.activeProjectId).toBe("next")
    expect(transition.activeSnapshot).toEqual(nextSnapshot)
    transition.workspaces.active.nodes[0].position.x = 303
    transition.activeSnapshot.viewport.x = 808

    expect(currentSnapshot.nodes[0].position.x).toBe(10)
    expect(nextSnapshot.viewport.x).toBe(0)
  })

  it("builds local project summaries and create transitions from UI inputs", () => {
    const currentSnapshot = workspace()
    const nextSnapshot = emptyProjectWorkspace({ x: 0, y: 0, zoom: 1 })
    const transition = createLocalProjectWorkspaceTransition({
      projects: [{ id: "active", label: "Active", meta: "open" }],
      workspaces: { active: currentSnapshot },
      activeProjectId: "active",
      currentSnapshot,
      nextSnapshot,
      projectLabel: "  New Mechanism  ",
      now: 1234,
    })

    expect(localProjectSummary({ projectLabel: "  ", nextIndex: 3, now: 55 })).toEqual({
      id: "local-project-55-3",
      label: "Untitled Study 3",
      meta: "empty",
    })
    expect(transition.project).toEqual({
      id: "local-project-1234-2",
      label: "New Mechanism",
      meta: "empty",
    })
    expect(transition.projects.map((project) => project.id)).toEqual(["local-project-1234-2", "active"])
    expect(transition.activeProjectId).toBe("local-project-1234-2")
    transition.workspaces.active.nodes[0].position.x = 404
    transition.activeSnapshot.viewport.x = 505

    expect(currentSnapshot.nodes[0].position.x).toBe(10)
    expect(nextSnapshot.viewport.x).toBe(0)
  })

  it("builds a project switch transition with saved current and restored target snapshots", () => {
    const currentSnapshot = workspace()
    const targetSnapshot = emptyProjectWorkspace({ x: 4, y: 5, zoom: 0.6 })
    const fallbackSnapshot = emptyProjectWorkspace({ x: 0, y: 0, zoom: 1 })
    const transition = switchProjectWorkspaceTransition({
      workspaces: { target: targetSnapshot },
      activeProjectId: "active",
      targetProjectId: "target",
      currentSnapshot,
      fallbackSnapshot,
    })

    expect(transition?.activeProjectId).toBe("target")
    expect(transition?.activeSnapshot.viewport).toEqual({ x: 4, y: 5, zoom: 0.6 })
    transition?.activeSnapshot.selectedNodeIds.push("mutated")
    transition!.workspaces.active.nodes[0].position.x = 606

    expect(targetSnapshot.selectedNodeIds).toEqual([])
    expect(currentSnapshot.nodes[0].position.x).toBe(10)
    expect(switchProjectWorkspaceTransition({
      workspaces: {},
      activeProjectId: "active",
      targetProjectId: "active",
      currentSnapshot,
      fallbackSnapshot,
    })).toBeNull()
  })

  it("builds a save-and-activate transition for imported or restored target workspaces", () => {
    const currentSnapshot = workspace()
    const targetSnapshot = emptyProjectWorkspace({ x: 12, y: 18, zoom: 0.9 })
    const transition = saveAndActivateProjectWorkspaceTransition({
      workspaces: { active: currentSnapshot, target: targetSnapshot },
      activeProjectId: "active",
      targetProjectId: "target",
      currentSnapshot,
      targetSnapshot,
    })

    expect(transition.activeProjectId).toBe("target")
    expect(transition.activeSnapshot.viewport).toEqual({ x: 12, y: 18, zoom: 0.9 })

    transition.workspaces.active.nodes[0].position.x = 909
    transition.activeSnapshot.viewport.x = 404

    expect(currentSnapshot.nodes[0].position.x).toBe(10)
    expect(targetSnapshot.viewport.x).toBe(12)
  })

  it("builds a project deletion transition for non-active projects", () => {
    const currentSnapshot = workspace()
    const deletedSnapshot = emptyProjectWorkspace({ x: 2, y: 2, zoom: 1 })
    const fallbackSnapshot = emptyProjectWorkspace({ x: 0, y: 0, zoom: 1 })
    const transition = deleteProjectWorkspaceTransition({
      projects: [
        { id: "active", label: "Active", meta: "open" },
        { id: "deleted", label: "Deleted", meta: "empty" },
      ],
      workspaces: { active: currentSnapshot, deleted: deletedSnapshot },
      activeProjectId: "active",
      deletedProjectId: "deleted",
      currentSnapshot,
      fallbackProject: { id: "fallback", label: "Fallback", meta: "empty" },
      fallbackSnapshot,
    })

    expect(transition?.activeChanged).toBe(false)
    expect(transition?.activeProjectId).toBe("active")
    expect(transition?.projects.map((project) => project.id)).toEqual(["active"])
    expect(transition?.workspaces.deleted).toBeUndefined()
    transition!.activeSnapshot.nodes[0].position.x = 707
    expect(currentSnapshot.nodes[0].position.x).toBe(10)
  })

  it("builds a project deletion transition for active and final projects", () => {
    const currentSnapshot = workspace()
    const targetSnapshot = emptyProjectWorkspace({ x: 3, y: 4, zoom: 0.7 })
    const fallbackProject = { id: "fallback", label: "Fallback", meta: "empty" }
    const fallbackSnapshot = emptyProjectWorkspace({ x: 0, y: 0, zoom: 1 })
    const activeDeleted = deleteProjectWorkspaceTransition({
      projects: [
        { id: "active", label: "Active", meta: "open" },
        { id: "target", label: "Target", meta: "empty" },
      ],
      workspaces: { active: currentSnapshot, target: targetSnapshot },
      activeProjectId: "active",
      deletedProjectId: "active",
      currentSnapshot,
      fallbackProject,
      fallbackSnapshot,
    })

    expect(activeDeleted?.activeChanged).toBe(true)
    expect(activeDeleted?.activeProjectId).toBe("target")
    expect(activeDeleted?.activeSnapshot.viewport).toEqual({ x: 3, y: 4, zoom: 0.7 })

    const finalDeleted = deleteProjectWorkspaceTransition({
      projects: [{ id: "active", label: "Active", meta: "open" }],
      workspaces: { active: currentSnapshot },
      activeProjectId: "active",
      deletedProjectId: "active",
      currentSnapshot,
      fallbackProject,
      fallbackSnapshot,
    })

    expect(finalDeleted?.projects).toEqual([fallbackProject])
    expect(finalDeleted?.activeProjectId).toBe("fallback")
    expect(finalDeleted?.activeSnapshot).toEqual(fallbackSnapshot)
    expect(deleteProjectWorkspaceTransition({
      projects: [],
      workspaces: {},
      activeProjectId: "active",
      deletedProjectId: "missing",
      currentSnapshot,
      fallbackProject,
      fallbackSnapshot,
    })).toBeNull()
  })

  it("builds local project deletion transitions with generated fallback projects", () => {
    const currentSnapshot = workspace()
    const fallbackSnapshot = emptyProjectWorkspace({ x: 0, y: 0, zoom: 1 })
    const finalDeleted = deleteLocalProjectWorkspaceTransition({
      projects: [{ id: "active", label: "Active", meta: "open" }],
      workspaces: { active: currentSnapshot },
      activeProjectId: "active",
      deletedProjectId: "active",
      currentSnapshot,
      fallbackSnapshot,
      now: 777,
    })

    expect(fallbackLocalProjectSummary(777)).toEqual({
      id: "local-project-777-empty",
      label: "Untitled Study",
      meta: "empty",
    })
    expect(finalDeleted?.projects).toEqual([fallbackLocalProjectSummary(777)])
    expect(finalDeleted?.activeProjectId).toBe("local-project-777-empty")
    expect(finalDeleted?.activeSnapshot).toEqual(fallbackSnapshot)
  })

  it("restores project package content into an active canvas workspace", () => {
    const projectPackage: RxnFlowProjectPackage = {
      schemaVersion: 1,
      packageKind: "rxnflow-project",
      project: { id: "saved", label: "Saved", meta: "saved" },
      files,
      nodes,
      edges,
      barriers,
      viewport: { x: 20, y: 30, zoom: 0.8 },
      importLedger: { schemaVersion: 1, entries: [] },
      savedAt: "2026-06-15T00:00:00.000Z",
    }

    const restored = projectWorkspaceFromPackage(projectPackage)

    expect(restored).toMatchObject({
      selectedNodeIds: ["node-1"],
      selectedFileId: "file-1",
      selectedFileIds: ["file-1"],
      lastSelectedFileId: "file-1",
      viewMode: "canvas",
      inspectorMode: "inspector",
    })
    expect(restored.files[0]).not.toBe(files[0])
    expect(restored.nodes[0].position).not.toBe(nodes[0].position)
  })
})
