import type { FormEvent } from "react"
import { AlertTriangle, FlaskConical, PlusCircle } from "lucide-react"
import type { CorrectionKind, ObjectSummary, ShellError, ShellWarning } from "../shell"
import {
  graphObjectDragMimeType,
  serializeGraphObjectDragPayload,
} from "./graphObjectDragPayload"
import { useI18n } from "./i18n"

type ObjectRegistryPanelProps = {
  objects: ObjectSummary[]
  activeObjectId?: string
  correctionPending?: boolean
  correctionError?: ShellError | null
  onSelectObject: (objectId: string) => void
  onApplyCorrection?: (request: ApplyCorrectionRequest) => void
}

export type ApplyCorrectionRequest = {
  objectId: string
  correction: {
    id?: string
    kind: CorrectionKind
    energy: {
      value: number
      unit: "hartree" | "kcal_mol" | "kj_mol"
      reference?: string
    }
    note?: string
  }
}

export function ObjectRegistryPanel({
  objects,
  activeObjectId,
  correctionPending = false,
  correctionError,
  onSelectObject,
  onApplyCorrection,
}: ObjectRegistryPanelProps) {
  const { t } = useI18n()
  const activeObject = objects.find((object) => object.id === activeObjectId) ?? objects[0]

  return (
    <section className="object-registry-panel" aria-label={t("objectRegistry.aria")}>
      <div className="object-registry-header">
        <div>
          <p className="section-kicker">{t("objectRegistry.section")}</p>
          <h2>{t("objectRegistry.title")}</h2>
        </div>
        <span className="object-count-badge">
          {t("objectRegistry.count", { count: objects.length })}
        </span>
      </div>

      {objects.length === 0 ? (
        <div className="object-empty-state">
          <FlaskConical size={19} />
          <span>{t("objectRegistry.empty")}</span>
          <CorrectionEntryForm disabled />
        </div>
      ) : (
        <div className="object-registry-layout">
          <ul className="object-list" aria-label={t("objectRegistry.list")}>
            {objects.map((object) => {
              const selected = object.id === activeObject?.id
              return (
                <li key={object.id}>
                  <button
                    type="button"
                    className={`object-list-button ${selected ? "object-list-button--active" : ""}`}
                    onClick={() => onSelectObject(object.id)}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "copy"
                      event.dataTransfer.setData(graphObjectDragMimeType, serializeGraphObjectDragPayload({
                        kind: "registered-object",
                        objectId: object.id,
                        label: object.label ?? object.id,
                      }))
                    }}
                    aria-current={selected ? "true" : undefined}
                  >
                    <span>{object.label ?? object.id}</span>
                    <small>{object.id}</small>
                  </button>
                </li>
              )
            })}
          </ul>
          {activeObject ? (
            <ObjectDetail
              object={activeObject}
              correctionPending={correctionPending}
              correctionError={correctionError ?? null}
              onApplyCorrection={onApplyCorrection}
            />
          ) : null}
        </div>
      )}
    </section>
  )
}

function ObjectDetail({
  object,
  correctionPending,
  correctionError,
  onApplyCorrection,
}: {
  object: ObjectSummary
  correctionPending: boolean
  correctionError: ShellError | null
  onApplyCorrection?: (request: ApplyCorrectionRequest) => void
}) {
  const { t } = useI18n()
  const energyKeys = stringList(object.energy_keys)
  const thermoKeys = stringList(object.thermochemistry_keys)
  const warnings = object.warnings ?? []
  const corrections = object.corrections ?? []

  return (
    <article className="object-detail" aria-label={t("objectRegistry.detail")}>
      <div className="object-detail-title">
        <strong>{object.label ?? object.id}</strong>
        <code>{object.id}</code>
      </div>

      <dl className="object-detail-grid">
        <DetailItem label={t("objectRegistry.formula")} value={object.formula} />
        <DetailItem label={t("objectRegistry.charge")} value={numberValue(object.charge)} />
        <DetailItem label={t("objectRegistry.spin")} value={numberValue(object.spin_multiplicity)} />
        <DetailItem label={t("objectRegistry.method")} value={object.method} />
        <DetailItem label={t("objectRegistry.source")} value={object.source_file_id} />
        <DetailItem label={t("objectRegistry.corrections")} value={object.correction_count ?? 0} />
      </dl>

      <KeyList label={t("objectRegistry.energyKeys")} values={energyKeys} />
      <KeyList label={t("objectRegistry.thermochemistryKeys")} values={thermoKeys} />
      <CorrectionList corrections={corrections} />
      <ProvenanceBlock object={object} />
      {warnings.length > 0 ? <ObjectWarningList warnings={warnings} /> : null}
      <CorrectionEntryForm
        object={object}
        disabled={!onApplyCorrection}
        pending={correctionPending}
        error={correctionError}
        onSubmit={onApplyCorrection}
      />
    </article>
  )
}

function DetailItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  const { t } = useI18n()
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? t("objectRegistry.unavailable")}</dd>
    </div>
  )
}

function KeyList({ label, values }: { label: string; values: string[] }) {
  const { t } = useI18n()
  return (
    <div className="object-key-list">
      <span>{label}</span>
      {values.length > 0 ? (
        <div>
          {values.map((value) => (
            <code key={value}>{value}</code>
          ))}
        </div>
      ) : (
        <small>{t("objectRegistry.unavailable")}</small>
      )}
    </div>
  )
}

