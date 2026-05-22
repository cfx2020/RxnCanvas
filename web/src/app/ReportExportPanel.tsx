import { Download, FileArchive } from "lucide-react"
import type { EnergyProfileSummary, ExportFormat, ShellWarning, WorkbenchArtifactSummary } from "../shell"
import { useI18n } from "./i18n"

export type ReportExportOptions = {
  formats: ExportFormat[]
  includeBytes: boolean
  basename: string
  title: string
}

type ReportExportPanelProps = {
  artifacts: WorkbenchArtifactSummary[]
  profile?: EnergyProfileSummary
  options: ReportExportOptions
  disabled: boolean
  warnings: ShellWarning[]
  hasActiveBrowserProject: boolean
  onOptionsChange: (options: ReportExportOptions) => void
  onExport: () => void
}

const exportFormats: ExportFormat[] = ["png", "cdxml", "xlsx"]

type ExportReadinessSummary = {
  hasProfile: boolean
  missingPointCount: number
  correctionPointCount: number
  includeBytes: boolean
  hasActiveBrowserProject: boolean
  formats: ExportFormat[]
}

export function ReportExportPanel({
  artifacts,
  profile,
  options,
  disabled,
  warnings,
  hasActiveBrowserProject,
  onOptionsChange,
  onExport,
}: ReportExportPanelProps) {
  const { t } = useI18n()
  const exportDisabled = disabled || options.formats.length === 0
  const readiness = exportReadinessFromProfile(profile, options, hasActiveBrowserProject)

  return (
    <section className="report-export-panel" aria-label={t("reportExport.aria")}>
      <div className="report-export-header">
        <div>
          <p className="section-kicker">{t("reportExport.section")}</p>
          <h2>{t("reportExport.title")}</h2>
        </div>
        <span className="artifact-count-badge">{t("reportExport.artifactCount", { count: artifacts.length })}</span>
      </div>

      <div className="export-format-grid" aria-label={t("reportExport.formats")}>
        {exportFormats.map((format) => (
          <label key={format} className="export-format-option">
            <input
              type="checkbox"
              checked={options.formats.includes(format)}
              onChange={(event) => onOptionsChange({
                ...options,
                formats: event.currentTarget.checked
                  ? [...options.formats, format]
                  : options.formats.filter((item) => item !== format),
              })}
            />
            <span>{format}</span>
          </label>
        ))}
      </div>

      <div className="report-export-options" aria-label={t("reportExport.options")}>
        <label className="energy-field">
          <span>{t("reportExport.basename")}</span>
          <input
            type="text"
            value={options.basename}
            onChange={(event) => onOptionsChange({ ...options, basename: event.currentTarget.value })}
            placeholder="rxnflow-profile"
          />
        </label>
        <label className="energy-field">
          <span>{t("reportExport.reportTitle")}</span>
          <input
            type="text"
            value={options.title}
            onChange={(event) => onOptionsChange({ ...options, title: event.currentTarget.value })}
            placeholder="Relative energy profile"
          />
        </label>
      </div>

      <div className="report-export-command-row">
        <label className="energy-toggle">
          <input
            type="checkbox"
            checked={options.includeBytes}
            onChange={(event) => onOptionsChange({ ...options, includeBytes: event.currentTarget.checked })}
          />
          <span>{t("reportExport.includeBytes")}</span>
        </label>
        <button
          type="button"
          className="command-button"
          disabled={exportDisabled}
          onClick={onExport}
        >
          <FileArchive size={17} />
          <span>{t("reportExport.export")}</span>
        </button>
      </div>

      <ExportReadinessPanel readiness={readiness} />

      {artifacts.length > 0 ? (
        <ArtifactList artifacts={artifacts} basename={options.basename} />
      ) : (
        <div className="report-export-empty">
          <FileArchive size={22} />
          <strong>{t("reportExport.empty")}</strong>
          <span>{t("reportExport.emptyDetail")}</span>
        </div>
      )}

      {warnings.length > 0 ? (
        <div className="report-export-warning-list" aria-label={t("reportExport.warnings")}>
          <strong>{t("reportExport.warnings")}</strong>
          {warnings.map((warning, index) => (
            <p key={`${warning.code}-${warning.target ?? "target"}-${index}`}>
              <code>{warning.code}</code>
              <span>{warning.message}</span>
              {warning.target ? <small>{warning.target}</small> : null}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ExportReadinessPanel({ readiness }: { readiness: ExportReadinessSummary }) {
  const { t } = useI18n()
  const rows = [
    {
      key: "profile",
      level: readiness.hasProfile ? "ok" : "warn",
      label: t("reportExport.readiness.profile"),
      value: readiness.hasProfile ? t("reportExport.readiness.ready") : t("reportExport.readiness.noProfile"),
    },
    {
      key: "missing",
      level: readiness.missingPointCount > 0 ? "warn" : "ok",
      label: t("reportExport.readiness.missing"),
      value: readiness.missingPointCount > 0
        ? t("reportExport.readiness.missingCount", { count: readiness.missingPointCount })
        : t("reportExport.readiness.noMissing"),
    },
    {
      key: "corrections",
      level: readiness.correctionPointCount > 0 ? "info" : "ok",
      label: t("reportExport.readiness.corrections"),
      value: readiness.correctionPointCount > 0
        ? t("reportExport.readiness.correctionCount", { count: readiness.correctionPointCount })
        : t("reportExport.readiness.noCorrections"),
    },
    {
      key: "bytes",
      level: readiness.includeBytes ? "ok" : "warn",
      label: t("reportExport.readiness.bytes"),
      value: readiness.includeBytes ? t("reportExport.readiness.bytesIncluded") : t("reportExport.readiness.bytesOff"),
    },
    {
      key: "persistence",
      level: readiness.hasActiveBrowserProject && readiness.includeBytes ? "ok" : "info",
      label: t("reportExport.readiness.persistence"),
      value: readiness.hasActiveBrowserProject
        ? t("reportExport.readiness.browserProject")
        : t("reportExport.readiness.noBrowserProject"),
    },
    {
      key: "cdxml",
      level: readiness.formats.includes("cdxml") ? "info" : "ok",
      label: t("reportExport.readiness.chemdraw"),
      value: readiness.formats.includes("cdxml")
        ? t("reportExport.readiness.cdxmlOnly")
        : t("reportExport.readiness.noCdxml"),
    },
  ]

  return (
    <div className="export-readiness-panel" aria-label={t("reportExport.readiness")}>
      <strong>{t("reportExport.readiness")}</strong>
      {rows.map((row) => (
        <p key={row.key} className={`export-readiness-row export-readiness-row--${row.level}`}>
          <span>{row.label}</span>
          <code>{row.value}</code>
        </p>
      ))}
    </div>
  )
}

function ArtifactList({ artifacts, basename }: { artifacts: WorkbenchArtifactSummary[]; basename: string }) {
  const { t } = useI18n()

  return (
    <div className="artifact-list" aria-label={t("reportExport.artifacts")}>
      {artifacts.map((artifact) => {
        const fileName = downloadFileName(artifact, basename)
        const downloadHref = typeof artifact.bytes_base64 === "string"
          ? `data:${mimeType(artifact.format)};base64,${artifact.bytes_base64}`
          : undefined
        return (
          <article key={artifact.id} className="artifact-card">
            <div className="artifact-card-header">
              <strong>{artifact.format}</strong>
              <code>{artifact.id}</code>
            </div>
            <dl className="artifact-detail-grid">
              <div>
                <dt>{t("reportExport.path")}</dt>
                <dd>{artifact.path ?? t("reportExport.inlineOnly")}</dd>
              </div>
              <div>
                <dt>{t("reportExport.inlineBytes")}</dt>
                <dd>{artifact.has_inline_bytes ? t("reportExport.available") : t("reportExport.unavailable")}</dd>
              </div>
              <div>
                <dt>{t("reportExport.persisted")}</dt>
                <dd>{artifact.persisted ? t("reportExport.yes") : t("reportExport.no")}</dd>
              </div>
              <div>
                <dt>{t("reportExport.checksum")}</dt>
                <dd>{artifact.checksum ?? t("reportExport.unavailable")}</dd>
              </div>
            </dl>
            <MetadataList metadata={artifact.metadata} />
            {downloadHref ? (
              <a className="artifact-download-link" href={downloadHref} download={fileName}>
                <Download size={16} />
                <span>{t("reportExport.download")}</span>
              </a>
            ) : (
              <span className="artifact-download-disabled">{t("reportExport.downloadUnavailable")}</span>
            )}
          </article>
        )
      })}
    </div>
  )
}

function MetadataList({ metadata }: { metadata: WorkbenchArtifactSummary["metadata"] }) {
  const { t } = useI18n()
  const entries = Object.entries(metadata)
  if (entries.length === 0) {
    return null
  }
  return (
    <div className="artifact-metadata">
      <span>{t("reportExport.metadata")}</span>
      {entries.map(([key, value]) => (
        <p key={key}>
          <code>{key}</code>
          <span>{formatMetadataValue(value)}</span>
        </p>
      ))}
    </div>
  )
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  return JSON.stringify(value)
}

function downloadFileName(artifact: WorkbenchArtifactSummary, basename: string): string {
  const safeBasename = basename.trim() || "rxnflow-export"
  return `${safeBasename}.${artifact.format}`
}

function mimeType(format: string): string {
  if (format === "png") return "image/png"
  if (format === "cdxml") return "chemical/x-cdxml"
  if (format === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  return "application/octet-stream"
}

function exportReadinessFromProfile(
  profile: EnergyProfileSummary | undefined,
  options: ReportExportOptions,
  hasActiveBrowserProject: boolean,
): ExportReadinessSummary {
  return {
    hasProfile: Boolean(profile),
    missingPointCount: profile?.points.filter((point) => Boolean(point.missing_reason)).length ?? 0,
    correctionPointCount: profile?.points.filter((point) => Boolean(point.expression?.corrections.length)).length ?? 0,
    includeBytes: options.includeBytes,
    hasActiveBrowserProject,
    formats: options.formats,
  }
}
