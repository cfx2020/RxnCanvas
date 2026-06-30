import type { Point } from "../domain/projectPackages"

export type CanvasKeyboardInput = {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  editableTarget: boolean
  hasSelection: boolean
}

export type CanvasKeyboardAction =
  | { kind: "none" }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "select-all" }
  | { kind: "copy" }
  | { kind: "paste" }
  | { kind: "cut" }
  | { kind: "delete" }
  | { kind: "clear" }
  | { kind: "nudge"; delta: Point }

export type CanvasKeyboardTransition = {
  action: CanvasKeyboardAction
  shouldPreventDefault: boolean
}

const nudgeDeltaByKey: Record<string, Point> = {
  ArrowUp: { x: 0, y: -20 },
  ArrowDown: { x: 0, y: 20 },
  ArrowLeft: { x: -20, y: 0 },
  ArrowRight: { x: 20, y: 0 },
}

export function shortcutTargetIsEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tagName = target.tagName.toLowerCase()
  return tagName === "input" || tagName === "textarea" || tagName === "select"
}

export function canvasKeyboardActionForInput(input: CanvasKeyboardInput): CanvasKeyboardAction {
  if (input.altKey || input.editableTarget) return { kind: "none" }

  if (input.metaKey || input.ctrlKey) {
    const key = input.key.toLowerCase()
    if (key === "a") return { kind: "select-all" }
    if (key === "c") return input.hasSelection ? { kind: "copy" } : { kind: "none" }
    if (key === "v") return { kind: "paste" }
    if (key === "x") return input.hasSelection ? { kind: "cut" } : { kind: "none" }
    if (key === "z" && input.shiftKey) return { kind: "redo" }
    if (key === "z") return { kind: "undo" }
    if (key === "y" && input.ctrlKey) return { kind: "redo" }
    return { kind: "none" }
  }

  if (input.key === "Delete" || input.key === "Backspace") {
    return input.hasSelection ? { kind: "delete" } : { kind: "none" }
  }
  if (input.key === "Escape") return { kind: "clear" }

  const delta = nudgeDeltaByKey[input.key]
  return delta ? { kind: "nudge", delta } : { kind: "none" }
}

export function canvasKeyboardTransitionForInput(input: CanvasKeyboardInput): CanvasKeyboardTransition {
  const action = canvasKeyboardActionForInput(input)
  return {
    action,
    shouldPreventDefault: action.kind !== "none",
  }
}
