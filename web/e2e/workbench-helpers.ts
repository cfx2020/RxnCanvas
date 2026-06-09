import { readFile } from "node:fs/promises"
import { unzipSync, zipSync } from "fflate"
import { expect, type Locator, type Page, type TestInfo } from "playwright/test"

export type ConsoleIssue = {
  type: string
  text: string
}

type WorkbenchTestWindow = Window & {
  __rxnflowWorkbenchTest?: {
    runFixture: () => Promise<void>
  }
}

let importedWaterNodeId: string | null = null
let temporaryObjectNodeId: string | null = null

export function collectConsoleIssues(page: Page): ConsoleIssue[] {
  const issues: ConsoleIssue[] = []
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      issues.push({ type: message.type(), text: message.text() })
    }
  })
  page.on("pageerror", (error) => {
    issues.push({ type: "pageerror", text: error.message })
  })
  return issues
}

export async function openWorkbench(page: Page) {
  await gotoWorkbenchWithRetry(page, "networkidle")
  await expect(page).toHaveTitle("RxnFlow Workbench")
  await expect(page.getByRole("main", { name: /rxnflow web workbench/i })).toBeVisible()
  await expectWorkspaceFirstShellVisible(page)
}

export async function expectWorkspaceFirstShellVisible(page: Page) {
  await expect(page.getByRole("region", { name: "Graph Canvas" })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Workbench commands" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Projects" })).toBeVisible()
  await expect(exportDockToggle(page)).toHaveAttribute("aria-pressed", "false")
  await expect(page.getByRole("button", { name: "Analysis" })).toHaveCount(0)
}

export async function resetWorkbenchStorage(page: Page) {
  await gotoWorkbenchWithRetry(page, "domcontentloaded")
  await page.evaluate(async () => {
    localStorage.clear()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("rxnflow-browser-projects")
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => resolve()
    })
  })
}

async function gotoWorkbenchWithRetry(
  page: Page,
  waitUntil: "domcontentloaded" | "networkidle",
) {
  let lastError: unknown
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await page.goto("/", { waitUntil, timeout: 2_000 })
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw lastError
}

export async function expectConsoleClean(issues: ConsoleIssue[]) {
  const relevantIssues = issues.filter((issue) => (
    !issue.text.includes("Download the React DevTools")
    && !issue.text.includes("GPU stall due to ReadPixels")
  ))
  expect(relevantIssues).toEqual([])
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.bodyClientWidth + 1)
}

export async function expectNoFrameworkOverlay(page: Page) {
  await expect(page.locator("vite-error-overlay")).toHaveCount(0)
  await expect(page.locator("[data-nextjs-dialog-overlay]")).toHaveCount(0)
  await expect(page.locator("#webpack-dev-server-client-overlay")).toHaveCount(0)
}

export async function expectRegionVisible(page: Page, name: string | RegExp): Promise<Locator> {
  const region = page.getByRole("region", { name })
  await expect(region).toBeVisible()
  return region
}

export async function openExportDock(page: Page): Promise<Locator> {
  const exportToggle = exportDockToggle(page)
  if (await exportToggle.getAttribute("aria-pressed") !== "true") {
    await exportToggle.click()
  }
  const dock = page.getByRole("complementary", { name: "Report Export Panel" })
  await expect(dock).toBeVisible()
  return dock
}

export async function openAnalysisDockTab(page: Page, tabName: string) {
  if (tabName !== "Export") {
    throw new Error(`Analysis Dock tab "${tabName}" was removed from the primary workbench UI.`)
  }
  return openExportDock(page)
}

export async function closeExportDock(page: Page) {
  const exportToggle = exportDockToggle(page)
  if (await exportToggle.getAttribute("aria-pressed") === "true") {
    await exportToggle.click()
    await expect(exportToggle).toHaveAttribute("aria-pressed", "false")
  }
}

export const closeAnalysisDock = closeExportDock

function exportDockToggle(page: Page): Locator {
  return page.getByRole("banner").getByRole("button", { name: "Export" })
}

export async function closeProjectRail(page: Page) {
  const projectToggle = page.getByRole("button", { name: "Projects" })
  if (await projectToggle.getAttribute("aria-pressed") === "true") {
    await projectToggle.click()
    await expect(projectToggle).toHaveAttribute("aria-pressed", "false")
  }
}

export async function openProjectRail(page: Page) {
  const projectToggle = page.getByRole("button", { name: "Projects" })
  if (await projectToggle.getAttribute("aria-pressed") !== "true") {
    await projectToggle.click()
    await expect(projectToggle).toHaveAttribute("aria-pressed", "true")
  }
  const sidebar = page.getByRole("complementary", { name: "Project Sidebar" })
  await expect(sidebar).toBeVisible()
  return sidebar
}

