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
  const inputRef = useRef<HTMLInputElement | null>(null)
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return commands
    return commands.filter((command) => `${command.label} ${command.group}`.toLocaleLowerCase().includes(normalized))
  }, [commands, query])

  useEffect(() => inputRef.current?.focus(), [])

  return (
    <div className="command-palette-backdrop" role="presentation" onPointerDown={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose()
        }}
      >
        <label className="command-palette-search">
          <Search size={17} aria-hidden="true" />
          <span className="visually-hidden">Search commands</span>
          <input
            ref={inputRef}
            name="command-search"
            autoComplete="off"
            placeholder="Search commands…"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <kbd>Esc</kbd>
        </label>
        <div className="command-palette-results" role="listbox" aria-label="Commands">
          {filtered.length ? filtered.map((command) => (
            <button
              key={command.id}
              type="button"
              role="option"
              disabled={command.enabled === false}
              onClick={() => {
                command.run()
                onClose()
              }}
            >
              <span><small>{command.group}</small>{command.label}</span>
              {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
            </button>
          )) : <p className="command-palette-empty">No matching commands</p>}
        </div>
      </section>
    </div>
  )
}
