import { useState } from "react"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { CommandPalette, type WorkbenchCommand } from "./CommandPalette"

function PaletteHarness({
  commands,
  onOuterKeyDown,
}: {
  commands: WorkbenchCommand[]
  onOuterKeyDown?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div onKeyDown={onOuterKeyDown}>
      <button type="button" onClick={() => setOpen(true)}>Open commands</button>
      {open ? <CommandPalette commands={commands} onClose={() => setOpen(false)} /> : null}
    </div>
  )
}

const commands: WorkbenchCommand[] = [
  { id: "select", label: "Select Tool", group: "Tools", shortcut: "V", run: vi.fn() },
  { id: "undo", label: "Undo Canvas Edit", group: "Edit", enabled: false, run: vi.fn() },
  { id: "settings", label: "Open Settings", group: "Project", run: vi.fn() },
]

describe("CommandPalette", () => {
  it("contains focus, isolates Escape, and restores the opener", () => {
    const onOuterKeyDown = vi.fn()
    render(<PaletteHarness commands={commands} onOuterKeyDown={onOuterKeyDown} />)
    const trigger = screen.getByRole("button", { name: "Open commands" })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole("dialog", { name: "Command palette" })
    const search = within(dialog).getByRole("searchbox", { name: "Search commands" })
    const results = within(dialog).getByRole("group", { name: "Commands" })
    const lastEnabledCommand = within(results).getByRole("button", { name: /Open Settings/ })
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(search).toHaveFocus()
    expect(search).toHaveAccessibleName("Search commands")
    expect(within(dialog).queryByRole("listbox")).not.toBeInTheDocument()
    expect(within(dialog).queryByRole("option")).not.toBeInTheDocument()

    expect(fireEvent.keyDown(search, { key: "Tab", shiftKey: true })).toBe(false)
    expect(lastEnabledCommand).toHaveFocus()
    expect(fireEvent.keyDown(lastEnabledCommand, { key: "Tab" })).toBe(false)
    expect(search).toHaveFocus()

    onOuterKeyDown.mockClear()
    expect(fireEvent.keyDown(search, { key: "Escape" })).toBe(false)
    expect(onOuterKeyDown).not.toHaveBeenCalled()
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it("keeps the search focused when no commands match", () => {
    render(<PaletteHarness commands={commands} />)
    const trigger = screen.getByRole("button", { name: "Open commands" })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole("dialog", { name: "Command palette" })
    const search = within(dialog).getByRole("searchbox", { name: "Search commands" })

    fireEvent.change(search, { target: { value: "not-a-command" } })
    expect(within(dialog).getByRole("status")).toHaveTextContent("No matching commands")
    expect(fireEvent.keyDown(search, { key: "Tab" })).toBe(false)
    expect(search).toHaveFocus()
    expect(fireEvent.keyDown(search, { key: "Tab", shiftKey: true })).toBe(false)
    expect(search).toHaveFocus()
  })

  it("hands focus back before running a command and restores it after backdrop close", () => {
    let trigger: HTMLElement
    const run = vi.fn(() => expect(trigger).toHaveFocus())
    const testCommands: WorkbenchCommand[] = [
      { id: "run", label: "Run Command", group: "Tools", run },
    ]
    render(<PaletteHarness commands={testCommands} />)
    trigger = screen.getByRole("button", { name: "Open commands" })
    trigger.focus()
    fireEvent.click(trigger)

    fireEvent.click(screen.getByRole("button", { name: /Run Command/ }))
    expect(run).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    const dialog = screen.getByRole("dialog", { name: "Command palette" })
    fireEvent.pointerDown(dialog.parentElement as HTMLElement)
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
