import { useEffect, useRef, type ReactNode } from "react"
import { FileText, FlaskConical, X } from "lucide-react"
import type { AppearancePreference, DesktopPreferences, EnergyOutputUnitPreference, SourceOpenerProfile } from "./desktopPreferences"

const appearanceOptions: Array<{ value: AppearancePreference; label: string }> = [
  { value: "system", label: "Follow system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

const energyUnitOptions: Array<{ value: EnergyOutputUnitPreference; label: string }> = [
  { value: "kcal/mol", label: "kcal" },
  { value: "hartree", label: "Eh" },
  { value: "kj/mol", label: "kJ" },
]

export function SettingsPanel({
  preferences,
  desktopAvailable,
  onAppearanceChange,
  onEnergyUnitChange,
  onChooseOpener,
  onClearOpener,
  onClose,
  returnFocusTo,
}: {
  preferences: DesktopPreferences
  desktopAvailable: boolean
  onAppearanceChange: (appearance: AppearancePreference) => void
  onEnergyUnitChange: (unit: EnergyOutputUnitPreference) => void
  onChooseOpener: (profile: SourceOpenerProfile) => void
  onClearOpener: (profile: SourceOpenerProfile) => void
  onClose: () => void
  returnFocusTo?: HTMLElement | null
}) {
  const panelRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(returnFocusTo ?? null)

  useEffect(() => {
    const activeElement = document.activeElement
    if (!returnFocusRef.current && activeElement instanceof HTMLElement && !panelRef.current?.contains(activeElement)) {
      returnFocusRef.current = activeElement
    }
    closeButtonRef.current?.focus({ preventScroll: true })
    return () => {
      const returnFocus = returnFocusRef.current
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    }
  }, [])

  return (
    <div className="settings-backdrop" onPointerDown={onClose}>
      <aside
        ref={panelRef}
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
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
            event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), select:not([disabled])"),
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
        <header className="settings-panel-header">
          <div>
            <strong>Settings</strong>
          </div>
          <button ref={closeButtonRef} type="button" className="settings-panel-close" aria-label="Close settings" title="Close settings" onClick={onClose}>
            <X size={15} aria-hidden="true" />
          </button>
        </header>

        <div className="settings-panel-body">
          <section className="settings-section" aria-labelledby="settings-section-general">
            <h2 id="settings-section-general">General</h2>
            <label className="settings-row">
              <span className="settings-row-copy">
                <strong>Theme</strong>
              </span>
              <select
                aria-label="Appearance"
                value={preferences.appearance}
                onChange={(event) => onAppearanceChange(event.currentTarget.value as AppearancePreference)}
              >
                {appearanceOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="settings-row">
              <span className="settings-row-copy">
                <strong>Energy unit</strong>
              </span>
              <select
                aria-label="Energy unit"
                value={preferences.energyOutputUnit}
                onChange={(event) => onEnergyUnitChange(event.currentTarget.value as EnergyOutputUnitPreference)}
              >
                {energyUnitOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </section>

          <section className="settings-section" aria-labelledby="settings-section-openers">
            <h2 id="settings-section-openers">External apps</h2>
            <OpenerField
              icon={<FlaskConical size={15} />}
              label="Gaussian logs"
              profile="gaussian"
              value={preferences.sourceOpeners.gaussian?.label ?? preferences.sourceOpeners.gaussian?.appPath ?? "Not set"}
              desktopAvailable={desktopAvailable}
              onChooseOpener={onChooseOpener}
              onClearOpener={onClearOpener}
            />
            <OpenerField
              icon={<FileText size={15} />}
              label="Text outputs"
              profile="text"
              value={preferences.sourceOpeners.text?.label ?? preferences.sourceOpeners.text?.appPath ?? "Not set"}
              desktopAvailable={desktopAvailable}
              onChooseOpener={onChooseOpener}
              onClearOpener={onClearOpener}
            />
          </section>
        </div>
      </aside>
    </div>
  )
}

function OpenerField({
  icon,
  label,
  profile,
  value,
  desktopAvailable,
  onChooseOpener,
  onClearOpener,
}: {
  icon: ReactNode
  label: string
  profile: SourceOpenerProfile
  value: string
  desktopAvailable: boolean
  onChooseOpener: (profile: SourceOpenerProfile) => void
  onClearOpener: (profile: SourceOpenerProfile) => void
}) {
  const displayedValue = desktopAvailable ? value : "Desktop app only"
  const configured = desktopAvailable && value !== "Not set"
  return (
    <div className="settings-row settings-opener-field">
      <span className="settings-row-glyph" aria-hidden="true">{icon}</span>
      <span className="settings-row-copy">
        <strong>{label}</strong>
      </span>
      <div className="settings-opener-control">
        <div className={`settings-opener-value${configured ? " is-configured" : ""}`} title={displayedValue}>
          {displayedValue}
        </div>
        <div className="settings-opener-actions">
          <button type="button" onClick={() => onChooseOpener(profile)} disabled={!desktopAvailable}>Choose</button>
          <button type="button" onClick={() => onClearOpener(profile)} disabled={!desktopAvailable || !configured}>Clear</button>
        </div>
      </div>
    </div>
  )
}