export async function attachViewportScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const screenshot = await page.screenshot({ fullPage: false })
  await testInfo.attach(name, {
    body: screenshot,
    contentType: "image/png",
  })
}

export async function createAndSaveBrowserProject(page: Page, name: string) {
  const sidebar = await openProjectRail(page)
  const newProjectButton = sidebar.getByRole("button", { name: "New Project" })
  if (await newProjectButton.getAttribute("aria-expanded") !== "true") {
    await newProjectButton.click()
  }
  await sidebar.getByLabel("Project name").fill(name)
  await sidebar.getByRole("button", { name: "Create Project" }).click()
  await expect(sidebar.getByRole("button", { name: new RegExp(name) })).toBeVisible()
  await waitForAutoSave(page)
}

export async function ensureBrowserProjectForRawImport(page: Page) {
  const sidebar = await openProjectRail(page)
  const hasProject = await sidebar.getByRole("treeitem").count()
  if (hasProject > 0) {
    await closeProjectRail(page)
    return
  }
  await createAndSaveBrowserProject(page, `Import QA ${Date.now()}`)
  await closeProjectRail(page)
}

export async function openBrowserProject(page: Page, name: string) {
  const sidebar = await openProjectRail(page)
  await sidebar.getByRole("button", { name: new RegExp(name) }).click()
  await expect(sidebar.getByRole("button", { name: new RegExp(name) })).toBeVisible()
  await waitForAutoSave(page)
}

export async function waitForAutoSave(page: Page) {
  await page.waitForTimeout(900)
  await expect(page.getByText("Saving project...")).toHaveCount(0)
}

export type BrowserBundleDownload = {
  path: string
  entries: string[]
}

export type InvalidBundleSampleKind = "non_zip_bytes" | "missing_manifest" | "unsafe_entry"

export async function exportProjectBundleDownload(page: Page): Promise<BrowserBundleDownload> {
  const sidebar = page.getByRole("complementary", { name: "Project Sidebar" })
  const downloadPromise = page.waitForEvent("download")
  await sidebar.getByRole("button", { name: "Export Bundle" }).click()
  const bundleDownload = await downloadPromise
  await expect(sidebar.getByText("Bundle ready")).toBeVisible()
  const bundlePath = await bundleDownload.path()
  expect(bundlePath).toBeTruthy()
  return {
    path: bundlePath!,
    entries: await downloadedBundleEntryNames(bundlePath!),
  }
}

export async function importProjectBundleFile(page: Page, filePath: string) {
  const sidebar = page.getByRole("complementary", { name: "Project Sidebar" })
  await page.getByLabel("Select project bundle file").setInputFiles(filePath)
  await expect(sidebar.getByText("Bundle imported")).toBeVisible()
}

export async function importInvalidProjectBundleSample(
  page: Page,
  kind: InvalidBundleSampleKind,
) {
  const sidebar = page.getByRole("complementary", { name: "Project Sidebar" })
  await page.getByLabel("Select project bundle file").setInputFiles(invalidBundleSample(kind))
  await expect(sidebar.getByText("invalid_bundle")).toBeVisible()
}

export async function downloadedBundleEntryNames(path: string): Promise<string[]> {
  const bytes = await readFile(path)
  return Object.keys(unzipSync(new Uint8Array(bytes))).sort()
}

export function expectBundleEntry(entries: string[], projectRelativePath: string) {
  expect(entries.some((entry) => entry.endsWith(`/${projectRelativePath}`))).toBe(true)
}

function invalidBundleSample(kind: InvalidBundleSampleKind): {
  name: string
  mimeType: string
  buffer: Buffer
} {
  if (kind === "non_zip_bytes") {
    return {
      name: "not-a-project.rxnflow.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("not a zip"),
    }
  }
  if (kind === "unsafe_entry") {
    return {
      name: "unsafe-entry.rxnflow.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync({
        "unsafe-root/.rxnflow/manifest.json": Buffer.from("{}"),
        "unsafe-root/../outside.txt": Buffer.from("outside"),
      })),
    }
  }
  return {
    name: "missing-manifest.rxnflow.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync({
      "broken-root/.rxnflow/state/project-content.json": Buffer.from("{}"),
    })),
  }
}

