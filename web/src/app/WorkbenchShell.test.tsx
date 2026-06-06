import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { BrowserProjectRepositoryError, checksumBrowserStorageBytes, MemoryBrowserProjectRepository, type BrowserStorageObject } from "../repository"
import { ShellClient, fixtureTransport, type ShellCommandPayload, type ShellResponse, type ShellRuntimeInfo, type ShellTransport, type WorkbenchSnapshotData } from "../shell"
import { graphObjectDragMimeType } from "./graphObjectDragPayload"
import { graphRawFileDropMimeType } from "./graphRawFileDropPayload"
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

    expect(await screen.findByText("No projects yet")).toBeInTheDocument()
    expect(screen.getByRole("main", { name: /rxnflow web workbench/i })).toBeInTheDocument()
    expect(screen.getByLabelText("Language")).toHaveValue("en-US")
    expect(screen.queryByText("Local-only")).not.toBeInTheDocument()
    expect(screen.queryByText("Runtime Fixture")).not.toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Project Rail" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Canvas Stage" })).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Analysis Dock" })).toHaveAttribute("data-active-tab", "pes")
    expect(screen.getByRole("complementary", { name: "Project Sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New Project" })).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByText("No projects yet")).toBeInTheDocument()
    expect(screen.queryByText("No project loaded")).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Source Tray" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Project name")).not.toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "PES" })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByRole("button", { name: "Fixture Run" })).not.toBeInTheDocument()
    openAnalysisDockTab("Object")
    expect(screen.getByRole("heading", { name: "Registered Objects" })).toBeInTheDocument()
    expect(screen.getByText("No registered objects")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add Correction" })).toBeDisabled()
    openAnalysisDockTab("Diagnostics")
    expect(screen.getByText("Runtime Fixture")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Fixture Run" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Invalid command" })).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    expect(within(graphCanvas).getByText("No workspace graph")).toBeInTheDocument()
    expect(within(graphCanvas).getByText(/Drop a raw output file here/)).toBeInTheDocument()
    expect(within(graphCanvas).getByText("No session")).toBeInTheDocument()
    expect(within(graphCanvas).getByRole("button", { name: "Open Workspace" })).toBeDisabled()
    expect(within(graphCanvas).getByRole("button", { name: "Add Node" })).toBeDisabled()
    expect(within(graphCanvas).getByRole("button", { name: "Connect" })).toBeDisabled()
    expect(within(graphCanvas).getByRole("button", { name: "Set Path" })).toBeDisabled()
    expect(within(graphCanvas).getByRole("button", { name: "Delete Selected" })).toBeDisabled()
  })

  it("switches visible workbench copy between English and Simplified Chinese", async () => {
    renderWorkbench(undefined, "en-US")

    expect(await screen.findByText("No projects yet")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "zh-CN" } })

    expect(await screen.findByRole("heading", { name: "工作台" })).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "项目侧边栏" })).toBeInTheDocument()
    expect(screen.queryByText("运行时 Fixture")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "新建项目" })).toBeInTheDocument()
    expect(screen.getByText("暂无项目")).toBeInTheDocument()

    openAnalysisDockTab("诊断")
    expect(screen.getByText("运行时 Fixture")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("语言"), { target: { value: "en-US" } })

    expect(await screen.findByRole("heading", { name: "Workbench" })).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Project Sidebar" })).toBeInTheDocument()
  })

  it("shows local-http runtime mode and endpoint when configured", async () => {
    renderWorkbench(undefined, "en-US", {
      mode: "local-http",
      transportKind: "http-api",
      endpoint: "http://127.0.0.1:8765/api/shell",
    })

    expect(await screen.findByText("No projects yet")).toBeInTheDocument()
    expect(screen.queryByText("Runtime Local HTTP")).not.toBeInTheDocument()
    openAnalysisDockTab("Diagnostics")
    expect(screen.getByText("Runtime Local HTTP")).toBeInTheDocument()
    expect(screen.getByText("Endpoint http://127.0.0.1:8765/api/shell")).toBeInTheDocument()
  })

  it("keeps project import off the topbar while export and analysis use the right dock", async () => {
    renderWorkbench()

    const shell = await screen.findByRole("main", { name: /rxnflow web workbench/i })
    const commandMenu = screen.getByRole("navigation", { name: "Workbench commands" })

    expect(shell).toHaveAttribute("data-inspector", "closed")
    expect(within(commandMenu).queryByRole("button", { name: "Sources" })).not.toBeInTheDocument()

    fireEvent.click(within(commandMenu).getByRole("button", { name: "Analysis" }))
    expect(shell).toHaveAttribute("data-inspector", "open")

    fireEvent.click(within(commandMenu).getByRole("button", { name: "Analysis" }))
    expect(shell).toHaveAttribute("data-inspector", "closed")

    fireEvent.click(within(commandMenu).getByRole("button", { name: "Export" }))
    expect(shell).toHaveAttribute("data-inspector", "open")
    expect(shell).toHaveAttribute("data-analysis-tab", "export")
  })

  it("shows transport_unavailable from local-http runtime failures with target", async () => {
    renderWorkbench(undefined, "en-US", {
      mode: "local-http",
      transportKind: "http-api",
      endpoint: "http://127.0.0.1:8765/api/shell",
    }, new ShellClient(new UnavailableHttpTransport()))

    openAnalysisDockTab("Diagnostics")
    fireEvent.click(await screen.findByRole("button", { name: "Fixture Run" }))

    expect(await screen.findByText("transport_unavailable")).toBeInTheDocument()
    expect(screen.getByText("HTTP shell bridge is unavailable.")).toBeInTheDocument()
    expect(screen.getByText("http-api")).toBeInTheDocument()
  })

  it("projects fixture.run into visible workbench state", async () => {
    renderWorkbench()

    runFixtureCommand()

    await expectFixtureWorkbenchProjected()
    openAnalysisDockTab("PES")
    expect(screen.getAllByText("profile-a-b-electronic").length).toBeGreaterThan(0)
    const energyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })
    expect(within(energyPanel).getByText("Energy curve")).toBeInTheDocument()
    expect(within(energyPanel).getAllByText("Relative energy").length).toBeGreaterThan(0)
    expect(within(energyPanel).getByText("Expression details")).toBeInTheDocument()
    expect(within(energyPanel).getAllByText("Composition terms").length).toBeGreaterThan(0)
    expect(within(energyPanel).getAllByText("electronic · energies").length).toBeGreaterThan(0)
    expect(within(energyPanel).getAllByText("-12.4").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0)
    openAnalysisDockTab("Object")
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

    runFixtureCommand()
    openAnalysisDockTab("Object")
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

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    openAnalysisDockTab("Object")
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

    openAnalysisDockTab("PES")
    const energyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })
    fireEvent.change(within(energyPanel).getByLabelText("Correction policy"), { target: { value: "all" } })
    fireEvent.click(within(energyPanel).getByRole("button", { name: "Compute" }))

    expect(await within(energyPanel).findByText("Correction terms")).toBeInTheDocument()
    expect(within(energyPanel).getByText(/^corr-object-b-solvation-/)).toBeInTheDocument()
  })

  it("shows registry correction errors without locally appending corrections", async () => {
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(new FailingCorrectionTransport()))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    openAnalysisDockTab("Object")
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

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    openAnalysisDockTab("Object")
    const objectRegistry = screen.getByRole("region", { name: "Object Registry" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Open Workspace" }))
    expect((await within(graphCanvas).findAllByText("path-a-b")).length).toBeGreaterThan(0)
    expect(within(graphCanvas).getByText("node-a -> node-b")).toBeInTheDocument()

    fireEvent.click(within(objectRegistry).getByRole("button", { name: /object b/i }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Add Node" }))

    expect((await within(graphCanvas).findAllByText("node-web-3")).length).toBeGreaterThan(0)
    expect(within(graphCanvas).getAllByText("object-b").length).toBeGreaterThan(0)
    expect(within(graphCanvas).getByText("Disconnected nodes")).toBeInTheDocument()

    const nodeB = within(graphCanvas).getByRole("button", { name: /node-b/i })
    fireEvent.click(nodeB)
    await waitFor(() => expect(nodeB).toHaveAttribute("aria-current", "true"))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Connect" }))
    await waitFor(() => expect(nodeB).toHaveClass("graph-node-card--pending"))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-web-3/i }))

    expect(await within(graphCanvas).findByText("No disconnected nodes")).toBeInTheDocument()
    expect(within(graphCanvas).getAllByText("2").length).toBeGreaterThan(0)

    fireEvent.click(nodeB)
    await waitFor(() => expect(nodeB).toHaveAttribute("aria-current", "true"))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Connect" }))
    await waitFor(() => expect(nodeB).toHaveClass("graph-node-card--pending"))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-web-3/i }))
    expect(within(graphCanvas).getAllByText("2").length).toBeGreaterThan(0)

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Set Path" }))

    expect((await within(graphCanvas).findAllByText("path-web-main")).length).toBeGreaterThan(0)
    expect(within(graphCanvas).getAllByText("node-a -> node-b -> node-web-3").length).toBeGreaterThan(0)
  })

  it("drags registered objects from the object registry into the graph canvas", async () => {
    const transport = new NoImportWarningProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    openAnalysisDockTab("Object")
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

  it("drops an external raw file into the active project and creates a graph node", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await createProjectWithContent(repository, "Raw Drop")
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /raw drop/i }))
    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")
    mockCanvasSurfaceRect(surface, 600, 360)
    const dataTransfer = new TestDataTransfer([new File(["2\nwater\n"], "water.xyz", { type: "chemical/x-xyz" })])

    fireEvent.dragOver(surface, { dataTransfer })
    dispatchDrop(surface, dataTransfer, 240, 180)

    expect((await within(graphCanvas).findAllByText("node-web-3")).length).toBeGreaterThan(0)
    const rawObjects = await repository.listObjects(project.projectRef, "inputs/raw")
    expect(rawObjects).toHaveLength(1)
    expect(rawObjects[0].path).toMatch(/^inputs\/raw\/[a-f0-9]{12}-water\.xyz$/)
    const rawFileName = projectRawObjectDisplayName(rawObjects[0])
    expect(screen.getAllByText(rawFileName).length).toBeGreaterThan(0)
    expect(screen.queryByText(rawObjects[0].path)).not.toBeInTheDocument()
    const projectFilesPanel = projectTreePanel()
    const rawFileRow = within(projectFilesPanel).getByText(rawFileName).closest(".project-file-card")
    if (!(rawFileRow instanceof HTMLElement)) {
      throw new Error("Project raw file row was not rendered.")
    }
    expect(within(rawFileRow).getByText("Used in graph")).toBeInTheDocument()
    expect(within(rawFileRow).getByText("On canvas: 1")).toBeInTheDocument()
    expect(within(rawFileRow).queryByText(/Warnings:/)).not.toBeInTheDocument()
    expect(within(rawFileRow).queryByText("object-imported-water")).not.toBeInTheDocument()
    expect(within(rawFileRow).queryByText("node-web-3")).not.toBeInTheDocument()
    expect(transport.payloads.find((payload) => payload.command === "import.preview")?.args).toMatchObject({
      source_paths: [rawObjects[0].path],
    })
    expect(transport.payloads.find((payload) => payload.command === "import.register_all")?.args).toMatchObject({
      batch_id: "import-batch-fixture-web-1",
    })
    expect(lastPayload(transport, "workspace.add_node")?.args).toMatchObject({
      chemical_object_ids: ["object-imported-water"],
      position: [240, 180],
    })

    fireEvent.click(screen.getByRole("button", { name: "Save Project" }))
    await waitFor(() => expect(transport.payloads.some((payload) => payload.command === "project.save_content")).toBe(true))
    fireEvent.click(screen.getByRole("button", { name: /raw drop/i }))

    expect((await within(graphCanvas).findAllByText("node-web-3")).length).toBeGreaterThan(0)
    const restoredProjectFilesPanel = projectTreePanel()
    const restoredRawFileRow = within(restoredProjectFilesPanel).getByText(rawFileName).closest(".project-file-card")
    if (!(restoredRawFileRow instanceof HTMLElement)) {
      throw new Error("Restored project raw file row was not rendered.")
    }
    await waitFor(() => {
      expect(within(restoredRawFileRow).getByText("Used in graph")).toBeInTheDocument()
      expect(within(restoredRawFileRow).getByText("On canvas: 1")).toBeInTheDocument()
      expect(within(restoredRawFileRow).queryByText("object-imported-water")).not.toBeInTheDocument()
      expect(within(restoredRawFileRow).queryByText("node-web-3")).not.toBeInTheDocument()
    })
  })

  it("shows a parse candidate chooser for multi-object raw drops without creating a node before confirmation", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await createProjectWithContent(repository, "Raw Drop Candidates")
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /raw drop candidates/i }))
    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")
    mockCanvasSurfaceRect(surface, 600, 360)
    const dataTransfer = new TestDataTransfer([new File(["2\nframe 1\n2\nframe 2\n"], "multi.extxyz", { type: "chemical/x-extxyz" })])

    fireEvent.dragOver(surface, { dataTransfer })
    dispatchDrop(surface, dataTransfer, 260, 160)

    expect(await within(graphCanvas).findByRole("region", { name: "Parse Candidate Chooser" })).toBeInTheDocument()
    expect(within(graphCanvas).getByText("Frame 1")).toBeInTheDocument()
    expect(within(graphCanvas).getByText("Frame 2")).toBeInTheDocument()
    expect(within(graphCanvas).getByRole("button", { name: "Add selected (1)" })).toBeEnabled()
    expect(transport.payloads.filter((payload) => payload.command === "import.register_all")).toHaveLength(0)
    expect(transport.payloads.filter((payload) => payload.command === "import.register_selection")).toHaveLength(0)
    expect(transport.payloads.filter((payload) => payload.command === "workspace.add_node")).toHaveLength(0)

    const rawObjects = await repository.listObjects(project.projectRef, "inputs/raw")
    expect(rawObjects).toHaveLength(1)
    expect(rawObjects[0].path).toMatch(/multi\.extxyz$/)
    const projectFilesPanel = projectTreePanel()
    const rawFileName = projectRawObjectDisplayName(rawObjects[0])
    const rawFileRow = within(projectFilesPanel).getByText(rawFileName).closest(".project-file-card")
    if (!(rawFileRow instanceof HTMLElement)) {
      throw new Error("Project raw file row was not rendered.")
    }
    expect(within(rawFileRow).getByText("Previewed")).toBeInTheDocument()

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(within(graphCanvas).queryByRole("region", { name: "Parse Candidate Chooser" })).not.toBeInTheDocument()
    })
    expect(transport.payloads.filter((payload) => payload.command === "workspace.add_node")).toHaveLength(0)
  })

  it("registers selected raw file candidates and creates stack graph nodes", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await createProjectWithContent(repository, "Raw Candidate Nodes")
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /raw candidate nodes/i }))
    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")
    mockCanvasSurfaceRect(surface, 600, 360)
    const dataTransfer = new TestDataTransfer([new File(["2\nframe 1\n2\nframe 2\n"], "multi.extxyz", { type: "chemical/x-extxyz" })])

    fireEvent.dragOver(surface, { dataTransfer })
    dispatchDrop(surface, dataTransfer, 260, 160)

    expect(await within(graphCanvas).findByRole("region", { name: "Parse Candidate Chooser" })).toBeInTheDocument()
    fireEvent.click(within(graphCanvas).getByRole("checkbox", { name: "Select Frame 2" }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Add selected (2)" }))

    await waitFor(() => {
      expect(transport.payloads.filter((payload) => payload.command === "workspace.add_node")).toHaveLength(2)
    })
    expect(within(graphCanvas).queryByRole("region", { name: "Parse Candidate Chooser" })).not.toBeInTheDocument()
    expect(transport.payloads.find((payload) => payload.command === "import.register_selection")?.args).toMatchObject({
      batch_id: "import-batch-fixture-web-1",
      item_id: "import-item-water",
      object_indices: [0, 1],
    })
    const addNodePayloads = transport.payloads.filter((payload) => payload.command === "workspace.add_node")
    expect(addNodePayloads[0]?.args).toMatchObject({
      chemical_object_ids: ["object-imported-frame-1"],
      position: [260, 160],
    })
    expect(addNodePayloads[1]?.args).toMatchObject({
      chemical_object_ids: ["object-imported-frame-2"],
      position: [420, 280],
    })
    expect((await within(graphCanvas).findAllByText("node-web-3")).length).toBeGreaterThan(0)
    expect((await within(graphCanvas).findAllByText("node-web-4")).length).toBeGreaterThan(0)
    expect(within(graphCanvas).getAllByText("extxyz fixture").length).toBeGreaterThan(0)
    expect(within(graphCanvas).getByText("electronic -100.25 hartree")).toBeInTheDocument()
    expect(within(graphCanvas).getByText("electronic -100.1 hartree")).toBeInTheDocument()
    expect(within(graphCanvas).getAllByText("3 atoms · O H · 3D").length).toBeGreaterThan(0)

    const rawObjects = await repository.listObjects(project.projectRef, "inputs/raw")
    expect(rawObjects).toHaveLength(1)
    const projectFilesPanel = projectTreePanel()
    const rawFileName = projectRawObjectDisplayName(rawObjects[0])
    const rawFileRow = within(projectFilesPanel).getByText(rawFileName).closest(".project-file-card")
    if (!(rawFileRow instanceof HTMLElement)) {
      throw new Error("Project raw file row was not rendered.")
    }
    expect(within(rawFileRow).getByText("Used in graph")).toBeInTheDocument()
    expect(within(rawFileRow).getByText("On canvas: 2")).toBeInTheDocument()
    expect(within(rawFileRow).queryByText("object-imported-frame-1")).not.toBeInTheDocument()
    expect(within(rawFileRow).queryByText("object-imported-frame-2")).not.toBeInTheDocument()
  })

  it("keeps registered candidates visible when candidate add-node fails", async () => {
    const repository = new MemoryBrowserProjectRepository()
    await createProjectWithContent(repository, "Raw Candidate Add Fails")
    const transport = new FailingWorkspaceAddNodeTransport()
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /raw candidate add fails/i }))
    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")
    mockCanvasSurfaceRect(surface, 600, 360)
    const dataTransfer = new TestDataTransfer([new File(["2\nframe 1\n2\nframe 2\n"], "multi.extxyz", { type: "chemical/x-extxyz" })])

    fireEvent.dragOver(surface, { dataTransfer })
    dispatchDrop(surface, dataTransfer, 260, 160)

    expect(await within(graphCanvas).findByRole("region", { name: "Parse Candidate Chooser" })).toBeInTheDocument()
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Add selected (1)" }))

    expect((await screen.findAllByText("graph_invalid")).length).toBeGreaterThan(0)
    expect(transport.payloads.find((payload) => payload.command === "import.register_selection")?.args).toMatchObject({
      object_indices: [0],
    })
    expect(transport.payloads.filter((payload) => payload.command === "workspace.add_node")).toHaveLength(1)
    expect(within(graphCanvas).queryByText("node-web-3")).not.toBeInTheDocument()
    openAnalysisDockTab("Object")
    const objectRegistry = screen.getByRole("region", { name: "Object Registry" })
    expect(within(objectRegistry).getByRole("button", { name: /frame 1/i })).toBeInTheDocument()
  })

  it("reuses project raw file rows without writing another raw object", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await createProjectWithContent(repository, "Project Raw Reuse")
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /project raw reuse/i }))
    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")
    mockCanvasSurfaceRect(surface, 600, 360)
    const externalDrop = new TestDataTransfer([new File(["2\nwater\n"], "water.xyz", { type: "chemical/x-xyz" })])
    fireEvent.dragOver(surface, { dataTransfer: externalDrop })
    dispatchDrop(surface, externalDrop, 240, 180)
    expect((await within(graphCanvas).findAllByText("node-web-3")).length).toBeGreaterThan(0)
    const rawObjects = await repository.listObjects(project.projectRef, "inputs/raw")
    expect(rawObjects).toHaveLength(1)

    const projectFilesPanel = projectTreePanel()
    const rawFileRow = within(projectFilesPanel).getByText(projectRawObjectDisplayName(rawObjects[0])).closest(".project-file-card")
    if (!(rawFileRow instanceof HTMLElement)) {
      throw new Error("Project raw file row was not rendered.")
    }
    const projectFileDrop = new TestDataTransfer()
    fireEvent.dragStart(rawFileRow, { dataTransfer: projectFileDrop })
    expect(projectFileDrop.getData(graphRawFileDropMimeType)).toContain(rawObjects[0].path)

    fireEvent.dragOver(surface, { dataTransfer: projectFileDrop })
    dispatchDrop(surface, projectFileDrop, 360, 200)

    await waitFor(() => {
      expect(transport.payloads.filter((payload) => payload.command === "workspace.add_node")).toHaveLength(2)
    })
    await expect(repository.listObjects(project.projectRef, "inputs/raw")).resolves.toHaveLength(1)
    expect(lastPayload(transport, "workspace.add_node")?.args).toMatchObject({
      chemical_object_ids: ["object-imported-water"],
      position: [360, 200],
    })

    expect((await within(graphCanvas).findAllByText("node-web-4")).length).toBeGreaterThan(0)

    fireEvent.click(within(rawFileRow).getByRole("button", { name: "Add to canvas" }))

    await waitFor(() => {
      expect(transport.payloads.filter((payload) => payload.command === "workspace.add_node")).toHaveLength(3)
    })
    await expect(repository.listObjects(project.projectRef, "inputs/raw")).resolves.toHaveLength(1)
    expect(lastPayload(transport, "workspace.add_node")?.args).toMatchObject({
      chemical_object_ids: ["object-imported-water"],
      position: [1160, 280],
    })
  })

  it("stops raw file drops when project raw persistence fails", async () => {
    const repository = new FailingRawInputProjectRepository()
    await createProjectWithContent(repository, "Raw Drop Fails")
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /raw drop fails/i }))
    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")
    mockCanvasSurfaceRect(surface, 600, 360)
    const dataTransfer = new TestDataTransfer([new File(["2\nwater\n"], "water.xyz", { type: "chemical/x-xyz" })])

    fireEvent.dragOver(surface, { dataTransfer })
    dispatchDrop(surface, dataTransfer, 240, 180)

    expect((await screen.findAllByText("storage_quota_exceeded")).length).toBeGreaterThan(0)
    expect(transport.payloads.filter((payload) => payload.command === "import.preview")).toHaveLength(0)
    expect(transport.payloads.filter((payload) => payload.command === "import.register_all")).toHaveLength(0)
    expect(transport.payloads.filter((payload) => payload.command === "workspace.add_node")).toHaveLength(0)
    expect(within(graphCanvas).queryByText("node-web-3")).not.toBeInTheDocument()
  })

  it("shows project file error state when raw drop preview fails", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await createProjectWithContent(repository, "Raw Preview Fails")
    const transport = new FailingImportPreviewTransport()
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /raw preview fails/i }))
    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")
    mockCanvasSurfaceRect(surface, 600, 360)
    const dataTransfer = new TestDataTransfer([new File(["2\nwater\n"], "water.xyz", { type: "chemical/x-xyz" })])

    fireEvent.dragOver(surface, { dataTransfer })
    dispatchDrop(surface, dataTransfer, 240, 180)

    expect((await screen.findAllByText("preview_failed")).length).toBeGreaterThan(0)
    const rawObjects = await repository.listObjects(project.projectRef, "inputs/raw")
    expect(rawObjects).toHaveLength(1)
    const projectFilesPanel = projectTreePanel()
    const rawFileRow = within(projectFilesPanel).getByText(projectRawObjectDisplayName(rawObjects[0])).closest(".project-file-card")
    if (!(rawFileRow instanceof HTMLElement)) {
      throw new Error("Project raw file row was not rendered.")
    }
    expect(within(rawFileRow).getByText("Error")).toBeInTheDocument()
    expect(within(rawFileRow).getByText("Warnings: 1")).toBeInTheDocument()
    expect(within(rawFileRow).queryByText("preview_failed")).not.toBeInTheDocument()
    expect(within(rawFileRow).queryByText("import.preview")).not.toBeInTheDocument()
    expect(transport.payloads.filter((payload) => payload.command === "import.register_all")).toHaveLength(0)
    expect(transport.payloads.filter((payload) => payload.command === "workspace.add_node")).toHaveLength(0)
  })

  it("applies viewport zoom, fit, reset and keeps drop coordinates in graph space", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
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

    openAnalysisDockTab("Object")
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

  it("zooms graph viewport from scoped wheel input without hijacking outside scroll", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")
    mockCanvasSurfaceRect(surface, 600, 360)
    await waitFor(() => expect(within(graphCanvas).getByLabelText("100%")).toBeInTheDocument())

    dispatchWheel(surface, { deltaY: -100, clientX: 300, clientY: 180 })

    await within(graphCanvas).findByLabelText("110%")
    expect(lastPayload(transport, "workspace.set_viewport")?.args).toMatchObject({
      viewport: {
        x: expect.closeTo(27.2727, 4),
        y: expect.closeTo(16.3636, 4),
        zoom: expect.closeTo(1.1, 6),
      },
    })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Reset" }))
    await within(graphCanvas).findByLabelText("100%")
    dispatchWheel(surface, { deltaY: -100, clientX: 300, clientY: 180, ctrlKey: true })

    await within(graphCanvas).findByLabelText("120%")
    expect(lastPayload(transport, "workspace.set_viewport")?.args).toMatchObject({
      viewport: {
        x: expect.closeTo(50, 6),
        y: expect.closeTo(30, 6),
        zoom: expect.closeTo(1.2, 6),
      },
    })

    const viewportCommandCount = transport.payloads.filter((payload) => payload.command === "workspace.set_viewport").length
    dispatchWheel(graphCanvas, { deltaY: -100, clientX: 300, clientY: 180 })
    expect(transport.payloads.filter((payload) => payload.command === "workspace.set_viewport")).toHaveLength(viewportCommandCount)
  })

  it("ignores wheel viewport input before a workspace is available", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    const graphCanvas = await screen.findByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")
    mockCanvasSurfaceRect(surface, 600, 360)

    fireEvent.wheel(surface, { deltaY: -100, clientX: 300, clientY: 180 })

    expect(transport.payloads.filter((payload) => payload.command === "workspace.set_viewport")).toHaveLength(0)
  })

  it("navigates graph viewport from minimap click and drag release", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const minimapPanel = within(graphCanvas).getByLabelText("Graph minimap")
    const minimap = within(minimapPanel).getByRole("button", { name: "Navigate graph minimap" })
    mockCanvasSurfaceRect(minimap, 180, 108)

    expect(within(minimapPanel).getByLabelText("Minimap zoom 100%")).toBeInTheDocument()
    expect(minimap.querySelectorAll(".graph-minimap-node")).toHaveLength(2)
    expect(minimap.querySelector(".graph-minimap-window")).toBeInTheDocument()

    const viewportCountBeforeClick = transport.payloads.filter((payload) => payload.command === "workspace.set_viewport").length
    fireEvent.pointerDown(minimap, { button: 0, clientX: 90, clientY: 54, pointerId: 21 })
    fireEvent.pointerUp(minimap, { button: 0, clientX: 90, clientY: 54, pointerId: 21 })

    expect(transport.payloads.filter((payload) => payload.command === "workspace.set_viewport")).toHaveLength(viewportCountBeforeClick + 1)
    const clickViewport = lastPayload(transport, "workspace.set_viewport")?.args.viewport as { x: number; y: number; zoom: number }
    expect(clickViewport.zoom).toBe(1)
    expect(Number.isFinite(clickViewport.x)).toBe(true)
    expect(Number.isFinite(clickViewport.y)).toBe(true)

    const viewportCountBeforeDrag = transport.payloads.filter((payload) => payload.command === "workspace.set_viewport").length
    fireEvent.pointerDown(minimap, { button: 0, clientX: 80, clientY: 48, pointerId: 22 })
    fireEvent.pointerMove(minimap, { button: 0, clientX: 110, clientY: 68, pointerId: 22 })
    expect(minimap.querySelector(".graph-minimap-window--draft")).toBeInTheDocument()
    expect(transport.payloads.filter((payload) => payload.command === "workspace.set_viewport")).toHaveLength(viewportCountBeforeDrag)

    fireEvent.pointerUp(minimap, { button: 0, clientX: 110, clientY: 68, pointerId: 22 })

    expect(transport.payloads.filter((payload) => payload.command === "workspace.set_viewport")).toHaveLength(viewportCountBeforeDrag + 1)
    expect(minimap.querySelector(".graph-minimap-window--draft")).not.toBeInTheDocument()
  })

  it("undoes and redoes graph viewport edits through history controls", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    mockCanvasSurfaceRect(within(graphCanvas).getByLabelText("Graph canvas surface"), 600, 360)

    expect(within(graphCanvas).getByRole("button", { name: "Undo" })).toBeDisabled()
    expect(within(graphCanvas).getByRole("button", { name: "Redo" })).toBeDisabled()

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Zoom In" }))
    await within(graphCanvas).findByLabelText("120%")
    expect(within(graphCanvas).getByRole("button", { name: "Undo" })).toBeEnabled()
    expect(within(graphCanvas).getByRole("button", { name: "Undo" })).toHaveAttribute("title", "Undo Viewport")

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Undo" }))

    await within(graphCanvas).findByLabelText("100%")
    expect(lastPayload(transport, "workspace.set_viewport")?.args).toMatchObject({
      viewport: { x: 0, y: 0, zoom: 1 },
    })
    expect(within(graphCanvas).getByRole("button", { name: "Redo" })).toBeEnabled()

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Redo" }))

    await within(graphCanvas).findByLabelText("120%")
    expect(lastPayload(transport, "workspace.set_viewport")?.args).toMatchObject({
      viewport: { x: 50, y: 30, zoom: 1.2 },
    })
  })

  it("undoes and redoes graph selection without recording energy panel point selection", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-a/i }))
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a"], edge_ids: [], path_ids: [] },
    }))

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Undo" }))

    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: [], edge_ids: [], path_ids: [] },
    }))
    await waitFor(() => expect(within(graphCanvas).getByRole("button", { name: /node-a/i })).not.toHaveAttribute("aria-current", "true"))

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Redo" }))

    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a"], edge_ids: [], path_ids: [] },
    }))
    await waitFor(() => expect(within(graphCanvas).getByRole("button", { name: /node-a/i })).toHaveAttribute("aria-current", "true"))

    openAnalysisDockTab("PES")
    const energyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })
    fireEvent.click(within(energyPanel).getByLabelText(/Object B node-b/))
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-b"], edge_ids: [], path_ids: [] },
    }))
    expect(within(graphCanvas).getByRole("button", { name: "Undo" })).toBeDisabled()
  })

  it("undoes and redoes selected node nudges through move_node replay", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")

    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-a/i }))
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a"], edge_ids: [], path_ids: [] },
    }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-b/i }), { shiftKey: true })
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a", "node-b"], edge_ids: [], path_ids: [] },
    }))
    await waitFor(() => {
      expect(within(graphCanvas).getByRole("button", { name: /node-a/i })).toHaveAttribute("aria-current", "true")
      expect(within(graphCanvas).getByRole("button", { name: /node-b/i })).toHaveAttribute("aria-current", "true")
    })

    fireEvent.keyDown(surface, { key: "ArrowRight" })

    await waitFor(() => expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node")).toHaveLength(2))
    expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node").map((payload) => payload.args.position)).toEqual([
      [140, 160],
      [380, 160],
    ])

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Undo" }))

    await waitFor(() => expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node")).toHaveLength(4))
    expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node").slice(-2).map((payload) => payload.args.position)).toEqual([
      [120, 160],
      [360, 160],
    ])

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Redo" }))

    await waitFor(() => expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node")).toHaveLength(6))
    expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node").slice(-2).map((payload) => payload.args.position)).toEqual([
      [140, 160],
      [380, 160],
    ])
  })

  it("undoes graph auto layout positions and viewport fit", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Apply Layout" }))
    await within(graphCanvas).findByText("Layout applied")
    expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node")).toHaveLength(2)
    expect(lastPayload(transport, "workspace.set_viewport")?.args.viewport).toMatchObject({
      zoom: expect.any(Number),
    })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Undo" }))

    await waitFor(() => expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node")).toHaveLength(4))
    expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node").slice(-2).map((payload) => payload.args)).toMatchObject([
      { node_id: "node-a", position: [120, 160] },
      { node_id: "node-b", position: [360, 160] },
    ])
    expect(lastPayload(transport, "workspace.set_viewport")?.args).toMatchObject({
      viewport: { x: 0, y: 0, zoom: 1 },
    })
    expect(await within(graphCanvas).findByLabelText("100%")).toBeInTheDocument()
  })

  it("clears graph history after destructive graph edits", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    mockCanvasSurfaceRect(within(graphCanvas).getByLabelText("Graph canvas surface"), 600, 360)

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Zoom In" }))
    await within(graphCanvas).findByLabelText("120%")
    expect(within(graphCanvas).getByRole("button", { name: "Undo" })).toBeEnabled()

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Edge Object A to Object B" }))
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: [], edge_ids: ["edge-a-b"], path_ids: [] },
    }))
    await waitFor(() => expect(within(graphCanvas).getByRole("button", { name: "Delete Selected" })).toBeEnabled())
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Delete Selected" }))

    await waitFor(() => expect(lastPayload(transport, "workspace.remove")?.args).toMatchObject({
      edge_ids: ["edge-a-b"],
    }))
    await waitFor(() => expect(within(graphCanvas).getByRole("button", { name: "Undo" })).toBeDisabled())
    expect(within(graphCanvas).getByRole("button", { name: "Redo" })).toBeDisabled()
  })

  it("moves graph nodes through workspace.move_node while keeping click selection", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const nodeB = within(graphCanvas).getByRole("button", { name: /node-b/i })

    fireEvent.click(nodeB)
    await waitFor(() => expect(nodeB).toHaveAttribute("aria-current", "true"))
    expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node")).toHaveLength(0)

    fireEvent.pointerDown(nodeB, { button: 0, clientX: 360, clientY: 160, pointerId: 1 })
    fireEvent.pointerMove(nodeB, { button: 0, clientX: 420, clientY: 210, pointerId: 1 })
    fireEvent.pointerUp(nodeB, { button: 0, clientX: 420, clientY: 210, pointerId: 1 })

    const movePayload = transport.payloads.find((payload) => payload.command === "workspace.move_node")
    expect(movePayload?.args).toMatchObject({
      node_id: "node-b",
      position: [420, 220],
    })
    expect(nodeShell(await within(graphCanvas).findByRole("button", { name: /node-b/i }))).toHaveStyle({
      left: "70%",
    })
  })

  it("keeps node drag release coordinates in graph space after zoom", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
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

  it("draws a direct graph edge from a node handle through workspace.connect", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    openAnalysisDockTab("Object")
    const objectRegistry = screen.getByRole("region", { name: "Object Registry" })
    mockCanvasSurfaceRect(within(graphCanvas).getByLabelText("Graph canvas surface"), 600, 360)

    fireEvent.click(within(objectRegistry).getByRole("button", { name: /object b/i }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Add Node" }))
    expect((await within(graphCanvas).findAllByText("node-web-3")).length).toBeGreaterThan(0)
    const nodeB = within(graphCanvas).getByRole("button", { name: /node-b/i })
    const nodeWeb = within(graphCanvas).getByRole("button", { name: /node-web-3/i })
    const handle = within(nodeShell(nodeB)).getByRole("button", { name: "Draw edge from Object B" })
    const computeCountBeforeConnect = transport.payloads.filter((payload) => payload.command === "energy.compute").length
    const restoreElementsFromPoint = mockElementsFromPoint([nodeWeb])
    try {
      fireEvent.pointerDown(handle, { button: 0, clientX: 360, clientY: 160, pointerId: 7 })
      fireEvent.pointerMove(handle, { button: 0, clientX: 480, clientY: 160, pointerId: 7 })

      expect(transport.payloads.filter((payload) => payload.command === "workspace.connect" && payload.args.to_node_id === "node-web-3")).toHaveLength(0)
      expect(within(graphCanvas).queryByRole("button", { name: "Edge Object B to Object B" })).not.toBeInTheDocument()

      fireEvent.pointerUp(handle, { button: 0, clientX: 480, clientY: 160, pointerId: 7 })

      await waitFor(() => expect(lastPayload(transport, "workspace.connect")?.args).toMatchObject({
        from_node_id: "node-b",
        to_node_id: "node-web-3",
      }))
      await waitFor(() => expect(lastPayload(transport, "workspace.set_path")?.args).toMatchObject({
        path_id: "path-a-b",
        node_ids: ["node-a", "node-b", "node-web-3"],
      }))
      await waitFor(() => expect(transport.payloads.filter((payload) => payload.command === "energy.compute")).toHaveLength(computeCountBeforeConnect + 1))
      expect(lastPayload(transport, "energy.compute")?.args).toMatchObject({
        path_id: "path-a-b",
      })
      openAnalysisDockTab("PES")
      const energyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })
      expect((await within(energyPanel).findAllByText("Step delta")).length).toBeGreaterThan(0)
      expect((await within(energyPanel).findAllByText("node-web-3")).length).toBeGreaterThan(0)
      expect(within(graphCanvas).getByText("Active path updated (append-tail)")).toBeInTheDocument()
      expect(await within(graphCanvas).findByRole("button", { name: "Edge Object B to Object B" })).toBeInTheDocument()
      expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node")).toHaveLength(0)
    } finally {
      restoreElementsFromPoint()
    }
  })

  it("creates an active path from a connection when no active path exists", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Select path Fixture path" }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Delete Selected" }))
    await waitFor(() => {
      expect(within(graphCanvas).queryByRole("button", { name: "Select path Fixture path" })).not.toBeInTheDocument()
    })

    const nodeA = within(graphCanvas).getByRole("button", { name: /node-a/i })
    fireEvent.click(nodeA)
    await waitFor(() => expect(nodeA).toHaveAttribute("aria-current", "true"))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Connect" }))
    await waitFor(() => expect(nodeA).toHaveClass("graph-node-card--pending"))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-b/i }))

    await waitFor(() => expect(lastPayload(transport, "workspace.set_path")?.args).toMatchObject({
      path_id: "path-web-main",
      node_ids: ["node-a", "node-b"],
    }))
    expect(within(graphCanvas).getByText("Active path updated (create)")).toBeInTheDocument()
    expect(await within(graphCanvas).findByText("node-a -> node-b")).toBeInTheDocument()
  })

  it("keeps branch connections manual instead of rewriting the active path", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    openAnalysisDockTab("Object")
    const objectRegistry = screen.getByRole("region", { name: "Object Registry" })
    mockCanvasSurfaceRect(within(graphCanvas).getByLabelText("Graph canvas surface"), 600, 360)

    fireEvent.click(within(objectRegistry).getByRole("button", { name: /object b/i }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Add Node" }))
    expect((await within(graphCanvas).findAllByText("node-web-3")).length).toBeGreaterThan(0)
    const setPathCount = transport.payloads.filter((payload) => payload.command === "workspace.set_path").length
    const nodeA = within(graphCanvas).getByRole("button", { name: /node-a/i })
    const nodeWeb = within(graphCanvas).getByRole("button", { name: /node-web-3/i })
    const handle = within(nodeShell(nodeA)).getByRole("button", { name: "Draw edge from Object A" })
    const restoreElementsFromPoint = mockElementsFromPoint([nodeWeb])
    try {
      fireEvent.pointerDown(handle, { button: 0, clientX: 120, clientY: 160, pointerId: 10 })
      fireEvent.pointerMove(handle, { button: 0, clientX: 480, clientY: 160, pointerId: 10 })
      fireEvent.pointerUp(handle, { button: 0, clientX: 480, clientY: 160, pointerId: 10 })

      await waitFor(() => expect(lastPayload(transport, "workspace.connect")?.args).toMatchObject({
        from_node_id: "node-a",
        to_node_id: "node-web-3",
      }))
      expect(transport.payloads.filter((payload) => payload.command === "workspace.set_path")).toHaveLength(setPathCount)
      expect(within(graphCanvas).getByText("Edge kept. Adjust path order manually (branch).")).toBeInTheDocument()
      expect(within(graphCanvas).getByText("node-a -> node-b")).toBeInTheDocument()
    } finally {
      restoreElementsFromPoint()
    }
  })

  it("clears direct edge gestures released on empty or same-node targets", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const handle = within(graphCanvas).getByRole("button", { name: "Draw edge from Object A" })
    const connectCount = transport.payloads.filter((payload) => payload.command === "workspace.connect").length

    const restoreElementsFromPoint = mockElementsFromPoint([])
    try {
      fireEvent.pointerDown(handle, { button: 0, clientX: 120, clientY: 160, pointerId: 8 })
      fireEvent.pointerMove(handle, { button: 0, clientX: 240, clientY: 220, pointerId: 8 })
      fireEvent.pointerUp(handle, { button: 0, clientX: 240, clientY: 220, pointerId: 8 })

      expect(transport.payloads.filter((payload) => payload.command === "workspace.connect")).toHaveLength(connectCount)

      const nodeA = within(graphCanvas).getByRole("button", { name: /node-a/i })
      mockElementsFromPoint([nodeA])
      fireEvent.pointerDown(handle, { button: 0, clientX: 120, clientY: 160, pointerId: 9 })
      fireEvent.pointerMove(handle, { button: 0, clientX: 120, clientY: 160, pointerId: 9 })
      fireEvent.pointerUp(handle, { button: 0, clientX: 120, clientY: 160, pointerId: 9 })

      expect(transport.payloads.filter((payload) => payload.command === "workspace.connect")).toHaveLength(connectCount)
    } finally {
      restoreElementsFromPoint()
    }
  })

  it("pans the empty canvas surface in pan mode without affecting node drag", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
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

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Apply Layout" }))

    await within(graphCanvas).findByText("Layout applied")
    const movePayloads = transport.payloads.filter((payload) => payload.command === "workspace.move_node")
    expect(movePayloads.map((payload) => payload.args.node_id)).toEqual(["node-a", "node-b"])
    expect(movePayloads.map((payload) => payload.args.position)).toEqual([[120, 180], [480, 180]])
    const viewportPayload = lastPayload(transport, "workspace.set_viewport")
    expect(viewportPayload?.args.viewport).toMatchObject({
      zoom: expect.any(Number),
    })
    expect(nodeShell(await within(graphCanvas).findByRole("button", { name: /node-a/i }))).toHaveStyle({
      left: "20%",
    })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Apply Layout" }))

    await within(graphCanvas).findByText("Layout already clean")
    expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node")).toHaveLength(2)
  })

  it("selects and deletes graph edges through workspace.remove", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const edge = within(graphCanvas).getByRole("button", { name: "Edge Object A to Object B" })

    fireEvent.click(edge)
    expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { edge_ids: ["edge-a-b"] },
    })
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Delete Selected" }))

    await waitFor(() => expect(lastPayload(transport, "workspace.remove")?.args).toMatchObject({
      edge_ids: ["edge-a-b"],
    }))
    await waitFor(() => expect(within(graphCanvas).getByText("0")).toBeInTheDocument())
    expect(within(graphCanvas).queryByRole("button", { name: "Edge Object A to Object B" })).not.toBeInTheDocument()
    expect(within(graphCanvas).getAllByText("node-a").length).toBeGreaterThan(0)
    expect(within(graphCanvas).getAllByText("node-b").length).toBeGreaterThan(0)
  })

  it("deletes selected graph nodes using shell cascade results", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-a/i }))
    expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a"] },
    })
    const deleteButton = within(graphCanvas).getByRole("button", { name: "Delete Selected" })
    await waitFor(() => expect(deleteButton).toBeEnabled())
    fireEvent.click(deleteButton)

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

  it("edits selected graph edge labels through an Edge Label Draft", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const edge = within(graphCanvas).getByRole("button", { name: "Edge Object A to Object B" })

    fireEvent.click(edge)
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { edge_ids: ["edge-a-b"] },
    }))
    await waitFor(() => {
      const projectedEditor = within(graphCanvas).getByRole("form", { name: "Edge Label Editor" })
      expect(within(projectedEditor).getByText("edge-a-b")).toBeInTheDocument()
    })
    const editor = within(graphCanvas).getByRole("form", { name: "Edge Label Editor" })
    expect(within(editor).getByText("edge-a-b")).toBeInTheDocument()
    expect(within(editor).getByLabelText("Label")).toHaveValue("")
    await waitFor(() => expect(within(editor).getByRole("button", { name: "Apply" })).toBeDisabled())

    fireEvent.change(within(editor).getByLabelText("Label"), { target: { value: "TS search" } })

    expect(transport.payloads.filter((payload) => payload.command === "workspace.update_edge")).toHaveLength(0)
    expect(within(graphCanvas).queryByRole("button", { name: "Edge Object A to Object B: TS search" })).not.toBeInTheDocument()
    await waitFor(() => expect(within(editor).getByRole("button", { name: "Apply" })).toBeEnabled())
    fireEvent.click(within(editor).getByRole("button", { name: "Apply" }))

    await waitFor(() => expect(lastPayload(transport, "workspace.update_edge")?.args).toMatchObject({
      edge_id: "edge-a-b",
      label: "TS search",
    }))
    expect(await within(graphCanvas).findByRole("button", { name: "Edge Object A to Object B: TS search" })).toBeInTheDocument()
    expect(within(editor).getByText("Synced")).toBeInTheDocument()
    expect(within(editor).getByLabelText("Label")).toHaveValue("TS search")

    fireEvent.click(within(editor).getByRole("button", { name: "Clear" }))
    expect(within(editor).getByText("Draft")).toBeInTheDocument()
    await waitFor(() => expect(within(editor).getByRole("button", { name: "Apply" })).toBeEnabled())
    fireEvent.click(within(editor).getByRole("button", { name: "Apply" }))

    await waitFor(() => expect(lastPayload(transport, "workspace.update_edge")?.args).toMatchObject({
      edge_id: "edge-a-b",
      label: null,
    }))
    expect(await within(graphCanvas).findByRole("button", { name: "Edge Object A to Object B" })).toBeInTheDocument()
    expect(within(graphCanvas).queryByRole("button", { name: "Edge Object A to Object B: TS search" })).not.toBeInTheDocument()
    expect(within(editor).getByLabelText("Label")).toHaveValue("")
  })

  it("deletes selected graph paths without removing nodes or edges", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Select path Fixture path" }))
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { path_ids: ["path-a-b"] },
    }))
    await waitFor(() => expect(within(graphCanvas).getByRole("button", { name: "Delete Selected" })).toBeEnabled())
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

  it("selects graph items with replace and Shift toggle semantics while guarding single-item drafts", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const nodeA = within(graphCanvas).getByRole("button", { name: /node-a/i })
    const nodeB = within(graphCanvas).getByRole("button", { name: /node-b/i })

    fireEvent.click(nodeA)
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a"], edge_ids: [], path_ids: [] },
    }))
    await waitFor(() => expect(within(graphCanvas).getByRole("form", { name: "Node Composition Editor" })).toHaveTextContent("node-a"))

    fireEvent.click(nodeB, { shiftKey: true })
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a", "node-b"], edge_ids: [], path_ids: [] },
    }))
    await waitFor(() => {
      expect(within(graphCanvas).getByRole("button", { name: /node-a/i })).toHaveAttribute("aria-current", "true")
      expect(within(graphCanvas).getByRole("button", { name: /node-b/i })).toHaveAttribute("aria-current", "true")
    })
    expect(within(graphCanvas).getByRole("form", { name: "Node Composition Editor" })).toHaveTextContent("Select a graph node to edit composition.")

    fireEvent.click(nodeB, { shiftKey: true })
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a"], edge_ids: [], path_ids: [] },
    }))
    await waitFor(() => expect(nodeB).not.toHaveAttribute("aria-current", "true"))

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Edge Object A to Object B" }), { shiftKey: true })
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a"], edge_ids: ["edge-a-b"], path_ids: [] },
    }))
    expect(within(graphCanvas).getByRole("form", { name: "Node Composition Editor" })).toHaveTextContent("Select a graph node to edit composition.")
    expect(within(graphCanvas).getByRole("form", { name: "Edge Label Editor" })).toHaveTextContent("Select an edge to edit its label.")
    expect(within(graphCanvas).getByRole("button", { name: "Connect" })).toBeDisabled()

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Select path Fixture path" }), { shiftKey: true })
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a"], edge_ids: ["edge-a-b"], path_ids: ["path-a-b"] },
    }))
    expect(within(graphCanvas).queryByLabelText("Path order draft")).not.toBeInTheDocument()
    expect(within(graphCanvas).getByRole("button", { name: "Delete Selected" })).toBeEnabled()
  })

  it("rubber-bands graph nodes after pointer release without shell commands during drag", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")
    mockCanvasSurfaceRect(surface, 600, 360)
    const selectCountBeforeDrag = transport.payloads.filter((payload) => payload.command === "workspace.select").length

    fireEvent.pointerDown(surface, { button: 0, clientX: 80, clientY: 100, pointerId: 12 })
    fireEvent.pointerMove(surface, { button: 0, clientX: 400, clientY: 220, pointerId: 12 })

    expect(graphCanvas.querySelector(".graph-rubber-band")).toBeInTheDocument()
    expect(transport.payloads.filter((payload) => payload.command === "workspace.select")).toHaveLength(selectCountBeforeDrag)

    fireEvent.pointerUp(surface, { button: 0, clientX: 400, clientY: 220, pointerId: 12 })

    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a", "node-b"], edge_ids: [], path_ids: [] },
    }))
    await waitFor(() => expect(graphCanvas.querySelector(".graph-rubber-band")).not.toBeInTheDocument())
    expect(within(graphCanvas).getByRole("button", { name: /node-a/i })).toHaveAttribute("aria-current", "true")
    expect(within(graphCanvas).getByRole("button", { name: /node-b/i })).toHaveAttribute("aria-current", "true")
  })

  it("uses Delete and Backspace keys for the current graph selection without firing on empty selection", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")
    const removeCountBeforeEmptyDelete = transport.payloads.filter((payload) => payload.command === "workspace.remove").length

    fireEvent.keyDown(surface, { key: "Delete" })

    expect(transport.payloads.filter((payload) => payload.command === "workspace.remove")).toHaveLength(removeCountBeforeEmptyDelete)

    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-a/i }))
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a"], edge_ids: [], path_ids: [] },
    }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Edge Object A to Object B" }), { shiftKey: true })
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a"], edge_ids: ["edge-a-b"], path_ids: [] },
    }))
    await waitFor(() => expect(within(graphCanvas).getByRole("button", { name: "Edge Object A to Object B" })).toHaveClass("graph-edge-hitbox--selected"))

    fireEvent.keyDown(surface, { key: "Backspace" })

    await waitFor(() => expect(lastPayload(transport, "workspace.remove")?.args).toMatchObject({
      node_ids: ["node-a"],
      edge_ids: ["edge-a-b"],
      path_ids: [],
    }))
  })

  it("clears click-driven connection state with Escape before the next node click", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")

    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-a/i }))
    await waitFor(() => expect(within(graphCanvas).getByRole("button", { name: "Connect" })).toBeEnabled())
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Connect" }))
    fireEvent.keyDown(surface, { key: "Escape" })

    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: [], edge_ids: [], path_ids: [] },
    }))
    const connectCountBeforeNodeClick = transport.payloads.filter((payload) => payload.command === "workspace.connect").length
    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-b/i }))

    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-b"], edge_ids: [], path_ids: [] },
    }))
    expect(transport.payloads.filter((payload) => payload.command === "workspace.connect")).toHaveLength(connectCountBeforeNodeClick)
  })

  it("nudges selected graph nodes with arrow keys and ignores graph shortcuts from editor inputs", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    const surface = within(graphCanvas).getByLabelText("Graph canvas surface")

    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-a/i }))
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a"], edge_ids: [], path_ids: [] },
    }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-b/i }), { shiftKey: true })
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a", "node-b"], edge_ids: [], path_ids: [] },
    }))
    await waitFor(() => {
      expect(within(graphCanvas).getByRole("button", { name: /node-a/i })).toHaveAttribute("aria-current", "true")
      expect(within(graphCanvas).getByRole("button", { name: /node-b/i })).toHaveAttribute("aria-current", "true")
    })
    fireEvent.keyDown(surface, { key: "ArrowRight" })

    await waitFor(() => expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node")).toHaveLength(2))
    const movePayloads = transport.payloads.filter((payload) => payload.command === "workspace.move_node")
    expect(movePayloads.map((payload) => payload.args.node_id)).toEqual(["node-a", "node-b"])
    expect(movePayloads.map((payload) => payload.args.position)).toEqual([[140, 160], [380, 160]])

    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Edge Object A to Object B" }))
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: [], edge_ids: ["edge-a-b"], path_ids: [] },
    }))
    await waitFor(() => expect(within(graphCanvas).getByRole("button", { name: "Edge Object A to Object B" })).toHaveClass("graph-edge-hitbox--selected"))
    fireEvent.keyDown(surface, { key: "ArrowLeft" })
    expect(transport.payloads.filter((payload) => payload.command === "workspace.move_node")).toHaveLength(2)

    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-a/i }))
    const editor = within(graphCanvas).getByRole("form", { name: "Node Composition Editor" })
    const removeCountBeforeInputDelete = transport.payloads.filter((payload) => payload.command === "workspace.remove").length
    fireEvent.keyDown(within(editor).getByLabelText("Coef"), { key: "Delete" })
    expect(transport.payloads.filter((payload) => payload.command === "workspace.remove")).toHaveLength(removeCountBeforeInputDelete)
  })

  it("edits selected node composition through a Composition Draft before applying workspace.set_node_composition", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-a/i }))
    await waitFor(() => expect(lastPayload(transport, "workspace.select")?.args).toMatchObject({
      selection: { node_ids: ["node-a"], edge_ids: [], path_ids: [] },
    }))
    const editor = within(graphCanvas).getByRole("form", { name: "Node Composition Editor" })
    expect(await within(editor).findByDisplayValue("1")).toBeInTheDocument()
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
    expect(within(graphCanvas).getAllByText("Object A + Object B").length).toBeGreaterThan(0)
  })

  it("shows composition coefficient errors without sending workspace.set_node_composition", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })

    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-a/i }))
    const editor = within(graphCanvas).getByRole("form", { name: "Node Composition Editor" })
    await waitFor(() => expect(editor).toHaveTextContent("node-a"))
    fireEvent.change(within(editor).getByLabelText("Coef"), { target: { value: "0" } })
    fireEvent.click(within(editor).getByRole("button", { name: "Apply" }))

    expect(await within(editor).findByText("invalid_input")).toBeInTheDocument()
    expect(within(editor).getByText("composition.0.coefficient")).toBeInTheDocument()
    expect(transport.payloads.filter((payload) => payload.command === "workspace.set_node_composition")).toHaveLength(0)
  })

  it("edits path order through a UI draft before applying workspace.set_path", async () => {
    const transport = new RecordingProjectBridgeTransport()
    renderWorkbench(undefined, "en-US", undefined, new ShellClient(transport))

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
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

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
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
    const repository = new MemoryBrowserProjectRepository()
    await createProjectWithContent(repository, "Missing Energy")
    renderWorkbench(repository)

    fireEvent.click(await screen.findByRole("button", { name: /missing energy/i }))
    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    dropExternalFileOnCanvas(graphCanvas, new File(["2\nwater\n"], "water.xyz", { type: "chemical/x-xyz" }))
    expect((await screen.findAllByText("object-imported-water")).length).toBeGreaterThan(0)
    expect((await within(graphCanvas).findAllByText("node-web-3")).length).toBeGreaterThan(0)
    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-b/i }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Connect" }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: /node-web-3/i }))
    fireEvent.click(within(graphCanvas).getByRole("button", { name: "Set Path" }))
    expect((await within(graphCanvas).findAllByText("path-web-main")).length).toBeGreaterThan(0)

    openAnalysisDockTab("PES")
    const energyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })
    fireEvent.click(within(energyPanel).getByRole("button", { name: "Compute" }))

    expect((await within(energyPanel).findAllByText("missing_energy")).length).toBeGreaterThan(0)
    const rows = within(energyPanel).getAllByRole("row")
    const missingRow = rows.find((row) => row.textContent?.includes("node-web-3"))
    expect(missingRow?.textContent).toContain("missing_energy")
    expect(missingRow?.textContent).not.toContain("-5.2")
    expect(within(energyPanel).getAllByText("Missing").length).toBeGreaterThan(0)
    openAnalysisDockTab("Export")
    const exportPanel = screen.getByRole("region", { name: "Report Export Panel" })
    expect(within(exportPanel).getByText("Needs review")).toBeInTheDocument()
  })

  it("renders invalid shell command errors with the error code visible", async () => {
    renderWorkbench()

    openAnalysisDockTab("Diagnostics")
    fireEvent.click(screen.getByRole("button", { name: "Invalid command" }))

    expect(await screen.findByText("invalid_input")).toBeInTheDocument()
    expect(screen.getByText(/Unknown shell command/)).toBeInTheDocument()
  })

  it("computes the active path energy profile from the energy panel", async () => {
    renderWorkbench()

    openAnalysisDockTab("PES")
    const emptyEnergyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })
    expect(within(emptyEnergyPanel).getByRole("button", { name: "Compute" })).toBeDisabled()

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    openAnalysisDockTab("PES")
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

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    openAnalysisDockTab("PES")
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

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    openAnalysisDockTab("PES")
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

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    openAnalysisDockTab("PES")
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

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
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

    openAnalysisDockTab("PES")
    const energyPanel = screen.getByRole("region", { name: "Energy Profile Panel" })
    fireEvent.click(within(energyPanel).getByRole("button", { name: "Compute" }))

    expect(within(graphCanvas).getAllByText("object-a + 2*object-b").length).toBeGreaterThan(0)
    const expressionDetails = within(energyPanel).getByLabelText("Expression details")
    await waitFor(() => expect(within(expressionDetails).getAllByText("coef 2").length).toBeGreaterThan(0))
    expect(within(expressionDetails).getAllByText("electronic · energies").length).toBeGreaterThan(0)
  })

  it("exports profile artifacts with inline download links", async () => {
    renderWorkbench()

    openAnalysisDockTab("Export")
    const emptyExportPanel = screen.getByRole("region", { name: "Report Export Panel" })
    openExportMode(emptyExportPanel)
    expect(within(emptyExportPanel).getByRole("button", { name: "Export" })).toBeDisabled()

    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    openAnalysisDockTab("Export")
    const exportPanel = screen.getByRole("region", { name: "Report Export Panel" })
    openExportMode(exportPanel)
    expect(within(exportPanel).getByRole("button", { name: "Preview mode" })).toHaveAttribute("aria-pressed", "false")
    expect(within(exportPanel).getByLabelText("png")).toBeChecked()
    expect(within(exportPanel).getByLabelText("cdxml")).toBeChecked()
    expect(within(exportPanel).getByLabelText("xlsx")).toBeChecked()
    expect(within(exportPanel).getByLabelText("csv")).toBeChecked()
    expect(within(exportPanel).getByLabelText("svg")).toBeChecked()
    expect(within(exportPanel).getByLabelText("Include bytes")).toBeChecked()
    expect(within(exportPanel).getByText("Export readiness")).toBeInTheDocument()
    expect(within(exportPanel).getByText("Not browser-local persisted")).toBeInTheDocument()
    expect(within(exportPanel).getByText("CDXML only; no CDX")).toBeInTheDocument()

    fireEvent.click(within(exportPanel).getByRole("button", { name: "Export" }))

    expect(await within(exportPanel).findByText("artifact-png-rxnflow-profile")).toBeInTheDocument()
    expect(within(exportPanel).getByText("artifact-cdxml-rxnflow-profile")).toBeInTheDocument()
    expect(within(exportPanel).getByText("artifact-xlsx-rxnflow-profile")).toBeInTheDocument()
    expect(within(exportPanel).getByText("artifact-csv-rxnflow-profile")).toBeInTheDocument()
    expect(within(exportPanel).getByText("artifact-svg-rxnflow-profile")).toBeInTheDocument()
    expect(within(exportPanel).getByText("fixture-png-energy-plot-v1")).toBeInTheDocument()
    expect(within(exportPanel).getByText("fixture-cdxml-energy-v1")).toBeInTheDocument()
    expect(within(exportPanel).getByText("fixture-xlsx-energy-table-v1")).toBeInTheDocument()
    expect(within(exportPanel).getByText("fixture-csv-energy-table-v1")).toBeInTheDocument()
    expect(within(exportPanel).getByText("fixture-svg-graph-snapshot-v1")).toBeInTheDocument()
    expect(within(exportPanel).getAllByText("energy_table_schema_version")).toHaveLength(2)
    expect(within(exportPanel).getAllByText("energy-table-v1")).toHaveLength(2)
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })).toHaveLength(5)
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[0]).toHaveAttribute("download", "rxnflow-profile.png")
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[0].getAttribute("href")).toMatch(/^data:image\/png;base64,/)
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[1]).toHaveAttribute("download", "rxnflow-profile.cdxml")
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[1].getAttribute("href")).toMatch(/^data:chemical\/x-cdxml;base64,/)
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[2]).toHaveAttribute("download", "rxnflow-profile.xlsx")
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[2].getAttribute("href")).toMatch(/^data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet;base64,/)
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[3]).toHaveAttribute("download", "rxnflow-profile.csv")
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[3].getAttribute("href")).toMatch(/^data:text\/csv;base64,/)
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[4]).toHaveAttribute("download", "rxnflow-profile.svg")
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })[4].getAttribute("href")).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(screen.getAllByText("chemdraw_cdxml_only").length).toBeGreaterThan(0)
    openAnalysisDockTab("Diagnostics")
    expect(screen.getByText("5 artifacts indexed")).toBeInTheDocument()
  })

  it("persists exported inline artifacts into the active browser project", async () => {
    const repository = new MemoryBrowserProjectRepository()
    await createProjectWithContent(repository, "Export Project")
    renderWorkbench(repository)

    fireEvent.click(await screen.findByRole("button", { name: /export project/i }))
    await expectProjectFolderActive(/export project/i)
    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    openAnalysisDockTab("Export")
    const exportPanel = screen.getByRole("region", { name: "Report Export Panel" })
    openExportMode(exportPanel)
    fireEvent.click(within(exportPanel).getByRole("button", { name: "Export" }))

    expect(await within(exportPanel).findByText("exports/rxnflow-profile.png")).toBeInTheDocument()
    expect(within(exportPanel).getByText("exports/rxnflow-profile.cdxml")).toBeInTheDocument()
    expect(within(exportPanel).getByText("exports/rxnflow-profile.xlsx")).toBeInTheDocument()
    expect(within(exportPanel).getByText("exports/rxnflow-profile.csv")).toBeInTheDocument()
    expect(within(exportPanel).getByText("exports/rxnflow-profile.svg")).toBeInTheDocument()
    expect(within(exportPanel).getAllByText("Yes").length).toBeGreaterThanOrEqual(5)
    expect(within(exportPanel).getAllByText(/sha256:[a-f0-9]{64}/i).length).toBeGreaterThanOrEqual(5)
    const [project] = await repository.listProjects()
    await expect(repository.exists(project.projectRef, "exports/rxnflow-profile.png")).resolves.toBe(true)
    await expect(repository.exists(project.projectRef, "exports/rxnflow-profile.svg")).resolves.toBe(true)
    const exportIndex = JSON.parse(new TextDecoder().decode((await repository.readObject(project.projectRef, exportArtifactsPath)).bytes))
    expect(exportIndex.artifacts).toHaveLength(5)
    expect(exportIndex.artifacts[0]).toMatchObject({
      id: "artifact-cdxml-rxnflow-profile",
      path: "exports/rxnflow-profile.cdxml",
      checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
    expect(exportIndex.artifacts[1]).toMatchObject({
      id: "artifact-csv-rxnflow-profile",
      path: "exports/rxnflow-profile.csv",
      checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
    expect(exportIndex.artifacts.find((artifact: { id: string }) => artifact.id === "artifact-svg-rxnflow-profile")).toMatchObject({
      id: "artifact-svg-rxnflow-profile",
      path: "exports/rxnflow-profile.svg",
      checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
    expect(screen.queryByText("Project content files are readable.")).not.toBeInTheDocument()
  })

  it("shows exported artifacts without download links when inline bytes are disabled", async () => {
    const repository = new MemoryBrowserProjectRepository()
    await createProjectWithContent(repository, "No Bytes")
    renderWorkbench(repository)

    fireEvent.click(await screen.findByRole("button", { name: /no bytes/i }))
    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    openAnalysisDockTab("Export")
    const exportPanel = screen.getByRole("region", { name: "Report Export Panel" })
    openExportMode(exportPanel)
    fireEvent.click(within(exportPanel).getByLabelText("Include bytes"))
    expect(within(exportPanel).getByText("Runtime metadata only")).toBeInTheDocument()
    fireEvent.click(within(exportPanel).getByRole("button", { name: "Export" }))

    expect(await within(exportPanel).findByText("artifact-png-rxnflow-profile")).toBeInTheDocument()
    expect(within(exportPanel).queryByRole("link", { name: "Download" })).not.toBeInTheDocument()
    expect(within(exportPanel).getAllByText("Download unavailable")).toHaveLength(5)
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
    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
    openAnalysisDockTab("Export")
    const exportPanel = screen.getByRole("region", { name: "Report Export Panel" })
    openExportMode(exportPanel)
    fireEvent.click(within(exportPanel).getByRole("button", { name: "Export" }))

    expect(await within(exportPanel).findByText("artifact-png-rxnflow-profile")).toBeInTheDocument()
    expect(within(exportPanel).getAllByRole("link", { name: "Download" })).toHaveLength(5)
    expect(within(exportPanel).getAllByText("No").length).toBeGreaterThanOrEqual(5)
    expect(screen.getAllByText("artifact_persistence_failed").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Browser local storage quota would be exceeded.").length).toBeGreaterThan(0)
    expect(screen.getAllByText("exports").length).toBeGreaterThan(0)
  })

  it("opens an empty workspace before adding imported files to the canvas", async () => {
    const repository = new MemoryBrowserProjectRepository()
    await createProjectWithContent(repository, "Empty Import")
    const transport = new NoWorkspaceProjectOpenTransport()
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /empty import/i }))
    await waitFor(() => expect(transport.payloads.some((payload) => payload.command === "project.open")).toBe(true))
    const graphCanvas = screen.getByRole("region", { name: "Graph Canvas" })
    expect(within(graphCanvas).getByText("No workspace graph")).toBeInTheDocument()
    dropExternalFileOnCanvas(graphCanvas, new File(["2\nwater"], "water.xyz", { type: "chemical/x-xyz" }))

    expect((await within(graphCanvas).findAllByText("node-web-1")).length).toBeGreaterThan(0)
    const openIndex = transport.payloads.findIndex((payload) => payload.command === "workspace.open")
    const addIndex = transport.payloads.findIndex((payload) => payload.command === "workspace.add_node")
    expect(openIndex).toBeGreaterThanOrEqual(0)
    expect(addIndex).toBeGreaterThan(openIndex)
    expect(lastPayload(transport, "workspace.add_node")?.args).toMatchObject({
      session_id: "session-fixture-web",
      chemical_object_ids: ["object-imported-water"],
    })
  })

  it("imports files from the project folder action directly into the project tree", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await createProjectWithContent(repository, "Folder Import")
    const transport = new RecordingImportPreviewTransport()
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /folder import/i }))
    await expectProjectFolderActive(/folder import/i)
    expect(screen.getByRole("navigation", { name: "Workbench commands" })).not.toHaveTextContent("Sources")

    const projectImportInput = screen.getByLabelText("Import files into project", { selector: "input" })
    fireEvent.change(projectImportInput, {
      target: {
        files: [new File(["2\nwater\n"], "water.xyz", { type: "chemical/x-xyz" })],
      },
    })

    const projectFilesPanel = projectTreePanel()
    expect(await within(projectFilesPanel).findByText("water.xyz")).toBeInTheDocument()
    await waitFor(async () => {
      await expect(repository.listObjects(project.projectRef, "inputs/raw")).resolves.toHaveLength(1)
    })
    expect(transport.payloads.filter((payload) => payload.command === "import.preview")).toHaveLength(0)
  })

  it("creates a browser-local project without normal persistence validation chrome", async () => {
    const repository = new MemoryBrowserProjectRepository()
    renderWorkbench(repository)

    expect(await screen.findByText("No projects yet")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "New Project" }))
    const form = screen.getByRole("form", { name: "Create project" })
    fireEvent.change(within(form).getByLabelText("Project name"), {
      target: { value: "Catalyst Screen" },
    })
    fireEvent.click(within(form).getByRole("button", { name: "Create Project" }))

    expect(await screen.findByRole("button", { name: /catalyst screen/i })).toBeInTheDocument()
    await expectProjectFolderActive(/catalyst screen/i)
    expect(screen.queryByText("Persisted")).not.toBeInTheDocument()
    expect(screen.queryByText("Valid")).not.toBeInTheDocument()
    expect(screen.queryByRole("status", { name: "Project notices" })).not.toBeInTheDocument()
    expect(screen.queryByText(/sha256:[a-f0-9]{64}/i)).not.toBeInTheDocument()
    const [project] = await repository.listProjects()
    await expect(repository.listObjects(project.projectRef, projectContentIndexPath)).resolves.toHaveLength(1)
    await expect(repository.listObjects(project.projectRef, chemicalObjectsPath)).resolves.toHaveLength(1)
  })

  it("opens a project with missing content and saves it from the sidebar", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Needs Content" })
    renderWorkbench(repository)

    fireEvent.click(await screen.findByRole("button", { name: /needs content/i }))

    expect(await screen.findByText("Project files need attention")).toBeInTheDocument()
    expect(screen.getByText(/Project content file is missing/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Save Project" }))

    await waitFor(() => expect(screen.queryByText("Project files need attention")).not.toBeInTheDocument())
    expect(screen.queryByText("Persisted")).not.toBeInTheDocument()
    expect(screen.queryByText("Valid")).not.toBeInTheDocument()
    await expect(repository.listObjects(project.projectRef, projectContentIndexPath)).resolves.toHaveLength(1)
  })

  it("opens a browser project and restores the workbench automatically", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const transport = new RecordingProjectBridgeTransport()
    const created = await createProjectWithContent(repository, "Bridge Later")
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /bridge later/i }))

    await expectProjectFolderActive(/bridge later/i)
    await expectEmptyProjectWorkbenchProjected()
    const openPayload = transport.payloads.find((payload) => payload.command === "project.open")
    expect(openPayload?.args).toMatchObject({
      load_content: true,
    })
    expect(Array.isArray(openPayload?.args.content_files)).toBe(true)
    expect(JSON.stringify(openPayload?.args.content_files)).toContain(projectContentIndexPath)
    expect(screen.queryByRole("button", { name: "Open Bridge" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Save Bridge" })).not.toBeInTheDocument()
    expect(created.name).toBe("Bridge Later")
  })

  it("saves the active restored project through one Save Project action", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const transport = new RecordingProjectBridgeTransport()
    const project = await createProjectWithContent(repository, "Bridge Project")
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /bridge project/i }))
    expect(await screen.findByRole("button", { name: /bridge project/i })).toBeInTheDocument()
    await expectProjectFolderActive(/bridge project/i)
    await expectEmptyProjectWorkbenchProjected()

    fireEvent.click(screen.getByRole("button", { name: "Save Project" }))

    expect(screen.queryByText("Project content files are readable.")).not.toBeInTheDocument()
    const savePayload = transport.payloads.find((payload) => payload.command === "project.save_content")
    expect(savePayload?.args).toMatchObject({
      session_id: "session-fixture-web",
      include_content_files: true,
    })
    const indexObject = await repository.readObject(project.projectRef, projectContentIndexPath)
    expect(indexObject.metadata).toEqual({ kind: "project_content_index" })
  })

  it("saves and restores graph workspace layout, viewport, selection, and active path through project content", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const transport = new RecordingProjectBridgeTransport()
    const project = await createProjectWithContent(repository, "Graph Restore")
    renderWorkbench(repository, "en-US", undefined, new ShellClient(transport))

    fireEvent.click(await screen.findByRole("button", { name: /graph restore/i }))
    await expectEmptyProjectWorkbenchProjected()
    runFixtureCommand()
    await expectFixtureWorkbenchProjected()
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

    fireEvent.click(screen.getByRole("button", { name: "Save Project" }))
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

    fireEvent.click(screen.getByRole("button", { name: /graph restore/i }))

    expect(await within(graphCanvas).findByText("120%")).toBeInTheDocument()
    const restoredPathButton = within(graphCanvas).getByRole("button", { name: "Select path Fixture path" })
    expect(restoredPathButton.closest("li")?.className).toContain("graph-path-list--selected")
    expect(within(graphCanvas).getByText("node-a -> node-b")).toBeInTheDocument()
  })

  it("renders repository errors with code, message, and target visible", async () => {
    renderWorkbench()

    expect(await screen.findByText("No projects yet")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "New Project" }))
    const form = screen.getByRole("form", { name: "Create project" })
    fireEvent.click(within(form).getByRole("button", { name: "Create Project" }))

    expect(await screen.findByText("invalid_input")).toBeInTheDocument()
    expect(screen.getAllByText("Browser local project name is required.").length).toBeGreaterThan(0)
    expect(screen.getByText("name")).toBeInTheDocument()
  })

  it("does not expose project bundle import or export controls in the project rail", async () => {
    renderWorkbench()

    expect(await screen.findByText("No projects yet")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Import Bundle" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Export Bundle" })).not.toBeInTheDocument()
    expect(screen.queryByText(/Import creates a new browser-local project/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Export downloads the current browser-local repository bytes/)).not.toBeInTheDocument()
  })

  it("renders sidebar validation messages through the active locale", async () => {
    const repository = new MemoryBrowserProjectRepository()
    await repository.createProject({ name: "Needs Content" })
    renderWorkbench(repository, "zh-CN")

    fireEvent.click(await screen.findByRole("button", { name: /needs content/i }))

    expect(await screen.findByText(/项目内容文件缺失/)).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes(".rxnflow/state/project-content.json"))).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "保存项目" }))

    await waitFor(() => expect(screen.queryByText(/项目内容文件缺失/)).not.toBeInTheDocument())
    expect(screen.queryByText("已保存")).not.toBeInTheDocument()
    expect(screen.queryByText("有效")).not.toBeInTheDocument()
    expect(screen.queryByText("项目内容文件可读取。")).not.toBeInTheDocument()
  })

  it("renders workspace-first controls through the active locale without source tray chrome", async () => {
    renderWorkbench(undefined, "zh-CN")

    expect(await screen.findByText("暂无项目")).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "来源托盘" })).not.toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "工作台命令" })).not.toHaveTextContent("来源")
    openAnalysisDockTab("对象")
    expect(screen.getByRole("heading", { name: "已登记对象" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "图谱画布" })).toBeInTheDocument()
    expect(screen.getByText("暂无工作区图谱")).toBeInTheDocument()
    expect(screen.getByText(/可在此拖入原始输出文件/)).toBeInTheDocument()
    openAnalysisDockTab("诊断")
    fireEvent.click(screen.getByRole("button", { name: "运行 Fixture" }))
    await expectFixtureWorkbenchProjected()
    openAnalysisDockTab("对象")
    expect(screen.getByText("fixture-parser")).toBeInTheDocument()
    const graphCanvas = screen.getByRole("region", { name: "图谱画布" })
    expect(within(graphCanvas).getByRole("button", { name: "添加节点" })).toBeEnabled()
    expect(within(graphCanvas).getByText("node-a")).toBeInTheDocument()
    expect(within(graphCanvas).getByText("object-a")).toBeInTheDocument()
    expect(within(graphCanvas).getAllByText("path-a-b").length).toBeGreaterThan(0)

    openAnalysisDockTab("势能面")
    const energyPanel = screen.getByRole("region", { name: "能量剖面面板" })
    expect(within(energyPanel).getAllByText("相对能量").length).toBeGreaterThan(0)
    expect(within(energyPanel).getByText("表达式明细")).toBeInTheDocument()
    expect(within(energyPanel).getByRole("button", { name: "计算" })).toBeEnabled()
    openAnalysisDockTab("导出")
    const exportPanel = screen.getByRole("region", { name: "报告导出面板" })
    expect(within(exportPanel).getByText("报告导出")).toBeInTheDocument()
    openExportMode(exportPanel, "导出模式")
    expect(within(exportPanel).getByRole("button", { name: "导出" })).toBeEnabled()
  })
})

