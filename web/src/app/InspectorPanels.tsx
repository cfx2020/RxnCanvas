import { memo, useEffect, useState, type FormEvent } from "react"
import { Activity, ChevronDown, ExternalLink, FilePlus2, Link2, Maximize2, PanelRight, PencilLine, RotateCcw } from "lucide-react"
import type { FlowBarrier, FlowEdge, FlowNode, SourceFile } from "../domain/projectPackages"
import type { ParseCandidate } from "../domain/sourceParsers"
import { defaultBarrierLabel } from "./canvasDrawing"
import { type EnergyDisplayOptions, type EnergyTableRow, formatEnergy, formatRelativeEnergy } from "./energyDisplay"
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
  onReviewCandidates,
  onOpenSourceFile,
}: {
  node: FlowNode | null
  row: EnergyTableRow | null
  file: SourceFile | null
  energyDisplayOptions: EnergyDisplayOptions
  onOpenStructure: (nodeId: string) => void
  onReviewCandidates: (fileId: string) => void
  onOpenSourceFile: (fileId: string) => void | Promise<void>
}) {
  const coordinatePreview = node ? sourceCoordinatePreview(node, file) : null
  const overview = node ? nodeComputationOverview(node, file) : null
  if (!node) {
    return (
      <div className="inspector-empty">
        <PanelRight size={20} />
        <strong>No node selected</strong>
      </div>
    )
  }

  return (
    <div className="node-inspector-stack">
      <section className="node-panel-summary" aria-label="Node summary">
        <div className="node-panel-section-heading">
          <div>
            <span>Node</span>
            <strong>{node.label}</strong>
          </div>
          <span
            className={`termination-pill termination-${overview?.terminationStatus ?? "unknown"}`}
            aria-label={`Termination ${overview?.terminationLabel ?? "unknown"}`}
          >
            {overview?.terminationLabel ?? "unknown"}
          </span>
        </div>
        <dl className="node-summary-grid">
          <div>
            <dt>Type</dt>
            <dd>{node.kind}</dd>
          </div>
          <div>
            <dt>Formula</dt>
            <dd><FormulaWithCount formula={node.formula} coordinateAtomCount={coordinatePreview?.atomCount ?? null} /></dd>
          </div>
          <div>
            <dt>Method</dt>
            <dd>{overview?.method ?? node.method}</dd>
          </div>
          <div>
            <dt>Basis</dt>
            <dd>{overview?.basisSet ?? "unavailable"}</dd>
          </div>
          <div>
            <dt>Basis functions</dt>
            <dd>{overview?.basisFunctions ?? "unavailable"}</dd>
          </div>
          <div>
            <dt>Charge</dt>
            <dd>{overview?.charge ?? chargeLabel(node)}</dd>
          </div>
          <div>
            <dt>Multiplicity</dt>
            <dd>{overview?.multiplicity ?? multiplicityLabel(node)}</dd>
          </div>
          <div>
            <dt>Solvent</dt>
            <dd>{node.solvent}</dd>
          </div>
          <div>
            <dt>Energy</dt>
            <dd>{overview?.energy ?? formatEnergy(node.energyGas, node.energyUnit)}</dd>
          </div>
          <div>
            <dt>Free energy</dt>
            <dd>{overview?.freeEnergy ?? formatEnergy(node.energySolution, node.energyUnit)}</dd>
          </div>
          <div>
            <dt>Job CPU</dt>
            <dd>{overview?.jobCpuTime ?? "unavailable"}</dd>
          </div>
          <div>
            <dt>Elapsed</dt>
            <dd>{overview?.elapsedTime ?? "unavailable"}</dd>
          </div>
          <div>
            <dt>{energyDisplayOptions.energySource === "solution" ? "ΔG rel" : "ΔE rel"}</dt>
            <dd>{row ? formatRelativeEnergy(row.relative, energyDisplayOptions.outputUnit) : "pending"}</dd>
          </div>
        </dl>
      </section>

      <section className="node-panel-card node-structure-card" aria-label="Structure views">
        <div className="node-panel-section-heading">
          <div>
            <span>Structure</span>
            <strong>Preview</strong>
          </div>
        </div>
        <button
          type="button"
          className="node-structure-open-button"
          aria-label="Open 3D Structure"
          onClick={() => onOpenStructure(node.id)}
        >
          <span className="node-structure-open-icon" aria-hidden="true">
            <Maximize2 size={15} />
          </span>
          <span className="node-structure-open-copy">
            <strong>Open structure</strong>
            <em>2D + 3D preview</em>
          </span>
        </button>
      </section>

      <NodeSourceBrief
        file={file}
        onReviewCandidates={onReviewCandidates}
        onOpenSourceFile={onOpenSourceFile}
      />
    </div>
  )
}

