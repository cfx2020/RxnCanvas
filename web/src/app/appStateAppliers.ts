import type { Dispatch, SetStateAction } from "react"
import type { CanvasViewport, FlowBarrier, FlowEdge, FlowNode, ProjectSummary, SourceFile } from "../domain/projectPackages"
import { restoreCanvasEditInteractionTransition, type CanvasDragState, type CanvasSelectionIds } from "./canvasEditState"
import type { BarrierDraft, ConnectionDraft } from "./CanvasWorkspace"
import type { CandidateReviewState } from "./importRegistration"
import {
  restoreCanvasEditSnapshot,
  restoreProjectWorkspaceApplyTransition,
  type CanvasEditSnapshot,
  type ProjectWorkspaceApplyTransition,
  type ProjectWorkspaceSnapshot,
  type WorkbenchInspectorMode,
  type WorkbenchViewMode,
} from "./projectWorkspace"
import type { EnergyDisplayOptions } from "./energyDisplay"
import type { ProjectValidationPayload } from "./projectPackageWorkflow"

export type Setter<T> = Dispatch<SetStateAction<T>>

export type ProjectTransitionApplication = {
  projects?: ProjectSummary[]
  workspaces: Record<string, ProjectWorkspaceSnapshot>
  activeProjectId: string
  activeSnapshot: ProjectWorkspaceSnapshot
  validation?: ProjectValidationPayload | null
}

export type CanvasSelectionSetters = {
  setSelectedNodeIds: Setter<string[]>
  setSelectedEdgeIds: Setter<string[]>
  setSelectedBarrierIds: Setter<string[]>
}

export type ProjectWorkspaceStateSetters = CanvasSelectionSetters & {
  setFiles: Setter<SourceFile[]>
  setNodes: Setter<FlowNode[]>
  setEdges: Setter<FlowEdge[]>
  setBarriers: Setter<FlowBarrier[]>
  setViewport: Setter<CanvasViewport>
  setSelectedFileId: Setter<string | null>
  setSelectedFileIds: Setter<string[]>
  setLastSelectedFileId: Setter<string | null>
  setEnergyDisplayOptions: Setter<EnergyDisplayOptions>
  setViewMode: Setter<WorkbenchViewMode>
  setInspectorMode: Setter<WorkbenchInspectorMode>
  setKeyboardEdgeSourceId: Setter<string | null>
  setConnectionDraft: Setter<ConnectionDraft | null>
  setBarrierDraft: Setter<BarrierDraft | null>
  setDragState: Setter<CanvasDragState<CanvasEditSnapshot> | null>
  setCandidateReview: Setter<CandidateReviewState | null>
  setCandidateRegisterBusy: Setter<boolean>
  setStructurePreviewNodeId: Setter<string | null>
}

export type ProjectTransitionSetters = ProjectWorkspaceStateSetters & {
  setProjects: Setter<ProjectSummary[]>
  setProjectWorkspaces: Setter<Record<string, ProjectWorkspaceSnapshot>>
  setActiveProjectId: Setter<string>
  setProjectValidation: Setter<ProjectValidationPayload | null>
}

export function applyCanvasSelectionState(
  setters: CanvasSelectionSetters,
  selection: CanvasSelectionIds,
): void {
  setters.setSelectedNodeIds(selection.nodeIds)
  setters.setSelectedEdgeIds(selection.edgeIds)
  setters.setSelectedBarrierIds(selection.barrierIds)
}


export type ImportedWorkspaceSnapshotApplication = {
  snapshot: Pick<
    ProjectWorkspaceSnapshot,
    | "files"
    | "nodes"
    | "selectedNodeIds"
    | "selectedEdgeIds"
    | "selectedBarrierIds"
    | "selectedFileId"
    | "selectedFileIds"
    | "lastSelectedFileId"
    | "inspectorMode"
  >
  keyboardEdgeSourceId: string | null
  candidateReview?: CandidateReviewState | null
}

