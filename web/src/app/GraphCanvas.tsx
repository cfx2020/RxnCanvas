import { useRef } from "react"
import type { DragEvent, PointerEvent } from "react"
import { Check, GitBranch, Hand, Link2, Maximize2, MousePointer2, Plus, RotateCcw, Route, Trash2, ZoomIn, ZoomOut } from "lucide-react"
import type { ShellError } from "../shell"
import type { GraphEdgeSummary, GraphNodeSummary, GraphPathSummary, ObjectSummary, WorkbenchDomainState } from "./workbenchState"
import type { CanvasPoint, GraphEditorInteractionState } from "./graphEditorInteractionState"
import { graphObjectDragMimeType, parseGraphObjectDragPayload } from "./graphObjectDragPayload"
import {
  canvasPointToGraphNodePosition,
  graphNodeCssPosition,
  graphNodeLayoutBounds,
  graphNodePosition,
  moveGraphNodePosition,
  type GraphNodeLayoutPosition,
} from "./graphNodeLayout"
import {
  fitGraphViewportToNodes,
  graphViewportCssTransform,
  normalizeGraphViewport,
  panGraphViewport,
  resetGraphViewport,
  screenPointToGraphPoint,
  zoomGraphViewport,
  type GraphSurfaceSize,
  type GraphViewport,
} from "./graphViewport"
import type { GraphPathOrderDraft } from "./graphPathOrderDraft"
import type { CompositionDraftRow, CompositionDraftState } from "./compositionDraftState"
import { useI18n } from "./i18n"

export type AddObjectNodeRequest = {
  objectId?: string
  position?: [number, number]
}

export type MoveGraphNodeRequest = {
  nodeId: string
  position: [number, number]
}

export type RemoveGraphItemsRequest = {
  nodeIds: string[]
  edgeIds: string[]
}

type GraphCanvasProps = {
  state: WorkbenchDomainState
  activeObjectId?: string
  interactionState: GraphEditorInteractionState
  pathOrderDraft: GraphPathOrderDraft | null
  compositionDraft: CompositionDraftState
  compositionPending: boolean
  compositionError: ShellError | null
  onSelectNode: (nodeId: string) => void
  onSelectEdge: (edgeId: string) => void
  onSelectPath: (pathId: string, nodeIds: string[]) => void
  onMovePathDraftNode: (nodeId: string, direction: "up" | "down") => void
  onApplyPathOrderDraft: () => void
  onStartNodeDrag: (nodeId: string, origin: CanvasPoint) => void
  onUpdateNodeDrag: (current: CanvasPoint) => void
  onEndNodeDrag: () => void
  onStartCanvasDrag: (origin: CanvasPoint) => void
  onUpdateCanvasDrag: (current: CanvasPoint) => void
  onEndCanvasDrag: () => void
  onOpenWorkspace: () => void
  onAddObjectNode: (request?: AddObjectNodeRequest) => void
  onMoveNode: (request: MoveGraphNodeRequest) => void
  onRemoveGraphItems: (request: RemoveGraphItemsRequest) => void
  onSetViewport: (viewport: GraphViewport) => void
  onTogglePanMode: () => void
  onStartConnection: () => void
  onSetActivePath: () => void
  onCompositionDraftRowChange: (index: number, field: keyof CompositionDraftRow, value: string) => void
  onAddCompositionDraftRow: () => void
  onRemoveCompositionDraftRow: (index: number) => void
  onResetCompositionDraft: () => void
  onApplyCompositionDraft: () => void
}

