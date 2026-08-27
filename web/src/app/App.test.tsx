import { act, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { StrictMode } from "react"
import { App } from "./App"

function transformScale(transform: string): number {
  const match = transform.match(/scale\(([^)]+)\)/)
  return match ? Number(match[1]) : Number.NaN
}

function fileButtonName(fileName: string, sourceKind: string): RegExp {
  const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const escapedSourceKind = sourceKind.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`${escapedFileName}\\s+${escapedSourceKind}(?:,|$)`)
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
  private explicitTypes: string[] = []
  private values = new Map<string, string>()

  constructor(files: File[] = [], options: { types?: string[] } = {}) {
    this.files = files
    this.explicitTypes = options.types ?? []
  }

  setData(type: string, value: string) {
    this.values.set(type, value)
  }

  getData(type: string) {
    return this.values.get(type) ?? ""
  }

  get types() {
    return Array.from(new Set([
      ...Array.from(this.values.keys()),
      ...this.explicitTypes,
      ...(this.files.length > 0 ? ["Files"] : []),
    ]))
  }

  get items() {
    return this.files.map((file) => ({
      kind: "file",
      type: file.type,
      getAsFile: () => file,
    }))
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
  const match = transform.match(/translate(?:3d)?\(([^p]+)px,\s*([^p,)]+)px(?:,\s*0)?\)/)
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

function mockImageNaturalSize(width = 120, height = 80) {
  const originalImage = window.Image
  class MockImage {
    naturalWidth = width
    naturalHeight = height
    onload: ((event: Event) => void) | null = null

    set src(_value: string) {
      queueMicrotask(() => this.onload?.(new Event("load")))
    }
  }
  Object.defineProperty(window, "Image", {
    configurable: true,
    value: MockImage,
  })
  return () => {
    Object.defineProperty(window, "Image", {
      configurable: true,
      value: originalImage,
    })
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, resolve, reject }
}

function crossProjectAutosavePackage(
  projectId: string,
  projectLabel: string,
  fileName: string,
  storedPath: string,
) {
  return JSON.stringify({
    schemaVersion: 1,
    packageKind: "rxnflow-project",
    project: { id: projectId, label: projectLabel, meta: "saved" },
    files: [{
      id: "shared-file",
      name: fileName,
      kind: "Gaussian",
      size: 128,
      status: "parsed",
      preview: `${projectLabel} calculation`,
      storedPath,
    }],
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    savedAt: "2026-07-15T00:00:00.000Z",
  })
}

function installDesktopImportRuntime(overrides: Record<string, unknown>) {
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
          capabilities: ["engine.status", "import.preview"],
        },
      }),
      saveReportArtifact: vi.fn(),
      saveProjectPackage: vi.fn(),
      onMenuImportFiles: vi.fn(() => vi.fn()),
      onMenuOpenProject: vi.fn(() => vi.fn()),
      onMenuSaveProject: vi.fn(() => vi.fn()),
      ...overrides,
    },
  })
}

type PendingDesktopImportJob = {
  payload: any
  resolve: (value: any) => void
}

function desktopImportResponse(
  job: PendingDesktopImportJob,
  file: Record<string, unknown>,
) {
  return {
    ok: true,
    data: {
      files: [{
        id: job.payload.files[0].id,
        preview: "",
        ...file,
      }],
    },
  }
}

function parsedOrcaSource(label: string) {
  return {
    label,
    sourceKind: "ORCA",
    formula: "C2H4",
    kind: "product",
    method: "ORCA single point",
    solvent: "implicit solvent",
    energyGas: -42.25,
    energySolution: -42.5,
    energyUnit: "hartree",
    parsed: true,
    parserId: "orca-output-cclib+rxnflow-text-full-file",
    parserVersion: "0.2.1",
    objectCount: 1,
    warnings: [],
    coordinatePreview: null,
    candidates: [{
      candidateId: "candidate-1",
      objectIndex: 0,
      label,
      formula: "C2H4",
      charge: null,
      spinMultiplicity: null,
      method: "ORCA single point",
      energyGas: -42.25,
      energySolution: -42.5,
      energyUnit: "hartree",
      coordinatePreview: null,
      roleHint: "final",
      warnings: [],
    }],
    energyTable: { egasHartree: -42.25, gsolHartree: -42.5 },
    parseScope: "full-file",
    confidence: "high",
    terminationStatus: "normal",
    terminationLabel: "normal",
    jobCpuTime: null,
    elapsedTime: null,
  } as const
}

function parsedGaussianSource(label: string) {
  return {
    ...parsedOrcaSource(label),
    sourceKind: "Gaussian",
    method: "wB97X-D",
    parserId: "gaussian-output-cclib+rxnflow-text-full-file",
    candidates: parsedOrcaSource(label).candidates.map((candidate) => ({
      ...candidate,
      method: "wB97X-D",
    })),
  } as const
}

function parsedGaussianStateSource(label: string, spinMultiplicity: number, energyGas: number) {
  const parsed = parsedGaussianSource(label)
  return {
    ...parsed,
    energyGas,
    energySolution: null,
    candidates: parsed.candidates.map((candidate) => ({
      ...candidate,
      spinMultiplicity,
      energyGas,
      energySolution: null,
      energyTable: { egasHartree: energyGas },
    })),
    energyTable: { egasHartree: energyGas },
  } as const
}

function unsupportedSource(label: string, message = "No supported parser recognized this source full-file.") {
  return {
    label,
    sourceKind: "Raw",
    formula: "pending",
    kind: "intermediate",
    method: "unparsed source",
    solvent: "unassigned",
    energyGas: null,
    energySolution: null,
    energyUnit: "kcal/mol",
    parsed: false,
    parserId: null,
    parserVersion: null,
    objectCount: 0,
    warnings: [{
      code: "unsupported_format",
      message,
      target: `${label}.dat`,
    }],
    candidates: [],
    coordinatePreview: null,
    energyTable: null,
    parseScope: "full-file",
    confidence: "high",
    terminationStatus: "unknown",
    terminationLabel: "unknown",
    jobCpuTime: null,
    elapsedTime: null,
  } as const
}

function failedGaussianSource(label: string, code = "parse_failed", message = "The desktop parser could not parse this Gaussian log.") {
  return {
    ...unsupportedSource(label, message),
    sourceKind: "Gaussian",
    method: "unassigned",
    energyUnit: "hartree",
    warnings: [{
      code,
      message,
      target: `${label}.log`,
    }],
  } as const
}