function ProvenanceBlock({ object }: { object: ObjectSummary }) {
  const { t } = useI18n()
  const provenance = object.provenance
  if (!provenance) {
    return (
      <div className="object-provenance">
        <span>{t("objectRegistry.provenance")}</span>
        <small>{t("objectRegistry.unavailable")}</small>
      </div>
    )
  }

  return (
    <div className="object-provenance">
      <span>{t("objectRegistry.provenance")}</span>
      <code>{provenance.parser_id}</code>
      <code>{provenance.parser_version}</code>
      <code>{provenance.source_file_id}</code>
      {provenance.parsed_at ? <small>{provenance.parsed_at}</small> : null}
    </div>
  )
}

function ObjectWarningList({ warnings }: { warnings: ShellWarning[] }) {
  const { t } = useI18n()
  return (
    <div className="object-warning-list">
      <span>{t("objectRegistry.warnings")}</span>
      {warnings.map((warning, index) => (
        <div key={`${warning.code}-${warning.target ?? "target"}-${index}`}>
          <AlertTriangle size={15} />
          <strong>{warning.code}</strong>
          <span>{warning.message}</span>
          {warning.target ? <code>{warning.target}</code> : null}
        </div>
      ))}
    </div>
  )
}

function CorrectionList({ corrections }: { corrections: NonNullable<ObjectSummary["corrections"]> }) {
  const { t } = useI18n()
  if (corrections.length === 0) {
    return (
      <div className="object-correction-list">
        <span>{t("objectRegistry.correctionList")}</span>
        <small>{t("objectRegistry.noCorrections")}</small>
      </div>
    )
  }
  return (
    <div className="object-correction-list">
      <span>{t("objectRegistry.correctionList")}</span>
      {corrections.map((correction) => (
        <div key={correction.id} className="object-correction-row">
          <strong>{correction.kind}</strong>
          <code>{correction.id}</code>
          <span>{energyText(correction.energy)}</span>
          {correction.note ? <small>{correction.note}</small> : null}
        </div>
      ))}
    </div>
  )
}

function CorrectionEntryForm({
  object,
  disabled = true,
  pending = false,
  error,
  onSubmit,
}: {
  object?: ObjectSummary
  disabled?: boolean
  pending?: boolean
  error?: ShellError | null
  onSubmit?: (request: ApplyCorrectionRequest) => void
}) {
  const { t } = useI18n()
  const formDisabled = disabled || !object || pending
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (formDisabled || !object || !onSubmit) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const numericValue = Number(formData.get("value"))
    if (!Number.isFinite(numericValue)) return
    const id = textFormValue(formData.get("id"))
    const reference = textFormValue(formData.get("reference"))
    const note = textFormValue(formData.get("note"))
    onSubmit({
      objectId: object.id,
      correction: {
        ...(id ? { id } : {}),
        kind: String(formData.get("kind") || "manual") as CorrectionKind,
        energy: {
          value: numericValue,
          unit: String(formData.get("unit") || "kcal_mol") as "hartree" | "kcal_mol" | "kj_mol",
          ...(reference ? { reference } : {}),
        },
        ...(note ? { note } : {}),
      },
    })
  }
  return (
    <form className="correction-entry-form" aria-label={t("objectRegistry.correctionForm")} onSubmit={handleSubmit}>
      <div className="correction-form-grid">
        <label>
          <span>{t("objectRegistry.correctionKind")}</span>
          <select name="kind" defaultValue="manual" disabled={formDisabled}>
            <option value="manual">{t("objectRegistry.correctionKind.manual")}</option>
            <option value="solvation">{t("objectRegistry.correctionKind.solvation")}</option>
            <option value="resonance">{t("objectRegistry.correctionKind.resonance")}</option>
          </select>
        </label>
        <label>
          <span>{t("objectRegistry.correctionValue")}</span>
          <input name="value" type="number" step="any" defaultValue="0" disabled={formDisabled} />
        </label>
        <label>
          <span>{t("objectRegistry.correctionUnit")}</span>
          <select name="unit" defaultValue="kcal_mol" disabled={formDisabled}>
            <option value="kcal_mol">kcal_mol</option>
            <option value="kj_mol">kj_mol</option>
            <option value="hartree">hartree</option>
          </select>
        </label>
        <label>
          <span>{t("objectRegistry.correctionId")}</span>
          <input name="id" placeholder={t("objectRegistry.correctionIdPlaceholder")} disabled={formDisabled} />
        </label>
      </div>
      <label className="correction-wide-field">
        <span>{t("objectRegistry.correctionReference")}</span>
        <input name="reference" placeholder="SMD CH2Cl2" disabled={formDisabled} />
      </label>
      <label className="correction-wide-field">
        <span>{t("objectRegistry.correctionNote")}</span>
        <input name="note" placeholder={t("objectRegistry.correctionNotePlaceholder")} disabled={formDisabled} />
      </label>
      {error ? (
        <div className="correction-error" role="alert">
          <AlertTriangle size={15} />
          <strong>{error.code}</strong>
          <span>{error.message}</span>
          {error.target ? <code>{error.target}</code> : null}
        </div>
      ) : null}
      <button type="submit" className="correction-entry-button" disabled={formDisabled}>
        <PlusCircle size={16} />
        <span>{pending ? t("objectRegistry.addCorrectionPending") : t("objectRegistry.addCorrection")}</span>
      </button>
    </form>
  )
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

function numberValue(value: number | null | undefined): string | null {
  return typeof value === "number" ? String(value) : null
}

function energyText(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ""
  const energy = value as { value?: unknown; unit?: unknown; reference?: unknown }
  const text = `${String(energy.value ?? "")} ${String(energy.unit ?? "")}`.trim()
  return energy.reference ? `${text} · ${String(energy.reference)}` : text
}

function textFormValue(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}