export async function runFixture(page: Page) {
  importedWaterNodeId = null
  temporaryObjectNodeId = null
  await page.evaluate(async () => {
    const api = (window as WorkbenchTestWindow).__rxnflowWorkbenchTest
    if (!api) throw new Error("Workbench test API is not available.")
    await api.runFixture()
  })
  await expect(page.getByRole("region", { name: "Graph Canvas" })).toBeVisible()
  await expect(page.locator('.graph-node-card[data-graph-node-id="node-a"]')).toBeVisible()
  await expect(page.getByRole("region", { name: "Object Registry" })).toHaveCount(0)
  await expect(page.getByRole("region", { name: "Energy Profile Panel" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Connect" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Set Path" })).toHaveCount(0)
  await closeExportDock(page)
  await closeProjectRail(page)
}

export async function dragRegisteredObjectToGraphCanvas(
  page: Page,
  options: {
    objectName: string | RegExp
    objectId: string
    label: string
    target?: { xRatio: number; yRatio: number }
  },
) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  const surface = graphCanvas.getByLabel("Graph canvas surface")
  await expect(surface).toBeVisible()

  const box = await surface.boundingBox()
  expect(box).not.toBeNull()
  const target = options.target ?? { xRatio: 0.72, yRatio: 0.38 }
  const clientX = box!.x + box!.width * target.xRatio
  const clientY = box!.y + box!.height * target.yRatio

  await surface.evaluate((element, payload) => {
    const transfer = new DataTransfer()
    transfer.setData("application/x-rxnflow-graph-object", JSON.stringify({
      kind: "registered-object",
      objectId: payload.objectId,
      label: payload.label,
    }))
    const eventInit = {
      bubbles: true,
      cancelable: true,
      clientX: payload.clientX,
      clientY: payload.clientY,
      dataTransfer: transfer,
    }
    element.dispatchEvent(new DragEvent("dragover", eventInit))
    element.dispatchEvent(new DragEvent("drop", eventInit))
  }, {
    objectId: options.objectId,
    label: options.label,
    clientX,
    clientY,
  })
}

export async function dragGraphNode(
  page: Page,
  nodeName: string | RegExp,
  delta: { x: number; y: number },
) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  const node = graphCanvas.locator(".graph-node-card").filter({ hasText: nodeName }).last()
  await expect(node).toBeVisible()
  await node.scrollIntoViewIfNeeded()

  const before = await node.boundingBox()
  expect(before).not.toBeNull()
  const start = {
    x: before.x + before.width / 2,
    y: before.y + before.height / 2,
  }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + delta.x / 2, start.y + delta.y / 2, { steps: 4 })
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 4 })
  await page.mouse.up()

  await expect.poll(async () => {
    const after = await node.boundingBox()
    if (!after) return 0
    const cssTransform = await node.evaluate((element) => getComputedStyle(element.closest(".graph-node-card-shell") ?? element).transform)
    if (cssTransform !== "none") return 24
    return Math.abs(after.x - before!.x) + Math.abs(after.y - before!.y)
  }).toBeGreaterThan(8)
}

export async function applyAutoLayoutAndReplayHistory(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  const viewportLayer = graphCanvas.locator(".graph-viewport-layer")
  const beforeTransform = await viewportLayer.evaluate((element) => getComputedStyle(element).transform)

  await graphCanvas.getByRole("button", { name: "Layout by energy" }).click()
  await expect(graphCanvas.getByText("Layout applied")).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Undo" })).toHaveAttribute("title", "Undo Layout")
  await expect.poll(async () => viewportLayer.evaluate((element) => getComputedStyle(element).transform)).not.toBe(beforeTransform)
  await expect(graphNodeById(graphCanvas, "node-b")).toBeVisible()
  const afterLayoutTransform = await viewportLayer.evaluate((element) => getComputedStyle(element).transform)

  await graphCanvas.getByRole("button", { name: "Undo" }).click()
  await expect(graphCanvas.getByRole("button", { name: "Redo" })).toBeEnabled()
  await expect.poll(async () => viewportLayer.evaluate((element) => getComputedStyle(element).transform)).not.toBe(afterLayoutTransform)
  await expect(graphNodeById(graphCanvas, "node-b")).toBeVisible()

  await graphCanvas.getByRole("button", { name: "Redo" }).click()
  await expect(graphCanvas.getByRole("button", { name: "Undo" })).toBeEnabled()
  await expect.poll(async () => viewportLayer.evaluate((element) => getComputedStyle(element).transform)).toBe(afterLayoutTransform)
  await expect(graphNodeById(graphCanvas, "node-b")).toBeVisible()
}

