import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react"
import { Maximize2, UploadCloud, ZoomIn, ZoomOut } from "lucide-react"
import type { CanvasAnnotation, CanvasViewport, EdgeStepRole, FlowBarrier, FlowEdge, FlowNode, Point, SourceFile } from "../domain/projectPackages"
import type { CoordinatePreview } from "../domain/sourceParsers"
import {
  clamp,
  createMinimapGeometry,
  fallbackCanvasSize,
  flowNodeSize,
  minimapRectStyle,
  minimapSize,
  viewportFromCanvasWheel,
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
  stepConnectorOffsetY,
  type BarrierSegment,
  type BarrierRelativeEnergyLookup,
} from "./canvasDrawing"
import {
  formatCoefficientValue,
  formatRelativeEnergyValue,
  nodeCoefficient,
  nodeFooterText,
  relativeEnergyValueFromKcal,
  type EnergyDisplayOptions,
  type EnergyTableRow,
} from "./energyDisplay"
import {
  dataTransferHasFiles,
  dataTransferTypes,
  filesFromDataTransfer,
  projectFileDragMimeType,
  projectFileIdsFromDataTransfer,
  sourceFileDisplayGroupKey,
  sourceFileHasUsableParsedData,
  sourceFileLooksLikeParsedSolutionLog,
  sourceFileLooksLikeSolutionLog,
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
  snapTargetId?: string
  snapStepRole?: Extract<EdgeStepRole, "addition">
  stepRole?: Extract<EdgeStepRole, "addition" | "release">
}

export type BarrierDraft = {
  pointerId: number
  sourceId: string
  current: Point
}

export type CanvasRawFileDrop =
  | { kind: "external-files"; files: File[]; position: Point }
  | { kind: "project-files"; fileIds: string[]; position: Point }

export type CanvasContextSelection = {
  nodeIds: string[]
  edgeIds: string[]
  barrierIds: string[]
}

export type CanvasContextMenuTarget =
  | { kind: "selection"; selection: CanvasContextSelection }
  | { kind: "annotation"; annotationId: string }
  | { kind: "node"; nodeId: string; selection: CanvasContextSelection }
  | { kind: "edge"; edgeId: string; selection: CanvasContextSelection }
  | { kind: "barrier"; barrierId: string; selection: CanvasContextSelection }

export type CanvasContextMenuRequest = {
  x: number
  y: number
  target: CanvasContextMenuTarget
}

export type CanvasTool = "select" | "pan" | "text"

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

function capsuleWidthForLabel(
  label: string,
  options: { min: number; max: number; padding: number } = { min: 58, max: 220, padding: 28 },
) {
  const text = label.trim() || "Add label"
  return clamp(Math.ceil(estimatedInlineTextWidth(text) + options.padding), options.min, options.max)
}

function estimatedInlineTextWidth(text: string): number {
  const textWidth = Array.from(text).reduce((width, char) => {
    if (/\s/.test(char)) return width + 4
    if (/[\u3400-\u9fff]/.test(char)) return width + 12
    if (/[A-Z0-9Δ‡+=./()[\]{}–—-]/.test(char)) return width + 8.2
    return width + 6.8
  }, 0)
  return textWidth
}

function autoTextBoxWidthForValue(
  value: string,
  options: { placeholder: string; min: number; max: number; padding: number },
) {
  const text = value.length > 0 ? value : options.placeholder
  const longestLine = text.split(/\r?\n/).reduce((longest, line) => (
    estimatedInlineTextWidth(line) > estimatedInlineTextWidth(longest) ? line : longest
  ), "")
  return clamp(Math.ceil(estimatedInlineTextWidth(longestLine || options.placeholder) + options.padding), options.min, options.max)
}

function canvasTextAnnotationWidth(text: string) {
  return autoTextBoxWidthForValue(text, {
    placeholder: "Text",
    min: 72,
    max: 420,
    padding: 26,
  })
}

