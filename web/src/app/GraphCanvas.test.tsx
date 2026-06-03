import { createEvent, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { initialCompositionDraftState } from "./compositionDraftState"
import { initialEdgeLabelDraftState } from "./edgeLabelDraftState"
import { initialGraphEditorInteractionState } from "./graphEditorInteractionState"
import {
  graphRawFileDropMimeType,
  serializeGraphRawFileDropPayload,
} from "./graphRawFileDropPayload"
import {
  GraphCanvas,
  type AddRawFileNodeRequest,
} from "./GraphCanvas"
import { I18nProvider } from "./i18n"
import { initialWorkbenchDomainState } from "./workbenchState"

describe("GraphCanvas raw file drops", () => {
  it("passes project raw file drops with graph-space position", () => {
    const onAddRawFileNode = vi.fn()
    renderGraphCanvas(onAddRawFileNode)
    const surface = screen.getByLabelText("Graph canvas surface")
    mockSurfaceRect(surface, 600, 360)
    const dataTransfer = new TestDataTransfer()
    dataTransfer.setData(graphRawFileDropMimeType, serializeGraphRawFileDropPayload({
      kind: "project-file",
      projectFileId: "raw-abc123def456",
      path: "inputs/raw/abc123def456-water.extxyz",
    }))

    fireEvent.dragOver(surface, { dataTransfer })
    dispatchDrop(surface, dataTransfer, 240, 180)

    expect(dataTransfer.dropEffect).toBe("copy")
    expect(onAddRawFileNode).toHaveBeenCalledWith({
      source: {
        kind: "project-file",
        projectFileId: "raw-abc123def456",
        path: "inputs/raw/abc123def456-water.extxyz",
      },
      position: [240, 180],
    })
  })

  it("passes external file drops with graph-space position", () => {
    const onAddRawFileNode = vi.fn()
    renderGraphCanvas(onAddRawFileNode)
    const surface = screen.getByLabelText("Graph canvas surface")
    mockSurfaceRect(surface, 600, 360)
    const file = new File(["2\nwater\n"], "water.xyz", { type: "chemical/x-xyz" })
    const dataTransfer = new TestDataTransfer([file])

    fireEvent.dragOver(surface, { dataTransfer })
    dispatchDrop(surface, dataTransfer, 280, 120)

    expect(dataTransfer.dropEffect).toBe("copy")
    expect(onAddRawFileNode).toHaveBeenCalledWith({
      source: { kind: "external-file", file },
      position: [280, 120],
    })
  })
})

function renderGraphCanvas(onAddRawFileNode: (request: AddRawFileNodeRequest) => void) {
  return render(
    <I18nProvider initialLocale="en-US">
      <GraphCanvas
        state={{
          ...initialWorkbenchDomainState,
          sessionId: "session-1",
        }}
        interactionState={initialGraphEditorInteractionState}
        historyControls={{ canUndo: false, canRedo: false }}
        pathOrderDraft={null}
        edgeLabelDraft={initialEdgeLabelDraftState}
        edgeLabelPending={false}
        edgeLabelError={null}
        compositionDraft={initialCompositionDraftState}
        compositionPending={false}
        compositionError={null}
        onSelectNode={() => undefined}
        onSelectEdge={() => undefined}
        onSelectPath={() => undefined}
        onMovePathDraftNode={() => undefined}
        onApplyPathOrderDraft={() => undefined}
        onEdgeLabelDraftChange={() => undefined}
        onResetEdgeLabelDraft={() => undefined}
        onClearEdgeLabelDraft={() => undefined}
        onApplyEdgeLabelDraft={() => undefined}
        onStartNodeDrag={() => undefined}
        onUpdateNodeDrag={() => undefined}
        onEndNodeDrag={() => undefined}
        onStartCanvasDrag={() => undefined}
        onUpdateCanvasDrag={() => undefined}
        onEndCanvasDrag={() => undefined}
        onStartRubberBand={() => undefined}
        onUpdateRubberBand={() => undefined}
        onEndRubberBand={() => undefined}
        onCancelRubberBand={() => undefined}
        onStartPointerEdge={() => undefined}
        onUpdatePointerEdge={() => undefined}
        onEndPointerEdge={() => undefined}
        onCancelPointerEdge={() => undefined}
        onOpenWorkspace={() => undefined}
        onAddObjectNode={() => undefined}
        onAddRawFileNode={onAddRawFileNode}
        onMoveNode={() => undefined}
        onNudgeNodes={() => undefined}
        onUndoHistory={() => undefined}
        onRedoHistory={() => undefined}
        onApplyAutoLayout={() => undefined}
        onRemoveGraphItems={() => undefined}
        onClearSelection={() => undefined}
        onSetViewport={() => undefined}
        onTogglePanMode={() => undefined}
        onStartConnection={() => undefined}
        onSetActivePath={() => undefined}
        onCompositionDraftRowChange={() => undefined}
        onAddCompositionDraftRow={() => undefined}
        onRemoveCompositionDraftRow={() => undefined}
        onResetCompositionDraft={() => undefined}
        onApplyCompositionDraft={() => undefined}
      />
    </I18nProvider>,
  )
}

function dispatchDrop(
  element: HTMLElement,
  dataTransfer: TestDataTransfer,
  clientX: number,
  clientY: number,
) {
  const event = createEvent.drop(element, { dataTransfer })
  Object.defineProperty(event, "clientX", { value: clientX })
  Object.defineProperty(event, "clientY", { value: clientY })
  fireEvent(element, event)
}

function mockSurfaceRect(element: HTMLElement, width: number, height: number) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  })
}

class TestDataTransfer {
  dropEffect = "none"
  effectAllowed = "all"
  private readonly store = new Map<string, string>()
  readonly files: FileList

  constructor(files: File[] = []) {
    this.files = Object.assign(files.slice(), {
      item: (index: number) => files[index] ?? null,
    }) as unknown as FileList
  }

  get types() {
    const types = Array.from(this.store.keys())
    return this.files.length > 0 ? [...types, "Files"] : types
  }

  setData(type: string, value: string) {
    this.store.set(type, value)
  }

  getData(type: string) {
    return this.store.get(type) ?? ""
  }
}