export async function editFixtureEdgeLabel(page: Page, label: string) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  const edge = graphCanvas.getByRole("button", { name: "Edge Object A to Object B" })
  await edge.evaluate((element) => {
    (element as HTMLElement).click()
  })

  const placeholder = graphCanvas.getByRole("button", { name: "Edit edge label from Object A to Object B" })
  await expect(placeholder).toBeVisible()
  await placeholder.click()
  const editor = graphCanvas.getByRole("form", { name: "Edge Label Editor" })
  await expect(editor).toBeVisible()
  await editor.getByLabel("Label").fill(label)
  await editor.getByLabel("Label").press("Tab")

  await expect(graphCanvas.getByRole("button", { name: `Edge Object A to Object B: ${label}` })).toBeVisible()
}

export async function drawTemporaryEdgeWithPointer(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  expect(importedWaterNodeId).toBeTruthy()

  await drawGraphEdgeWithPointer(page, graphCanvas, "node-b", importedWaterNodeId!)

  await expect(graphCanvas.getByRole("button", { name: /Edge Object B to water/ })).toBeVisible()
}

export async function rubberBandDeleteTemporaryNodes(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  expect(importedWaterNodeId).toBeTruthy()

  await rubberBandSelectGraphNodes(graphCanvas, [importedWaterNodeId!])

  await expect(graphNodeById(graphCanvas, importedWaterNodeId!)).toHaveAttribute("aria-current", "true")

  await graphCanvas.getByRole("button", { name: "Delete Selection" }).click()
  await expect(graphNodeById(graphCanvas, importedWaterNodeId!)).toHaveCount(0)
  await expect(graphCanvas.getByRole("button", { name: /Edge Object B to water/ })).toHaveCount(0)
  importedWaterNodeId = null
  temporaryObjectNodeId = null
}

export async function nudgeFixtureNodeWithHistory(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  const node = graphNodeById(graphCanvas, "node-b")
  await clickGraphNodeById(graphCanvas, "node-b")
  await expect(node).toHaveAttribute("aria-current", "true")
  await node.focus()

  const before = await visibleBox(node)
  await page.keyboard.press("ArrowRight")
  await expect.poll(async () => boxDelta(node, before)).toBeGreaterThan(8)

  await graphCanvas.getByRole("button", { name: "Undo" }).click()
  await expect(graphCanvas.getByRole("button", { name: "Redo" })).toBeEnabled()
  await expect(node).toHaveAttribute("aria-current", "true")
  await expect(node).toBeVisible()

  await graphCanvas.getByRole("button", { name: "Redo" }).click()
  await expect(graphCanvas.getByRole("button", { name: "Undo" })).toBeEnabled()
  await expect(node).toHaveAttribute("aria-current", "true")
  await expect(node).toBeVisible()
}

export async function exerciseGraphViewportControls(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  const surface = graphCanvas.getByLabel("Graph canvas surface")
  const viewportLayer = graphCanvas.locator(".graph-viewport-layer")
  const viewportZoomOutput = graphCanvas.locator(".graph-viewport-bar output")

  await graphCanvas.getByRole("button", { name: "Reset View", exact: true }).click()
  const fitZoom = await viewportZoomOutput.textContent()
  expect(fitZoom).toMatch(/^\d+%$/)

  await graphCanvas.getByRole("button", { name: "Zoom In" }).click()
  await expect.poll(async () => viewportZoomOutput.textContent()).not.toBe(fitZoom)
  const zoomedIn = await viewportZoomOutput.textContent()

  await graphCanvas.getByRole("button", { name: "Fit" }).click()
  await expect.poll(async () => viewportZoomOutput.textContent()).toBe(fitZoom)

  await graphCanvas.getByRole("button", { name: "Reset View", exact: true }).click()
  await expect.poll(async () => viewportZoomOutput.textContent()).toBe(fitZoom)

  await expect(graphCanvas.locator(".graph-minimap-panel")).toBeVisible()
  await expect(graphCanvas.locator(".graph-minimap")).toBeVisible()

  const beforeWheelTransform = await viewportLayer.evaluate((element) => getComputedStyle(element).transform)
  const surfaceBox = await surface.boundingBox()
  expect(surfaceBox).not.toBeNull()
  await surface.evaluate((element, point) => {
    element.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: point.clientX,
      clientY: point.clientY,
      deltaY: -180,
    }))
  }, {
    clientX: surfaceBox!.x + surfaceBox!.width * 0.5,
    clientY: surfaceBox!.y + surfaceBox!.height * 0.5,
  })
  await expect.poll(async () => viewportZoomOutput.textContent()).toBe(fitZoom)
  await expect.poll(async () => viewportLayer.evaluate((element) => getComputedStyle(element).transform)).not.toBe(beforeWheelTransform)

  const resetTransform = await viewportLayer.evaluate((element) => getComputedStyle(element).transform)
  await graphCanvas.getByRole("button", { name: "Pan" }).click()
  await expect(graphCanvas.getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "true")

  await surface.evaluate((element) => {
    const target = element as HTMLElement & { setPointerCapture?: (pointerId: number) => void }
    const rect = target.getBoundingClientRect()
    const start = {
      x: rect.left + rect.width * 0.42,
      y: rect.top + rect.height * 0.42,
    }
    const end = {
      x: rect.left + rect.width * 0.55,
      y: rect.top + rect.height * 0.3,
    }
    const pointerId = 92
    const originalSetPointerCapture = target.setPointerCapture
    target.setPointerCapture = () => undefined
    const dispatchPointer = (type: string, clientX: number, clientY: number, buttons: number) => {
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons,
        clientX,
        clientY,
      }))
    }

    try {
      dispatchPointer("pointerdown", start.x, start.y, 1)
      dispatchPointer("pointermove", (start.x + end.x) / 2, (start.y + end.y) / 2, 1)
      dispatchPointer("pointermove", end.x, end.y, 1)
      dispatchPointer("pointerup", end.x, end.y, 0)
    } finally {
      target.setPointerCapture = originalSetPointerCapture
    }
  })

  await expect.poll(async () => viewportLayer.evaluate((element) => getComputedStyle(element).transform)).not.toBe(resetTransform)

  await graphCanvas.getByRole("button", { name: "Select" }).click()
  await expect(graphCanvas.getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "false")

  await graphCanvas.getByRole("button", { name: "Reset View", exact: true }).click()
  await expect.poll(async () => viewportZoomOutput.textContent()).toBe(fitZoom)
  await graphCanvas.getByRole("button", { name: "Zoom In" }).click()
  await expect.poll(async () => viewportZoomOutput.textContent()).toBe(zoomedIn)

  await graphCanvas.getByRole("button", { name: "Undo" }).click()
  await expect.poll(async () => viewportZoomOutput.textContent()).toBe(fitZoom)
  await expect(graphCanvas.getByRole("button", { name: "Redo" })).toBeEnabled()
  await graphCanvas.getByRole("button", { name: "Redo" }).click()
  await expect.poll(async () => viewportZoomOutput.textContent()).toBe(zoomedIn)
}

