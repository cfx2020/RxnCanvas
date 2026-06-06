import { AlertTriangle, FilePlus2, RotateCcw, UploadCloud } from "lucide-react"
import type { ChangeEvent } from "react"
import type { ImportItemSummary, ShellError, ShellWarning } from "../shell"
import { useI18n, type MessageKey } from "./i18n"
import {
  canPreviewImport,
  filesToWebImportFiles,
  formatFileSize,
  importFormatOptions,
  type ImportInboxState,
  type WebImportFile,
} from "./importInboxState"

type ImportInboxProps = {
  state: ImportInboxState
  sourceTray: SourceTrayModel
  onFilesSelected: (files: WebImportFile[]) => void
  onExpectedFormatChange: (format: string) => void
  onStrictChange: (strict: boolean) => void
  onPreview: () => Promise<void>
  onClear: () => void
}

export type SourceTrayStatus = "idle" | "persisting" | "previewing" | "registered" | "used-in-graph" | "error"

export type SourceTrayModel = {
  hasActiveProject: boolean
  rawFileCount: number
  lastDropStatus?: SourceTrayStatus
  acceptedExtensions: string[]
}

export function ImportInbox({
  state,
  sourceTray,
  onFilesSelected,
  onExpectedFormatChange,
  onStrictChange,
  onPreview,
  onClear,
}: ImportInboxProps) {
  const { t } = useI18n()
  const previewDisabled = !canPreviewImport(state)
  const detailOpen = state.selectedFiles.length > 0 || Boolean(state.activeBatch) || Boolean(state.error)
  const lastDropStatus = sourceTray.lastDropStatus ?? "idle"

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    onFilesSelected(filesToWebImportFiles(event.currentTarget.files ?? []))
  }

  return (
    <section className="import-inbox source-tray" aria-label={t("sourceTray.aria")}>
      <div className="source-tray-header">
        <div>
          <p className="section-kicker">{t("sourceTray.section")}</p>
          <h2>{t("sourceTray.title")}</h2>
        </div>
        <div className="source-tray-status-row">
          <span className={`source-tray-status source-tray-status--${lastDropStatus}`}>
            {t(`sourceTray.status.${lastDropStatus}` as MessageKey)}
          </span>
          <span className={`import-status import-status--${state.status}`}>
            {t(`importInbox.status.${state.status}`)}
          </span>
        </div>
      </div>

      <div className="source-tray-hints" aria-label={t("sourceTray.contextAria")}>
        <span>{sourceTray.hasActiveProject ? t("sourceTray.activeProject") : t("sourceTray.noActiveProject")}</span>
        <span>{t("sourceTray.rawFileCount", { count: sourceTray.rawFileCount })}</span>
        <span>{t("sourceTray.accepts", { extensions: sourceTray.acceptedExtensions.join(", ") })}</span>
      </div>

      <div className="import-controls">
        <label className="file-picker-button">
          <FilePlus2 size={17} />
          <span>{t("importInbox.selectFiles")}</span>
          <input
            type="file"
            multiple
            onChange={handleFileChange}
            aria-label={t("importInbox.selectFiles")}
          />
        </label>

        <label className="import-field">
          <span>{t("importInbox.expectedFormat")}</span>
          <select
            value={state.expectedFormat}
            onChange={(event) => onExpectedFormatChange(event.currentTarget.value)}
          >
            {importFormatOptions.map((format) => (
              <option key={format} value={format}>
                {format === "auto" ? t("importInbox.format.auto") : format}
              </option>
            ))}
          </select>
        </label>

        <label className="strict-toggle">
          <input
            type="checkbox"
            checked={state.strict}
            onChange={(event) => onStrictChange(event.currentTarget.checked)}
          />
          <span>{t("importInbox.strict")}</span>
        </label>
      </div>

      <div className="import-command-row">
        <button type="button" className="command-button" onClick={onPreview} disabled={previewDisabled}>
          <UploadCloud size={17} />
          <span>{t("importInbox.preview")}</span>
        </button>
        <button type="button" className="icon-button" onClick={onClear} title={t("importInbox.clear")} aria-label={t("importInbox.clear")}>
          <RotateCcw size={17} />
        </button>
      </div>

      <details className="source-tray-details" open={detailOpen}>
        <summary>
          <span>{t("sourceTray.details")}</span>
          <small>{sourceTrayDetailSummary(state, t)}</small>
        </summary>
        <div className="source-tray-detail-body">
          <SelectedFileList files={state.selectedFiles} />
          <ImportSummary state={state} />
        </div>
      </details>
    </section>
  )
}

function SelectedFileList({ files }: { files: WebImportFile[] }) {
  const { t } = useI18n()

  if (files.length === 0) {
    return <p className="muted import-empty-state">{t("importInbox.noFiles")}</p>
  }

  return (
    <ul className="import-file-list" aria-label={t("importInbox.selectedFiles")}>
      {files.map((file) => (
        <li key={file.id}>
          <strong>{file.name}</strong>
          <span>{formatFileSize(file.size)}</span>
          <small>{file.sourceKind ? t(`importInbox.source.${file.sourceKind}`) : t("importInbox.source.path")}</small>
          <small>{file.mimeType ?? t("importInbox.mimeUnknown")}</small>
          {file.lastModified ? <small>{new Date(file.lastModified).toLocaleDateString()}</small> : null}
          <RawPersistenceSummary file={file} />
        </li>
      ))}
    </ul>
  )
}

