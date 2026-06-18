import type {
  CanvasViewport,
  FlowBarrier,
  FlowEdge,
  FlowNode,
  ProjectSummary,
  RxnFlowProjectPackage,
  SourceFile,
} from "../domain/projectPackages"
import { defaultEnergyDisplayOptions, type EnergyDisplayOptions } from "./energyDisplay"

export type WorkbenchViewMode = "canvas" | "table"
export type WorkbenchInspectorMode = "inspector" | "export"

export type CanvasEditSnapshot = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  barriers: FlowBarrier[]
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  selectedBarrierIds: string[]
}

export type ProjectWorkspaceSnapshot = {
  files: SourceFile[]
  nodes: FlowNode[]
  edges: FlowEdge[]
  barriers: FlowBarrier[]
  viewport: CanvasViewport
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  selectedBarrierIds: string[]
  selectedFileId: string | null
  selectedFileIds: string[]
  lastSelectedFileId: string | null
  energyDisplayOptions: EnergyDisplayOptions
  viewMode: WorkbenchViewMode
  inspectorMode: WorkbenchInspectorMode
}

export type ProjectWorkspaceApplyTransition = {
  workspace: ProjectWorkspaceSnapshot
  keyboardEdgeSourceId: null
  connectionDraft: null
  barrierDraft: null
  dragState: null
  candidateReview: null
  candidateRegisterBusy: false
  structurePreviewNodeId: null
  clearEditHistory: true
}

export const initialProjects: ProjectSummary[] = [
  { id: "diels-alder", label: "Diels-Alder Study", meta: "open" },
  { id: "nickel", label: "Nickel catalysis", meta: "empty" },
  { id: "ir-screening", label: "Ir screening", meta: "empty" },
]

export const initialFiles: SourceFile[] = [
  {
    id: "gaussian-log",
    name: "gaussian.log",
    kind: "Gaussian",
    size: 482_000,
    status: "parsed",
    preview: "SCF Done: E(RwB97XD) = -232.487921 A.U.\nZero-point correction = 0.184729\nThermal correction to Gibbs Free Energy = 0.209114",
  },
  {
    id: "orca-out",
    name: "orca.out",
    kind: "ORCA",
    size: 366_400,
    status: "parsed",
    preview: "FINAL SINGLE POINT ENERGY     -231.884002\nG-E(el) = 0.000000\nCPCM SOLVATION ENERGY = -0.010241",
  },
  {
    id: "maple-path",
    name: "maple-path.out",
    kind: "MAPLE",
    size: 241_900,
    status: "parsed",
    preview: "IRC point 01 energy -231.900117\nIRC point 02 energy -231.895011\nIRC point 03 energy -231.913448",
  },
]

