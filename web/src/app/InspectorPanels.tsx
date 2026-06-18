import { memo, useEffect, useState, type FormEvent } from "react"
import { Activity, Box, ChevronDown, ExternalLink, FilePlus2, Link2, Maximize2, PanelRight, PencilLine, RotateCcw } from "lucide-react"
import type { FlowBarrier, FlowEdge, FlowNode, SourceFile } from "../domain/projectPackages"
import type { ParseCandidate } from "../domain/sourceParsers"
import { defaultBarrierLabel } from "./canvasDrawing"
import { type EnergyDisplayOptions, type EnergyTableRow, formatEnergy, formatRelativeEnergy } from "./energyDisplay"
import { formatBytes } from "./fileDisplay"
import { Molecule3DmolViewer } from "./Molecule3DmolViewer"
import { Molecule2DDepiction } from "./Molecule2DDepiction"

export type InspectorMode = "inspector" | "export"

import { candidateReviewKey, nodeKindFromCandidate, type CandidateReviewEntry, type CandidateReviewViewState } from "./importRegistration"

export const InspectorPanel = memo(function InspectorPanel({
  node,
  edge,
  barrier,
  nodeMap,
  file,
  rows,
  files,
  energyDisplayOptions,
  onReviewCandidates,
  onUpdateEdgeLabel,
  onUpdateBarrierLabel,
  onOpenStructure,
  onEdit2DStructure,
  onReset2DStructure,
  onOpenSourceFile,
}: {
  node: FlowNode | null
  edge: FlowEdge | null
  barrier: FlowBarrier | null
  nodeMap: Map<string, FlowNode>
  file: SourceFile | null
  rows: EnergyTableRow[]
  files: SourceFile[]
  energyDisplayOptions: EnergyDisplayOptions
  onReviewCandidates: (fileId: string) => void
  onUpdateEdgeLabel: (edgeId: string, label: string) => void
  onUpdateBarrierLabel: (barrierId: string, label: string | null) => void
  onOpenStructure: (nodeId: string) => void
  onEdit2DStructure: (nodeId: string) => void
  onReset2DStructure: (nodeId: string) => void
  onOpenSourceFile: (fileId: string) => void | Promise<void>
}) {
  const nodeRow = node ? rows.find((row) => row.nodeId === node.id) ?? null : null
  return (
    <aside className="inspector-panel" aria-label="Inspector">
      <div className="inspector-rail-header">
        <div>
          <span>Node</span>
          <strong>{node?.label ?? edge?.label ?? (barrier ? "Barrier" : "Selection")}</strong>
        </div>
        <PanelRight size={18} aria-hidden="true" />
      </div>
      {barrier
        ? <BarrierInspector barrier={barrier} nodeMap={nodeMap} energyDisplayOptions={energyDisplayOptions} onUpdateLabel={onUpdateBarrierLabel} />
        : edge
          ? <EdgeInspector edge={edge} nodeMap={nodeMap} onUpdateLabel={onUpdateEdgeLabel} />
          : <NodeInspector
              node={node}
              row={nodeRow}
              file={node ? sourceFileForNode(node, files) : file}
              energyDisplayOptions={energyDisplayOptions}
              onOpenStructure={onOpenStructure}
              onEdit2DStructure={onEdit2DStructure}
              onReset2DStructure={onReset2DStructure}
              onReviewCandidates={onReviewCandidates}
              onOpenSourceFile={onOpenSourceFile}
            />}
    </aside>
  )
})

