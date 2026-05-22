import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { BrowserProjectRepositoryError, checksumBrowserStorageBytes, MemoryBrowserProjectRepository } from "../repository"
import { ShellClient, fixtureTransport, type ShellCommandPayload, type ShellResponse, type ShellRuntimeInfo, type ShellTransport } from "../shell"
import { graphObjectDragMimeType } from "./graphObjectDragPayload"
import { WorkbenchShell } from "./WorkbenchShell"
import { I18nProvider, type SupportedLocale } from "./i18n"
import { chemicalObjectsPath, exportArtifactsPath, projectContentIndexPath, reactionGraphsPath, workspacesPath } from "./projectContentBridge"
import {
  createBrowserProjectBundleArchive,
  readBrowserProjectBundleArchive,
  type BrowserProjectBundleEntry,
} from "./projectBundleArchive"

describe("WorkbenchShell", () => {
  it("renders a local-only workbench shell as the first screen", async () => {
    renderWorkbench()

    expect(await screen.findByText("No browser-local projects")).toBeInTheDocument()
    expect(screen.getByRole("main", { name: /rxnflow web workbench/i })).toBeInTheDocument()
    expect(screen.getByLabelText("Language")).toHaveValue("en-US")
    expect(screen.getAllByText("Local-only").length).toBeGreaterThan(0)
    expect(screen.getByText("Runtime Fixture")).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Project Sidebar" })).toBeInTheDocument()
    expect(screen.getByText("No active project")).toBeInTheDocument()
    expect(screen.getByText("No project loaded")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Registered Objects" })).toBeInTheDocument()
    expect(screen.getByText("No registered objects")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add Correction" })).toBeDisabled()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    expect(within(graphCanvas).getByText("No workspace graph")).toBeInTheDocument()
    expect(within(graphCanvas).getByText("No session")).toBeInTheDocument()
    expect(within(graphCanvas).getByRole("button", { name: "Open Workspace" })).toBeDisabled()
    expect(within(graphCanvas).getByRole("button", { name: "Add Node" })).toBeDisabled()
    expect(within(graphCanvas).getByRole("button", { name: "Connect" })).toBeDisabled()
    expect(within(graphCanvas).getByRole("button", { name: "Set Path" })).toBeDisabled()
    expect(within(graphCanvas).getByRole("button", { name: "Delete Selected" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Fixture Run" })).toBeInTheDocument()
  })

  it("switches visible workbench copy between English and Simplified Chinese", async () => {
    renderWorkbench(undefined, "en-US")

    expect(await screen.findByText("No browser-local projects")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "zh-CN" } })

    expect(await screen.findByRole("heading", { name: "工作台" })).toBeInTheDocument()
    expect(screen.getByText("项目侧边栏")).toBeInTheDocument()
    expect(screen.getByText("运行时 Fixture")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "创建项目" })).toBeInTheDocument()
    expect(screen.getByText("暂无浏览器本地项目")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("语言"), { target: { value: "en-US" } })

    expect(await screen.findByRole("heading", { name: "Workbench" })).toBeInTheDocument()
    expect(screen.getByText("Project Sidebar")).toBeInTheDocument()
  })

  it("shows local-http runtime mode and endpoint when configured", async () => {
    renderWorkbench(undefined, "en-US", {
      mode: "local-http",
      transportKind: "http-api",
      endpoint: "http://127.0.0.1:8765/api/shell",
    })

    expect(await screen.findByText("No browser-local projects")).toBeInTheDocument()
    const badge = screen.getByText("Runtime Local HTTP")
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveAttribute("title", "Endpoint http://127.0.0.1:8765/api/shell")
  })

  it("shows transport_unavailable from local-http runtime failures with target", async () => {
    renderWorkbench(undefined, "en-US", {
      mode: "local-http",
      transportKind: "http-api",
      endpoint: "http://127.0.0.1:8765/api/shell",
    }, new ShellClient(new UnavailableHttpTransport()))

    fireEvent.click(await screen.findByRole("button", { name: "Fixture Run" }))

    expect(await screen.findByText("transport_unavailable")).toBeInTheDocument()
    expect(screen.getByText("HTTP shell bridge is unavailable.")).toBeInTheDocument()
    expect(screen.getByText("http-api")).toBeInTheDocument()
  })

  it("projects fixture.run into visible workbench state", async () => {
    renderWorkbench()

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))

    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    expect(screen.getAllByText("profile-a-b-electronic").length).toBeGreaterThan(0)
    const energyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })
    expect(within(energyPanel).getByText("Energy curve")).toBeInTheDocument()
    expect(within(energyPanel).getAllByText("Relative energy").length).toBeGreaterThan(0)
    expect(within(energyPanel).getByText("Expression details")).toBeInTheDocument()
    expect(within(energyPanel).getAllByText("Composition terms").length).toBeGreaterThan(0)
    expect(within(energyPanel).getAllByText("electronic · energies").length).toBeGreaterThan(0)
    expect(within(energyPanel).getAllByText("-12.4").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0)
    const objectRegistry = screen.getByRole("region", { name: "Object Registry" })
    expect(within(objectRegistry).getByRole("button", { name: /object a/i })).toHaveAttribute("aria-current", "true")
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    expect(within(graphCanvas).getByText("graph-a-b")).toBeInTheDocument()
    expect(within(graphCanvas).getByRole("button", { name: /node-a/i })).toBeInTheDocument()
    expect(within(graphCanvas).getByRole("button", { name: /node-b/i })).toBeInTheDocument()
    expect(within(graphCanvas).getAllByText("path-a-b").length).toBeGreaterThan(0)
    expect(within(graphCanvas).getByText("node-a -> node-b")).toBeInTheDocument()
    expect(within(graphCanvas).getByText("No disconnected nodes")).toBeInTheDocument()
    expect(screen.getByText("fixture-parser")).toBeInTheDocument()
    expect(screen.getAllByText("fixture-source").length).toBeGreaterThan(0)
    expect(screen.getByText("electronic")).toBeInTheDocument()
    expect(screen.getByRole("form", { name: "Apply object correction" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add Correction" })).toBeEnabled()
  })

  it("selects object registry entries without invoking shell commands", async () => {
    renderWorkbench()

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    const objectRegistry = screen.getByRole("region", { name: "Object Registry" })
    expect(await within(objectRegistry).findByRole("button", { name: /object b/i })).toBeInTheDocument()

    fireEvent.click(within(objectRegistry).getByRole("button", { name: /object b/i }))

    expect(within(objectRegistry).getByRole("button", { name: /object b/i })).toHaveAttribute("aria-current", "true")
    expect(within(objectRegistry).getByText("H2")).toBeInTheDocument()
    expect(within(objectRegistry).getByText("B3LYP/def2-SVP")).toBeInTheDocument()
    expect(screen.getAllByText("unit_assumed").length).toBeGreaterThan(0)
    expect(screen.getByText("Fixture object B energy unit was assumed during projection.")).toBeInTheDocument()
  })

  it("applies object corrections from the object registry form", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const objectRegistry = screen.getByRole("region", { name: "Object Registry" })
    fireEvent.click(within(objectRegistry).getByRole("button", { name: /object b/i }))
    const form = within(objectRegistry).getByRole("form", { name: "Apply object correction" })

    fireEvent.change(within(form).getByLabelText("Kind"), { target: { value: "solvation" } })
    fireEvent.change(within(form).getByLabelText("Value"), { target: { value: "-2.4" } })
    fireEvent.change(within(form).getByLabelText("Reference"), { target: { value: "SMD" } })
    fireEvent.change(within(form).getByLabelText("Note"), { target: { value: "fixture solvation" } })
    fireEvent.click(within(form).getByRole("button", { name: "Add Correction" }))

    expect(await within(objectRegistry).findByText("solvation")).toBeInTheDocument()
    expect(within(objectRegistry).getByText("-2.4 kcal_mol · SMD")).toBeInTheDocument()
    expect(within(objectRegistry).getByText("fixture solvation")).toBeInTheDocument()
    expect(within(objectRegistry).getAllByText("1").length).toBeGreaterThanOrEqual(1)
    expect(lastPayload(transport, "registry.apply_correction")?.args).toMatchObject({
      object_id: "object-b",
      correction: {
        kind: "solvation",
        energy: { value: -2.4, unit: "kcal_mol", reference: "SMD" },
        note: "fixture solvation",
      },
    })

    const energyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })
    fireEvent.change(within(energyPanel).getByLabelText("Correction policy"), { target: { value: "all" } })
    fireEvent.click(within(energyPanel).getByRole("button", { name: "Compute" }))

    expect(await within(energyPanel).findByText("Correction terms")).toBeInTheDocument()
    expect(within(energyPanel).getByText(/^corr-object-b-solvation-/)).toBeInTheDocument()
  })

  it("shows registry correction errors without locally appending corrections", async () => {
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(new FailingCorrectionTransport()))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const objectRegistry = screen.getByRole("region", { name: "Object Registry" })
    const form = within(objectRegistry).getByRole("form", { name: "Apply object correction" })

    fireEvent.change(within(form).getByLabelText("Value"), { target: { value: "-2.4" } })
    fireEvent.click(within(form).getByRole("button", { name: "Add Correction" }))

    expect((await screen.findAllByText("invalid_input")).length).toBeGreaterThan(0)
    expect(screen.getAllByText("correction.energy.unit").length).toBeGreaterThan(0)
    expect(within(objectRegistry).getByText("No correction terms")).toBeInTheDocument()
  })

  it("opens the graph workspace and applies add, connect, and set path commands", async () => {
    renderWorkbench()

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const objectRegistry = screen.getByRole("region", { name: "Object Registry" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Open Workspace" }))
    expect((await within(graphCanvas).findAllByText("path-a-b")).length).toBeGreaterThan(0)
    expect(within(graphCanvas).getByText("node-a -> node-b")).toBeInTheDocument()

    fireEvent.click(within(objectRegistry).getByRole("button", { name: /object b/i }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Add Node" }))

    expect((await within(graphCanvas).findAllByText("node-web-3")).length).toBeGreaterThan(0)
    expect(within(graphCanvas).getAllByText("object-b").length).toBeGreaterThan(0)
    expect(within(graphCanvas).getByText("Disconnected nodes")).toBeInTheDocument()

    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-b/i }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Connect" }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-web-3/i }))

    expect(await within(graphCanvas).findByText("No disconnected nodes")).toBeInTheDocument()
    expect(within(graphCanvas).getAllByText("2").length).toBeGreaterThan(0)

    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-b/i }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Connect" }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-web-3/i }))
    expect(within(graphCanvas).getAllByText("2").length).toBeGreaterThan(0)

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Set Path" }))

    expect((await within(graphCanvas).findAllByText("path-web-main")).length).toBeGreaterThan(0)
    expect(within(graphCanvas).getByText("node-a -> node-b -> node-web-3")).toBeInTheDocument()
  })

  it("drags registered objects from the object registry into the graph canvas", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const objectRegistry = screen.getByRole("region", { name: "Object Registry" })
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    mockCanvasSurfaceRect(within(graphCanvas).getByLabelText("Graph canvas surface"), 600, 360)
    const objectBButton = within(objectRegistry).getByRole("button", { name: /object b/i })
    const dataTransfer = new TestDataTransfer()

    fireEvent.dragStart(objectBButton, { dataTransfer })

    expect(dataTransfer.getData(graphObjectDragMimeType)).toContain("\"objectId\":\"object-b\"")

    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")
    fireEvent.dragOver(surface, { dataTransfer })
    dispatchDrop(surface, dataTransfer, 240, 180)

    expect((await within(graphCanvas).findAllByText("node-web-3")).length).toBeGreaterThan(0)
    expect(within(graphCanvas).getAllByText("object-b").length).toBeGreaterThan(0)
    const addNodePayload = transport.payloads.find((payload) => payload.command === "workspace.add_node")
    expect(addNodePayload?.args).toMatchObject({
      chemical_object_ids: ["object-b"],
      position: [240, 180],
    })
  })

  it("applies viewport zoom, fit, reset and keeps drop coordinates in graph space", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")
    mockCanvasSurfaceRect(surface)

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Zoom In" }))

    await within(graphCanvas).findByLabelText("120%")
    const zoomPayload = lastPayload(transport, "workspace.set_viewport")
    expect(zoomPayload?.args).toMatchObject({
      viewport: {
        x: 50,
        y: 30,
        zoom: expect.closeTo(1.2, 6),
      },
    })

    const objectRegistry = screen.getByRole("region", { name: "Object Registry" })
    const objectBButton = within(objectRegistry).getByRole("button", { name: /object b/i })
    const dataTransfer = new TestDataTransfer()
    fireEvent.dragStart(objectBButton, { dataTransfer })
    fireEvent.dragOver(surface, { dataTransfer })
    dispatchDrop(surface, dataTransfer, 450, 210)

    expect((await within(graphCanvas).findAllByText("node-web-3")).length).toBeGreaterThan(0)
    expect(lastPayload(transport, "workspace.add_node")?.args).toMatchObject({
      chemical_object_ids: ["object-b"],
      position: [300, 180],
    })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Fit" }))
    await waitFor(() => {
      const fitPayload = lastPayload(transport, "workspace.set_viewport")
      expect(fitPayload?.args.viewport).toMatchObject({
        zoom: expect.any(Number),
      })
      expect((fitPayload?.args.viewport as { zoom?: number }).zoom).toBeGreaterThan(1)
    })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Reset" }))
    await within(graphCanvas).findByLabelText("100%")
    expect(lastPayload(transport, "workspace.set_viewport")?.args).toMatchObject({
      viewport: { x: 0, y: 0, zoom: 1 },
    })
  })

  it("moves graph nodes through workspace.move_node while keeping click selection", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const nodeB = within(graphCanvas).getByRole("button", { name: /node-b/i })

    fireEvent.click(nodeB)
    expect(nodeB).toHaveAttribute("aria-current", "true")
    expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node")).toHaveLength(0)

    fireEvent.pointerDown(nodeB, { button: 0, clientX: 360, clientY: 160, pointerId: 1 })
    fireEvent.pointerMove(nodeB, { button: 0, clientX: 420, clientY: 210, pointerId: 1 })
    fireEvent.pointerUp(nodeB, { button: 0, clientX: 420, clientY: 210, pointerId: 1 })

    const movePayload = transport.payloads.find((payload) => payload.command === "workspace.move_node")
    expect(movePayload?.args).toMatchObject({
      node_id: "node-b",
      position: [420, 220],
    })
    expect(await within(graphCanvas).findByRole("button", { name: /node-b/i })).toHaveStyle({
      left: "70%",
    })
  })

  it("keeps node drag release coordinates in graph space after zoom", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    mockCanvasSurfaceRect(within(graphCanvas).getByLabelText("Graph canvas surface"))

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Zoom In" }))
    await within(graphCanvas).findByLabelText("120%")
    const nodeB = within(graphCanvas).getByRole("button", { name: /node-b/i })

    fireEvent.pointerDown(nodeB, { button: 0, clientX: 450, clientY: 210, pointerId: 1 })
    fireEvent.pointerMove(nodeB, { button: 0, clientX: 510, clientY: 270, pointerId: 1 })
    fireEvent.pointerUp(nodeB, { button: 0, clientX: 510, clientY: 270, pointerId: 1 })

    expect(lastPayload(transport, "workspace.move_node")?.args).toMatchObject({
      node_id: "node-b",
      position: [400, 200],
    })
  })

  it("pans the empty canvas surface in pan mode without affecting node drag", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")
    mockCanvasSurfaceRect(surface, 600, 360)

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Pan" }))
    expect(within(graphCanvas).getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "true")
    fireEvent.pointerDown(surface, { button: 0, clientX: 240, clientY: 180, pointerId: 1 })
    fireEvent.pointerMove(surface, { button: 0, clientX: 300, clientY: 220, pointerId: 1 })
    fireEvent.pointerUp(surface, { button: 0, clientX: 300, clientY: 220, pointerId: 1 })

    expect(lastPayload(transport, "workspace.set_viewport")?.args).toMatchObject({
      viewport: {
        x: expect.closeTo(-60, 6),
        y: expect.closeTo(-40, 6),
        zoom: 1,
      },
    })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Reset" }))
    await within(graphCanvas).findByLabelText("100%")
    const viewportLayer = graphCanvas.querySelector(".graph-viewport-layer") as HTMLElement
    fireEvent.pointerDown(viewportLayer, { button: 0, clientX: 240, clientY: 180, pointerId: 3 })
    fireEvent.pointerMove(surface, { button: 0, clientX: 280, clientY: 210, pointerId: 3 })
    fireEvent.pointerUp(surface, { button: 0, clientX: 280, clientY: 210, pointerId: 3 })
    expect(lastPayload(transport, "workspace.set_viewport")?.args).toMatchObject({
      viewport: {
        x: expect.closeTo(-40, 6),
        y: expect.closeTo(-30, 6),
        zoom: 1,
      },
    })

    const viewportCommandCount = transport.payloads.filter((payload) => payload.command === "workspace.set_viewport").length
    const nodeB = within(graphCanvas).getByRole("button", { name: /node-b/i })
    fireEvent.pointerDown(nodeB, { button: 0, clientX: 360, clientY: 160, pointerId: 2 })
    fireEvent.pointerMove(nodeB, { button: 0, clientX: 400, clientY: 200, pointerId: 2 })
    fireEvent.pointerUp(nodeB, { button: 0, clientX: 400, clientY: 200, pointerId: 2 })

    expect(transport.payloads.filter((payload) => payload.command === "workspace.set_viewport")).toHaveLength(viewportCommandCount)
    expect(lastPayload(transport, "workspace.move_node")?.args).toMatchObject({
      node_id: "node-b",
    })
    await waitFor(() => expect(within(graphCanvas).getByRole("button", { name: /node-b/i })).toBeInTheDocument())
  })

  it("applies graph auto layout through stable workspace move commands", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Apply Layout" }))

    await within(graphCanvas).findByText("Layout applied")
    const movePayloads = transport.payloads.filter((payload) => payload.command === "workspace.move_node")
    expect(movePayloads.map((payload) => payload.args.node_id)).toEqual(["node-a", "node-b"])
    expect(movePayloads.map((payload) => payload.args.position)).toEqual([[80, 180], [520, 180]])
    const viewportPayload = lastPayload(transport, "workspace.set_viewport")
    expect(viewportPayload?.args.viewport).toMatchObject({
      zoom: expect.any(Number),
    })
    expect(await within(graphCanvas).findByRole("button", { name: /node-a/i })).toHaveStyle({
      left: "13.333333333333334%",
    })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Apply Layout" }))

    await within(graphCanvas).findByText("Layout already clean")
    expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node")).toHaveLength(2)
  })

  it("selects and deletes graph edges through workspace.remove", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const edge = within(graphCanvas).getByRole("button", { name: "Edge Object A to Object B" })

    fireEvent.click(edge)
    expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { edge_ids: ["edge-a-b"] },
    })
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Delete Selected" }))

    const removePayload = transport.payloads.find((payload) => payload.command === "workspace.remove")
    expect(removePayload?.args).toMatchObject({
      edge_ids: ["edge-a-b"],
    })
    await waitFor(() => expect(within(graphCanvas).getByText("0")).toBeInTheDocument())
    expect(within(graphCanvas).queryByRole("button", { name: "Edge Object A to Object B" })).not.toBeInTheDocument()
    expect(within(graphCanvas).getAllByText("node-a").length).toBeGreaterThan(0)
    expect(within(graphCanvas).getAllByText("node-b").length).toBeGreaterThan(0)
  })

  it("deletes selected graph nodes using shell cascade results", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-a/i }))
    expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a"] },
    })
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Delete Selected" }))

    await waitFor(() => {
      expect(lastPayload(transport, "workspace.remove")?.args).toMatchObject({
        node_ids: ["node-a"],
      })
    })
    await waitFor(() => expect(within(graphCanvas).queryByRole("button", { name: /node-a/i })).not.toBeInTheDocument())
    expect(within(graphCanvas).queryByRole("button", { name: "Edge Object A to Object B" })).not.toBeInTheDocument()
    expect(within(graphCanvas).queryByText("path-a-b")).not.toBeInTheDocument()
    expect(within(graphCanvas).getAllByText("node-b").length).toBeGreaterThan(0)
  })

  it("deletes selected graph paths without removing nodes or edges", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Select path Fixture path" }))
    expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { path_ids: ["path-a-b"] },
    })
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Delete Selected" }))

    await waitFor(() => {
      expect(lastPayload(transport, "workspace.remove")?.args).toMatchObject({
        path_ids: ["path-a-b"],
      })
    })
    await waitFor(() => expect(within(graphCanvas).queryByText("path-a-b")).not.toBeInTheDocument())
    expect(within(graphCanvas).getAllByText("node-a").length).toBeGreaterThan(0)
    expect(within(graphCanvas).getAllByText("node-b").length).toBeGreaterThan(0)
    expect(within(graphCanvas).getByRole("button", { name: "Edge Object A to Object B" })).toBeInTheDocument()
    expect(within(graphCanvas).getByText("No paths")).toBeInTheDocument()
  })

  it("edits selected node composition through a Composition Draft before applying workspace.set_node_composition", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-a/i }))
    const editor = within(graphCanvas).getByRole("form", { name: "Node Composition Editor" })
    expect(within(editor).getByDisplayValue("1")).toBeInTheDocument()
    fireEvent.click(within(editor).getByRole("button", { name: "Add" }))
    const objectSelects = within(editor).getAllByLabelText("Object")
    const coefficientInputs = within(editor).getAllByLabelText("Coef")
    const roleSelects = within(editor).getAllByLabelText("Role")

    fireEvent.change(objectSelects[1], { target: { value: "object-b" } })
    fireEvent.change(coefficientInputs[1], { target: { value: "2" } })
    fireEvent.change(roleSelects[1], { target: { value: "reagent" } })
    fireEvent.click(within(editor).getByRole("button", { name: "Apply" }))

    await waitFor(() => expect(lastPayload(transport, "workspace.set_node_composition")?.args).toMatchObject({
      node_id: "node-a",
      composition: [
        { object_id: "object-a", coefficient: 1, role: null, label: null, metadata: {} },
        { object_id: "object-b", coefficient: 2, role: "reagent", label: null, metadata: {} },
      ],
    }))
    expect(within(graphCanvas).getAllByText("object-a + 2*object-b").length).toBeGreaterThan(0)
  })

  it("shows composition coefficient errors without sending workspace.set_node_composition", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-a/i }))
    const editor = within(graphCanvas).getByRole("form", { name: "Node Composition Editor" })
    fireEvent.change(within(editor).getByLabelText("Coef"), { target: { value: "0" } })
    fireEvent.click(within(editor).getByRole("button", { name: "Apply" }))

    expect(await within(editor).findByText("invalid_input")).toBeInTheDocument()
    expect(within(editor).getByText("composition.0.coefficient")).toBeInTheDocument()
    expect(transport.payloads.filter((payload) => payload.command === "workspace.set_node_composition")).toHaveLength(0)
  })

  it("edits path order through a UI draft before applying workspace.set_path", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Select path Fixture path" }))
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { path_ids: ["path-a-b"] },
    }))
    const setPathCountBeforeDraftApply = transport.payloads.filter((payload) => payload.command === "workspace.set_path").length
    await waitFor(() => expect(within(graphCanvas).getAllByRole("button", { name: "Up" }).length).toBeGreaterThan(1))
    fireEvent.click(within(graphCanvas).getAllByRole("button", { name: "Up" })[1])

    expect(transport.payloads.filter((payload) => payload.command === "workspace.set_path")).toHaveLength(setPathCountBeforeDraftApply)
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Apply Path Order" }))

    const setPathPayloads = transport.payloads.filter((payload) => payload.command === "workspace.set_path")
    expect(setPathPayloads.at(-1)?.args).toMatchObject({
      path_id: "path-a-b",
      node_ids: ["node-b", "node-a"],
    })
    expect(await within(graphCanvas).findByText("node-b -> node-a")).toBeInTheDocument()
  })

  it("ignores unsupported graph canvas drops without shell commands", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const dataTransfer = new TestDataTransfer()
    dataTransfer.setData(graphObjectDragMimeType, JSON.stringify({
      kind: "registered-object",
      objectId: "object-missing",
      label: "Missing",
    }))

    fireEvent.drop(within(graphCanvas).getByLabelText("Graph canvas surface"), {
      clientX: 240,
      clientY: 180,
      dataTransfer,
    })

    expect(transport.payloads.filter((payload) => payload.command === "workspace.add_node")).toHaveLength(0)
    expect(within(graphCanvas).queryByText("node-web-3")).not.toBeInTheDocument()
  })

  it("shows missing energy reasons without converting them to zero", async () => {
    renderWorkbench()

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const objectRegistry = screen.getByRole("region", { name: "Object Registry" })

    fireEvent.change(screen.getByLabelText("Select Files"), {
      target: {
        files: [new File(["2\nwater"], "water.xyz", { type: "chemical/x-xyz" })],
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Preview" }))
    expect(await screen.findByText("import-batch-fixture-web-1")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Register All" }))
    expect((await screen.findAllByText("object-imported-water")).length).toBeGreaterThan(0)

    fireEvent.click(within(objectRegistry).getByRole("button", { name: /water.xyz/i }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Add Node" }))
    expect((await within(graphCanvas).findAllByText("node-web-3")).length).toBeGreaterThan(0)
    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-b/i }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Connect" }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-web-3/i }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Set Path" }))
    expect((await within(graphCanvas).findAllByText("path-web-main")).length).toBeGreaterThan(0)

    const energyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })
    fireEvent.click(within(energyPanel).getByRole("button", { name: "Compute" }))

    expect((await within(energyPanel).findAllByText("missing_energy")).length).toBeGreaterThan(0)
    const rows = within(energyPanel).getAllByRole("row")
    const missingRow = rows.find((row) => row.textContent?.includes("node-web-3"))
    expect(missingRow?.textContent).toContain("missing_energy")
    expect(missingRow?.textContent).not.toContain("-5.2")
    expect(within(energyPanel).getAllByText("Missing").length).toBeGreaterThan(0)
    const exportPanel = screen.getByRole("region", { name: "Report Export Panel" })
    expect(within(exportPanel).getByText("1 missing, exported as missing")).toBeInTheDocument()
  })

  it("renders invalid shell command errors with the error code visible", async () => {
    renderWorkbench()

    fireEvent.click(screen.getByRole("button", { name: "Invalid command" }))

    expect(await screen.findByText("invalid_input")).toBeInTheDocument()
    expect(screen.getByText(/Unknown shell command/)).toBeInTheDocument()
  })

  it("computes the active path energy profile from the energy panel", async () => {
    renderWorkbench()

    const emptyEnergyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })
    expect(within(emptyEnergyPanel).getByRole("button", { name: "Compute" })).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const energyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })
    expect(within(energyPanel).getByRole("button", { name: "Compute" })).toBeEnabled()
    fireEvent.change(within(energyPanel).getByLabelText("Output unit"), { target: { value: "kj_mol" } })
    fireEvent.change(within(energyPanel).getByLabelText("Correction policy"), { target: { value: "all" } })
    fireEvent.click(within(energyPanel).getByRole("button", { name: "Compute" }))

    expect((await within(energyPanel).findAllByText("profile-path-a-b-electronic-kj_mol")).length).toBeGreaterThan(0)
    expect(within(energyPanel).getAllByText("kj_mol").length).toBeGreaterThan(0)
    expect(screen.getAllByText("corrections_empty").length).toBeGreaterThan(0)
    expect(within(energyPanel).getByText("Expression details")).toBeInTheDocument()
    expect(within(energyPanel).getAllByText("-51.882").length).toBeGreaterThan(0)
  })

  it("selects graph nodes from interactive energy curve points", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const energyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })

    expect(within(energyPanel).getByLabelText(/Object A node-a/)).toHaveAttribute("tabindex", "0")
    fireEvent.click(within(energyPanel).getByLabelText(/Object B node-b/))

    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-b"], edge_ids: [], path_ids: [] },
    }))
    await waitFor(() => expect(within(graphCanvas).getByRole("button", { name: /node-b/i })).toHaveAttribute("aria-current", "true"))
    const pointDetail = within(energyPanel).getByLabelText("Point detail")
    expect(within(pointDetail).getByText("Object B")).toBeInTheDocument()
    expect(within(pointDetail).getByText("node-b")).toBeInTheDocument()
    expect(within(pointDetail).getAllByText("-12.4 kcal_mol").length).toBeGreaterThan(0)
  })

  it("maps correction policy none, all, kinds, and ids to energy.compute args", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const energyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })

    fireEvent.click(within(energyPanel).getByRole("button", { name: "Compute" }))
    await waitFor(() => expect(lastPayload(transport, "energy.compute")?.args).toMatchObject({
      include_corrections: false,
      correction_policy: { mode: "none" },
    }))

    fireEvent.change(within(energyPanel).getByLabelText("Correction policy"), { target: { value: "all" } })
    fireEvent.click(within(energyPanel).getByRole("button", { name: "Compute" }))
    await waitFor(() => expect(lastPayload(transport, "energy.compute")?.args).toMatchObject({
      include_corrections: true,
      correction_policy: { mode: "all" },
    }))

    fireEvent.change(within(energyPanel).getByLabelText("Correction policy"), { target: { value: "kinds" } })
    fireEvent.click(within(energyPanel).getByLabelText("manual"))
    fireEvent.click(within(energyPanel).getByRole("button", { name: "Compute" }))
    await waitFor(() => expect(lastPayload(transport, "energy.compute")?.args).toMatchObject({
      include_corrections: true,
      correction_policy: { mode: "kinds", kinds: ["solvation", "resonance"] },
    }))

    fireEvent.change(within(energyPanel).getByLabelText("Correction policy"), { target: { value: "ids" } })
    fireEvent.change(within(energyPanel).getByLabelText("Correction IDs"), { target: { value: "corr-a, corr-b corr-c" } })
    fireEvent.click(within(energyPanel).getByRole("button", { name: "Compute" }))
    await waitFor(() => expect(lastPayload(transport, "energy.compute")?.args).toMatchObject({
      include_corrections: true,
      correction_policy: { mode: "ids", ids: ["corr-a", "corr-b", "corr-c"] },
    }))
  })

  it("selects thermochemistry energy channels and sends energy_source to energy.compute", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const energyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })

    expect(within(energyPanel).getByText("thermochemistry:gibbs · hartree · 2")).toBeInTheDocument()
    fireEvent.change(within(energyPanel).getByLabelText("Energy channel"), {
      target: { value: "thermochemistry:gibbs" },
    })
    fireEvent.click(within(energyPanel).getByRole("button", { name: "Compute" }))

    await waitFor(() => expect(lastPayload(transport, "energy.compute")?.args).toMatchObject({
      energy_key: "gibbs",
      energy_source: "thermochemistry",
    }))
    expect((await within(energyPanel).findAllByText("profile-path-a-b-gibbs-thermochemistry-kcal_mol")).length).toBeGreaterThan(0)
  })

  it("shows composition coefficients in energy expression details after composition edits", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-a/i }))
    const editor = within(graphCanvas).getByRole("form", { name: "Node Composition Editor" })
    fireEvent.click(within(editor).getByRole("button", { name: "Add" }))
    const objectSelects = within(editor).getAllByLabelText("Object")
    const coefficientInputs = within(editor).getAllByLabelText("Coef")
    fireEvent.change(objectSelects[1], { target: { value: "object-b" } })
    fireEvent.change(coefficientInputs[1], { target: { value: "2" } })
    fireEvent.click(within(editor).getByRole("button", { name: "Apply" }))
    await waitFor(() => expect(lastPayload(transport, "workspace.set_node_composition")).toBeTruthy())

    const energyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })
    fireEvent.click(within(energyPanel).getByRole("button", { name: "Compute" }))

    expect(within(graphCanvas).getAllByText("object-a + 2*object-b").length).toBeGreaterThan(0)
    const expressionDetails = within(energyPanel).getByLabelText("Expression details")
    await waitFor(() => expect(within(expressionDetails).getAllByText("coef 2").length).toBeGreaterThan(0))
    expect(within(expressionDetails).getAllByText("electronic · energies").length).toBeGreaterThan(0)
  })

  it("exports profile artifacts with inline download links", async () => {
    renderWorkbench()

    const emptyExportPanel = screen.getByRole("region", { name: "Report Export Panel" })
    expect(within(emptyExportPanel).getByRole("button", { name: "Export" })).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const exportPanel = screen.getByRole("region", { name: "Report Export Panel" })
    expect(within(exportPanel).getByLabelText("png")).toBeChecked()
    expect(within(exportPanel).getByLabelText("cdxml")).toBeChecked()
    expect(within(exportPanel).getByLabelText("xlsx")).toBeChecked()
    expect(within(exportPanel).getByLabelText("Include bytes")).toBeChecked()
    expect(within(exportPanel).getByText("Export readiness")).toBeInTheDocument()
    expect(within(exportPanel).getByText("Not browser-local persisted")).toBeInTheDocument()
    expect(within(exportPanel).getByText("CDXML only; no CDX")).toBeInTheDocument()

    fireEvent.click(within(exportPanel).getByRole("button", { name: "Export" }))

    expect(await within(exportPanel).findByText("artifact-png-rxnflow-profile")).toBeInTheDocument()
    expect(within(exportPanel).getByText("artifact-cdxml-rxnflow-profile")).toBeInTheDocument()
    expect(within(exportPanel).getByText("artifact-xlsx-rxnflow-profile")).toBeInTheDocument()
    expect(within(exportPanel).getByText("fixture-png-energy-plot-v1")).toBeInTheDocument()
    expect(within(exportPanel).getByText("fixture-cdxml-energy-v1")).toBeInTheDocument()
    expect(within(exportPanel).getByText("fixture-xlsx-energy-table-v1")).toBeInTheDocument()
    expect(within(exportPanel).getByText("energy_table_schema_version")).toBeInTheDocument()
    expect(within(exportPanel).getByText("energy-table-v1")).toBeInTheDocument()
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })).toHaveLength(3)
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[0]).toHaveAttribute("download", "rxnflow-profile.png")
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[0].getAttribute("href")).toMatch(/^data:image\/png;base64,/)
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[1]).toHaveAttribute("download", "rxnflow-profile.cdxml")
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[1].getAttribute("href")).toMatch(/^data:chemical\/x-cdxml;base64,/)
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[2]).toHaveAttribute("download", "rxnflow-profile.xlsx")
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[2].getAttribute("href")).toMatch(/^data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet;base64,/)
    expect(screen.getAllByText("chemdraw_cdxml_only").length).toBeGreaterThan(0)
    expect(screen.getByText("3 artifacts indexed")).toBeInTheDocument()
  })

  it("persists exported inline artifacts into the active browser project", async () => {
    const repository = new MemoryBrowserProjectRepository()
    await createProjectWithContent(repository, "Export Project")
    renderWorkbench(repository)

    fireEvent.click(await screen.findByRole("button", { name: /export project/i }))
    expect(await screen.findByText("Project content files are readable.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const exportPanel = screen.getByRole("region", { name: "Report Export Panel" })
    fireEvent.click(within(exportPanel).getByRole("button", { name: "Export" }))

    expect(await within(exportPanel).findByText("exports/rxnflow-profile.png")).toBeInTheDocument()
    expect(within(exportPanel).getByText("exports/rxnflow-profile.cdxml")).toBeInTheDocument()
    expect(within(exportPanel).getByText("exports/rxnflow-profile.xlsx")).toBeInTheDocument()
    expect(within(exportPanel).getAllByText("Yes").length).toBeGreaterThanOrEqual(3)
    expect(within(exportPanel).getAllByText(/sha256:[a-f0-9]{64}/i).length).toBeGreaterThanOrEqual(3)
    const [project] = await repository.listProjects()
    await expect(repository.exists(project.projectRef, "exports/rxnflow-profile.png")).resolves.toBe(true)
    const exportIndex = JSON.parse(new TextDecoder().decode((await repository.readObject(project.projectRef, exportArtifactsPath)).bytes))
    expect(exportIndex.artifacts).toHaveLength(3)
    expect(exportIndex.artifacts[0]).toMatchObject({
      id: "artifact-cdxml-rxnflow-profile",
      path: "exports/rxnflow-profile.cdxml",
      checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
    expect(await screen.findByText("Project content files are readable.")).toBeInTheDocument()
  })

  it("shows exported artifacts without download links when inline bytes are disabled", async () => {
    const repository = new MemoryBrowserProjectRepository()
    await createProjectWithContent(repository, "No Bytes")
    renderWorkbench(repository)

    fireEvent.click(await screen.findByRole("button", { name: /no bytes/i }))
    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const exportPanel = screen.getByRole("region", { name: "Report Export Panel" })
    fireEvent.click(within(exportPanel).getByLabelText("Include bytes"))
    expect(within(exportPanel).getByText("Runtime metadata only")).toBeInTheDocument()
    fireEvent.click(within(exportPanel).getByRole("button", { name: "Export" }))

    expect(await within(exportPanel).findByText("artifact-png-rxnflow-profile")).toBeInTheDocument()
    expect(within(exportPanel).queryByRole("link", { name: "Download" })).not.toBeInTheDocument()
    expect(within(exportPanel).getAllByText("Download unavailable")).toHaveLength(3)
    const [project] = await repository.listProjects()
    await expect(repository.exists(project.projectRef, "exports/rxnflow-profile.png")).resolves.toBe(false)
    const exportIndex = JSON.parse(new TextDecoder().decode((await repository.readObject(project.projectRef, exportArtifactsPath)).bytes))
    expect(exportIndex.artifacts).toHaveLength(0)
  })

  it("keeps runtime export artifacts visible when browser persistence fails", async () => {
    const repository = new FailingExportProjectRepository()
    await createProjectWithContent(repository, "Quota Project")
    renderWorkbench(repository)

    fireEvent.click(await screen.findByRole("button", { name: /quota project/i }))
    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const exportPanel = screen.getByRole("region", { name: "Report Export Panel" })
    fireEvent.click(within(exportPanel).getByRole("button", { name: "Export" }))

    expect(await within(exportPanel).findByText("artifact-png-rxnflow-profile")).toBeInTheDocument()
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })).toHaveLength(3)
    expect(within(exportPanel).getAllByText("No").length).toBeGreaterThanOrEqual(3)
    expect(screen.getAllByText("artifact_persistence_failed").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Browser local storage quota would be exceeded.").length).toBeGreaterThan(0)
    expect(screen.getAllByText("exports").length).toBeGreaterThan(0)
  })

  it("queues import files, previews parser results, and registers confirmed objects", async () => {
    renderWorkbench()

    expect(await screen.findByText("No browser-local projects")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()

    const input = screen.getByLabelText("Select Files")
    fireEvent.change(input, {
      target: {
        files: [
          new File(["2\nwater"], "water.xyz", { type: "chemical/x-xyz" }),
          new File(["bad"], "bad-count.xyz", { type: "chemical/x-xyz" }),
        ],
      },
    })
    fireEvent.change(screen.getByLabelText("Expected format"), { target: { value: "xyz" } })
    fireEvent.click(screen.getByLabelText("Strict parser"))

    expect(screen.getByText("water.xyz")).toBeInTheDocument()
    expect(screen.getByText("bad-count.xyz")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Preview" }))

    expect(await screen.findByText("import-batch-fixture-web-1")).toBeInTheDocument()
    expect(screen.getByText("xyz-ase")).toBeInTheDocument()
    expect(screen.getAllByText("fixture-web").length).toBeGreaterThan(0)
    expect(screen.getByText("inputs/raw/water.xyz")).toBeInTheDocument()
    expect(screen.getAllByText("missing_section").length).toBeGreaterThan(0)
    expect(screen.getByText("parse_failed")).toBeInTheDocument()
    expect(screen.getAllByText("unit_assumed").length).toBeGreaterThan(0)
    expect(screen.getAllByText("1").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Register All" })).toBeEnabled()

    fireEvent.click(screen.getByRole("button", { name: "Register All" }))

    expect((await screen.findAllByText("object-imported-water")).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Registered").length).toBeGreaterThan(0)
    expect(screen.getByText("3")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /water.xyz/i }))
    expect(screen.getByRole("button", { name: /water.xyz/i })).toHaveAttribute("aria-current", "true")
    expect(screen.getByText("H2O")).toBeInTheDocument()
    expect(screen.getAllByText("raw-water-xyz").length).toBeGreaterThan(0)
    expect(screen.getAllByText("xyz-ase").length).toBeGreaterThan(0)
  })

  it("sends inline byte import preview payloads in local-http runtime mode", async () => {
    const transport = new RecordingImportPreviewTransport()
    renderWorkbench(undefined, "en-US", {
      mode: "local-http",
      transportKind: "http-api",
      endpoint: "http://127.0.0.1:8765/api/shell",
    }, new ShellClient(transport))

    expect(await screen.findByText("No browser-local projects")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Select Files"), {
      target: {
        files: [new File(["2\nwater\n"], "water.xyz", { type: "chemical/x-xyz" })],
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Preview" }))

    expect(await screen.findByText("import-batch-fixture-web-1")).toBeInTheDocument()
    const previewPayload = transport.payloads.find((payload) => payload.command === "import.preview")
    expect(previewPayload?.args).toMatchObject({
      session_id: "session-fixture-web",
      sources: [
        {
          kind: "inline_bytes",
          filename: "water.xyz",
          bytes_base64: "Mgp3YXRlcgo=",
          mime_type: "chemical/x-xyz",
        },
      ],
      strict: false,
    })
    expect(screen.getAllByText("Inline bytes").length).toBeGreaterThan(0)
  })

  it("persists selected import files as raw inputs in the active browser project before preview", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await createProjectWithContent(repository, "Raw Preview")
    const transport = new RecordingImportPreviewTransport()
    renderWorkbench(repository, "en-US", {
      mode: "local-http",
      transportKind: "http-api",
      endpoint: "http://127.0.0.1:8765/api/shell",
    }, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /raw preview/i }))
    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Select Files"), {
      target: {
        files: [new File(["2\nwater\n"], "water.xyz", { type: "chemical/x-xyz" })],
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Preview" }))

    expect(await screen.findByText("import-batch-fixture-web-1")).toBeInTheDocument()
    const rawObjects = await repository.listObjects(project.projectRef, "inputs/raw")
    expect(rawObjects).toHaveLength(1)
    expect(rawObjects[0]).toMatchObject({
      path: expect.stringMatching(/^inputs\/raw\/[a-f0-9]{12}-water\.xyz$/),
      checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      metadata: expect.objectContaining({
        kind: "raw_file",
        source_name: "water.xyz",
        byte_size: 8,
      }),
    })
    const manifest = JSON.parse(new TextDecoder().decode((await repository.readObject(project.projectRef, ".rxnflow/manifest.json")).bytes))
    expect(manifest.resources).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^raw-[a-f0-9]{12}$/),
        kind: "raw_file",
        path: rawObjects[0].path,
        checksum: rawObjects[0].checksum,
      }),
    ])
    expect(screen.getByText("Persisted raw input")).toBeInTheDocument()
    expect(screen.getByText(rawObjects[0].path)).toBeInTheDocument()
    expect(screen.getAllByText(rawObjects[0].checksum ?? "")).toHaveLength(1)
  })

  it("does not duplicate manifest raw resources when the same file is previewed repeatedly", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await createProjectWithContent(repository, "Raw Repeat")
    const transport = new RecordingImportPreviewTransport()
    renderWorkbench(repository, "en-US", {
      mode: "local-http",
      transportKind: "http-api",
      endpoint: "http://127.0.0.1:8765/api/shell",
    }, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /raw repeat/i }))
    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Select Files"), {
      target: {
        files: [new File(["2\nwater\n"], "water.xyz", { type: "chemical/x-xyz" })],
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Preview" }))
    expect(await screen.findByText("import-batch-fixture-web-1")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Preview" }))

    await waitFor(() => expect(transport.payloads.filter((payload) => payload.command === "import.preview")).toHaveLength(2))
    const manifest = JSON.parse(new TextDecoder().decode((await repository.readObject(project.projectRef, ".rxnflow/manifest.json")).bytes))
    expect(manifest.resources.filter((resource: { kind: string }) => resource.kind === "raw_file")).toHaveLength(1)
  })

  it("keeps parser preview visible when raw persistence fails", async () => {
    const repository = new FailingRawInputProjectRepository()
    await createProjectWithContent(repository, "Raw Fails")
    const transport = new RecordingImportPreviewTransport()
    renderWorkbench(repository, "en-US", {
      mode: "local-http",
      transportKind: "http-api",
      endpoint: "http://127.0.0.1:8765/api/shell",
    }, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /raw fails/i }))
    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Select Files"), {
      target: {
        files: [new File(["2\nwater\n"], "water.xyz", { type: "chemical/x-xyz" })],
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Preview" }))

    expect(await screen.findByText("import-batch-fixture-web-1")).toBeInTheDocument()
    expect(screen.getByText("Raw persistence error")).toBeInTheDocument()
    expect(screen.getByText("storage_quota_exceeded")).toBeInTheDocument()
    expect(screen.getByText("inputs/raw")).toBeInTheDocument()
    expect(screen.getByText("xyz-ase")).toBeInTheDocument()
  })

  it("keeps import preview running without an active project and marks raw persistence skipped", async () => {
    const transport = new RecordingImportPreviewTransport()
    renderWorkbench(undefined, "en-US", {
      mode: "local-http",
      transportKind: "http-api",
      endpoint: "http://127.0.0.1:8765/api/shell",
    }, new ShellClient(transport))

    expect(await screen.findByText("No browser-local projects")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Select Files"), {
      target: {
        files: [new File(["2\nwater\n"], "water.xyz", { type: "chemical/x-xyz" })],
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Preview" }))

    expect(await screen.findByText("import-batch-fixture-web-1")).toBeInTheDocument()
    expect(screen.getByText("Raw input not persisted")).toBeInTheDocument()
    expect(screen.getByText("No active browser project")).toBeInTheDocument()
  })

  it("shows oversized import payload errors before shell preview commands", async () => {
    const transport = new RecordingImportPreviewTransport()
    renderWorkbench(undefined, "en-US", {
      mode: "local-http",
      transportKind: "http-api",
      endpoint: "http://127.0.0.1:8765/api/shell",
    }, new ShellClient(transport))

    expect(await screen.findByText("No browser-local projects")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Select Files"), {
      target: {
        files: [new File(["x".repeat(1024 * 1024 + 1)], "large.xyz", { type: "chemical/x-xyz" })],
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Preview" }))

    expect((await screen.findAllByText("payload_too_large")).length).toBeGreaterThan(0)
    expect(screen.getAllByText("bytes_base64").length).toBeGreaterThan(0)
    expect(transport.payloads.filter((payload) => payload.command === "import.preview")).toHaveLength(0)
  })

  it("does not write active project raw inputs for oversized inline preview files", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await createProjectWithContent(repository, "Large Raw")
    const transport = new RecordingImportPreviewTransport()
    renderWorkbench(repository, "en-US", {
      mode: "local-http",
      transportKind: "http-api",
      endpoint: "http://127.0.0.1:8765/api/shell",
    }, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /large raw/i }))
    fireEvent.click(screen.getByRole("button", { name: "Fixture Run" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Select Files"), {
      target: {
        files: [new File(["x".repeat(1024 * 1024 + 1)], "large.xyz", { type: "chemical/x-xyz" })],
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Preview" }))

    expect((await screen.findAllByText("payload_too_large")).length).toBeGreaterThan(0)
    await expect(repository.listObjects(project.projectRef, "inputs/raw")).resolves.toHaveLength(0)
    expect(transport.payloads.filter((payload) => payload.command === "import.preview")).toHaveLength(0)
  })

  it("shows import preview shell errors without hiding error target", async () => {
    renderWorkbench()

    expect(await screen.findByText("No browser-local projects")).toBeInTheDocument()
    const input = screen.getByLabelText("Select Files")
    fireEvent.change(input, {
      target: {
        files: [new File(["2\nwater"], "water.xyz", { type: "chemical/x-xyz" })],
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Preview" }))

    expect((await screen.findAllByText("invalid_input")).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Shell session not found for fixture snapshot.").length).toBeGreaterThan(0)
    expect(screen.getAllByText("session_id").length).toBeGreaterThan(0)
  })

  it("creates a browser-local project and shows persisted validation status", async () => {
    const repository = new MemoryBrowserProjectRepository()
    renderWorkbench(repository)

    expect(await screen.findByText("No browser-local projects")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Catalyst Screen" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }))

    expect(await screen.findByRole("button", { name: /catalyst screen/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Catalyst Screen" })).toBeInTheDocument()
    expect(screen.getByText("Persisted")).toBeInTheDocument()
    expect(screen.getByText("Valid")).toBeInTheDocument()
    expect(screen.getByText(/sha256:[a-f0-9]{64}/i)).toBeInTheDocument()
    const [project] = await repository.listProjects()
    await expect(repository.listObjects(project.projectRef, projectContentIndexPath)).resolves.toHaveLength(1)
    await expect(repository.listObjects(project.projectRef, chemicalObjectsPath)).resolves.toHaveLength(1)
  })

  it("opens a project with missing content and saves it from the sidebar", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Needs Content" })
    renderWorkbench(repository)

    fireEvent.click(await screen.findByRole("button", { name: /needs content/i }))

    expect(await screen.findByText("Missing")).toBeInTheDocument()
    expect(screen.getByText(/Project content file is missing/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Save Content" }))

    expect(await screen.findByText("Persisted")).toBeInTheDocument()
    expect(screen.getByText("Valid")).toBeInTheDocument()
    await expect(repository.listObjects(project.projectRef, projectContentIndexPath)).resolves.toHaveLength(1)
  })

  it("opens a browser project without automatically opening a shell bridge session", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const transport = new RecordingProjectBridgeTransport()
    const created = await createProjectWithContent(repository, "Bridge Later")
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /bridge later/i }))

    expect(await screen.findByText("Persisted")).toBeInTheDocument()
    expect(screen.getByText("No shell session")).toBeInTheDocument()
    expect(transport.payloads.filter((payload) => payload.command === "project.open")).toHaveLength(0)
    expect(created.name).toBe("Bridge Later")
  })

  it("explicitly opens and saves a bridge session through project content files", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const transport = new RecordingProjectBridgeTransport()
    const project = await createProjectWithContent(repository, "Bridge Project")
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /bridge project/i }))
    expect(await screen.findByRole("heading", { name: "Bridge Project" })).toBeInTheDocument()
    expect(await screen.findByText("Project content files are readable.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open Bridge" }))

    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    expect(screen.getByText("Open")).toBeInTheDocument()
    const openPayload = transport.payloads.find((payload) => payload.command === "project.open")
    expect(openPayload?.args).toMatchObject({
      load_content: true,
    })
    expect(Array.isArray(openPayload?.args.content_files)).toBe(true)
    expect(JSON.stringify(openPayload?.args.content_files)).toContain(projectContentIndexPath)

    fireEvent.click(screen.getByRole("button", { name: "Save Bridge" }))

    expect(await screen.findByText("Project content files are readable.")).toBeInTheDocument()
    const savePayload = transport.payloads.find((payload) => payload.command === "project.save_content")
    expect(savePayload?.args).toMatchObject({
      session_id: "session-fixture-web",
      include_content_files: true,
    })
    const indexObject = await repository.readObject(project.projectRef, projectContentIndexPath)
    expect(indexObject.metadata).toEqual({ kind: "project_content_index" })
  })

  it("saves and restores graph workspace layout, viewport, selection, and active path through bridge content files", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const transport = new RecordingProjectBridgeTransport()
    const project = await createProjectWithContent(repository, "Graph Restore")
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /graph restore/i }))
    fireEvent.click(await screen.findByRole("button", { name: "Open Bridge" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    mockCanvasSurfaceRect(within(graphCanvas).getByLabelText("Graph canvas surface"), 600, 360)

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Zoom In" }))
    await waitFor(() => expect(lastPayload(transport, "workspace.set_viewport")?.args).toMatchObject({
      viewport: { zoom: 1.2 },
    }))
    const nodeB = within(graphCanvas).getByRole("button", { name: /node-b/i })
    fireEvent.pointerDown(nodeB, { button: 0, clientX: 360, clientY: 160, pointerId: 9 })
    fireEvent.pointerMove(nodeB, { button: 0, clientX: 430, clientY: 230, pointerId: 9 })
    fireEvent.pointerUp(nodeB, { button: 0, clientX: 430, clientY: 230, pointerId: 9 })
    await waitFor(() => expect(lastPayload(transport, "workspace.move_node")?.args).toMatchObject({
      node_id: "node-b",
    }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Select path Fixture path" }))
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { path_ids: ["path-a-b"] },
    }))

    fireEvent.click(screen.getByRole("button", { name: "Save Bridge" }))
    await waitFor(() => expect(transport.payloads.some((payload) => payload.command === "project.save_content")).toBe(true))
    await waitFor(async () => {
      const graphObject = await repository.readObject(project.projectRef, reactionGraphsPath)
      const workspaceObject = await repository.readObject(project.projectRef, workspacesPath)
      const savedGraph = JSON.parse(new TextDecoder().decode(graphObject.bytes))
      const savedWorkspace = JSON.parse(new TextDecoder().decode(workspaceObject.bytes))
      expect(savedGraph.graphs[0].nodes.find((node: { id: string }) => node.id === "node-b").position).not.toEqual([360, 160])
      expect(savedWorkspace.workspaces[0].viewport.zoom).toBe(1.2)
      expect(savedWorkspace.workspaces[0].selection.path_ids).toEqual(["path-a-b"])
      expect(savedWorkspace.workspaces[0].active_path_id).toBe("path-a-b")
    })

    fireEvent.click(screen.getByRole("button", { name: "Open Bridge" }))

    expect(await within(graphCanvas).findByText("120%")).toBeInTheDocument()
    const restoredPathButton = within(graphCanvas).getByRole("button", { name: "Select path Fixture path" })
    expect(restoredPathButton.closest("li")?.className).toContain("graph-path-list--selected")
    expect(within(graphCanvas).getByText("node-a -> node-b")).toBeInTheDocument()
  })

  it("renders repository errors with code, message, and target visible", async () => {
    renderWorkbench()

    expect(await screen.findByText("No browser-local projects")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }))

    expect(await screen.findByText("invalid_input")).toBeInTheDocument()
    expect(screen.getAllByText("Browser local project name is required.").length).toBeGreaterThan(0)
    expect(screen.getByText("name")).toBeInTheDocument()
  })

  it("exports the active browser project bundle with object URL cleanup", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const transport = new RecordingProjectBridgeTransport()
    await createProjectWithContent(repository, "Bundle Export")
    const download = mockBrowserDownload()
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    try {
      fireEvent.click(await screen.findByRole("button", { name: /bundle export/i }))
      expect(await screen.findByText("Project content files are readable.")).toBeInTheDocument()
      const exportButton = screen.getByRole("button", { name: "Export Bundle" })
      expect(exportButton).toBeEnabled()

      fireEvent.click(exportButton)

      expect(await screen.findByText("Bundle ready")).toBeInTheDocument()
      expect(screen.getByText(/Bundle-Export\.rxnflow\.zip/)).toBeInTheDocument()
      expect(screen.getByText(/8 files/)).toBeInTheDocument()
      expect(screen.getByText("Bundle-Export.rxnflow")).toBeInTheDocument()
      expect(screen.getAllByText(/sha256:[a-f0-9]{64}/i).length).toBeGreaterThanOrEqual(2)
      expect(download.createObjectURL).toHaveBeenCalledTimes(1)
      expect(download.revokeObjectURL).toHaveBeenCalledWith("blob:rxnflow-bundle")
      expect(download.click).toHaveBeenCalledTimes(1)
      expect(transport.payloads.filter((payload) => payload.command === "project.save_content")).toHaveLength(0)
      expect(transport.payloads.filter((payload) => payload.command === "project.export_bundle")).toHaveLength(0)
    } finally {
      download.restore()
    }
  })

  it("keeps bundle export disabled until a project is active while import is available", async () => {
    renderWorkbench()

    expect(await screen.findByText("No browser-local projects")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Import Bundle" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Export Bundle" })).toBeDisabled()
    expect(screen.getByText(/Import creates a new browser-local project/)).toBeInTheDocument()
    expect(screen.getByText(/Export downloads the current browser-local repository bytes/)).toBeInTheDocument()
  })

  it("imports a project bundle into a new active browser project without shell calls", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const existing = await createProjectWithContent(repository, "Existing Project")
    const transport = new RecordingProjectBridgeTransport()
    const file = await createBundleFile({
      rootName: "imported-root.rxnflow",
      fileName: "imported-root.rxnflow.zip",
      entries: {
        ".rxnflow/manifest.json": JSON.stringify({
          id: "project-imported",
          name: "Imported Bundle",
          schema_version: "project-v1",
          resources: [],
        }),
        ".rxnflow/state/project-content.json": JSON.stringify({
          schema_version: "project-content-v1",
          project_id: "project-imported",
          updated_at: "2026-05-05T00:00:00Z",
          files: [],
        }),
        "inputs/raw/demo.xyz": "2\nDemo\n",
        "exports/profile.png": "png",
      },
    })
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    expect(await screen.findByRole("button", { name: /existing project/i })).toBeInTheDocument()
    const input = screen.getByLabelText("Select project bundle file")
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText("Bundle imported")).toBeInTheDocument()
    expect(screen.getByText(/Imported Bundle · 4 files/)).toBeInTheDocument()
    expect(screen.getByText("imported-root.rxnflow")).toBeInTheDocument()
    expect(screen.getAllByText(/sha256:[a-f0-9]{64}/i).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: /imported bundle/i })).toHaveAttribute("aria-current", "true")
    expect(screen.getByText("Project content files are readable.")).toBeInTheDocument()
    expect(screen.getByText("No project loaded")).toBeInTheDocument()

    const projects = await repository.listProjects()
    expect(projects.map((project) => project.name)).toEqual(["Existing Project", "Imported Bundle"])
    const imported = projects.find((project) => project.name === "Imported Bundle")
    expect(imported?.projectRef).not.toBe(existing.projectRef)
    await expect(repository.exists(existing.projectRef, "inputs/raw/demo.xyz")).resolves.toBe(false)
    await expect(repository.exists(imported?.projectRef ?? "", "inputs/raw/demo.xyz")).resolves.toBe(true)
    expect(transport.payloads.filter((payload) => payload.command === "project.open")).toHaveLength(0)
    expect(transport.payloads.filter((payload) => payload.command === "project.import_bundle")).toHaveLength(0)
    expect(transport.payloads.filter((payload) => payload.command === "project.save_content")).toHaveLength(0)
  })

  it("shows bundle import errors without creating a project", async () => {
    const repository = new MemoryBrowserProjectRepository()
    renderWorkbench(repository)

    expect(await screen.findByText("No browser-local projects")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Select project bundle file"), {
      target: { files: [new File(["not a zip"], "bad.rxnflow.zip", { type: "application/zip" })] },
    })

    expect(await screen.findByText("invalid_bundle")).toBeInTheDocument()
    expect(screen.getByText("Project bundle is not a valid zip file.")).toBeInTheDocument()
    expect(screen.getByText("zip_entry")).toBeInTheDocument()
    expect(await repository.listProjects()).toHaveLength(0)
  })

  it("shows partial import risk when bundle object writes fail", async () => {
    const repository = new FailingBundleImportProjectRepository()
    const file = await createBundleFile({
      rootName: "partial.rxnflow",
      fileName: "partial.rxnflow.zip",
      entries: {
        ".rxnflow/manifest.json": '{"id":"project-partial","name":"Partial Bundle","schema_version":"project-v1"}',
        ".rxnflow/state/project-content.json": "{}",
        "inputs/raw/demo.xyz": "2\nDemo\n",
      },
    })
    renderWorkbench(repository)

    expect(await screen.findByText("No browser-local projects")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Select project bundle file"), {
      target: { files: [file] },
    })

    expect(await screen.findByText("storage_failed")).toBeInTheDocument()
    expect(screen.getByText("Browser local storage quota would be exceeded.")).toBeInTheDocument()
    expect(screen.getByText("inputs/raw/demo.xyz")).toBeInTheDocument()
    expect(screen.getByText(/Partial import risk: 2 files were written to browser-project:/)).toBeInTheDocument()
    expect(await repository.listProjects()).toHaveLength(1)
  })

  it("roundtrips imported bundles through bridge save and bundle re-export", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const transport = new RecordingProjectBridgeTransport()
    const importedFile = await createBundleFile({
      rootName: "roundtrip-source.rxnflow",
      fileName: "roundtrip-source.rxnflow.zip",
      entries: await roundtripBundleEntries(),
    })
    const download = mockBrowserDownload()
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    try {
      fireEvent.change(await screen.findByLabelText("Select project bundle file"), {
        target: { files: [importedFile] },
      })
      expect(await screen.findByText("Bundle imported")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /roundtrip source/i })).toHaveAttribute("aria-current", "true")
      expect(screen.getByText("No project loaded")).toBeInTheDocument()

      const importedProject = await onlyProjectNamed(repository, "Roundtrip Source")
      const workspaceBeforeOpen = await readJsonObject(repository, importedProject.projectRef, workspacesPath)
      expect(workspaceBeforeOpen.workspaces[0].viewport.zoom).toBe(1)
      expect(await repository.exists(importedProject.projectRef, "inputs/raw/demo.xyz")).toBe(true)
      expect(await repository.exists(importedProject.projectRef, "exports/profile.png")).toBe(true)
      expect(transport.payloads.filter((payload) => payload.command === "project.open")).toHaveLength(0)

      fireEvent.click(screen.getByRole("button", { name: "Open Bridge" }))
      expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
      const openPayload = lastPayload(transport, "project.open")
      expect(openPayload?.args).toMatchObject({ load_content: true })
      expect(JSON.stringify(openPayload?.args.content_files)).toContain(workspacesPath)
      expect(screen.getByText("Bridge session is open. Save Bridge Session first if you want recent shell changes in the bundle.")).toBeInTheDocument()

      const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
      mockCanvasSurfaceRect(within(graphCanvas).getByLabelText("Graph canvas surface"), 600, 360)
      fireEvent.click(within(graphCanvas).getByRole("button", { name: "Zoom In" }))
      await waitFor(() => expect(lastPayload(transport, "workspace.set_viewport")?.args).toMatchObject({
        viewport: { zoom: 1.2 },
      }))

      const exportPanel = screen.getByRole("region", { name: "Report Export Panel" })
      fireEvent.click(within(exportPanel).getByRole("button", { name: "Export" }))
      expect(await within(exportPanel).findByText("exports/rxnflow-profile.png")).toBeInTheDocument()
      expect(await repository.exists(importedProject.projectRef, "exports/rxnflow-profile.png")).toBe(true)
      expect(transport.payloads.filter((payload) => payload.command === "project.save_content")).toHaveLength(0)

      const workspaceBeforeSave = await readJsonObject(repository, importedProject.projectRef, workspacesPath)
      expect(workspaceBeforeSave.workspaces[0].viewport.zoom).toBe(1)
      fireEvent.click(screen.getByRole("button", { name: "Save Bridge" }))
      await waitFor(() => expect(lastPayload(transport, "project.save_content")?.args).toMatchObject({
        session_id: "session-fixture-web",
        include_content_files: true,
      }))
      await waitFor(async () => {
        const workspaceAfterSave = await readJsonObject(repository, importedProject.projectRef, workspacesPath)
        expect(workspaceAfterSave.workspaces[0].viewport.zoom).toBe(1.2)
      })
      expect(await repository.exists(importedProject.projectRef, "inputs/raw/demo.xyz")).toBe(true)
      expect(await repository.exists(importedProject.projectRef, "exports/profile.png")).toBe(true)
      expect(await repository.exists(importedProject.projectRef, "exports/rxnflow-profile.png")).toBe(true)

      fireEvent.click(screen.getByRole("button", { name: "Export Bundle" }))
      expect(await screen.findByText("Bundle ready")).toBeInTheDocument()
      const exportedBundle = await readCapturedBundle(download.blobs[0], "Roundtrip-Source.rxnflow.zip")
      expect(exportedBundle.summary.rootName).toBe("Roundtrip-Source.rxnflow")
      expect(exportedBundle.entries.map((entry) => entry.projectRelativePath)).toEqual(expect.arrayContaining([
        ".rxnflow/manifest.json",
        reactionGraphsPath,
        workspacesPath,
        "inputs/raw/demo.xyz",
        "exports/profile.png",
        "exports/rxnflow-profile.png",
      ]))
      const exportedWorkspace = JSON.parse(new TextDecoder().decode(
        exportedBundle.entries.find((entry) => entry.projectRelativePath === workspacesPath)?.bytes,
      ))
      expect(exportedWorkspace.workspaces[0].viewport.zoom).toBe(1.2)

      fireEvent.change(screen.getByLabelText("Select project bundle file"), {
        target: {
          files: [
            new File([download.blobs[0]], "Roundtrip-Source.rxnflow.zip", { type: "application/zip" }),
          ],
        },
      })
      await waitFor(async () => expect(await repository.listProjects()).toHaveLength(2))
      const reimportedProject = (await repository.listProjects())
        .find((project) => project.projectRef !== importedProject.projectRef)
      expect(reimportedProject?.projectRef).toMatch(/^browser-project:/)
      expect(await repository.exists(reimportedProject?.projectRef ?? "", "inputs/raw/demo.xyz")).toBe(true)
      expect(await repository.exists(reimportedProject?.projectRef ?? "", "exports/rxnflow-profile.png")).toBe(true)
      fireEvent.click(screen.getByRole("button", { name: "Open Bridge" }))
      expect(await within(graphCanvas).findByText("120%")).toBeInTheDocument()

      expect(transport.payloads.filter((payload) => payload.command === "project.import_bundle")).toHaveLength(0)
      expect(transport.payloads.filter((payload) => payload.command === "project.export_bundle")).toHaveLength(0)
    } finally {
      download.restore()
    }
  })

  it("shows bundle export errors without creating an object URL", async () => {
    const repository = new MemoryBrowserProjectRepository()
    await repository.createProject({ name: "Missing Bundle Content" })
    const download = mockBrowserDownload()
    renderWorkbench(repository)

    try {
      fireEvent.click(await screen.findByRole("button", { name: /missing bundle content/i }))
      expect(await screen.findByText("Missing")).toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "Export Bundle" }))

      expect(await screen.findByText("project_content_missing")).toBeInTheDocument()
      expect(screen.getByText("Browser project bundle export requires .rxnflow/manifest.json.")).toBeInTheDocument()
      expect(screen.getByText(".rxnflow/manifest.json")).toBeInTheDocument()
      expect(download.createObjectURL).not.toHaveBeenCalled()
      expect(download.revokeObjectURL).not.toHaveBeenCalled()
    } finally {
      download.restore()
    }
  })

  it("prompts users to save an open bridge session before bundle export", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await createProjectWithContent(repository, "Bridge Bundle")
    renderWorkbench(repository)

    fireEvent.click(await screen.findByRole("button", { name: /bridge bundle/i }))
    expect(await screen.findByText("Project content files are readable.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open Bridge" }))

    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    expect(screen.getByText("Bridge session is open. Save Bridge Session first if you want recent shell changes in the bundle.")).toBeInTheDocument()
    expect(project.name).toBe("Bridge Bundle")
  })

  it("renders sidebar validation messages through the active locale", async () => {
    const repository = new MemoryBrowserProjectRepository()
    await repository.createProject({ name: "Needs Content" })
    renderWorkbench(repository, "zh-CN")

    fireEvent.click(await screen.findByRole("button", { name: /needs content/i }))

    expect(await screen.findByText(/项目内容文件缺失/)).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes(".rxnflow/state/project-content.json"))).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "保存内容" }))

    expect(await screen.findByText("已保存")).toBeInTheDocument()
    expect(screen.getByText("有效")).toBeInTheDocument()
    expect(screen.getByText("项目内容文件可读取。")).toBeInTheDocument()
  })

  it("renders import inbox controls through the active locale while preserving dynamic codes", async () => {
    renderWorkbench(undefined, "zh-CN")

    expect(await screen.findByText("暂无浏览器本地项目")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "解析预览" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "已登记对象" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "图谱画布" })).toBeInTheDocument()
    expect(screen.getByText("暂无工作区图谱")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "预览" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "运行 Fixture" }))
    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    expect(screen.getByText("fixture-parser")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "图谱画布" })
    expect(within(graphCanvas).getByRole("button", { name: "添加节点" })).toBeEnabled()
    expect(within(graphCanvas).getByText("node-a")).toBeInTheDocument()
    expect(within(graphCanvas).getByText("object-a")).toBeInTheDocument()
    expect(within(graphCanvas).getAllByText("path-a-b").length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText("选择文件"), {
      target: {
        files: [new File(["2\nwater"], "water.xyz", { type: "chemical/x-xyz" })],
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "预览" }))

    expect(await screen.findByText("import-batch-fixture-web-1")).toBeInTheDocument()
    expect(screen.getByText("原始输入未持久化")).toBeInTheDocument()
    expect(screen.getByText("无当前浏览器项目")).toBeInTheDocument()
    expect(screen.getByText("xyz-ase")).toBeInTheDocument()
    expect(screen.getAllByText("missing_section").length).toBeGreaterThan(0)
    expect(screen.getByText("water.xyz")).toBeInTheDocument()
    const energyPanel = screen.getByRole("region", { name: "能量剖面面板" })
    expect(within(energyPanel).getAllByText("相对能量").length).toBeGreaterThan(0)
    expect(within(energyPanel).getByText("表达式明细")).toBeInTheDocument()
    expect(within(energyPanel).getByRole("button", { name: "计算" })).toBeEnabled()
    const exportPanel = screen.getByRole("region", { name: "报告导出面板" })
    expect(within(exportPanel).getByText("报告导出")).toBeInTheDocument()
    expect(within(exportPanel).getByRole("button", { name: "导出" })).toBeEnabled()
  })
})