export const initialNodes: FlowNode[] = [
  {
    id: "butadiene",
    label: "1,3-Butadiene",
    formula: "C4H6",
    kind: "reactant",
    method: "wB97X-D / def2-TZVP",
    solvent: "SMD / Toluene",
    energyGas: -0.88,
    energySolution: -1.32,
    energyUnit: "kcal/mol",
    sourceStatus: "demo",
    sourceFileId: "gaussian-log",
    position: { x: -440, y: -170 },
  },
  {
    id: "maleic",
    label: "Maleic Anhydride",
    formula: "C4H2O3",
    kind: "reactant",
    method: "wB97X-D / def2-TZVP",
    solvent: "SMD / Toluene",
    energyGas: -29.11,
    energySolution: -30.21,
    energyUnit: "kcal/mol",
    sourceStatus: "demo",
    sourceFileId: "orca-out",
    position: { x: -440, y: 210 },
  },
  {
    id: "ts-endo",
    label: "TS1 (Endo)",
    formula: "C10H12",
    kind: "transition",
    method: "wB97X-D / def2-TZVP",
    solvent: "SMD / Toluene",
    energyGas: 18.27,
    energySolution: 19.64,
    energyUnit: "kcal/mol",
    sourceStatus: "demo",
    sourceFileId: "gaussian-log",
    position: { x: 10, y: -140 },
  },
  {
    id: "ts-exo",
    label: "TS2 (Exo)",
    formula: "C10H12",
    kind: "transition",
    method: "wB97X-D / def2-TZVP",
    solvent: "SMD / Toluene",
    energyGas: 20.11,
    energySolution: 21.37,
    energyUnit: "kcal/mol",
    sourceStatus: "demo",
    sourceFileId: "gaussian-log",
    position: { x: 40, y: 310 },
  },
  {
    id: "endo",
    label: "Endo Adduct",
    formula: "C10H16",
    kind: "product",
    method: "wB97X-D / def2-TZVP",
    solvent: "SMD / Toluene",
    energyGas: -11.02,
    energySolution: -12.41,
    energyUnit: "kcal/mol",
    sourceStatus: "demo",
    sourceFileId: "maple-path",
    position: { x: 520, y: -60 },
  },
  {
    id: "exo",
    label: "Exo Adduct",
    formula: "C10H16",
    kind: "product",
    method: "wB97X-D / def2-TZVP",
    solvent: "SMD / Toluene",
    energyGas: -8.11,
    energySolution: -9.23,
    energyUnit: "kcal/mol",
    sourceStatus: "demo",
    sourceFileId: "maple-path",
    position: { x: 520, y: 300 },
  },
]

export const initialEdges: FlowEdge[] = [
  { id: "edge-1", sourceId: "butadiene", targetId: "ts-endo", label: "+ Diene" },
  { id: "edge-2", sourceId: "maleic", targetId: "ts-endo", label: "+ Dienophile" },
  { id: "edge-3", sourceId: "ts-endo", targetId: "endo", label: "-18.53" },
  { id: "edge-4", sourceId: "ts-endo", targetId: "ts-exo", label: "Delta G 1.73" },
  { id: "edge-5", sourceId: "ts-exo", targetId: "exo", label: "-11.98" },
]

export const initialBarriers: FlowBarrier[] = []

export function emptyProjectWorkspace(viewport: CanvasViewport): ProjectWorkspaceSnapshot {
  return {
    files: [],
    nodes: [],
    edges: [],
    barriers: [],
    viewport,
    selectedNodeIds: [],
    selectedEdgeIds: [],
    selectedBarrierIds: [],
    selectedFileId: null,
    selectedFileIds: [],
    lastSelectedFileId: null,
    energyDisplayOptions: { ...defaultEnergyDisplayOptions },
    viewMode: "canvas",
    inspectorMode: "inspector",
  }
}

export function initialProjectWorkspaces(emptyViewport: CanvasViewport): Record<string, ProjectWorkspaceSnapshot> {
  return {
    "diels-alder": projectWorkspaceSnapshot({
      files: initialFiles,
      nodes: initialNodes,
      edges: initialEdges,
      barriers: initialBarriers,
      viewport: emptyViewport,
      selectedNodeIds: ["ts-endo"],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
      selectedFileId: initialFiles[0]?.id ?? null,
      selectedFileIds: initialFiles[0]?.id ? [initialFiles[0].id] : [],
      lastSelectedFileId: initialFiles[0]?.id ?? null,
      energyDisplayOptions: defaultEnergyDisplayOptions,
      viewMode: "canvas",
      inspectorMode: "inspector",
    }),
    nickel: emptyProjectWorkspace(emptyViewport),
    "ir-screening": emptyProjectWorkspace(emptyViewport),
  }
}

export function canvasEditSnapshot(
  nodes: FlowNode[],
  edges: FlowEdge[],
  barriers: FlowBarrier[],
  selectedNodeIds: string[],
  selectedEdgeIds: string[],
  selectedBarrierIds: string[],
): CanvasEditSnapshot {
  return {
    nodes: cloneFlowNodes(nodes),
    edges: edges.map((edge) => ({ ...edge })),
    barriers: barriers.map((barrier) => ({ ...barrier })),
    selectedNodeIds: [...selectedNodeIds],
    selectedEdgeIds: [...selectedEdgeIds],
    selectedBarrierIds: [...selectedBarrierIds],
  }
}