function BarrierInspector({
  barrier,
  nodeMap,
  energyDisplayOptions,
  onUpdateLabel,
}: {
  barrier: FlowBarrier
  nodeMap: Map<string, FlowNode>
  energyDisplayOptions: EnergyDisplayOptions
  onUpdateLabel: (barrierId: string, label: string | null) => void
}) {
  const source = nodeMap.get(barrier.sourceId)
  const target = nodeMap.get(barrier.targetId)
  const defaultLabel = source && target ? defaultBarrierLabel(source, target, energyDisplayOptions) : "ΔE‡ pending"
  const displayLabel = barrier.label?.trim() || defaultLabel
  const [draftLabel, setDraftLabel] = useState(displayLabel)
  const normalizedDraft = draftLabel.trim()
  const nextLabel = normalizedDraft && normalizedDraft !== defaultLabel ? normalizedDraft : undefined
  const currentLabel = barrier.label?.trim() || undefined
  const labelChanged = nextLabel !== currentLabel

  useEffect(() => {
    setDraftLabel(displayLabel)
  }, [barrier.id, displayLabel])

  const submitLabel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!labelChanged) return
    onUpdateLabel(barrier.id, nextLabel ?? null)
  }

  return (
    <>
      <div className="selected-title">
        <div>
          <span>Selected Barrier</span>
          <strong>{displayLabel}</strong>
        </div>
        <Activity size={18} />
      </div>
      <dl className="detail-list">
        <div>
          <dt>From</dt>
          <dd>{source?.label ?? barrier.sourceId}</dd>
        </div>
        <div>
          <dt>To</dt>
          <dd>{target?.label ?? barrier.targetId}</dd>
        </div>
        <div>
          <dt>Default</dt>
          <dd>{defaultLabel}</dd>
        </div>
      </dl>
      <form className="edge-label-form" aria-label="Edit barrier label" onSubmit={submitLabel}>
        <label className="export-field">
          <span>Barrier label</span>
          <input
            value={draftLabel}
            onChange={(event) => setDraftLabel(event.currentTarget.value)}
            aria-label="Barrier inspector label"
          />
        </label>
        <div className="edge-label-actions">
          <button
            type="button"
            onClick={() => setDraftLabel(displayLabel)}
            disabled={!labelChanged}
          >
            Reset
          </button>
          <button type="submit" className="command-button" disabled={!labelChanged}>
            Apply barrier label
          </button>
        </div>
      </form>
    </>
  )
}

function EdgeInspector({
  edge,
  nodeMap,
  onUpdateLabel,
}: {
  edge: FlowEdge
  nodeMap: Map<string, FlowNode>
  onUpdateLabel: (edgeId: string, label: string) => void
}) {
  const source = nodeMap.get(edge.sourceId)
  const target = nodeMap.get(edge.targetId)
  const [draftLabel, setDraftLabel] = useState(edge.label)
  const normalizedDraft = draftLabel.trim() || "path"
  const labelChanged = normalizedDraft !== edge.label

  useEffect(() => {
    setDraftLabel(edge.label)
  }, [edge.id, edge.label])

  const submitLabel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!labelChanged) return
    onUpdateLabel(edge.id, draftLabel)
  }

  return (
    <>
      <div className="selected-title">
        <div>
          <span>Selected Edge</span>
          <strong>{edge.label}</strong>
        </div>
        <Link2 size={18} />
      </div>
      <dl className="detail-list">
        <div>
          <dt>From</dt>
          <dd>{source?.label ?? edge.sourceId}</dd>
        </div>
        <div>
          <dt>To</dt>
          <dd>{target?.label ?? edge.targetId}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>Reaction path</dd>
        </div>
      </dl>
      <form className="edge-label-form" aria-label="Edit edge label" onSubmit={submitLabel}>
        <label className="export-field">
          <span>Edge label</span>
          <input
            value={draftLabel}
            onChange={(event) => setDraftLabel(event.currentTarget.value)}
            aria-label="Edge label"
          />
        </label>
        <div className="edge-label-actions">
          <button
            type="button"
            onClick={() => setDraftLabel(edge.label)}
            disabled={!labelChanged}
          >
            Reset
          </button>
          <button type="submit" className="command-button" disabled={!labelChanged}>
            Apply edge label
          </button>
        </div>
      </form>
    </>
  )
}