export function applyImportedWorkspaceSnapshotState(
  setters: ProjectWorkspaceStateSetters,
  application: ImportedWorkspaceSnapshotApplication,
): void {
  const { snapshot } = application
  setters.setFiles(snapshot.files)
  setters.setNodes(snapshot.nodes)
  applyCanvasSelectionState(setters, {
    nodeIds: snapshot.selectedNodeIds,
    edgeIds: snapshot.selectedEdgeIds,
    barrierIds: snapshot.selectedBarrierIds,
  })
  setters.setSelectedFileId(snapshot.selectedFileId)
  setters.setSelectedFileIds(snapshot.selectedFileIds)
  setters.setLastSelectedFileId(snapshot.lastSelectedFileId)
  setters.setKeyboardEdgeSourceId(application.keyboardEdgeSourceId)
  setters.setInspectorMode(snapshot.inspectorMode)
  if ("candidateReview" in application) setters.setCandidateReview(application.candidateReview ?? null)
}

export function applyProjectWorkspaceApplyTransitionState(
  setters: ProjectWorkspaceStateSetters,
  transition: ProjectWorkspaceApplyTransition,
  clearEditHistory: () => void,
): void {
  const { workspace } = transition
  setters.setFiles(workspace.files)
  setters.setNodes(workspace.nodes)
  setters.setEdges(workspace.edges)
  setters.setBarriers(workspace.barriers)
  setters.setViewport(workspace.viewport)
  applyCanvasSelectionState(setters, {
    nodeIds: workspace.selectedNodeIds,
    edgeIds: workspace.selectedEdgeIds,
    barrierIds: workspace.selectedBarrierIds,
  })
  setters.setSelectedFileId(workspace.selectedFileId)
  setters.setSelectedFileIds(workspace.selectedFileIds)
  setters.setLastSelectedFileId(workspace.lastSelectedFileId)
  setters.setEnergyDisplayOptions(workspace.energyDisplayOptions)
  setters.setViewMode(workspace.viewMode)
  setters.setInspectorMode(workspace.inspectorMode)
  setters.setKeyboardEdgeSourceId(transition.keyboardEdgeSourceId)
  setters.setConnectionDraft(transition.connectionDraft)
  setters.setBarrierDraft(transition.barrierDraft)
  setters.setDragState(transition.dragState)
  setters.setCandidateReview(transition.candidateReview)
  setters.setCandidateRegisterBusy(transition.candidateRegisterBusy)
  setters.setStructurePreviewNodeId(transition.structurePreviewNodeId)
  if (transition.clearEditHistory) clearEditHistory()
}

export function applyProjectWorkspaceSnapshotState(
  setters: ProjectWorkspaceStateSetters,
  snapshot: ProjectWorkspaceSnapshot,
  clearEditHistory: () => void,
): void {
  applyProjectWorkspaceApplyTransitionState(setters, restoreProjectWorkspaceApplyTransition(snapshot), clearEditHistory)
}

export function applyProjectTransitionState(
  setters: ProjectTransitionSetters,
  transition: ProjectTransitionApplication,
  clearEditHistory: () => void,
): void {
  if (transition.projects) setters.setProjects(transition.projects)
  setters.setProjectWorkspaces(transition.workspaces)
  setters.setActiveProjectId(transition.activeProjectId)
  applyProjectWorkspaceSnapshotState(setters, transition.activeSnapshot, clearEditHistory)
  setters.setProjectValidation(transition.validation ?? null)
}

export function applyCanvasEditSnapshotRestoreState(
  setters: ProjectWorkspaceStateSetters,
  snapshot: CanvasEditSnapshot,
): void {
  const restored = restoreCanvasEditSnapshot(snapshot)
  const interaction = restoreCanvasEditInteractionTransition()
  setters.setNodes(restored.nodes)
  setters.setEdges(restored.edges)
  setters.setBarriers(restored.barriers)
  applyCanvasSelectionState(setters, {
    nodeIds: restored.selectedNodeIds,
    edgeIds: restored.selectedEdgeIds,
    barrierIds: restored.selectedBarrierIds,
  })
  setters.setKeyboardEdgeSourceId(interaction.keyboardEdgeSourceId)
  setters.setConnectionDraft(interaction.connectionDraft)
  setters.setBarrierDraft(interaction.barrierDraft)
  setters.setDragState(interaction.dragState)
  setters.setInspectorMode(interaction.inspectorMode)
}