export function restoreCanvasEditSnapshot(snapshot: CanvasEditSnapshot): CanvasEditSnapshot {
  return canvasEditSnapshot(
    snapshot.nodes,
    snapshot.edges,
    snapshot.barriers,
    snapshot.selectedNodeIds,
    snapshot.selectedEdgeIds,
    snapshot.selectedBarrierIds,
  )
}

export function projectWorkspaceSnapshot(snapshot: ProjectWorkspaceSnapshot): ProjectWorkspaceSnapshot {
  return {
    files: cloneSourceFiles(snapshot.files),
    nodes: cloneFlowNodes(snapshot.nodes),
    edges: snapshot.edges.map((edge) => ({ ...edge })),
    barriers: snapshot.barriers.map((barrier) => ({ ...barrier })),
    viewport: { ...snapshot.viewport },
    selectedNodeIds: [...snapshot.selectedNodeIds],
    selectedEdgeIds: [...snapshot.selectedEdgeIds],
    selectedBarrierIds: [...snapshot.selectedBarrierIds],
    selectedFileId: snapshot.selectedFileId,
    selectedFileIds: [...snapshot.selectedFileIds],
    lastSelectedFileId: snapshot.lastSelectedFileId,
    energyDisplayOptions: { ...snapshot.energyDisplayOptions },
    viewMode: snapshot.viewMode,
    inspectorMode: snapshot.inspectorMode,
  }
}


export function restoreProjectWorkspaceSnapshot(snapshot: ProjectWorkspaceSnapshot): ProjectWorkspaceSnapshot {
  return projectWorkspaceSnapshot(snapshot)
}

export function restoreProjectWorkspaceApplyTransition(snapshot: ProjectWorkspaceSnapshot): ProjectWorkspaceApplyTransition {
  return {
    workspace: restoreProjectWorkspaceSnapshot(snapshot),
    keyboardEdgeSourceId: null,
    connectionDraft: null,
    barrierDraft: null,
    dragState: null,
    candidateReview: null,
    candidateRegisterBusy: false,
    structurePreviewNodeId: null,
    clearEditHistory: true,
  }
}


export type ProjectWorkspaceTransition = {
  workspaces: Record<string, ProjectWorkspaceSnapshot>
  activeProjectId: string
  activeSnapshot: ProjectWorkspaceSnapshot
}

export type ProjectCreationTransition = ProjectWorkspaceTransition & {
  projects: ProjectSummary[]
  project: ProjectSummary
}

export function localProjectSummary({
  projectLabel,
  nextIndex,
  now,
}: {
  projectLabel?: string
  nextIndex: number
  now: number
}): ProjectSummary {
  return {
    id: `local-project-${now}-${nextIndex}`,
    label: projectLabel?.trim() || `Untitled Study ${nextIndex}`,
    meta: "empty",
  }
}

export function fallbackLocalProjectSummary(now: number): ProjectSummary {
  return {
    id: `local-project-${now}-empty`,
    label: "Untitled Study",
    meta: "empty",
  }
}

export function createLocalProjectWorkspaceTransition({
  projects,
  workspaces,
  activeProjectId,
  currentSnapshot,
  nextSnapshot,
  projectLabel,
  now,
}: {
  projects: ProjectSummary[]
  workspaces: Record<string, ProjectWorkspaceSnapshot>
  activeProjectId: string
  currentSnapshot: ProjectWorkspaceSnapshot
  nextSnapshot: ProjectWorkspaceSnapshot
  projectLabel?: string
  now: number
}): ProjectCreationTransition {
  const nextProject = localProjectSummary({
    projectLabel,
    nextIndex: projects.length + 1,
    now,
  })
  const transition = createProjectWorkspaceTransition({
    workspaces,
    activeProjectId,
    currentSnapshot,
    nextProjectId: nextProject.id,
    nextSnapshot,
  })

  return {
    ...transition,
    projects: [nextProject, ...projects],
    project: nextProject,
  }
}