export function CanvasSurface({
  canvasRef,
  nodes,
  files,
  edges,
  barriers,
  annotations = [],
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
  onNodeResizePointerDown,
  onNodePointerUp,
  onStartConnection,
  onStartBarrierAnnotation,
  onStartKeyboardConnection,
  onSelectNode,
  onSelectEdge,
  onSelectBarrier,
  onSetNodeCoefficient: _onSetNodeCoefficient,
  onUpdateEdgeLabel,
  onUpdateBarrierLabel,
  onSetRelativeEnergyZero,
  onOpenStructure,
  onShowNodeSource,
  onRenameNode,
  renameEditingNodeId,
  onRenameRequestHandled,
  onOpenContextMenu,
  onRawFileDrop,
  editingAnnotationId = null,
  onBeginEditAnnotation = () => undefined,
  onBeginMoveAnnotation = () => undefined,
  onMoveAnnotation = () => undefined,
  onUpdateTextAnnotation = () => undefined,
  onDeleteAnnotation = () => undefined,
}: {
  canvasRef: React.RefObject<HTMLDivElement | null>
  nodes: FlowNode[]
  files: SourceFile[]
  edges: FlowEdge[]
  barriers: FlowBarrier[]
  annotations?: CanvasAnnotation[]
  nodeMap: Map<string, FlowNode>
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  selectedBarrierIds: string[]
  keyboardEdgeSourceId: string | null
  tool: CanvasTool
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
  onNodeResizePointerDown: (event: PointerEvent<HTMLElement>, node: FlowNode) => void
  onNodePointerUp: (event: PointerEvent<HTMLElement>, targetId: string, targetStepRole?: Extract<EdgeStepRole, "addition">) => void
  onStartConnection: (event: PointerEvent<HTMLElement>, sourceId: string, stepRole?: Extract<EdgeStepRole, "release">) => void
  onStartBarrierAnnotation: (event: PointerEvent<HTMLElement>, sourceId: string) => void
  onStartKeyboardConnection: (sourceId: string) => void
  onSelectNode: (nodeId: string, mode?: GraphSelectionMode) => void
  onSelectEdge: (edgeId: string, mode?: GraphSelectionMode) => void
  onSelectBarrier: (barrierId: string, mode?: GraphSelectionMode) => void
  onSetNodeCoefficient: (nodeId: string, coefficient: number) => void
  onUpdateEdgeLabel: (edgeId: string, label: string) => void
  onUpdateBarrierLabel: (barrierId: string, label: string | null) => void
  onSetRelativeEnergyZero: (nodeId: string) => void
  onOpenStructure: (nodeId: string) => void
  onShowNodeSource: (nodeId: string) => void
  onRenameNode: (nodeId: string, label: string) => void
  renameEditingNodeId: string | null
  onRenameRequestHandled: (nodeId: string) => void
  onOpenContextMenu: (request: CanvasContextMenuRequest) => void
  onRawFileDrop: (drop: CanvasRawFileDrop) => void
  editingAnnotationId?: string | null
  onBeginEditAnnotation?: (annotationId: string) => void
  onBeginMoveAnnotation?: (annotationId: string) => void
  onMoveAnnotation?: (annotationId: string, position: Point) => void
  onUpdateTextAnnotation?: (annotationId: string, text: string) => void
  onDeleteAnnotation?: (annotationId: string) => void
}) {
  const energyRowByNodeId = useMemo(
    () => new Map(energyRows.map((row) => [row.nodeId, row])),
    [energyRows],
  )
  const relativeEnergyByNodeId = useMemo<BarrierRelativeEnergyLookup>(
    () => new Map(energyRows.map((row) => [row.nodeId, row.relative])),
    [energyRows],
  )
  const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])
  const selectedEdgeIdSet = useMemo(() => new Set(selectedEdgeIds), [selectedEdgeIds])
  const selectedBarrierIdSet = useMemo(() => new Set(selectedBarrierIds), [selectedBarrierIds])
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const hoveredEdgeIdRef = useRef<string | null>(null)
  const hoveredEdgeClearTimerRef = useRef<number | null>(null)
  const connectedInputNodeIds = useMemo(() => new Set(edges.map((edge) => edge.targetId)), [edges])
  const connectedOutputNodeIds = useMemo(() => new Set(edges.map((edge) => edge.sourceId)), [edges])
  const fileById = useMemo(() => new Map(files.map((file) => [file.id, file])), [files])
  const solvationPairPresenceByGroup = useMemo(() => {
    const groups = new Map<string, SolvationPairPresence>()
    files.forEach((file) => {
      const key = sourceFileDisplayGroupKey(file)
      const presence = groups.get(key) ?? { hasGas: false, hasSolution: false }
      if (sourceFileLooksLikeParsedSolutionLog(file)) {
        presence.hasSolution = true
      } else if (!sourceFileLooksLikeSolutionLog(file) && sourceFileHasUsableParsedData(file)) {
        presence.hasGas = true
      }
      groups.set(key, presence)
    })
    return groups
  }, [files])

  const connectionSnapTargetId = connectionDraft?.snapTargetId ?? null
  const connectionSnapStepRole = connectionDraft?.snapStepRole ?? null
  const stableOnNodePointerDown = useLatestCallback(onNodePointerDown)
  const stableOnNodeResizePointerDown = useLatestCallback(onNodeResizePointerDown)
  const stableOnNodePointerUp = useLatestCallback(onNodePointerUp)
  const stableOnStartConnection = useLatestCallback(onStartConnection)
  const stableOnStartBarrierAnnotation = useLatestCallback(onStartBarrierAnnotation)
  const stableOnStartKeyboardConnection = useLatestCallback(onStartKeyboardConnection)
  const stableOnSelectNode = useLatestCallback(onSelectNode)
  const stableOnSelectEdge = useLatestCallback(onSelectEdge)
  const stableOnSelectBarrier = useLatestCallback(onSelectBarrier)
  const stableOnUpdateEdgeLabel = useLatestCallback(onUpdateEdgeLabel)
  const stableOnUpdateBarrierLabel = useLatestCallback(onUpdateBarrierLabel)
  const stableOnSetRelativeEnergyZero = useLatestCallback(onSetRelativeEnergyZero)
  const stableOnOpenStructure = useLatestCallback(onOpenStructure)
  const stableOnShowNodeSource = useLatestCallback(onShowNodeSource)
  const stableOnRenameNode = useLatestCallback(onRenameNode)
  const stableOnRenameRequestHandled = useLatestCallback(onRenameRequestHandled)
  const stableOnOpenContextMenu = useLatestCallback(onOpenContextMenu)
  const stableOnHoverEdge = useLatestCallback((edgeId: string | null) => {
    if (edgeId) {
      if (hoveredEdgeClearTimerRef.current !== null) {
        window.clearTimeout(hoveredEdgeClearTimerRef.current)
        hoveredEdgeClearTimerRef.current = null
      }
      if (hoveredEdgeIdRef.current !== edgeId) {
        hoveredEdgeIdRef.current = edgeId
        setHoveredEdgeId(edgeId)
      }
      return
    }
    if (hoveredEdgeClearTimerRef.current !== null || hoveredEdgeIdRef.current === null) return
    hoveredEdgeClearTimerRef.current = window.setTimeout(() => {
      hoveredEdgeIdRef.current = null
      setHoveredEdgeId(null)
      hoveredEdgeClearTimerRef.current = null
    }, 180)
  })

  useEffect(() => () => {
    if (hoveredEdgeClearTimerRef.current !== null) {
      window.clearTimeout(hoveredEdgeClearTimerRef.current)
    }
  }, [])

  const currentSelection = (): CanvasContextSelection => ({
    nodeIds: selectedNodeIds,
    edgeIds: selectedEdgeIds,
    barrierIds: selectedBarrierIds,
  })

  const openSelectionContextMenu = (event: Pick<MouseEvent<HTMLElement>, "clientX" | "clientY" | "preventDefault" | "stopPropagation">) => {
    const selection = currentSelection()
    if (selection.nodeIds.length + selection.edgeIds.length + selection.barrierIds.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    stableOnOpenContextMenu({
      x: event.clientX,
      y: event.clientY,
      target: { kind: "selection", selection },
    })
  }

  const handleSurfaceKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      const selection = currentSelection()
      if (selection.nodeIds.length + selection.edgeIds.length + selection.barrierIds.length > 0) {
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        stableOnOpenContextMenu({
          x: rect.left + 42,
          y: rect.top + 42,
          target: { kind: "selection", selection },
        })
      }
      return
    }
    onCanvasKeyDown(event)
  }

  const handleSurfacePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    stableOnHoverEdge(flowEdgeIdFromEventTarget(event.target))
    onPointerMove(event)
  }

  const handleSurfaceMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    stableOnHoverEdge(flowEdgeIdFromEventTarget(event.target))
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!hasCanvasRawFileDrop(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasCanvasRawFileDrop(event.dataTransfer)) return
    event.currentTarget.focus({ preventScroll: true })
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
      className={`canvas-surface ${tool === "pan" ? "is-panning" : tool === "text" ? "is-text-tool" : "is-selecting"}${rubberBandDraft ? " has-rubber-band" : ""}${connectionDraft ? " is-connecting" : ""}${connectionSnapTargetId ? " is-connection-snapped" : ""}`}
      aria-label="Graph canvas surface"
      aria-keyshortcuts="Delete Backspace Escape ArrowUp ArrowDown ArrowLeft ArrowRight Meta+Z Control+Z Control+Y"
      tabIndex={0}
      onPointerDown={onCanvasPointerDown}
      onKeyDown={handleSurfaceKeyDown}
      onPointerMove={handleSurfacePointerMove}
      onMouseMove={handleSurfaceMouseMove}
      onMouseLeave={() => stableOnHoverEdge(null)}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onContextMenu={openSelectionContextMenu}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        className="canvas-world"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        }}
      >
        <svg className="edge-layer" width="1600" height="1000" viewBox="0 0 1600 1000">
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="rgba(82, 103, 122, 0.55)" />
            </marker>
            <marker id="barrier-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 Z" fill="rgba(217, 99, 82, 0.82)" />
            </marker>
          </defs>
          {edges.map((edge) => (
            <ReactionEdge
              key={edge.id}
              edge={edge}
              nodeMap={nodeMap}
              selected={selectedEdgeIdSet.has(edge.id)}
              onSelect={stableOnSelectEdge}
              onHover={stableOnHoverEdge}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                stableOnSelectEdge(edge.id, "replace")
                stableOnOpenContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  target: { kind: "edge", edgeId: edge.id, selection: { nodeIds: [], edgeIds: [edge.id], barrierIds: [] } },
                })
              }}
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
              relativeEnergyByNodeId={relativeEnergyByNodeId}
              selected={selectedBarrierIdSet.has(barrier.id)}
              onSelect={stableOnSelectBarrier}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                stableOnSelectBarrier(barrier.id, "replace")
                stableOnOpenContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  target: { kind: "barrier", barrierId: barrier.id, selection: { nodeIds: [], edgeIds: [], barrierIds: [barrier.id] } },
                })
              }}
            />
          ))}
        </svg>

        {nodes.map((node) => (
          <ReactionNodeCard
            key={node.id}
            node={node}
            coordinatePreview={coordinatePreviewForNode(node, fileById)}
            selected={selectedNodeIdSet.has(node.id)}
            connectionSnapTarget={connectionSnapTargetId === node.id}
            connectionSnapStepRole={connectionSnapTargetId === node.id ? connectionSnapStepRole : null}
            keyboardConnectionActive={node.id === keyboardEdgeSourceId}
            inputConnected={connectedInputNodeIds.has(node.id)}
            outputConnected={connectedOutputNodeIds.has(node.id)}
            relativeEnergy={energyRowByNodeId.get(node.id)?.relative ?? null}
            relativeRole={energyRowByNodeId.get(node.id)?.relativeRole ?? "standalone"}
            solvationStatus={solvationPairStatusForNode(node, fileById, solvationPairPresenceByGroup)}
            energySource={energyDisplayOptions.energySource}
            outputUnit={energyDisplayOptions.outputUnit}
            energyBaseline={node.id === relativeZeroNodeId}
            onPointerDown={stableOnNodePointerDown}
            onResizePointerDown={stableOnNodeResizePointerDown}
            onPointerUp={stableOnNodePointerUp}
            onStartConnection={stableOnStartConnection}
            onStartBarrierAnnotation={stableOnStartBarrierAnnotation}
            onStartKeyboardConnection={stableOnStartKeyboardConnection}
            onSelectNode={stableOnSelectNode}
            onSetRelativeEnergyZero={stableOnSetRelativeEnergyZero}
            onOpenStructure={stableOnOpenStructure}
            onShowNodeSource={stableOnShowNodeSource}
            onRenameNode={stableOnRenameNode}
            renameRequested={renameEditingNodeId === node.id}
            onRenameRequestHandled={stableOnRenameRequestHandled}
            onOpenContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const nodeSelected = selectedNodeIdSet.has(node.id)
              const selection = nodeSelected
                ? currentSelection()
                : { nodeIds: [node.id], edgeIds: [], barrierIds: [] }
              if (!nodeSelected) stableOnSelectNode(node.id, "replace")
              stableOnOpenContextMenu({
                x: event.clientX,
                y: event.clientY,
                target: { kind: "node", nodeId: node.id, selection },
              })
            }}
          />
        ))}
        {edges.map((edge) => (
          <ReactionEdgeLabel
            key={`${edge.id}-label`}
            edge={edge}
            nodeMap={nodeMap}
            selected={selectedEdgeIdSet.has(edge.id)}
            hovered={hoveredEdgeId === edge.id}
            onHover={stableOnHoverEdge}
            onUpdateLabel={stableOnUpdateEdgeLabel}
          />
        ))}
        {barriers.map((barrier) => (
          <BarrierAnnotationLabel
            key={`${barrier.id}-label`}
            barrier={barrier}
            nodeMap={nodeMap}
            energyDisplayOptions={energyDisplayOptions}
            relativeEnergyByNodeId={relativeEnergyByNodeId}
            selected={selectedBarrierIdSet.has(barrier.id)}
            onUpdateLabel={stableOnUpdateBarrierLabel}
          />
        ))}
        {annotations.map((annotation) => (
          <CanvasAnnotationView
            key={annotation.id}
            annotation={annotation}
            editing={annotation.id === editingAnnotationId}
            viewport={viewport}
            onBeginEdit={onBeginEditAnnotation}
            onBeginMove={onBeginMoveAnnotation}
            onMove={onMoveAnnotation}
            onUpdateText={onUpdateTextAnnotation}
            onDelete={onDeleteAnnotation}
            onOpenContextMenu={onOpenContextMenu}
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
        transform: `translate(${rect.x}px, ${rect.y}px)`,
        width: rect.width,
        height: rect.height,
      }}
    />
  )
}