function renderWorkbench(
  projectRepository = new MemoryBrowserProjectRepository(),
  initialLocale: SupportedLocale = "en-US",
  runtimeInfo: ShellRuntimeInfo = {
    mode: "fixture",
    transportKind: "in-process-test",
  },
  shellClient = new ShellClient(fixtureTransport),
) {
  render(
    <I18nProvider initialLocale={initialLocale}>
      <WorkbenchShell
        shellClient={shellClient}
        projectRepository={projectRepository}
        runtimeInfo={runtimeInfo}
      />
    </I18nProvider>,
  )
}

function mockCanvasSurfaceRect(element: HTMLElement, width = 900, height = 420) {
  element.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect)
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

function lastPayload(
  transport: RecordingProjectBridgeTransport,
  command: string,
) {
  return transport.payloads.filter((payload) => payload.command === command).at(-1)
}

function mockBrowserDownload() {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const originalClick = HTMLAnchorElement.prototype.click
  const blobs: Blob[] = []
  const createObjectURL = vi.fn((blob: Blob | MediaSource) => {
    if (blob instanceof Blob) {
      blobs.push(blob)
    }
    return "blob:rxnflow-bundle"
  })
  const revokeObjectURL = vi.fn()
  const click = vi.fn()
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
  HTMLAnchorElement.prototype.click = click
  return {
    blobs,
    createObjectURL,
    revokeObjectURL,
    click,
    restore: () => {
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
      HTMLAnchorElement.prototype.click = originalClick
    },
  }
}