export function createProjectWorkspaceTransition({
  workspaces,
  activeProjectId,
  currentSnapshot,
  nextProjectId,
  nextSnapshot,
}: {
  workspaces: Record<string, ProjectWorkspaceSnapshot>
  activeProjectId: string
  currentSnapshot: ProjectWorkspaceSnapshot
  nextProjectId: string
  nextSnapshot: ProjectWorkspaceSnapshot
}): ProjectWorkspaceTransition {
  const restoredCurrentSnapshot = restoreProjectWorkspaceSnapshot(currentSnapshot)
  const restoredNextSnapshot = restoreProjectWorkspaceSnapshot(nextSnapshot)

  return {
    workspaces: {
      ...workspaces,
      [activeProjectId]: restoredCurrentSnapshot,
      [nextProjectId]: restoredNextSnapshot,
    },
    activeProjectId: nextProjectId,
    activeSnapshot: restoredNextSnapshot,
  }
}

export function switchProjectWorkspaceTransition({
  workspaces,
  activeProjectId,
  targetProjectId,
  currentSnapshot,
  fallbackSnapshot,
}: {
  workspaces: Record<string, ProjectWorkspaceSnapshot>
  activeProjectId: string
  targetProjectId: string
  currentSnapshot: ProjectWorkspaceSnapshot
  fallbackSnapshot: ProjectWorkspaceSnapshot
}): ProjectWorkspaceTransition | null {
  if (targetProjectId === activeProjectId) return null
  const restoredCurrentSnapshot = restoreProjectWorkspaceSnapshot(currentSnapshot)
  const targetSnapshot = restoreProjectWorkspaceSnapshot(workspaces[targetProjectId] ?? fallbackSnapshot)

  return {
    workspaces: {
      ...workspaces,
      [activeProjectId]: restoredCurrentSnapshot,
      [targetProjectId]: targetSnapshot,
    },
    activeProjectId: targetProjectId,
    activeSnapshot: targetSnapshot,
  }
}

export function saveAndActivateProjectWorkspaceTransition({
  workspaces,
  activeProjectId,
  targetProjectId,
  currentSnapshot,
  targetSnapshot,
}: {
  workspaces: Record<string, ProjectWorkspaceSnapshot>
  activeProjectId: string
  targetProjectId: string
  currentSnapshot: ProjectWorkspaceSnapshot
  targetSnapshot: ProjectWorkspaceSnapshot
}): ProjectWorkspaceTransition {
  const savedCurrentSnapshot = restoreProjectWorkspaceSnapshot(currentSnapshot)
  const activeSnapshot = restoreProjectWorkspaceSnapshot(targetSnapshot)

  return {
    workspaces: {
      ...workspaces,
      [activeProjectId]: savedCurrentSnapshot,
      [targetProjectId]: activeSnapshot,
    },
    activeProjectId: targetProjectId,
    activeSnapshot,
  }
}


export type ProjectDeletionTransition = ProjectWorkspaceTransition & {
  projects: ProjectSummary[]
  activeChanged: boolean
}

