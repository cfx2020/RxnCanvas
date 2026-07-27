import { useEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"

export type WorkbenchCommand = {
  id: string
  label: string
  group: "Tools" | "View" | "Project" | "Edit"
  shortcut?: string
  enabled?: boolean
  run: () => void
}

export function CommandPalette({ commands, onClose }: { commands: WorkbenchCommand[]; onClose: () => void }) {
  const [query, setQuery] = useState("")
  const paletteRef = useRef<HTMLElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return commands
    return commands.filter((command) => `${command.label} ${command.group}`.toLocaleLowerCase().includes(normalized))
  }, [commands, query])

  const restoreReturnFocus = () => {
    const returnFocus = returnFocusRef.current
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
  }

  useEffect(() => {
    const activeElement = document.activeElement
    if (
      !returnFocusRef.current
      && activeElement instanceof HTMLElement
      && activeElement !== document.body
      && !paletteRef.current?.contains(activeElement)
    ) {
      returnFocusRef.current = activeElement
    }
    inputRef.current?.focus({ preventScroll: true })
    return restoreReturnFocus
  }, [])

  return (
    <div className="command-palette-backdrop" role="presentation" onPointerDown={onClose}>
      <section
        ref={paletteRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            onClose()
            return
          }
          if (event.key !== "Tab") return
          const focusableElements = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>("input:not([disabled]), button:not([disabled])"),
          )
          const firstElement = focusableElements[0]
          const lastElement = focusableElements[focusableElements.length - 1]
          if (!firstElement || !lastElement) return
          if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault()
            lastElement.focus({ preventScroll: true })
          } else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault()
            firstElement.focus({ preventScroll: true })
          }
        }}
      >
        <label className="command-palette-search">
          <Search size={17} aria-hidden="true" />
          <span className="visually-hidden">Search commands</span>
          <input
            ref={inputRef}
            type="search"
            name="command-search"
            autoComplete="off"
            spellCheck={false}
            aria-controls="command-palette-results"
            placeholder="Search commands…"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <kbd aria-hidden="true">Esc</kbd>
        </label>
        <div id="command-palette-results" className="command-palette-results" role="group" aria-label="Commands">
          {filtered.length ? filtered.map((command) => (
            <button
              key={command.id}
              type="button"
              disabled={command.enabled === false}
              onClick={() => {
                restoreReturnFocus()
                returnFocusRef.current = null
                command.run()
                onClose()
              }}
            >
              <span><small>{command.group}</small>{command.label}</span>
              {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
            </button>
          )) : <p className="command-palette-empty" role="status">No matching commands</p>}
        </div>
      </section>
    </div>
  )
}