function errorTerminatedGaussianSource(
  label: string,
  code = "calculation_error_termination",
  message = "Calculation output ended with error termination.",
) {
  return {
    ...parsedGaussianSource(label),
    warnings: [{
      code,
      message,
      target: `${label}.log`,
    }],
    terminationStatus: "error",
    terminationLabel: "error",
  } as const
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
    expect(within(toolbar).getByRole("button", { name: "Insert image" })).toBeInTheDocument()
    expect(within(toolbar).getByRole("button", { name: "Pan tool" })).toHaveAttribute("aria-pressed", "true")
    expect(within(toolbar).getByRole("button", { name: "Select tool" })).toHaveAttribute("aria-pressed", "false")
    expect((screen.getByRole("button", { name: "Node TS1 (Endo)" }) as HTMLElement).style.transform).toMatch(/^translate\(/)
    expect((screen.getByLabelText("Graph canvas surface").querySelector(".canvas-world") as HTMLElement).style.transform).toMatch(/^translate\(/)
    expect(document.querySelectorAll('[style*="translate3d"]').length).toBe(0)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start edge from TS1 (Endo)" })).toHaveAttribute("title", "Start edge from TS1 (Endo)")
      expect(screen.getByRole("button", { name: "Reset canvas view" })).toHaveAttribute("title", "Reset canvas view")
    })
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

  it("toggles the project rail and node inspector independently", () => {
    const { container } = render(<App />)
    const workspace = container.querySelector(".workspace") as HTMLElement
    const inspector = container.querySelector(".inspector-panel") as HTMLElement

    expect(workspace).not.toHaveClass("is-left-collapsed")
    expect(workspace).not.toHaveClass("is-right-collapsed")
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeInTheDocument()
    expect(inspector).not.toHaveAttribute("aria-hidden")
    expect(inspector).not.toHaveAttribute("inert")

    fireEvent.click(screen.getByRole("button", { name: "Collapse project sidebar" }))

    expect(workspace).toHaveClass("is-left-collapsed")
    expect(workspace).not.toHaveClass("is-right-collapsed")
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse node sidebar" })).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(screen.getByRole("button", { name: "Expand project sidebar" }))
    fireEvent.click(screen.getByRole("button", { name: "Collapse node sidebar" }))

    expect(workspace).not.toHaveClass("is-left-collapsed")
    expect(workspace).toHaveClass("is-right-collapsed")
    expect(screen.getByRole("complementary", { name: "Project rail" })).toBeInTheDocument()
    expect(screen.queryByRole("complementary", { name: "Inspector" })).not.toBeInTheDocument()
    expect(inspector).toHaveAttribute("aria-hidden", "true")
    expect(inspector).toHaveAttribute("inert")

    fireEvent.click(screen.getByRole("button", { name: "Collapse project sidebar" }))
    expect(workspace).toHaveClass("is-left-collapsed", "is-right-collapsed")

    fireEvent.click(screen.getByRole("button", { name: "Expand node sidebar" }))
    expect(workspace).toHaveClass("is-left-collapsed")
    expect(workspace).not.toHaveClass("is-right-collapsed")
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeInTheDocument()
    expect(inspector).not.toHaveAttribute("aria-hidden")
    expect(inspector).not.toHaveAttribute("inert")
  })

  it("keeps non-desktop bridge workflows out of the active workbench", () => {
    render(<App />)

    const activeText = document.body.textContent ?? ""
    for (const forbidden of ["local-http", "Python bridge", "ShellClient", "cloud", "sync", "Search flows", "Preferences", "Add Node", "Compute", "Profile", "Computer Profile", "Objects", "Object Registry", "Apply correction"]) {
      expect(activeText).not.toMatch(new RegExp(forbidden, "i"))
    }

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    const exportPanel = screen.getByRole("region", { name: "Export panel" })
    for (const format of ["CSV", "SVG", "PDF", "PPTX", "CDX", "JSON"]) {
      expect(within(exportPanel).queryByRole("checkbox", { name: format })).not.toBeInTheDocument()
      expect(within(exportPanel).queryByRole("menuitem", { name: format })).not.toBeInTheDocument()
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
    expect(screen.getByRole("button", { name: fileButtonName("browser-open.log", "Gaussian") })).toBeInTheDocument()
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
    expect(surface).toHaveClass("is-live-pan")
    await waitFor(() => expect(surface).not.toHaveClass("is-live-pan"))
    expect(transformScale(world.style.transform)).toBe(initialScale)

    fireEvent.wheel(surface, { deltaY: -120, clientX: 700, clientY: 400, ctrlKey: true, cancelable: true })

    await waitFor(() => {
      expect(transformScale(world.style.transform)).toBeGreaterThan(initialScale)
    })

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(within(toolbar).getByRole("button", { name: "Table view" }))
    expect(document.querySelector(".table-drawer-shell")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Close table view" }))
    expect(document.querySelector(".table-drawer-shell")).not.toBeInTheDocument()

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

    fireEvent.click(within(toolbar).getByRole("button", { name: "Select tool" }))
    const beforeSelectDrag = world.style.transform
    dispatchPointer(surface, "pointerDown", { button: 0, clientX: 0, clientY: 360, pointerId: 71 })
    dispatchPointer(surface, "pointerMove", { button: 0, clientX: 120, clientY: 520, pointerId: 71 })
    await waitFor(() => expect(container.querySelector(".canvas-rubber-band")).toBeInTheDocument())
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

  it("keeps node drag previews continuous and snaps the persisted position on release", async () => {
    render(<App />)

    const node = screen.getByRole("button", { name: "Node TS1 (Endo)" })
    const start = transformTranslate(node.style.transform)
    const connectedEdge = screen.getByRole("button", { name: "Edge 1,3-Butadiene to TS1 (Endo): Addition + Diene" })
    const connectedPath = connectedEdge.querySelector(".edge-visible-path") as SVGPathElement
    const connectedPathBefore = connectedPath.getAttribute("d")

    dispatchPointer(node, "pointerDown", { button: 0, clientX: 320, clientY: 240, pointerId: 73 })
    dispatchPointer(node, "pointerMove", { button: 0, clientX: 333, clientY: 247, pointerId: 73 })

    let preview = start
    await waitFor(() => {
      preview = transformTranslate(node.style.transform)
      expect(preview.x).not.toBe(start.x)
      expect(preview.y).not.toBe(start.y)
      expect(node.style.transform).toMatch(/^translate\(/)
      expect(node.style.transform).not.toContain("translate3d")
      expect(preview.x % 8).not.toBe(0)
      expect(preview.y % 8).not.toBe(0)
    })
    expect(connectedPath.getAttribute("d")).not.toBe(connectedPathBefore)

    dispatchPointer(node, "pointerUp", { button: 0, clientX: 333, clientY: 247, pointerId: 73 })

    const persisted = transformTranslate(node.style.transform)
    expect(persisted.x % 8).toBeCloseTo(0)
    expect(persisted.y % 8).toBeCloseTo(0)
    expect(persisted).toEqual({
      x: Math.round(preview.x / 8) * 8,
      y: Math.round(preview.y / 8) * 8,
    })
  })

  it("resizes node cards from the bottom-right handle and records undo history", async () => {
    render(<App />)

    const node = screen.getByRole("button", { name: "Node TS1 (Endo)" })
    const handle = screen.getByRole("button", { name: "Resize node TS1 (Endo)" })
    const initialWidth = Number.parseFloat(node.style.width)
    const initialHeight = Number.parseFloat(node.style.height)

    dispatchPointer(handle, "pointerDown", { button: 0, clientX: 420, clientY: 350, pointerId: 99 })
    dispatchPointer(window, "pointerMove", { button: 0, clientX: 492, clientY: 414, pointerId: 99 })
    dispatchPointer(window, "pointerUp", { button: 0, clientX: 492, clientY: 414, pointerId: 99 })

    await waitFor(() => {
      expect(Number.parseFloat(node.style.width)).toBeGreaterThan(initialWidth)
      expect(Number.parseFloat(node.style.height)).toBeGreaterThan(initialHeight)
    })
    expect(Number.parseFloat(node.style.width) % 8).toBe(0)
    expect(Number.parseFloat(node.style.height) % 8).toBe(0)

    fireEvent.click(screen.getByRole("button", { name: "Undo canvas edit" }))

    await waitFor(() => {
      expect(Number.parseFloat(node.style.width)).toBe(initialWidth)
      expect(Number.parseFloat(node.style.height)).toBe(initialHeight)
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

    await waitFor(() => expect(world.style.transform).not.toBe(initialTransform))
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

  it("offers table-backed canvas energy controls and moves unit selection into settings", () => {
    render(<App />)

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    const energySelect = within(toolbar).getByLabelText("Energy")

    expect(within(energySelect).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "ΔEgas",
      "ΔGsol",
    ])
    expect(within(toolbar).queryByLabelText("Unit")).not.toBeInTheDocument()

    const settingsTrigger = screen.getByRole("button", { name: "Settings" })
    fireEvent.click(settingsTrigger)
    const settings = screen.getByRole("dialog", { name: "Settings" })
    const closeSettings = within(settings).getByRole("button", { name: "Close settings" })
    const unitSelect = within(settings).getByRole("combobox", { name: "Energy unit" })
    expect(settings).toHaveAttribute("aria-modal", "true")
    expect(closeSettings).toHaveFocus()
    expect(within(unitSelect).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "kcal",
      "Eh",
      "kJ",
    ])

    fireEvent.keyDown(closeSettings, { key: "Tab", shiftKey: true })
    expect(unitSelect).toHaveFocus()
    fireEvent.keyDown(unitSelect, { key: "Tab" })
    expect(closeSettings).toHaveFocus()

    fireEvent.change(energySelect, { target: { value: "gas" } })
    fireEvent.change(unitSelect, { target: { value: "hartree" } })

    expect(screen.getAllByText("0.000000 Eh").length).toBeGreaterThan(0)
    fireEvent.keyDown(window, { key: "t" })
    expect(fireEvent.keyDown(window, { key: "k", metaKey: true })).toBe(false)
    expect(screen.queryByRole("region", { name: "Energy table" })).not.toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument()

    fireEvent.keyDown(closeSettings, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument()
    expect(settingsTrigger).toHaveFocus()
  })

  it("restores command palette focus and hands it through to settings", () => {
    render(<App />)
    const settingsTrigger = screen.getByRole("button", { name: "Settings" })
    settingsTrigger.focus()

    expect(fireEvent.keyDown(window, { key: "k", metaKey: true })).toBe(false)
    let palette = screen.getByRole("dialog", { name: "Command palette" })
    let search = within(palette).getByRole("searchbox", { name: "Search commands" })
    expect(search).toHaveFocus()
    fireEvent.keyDown(search, { key: "t" })
    expect(screen.queryByRole("region", { name: "Energy table" })).not.toBeInTheDocument()

    expect(fireEvent.keyDown(search, { key: "k", metaKey: true })).toBe(false)
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument()
    expect(settingsTrigger).toHaveFocus()

    expect(fireEvent.keyDown(window, { key: "k", metaKey: true })).toBe(false)
    palette = screen.getByRole("dialog", { name: "Command palette" })
    search = within(palette).getByRole("searchbox", { name: "Search commands" })
    expect(fireEvent.keyDown(search, { key: "Escape" })).toBe(false)
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument()
    expect(settingsTrigger).toHaveFocus()

    expect(fireEvent.keyDown(window, { key: "k", metaKey: true })).toBe(false)
    palette = screen.getByRole("dialog", { name: "Command palette" })
    search = within(palette).getByRole("searchbox", { name: "Search commands" })
    fireEvent.change(search, { target: { value: "Open Settings" } })
    fireEvent.click(within(palette).getByRole("button", { name: /Open Settings/ }))

    const settings = screen.getByRole("dialog", { name: "Settings" })
    const closeSettings = within(settings).getByRole("button", { name: "Close settings" })
    expect(closeSettings).toHaveFocus()
    fireEvent.keyDown(closeSettings, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument()
    expect(settingsTrigger).toHaveFocus()
  })

  it("keeps original workbench routes visible without a backend bridge", () => {
    render(<App />)

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(within(toolbar).getByRole("button", { name: "Table view" }))
    const energyTable = screen.getByRole("region", { name: "Energy table" })
    expect(energyTable).toBeInTheDocument()
    expect(document.querySelector(".app-shell")).toHaveClass("has-overlay-view")
    expect(within(energyTable).getByRole("button", { name: "Relative" })).toHaveAttribute("aria-pressed", "true")
    expect(within(energyTable).getByRole("button", { name: "Absolute" })).toBeInTheDocument()
    expect(within(energyTable).getByText("Charge / Mult.")).toBeInTheDocument()
    expect(within(energyTable).queryByText("Formula")).not.toBeInTheDocument()
    const headerText = Array.from(energyTable.querySelectorAll("th")).map((cell) => cell.textContent?.replace(/\s+/g, "").trim())
    expect(headerText).toContain("ΔEgas(Eh)")
    expect(headerText).toContain("ΔEgas(kcal/mol)")
    expect(headerText.some((header) => header?.startsWith("ΔGgas+1M"))).toBe(true)
    expect(headerText).toContain("ΔGsol(kcal/mol)")
    expect(headerText.join(" ")).not.toContain("627.5095")
    expect(headerText.join(" ").toLowerCase()).not.toContain("shermo")

    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    const exportPanel = screen.getByRole("region", { name: "Export panel" })
    expect(within(exportPanel).getByRole("menuitem", { name: "PNG" })).toBeInTheDocument()
    expect(within(exportPanel).getByRole("menuitem", { name: "XLSX" })).toBeInTheDocument()
    expect(within(exportPanel).getByRole("menuitem", { name: "CDXML" })).toBeInTheDocument()
    expect(within(exportPanel).queryByRole("checkbox", { name: "JSON" })).not.toBeInTheDocument()
    expect(within(exportPanel).queryByRole("checkbox", { name: "CSV" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: fileButtonName("gaussian.log", "Gaussian") }))
    expect(screen.getByRole("region", { name: "Source inspector" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open with external app" })).toBeInTheDocument()
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
    expect(screen.getByRole("button", { name: fileButtonName("gaussian.log", "Gaussian") })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Catalyst Screen empty" }))
    expect(screen.queryByRole("button", { name: "Node TS1 (Endo)" })).not.toBeInTheDocument()
    expect(screen.getByText("No nodes in this project")).toBeInTheDocument()
    expect(screen.getByText("No local files")).toBeInTheDocument()
  })

  it("removes local projects from the sidebar after confirmation", () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Project actions for Diels-Alder Study" }))
    expect(screen.getByRole("menuitem", { name: "Remove from sidebar" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from sidebar" }))
    let dialog = screen.getByRole("alertdialog", { name: "Remove Diels-Alder Study from sidebar" })
    expect(dialog).toHaveTextContent("Diels-Alder Study")
    expect(dialog).toHaveTextContent("Original source files and saved .rxnflow folders on disk are not deleted")
    const cancelButton = within(dialog).getByRole("button", { name: "Cancel" })
    const removeButton = within(dialog).getByRole("button", { name: "Remove from sidebar" })
    expect(cancelButton).toHaveFocus()
    expect(screen.getByRole("button", { name: "Node TS1 (Endo)" })).toBeInTheDocument()

    expect(fireEvent.keyDown(cancelButton, { key: "k", metaKey: true })).toBe(false)
    fireEvent.keyDown(cancelButton, { key: "t" })
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Energy table" })).not.toBeInTheDocument()

    fireEvent.keyDown(cancelButton, { key: "Tab", shiftKey: true })
    expect(removeButton).toHaveFocus()
    fireEvent.keyDown(removeButton, { key: "Tab" })
    expect(cancelButton).toHaveFocus()
    fireEvent.keyDown(cancelButton, { key: "Escape" })
    expect(screen.queryByRole("alertdialog", { name: "Remove Diels-Alder Study from sidebar" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Project actions for Diels-Alder Study" })).toHaveFocus()

    fireEvent.click(screen.getByRole("button", { name: "Project actions for Diels-Alder Study" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from sidebar" }))
    dialog = screen.getByRole("alertdialog", { name: "Remove Diels-Alder Study from sidebar" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove from sidebar" }))

    expect(screen.queryByRole("button", { name: "Diels-Alder Study open" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Nickel catalysis empty" })).toHaveAttribute("aria-current", "true")
    expect(screen.queryByRole("button", { name: "Node TS1 (Endo)" })).not.toBeInTheDocument()
    expect(screen.getByText("No nodes in this project")).toBeInTheDocument()
    expect(screen.getByText("No local files")).toBeInTheDocument()
  })

  it("keeps a desktop project visible when Recent Projects removal fails and allows retry", async () => {
    const forgetProject = vi.fn().mockResolvedValue({ ok: false, error: "recent store unavailable" })
    installDesktopImportRuntime({
      getStartupProjectContent: vi.fn().mockResolvedValue({
        canceled: false,
        projectContents: [
          {
            content: crossProjectAutosavePackage("project-b", "Project B", "B.log", "sources/b.log"),
            filePath: "/tmp/project-b.rxnflow",
            projectDirectory: "/tmp/project-b.rxnflow",
            source: "startup",
            validation: null,
          },
          {
            content: crossProjectAutosavePackage("project-a", "Project A", "A.log", "sources/a.log"),
            filePath: "/tmp/project-a.rxnflow",
            projectDirectory: "/tmp/project-a.rxnflow",
            replaceProjects: false,
            source: "startup",
            validation: null,
          },
        ],
      }),
      forgetProject,
    })

    render(<App />)
    expect(await screen.findByRole("button", { name: "Project A open" })).toHaveAttribute("aria-current", "true")

    vi.useFakeTimers()
    try {
      fireEvent.click(screen.getByRole("button", { name: "Project actions for Project A" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "Remove from sidebar" }))
      fireEvent.click(within(screen.getByRole("alertdialog", { name: "Remove Project A from sidebar" })).getByRole("button", { name: "Remove from sidebar" }))

      expect(screen.getByRole("button", { name: "Project A open" })).toHaveAttribute("aria-current", "true")
      await act(async () => vi.advanceTimersByTimeAsync(500))

      expect(forgetProject).toHaveBeenCalledTimes(3)
      expect(forgetProject).toHaveBeenLastCalledWith({
        projectId: "project-a",
        projectDirectory: "/tmp/project-a.rxnflow",
      })
      expect(screen.getByRole("button", { name: "Project A open" })).toHaveAttribute("aria-current", "true")
      expect(screen.getByRole("alert", { name: "Project validation" })).toHaveTextContent(
        "Project A was not removed because RxnFlow could not update Recent Projects",
      )

      forgetProject.mockResolvedValue({ ok: true, projectDirectory: "/tmp/project-a.rxnflow" })
      fireEvent.click(screen.getByRole("button", { name: "Project actions for Project A" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "Remove from sidebar" }))
      fireEvent.click(within(screen.getByRole("alertdialog", { name: "Remove Project A from sidebar" })).getByRole("button", { name: "Remove from sidebar" }))
      await act(async () => vi.advanceTimersByTimeAsync(0))

      expect(screen.queryByRole("button", { name: "Project A open" })).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Project B open" })).toHaveAttribute("aria-current", "true")
      expect(screen.queryByRole("alert", { name: "Project validation" })).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
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
    expect(screen.getByRole("button", { name: fileButtonName("gaussian.log", "Gaussian") })).toBeInTheDocument()
    expect(screen.queryByText("No local files")).not.toBeInTheDocument()
  })

  it("imports dropped local files into an inactive project row", async () => {
    render(<App />)

    const nickelProjectButton = screen.getByRole("button", { name: "Nickel catalysis empty" })
    const nickelProjectRow = nickelProjectButton.closest(".project-rail-item") as HTMLElement
    const file = new File(["FINAL SINGLE POINT ENERGY -22.5"], "dropped-nickel.out", { type: "text/plain" })
    const dataTransfer = new TestDataTransfer([file])
    const dragOverTransfer = new TestDataTransfer([], { types: ["Files"] })

    fireEvent.dragOver(nickelProjectRow, { dataTransfer: dragOverTransfer })
    expect(dragOverTransfer.dropEffect).toBe("copy")

    await act(async () => {
      fireEvent.drop(nickelProjectRow, { dataTransfer })
      await Promise.resolve()
    })

    expect(await screen.findByRole("button", { name: fileButtonName("dropped-nickel.out", "ORCA") })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Node dropped-nickel" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Nickel catalysis empty" })).toHaveAttribute("aria-current", "true")

    fireEvent.click(screen.getByRole("button", { name: "Diels-Alder Study open" }))
    expect(screen.queryByRole("button", { name: fileButtonName("dropped-nickel.out", "ORCA") })).not.toBeInTheDocument()
  })

  it("imports dropped local files into the active file list without adding canvas nodes", async () => {
    render(<App />)

    const initialNodeCount = document.querySelectorAll(".reaction-node").length
    const rail = screen.getByRole("complementary", { name: "Project rail" })
    const filesSection = within(rail).getByText("Files").closest(".rail-section") as HTMLElement
    const file = new File(["FINAL SINGLE POINT ENERGY -18.75"], "files-drop.out", { type: "text/plain" })
    const dataTransfer = new TestDataTransfer([file])
    const dragOverTransfer = new TestDataTransfer([], { types: ["Files"] })

    fireEvent.dragOver(filesSection, { dataTransfer: dragOverTransfer })
    expect(dragOverTransfer.dropEffect).toBe("copy")

    await act(async () => {
      fireEvent.drop(filesSection, { dataTransfer })
      await Promise.resolve()
    })

    const droppedButton = await within(rail).findByRole("button", { name: fileButtonName("files-drop.out", "ORCA") })
    expect(droppedButton).toBeInTheDocument()
    expect(droppedButton).toHaveAttribute("aria-label", expect.stringContaining("No paired solvation log"))
    expect(screen.queryByRole("button", { name: "Node files-drop" })).not.toBeInTheDocument()
    expect(document.querySelectorAll(".reaction-node")).toHaveLength(initialNodeCount)
    const droppedRow = droppedButton.closest(".project-file-card") as HTMLElement
    const missingBadges = droppedRow.querySelector(".project-file-phase-badges.has-missing-solution") as HTMLElement | null
    expect(missingBadges).toBeInTheDocument()
    expect(missingBadges).toHaveTextContent("")
  })

  it("does not inline file bytes for Electron file-list drops when native paths are unavailable", async () => {
    const importJob = deferred<any>()
    const importSourceFiles = vi.fn(() => importJob.promise)
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles: vi.fn(),
        importSourceFiles,
        filePathForFile: vi.fn(() => ""),
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
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
      },
    })
    render(<App />)

    const rail = screen.getByRole("complementary", { name: "Project rail" })
    const filesSection = within(rail).getByText("Files").closest(".rail-section") as HTMLElement
    const file = new File(["SCF Done: E(RwB97XD) = -201.0"], "rail-path-missing.log", { type: "text/plain" })
    dispatchDrop(filesSection, new TestDataTransfer([file]), 80, 420)

    expect(await within(rail).findByRole("button", { name: fileButtonName("rail-path-missing.log", "Gaussian") })).toBeInTheDocument()
    expect(importSourceFiles).toHaveBeenCalledTimes(1)
    const payload = ((importSourceFiles.mock.calls as any[][])[0]?.[0] ?? {}) as any
    expect(payload.files[0]).toMatchObject({
      name: "rail-path-missing.log",
      preview: "",
    })
    expect(payload.files[0].sourcePath).toBeUndefined()
    expect(payload.files[0].contentBase64).toBeUndefined()

    await act(async () => {
      importJob.resolve({
        ok: true,
        data: {
          files: [{
            id: payload.files[0].id,
            name: "rail-path-missing.log",
            size: file.size,
            preview: "",
            error: {
              code: "source_materialize_failed",
              message: "Could not copy source file because the import payload did not include a readable native file path.",
            },
          }],
        },
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(within(rail).queryByRole("button", { name: fileButtonName("rail-path-missing.log", "Gaussian") })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Node rail-path-missing" })).not.toBeInTheDocument()
      expect(screen.queryByRole("progressbar", { name: "Parsing rail-path-missing.log" })).not.toBeInTheDocument()
    })
    expect(await screen.findByRole("alertdialog", { name: "Import failed" })).toHaveTextContent("rail-path-missing.log")
  })

  it("keeps missing-sol lights after a failed Electron sol drop is rolled back", async () => {
    const pending: Array<{
      payload: any
      resolve: (value: any) => void
    }> = []
    const importSourceFiles = vi.fn((payload: any) => new Promise<any>((resolve) => pending.push({ payload, resolve })))
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles: vi.fn(),
        importSourceFiles,
        filePathForFile: vi.fn((file: File) => `/tmp/${file.name}`),
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
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
      },
    })
    render(<App />)

    const rail = screen.getByRole("complementary", { name: "Project rail" })
    const filesSection = within(rail).getByText("Files").closest(".rail-section") as HTMLElement
    const gasFile = new File(["SCF Done: E(RwB97XD) = -101.0"], "i1p6.log", { type: "text/plain" })
    await act(async () => {
      dispatchDrop(filesSection, new TestDataTransfer([gasFile]), 80, 420)
      await Promise.resolve()
    })

    expect(await within(rail).findByRole("button", { name: fileButtonName("i1p6.log", "Gaussian") })).toBeInTheDocument()
    await waitFor(() => expect(importSourceFiles).toHaveBeenCalledTimes(1))
    const gasJob = pending.shift()
    expect(gasJob).toBeDefined()
    await act(async () => {
      gasJob!.resolve({
        ok: true,
        data: {
          files: [{
            id: gasJob!.payload.files[0].id,
            name: "i1p6.log",
            size: gasFile.size,
            preview: "",
            storedPath: "sources/i1p6.log",
            checksum: `sha256:${"1".repeat(64)}`,
            parse: parsedGaussianSource("i1p6"),
          }],
        },
      })
      await Promise.resolve()
    })

    const gasButton = await within(rail).findByRole("button", { name: fileButtonName("i1p6.log", "Gaussian") })
    expect(gasButton).toHaveAttribute("aria-label", expect.stringContaining("No paired solvation log"))
    const gasRow = gasButton.closest(".project-file-card") as HTMLElement
    expect(gasRow.querySelector(".project-file-phase-badges.has-missing-solution")).toBeInTheDocument()

    const dragData = new TestDataTransfer()
    fireEvent.dragStart(gasRow, { dataTransfer: dragData })
    dispatchDrop(screen.getByLabelText("Graph canvas surface"), dragData, 640, 360)
    const node = await screen.findByRole("button", { name: "Node i1p6" })
    expect(node.querySelector(":scope > .node-status-light-corner.status-light-missing")).toBeInTheDocument()

    const solFile = new File(["bad sol file"], "i1p6-sol.log", { type: "text/plain" })
    await act(async () => {
      dispatchDrop(filesSection, new TestDataTransfer([solFile]), 80, 420)
      await Promise.resolve()
    })
    await waitFor(() => expect(importSourceFiles).toHaveBeenCalledTimes(2))
    const solJob = pending.shift()
    expect(solJob).toBeDefined()
    await act(async () => {
      solJob!.resolve({
        ok: true,
        data: {
          files: [{
            id: solJob!.payload.files[0].id,
            name: "i1p6-sol.log",
            size: solFile.size,
            preview: "",
            storedPath: "sources/i1p6-sol.log",
            checksum: `sha256:${"2".repeat(64)}`,
            parse: errorTerminatedGaussianSource(
              "i1p6-sol",
              "unsupported_format",
              "No supported parser recognized this source full-file.",
            ),
          }],
        },
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(within(rail).queryByRole("button", { name: fileButtonName("i1p6-sol.log", "Gaussian") })).not.toBeInTheDocument()
      expect(within(rail).queryByRole("button", { name: fileButtonName("i1p6-sol.log", "Raw") })).not.toBeInTheDocument()
    })
    const finalGasButton = await within(rail).findByRole("button", { name: fileButtonName("i1p6.log", "Gaussian") })
    expect(finalGasButton).toHaveAttribute("aria-label", expect.stringContaining("No paired solvation log"))
    const finalGasRow = finalGasButton.closest(".project-file-card") as HTMLElement
    expect(finalGasRow.querySelector(".project-file-phase-badges.has-missing-solution")).toBeInTheDocument()
    expect(node.querySelector(":scope > .node-status-light-corner.status-light-missing")).toBeInTheDocument()
    const dialog = await screen.findByRole("alertdialog", { name: "Unsupported import format" })
    expect(dialog).toHaveTextContent("i1p6-sol.log")
    expect(dialog).toHaveTextContent("No supported parser recognized this source full-file.")
  })

  it("clears grouped file progress when a duplicate Electron sol import resolves first", async () => {
    const pending: Array<{
      payload: any
      resolve: (value: any) => void
    }> = []
    const importSourceFiles = vi.fn((payload: any) => new Promise<any>((resolve) => pending.push({ payload, resolve })))
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles: vi.fn(),
        importSourceFiles,
        filePathForFile: vi.fn((file: File) => `/tmp/${file.name}`),
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
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
      },
    })
    render(<App />)

    const rail = screen.getByRole("complementary", { name: "Project rail" })
    const filesSection = within(rail).getByText("Files").closest(".rail-section") as HTMLElement
    const gasFile = new File(["SCF Done: E(RwB97XD) = -101.0"], "7a-1fix-tsf.log", { type: "text/plain" })
    const slowSolFile = new File(["SCF Done: E(RwB97XD) = -102.0"], "7a-1fix-tsf-sol.log", { type: "text/plain" })
    await act(async () => {
      dispatchDrop(filesSection, new TestDataTransfer([gasFile, slowSolFile]), 80, 420)
      await Promise.resolve()
    })

    const groupButton = await within(rail).findByRole("button", { name: fileButtonName("7a-1fix-tsf", "Gaussian") })
    expect(groupButton).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Parsing 7a-1fix-tsf" })).toBeInTheDocument()
    await waitFor(() => expect(importSourceFiles).toHaveBeenCalledTimes(2))
    const gasJob = pending.find((job) => job.payload.files[0].name === "7a-1fix-tsf.log")
    expect(gasJob).toBeDefined()
    await act(async () => {
      gasJob!.resolve({
        ok: true,
        data: {
          files: [{
            id: gasJob!.payload.files[0].id,
            name: "7a-1fix-tsf.log",
            size: gasFile.size,
            preview: "",
            storedPath: "sources/7a-1fix-tsf.log",
            checksum: `sha256:${"1".repeat(64)}`,
            parse: parsedGaussianSource("7a-1fix-tsf"),
          }],
        },
      })
      await Promise.resolve()
    })
    expect(screen.getByRole("progressbar", { name: "Parsing 7a-1fix-tsf" })).toBeInTheDocument()

    const duplicateSolFile = new File(["SCF Done: E(RwB97XD) = -102.1"], "7a-1fix-tsf-sol.log", { type: "text/plain" })
    await act(async () => {
      dispatchDrop(filesSection, new TestDataTransfer([duplicateSolFile]), 80, 420)
      await Promise.resolve()
    })
    await waitFor(() => expect(importSourceFiles).toHaveBeenCalledTimes(3))
    const duplicateSolJob = pending.at(-1)
    expect(duplicateSolJob).toBeDefined()
    expect(duplicateSolJob!.payload.files[0].name).toBe("7a-1fix-tsf-sol.log")
    await act(async () => {
      duplicateSolJob!.resolve({
        ok: true,
        data: {
          files: [{
            id: duplicateSolJob!.payload.files[0].id,
            name: "7a-1fix-tsf-sol.log",
            size: duplicateSolFile.size,
            preview: "",
            storedPath: "sources/7a-1fix-tsf-sol.log",
            checksum: `sha256:${"2".repeat(64)}`,
            parse: parsedGaussianSource("7a-1fix-tsf-sol"),
          }],
        },
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.queryByRole("progressbar", { name: "Parsing 7a-1fix-tsf" })).not.toBeInTheDocument()
    }, { timeout: 3_000 })
    const groupedButton = await within(rail).findByRole("button", { name: fileButtonName("7a-1fix-tsf", "Gaussian") })
    expect(groupedButton.closest(".project-file-card")?.querySelector(".project-file-phase-badges")).not.toBeInTheDocument()
  })

  it("removes unsupported Electron sol placeholders when no gas file exists yet", async () => {
    const importJob = deferred<any>()
    const importSourceFiles = vi.fn(() => importJob.promise)
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles: vi.fn(),
        importSourceFiles,
        filePathForFile: vi.fn((file: File) => `/tmp/${file.name}`),
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
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
      },
    })
    render(<App />)

    const rail = screen.getByRole("complementary", { name: "Project rail" })
    const filesSection = within(rail).getByText("Files").closest(".rail-section") as HTMLElement
    const solFile = new File(["bad sol file"], "i1p6-sol.log", { type: "text/plain" })
    await act(async () => {
      dispatchDrop(filesSection, new TestDataTransfer([solFile]), 80, 420)
      await Promise.resolve()
    })

    expect(await within(rail).findByRole("button", { name: fileButtonName("i1p6-sol.log", "Gaussian") })).toBeInTheDocument()
    const payload = ((importSourceFiles.mock.calls as any[][])[0]?.[0] ?? {}) as any
    await act(async () => {
      importJob.resolve({
        ok: true,
        data: {
          files: [{
            id: payload.files[0].id,
            name: "i1p6-sol.log",
            size: solFile.size,
            preview: "",
            parse: unsupportedSource("i1p6-sol", "No supported parser recognized this source full-file."),
            error: {
              code: "unsupported_format",
              message: "No supported parser recognized this source full-file.",
            },
          }],
        },
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(within(rail).queryByRole("button", { name: fileButtonName("i1p6-sol.log", "Gaussian") })).not.toBeInTheDocument()
      expect(within(rail).queryByRole("button", { name: fileButtonName("i1p6-sol.log", "Raw") })).not.toBeInTheDocument()
    })
    expect(await screen.findByRole("alertdialog", { name: "Unsupported import format" })).toHaveTextContent("i1p6-sol.log")
  })

  it("passes the restored project directory to Electron file-list drop imports", async () => {
    const importJob = deferred<any>()
    const startupPackageContent = JSON.stringify({
      schemaVersion: 1,
      packageKind: "rxnflow-project",
      project: { id: "finder-study", label: "Finder Study", meta: "saved" },
      files: [],
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      savedAt: "2026-06-28T00:00:00.000Z",
    })
    const importSourceFiles = vi.fn(() => importJob.promise)
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles: vi.fn(),
        importSourceFiles,
        filePathForFile: vi.fn(() => "/Users/linsay/Gaussian/finder-drop.log"),
        getStartupProjectContent: vi.fn().mockResolvedValue({
          canceled: false,
          content: startupPackageContent,
          projectDirectory: "/tmp/finder-study.rxnflow",
          replaceProjects: true,
          source: "startup",
          validation: null,
        }),
        getEngineStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            status: "ready",
            engineVersion: "rxnflow-smoke-engine-v1",
            capabilities: ["engine.status", "project.restore", "import.preview"],
          },
        }),
        saveReportArtifact: vi.fn(),
        saveProjectPackage: vi.fn(),
        setActiveProject: vi.fn().mockResolvedValue({ ok: true, projectDirectory: "/tmp/finder-study.rxnflow" }),
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
        onOpenProjectContent: vi.fn(() => vi.fn()),
      },
    })
    render(<App />)

    expect(await screen.findByRole("button", { name: "Finder Study open" })).toHaveAttribute("aria-current", "true")
    const rail = screen.getByRole("complementary", { name: "Project rail" })
    const filesSection = within(rail).getByText("Files").closest(".rail-section") as HTMLElement
    const file = new File(["SCF Done: E(RwB97XD) = -201.0"], "finder-drop.log", { type: "text/plain" })
    dispatchDrop(filesSection, new TestDataTransfer([file]), 80, 420)

    expect(await within(rail).findByRole("button", { name: fileButtonName("finder-drop.log", "Gaussian") })).toBeInTheDocument()
    expect(importSourceFiles).toHaveBeenCalledTimes(1)
    const payload = ((importSourceFiles.mock.calls as any[][])[0]?.[0] ?? {}) as any
    expect(payload.projectId).toBe("finder-study")
    expect(payload.projectDirectory).toBe("/tmp/finder-study.rxnflow")
    expect(payload.files[0]).toMatchObject({
      name: "finder-drop.log",
      preview: "",
      sourcePath: "/Users/linsay/Gaussian/finder-drop.log",
    })
    expect(payload.files[0].contentBase64).toBeUndefined()

    await act(async () => {
      importJob.resolve({
        ok: true,
        data: {
          files: [{
            id: payload.files[0].id,
            name: "finder-drop.log",
            size: file.size,
            preview: "",
            storedPath: "sources/finder-drop.log",
            checksum: `sha256:${"3".repeat(64)}`,
            parse: parsedOrcaSource("finder-drop"),
          }],
        },
      })
      await Promise.resolve()
    })

    expect(await within(rail).findByRole("button", { name: fileButtonName("finder-drop.log", "ORCA") })).toBeInTheDocument()
    expect(screen.queryByRole("progressbar", { name: "Parsing finder-drop.log" })).not.toBeInTheDocument()
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
    const groupedRowButton = await within(rail).findByRole("button", { name: fileButtonName("Bfix6-ts", "Gaussian") })
    expect(groupedRowButton).toBeInTheDocument()
    expect(within(rail).queryByRole("button", { name: fileButtonName("Bfix6-ts.log", "Gaussian") })).not.toBeInTheDocument()
    expect(within(rail).queryByRole("button", { name: fileButtonName("Bfix6-ts-sol.log", "Gaussian") })).not.toBeInTheDocument()

    const row = groupedRowButton.closest(".project-file-card") as HTMLElement
    expect(row).toHaveAttribute("draggable", "false")
    expect(row.querySelector(".project-file-phase-badges")).not.toBeInTheDocument()

    const dataTransfer = new TestDataTransfer()
    fireEvent.pointerDown(row, { button: 0 })
    expect(row).toHaveAttribute("draggable", "true")
    fireEvent.dragStart(row, { dataTransfer })
    const payload = JSON.parse(dataTransfer.getData("application/x-rxnflow-raw-file"))

    expect(payload.kind).toBe("project-files")
    expect(payload.files).toHaveLength(2)
    expect(payload.files.map((file: { path: string }) => file.path)).toEqual([
      expect.stringContaining("Bfix6-ts.log"),
      expect.stringContaining("Bfix6-ts-sol.log"),
    ])
    fireEvent.dragEnd(row, { dataTransfer })
    expect(row).toHaveAttribute("draggable", "false")
  })

  it("drags all source files from Shift-selected structure rows", async () => {
    render(<App />)

    const input = screen.getByLabelText("Import calculation files")
    const files = [
      new File(["SCF Done: E(RwB97XD) = -101.0"], "Batch-a.log", { type: "text/plain" }),
      new File(["SCF Done: E(RwB97XD) = -101.2"], "Batch-a_sol.log", { type: "text/plain" }),
      new File(["SCF Done: E(RwB97XD) = -102.0"], "Batch-b.log", { type: "text/plain" }),
      new File(["SCF Done: E(RwB97XD) = -102.2"], "Batch-b_sol.log", { type: "text/plain" }),
    ]
    await act(async () => {
      fireEvent.change(input, { target: { files } })
      await Promise.resolve()
    })

    const rail = screen.getByRole("complementary", { name: "Project rail" })
    const firstButton = await within(rail).findByRole("button", { name: fileButtonName("Batch-a", "Gaussian") })
    const secondButton = await within(rail).findByRole("button", { name: fileButtonName("Batch-b", "Gaussian") })
    fireEvent.click(firstButton)
    fireEvent.click(secondButton, { shiftKey: true })

    const firstRow = firstButton.closest(".project-file-card") as HTMLElement
    const secondRow = secondButton.closest(".project-file-card") as HTMLElement
    expect(firstRow).toHaveClass("project-file-card--selected")
    expect(secondRow).toHaveClass("project-file-card--selected")

    const dataTransfer = new TestDataTransfer()
    fireEvent.dragStart(secondRow, { dataTransfer })
    const payload = JSON.parse(dataTransfer.getData("application/x-rxnflow-raw-file"))

    expect(payload.kind).toBe("project-files")
    expect(payload.files).toHaveLength(4)
    expect(payload.files.map((file: { path: string }) => file.path)).toEqual(expect.arrayContaining([
      expect.stringContaining("Batch-a.log"),
      expect.stringContaining("Batch-a_sol.log"),
      expect.stringContaining("Batch-b.log"),
      expect.stringContaining("Batch-b_sol.log"),
    ]))
  })

  it("keeps failed browser-preview solution logs grouped but unavailable for solvation pairing", async () => {
    render(<App />)

    const input = screen.getByLabelText("Import calculation files")
    const gasLog = new File(["SCF Done: E(RwB97XD) = -101.0\nSMD"], "i1p6.log", { type: "text/plain" })
    const solutionLog = new File(["solvent output without enough parser markers"], "i1p6-sol.log", { type: "text/plain" })

    await act(async () => {
      fireEvent.change(input, { target: { files: [gasLog] } })
      await Promise.resolve()
    })

    const rail = screen.getByRole("complementary", { name: "Project rail" })
    const gasButton = await within(rail).findByRole("button", { name: fileButtonName("i1p6.log", "Gaussian") })
    const gasRow = gasButton.closest(".project-file-card") as HTMLElement
    const dataTransfer = new TestDataTransfer()
    fireEvent.dragStart(gasRow, { dataTransfer })
    dispatchDrop(screen.getByLabelText("Graph canvas surface"), dataTransfer, 640, 360)
    const node = await screen.findByRole("button", { name: "Node i1p6" })
    expect(node.querySelector(":scope > .node-status-light-corner.status-light-missing")).toBeInTheDocument()

    await act(async () => {
      fireEvent.change(input, { target: { files: [solutionLog] } })
      await Promise.resolve()
    })

    const groupedRowButton = await within(rail).findByRole("button", { name: fileButtonName("i1p6", "Gaussian") })
    expect(groupedRowButton).toBeInTheDocument()
    expect(groupedRowButton).toHaveAttribute("aria-label", expect.stringContaining("No supported parser recognized this source preview."))
    const groupedRow = groupedRowButton.closest(".project-file-card") as HTMLElement
    expect(groupedRow.querySelector(".project-file-phase-badges.has-parse-error")).toBeInTheDocument()
    expect(within(rail).queryByRole("button", { name: fileButtonName("i1p6.log", "Gaussian") })).not.toBeInTheDocument()
    expect(within(rail).queryByRole("button", { name: fileButtonName("i1p6-sol.log", "Raw") })).not.toBeInTheDocument()
    expect(node.querySelector(":scope > .node-status-light-corner.status-light-missing")).toBeInTheDocument()
    dispatchPointer(node, "pointerDown", { button: 0, clientX: 640, clientY: 360, pointerId: 84 })
    dispatchPointer(node, "pointerUp", { button: 0, clientX: 640, clientY: 360, pointerId: 84 })
    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    const solventField = await within(inspector).findByText("Solvent").then((label) => label.closest("div"))
    expect(solventField).toHaveTextContent("implicit solvent")
    expect(solventField).not.toHaveTextContent("unassigned")
  })

  it("shows a missing gas indicator for solution logs and clears it after the gas log arrives", async () => {
    render(<App />)

    const input = screen.getByLabelText("Import calculation files")
    const solutionLog = new File(["SCF Done: E(RwB97XD) = -102.0"], "i1p6-sol.log", { type: "text/plain" })
    const gasLog = new File(["SCF Done: E(RwB97XD) = -101.0"], "i1p6.log", { type: "text/plain" })

    await act(async () => {
      fireEvent.change(input, { target: { files: [solutionLog] } })
      await Promise.resolve()
    })

    const rail = screen.getByRole("complementary", { name: "Project rail" })
    const solutionButton = await within(rail).findByRole("button", { name: fileButtonName("i1p6-sol.log", "Gaussian") })
    expect(solutionButton).toHaveAttribute("aria-label", expect.stringContaining("No paired gas log"))
    const solutionRow = solutionButton.closest(".project-file-card") as HTMLElement
    expect(solutionRow.querySelector(".project-file-phase-badges.has-missing-gas")).toBeInTheDocument()

    await act(async () => {
      fireEvent.change(input, { target: { files: [gasLog] } })
      await Promise.resolve()
    })

    const groupedButton = await within(rail).findByRole("button", { name: fileButtonName("i1p6", "Gaussian") })
    const groupedRow = groupedButton.closest(".project-file-card") as HTMLElement
    expect(groupedRow.querySelector(".project-file-phase-badges.has-missing-gas")).not.toBeInTheDocument()
  })

  it("keeps object registry correction out of the main UI while preserving structure preview", () => {
    render(<App />)

    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    expect(inspector.querySelector(".inspector-rail-header")).not.toBeInTheDocument()
    expect(inspector.querySelector(".panel-tabs")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Objects" })).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Object registry" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Apply correction" })).not.toBeInTheDocument()

    const openStructure = screen.getByRole("button", { name: "Open 3D Structure" })
    openStructure.focus()
    fireEvent.click(openStructure)
    const dialog = screen.getByRole("dialog", { name: "3D Structure" })
    expect(within(dialog).getByRole("button", { name: "Close 3D Structure" })).toHaveFocus()
    expect(document.querySelector(".app-shell")).toHaveClass("has-overlay-view")
    expect(dialog).toHaveTextContent("TS1 (Endo)")
    expect(fireEvent.keyDown(window, { key: "k", ctrlKey: true })).toBe(false)
    fireEvent.keyDown(window, { key: "t" })
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Energy table" })).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "Close 3D Structure" }))
    expect(screen.queryByRole("dialog", { name: "3D Structure" })).not.toBeInTheDocument()
    expect(openStructure).toHaveFocus()
  })

  it("preserves the original structure opener through the 3D to 2D handoff", async () => {
    render(<App />)

    const openStructure = screen.getByRole("button", { name: "Open 3D Structure" })
    openStructure.focus()
    fireEvent.click(openStructure)

    const previewDialog = screen.getByRole("dialog", { name: "3D Structure" })
    fireEvent.click(within(previewDialog).getByRole("button", { name: "Edit 2D structure for TS1 (Endo)" }))

    const editorDialog = await screen.findByRole("dialog", { name: "Edit 2D structure for TS1 (Endo)" })
    const cancelButton = within(editorDialog).getByRole("button", { name: "Cancel" })
    expect(cancelButton).toHaveFocus()
    expect(screen.queryByRole("dialog", { name: "3D Structure" })).not.toBeInTheDocument()
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1)

    expect(fireEvent.keyDown(cancelButton, { key: "Escape" })).toBe(false)
    expect(screen.queryByRole("dialog", { name: "Edit 2D structure for TS1 (Endo)" })).not.toBeInTheDocument()
    expect(openStructure).toHaveFocus()
  })

  it("sets the relative energy zero point from a canvas node", () => {
    render(<App />)

    const tsNode = screen.getByRole("button", { name: "Node TS1 (Endo)" })
    fireEvent.contextMenu(tsNode, { clientX: 680, clientY: 240 })
    fireEvent.click(screen.getByRole("menuitem", { name: "Set zero" }))

    expect(within(tsNode).queryByText("0")).not.toBeInTheDocument()
    expect(within(tsNode).getByText("0.00")).toBeInTheDocument()
    expect(within(tsNode).queryByText("0.00 kcal/mol")).not.toBeInTheDocument()
  })

  it("keeps node structure previews expanded without a collapse control", () => {
    render(<App />)

    const tsNode = screen.getByRole("button", { name: "Node TS1 (Endo)" })
    expect(within(tsNode).getByRole("group", { name: "TS1 (Endo) formula-only structure preview" })).toBeInTheDocument()
    expect(within(tsNode).queryByRole("button", { name: "Collapse structure preview for TS1 (Endo)" })).not.toBeInTheDocument()
    expect(within(tsNode).queryByRole("button", { name: "Show structure preview for TS1 (Endo)" })).not.toBeInTheDocument()
  })

  it("opens source details from the node context menu", () => {
    render(<App />)

    const tsNode = screen.getByRole("button", { name: "Node TS1 (Endo)" })
    fireEvent.contextMenu(tsNode, { clientX: 680, clientY: 240 })
    fireEvent.click(screen.getByRole("menuitem", { name: "Source details" }))

    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    expect(screen.getByRole("region", { name: "Source inspector" })).toHaveTextContent("gaussian.log")
    expect(screen.getByRole("button", { name: "Open with external app" })).toBeInTheDocument()
  })

  it("keeps reaction path semantics out of canvas context menus", () => {
    render(<App />)

    const productNode = screen.getByRole("button", { name: "Node Endo Adduct" })
    fireEvent.contextMenu(productNode, { clientX: 840, clientY: 320 })
    expect(screen.queryByRole("menuitem", { name: "Mark as path state" })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Mark as participant" })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Mark as transition state" })).not.toBeInTheDocument()
    expect(productNode).not.toHaveClass("node-participant")

    const edge = screen.getByRole("button", { name: "Edge TS1 (Endo) to Endo Adduct: -18.53" })
    fireEvent.contextMenu(edge, { clientX: 720, clientY: 320 })
    expect(screen.queryByRole("menuitem", { name: "Step role: path" })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Step role: branch" })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Step role: addition" })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Step role: release" })).not.toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument()
  })

  it("creates a reaction edge from node handles without showing edge editors in the inspector", () => {
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
    expect(within(inspector).queryByText("Selected Edge")).not.toBeInTheDocument()
    expect(within(inspector).getByRole("region", { name: "Source inspector" })).toHaveTextContent("gaussian.log")
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

  it("drags from a middle output to a release connector to mark a released side species", () => {
    const { container } = render(<App />)

    const startHandle = screen.getByRole("button", { name: "Start edge from TS1 (Endo)" })
    const targetNode = screen.getByRole("button", { name: "Node Exo Adduct" })
    const releaseHandle = screen.getByRole("button", { name: "Finish release edge at Exo Adduct" })

    dispatchPointer(startHandle, "pointerDown", { button: 0, clientX: 610, clientY: 320, pointerId: 83 })
    expect(container.querySelector(".connection-preview-path")).toBeInTheDocument()

    dispatchPointer(releaseHandle, "pointerUp", { button: 0, clientX: 1040, clientY: 540, pointerId: 83 })

    expect(screen.getByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct: Release path/ })).toBeInTheDocument()
    expect(targetNode).toHaveClass("node-participant")
    expect(targetNode).not.toHaveTextContent("PART")
    expect(container.querySelector(".edge-role-release")).toBeInTheDocument()
    expect(container.querySelector(".connection-preview-path")).not.toBeInTheDocument()
  })

  it("drags from an addition connector to a middle input", () => {
    const { container } = render(<App />)

    const sourceNode = screen.getByRole("button", { name: "Node Maleic Anhydride" })
    const additionHandle = screen.getByRole("button", { name: "Start addition edge from Maleic Anhydride" })
    const targetNode = screen.getByRole("button", { name: "Node Exo Adduct" })

    dispatchPointer(additionHandle, "pointerDown", { button: 0, clientX: 410, clientY: 280, pointerId: 84 })
    expect(container.querySelector(".connection-preview-path.is-addition")).toBeInTheDocument()

    dispatchPointer(targetNode, "pointerUp", { button: 0, clientX: 850, clientY: 580, pointerId: 84 })

    expect(screen.getByRole("button", { name: /Edge Maleic Anhydride to Exo Adduct: Addition path/ })).toBeInTheDocument()
    expect(sourceNode).toHaveClass("node-participant")
    expect(container.querySelector(".edge-role-addition")).toBeInTheDocument()
    expect(container.querySelector(".connection-preview-path")).not.toBeInTheDocument()
  })

  it("creates a reaction edge with keyboard-accessible node handles", () => {
    render(<App />)

    const startHandle = screen.getByRole("button", { name: "Start edge from TS1 (Endo)" })
    fireEvent.keyDown(startHandle, { key: "Enter" })
    expect(startHandle).toHaveAttribute("aria-pressed", "true")

    fireEvent.keyDown(screen.getByRole("button", { name: "Node Exo Adduct" }), { key: "Enter" })

    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    expect(within(inspector).queryByText("Selected Edge")).not.toBeInTheDocument()
    expect(within(inspector).getByRole("region", { name: "Source inspector" })).toHaveTextContent("gaussian.log")
    expect(screen.getAllByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct/ })).toHaveLength(1)
  })

  it("edits edge labels inline and tracks the change in canvas history", () => {
    render(<App />)

    const startHandle = screen.getByRole("button", { name: "Start edge from TS1 (Endo)" })
    fireEvent.keyDown(startHandle, { key: "Enter" })
    fireEvent.keyDown(screen.getByRole("button", { name: "Node Exo Adduct" }), { key: "Enter" })

    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    expect(within(inspector).queryByRole("form", { name: "Edit edge label" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Add path label from TS1 (Endo) to Exo Adduct" }))
    const edgeLabelInput = screen.getByRole("textbox", { name: "Path label" })
    fireEvent.change(edgeLabelInput, { target: { value: "Delta G 4.20" } })
    fireEvent.keyDown(edgeLabelInput, { key: "Enter" })

    expect(within(inspector).queryByText("Selected Edge")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct: Delta G 4\.20/ })).toBeInTheDocument()

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(within(toolbar).getByRole("button", { name: "Undo canvas edit" }))
    expect(screen.getByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct: path/ })).toBeInTheDocument()

    fireEvent.click(within(toolbar).getByRole("button", { name: "Redo canvas edit" }))
    expect(screen.getByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct: Delta G 4\.20/ })).toBeInTheDocument()
  })

  it("opens path label editing from the capsule without selecting the curve", () => {
    render(<App />)

    const edgeCurve = screen.getByRole("button", { name: "Edge 1,3-Butadiene to TS1 (Endo): Addition + Diene" })
    const edgeLabel = screen.getByRole("button", { name: "Edit path label + Diene" })

    fireEvent.pointerDown(edgeLabel, { button: 0, pointerId: 11 })

    expect(screen.queryByRole("textbox", { name: "Path label" })).not.toBeInTheDocument()
    expect(edgeCurve).not.toHaveClass("is-selected")
    fireEvent.click(edgeLabel)

    expect(screen.getByRole("textbox", { name: "Path label" })).toHaveValue("+ Diene")
    expect(edgeCurve).not.toHaveClass("is-selected")
    expect(screen.getByRole("complementary", { name: "Inspector" })).toHaveTextContent("TS1 (Endo)")
  })

  it("edits node stoichiometric coefficients from the context menu and hides the default value", () => {
    render(<App />)

    const node = screen.getByRole("button", { name: "Node TS1 (Endo)" })
    expect(node).not.toHaveTextContent("1x")
    fireEvent.contextMenu(node, { clientX: 500, clientY: 320 })
    const coefficientInput = screen.getByLabelText("Node coefficient")
    fireEvent.change(coefficientInput, { target: { value: "2" } })
    fireEvent.blur(coefficientInput)

    expect(node).toHaveTextContent("2x")

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    fireEvent.click(within(toolbar).getByRole("button", { name: "Undo canvas edit" }))
    expect(node).not.toHaveTextContent("1x")
    expect(node).not.toHaveTextContent("2x")

    fireEvent.click(within(toolbar).getByRole("button", { name: "Redo canvas edit" }))
    expect(node).toHaveTextContent("2x")
  })

  it("marks explicit barrier annotations between two nodes and deletes the selection", () => {
    const { container } = render(<App />)

    const targetNode = screen.getByRole("button", { name: "Node TS1 (Endo)" })
    const restoreElementsFromPoint = mockElementsFromPoint([targetNode])
    try {
      const handle = screen.getByRole("button", { name: "Drag barrier annotation from Endo Adduct" })
      fireEvent.pointerDown(handle, { button: 0, clientX: 650, clientY: 170, pointerId: 21 })
      fireEvent.pointerMove(handle, { button: 0, clientX: 700, clientY: 360, pointerId: 21 })
      fireEvent.pointerUp(handle, { button: 0, clientX: 700, clientY: 360, pointerId: 21 })
    } finally {
      restoreElementsFromPoint()
    }

    expect(container.querySelector(".barrier-arrow")).toBeInTheDocument()
    expect(container.querySelector(".barrier-guide")).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "Barrier annotation from Endo Adduct to TS1 (Endo): ΔG‡ 32.05",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edit barrier label from Endo Adduct to TS1 (Endo)" })).toHaveTextContent("ΔG‡ 32.05")

    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    expect(within(inspector).queryByText("Selected Barrier")).not.toBeInTheDocument()
    expect(within(inspector).getByRole("region", { name: "Source inspector" })).toHaveTextContent("gaussian.log")

    const barrier = screen.getByRole("button", { name: "Barrier annotation from Endo Adduct to TS1 (Endo): ΔG‡ 32.05" })
    fireEvent.contextMenu(barrier, { clientX: 620, clientY: 320 })
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }))

    expect(screen.queryByRole("button", { name: "Edit barrier label from Endo Adduct to TS1 (Endo)" })).not.toBeInTheDocument()
    expect(container.querySelector(".barrier-arrow")).not.toBeInTheDocument()
  })

  it("adds canvas image annotations from the toolbar picker and pasted image files", async () => {
    const restoreImage = mockImageNaturalSize()
    try {
      render(<App />)

      const imageInput = screen.getByLabelText("Insert image file") as HTMLInputElement
      const picked = new File(["picked"], "scheme.png", { type: "image/png" })
      await act(async () => {
        fireEvent.change(imageInput, { target: { files: [picked] } })
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(await screen.findByAltText("scheme.png")).toBeInTheDocument()

      const pasted = new File(["pasted"], "clipboard.png", { type: "image/png" })
      const pasteEvent = createEvent.paste(window)
      Object.defineProperty(pasteEvent, "clipboardData", {
        value: {
          files: [pasted],
          items: [],
          types: ["Files"],
        },
      })
      await act(async () => {
        fireEvent(window, pasteEvent)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(await screen.findByAltText("clipboard.png")).toBeInTheDocument()
    } finally {
      restoreImage()
    }
  })

  it("updates explicit barrier annotation labels when energy source changes", () => {
    render(<App />)

    const targetNode = screen.getByRole("button", { name: "Node TS1 (Endo)" })
    const restoreElementsFromPoint = mockElementsFromPoint([targetNode])
    try {
      const handle = screen.getByRole("button", { name: "Drag barrier annotation from Endo Adduct" })
      fireEvent.pointerDown(handle, { button: 0, clientX: 650, clientY: 170, pointerId: 22 })
      fireEvent.pointerMove(handle, { button: 0, clientX: 700, clientY: 360, pointerId: 22 })
      fireEvent.pointerUp(handle, { button: 0, clientX: 700, clientY: 360, pointerId: 22 })
    } finally {
      restoreElementsFromPoint()
    }

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    expect(screen.getByRole("button", { name: "Edit barrier label from Endo Adduct to TS1 (Endo)" })).toHaveTextContent("ΔG‡ 32.05")

    fireEvent.change(within(toolbar).getByRole("combobox", { name: "Energy" }), { target: { value: "gas" } })

    expect(screen.getByRole("button", { name: "Edit barrier label from Endo Adduct to TS1 (Endo)" })).toHaveTextContent("ΔE‡ 29.29")
    expect(
      screen.getByRole("button", {
        name: "Barrier annotation from Endo Adduct to TS1 (Endo): ΔE‡ 29.29",
      }),
    ).toBeInTheDocument()
  })

  it("supports undo, redo, delete selection, auto layout, and fit view canvas commands", () => {
    render(<App />)

    const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
    const undo = within(toolbar).getByRole("button", { name: "Undo canvas edit" })
    const redo = within(toolbar).getByRole("button", { name: "Redo canvas edit" })

    expect(undo).toBeDisabled()
    expect(redo).toBeDisabled()
    expect(within(toolbar).queryByRole("button", { name: "Delete selection" })).not.toBeInTheDocument()

    const startHandle = screen.getByRole("button", { name: "Start edge from TS1 (Endo)" })
    fireEvent.keyDown(startHandle, { key: "Enter" })
    fireEvent.keyDown(screen.getByRole("button", { name: "Node Exo Adduct" }), { key: "Enter" })
    expect(screen.getAllByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct/ })).toHaveLength(1)
    expect(undo).toBeEnabled()

    fireEvent.click(undo)
    expect(screen.queryByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct/ })).not.toBeInTheDocument()
    expect(redo).toBeEnabled()

    fireEvent.click(redo)
    const createdEdge = screen.getAllByRole("button", { name: /Edge TS1 \(Endo\) to Exo Adduct/ })[0]
    expect(createdEdge).toBeInTheDocument()

    fireEvent.contextMenu(createdEdge, { clientX: 720, clientY: 360 })
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }))
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
    fireEvent.click(screen.getByRole("button", { name: "Reset canvas view" }))
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
    fireEvent.contextMenu(butadiene, { clientX: 300, clientY: 300 })
    fireEvent.keyDown(screen.getByLabelText("Node coefficient"), { key: "ArrowRight" })
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
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
      await Promise.resolve()
    })

    const sourceButton = await screen.findByRole("button", { name: fileButtonName("orca-water.out", "ORCA") })
    expect(sourceButton).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Node orca-water" })).not.toBeInTheDocument()
    fireEvent.click(sourceButton)
    expect(screen.getByRole("region", { name: "Source inspector" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open with external app" })).toBeInTheDocument()

    const sourceRow = sourceButton.closest(".project-file-card") as HTMLElement
    const dataTransfer = new TestDataTransfer()
    fireEvent.dragStart(sourceRow, { dataTransfer })
    dispatchDrop(screen.getByLabelText("Graph canvas surface"), dataTransfer, 640, 360)
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
    expect(dialog).not.toHaveTextContent("H, O")
    expect(dialog).not.toHaveTextContent("orca-water.out")
    expect(within(dialog).queryByRole("button", { name: "Open 3D structure fullscreen" })).not.toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Play vibration" })).toBeInTheDocument()
  })

  it("selects and drags project file rows while deleting source files from the file context menu", () => {
    render(<App />)

    const initialNodeCount = document.querySelectorAll(".reaction-node").length
    const gaussianButton = screen.getByRole("button", { name: fileButtonName("gaussian.log", "Gaussian") })
    const orcaButton = screen.getByRole("button", { name: fileButtonName("orca.out", "ORCA") })
    const mapleButton = screen.getByRole("button", { name: fileButtonName("maple-path.out", "MAPLE") })
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
    expect(screen.queryByRole("button", { name: "More actions for orca.out" })).not.toBeInTheDocument()

    fireEvent.contextMenu(screen.getByRole("button", { name: "Node Maleic Anhydride" }), { clientX: 420, clientY: 520 })
    expect(screen.queryByRole("menuitem", { name: "Delete file and nodes" })).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: "Escape" })

    fireEvent.click(orcaButton)
    expect(orcaRow).toHaveClass("project-file-card--selected")
    fireEvent.contextMenu(orcaRow, { clientX: 240, clientY: 360 })
    expect(screen.getByRole("menu", { name: "File actions for orca.out" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete file and nodes" }))
    expect(screen.queryByRole("button", { name: fileButtonName("orca.out", "ORCA") })).not.toBeInTheDocument()
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
    expect(document.activeElement).toBe(surface)

    await waitFor(() => {
      const node = Array.from(container.querySelectorAll(".reaction-node[data-flow-node-id]"))
        .find((element) => {
          const nodeId = element.getAttribute("data-flow-node-id")
          return nodeId?.startsWith("imported-orca-out-") && nodeId.includes("-drop-")
        }) as HTMLElement | undefined
      expect(node).toBeDefined()
      expect(node?.style.transform).toContain(`translate(${expectedX}px, ${expectedY}px)`)
    })
  })

  it("reparses project gas and solution files before a canvas drop", async () => {
    const oldChecksum = `sha256:${"1".repeat(64)}`
    const gasChecksum = `sha256:${"2".repeat(64)}`
    const newSolutionChecksum = `sha256:${"3".repeat(64)}`
    const gasParse = parsedGaussianStateSource("Ni-ts", 1, -100)
    const oldTripletSolutionParse = parsedGaussianStateSource("Ni-ts-sol", 3, -100.2)
    const newSingletSolutionParse = parsedGaussianStateSource("Ni-ts-sol", 1, -100.4)
    const projectPackage = {
      schemaVersion: 1,
      packageKind: "rxnflow-project",
      project: { id: "ni-project", label: "Ni", meta: "saved" },
      files: [
        {
          id: "ni-gas",
          name: "Ni-ts.log",
          kind: "Gaussian",
          size: 100,
          status: "parsed",
          preview: "old gas preview",
          storedPath: "sources/Ni-ts.log",
          sourcePath: "/external/old/Ni-ts.log",
          checksum: gasChecksum,
          parseChecksum: gasChecksum,
          parse: gasParse,
        },
        {
          id: "ni-sol",
          name: "Ni-ts_sol.log",
          kind: "Gaussian",
          size: 120,
          status: "parsed",
          preview: "old triplet solution preview",
          storedPath: "sources/Ni-ts_sol.log",
          sourcePath: "/external/old/Ni-ts_sol.log",
          checksum: oldChecksum,
          parseChecksum: oldChecksum,
          parse: oldTripletSolutionParse,
        },
      ],
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      savedAt: "2026-08-05T00:00:00.000Z",
    }
    const inspectProjectSourceFiles = vi.fn(async () => ({
      ok: true,
      data: {
        files: [
          { id: "ni-gas", storedPath: "sources/Ni-ts.log", size: 100, checksum: gasChecksum },
          { id: "ni-sol", storedPath: "sources/Ni-ts_sol.log", size: 140, checksum: newSolutionChecksum },
        ],
      },
    }))
    const parseSourcePreview = vi.fn(async (payload: { storedPath?: string }) => ({
      ok: true,
      data: payload.storedPath === "sources/Ni-ts_sol.log"
        ? {
            parse: newSingletSolutionParse,
            size: 140,
            checksum: newSolutionChecksum,
            parseChecksum: newSolutionChecksum,
          }
        : {
            parse: gasParse,
            size: 100,
            checksum: gasChecksum,
            parseChecksum: gasChecksum,
          },
    }))
    const openSourceFile = vi.fn().mockResolvedValue({ ok: true })
    const autosaveProjectPackage = vi.fn(async (payload: { content: string }) => ({
      canceled: false,
      projectDirectory: "/Users/linsay/Documents/chemistry/Ni",
      content: payload.content,
      validation: null,
    }))
    installDesktopImportRuntime({
      getStartupProjectContent: vi.fn().mockResolvedValue({
        canceled: false,
        content: JSON.stringify(projectPackage),
        filePath: "/Users/linsay/Documents/chemistry/Ni/.rxnflow/project.json",
        projectDirectory: "/Users/linsay/Documents/chemistry/Ni",
        replaceProjects: true,
        source: "startup",
        validation: null,
      }),
      inspectProjectSourceFiles,
      parseSourcePreview,
      openSourceFile,
      autosaveProjectPackage,
    })

    const { container } = render(<App />)

    const groupedSourceButton = await screen.findByRole("button", { name: fileButtonName("Ni-ts", "Gaussian") })
    await waitFor(() => {
      expect(parseSourcePreview).toHaveBeenCalledWith(expect.objectContaining({
        projectId: "ni-project",
        storedPath: "sources/Ni-ts_sol.log",
      }))
    })

    const dataTransfer = new TestDataTransfer()
    const groupedSourceRow = groupedSourceButton.closest(".project-file-card") as HTMLElement
    fireEvent.pointerDown(groupedSourceRow, { button: 0 })
    fireEvent.dragStart(groupedSourceRow, { dataTransfer })
    dispatchDrop(screen.getByLabelText("Graph canvas surface"), dataTransfer, 640, 360)

    const importedNode = await screen.findByRole("button", { name: "Node Ni-ts" })
    fireEvent.click(importedNode)
    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    expect(within(inspector).getByText("Free energy").closest("div")).toHaveTextContent("-100.400000 Eh")
    const sourceInspector = within(inspector).getByRole("region", { name: "Source inspector" })
    expect(sourceInspector).toHaveTextContent("Ni-ts.log")
    expect(sourceInspector).toHaveTextContent("Ni-ts_sol.log")
    fireEvent.click(within(sourceInspector).getByRole("button", { name: "Open sol source with external app" }))
    expect(openSourceFile).toHaveBeenLastCalledWith(expect.objectContaining({
      projectId: "ni-project",
      storedPath: "sources/Ni-ts_sol.log",
    }))

    await waitFor(() => expect(autosaveProjectPackage).toHaveBeenCalled(), { timeout: 2500 })
    const savedPackages = autosaveProjectPackage.mock.calls.map(([payload]) => JSON.parse(payload.content))
    const savedNode = savedPackages
      .flatMap((savedPackage) => savedPackage.canvases?.flatMap((canvas: { nodes?: unknown[] }) => canvas.nodes ?? []) ?? savedPackage.nodes ?? [])
      .find((node: { label?: string }) => node.label === "Ni-ts")
    expect(savedNode).toMatchObject({
      energyGas: -100,
      energySolution: -100.4,
      spinMultiplicity: 1,
      sourceFileId: "ni-gas",
    })
    expect(container.querySelectorAll(".reaction-node[data-flow-node-id]")).toHaveLength(1)
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

    expect(await screen.findByRole("button", { name: fileButtonName("canvas-drop.out", "ORCA") })).toBeInTheDocument()
    await waitFor(() => {
      const node = Array.from(container.querySelectorAll(".reaction-node[data-flow-node-id]"))
        .find((element) => element.getAttribute("data-flow-node-id")?.startsWith("imported-file-") && element.getAttribute("data-flow-node-id")?.includes("-drop-")) as HTMLElement | undefined
      expect(node).toBeDefined()
      expect(node?.style.transform).toContain(`translate(${expectedX}px, ${expectedY}px)`)
      expect(node?.querySelector(".status-light-node.status-light-missing")).toBeInTheDocument()
      expect(node?.querySelector(":scope > .node-status-light-corner.status-light-missing")).toBeInTheDocument()
      expect(node?.querySelector(".node-card-meta-row .status-light-node")).not.toBeInTheDocument()
      expect(node?.querySelector(".node-header-main .node-coefficient-control-header")).not.toBeInTheDocument()
      expect(node?.querySelector(".node-card-meta-row .node-coefficient-control-meta")).not.toBeInTheDocument()
      expect(node?.querySelector(".node-card-meta-row")?.textContent).toMatch(/ΔG/)
      expect(node?.querySelector(".node-card-meta-row")?.textContent).not.toMatch(/INT|TS|PART/)
      expect(node?.querySelector(".node-card-meta-row")?.textContent).not.toContain("×1")
    })
  })

  it("drops external images onto the canvas at graph-space position without importing source files", async () => {
    const restoreImage = mockImageNaturalSize(120, 80)
    try {
      const { container } = render(<App />)

      const surface = screen.getByLabelText("Graph canvas surface")
      mockSurfaceRect(surface)
      const world = container.querySelector(".canvas-world") as HTMLElement
      const scale = transformScale(world.style.transform)
      const translate = transformTranslate(world.style.transform)
      const clientX = 580
      const clientY = 420
      const expectedX = Math.round((clientX - translate.x) / scale) - 60
      const expectedY = Math.round((clientY - translate.y) / scale) - 40
      const image = new File(["image-bytes"], "scheme-drop.png", { type: "image/png" })
      const dataTransfer = new TestDataTransfer([image])

      fireEvent.dragOver(surface, { dataTransfer })
      expect(dataTransfer.dropEffect).toBe("copy")

      await act(async () => {
        dispatchDrop(surface, dataTransfer, clientX, clientY)
        await Promise.resolve()
        await Promise.resolve()
      })

      const annotationImage = await screen.findByAltText("scheme-drop.png")
      const annotation = annotationImage.closest(".canvas-image-annotation") as HTMLElement
      expect(annotation?.style.transform).toContain(`translate(${expectedX}px, ${expectedY}px)`)
      expect(screen.queryByRole("button", { name: "scheme-drop.png Raw" })).not.toBeInTheDocument()

      dispatchPointer(annotation, "pointerDown", { clientX: clientX, clientY: clientY, pointerId: 91 })
      dispatchPointer(annotation, "pointerMove", { clientX: clientX + 40, clientY: clientY + 20, pointerId: 91 })
      dispatchPointer(annotation, "pointerUp", { clientX: clientX + 40, clientY: clientY + 20, pointerId: 91 })

      expect(annotation.style.transform).toContain(`translate(${expectedX + 40 / scale}px, ${expectedY + 20 / scale}px)`)

      fireEvent.contextMenu(annotation, { clientX: 620, clientY: 460 })
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }))
      expect(screen.queryByAltText("scheme-drop.png")).not.toBeInTheDocument()
    } finally {
      restoreImage()
    }
  })

  it("contains and queues multi-candidate review before registering nodes", async () => {
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
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
      await Promise.resolve()
    })

    const sourceButton = await screen.findByRole("button", { name: fileButtonName("path.xyz", "MAPLE") })
    expect(sourceButton).toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: "Import candidates" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Node Frame 1" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Node Frame 2" })).not.toBeInTheDocument()

    fireEvent.click(sourceButton)
    const reviewTrigger = screen.getByRole("button", { name: "Review candidates" })
    reviewTrigger.focus()
    fireEvent.click(reviewTrigger)

    let reopenedDialog = await screen.findByRole("dialog", { name: "Import candidates" })
    const closeCandidates = within(reopenedDialog).getByRole("button", { name: "Close import candidates" })
    expect(closeCandidates).toHaveFocus()
    expect(fireEvent.keyDown(closeCandidates, { key: "Escape" })).toBe(false)
    expect(screen.queryByRole("dialog", { name: "Import candidates" })).not.toBeInTheDocument()
    expect(reviewTrigger).toHaveFocus()

    const settingsTrigger = screen.getByRole("button", { name: "Settings" })
    fireEvent.click(settingsTrigger)
    const settings = screen.getByRole("dialog", { name: "Settings" })
    fireEvent.click(reviewTrigger)
    expect(screen.queryByRole("dialog", { name: "Import candidates" })).not.toBeInTheDocument()
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1)

    fireEvent.keyDown(within(settings).getByRole("button", { name: "Close settings" }), { key: "Escape" })
    reopenedDialog = await screen.findByRole("dialog", { name: "Import candidates" })
    const queuedCloseCandidates = within(reopenedDialog).getByRole("button", { name: "Close import candidates" })
    expect(queuedCloseCandidates).toHaveFocus()
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1)
    fireEvent.keyDown(queuedCloseCandidates, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Import candidates" })).not.toBeInTheDocument()
    expect(settingsTrigger).toHaveFocus()

    fireEvent.click(reviewTrigger)
    reopenedDialog = await screen.findByRole("dialog", { name: "Import candidates" })
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

    fireEvent.click(screen.getByRole("button", { name: "Import files" }))

    expect(await screen.findByRole("button", { name: fileButtonName("native-path.xyz", "XYZ") })).toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: "Import candidates" })).not.toBeInTheDocument()
    expect(registerImportCandidates).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: fileButtonName("native-path.xyz", "XYZ") }))
    fireEvent.click(screen.getByRole("button", { name: "Review candidates" }))
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

  it("batches same-frame sidebar parse completions while preserving file order and latest selection", async () => {
    const pending: PendingDesktopImportJob[] = []
    const chooseFiles = vi.fn().mockResolvedValue({
      canceled: false,
      files: [
        { name: "frame-first.log", size: 101, preview: "", sourcePath: "/tmp/frame-first.log" },
        { name: "frame-second.log", size: 102, preview: "", sourcePath: "/tmp/frame-second.log" },
      ],
    })
    const importSourceFiles = vi.fn((payload: any) => new Promise<any>((resolve) => pending.push({ payload, resolve })))
    installDesktopImportRuntime({ chooseFiles, importSourceFiles })
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 71)
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined)

    try {
      render(<App />)
      requestFrame.mockClear()
      cancelFrame.mockClear()
      fireEvent.click(screen.getByRole("button", { name: "Import files" }))

      await waitFor(() => expect(importSourceFiles).toHaveBeenCalledTimes(2))
      expect(screen.getByRole("progressbar", { name: "Parsing frame-first.log" })).toBeInTheDocument()
      expect(screen.getByRole("progressbar", { name: "Parsing frame-second.log" })).toBeInTheDocument()

      await act(async () => {
        pending[1].resolve(desktopImportResponse(pending[1], {
          name: "frame-second.log",
          size: 102,
          storedPath: "sources/frame-second.log",
          checksum: `sha256:${"2".repeat(64)}`,
          parse: parsedGaussianSource("frame-second"),
        }))
        await Promise.resolve()
        pending[0].resolve(desktopImportResponse(pending[0], {
          name: "frame-first.log",
          size: 101,
          storedPath: "sources/frame-first.log",
          checksum: `sha256:${"1".repeat(64)}`,
          parse: parsedGaussianSource("frame-first"),
        }))
        await Promise.resolve()
        await Promise.resolve()
      })

      const rail = screen.getByRole("complementary", { name: "Project rail" })
      const firstButton = await within(rail).findByRole("button", { name: fileButtonName("frame-first.log", "Gaussian") })
      const secondButton = await within(rail).findByRole("button", { name: fileButtonName("frame-second.log", "Gaussian") })
      await waitFor(() => {
        expect(screen.queryByRole("progressbar", { name: "Parsing frame-first.log" })).not.toBeInTheDocument()
        expect(screen.queryByRole("progressbar", { name: "Parsing frame-second.log" })).not.toBeInTheDocument()
      })
      expect(requestFrame).toHaveBeenCalledTimes(1)
      expect(cancelFrame).toHaveBeenCalledWith(71)
      const importedButtons = within(rail).getAllByRole("button").filter((button) => (
        /frame-(?:first|second)\.log/.test(button.textContent ?? "")
      ))
      expect(importedButtons.map((button) => button.textContent?.trim())).toEqual(["frame-first.log", "frame-second.log"])
      expect(firstButton).toHaveAttribute("aria-pressed", "true")
      expect(secondButton).toHaveAttribute("aria-pressed", "false")
    } finally {
      requestFrame.mockRestore()
      cancelFrame.mockRestore()
    }
  })

  it("flushes queued sidebar successes before rolling back a failed parse result", async () => {
    const pending: PendingDesktopImportJob[] = []
    const chooseFiles = vi.fn().mockResolvedValue({
      canceled: false,
      files: [
        { name: "batch-good.log", size: 111, preview: "", sourcePath: "/tmp/batch-good.log" },
        { name: "batch-bad.dat", size: 112, preview: "", sourcePath: "/tmp/batch-bad.dat" },
      ],
    })
    const importSourceFiles = vi.fn((payload: any) => new Promise<any>((resolve) => pending.push({ payload, resolve })))
    installDesktopImportRuntime({ chooseFiles, importSourceFiles })
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 79)
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined)

    try {
      render(<App />)
      fireEvent.click(screen.getByRole("button", { name: "Import files" }))
      await waitFor(() => expect(importSourceFiles).toHaveBeenCalledTimes(2))

      await act(async () => {
        pending[0].resolve(desktopImportResponse(pending[0], {
          name: "batch-good.log",
          size: 111,
          storedPath: "sources/batch-good.log",
          checksum: `sha256:${"4".repeat(64)}`,
          parse: parsedGaussianSource("batch-good"),
        }))
        await Promise.resolve()
        pending[1].resolve(desktopImportResponse(pending[1], {
          name: "batch-bad.dat",
          size: 112,
          parse: unsupportedSource("batch-bad"),
          error: {
            code: "unsupported_format",
            message: "No supported parser recognized this source full-file.",
          },
        }))
        await Promise.resolve()
        await Promise.resolve()
      })

      const rail = screen.getByRole("complementary", { name: "Project rail" })
      expect(await within(rail).findByRole("button", { name: fileButtonName("batch-good.log", "Gaussian") })).toBeInTheDocument()
      await waitFor(() => {
        expect(within(rail).queryByRole("button", { name: "batch-bad.dat Raw" })).not.toBeInTheDocument()
        expect(screen.queryByRole("progressbar", { name: "Parsing batch-good.log" })).not.toBeInTheDocument()
        expect(screen.queryByRole("progressbar", { name: "Parsing batch-bad.dat" })).not.toBeInTheDocument()
      })
      expect(await screen.findByRole("alertdialog", { name: "Unsupported import format" })).toHaveTextContent("batch-bad.dat")
    } finally {
      requestFrame.mockRestore()
      cancelFrame.mockRestore()
    }
  })

  it("cancels a queued sidebar import frame when the app unmounts", async () => {
    const pending: PendingDesktopImportJob[] = []
    const chooseFiles = vi.fn().mockResolvedValue({
      canceled: false,
      files: [
        { name: "unmount-first.log", size: 121, preview: "", sourcePath: "/tmp/unmount-first.log" },
        { name: "unmount-second.log", size: 122, preview: "", sourcePath: "/tmp/unmount-second.log" },
      ],
    })
    const importSourceFiles = vi.fn((payload: any) => new Promise<any>((resolve) => pending.push({ payload, resolve })))
    installDesktopImportRuntime({ chooseFiles, importSourceFiles })
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 83)
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined)

    try {
      const { unmount } = render(<App />)
      fireEvent.click(screen.getByRole("button", { name: "Import files" }))
      await waitFor(() => expect(importSourceFiles).toHaveBeenCalledTimes(2))

      await act(async () => {
        pending[0].resolve(desktopImportResponse(pending[0], {
          name: "unmount-first.log",
          size: 121,
          storedPath: "sources/unmount-first.log",
          checksum: `sha256:${"5".repeat(64)}`,
          parse: parsedGaussianSource("unmount-first"),
        }))
        await Promise.resolve()
        await Promise.resolve()
      })
      await waitFor(() => expect(requestFrame).toHaveBeenCalled())

      unmount()
      expect(cancelFrame).toHaveBeenCalledWith(83)

      pending[1].resolve(desktopImportResponse(pending[1], {
        name: "unmount-second.log",
        size: 122,
        storedPath: "sources/unmount-second.log",
        checksum: `sha256:${"6".repeat(64)}`,
        parse: parsedGaussianSource("unmount-second"),
      }))
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
    } finally {
      requestFrame.mockRestore()
      cancelFrame.mockRestore()
    }
  })

  it("stages Electron dialog imports before the desktop parser job resolves", async () => {
    const importJob = deferred<any>()
    const chooseFiles = vi.fn().mockResolvedValue({
      canceled: false,
      files: [{
        name: "desktop.calc",
        size: 1234,
        preview: "",
        sourcePath: "/tmp/desktop.calc",
      }],
    })
    const importSourceFiles = vi.fn(() => importJob.promise)
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles,
        importSourceFiles,
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
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
      },
    })

    render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Import files" }))

    expect(await screen.findByRole("button", { name: fileButtonName("desktop.calc", "Raw") })).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Parsing desktop.calc" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Node desktop" })).not.toBeInTheDocument()
    expect(importSourceFiles).toHaveBeenCalledTimes(1)
    const payload = ((importSourceFiles.mock.calls as any[][])[0]?.[0] ?? {}) as any
    expect(payload).toMatchObject({
      projectId: "diels-alder",
      files: [expect.objectContaining({
        name: "desktop.calc",
        preview: "",
        sourcePath: "/tmp/desktop.calc",
      })],
    })

    await act(async () => {
      importJob.resolve({
        ok: true,
        data: {
          files: [{
            id: payload.files[0].id,
            name: "desktop.calc",
            size: 1234,
            preview: "",
            storedPath: "sources/desktop.calc",
            checksum: `sha256:${"b".repeat(64)}`,
            parse: parsedOrcaSource("engine-preview"),
          }],
        },
      })
      await Promise.resolve()
    })

    expect(await screen.findByRole("button", { name: fileButtonName("desktop.calc", "ORCA") })).toBeInTheDocument()
    expect(screen.queryByRole("progressbar", { name: "Parsing desktop.calc" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: fileButtonName("desktop.calc", "ORCA") }))
    expect(screen.getByRole("complementary", { name: "Inspector" })).toHaveTextContent("engine-preview")
  })

  it("keeps parsed desktop imports when a stale autosave response returns later", async () => {
    const importJob = deferred<any>()
    const autosaveJob = deferred<void>()
    const chooseFiles = vi.fn().mockResolvedValue({
      canceled: false,
      files: [{
        name: "race.log",
        size: 1234,
        preview: "",
        sourcePath: "/tmp/race.log",
      }],
    })
    const importSourceFiles = vi.fn(() => importJob.promise)
    const autosaveProjectPackage = vi.fn((payload: { content: string }) => {
      const projectPackage = JSON.parse(payload.content)
      projectPackage.files = projectPackage.files.map((file: Record<string, unknown>) => {
        const { sourcePath: _sourcePath, ...rest } = file
        return {
          ...rest,
          storedPath: "sources/race.log",
          checksum: `sha256:${"7".repeat(64)}`,
        }
      })
      const staleContent = JSON.stringify(projectPackage)
      return autosaveJob.promise.then(() => ({
        canceled: false,
        projectDirectory: "/tmp/race-project",
        content: staleContent,
        validation: null,
      }))
    })
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles,
        importSourceFiles,
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
    fireEvent.click(screen.getByRole("button", { name: "Import files" }))

    expect(await screen.findByRole("button", { name: fileButtonName("race.log", "Gaussian") })).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Parsing race.log" })).toBeInTheDocument()
    await waitFor(() => expect(autosaveProjectPackage).toHaveBeenCalled(), { timeout: 2500 })
    expect(JSON.parse(autosaveProjectPackage.mock.calls[0][0].content).files[0].parse.warnings[0].code).toBe("parse_deferred")

    const payload = ((importSourceFiles.mock.calls as any[][])[0]?.[0] ?? {}) as any
    await act(async () => {
      importJob.resolve({
        ok: true,
        data: {
          files: [{
            id: payload.files[0].id,
            name: "race.log",
            size: 1234,
            preview: "",
            storedPath: "sources/race.log",
            checksum: `sha256:${"8".repeat(64)}`,
            parse: parsedOrcaSource("race"),
          }],
        },
      })
      await Promise.resolve()
    })

    expect(await screen.findByRole("button", { name: fileButtonName("race.log", "ORCA") })).toBeInTheDocument()
    expect(screen.queryByRole("progressbar", { name: "Parsing race.log" })).not.toBeInTheDocument()

    await act(async () => {
      autosaveJob.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(await screen.findByRole("button", { name: fileButtonName("race.log", "ORCA") })).toBeInTheDocument()
    expect(screen.queryByRole("progressbar", { name: "Parsing race.log" })).not.toBeInTheDocument()
  })

  it("routes delayed autosave metadata back to the project that started the request", async () => {
    const projectAAutosave = deferred<void>()
    const backgroundAutosave = new Promise<never>(() => {})
    const openSourceFile = vi.fn().mockResolvedValue({ ok: true })
    const autosaveProjectPackage = vi.fn((payload: { content: string }) => {
      const projectPackage = JSON.parse(payload.content)
      if (projectPackage.project.id !== "project-a") return backgroundAutosave
      projectPackage.files = projectPackage.files.map((file: Record<string, unknown>) => ({
        ...file,
        size: 512,
        storedPath: "sources/a-autosaved.log",
        checksum: `sha256:${"a".repeat(64)}`,
      }))
      return projectAAutosave.promise.then(() => ({
        canceled: false,
        projectDirectory: "/tmp/project-a.rxnflow",
        content: JSON.stringify(projectPackage),
        validation: {
          valid: false,
          summary: { projectId: "project-a" },
          issues: [{
            severity: "error" as const,
            code: "project_a_validation",
            message: "Project A autosave validation must stay with Project A.",
          }],
        },
      }))
    })
    installDesktopImportRuntime({
      getStartupProjectContent: vi.fn().mockResolvedValue({
        canceled: false,
        projectContents: [
          {
            content: crossProjectAutosavePackage("project-a", "Project A", "A.log", "sources/a-original.log"),
            filePath: "/tmp/project-a.rxnflow",
            projectDirectory: "/tmp/project-a.rxnflow",
            source: "startup",
            validation: null,
          },
          {
            content: crossProjectAutosavePackage("project-b", "Project B", "B.log", "sources/b-original.log"),
            filePath: "/tmp/project-b.rxnflow",
            projectDirectory: "/tmp/project-b.rxnflow",
            replaceProjects: false,
            source: "startup",
            validation: null,
          },
        ],
      }),
      autosaveProjectPackage,
      openSourceFile,
    })

    render(<App />)

    expect(await screen.findByRole("button", { name: "Project B open" })).toHaveAttribute("aria-current", "true")
    fireEvent.click(screen.getByRole("button", { name: "Project A open" }))
    await waitFor(() => {
      expect(autosaveProjectPackage.mock.calls.some(([payload]) => (
        JSON.parse(payload.content).project.id === "project-a"
      ))).toBe(true)
    }, { timeout: 2500 })

    fireEvent.click(screen.getByRole("button", { name: "Project B open" }))
    expect(screen.getByRole("button", { name: "Project B open" })).toHaveAttribute("aria-current", "true")
    await act(async () => {
      projectAAutosave.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    fireEvent.click(screen.getByRole("button", { name: fileButtonName("B.log", "Gaussian") }))
    fireEvent.click(screen.getByRole("button", { name: "Open with external app" }))
    expect(openSourceFile).toHaveBeenLastCalledWith(expect.objectContaining({
      projectId: "project-b",
      name: "B.log",
      storedPath: "sources/b-original.log",
    }))
    expect(screen.queryByRole("alert", { name: "Project validation" })).not.toBeInTheDocument()
    expect(screen.queryByText("Project A autosave validation must stay with Project A.")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Project A open" }))
    fireEvent.click(screen.getByRole("button", { name: fileButtonName("A.log", "Gaussian") }))
    fireEvent.click(screen.getByRole("button", { name: "Open with external app" }))
    expect(openSourceFile).toHaveBeenLastCalledWith(expect.objectContaining({
      projectId: "project-a",
      name: "A.log",
      storedPath: "sources/a-autosaved.log",
    }))
  })

  it("keeps a delayed autosave failure out of the newly active project and allows retry", async () => {
    const projectAAutosave = deferred<never>()
    const pendingAutosave = new Promise<never>(() => {})
    let projectAAutosaveCalls = 0
    const autosaveProjectPackage = vi.fn((payload: { content: string }) => {
      const projectPackage = JSON.parse(payload.content)
      if (projectPackage.project.id !== "project-a") return pendingAutosave
      projectAAutosaveCalls += 1
      return projectAAutosaveCalls === 1 ? projectAAutosave.promise : pendingAutosave
    })
    installDesktopImportRuntime({
      getStartupProjectContent: vi.fn().mockResolvedValue({
        canceled: false,
        projectContents: [
          {
            content: crossProjectAutosavePackage("project-a", "Project A", "A.log", "sources/a-original.log"),
            filePath: "/tmp/project-a.rxnflow",
            projectDirectory: "/tmp/project-a.rxnflow",
            source: "startup",
            validation: null,
          },
          {
            content: crossProjectAutosavePackage("project-b", "Project B", "B.log", "sources/b-original.log"),
            filePath: "/tmp/project-b.rxnflow",
            projectDirectory: "/tmp/project-b.rxnflow",
            replaceProjects: false,
            source: "startup",
            validation: null,
          },
        ],
      }),
      autosaveProjectPackage,
    })

    render(<App />)

    expect(await screen.findByRole("button", { name: "Project B open" })).toHaveAttribute("aria-current", "true")
    fireEvent.click(screen.getByRole("button", { name: "Project A open" }))
    await waitFor(() => expect(projectAAutosaveCalls).toBe(1), { timeout: 2500 })

    fireEvent.click(screen.getByRole("button", { name: "Project B open" }))
    await act(async () => {
      projectAAutosave.reject(new Error("Project A disk failure"))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByRole("button", { name: "Project B open" })).toHaveAttribute("aria-current", "true")
    expect(screen.queryByRole("alert", { name: "Project validation" })).not.toBeInTheDocument()
    expect(screen.queryByText(/Project autosave failed: Project A disk failure/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Project A open" }))
    await waitFor(() => expect(projectAAutosaveCalls).toBe(2), { timeout: 2500 })
  })

  it("preserves each project in the autosave queue while another project is saving", async () => {
    const jobs = new Map([
      ["project-a", deferred<any>()],
      ["project-b", deferred<any>()],
      ["project-c", deferred<any>()],
    ])
    const contents = new Map<string, string>()
    const callOrder: string[] = []
    const projectBPackage = JSON.parse(crossProjectAutosavePackage("project-b", "Project B", "B.log", "sources/b.log"))
    projectBPackage.nodes = [{
      id: "project-b-node",
      label: "Project B node",
      formula: "H2",
      kind: "intermediate",
      method: "B3LYP",
      solvent: "gas",
      energyGas: -1,
      energyUnit: "hartree",
      sourceStatus: "parsed",
      sourceFileId: "shared-file",
      position: { x: 40, y: 60 },
    }]
    const projectCPackage = JSON.parse(crossProjectAutosavePackage("project-c", "Project C", "C.log", "sources/c.log"))
    projectCPackage.nodes = [{
      id: "project-c-node",
      label: "Project C node",
      formula: "H2",
      kind: "intermediate",
      method: "B3LYP",
      solvent: "gas",
      energyGas: -1,
      energyUnit: "hartree",
      sourceStatus: "parsed",
      sourceFileId: "shared-file",
      position: { x: 40, y: 60 },
    }]
    const autosaveProjectPackage = vi.fn((payload: { content: string }) => {
      const projectId = JSON.parse(payload.content).project.id as string
      callOrder.push(projectId)
      contents.set(projectId, payload.content)
      return jobs.get(projectId)?.promise ?? Promise.reject(new Error(`Unexpected project ${projectId}`))
    })
    installDesktopImportRuntime({
      getStartupProjectContent: vi.fn().mockResolvedValue({
        canceled: false,
        projectContents: [
          {
            content: crossProjectAutosavePackage("project-a", "Project A", "A.log", "sources/a.log"),
            filePath: "/tmp/project-a.rxnflow",
            projectDirectory: "/tmp/project-a.rxnflow",
            source: "startup",
            validation: null,
          },
          {
            content: JSON.stringify(projectBPackage),
            filePath: "/tmp/project-b.rxnflow",
            projectDirectory: "/tmp/project-b.rxnflow",
            replaceProjects: false,
            source: "startup",
            validation: null,
          },
          {
            content: JSON.stringify(projectCPackage),
            filePath: "/tmp/project-c.rxnflow",
            projectDirectory: "/tmp/project-c.rxnflow",
            replaceProjects: false,
            source: "startup",
            validation: null,
          },
        ],
      }),
      autosaveProjectPackage,
    })

    render(<App />)
    expect(await screen.findByRole("button", { name: "Project C open" })).toHaveAttribute("aria-current", "true")

    vi.useFakeTimers()
    try {
      fireEvent.click(screen.getByRole("button", { name: "Project A open" }))
      await act(async () => vi.advanceTimersByTimeAsync(901))
      expect(callOrder).toEqual(["project-a"])

      fireEvent.click(screen.getByRole("button", { name: "Project B open" }))
      await act(async () => vi.advanceTimersByTimeAsync(901))
      expect(callOrder).toEqual(["project-a"])
      fireEvent.contextMenu(screen.getByRole("button", { name: "Node Project B node" }), { clientX: 500, clientY: 320 })
      fireEvent.change(screen.getByLabelText("Node coefficient"), { target: { value: "2" } })
      fireEvent.blur(screen.getByLabelText("Node coefficient"))

      fireEvent.click(screen.getByRole("button", { name: "Project C open" }))
      fireEvent.contextMenu(screen.getByRole("button", { name: "Node Project C node" }), { clientX: 500, clientY: 320 })
      fireEvent.change(screen.getByLabelText("Node coefficient"), { target: { value: "2" } })
      fireEvent.blur(screen.getByLabelText("Node coefficient"))
      await act(async () => vi.advanceTimersByTimeAsync(901))
      expect(callOrder).toEqual(["project-a"])

      await act(async () => {
        jobs.get("project-a")?.resolve({
          canceled: false,
          projectDirectory: "/tmp/project-a.rxnflow",
          content: contents.get("project-a"),
          validation: null,
        })
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(callOrder).toEqual(["project-a", "project-b"])
      const savedProjectB = JSON.parse(contents.get("project-b") ?? "{}")
      const savedProjectBNode = savedProjectB.canvases?.flatMap((canvas: { nodes?: Array<{ id: string; coefficient?: number }> }) => canvas.nodes ?? [])
        .find((node: { id: string }) => node.id === "project-b-node")
      expect(savedProjectBNode?.coefficient).toBe(2)

      await act(async () => {
        jobs.get("project-b")?.resolve({
          canceled: false,
          projectDirectory: "/tmp/project-b.rxnflow",
          content: contents.get("project-b"),
          validation: null,
        })
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(callOrder).toEqual(["project-a", "project-b", "project-c"])

      await act(async () => {
        jobs.get("project-c")?.resolve({
          canceled: false,
          projectDirectory: "/tmp/project-c.rxnflow",
          content: contents.get("project-c"),
          validation: null,
        })
        await vi.advanceTimersByTimeAsync(0)
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("cancels a queued autosave when undo returns to the in-flight project state", async () => {
    const autosaveJob = deferred<any>()
    const autosaveProjectPackage = vi.fn((_payload: { content: string }) => autosaveJob.promise)
    const projectPackage = JSON.parse(crossProjectAutosavePackage("project-a", "Project A", "A.log", "sources/a.log"))
    projectPackage.nodes = [{
      id: "project-a-node",
      label: "Project A node",
      formula: "H2",
      kind: "intermediate",
      method: "B3LYP",
      solvent: "gas",
      energyGas: -1,
      energyUnit: "hartree",
      sourceStatus: "parsed",
      sourceFileId: "shared-file",
      position: { x: 40, y: 60 },
    }]
    installDesktopImportRuntime({
      getStartupProjectContent: vi.fn().mockResolvedValue({
        canceled: false,
        projectContents: [{
          content: JSON.stringify(projectPackage),
          filePath: "/tmp/project-a.rxnflow",
          projectDirectory: "/tmp/project-a.rxnflow",
          source: "startup",
          validation: null,
        }],
      }),
      autosaveProjectPackage,
    })

    render(<App />)
    expect(await screen.findByRole("button", { name: "Project A open" })).toHaveAttribute("aria-current", "true")

    vi.useFakeTimers()
    try {
      fireEvent.contextMenu(screen.getByRole("button", { name: "Node Project A node" }), { clientX: 500, clientY: 320 })
      fireEvent.change(screen.getByLabelText("Node coefficient"), { target: { value: "2" } })
      fireEvent.blur(screen.getByLabelText("Node coefficient"))
      await act(async () => vi.advanceTimersByTimeAsync(901))
      expect(autosaveProjectPackage).toHaveBeenCalledTimes(1)

      fireEvent.contextMenu(screen.getByRole("button", { name: "Node Project A node" }), { clientX: 500, clientY: 320 })
      fireEvent.change(screen.getByLabelText("Node coefficient"), { target: { value: "3" } })
      fireEvent.blur(screen.getByLabelText("Node coefficient"))
      await act(async () => vi.advanceTimersByTimeAsync(901))
      expect(autosaveProjectPackage).toHaveBeenCalledTimes(1)

      const toolbar = screen.getByRole("toolbar", { name: "Canvas commands" })
      fireEvent.click(within(toolbar).getByRole("button", { name: "Undo canvas edit" }))
      await act(async () => vi.advanceTimersByTimeAsync(901))

      await act(async () => {
        autosaveJob.resolve({
          canceled: false,
          projectDirectory: "/tmp/project-a.rxnflow",
          content: autosaveProjectPackage.mock.calls[0][0].content,
          validation: null,
        })
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(autosaveProjectPackage).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("ignores an in-flight autosave after its project is deleted", async () => {
    const autosaveJob = deferred<any>()
    const forgetProject = vi.fn().mockResolvedValue({ ok: true, projectDirectory: "/tmp/project-a.rxnflow" })
    const autosaveProjectPackage = vi.fn((payload: { content: string }) => {
      const projectId = JSON.parse(payload.content).project.id
      if (projectId === "project-a") return autosaveJob.promise
      return Promise.resolve({
        canceled: false,
        projectDirectory: "/tmp/project-b.rxnflow",
        content: payload.content,
        validation: null,
      })
    })
    const projectAPackage = JSON.parse(crossProjectAutosavePackage("project-a", "Project A", "A.log", "sources/a.log"))
    projectAPackage.nodes = [{
      id: "project-a-node",
      label: "Project A node",
      formula: "H2",
      kind: "intermediate",
      method: "B3LYP",
      solvent: "gas",
      energyGas: -1,
      energyUnit: "hartree",
      sourceStatus: "parsed",
      sourceFileId: "shared-file",
      position: { x: 40, y: 60 },
    }]
    installDesktopImportRuntime({
      getStartupProjectContent: vi.fn().mockResolvedValue({
        canceled: false,
        projectContents: [
          {
            content: crossProjectAutosavePackage("project-b", "Project B", "B.log", "sources/b.log"),
            filePath: "/tmp/project-b.rxnflow",
            projectDirectory: "/tmp/project-b.rxnflow",
            source: "startup",
            validation: null,
          },
          {
            content: JSON.stringify(projectAPackage),
            filePath: "/tmp/project-a.rxnflow",
            projectDirectory: "/tmp/project-a.rxnflow",
            replaceProjects: false,
            source: "startup",
            validation: null,
          },
        ],
      }),
      autosaveProjectPackage,
      forgetProject,
    })

    render(<App />)
    expect(await screen.findByRole("button", { name: "Project A open" })).toHaveAttribute("aria-current", "true")

    vi.useFakeTimers()
    try {
      fireEvent.contextMenu(screen.getByRole("button", { name: "Node Project A node" }), { clientX: 500, clientY: 320 })
      fireEvent.change(screen.getByLabelText("Node coefficient"), { target: { value: "2" } })
      fireEvent.blur(screen.getByLabelText("Node coefficient"))
      await act(async () => vi.advanceTimersByTimeAsync(901))
      expect(autosaveProjectPackage).toHaveBeenCalledTimes(1)

      fireEvent.click(screen.getByRole("button", { name: "Project actions for Project A" }))
      fireEvent.click(screen.getByRole("menuitem", { name: "Remove from sidebar" }))
      const dialog = screen.getByRole("alertdialog", { name: "Remove Project A from sidebar" })
      fireEvent.click(within(dialog).getByRole("button", { name: "Remove from sidebar" }))
      await act(async () => vi.advanceTimersByTimeAsync(901))

      expect(forgetProject).toHaveBeenCalledWith({
        projectId: "project-a",
        projectDirectory: "/tmp/project-a.rxnflow",
      })
      expect(screen.queryByRole("button", { name: "Project A open" })).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Project B open" })).toHaveAttribute("aria-current", "true")
      expect(autosaveProjectPackage).toHaveBeenCalledTimes(1)

      const savedContent = JSON.parse(autosaveProjectPackage.mock.calls[0][0].content)
      savedContent.files[0].storedPath = "sources/a-late.log"
      await act(async () => {
        autosaveJob.resolve({
          canceled: false,
          projectDirectory: "/tmp/project-a.rxnflow",
          content: JSON.stringify(savedContent),
          validation: {
            valid: false,
            summary: { projectId: "project-a" },
            issues: [{
              severity: "error",
              code: "deleted_project_autosave",
              message: "Deleted Project A autosave must be ignored.",
            }],
          },
        })
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(screen.queryByRole("button", { name: "Project A open" })).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Project B open" })).toHaveAttribute("aria-current", "true")
      expect(screen.queryByText("Deleted Project A autosave must be ignored.")).not.toBeInTheDocument()
      expect(autosaveProjectPackage.mock.calls.filter(([payload]) => (
        JSON.parse(payload.content).project.id === "project-a"
      ))).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("rolls back Electron import placeholders when a parser job returns without parse data", async () => {
    const importJob = deferred<any>()
    const chooseFiles = vi.fn().mockResolvedValue({
      canceled: false,
      files: [{
        name: "no-parse.log",
        size: 1234,
        preview: "",
        sourcePath: "/tmp/no-parse.log",
      }],
    })
    const importSourceFiles = vi.fn(() => importJob.promise)
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles,
        importSourceFiles,
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
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
      },
    })

    render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Import files" }))

    expect(await screen.findByRole("button", { name: fileButtonName("no-parse.log", "Gaussian") })).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Parsing no-parse.log" })).toBeInTheDocument()
    const payload = ((importSourceFiles.mock.calls as any[][])[0]?.[0] ?? {}) as any

    await act(async () => {
      importJob.resolve({
        ok: true,
        data: {
          files: [{
            id: payload.files[0].id,
            name: "no-parse.log",
            size: 1234,
            preview: "",
            storedPath: "sources/no-parse.log",
            checksum: `sha256:${"d".repeat(64)}`,
          }],
        },
        warnings: [{
          code: "import_preview_failed",
          message: "The local parser did not return import preview data.",
        }],
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: fileButtonName("no-parse.log", "Gaussian") })).not.toBeInTheDocument()
      expect(screen.queryByRole("progressbar", { name: "Parsing no-parse.log" })).not.toBeInTheDocument()
    })
    expect(await screen.findByRole("alertdialog", { name: "Import failed" })).toHaveTextContent("no-parse.log")
  })

  it("shows an import error dialog and removes unsupported desktop parser placeholders", async () => {
    const importJob = deferred<any>()
    const chooseFiles = vi.fn().mockResolvedValue({
      canceled: false,
      files: [{
        name: "unsupported.dat",
        size: 1234,
        preview: "",
        sourcePath: "/tmp/unsupported.dat",
      }],
    })
    const importSourceFiles = vi.fn(() => importJob.promise)
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles,
        importSourceFiles,
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
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
      },
    })

    render(<App />)
    const importTrigger = screen.getByRole("button", { name: "Import files" })
    importTrigger.focus()
    fireEvent.click(importTrigger)

    expect(await screen.findByRole("button", { name: "unsupported.dat Raw" })).toBeInTheDocument()
    const payload = ((importSourceFiles.mock.calls as any[][])[0]?.[0] ?? {}) as any

    expect(fireEvent.keyDown(window, { key: "k", metaKey: true })).toBe(false)
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument()

    await act(async () => {
      importJob.resolve({
        ok: true,
        data: {
          files: [{
            id: payload.files[0].id,
            name: "unsupported.dat",
            size: 1234,
            preview: "",
            parse: unsupportedSource("unsupported", "No supported parser recognized this source full-file."),
            error: {
              code: "unsupported_format",
              message: "No supported parser recognized this source full-file.",
            },
          }],
        },
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "unsupported.dat Raw" })).not.toBeInTheDocument()
    })
    const dialog = await screen.findByRole("alertdialog", { name: "Unsupported import format" })
    const closeImportError = within(dialog).getByRole("button", { name: "Close import error" })
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument()
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1)
    expect(closeImportError).toHaveFocus()
    expect(dialog).toHaveTextContent("unsupported.dat")
    expect(dialog).toHaveTextContent("No supported parser recognized this source full-file.")

    expect(fireEvent.keyDown(closeImportError, { key: "Tab" })).toBe(false)
    expect(closeImportError).toHaveFocus()
    expect(fireEvent.keyDown(closeImportError, { key: "Tab", shiftKey: true })).toBe(false)
    expect(closeImportError).toHaveFocus()
    fireEvent.keyDown(window, { key: "t" })
    expect(fireEvent.keyDown(window, { key: "k", metaKey: true })).toBe(false)
    expect(screen.queryByRole("region", { name: "Energy table" })).not.toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument()

    fireEvent.keyDown(closeImportError, { key: "Escape" })
    expect(screen.queryByRole("alertdialog", { name: "Unsupported import format" })).not.toBeInTheDocument()
    expect(importTrigger).toHaveFocus()
  })

  it("uses the native Electron import issue dialog when available", async () => {
    const importJob = deferred<any>()
    const showImportIssues = vi.fn(async () => ({ ok: true, shown: true }))
    const chooseFiles = vi.fn().mockResolvedValue({
      canceled: false,
      files: [{
        name: "native-unsupported.dat",
        size: 1234,
        preview: "",
        sourcePath: "/tmp/native-unsupported.dat",
      }],
    })
    const importSourceFiles = vi.fn(() => importJob.promise)
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles,
        importSourceFiles,
        showImportIssues,
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
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
      },
    })

    render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Import files" }))

    expect(await screen.findByRole("button", { name: "native-unsupported.dat Raw" })).toBeInTheDocument()
    const payload = ((importSourceFiles.mock.calls as any[][])[0]?.[0] ?? {}) as any

    await act(async () => {
      importJob.resolve({
        ok: true,
        data: {
          files: [{
            id: payload.files[0].id,
            name: "native-unsupported.dat",
            size: 1234,
            preview: "",
            storedPath: "sources/native-unsupported.dat",
            checksum: `sha256:${"3".repeat(64)}`,
            parse: errorTerminatedGaussianSource(
              "native-unsupported",
              "unsupported_format",
              "No supported parser recognized this source full-file.",
            ),
          }],
        },
      })
      await Promise.resolve()
    })

    expect(showImportIssues).toHaveBeenCalledWith({
      title: "Unsupported import format",
      entries: [{
        fileName: "native-unsupported.dat",
        code: "unsupported_format",
        message: "No supported parser recognized this source full-file.",
      }],
    })
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "native-unsupported.dat Raw" })).not.toBeInTheDocument()
    })
    expect(screen.queryByRole("alertdialog", { name: "Unsupported import format" })).not.toBeInTheDocument()
  })

  it("keeps auto-registering canvas parse completions on the per-file path", async () => {
    const pending: PendingDesktopImportJob[] = []
    const importSourceFiles = vi.fn((payload: any) => new Promise<any>((resolve) => pending.push({ payload, resolve })))
    installDesktopImportRuntime({
      importSourceFiles,
      filePathForFile: vi.fn((file: File) => `/tmp/${file.name}`),
    })
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 89)

    try {
      render(<App />)
      requestFrame.mockClear()
      const surface = screen.getByLabelText("Graph canvas surface")
      mockSurfaceRect(surface)
      const firstFile = new File(["first"], "canvas-frame-first.calc", { type: "text/plain" })
      const secondFile = new File(["second"], "canvas-frame-second.calc", { type: "text/plain" })
      dispatchDrop(surface, new TestDataTransfer([firstFile, secondFile]), 640, 360)

      await waitFor(() => expect(importSourceFiles).toHaveBeenCalledTimes(2))
      await act(async () => {
        pending[0].resolve(desktopImportResponse(pending[0], {
          name: "canvas-frame-first.calc",
          size: firstFile.size,
          storedPath: "sources/canvas-frame-first.calc",
          checksum: `sha256:${"7".repeat(64)}`,
          parse: parsedOrcaSource("canvas-frame-first"),
        }))
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(await screen.findByRole("button", { name: "Node canvas-frame-first" })).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Node canvas-frame-second" })).not.toBeInTheDocument()
      expect(requestFrame).not.toHaveBeenCalled()

      await act(async () => {
        pending[1].resolve(desktopImportResponse(pending[1], {
          name: "canvas-frame-second.calc",
          size: secondFile.size,
          storedPath: "sources/canvas-frame-second.calc",
          checksum: `sha256:${"8".repeat(64)}`,
          parse: parsedOrcaSource("canvas-frame-second"),
        }))
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(await screen.findByRole("button", { name: "Node canvas-frame-second" })).toBeInTheDocument()
      expect(requestFrame).not.toHaveBeenCalled()
    } finally {
      requestFrame.mockRestore()
    }
  })

  it("stages Electron canvas drops before creating parsed nodes at the drop point", async () => {
    const importJob = deferred<any>()
    const importSourceFiles = vi.fn(() => importJob.promise)
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles: vi.fn(),
        importSourceFiles,
        filePathForFile: vi.fn(() => "/tmp/canvas-drop.calc"),
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
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
      },
    })

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
    const file = new File(["parser job reads from sourcePath"], "canvas-drop.calc", { type: "text/plain" })
    const dataTransfer = new TestDataTransfer([file])

    dispatchDrop(surface, dataTransfer, clientX, clientY)

    expect(await screen.findByRole("button", { name: "canvas-drop.calc Raw" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Node canvas-drop" })).not.toBeInTheDocument()
    expect(importSourceFiles).toHaveBeenCalledTimes(1)
    const payload = ((importSourceFiles.mock.calls as any[][])[0]?.[0] ?? {}) as any
    expect(payload.files[0]).toMatchObject({
      name: "canvas-drop.calc",
      preview: "",
      sourcePath: "/tmp/canvas-drop.calc",
    })

    await act(async () => {
      importJob.resolve({
        ok: true,
        data: {
          files: [{
            id: payload.files[0].id,
            name: "canvas-drop.calc",
            size: file.size,
            preview: "",
            storedPath: "sources/canvas-drop.calc",
            checksum: `sha256:${"c".repeat(64)}`,
            parse: parsedOrcaSource("canvas-drop"),
          }],
        },
      })
      await Promise.resolve()
    })

    const node = await screen.findByRole("button", { name: "Node canvas-drop" })
    expect(node).toHaveTextContent("ΔG")
    expect(node.style.transform).toContain(`translate(${expectedX}px, ${expectedY}px)`)
  })

  it("does not inline canvas-dropped file bytes when Electron cannot provide a native file path", async () => {
    const importJob = deferred<any>()
    const importSourceFiles = vi.fn(() => importJob.promise)
    Object.defineProperty(window, "rxnflowDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        chooseFiles: vi.fn(),
        importSourceFiles,
        filePathForFile: vi.fn(() => ""),
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
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
      },
    })

    render(<App />)
    const surface = screen.getByLabelText("Graph canvas surface")
    mockSurfaceRect(surface)
    const file = new File(["SCF Done: E(Test) = -1.0"], "path-missing.log", { type: "text/plain" })
    dispatchDrop(surface, new TestDataTransfer([file]), 640, 360)

    expect(await screen.findByRole("button", { name: fileButtonName("path-missing.log", "Gaussian") })).toBeInTheDocument()
    expect(importSourceFiles).toHaveBeenCalledTimes(1)
    const payload = ((importSourceFiles.mock.calls as any[][])[0]?.[0] ?? {}) as any
    expect(payload.files[0]).toMatchObject({
      name: "path-missing.log",
      preview: "",
    })
    expect(payload.files[0].sourcePath).toBeUndefined()
    expect(payload.files[0].contentBase64).toBeUndefined()

    await act(async () => {
      importJob.resolve({
        ok: true,
        data: {
          files: [{
            id: payload.files[0].id,
            name: "path-missing.log",
            size: file.size,
            preview: "",
            error: {
              code: "source_materialize_failed",
              message: "Could not copy source file because the import payload did not include a readable native file path.",
            },
          }],
        },
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Node path-missing" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: fileButtonName("path-missing.log", "Gaussian") })).not.toBeInTheDocument()
      expect(screen.queryByRole("progressbar", { name: "Parsing path-missing.log" })).not.toBeInTheDocument()
    })
    expect(await screen.findByRole("alertdialog", { name: "Import failed" })).toHaveTextContent("path-missing.log")
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
      filePath: `/tmp/${payload.defaultName}`,
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

    fireEvent.click(screen.getByRole("button", { name: "Import files" }))

    const sourceButton = await screen.findByRole("button", { name: /desktop\.out ORCA/ })
    expect(sourceButton).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Node engine-preview" })).not.toBeInTheDocument()
    const sourceRow = sourceButton.closest(".project-file-card") as HTMLElement
    const dataTransfer = new TestDataTransfer()
    fireEvent.dragStart(sourceRow, { dataTransfer })
    dispatchDrop(screen.getByLabelText("Graph canvas surface"), dataTransfer, 640, 360)
    expect(await screen.findByRole("button", { name: "Node engine-preview" })).toHaveTextContent("ΔG")
    expect(chooseFiles).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    let exportPanel = screen.getByRole("region", { name: "Export panel" })
    fireEvent.click(within(exportPanel).getByRole("menuitem", { name: "PNG" }))
    await waitFor(() => expect(saveReportArtifact).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    exportPanel = screen.getByRole("region", { name: "Export panel" })
    fireEvent.click(within(exportPanel).getByRole("menuitem", { name: "XLSX" }))
    await waitFor(() => expect(saveReportArtifact).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    exportPanel = screen.getByRole("region", { name: "Export panel" })
    fireEvent.click(within(exportPanel).getByRole("menuitem", { name: "CDXML" }))
    await waitFor(() => expect(saveReportArtifact).toHaveBeenCalledTimes(3))
    expect(saveReportArtifact.mock.calls.map((call) => call[0].defaultName)).toEqual([
      "diels-alder-study.png",
      "diels-alder-study.xlsx",
      "diels-alder-study.cdxml",
    ])
    expect(saveReportArtifact.mock.calls[2][0].content).toContain("engine-preview")
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

    expect(await screen.findByRole("button", { name: fileButtonName("desktop.out", "ORCA") })).toBeInTheDocument()
    await waitFor(() => expect(autosaveProjectPackage).toHaveBeenCalled(), { timeout: 2500 })
    expect(JSON.parse(autosaveProjectPackage.mock.calls[0][0].content).files[0]).toMatchObject({
      name: "desktop.out",
      sourcePath: "/external/desktop.out",
    })

    fireEvent.click(screen.getByRole("button", { name: fileButtonName("desktop.out", "ORCA") }))
    const inspector = screen.getByRole("complementary", { name: "Inspector" })
    expect(within(inspector).getByText("engine-preview")).toBeInTheDocument()
    const sourceInspector = within(inspector).getByRole("region", { name: "Source inspector" })
    expect(sourceInspector).toHaveTextContent("desktop.out")
    expect(within(sourceInspector).getByRole("button", { name: "Open with external app" })).toBeEnabled()
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
    fireEvent.click(within(exportPanel).getByRole("menuitem", { name: "PNG" }))

    await waitFor(() => expect(saveReportArtifact).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("region", { name: "Export panel" })).not.toBeInTheDocument()
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
    expect(screen.getByRole("button", { name: fileButtonName("recent.log", "Gaussian") })).toBeInTheDocument()
    expect(screen.getAllByText("Recent Study").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: "Diels-Alder Study open" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Nickel catalysis empty" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Ir screening empty" })).not.toBeInTheDocument()
    expect(screen.queryByRole("status", { name: "Project validation" })).not.toBeInTheDocument()
    expect(screen.queryByText("files[0].storedPath does not exist")).not.toBeInTheDocument()
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
    const startupRestore = deferred<{
      canceled: boolean
      content: string
      filePath: string
      projectDirectory: string
      replaceProjects: boolean
      source: string
      validation: null
    }>()
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
    const getStartupProjectContent = vi.fn(() => startupRestore.promise)
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
        getStartupProjectContent,
        saveReportArtifact: vi.fn(),
        saveProjectPackage: vi.fn(),
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
        onOpenProjectContent: vi.fn(() => vi.fn()),
      },
    })

    render(<StrictMode><App /></StrictMode>)

    expect(screen.getByRole("status")).toHaveTextContent("Opening workspace")
    expect(getStartupProjectContent).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: "Diels-Alder Study open" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Nickel catalysis empty" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Ir screening empty" })).not.toBeInTheDocument()

    await act(async () => {
      startupRestore.resolve({
        canceled: false,
        content: startupPackageContent,
        filePath: "/Users/linsay/Documents/RxnFlow/Ir.rxnflow",
        projectDirectory: "/Users/linsay/Documents/RxnFlow/Ir.rxnflow",
        replaceProjects: true,
        source: "startup",
        validation: null,
      })
      await startupRestore.promise
    })

    expect(await screen.findByRole("button", { name: "Node 4b-1" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: fileButtonName("4b-1.log", "Gaussian") })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Ir open" })).toHaveAttribute("aria-current", "true")
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Diels-Alder Study open" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Nickel catalysis empty" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Ir screening empty" })).not.toBeInTheDocument()
    expect(getStartupProjectContent).toHaveBeenCalledTimes(1)
  })

  it("restores all recent desktop workspaces on startup and keeps the active one selected", async () => {
    const startupRestore = deferred<{
      canceled: boolean
      projectContents: Array<{
        content: string
        filePath: string
        projectDirectory: string
        replaceProjects?: boolean
        source: string
        validation: null
      }>
    }>()
    const projectContent = (id: string, label: string) => JSON.stringify({
      schemaVersion: 1,
      packageKind: "rxnflow-project",
      project: { id, label, meta: "saved" },
      files: [{
        id: `${id}-file`,
        name: `${label}.log`,
        kind: "Gaussian",
        size: 128,
        status: "parsed",
        preview: `${label} calculation`,
        storedPath: `sources/${label}.log`,
      }],
      nodes: [{
        id: `${id}-node`,
        label: `${label} node`,
        formula: "H2",
        kind: "intermediate",
        method: "B3LYP",
        solvent: "gas",
        energyGas: -1,
        energyUnit: "hartree",
        sourceStatus: "parsed",
        sourceFileId: `${id}-file`,
        position: { x: 40, y: 60 },
      }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      savedAt: "2026-07-03T00:00:00.000Z",
    })
    const setActiveProject = vi.fn().mockResolvedValue({ ok: true })
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
        getStartupProjectContent: vi.fn(() => startupRestore.promise),
        setActiveProject,
        saveReportArtifact: vi.fn(),
        saveProjectPackage: vi.fn(),
        onMenuImportFiles: vi.fn(() => vi.fn()),
        onMenuOpenProject: vi.fn(() => vi.fn()),
        onMenuSaveProject: vi.fn(() => vi.fn()),
        onOpenProjectContent: vi.fn(() => vi.fn()),
      },
    })

    render(<App />)

    await act(async () => {
      startupRestore.resolve({
        canceled: false,
        projectContents: [
          {
            content: projectContent("ir-workspace", "Ir"),
            filePath: "/Users/linsay/Documents/RxnFlow/Ir.rxnflow",
            projectDirectory: "/Users/linsay/Documents/RxnFlow/Ir.rxnflow",
            source: "startup",
            validation: null,
          },
          {
            content: projectContent("ni-workspace", "Ni"),
            filePath: "/Users/linsay/Documents/RxnFlow/Ni.rxnflow",
            projectDirectory: "/Users/linsay/Documents/RxnFlow/Ni.rxnflow",
            replaceProjects: false,
            source: "startup",
            validation: null,
          },
        ],
      })
      await startupRestore.promise
    })

    expect(await screen.findByRole("button", { name: "Ni open" })).toHaveAttribute("aria-current", "true")
    expect(screen.getByRole("button", { name: "Node Ni node" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Node Ir node" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Ir open" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Diels-Alder Study open" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Nickel catalysis empty" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Ir screening empty" })).not.toBeInTheDocument()
    await waitFor(() => expect(setActiveProject).toHaveBeenCalledTimes(1))
    expect(setActiveProject).toHaveBeenLastCalledWith({
      projectId: "ni-workspace",
      projectDirectory: "/Users/linsay/Documents/RxnFlow/Ni.rxnflow",
    })

    fireEvent.click(screen.getByRole("button", { name: "Ir open" }))
    expect(await screen.findByRole("button", { name: "Node Ir node" })).toBeInTheDocument()
    await waitFor(() => expect(setActiveProject).toHaveBeenCalledTimes(2))
    expect(setActiveProject).toHaveBeenLastCalledWith({
      projectId: "ir-workspace",
      projectDirectory: "/Users/linsay/Documents/RxnFlow/Ir.rxnflow",
    })
  })
})
