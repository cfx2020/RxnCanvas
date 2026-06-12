import { act, createEvent, fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { edgeLabelDraftFromEdge, initialEdgeLabelDraftState } from "./edgeLabelDraftState"
import { initialGraphEditorInteractionState, type GraphEditorInteractionState } from "./graphEditorInteractionState"
import {
  graphRawFileDropMimeType,
  serializeGraphRawFileDropPayload,
} from "./graphRawFileDropPayload"
import {
  GraphCanvas,
  type AddRawFileNodeRequest,
  type CanvasEnergyDisplayOptions,
  type ParseCandidateChooserState,
} from "./GraphCanvas"
import type { GraphLayoutPlan } from "./graphAutoLayout"
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
      position: [640, 500],
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
      position: [740, 340],
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
    expect(screen.getByText("multi")).toBeInTheDocument()
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

    const viewer = screen.getByRole("img", { name: "water 3D structure" })
    expect(viewer).toBeInTheDocument()
    expect(viewer.querySelector("canvas")).toBeInTheDocument()
    expect(screen.queryByText("node-water")).not.toBeInTheDocument()
    expect(screen.queryByText("object-water")).not.toBeInTheDocument()
  })

  it("selects a node when users click inside its 3D structure preview", () => {
    const onSelectNode = vi.fn()
    renderGraphCanvas(vi.fn(), {
      state: graphCanvasTwoNodeState(),
      onSelectNode,
    })

    const viewer = screen.getByRole("img", { name: "A 3D structure" })
    const canvas = viewer.querySelector("canvas")
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("3D structure canvas was not rendered.")
    }

    fireEvent.click(canvas)

    expect(onSelectNode).toHaveBeenCalledWith("node-a", "replace")
  })

  it("lets users collapse structure previews and choose the relative energy zero point", () => {
    renderGraphCanvas(vi.fn(), {
      state: graphCanvasTwoNodeState(),
    })

    expect(screen.getByLabelText("Unit")).toHaveValue("kcal_mol")
    expect(screen.getByText("12.55 kcal/mol")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "A 3D structure" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Collapse structure preview for A" }))

    expect(screen.queryByRole("img", { name: "A 3D structure" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Show structure preview for A" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "More actions for B" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Use B as zero point" }))

    fireEvent.click(screen.getByRole("button", { name: "More actions for B" }))
    expect(screen.getByRole("menuitem", { name: "B is the zero point" })).toBeInTheDocument()
    expect(screen.getByText("-12.55 (0,1)")).toBeInTheDocument()
  })

  it("only offers table-backed energy modes in the canvas dropdown", () => {
    renderGraphCanvas(vi.fn(), {
      state: graphCanvasTwoNodeState(),
    })

    expect(within(screen.getByLabelText("Energy")).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Egas",
      "Ggas",
      "Gsol",
    ])
  })

  it("edits the node stoichiometric coefficient inline and keeps source actions in the node menu", () => {
    const onSetNodeCoefficient = vi.fn()
    const onShowNodeSource = vi.fn()
    renderGraphCanvas(vi.fn(), {
      state: graphCanvasTwoNodeState(),
      onSetNodeCoefficient,
      onShowNodeSource,
    })

    const coefficientButton = screen.getByRole("button", { name: "Stoichiometric coefficient for A" })
    expect(coefficientButton).toHaveTextContent("×1")
    fireEvent.click(coefficientButton)
    const coefficientInput = screen.getByLabelText("Stoichiometric coefficient for A")
    fireEvent.change(coefficientInput, { target: { value: "2" } })
    fireEvent.keyDown(coefficientInput, { key: "Enter" })
    expect(onSetNodeCoefficient).toHaveBeenCalledWith("node-a", 2)

    fireEvent.click(screen.getByRole("button", { name: "More actions for A" }))
    expect(screen.queryByRole("menuitem", { name: "Set stoichiometric coefficients" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("menuitem", { name: "Source details" }))

    expect(onShowNodeSource).toHaveBeenCalledWith("node-a")
  })

  it("marks explicit barrier annotations between two nodes", () => {
    const view = renderGraphCanvas(vi.fn(), {
      state: graphCanvasTwoNodeState(),
    })

    const targetNode = graphNodeCardById(view.container, "node-b")
    const restoreElementsFromPoint = mockElementsFromPoint([targetNode])
    try {
      const handle = screen.getByRole("button", { name: "Drag barrier annotation from A" })
      fireEvent.pointerDown(handle, { button: 0, clientX: 120, clientY: 270, pointerId: 21 })
      fireEvent.pointerMove(handle, { button: 0, clientX: 480, clientY: 180, pointerId: 21 })
      expect(view.container.querySelector(".graph-node-barrier-pick-button")).not.toBeInTheDocument()
      fireEvent.pointerUp(handle, { button: 0, clientX: 480, clientY: 180, pointerId: 21 })
    } finally {
      restoreElementsFromPoint()
    }

    expect(view.container.querySelector(".graph-barrier-arrow")).toBeInTheDocument()
    expect(view.container.querySelector(".graph-barrier-guide")).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Barrier label" })).toHaveValue("ΔE‡ 12.55")
    expect(view.container.querySelector(".graph-barrier-delete-button")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Delete Selection" }))

    expect(screen.queryByRole("textbox", { name: "Barrier label" })).not.toBeInTheDocument()
    expect(view.container.querySelector(".graph-barrier-arrow")).not.toBeInTheDocument()
  })

  it("edits explicit barrier annotation labels inline", () => {
    const view = renderGraphCanvas(vi.fn(), {
      state: graphCanvasTwoNodeState(),
    })

    const targetNode = graphNodeCardById(view.container, "node-b")
    const restoreElementsFromPoint = mockElementsFromPoint([targetNode])
    try {
      const handle = screen.getByRole("button", { name: "Drag barrier annotation from A" })
      fireEvent.pointerDown(handle, { button: 0, clientX: 120, clientY: 270, pointerId: 22 })
      fireEvent.pointerMove(handle, { button: 0, clientX: 480, clientY: 180, pointerId: 22 })
      fireEvent.pointerUp(handle, { button: 0, clientX: 480, clientY: 180, pointerId: 22 })
    } finally {
      restoreElementsFromPoint()
    }

    const labelInput = screen.getByRole("textbox", { name: "Barrier label" })
    fireEvent.change(labelInput, { target: { value: "OA barrier" } })
    fireEvent.blur(labelInput)

    expect(screen.getByRole("textbox", { name: "Barrier label" })).toHaveValue("OA barrier")

    fireEvent.click(graphNodeCardById(view.container, "node-a"))

    expect(screen.getByRole("button", { name: "Edit barrier label from A to B" })).toHaveTextContent("OA barrier")

    fireEvent.click(screen.getByRole("button", { name: "Edit barrier label from A to B" }))

    expect(screen.getByRole("textbox", { name: "Barrier label" })).toHaveValue("OA barrier")
  })
})

describe("GraphCanvas graph edges", () => {
  it("renders smooth bezier edges with left and right node handles", () => {
    const state = {
      ...initialWorkbenchDomainState,
      sessionId: "session-1",
      objects: [
        {
          id: "object-a",
          label: "A.log",
          formula: "H2",
          charge: 0,
          spin_multiplicity: 1,
          energy_keys: ["electronic"],
          thermochemistry_keys: [],
          geometry: [{ element: "H", x: 0, y: 0, z: 0, unit: "angstrom" }],
        },
        {
          id: "object-b",
          label: "B.log",
          formula: "H2",
          charge: 0,
          spin_multiplicity: 1,
          energy_keys: ["electronic"],
          thermochemistry_keys: [],
          geometry: [{ element: "H", x: 0, y: 0, z: 0, unit: "angstrom" }],
        },
      ],
      workspace: {
        workspace_id: "workspace-1",
        project_id: "project-1",
        active_path_id: "path-a-b",
        selection: { node_ids: [], edge_ids: [], path_ids: [] },
        viewport: { x: 0, y: 0, zoom: 1 },
        palette: [],
        graph: {
          id: "graph-1",
          project_id: "project-1",
          node_count: 2,
          edge_count: 1,
          path_count: 1,
          nodes: [
            { id: "node-a", kind: "species", label: "A.log", chemical_object_ids: ["object-a"], position: [120, 180] },
            { id: "node-b", kind: "species", label: "B.log", chemical_object_ids: ["object-b"], position: [480, 180] },
          ],
          edges: [{ id: "edge-a-b", from_node: "node-a", to_node: "node-b", label: "TS" }],
          paths: [{ id: "path-a-b", label: "path-a-b", node_ids: ["node-a", "node-b"] }],
        },
        preview: {
          graph_id: "graph-1",
          active_path_id: "path-a-b",
          node_count: 2,
          edge_count: 1,
          path_count: 1,
          disconnected_node_ids: [],
          warnings: [],
        },
      },
    } satisfies WorkbenchDomainState

    const view = renderGraphCanvas(vi.fn(), { state })
    const edgePath = view.container.querySelector(".graph-edge-line")
    expect(edgePath?.tagName.toLowerCase()).toBe("path")
    expect(edgePath).toHaveAttribute("d", expect.stringContaining(" C "))
    expect(screen.getByRole("button", { name: "Drag path from A" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Drag path into A" })).toBeInTheDocument()
  })

  it("keeps reverse-direction edges fixed from source output to target input", () => {
    const state = graphCanvasTwoNodeState()
    state.workspace!.graph.edges = [{ id: "edge-b-a", from_node: "node-b", to_node: "node-a", label: "TS" }]
    state.workspace!.graph.paths = [{ id: "path-b-a", label: "path-b-a", node_ids: ["node-b", "node-a"] }]

    const view = renderGraphCanvas(vi.fn(), { state })
    const edgePath = view.container.querySelector(".graph-edge-line")
    const hitbox = screen.getByRole("button", { name: "Edge B to A: TS" })

    expect(edgePath).toHaveAttribute("d", expect.stringMatching(/^M 58\d 180 C /))
    expect(edgePath).toHaveAttribute("d", expect.stringMatching(/1\d 180$/))
    expect(view.container.querySelector(".graph-edge-label")).toHaveTextContent("TS")
    expect(screen.getByRole("button", { name: "Edit edge label from B to A" })).toBeInTheDocument()
    expect(hitbox).toHaveStyle({
      left: "300px",
      top: "180px",
    })
  })

  it("starts path drags only from the fixed right-side output handle", () => {
    const onStartPointerEdge = vi.fn()
    renderGraphCanvas(vi.fn(), {
      state: graphCanvasTwoNodeState(),
      onStartPointerEdge,
    })

    fireEvent.pointerDown(screen.getByRole("button", { name: "Drag path into A" }), {
      button: 0,
      clientX: 100,
      clientY: 180,
      pointerId: 31,
    })

    expect(onStartPointerEdge).not.toHaveBeenCalled()

    fireEvent.pointerDown(screen.getByRole("button", { name: "Drag path from A" }), {
      button: 0,
      clientX: 240,
      clientY: 180,
      pointerId: 32,
    })

    expect(onStartPointerEdge).toHaveBeenCalledWith("node-a", expect.objectContaining({
      x: expect.any(Number),
      y: expect.any(Number),
    }))
  })

  it("selects labeled graph edges from the inline label and transparent hit target", () => {
    const onSelectEdge = vi.fn()
    const state = graphCanvasTwoNodeState()

    renderGraphCanvas(vi.fn(), {
      state,
      onSelectEdge,
    })

    fireEvent.pointerDown(screen.getByRole("button", { name: "Edit edge label from A to B" }), { button: 0 })
    expect(onSelectEdge).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Edit edge label from A to B" }))
    expect(onSelectEdge).toHaveBeenCalledWith("edge-a-b", "replace")

    fireEvent.pointerDown(screen.getByRole("button", { name: "Edge A to B: TS" }), { button: 0 })
    expect(onSelectEdge).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Edge A to B: TS" }))
    expect(onSelectEdge).toHaveBeenLastCalledWith("edge-a-b", "replace")
  })

  it("selects an edge from the line without opening label editing", () => {
    const onSelectEdge = vi.fn()
    const state = graphCanvasTwoNodeState()
    state.workspace!.selection = { node_ids: [], edge_ids: ["edge-a-b"], path_ids: [] }

    renderGraphCanvas(vi.fn(), {
      state,
      edgeLabelDraft: edgeLabelDraftFromEdge(state.workspace!.graph.edges[0]),
      onSelectEdge,
    })

    fireEvent.pointerDown(screen.getByRole("button", { name: "Edge A to B: TS" }), { button: 0 })

    expect(onSelectEdge).not.toHaveBeenCalled()
    expect(screen.queryByRole("textbox", { name: "Label" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Edge A to B: TS" }))

    expect(onSelectEdge).toHaveBeenCalledWith("edge-a-b", "replace")
    expect(screen.queryByRole("textbox", { name: "Label" })).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole("button", { name: "Edit edge label from A to B" }), { button: 0 })

    expect(screen.queryByRole("textbox", { name: "Label" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Edit edge label from A to B" }))

    expect(screen.getByRole("textbox", { name: "Label" })).toHaveValue("TS")
  })

  it("renders many-to-one and one-to-many bezier paths with node-relative energy labels", () => {
    const state = graphCanvasReactionNetworkState()
    const view = renderGraphCanvas(vi.fn(), { state })

    const edgePaths = Array.from(view.container.querySelectorAll(".graph-edge-line"))
    expect(edgePaths).toHaveLength(6)
    expect(edgePaths.every((edgePath) => edgePath.tagName.toLowerCase() === "path")).toBe(true)
    expect(edgePaths.every((edgePath) => edgePath.getAttribute("d")?.includes(" C "))).toBe(true)
    expect(view.container.querySelectorAll(".graph-edge-connect-handle--left")).toHaveLength(7)
    expect(view.container.querySelectorAll(".graph-edge-connect-handle--right")).toHaveLength(7)

    expect(screen.getByRole("button", { name: "Edge Substrate to Pre-intermediate" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edge Catalyst to Pre-intermediate" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edge Post-intermediate to Product" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edge Post-intermediate to Catalyst-release" })).toBeInTheDocument()
    expect(screen.queryByText(/ΔE‡/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ΔG‡/)).not.toBeInTheDocument()
    expect(screen.getAllByText("0.00 kcal/mol").length).toBeGreaterThan(0)
    expect(screen.getByText("18.83 kcal/mol")).toBeInTheDocument()
    expect(screen.getByText("50.20 kcal/mol")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "hartree" } })
    expect(screen.getByText("0.080000 Hartree")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "kj_mol" } })
    expect(screen.getByText("210.04 kJ/mol")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Energy"), { target: { value: "free" } })
    expect(screen.getByText("105.02 kJ/mol")).toBeInTheDocument()
  })

  it("keeps missing free energy labeled as free energy", () => {
    const state = graphCanvasTwoNodeState()
    state.profile = {
      id: "profile-free-missing",
      graph_id: "graph-1",
      path_id: "path-a-b",
      point_count: 2,
      energy_key: "ggas",
      energy_source: "thermochemistry",
      correction_policy: { mode: "none" },
      output_unit: "kcal_mol",
      baseline_node_id: "node-a",
      points: [
        {
          node_id: "node-a",
          label: "A",
          relative_energy: { value: 0, unit: "kcal_mol" },
          expression: {
            node_id: "node-a",
            terms: [],
            corrections: [],
            total: { value: -10, unit: "kcal_mol" },
            missing: [],
          },
        },
        {
          node_id: "node-b",
          label: "B",
          relative_energy: null,
          missing_reason: "missing_energy",
          expression: {
            node_id: "node-b",
            terms: [],
            corrections: [],
            missing: [{ code: "missing_energy", message: "Missing ggas." }],
          },
        },
      ],
    }

    renderGraphCanvas(vi.fn(), {
      state,
      energyDisplayOptions: { mode: "free", unit: "kcal_mol" },
    })

    const nodeB = graphNodeCardById(document.body, "node-b")
    expect(within(nodeB).getByText("ΔG")).toBeInTheDocument()
    expect(within(nodeB).getByText("missing")).toBeInTheDocument()
    expect(within(nodeB).queryByText("ΔE")).not.toBeInTheDocument()
  })

  it("uses object energies when a stale profile has missing node energy", () => {
    const state = graphCanvasTwoNodeState()
    state.profile = {
      id: "profile-electronic-stale-missing",
      graph_id: "graph-1",
      path_id: "path-a-b",
      point_count: 2,
      energy_key: "electronic",
      energy_source: "energies",
      correction_policy: { mode: "none" },
      output_unit: "kcal_mol",
      baseline_node_id: "node-a",
      points: [
        {
          node_id: "node-a",
          label: "A",
          relative_energy: { value: 0, unit: "kcal_mol" },
          expression: {
            node_id: "node-a",
            terms: [],
            corrections: [],
            total: { value: -100, unit: "hartree" },
            missing: [],
          },
        },
        {
          node_id: "node-b",
          label: "B",
          relative_energy: null,
          missing_reason: "missing_energy",
          expression: {
            node_id: "node-b",
            terms: [],
            corrections: [],
            missing: [{ code: "missing_energy", message: "Stale profile missing node energy." }],
          },
        },
      ],
    }

    renderGraphCanvas(vi.fn(), {
      state,
      energyDisplayOptions: { mode: "electronic", unit: "kcal_mol" },
    })

    const nodeB = graphNodeCardById(document.body, "node-b")
    expect(within(nodeB).getByText("ΔE")).toBeInTheDocument()
    expect(within(nodeB).getByText("12.55 kcal/mol")).toBeInTheDocument()
    expect(within(nodeB).queryByText("missing")).not.toBeInTheDocument()
  })

  it("falls back to absolute node energy when relative energy is not comparable", () => {
    const state = graphCanvasTwoNodeState()
    state.objects = state.objects.map((object) => (
      object.id === "object-b"
        ? {
            ...object,
            energies: {
              electronic: {
                value: -80,
                unit: "hartree",
              },
            },
          }
        : object
    ))

    renderGraphCanvas(vi.fn(), {
      state,
      energyDisplayOptions: { mode: "electronic", unit: "kcal_mol" },
    })

    const nodeB = graphNodeCardById(document.body, "node-b")
    expect(within(nodeB).getByText("E")).toBeInTheDocument()
    expect(within(nodeB).getByText("-50200.76 kcal/mol")).toBeInTheDocument()
    expect(within(nodeB).queryByText("missing")).not.toBeInTheDocument()
  })

  it("uses the first path node with the selected energy mode as the default zero point", () => {
    const state = graphCanvasTwoNodeState()
    state.objects = state.objects.map((object) => (
      object.id === "object-b"
        ? {
            ...object,
            thermochemistry_keys: ["ggas"],
            thermochemistry: {
              ggas: {
                value: -99.95,
                unit: "hartree",
              },
            },
          }
        : object
    ))

    renderGraphCanvas(vi.fn(), {
      state,
      energyDisplayOptions: { mode: "free", unit: "kcal_mol" },
    })

    const nodeB = graphNodeCardById(document.body, "node-b")
    expect(within(nodeB).getByText("ΔG")).toBeInTheDocument()
    expect(within(nodeB).getByText("0.00 kcal/mol")).toBeInTheDocument()
    expect(within(nodeB).queryByText("missing")).not.toBeInTheDocument()
  })

  it("does not use single-object solvation corrections as solution free energy", () => {
    const state = graphCanvasTwoNodeState()
    state.objects = state.objects.map((object, index) => ({
      ...object,
      corrections: [{
        id: `corr-solv-${index}`,
        kind: "solvation",
        energy: { value: index === 0 ? 0 : 0.01, unit: "hartree" },
        created_at: "2026-06-09T00:00:00.000Z",
      }],
    }))

    renderGraphCanvas(vi.fn(), {
      state,
      energyDisplayOptions: { mode: "solvation", unit: "kcal_mol" },
    })

    const nodeB = graphNodeCardById(document.body, "node-b")
    expect(within(nodeB).getByText("ΔGsol")).toBeInTheDocument()
    expect(within(nodeB).getByText("missing")).toBeInTheDocument()
    expect(screen.queryByText("6.28 kcal/mol")).not.toBeInTheDocument()
  })

  it("does not read solvation free energy from the electronic energy record", () => {
    const state = graphCanvasTwoNodeState()
    state.objects = state.objects.map((object, index) => ({
      ...object,
      energy_keys: [...(object.energy_keys ?? []), "gsol"],
      energies: {
        electronic: {
          value: index === 0 ? -100 : -99.98,
          unit: "hartree",
        },
        gsol: {
          value: index === 0 ? -100 : -99.99,
          unit: "hartree",
        },
      },
    }))

    renderGraphCanvas(vi.fn(), {
      state,
      energyDisplayOptions: { mode: "solvation", unit: "kcal_mol" },
    })

    const nodeB = graphNodeCardById(document.body, "node-b")
    expect(within(nodeB).getByText("ΔGsol")).toBeInTheDocument()
    expect(within(nodeB).getByText("missing")).toBeInTheDocument()
    expect(screen.queryByText("6.28 kcal/mol")).not.toBeInTheDocument()
  })

  it("lays out energy diagrams from the zero point toward connected products", () => {
    const onApplyAutoLayout = vi.fn()
    renderGraphCanvas(vi.fn(), {
      state: graphCanvasReactionNetworkState(),
      onApplyAutoLayout,
    })

    fireEvent.click(screen.getByRole("button", { name: "Layout by energy" }))

    expect(onApplyAutoLayout).toHaveBeenCalledTimes(1)
    const plan = onApplyAutoLayout.mock.calls[0][0] as GraphLayoutPlan
    expect(plan.strategy).toBe("energy-ranked")
    expect(plan.nodePositions["node-substrate"][0]).toBe(160)
    expect(plan.nodePositions["node-pre"][0]).toBeGreaterThan(plan.nodePositions["node-substrate"][0])
    expect(plan.nodePositions["node-ts"][0]).toBeGreaterThan(plan.nodePositions["node-pre"][0])
    expect(plan.nodePositions["node-post"][0]).toBeGreaterThan(plan.nodePositions["node-ts"][0])
    expect(plan.nodePositions["node-product"][0]).toBeGreaterThan(plan.nodePositions["node-post"][0])
    expect(plan.nodePositions["node-catalyst"][0]).toBeGreaterThan(plan.nodePositions["node-substrate"][0])
    expect(plan.nodePositions["node-substrate"][1]).toBeGreaterThan(plan.nodePositions["node-ts"][1])
  })
})

describe("GraphCanvas drag previews", () => {
  it("previews canvas panning before the viewport is persisted", () => {
    const view = renderGraphCanvas(vi.fn(), {
      state: graphCanvasTwoNodeState(),
      interactionState: {
        ...initialGraphEditorInteractionState,
        mode: "pan",
        dragging: {
          kind: "canvas",
          origin: { x: 0, y: 0 },
          current: { x: 40, y: 20 },
        },
      },
    })

    const layer = view.container.querySelector(".graph-viewport-layer")
    expect(layer).toHaveStyle({
      transform: "translate(2.5%, 2%) scale(1)",
    })
  })

  it("keeps node drag previews continuous and only snaps persisted positions", () => {
    const view = renderGraphCanvas(vi.fn(), {
      state: graphCanvasTwoNodeState(),
      interactionState: {
        ...initialGraphEditorInteractionState,
        dragging: {
          kind: "node",
          nodeIds: ["node-a"],
          origin: { x: 0, y: 0 },
          current: { x: 13, y: 7 },
        },
      },
    })

    const shell = view.container.querySelector('.graph-node-card-shell[data-graph-node-id="node-a"]')
    expect(shell).toHaveStyle({
      left: "8.3125%",
      top: "18.7%",
    })
  })

  it("previews minimap navigation locally and commits viewport only on release", () => {
    const onSetViewport = vi.fn()
    const view = renderGraphCanvas(vi.fn(), {
      state: graphCanvasTwoNodeState(),
      onSetViewport,
    })
    const minimap = screen.getByRole("button", { name: "Navigate graph minimap" })
    mockSurfaceRect(minimap, 162, 98)

    fireEvent.pointerDown(minimap, {
      button: 0,
      clientX: 42,
      clientY: 34,
      pointerId: 33,
    })
    fireEvent.pointerMove(minimap, {
      button: 0,
      clientX: 80,
      clientY: 52,
      pointerId: 33,
    })

    expect(onSetViewport).not.toHaveBeenCalled()

    fireEvent.pointerUp(minimap, {
      button: 0,
      clientX: 80,
      clientY: 52,
      pointerId: 33,
    })

    expect(onSetViewport).toHaveBeenCalledTimes(1)
    expect(view.container.querySelector(".graph-minimap-window--draft")).not.toBeInTheDocument()
  })

  it("previews wheel panning locally and commits the viewport after wheel idle", () => {
    vi.useFakeTimers()
    try {
      const onSetViewport = vi.fn()
      const view = renderGraphCanvas(vi.fn(), {
        state: graphCanvasTwoNodeState(),
        onSetViewport,
      })
      const surface = screen.getByLabelText("Graph canvas surface")
      mockSurfaceRect(surface, 600, 360)
      const layer = view.container.querySelector(".graph-viewport-layer") as HTMLElement

      expect(layer).toHaveStyle({
        transform: "translate(0%, 0%) scale(1)",
      })

      act(() => {
        surface.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: 300,
          clientY: 180,
          deltaX: 12,
          deltaY: 60,
        }))
        surface.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: 300,
          clientY: 180,
          deltaX: 8,
          deltaY: 40,
        }))
        vi.advanceTimersByTime(16)
      })

      expect(onSetViewport).not.toHaveBeenCalled()
      expect(layer.style.transform).not.toBe("translate(0%, 0%) scale(1)")

      act(() => {
        vi.advanceTimersByTime(103)
      })
      expect(onSetViewport).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(onSetViewport).toHaveBeenCalledTimes(1)
      expect(onSetViewport.mock.calls[0][0]).toMatchObject({
        x: expect.any(Number),
        y: expect.any(Number),
        zoom: 1,
      })
    } finally {
      vi.useRealTimers()
    }
  })
})

function renderGraphCanvas(
  onAddRawFileNode: (request: AddRawFileNodeRequest) => void,
  options: {
    state?: WorkbenchDomainState
    interactionState?: GraphEditorInteractionState
    energyDisplayOptions?: CanvasEnergyDisplayOptions
    energyReferenceNodeId?: string | null
    onEnergyDisplayOptionsChange?: (options: CanvasEnergyDisplayOptions) => void
    onEnergyReferenceNodeIdChange?: (nodeId: string | null) => void
    candidateChooser?: ParseCandidateChooserState | null
    onToggleCandidateSelection?: (candidateId: string, selected: boolean) => void
    onConfirmCandidateChooser?: () => void
    onCancelCandidateChooser?: () => void
    onSelectNode?: (nodeId: string, mode?: "replace" | "add" | "toggle") => void
    onSelectEdge?: (edgeId: string, mode?: "replace" | "add" | "toggle") => void
    onRemoveGraphItems?: (request: { nodeIds: string[]; edgeIds: string[]; pathIds: string[] }) => void
    edgeLabelDraft?: ReturnType<typeof edgeLabelDraftFromEdge>
    onStartPointerEdge?: (nodeId: string, position: { x: number; y: number }) => void
    onUpdatePointerEdge?: (position: { x: number; y: number }, targetNodeId: string | null) => void
    onEndPointerEdge?: (targetNodeId: string | null) => void
    onSetViewport?: (viewport: { x: number; y: number; zoom: number }) => void
    onApplyAutoLayout?: (plan: GraphLayoutPlan) => void
    onSetNodeCoefficient?: (nodeId: string, coefficient: number) => void
    onShowNodeSource?: (nodeId: string) => void
    onDismissFloatingPanels?: () => void
  } = {},
) {
  function GraphCanvasHarness() {
    const [energyDisplayOptions, setEnergyDisplayOptions] = useState<CanvasEnergyDisplayOptions>(
      options.energyDisplayOptions ?? { mode: "electronic", unit: "kcal_mol" },
    )
    const [energyReferenceNodeId, setEnergyReferenceNodeId] = useState<string | null>(
      options.energyReferenceNodeId ?? null,
    )
    const handleEnergyDisplayOptionsChange = (nextOptions: CanvasEnergyDisplayOptions) => {
      setEnergyDisplayOptions(nextOptions)
      options.onEnergyDisplayOptionsChange?.(nextOptions)
    }
    const handleEnergyReferenceNodeIdChange = (nodeId: string | null) => {
      setEnergyReferenceNodeId(nodeId)
      options.onEnergyReferenceNodeIdChange?.(nodeId)
    }
    return (
      <GraphCanvas
        state={options.state ?? {
          ...initialWorkbenchDomainState,
          sessionId: "session-1",
        }}
        interactionState={options.interactionState ?? initialGraphEditorInteractionState}
        historyControls={{ canUndo: false, canRedo: false }}
        pathOrderDraft={null}
        edgeLabelDraft={options.edgeLabelDraft ?? initialEdgeLabelDraftState}
        edgeLabelPending={false}
        edgeLabelError={null}
        energyDisplayOptions={energyDisplayOptions}
        energyReferenceNodeId={energyReferenceNodeId}
        candidateChooser={options.candidateChooser ?? null}
        onEnergyDisplayOptionsChange={handleEnergyDisplayOptionsChange}
        onEnergyReferenceNodeIdChange={handleEnergyReferenceNodeIdChange}
        onSelectNode={options.onSelectNode ?? (() => undefined)}
        onSelectEdge={options.onSelectEdge ?? (() => undefined)}
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
        onStartPointerEdge={options.onStartPointerEdge ?? (() => undefined)}
        onUpdatePointerEdge={options.onUpdatePointerEdge ?? (() => undefined)}
        onEndPointerEdge={options.onEndPointerEdge ?? (() => undefined)}
        onCancelPointerEdge={() => undefined}
        onAddObjectNode={() => undefined}
        onAddRawFileNode={onAddRawFileNode}
        onToggleCandidateSelection={options.onToggleCandidateSelection ?? (() => undefined)}
        onConfirmCandidateChooser={options.onConfirmCandidateChooser ?? (() => undefined)}
        onCancelCandidateChooser={options.onCancelCandidateChooser ?? (() => undefined)}
        onMoveNode={() => undefined}
        onUpdateNodeLabel={() => undefined}
        onNudgeNodes={() => undefined}
        onUndoHistory={() => undefined}
        onRedoHistory={() => undefined}
        onApplyAutoLayout={options.onApplyAutoLayout ?? (() => undefined)}
        onRemoveGraphItems={options.onRemoveGraphItems ?? (() => undefined)}
        onClearSelection={() => undefined}
        onDismissFloatingPanels={options.onDismissFloatingPanels}
        onSetViewport={options.onSetViewport ?? (() => undefined)}
        onAutoFitViewport={() => undefined}
        onTogglePanMode={() => undefined}
        onSetNodeCoefficient={options.onSetNodeCoefficient ?? (() => undefined)}
        onShowNodeSource={options.onShowNodeSource ?? (() => undefined)}
      />
    )
  }

  return render(
    <I18nProvider initialLocale="en-US">
      <GraphCanvasHarness />
    </I18nProvider>,
  )
}

function graphCanvasTwoNodeState(): WorkbenchDomainState {
  return {
    ...initialWorkbenchDomainState,
    sessionId: "session-1",
    objects: [
      {
        id: "object-a",
        label: "A.log",
        formula: "H2",
        charge: 0,
        spin_multiplicity: 1,
        energy_keys: ["electronic"],
        thermochemistry_keys: [],
        energies: {
          electronic: {
            value: -100,
            unit: "hartree",
          },
        },
        geometry: [{ element: "H", x: 0, y: 0, z: 0, unit: "angstrom" }],
      },
      {
        id: "object-b",
        label: "B.log",
        formula: "H2",
        charge: 0,
        spin_multiplicity: 1,
        energy_keys: ["electronic"],
        thermochemistry_keys: [],
        energies: {
          electronic: {
            value: -99.98,
            unit: "hartree",
          },
        },
        geometry: [{ element: "H", x: 0, y: 0, z: 0, unit: "angstrom" }],
      },
    ],
    workspace: {
      workspace_id: "workspace-1",
      project_id: "project-1",
      active_path_id: "path-a-b",
      selection: { node_ids: [], edge_ids: [], path_ids: [] },
      viewport: { x: 0, y: 0, zoom: 1 },
      palette: [],
      graph: {
        id: "graph-1",
        project_id: "project-1",
        node_count: 2,
        edge_count: 1,
        path_count: 1,
        nodes: [
          { id: "node-a", kind: "species", label: "A.log", chemical_object_ids: ["object-a"], position: [120, 180] },
          { id: "node-b", kind: "species", label: "B.log", chemical_object_ids: ["object-b"], position: [480, 180] },
        ],
        edges: [{ id: "edge-a-b", from_node: "node-a", to_node: "node-b", label: "TS" }],
        paths: [{ id: "path-a-b", label: "path-a-b", node_ids: ["node-a", "node-b"] }],
      },
      preview: {
        graph_id: "graph-1",
        active_path_id: "path-a-b",
        node_count: 2,
        edge_count: 1,
        path_count: 1,
        disconnected_node_ids: [],
        warnings: [],
      },
    },
  }
}

function graphCanvasReactionNetworkState(): WorkbenchDomainState {
  type ReactionFixtureNode = {
    id: string
    label: string
    objectId: string
    position: [number, number]
  }
  const nodes: ReactionFixtureNode[] = [
    { id: "node-substrate", label: "Substrate.log", objectId: "object-substrate", position: [80, 110] },
    { id: "node-catalyst", label: "Catalyst.log", objectId: "object-catalyst", position: [80, 260] },
    { id: "node-pre", label: "Pre-intermediate.log", objectId: "object-pre", position: [230, 185] },
    { id: "node-ts", label: "TS.log", objectId: "object-ts", position: [360, 185] },
    { id: "node-post", label: "Post-intermediate.log", objectId: "object-post", position: [490, 185] },
    { id: "node-product", label: "Product.log", objectId: "object-product", position: [590, 110] },
    { id: "node-catalyst-release", label: "Catalyst-release.log", objectId: "object-catalyst-release", position: [590, 260] },
  ]
  return {
    ...initialWorkbenchDomainState,
    sessionId: "session-1",
    objects: nodes.map((node, index) => ({
      id: node.objectId,
      label: node.label,
      formula: index === 1 || index === 6 ? "NiL" : "C10H10",
      charge: 0,
      spin_multiplicity: 1,
      method: "B3LYP/def2-SVP",
      source_file_id: node.label,
      energy_keys: ["electronic"],
      thermochemistry_keys: ["gibbs"],
      energies: {
        electronic: {
          value: node.id === "node-pre" ? -100.05 : node.id === "node-ts" ? -100.0 : -100.08,
          unit: "hartree",
        },
      },
      thermochemistry: {
        gibbs: {
          value: node.id === "node-pre" ? -99.96 : node.id === "node-ts" ? -99.95 : -99.99,
          unit: "hartree",
        },
      },
      geometry: [{ element: "C", x: index, y: 0, z: 0, unit: "angstrom" }],
    })),
    workspace: {
      workspace_id: "workspace-1",
      project_id: "project-1",
      active_path_id: "path-catalytic-cycle",
      selection: { node_ids: [], edge_ids: [], path_ids: [] },
      viewport: { x: 0, y: 0, zoom: 1 },
      palette: [],
      graph: {
        id: "graph-1",
        project_id: "project-1",
        node_count: nodes.length,
        edge_count: 6,
        path_count: 1,
        nodes: nodes.map((node) => ({
          id: node.id,
          kind: "species",
          label: node.label,
          chemical_object_ids: [node.objectId],
          position: node.position,
        })),
        edges: [
          { id: "edge-substrate-pre", from_node: "node-substrate", to_node: "node-pre" },
          { id: "edge-catalyst-pre", from_node: "node-catalyst", to_node: "node-pre" },
          { id: "edge-pre-ts", from_node: "node-pre", to_node: "node-ts" },
          { id: "edge-ts-post", from_node: "node-ts", to_node: "node-post" },
          { id: "edge-post-product", from_node: "node-post", to_node: "node-product" },
          { id: "edge-post-catalyst", from_node: "node-post", to_node: "node-catalyst-release" },
        ],
        paths: [{
          id: "path-catalytic-cycle",
          label: "catalytic-cycle",
          node_ids: ["node-substrate", "node-pre", "node-ts", "node-post", "node-product"],
        }],
      },
      preview: {
        graph_id: "graph-1",
        active_path_id: "path-catalytic-cycle",
        node_count: nodes.length,
        edge_count: 6,
        path_count: 1,
        disconnected_node_ids: [],
        warnings: [],
      },
    },
  } satisfies WorkbenchDomainState
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

function graphNodeCardById(container: HTMLElement, nodeId: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`.graph-node-card[data-graph-node-id="${nodeId}"]`)
  if (!node) {
    throw new Error(`Graph node ${nodeId} was not rendered.`)
  }
  return node
}

function mockElementsFromPoint(elements: Element[]) {
  const originalElementsFromPoint = document.elementsFromPoint
  document.elementsFromPoint = vi.fn(() => elements)
  return () => {
    document.elementsFromPoint = originalElementsFromPoint
  }
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
