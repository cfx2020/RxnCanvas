import { describe, expect, it, vi } from "vitest"
import { handleCanvasKeyboardEvent, type CanvasKeyboardHandlers } from "./appCanvasKeyboardActions"

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

function keyboardHandlers(overrides: Partial<CanvasKeyboardHandlers> = {}): CanvasKeyboardHandlers {
  return {
    undoEdit: vi.fn(),
    redoEdit: vi.fn(),
    selectAllCanvasItems: vi.fn(),
    copyCanvasSelection: vi.fn(),
    pasteCanvasClipboard: vi.fn(),
    cutCanvasSelection: vi.fn(),
    deleteSelection: vi.fn(),
    clearCanvasSelection: vi.fn(),
    nudgeSelectedNodes: vi.fn(),
    ...overrides,
  }
}

describe("appCanvasKeyboardActions", () => {
  it("routes undo and prevents default", () => {
    const undoEdit = vi.fn()
    const event = keyboardEvent("z", { metaKey: true } as Partial<KeyboardEvent>)
    handleCanvasKeyboardEvent(event, true, keyboardHandlers({ undoEdit }))
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(undoEdit).toHaveBeenCalledTimes(1)
  })

  it("routes delete only when there is a selection", () => {
    const deleteSelection = vi.fn()
    const event = keyboardEvent("Backspace")
    handleCanvasKeyboardEvent(event, true, keyboardHandlers({ deleteSelection }))
    expect(deleteSelection).toHaveBeenCalledTimes(1)
  })

  it("routes canvas clipboard shortcuts", () => {
    const handlers = keyboardHandlers()
    handleCanvasKeyboardEvent(keyboardEvent("a", { metaKey: true } as Partial<KeyboardEvent>), true, handlers)
    handleCanvasKeyboardEvent(keyboardEvent("c", { metaKey: true } as Partial<KeyboardEvent>), true, handlers)
    handleCanvasKeyboardEvent(keyboardEvent("v", { metaKey: true } as Partial<KeyboardEvent>), false, handlers)
    handleCanvasKeyboardEvent(keyboardEvent("x", { metaKey: true } as Partial<KeyboardEvent>), true, handlers)

    expect(handlers.selectAllCanvasItems).toHaveBeenCalledTimes(1)
    expect(handlers.copyCanvasSelection).toHaveBeenCalledTimes(1)
    expect(handlers.pasteCanvasClipboard).toHaveBeenCalledTimes(1)
    expect(handlers.cutCanvasSelection).toHaveBeenCalledTimes(1)
  })

  it("does not route copy or cut without a selection", () => {
    const handlers = keyboardHandlers()
    const copyEvent = keyboardEvent("c", { metaKey: true } as Partial<KeyboardEvent>)
    const cutEvent = keyboardEvent("x", { metaKey: true } as Partial<KeyboardEvent>)

    handleCanvasKeyboardEvent(copyEvent, false, handlers)
    handleCanvasKeyboardEvent(cutEvent, false, handlers)

    expect(copyEvent.preventDefault).not.toHaveBeenCalled()
    expect(cutEvent.preventDefault).not.toHaveBeenCalled()
    expect(handlers.copyCanvasSelection).not.toHaveBeenCalled()
    expect(handlers.cutCanvasSelection).not.toHaveBeenCalled()
  })
})