type NodeComputationOverview = {
  method: string
  basisSet: string | null
  basisFunctions: string | null
  charge: string
  multiplicity: string
  energy: string
  freeEnergy: string
  jobCpuTime: string | null
  elapsedTime: string | null
  terminationLabel: string
  terminationStatus: "normal" | "error" | "running" | "unknown"
}

function nodeComputationOverview(node: FlowNode, file: SourceFile | null): NodeComputationOverview {
  const sourceText = file?.preview ?? ""
  const methodBasis = methodBasisFromNodeAndSource(node, sourceText)
  const termination = file?.parse?.terminationStatus
    ? {
        label: file.parse.terminationLabel ?? file.parse.terminationStatus,
        status: file.parse.terminationStatus,
      }
    : classifySourceTermination(sourceText)
  const energyHartree = node.energyTable?.egasHartree
    ?? (node.energyUnit === "hartree" ? node.energyGas : null)
  const freeEnergyHartree = node.energyTable?.gsolHartree
    ?? node.energyTable?.ggasHartree
    ?? numberFromLastMatch(sourceText, /Sum of electronic and thermal Free Energies=\s*([-+]?\d+(?:\.\d+)?(?:[EeDd][-+]?\d+)?)/gi)
    ?? (node.energyUnit === "hartree" ? node.energySolution : null)

  return {
    method: methodBasis.method,
    basisSet: methodBasis.basisSet,
    basisFunctions: basisFunctionCountLabel(node),
    charge: chargeLabel(node),
    multiplicity: multiplicityLabel(node),
    energy: formatHartreeOrEnergy(energyHartree, node.energyGas, node.energyUnit),
    freeEnergy: formatHartreeOrEnergy(freeEnergyHartree, node.energySolution, node.energyUnit),
    jobCpuTime: file?.parse?.jobCpuTime ?? jobCpuTimeFromSource(sourceText),
    elapsedTime: file?.parse?.elapsedTime ?? elapsedTimeFromSource(sourceText),
    terminationLabel: termination.label,
    terminationStatus: termination.status,
  }
}

function FormulaWithCount({ formula, coordinateAtomCount }: { formula: string; coordinateAtomCount: number | null }) {
  const atomCount = formulaAtomCount(formula) ?? coordinateAtomCount
  return (
    <span className="formula-with-mass">
      <span>{formulaParts(formula).map((part, index) => part.kind === "count"
        ? <sub key={`${part.text}-${index}`}>{part.text}</sub>
        : <span key={`${part.text}-${index}`}>{part.text}</span>)}</span>
      {typeof atomCount === "number" ? <em>({atomCount})</em> : null}
    </span>
  )
}

function formulaParts(formula: string): Array<{ kind: "text" | "count"; text: string }> {
  const parts: Array<{ kind: "text" | "count"; text: string }> = []
  let cursor = 0
  for (const match of formula.matchAll(/(\d+)/g)) {
    if (typeof match.index !== "number") continue
    if (match.index > cursor) parts.push({ kind: "text", text: formula.slice(cursor, match.index) })
    parts.push({ kind: "count", text: match[1] })
    cursor = match.index + match[1].length
  }
  if (cursor < formula.length) parts.push({ kind: "text", text: formula.slice(cursor) })
  return parts.length > 0 ? parts : [{ kind: "text", text: formula }]
}

