import type { KeyboardEvent } from "react"
import {
  canvasKeyboardTransitionForInput,
  shortcutTargetIsEditable,
} from "./canvasEditState"

export type CanvasKeyboardHandlers = {
  undoEdit: () => void
  redoEdit: () => void
  deleteSelection: () => void
  clearCanvasSelection: () => void
  nudgeSelectedNodes: (delta: { x: number; y: number }) => void
}

export function handleCanvasKeyboardEvent(
  event: KeyboardEvent<HTMLDivElement>,
  hasSelection: boolean,
  handlers: CanvasKeyboardHandlers,
): void {
  const transition = canvasKeyboardTransitionForInput({
    key: event.key,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    editableTarget: shortcutTargetIsEditable(event.target),
    hasSelection,
  })
  const { action } = transition
  if (action.kind === "none") return

  if (transition.shouldPreventDefault) event.preventDefault()
  if (action.kind === "undo") handlers.undoEdit()
  if (action.kind === "redo") handlers.redoEdit()
  if (action.kind === "delete") handlers.deleteSelection()
  if (action.kind === "clear") handlers.clearCanvasSelection()
  if (action.kind === "nudge") handlers.nudgeSelectedNodes(action.delta)
}
