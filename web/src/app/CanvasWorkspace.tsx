import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react"
import { Activity, ChevronDown, Maximize2, MoreHorizontal, UploadCloud, ZoomIn, ZoomOut } from "lucide-react"
import type { CanvasViewport, FlowBarrier, FlowEdge, FlowNode, Point, SourceFile } from "../domain/projectPackages"
import type { CoordinatePreview } from "../domain/sourceParsers"
import {
  clamp,
  collapsedNodeHeight,
  createMinimapGeometry,
  fallbackCanvasSize,
  minimapRectStyle,
  minimapSize,
  nodeHeight,
  nodeWidth,
  viewportFromMinimapPoint,
  type CanvasSelectionRect,
  type MinimapGeometry,
  type SurfaceSize,
} from "./canvasGeometry"
import {
  createBarrierDraftPreviewPath,
  createBarrierSegment,
  createConnectionPreviewPath,
  createEdgeSegment,
  type BarrierSegment,
} from "./canvasDrawing"
import {
  formatCoefficientValue,
  formatEnergy,
  formatRelativeEnergy,
  nodeCoefficient,
  nodeFooterText,
  type EnergyDisplayOptions,
  type EnergyTableRow,
} from "./energyDisplay"
import {
  dataTransferTypes,
  filesFromDataTransfer,
  projectFileDragMimeType,
  projectFileIdsFromDataTransfer,
} from "./fileDisplay"
import { Molecule2DDepiction } from "./Molecule2DDepiction"

export type GraphSelectionMode = "replace" | "toggle"

export type DragState<TSnapshot = unknown> =
  | { kind: "pan"; pointerId: number; start: Point; origin: Point }
  | { kind: "node"; pointerId: number; nodeId: string; start: Point; origin: Point; snapshot: TSnapshot }
  | { kind: "rubber"; pointerId: number; start: Point; current: Point; additive: boolean }

export type ConnectionDraft = {
  pointerId: number
  sourceId: string
  current: Point
}

export type BarrierDraft = {
  pointerId: number
  sourceId: string
  current: Point
}

export type CanvasRawFileDrop =
  | { kind: "external-files"; files: File[]; position: Point }
  | { kind: "project-files"; fileIds: string[]; position: Point }

export function normalizedSelectionRect(start: Point, current: Point): CanvasSelectionRect {
  const x = Math.min(start.x, current.x)
  const y = Math.min(start.y, current.y)
  return {
    x,
    y,
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  }
}

export function selectionRectIsClick(rect: CanvasSelectionRect): boolean {
  return rect.width < 6 && rect.height < 6
}

export function selectionModeFromKeyboardOrPointer(
  event: Pick<KeyboardEvent<HTMLElement> | PointerEvent<HTMLElement> | MouseEvent<HTMLElement>, "shiftKey">,
): GraphSelectionMode {
  return event.shiftKey ? "toggle" : "replace"
}