function openExportMode(exportPanel: HTMLElement, label = "Export mode") {
  fireEvent.click(within(exportPanel).getByRole("button", { name: label }))
}

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

async function expectFixtureWorkbenchProjected() {
  expect((await screen.findAllByText("graph-a-b")).length).toBeGreaterThan(0)
}

async function expectEmptyProjectWorkbenchProjected() {
  expect((await screen.findAllByText("graph-project-main")).length).toBeGreaterThan(0)
}

function openAnalysisDockTab(tabName: string) {
  const dock = screen.getByRole("complementary", { name: /Analysis Dock|分析区/ })
  fireEvent.click(within(dock).getByRole("tab", { name: tabName }))
}

function runFixtureCommand() {
  openAnalysisDockTab("Diagnostics")
  const dock = screen.getByRole("complementary", { name: /Analysis Dock|分析区/ })
  fireEvent.click(within(dock).getByRole("button", { name: "Fixture Run" }))
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

function dispatchWheel(
  element: HTMLElement,
  options: {
    deltaY: number
    clientX: number
    clientY: number
    ctrlKey?: boolean
    metaKey?: boolean
  },
) {
  element.dispatchEvent(new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: options.deltaY,
    clientX: options.clientX,
    clientY: options.clientY,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
  }))
}

function mockElementsFromPoint(elements: Element[]) {
  const originalElementsFromPoint = document.elementsFromPoint
  document.elementsFromPoint = vi.fn(() => elements)
  return () => {
    document.elementsFromPoint = originalElementsFromPoint
  }
}