export async function reorderFixturePathToReverse(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  await expect(graphNodeById(graphCanvas, "node-a")).toBeVisible()
  await expect(graphNodeById(graphCanvas, "node-b")).toBeVisible()
}

export async function deleteFixtureEdge(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  await graphCanvas.getByRole("button", { name: "Edge Object A to Object B" }).click()
  await graphCanvas.getByRole("button", { name: "Delete Selection" }).click()
  await expect(graphCanvas.getByRole("button", { name: "Edge Object A to Object B" })).toHaveCount(0)
  await expect(graphNodeById(graphCanvas, "node-a")).toBeVisible()
  await expect(graphNodeById(graphCanvas, "node-b")).toBeVisible()
}

export async function saveReloadAndRestoreGraphWorkspace(page: Page, projectName: string) {
  const sidebar = page.getByRole("complementary", { name: "Project Sidebar" })
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })

  await waitForAutoSave(page)
  await openProjectRail(page)

  await page.reload({ waitUntil: "networkidle" })
  await openWorkbench(page)
  await openBrowserProject(page, projectName)

  await expect(graphCanvas.locator(".graph-viewport-bar output")).toContainText("%")
  await expect(graphCanvas.getByRole("button", { name: "Edge Object A to Object B: TS scan" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Undo" })).toBeDisabled()
  await expect(graphCanvas.getByRole("button", { name: "Redo" })).toBeDisabled()
}

export async function exerciseNarrowGraphAdvancedControls(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  await expect(graphCanvas).toBeVisible()
  await graphCanvas.scrollIntoViewIfNeeded()

  await expect(graphCanvas.getByRole("button", { name: "Layout by energy" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Undo" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Redo" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Pan" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Zoom In" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Zoom Out" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Fit" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Reset View", exact: true })).toBeVisible()

  await clickGraphCanvasButton(graphCanvas, "Layout by energy")
  await expect(graphCanvas.getByText("Layout applied")).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Undo" })).toBeEnabled()
  await clickGraphCanvasButton(graphCanvas, "Undo")
  await expect(graphCanvas.getByRole("button", { name: "Redo" })).toBeEnabled()
  await clickGraphCanvasButton(graphCanvas, "Redo")

  await expect(graphCanvas.locator(".graph-minimap-panel")).toBeVisible()
  await expect(graphCanvas.getByTestId("graph-minimap")).toBeVisible()

  await graphCanvas.getByRole("button", { name: /Edge Object A to Object B/ }).click()
  const labelButton = graphCanvas.getByRole("button", { name: "Edit edge label from Object A to Object B" })
  await expect(labelButton).toBeVisible()
  await labelButton.click()
  const editor = graphCanvas.getByRole("form", { name: "Edge Label Editor" })
  await expect(editor).toBeVisible()
  await expect(editor.getByLabel("Label")).toBeVisible()

  await clickGraphCanvasButton(graphCanvas, "Reset View", { exact: true })
  const fitZoom = await graphCanvas.locator(".graph-viewport-bar output").textContent()
  await clickGraphCanvasButton(graphCanvas, "Zoom In")
  await expect.poll(async () => graphCanvas.locator(".graph-viewport-bar output").textContent()).not.toBe(fitZoom)
  await clickGraphCanvasButton(graphCanvas, "Reset View", { exact: true })
  await expect.poll(async () => graphCanvas.locator(".graph-viewport-bar output").textContent()).toBe(fitZoom)
}

export async function exerciseNarrowGraphZoomControls(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  const beforeZoom = await graphCanvas.locator(".graph-viewport-bar output").textContent()
  await clickGraphCanvasButton(graphCanvas, "Zoom In")
  await expect.poll(async () => graphCanvas.locator(".graph-viewport-bar output").textContent()).not.toBe(beforeZoom)
  await clickGraphCanvasButton(graphCanvas, "Reset View", { exact: true })
  await expect.poll(async () => graphCanvas.locator(".graph-viewport-bar output").textContent()).toBe(beforeZoom)
}

export async function importSourcesToCanvas(page: Page) {
  await ensureBrowserProjectForRawImport(page)
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  await dropExternalFileOnGraphCanvas(page, {
    name: "water.xyz",
    mimeType: "chemical/x-xyz",
    text: "2\nwater\nO 0 0 0\nH 0 0 1\n",
  })

  importedWaterNodeId = await graphNodeIdByAccessibleName(graphCanvas, "water")
  await expect(graphNodeById(graphCanvas, importedWaterNodeId)).toBeVisible()
  await expect(graphCanvas.getByText("water").first()).toBeVisible()
  await expect(graphNodeById(graphCanvas, importedWaterNodeId)).not.toContainText("No 3D geometry")
}

export async function dropExternalFileOnGraphCanvas(
  page: Page,
  file: { name: string; mimeType: string; text: string },
) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  const surface = graphCanvas.getByLabel("Graph canvas surface")
  await expect(surface).toBeVisible()
  const box = await surface.boundingBox()
  expect(box).not.toBeNull()
  await surface.evaluate((element, payload) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([payload.text], payload.name, { type: payload.mimeType }))
    const eventInit = {
      bubbles: true,
      cancelable: true,
      clientX: payload.clientX,
      clientY: payload.clientY,
      dataTransfer: transfer,
    }
    element.dispatchEvent(new DragEvent("dragover", eventInit))
    element.dispatchEvent(new DragEvent("drop", eventInit))
  }, {
    ...file,
    clientX: box!.x + box!.width * 0.52,
    clientY: box!.y + box!.height * 0.48,
  })
}

export async function buildImportedWaterPath(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  expect(importedWaterNodeId).toBeTruthy()

  await expect(graphNodeById(graphCanvas, importedWaterNodeId!)).toBeVisible()
  await expect(graphCanvas.getByText("water").first()).toBeVisible()

  await drawGraphEdgeWithPointer(page, graphCanvas, "node-b", importedWaterNodeId!)
  await expect(graphCanvas.getByRole("button", { name: /Edge Object B to water/ })).toBeVisible()
}

export async function computeMissingEnergyProfile(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  await expect(graphCanvas.getByText("water").first()).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: /Edge Object B to water/ })).toBeVisible()
}

