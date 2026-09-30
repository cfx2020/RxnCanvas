import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Check, ChevronRight, FileText, FlaskConical, Monitor, Moon, Ruler, Sun } from "lucide-react"
import type { AppearancePreference, DesktopPreferences, EnergyOutputUnitPreference, SourceOpenerProfile } from "./desktopPreferences"
import "./settings.css"

const themes = [
  { value: "system", label: "Follow system", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const
const units = [
  { value: "kcal/mol", label: "kcal/mol" },
  { value: "hartree", label: "Hartree (Eh)" },
  { value: "kj/mol", label: "kJ/mol" },
] as const
const categories = [
  { id: "theme", label: "Theme", icon: Sun },
  { id: "energy", label: "Energy unit", icon: Ruler },
  { id: "gaussian", label: "Gaussian logs", icon: FlaskConical },
  { id: "text", label: "Text outputs", icon: FileText },
] as const
type Category = typeof categories[number]["id"]

export function SettingsPanel({ preferences, desktopAvailable, onAppearanceChange, onEnergyUnitChange, onChooseOpener, onClearOpener, onClose, returnFocusTo }: {
  preferences: DesktopPreferences
  desktopAvailable: boolean
  onAppearanceChange: (appearance: AppearancePreference) => void
  onEnergyUnitChange: (unit: EnergyOutputUnitPreference) => void
  onChooseOpener: (profile: SourceOpenerProfile) => void
  onClearOpener: (profile: SourceOpenerProfile) => void
  onClose: () => void
  returnFocusTo?: HTMLElement | null
}) {
  const [active, setActive] = useState<Category | null>(null)
  const [position, setPosition] = useState({ left: 12, bottom: 64 })
  const panelRef = useRef<HTMLDivElement>(null)
  const submenuRef = useRef<HTMLElement>(null)
  const returnRef = useRef(returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null))

  useLayoutEffect(() => {
    const place = () => {
      const anchor = returnRef.current?.getBoundingClientRect()
      const width = panelRef.current?.offsetWidth ?? 272
      const height = panelRef.current?.offsetHeight ?? 260
      setPosition({
        left: Math.max(12, Math.min(anchor?.left ?? 12, window.innerWidth - width - 12)),
        bottom: Math.max(12, Math.min(anchor ? window.innerHeight - anchor.top + 8 : 64, window.innerHeight - height - 12)),
      })
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [active])

  useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true })
    return () => { if (returnRef.current?.isConnected) returnRef.current.focus({ preventScroll: true }) }
  }, [])

  useEffect(() => {
    if (active) submenuRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus()
  }, [active])

  const back = () => {
    panelRef.current?.querySelector<HTMLButtonElement>(`[data-category="${active}"]`)?.focus()
    setActive(null)
  }
  const profile = active === "gaussian" || active === "text" ? active : null
  const opener = profile ? preferences.sourceOpeners[profile] : undefined


  return (
    <div className="settings-dismiss" onPointerDown={onClose}>
      <div ref={panelRef} className="settings-menu" style={position}
        role="dialog" aria-modal="true" aria-label="Settings" onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            onClose()
          } else if (event.key === "ArrowLeft" && active) {
            event.preventDefault()
            back()
          } else if (event.key === "Tab") {
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"))
            const first = buttons[0]
            const last = buttons.at(-1)
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
          }
        }}>
        <section className="settings-menu-root">
          {categories.map(({ id, label, icon: Icon }, index) => (
            <button key={id} data-category={id} className={`settings-menu-category${index === 2 ? " starts-group" : ""}`}
              aria-expanded={active === id} aria-controls={active === id ? "settings-options" : undefined}
              onClick={() => setActive(active === id ? null : id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") { event.preventDefault(); setActive(id) }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault()
                  const next = (index + (event.key === "ArrowDown" ? 1 : categories.length - 1)) % categories.length
                  panelRef.current?.querySelector<HTMLButtonElement>(`[data-category="${categories[next].id}"]`)?.focus()
                }
              }}>
              <Icon size={15} /><span>{label}</span><ChevronRight size={13} />
            </button>
          ))}
        </section>
        {active && <section ref={submenuRef} className="settings-menu-options" id="settings-options" aria-label={categories.find((category) => category.id === active)?.label}>
          {active === "theme" && <div role="group" aria-label="Appearance">{themes.map(({ value, label, icon: Icon }) => (
            <button key={value} className="settings-menu-option" aria-pressed={preferences.appearance === value} onClick={() => onAppearanceChange(value)}>
              <Icon size={15} /><span>{label}</span>{preferences.appearance === value && <Check size={14} />}
            </button>
          ))}</div>}
          {active === "energy" && <div role="group" aria-label="Energy unit">{units.map(({ value, label }) => (
            <button key={value} className="settings-menu-option" aria-pressed={preferences.energyOutputUnit === value} onClick={() => onEnergyUnitChange(value)}>
              <span>{label}</span>{preferences.energyOutputUnit === value && <Check size={14} />}
            </button>
          ))}</div>}
          {profile && <div className="settings-menu-opener">
            <p>Open {profile === "gaussian" ? "Gaussian log files" : "text output files"} with</p>
            <strong title={opener?.appPath ?? undefined}>{opener?.label ?? opener?.appPath ?? "Automatic"}</strong>
            <button className="settings-menu-option" disabled={!desktopAvailable} onClick={() => onChooseOpener(profile)}>Choose application…</button>
            <button className="settings-menu-option" disabled={!desktopAvailable || !opener} onClick={() => onClearOpener(profile)}>Use automatic selection</button>
          </div>}
        </section>}
      </div>
    </div>
  )
}
