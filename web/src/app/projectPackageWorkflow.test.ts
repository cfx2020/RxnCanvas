import { describe, expect, it } from "vitest"
import type { ProjectSummary } from "../domain/projectPackages"
import { emptyProjectWorkspace, type ProjectWorkspaceSnapshot } from "./projectWorkspace"
import {
  invalidProjectPackageValidation,
  projectPackageArchiveDefaultName,
  projectPackageDefaultName,
  projectPackageOpenRuntimeTransition,
  projectPackageSaveRuntimeTransition,
  projectPackageRestoreFromContent,
  projectPackageRestoreTransitionFromContent,
  serializeProjectPackage,
} from "./projectPackageWorkflow"

const project: ProjectSummary = {
  id: "project-1",
  label: "Ni Screen!",
  meta: "open",
}

function currentWorkspace(): ProjectWorkspaceSnapshot {
  return emptyProjectWorkspace({ x: 1, y: 2, zoom: 0.75 })
}

describe("projectPackageWorkflow", () => {
  it("builds runtime-specific project package names and runtime transitions", () => {
    expect(projectPackageDefaultName(project.label, "desktop")).toBe("ni-screen.rxnflow")
    expect(projectPackageDefaultName(project.label, "browser")).toBe("ni-screen.rxnflow.json")
    expect(projectPackageArchiveDefaultName(project.label)).toBe("ni-screen.rxnflow.zip")
    expect(projectPackageOpenRuntimeTransition(true)).toEqual({ shouldOpenDesktop: true, shouldOpenBrowserPicker: false })
    expect(projectPackageOpenRuntimeTransition(false)).toEqual({ shouldOpenDesktop: false, shouldOpenBrowserPicker: true })
    expect(projectPackageSaveRuntimeTransition(true)).toEqual({ runtime: "desktop", shouldSaveDesktop: true, shouldDownloadBrowser: false })
    expect(projectPackageSaveRuntimeTransition(false)).toEqual({ runtime: "browser", shouldSaveDesktop: false, shouldDownloadBrowser: true })
  })

  it("serializes current project state with barriers", () => {
    const serialized = serializeProjectPackage({
      project,
      files: [],
      nodes: [],
      edges: [],
      barriers: [{ id: "barrier-1", sourceId: "node-a", targetId: "node-b", label: "12.4" }],
      viewport: { x: 10, y: 20, zoom: 0.8 },
    }, "desktop")

    expect(serialized.defaultName).toBe("ni-screen.rxnflow")
    expect(JSON.parse(serialized.content)).toMatchObject({
      schemaVersion: 1,
      packageKind: "rxnflow-project",
      project,
      barriers: [{ id: "barrier-1", sourceId: "node-a", targetId: "node-b", label: "12.4" }],
      viewport: { x: 10, y: 20, zoom: 0.8 },
    })
  })

  it("restores a valid package into an open project snapshot", () => {
    const serialized = serializeProjectPackage({
      project: { ...project, meta: "saved" },
      files: [{
        id: "file-1",
        name: "gaussian.log",
        kind: "Gaussian",
        size: 42,
        status: "parsed",
        preview: "SCF Done",
      }],
      nodes: [{
        id: "node-1",
        label: "TS1",
        formula: "C2H4",
        kind: "transition",
        method: "wB97X-D",
        solvent: "Toluene",
        energyGas: -10,
        energySolution: -9.8,
        energyUnit: "hartree",
        sourceFileId: "file-1",
        position: { x: 100, y: 140 },
      }],
      edges: [],
      barriers: [],
      viewport: { x: 2, y: 4, zoom: 1.1 },
    }, "browser")

    const restored = projectPackageRestoreFromContent(serialized.content)

    expect(restored.ok).toBe(true)
    if (!restored.ok) throw new Error("Expected project package to restore")
    expect(restored.project).toEqual({ ...project, meta: "open" })
    expect(restored.snapshot.files).toHaveLength(1)
    expect(restored.snapshot.nodes[0]).toMatchObject({ id: "node-1", sourceFileId: "file-1" })
    expect(restored.snapshot.viewport).toEqual({ x: 2, y: 4, zoom: 1.1 })
    expect(restored.validation).toBeNull()
  })

  it("returns readable validation for invalid package content", () => {
    const restored = projectPackageRestoreFromContent("{not-json")
    const invalid = invalidProjectPackageValidation()

    expect(restored.ok).toBe(false)
    expect(restored.validation).toEqual(invalid)
    expect(invalid.issues[0]).toMatchObject({
      severity: "error",
      code: "invalid_project_package",
    })
  })

  it("builds a restore transition that replaces duplicate project summaries and saves current workspace", () => {
    const currentSnapshot = currentWorkspace()
    const serialized = serializeProjectPackage({
      project: { ...project, label: "Restored Project", meta: "saved" },
      files: [],
      nodes: [{
        id: "restored-node",
        label: "TS1",
        formula: "C2H4",
        kind: "transition",
        method: "wB97X-D",
        solvent: "Toluene",
        energyGas: -10,
        energySolution: -9.8,
        energyUnit: "hartree",
        position: { x: 100, y: 140 },
      }],
      edges: [],
      barriers: [],
      viewport: { x: 20, y: 30, zoom: 1.2 },
    }, "browser")

    const transition = projectPackageRestoreTransitionFromContent({
      content: serialized.content,
      projects: [
        { id: "active", label: "Active", meta: "open" },
        { id: project.id, label: "Old duplicate", meta: "empty" },
      ],
      workspaces: { active: currentSnapshot },
      activeProjectId: "active",
      currentSnapshot,
    })

    expect(transition.ok).toBe(true)
    if (!transition.ok) throw new Error("Expected package restore transition")
    expect(transition.projects.map((item) => [item.id, item.label, item.meta])).toEqual([
      [project.id, "Restored Project", "open"],
      ["active", "Active", "open"],
    ])
    expect(transition.activeProjectId).toBe(project.id)
    expect(transition.activeSnapshot.nodes.map((node) => node.id)).toEqual(["restored-node"])
    expect(transition.workspaces.active.viewport).toEqual(currentSnapshot.viewport)
    expect(transition.validation).toBeNull()

    transition.workspaces.active.viewport.x = 999
    expect(currentSnapshot.viewport.x).toBe(1)
  })

  it("builds a restore transition that can replace demo projects for desktop workspace restore", () => {
    const serialized = serializeProjectPackage({
      project: { id: "ir-workspace", label: "Ir", meta: "saved" },
      files: [],
      nodes: [{
        id: "ir-node",
        label: "4b-1",
        formula: "C113H76ClIrN4O",
        kind: "intermediate",
        method: "Gaussian",
        solvent: "SMD",
        energyGas: -5208.1,
        energySolution: -5208.2,
        energyUnit: "hartree",
        position: { x: 10, y: 20 },
      }],
      edges: [],
      barriers: [],
      viewport: { x: 20, y: 30, zoom: 1.2 },
    }, "desktop")

    const transition = projectPackageRestoreTransitionFromContent({
      content: serialized.content,
      projects: [
        { id: "diels-alder", label: "Diels-Alder Study", meta: "open" },
        { id: "nickel", label: "Nickel catalysis", meta: "empty" },
        { id: "ir-screening", label: "Ir screening", meta: "empty" },
      ],
      workspaces: { "diels-alder": currentWorkspace() },
      activeProjectId: "diels-alder",
      currentSnapshot: currentWorkspace(),
      replaceProjects: true,
    })

    expect(transition.ok).toBe(true)
    if (!transition.ok) throw new Error("Expected package restore transition")
    expect(transition.projects.map((item) => item.label)).toEqual(["Ir"])
    expect(Object.keys(transition.workspaces)).toEqual(["ir-workspace"])
    expect(transition.activeProjectId).toBe("ir-workspace")
    expect(transition.activeSnapshot.nodes.map((node) => node.id)).toEqual(["ir-node"])
  })

  it("keeps already-open real workspaces when another desktop workspace is restored", () => {
    const irWorkspace = currentWorkspace()
    irWorkspace.nodes = [{
      id: "ir-node",
      label: "Ir TS",
      formula: "Ir",
      kind: "intermediate",
      method: "Gaussian",
      solvent: "SMD",
      energyGas: -1,
      energySolution: -1,
      energyUnit: "hartree",
      position: { x: 1, y: 2 },
    }]
    const serializedNi = serializeProjectPackage({
      project: { id: "ni-workspace", label: "Ni", meta: "saved" },
      files: [],
      nodes: [{
        id: "ni-node",
        label: "Ni TS",
        formula: "Ni",
        kind: "intermediate",
        method: "Gaussian",
        solvent: "SMD",
        energyGas: -2,
        energySolution: -2,
        energyUnit: "hartree",
        position: { x: 10, y: 20 },
      }],
      edges: [],
      barriers: [],
      viewport: { x: 20, y: 30, zoom: 1.2 },
    }, "desktop")

    const transition = projectPackageRestoreTransitionFromContent({
      content: serializedNi.content,
      projects: [
        { id: "ir-workspace", label: "Ir", meta: "open" },
        { id: "diels-alder", label: "Diels-Alder Study", meta: "open" },
        { id: "nickel", label: "Nickel catalysis", meta: "empty" },
        { id: "ir-screening", label: "Ir screening", meta: "empty" },
      ],
      workspaces: { "ir-workspace": irWorkspace },
      activeProjectId: "ir-workspace",
      currentSnapshot: irWorkspace,
      replaceProjects: true,
    })

    expect(transition.ok).toBe(true)
    if (!transition.ok) throw new Error("Expected package restore transition")
    expect(transition.projects.map((item) => item.label)).toEqual(["Ni", "Ir"])
    expect(Object.keys(transition.workspaces).sort()).toEqual(["ir-workspace", "ni-workspace"])
    expect(transition.workspaces["ir-workspace"].nodes.map((node) => node.id)).toEqual(["ir-node"])
    expect(transition.activeProjectId).toBe("ni-workspace")
    expect(transition.activeSnapshot.nodes.map((node) => node.id)).toEqual(["ni-node"])
  })

  it("returns invalid package validation without mutating restore transition state", () => {
    const transition = projectPackageRestoreTransitionFromContent({
      content: "{not-json",
      validation: null,
      projects: [{ id: "active", label: "Active", meta: "open" }],
      workspaces: { active: currentWorkspace() },
      activeProjectId: "active",
      currentSnapshot: currentWorkspace(),
    })

    expect(transition).toEqual({
      ok: false,
      validation: invalidProjectPackageValidation(),
    })
  })
})