function nodeShell(nodeButton: HTMLElement): HTMLElement {
  const shell = nodeButton.closest(".graph-node-card-shell")
  if (!(shell instanceof HTMLElement)) {
    throw new Error("Graph node shell was not rendered.")
  }
  return shell
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

function dropExternalFileOnCanvas(
  graphCanvas: HTMLElement,
  file: File,
  clientX = 240,
  clientY = 180,
) {
  const surface = within(graphCanvas).getByLabelText("Graph canvas surface")
  mockCanvasSurfaceRect(surface, 600, 360)
  const dataTransfer = new TestDataTransfer([file])
  fireEvent.dragOver(surface, { dataTransfer })
  dispatchDrop(surface, dataTransfer, clientX, clientY)
}

function lastPayload(
  transport: RecordingProjectBridgeTransport,
  command: string,
) {
  return transport.payloads.filter((payload) => payload.command === command).at(-1)
}

function projectTreePanel(): HTMLElement {
  return screen.getByRole("tree", { name: "Project file tree" })
}

async function expectProjectFolderActive(name: RegExp): Promise<HTMLElement> {
  const button = await screen.findByRole("button", { name })
  await waitFor(() => expect(button).toHaveAttribute("aria-current", "true"))
  return button
}

function projectRawObjectDisplayName(object: BrowserStorageObject): string {
  const sourceName = object.metadata?.source_name
  if (typeof sourceName === "string" && sourceName) return sourceName.replace(/^[a-f0-9]{12}-/i, "")
  const baseName = object.path.split("/").filter(Boolean).at(-1) ?? object.path
  return baseName.replace(/^[a-f0-9]{12}-/i, "")
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
      projectFiles: [],
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

class NoImportWarningProjectBridgeTransport implements ShellTransport {
  kind = "in-process-test" as const
  payloads: ShellCommandPayload<string>[] = []

  async run(payload: ShellCommandPayload<string>): Promise<ShellResponse> {
    this.payloads.push(payload)
    const response = await fixtureTransport.run(payload)
    if (payload.command === "import.preview" && response.ok) {
      return { ...response, warnings: [] }
    }
    return response
  }
}

class NoWorkspaceProjectOpenTransport implements ShellTransport {
  kind = "in-process-test" as const
  payloads: ShellCommandPayload<string>[] = []
  private projectOpened = false
  private returnedNoWorkspaceSnapshot = false

  async run(payload: ShellCommandPayload<string>): Promise<ShellResponse> {
    this.payloads.push(payload)
    const response = await fixtureTransport.run(payload)
    if (payload.command === "project.open" && response.ok) {
      this.projectOpened = true
      this.returnedNoWorkspaceSnapshot = false
    }
    if (
      payload.command === "workbench.snapshot"
      && this.projectOpened
      && !this.returnedNoWorkspaceSnapshot
      && response.ok
      && response.data
    ) {
      this.returnedNoWorkspaceSnapshot = true
      const data = response.data as WorkbenchSnapshotData
      return {
        ...response,
        data: {
          ...data,
          workspace_id: null,
          graph_id: null,
          profile_id: null,
          active: {
            workspace_id: null,
            graph_id: null,
            profile_id: null,
          },
          counts: {
            ...data.counts,
            graphs: 0,
            workspaces: 0,
            profiles: 0,
          },
          workspace: null,
          profile: null,
        },
      }
    }
    return response
  }
}

class FailingImportPreviewTransport implements ShellTransport {
  kind = "in-process-test" as const
  payloads: ShellCommandPayload<string>[] = []

  async run(payload: ShellCommandPayload<string>): Promise<ShellResponse> {
    this.payloads.push(payload)
    if (payload.command !== "import.preview") {
      return fixtureTransport.run(payload)
    }
    return {
      ok: false,
      data: null,
      error: {
        code: "preview_failed",
        message: "Import preview failed for this fixture.",
        target: "import.preview",
      },
      warnings: [],
      artifacts: [],
    }
  }
}

class FailingWorkspaceAddNodeTransport implements ShellTransport {
  kind = "in-process-test" as const
  payloads: ShellCommandPayload<string>[] = []

  async run(payload: ShellCommandPayload<string>): Promise<ShellResponse> {
    this.payloads.push(payload)
    if (payload.command !== "workspace.add_node") {
      return fixtureTransport.run(payload)
    }
    return {
      ok: false,
      data: null,
      error: {
        code: "graph_invalid",
        message: "Workspace add node failed for this fixture.",
        target: "workspace.add_node",
      },
      warnings: [],
      artifacts: [],
    }
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