function CanvasAnnotationView({
  annotation,
  editing,
  viewport,
  onBeginEdit,
  onBeginMove,
  onMove,
  onUpdateText,
  onDelete,
  onOpenContextMenu,
}: {
  annotation: CanvasAnnotation
  editing: boolean
  viewport: CanvasViewport
  onBeginEdit: (annotationId: string) => void
  onBeginMove: (annotationId: string) => void
  onMove: (annotationId: string, position: Point) => void
  onUpdateText: (annotationId: string, text: string) => void
  onDelete: (annotationId: string) => void
  onOpenContextMenu: (request: CanvasContextMenuRequest) => void
}) {
  const annotationText = annotation.type === "text" ? annotation.text : ""
  const [textDraft, setTextDraft] = useState(annotationText)
  const [dragging, setDragging] = useState(false)
  const imageDragRef = useRef<{
    pointerId: number
    start: Point
    origin: Point
    moved: boolean
  } | null>(null)
  useEffect(() => {
    if (annotation.type === "text" && !editing) setTextDraft(annotation.text)
  }, [annotation, editing])

  const openAnnotationContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onOpenContextMenu({
      x: event.clientX,
      y: event.clientY,
      target: { kind: "annotation", annotationId: annotation.id },
    })
  }

  if (annotation.type === "image") {
    const startImageDrag = (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      imageDragRef.current = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        origin: annotation.position,
        moved: false,
      }
    }

    const moveImageDrag = (event: PointerEvent<HTMLDivElement>) => {
      const drag = imageDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      const dx = event.clientX - drag.start.x
      const dy = event.clientY - drag.start.y
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 2) return
        drag.moved = true
        setDragging(true)
        onBeginMove(annotation.id)
      }
      onMove(annotation.id, {
        x: drag.origin.x + dx / viewport.zoom,
        y: drag.origin.y + dy / viewport.zoom,
      })
    }

    const endImageDrag = (event: PointerEvent<HTMLDivElement>) => {
      const drag = imageDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      imageDragRef.current = null
      setDragging(false)
    }

    return (
      <div
        className={`canvas-annotation canvas-image-annotation${dragging ? " is-dragging" : ""}`}
        style={{
          transform: `translate(${annotation.position.x}px, ${annotation.position.y}px)`,
          width: annotation.width,
          height: annotation.height,
        }}
        onPointerDown={startImageDrag}
        onPointerMove={moveImageDrag}
        onPointerUp={endImageDrag}
        onPointerCancel={endImageDrag}
        onContextMenu={openAnnotationContextMenu}
      >
        <img src={annotation.dataUrl} alt={annotation.name ?? "Pasted canvas image"} draggable={false} />
      </div>
    )
  }

  const textWidth = canvasTextAnnotationWidth(editing ? textDraft : annotation.text)

  return (
    <div
      className={`canvas-annotation canvas-text-annotation${editing ? " is-editing" : ""}`}
      style={{
        transform: `translate(${annotation.position.x}px, ${annotation.position.y}px)`,
        width: textWidth,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={openAnnotationContextMenu}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onBeginEdit(annotation.id)
      }}
    >
      {editing ? (
        <CanvasTextAnnotationEditor
          annotation={annotation}
          onUpdateText={onUpdateText}
          onDelete={onDelete}
          onDraftChange={setTextDraft}
        />
      ) : (
        <button
          type="button"
          className="canvas-text-annotation-button"
          aria-label={`Edit canvas text ${annotation.text || "empty"}`}
          onClick={(event) => {
            event.stopPropagation()
            onBeginEdit(annotation.id)
          }}
        >
          {annotation.text || "Text"}
        </button>
      )}
    </div>
  )
}