export function GraphCanvas({
  state,
  activeObjectId,
  interactionState,
  pathOrderDraft,
  compositionDraft,
  compositionPending,
  compositionError,
  onSelectNode,
  onSelectEdge,
  onSelectPath,
  onMovePathDraftNode,
  onApplyPathOrderDraft,
  onStartNodeDrag,
  onUpdateNodeDrag,
  onEndNodeDrag,
  onStartCanvasDrag,
  onUpdateCanvasDrag,
  onEndCanvasDrag,
  onOpenWorkspace,
  onAddObjectNode,
  onMoveNode,
  onRemoveGraphItems,
  onSetViewport,
  onTogglePanMode,
  onStartConnection,
  onSetActivePath,
  onCompositionDraftRowChange,
  onAddCompositionDraftRow,
  onRemoveCompositionDraftRow,
  onResetCompositionDraft,
  onApplyCompositionDraft,
}: GraphCanvasProps) {
  const { t } = useI18n()
  const nodeDragRef = useRef<NodeDragSession | null>(null)
  const canvasDragRef = useRef<CanvasDragSession | null>(null)
  const ignoreNextNodeClickRef = useRef<string | null>(null)
  const workspace = state.workspace
  const graph = workspace?.graph
  const nodes = graph?.nodes ?? []
  const edges = graph?.edges ?? []
  const paths = graph?.paths ?? []
  const activeObject = state.objects.find((object) => object.id === activeObjectId) ?? state.objects[0]
  const selectedNodeId = interactionState.selection.nodeIds[0]
  const selectedEdgeId = interactionState.selection.edgeIds[0]
  const pendingConnectionFromId = interactionState.pendingEdge?.fromNodeId
  const viewport = normalizeGraphViewport(workspace?.viewport)
  const zoomPercent = Math.round(viewport.zoom * 100)
  const panActive = interactionState.mode === "pan"
  const canUseWorkspace = Boolean(state.sessionId)
  const canAddNode = canUseWorkspace && Boolean(activeObject)
  const canConnect = Boolean(selectedNodeId)
  const canSetPath = nodes.length > 1
  const canRemoveSelection = Boolean(selectedNodeId || selectedEdgeId)
  const dropEnabled = canUseWorkspace && state.objects.length > 0

  const handleZoom = (direction: "in" | "out") => {
    onSetViewport(zoomGraphViewport(viewport, direction))
  }

  const handleFitViewport = (element: HTMLElement) => {
    onSetViewport(fitGraphViewportToNodes(nodes, surfaceSizeFromElement(element)))
  }

  const handleCanvasPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canUseWorkspace || !panActive || event.button !== 0 || !isCanvasPanStartTarget(event.target)) return
    const origin = graphPointFromClientPoint(event.currentTarget, event.clientX, event.clientY, viewport)
    canvasDragRef.current = {
      origin,
      dragging: false,
    }
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  const handleCanvasPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = canvasDragRef.current
    if (!drag) return
    const current = graphPointFromClientPoint(event.currentTarget, event.clientX, event.clientY, viewport)
    if (!drag.dragging && pointerDistance(drag.origin, current) < 4) return
    if (!drag.dragging) {
      drag.dragging = true
      onStartCanvasDrag(drag.origin)
    }
    onUpdateCanvasDrag(current)
    event.preventDefault()
  }

  const handleCanvasPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = canvasDragRef.current
    if (!drag) return
    const current = graphPointFromClientPoint(event.currentTarget, event.clientX, event.clientY, viewport)
    canvasDragRef.current = null
    if (drag.dragging) {
      onEndCanvasDrag()
      onSetViewport(panGraphViewport(viewport, {
        x: current.x - drag.origin.x,
        y: current.y - drag.origin.y,
      }))
      event.preventDefault()
    }
  }

  const handleCanvasPointerCancel = () => {
    const drag = canvasDragRef.current
    canvasDragRef.current = null
    if (drag?.dragging) onEndCanvasDrag()
  }

  const handleObjectDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!dropEnabled || !hasGraphObjectDragPayload(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }

  const handleObjectDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!dropEnabled) return
    const payload = parseGraphObjectDragPayload(event.dataTransfer.getData(graphObjectDragMimeType))
    if (!payload || !state.objects.some((object) => object.id === payload.objectId)) return
    event.preventDefault()
    onAddObjectNode({
      objectId: payload.objectId,
      position: canvasPositionFromDrop(event, viewport),
    })
  }

  const handleNodePointerDown = (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => {
    if (!canUseWorkspace || event.button !== 0) return
    const origin = pointFromPointerEvent(event, viewport)
    nodeDragRef.current = {
      nodeId: node.id,
      origin,
      nodeOrigin: graphNodePosition(node),
      dragging: false,
    }
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  const handleNodePointerMove = (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => {
    const drag = nodeDragRef.current
    if (!drag || drag.nodeId !== node.id) return
    const current = pointFromPointerEvent(event, viewport)
    if (!drag.dragging && pointerDistance(drag.origin, current) < 4) return
    if (!drag.dragging) {
      drag.dragging = true
      onStartNodeDrag(node.id, drag.origin)
    }
    onUpdateNodeDrag(current)
    event.preventDefault()
  }

  const handleNodePointerUp = (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => {
    const drag = nodeDragRef.current
    if (!drag || drag.nodeId !== node.id) return
    const current = pointFromPointerEvent(event, viewport)
    nodeDragRef.current = null
    if (drag.dragging) {
      ignoreNextNodeClickRef.current = node.id
      onEndNodeDrag()
      onMoveNode({
        nodeId: node.id,
        position: tuplePosition(moveGraphNodePosition(
          drag.nodeOrigin,
          { x: current.x - drag.origin.x, y: current.y - drag.origin.y },
        )),
      })
      event.preventDefault()
      return
    }
  }

  const handleNodeClick = (nodeId: string) => {
    if (ignoreNextNodeClickRef.current === nodeId) {
      ignoreNextNodeClickRef.current = null
      return
    }
    onSelectNode(nodeId)
  }

  const handleNodePointerCancel = (node: GraphNodeSummary) => {
    const drag = nodeDragRef.current
    if (!drag || drag.nodeId !== node.id) return
    nodeDragRef.current = null
    if (drag.dragging) onEndNodeDrag()
  }

  return (
    <section className="graph-workspace" aria-label={t("graphCanvas.aria")}>
      <div className="workspace-toolbar">
        <div>
          <p className="section-kicker">{t("graphCanvas.section")}</p>
          <h2>{graph?.id ?? t("graphCanvas.awaiting")}</h2>
        </div>
        <span>{state.sessionId ?? t("graphCanvas.noSession")}</span>
      </div>

      <div className="graph-command-bar" aria-label={t("graphCanvas.commands")}>
        <button type="button" onClick={onOpenWorkspace} disabled={!canUseWorkspace}>
          <GitBranch size={16} />
          <span>{t("graphCanvas.openWorkspace")}</span>
        </button>
        <button type="button" onClick={() => onAddObjectNode()} disabled={!canAddNode}>
          <Plus size={16} />
          <span>{t("graphCanvas.addObjectNode")}</span>
        </button>
        <button type="button" onClick={onStartConnection} disabled={!canConnect}>
          <Link2 size={16} />
          <span>{t("graphCanvas.connect")}</span>
        </button>
        <button type="button" onClick={onSetActivePath} disabled={!canSetPath}>
          <Route size={16} />
          <span>{t("graphCanvas.setPath")}</span>
        </button>
        <button
          type="button"
          onClick={() => onRemoveGraphItems({
            nodeIds: interactionState.selection.nodeIds,
            edgeIds: interactionState.selection.edgeIds,
          })}
          disabled={!canRemoveSelection}
        >
          <Trash2 size={16} />
          <span>{t("graphCanvas.deleteSelected")}</span>
        </button>
      </div>

      <div className="graph-viewport-bar" aria-label={t("graphCanvas.viewportControls")}>
        <button
          type="button"
          onClick={onTogglePanMode}
          disabled={!canUseWorkspace}
          aria-pressed={panActive}
          className={panActive ? "graph-viewport-button--active" : ""}
          title={t("graphCanvas.pan")}
        >
          <Hand size={16} />
          <span>{t("graphCanvas.pan")}</span>
        </button>
        <button type="button" onClick={() => handleZoom("out")} disabled={!canUseWorkspace} title={t("graphCanvas.zoomOut")}>
          <ZoomOut size={16} />
          <span>{t("graphCanvas.zoomOut")}</span>
        </button>
        <output aria-label={t("graphCanvas.zoomValue", { value: zoomPercent })}>
          {t("graphCanvas.zoomValue", { value: zoomPercent })}
        </output>
        <button type="button" onClick={() => handleZoom("in")} disabled={!canUseWorkspace} title={t("graphCanvas.zoomIn")}>
          <ZoomIn size={16} />
          <span>{t("graphCanvas.zoomIn")}</span>
        </button>
        <button
          type="button"
          onClick={(event) => handleFitViewport(event.currentTarget.closest(".graph-workspace")?.querySelector(".graph-canvas-surface") as HTMLElement)}
          disabled={!canUseWorkspace || nodes.length === 0}
          title={t("graphCanvas.fitView")}
        >
          <Maximize2 size={16} />
          <span>{t("graphCanvas.fitView")}</span>
        </button>
        <button type="button" onClick={() => onSetViewport(resetGraphViewport())} disabled={!canUseWorkspace} title={t("graphCanvas.resetView")}>
          <RotateCcw size={16} />
          <span>{t("graphCanvas.resetView")}</span>
        </button>
      </div>

      <div className="graph-canvas-layout">
        <div
          className={`graph-canvas-surface ${panActive ? "graph-canvas-surface--pan" : ""}`}
          aria-label={t("graphCanvas.surface")}
          onDragOver={handleObjectDragOver}
          onDrop={handleObjectDrop}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerCancel}
        >
          {nodes.length === 0 ? (
            <div className="graph-empty-state">
              <MousePointer2 size={22} />
              <strong>{t("graphCanvas.empty")}</strong>
              <span>{t("graphCanvas.emptyDetail")}</span>
            </div>
          ) : (
            <>
              <div className="graph-viewport-layer" style={{ transform: graphViewportCssTransform(viewport) }}>
                <GraphEdgeLayer
                  nodes={nodes}
                  edges={edges}
                  selectedEdgeId={selectedEdgeId}
                  onSelectEdge={onSelectEdge}
                />
                <div className="graph-node-layer">
                  {nodes.map((node) => (
                    <GraphNodeButton
                      key={node.id}
                      node={node}
                      object={objectForNode(node, state.objects)}
                      selected={node.id === selectedNodeId}
                      pending={node.id === pendingConnectionFromId}
                      activePath={isNodeInActivePath(node.id, workspace?.active_path_id, paths)}
                      dragging={isDraggingNode(interactionState, node.id)}
                      draggingPosition={draggingNodePosition(interactionState, node)}
                      onPointerDown={handleNodePointerDown}
                      onPointerMove={handleNodePointerMove}
                      onPointerUp={handleNodePointerUp}
                      onPointerCancel={handleNodePointerCancel}
                      onClick={handleNodeClick}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <aside className="network-preview-panel" aria-label={t("graphCanvas.preview")}>
          <p className="section-kicker">{t("graphCanvas.preview")}</p>
          <dl className="network-preview-grid">
            <div>
              <dt>{t("graphCanvas.nodes")}</dt>
              <dd>{workspace?.preview.node_count ?? 0}</dd>
            </div>
            <div>
              <dt>{t("graphCanvas.edges")}</dt>
              <dd>{workspace?.preview.edge_count ?? 0}</dd>
            </div>
            <div>
              <dt>{t("graphCanvas.paths")}</dt>
              <dd>{workspace?.preview.path_count ?? 0}</dd>
            </div>
          </dl>
          <PreviewValue label={t("graphCanvas.activePath")} value={workspace?.active_path_id} />
          <PathList
            paths={paths}
            activePathId={workspace?.active_path_id}
            selectedPathId={interactionState.selection.pathIds[0]}
            pathOrderDraft={pathOrderDraft}
            onSelectPath={onSelectPath}
            onMovePathDraftNode={onMovePathDraftNode}
            onApplyPathOrderDraft={onApplyPathOrderDraft}
          />
          <PreviewWarnings disconnectedNodeIds={workspace?.preview.disconnected_node_ids ?? []} />
          <NodeCompositionEditor
            draft={compositionDraft}
            objects={state.objects}
            pending={compositionPending}
            error={compositionError}
            onRowChange={onCompositionDraftRowChange}
            onAddRow={onAddCompositionDraftRow}
            onRemoveRow={onRemoveCompositionDraftRow}
            onReset={onResetCompositionDraft}
            onApply={onApplyCompositionDraft}
          />
        </aside>
      </div>
    </section>
  )
}

type NodeDragSession = {
  nodeId: string
  origin: CanvasPoint
  nodeOrigin: GraphNodeLayoutPosition
  dragging: boolean
}

type CanvasDragSession = {
  origin: CanvasPoint
  dragging: boolean
}

function hasGraphObjectDragPayload(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(graphObjectDragMimeType)
}

function isCanvasPanStartTarget(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement) && !(target instanceof SVGElement)) return false
  return !target.closest(".graph-node-card, .graph-edge-hitbox")
}

function canvasPositionFromDrop(event: DragEvent<HTMLDivElement>, viewport: GraphViewport): [number, number] {
  return tuplePosition(canvasPointToGraphNodePosition(
    graphPointFromClientPoint(event.currentTarget, event.clientX, event.clientY, viewport),
  ))
}

function pointFromPointerEvent(event: PointerEvent<HTMLElement>, viewport: GraphViewport): CanvasPoint {
  const surface = event.currentTarget.closest(".graph-canvas-surface") as HTMLElement | null
  if (!surface) {
    return canvasPointToGraphNodePosition({ x: event.clientX, y: event.clientY })
  }
  return canvasPointToGraphNodePosition(graphPointFromClientPoint(surface, event.clientX, event.clientY, viewport))
}

function graphPointFromClientPoint(
  surface: HTMLElement,
  clientX: number,
  clientY: number,
  viewport: GraphViewport,
): GraphNodeLayoutPosition {
  const rect = surface.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: clientX, y: clientY }
  }
  const surfacePoint = {
    x: clamp(clientX - rect.left, 0, rect.width),
    y: clamp(clientY - rect.top, 0, rect.height),
  }
  return screenPointToGraphPoint(surfacePoint, surfaceSizeFromElement(surface), viewport)
}

function surfaceSizeFromElement(element: HTMLElement | null): GraphSurfaceSize {
  const rect = element?.getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return {
      width: graphNodeLayoutBounds.width,
      height: graphNodeLayoutBounds.height,
    }
  }
  return {
    width: rect.width,
    height: rect.height,
  }
}

function GraphNodeButton({
  node,
  object,
  selected,
  pending,
  activePath,
  dragging,
  draggingPosition,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onClick,
}: {
  node: GraphNodeSummary
  object?: ObjectSummary
  selected: boolean
  pending: boolean
  activePath: boolean
  dragging: boolean
  draggingPosition?: GraphNodeLayoutPosition
  onPointerDown: (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (node: GraphNodeSummary, event: PointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (node: GraphNodeSummary) => void
  onClick: (nodeId: string) => void
}) {
  const { t } = useI18n()
  const position = graphNodeCssPosition(draggingPosition ?? graphNodePosition(node))
  const composition = node.composition?.length
    ? node.composition
    : (node.chemical_object_ids ?? []).map((objectId) => ({ object_id: objectId, coefficient: 1 }))
  return (
    <button
      type="button"
      className={`graph-node-card ${selected ? "graph-node-card--selected" : ""} ${pending ? "graph-node-card--pending" : ""} ${activePath ? "graph-node-card--path" : ""} ${dragging ? "graph-node-card--dragging" : ""}`}
      style={position}
      onPointerDown={(event) => onPointerDown(node, event)}
      onPointerMove={(event) => onPointerMove(node, event)}
      onPointerUp={(event) => onPointerUp(node, event)}
      onPointerCancel={() => onPointerCancel(node)}
      onClick={() => onClick(node.id)}
      aria-current={selected ? "true" : undefined}
    >
      <span>{node.label}</span>
      <small>{node.id}</small>
      <code>{formatCompositionSummary(composition) || t("graphCanvas.noObject")}</code>
      {object?.formula ? <em>{object.formula}</em> : null}
    </button>
  )
}

function formatCompositionSummary(composition: Array<{ object_id: string; coefficient?: number }>): string {
  return composition
    .map((term) => `${term.coefficient && term.coefficient !== 1 ? `${term.coefficient}*` : ""}${term.object_id}`)
    .join(" + ")
}

function draggingNodePosition(
  interactionState: GraphEditorInteractionState,
  node: GraphNodeSummary,
): GraphNodeLayoutPosition | undefined {
  const dragging = interactionState.dragging
  if (!dragging || dragging.kind !== "node" || !dragging.nodeIds.includes(node.id)) return undefined
  const nodeOrigin = graphNodePosition(node)
  return moveGraphNodePosition(nodeOrigin, {
    x: dragging.current.x - dragging.origin.x,
    y: dragging.current.y - dragging.origin.y,
  })
}

function isDraggingNode(interactionState: GraphEditorInteractionState, nodeId: string): boolean {
  const dragging = interactionState.dragging
  return Boolean(dragging && dragging.kind === "node" && dragging.nodeIds.includes(nodeId))
}

function GraphEdgeLayer({
  nodes,
  edges,
  selectedEdgeId,
  onSelectEdge,
}: {
  nodes: GraphNodeSummary[]
  edges: GraphEdgeSummary[]
  selectedEdgeId?: string
  onSelectEdge: (edgeId: string) => void
}) {
  const segments = edges.map((edge) => {
    const source = nodes.find((node) => node.id === edgeSource(edge))
    const target = nodes.find((node) => node.id === edgeTarget(edge))
    if (!source || !target) return null
    const from = graphNodePosition(source)
    const to = graphNodePosition(target)
    return { id: edge.id, from, to, sourceLabel: source.label, targetLabel: target.label }
  }).filter(Boolean) as Array<{
    id: string
    from: { x: number; y: number }
    to: { x: number; y: number }
    sourceLabel: string
    targetLabel: string
  }>

  return (
    <div className="graph-edge-layer" aria-label="Graph edges">
      <svg className="graph-edge-svg" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
        {segments.map((segment) => (
          <g key={segment.id} className={segment.id === selectedEdgeId ? "graph-edge--selected" : ""}>
            <line
              className="graph-edge-line"
              x1={(segment.from.x / graphNodeLayoutBounds.width) * 100}
              y1={(segment.from.y / graphNodeLayoutBounds.height) * 100}
              x2={(segment.to.x / graphNodeLayoutBounds.width) * 100}
              y2={(segment.to.y / graphNodeLayoutBounds.height) * 100}
            />
            <circle
              cx={(segment.to.x / graphNodeLayoutBounds.width) * 100}
              cy={(segment.to.y / graphNodeLayoutBounds.height) * 100}
              r="1.5"
            />
          </g>
        ))}
      </svg>
      {segments.map((segment) => {
        const selected = segment.id === selectedEdgeId
        return (
          <button
            key={segment.id}
            type="button"
            aria-label={`Edge ${segment.sourceLabel} to ${segment.targetLabel}`}
            className={`graph-edge-hitbox ${selected ? "graph-edge-hitbox--selected" : ""}`}
            style={edgeHitboxStyle(segment.from, segment.to)}
            onClick={(event) => {
              event.stopPropagation()
              onSelectEdge(segment.id)
            }}
          />
        )
      })}
    </div>
  )
}

function edgeHitboxStyle(
  from: GraphNodeLayoutPosition,
  to: GraphNodeLayoutPosition,
): { left: string; top: string } {
  return {
    left: `${(((from.x + to.x) / 2) / graphNodeLayoutBounds.width) * 100}%`,
    top: `${(((from.y + to.y) / 2) / graphNodeLayoutBounds.height) * 100}%`,
  }
}

function PreviewValue({ label, value }: { label: string; value?: string | null }) {
  const { t } = useI18n()
  return (
    <div className="preview-value">
      <span>{label}</span>
      <code>{value ?? t("graphCanvas.none")}</code>
    </div>
  )
}

function PathList({
  paths,
  activePathId,
  selectedPathId,
  pathOrderDraft,
  onSelectPath,
  onMovePathDraftNode,
  onApplyPathOrderDraft,
}: {
  paths: GraphPathSummary[]
  activePathId?: string | null
  selectedPathId?: string
  pathOrderDraft: GraphPathOrderDraft | null
  onSelectPath: (pathId: string, nodeIds: string[]) => void
  onMovePathDraftNode: (nodeId: string, direction: "up" | "down") => void
  onApplyPathOrderDraft: () => void
}) {
  const { t } = useI18n()
  if (paths.length === 0) {
    return <p className="muted">{t("graphCanvas.noPaths")}</p>
  }
  return (
    <ul className="graph-path-list" aria-label={t("graphCanvas.pathList")}>
      {paths.map((path) => {
        const selected = path.id === selectedPathId
        const draftNodeIds = selected && pathOrderDraft?.pathId === path.id ? pathOrderDraft.nodeIds : path.node_ids
        return (
          <li key={path.id} className={`${path.id === activePathId ? "graph-path-list--active" : ""} ${selected ? "graph-path-list--selected" : ""}`}>
            <button
              type="button"
              className="graph-path-select"
              aria-label={`Select path ${path.label ?? path.id}`}
              onClick={() => onSelectPath(path.id, path.node_ids)}
            >
              <strong>{path.label ?? path.id}</strong>
              <code>{path.id}</code>
              <span>{path.node_ids.join(" -> ")}</span>
            </button>
            {selected ? (
              <div className="graph-path-draft" aria-label={t("graphCanvas.pathOrderDraft")}>
                <ol>
                  {draftNodeIds.map((nodeId, index) => (
                    <li key={nodeId}>
                      <code>{nodeId}</code>
                      <button type="button" onClick={() => onMovePathDraftNode(nodeId, "up")} disabled={index === 0}>
                        {t("graphCanvas.moveUp")}
                      </button>
                      <button type="button" onClick={() => onMovePathDraftNode(nodeId, "down")} disabled={index === draftNodeIds.length - 1}>
                        {t("graphCanvas.moveDown")}
                      </button>
                    </li>
                  ))}
                </ol>
                <button type="button" onClick={onApplyPathOrderDraft}>
                  {t("graphCanvas.applyPathOrder")}
                </button>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function PreviewWarnings({ disconnectedNodeIds }: { disconnectedNodeIds: string[] }) {
  const { t } = useI18n()
  if (disconnectedNodeIds.length === 0) {
    return <p className="network-preview-ok">{t("graphCanvas.noDisconnected")}</p>
  }
  return (
    <div className="network-preview-warning">
      <strong>{t("graphCanvas.disconnected")}</strong>
      {disconnectedNodeIds.map((nodeId) => (
        <code key={nodeId}>{nodeId}</code>
      ))}
    </div>
  )
}

function NodeCompositionEditor({
  draft,
  objects,
  pending,
  error,
  onRowChange,
  onAddRow,
  onRemoveRow,
  onReset,
  onApply,
}: {
  draft: CompositionDraftState
  objects: ObjectSummary[]
  pending: boolean
  error: ShellError | null
  onRowChange: (index: number, field: keyof CompositionDraftRow, value: string) => void
  onAddRow: () => void
  onRemoveRow: (index: number) => void
  onReset: () => void
  onApply: () => void
}) {
  const { t } = useI18n()
  const disabled = !draft.nodeId || pending
  return (
    <form
      className="composition-editor"
      aria-label={t("compositionEditor.aria")}
      onSubmit={(event) => {
        event.preventDefault()
        onApply()
      }}
    >
      <div className="composition-editor-header">
        <div>
          <span>{t("compositionEditor.title")}</span>
          <code>{draft.nodeId ?? t("graphCanvas.none")}</code>
        </div>
        <small>{draft.dirty ? t("compositionEditor.dirty") : t("compositionEditor.clean")}</small>
      </div>

      {draft.rows.length > 0 ? (
        <div className="composition-row-list">
          {draft.rows.map((row, index) => (
            <CompositionDraftRowEditor
              key={`${draft.nodeId ?? "none"}-${index}`}
              row={row}
              index={index}
              objects={objects}
              disabled={disabled}
              canRemove={draft.rows.length > 1}
              onRowChange={onRowChange}
              onRemoveRow={onRemoveRow}
            />
          ))}
        </div>
      ) : (
        <p className="muted">{t("compositionEditor.empty")}</p>
      )}

      {error ? (
        <p className="composition-error">
          <code>{error.code}</code>
          <span>{error.message}</span>
          {error.target ? <small>{error.target}</small> : null}
        </p>
      ) : null}

      <div className="composition-command-row">
        <button type="button" onClick={onAddRow} disabled={disabled || objects.length === 0}>
          <Plus size={15} />
          <span>{t("compositionEditor.addTerm")}</span>
        </button>
        <button type="button" onClick={onReset} disabled={disabled || !draft.dirty}>
          <RotateCcw size={15} />
          <span>{t("compositionEditor.reset")}</span>
        </button>
        <button type="submit" disabled={disabled || !draft.dirty || draft.rows.length === 0}>
          <Check size={15} />
          <span>{pending ? t("compositionEditor.applying") : t("compositionEditor.apply")}</span>
        </button>
      </div>
    </form>
  )
}

function CompositionDraftRowEditor({
  row,
  index,
  objects,
  disabled,
  canRemove,
  onRowChange,
  onRemoveRow,
}: {
  row: CompositionDraftRow
  index: number
  objects: ObjectSummary[]
  disabled: boolean
  canRemove: boolean
  onRowChange: (index: number, field: keyof CompositionDraftRow, value: string) => void
  onRemoveRow: (index: number) => void
}) {
  const { t } = useI18n()
  return (
    <div className="composition-row">
      <label>
        <span>{t("compositionEditor.object")}</span>
        <select
          value={row.objectId}
          onChange={(event) => onRowChange(index, "objectId", event.currentTarget.value)}
          disabled={disabled || objects.length === 0}
        >
          {objects.map((object) => (
            <option key={object.id} value={object.id}>
              {object.label ?? object.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t("compositionEditor.coefficient")}</span>
        <input
          type="number"
          step="any"
          value={row.coefficient}
          onChange={(event) => onRowChange(index, "coefficient", event.currentTarget.value)}
          disabled={disabled}
        />
      </label>
      <label>
        <span>{t("compositionEditor.role")}</span>
        <select
          value={row.role}
          onChange={(event) => onRowChange(index, "role", event.currentTarget.value)}
          disabled={disabled}
        >
          <option value="">{t("compositionEditor.role.none")}</option>
          <option value="reactant">{t("compositionEditor.role.reactant")}</option>
          <option value="reagent">{t("compositionEditor.role.reagent")}</option>
          <option value="catalyst">{t("compositionEditor.role.catalyst")}</option>
          <option value="product">{t("compositionEditor.role.product")}</option>
        </select>
      </label>
      <label>
        <span>{t("compositionEditor.label")}</span>
        <input
          type="text"
          value={row.label}
          onChange={(event) => onRowChange(index, "label", event.currentTarget.value)}
          disabled={disabled}
          placeholder={t("compositionEditor.labelPlaceholder")}
        />
      </label>
      <button
        type="button"
        title={t("compositionEditor.removeTerm")}
        aria-label={t("compositionEditor.removeTerm")}
        onClick={() => onRemoveRow(index)}
        disabled={disabled || !canRemove}
      >
        <Trash2 size={15} />
      </button>
    </div>
  )
}

function objectForNode(node: GraphNodeSummary, objects: ObjectSummary[]): ObjectSummary | undefined {
  const objectId = node.chemical_object_ids?.[0]
  return objects.find((object) => object.id === objectId)
}

function isNodeInActivePath(nodeId: string, activePathId: string | null | undefined, paths: GraphPathSummary[]): boolean {
  const activePath = paths.find((path) => path.id === activePathId)
  return activePath?.node_ids.includes(nodeId) ?? false
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

function tuplePosition(position: GraphNodeLayoutPosition): [number, number] {
  return [position.x, position.y]
}

function pointerDistance(origin: CanvasPoint, current: CanvasPoint): number {
  return Math.hypot(current.x - origin.x, current.y - origin.y)
}

function edgeSource(edge: GraphEdgeSummary): string {
  return edge.from_node ?? edge.source ?? ""
}

function edgeTarget(edge: GraphEdgeSummary): string {
  return edge.to_node ?? edge.target ?? ""
}