async function onlyProjectNamed(
  repository: MemoryBrowserProjectRepository,
  name: string,
) {
  const projects = await repository.listProjects()
  const matches = projects.filter((project) => project.name === name)
  expect(matches).toHaveLength(1)
  return matches[0]
}

async function readJsonObject(
  repository: MemoryBrowserProjectRepository,
  projectRef: string,
  path: string,
) {
  const object = await repository.readObject(projectRef, path)
  return JSON.parse(new TextDecoder().decode(object.bytes))
}

async function readCapturedBundle(blob: Blob, bundleName: string) {
  const result = await readBrowserProjectBundleArchive({
    bundleName,
    bytes: new Uint8Array(await blob.arrayBuffer()) as Uint8Array<ArrayBuffer>,
  })
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result
}

async function roundtripBundleEntries(): Promise<Record<string, string>> {
  const encoder = new TextEncoder()
  const chemicalObjects = jsonText({
    schema_version: "chemical-objects-v1",
    project_id: "project-roundtrip-source",
    objects: [],
  })
  const reactionGraphs = jsonText({
    schema_version: "reaction-graphs-v1",
    project_id: "project-roundtrip-source",
    graphs: [
      {
        id: "graph-roundtrip-source",
        project_id: "project-roundtrip-source",
        nodes: [
          { id: "node-a", kind: "species", label: "Imported A", chemical_object_ids: ["object-a"], composition: [{ object_id: "object-a", coefficient: 1, role: "species", label: "Fixture A" }], position: [120, 160], metadata: {} },
          { id: "node-b", kind: "species", label: "Imported B", chemical_object_ids: ["object-b"], composition: [{ object_id: "object-b", coefficient: 1, role: "species", label: "Fixture B" }], position: [360, 160], metadata: {} },
        ],
        edges: [
          { id: "edge-a-b", from_node: "node-a", to_node: "node-b", label: null, metadata: {} },
        ],
        paths: [
          { id: "path-a-b", label: "Imported path", node_ids: ["node-a", "node-b"] },
        ],
      },
    ],
  })
  const workspaces = jsonText({
    schema_version: "workspaces-v1",
    project_id: "project-roundtrip-source",
    workspaces: [
      {
        workspace_id: "workspace-roundtrip-source",
        project_id: "project-roundtrip-source",
        graph_id: "graph-roundtrip-source",
        selection: { node_ids: [], edge_ids: [], path_ids: [] },
        viewport: { x: 0, y: 0, zoom: 1 },
        active_path_id: "path-a-b",
        updated_at: "2026-05-05T00:00:00Z",
      },
    ],
  })
  const energyProfiles = jsonText({
    schema_version: "energy-profiles-v1",
    project_id: "project-roundtrip-source",
    profiles: [],
  })
  const importLedger = jsonText({
    schema_version: "import-ledger-v1",
    project_id: "project-roundtrip-source",
    batches: [],
  })
  const exportArtifacts = jsonText({
    schema_version: "export-artifacts-v1",
    project_id: "project-roundtrip-source",
    artifacts: [
      {
        id: "artifact-profile-existing",
        format: "png",
        path: "exports/profile.png",
        checksum: await checksumBrowserStorageBytes(encoder.encode("png") as Uint8Array<ArrayBuffer>),
        metadata: {},
        created_at: "2026-05-05T00:00:00Z",
      },
    ],
  })
  const sectionTexts = [
    [chemicalObjectsPath, "chemical_objects", chemicalObjects],
    [reactionGraphsPath, "reaction_graphs", reactionGraphs],
    [workspacesPath, "workspaces", workspaces],
    [".rxnflow/state/energy-profiles.json", "energy_profiles", energyProfiles],
    [".rxnflow/state/import-ledger.json", "import_ledger", importLedger],
    [exportArtifactsPath, "export_artifacts", exportArtifacts],
  ] as const

  return {
    ".rxnflow/manifest.json": jsonText({
      id: "project-roundtrip-source",
      name: "Roundtrip Source",
      schema_version: "project-v1",
      resources: [
        {
          id: "raw-demo",
          kind: "raw_file",
          path: "inputs/raw/demo.xyz",
          checksum: await checksumBrowserStorageBytes(encoder.encode("2\nDemo\n") as Uint8Array<ArrayBuffer>),
          metadata: {
            source_name: "demo.xyz",
            byte_size: 7,
          },
        },
      ],
    }),
    ".rxnflow/state/project-content.json": jsonText({
      schema_version: "project-content-v1",
      project_id: "project-roundtrip-source",
      updated_at: "2026-05-05T00:00:00Z",
      files: await Promise.all(sectionTexts.map(async ([path, kind, text]) => ({
        kind,
        path,
        checksum: await checksumBrowserStorageBytes(encoder.encode(text) as Uint8Array<ArrayBuffer>),
        updated_at: "2026-05-05T00:00:00Z",
      }))),
    }),
    [chemicalObjectsPath]: chemicalObjects,
    [reactionGraphsPath]: reactionGraphs,
    [workspacesPath]: workspaces,
    ".rxnflow/state/energy-profiles.json": energyProfiles,
    ".rxnflow/state/import-ledger.json": importLedger,
    [exportArtifactsPath]: exportArtifacts,
    "inputs/raw/demo.xyz": "2\nDemo\n",
    "exports/profile.png": "png",
  }
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function createProjectWithContent(
  repository: MemoryBrowserProjectRepository,
  name: string,
) {
  const state = await import("./projectSidebarActions").then(({ createProject }) =>
    createProject(repository, {
      status: "idle",
      projects: [],
      persistence: "empty",
      bridge: { state: "idle" },
      validation: { state: "unknown", messageKey: "projectSidebar.validation.noProject" },
    }, name),
  )
  if (!state.activeProject) {
    throw new Error("Project was not created.")
  }
  return state.activeProject
}

async function createBundleFile(input: {
  rootName: string
  fileName: string
  entries: Record<string, string>
}) {
  const entries = await Promise.all(Object.entries(input.entries).map(([path, text]) => bundleEntry(path, text)))
  const archive = await createBrowserProjectBundleArchive({
    rootName: input.rootName,
    bundleName: input.fileName,
    entries,
  })
  if (!archive.ok) {
    throw new Error(archive.error.message)
  }
  return new File([archive.bytes], input.fileName, { type: "application/zip" })
}

async function bundleEntry(path: string, text: string): Promise<BrowserProjectBundleEntry> {
  const bytes = new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>
  return {
    name: path.split("/").at(-1) ?? path,
    projectRelativePath: path,
    bytes,
    byteSize: bytes.byteLength,
    checksum: await checksumBrowserStorageBytes(bytes) as `sha256:${string}`,
  }
}

class RecordingImportPreviewTransport implements ShellTransport {
  kind = "http-api" as const
  payloads: ShellCommandPayload<string>[] = []

  async run(payload: ShellCommandPayload<string>): Promise<ShellResponse> {
    this.payloads.push(payload)
    return fixtureTransport.run(payload)
  }
}

class UnavailableHttpTransport implements ShellTransport {
  kind = "http-api" as const

  async run(): Promise<ShellResponse> {
    return {
      ok: false,
      data: null,
      error: {
        code: "transport_unavailable",
        message: "HTTP shell bridge is unavailable.",
        target: "http-api",
        details: { endpoint: "http://127.0.0.1:8765/api/shell" },
      },
      warnings: [],
      artifacts: [],
    }
  }
}

class RecordingProjectBridgeTransport implements ShellTransport {
  kind = "in-process-test" as const
  payloads: ShellCommandPayload<string>[] = []

  async run(payload: ShellCommandPayload<string>): Promise<ShellResponse> {
    this.payloads.push(payload)
    return fixtureTransport.run(payload)
  }
}

class FailingCorrectionTransport implements ShellTransport {
  kind = "in-process-test" as const

  async run(payload: ShellCommandPayload<string>): Promise<ShellResponse> {
    if (payload.command !== "registry.apply_correction") {
      return fixtureTransport.run(payload)
    }
    return {
      ok: false,
      data: null,
      error: {
        code: "invalid_input",
        message: "Correction energy unit is unsupported.",
        target: "correction.energy.unit",
      },
      warnings: [],
      artifacts: [],
    }
  }
}

class TestDataTransfer {
  dropEffect = "none"
  effectAllowed = "all"
  private readonly store = new Map<string, string>()

  get types() {
    return Array.from(this.store.keys())
  }

  setData(type: string, value: string) {
    this.store.set(type, value)
  }

  getData(type: string) {
    return this.store.get(type) ?? ""
  }
}

class FailingExportProjectRepository extends MemoryBrowserProjectRepository {
  async writeObject(projectRef: string, object: Parameters<MemoryBrowserProjectRepository["writeObject"]>[1]) {
    if (object.path.startsWith("exports/")) {
      throw new BrowserProjectRepositoryError({
        code: "storage_quota_exceeded",
        message: "Browser local storage quota would be exceeded.",
        target: "quota",
      })
    }
    return super.writeObject(projectRef, object)
  }
}

class FailingRawInputProjectRepository extends MemoryBrowserProjectRepository {
  async writeObject(projectRef: string, object: Parameters<MemoryBrowserProjectRepository["writeObject"]>[1]) {
    if (object.path.startsWith("inputs/raw/")) {
      throw new BrowserProjectRepositoryError({
        code: "storage_quota_exceeded",
        message: "Browser local storage quota would be exceeded.",
        target: "inputs/raw",
      })
    }
    return super.writeObject(projectRef, object)
  }
}

class FailingBundleImportProjectRepository extends MemoryBrowserProjectRepository {
  async writeObject(projectRef: string, object: Parameters<MemoryBrowserProjectRepository["writeObject"]>[1]) {
    if (object.path.startsWith("inputs/raw/")) {
      throw new BrowserProjectRepositoryError({
        code: "storage_failed",
        message: "Browser local storage quota would be exceeded.",
        target: "quota",
      })
    }
    return super.writeObject(projectRef, object)
  }
}