function CanvasTextAnnotationEditor({
  annotation,
  onUpdateText,
  onDelete,
  onDraftChange,
}: {
  annotation: Extract<CanvasAnnotation, { type: "text" }>
  onUpdateText: (annotationId: string, text: string) => void
  onDelete: (annotationId: string) => void
  onDraftChange: (text: string) => void
}) {
  const [value, setValue] = useState(annotation.text)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const finishedRef = useRef(false)

  useEffect(() => {
    setValue(annotation.text)
    onDraftChange(annotation.text)
  }, [annotation.text, onDraftChange])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const finish = (apply: boolean) => {
    if (finishedRef.current) return
    finishedRef.current = true
    const next = apply ? value.trim() : annotation.text.trim()
    if (next) onUpdateText(annotation.id, next)
    else onDelete(annotation.id)
  }

  return (
    <textarea
      ref={inputRef}
      className="canvas-text-annotation-input"
      aria-label="Canvas text"
      value={value}
      placeholder="Type…"
      rows={1}
      onChange={(event) => {
        setValue(event.currentTarget.value)
        onDraftChange(event.currentTarget.value)
      }}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault()
          finish(true)
        }
        if (event.key === "Escape") {
          event.preventDefault()
          finish(false)
        }
      }}
    />
  )
}

const ReactionNodeCard = memo(function ReactionNodeCard({
  node,
  coordinatePreview,
  selected,
  connectionSnapTarget,
  connectionSnapStepRole,
  keyboardConnectionActive,
  inputConnected,
  outputConnected,
  relativeEnergy,
  relativeRole,
  solvationStatus,
  energySource,
  outputUnit,
  energyBaseline,
  onPointerDown,
  onResizePointerDown,
  onPointerUp,
  onStartConnection,
  onStartBarrierAnnotation,
  onStartKeyboardConnection,
  onSelectNode,
  onSetRelativeEnergyZero,
  onOpenStructure,
  onShowNodeSource,
  onRenameNode,
  renameRequested,
  onRenameRequestHandled,
  onOpenContextMenu,
}: {
  node: FlowNode
  coordinatePreview: CoordinatePreview | null
  selected: boolean
  connectionSnapTarget: boolean
  connectionSnapStepRole: Extract<EdgeStepRole, "addition"> | null
  keyboardConnectionActive: boolean
  inputConnected: boolean
  outputConnected: boolean
  relativeEnergy: number | null
  relativeRole: EnergyTableRow["relativeRole"]
  solvationStatus: NodeSolvationStatus
  energySource: EnergyDisplayOptions["energySource"]
  outputUnit: EnergyDisplayOptions["outputUnit"]
  energyBaseline: boolean
  onPointerDown: (event: PointerEvent<HTMLElement>, node: FlowNode) => void
  onResizePointerDown: (event: PointerEvent<HTMLElement>, node: FlowNode) => void
  onPointerUp: (event: PointerEvent<HTMLElement>, targetId: string, targetStepRole?: Extract<EdgeStepRole, "addition">) => void
  onStartConnection: (event: PointerEvent<HTMLElement>, sourceId: string, stepRole?: Extract<EdgeStepRole, "release">) => void
  onStartBarrierAnnotation: (event: PointerEvent<HTMLElement>, sourceId: string) => void
  onStartKeyboardConnection: (sourceId: string) => void
  onSelectNode: (nodeId: string, mode?: GraphSelectionMode) => void
  onSetRelativeEnergyZero: (nodeId: string) => void
  onOpenStructure: (nodeId: string) => void
  onShowNodeSource: (nodeId: string) => void
  onRenameNode: (nodeId: string, label: string) => void
  renameRequested: boolean
  onRenameRequestHandled: (nodeId: string) => void
  onOpenContextMenu: (event: Pick<MouseEvent<HTMLElement>, "clientX" | "clientY" | "preventDefault" | "stopPropagation">) => void
}) {
  const coefficientValue = nodeCoefficient(node)
  const [renameEditing, setRenameEditing] = useState(false)
  const [renameDraft, setRenameDraft] = useState(node.label)
  const sourceStatusLabel = nodeFooterText(node)
  const solvationStatusLabel = solvationPairStatusLabel(solvationStatus)
  const nodeStatusLight = solvationStatus === "missing-solution" || solvationStatus === "missing-gas" ? "missing" : (node.sourceStatus ?? solvationStatus)
  const relativeEnergySymbol = energySource === "solution" ? "ΔG" : "ΔE"
  const cardSize = flowNodeSize(node)
  const relativeEnergyLabel = formatNodeCardRelativeEnergy(relativeEnergy, outputUnit)
  const hideRelativeEnergy = relativeRole === "addition-term" || relativeRole === "release-term"
  const showStepConnectors = node.pathRole !== "participant"
  const cardWidth = cardSize.width
  const previewSize = {
    width: Math.max(128, cardWidth - 28),
    height: Math.max(72, cardSize.height - 100),
  }
  const titleLabelWidth = autoTextBoxWidthForValue(renameEditing ? renameDraft : node.label, {
    placeholder: node.label || "Node",
    min: 24,
    max: Math.max(24, cardWidth - 72),
    padding: renameEditing ? 18 : 6,
  })

  useEffect(() => {
    if (!renameRequested) return
    setRenameEditing(true)
    onRenameRequestHandled(node.id)
  }, [node.id, onRenameRequestHandled, renameRequested])

  useEffect(() => {
    if (!renameEditing) setRenameDraft(node.label)
  }, [node.label, renameEditing])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      onOpenContextMenu({
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + 34,
        preventDefault: () => {},
        stopPropagation: () => {},
      })
      return
    }
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
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      className={`reaction-node node-${node.kind}${node.pathRole === "participant" ? " node-participant" : ""}${selected ? " is-selected" : ""}${connectionSnapTarget ? (connectionSnapStepRole === "addition" ? " is-connection-snap-target-addition" : " is-connection-snap-target") : ""}${inputConnected ? " has-input-edge" : ""}${outputConnected ? " has-output-edge" : ""}`}
      aria-label={`Node ${node.label}`}
      data-flow-node-id={node.id}
      style={{
        transform: `translate(${node.position.x}px, ${node.position.y}px)`,
        width: cardWidth,
        height: cardSize.height,
      }}
      onPointerDown={(event) => onPointerDown(event, node)}
      onPointerUp={(event) => onPointerUp(event, node.id)}
      onContextMenu={onOpenContextMenu}
      onKeyDown={handleKeyDown}
    >
      <span
        className="node-connector node-connector-in"
        aria-hidden="true"
      />
      {showStepConnectors ? (
        <span
          role="button"
          tabIndex={0}
          className="node-connector node-step-connector node-step-connector-addition"
          style={{ top: `calc(50% - ${stepConnectorOffsetY}px)` }}
          aria-label={`Add species before ${node.label}`}
          title={`Add species before ${node.label}`}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => {
            event.stopPropagation()
            onPointerUp(event, node.id, "addition")
          }}
          onKeyDown={(event) => event.stopPropagation()}
        />
      ) : null}
      <div className="node-header">
        <div className="node-header-main">
          {renameEditing ? (
            <input
              className="node-title-input"
              aria-label={`Rename ${node.label}`}
              value={renameDraft}
              style={{ width: titleLabelWidth }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setRenameDraft(event.currentTarget.value)}
              onBlur={() => {
                const next = renameDraft.trim()
                setRenameEditing(false)
                if (next && next !== node.label) onRenameNode(node.id, next)
                else setRenameDraft(node.label)
              }}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === "Enter") event.currentTarget.blur()
                if (event.key === "Escape") {
                  setRenameDraft(node.label)
                  setRenameEditing(false)
                }
              }}
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="node-title-button"
              aria-label={`Rename ${node.label}`}
              title="Rename node label"
              style={{ width: titleLabelWidth }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                setRenameEditing(true)
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {node.label}
            </button>
          )}
        </div>
      </div>
      <NodeStructurePreview
        node={node}
        coordinatePreview={coordinatePreview}
        previewSize={previewSize}
        onOpenStructure={onOpenStructure}
      />
      {nodeStatusLight === "missing" ? (
        <span
          className="status-light status-light-node status-light-missing node-status-light-corner"
          title={`${sourceStatusLabel}. ${solvationStatusLabel}`}
          aria-label={`${sourceStatusLabel}. ${solvationStatusLabel}`}
        />
      ) : null}
      {coefficientValue !== 1 ? <span className="node-stoichiometry-label">{formatCoefficientValue(coefficientValue)}x</span> : null}
      {!hideRelativeEnergy ? (
        <div className="node-energy-strip node-card-meta-row" title={nodeEnergyStripTitle(relativeEnergySymbol, relativeRole)}>
          <span className="node-card-energy-value">
            <span>{relativeEnergySymbol}</span>
            <strong className={energyBaseline ? "node-relative-energy is-zero" : "node-relative-energy"}>
              {relativeEnergyLabel}
            </strong>
          </span>
        </div>
      ) : null}
      <span
        role="button"
        tabIndex={0}
        className={`node-connector node-connector-out${keyboardConnectionActive ? " is-keyboard-active" : ""}`}
        aria-label={`Start edge from ${node.label}`}
        title={`Start edge from ${node.label}`}
        aria-pressed={keyboardConnectionActive}
        onPointerDown={(event) => onStartConnection(event, node.id)}
        onKeyDown={handleConnectorKeyDown}
      />
      {showStepConnectors ? (
        <span
          role="button"
          tabIndex={0}
          className="node-connector node-step-connector node-step-connector-release"
          style={{ top: `calc(50% - ${stepConnectorOffsetY}px)` }}
          aria-label={`Release species after ${node.label}`}
          title={`Release species after ${node.label}`}
          onPointerDown={(event) => onStartConnection(event, node.id, "release")}
          onKeyDown={(event) => event.stopPropagation()}
        />
      ) : null}
      <button
        type="button"
        className="node-barrier-handle"
        aria-label={`Drag barrier annotation from ${node.label}`}
        title={`Drag barrier annotation from ${node.label}`}
        onPointerDown={(event) => onStartBarrierAnnotation(event, node.id)}
        onClick={(event) => event.stopPropagation()}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path className="barrier-activation-axis" d="M3.5 17.4 H20.5" />
          <path className="barrier-activation-icon" d="M4.2 16.7 C7.2 16.7 7.4 7.1 11.8 7.1 C16.1 7.1 16.5 16.7 19.8 16.7" />
        </svg>
      </button>
      <button
        type="button"
        className="node-resize-handle"
        aria-label={`Resize node ${node.label}`}
        title={`Resize node ${node.label}`}
        onPointerDown={(event) => onResizePointerDown(event, node)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      />
    </div>
  )
}, areReactionNodeCardPropsEqual)