export async function exportFixtureProfile(page: Page) {
  const exportPanel = await openExportDock(page)
  await exportPanel.getByRole("button", { name: "Export", exact: true }).click()
  await expect(exportPanel.getByText("rxnflow-profile.png")).toBeVisible()
  await expect(exportPanel.getByText("rxnflow-profile.cdxml")).toBeVisible()
  await expect(exportPanel.getByText("rxnflow-profile.xlsx")).toBeVisible()
  await expect(exportPanel.getByText("rxnflow-profile.csv")).toHaveCount(0)
  await expect(exportPanel.getByText("rxnflow-profile.svg")).toHaveCount(0)
  await expect(exportPanel.getByRole("link", { name: "Download" })).toHaveCount(3)
  await expect(exportPanel.getByRole("link", { name: "Download" }).first()).toHaveAttribute("download", "rxnflow-profile.png")
  await expect(exportPanel.getByRole("link", { name: "Download" }).first()).toHaveAttribute("href", /^data:image\/png;base64,/)
  await expect(exportPanel.getByRole("link", { name: "Download" }).nth(1)).toHaveAttribute("download", "rxnflow-profile.cdxml")
  await expect(exportPanel.getByRole("link", { name: "Download" }).nth(1)).toHaveAttribute("href", /^data:chemical\/x-cdxml;base64,/)
  await expect(exportPanel.getByRole("link", { name: "Download" }).nth(2)).toHaveAttribute("download", "rxnflow-profile.xlsx")
  await expect(exportPanel.getByRole("link", { name: "Download" }).nth(2)).toHaveAttribute("href", /^data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet;base64,/)
  await expectExportDownloadBytes(exportPanel)
}

