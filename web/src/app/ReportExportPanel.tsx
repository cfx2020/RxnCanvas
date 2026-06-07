import { Download, Eye, FileArchive } from "lucide-react"
import { useMemo, useState } from "react"
import type { EnergyProfileSummary, ExportFormat, ObjectSummary, ShellWarning, WorkbenchArtifactSummary, WorkspaceSummary } from "../shell"
import { artifactDisplayName, graphNodeDisplayName, graphPathDisplayName, userFacingText, warningTargetDisplay } from "./displayNames"
import { extensionForExportFormat, mimeTypeForExportFormat, reportExportFormats } from "./exportFormatCapabilities"
import { useI18n, type MessageKey } from "./i18n"
import { buildReportPreviewModel, type ReportPreviewModel, type ReportPreviewAssetKey, type ReportPreviewAssetStatus } from "./reportPreviewModel"

export type ReportExportOptions = {
  formats: ExportFormat[]
  includeBytes: boolean
  basename: string
  title: string
}

type ReportExportPanelProps = {
  artifacts: WorkbenchArtifactSummary[]
  profile?: EnergyProfileSummary
  workspace?: WorkspaceSummary | null
  options: ReportExportOptions
  disabled: boolean
  warnings: ShellWarning[]
  hasActiveBrowserProject: boolean
  onOptionsChange: (options: ReportExportOptions) => void
  onExport: () => void
}

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
  workspace,
  options,
  disabled,
  warnings,
  hasActiveBrowserProject,
  onOptionsChange,
  onExport,
}: ReportExportPanelProps) {
  const { t } = useI18n()
  const [viewMode, setViewMode] = useState<"preview" | "export">("preview")
  const exportDisabled = disabled || options.formats.length === 0
  const readiness = exportReadinessFromProfile(profile, options, hasActiveBrowserProject)
  const preview = useMemo(() => buildReportPreviewModel({
    workspace,
    profile,
    artifacts,
    warnings,
    hasActiveBrowserProject,
    includeBytes: options.includeBytes,
    selectedFormats: options.formats,
  }), [artifacts, hasActiveBrowserProject, options.formats, options.includeBytes, profile, warnings, workspace])

  return (
    <section className="report-export-panel" aria-label={t("reportExport.aria")}>
      <div className="report-export-header">
        <div>
          <p className="section-kicker">{t("reportExport.section")}</p>
          <h2>{t("reportExport.title")}</h2>
        </div>
        <span className="artifact-count-badge">{t("reportExport.artifactCount", { count: artifacts.length })}</span>
      </div>

      <div className="report-export-view-toggle" aria-label={t("reportExport.viewMode")}>
        <button
          type="button"
          className={viewMode === "preview" ? "is-active" : undefined}
          aria-pressed={viewMode === "preview"}
          aria-label={t("reportExport.previewMode")}
          onClick={() => setViewMode("preview")}
        >
          <Eye size={15} />
          <span>{t("reportExport.preview")}</span>
        </button>
        <button
          type="button"
          className={viewMode === "export" ? "is-active" : undefined}
          aria-pressed={viewMode === "export"}
          aria-label={t("reportExport.exportMode")}
          onClick={() => setViewMode("export")}
        >
          <FileArchive size={15} />
          <span>{t("reportExport.exportView")}</span>
        </button>
      </div>

      {viewMode === "preview" ? (
        <ReportPreviewPanel model={preview} workspace={workspace} />
      ) : (
        <>
          <div className="export-format-grid" aria-label={t("reportExport.formats")}>
            {reportExportFormats().map((format) => (
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
                  {warningTargetDisplay(warning) ? <small>{warningTargetDisplay(warning)}</small> : null}
                </p>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

function ReportPreviewPanel({ model, workspace }: { model: ReportPreviewModel; workspace?: WorkspaceSummary | null }) {
  const { t } = useI18n()
  const activePathLabel = activePathPreviewLabel(workspace, model.graph?.activePathId)
  return (
    <div className="report-preview-panel" aria-label={t("reportPreview.aria")}>
      <div className="report-preview-summary-grid">
        <PreviewValue label={t("reportPreview.profile")} value={model.profile ? t("energyPanel.profileReady") : t("reportPreview.none")} />
        <PreviewValue label={t("reportPreview.outputUnit")} value={model.profile?.outputUnit ?? t("reportPreview.none")} />
        <PreviewValue label={t("reportPreview.points")} value={model.profile ? String(model.profile.pointCount) : t("reportPreview.none")} />
        <PreviewValue label={t("reportPreview.missing")} value={model.profile ? String(model.profile.missingPointCount) : t("reportPreview.none")} />
        <PreviewValue label={t("reportPreview.corrections")} value={model.profile ? String(model.profile.correctionPointCount) : t("reportPreview.none")} />
        <PreviewValue label={t("reportPreview.graphCounts")} value={model.graph ? `${model.graph.nodeCount}/${model.graph.edgeCount}/${model.graph.pathCount}` : t("reportPreview.none")} />
        <PreviewValue label={t("reportPreview.activePath")} value={activePathLabel ?? t("reportPreview.none")} />
        <PreviewValue label={t("reportPreview.persistence")} value={model.project.persistenceLabel === "browser-local" ? t("reportPreview.browserLocal") : t("reportPreview.downloadOnly")} />
      </div>

      <div className="report-preview-assets" aria-label={t("reportPreview.assets")}>
        <strong>{t("reportPreview.assets")}</strong>
        {model.assets.map((asset) => (
          <p key={asset.key} className={`report-preview-asset report-preview-asset--${asset.status}`}>
            <span>{t(assetLabelKey(asset.key))}</span>
            <code>{t(assetStatusKey(asset.status))}</code>
            <small>{asset.formats.length > 0 ? asset.formats.join(", ") : t("reportPreview.none")}</small>
            <small>{asset.artifactIds.length > 0 ? t("reportExport.artifactCount", { count: asset.artifactIds.length }) : t("reportPreview.pendingArtifact")}</small>
          </p>
        ))}
      </div>

      {model.energyTable ? (
        <div className="report-preview-table" aria-label={t("reportPreview.energyTable")}>
          <strong>{t("reportPreview.energyTable")}</strong>
          <PreviewValue label={t("reportPreview.schema")} value={model.energyTable.schemaVersion} />
          <PreviewValue label={t("reportPreview.columns")} value={String(model.energyTable.columnCount)} />
          <PreviewValue label={t("reportPreview.rows")} value={String(model.energyTable.rowCount ?? t("reportPreview.none"))} />
          <PreviewValue label={t("reportPreview.artifact")} value={model.energyTable.format.toUpperCase()} />
        </div>
      ) : null}

      <div className="report-preview-artifacts" aria-label={t("reportPreview.artifacts")}>
        <strong>{t("reportPreview.artifacts")}</strong>
        {model.artifacts.length > 0 ? model.artifacts.map((artifact) => (
          <p key={artifact.id}>
            <code>{artifact.format}</code>
            <span>{artifactDisplayName(artifact.format, artifact.path, artifact.format.toUpperCase())}</span>
            <small>{artifact.persisted ? t("reportExport.yes") : t("reportExport.no")}</small>
            <small>{artifact.hasInlineBytes ? t("reportExport.available") : t("reportExport.unavailable")}</small>
            <small>{userFacingText(artifact.path) ?? t("reportExport.inlineOnly")}</small>
          </p>
        )) : <span className="report-preview-empty">{t("reportPreview.noArtifacts")}</span>}
      </div>

      {model.warnings.length > 0 ? (
        <div className="report-export-warning-list" aria-label={t("reportPreview.warnings")}>
          <strong>{t("reportPreview.warnings")}</strong>
          {model.warnings.map((warning, index) => (
            <p key={`${warning.code}-${warning.target ?? "target"}-${index}`}>
              <code>{warning.code}</code>
              <span>{warning.message}</span>
              {userFacingText(warning.target) ? <small>{userFacingText(warning.target)}</small> : null}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function PreviewValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="report-preview-value">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  )
}

function activePathPreviewLabel(workspace: WorkspaceSummary | null | undefined, activePathId?: string | null): string | null {
  if (!workspace || !activePathId) return null
  const path = workspace.graph.paths.find((item) => item.id === activePathId)
  if (!path) return null
  const emptyObjectMap = new Map<string, ObjectSummary>()
  const nodeLabelById = new Map(workspace.graph.nodes.map((node) => [node.id, graphNodeDisplayName(node, emptyObjectMap)]))
  return graphPathDisplayName(path, nodeLabelById, "Path")
}

function assetLabelKey(key: ReportPreviewAssetKey): MessageKey {
  if (key === "energy_diagram") return "reportPreview.assets.energyDiagram"
  if (key === "energy_table") return "reportPreview.assets.energyTable"
  return "reportPreview.assets.graphSnapshot"
}

function assetStatusKey(status: ReportPreviewAssetStatus): MessageKey {
  if (status === "ready") return "reportPreview.status.ready"
  if (status === "pending") return "reportPreview.status.pending"
  if (status === "warning") return "reportPreview.status.warning"
  return "reportPreview.status.unavailable"
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
          ? `data:${mimeTypeForExportFormat(artifact.format)};base64,${artifact.bytes_base64}`
          : undefined
        return (
          <article key={artifact.id} className="artifact-card">
            <div className="artifact-card-header">
              <strong>{artifact.format.toUpperCase()}</strong>
              <code>{fileName}</code>
            </div>
            <dl className="artifact-detail-grid">
              <div>
                <dt>{t("reportExport.path")}</dt>
                <dd>{userFacingText(artifact.path) ?? t("reportExport.inlineOnly")}</dd>
              </div>
              <div>
                <dt>{t("reportExport.inlineBytes")}</dt>
                <dd>{artifact.has_inline_bytes ? t("reportExport.available") : t("reportExport.unavailable")}</dd>
              </div>
              <div>
                <dt>{t("reportExport.persisted")}</dt>
                <dd>{artifact.persisted ? t("reportExport.yes") : t("reportExport.no")}</dd>
              </div>
            </dl>
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
  const safeBasename = basename.trim() || "rxnflow-export"
  return `${safeBasename}.${extensionForExportFormat(artifact.format)}`
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
