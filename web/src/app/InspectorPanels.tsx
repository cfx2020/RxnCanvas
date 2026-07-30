import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ExternalLink, FilePlus2, Maximize2, PanelRight, Pause, PencilLine, Play, RotateCcw, X } from "lucide-react"
import type { FlowNode, SourceFile } from "../domain/projectPackages"
import { classifyComputationTermination, type ParseCandidate, type SourceParseResult, type VibrationalMode } from "../domain/sourceParsers"
import { type EnergyDisplayOptions, type EnergyExpressionTerm, type EnergyTableRow, formatEnergy, formatRelativeEnergy } from "./energyDisplay"
import { Molecule3DmolViewer } from "./Molecule3DmolViewer"
import { preload3Dmol } from "./Molecule3DmolViewer.loader"
import { Molecule2DDepiction } from "./Molecule2DDepiction"
import { preloadKetcherEditorHost } from "./KetcherEditorHost.loader"

export type InspectorMode = "inspector" | "export"

import { candidateReviewKey, nodeKindFromCandidate, type CandidateReviewEntry, type CandidateReviewViewState } from "./importRegistration"

export const InspectorPanel = memo(function InspectorPanel({
  node,
  file,
  rows,
  files,
  energyDisplayOptions,
  onReviewCandidates,
  onOpenStructure,
  onEdit2DStructure,
  onReset2DStructure,
  onOpenSourceFile,
}: {
  node: FlowNode | null
  file: SourceFile | null
  rows: EnergyTableRow[]
  files: SourceFile[]
  energyDisplayOptions: EnergyDisplayOptions
  onReviewCandidates: (fileId: string) => void
  onOpenStructure: (nodeId: string) => void
  onEdit2DStructure: (nodeId: string) => void
  onReset2DStructure: (nodeId: string) => void
  onOpenSourceFile: (fileId: string) => void | Promise<void>
}) {
  const nodeRow = node ? rows.find((row) => row.nodeId === node.id) ?? null : null
  return (
    <aside className="inspector-panel" aria-label="Inspector">
      <NodeInspector
        node={node}
        row={nodeRow}
        file={node ? sourceFileForNode(node, files) : file}
        energyDisplayOptions={energyDisplayOptions}
        onOpenStructure={onOpenStructure}
        onReviewCandidates={onReviewCandidates}
        onOpenSourceFile={onOpenSourceFile}
      />
    </aside>
  )
})

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
    if (file) {
      return (
        <div className="node-inspector-stack">
          <section className="node-panel-summary" aria-label="Source summary">
            <div className="node-panel-section-heading">
              <div>
                <span>Source</span>
                <strong>{file.parse?.label ?? file.name}</strong>
              </div>
              <span className={`termination-pill termination-${file.parse?.terminationStatus ?? "unknown"}`}>
                {file.parse?.terminationLabel ?? file.parse?.terminationStatus ?? "source"}
              </span>
            </div>
            <dl className="node-summary-grid">
              <div>
                <dt>File</dt>
                <dd>{file.name}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{file.kind}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{file.status}</dd>
              </div>
              <div>
                <dt>Objects</dt>
                <dd>{file.parse?.objectCount ?? file.parse?.candidates?.length ?? "pending"}</dd>
              </div>
            </dl>
          </section>
          <NodeSourceBrief
            file={file}
            onReviewCandidates={onReviewCandidates}
            onOpenSourceFile={onOpenSourceFile}
          />
        </div>
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
        <NodeEnergyCalculation
          node={node}
          row={row}
          energyDisplayOptions={energyDisplayOptions}
        />
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
          onMouseEnter={preload3DmolOnIntent}
          onFocus={preload3DmolOnIntent}
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

function NodeEnergyCalculation({
  node,
  row,
  energyDisplayOptions,
}: {
  node: FlowNode
  row: EnergyTableRow | null
  energyDisplayOptions: EnergyDisplayOptions
}) {
  const symbol = energyDisplayOptions.energySource === "solution" ? "ΔG" : "ΔE"
  const expression = nodeEnergyCalculationExpression(node, row)
  const value = row && !relativeEnergyRoleIsTerm(row.relativeRole)
    ? formatRelativeEnergy(row.relative, energyDisplayOptions.outputUnit)
    : null
  return (
    <div className="node-energy-calculation" aria-label={`${symbol} calculation`}>
      <span>{symbol} =</span>
      <code>{expression}</code>
      {value ? <strong>= {value}</strong> : null}
    </div>
  )
}

function nodeEnergyCalculationExpression(node: FlowNode, row: EnergyTableRow | null): string {
  if (!row) return "pending"
  if (row.relativeRole === "addition-term") return `${node.label} is an added term`
  if (row.relativeRole === "release-term") return `${node.label} is a released term`
  if (row.relativeRole === "participant-term") return `${node.label} is a side species term`
  if (row.relativeExpressionTerms.length === 0) return "reference"
  return energyExpressionTermsLabel(row.relativeExpressionTerms)
}

function energyExpressionTermsLabel(terms: EnergyExpressionTerm[]): string {
  return terms.map((term, index) => {
    const sign = term.coefficient < 0 ? "-" : "+"
    const magnitude = Math.abs(term.coefficient)
    const coefficient = Math.abs(magnitude - 1) < 1e-9 ? "" : `${formatExpressionCoefficient(magnitude)} `
    const label = `${coefficient}${term.label}`
    return index === 0
      ? (sign === "-" ? `- ${label}` : label)
      : `${sign} ${label}`
  }).join(" ")
}

function formatExpressionCoefficient(value: number): string {
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(6)).toString()
}

function relativeEnergyRoleIsTerm(role: EnergyTableRow["relativeRole"]): boolean {
  return role === "addition-term" || role === "release-term" || role === "participant-term"
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
    : classifyComputationTermination(sourceText)
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
          aria-label="Open with external app"
          disabled={!canOpenRaw}
          title={canOpenRaw ? "Open with external app" : "No project copy or source path is available"}
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
  const sheetRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const activeElement = document.activeElement
    if (
      activeElement instanceof HTMLElement
      && activeElement !== document.body
      && !sheetRef.current?.contains(activeElement)
    ) {
      returnFocusRef.current = activeElement
    }
    closeButtonRef.current?.focus({ preventScroll: true })
    return () => {
      const returnFocus = returnFocusRef.current
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    if (!busy) return
    const activeElement = document.activeElement
    const activeElementDisabled = (
      activeElement instanceof HTMLButtonElement
      || activeElement instanceof HTMLInputElement
    ) && activeElement.disabled
    if (!sheetRef.current?.contains(activeElement) || activeElementDisabled) {
      closeButtonRef.current?.focus({ preventScroll: true })
    }
  }, [busy])

  return (
    <div className="candidate-review-scrim" role="presentation">
      <section
        ref={sheetRef}
        className="candidate-review-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Import candidates"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            onClose()
            return
          }
          if (event.key !== "Tab") return
          const focusableElements = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>("input:not([disabled]), button:not([disabled])"),
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
        <header className="candidate-review-header">
          <div>
            <span>Import Preview</span>
            <strong>{review.entries.length} candidates</strong>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close import candidates">
            <ChevronDown size={18} aria-hidden="true" />
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
  onHydrateSourceParse,
}: {
  node: FlowNode
  file: SourceFile | null
  leftSidebarOpen?: boolean
  rightSidebarOpen?: boolean
  onClose: () => void
  onEdit2DStructure?: (nodeId: string) => void
  onReset2DStructure?: (nodeId: string) => void
  onHydrateSourceParse?: (file: SourceFile) => Promise<SourceParseResult | null>
}) {
  const coordinatePreview = sourceCoordinatePreview(node, file)
  const coordinateAtoms = coordinatePreview?.atoms?.length ? coordinatePreview.atoms : []
  const [hydratedParse, setHydratedParse] = useState<SourceParseResult | null>(null)
  const [hydratingVibration, setHydratingVibration] = useState(false)
  const hydratedCoordinatePreview = hydratedParse ? sourceCoordinatePreview(node, { ...(file ?? fallbackSourceFile(node)), parse: hydratedParse }) : null
  const vibrationPreview = hydratedCoordinatePreview ?? coordinatePreview
  const defaultVibrationMode = useMemo(() => {
    const modes = vibrationPreview?.vibrationModes ?? []
    return modes[0] ?? null
  }, [vibrationPreview?.vibrationModes])
  const [vibrationPlaying, setVibrationPlaying] = useState(false)
  const ketcherPreloadTimerRef = useRef<number | null>(null)
  const hasManualStructure = Boolean(node.manualStructureKet || node.manualStructureMolfile || node.manualStructureCdxml)
  const canAttemptVibrationHydration = Boolean(file && onHydrateSourceParse && defaultVibrationMode && !vibrationalModeHasFullDisplacements(defaultVibrationMode, coordinateAtoms.length))
  const playableVibrationMode = defaultVibrationMode && vibrationalModeHasFullDisplacements(defaultVibrationMode, coordinateAtoms.length) ? defaultVibrationMode : null

  const toggleVibration = useCallback(async () => {
    if (!defaultVibrationMode) return
    if (playableVibrationMode) {
      setVibrationPlaying((playing) => !playing)
      return
    }
    if (!file || !onHydrateSourceParse || hydratingVibration) return
    setHydratingVibration(true)
    try {
      const parse = await onHydrateSourceParse(file)
      if (parse) {
        setHydratedParse(parse)
        const hydratedPreview = sourceCoordinatePreview(node, { ...file, parse })
        const hydratedMode = hydratedPreview?.vibrationModes?.[0] ?? null
        if (vibrationalModeHasFullDisplacements(hydratedMode, coordinateAtoms.length)) {
          setVibrationPlaying(true)
        }
      }
    } finally {
      setHydratingVibration(false)
    }
  }, [coordinateAtoms.length, defaultVibrationMode, file, hydratingVibration, node, onHydrateSourceParse, playableVibrationMode])

  const edit2DStructure = () => {
    onEdit2DStructure?.(node.id)
    onClose()
  }

  const cancelKetcherHoverPreload = useCallback(() => {
    if (ketcherPreloadTimerRef.current === null) return
    window.clearTimeout(ketcherPreloadTimerRef.current)
    ketcherPreloadTimerRef.current = null
  }, [])

  const preloadKetcherNow = useCallback(() => {
    cancelKetcherHoverPreload()
    void preloadKetcherEditorHost().catch(() => undefined)
  }, [cancelKetcherHoverPreload])

  const scheduleKetcherHoverPreload = useCallback(() => {
    if (ketcherPreloadTimerRef.current !== null) return
    ketcherPreloadTimerRef.current = window.setTimeout(() => {
      ketcherPreloadTimerRef.current = null
      void preloadKetcherEditorHost().catch(() => undefined)
    }, 200)
  }, [])

  useEffect(() => {
    setHydratedParse(null)
    setVibrationPlaying(false)
  }, [file?.id, node.id])

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [onClose])

  useEffect(() => {
    if (!playableVibrationMode) setVibrationPlaying(false)
  }, [playableVibrationMode])

  useEffect(() => cancelKetcherHoverPreload, [cancelKetcherHoverPreload])

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
          <button type="button" className="structure-preview-close-button" aria-label="Close 3D Structure" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="structure-preview-body">
          <article className="structure-dialog-pane structure-dialog-pane-2d" aria-label="2D structure">
            <Molecule2DDepiction
              atoms={coordinateAtoms}
              formula={node.formula}
              manualMolfile={node.manualStructureMolfile}
              label={node.label}
              width={264}
              height={236}
              className="structure-dialog-2d-depiction"
              emptyText="2D unavailable"
            />
            <span className="structure-dialog-preview-actions structure-dialog-preview-actions-2d">
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
                  onMouseEnter={scheduleKetcherHoverPreload}
                  onMouseLeave={cancelKetcherHoverPreload}
                  onFocus={preloadKetcherNow}
                  onClick={edit2DStructure}
                >
                  <PencilLine size={14} aria-hidden="true" />
                </button>
              ) : null}
            </span>
          </article>
          <article className="structure-dialog-pane structure-dialog-pane-3d" aria-label="3D structure">
            <Molecule3DmolViewer
              atoms={coordinateAtoms}
              formula={node.formula}
              sourceName={file?.name ?? node.label}
              vibrationMode={playableVibrationMode}
              vibrationPlaying={vibrationPlaying}
            />
            <span className="structure-dialog-preview-actions structure-dialog-preview-actions-3d">
              <button
                type="button"
                className={`structure-dialog-action structure-dialog-vibration-action${vibrationPlaying ? " is-active" : ""}`}
                aria-label={vibrationPlaying ? "Pause vibration" : "Play vibration"}
                title={vibrationActionTitle(defaultVibrationMode, playableVibrationMode, canAttemptVibrationHydration, hydratingVibration, vibrationPlaying)}
                disabled={!defaultVibrationMode || hydratingVibration || (!playableVibrationMode && !canAttemptVibrationHydration)}
                onClick={toggleVibration}
              >
                {vibrationPlaying ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
              </button>
            </span>
          </article>
        </div>
      </section>
    </div>
  )
}

function preload3DmolOnIntent() {
  void preload3Dmol().catch(() => undefined)
}


function vibrationalModeHasFullDisplacements(mode: VibrationalMode | null | undefined, atomCount: number): boolean {
  return atomCount > 0 && Array.isArray(mode?.displacements) && mode.displacements.length === atomCount
}

function vibrationActionTitle(
  mode: VibrationalMode | null,
  playableMode: VibrationalMode | null,
  canHydrate: boolean,
  hydrating: boolean,
  playing: boolean,
): string {
  if (!mode) return "没有振动数据，请重新导入频率输出文件"
  if (hydrating) return "正在读取完整振动数据…"
  if (playableMode) return playing ? "暂停振动" : "播放振动"
  if (canHydrate) return "读取并播放振动"
  return "振动位移未载入；请重新导入频率输出文件"
}

function fallbackSourceFile(node: FlowNode): SourceFile {
  return {
    id: node.sourceFileId ?? "source",
    name: node.label,
    kind: "Raw",
    size: 0,
    status: "staged",
    preview: "",
  }
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