export function CanvasSurface({
  canvasRef,
  nodes,
  files,
  edges,
  barriers,
  nodeMap,
  selectedNodeIds,
  selectedEdgeIds,
  selectedBarrierIds,
  keyboardEdgeSourceId,
  tool,
  viewport,
  rubberBandDraft,
  connectionDraft,
  barrierDraft,
  energyDisplayOptions,
  energyRows,
  relativeZeroNodeId,
  onCanvasPointerDown,
  onCanvasKeyDown,
  onPointerMove,
  onPointerEnd,
  onNodePointerDown,
  onNodePointerUp,
  onStartConnection,
  onStartBarrierAnnotation,
  onStartKeyboardConnection,
  onSelectNode,
  onSelectEdge,
  onSelectBarrier,
  onUpdateBarrierLabel,
  onSetNodeCoefficient,
  onSetRelativeEnergyZero,
  onShowNodeSource,
  onRawFileDrop,
}: {
  canvasRef: React.RefObject<HTMLDivElement | null>
  nodes: FlowNode[]
  files: SourceFile[]
  edges: FlowEdge[]
  barriers: FlowBarrier[]
  nodeMap: Map<string, FlowNode>
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  selectedBarrierIds: string[]
  keyboardEdgeSourceId: string | null
  tool: "select" | "pan"
  viewport: CanvasViewport
  rubberBandDraft: Extract<DragState, { kind: "rubber" }> | null
  connectionDraft: ConnectionDraft | null
  barrierDraft: BarrierDraft | null
  energyDisplayOptions: EnergyDisplayOptions
  energyRows: EnergyTableRow[]
  relativeZeroNodeId: string | null
  onCanvasPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onCanvasKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void
  onPointerEnd: (event: PointerEvent<HTMLDivElement>) => void
  onNodePointerDown: (event: PointerEvent<HTMLElement>, node: FlowNode) => void
  onNodePointerUp: (event: PointerEvent<HTMLElement>, targetId: string) => void
  onStartConnection: (event: PointerEvent<HTMLElement>, sourceId: string) => void
  onStartBarrierAnnotation: (event: PointerEvent<HTMLElement>, sourceId: string) => void
  onStartKeyboardConnection: (sourceId: string) => void
  onSelectNode: (nodeId: string, mode?: GraphSelectionMode) => void
  onSelectEdge: (edgeId: string, mode?: GraphSelectionMode) => void
  onSelectBarrier: (barrierId: string, mode?: GraphSelectionMode) => void
  onUpdateBarrierLabel: (barrierId: string, label: string | null) => void
  onSetNodeCoefficient: (nodeId: string, coefficient: number) => void
  onSetRelativeEnergyZero: (nodeId: string) => void
  onShowNodeSource: (nodeId: string) => void
  onRawFileDrop: (drop: CanvasRawFileDrop) => void
}) {
  const energyRowByNodeId = useMemo(
    () => new Map(energyRows.map((row) => [row.nodeId, row])),
    [energyRows],
  )
  const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])
  const selectedEdgeIdSet = useMemo(() => new Set(selectedEdgeIds), [selectedEdgeIds])
  const selectedBarrierIdSet = useMemo(() => new Set(selectedBarrierIds), [selectedBarrierIds])
  const fileById = useMemo(() => new Map(files.map((file) => [file.id, file])), [files])

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!hasCanvasRawFileDrop(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasCanvasRawFileDrop(event.dataTransfer)) return
    const position = canvasWorldPointFromClient(event.clientX, event.clientY, canvasRef.current, viewport)
    const projectFileIds = projectFileIdsFromDataTransfer(event.dataTransfer)
    if (projectFileIds.length > 0) {
      event.preventDefault()
      onRawFileDrop({ kind: "project-files", fileIds: projectFileIds, position })
      return
    }

    const droppedFiles = filesFromDataTransfer(event.dataTransfer)
    if (droppedFiles.length === 0) return
    event.preventDefault()
    onRawFileDrop({ kind: "external-files", files: droppedFiles, position })
  }

  return (
    <div
      ref={canvasRef}
      className={`canvas-surface ${tool === "pan" ? "is-panning" : "is-selecting"}${rubberBandDraft ? " has-rubber-band" : ""}`}
      aria-label="Graph canvas surface"
      aria-keyshortcuts="Delete Backspace Escape ArrowUp ArrowDown ArrowLeft ArrowRight Meta+Z Control+Z Control+Y"
      tabIndex={0}
      onPointerDown={onCanvasPointerDown}
      onKeyDown={onCanvasKeyDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        className="canvas-world"
        style={{
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
        }}
      >
        <svg className="edge-layer" width="1600" height="1000" viewBox="0 0 1600 1000">
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="rgba(82, 103, 122, 0.55)" />
            </marker>
            <marker id="barrier-arrow" markerWidth="9" markerHeight="9" refX="4.5" refY="8" orient="auto">
              <path d="M0,0 L9,0 L4.5,8 Z" fill="rgba(217, 99, 82, 0.82)" />
            </marker>
          </defs>
          {edges.map((edge) => (
            <ReactionEdge
              key={edge.id}
              edge={edge}
              nodeMap={nodeMap}
              selected={selectedEdgeIdSet.has(edge.id)}
              onSelect={onSelectEdge}
            />
          ))}
          {connectionDraft ? <ConnectionPreview draft={connectionDraft} nodeMap={nodeMap} /> : null}
          {barrierDraft ? <BarrierDraftPreview draft={barrierDraft} nodeMap={nodeMap} /> : null}
          {barriers.map((barrier) => (
            <BarrierAnnotation
              key={barrier.id}
              barrier={barrier}
              nodeMap={nodeMap}
              energyDisplayOptions={energyDisplayOptions}
              selected={selectedBarrierIdSet.has(barrier.id)}
              onSelect={onSelectBarrier}
              onUpdateLabel={onUpdateBarrierLabel}
            />
          ))}
        </svg>

        {nodes.map((node) => (
          <ReactionNodeCard
            key={node.id}
            node={node}
            coordinatePreview={coordinatePreviewForNode(node, fileById)}
            selected={selectedNodeIdSet.has(node.id)}
            keyboardConnectionActive={node.id === keyboardEdgeSourceId}
            relativeEnergy={energyRowByNodeId.get(node.id)?.relative ?? null}
            outputUnit={energyDisplayOptions.outputUnit}
            energyBaseline={node.id === relativeZeroNodeId}
            onPointerDown={onNodePointerDown}
            onPointerUp={onNodePointerUp}
            onStartConnection={onStartConnection}
            onStartBarrierAnnotation={onStartBarrierAnnotation}
            onStartKeyboardConnection={onStartKeyboardConnection}
            onSelectNode={onSelectNode}
            onSetCoefficient={onSetNodeCoefficient}
            onSetRelativeEnergyZero={onSetRelativeEnergyZero}
            onShowNodeSource={onShowNodeSource}
          />
        ))}
        {rubberBandDraft ? <CanvasRubberBand draft={rubberBandDraft} /> : null}
      </div>
      {nodes.length === 0 ? (
        <div className="canvas-empty-state">
          <UploadCloud size={22} />
          <strong>No nodes in this project</strong>
          <span>Import local files to create nodes.</span>
        </div>
      ) : null}
    </div>
  )
}

