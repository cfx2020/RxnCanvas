import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { WorkbenchToolbar } from "./WorkbenchToolbar"
import { defaultEnergyDisplayOptions } from "./energyDisplay"

function renderToolbar() {
  return render(
    <WorkbenchToolbar
      tool="select"
      viewMode="canvas"
      onSetTool={vi.fn()}
      onSetViewMode={vi.fn()}
      energyDisplayOptions={defaultEnergyDisplayOptions}
      onEnergyDisplayOptionsChange={vi.fn()}
      canUndo={false}
      canRedo={false}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      onAutoLayout={vi.fn()}
      onFitView={vi.fn()}
      onInsertImage={vi.fn()}
      placement={{ mode: "floating", x: 100, y: 10 }}
      onDragStart={vi.fn()}
    />,
  )
}

describe("WorkbenchToolbar tooltips", () => {
  afterEach(() => vi.useRealTimers())

  it("shows a hover tooltip for every toolbar control, including disabled actions", () => {
    vi.useFakeTimers()
    renderToolbar()
    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    const controls = [
      ...within(toolbar).getAllByRole("button"),
      within(toolbar).getByRole("combobox", { name: "Energy" }),
    ]
    for (const control of controls) {
      fireEvent.pointerOver(control, { pointerType: "mouse" })
      act(() => vi.advanceTimersByTime(300))
      expect(screen.getByRole("tooltip")).not.toBeEmptyDOMElement()
      expect(toolbar).not.toContainElement(screen.getByRole("tooltip"))
      fireEvent.pointerLeave(toolbar)
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    }
  })

  it("supports keyboard focus and scrolling, and dismisses hints on Escape and activation", () => {
    vi.useFakeTimers()
    renderToolbar()
    const button = screen.getByRole("button", { name: "Select tool" })
    fireEvent.focus(button)
    act(() => vi.advanceTimersByTime(300))
    expect(screen.getByRole("tooltip")).toHaveTextContent("Select tool")
    expect(button).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id)
    fireEvent.scroll(screen.getByRole("toolbar", { name: "Canvas commands" }))
    expect(screen.getByRole("tooltip")).toHaveTextContent("Select tool")
    fireEvent.keyDown(button, { key: "Escape" })
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    expect(button).not.toHaveAttribute("aria-describedby")

    fireEvent.pointerOver(button, { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(300))
    fireEvent.pointerDown(button)
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })
})