function formatNodeCardRelativeEnergy(value: number | null, unit: EnergyDisplayOptions["outputUnit"]): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "pending"
  return formatRelativeEnergyValue(relativeEnergyValueFromKcal(value, unit), unit)
}

function nodeEnergyStripTitle(symbol: string, role: EnergyTableRow["relativeRole"]): string {
  if (role === "addition-term") return "Added reactant term used in the path energy expression"
  if (role === "release-term") return "Released product term used in the path energy expression"
  return `${symbol} relative energy`
}

function nodeTermRoleLabel(role: EnergyTableRow["relativeRole"]): "addition" | "release" | null {
  if (role === "addition-term") return "addition"
  if (role === "release-term") return "release"
  return null
}

function NodeStructurePreview({
  node,
  coordinatePreview,
  previewSize,
  onOpenStructure,
}: {
  node: FlowNode
  coordinatePreview: CoordinatePreview | null
  previewSize: { width: number; height: number }
  onOpenStructure: (nodeId: string) => void
}) {
  const atoms = coordinatePreview?.atoms ?? []
  const openStructureButton = (
    <button
      type="button"
      className="node-structure-fullscreen"
      aria-label={`Open 3D Structure for ${node.label}`}
      title={`Open 3D Structure for ${node.label}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onOpenStructure(node.id)
      }}
    >
      <Maximize2 size={13} aria-hidden="true" />
    </button>
  )
  if (atoms.length === 0 && !node.manualStructureMolfile) {
    return (
      <div
        className="node-structure-preview node-structure-preview-empty"
        role="group"
        aria-label={`${node.label} formula-only structure preview`}
        style={{ height: previewSize.height }}
      >
        {openStructureButton}
        <strong>2D pending</strong>
        <span>No layout</span>
        <span className="node-qm-badge">{formatChargeMultiplicityBadge(node)}</span>
      </div>
    )
  }

  return (
    <div className="node-structure-preview node-structure-preview-shell" style={{ height: previewSize.height }}>
      <Molecule2DDepiction
        atoms={atoms}
        formula={node.formula}
        manualMolfile={node.manualStructureMolfile}
        label={node.label}
        width={previewSize.width}
        height={previewSize.height}
        className="node-structure-preview-art node-structure-2d"
        emptyText="2D depiction pending"
      />
      {openStructureButton}
      <span className="node-qm-badge">{formatChargeMultiplicityBadge(node)}</span>
    </div>
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

type ReactionNodeCardComparableProps = {
  node: FlowNode
  coordinatePreview: CoordinatePreview | null
  selected: boolean
  connectionSnapTarget: boolean
  connectionSnapStepRole: Extract<EdgeStepRole, "addition"> | null
  keyboardConnectionActive: boolean
  inputConnected: boolean
  outputConnected: boolean
  relativeEnergy: number | null
  relativeRole: EnergyTableRow["relativeRole"]
  solvationStatus: NodeSolvationStatus
  energySource: EnergyDisplayOptions["energySource"]
  outputUnit: EnergyDisplayOptions["outputUnit"]
  energyBaseline: boolean
  renameRequested: boolean
}

function areReactionNodeCardPropsEqual(
  previous: ReactionNodeCardComparableProps,
  next: ReactionNodeCardComparableProps,
): boolean {
  return previous.node === next.node
    && previous.coordinatePreview === next.coordinatePreview
    && previous.selected === next.selected
    && previous.connectionSnapTarget === next.connectionSnapTarget
    && previous.connectionSnapStepRole === next.connectionSnapStepRole
    && previous.keyboardConnectionActive === next.keyboardConnectionActive
    && previous.inputConnected === next.inputConnected
    && previous.outputConnected === next.outputConnected
    && Object.is(previous.relativeEnergy, next.relativeEnergy)
    && previous.relativeRole === next.relativeRole
    && previous.solvationStatus === next.solvationStatus
    && previous.energySource === next.energySource
    && previous.outputUnit === next.outputUnit
    && previous.energyBaseline === next.energyBaseline
    && previous.renameRequested === next.renameRequested
}

type EdgeComparableProps = {
  edge: FlowEdge
  nodeMap: Map<string, FlowNode>
  selected: boolean
}

type EdgeLabelComparableProps = EdgeComparableProps & {
  hovered: boolean
}

function areReactionEdgePropsEqual(previous: EdgeComparableProps, next: EdgeComparableProps): boolean {
  return previous.edge === next.edge
    && previous.selected === next.selected
    && previous.nodeMap.get(previous.edge.sourceId) === next.nodeMap.get(next.edge.sourceId)
    && previous.nodeMap.get(previous.edge.targetId) === next.nodeMap.get(next.edge.targetId)
}

function areReactionEdgeLabelPropsEqual(previous: EdgeLabelComparableProps, next: EdgeLabelComparableProps): boolean {
  return areReactionEdgePropsEqual(previous, next)
    && previous.hovered === next.hovered
}

type BarrierComparableProps = {
  barrier: FlowBarrier
  nodeMap: Map<string, FlowNode>
  energyDisplayOptions: EnergyDisplayOptions
  relativeEnergyByNodeId: BarrierRelativeEnergyLookup
  selected: boolean
}

function areBarrierAnnotationPropsEqual(previous: BarrierComparableProps, next: BarrierComparableProps): boolean {
  return previous.barrier === next.barrier
    && previous.selected === next.selected
    && previous.energyDisplayOptions === next.energyDisplayOptions
    && previous.relativeEnergyByNodeId === next.relativeEnergyByNodeId
    && previous.nodeMap.get(previous.barrier.sourceId) === next.nodeMap.get(next.barrier.sourceId)
    && previous.nodeMap.get(previous.barrier.targetId) === next.nodeMap.get(next.barrier.targetId)
}

function areBarrierAnnotationLabelPropsEqual(previous: BarrierComparableProps, next: BarrierComparableProps): boolean {
  return areBarrierAnnotationPropsEqual(previous, next)
}

const ReactionEdge = memo(function ReactionEdge({
  edge,
  nodeMap,
  selected,
  onSelect,
  onHover,
  onContextMenu,
}: {
  edge: FlowEdge
  nodeMap: Map<string, FlowNode>
  selected: boolean
  onSelect: (edgeId: string, mode?: GraphSelectionMode) => void
  onHover: (edgeId: string | null) => void
  onContextMenu: (event: MouseEvent<SVGGElement>) => void
}) {
  const source = nodeMap.get(edge.sourceId)
  const target = nodeMap.get(edge.targetId)
  if (!source || !target) return null
  const segment = createEdgeSegment(source, target, edge.stepRole)
  const visibleRoleLabel = edgeStepRoleVisibleLabel(edge.stepRole)
  const roleLabel = visibleRoleLabel ? `${visibleRoleLabel} ` : ""

  return (
    <g
      className={`edge edge-role-${edge.stepRole ?? "path"}${selected ? " is-selected" : ""}`}
      data-flow-edge-id={edge.id}
      data-flow-edge-source-id={edge.sourceId}
      data-flow-edge-target-id={edge.targetId}
      role="button"
      tabIndex={0}
      aria-label={`Edge ${source.label} to ${target.label}: ${roleLabel}${edge.label}`}
      onPointerEnter={() => onHover(edge.id)}
      onPointerLeave={() => onHover(null)}
      onMouseEnter={() => onHover(edge.id)}
      onMouseLeave={() => onHover(null)}
      onContextMenu={onContextMenu}
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
      <path
        className="edge-hit-path"
        d={segment.path}
        onPointerDown={(event) => {
          event.stopPropagation()
          onSelect(edge.id, selectionModeFromKeyboardOrPointer(event))
        }}
      />
      <path className="edge-visible-path" d={segment.path} markerEnd="url(#arrow)" />
    </g>
  )
}, areReactionEdgePropsEqual)

const ReactionEdgeLabel = memo(function ReactionEdgeLabel({
  edge,
  nodeMap,
  selected,
  hovered,
  onHover,
  onUpdateLabel,
}: {
  edge: FlowEdge
  nodeMap: Map<string, FlowNode>
  selected: boolean
  hovered: boolean
  onHover: (edgeId: string | null) => void
  onUpdateLabel: (edgeId: string, label: string) => void
}) {
  const [editingLabel, setEditingLabel] = useState(false)
  const [draftLabel, setDraftLabel] = useState("")
  const displayLabel = edge.label.trim() === "path" ? edgeStepRoleVisibleLabel(edge.stepRole) : edge.label.trim()
  const labelText = displayLabel || "Add label"
  const widthHasLabel = editingLabel ? draftLabel.trim().length > 0 : Boolean(displayLabel)
  const widthText = editingLabel ? draftLabel : labelText
  const labelWidth = autoTextBoxWidthForValue(widthText, {
    placeholder: "Add label",
    min: widthHasLabel ? 54 : 78,
    max: 190,
    padding: widthHasLabel ? 26 : 30,
  })
  const applyLabel = (label: string) => onUpdateLabel(edge.id, label.trim() || "path")

  useEffect(() => {
    if (!editingLabel) setDraftLabel(displayLabel)
  }, [displayLabel, editingLabel])

  const source = nodeMap.get(edge.sourceId)
  const target = nodeMap.get(edge.targetId)
  if (!source || !target) return null
  const segment = createEdgeSegment(source, target, edge.stepRole)

  return (
    <div
      className={`canvas-label-anchor edge-label-anchor${selected ? " is-selected" : ""}${hovered ? " is-hovered" : ""}${editingLabel ? " is-editing" : ""}${displayLabel ? "" : " is-empty"}`}
      data-flow-edge-label-id={edge.id}
      data-flow-edge-id={edge.id}
      style={{
        transform: `translate(${segment.labelPoint.x - labelWidth / 2}px, ${segment.labelPoint.y - 16}px)`,
        width: labelWidth,
        height: 32,
      }}
      onPointerEnter={() => onHover(edge.id)}
      onPointerLeave={() => onHover(null)}
      onMouseEnter={() => onHover(edge.id)}
      onMouseLeave={() => onHover(null)}
    >
      {editingLabel ? (
        <EdgeInlineLabelEditor
          label={displayLabel}
          onValueChange={setDraftLabel}
          onApply={applyLabel}
          onDone={() => setEditingLabel(false)}
        />
      ) : displayLabel ? (
        <button
          type="button"
          className="edge-label"
          aria-label={`Edit path label ${displayLabel}`}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
            setEditingLabel(true)
          }}
        >
          {displayLabel}
        </button>
      ) : (
        <button
          type="button"
          className="edge-label edge-label-add"
          aria-label={`Add path label from ${source.label} to ${target.label}`}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
            setEditingLabel(true)
          }}
        >
          Add label
        </button>
      )}
    </div>
  )
}, areReactionEdgeLabelPropsEqual)

function EdgeInlineLabelEditor({ label, onValueChange, onApply, onDone }: {
  label: string
  onValueChange: (label: string) => void
  onApply: (label: string) => void
  onDone: () => void
}) {
  const [value, setValue] = useState(label)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const finishedRef = useRef(false)

  useEffect(() => {
    setValue(label)
    onValueChange(label)
  }, [label, onValueChange])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const finish = (apply: boolean) => {
    if (finishedRef.current) return
    finishedRef.current = true
    if (apply) onApply(value)
    onDone()
  }

  return (
    <form
      className="edge-label-editor"
      aria-label="Edit path label"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        finish(true)
      }}
    >
      <input
        ref={inputRef}
        aria-label="Path label"
        value={value}
        placeholder="Add label"
        onChange={(event) => {
          setValue(event.currentTarget.value)
          onValueChange(event.currentTarget.value)
        }}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === "Enter") {
            event.preventDefault()
            finish(true)
          }
          if (event.key === "Escape") {
            event.preventDefault()
            finish(false)
          }
        }}
      />
    </form>
  )
}

function ConnectionPreview({ draft, nodeMap }: { draft: ConnectionDraft; nodeMap: Map<string, FlowNode> }) {
  const source = nodeMap.get(draft.sourceId)
  if (!source) return null
  const visibleStepRole = draft.snapStepRole ?? draft.stepRole
  return (
    <>
      <path
        className={[
          "connection-preview-path",
          visibleStepRole ? `is-${visibleStepRole}` : "",
          draft.snapTargetId ? "is-snapped" : "",
        ].filter(Boolean).join(" ")}
        d={createConnectionPreviewPath(source, draft.current, draft.stepRole)}
      />
      {draft.snapTargetId ? (
        <circle
          className="connection-preview-snap-halo"
          cx={draft.current.x}
          cy={draft.current.y}
          r="17"
        />
      ) : null}
    </>
  )
}

function BarrierDraftPreview({ draft, nodeMap }: { draft: BarrierDraft; nodeMap: Map<string, FlowNode> }) {
  const source = nodeMap.get(draft.sourceId)
  if (!source) return null
  return <path className="barrier-preview-path" d={createBarrierDraftPreviewPath(source, draft.current)} />
}

const BarrierAnnotation = memo(function BarrierAnnotation({
  barrier,
  nodeMap,
  energyDisplayOptions,
  relativeEnergyByNodeId,
  selected,
  onSelect,
  onContextMenu,
}: {
  barrier: FlowBarrier
  nodeMap: Map<string, FlowNode>
  energyDisplayOptions: EnergyDisplayOptions
  relativeEnergyByNodeId: BarrierRelativeEnergyLookup
  selected: boolean
  onSelect: (barrierId: string, mode?: GraphSelectionMode) => void
  onContextMenu: (event: MouseEvent<SVGGElement>) => void
}) {
  const segment = createBarrierSegment(barrier, nodeMap, energyDisplayOptions, relativeEnergyByNodeId)
  if (!segment) return null

  const selectBarrier = (mode: GraphSelectionMode = "replace") => onSelect(barrier.id, mode)
  return (
    <g
      className={`barrier-annotation${selected ? " is-selected" : ""}`}
      data-flow-barrier-id={barrier.id}
      data-flow-barrier-source-id={barrier.sourceId}
      data-flow-barrier-target-id={barrier.targetId}
      role="button"
      tabIndex={0}
      aria-label={`Barrier annotation from ${segment.sourceLabel} to ${segment.targetLabel}: ${segment.label}`}
      onContextMenu={onContextMenu}
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
      <path
        className="barrier-hit-path"
        d={segment.arrowPath}
        onPointerDown={(event) => {
          event.stopPropagation()
          selectBarrier(selectionModeFromKeyboardOrPointer(event))
        }}
      />
      <path className="barrier-guide" d={segment.guidePath} />
      <path className="barrier-arrow" d={segment.arrowPath} markerStart="url(#barrier-arrow)" markerEnd="url(#barrier-arrow)" />
    </g>
  )
}, areBarrierAnnotationPropsEqual)

const BarrierAnnotationLabel = memo(function BarrierAnnotationLabel({
  barrier,
  nodeMap,
  energyDisplayOptions,
  relativeEnergyByNodeId,
  selected,
  onUpdateLabel,
}: {
  barrier: FlowBarrier
  nodeMap: Map<string, FlowNode>
  energyDisplayOptions: EnergyDisplayOptions
  relativeEnergyByNodeId: BarrierRelativeEnergyLookup
  selected: boolean
  onUpdateLabel: (barrierId: string, label: string | null) => void
}) {
  const [editingLabel, setEditingLabel] = useState(false)
  const [draftLabel, setDraftLabel] = useState("")
  const segment = createBarrierSegment(barrier, nodeMap, energyDisplayOptions, relativeEnergyByNodeId)
  const displayLabel = segment?.label ?? ""
  const widthText = editingLabel ? draftLabel : displayLabel
  const labelWidth = autoTextBoxWidthForValue(widthText, {
    placeholder: segment?.defaultLabel ?? "Barrier",
    min: 86,
    max: 220,
    padding: 34,
  })

  useEffect(() => {
    if (!editingLabel) setDraftLabel(displayLabel)
  }, [displayLabel, editingLabel])

  if (!segment) return null

  const applyLabel = (label: string | null) => onUpdateLabel(barrier.id, label)
  return (
    <div
      className={`canvas-label-anchor barrier-label-anchor${selected ? " is-selected" : ""}`}
      data-flow-barrier-label-id={barrier.id}
      style={{
        transform: `translate(${segment.labelPoint.x - labelWidth / 2}px, ${segment.labelPoint.y - 20}px)`,
        width: labelWidth,
        height: 40,
      }}
    >
      {editingLabel ? (
        <BarrierInlineLabelEditor
          segment={segment}
          onValueChange={setDraftLabel}
          onApply={applyLabel}
          onDone={() => setEditingLabel(false)}
        />
      ) : (
        <button
          type="button"
          className="barrier-label-button"
          aria-label={`Edit barrier label from ${segment.sourceLabel} to ${segment.targetLabel}`}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
            setEditingLabel(true)
          }}
        >
          {segment.label}
        </button>
      )}
    </div>
  )
}, areBarrierAnnotationLabelPropsEqual)

function BarrierInlineLabelEditor({ segment, onValueChange, onApply, onDone }: {
  segment: BarrierSegment
  onValueChange: (label: string) => void
  onApply: (label: string | null) => void
  onDone: () => void
}) {
  const [value, setValue] = useState(segment.label)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const finishedRef = useRef(false)

  useEffect(() => {
    setValue(segment.label)
    onValueChange(segment.label)
  }, [onValueChange, segment.id, segment.label])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [segment.id])

  const finish = (apply: boolean) => {
    if (finishedRef.current) return
    finishedRef.current = true
    if (!apply) {
      onDone()
      return
    }
    const trimmed = value.trim()
    onApply(trimmed && trimmed !== segment.defaultLabel ? trimmed : null)
    onDone()
  }

  return (
    <form
      className="barrier-label-editor"
      aria-label="Edit barrier label"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        finish(true)
      }}
    >
      <input
        ref={inputRef}
        aria-label="Barrier label"
        value={value}
        placeholder={segment.defaultLabel}
        onChange={(event) => {
          setValue(event.currentTarget.value)
          onValueChange(event.currentTarget.value)
        }}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === "Enter") {
            event.preventDefault()
            finish(true)
          }
          if (event.key === "Escape") {
            event.preventDefault()
            finish(false)
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
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  nodes: FlowNode[]
  selectedNodeIds: string[]
  viewport: CanvasViewport
  canvasRef: React.RefObject<HTMLDivElement | null>
  onViewportChange: (viewport: CanvasViewport) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}) {
  const [canvasSize, setCanvasSize] = useState<SurfaceSize>(fallbackCanvasSize)
  const [draftViewport, setDraftViewport] = useState<CanvasViewport | null>(null)
  const dragGeometryRef = useRef<MinimapGeometry | null>(null)
  const dragCanvasSizeRef = useRef<SurfaceSize>(fallbackCanvasSize)
  const dragViewportRef = useRef<CanvasViewport | null>(null)
  const dragWindowOffsetRef = useRef<Point | null>(null)
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

  const minimapRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const minimap = minimapRef.current
    if (!minimap) return () => undefined

    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const liveCanvasSize = surfaceSizeFromElement(canvasRef.current, canvasSize)
      setCanvasSize(liveCanvasSize)
      onViewportChange(viewportFromCanvasWheel(
        viewport,
        { x: 0, y: 0 },
        { x: liveCanvasSize.width / 2, y: liveCanvasSize.height / 2 },
        { x: event.deltaX, y: event.deltaY },
        event.ctrlKey || event.metaKey,
      ))
    }

    minimap.addEventListener("wheel", handleWheel, { passive: false })
    return () => minimap.removeEventListener("wheel", handleWheel)
  }, [canvasRef, canvasSize, onViewportChange, setCanvasSize, viewport])

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
  const pointInsideWindow = (point: Point, windowRect: MinimapGeometry["viewportWindow"]) => (
    point.x >= windowRect.left
    && point.x <= windowRect.left + windowRect.width
    && point.y >= windowRect.top
    && point.y <= windowRect.top + windowRect.height
  )
  const windowCenter = (windowRect: MinimapGeometry["viewportWindow"]): Point => ({
    x: windowRect.left + windowRect.width / 2,
    y: windowRect.top + windowRect.height / 2,
  })
  const previewFromPoint = (
    point: Point,
    sourceGeometry: MinimapGeometry,
    sourceViewport: CanvasViewport,
    sourceCanvasSize: SurfaceSize,
  ) => {
    const offset = dragWindowOffsetRef.current ?? { x: 0, y: 0 }
    return viewportFromMinimapPoint(
      { x: point.x - offset.x, y: point.y - offset.y },
      sourceGeometry,
      sourceViewport,
      sourceCanvasSize,
    )
  }
  const beginDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const liveCanvasSize = surfaceSizeFromElement(canvasRef.current, canvasSize)
    const liveGeometry = createMinimapGeometry(nodes, viewport, liveCanvasSize, minimapSize)
    const point = pointFromEvent(event)
    const center = windowCenter(liveGeometry.viewportWindow)
    dragWindowOffsetRef.current = pointInsideWindow(point, liveGeometry.viewportWindow)
      ? { x: point.x - center.x, y: point.y - center.y }
      : null
    dragGeometryRef.current = liveGeometry
    dragCanvasSizeRef.current = liveCanvasSize
    dragViewportRef.current = viewport
    setCanvasSize(liveCanvasSize)
    setDraftViewport(previewFromPoint(point, liveGeometry, viewport, liveCanvasSize))
    safeSetPointerCapture(event.currentTarget, event.pointerId)
  }
  const updateDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const dragGeometry = dragGeometryRef.current
    const dragViewport = dragViewportRef.current
    if (!dragGeometry || !dragViewport) return
    event.preventDefault()
    event.stopPropagation()
    const nextViewport = previewFromPoint(pointFromEvent(event), dragGeometry, dragViewport, dragCanvasSizeRef.current)
    setDraftViewport(nextViewport)
    onViewportChange(nextViewport)
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
    dragWindowOffsetRef.current = null
    setDraftViewport(null)
    onViewportChange(nextViewport)
    safeReleasePointerCapture(event.currentTarget, event.pointerId)
  }
  const cancelDrag = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    dragGeometryRef.current = null
    dragViewportRef.current = null
    dragWindowOffsetRef.current = null
    setDraftViewport(null)
  }
  return (
    <div className="minimap-stack">
      <button
        ref={minimapRef}
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
      <ZoomControls zoom={viewport.zoom} onZoomIn={onZoomIn} onZoomOut={onZoomOut} onReset={onReset} />
    </div>
  )
}

type NodeSolvationStatus = "paired" | "missing-solution" | "missing-gas" | "unknown"

type SolvationPairPresence = {
  hasGas: boolean
  hasSolution: boolean
}

function edgeStepRoleVisibleLabel(role: FlowEdge["stepRole"]): string {
  if (role === "addition") return "Addition"
  if (role === "release") return "Release"
  return ""
}

function formatChargeMultiplicityBadge(node: FlowNode): string {
  const charge = typeof node.charge === "number" ? node.charge : "—"
  const multiplicity = typeof node.spinMultiplicity === "number" ? node.spinMultiplicity : "—"
  return `${charge},${multiplicity}`
}

function solvationPairStatusForNode(
  node: FlowNode,
  fileById: Map<string, SourceFile>,
  solvationPairPresenceByGroup: Map<string, SolvationPairPresence>,
): NodeSolvationStatus {
  if (!node.sourceFileId) return "unknown"
  const file = fileById.get(node.sourceFileId)
  if (!file) return "unknown"
  const presence = solvationPairPresenceByGroup.get(sourceFileDisplayGroupKey(file)) ?? { hasGas: false, hasSolution: false }
  if (sourceFileLooksLikeParsedSolutionLog(file)) return presence.hasGas ? "paired" : "missing-gas"
  if (sourceFileLooksLikeSolutionLog(file)) return "unknown"
  if (file.kind !== "Gaussian" && file.kind !== "ORCA" && file.kind !== "MAPLE") return "unknown"
  return presence.hasSolution ? "paired" : "missing-solution"
}

function solvationPairStatusLabel(status: NodeSolvationStatus): string {
  if (status === "paired") return "Solvation log paired"
  if (status === "missing-gas") return "No paired gas log"
  if (status === "missing-solution") return "No paired solvation log"
  return "Solvation pairing not available"
}

function safeSetPointerCapture(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture?.(pointerId)
  } catch {
    // Synthetic browser smoke events may not create a native active pointer.
  }
}

function safeReleasePointerCapture(element: Element, pointerId: number): void {
  try {
    element.releasePointerCapture?.(pointerId)
  } catch {
    // Ignore stale/synthetic pointer ids; viewport commit already happened.
  }
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

function flowEdgeIdFromEventTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLElement | SVGGElement>(".edge, .edge-label-anchor")?.dataset.flowEdgeId ?? null
}

function useLatestCallback<TCallback extends (...args: never[]) => unknown>(callback: TCallback): TCallback {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  return useMemo(
    () => ((...args: Parameters<TCallback>) => callbackRef.current(...args)) as TCallback,
    [],
  )
}

function hasCanvasRawFileDrop(dataTransfer: DataTransfer): boolean {
  const types = dataTransferTypes(dataTransfer)
  return types.includes(projectFileDragMimeType) || dataTransferHasFiles(dataTransfer) || filesFromDataTransfer(dataTransfer).length > 0
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
      <button type="button" onClick={onReset} aria-label="Reset canvas view" title="Reset canvas view">
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
