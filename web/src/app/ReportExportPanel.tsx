import { Download } from "lucide-react"
import type { ExportFormat, WorkbenchArtifactSummary } from "../shell"
import { userFacingText } from "./displayNames"
import { extensionForExportFormat, mimeTypeForExportFormat, reportExportFormats } from "./exportFormatCapabilities"
import { useI18n } from "./i18n"

export type ReportExportOptions = {
  formats: ExportFormat[]
  includeBytes: boolean
  basename: string
  title: string
}

type ReportExportPanelProps = {
  artifacts: WorkbenchArtifactSummary[]
  options: ReportExportOptions
  disabled: boolean
  onOptionsChange: (options: ReportExportOptions) => void
  onExport: () => void
}

export function ReportExportPanel({
  artifacts,
  options,
  disabled,
  onOptionsChange,
  onExport,
}: ReportExportPanelProps) {
  const { t } = useI18n()
  const exportDisabled = disabled || options.formats.length === 0
  const visibleFormats = reportExportFormats()
  const visibleArtifacts = artifacts.filter((artifact) => visibleFormats.includes(artifact.format as ExportFormat))

  return (
    <section className="report-export-panel" aria-label={t("reportExport.aria")}>
      <div className="report-export-header">
        <div>
          <p className="section-kicker">{t("reportExport.section")}</p>
          <h2>{t("reportExport.title")}</h2>
        </div>
      </div>

      <div className="export-format-grid" aria-label={t("reportExport.formats")}>
        {visibleFormats.map((format) => (
          <label key={format} className="export-format-option">
            <input
              type="checkbox"
              checked={options.formats.includes(format)}
              aria-label={format.toUpperCase()}
              onChange={(event) => onOptionsChange({
                ...options,
                formats: event.currentTarget.checked
                  ? [...options.formats, format]
                  : options.formats.filter((item) => item !== format),
              })}
            />
            <span>{format.toUpperCase()}</span>
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

      <button
        type="button"
        className="command-button report-export-primary"
        disabled={exportDisabled}
        onClick={onExport}
      >
        <Download size={17} />
        <span>{t("reportExport.export")}</span>
      </button>

      {visibleArtifacts.length > 0 ? (
        <ArtifactList artifacts={visibleArtifacts} basename={options.basename} />
      ) : (
        <div className="report-export-empty">
          <Download size={18} />
          <strong>{t("reportExport.empty")}</strong>
        </div>
      )}
    </section>
  )
}

function ArtifactList({ artifacts, basename }: { artifacts: WorkbenchArtifactSummary[]; basename: string }) {
  const { t } = useI18n()

  return (
    <div className="artifact-list" aria-label={t("reportExport.artifacts")}>
      {artifacts.map((artifact) => {
        const fileName = downloadFileName(artifact, basename)
        const downloadHref = typeof artifact.bytes_base64 === "string"
          ? `data:${mimeTypeForExportFormat(artifact.format)};base64,${artifact.bytes_base64}`
          : undefined
        return (
          <article key={artifact.id} className="artifact-card">
            <div className="artifact-card-header">
              <strong>{artifact.format.toUpperCase()}</strong>
              <code>{fileName}</code>
            </div>
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

function downloadFileName(artifact: WorkbenchArtifactSummary, basename: string): string {
  const path = userFacingText(artifact.path)
  const pathName = path?.split("/").filter(Boolean).at(-1)
  if (pathName) return pathName
  const safeBasename = basename.trim() || "rxnflow-export"
  return `${safeBasename}.${extensionForExportFormat(artifact.format)}`
}