function formulaAtomCount(formula: string): number | null {
  let count = 0
  let matched = false
  for (const match of formula.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    const atomCount = match[2] ? Number.parseInt(match[2], 10) : 1
    if (!Number.isInteger(atomCount) || atomCount <= 0) return null
    count += atomCount
    matched = true
  }
  return matched ? count : null
}

function methodBasisFromNodeAndSource(node: FlowNode, sourceText: string): { method: string; basisSet: string | null } {
  const inlineMethodBasis = splitMethodBasis(node.method)
  const sourceBasis = sourceBasisFromText(sourceText)
  const sourceMethodBasis = sourceMethodBasisFromRoute(sourceText)
  return {
    method: inlineMethodBasis.method || sourceMethodBasis?.method || node.method || "unavailable",
    basisSet: inlineMethodBasis.basisSet ?? sourceMethodBasis?.basisSet ?? sourceBasis,
  }
}

function splitMethodBasis(value: string): { method: string; basisSet: string | null } {
  const trimmed = value.trim()
  const slash = trimmed.match(/^([^/\s]+)\s*\/\s*(\S.+)$/)
  if (!slash) return { method: trimmed || "unavailable", basisSet: null }
  return { method: slash[1], basisSet: slash[2].trim() || null }
}

function sourceMethodBasisFromRoute(sourceText: string): { method: string; basisSet: string } | null {
  for (const match of sourceText.matchAll(/^\s*#\S*\s+(.+)$/gim)) {
    const route = match[1]
    const methodBasis = route.match(/\b([A-Za-z][A-Za-z0-9+_.-]*)\s*\/\s*([A-Za-z0-9+*(),_.\-[\]]+)/)
    if (methodBasis) return { method: methodBasis[1], basisSet: methodBasis[2] }
  }
  return null
}

function sourceBasisFromText(sourceText: string): string | null {
  return firstTrimmedMatch(sourceText, /Standard basis:\s*(.+)$/gim)
    ?? firstTrimmedMatch(sourceText, /General basis read from cards:\s*(.+)$/gim)
    ?? firstTrimmedMatch(sourceText, /AO basis set\s*\w*:\s*(.+)$/gim)
    ?? null
}

function chargeLabel(node: FlowNode): string {
  return node.charge == null ? "unknown" : String(node.charge)
}

function multiplicityLabel(node: FlowNode): string {
  return node.spinMultiplicity == null ? "unknown" : String(node.spinMultiplicity)
}

function basisFunctionCountLabel(node: FlowNode): string | null {
  const value = node.energyTable?.solBasisFunctions ?? node.energyTable?.gasBasisFunctions
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : null
}

function formatHartreeOrEnergy(
  hartreeValue: number | null | undefined,
  fallbackValue: number | null,
  fallbackUnit: FlowNode["energyUnit"],
): string {
  if (typeof hartreeValue === "number" && Number.isFinite(hartreeValue)) return `${hartreeValue.toFixed(6)} Eh`
  return formatEnergy(fallbackValue, fallbackUnit)
}

function jobCpuTimeFromSource(sourceText: string): string | null {
  return normalizedRuntimeFromLine(firstTrimmedMatch(sourceText, /^Job cpu time:\s*(.+)$/gim))
}

function elapsedTimeFromSource(sourceText: string): string | null {
  return normalizedRuntimeFromLine(firstTrimmedMatch(sourceText, /^Elapsed time:\s*(.+)$/gim))
    ?? normalizedRuntimeFromLine(firstTrimmedMatch(sourceText, /^TOTAL RUN TIME:\s*(.+)$/gim))
    ?? elapsedTimeFromGaussianFooter(sourceText)
}

function normalizedRuntimeFromLine(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.replace(/\s+/g, " ").replace(/\.$/, "").trim()
  const gaussian = trimmed.match(/(\d+)\s+days?\s+(\d+)\s+hours?\s+(\d+)\s+minutes?\s+([\d.]+)\s+seconds?/i)
  if (gaussian) return `${gaussian[1]}d ${gaussian[2]}h ${gaussian[3]}m ${gaussian[4]}s`
  return trimmed || null
}

function elapsedTimeFromGaussianFooter(sourceText: string): string | null {
  const match = Array.from(sourceText.matchAll(/Elapsed time:\s*(\d+)\s+days?\s+(\d+)\s+hours?\s+(\d+)\s+minutes?\s+([\d.]+)\s+seconds?/gim)).at(-1)
  if (!match) return null
  return `${match[1]}d ${match[2]}h ${match[3]}m ${match[4]}s`
}

function classifySourceTermination(sourceText: string): { label: string; status: NodeComputationOverview["terminationStatus"] } {
  const normal = lastRegexMatch(sourceText, /normal termination of gaussian[^\n]*/gi)
    ?? lastRegexMatch(sourceText, /ORCA TERMINATED NORMALLY[^\n]*/gi)
  const normalEnd = normal ? normal.index + normal.text.length : -1
  const errors = [
    lastRegexMatch(sourceText, /error termination via lnk1e in .*?\bl(\d+)\.exe\b/gi, (match) => `L${match[1]}`),
    lastRegexMatch(sourceText, /error termination request processed by link\s+(\d+)/gi, (match) => `L${match[1]}`),
    lastRegexMatch(sourceText, /segmentation fault/gi, () => "Segmentation fault"),
    lastRegexMatch(sourceText, /(?:ORCA finished by error|aborting the run|error termination)/gi, () => "Error termination"),
    lastRegexMatch(sourceText, /(?:killed|signal)/gi, () => "Killed"),
  ]
    .filter((item): item is { index: number; text: string; label: string } => Boolean(item))
    .sort((left, right) => right.index - left.index)
  const latestError = errors[0]

  if (latestError && latestError.index > normalEnd) {
    return { label: "error", status: "error" }
  }
  if (normal) return { label: "normal", status: "normal" }
  if (latestError) return { label: "error", status: "error" }
  return { label: "unknown", status: "unknown" }
}

function firstTrimmedMatch(sourceText: string, pattern: RegExp): string | null {
  const match = Array.from(sourceText.matchAll(pattern)).at(-1)
  return match?.[1]?.trim() || null
}

function numberFromLastMatch(sourceText: string, pattern: RegExp): number | null {
  const value = firstTrimmedMatch(sourceText, pattern)
  if (!value) return null
  const parsed = parseGaussianFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function lastRegexMatch(
  sourceText: string,
  pattern: RegExp,
  label?: (match: RegExpMatchArray) => string,
): { index: number; text: string; label: string } | null {
  const matches = Array.from(sourceText.matchAll(pattern))
  const match = matches.at(-1)
  if (!match || typeof match.index !== "number") return null
  return { index: match.index, text: match[0], label: label?.(match) ?? match[0] }
}

function parseGaussianFloat(value: string): number {
  return Number.parseFloat(value.replace(/[Dd]/g, "E"))
}

function NodeSourceBrief({
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
      <section className="node-source-brief is-empty" aria-label="Source inspector">
        <FilePlus2 size={16} aria-hidden="true" />
        <strong>No source linked</strong>
      </section>
    )
  }
  const canOpenRaw = Boolean(file.storedPath || file.sourcePath)
  const candidateCount = file.parse?.objectCount ?? file.parse?.candidates?.length ?? 0

  return (
    <section className="node-source-brief" aria-label="Source inspector">
      <div>
        <span>Source</span>
        <strong>{file.name}</strong>
        <em>{file.kind} · {file.status}</em>
      </div>
      <span className="node-source-actions">
        {candidateCount > 1 ? (
          <button type="button" aria-label="Review candidates" title="Review candidates" onClick={() => onReviewCandidates(file.id)}>
            {candidateCount}
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Open raw log"
          disabled={!canOpenRaw}
          title={canOpenRaw ? "Open raw log in the system app" : "No project copy or source path is available"}
          onClick={() => void onOpenSourceFile(file.id)}
        >
          <ExternalLink size={14} aria-hidden="true" />
        </button>
      </span>
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
  leftSidebarOpen = false,
  rightSidebarOpen = false,
  onClose,
  onEdit2DStructure,
  onReset2DStructure,
}: {
  node: FlowNode
  file: SourceFile | null
  leftSidebarOpen?: boolean
  rightSidebarOpen?: boolean
  onClose: () => void
  onEdit2DStructure?: (nodeId: string) => void
  onReset2DStructure?: (nodeId: string) => void
}) {
  const coordinatePreview = sourceCoordinatePreview(node, file)
  const elementLabels = coordinatePreview?.elements.length
    ? coordinatePreview.elements
    : formulaElementsFromText(node.formula)
  const visibleAtoms = elementLabels.length > 0 ? elementLabels : ["C", "H", "O"]
  const coordinateAtoms = coordinatePreview?.atoms?.length ? coordinatePreview.atoms : []
  const hasManualStructure = Boolean(node.manualStructureKet || node.manualStructureMolfile || node.manualStructureCdxml || node.manualStructureSvg)

  const edit2DStructure = () => {
    onEdit2DStructure?.(node.id)
    onClose()
  }

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [onClose])

  return (
    <div
      className={`structure-preview-scrim${leftSidebarOpen ? " has-left-sidebar" : ""}${rightSidebarOpen ? " has-right-sidebar" : ""}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="structure-preview-dialog" role="dialog" aria-modal="true" aria-label="3D Structure">
        <header className="structure-preview-header">
          <div>
            <span>Structure Preview</span>
            <strong>{node.label}</strong>
          </div>
          <button type="button" aria-label="Close 3D Structure" onClick={onClose}>
            <ChevronDown size={18} />
          </button>
        </header>
        <div className="structure-preview-body">
          <article className="structure-dialog-pane structure-dialog-pane-2d">
            <header>
              <span>2D structure</span>
              <span className="structure-dialog-actions">
                {hasManualStructure ? (
                  <button
                    type="button"
                    className="structure-dialog-action"
                    aria-label={`Reset 2D structure for ${node.label}`}
                    title={`Reset 2D structure for ${node.label}`}
                    onClick={() => onReset2DStructure?.(node.id)}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                  </button>
                ) : null}
                {onEdit2DStructure ? (
                  <button
                    type="button"
                    className="structure-dialog-action"
                    aria-label={`Edit 2D structure for ${node.label}`}
                    title={`Edit 2D structure for ${node.label}`}
                    onClick={edit2DStructure}
                  >
                    <PencilLine size={14} aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            </header>
            <Molecule2DDepiction
              atoms={coordinateAtoms}
              formula={node.formula}
              manualMolfile={node.manualStructureMolfile}
              manualSvg={node.manualStructureSvg}
              label={node.label}
              width={264}
              height={236}
              className="structure-dialog-2d-depiction"
              emptyText="2D unavailable"
            />
          </article>
          <article className="structure-dialog-pane structure-dialog-pane-3d">
            <header>
              <span>3D structure</span>
              <em>{coordinateAtoms.length ? `${coordinateAtoms.length} atoms` : "No coordinates"}</em>
            </header>
            <Molecule3DmolViewer atoms={coordinateAtoms} formula={node.formula} sourceName={file?.name ?? node.label} />
          </article>
        </div>
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

function formulaElementsFromText(formula: string): string[] {
  return Array.from(formula.matchAll(/[A-Z][a-z]?/g), (match) => match[0])
}
