import { describe, expect, it, vi } from "vitest"
import { handleCanvasKeyboardEvent } from "./appCanvasKeyboardActions"

function keyboardEvent(key: string, options: Partial<KeyboardEvent> = {}) {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: document.createElement("div"),
    preventDefault: vi.fn(),
    ...options,
  } as unknown as React.KeyboardEvent<HTMLDivElement>
}

describe("appCanvasKeyboardActions", () => {
  it("routes undo and prevents default", () => {
    const undoEdit = vi.fn()
    const event = keyboardEvent("z", { metaKey: true } as Partial<KeyboardEvent>)
    handleCanvasKeyboardEvent(event, true, {
      undoEdit,
      redoEdit: vi.fn(),
      deleteSelection: vi.fn(),
      clearCanvasSelection: vi.fn(),
      nudgeSelectedNodes: vi.fn(),
    })
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(undoEdit).toHaveBeenCalledTimes(1)
  })

  it("routes delete only when there is a selection", () => {
    const deleteSelection = vi.fn()
    const event = keyboardEvent("Backspace")
    handleCanvasKeyboardEvent(event, true, {
      undoEdit: vi.fn(),
      redoEdit: vi.fn(),
      deleteSelection,
      clearCanvasSelection: vi.fn(),
      nudgeSelectedNodes: vi.fn(),
    })
    expect(deleteSelection).toHaveBeenCalledTimes(1)
  })
})