export function deleteProjectWorkspaceTransition({
  projects,
  workspaces,
  activeProjectId,
  deletedProjectId,
  currentSnapshot,
  fallbackProject,
  fallbackSnapshot,
}: {
  projects: ProjectSummary[]
  workspaces: Record<string, ProjectWorkspaceSnapshot>
  activeProjectId: string
  deletedProjectId: string
  currentSnapshot: ProjectWorkspaceSnapshot
  fallbackProject: ProjectSummary
  fallbackSnapshot: ProjectWorkspaceSnapshot
}): ProjectDeletionTransition | null {
  if (!projects.some((project) => project.id === deletedProjectId)) return null

  const remainingProjects = projects.filter((project) => project.id !== deletedProjectId)
  if (remainingProjects.length === 0) {
    const activeSnapshot = restoreProjectWorkspaceSnapshot(fallbackSnapshot)
    return {
      projects: [fallbackProject],
      workspaces: { [fallbackProject.id]: activeSnapshot },
      activeProjectId: fallbackProject.id,
      activeSnapshot,
      activeChanged: true,
    }
  }

  const activeChanged = deletedProjectId === activeProjectId
  const nextActiveProjectId = activeChanged ? remainingProjects[0].id : activeProjectId
  const activeSnapshot = activeChanged
    ? restoreProjectWorkspaceSnapshot(workspaces[nextActiveProjectId] ?? fallbackSnapshot)
    : restoreProjectWorkspaceSnapshot(currentSnapshot)
  const nextWorkspaces = { ...workspaces }
  delete nextWorkspaces[deletedProjectId]
  nextWorkspaces[nextActiveProjectId] = activeSnapshot

  return {
    projects: remainingProjects,
    workspaces: nextWorkspaces,
    activeProjectId: nextActiveProjectId,
    activeSnapshot,
    activeChanged,
  }
}

export function deleteLocalProjectWorkspaceTransition({
  projects,
  workspaces,
  activeProjectId,
  deletedProjectId,
  currentSnapshot,
  fallbackSnapshot,
  now,
}: {
  projects: ProjectSummary[]
  workspaces: Record<string, ProjectWorkspaceSnapshot>
  activeProjectId: string
  deletedProjectId: string
  currentSnapshot: ProjectWorkspaceSnapshot
  fallbackSnapshot: ProjectWorkspaceSnapshot
  now: number
}): ProjectDeletionTransition | null {
  return deleteProjectWorkspaceTransition({
    projects,
    workspaces,
    activeProjectId,
    deletedProjectId,
    currentSnapshot,
    fallbackProject: fallbackLocalProjectSummary(now),
    fallbackSnapshot,
  })
}

export function cloneSourceFiles(files: SourceFile[]): SourceFile[] {
  return files.map((file) => ({
    ...file,
    parse: file.parse ? {
      ...file.parse,
      warnings: [...(file.parse.warnings ?? [])],
      coordinatePreview: file.parse.coordinatePreview ? {
        ...file.parse.coordinatePreview,
        elements: [...(file.parse.coordinatePreview.elements ?? [])],
        atoms: file.parse.coordinatePreview.atoms?.map((atom) => ({ ...atom })),
      } : null,
      candidates: file.parse.candidates?.map((candidate) => ({
        ...candidate,
        warnings: [...(candidate.warnings ?? [])],
        coordinatePreview: candidate.coordinatePreview ? {
          ...candidate.coordinatePreview,
          elements: [...(candidate.coordinatePreview.elements ?? [])],
          atoms: candidate.coordinatePreview.atoms?.map((atom) => ({ ...atom })),
        } : null,
      })),
    } : undefined,
  }))
}

export function cloneFlowNodes(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    corrections: node.corrections?.map((correction) => ({ ...correction })),
  }))
}


export function projectWorkspaceFromPackage(projectPackage: RxnFlowProjectPackage): ProjectWorkspaceSnapshot {
  return projectWorkspaceSnapshot({
    files: projectPackage.files,
    nodes: projectPackage.nodes,
    edges: projectPackage.edges,
    barriers: projectPackage.barriers,
    viewport: projectPackage.viewport,
    selectedNodeIds: projectPackage.nodes[0]?.id ? [projectPackage.nodes[0].id] : [],
    selectedEdgeIds: [],
    selectedBarrierIds: [],
    selectedFileId: projectPackage.files[0]?.id ?? null,
    selectedFileIds: projectPackage.files[0]?.id ? [projectPackage.files[0].id] : [],
    lastSelectedFileId: projectPackage.files[0]?.id ?? null,
    energyDisplayOptions: defaultEnergyDisplayOptions,
    viewMode: "canvas",
    inspectorMode: "inspector",
  })
}
