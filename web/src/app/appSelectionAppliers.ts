import type { FlowBarrier, FlowEdge, FlowNode, SourceFile } from "../domain/projectPackages"
import type { CanvasCollectionUpdate } from "./canvasMutationState"
import type { CanvasSelectionTransition } from "./canvasSelectionState"
import type {
  NodeSourceDetailsSelection,
  SourceFileDeletionTransition,
  SourceFileSelectionTransition,
} from "./fileDisplay"
import { applyCanvasSelectionState, type ProjectWorkspaceStateSetters } from "./appStateAppliers"

export function applySourceFileSelectionState(
  setters: ProjectWorkspaceStateSetters,
  transition: SourceFileSelectionTransition,
): void {
  setters.setKeyboardEdgeSourceId(transition.keyboardEdgeSourceId)
  setters.setSelectedNodeIds(transition.selectedNodeIds)
  setters.setSelectedEdgeIds(transition.selectedEdgeIds)
  setters.setSelectedFileId(transition.selectedFileId)
  setters.setSelectedFileIds(transition.selectedFileIds)
  setters.setLastSelectedFileId(transition.lastSelectedFileId)
  setters.setSelectedBarrierIds(transition.selectedBarrierIds)
  setters.setInspectorMode(transition.inspectorMode)
}

export function applySourceFileDeletionState(
  setters: ProjectWorkspaceStateSetters,
  transition: SourceFileDeletionTransition,
): void {
  setters.setFiles(transition.files)
  setters.setSelectedFileIds(transition.selectedFileIds)
  setters.setLastSelectedFileId(transition.lastSelectedFileId)
  setters.setSelectedFileId(transition.selectedFileId)
  setters.setInspectorMode(transition.inspectorMode)
}

export function applyNodeSourceDetailsSelectionState(
  setters: ProjectWorkspaceStateSetters,
  selection: NodeSourceDetailsSelection,
): void {
  applyCanvasSelectionState(setters, {
    nodeIds: selection.selectedNodeIds,
    edgeIds: selection.selectedEdgeIds,
    barrierIds: selection.selectedBarrierIds,
  })
  setters.setKeyboardEdgeSourceId(selection.keyboardEdgeSourceId)
  setters.setSelectedFileId(selection.selectedFileId)
  setters.setSelectedFileIds(selection.selectedFileIds)
  setters.setLastSelectedFileId(selection.lastSelectedFileId)
  setters.setInspectorMode(selection.inspectorMode)
}

export function applyCanvasSelectionTransitionState(
  setters: ProjectWorkspaceStateSetters,
  transition: CanvasSelectionTransition,
): void {
  setters.setKeyboardEdgeSourceId(transition.keyboardEdgeSourceId)
  applyCanvasSelectionState(setters, transition.selection)
  setters.setInspectorMode(transition.inspectorMode)
}

export function applyFlowNodeCollectionUpdateState(
  setters: ProjectWorkspaceStateSetters,
  transition: CanvasCollectionUpdate<FlowNode>,
): void {
  setters.setNodes(transition.items)
  applyCanvasSelectionState(setters, transition.selection)
  setters.setInspectorMode(transition.inspectorMode)
}

export function applyFlowEdgeCollectionUpdateState(
  setters: ProjectWorkspaceStateSetters,
  transition: CanvasCollectionUpdate<FlowEdge>,
): void {
  setters.setEdges(transition.items)
  applyCanvasSelectionState(setters, transition.selection)
  setters.setInspectorMode(transition.inspectorMode)
}

export function applyFlowBarrierCollectionUpdateState(
  setters: ProjectWorkspaceStateSetters,
  transition: CanvasCollectionUpdate<FlowBarrier>,
): void {
  setters.setBarriers(transition.items)
  applyCanvasSelectionState(setters, transition.selection)
  setters.setInspectorMode(transition.inspectorMode)
}

export function applySourceFilesState(
  setters: ProjectWorkspaceStateSetters,
  files: SourceFile[],
): void {
  setters.setFiles(files)
}
