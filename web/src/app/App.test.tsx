import { act, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { App } from "./App"

function transformScale(transform: string): number {
  const match = transform.match(/scale\(([^)]+)\)/)
  return match ? Number(match[1]) : Number.NaN
}

function mockElementsFromPoint(elements: Element[]) {
  const original = document.elementsFromPoint
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: vi.fn(() => elements),
  })
  return () => {
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: original,
    })
  }
}

class TestDataTransfer {
  dropEffect = "none"
  effectAllowed = "none"
  files: File[] = []
  private values = new Map<string, string>()

  constructor(files: File[] = []) {
    this.files = files
  }

  setData(type: string, value: string) {
    this.values.set(type, value)
  }

  getData(type: string) {
    return this.values.get(type) ?? ""
  }

  get types() {
    return [
      ...Array.from(this.values.keys()),
      ...(this.files.length > 0 ? ["Files"] : []),
    ]
  }
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

function dispatchPointer(
  element: Element | Window,
  type: "pointerDown" | "pointerMove" | "pointerUp",
  options: { button?: number; clientX: number; clientY: number; pointerId: number },
) {
  const eventType = type === "pointerDown" ? "pointerdown" : type === "pointerMove" ? "pointermove" : "pointerup"
  const event = new MouseEvent(eventType, {
    bubbles: true,
    cancelable: true,
    button: options.button ?? 0,
    clientX: options.clientX,
    clientY: options.clientY,
  })
  Object.defineProperty(event, "pointerId", { value: options.pointerId })
  fireEvent(element, event)
}

function transformTranslate(transform: string): { x: number; y: number } {
  const match = transform.match(/translate3d\(([^p]+)px,\s*([^p]+)px,\s*0\)/)
  return {
    x: match ? Number(match[1]) : Number.NaN,
    y: match ? Number(match[2]) : Number.NaN,
  }
}

function mockSurfaceRect(surface: HTMLElement, width = 1000, height = 800) {
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
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

describe("App", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "rxnflowDesktop")
  })

  it("renders the desktop canvas workbench", async () => {
    render(<App />)

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    expect(toolbar).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: "Search flows" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Import files" })).toBeInTheDocument()
    expect(within(toolbar).queryByRole("button", { name: "Export project" })).not.toBeInTheDocument()
    expect(within(toolbar).queryByRole("button", { name: "Compute" })).not.toBeInTheDocument()
    expect(within(toolbar).queryByRole("button", { name: "More canvas actions" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Workspace actions" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Reaction flow workspace" })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Engine status:/)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Node TS1 (Endo)" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Start edge from TS1 \(Endo\)/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open 3D Structure" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Energy unit/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add Node" })).not.toBeInTheDocument()
  })

  it("uses only native macOS traffic lights in the desktop shell", () => {
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles: vi.fn(),
        getEngineStatus: vi.fn().mockResolvedValue({
          status: "ready",
          engineVersion: "test",
          capabilities: [],
        }),
        saveJsonSnapshot: vi.fn(),
        saveReportArtifact: vi.fn(),
        openProjectPackage: vi.fn(),
        saveProjectPackage: vi.fn(),
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
        onOpenProjectContent: vi.fn(() => vi.fn()),
      },
    })

    const { container } = render(<App />)

    expect(container.querySelector(".app-shell.is-macos-desktop")).toBeInTheDocument()
    expect(container.querySelector(".macos-traffic-light-ghosts")).not.toBeInTheDocument()
  })

  it("keeps non-desktop bridge workflows out of the active workbench", () => {
    render(<App />)

    const activeText = document.body.textContent ?? ""
    for (const forbidden of ["local-http", "Python bridge", "ShellClient", "cloud", "sync", "Search flows", "Settings", "Preferences", "Add Node", "Compute", "Profile", "Computer Profile", "Objects", "Object Registry", "Apply correction"]) {
      expect(activeText).not.toMatch(new RegExp(forbidden, "i"))
    }

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    const exportPanel = screen.getByRole("region", { name: "Export panel" })
    for (const format of ["CSV", "SVG", "PDF", "PPTX", "CDX", "JSON"]) {
      expect(within(exportPanel).queryByRole("checkbox", { name: format })).not.toBeInTheDocument()
    }
  })

  it("opens a saved project package from the project rail in browser preview", async () => {
    render(<App />)

    const packageContent = JSON.stringify({
      schemaVersion: 1,
      packageKind: "rxnflow-project",
      project: { id: "browser-open-study", label: "Browser Open Study", meta: "saved" },
      files: [{
        id: "browser-open-file",
        name: "browser-open.log",
        kind: "Gaussian",
        size: 456,
        status: "parsed",
        preview: "SCF Done: E(RwB97XD) = -123.4",
      }],
      nodes: [{
        id: "browser-open-node",
        label: "Browser Open TS",
        formula: "C2H4",
        kind: "transition",
        method: "wB97X-D",
        solvent: "Toluene",
        energyGas: -123.4,
        energySolution: -123.3,
        energyUnit: "hartree",
        sourceStatus: "parsed",
        sourceFileId: "browser-open-file",
        position: { x: 40, y: 56 },
      }],
      edges: [],
      viewport: { x: 120, y: 180, zoom: 0.9 },
      savedAt: "2026-06-14T00:00:00.000Z",
    })

    fireEvent.click(screen.getByRole("button", { name: "Workspace actions" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Use existing folder" }))
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Open project package"), {
        target: {
          files: [new File([packageContent], "browser-open-study.rxnflow", { type: "application/json" })],
        },
      })
      await Promise.resolve()
    })

    expect(await screen.findByRole("button", { name: "Node Browser Open TS" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "browser-open.log Gaussian" })).toBeInTheDocument()
    expect(screen.getAllByText("Browser Open Study").length).toBeGreaterThan(0)
  })

  it("pans the canvas with wheel input and zooms pinch-style wheel input", async () => {
    const { container } = render(<App />)

    const surface = container.querySelector(".canvas-surface") as HTMLElement
    const world = container.querySelector(".canvas-world") as HTMLElement
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 800,
      width: 1000,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect)

    const initialScale = transformScale(world.style.transform)
    const initialTranslate = transformTranslate(world.style.transform)
    expect(initialScale).toBeGreaterThan(0)
    fireEvent.wheel(surface, { deltaX: 18, deltaY: -120, clientX: 700, clientY: 400, cancelable: true })

    await waitFor(() => {
      expect(transformTranslate(world.style.transform)).toEqual({
        x: initialTranslate.x + 18,
        y: initialTranslate.y - 120,
      })
    })
    expect(transformScale(world.style.transform)).toBe(initialScale)

    fireEvent.wheel(surface, { deltaY: -120, clientX: 700, clientY: 400, ctrlKey: true, cancelable: true })

    await waitFor(() => {
      expect(transformScale(world.style.transform)).toBeGreaterThan(initialScale)
    })

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(within(toolbar).getByRole("button", { name: "Table view" }))
    fireEvent.click(within(toolbar).getByRole("button", { name: "Canvas view" }))

    const remountedSurface = container.querySelector(".canvas-surface") as HTMLElement
    const remountedWorld = container.querySelector(".canvas-world") as HTMLElement
    vi.spyOn(remountedSurface, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 800,
      width: 1000,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect)
    const remountedTranslate = transformTranslate(remountedWorld.style.transform)
    fireEvent.wheel(remountedSurface, { deltaX: -12, deltaY: 36, clientX: 700, clientY: 400, cancelable: true })
    await waitFor(() => {
      expect(transformTranslate(remountedWorld.style.transform)).toEqual({
        x: remountedTranslate.x - 12,
        y: remountedTranslate.y + 36,
      })
    })
  })

  it("rubber-bands nodes with the select tool and keeps blank panning on the pan tool", async () => {
    const { container } = render(<App />)

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    const surface = screen.getByLabelText("Graph canvas surface")
    const world = container.querySelector(".canvas-world") as HTMLElement
    mockSurfaceRect(surface, 1000, 800)

    const beforeSelectDrag = world.style.transform
    dispatchPointer(surface, "pointerDown", { button: 0, clientX: 0, clientY: 360, pointerId: 71 })
    dispatchPointer(surface, "pointerMove", { button: 0, clientX: 120, clientY: 520, pointerId: 71 })
    expect(container.querySelector(".canvas-rubber-band")).toBeInTheDocument()
    dispatchPointer(surface, "pointerUp", { button: 0, clientX: 120, clientY: 520, pointerId: 71 })

    expect(container.querySelector(".canvas-rubber-band")).not.toBeInTheDocument()
    expect(world.style.transform).toBe(beforeSelectDrag)
    await waitFor(() => expect(screen.getByRole("button", { name: "Node TS2 (Exo)" })).toHaveClass("is-selected"))
    expect(screen.getByRole("button", { name: "Node TS1 (Endo)" })).not.toHaveClass("is-selected")

    fireEvent.click(within(toolbar).getByRole("button", { name: "Pan tool" }))
    const beforePan = transformTranslate(world.style.transform)
    dispatchPointer(surface, "pointerDown", { button: 0, clientX: 200, clientY: 200, pointerId: 72 })
    dispatchPointer(surface, "pointerMove", { button: 0, clientX: 235, clientY: 252, pointerId: 72 })
    dispatchPointer(surface, "pointerUp", { button: 0, clientX: 235, clientY: 252, pointerId: 72 })

    expect(transformTranslate(world.style.transform)).toEqual({
      x: beforePan.x + 35,
      y: beforePan.y + 52,
    })
  })

  it("keeps node drag previews continuous and snaps the persisted position on release", () => {
    render(<App />)

    const node = screen.getByRole("button", { name: "Node TS1 (Endo)" })
    const start = transformTranslate(node.style.transform)

    dispatchPointer(node, "pointerDown", { button: 0, clientX: 320, clientY: 240, pointerId: 73 })
    dispatchPointer(node, "pointerMove", { button: 0, clientX: 333, clientY: 247, pointerId: 73 })

    const preview = transformTranslate(node.style.transform)
    expect(preview.x).not.toBe(start.x)
    expect(preview.y).not.toBe(start.y)
    expect(preview.x % 8).not.toBe(0)
    expect(preview.y % 8).not.toBe(0)

    dispatchPointer(node, "pointerUp", { button: 0, clientX: 333, clientY: 247, pointerId: 73 })

    const persisted = transformTranslate(node.style.transform)
    expect(persisted.x % 8).toBeCloseTo(0)
    expect(persisted.y % 8).toBeCloseTo(0)
    expect(persisted).toEqual({
      x: Math.round(preview.x / 8) * 8,
      y: Math.round(preview.y / 8) * 8,
    })
  })

  it("previews minimap navigation locally and commits the canvas viewport on release", async () => {
    const { container } = render(<App />)

    const surface = container.querySelector(".canvas-surface") as HTMLElement
    const world = container.querySelector(".canvas-world") as HTMLElement
    const minimap = screen.getByRole("button", { name: "Navigate graph minimap" })
    mockSurfaceRect(surface, 1000, 800)
    mockSurfaceRect(minimap, 270, 128)

    await waitFor(() => expect(world.style.transform).toContain("scale("))
    const initialTransform = world.style.transform

    fireEvent.pointerDown(minimap, {
      button: 0,
      clientX: 48,
      clientY: 42,
      pointerId: 41,
    })
    fireEvent.pointerMove(minimap, {
      button: 0,
      clientX: 232,
      clientY: 94,
      pointerId: 41,
    })

    expect(world.style.transform).not.toBe(initialTransform)
    expect(container.querySelector(".minimap-window.is-draft")).toBeInTheDocument()

    fireEvent.pointerUp(minimap, {
      button: 0,
      clientX: 232,
      clientY: 94,
      pointerId: 41,
    })

    await waitFor(() => expect(world.style.transform).not.toBe(initialTransform))
    expect(container.querySelector(".minimap-window.is-draft")).not.toBeInTheDocument()
  })

  it("offers table-backed canvas energy controls and updates relative energies directly", () => {
    render(<App />)

    const energySelect = screen.getByLabelText("Energy")
    const unitSelect = screen.getByLabelText("Unit")

    expect(within(energySelect).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "ΔEgas",
      "ΔGsol",
    ])
    expect(within(unitSelect).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Eh",
      "kcal",
      "kJ",
    ])

    fireEvent.change(energySelect, { target: { value: "gas" } })
    fireEvent.change(unitSelect, { target: { value: "hartree" } })

    expect(screen.getAllByText("0.030517 Eh").length).toBeGreaterThan(0)
  })

  it("keeps original workbench routes visible without a backend bridge", () => {
    render(<App />)

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(within(toolbar).getByRole("button", { name: "Table view" }))
    const energyTable = screen.getByRole("region", { name: "Energy table" })
    expect(energyTable).toBeInTheDocument()
    expect(within(energyTable).getByRole("button", { name: "Absolute" })).toHaveAttribute("aria-pressed", "true")
    expect(within(energyTable).getByRole("button", { name: "Relative" })).toBeInTheDocument()
    expect(within(energyTable).getByText("Charge / Multiplicity")).toBeInTheDocument()
    const headerText = Array.from(energyTable.querySelectorAll("th")).map((cell) => cell.textContent?.replace(/\s+/g, "").trim())
    expect(headerText).toContain("Egas×627.5095")
    expect(headerText).toContain("Ggas+1M")
    expect(headerText).toContain("Gsol")

    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    const exportPanel = screen.getByRole("region", { name: "Export panel" })
    expect(within(exportPanel).getByRole("checkbox", { name: "PNG" })).toBeChecked()
    expect(within(exportPanel).getByRole("checkbox", { name: "CDXML" })).toBeChecked()
    expect(within(exportPanel).getByRole("checkbox", { name: "XLSX" })).toBeChecked()
    expect(within(exportPanel).queryByRole("checkbox", { name: "JSON" })).not.toBeInTheDocument()
    expect(within(exportPanel).queryByRole("checkbox", { name: "CSV" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "gaussian.log Gaussian" }))
    expect(screen.getByRole("region", { name: "Source inspector" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open raw log" })).toBeInTheDocument()
  })

  it("offers a persistent dark mode toggle in the window chrome", () => {
    render(<App />)

    const shell = document.querySelector(".app-shell") as HTMLElement
    expect(shell).toHaveClass("theme-light")

    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }))

    expect(shell).toHaveClass("theme-dark")
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument()
  })

  it("creates named local projects and keeps project workspaces isolated", () => {
    render(<App />)

    const workspaceActions = screen.getByRole("button", { name: "Workspace actions" })
    expect(workspaceActions).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(workspaceActions)
    expect(workspaceActions).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(screen.getByRole("menuitem", { name: "New blank project" }))
    const form = screen.getByRole("form", { name: "Create project" })
    fireEvent.change(within(form).getByLabelText("Project name"), { target: { value: "Catalyst Screen" } })
    fireEvent.click(within(form).getByRole("button", { name: "Create Folder" }))

    expect(screen.getByRole("button", { name: "Catalyst Screen empty" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Node TS1 (Endo)" })).not.toBeInTheDocument()
    expect(screen.getByText("No nodes in this project")).toBeInTheDocument()
    expect(screen.getByText("No local files")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Diels-Alder Study open" }))
    expect(screen.getByRole("button", { name: "Node TS1 (Endo)" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "gaussian.log Gaussian" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Catalyst Screen empty" }))
    expect(screen.queryByRole("button", { name: "Node TS1 (Endo)" })).not.toBeInTheDocument()
    expect(screen.getByText("No nodes in this project")).toBeInTheDocument()
    expect(screen.getByText("No local files")).toBeInTheDocument()
  })

  it("deletes local projects through project actions after confirmation", () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Project actions for Diels-Alder Study" }))
    expect(screen.getByRole("menuitem", { name: "Remove from sidebar" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from sidebar" }))
    const dialog = screen.getByRole("alertdialog", { name: "Remove Diels-Alder Study" })
    expect(dialog).toHaveTextContent("Diels-Alder Study")
    expect(screen.getByRole("button", { name: "Node TS1 (Endo)" })).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove from sidebar" }))

    expect(screen.queryByRole("button", { name: "Diels-Alder Study open" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Nickel catalysis empty" })).toHaveAttribute("aria-current", "true")
    expect(screen.queryByRole("button", { name: "Node TS1 (Endo)" })).not.toBeInTheDocument()
    expect(screen.getByText("No nodes in this project")).toBeInTheDocument()
    expect(screen.getByText("No local files")).toBeInTheDocument()
  })

  it("creates canvases from project actions and only deletes them from the sidebar", () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Project actions for Diels-Alder Study" }))
    expect(screen.getByRole("menuitem", { name: "New canvas" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Import files into project" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("menuitem", { name: "New canvas" }))

    const tabList = screen.getByRole("tablist", { name: "Project canvases" })
    expect(within(tabList).getByRole("tab", { name: "Diels-Alder Study 1" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("button", { name: "Diels-Alder Study 1" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Close canvas Diels-Alder Study 1" }))

    expect(within(tabList).queryByRole("tab", { name: "Diels-Alder Study 1" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Diels-Alder Study 1" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Diels-Alder Study 1" }))
    expect(within(tabList).getByRole("tab", { name: "Diels-Alder Study 1" })).toHaveAttribute("aria-selected", "true")

    fireEvent.click(screen.getByRole("button", { name: "Canvas actions for Diels-Alder Study 1" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete canvas" }))

    expect(within(tabList).queryByRole("tab", { name: "Diels-Alder Study 1" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Diels-Alder Study 1" })).not.toBeInTheDocument()
    expect(within(tabList).getByRole("tab", { name: "Diels-Alder Study" })).toHaveAttribute("aria-selected", "true")
  })

  it("creates a canvas from the top tab plus without switching to an empty phantom project", () => {
    render(<App />)

    const tabList = screen.getByRole("tablist", { name: "Project canvases" })
    fireEvent.click(screen.getByRole("button", { name: "New canvas" }))

    expect(within(tabList).getByRole("tab", { name: "Diels-Alder Study 1" })).toHaveAttribute("aria-selected", "true")
    expect(within(tabList).queryByRole("tab", { name: "Untitled Study" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Diels-Alder Study open" })).toHaveAttribute("aria-current", "true")
    expect(screen.getByRole("button", { name: "gaussian.log Gaussian" })).toBeInTheDocument()
    expect(screen.queryByText("No local files")).not.toBeInTheDocument()
  })

  it("imports dropped local files into an inactive project row", async () => {
    render(<App />)

    const nickelProjectButton = screen.getByRole("button", { name: "Nickel catalysis empty" })
    const nickelProjectRow = nickelProjectButton.closest(".project-rail-item") as HTMLElement
    const file = new File(["FINAL SINGLE POINT ENERGY -22.5"], "dropped-nickel.out", { type: "text/plain" })
    const dataTransfer = new TestDataTransfer([file])

    fireEvent.dragOver(nickelProjectRow, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe("copy")

    await act(async () => {
      fireEvent.drop(nickelProjectRow, { dataTransfer })
      await Promise.resolve()
    })

    expect(await screen.findByRole("button", { name: "dropped-nickel.out ORCA" })).toBeInTheDocument()
    expect(await screen.findByRole("button", { name: "Node dropped-nickel" })).toHaveTextContent("ΔG")
    expect(screen.getByRole("button", { name: "Nickel catalysis empty" })).toHaveAttribute("aria-current", "true")

    fireEvent.click(screen.getByRole("button", { name: "Diels-Alder Study open" }))
    expect(screen.queryByRole("button", { name: "dropped-nickel.out ORCA" })).not.toBeInTheDocument()
  })

  it("groups gas and solution logs into one draggable structure row", async () => {
    render(<App />)

    const input = screen.getByLabelText("Import calculation files")
    const gasLog = new File(["SCF Done: E(RwB97XD) = -101.0"], "Bfix6-ts.log", { type: "text/plain" })
    const solutionLog = new File(["SCF Done: E(RwB97XD) = -101.2"], "Bfix6-ts-sol.log", { type: "text/plain" })
    await act(async () => {
      fireEvent.change(input, { target: { files: [gasLog, solutionLog] } })
      await Promise.resolve()
    })

    const rail = screen.getByRole("complementary", { name: "Project rail" })
    const groupedRowButton = await within(rail).findByRole("button", { name: "Bfix6-ts Gaussian" })
    expect(groupedRowButton).toBeInTheDocument()
    expect(within(rail).queryByRole("button", { name: "Bfix6-ts.log Gaussian" })).not.toBeInTheDocument()
    expect(within(rail).queryByRole("button", { name: "Bfix6-ts-sol.log Gaussian" })).not.toBeInTheDocument()

    const row = groupedRowButton.closest(".project-file-card") as HTMLElement
    const dataTransfer = new TestDataTransfer()
    fireEvent.dragStart(row, { dataTransfer })
    const payload = JSON.parse(dataTransfer.getData("application/x-rxnflow-raw-file"))

    expect(payload.kind).toBe("project-files")
    expect(payload.files).toHaveLength(2)
    expect(payload.files.map((file: { path: string }) => file.path)).toEqual([
      expect.stringContaining("Bfix6-ts.log"),
      expect.stringContaining("Bfix6-ts-sol.log"),
    ])
  })

  it("keeps object registry correction out of the main UI while preserving structure preview", () => {
    render(<App />)

    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    expect(inspector.querySelector(".inspector-rail-header")).not.toBeInTheDocument()
    expect(inspector.querySelector(".panel-tabs")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Objects" })).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Object registry" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Apply correction" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Open 3D Structure" }))
    const dialog = screen.getByRole("dialog", { name: "3D Structure" })
    expect(dialog).toHaveTextContent("TS1 (Endo)")
    fireEvent.click(within(dialog).getByRole("button", { name: "Close 3D Structure" }))
    expect(screen.queryByRole("dialog", { name: "3D Structure" })).not.toBeInTheDocument()
  })

  it("sets the relative energy zero point from a canvas node", () => {
    render(<App />)

    const tsNode = screen.getByRole("button", { name: "Node TS1 (Endo)" })
    fireEvent.click(within(tsNode).getByRole("button", { name: "More actions for TS1 (Endo)" }))
    fireEvent.click(within(tsNode).getByRole("menuitem", { name: "Set zero" }))

    expect(within(tsNode).queryByText("0")).not.toBeInTheDocument()
    expect(within(tsNode).getByText("0.00")).toBeInTheDocument()
    expect(within(tsNode).queryByText("0.00 kcal/mol")).not.toBeInTheDocument()
  })

  it("collapses and restores a node structure preview from the canvas card", () => {
    render(<App />)

    const tsNode = screen.getByRole("button", { name: "Node TS1 (Endo)" })
    expect(within(tsNode).getByRole("group", { name: "TS1 (Endo) formula-only structure preview" })).toBeInTheDocument()

    fireEvent.click(within(tsNode).getByRole("button", { name: "Collapse structure preview for TS1 (Endo)" }))

    expect(within(tsNode).queryByRole("group", { name: "TS1 (Endo) formula-only structure preview" })).not.toBeInTheDocument()
    expect(within(tsNode).getByRole("button", { name: "Show structure preview for TS1 (Endo)" })).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(within(tsNode).getByRole("button", { name: "Show structure preview for TS1 (Endo)" }))

    expect(within(tsNode).getByRole("group", { name: "TS1 (Endo) formula-only structure preview" })).toBeInTheDocument()
    expect(within(tsNode).getByRole("button", { name: "Collapse structure preview for TS1 (Endo)" })).toHaveAttribute("aria-expanded", "true")
  })

  it("opens source details from the node action menu", () => {
    render(<App />)

    const tsNode = screen.getByRole("button", { name: "Node TS1 (Endo)" })
    fireEvent.click(within(tsNode).getByRole("button", { name: "More actions for TS1 (Endo)" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Source details" }))

    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    expect(screen.getByRole("region", { name: "Source inspector" })).toHaveTextContent("gaussian.log")
    expect(screen.getByRole("button", { name: "Open raw log" })).toBeInTheDocument()
  })

  it("creates a reaction edge from node handles and inspects the selected edge", () => {
    render(<App />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Start edge from TS1 (Endo)" }), {
      button: 0,
      pointerId: 7,
      clientX: 780,
      clientY: 320,
    })
    fireEvent.pointerUp(screen.getByRole("button", { name: "Node Exo Adduct" }), {
      pointerId: 7,
      clientX: 1040,
      clientY: 580,
    })

    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    expect(within(inspector).getByText("Selected Edge")).toBeInTheDocument()
    expect(within(inspector).getByText("TS1 (Endo)")).toBeInTheDocument()
    expect(within(inspector).getByText("Exo Adduct")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct/ })).toHaveLength(1)
  })

  it("finishes edge drags released on the window and clears empty releases", () => {
    const { container } = render(<App />)

    const startHandle = screen.getByRole("button", { name: "Start edge from TS1 (Endo)" })
    const targetNode = screen.getByRole("button", { name: "Node Exo Adduct" })
    const edgeName = /Edge TS1 \(Endo\) to Exo Adduct/
    const initialEdgeCount = screen.queryAllByRole("button", { name: edgeName }).length
    const restoreTargetHit = mockElementsFromPoint([targetNode])

    try {
      dispatchPointer(startHandle, "pointerDown", { button: 0, clientX: 610, clientY: 320, pointerId: 81 })
      expect(container.querySelector(".connection-preview-path")).toBeInTheDocument()

      dispatchPointer(window, "pointerMove", { button: 0, clientX: 850, clientY: 580, pointerId: 81 })
      dispatchPointer(window, "pointerUp", { button: 0, clientX: 850, clientY: 580, pointerId: 81 })

      expect(screen.queryAllByRole("button", { name: edgeName })).toHaveLength(initialEdgeCount + 1)
      expect(container.querySelector(".connection-preview-path")).not.toBeInTheDocument()
    } finally {
      restoreTargetHit()
    }

    const edgeCountAfterTargetRelease = screen.queryAllByRole("button", { name: edgeName }).length
    const restoreEmptyHit = mockElementsFromPoint([])
    try {
      dispatchPointer(startHandle, "pointerDown", { button: 0, clientX: 610, clientY: 320, pointerId: 82 })
      expect(container.querySelector(".connection-preview-path")).toBeInTheDocument()

      dispatchPointer(window, "pointerMove", { button: 0, clientX: 720, clientY: 460, pointerId: 82 })
      dispatchPointer(window, "pointerUp", { button: 0, clientX: 720, clientY: 460, pointerId: 82 })

      expect(screen.queryAllByRole("button", { name: edgeName })).toHaveLength(edgeCountAfterTargetRelease)
      expect(container.querySelector(".connection-preview-path")).not.toBeInTheDocument()
    } finally {
      restoreEmptyHit()
    }
  })

  it("creates a reaction edge with keyboard-accessible node handles", () => {
    render(<App />)

    const startHandle = screen.getByRole("button", { name: "Start edge from TS1 (Endo)" })
    fireEvent.keyDown(startHandle, { key: "Enter" })
    expect(startHandle).toHaveAttribute("aria-pressed", "true")

    fireEvent.keyDown(screen.getByRole("button", { name: "Node Exo Adduct" }), { key: "Enter" })

    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    expect(within(inspector).getByText("Selected Edge")).toBeInTheDocument()
    expect(within(inspector).getByText("TS1 (Endo)")).toBeInTheDocument()
    expect(within(inspector).getByText("Exo Adduct")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct/ })).toHaveLength(1)
  })

  it("edits selected edge labels and tracks the change in canvas history", () => {
    render(<App />)

    const startHandle = screen.getByRole("button", { name: "Start edge from TS1 (Endo)" })
    fireEvent.keyDown(startHandle, { key: "Enter" })
    fireEvent.keyDown(screen.getByRole("button", { name: "Node Exo Adduct" }), { key: "Enter" })

    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    const edgeLabelForm = within(inspector).getByRole("form", { name: "Edit edge label" })
    fireEvent.change(within(edgeLabelForm).getByLabelText("Edge label"), { target: { value: "Delta G 4.20" } })
    fireEvent.click(within(edgeLabelForm).getByRole("button", { name: "Apply edge label" }))

    expect(within(inspector).getAllByText("Delta G 4.20").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct: Delta G 4\.20/ })).toBeInTheDocument()

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(within(toolbar).getByRole("button", { name: "Undo canvas edit" }))
    expect(screen.getByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct: path/ })).toBeInTheDocument()

    fireEvent.click(within(toolbar).getByRole("button", { name: "Redo canvas edit" }))
    expect(screen.getByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct: Delta G 4\.20/ })).toBeInTheDocument()
  })

  it("edits node stoichiometric coefficients inline and tracks the change in canvas history", () => {
    render(<App />)

    const coefficientButton = screen.getByRole("button", { name: "Stoichiometric coefficient for TS1 (Endo)" })
    expect(coefficientButton).toHaveTextContent("×1")
    fireEvent.click(coefficientButton)

    const coefficientInput = screen.getByLabelText("Stoichiometric coefficient for TS1 (Endo)")
    fireEvent.change(coefficientInput, { target: { value: "2" } })
    fireEvent.keyDown(coefficientInput, { key: "Enter" })

    expect(screen.getByRole("button", { name: "Stoichiometric coefficient for TS1 (Endo)" })).toHaveTextContent("×2")

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(within(toolbar).getByRole("button", { name: "Undo canvas edit" }))
    expect(screen.getByRole("button", { name: "Stoichiometric coefficient for TS1 (Endo)" })).toHaveTextContent("×1")

    fireEvent.click(within(toolbar).getByRole("button", { name: "Redo canvas edit" }))
    expect(screen.getByRole("button", { name: "Stoichiometric coefficient for TS1 (Endo)" })).toHaveTextContent("×2")
  })

  it("marks explicit barrier annotations between two nodes and deletes the selection", () => {
    const { container } = render(<App />)

    const targetNode = screen.getByRole("button", { name: "Node TS1 (Endo)" })
    const restoreElementsFromPoint = mockElementsFromPoint([targetNode])
    try {
      const handle = screen.getByRole("button", { name: "Drag barrier annotation from 1,3-Butadiene" })
      fireEvent.pointerDown(handle, { button: 0, clientX: 410, clientY: 390, pointerId: 21 })
      fireEvent.pointerMove(handle, { button: 0, clientX: 700, clientY: 360, pointerId: 21 })
      fireEvent.pointerUp(handle, { button: 0, clientX: 700, clientY: 360, pointerId: 21 })
    } finally {
      restoreElementsFromPoint()
    }

    expect(container.querySelector(".barrier-arrow")).toBeInTheDocument()
    expect(container.querySelector(".barrier-guide")).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "Barrier annotation from 1,3-Butadiene to TS1 (Endo): ΔG‡ 20.96",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Barrier from 1,3-Butadiene to TS1 (Endo)" })).toHaveTextContent("ΔG‡ 20.96")

    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    expect(within(inspector).getByText("Selected Barrier")).toBeInTheDocument()

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(within(toolbar).getByRole("button", { name: "Delete selection" }))

    expect(screen.queryByRole("button", { name: "Barrier from 1,3-Butadiene to TS1 (Endo)" })).not.toBeInTheDocument()
    expect(container.querySelector(".barrier-arrow")).not.toBeInTheDocument()
  })

  it("updates explicit barrier annotation labels when energy source changes", () => {
    render(<App />)

    const targetNode = screen.getByRole("button", { name: "Node TS1 (Endo)" })
    const restoreElementsFromPoint = mockElementsFromPoint([targetNode])
    try {
      const handle = screen.getByRole("button", { name: "Drag barrier annotation from 1,3-Butadiene" })
      fireEvent.pointerDown(handle, { button: 0, clientX: 410, clientY: 390, pointerId: 22 })
      fireEvent.pointerMove(handle, { button: 0, clientX: 700, clientY: 360, pointerId: 22 })
      fireEvent.pointerUp(handle, { button: 0, clientX: 700, clientY: 360, pointerId: 22 })
    } finally {
      restoreElementsFromPoint()
    }

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    expect(screen.getByRole("button", { name: "Barrier from 1,3-Butadiene to TS1 (Endo)" })).toHaveTextContent("ΔG‡ 20.96")

    fireEvent.change(within(toolbar).getByRole("combobox", { name: "Energy" }), { target: { value: "gas" } })

    expect(screen.getByRole("button", { name: "Barrier from 1,3-Butadiene to TS1 (Endo)" })).toHaveTextContent("ΔE‡ 19.15")
    expect(
      screen.getByRole("button", {
        name: "Barrier annotation from 1,3-Butadiene to TS1 (Endo): ΔE‡ 19.15",
      }),
    ).toBeInTheDocument()
  })

  it("supports undo, redo, delete selection, auto layout, and fit view canvas commands", () => {
    render(<App />)

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    const undo = within(toolbar).getByRole("button", { name: "Undo canvas edit" })
    const redo = within(toolbar).getByRole("button", { name: "Redo canvas edit" })
    const deleteSelection = within(toolbar).getByRole("button", { name: "Delete selection" })

    expect(undo).toBeDisabled()
    expect(redo).toBeDisabled()
    expect(deleteSelection).toBeEnabled()

    const startHandle = screen.getByRole("button", { name: "Start edge from TS1 (Endo)" })
    fireEvent.keyDown(startHandle, { key: "Enter" })
    fireEvent.keyDown(screen.getByRole("button", { name: "Node Exo Adduct" }), { key: "Enter" })
    expect(screen.getAllByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct/ })).toHaveLength(1)
    expect(undo).toBeEnabled()

    fireEvent.click(undo)
    expect(screen.queryByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct/ })).not.toBeInTheDocument()
    expect(redo).toBeEnabled()

    fireEvent.click(redo)
    expect(screen.getAllByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct/ })).toHaveLength(1)
    expect(deleteSelection).toBeEnabled()

    fireEvent.click(deleteSelection)
    expect(screen.queryByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct/ })).not.toBeInTheDocument()
    fireEvent.click(undo)
    expect(screen.getAllByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct/ })).toHaveLength(1)

    const node = screen.getByRole("button", { name: "Node TS2 (Exo)" })
    const beforeLayout = node.getAttribute("style")
    fireEvent.click(within(toolbar).getByRole("button", { name: "Auto layout" }))
    expect(node.getAttribute("style")).not.toBe(beforeLayout)

    const surface = document.querySelector(".canvas-surface") as HTMLElement
    const world = document.querySelector(".canvas-world") as HTMLElement
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 800,
      width: 1000,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect)
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    const beforeFit = world.style.transform
    fireEvent.click(within(toolbar).getByRole("button", { name: "Fit view" }))
    expect(world.style.transform).not.toBe(beforeFit)
  })

  it("uses Delete, Backspace, and Escape keys for the current canvas selection", () => {
    render(<App />)

    const surface = screen.getByLabelText("Graph canvas surface")
    const tsNode = screen.getByRole("button", { name: "Node TS1 (Endo)" })
    expect(tsNode).toHaveClass("is-selected")

    fireEvent.keyDown(surface, { key: "Escape" })
    expect(tsNode).not.toHaveClass("is-selected")

    fireEvent.keyDown(surface, { key: "Delete" })
    expect(screen.getByRole("button", { name: "Node TS1 (Endo)" })).toBeInTheDocument()

    fireEvent.keyDown(tsNode, { key: "Enter" })
    fireEvent.keyDown(screen.getByRole("button", { name: "Edge TS2 (Exo) to Exo Adduct: -11.98" }), {
      key: "Enter",
      shiftKey: true,
    })
    expect(tsNode).toHaveClass("is-selected")
    fireEvent.keyDown(surface, { key: "Backspace" })

    expect(screen.queryByRole("button", { name: "Node TS1 (Endo)" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Edge 1,3-Butadiene to TS1 \(Endo\)/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edge TS2 (Exo) to Exo Adduct: -11.98" })).not.toBeInTheDocument()

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(within(toolbar).getByRole("button", { name: "Undo canvas edit" }))
    expect(screen.getByRole("button", { name: "Node TS1 (Endo)" })).toBeInTheDocument()
  })

  it("nudges selected canvas nodes with arrow keys and ignores shortcuts from editor inputs", () => {
    render(<App />)

    const surface = screen.getByLabelText("Graph canvas surface")
    const butadiene = screen.getByRole("button", { name: "Node 1,3-Butadiene" })
    const maleic = screen.getByRole("button", { name: "Node Maleic Anhydride" })
    const butadieneStart = transformTranslate(butadiene.style.transform)
    const maleicStart = transformTranslate(maleic.style.transform)

    fireEvent.keyDown(butadiene, { key: "Enter" })
    fireEvent.keyDown(maleic, { key: "Enter", shiftKey: true })
    expect(butadiene).toHaveClass("is-selected")
    expect(maleic).toHaveClass("is-selected")

    fireEvent.keyDown(surface, { key: "ArrowRight" })
    expect(transformTranslate(butadiene.style.transform)).toEqual({
      x: butadieneStart.x + 20,
      y: butadieneStart.y,
    })
    expect(transformTranslate(maleic.style.transform)).toEqual({
      x: maleicStart.x + 20,
      y: maleicStart.y,
    })

    const afterNudge = transformTranslate(butadiene.style.transform)
    fireEvent.click(screen.getByRole("button", { name: "Stoichiometric coefficient for 1,3-Butadiene" }))
    fireEvent.keyDown(screen.getByLabelText("Stoichiometric coefficient for 1,3-Butadiene"), { key: "ArrowRight" })
    expect(transformTranslate(butadiene.style.transform)).toEqual(afterNudge)

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(within(toolbar).getByRole("button", { name: "Undo canvas edit" }))
    expect(transformTranslate(butadiene.style.transform)).toEqual(butadieneStart)
    expect(transformTranslate(maleic.style.transform)).toEqual(maleicStart)
  })

  it("parses local files in the browser workbench", async () => {
    render(<App />)

    const input = screen.getByLabelText("Import calculation files")
    const file = new File([[
      "! B3LYP def2-SVP Opt",
      "* xyz 0 1",
      "O 0.0 0.0 0.0",
      "H 0.0 0.0 0.96",
      "H 0.92 0.0 -0.24",
      "*",
      "CARTESIAN COORDINATES (ANGSTROEM)",
      "---------------------------------",
      "O      0.000000    0.000000    0.000000",
      "H      0.000000    0.000000    0.960000",
      "H      0.920000    0.000000   -0.240000",
      "---------------------------------",
      "FINAL SINGLE POINT ENERGY     -76.431",
      "CPCM SOLVATION ENERGY = -0.001",
    ].join("\n")], "orca-water.out", { type: "text/plain" })
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByRole("button", { name: "orca-water.out ORCA" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Source inspector" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open raw log" })).toBeInTheDocument()
    const parsedNode = await screen.findByRole("button", { name: "Node orca-water" })
    expect(parsedNode).toHaveTextContent("ΔG")

    fireEvent.click(parsedNode)
    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    const formulaField = within(inspector).getByText("Formula").closest("div")
    expect(formulaField).toHaveTextContent("H2O")
    expect(formulaField).toHaveTextContent("(3)")
    expect(within(inspector).queryByText("3 atoms")).not.toBeInTheDocument()

    fireEvent.click(within(inspector).getByRole("button", { name: "Open 3D Structure" }))
    const dialog = screen.getByRole("dialog", { name: "3D Structure" })
    expect(dialog).toHaveTextContent("orca-water")
    expect(dialog).toHaveTextContent("H2O")
    expect(dialog).toHaveTextContent("3")
    expect(dialog).toHaveTextContent("H, O")
    expect(dialog).toHaveTextContent("orca-water.out")
  })

  it("selects, drags, and deletes project file rows without adding canvas nodes", () => {
    render(<App />)

    const initialNodeCount = document.querySelectorAll(".reaction-node").length
    const gaussianButton = screen.getByRole("button", { name: "gaussian.log Gaussian" })
    const orcaButton = screen.getByRole("button", { name: "orca.out ORCA" })
    const mapleButton = screen.getByRole("button", { name: "maple-path.out MAPLE" })
    const gaussianRow = gaussianButton.closest(".project-file-card") as HTMLElement
    const orcaRow = orcaButton.closest(".project-file-card") as HTMLElement
    const mapleRow = mapleButton.closest(".project-file-card") as HTMLElement

    fireEvent.click(gaussianButton)
    fireEvent.click(orcaButton, { metaKey: true })
    expect(gaussianRow).toHaveClass("project-file-card--selected")
    expect(orcaRow).toHaveClass("project-file-card--selected")

    const batchDrag = new TestDataTransfer()
    fireEvent.dragStart(orcaRow, { dataTransfer: batchDrag })
    expect(batchDrag.effectAllowed).toBe("copy")
    expect(JSON.parse(batchDrag.getData("application/x-rxnflow-raw-file"))).toEqual({
      kind: "project-files",
      files: [
        { projectFileId: "gaussian-log", path: "inputs/raw/gaussian-log-gaussian.log" },
        { projectFileId: "orca-out", path: "inputs/raw/orca-out-orca.out" },
      ],
    })

    fireEvent.click(gaussianButton)
    fireEvent.click(mapleButton, { shiftKey: true })
    expect(gaussianRow).toHaveClass("project-file-card--selected")
    expect(orcaRow).toHaveClass("project-file-card--selected")
    expect(mapleRow).toHaveClass("project-file-card--selected")

    fireEvent.click(screen.getByRole("button", { name: "More actions for orca.out" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete file and nodes" }))
    expect(screen.queryByRole("button", { name: "orca.out ORCA" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Node Maleic Anhydride" })).not.toBeInTheDocument()
    expect(document.querySelectorAll(".reaction-node")).toHaveLength(initialNodeCount - 1)
  })

  it("drops project file rows onto the canvas at graph-space position", async () => {
    const { container } = render(<App />)

    const surface = screen.getByLabelText("Graph canvas surface")
    mockSurfaceRect(surface)
    const world = container.querySelector(".canvas-world") as HTMLElement
    const scale = transformScale(world.style.transform)
    const translate = transformTranslate(world.style.transform)
    const clientX = 520
    const clientY = 420
    const expectedX = Math.round((clientX - translate.x) / scale)
    const expectedY = Math.round((clientY - translate.y) / scale)
    const dataTransfer = new TestDataTransfer()
    dataTransfer.setData("application/x-rxnflow-raw-file", JSON.stringify({
      kind: "project-file",
      projectFileId: "orca-out",
      path: "inputs/raw/orca-out-orca.out",
    }))

    fireEvent.dragOver(surface, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe("copy")
    dispatchDrop(surface, dataTransfer, clientX, clientY)

    await waitFor(() => {
      const node = Array.from(container.querySelectorAll(".reaction-node[data-flow-node-id]"))
        .find((element) => {
          const nodeId = element.getAttribute("data-flow-node-id")
          return nodeId?.startsWith("imported-orca-out-") && nodeId.includes("-drop-")
        }) as HTMLElement | undefined
      expect(node).toBeDefined()
      expect(node?.style.transform).toContain(`translate3d(${expectedX}px, ${expectedY}px, 0)`)
    })
  })

  it("drops external files onto the canvas at graph-space position", async () => {
    const { container } = render(<App />)

    const surface = screen.getByLabelText("Graph canvas surface")
    mockSurfaceRect(surface)
    const world = container.querySelector(".canvas-world") as HTMLElement
    const scale = transformScale(world.style.transform)
    const translate = transformTranslate(world.style.transform)
    const clientX = 640
    const clientY = 360
    const expectedX = Math.round((clientX - translate.x) / scale)
    const expectedY = Math.round((clientY - translate.y) / scale)
    const file = new File(["FINAL SINGLE POINT ENERGY -12.34"], "canvas-drop.out", { type: "text/plain" })
    const dataTransfer = new TestDataTransfer([file])

    fireEvent.dragOver(surface, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe("copy")
    dispatchDrop(surface, dataTransfer, clientX, clientY)

    expect(await screen.findByRole("button", { name: "canvas-drop.out ORCA" })).toBeInTheDocument()
    await waitFor(() => {
      const node = Array.from(container.querySelectorAll(".reaction-node[data-flow-node-id]"))
        .find((element) => element.getAttribute("data-flow-node-id")?.startsWith("imported-file-") && element.getAttribute("data-flow-node-id")?.includes("-drop-")) as HTMLElement | undefined
      expect(node).toBeDefined()
      expect(node?.style.transform).toContain(`translate3d(${expectedX}px, ${expectedY}px, 0)`)
    })
  })

  it("reviews multi-candidate source previews before registering nodes", async () => {
    render(<App />)

    const input = screen.getByLabelText("Import calculation files")
    const xyz = [
      "2",
      "Frame 1 Energy=-2.00",
      "H 0 0 0",
      "H 0 0 1",
      "2",
      "Frame 2 Energy=-3.00",
      "H 0 0 0",
      "H 0 0 1",
    ].join("\n")
    const file = new File([xyz], "path.xyz", { type: "chemical/x-xyz" })
    fireEvent.change(input, { target: { files: [file] } })

    const dialog = await screen.findByRole("dialog", { name: "Import candidates" })
    expect(within(dialog).getByText("2 candidates")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Node Frame 1" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Node Frame 2" })).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole("button", { name: "Later" }))
    expect(screen.queryByRole("region", { name: "Source inspector" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "More actions for path.xyz" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Review candidates" }))

    const reopenedDialog = await screen.findByRole("dialog", { name: "Import candidates" })
    fireEvent.click(within(reopenedDialog).getByRole("button", { name: "Register all" }))

    expect(await screen.findByRole("button", { name: "Node Frame 1" })).toHaveTextContent("ΔG")
    expect(await screen.findByRole("button", { name: "Node Frame 2" })).toHaveTextContent("ΔG")
    expect(screen.queryByRole("dialog", { name: "Import candidates" })).not.toBeInTheDocument()
  })

  it("uses the desktop import register command for reviewed candidates", async () => {
    const chooseFiles = vi.fn().mockResolvedValue({
      canceled: false,
      files: [{
        name: "native-path.xyz",
        size: 200,
        preview: "desktop multi candidate preview",
        sourcePath: "/tmp/native-path.xyz",
        parse: {
          label: "native-path",
          sourceKind: "XYZ",
          formula: "H2",
          kind: "intermediate",
          method: "XYZ trajectory",
          solvent: "unassigned",
          energyGas: null,
          energySolution: null,
          energyUnit: "hartree",
          parsed: true,
          parserId: "xyz-text-preview",
          parserVersion: "0.2.0",
          objectCount: 2,
          warnings: [],
          coordinatePreview: null,
          candidates: [
            {
              candidateId: "candidate-1-native-frame-1",
              objectIndex: 0,
              label: "Native frame 1",
              formula: "H2",
              charge: null,
              spinMultiplicity: null,
              method: "XYZ trajectory",
              energyGas: -2,
              energySolution: null,
              energyUnit: "hartree",
              coordinatePreview: null,
              roleHint: "path-point",
              warnings: [],
            },
            {
              candidateId: "candidate-2-native-frame-2",
              objectIndex: 1,
              label: "Native frame 2",
              formula: "H2",
              charge: null,
              spinMultiplicity: null,
              method: "XYZ trajectory",
              energyGas: -3,
              energySolution: null,
              energyUnit: "hartree",
              coordinatePreview: null,
              roleHint: "final",
              warnings: [],
            },
          ],
        },
      }],
    })
    const registerImportCandidates = vi.fn(async (payload: any) => ({
      ok: true,
      data: {
        registeredObjects: [{
          id: `object-${payload.selections[0].fileId}-candidate-2-native-frame-2`,
          label: "Engine registered frame 2",
          formula: "H2",
          kind: "product",
          method: "XYZ trajectory",
          solvent: "unassigned",
          energyGas: -3,
          energySolution: null,
          energyUnit: "hartree",
          sourceStatus: "parsed",
          sourceFileId: payload.selections[0].fileId,
          sourceFileName: "native-path.xyz",
          sourceCandidateId: "candidate-2-native-frame-2",
          sourceObjectIndex: 1,
          parserId: "xyz-text-preview",
          parserVersion: "0.2.0",
          roleHint: "final",
          charge: null,
          spinMultiplicity: null,
        }],
        files: [{
          fileId: payload.selections[0].fileId,
          registeredObjectIds: [`object-${payload.selections[0].fileId}-candidate-2-native-frame-2`],
          objectIndices: [1],
        }],
      },
    }))
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles,
        getEngineStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            status: "ready",
            engineVersion: "rxnflow-smoke-engine-v1",
            capabilities: ["engine.status", "import.preview", "import.register_selection", "import.register_all"],
          },
        }),
        registerImportCandidates,
        saveReportArtifact: vi.fn(),
        saveProjectPackage: vi.fn(),
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
      },
    })

    render(<App />)

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(screen.getByRole("button", { name: "Import files" }))

    const dialog = await screen.findByRole("dialog", { name: "Import candidates" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Register selected" }))

    await waitFor(() => expect(registerImportCandidates).toHaveBeenCalledTimes(1))
    const payload = registerImportCandidates.mock.calls[0][0]
    expect(payload).toMatchObject({
      mode: "selected",
      files: [expect.objectContaining({
        name: "native-path.xyz",
        parse: expect.objectContaining({ parserId: "xyz-text-preview" }),
      })],
      selections: [expect.objectContaining({ objectIndices: [1] })],
    })
    expect(payload.selections[0].fileId).toBe(payload.files[0].id)
    expect(await screen.findByRole("button", { name: "Node Engine registered frame 2" })).toHaveTextContent("ΔG")
  })

  it("uses Electron desktop APIs for native import and report export", async () => {
    const chooseFiles = vi.fn().mockResolvedValue({
      canceled: false,
      files: [{
        name: "desktop.out",
        size: 1234,
        preview: "engine-provided parse payload",
        sourcePath: "/tmp/desktop.out",
        parse: {
          label: "engine-preview",
          sourceKind: "ORCA",
          formula: "C2H4",
          kind: "product",
          method: "ORCA single point",
          solvent: "implicit solvent",
          energyGas: -42.25,
          energySolution: -42.5,
          energyUnit: "hartree",
          parsed: true,
        },
      }],
    })
    const saveReportArtifact = vi.fn(async (payload: { defaultName: string; content?: string }) => ({
      canceled: false,
      filePath: `/tmp/diels-alder-study.rxnflow/exports/${payload.defaultName}`,
      projectArtifactPath: `exports/${payload.defaultName}`,
    }))
    const saveProjectPackage = vi.fn().mockResolvedValue({ canceled: false, filePath: "/tmp/diels-alder-study.rxnflow.zip" })
    const getEngineStatus = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        status: "ready",
        engineVersion: "rxnflow-smoke-engine-v1",
        capabilities: ["engine.status", "flow.demo"],
      },
    })
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles,
        getEngineStatus,
        saveReportArtifact,
        saveProjectPackage,
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
      },
    })

    render(<App />)

    await waitFor(() => expect(getEngineStatus).toHaveBeenCalledTimes(1))

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(screen.getByRole("button", { name: "Import files" }))

    expect(await screen.findByRole("button", { name: "desktop.out ORCA" })).toBeInTheDocument()
    expect(await screen.findByRole("button", { name: "Node engine-preview" })).toHaveTextContent("ΔG")
    expect(chooseFiles).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    const exportPanel = screen.getByRole("region", { name: "Export panel" })
    fireEvent.click(within(exportPanel).getByRole("button", { name: "Export" }))

    await waitFor(() => expect(saveReportArtifact).toHaveBeenCalledTimes(3))
    expect(saveReportArtifact.mock.calls.map((call) => call[0].defaultName)).toEqual([
      "rxnflow-report.png",
      "rxnflow-report.cdxml",
      "rxnflow-report.xlsx",
    ])
    expect(saveReportArtifact.mock.calls[1][0].content).toContain("engine-preview")
    expect(await within(exportPanel).findByText("Saved to exports/rxnflow-report.png")).toBeInTheDocument()
    expect(within(exportPanel).getByText("Saved to exports/rxnflow-report.cdxml")).toBeInTheDocument()
    expect(within(exportPanel).getByText("Saved to exports/rxnflow-report.xlsx")).toBeInTheDocument()
  })

  it("autosaves desktop imports as project-owned source copies", async () => {
    const chooseFiles = vi.fn().mockResolvedValue({
      canceled: false,
      files: [{
        name: "desktop.out",
        size: 1234,
        preview: "engine-provided parse payload",
        sourcePath: "/external/desktop.out",
        parse: {
          label: "engine-preview",
          sourceKind: "ORCA",
          formula: "C2H4",
          kind: "product",
          method: "ORCA single point",
          solvent: "implicit solvent",
          energyGas: -42.25,
          energySolution: -42.5,
          energyUnit: "hartree",
          parsed: true,
        },
      }],
    })
    const autosaveProjectPackage = vi.fn(async (payload: { content: string }) => {
      const projectPackage = JSON.parse(payload.content)
      projectPackage.files = projectPackage.files.map((file: Record<string, unknown>) => {
        const { sourcePath: _sourcePath, ...rest } = file
        return {
          ...rest,
          storedPath: "sources/01-desktop-out-desktop.out",
          checksum: `sha256:${"a".repeat(64)}`,
        }
      })
      return {
        canceled: false,
        projectDirectory: "/Users/linsay/Documents/RxnFlow/Diels-Alder Study",
        content: JSON.stringify(projectPackage),
        validation: null,
      }
    })
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles,
        getEngineStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            status: "ready",
            engineVersion: "rxnflow-smoke-engine-v1",
            capabilities: ["engine.status", "import.preview"],
          },
        }),
        saveReportArtifact: vi.fn(),
        saveProjectPackage: vi.fn(),
        autosaveProjectPackage,
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
      },
    })

    render(<App />)

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(screen.getByRole("button", { name: "Import files" }))

    expect(await screen.findByRole("button", { name: "desktop.out ORCA" })).toBeInTheDocument()
    await waitFor(() => expect(autosaveProjectPackage).toHaveBeenCalled(), { timeout: 2500 })
    expect(JSON.parse(autosaveProjectPackage.mock.calls[0][0].content).files[0]).toMatchObject({
      name: "desktop.out",
      sourcePath: "/external/desktop.out",
    })

    fireEvent.click(screen.getByRole("button", { name: "desktop.out ORCA" }))
    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    expect(within(inspector).getByText("engine-preview")).toBeInTheDocument()
    const sourceInspector = within(inspector).getByRole("region", { name: "Source inspector" })
    expect(sourceInspector).toHaveTextContent("desktop.out")
    expect(within(sourceInspector).getByRole("button", { name: "Open raw log" })).toBeEnabled()
    expect(screen.queryByText("sources/01-desktop-out-desktop.out")).not.toBeInTheDocument()
  })

  it("keeps canceled Electron report exports out of the export summary", async () => {
    const saveReportArtifact = vi.fn().mockResolvedValue({ canceled: true })
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles: vi.fn(),
        getEngineStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            status: "ready",
            engineVersion: "rxnflow-smoke-engine-v1",
            capabilities: ["engine.status", "flow.demo"],
          },
        }),
        saveReportArtifact,
        saveProjectPackage: vi.fn(),
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
      },
    })

    render(<App />)

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    const exportPanel = screen.getByRole("region", { name: "Export panel" })
    fireEvent.click(within(exportPanel).getByRole("button", { name: "Export" }))

    await waitFor(() => expect(saveReportArtifact).toHaveBeenCalledTimes(3))
    expect(await within(exportPanel).findByText("Export canceled.")).toBeInTheDocument()
    expect(within(exportPanel).getByText("6 table rows ready")).toBeInTheDocument()
    expect(within(exportPanel).queryByText(/Saved to/)).not.toBeInTheDocument()
  })

  it("restores a project package opened from the native recent projects menu", async () => {
    let openProjectContentCallback: ((payload: {
      content: string
      filePath?: string
      projectDirectory?: string | null
      replaceProjects?: boolean
      source?: string
      validation?: {
        valid: boolean
        summary: Record<string, unknown>
        issues: Array<{ severity: "error" | "warning"; code: string; message: string }>
      } | null
    }) => void) | undefined
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles: vi.fn(),
        getEngineStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            status: "ready",
            engineVersion: "rxnflow-smoke-engine-v1",
            capabilities: ["engine.status", "flow.demo"],
          },
        }),
        saveReportArtifact: vi.fn(),
        saveProjectPackage: vi.fn(),
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
        onOpenProjectContent: vi.fn((callback) => {
          openProjectContentCallback = callback
          return vi.fn()
        }),
      },
    })

    render(<App />)
    await waitFor(() => expect(openProjectContentCallback).toBeTypeOf("function"))

    const packageContent = JSON.stringify({
      schemaVersion: 1,
      packageKind: "rxnflow-project",
      project: { id: "recent-study", label: "Recent Study", meta: "saved" },
      files: [{
        id: "recent-file",
        name: "recent.log",
        kind: "Gaussian",
        size: 456,
        status: "parsed",
        preview: "SCF Done: E(RwB97XD) = -99.5",
      }],
      nodes: [{
        id: "recent-node",
        label: "Recent TS",
        formula: "C2H4",
        kind: "transition",
        method: "wB97X-D",
        solvent: "Toluene",
        energyGas: -99.5,
        energySolution: -99.4,
        energyUnit: "hartree",
        sourceStatus: "parsed",
        sourceFileId: "recent-file",
        position: { x: 24, y: 40 },
      }],
      edges: [],
      viewport: { x: 120, y: 180, zoom: 0.9 },
      savedAt: "2026-06-14T00:00:00.000Z",
    })

    expect(openProjectContentCallback).toBeDefined()
    act(() => {
      openProjectContentCallback?.({
        content: packageContent,
        filePath: "/tmp/recent-study.rxnflow.json",
        projectDirectory: "/tmp/recent-study.rxnflow",
        replaceProjects: true,
        source: "recent",
        validation: {
          valid: true,
          summary: { projectId: "recent-study" },
          issues: [{
            severity: "warning",
            code: "source_missing",
            message: "files[0].storedPath does not exist in the workspace folder.",
          }],
        },
      })
    })

    expect(await screen.findByRole("button", { name: "Node Recent TS" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "recent.log Gaussian" })).toBeInTheDocument()
    expect(screen.getAllByText("Recent Study").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: "Diels-Alder Study open" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Nickel catalysis empty" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Ir screening empty" })).not.toBeInTheDocument()
    const projectValidation = screen.getByRole("status", { name: "Project validation" })
    expect(projectValidation).toHaveTextContent("Project warnings")
    expect(projectValidation).toHaveTextContent("files[0].storedPath does not exist")
  })

  it("opens a second desktop workspace without removing the first real workspace", async () => {
    let openProjectContentCallback: ((payload: {
      content: string
      filePath?: string
      projectDirectory?: string | null
      replaceProjects?: boolean
      source?: string
      validation?: {
        valid: boolean
        summary: Record<string, unknown>
        issues: Array<{ severity: "error" | "warning"; code: string; message: string }>
      } | null
    }) => void) | undefined
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles: vi.fn(),
        getEngineStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            status: "ready",
            engineVersion: "rxnflow-smoke-engine-v1",
            capabilities: ["engine.status", "flow.demo"],
          },
        }),
        saveReportArtifact: vi.fn(),
        saveProjectPackage: vi.fn(),
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
        onOpenProjectContent: vi.fn((callback) => {
          openProjectContentCallback = callback
          return vi.fn()
        }),
      },
    })

    render(<App />)
    await waitFor(() => expect(openProjectContentCallback).toBeTypeOf("function"))

    const irPackageContent = JSON.stringify({
      schemaVersion: 1,
      packageKind: "rxnflow-project",
      project: { id: "ir-workspace", label: "Ir", meta: "saved" },
      files: [{
        id: "ir-file",
        name: "4b-1.log",
        kind: "Gaussian",
        size: 456,
        status: "parsed",
        preview: "SCF Done: E(RwB97XD) = -5208.1",
      }],
      nodes: [{
        id: "ir-node",
        label: "4b-1",
        formula: "C113H76ClIrN4O",
        kind: "intermediate",
        method: "wB97X-D",
        solvent: "SMD",
        energyGas: -5208.1,
        energySolution: -5208.2,
        energyUnit: "hartree",
        sourceStatus: "parsed",
        sourceFileId: "ir-file",
        position: { x: 24, y: 40 },
      }],
      edges: [],
      viewport: { x: 120, y: 180, zoom: 0.9 },
      savedAt: "2026-06-17T00:00:00.000Z",
    })
    const niPackageContent = JSON.stringify({
      schemaVersion: 1,
      packageKind: "rxnflow-project",
      project: { id: "ni-workspace", label: "Ni", meta: "saved" },
      files: [{
        id: "ni-file",
        name: "Ni.log",
        kind: "Gaussian",
        size: 456,
        status: "parsed",
        preview: "SCF Done: E(RwB97XD) = -199.1",
      }],
      nodes: [{
        id: "ni-node",
        label: "Ni TS",
        formula: "Ni",
        kind: "intermediate",
        method: "wB97X-D",
        solvent: "SMD",
        energyGas: -199.1,
        energySolution: -199.2,
        energyUnit: "hartree",
        sourceStatus: "parsed",
        sourceFileId: "ni-file",
        position: { x: 24, y: 40 },
      }],
      edges: [],
      viewport: { x: 120, y: 180, zoom: 0.9 },
      savedAt: "2026-06-17T00:00:00.000Z",
    })

    expect(openProjectContentCallback).toBeDefined()
    act(() => {
      openProjectContentCallback?.({
        content: irPackageContent,
        filePath: "/tmp/Ir.rxnflow",
        projectDirectory: "/tmp/Ir.rxnflow",
        replaceProjects: true,
        source: "recent",
        validation: null,
      })
    })
    expect(await screen.findByRole("button", { name: "Ir open" })).toHaveAttribute("aria-current", "true")
    expect(screen.queryByRole("button", { name: "Diels-Alder Study open" })).not.toBeInTheDocument()

    act(() => {
      openProjectContentCallback?.({
        content: niPackageContent,
        filePath: "/tmp/Ni.rxnflow",
        projectDirectory: "/tmp/Ni.rxnflow",
        replaceProjects: true,
        source: "recent",
        validation: null,
      })
    })

    expect(await screen.findByRole("button", { name: "Node Ni TS" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Ni open" })).toHaveAttribute("aria-current", "true")
    expect(screen.getByRole("button", { name: "Ir open" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Diels-Alder Study open" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Nickel catalysis empty" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Ir screening empty" })).not.toBeInTheDocument()
  })

  it("reopens the most recent desktop workspace on startup without restoring demo projects", async () => {
    const startupPackageContent = JSON.stringify({
      schemaVersion: 1,
      packageKind: "rxnflow-project",
      project: { id: "ir-workspace", label: "Ir", meta: "saved" },
      files: [{
        id: "ir-file",
        name: "4b-1.log",
        kind: "Gaussian",
        size: 123456,
        status: "parsed",
        preview: "SCF Done: E(RwB97XD) = -5208.1",
        storedPath: "sources/01-4b-1.log",
      }],
      nodes: [{
        id: "ir-node",
        label: "4b-1",
        formula: "C113H76ClIrN4O",
        kind: "intermediate",
        method: "wB97X-D",
        solvent: "SMD",
        energyGas: -5208.1,
        energySolution: -5208.2,
        energyUnit: "hartree",
        sourceStatus: "parsed",
        sourceFileId: "ir-file",
        position: { x: 24, y: 40 },
      }],
      edges: [],
      viewport: { x: 120, y: 180, zoom: 0.9 },
      savedAt: "2026-06-17T00:00:00.000Z",
    })
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles: vi.fn(),
        getEngineStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            status: "ready",
            engineVersion: "rxnflow-smoke-engine-v1",
            capabilities: ["engine.status", "project.restore"],
          },
        }),
        getStartupProjectContent: vi.fn().mockResolvedValue({
          canceled: false,
          content: startupPackageContent,
          filePath: "/Users/linsay/Documents/RxnFlow/Ir.rxnflow",
          projectDirectory: "/Users/linsay/Documents/RxnFlow/Ir.rxnflow",
          replaceProjects: true,
          source: "startup",
          validation: null,
        }),
        saveReportArtifact: vi.fn(),
        saveProjectPackage: vi.fn(),
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
        onOpenProjectContent: vi.fn(() => vi.fn()),
      },
    })

    render(<App />)

    expect(await screen.findByRole("button", { name: "Node 4b-1" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "4b-1.log Gaussian" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Ir open" })).toHaveAttribute("aria-current", "true")
    expect(screen.queryByRole("button", { name: "Diels-Alder Study open" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Nickel catalysis empty" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Ir screening empty" })).not.toBeInTheDocument()
  })
})