function RawPersistenceSummary({ file }: { file: WebImportFile }) {
  const { t } = useI18n()
  const state = file.rawPersistence
  if (!state || state.state === "idle") {
    return null
  }

  if (state.state === "persisted") {
    return (
      <div className="raw-persistence raw-persistence--persisted">
        <span>{t("importInbox.rawPersistence.persisted")}</span>
        <strong>{state.resource.metadata.source_name}</strong>
        <small>{formatFileSize(state.resource.metadata.byte_size)}</small>
      </div>
    )
  }

  if (state.state === "skipped") {
    return (
      <div className="raw-persistence raw-persistence--skipped">
        <span>{t("importInbox.rawPersistence.skipped")}</span>
        <code>{t(`importInbox.rawPersistence.reason.${state.reason}` as MessageKey)}</code>
      </div>
    )
  }

  return (
    <div className="raw-persistence raw-persistence--error" role="status">
      <span>{t("importInbox.rawPersistence.error")}</span>
      <code>{state.error.code}</code>
      {state.error.target ? <code>{state.error.target}</code> : null}
      <span>{state.error.message}</span>
    </div>
  )
}

function ImportSummary({ state }: { state: ImportInboxState }) {
  const { t } = useI18n()

  if (state.error) {
    return <ImportError error={state.error} />
  }

  if (!state.activeBatch) {
    return null
  }

  return (
    <div className="import-preview-summary">
      <div className="import-batch-heading">
        <span>{t("importInbox.batch")}</span>
        <code>{state.activeBatch.id}</code>
      </div>
      {state.warnings.length > 0 ? <WarningList warnings={state.warnings} /> : null}
      <ul className="import-item-list">
        {state.activeBatch.items.map((item) => (
          <ImportItemCard key={item.id} item={item} />
        ))}
      </ul>
      {state.registeredObjectIds.length > 0 ? (
        <div className="registered-objects">
          <span>{t("importInbox.registeredObjects")}</span>
          {state.registeredObjectIds.map((objectId) => (
            <code key={objectId}>{objectId}</code>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ImportItemCard({ item }: { item: ImportItemSummary }) {
  const { t } = useI18n()

  return (
    <li className={`import-item-card import-item-card--${item.status}`}>
      <div className="import-item-title">
        <strong>{importItemDisplayName(item)}</strong>
        <span>{item.status}</span>
      </div>
      {item.preview ? (
        <dl className="import-preview-grid">
          <div>
            <dt>{t("importInbox.parser")}</dt>
            <dd>{item.preview.parser_id}</dd>
          </div>
          <div>
            <dt>{t("importInbox.parserVersion")}</dt>
            <dd>{item.preview.parser_version}</dd>
          </div>
          <div>
            <dt>{t("importInbox.objectCount")}</dt>
            <dd>{item.preview.object_count}</dd>
          </div>
        </dl>
      ) : null}
      {item.raw_resource ? (
        <div className="raw-resource">
          <span>{t("importInbox.rawResource")}</span>
          <strong>{rawResourceDisplayName(item)}</strong>
        </div>
      ) : null}
      {item.warnings.length > 0 ? <WarningList warnings={item.warnings} /> : null}
      {item.error ? <ImportError error={item.error} /> : null}
    </li>
  )
}

function importItemDisplayName(item: ImportItemSummary): string {
  return item.source_name ?? rawResourceDisplayName(item) ?? cleanImportSourcePath(item.source_path)
}

function rawResourceDisplayName(item: ImportItemSummary): string | undefined {
  const metadataSourceName = item.raw_resource?.metadata?.source_name
  if (typeof metadataSourceName === "string" && metadataSourceName) return metadataSourceName
  if (item.raw_resource?.path) return cleanImportSourcePath(item.raw_resource.path)
  return undefined
}

function cleanImportSourcePath(path: string): string {
  const baseName = path.split("/").filter(Boolean).at(-1) ?? path
  return baseName.replace(/^[a-f0-9]{12}-/i, "")
}

function WarningList({ warnings }: { warnings: ShellWarning[] }) {
  const { t } = useI18n()

  return (
    <div className="warning-list">
      <span>{t("importInbox.warnings")}</span>
      {warnings.map((warning, index) => (
        <div key={`${warning.code}-${warning.target ?? "target"}-${index}`} className="warning-row">
          <AlertTriangle size={15} />
          <strong>{warning.code}</strong>
          <span>{warning.message}</span>
          {warning.target ? <code>{warning.target}</code> : null}
        </div>
      ))}
    </div>
  )
}

function ImportError({ error }: { error: ShellError }) {
  return (
    <div className="import-error" role="alert">
      <strong>{error.code}</strong>
      <span>{error.message}</span>
      {error.target ? <code>{error.target}</code> : null}
    </div>
  )
}

type Translate = ReturnType<typeof useI18n>["t"]

function sourceTrayDetailSummary(state: ImportInboxState, t: Translate): string {
  if (state.error) return t("sourceTray.errorReady")
  if (state.activeBatch) return t("sourceTray.previewReady")
  if (state.selectedFiles.length > 0) {
    return t("sourceTray.selectedCount", { count: state.selectedFiles.length })
  }
  return t("sourceTray.detailsIdle")
}