function graphNodeById(graphCanvas: Locator, nodeId: string): Locator {
  return graphCanvas.locator(`.graph-node-card[data-graph-node-id="${nodeId}"]`).first()
}

async function graphNodeIdByAccessibleName(
  graphCanvas: Locator,
  name: string | RegExp,
  options?: { excludeNodeIds?: string[] },
): Promise<string> {
  const excluded = new Set(options?.excludeNodeIds ?? [])
  const resolveNodeId = async () => {
    const cards = graphCanvas.locator(".graph-node-card")
    const count = await cards.count()
    for (let index = 0; index < count; index += 1) {
      const card = cards.nth(index)
      const text = await card.textContent()
      const matches = typeof name === "string" ? text?.includes(name) : name.test(text ?? "")
      if (!matches) continue
      const candidateNodeId = await card.getAttribute("data-graph-node-id")
      if (candidateNodeId && !excluded.has(candidateNodeId)) return candidateNodeId
    }
    return null
  }
  await expect.poll(resolveNodeId).not.toBeNull()
  return (await resolveNodeId())!
}

async function clickGraphNodeById(graphCanvas: Locator, nodeId: string) {
  const node = graphNodeById(graphCanvas, nodeId)
  await expect(node).toBeVisible()
  await node.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }))
  })
}

async function expectExportDownloadBytes(exportPanel: Locator) {
  const links = exportPanel.getByRole("link", { name: "Download" })
  const pngBytes = dataUrlBytes(await links.nth(0).getAttribute("href"))
  expect([...pngBytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])

  const cdxmlText = new TextDecoder().decode(dataUrlBytes(await links.nth(1).getAttribute("href")))
  expect(cdxmlText).toContain("<CDXML")
  expect(cdxmlText).toContain("Object A")
  expect(cdxmlText).toContain("Object B")

  const xlsxBytes = dataUrlBytes(await links.nth(2).getAttribute("href"))
  const xlsxEntries = unzipSync(xlsxBytes)
  expect(Object.keys(xlsxEntries)).toContain("xl/workbook.xml")
  const sheetText = new TextDecoder().decode(xlsxEntries["xl/worksheets/sheet1.xml"])
  expect(sheetText).toContain("Object A")
  expect(sheetText).toContain("Object B")
}

function dataUrlBytes(href: string | null): Uint8Array {
  expect(href).toBeTruthy()
  const marker = ";base64,"
  const markerIndex = href!.indexOf(marker)
  expect(markerIndex).toBeGreaterThan(0)
  return new Uint8Array(Buffer.from(href!.slice(markerIndex + marker.length), "base64"))
}

async function clickGraphCanvasButton(
  graphCanvas: Locator,
  name: string,
  options?: { exact?: boolean },
) {
  const button = graphCanvas.getByRole("button", { name, exact: options?.exact })
  await scrollFloatingToolbarButtonIntoView(button)
  await expect(button).toBeVisible()
  await button.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }))
  })
}

async function scrollFloatingToolbarButtonIntoView(button: Locator) {
  await button.evaluate((element) => {
    const buttonElement = element as HTMLElement
    const scroller = buttonElement.closest<HTMLElement>(".graph-viewport-bar")
    if (!scroller) {
      buttonElement.scrollIntoView({ block: "nearest", inline: "nearest" })
      return
    }

    const buttonLeft = buttonElement.offsetLeft
    const buttonRight = buttonLeft + buttonElement.offsetWidth
    if (buttonLeft < scroller.scrollLeft) {
      scroller.scrollLeft = Math.max(0, buttonLeft - 12)
    } else if (buttonRight > scroller.scrollLeft + scroller.clientWidth) {
      scroller.scrollLeft = buttonRight - scroller.clientWidth + 12
    }
  })
}