function NodeInspector({
  node,
  row,
  file,
  energyDisplayOptions,
  onOpenStructure,
  onEdit2DStructure,
  onReset2DStructure,
  onReviewCandidates,
  onOpenSourceFile,
}: {
  node: FlowNode | null
  row: EnergyTableRow | null
  file: SourceFile | null
  energyDisplayOptions: EnergyDisplayOptions
  onOpenStructure: (nodeId: string) => void
  onEdit2DStructure: (nodeId: string) => void
  onReset2DStructure: (nodeId: string) => void
  onReviewCandidates: (fileId: string) => void
  onOpenSourceFile: (fileId: string) => void | Promise<void>
}) {
  if (!node) {
    if (file) {
      return (
        <>
          <div className="selected-title">
            <div>
              <span>Source</span>
              <strong>{file.name}</strong>
            </div>
            <FilePlus2 size={18} />
          </div>
          <NodeSourceSummary
            file={file}
            onReviewCandidates={onReviewCandidates}
            onOpenSourceFile={onOpenSourceFile}
          />
        </>
      )
    }
    return (
      <div className="inspector-empty">
        <PanelRight size={20} />
        <strong>No node selected</strong>
      </div>
    )
  }

  return (
    <>
      <div className="selected-title">
        <div>
          <span>Selected Node</span>
          <strong>{node.label}</strong>
        </div>
        <Box size={18} />
      </div>

      <dl className="detail-list">
        <div>
          <dt>Type</dt>
          <dd>{node.kind}</dd>
        </div>
        <div>
          <dt>Formula</dt>
          <dd>{node.formula}</dd>
        </div>
        <div>
          <dt>Method</dt>
          <dd>{node.method}</dd>
        </div>
        <div>
          <dt>Solvent</dt>
          <dd>{node.solvent}</dd>
        </div>
      </dl>

      <section className="structure-preview">
        <div className="section-title structure-section-title">
          <span>Structure Preview</span>
          <span className="structure-preview-actions">
            <button type="button" aria-label={`Edit 2D structure for ${node.label}`} onClick={() => onEdit2DStructure(node.id)}>
              <PencilLine size={15} />
              Edit 2D
            </button>
            {node.manualStructureKet || node.manualStructureMolfile || node.manualStructureCdxml || node.manualStructureSvg ? (
              <button type="button" aria-label={`Reset 2D structure for ${node.label}`} onClick={() => onReset2DStructure(node.id)}>
                <RotateCcw size={15} />
                Reset 2D
              </button>
            ) : null}
            <button type="button" aria-label="Open 3D Structure" onClick={() => onOpenStructure(node.id)}>
              <Maximize2 size={15} />
              3D Structure
            </button>
          </span>
        </div>
        <Molecule2DDepiction
          atoms={sourceCoordinatePreview(node, file)?.atoms ?? []}
          formula={node.formula}
          manualMolfile={node.manualStructureMolfile}
          manualSvg={node.manualStructureSvg}
          label={node.label}
          width={260}
          height={132}
          className="structure-sketch structure-2d-depiction"
          emptyText="2D depiction unavailable"
        />
      </section>

      <section className="source-parse-summary" aria-label="Source parse summary">
        <div>
          <span>Charge</span>
          <strong>{node.charge ?? "unknown"}</strong>
        </div>
        <div>
          <span>Spin</span>
          <strong>{node.spinMultiplicity ?? "unknown"}</strong>
        </div>
        <div>
          <span>Coordinates</span>
          <strong>{coordinateSummaryLabel(sourceCoordinatePreview(node, file))}</strong>
        </div>
      </section>

      <section className="energy-table">
        <div className="section-title">
          <span>Energetics</span>
          <span className="section-badge" aria-label={`Energy unit ${node.energyUnit}`}>{node.energyUnit}</span>
        </div>
        <div className="energy-row">
          <span>ΔE gas</span>
          <strong>{formatEnergy(node.energyGas, node.energyUnit)}</strong>
        </div>
        <div className="energy-row">
          <span>ΔG sol</span>
          <strong>{formatEnergy(node.energySolution, node.energyUnit)}</strong>
        </div>
        <div className="energy-row">
          <span>{energyDisplayOptions.energySource === "solution" ? "ΔG rel" : "ΔE rel"}</span>
          <strong>{row ? formatRelativeEnergy(row.relative, energyDisplayOptions.outputUnit) : "pending"}</strong>
        </div>
      </section>

      <NodeSourceSummary
        file={file}
        onReviewCandidates={onReviewCandidates}
        onOpenSourceFile={onOpenSourceFile}
      />
    </>
  )
}

