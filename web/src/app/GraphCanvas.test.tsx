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
  type ParseCandidateChooserState,
} from "./GraphCanvas"
import { I18nProvider } from "./i18n"
import { initialWorkbenchDomainState, type WorkbenchDomainState } from "./workbenchState"

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

describe("GraphCanvas parse candidate chooser", () => {
  it("renders preview candidates near the canvas drop point and supports selection actions", () => {
    const onCancelCandidateChooser = vi.fn()
    const onConfirmCandidateChooser = vi.fn()
    const onToggleCandidateSelection = vi.fn()
    renderGraphCanvas(vi.fn(), {
      candidateChooser: {
        ...fixtureCandidateChooser,
        selectedCandidateIds: ["candidate-frame-1"],
      },
      onCancelCandidateChooser,
      onConfirmCandidateChooser,
      onToggleCandidateSelection,
    })

    expect(screen.getByRole("region", { name: "Parse Candidate Chooser" })).toBeInTheDocument()
    expect(screen.getByText("Select structure candidate")).toBeInTheDocument()
    expect(screen.getByText("multi.extxyz")).toBeInTheDocument()
    expect(screen.getByText("2 candidates")).toBeInTheDocument()
    expect(screen.getByText("Frame 1")).toBeInTheDocument()
    expect(screen.queryByText("candidate-frame-1")).not.toBeInTheDocument()
    expect(screen.getByText("electronic -100.25 hartree")).toBeInTheDocument()
    expect(screen.getAllByText("3 atoms · O H · 3D").length).toBeGreaterThan(0)
    expect(screen.getByRole("checkbox", { name: "Select Frame 1" })).toBeChecked()

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Frame 2" }))
    expect(onToggleCandidateSelection).toHaveBeenCalledWith("candidate-frame-2", true)

    fireEvent.click(screen.getByRole("button", { name: "Add selected (1)" }))
    expect(onConfirmCandidateChooser).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onCancelCandidateChooser).toHaveBeenCalledTimes(1)
  })
})

describe("GraphCanvas molecule previews", () => {
  it("renders a structure preview from object geometry inside graph nodes", () => {
    renderGraphCanvas(vi.fn(), {
      state: {
        ...initialWorkbenchDomainState,
        sessionId: "session-1",
        objects: [
          {
            id: "object-water",
            label: "water.xyz",
            formula: "H2O",
            charge: 0,
            spin_multiplicity: 1,
            method: "xyz geometry",
            source_file_id: "raw-water",
            energy_keys: ["electronic"],
            thermochemistry_keys: [],
            coordinate_preview: {
              atom_count: 3,
              has3d: true,
              elements: ["O", "H"],
              preview_kind: "text",
            },
            geometry: [
              { element: "O", x: 0, y: 0, z: 0, unit: "angstrom" },
              { element: "H", x: 0.92, y: 0, z: 0.32, unit: "angstrom" },
              { element: "H", x: -0.28, y: 0.86, z: -0.18, unit: "angstrom" },
            ],
          },
        ],
        workspace: {
          workspace_id: "workspace-1",
          project_id: "project-1",
          active_path_id: null,
          selection: { node_ids: [], edge_ids: [], path_ids: [] },
          viewport: { x: 0, y: 0, zoom: 1 },
          palette: [],
          graph: {
            id: "graph-1",
            project_id: "project-1",
            node_count: 1,
            edge_count: 0,
            path_count: 0,
            nodes: [
              {
                id: "node-water",
                kind: "species",
                label: "water.xyz",
                chemical_object_ids: ["object-water"],
                position: [180, 140],
              },
            ],
            edges: [],
            paths: [],
          },
          preview: {
            graph_id: "graph-1",
            active_path_id: null,
            node_count: 1,
            edge_count: 0,
            path_count: 0,
            disconnected_node_ids: [],
            warnings: [],
          },
        },
      },
    })

    const viewer = screen.getByRole("img", { name: "water.xyz 3D structure" })
    expect(viewer).toBeInTheDocument()
    expect(viewer.querySelector("canvas")).toBeInTheDocument()
    expect(screen.queryByText("node-water")).not.toBeInTheDocument()
    expect(screen.queryByText("object-water")).not.toBeInTheDocument()
  })
})

function renderGraphCanvas(
  onAddRawFileNode: (request: AddRawFileNodeRequest) => void,
  options: {
    state?: WorkbenchDomainState
    candidateChooser?: ParseCandidateChooserState | null
    onToggleCandidateSelection?: (candidateId: string, selected: boolean) => void
    onConfirmCandidateChooser?: () => void
    onCancelCandidateChooser?: () => void
  } = {},
) {
  return render(
    <I18nProvider initialLocale="en-US">
      <GraphCanvas
        state={options.state ?? {
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
        candidateChooser={options.candidateChooser ?? null}
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
        onToggleCandidateSelection={options.onToggleCandidateSelection ?? (() => undefined)}
        onConfirmCandidateChooser={options.onConfirmCandidateChooser ?? (() => undefined)}
        onCancelCandidateChooser={options.onCancelCandidateChooser ?? (() => undefined)}
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

const fixtureCandidateChooser: ParseCandidateChooserState = {
  projectFileId: "raw-multi",
  rawFilePath: "inputs/raw/multi.extxyz",
  batchId: "batch-1",
  itemId: "item-1",
  selectedCandidateIds: [],
  position: [260, 160],
  status: "choosing",
  error: null,
  candidates: [
    {
      candidate_id: "candidate-frame-1",
      object_index: 0,
      label: "Frame 1",
      formula: "H2O",
      charge: 0,
      spin_multiplicity: 1,
      method: "extxyz fixture",
      display_energy: {
        key: "electronic",
        source: "energies",
        value: -100.25,
        unit: "hartree",
      },
      coordinate_preview: {
        atom_count: 3,
        has3d: true,
        elements: ["O", "H"],
        preview_kind: "text",
      },
      warnings: [],
    },
    {
      candidate_id: "candidate-frame-2",
      object_index: 1,
      label: "Frame 2",
      formula: "H2O",
      charge: 0,
      spin_multiplicity: 1,
      method: "extxyz fixture",
      display_energy: {
        key: "electronic",
        source: "energies",
        value: -100.1,
        unit: "hartree",
      },
      coordinate_preview: {
        atom_count: 3,
        has3d: true,
        elements: ["O", "H"],
        preview_kind: "text",
      },
      warnings: [],
    },
  ],
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