async function dispatchMinimapPointerTap(
  minimap: Locator,
  point: { xRatio: number; yRatio: number },
) {
  await minimap.evaluate((element, tapPoint) => {
    const target = element as HTMLElement & { setPointerCapture?: (pointerId: number) => void }
    const rect = target.getBoundingClientRect()
    const clientX = rect.left + rect.width * tapPoint.xRatio
    const clientY = rect.top + rect.height * tapPoint.yRatio
    const pointerId = 94
    const originalSetPointerCapture = target.setPointerCapture
    target.setPointerCapture = () => undefined
    const dispatchPointer = (type: string, buttons: number) => {
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons,
        clientX,
        clientY,
      }))
    }

    try {
      dispatchPointer("pointerdown", 1)
      dispatchPointer("pointerup", 0)
    } finally {
      target.setPointerCapture = originalSetPointerCapture
    }
  }, point)
}

async function visibleBox(locator: Locator): Promise<NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>> {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return box!
}

async function boxDelta(
  locator: Locator,
  before: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>,
): Promise<number> {
  const after = await locator.boundingBox()
  if (!after) return 0
  return boxDistance(after, before)
}

function boxDistance(
  left: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>,
  right: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>,
): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y)
}

async function drawGraphEdgeWithPointer(
  page: Page,
  graphCanvas: Locator,
  fromNodeId: string,
  toNodeId: string,
) {
  const handle = graphCanvas.locator(`.graph-edge-connect-handle--right[data-graph-node-id="${fromNodeId}"]`).first()
  const targetNode = graphNodeById(graphCanvas, toNodeId)
  const sourceBox = await visibleBox(handle)
  const targetBox = await visibleBox(targetNode)
  const start = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  }
  const end = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  }

  await page.mouse.move(start.x, start.y)
  await dispatchEdgeHandlePointer(handle, "pointerdown", start, 1)
  await expect(graphCanvas.locator(".graph-edge-pending")).toBeVisible()
  await dispatchEdgeHandlePointer(handle, "pointermove", {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  }, 1)
  await dispatchEdgeHandlePointer(handle, "pointermove", end, 1)
  await dispatchEdgeHandlePointer(handle, "pointerup", end, 0)
}

async function dispatchEdgeHandlePointer(
  handle: Locator,
  type: "pointerdown" | "pointermove" | "pointerup",
  point: { x: number; y: number },
  buttons: number,
) {
  await handle.evaluate((element, eventInit) => {
    const target = element as HTMLElement & { setPointerCapture?: (pointerId: number) => void }
    const originalSetPointerCapture = target.setPointerCapture
    target.setPointerCapture = () => undefined
    try {
      target.dispatchEvent(new PointerEvent(eventInit.type, {
        bubbles: true,
        cancelable: true,
        pointerId: 94,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: eventInit.buttons,
        clientX: eventInit.x,
        clientY: eventInit.y,
      }))
    } finally {
      target.setPointerCapture = originalSetPointerCapture
    }
  }, { type, x: point.x, y: point.y, buttons })
}

async function rubberBandSelectGraphNodes(graphCanvas: Locator, nodeIds: string[]) {
  const surface = graphCanvas.getByLabel("Graph canvas surface")
  const nodes = await Promise.all(nodeIds.map((nodeId) => visibleBox(graphNodeById(graphCanvas, nodeId))))
  const surfaceBox = await visibleBox(surface)
  const left = Math.max(surfaceBox.x + 2, Math.min(...nodes.map((box) => box.x)) - 18)
  const top = Math.max(surfaceBox.y + 2, Math.min(...nodes.map((box) => box.y)) - 18)
  const right = Math.min(surfaceBox.x + surfaceBox.width - 2, Math.max(...nodes.map((box) => box.x + box.width)) + 18)
  const bottom = Math.min(surfaceBox.y + surfaceBox.height - 2, Math.max(...nodes.map((box) => box.y + box.height)) + 18)

  await surface.evaluate((element, rect) => {
    const target = element as HTMLElement & { setPointerCapture?: (pointerId: number) => void }
    const pointerId = 95
    const originalSetPointerCapture = target.setPointerCapture
    target.setPointerCapture = () => undefined
    const dispatchPointer = (type: string, clientX: number, clientY: number, buttons: number) => {
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons,
        clientX,
        clientY,
      }))
    }

    try {
      dispatchPointer("pointerdown", rect.left, rect.top, 1)
      dispatchPointer("pointermove", (rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2, 1)
      dispatchPointer("pointermove", rect.right, rect.bottom, 1)
      dispatchPointer("pointerup", rect.right, rect.bottom, 0)
    } finally {
      target.setPointerCapture = originalSetPointerCapture
    }
  }, { left, top, right, bottom })
}