function NodeSourceSummary({
  file,
  onReviewCandidates,
  onOpenSourceFile,
}: {
  file: SourceFile | null
  onReviewCandidates: (fileId: string) => void
  onOpenSourceFile: (fileId: string) => void | Promise<void>
}) {
  if (!file) {
    return (
      <section className="source-panel source-panel-compact">
        <FilePlus2 size={20} />
        <strong>No source linked</strong>
      </section>
    )
  }
  const parse = file.parse
  const parseCandidates = parse?.candidates ?? []
  const parseWarnings = parse?.warnings ?? []
  const candidateCount = parse?.objectCount ?? parseCandidates.length
  const parseScope = parse?.parseScope ?? "preview"
  const parseConfidence = parse?.confidence ?? (parseScope === "full-file" ? "high" : "low")
  const previewByteLength = new TextEncoder().encode(file.preview ?? "").length
  const previewIsPartial = file.size > 0 && previewByteLength > 0 && previewByteLength < file.size
  const sourceTextScope = previewIsPartial ? "Preview sample" : "Complete preview text"
  const parserLabel = parse?.parserId ?? parse?.sourceKind
  const canOpenRaw = Boolean(file.storedPath || file.sourcePath)

  return (
    <section className="source-panel" aria-label="Source inspector">
      <div className="selected-title">
        <div>
          <span>Source</span>
          <strong>{file.name}</strong>
        </div>
        <FilePlus2 size={18} />
      </div>
      <dl className="detail-list">
        <div>
          <dt>Kind</dt>
          <dd>{file.kind}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{file.status}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(file.size)}</dd>
        </div>
        <div>
          <dt>Project copy</dt>
          <dd>{file.storedPath ? file.storedPath : file.sourcePath ? "Pending autosave copy" : "Browser preview only"}</dd>
        </div>
      </dl>
      {parse ? (
        <div className="source-parse-summary" aria-label="Parser result">
          <div>
            <span>Parser</span>
            <strong>{parserLabel}</strong>
          </div>
          <div>
            <span>Candidates</span>
            <strong>{candidateCount}</strong>
          </div>
          <div>
            <span>Version</span>
            <strong>{parse.parserVersion ?? "unknown"}</strong>
          </div>
          <div>
            <span>Parse scope</span>
            <strong>{parseScope === "full-file" ? "Full file" : "Preview only"}</strong>
          </div>
          <div>
            <span>Confidence</span>
            <strong>{parseConfidence}</strong>
          </div>
          <div>
            <span>Warnings</span>
            <strong>{parseWarnings.length}</strong>
          </div>
          <div>
            <span>Shown text</span>
            <strong>{sourceTextScope}</strong>
          </div>
          {parseCandidates.length > 1 ? (
            <button type="button" className="source-candidate-button" onClick={() => onReviewCandidates(file.id)}>
              Review candidates
            </button>
          ) : null}
          {parseWarnings.length > 0 ? (
            <ul className="source-warning-list" aria-label="Parser warnings">
              {parseWarnings.slice(0, 3).map((warning, index) => (
                <li key={`${warning.code}-${warning.target ?? file.id}-${index}`}>{warning.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="source-preview-status" aria-label="Source text scope">
        <span>{sourceTextScope}</span>
        <strong>{previewIsPartial ? `${formatBytes(previewByteLength)} / ${formatBytes(file.size)}` : "Complete"}</strong>
      </div>
      <button
        type="button"
        className="source-open-button"
        disabled={!canOpenRaw}
        title={canOpenRaw ? "Open raw log in the system app" : "No project copy or source path is available"}
        onClick={() => void onOpenSourceFile(file.id)}
      >
        <ExternalLink size={15} />
        Open raw log
      </button>
    </section>
  )
}

export function CandidateReviewSheet({
  review,
  busy,
  onToggleCandidate,
  onClose,
  onRegisterSelected,
  onRegisterAll,
}: {
  review: CandidateReviewViewState
  busy: boolean
  onToggleCandidate: (key: string) => void
  onClose: () => void
  onRegisterSelected: () => void
  onRegisterAll: () => void
}) {
  const selectedCount = review.selectedKeys.length
  return (
    <div className="candidate-review-scrim">
      <section className="candidate-review-sheet" role="dialog" aria-modal="true" aria-label="Import candidates">
        <header className="candidate-review-header">
          <div>
            <span>Import Preview</span>
            <strong>{review.entries.length} candidates</strong>
          </div>
          <button type="button" onClick={onClose} aria-label="Close import candidates">
            <ChevronDown size={18} />
          </button>
        </header>

        <div className="candidate-review-list">
          {review.entries.map((entry) => {
            const key = candidateReviewKey(entry)
            const selected = review.selectedKeys.includes(key)
            return (
              <label key={key} className={selected ? "candidate-option is-selected" : "candidate-option"}>
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={busy}
                  onChange={() => onToggleCandidate(key)}
                  aria-label={`Select ${entry.candidate.label}`}
                />
                <span className="candidate-option-main">
                  <strong>{entry.candidate.label}</strong>
                  <span>{entry.file.name}</span>
                </span>
                <span className="candidate-option-meta">
                  <em>{candidateKindLabel(entry)}</em>
                  <code>{candidateEnergyLabel(entry.candidate)}</code>
                  <span>{coordinatePreviewLabel(entry.candidate)}</span>
                </span>
              </label>
            )
          })}
        </div>

        <footer className="candidate-review-actions">
          <button type="button" onClick={onClose} disabled={busy}>Later</button>
          <button type="button" onClick={onRegisterSelected} disabled={busy || selectedCount === 0}>
            {busy ? "Registering..." : "Register selected"}
          </button>
          <button type="button" className="command-button" onClick={onRegisterAll} disabled={busy}>
            Register all
          </button>
        </footer>
      </section>
    </div>
  )
}

function candidateKindLabel(entry: CandidateReviewEntry): string {
  const kind = nodeKindFromCandidate(entry.candidate, entry.parsed.kind)
  return entry.candidate.roleHint && entry.candidate.roleHint !== "unknown"
    ? `${kind} / ${entry.candidate.roleHint}`
    : kind
}

function candidateEnergyLabel(candidate: ParseCandidate): string {
  return formatEnergy(candidate.energySolution ?? candidate.energyGas, candidate.energyUnit)
}

function coordinatePreviewLabel(candidate: ParseCandidate): string {
  const preview = candidate.coordinatePreview
  if (!preview) return "No coordinates"
  return `${preview.atomCount} atoms`
}

export function StructurePreviewDialog({
  node,
  file,
  onClose,
}: {
  node: FlowNode
  file: SourceFile | null
  onClose: () => void
}) {
  const coordinatePreview = sourceCoordinatePreview(node, file)
  const elementLabels = coordinatePreview?.elements.length
    ? coordinatePreview.elements
    : formulaElementsFromText(node.formula)
  const visibleAtoms = elementLabels.length > 0 ? elementLabels : ["C", "H", "O"]
  const coordinateAtoms = coordinatePreview?.atoms?.length ? coordinatePreview.atoms : []

  return (
    <div className="structure-preview-scrim">
      <section className="structure-preview-dialog" role="dialog" aria-modal="true" aria-label="3D Structure">
        <header className="structure-preview-header">
          <div>
            <span>3D Structure</span>
            <strong>{node.label}</strong>
          </div>
          <button type="button" aria-label="Close 3D Structure" onClick={onClose}>
            <ChevronDown size={18} />
          </button>
        </header>
        <Molecule3DmolViewer atoms={coordinateAtoms} formula={node.formula} sourceName={file?.name ?? node.label} />
        <dl className="detail-list">
          <div>
            <dt>Formula</dt>
            <dd>{node.formula}</dd>
          </div>
          <div>
            <dt>Atoms</dt>
            <dd>{coordinatePreview?.atomCount ?? "unknown"}</dd>
          </div>
          <div>
            <dt>Elements</dt>
            <dd>{visibleAtoms.join(", ")}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{file?.name ?? "current node"}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

export function sourceFileForNode(node: FlowNode, files: SourceFile[]): SourceFile | null {
  return node.sourceFileId ? files.find((file) => file.id === node.sourceFileId) ?? null : null
}

export function sourceCoordinatePreview(node: FlowNode, file: SourceFile | null) {
  const parse = file?.parse
  if (!parse) return null
  const candidate = node.sourceCandidateId
    ? parse.candidates.find((item) => item.candidateId === node.sourceCandidateId)
    : undefined
  return candidate?.coordinatePreview ?? parse.coordinatePreview
}

function coordinateSummaryLabel(preview: ReturnType<typeof sourceCoordinatePreview>): string {
  if (!preview) return "unavailable"
  return `${preview.atomCount} atoms / ${preview.elements.join(", ") || "elements unknown"}`
}

function formulaElementsFromText(formula: string): string[] {
  return Array.from(formula.matchAll(/[A-Z][a-z]?/g), (match) => match[0])
}