function CanvasRubberBand({ draft }: { draft: Extract<DragState, { kind: "rubber" }> }) {
  const rect = normalizedSelectionRect(draft.start, draft.current)
  if (selectionRectIsClick(rect)) return null
  return (
    <div
      className="canvas-rubber-band"
      aria-hidden="true"
      style={{
        transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`,
        width: rect.width,
        height: rect.height,
      }}
    />
  )
}

function ReactionNodeCard({
  node,
  coordinatePreview,
  selected,
  keyboardConnectionActive,
  relativeEnergy,
  outputUnit,
  energyBaseline,
  onPointerDown,
  onPointerUp,
  onStartConnection,
  onStartBarrierAnnotation,
  onStartKeyboardConnection,
  onSelectNode,
  onSetCoefficient,
  onSetRelativeEnergyZero,
  onShowNodeSource,
}: {
  node: FlowNode
  coordinatePreview: CoordinatePreview | null
  selected: boolean
  keyboardConnectionActive: boolean
  relativeEnergy: number | null
  outputUnit: EnergyDisplayOptions["outputUnit"]
  energyBaseline: boolean
  onPointerDown: (event: PointerEvent<HTMLElement>, node: FlowNode) => void
  onPointerUp: (event: PointerEvent<HTMLElement>, targetId: string) => void
  onStartConnection: (event: PointerEvent<HTMLElement>, sourceId: string) => void
  onStartBarrierAnnotation: (event: PointerEvent<HTMLElement>, sourceId: string) => void
  onStartKeyboardConnection: (sourceId: string) => void
  onSelectNode: (nodeId: string, mode?: GraphSelectionMode) => void
  onSetCoefficient: (nodeId: string, coefficient: number) => void
  onSetRelativeEnergyZero: (nodeId: string) => void
  onShowNodeSource: (nodeId: string) => void
}) {
  const coefficientValue = nodeCoefficient(node)
  const [coefficientEditing, setCoefficientEditing] = useState(false)
  const [coefficientDraft, setCoefficientDraft] = useState(formatCoefficientValue(coefficientValue))
  const [structureCollapsed, setStructureCollapsed] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const coefficientInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!coefficientEditing) setCoefficientDraft(formatCoefficientValue(coefficientValue))
  }, [coefficientEditing, coefficientValue])

  useEffect(() => {
    if (!coefficientEditing) return
    coefficientInputRef.current?.focus()
    coefficientInputRef.current?.select()
  }, [coefficientEditing])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    onSelectNode(node.id, selectionModeFromKeyboardOrPointer(event))
  }
  const handleConnectorKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    event.stopPropagation()
    onStartKeyboardConnection(node.id)
  }
  const cancelCoefficientEdit = () => {
    setCoefficientDraft(formatCoefficientValue(coefficientValue))
    setCoefficientEditing(false)
  }
  const applyCoefficient = () => {
    const coefficient = Number(coefficientDraft)
    if (!Number.isFinite(coefficient) || coefficient === 0) {
      cancelCoefficientEdit()
      return
    }
    const normalized = Number(coefficient.toFixed(6))
    setCoefficientDraft(formatCoefficientValue(normalized))
    setCoefficientEditing(false)
    if (normalized !== coefficientValue) onSetCoefficient(node.id, normalized)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`reaction-node node-${node.kind}${selected ? " is-selected" : ""}${structureCollapsed ? " is-structure-collapsed" : ""}`}
      aria-label={`Node ${node.label}`}
      data-flow-node-id={node.id}
      style={{
        transform: `translate3d(${node.position.x}px, ${node.position.y}px, 0)`,
        width: nodeWidth,
        minHeight: structureCollapsed ? collapsedNodeHeight : nodeHeight,
      }}
      onPointerDown={(event) => onPointerDown(event, node)}
      onPointerUp={(event) => onPointerUp(event, node.id)}
      onKeyDown={handleKeyDown}
    >
      <span
        className="node-connector node-connector-in"
        aria-hidden="true"
      />
      <div className="node-header">
        <div>
          <strong>{node.label}</strong>
          <span>{node.formula}</span>
        </div>
        <span
          className="node-header-actions"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <em>{node.kind}</em>
          <button
            type="button"
            className={structureCollapsed ? "node-preview-toggle is-collapsed" : "node-preview-toggle"}
            aria-label={structureCollapsed ? `Show structure preview for ${node.label}` : `Collapse structure preview for ${node.label}`}
            aria-expanded={!structureCollapsed}
            title={structureCollapsed ? `Show structure preview for ${node.label}` : `Collapse structure preview for ${node.label}`}
            onClick={() => setStructureCollapsed((current) => !current)}
          >
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          <span className="node-more-actions">
            <button
              type="button"
              className="node-more-button"
              aria-label={`More actions for ${node.label}`}
              aria-haspopup="menu"
              aria-expanded={actionsOpen}
              title={`More actions for ${node.label}`}
              onClick={() => setActionsOpen((current) => !current)}
            >
              <MoreHorizontal size={14} aria-hidden="true" />
            </button>
            {actionsOpen ? (
              <span className="node-action-menu" role="menu" aria-label={`Actions for ${node.label}`}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false)
                    onShowNodeSource(node.id)
                  }}
                >
                  Source details
                </button>
              </span>
            ) : null}
          </span>
        </span>
      </div>
      {structureCollapsed ? null : <NodeStructurePreview node={node} coordinatePreview={coordinatePreview} />}
      <div className="node-energy-grid">
        <span>Delta G sol</span>
        <strong>{formatEnergy(node.energySolution, node.energyUnit)}</strong>
        <span>Delta E gas</span>
        <strong>{formatEnergy(node.energyGas, node.energyUnit)}</strong>
        <span>Relative</span>
        <strong className={energyBaseline ? "node-relative-energy is-zero" : "node-relative-energy"}>
          {formatRelativeEnergy(relativeEnergy, outputUnit)}
        </strong>
      </div>
      <div className="node-footer">
        <span className="node-status">
          <span className="status-dot" />
          {nodeFooterText(node)}
        </span>
        <button
          type="button"
          className={energyBaseline ? "node-zero-control is-active" : "node-zero-control"}
          aria-label={energyBaseline ? `${node.label} is the zero point` : `Use ${node.label} as zero point`}
          title={energyBaseline ? `${node.label} is the zero point` : `Use ${node.label} as zero point`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onSetRelativeEnergyZero(node.id)
          }}
        >
          {energyBaseline ? "Zero" : "Set zero"}
        </button>
        <span
          className="node-coefficient-control"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {coefficientEditing ? (
            <input
              ref={coefficientInputRef}
              aria-label={`Stoichiometric coefficient for ${node.label}`}
              value={coefficientDraft}
              inputMode="decimal"
              onChange={(event) => setCoefficientDraft(event.currentTarget.value)}
              onBlur={applyCoefficient}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === "Enter") {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
                if (event.key === "Escape") {
                  event.preventDefault()
                  cancelCoefficientEdit()
                }
              }}
            />
          ) : (
            <button
              type="button"
              aria-label={`Stoichiometric coefficient for ${node.label}`}
              title={`Stoichiometric coefficient for ${node.label}`}
              onClick={() => setCoefficientEditing(true)}
            >
              <span aria-hidden="true">×</span>
              {formatCoefficientValue(coefficientValue)}
            </button>
          )}
        </span>
      </div>
      <span
        role="button"
        tabIndex={0}
        className={`node-connector node-connector-out${keyboardConnectionActive ? " is-keyboard-active" : ""}`}
        aria-label={`Start edge from ${node.label}`}
        aria-pressed={keyboardConnectionActive}
        onPointerDown={(event) => onStartConnection(event, node.id)}
        onKeyDown={handleConnectorKeyDown}
      />
      <button
        type="button"
        className="node-barrier-handle"
        aria-label={`Drag barrier annotation from ${node.label}`}
        title={`Drag barrier annotation from ${node.label}`}
        onPointerDown={(event) => onStartBarrierAnnotation(event, node.id)}
        onClick={(event) => event.stopPropagation()}
      >
        <Activity size={13} aria-hidden="true" />
      </button>
    </div>
  )
}

function NodeStructurePreview({
  node,
  coordinatePreview,
}: {
  node: FlowNode
  coordinatePreview: CoordinatePreview | null
}) {
  const atoms = coordinatePreview?.atoms ?? []
  if (atoms.length === 0 && !node.manualStructureMolfile && !node.manualStructureSvg) {
    return (
      <div className="node-structure-preview node-structure-preview-empty" role="img" aria-label={`${node.label} formula-only structure preview`}>
        <strong>{node.formula}</strong>
        <span>Formula only</span>
      </div>
    )
  }

  return (
    <Molecule2DDepiction
      atoms={atoms}
      formula={node.formula}
      manualMolfile={node.manualStructureMolfile}
      manualSvg={node.manualStructureSvg}
      label={node.label}
      width={176}
      height={104}
      className="node-structure-preview node-structure-2d"
      emptyText="2D depiction pending"
    />
  )
}

function coordinatePreviewForNode(node: FlowNode, fileById: Map<string, SourceFile>): CoordinatePreview | null {
  if (!node.sourceFileId) return null
  const parse = fileById.get(node.sourceFileId)?.parse
  if (!parse) return null
  const candidate = node.sourceCandidateId
    ? parse.candidates.find((item) => item.candidateId === node.sourceCandidateId)
    : undefined
  return candidate?.coordinatePreview ?? parse.coordinatePreview
}

function ReactionEdge({
  edge,
  nodeMap,
  selected,
  onSelect,
}: {
  edge: FlowEdge
  nodeMap: Map<string, FlowNode>
  selected: boolean
  onSelect: (edgeId: string, mode?: GraphSelectionMode) => void
}) {
  const source = nodeMap.get(edge.sourceId)
  const target = nodeMap.get(edge.targetId)
  if (!source || !target) return null
  const segment = createEdgeSegment(source, target)

  return (
    <g
      className={`${edge.id === "edge-4" ? "edge is-soft" : "edge"}${selected ? " is-selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`Edge ${source.label} to ${target.label}: ${edge.label}`}
      onPointerDown={(event) => {
        event.stopPropagation()
        onSelect(edge.id, selectionModeFromKeyboardOrPointer(event))
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        onSelect(edge.id, selectionModeFromKeyboardOrPointer(event))
      }}
    >
      <path className="edge-hit-path" d={segment.path} />
      <path className="edge-visible-path" d={segment.path} markerEnd="url(#arrow)" />
      <foreignObject x={segment.labelPoint.x - 58} y={segment.labelPoint.y - 16} width="116" height="32">
        <div className="edge-label">{edge.label}</div>
      </foreignObject>
    </g>
  )
}

function ConnectionPreview({ draft, nodeMap }: { draft: ConnectionDraft; nodeMap: Map<string, FlowNode> }) {
  const source = nodeMap.get(draft.sourceId)
  if (!source) return null
  return <path className="connection-preview-path" d={createConnectionPreviewPath(source, draft.current)} />
}

function BarrierDraftPreview({ draft, nodeMap }: { draft: BarrierDraft; nodeMap: Map<string, FlowNode> }) {
  const source = nodeMap.get(draft.sourceId)
  if (!source) return null
  return <path className="barrier-preview-path" d={createBarrierDraftPreviewPath(source, draft.current)} />
}

function BarrierAnnotation({
  barrier,
  nodeMap,
  energyDisplayOptions,
  selected,
  onSelect,
  onUpdateLabel,
}: {
  barrier: FlowBarrier
  nodeMap: Map<string, FlowNode>
  energyDisplayOptions: EnergyDisplayOptions
  selected: boolean
  onSelect: (barrierId: string, mode?: GraphSelectionMode) => void
  onUpdateLabel: (barrierId: string, label: string | null) => void
}) {
  const segment = createBarrierSegment(barrier, nodeMap, energyDisplayOptions)
  if (!segment) return null

  const selectBarrier = (mode: GraphSelectionMode = "replace") => onSelect(barrier.id, mode)
  const applyLabel = (label: string | null) => onUpdateLabel(barrier.id, label)

  return (
    <g
      className={`barrier-annotation${selected ? " is-selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`Barrier annotation from ${segment.sourceLabel} to ${segment.targetLabel}: ${segment.label}`}
      onPointerDown={(event) => {
        event.stopPropagation()
        selectBarrier(selectionModeFromKeyboardOrPointer(event))
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        selectBarrier(selectionModeFromKeyboardOrPointer(event))
      }}
    >
      <path className="barrier-hit-path" d={segment.arrowPath} />
      <path className="barrier-guide" d={segment.guidePath} />
      <path className="barrier-arrow" d={segment.arrowPath} markerEnd="url(#barrier-arrow)" />
      <foreignObject x={segment.labelPoint.x - 82} y={segment.labelPoint.y - 20} width="164" height="40">
        {selected ? (
          <BarrierInlineLabelEditor segment={segment} onApply={applyLabel} />
        ) : (
          <button
            type="button"
            className="barrier-label-button"
            aria-label={`Edit barrier label from ${segment.sourceLabel} to ${segment.targetLabel}`}
            onPointerDown={(event) => {
              event.stopPropagation()
              selectBarrier()
            }}
            onClick={(event) => {
              event.stopPropagation()
              selectBarrier()
            }}
          >
            {segment.label}
          </button>
        )}
      </foreignObject>
    </g>
  )
}

function BarrierInlineLabelEditor({ segment, onApply }: {
  segment: BarrierSegment
  onApply: (label: string | null) => void
}) {
  const [value, setValue] = useState(segment.label)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setValue(segment.label)
  }, [segment.id, segment.label])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [segment.id])

  const submitLabel = () => {
    const trimmed = value.trim()
    onApply(trimmed && trimmed !== segment.defaultLabel ? trimmed : null)
  }

  return (
    <form
      className="barrier-label-editor"
      aria-label="Edit barrier label"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        submitLabel()
      }}
    >
      <input
        ref={inputRef}
        aria-label="Barrier label"
        value={value}
        placeholder={segment.defaultLabel}
        onChange={(event) => setValue(event.currentTarget.value)}
        onBlur={submitLabel}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === "Enter") {
            event.preventDefault()
            event.currentTarget.blur()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            setValue(segment.label)
            event.currentTarget.blur()
          }
        }}
      />
    </form>
  )
}

export function MiniMap({
  nodes,
  selectedNodeIds,
  viewport,
  canvasRef,
  onViewportChange,
}: {
  nodes: FlowNode[]
  selectedNodeIds: string[]
  viewport: CanvasViewport
  canvasRef: React.RefObject<HTMLDivElement | null>
  onViewportChange: (viewport: CanvasViewport) => void
}) {
  const [canvasSize, setCanvasSize] = useState<SurfaceSize>(fallbackCanvasSize)
  const [draftViewport, setDraftViewport] = useState<CanvasViewport | null>(null)
  const dragGeometryRef = useRef<MinimapGeometry | null>(null)
  const dragCanvasSizeRef = useRef<SurfaceSize>(fallbackCanvasSize)
  const dragViewportRef = useRef<CanvasViewport | null>(null)
  const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])
  const geometry = useMemo(
    () => createMinimapGeometry(nodes, viewport, canvasSize, minimapSize),
    [canvasSize, nodes, viewport],
  )
  const draftGeometry = useMemo(
    () => draftViewport ? createMinimapGeometry(nodes, draftViewport, canvasSize, minimapSize) : null,
    [canvasSize, draftViewport, nodes],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const updateCanvasSize = () => setCanvasSize(surfaceSizeFromElement(canvas, fallbackCanvasSize))
    updateCanvasSize()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(updateCanvasSize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [canvasRef])

  if (nodes.length === 0) return null

  const pointFromEvent = (event: PointerEvent<HTMLButtonElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    const width = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : minimapSize.width
    const height = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : minimapSize.height
    return {
      x: clamp(event.clientX - rect.left, 0, width) * (minimapSize.width / width),
      y: clamp(event.clientY - rect.top, 0, height) * (minimapSize.height / height),
    }
  }
  const previewFromPoint = (point: Point, sourceGeometry: MinimapGeometry, sourceViewport: CanvasViewport, sourceCanvasSize: SurfaceSize) => (
    viewportFromMinimapPoint(point, sourceGeometry, sourceViewport, sourceCanvasSize)
  )
  const beginDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const liveCanvasSize = surfaceSizeFromElement(canvasRef.current, canvasSize)
    const liveGeometry = createMinimapGeometry(nodes, viewport, liveCanvasSize, minimapSize)
    const point = pointFromEvent(event)
    dragGeometryRef.current = liveGeometry
    dragCanvasSizeRef.current = liveCanvasSize
    dragViewportRef.current = viewport
    setCanvasSize(liveCanvasSize)
    setDraftViewport(previewFromPoint(point, liveGeometry, viewport, liveCanvasSize))
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const updateDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const dragGeometry = dragGeometryRef.current
    const dragViewport = dragViewportRef.current
    if (!dragGeometry || !dragViewport) return
    event.preventDefault()
    event.stopPropagation()
    setDraftViewport(previewFromPoint(pointFromEvent(event), dragGeometry, dragViewport, dragCanvasSizeRef.current))
  }
  const commitDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const dragGeometry = dragGeometryRef.current
    const dragViewport = dragViewportRef.current
    if (!dragGeometry || !dragViewport) return
    event.preventDefault()
    event.stopPropagation()
    const nextViewport = previewFromPoint(pointFromEvent(event), dragGeometry, dragViewport, dragCanvasSizeRef.current)
    dragGeometryRef.current = null
    dragViewportRef.current = null
    setDraftViewport(null)
    onViewportChange(nextViewport)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }
  const cancelDrag = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    dragGeometryRef.current = null
    dragViewportRef.current = null
    setDraftViewport(null)
  }

  return (
    <button
      type="button"
      className="minimap"
      aria-label="Navigate graph minimap"
      title="Navigate graph minimap"
      onPointerDown={beginDrag}
      onPointerMove={updateDrag}
      onPointerUp={commitDrag}
      onPointerCancel={cancelDrag}
    >
      <span className="minimap-bounds" aria-hidden="true" />
      {geometry.nodes.map((node) => (
        <span
          key={node.id}
          className={selectedNodeIdSet.has(node.id) ? "minimap-node is-selected" : "minimap-node"}
          style={{
            left: `${node.left}px`,
            top: `${node.top}px`,
            width: `${node.width}px`,
            height: `${node.height}px`,
          }}
          aria-hidden="true"
        />
      ))}
      <span
        className={draftGeometry ? "minimap-window is-draft" : "minimap-window"}
        style={minimapRectStyle((draftGeometry ?? geometry).viewportWindow)}
        aria-hidden="true"
      />
    </button>
  )
}

function surfaceSizeFromElement(element: HTMLElement | null, fallback: SurfaceSize): SurfaceSize {
  const rect = element?.getBoundingClientRect()
  if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
    return fallback
  }
  return { width: rect.width, height: rect.height }
}

export function canvasSizeFromElement(element: HTMLElement | null, fallback: SurfaceSize): SurfaceSize {
  const rect = element?.getBoundingClientRect()
  return {
    width: rect?.width ?? fallback.width,
    height: rect?.height ?? fallback.height,
  }
}

function canvasWorldPointFromClient(
  clientX: number,
  clientY: number,
  canvas: HTMLDivElement | null,
  viewport: CanvasViewport,
): Point {
  const rect = canvas?.getBoundingClientRect()
  return {
    x: (clientX - (rect?.left ?? 0) - viewport.x) / viewport.zoom,
    y: (clientY - (rect?.top ?? 0) - viewport.y) / viewport.zoom,
  }
}

function hasCanvasRawFileDrop(dataTransfer: DataTransfer): boolean {
  const types = dataTransferTypes(dataTransfer)
  return types.includes(projectFileDragMimeType) || types.includes("Files") || filesFromDataTransfer(dataTransfer).length > 0
}

export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}) {
  return (
    <div className="zoom-controls" aria-label="Zoom controls">
      <button type="button" onClick={onReset} aria-label="Reset canvas view">
        <Maximize2 size={17} />
      </button>
      <button type="button" onClick={onZoomOut} aria-label="Zoom out">
        <ZoomOut size={17} />
      </button>
      <span>{Math.round(zoom * 100)}%</span>
      <button type="button" onClick={onZoomIn} aria-label="Zoom in">
        <ZoomIn size={17} />
      </button>
    </div>
  )
}
