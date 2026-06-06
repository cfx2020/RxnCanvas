import { readFile } from "node:fs/promises"
import { unzipSync, zipSync } from "fflate"
import { expect, type Locator, type Page, type TestInfo } from "playwright/test"

export type ConsoleIssue = {
  type: string
  text: string
}

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
  await expect(page.getByRole("button", { name: "Analysis" })).toHaveAttribute("aria-pressed", "false")
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
  const relevantIssues = issues.filter((issue) => !issue.text.includes("Download the React DevTools"))
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

export async function openAnalysisDockTab(page: Page, tabName: string) {
  const analysisToggle = page.getByRole("button", { name: "Analysis" })
  if (await analysisToggle.getAttribute("aria-pressed") !== "true") {
    await analysisToggle.click()
  }
  const dock = page.getByRole("complementary", { name: "Analysis Dock" })
  await expect(dock).toBeVisible()
  const tab = dock.getByRole("tab", { name: tabName, exact: true })
  await tab.click()
  await expect(tab).toHaveAttribute("aria-selected", "true")
}

export async function closeAnalysisDock(page: Page) {
  const analysisToggle = page.getByRole("button", { name: "Analysis" })
  if (await analysisToggle.getAttribute("aria-pressed") === "true") {
    await analysisToggle.click()
    await expect(analysisToggle).toHaveAttribute("aria-pressed", "false")
  }
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

export async function openSourceTray(page: Page) {
  const sourceTray = page.getByRole("region", { name: "Source Tray" })
  if (await sourceTray.isVisible()) {
    return sourceTray
  }
  await page.getByRole("button", { name: "Sources" }).click()
  await expect(sourceTray).toBeVisible()
  return sourceTray
}

export async function closeSourceTray(page: Page) {
  const sourceToggle = page.getByRole("button", { name: "Sources" })
  if (await sourceToggle.getAttribute("aria-pressed") === "true") {
    await sourceToggle.click()
    await expect(sourceToggle).toHaveAttribute("aria-pressed", "false")
  }
}

export async function attachViewportScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const screenshot = await page.screenshot({ fullPage: false })
  await testInfo.attach(name, {
    body: screenshot,
    contentType: "image/png",
  })
}

export async function createAndSaveBrowserProject(page: Page, name: string) {
  const sidebar = page.getByRole("complementary", { name: "Project Sidebar" })
  await page.getByLabel("Project name").fill(name)
  await page.getByRole("button", { name: "Create Project" }).click()
  await expect(sidebar.getByRole("heading", { name })).toBeVisible()
  await expect(sidebar.getByText("Persisted", { exact: true })).toBeVisible()
  await expect(sidebar.getByText("Valid", { exact: true })).toBeVisible()
  await expect(sidebar.getByText(/sha256:[a-f0-9]{64}/i)).toBeVisible()

  await page.getByRole("button", { name: "Save Project" }).click()
  await expect(sidebar.getByText(/Project content files are readable/)).toBeVisible()
}

export async function openBrowserProject(page: Page, name: string) {
  const sidebar = page.getByRole("complementary", { name: "Project Sidebar" })
  await sidebar.getByRole("button", { name: new RegExp(name) }).click()
  await expect(sidebar.getByRole("heading", { name })).toBeVisible()
  await expect(sidebar.getByText("Persisted", { exact: true })).toBeVisible()
  await expect(sidebar.getByText("Valid", { exact: true })).toBeVisible()
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
  await openAnalysisDockTab(page, "Diagnostics")
  await page.getByRole("button", { name: "Fixture Run" }).click()
  await expect(page.getByText("graph-a-b").first()).toBeVisible()
  await expect(page.getByRole("region", { name: "Graph Canvas" })).toBeVisible()
  await openAnalysisDockTab(page, "Object")
  await expect(page.getByRole("region", { name: "Object Registry" })).toBeVisible()
  await openAnalysisDockTab(page, "PES")
  await expect(page.getByRole("region", { name: "Energy Profile Panel" })).toBeVisible()
  await openAnalysisDockTab(page, "Export")
  await expect(page.getByRole("region", { name: "Report Export Panel" })).toBeVisible()
  await openAnalysisDockTab(page, "PES")
  await closeAnalysisDock(page)
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
  await openAnalysisDockTab(page, "Object")
  const objectRegistry = page.getByRole("region", { name: "Object Registry" })
  const source = objectRegistry.getByRole("button", { name: options.objectName }).first()
  await expect(source).toBeVisible()

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
  const node = graphCanvas.getByRole("button", { name: nodeName }).first()
  await expect(node).toBeVisible()
  await node.scrollIntoViewIfNeeded()

  const before = await node.boundingBox()
  expect(before).not.toBeNull()
  await node.evaluate((element, dragDelta) => {
    const target = element as HTMLElement & { setPointerCapture?: (pointerId: number) => void }
    const rect = target.getBoundingClientRect()
    const start = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
    const pointerId = 91
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
      dispatchPointer("pointermove", start.x + dragDelta.x / 2, start.y + dragDelta.y / 2, 1)
      dispatchPointer("pointermove", start.x + dragDelta.x, start.y + dragDelta.y, 1)
      dispatchPointer("pointerup", start.x + dragDelta.x, start.y + dragDelta.y, 0)
    } finally {
      target.setPointerCapture = originalSetPointerCapture
    }
  }, delta)

  await expect.poll(async () => {
    const after = await node.boundingBox()
    if (!after) return 0
    return Math.abs(after.x - before!.x) + Math.abs(after.y - before!.y)
  }).toBeGreaterThan(8)
}

export async function applyAutoLayoutAndReplayHistory(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  const viewportLayer = graphCanvas.locator(".graph-viewport-layer")
  const beforeTransform = await viewportLayer.evaluate((element) => getComputedStyle(element).transform)

  await graphCanvas.getByRole("button", { name: "Apply Layout" }).click()
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

export async function createAndDeleteTemporaryGraphPath(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  const preview = graphCanvas.getByLabel("Network Preview")

  await graphCanvas.getByRole("button", { name: "Set Path" }).click()
  await expect(graphCanvas.getByText("path-web-main").first()).toBeVisible()
  await expect(preview.locator("dd").nth(2)).toHaveText("2")

  await graphCanvas.getByRole("button", { name: "Select path Canvas path" }).click()
  await graphCanvas.getByRole("button", { name: "Delete Selected" }).click()

  await expect(graphCanvas.getByRole("button", { name: "Select path Canvas path" })).toHaveCount(0)
  await expect(preview.locator("dd").nth(2)).toHaveText("1")
  await expect(graphCanvas.getByText("Active path").locator("..")).toContainText("none")
  await expect(graphCanvas.getByRole("button", { name: "Select path Fixture path" })).toBeVisible()
}

export async function editFixtureEdgeLabel(page: Page, label: string) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  await graphCanvas.getByRole("button", { name: "Edge Object A to Object B" }).evaluate((element) => {
    (element as HTMLElement).click()
  })

  const editor = graphCanvas.getByRole("form", { name: "Edge Label Editor" })
  await expect(editor).toBeVisible()
  await editor.getByLabel("Label").fill(label)
  await editor.getByRole("button", { name: "Apply" }).click()

  await expect(editor.getByLabel("Label")).toHaveValue(label)
  await expect(graphCanvas.getByRole("button", { name: `Edge Object A to Object B: ${label}` })).toBeVisible()
  await expect(graphCanvas.getByText(label).first()).toBeVisible()
}

export async function drawTemporaryEdgeWithPointer(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  const preview = graphCanvas.getByLabel("Network Preview")

  await drawGraphEdgeWithPointer(page, graphCanvas, "node-b", "node-web-3")

  await expect(preview.locator("dd").nth(1)).toHaveText("2")
  await expect(graphCanvas.getByText("No disconnected nodes")).toBeVisible()
}

export async function rubberBandDeleteTemporaryNodes(page: Page) {
  await dragRegisteredObjectToGraphCanvas(page, {
    objectName: /object a/i,
    objectId: "object-a",
    label: "Object A",
    target: { xRatio: 0.78, yRatio: 0.72 },
  })

  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  const preview = graphCanvas.getByLabel("Network Preview")
  await expect(graphNodeById(graphCanvas, "node-web-4")).toBeVisible()
  await expect(preview.locator("dd").nth(0)).toHaveText("4")

  await rubberBandSelectGraphNodes(graphCanvas, ["node-web-3", "node-web-4"])

  await expect(graphNodeById(graphCanvas, "node-web-3")).toHaveAttribute("aria-current", "true")
  await expect(graphNodeById(graphCanvas, "node-web-4")).toHaveAttribute("aria-current", "true")

  await graphCanvas.getByRole("button", { name: "Delete Selected" }).click()
  await expect(graphNodeById(graphCanvas, "node-web-3")).toHaveCount(0)
  await expect(graphNodeById(graphCanvas, "node-web-4")).toHaveCount(0)
  await expect(preview.locator("dd").nth(0)).toHaveText("2")
  await expect(preview.locator("dd").nth(1)).toHaveText("1")
  await expect(graphCanvas.getByText("No disconnected nodes")).toBeVisible()
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
  const minimap = graphCanvas.getByTestId("graph-minimap")

  await graphCanvas.getByRole("button", { name: "Reset", exact: true }).click()
  await expect(viewportZoomOutput).toHaveText("100%")

  await graphCanvas.getByRole("button", { name: "Zoom In" }).click()
  await expect(viewportZoomOutput).toHaveText("120%")

  await graphCanvas.getByRole("button", { name: "Fit" }).click()
  await expect.poll(async () => viewportZoomOutput.textContent()).not.toBe("120%")

  await graphCanvas.getByRole("button", { name: "Reset", exact: true }).click()
  await expect(viewportZoomOutput).toHaveText("100%")

  await expect(graphCanvas.locator(".graph-minimap-panel")).toBeVisible()
  await expect(minimap).toBeVisible()
  await expect.poll(async () => minimap.locator(".graph-minimap-node").count()).toBeGreaterThanOrEqual(2)
  await expect(minimap.locator(".graph-minimap-window")).toBeVisible()

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
  await expect(viewportZoomOutput).toHaveText("110%")
  await expect.poll(async () => viewportLayer.evaluate((element) => getComputedStyle(element).transform)).not.toBe(beforeWheelTransform)

  const beforeMinimapTransform = await viewportLayer.evaluate((element) => getComputedStyle(element).transform)
  const minimapBox = await minimap.boundingBox()
  expect(minimapBox).not.toBeNull()
  await dispatchMinimapPointerTap(minimap, { xRatio: 0.72, yRatio: 0.58 })
  await expect.poll(async () => viewportLayer.evaluate((element) => getComputedStyle(element).transform)).not.toBe(beforeMinimapTransform)

  const beforeMinimapDragTransform = await viewportLayer.evaluate((element) => getComputedStyle(element).transform)
  await minimap.evaluate((element, points) => {
    const target = element as HTMLElement & { setPointerCapture?: (pointerId: number) => void }
    const rect = target.getBoundingClientRect()
    const start = {
      x: rect.left + rect.width * points.start.xRatio,
      y: rect.top + rect.height * points.start.yRatio,
    }
    const end = {
      x: rect.left + rect.width * points.end.xRatio,
      y: rect.top + rect.height * points.end.yRatio,
    }
    const pointerId = 93
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
    } finally {
      target.setPointerCapture = originalSetPointerCapture
    }
  }, {
    start: { xRatio: 0.3, yRatio: 0.38 },
    end: { xRatio: 0.62, yRatio: 0.63 },
  })
  await expect(minimap.locator(".graph-minimap-window--draft")).toBeVisible()
  await minimap.evaluate((element, point) => {
    const target = element as HTMLElement
    const rect = target.getBoundingClientRect()
    target.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      pointerId: 93,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 0,
      clientX: rect.left + rect.width * point.xRatio,
      clientY: rect.top + rect.height * point.yRatio,
    }))
  }, { xRatio: 0.62, yRatio: 0.63 })
  await expect(minimap.locator(".graph-minimap-window--draft")).toHaveCount(0)
  await expect.poll(async () => viewportLayer.evaluate((element) => getComputedStyle(element).transform)).not.toBe(beforeMinimapDragTransform)

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

  await graphCanvas.getByRole("button", { name: "Pan" }).click()
  await expect(graphCanvas.getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "false")

  await graphCanvas.getByRole("button", { name: "Reset", exact: true }).click()
  await expect(viewportZoomOutput).toHaveText("100%")
  await graphCanvas.getByRole("button", { name: "Zoom In" }).click()
  await expect(viewportZoomOutput).toHaveText("120%")

  await graphCanvas.getByRole("button", { name: "Undo" }).click()
  await expect(viewportZoomOutput).toHaveText("100%")
  await expect(graphCanvas.getByRole("button", { name: "Redo" })).toBeEnabled()
  await graphCanvas.getByRole("button", { name: "Redo" }).click()
  await expect(viewportZoomOutput).toHaveText("120%")
}

export async function reorderFixturePathToReverse(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  await selectGraphPathById(graphCanvas, "path-a-b")
  const draft = graphCanvas.getByLabel("Path order draft")
  await draft.getByRole("button", { name: "Up" }).last().click()
  await draft.getByRole("button", { name: "Apply Path Order" }).click()
  await expect(graphCanvas.getByText("node-b -> node-a")).toBeVisible()
}

export async function deleteFixtureEdge(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  await graphCanvas.getByRole("button", { name: "Edge Object A to Object B" }).click()
  await graphCanvas.getByRole("button", { name: "Delete Selected" }).click()
  const preview = graphCanvas.getByLabel("Network Preview")
  await expect(preview.locator("dd").nth(1)).toHaveText("0")
  await expect(graphCanvas.getByRole("button", { name: /node-a/i })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: /node-b/i })).toBeVisible()
}

export async function saveReloadAndRestoreGraphWorkspace(page: Page, projectName: string) {
  const sidebar = page.getByRole("complementary", { name: "Project Sidebar" })
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })

  await selectGraphPathById(graphCanvas, "path-a-b")

  await page.getByRole("button", { name: "Save Project" }).click()
  await openProjectRail(page)
  await expect(sidebar.getByText("Project content files are readable.")).toBeVisible()

  await page.reload({ waitUntil: "networkidle" })
  await openWorkbench(page)
  await openBrowserProject(page, projectName)

  await expect(graphCanvas.locator(".graph-viewport-bar output")).toHaveText("120%")
  await expect(graphCanvas.getByText("node-b -> node-a")).toBeVisible()
  await expect(graphCanvas.getByText("Active path").locator("..")).toContainText("path-a-b")
  await expect(graphCanvas.getByRole("button", { name: /Select path .*path-a-b/ })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Edge Object A to Object B: TS scan" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Undo" })).toBeDisabled()
  await expect(graphCanvas.getByRole("button", { name: "Redo" })).toBeDisabled()
}

export async function exerciseNarrowGraphAdvancedControls(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
  await expect(graphCanvas).toBeVisible()
  await graphCanvas.scrollIntoViewIfNeeded()

  await expect(graphCanvas.getByRole("button", { name: "Apply Layout" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Undo" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Redo" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Pan" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Zoom In" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Zoom Out" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Fit" })).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Reset", exact: true })).toBeVisible()

  await clickGraphCanvasButton(graphCanvas, "Apply Layout")
  await expect(graphCanvas.getByText("Layout applied")).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Undo" })).toBeEnabled()
  await clickGraphCanvasButton(graphCanvas, "Undo")
  await expect(graphCanvas.getByRole("button", { name: "Redo" })).toBeEnabled()
  await clickGraphCanvasButton(graphCanvas, "Redo")

  await expect(graphCanvas.locator(".graph-minimap-panel")).toBeVisible()
  await expect(graphCanvas.getByTestId("graph-minimap")).toBeVisible()
  await expect(graphCanvas.getByLabel("Network Preview")).toBeVisible()
  await expect(graphCanvas.getByLabel("Graph paths")).toBeVisible()

  await graphCanvas.getByRole("button", { name: /Edge Object A to Object B/ }).click()
  const editor = graphCanvas.getByRole("form", { name: "Edge Label Editor" })
  await expect(editor).toBeVisible()
  await expect(editor.getByLabel("Label")).toBeVisible()

  await clickGraphCanvasButton(graphCanvas, "Reset", { exact: true })
  await expect(graphCanvas.locator(".graph-viewport-bar output")).toHaveText("100%")
  await clickGraphCanvasButton(graphCanvas, "Zoom In")
  await expect(graphCanvas.locator(".graph-viewport-bar output")).toHaveText("120%")
  await clickGraphCanvasButton(graphCanvas, "Reset", { exact: true })
  await expect(graphCanvas.locator(".graph-viewport-bar output")).toHaveText("100%")
}

export async function importSourcesToCanvas(page: Page) {
  const importInbox = await openSourceTray(page)
  await importInbox.getByLabel("Select Files").setInputFiles([
    {
      name: "water.xyz",
      mimeType: "chemical/x-xyz",
      buffer: Buffer.from("2\nwater\nO 0 0 0\nH 0 0 1\n"),
    },
    {
      name: "bad-count.xyz",
      mimeType: "chemical/x-xyz",
      buffer: Buffer.from("bad\n"),
    },
  ])
  await importInbox.getByLabel("Expected format").selectOption("xyz")
  await importInbox.getByLabel("Strict parser").check()
  await importInbox.getByRole("button", { name: "Import to Canvas" }).click()

  await expect(importInbox.getByText("import-batch-fixture-web-1")).toBeVisible()
  await expect(importInbox.getByText("inputs/raw/water.xyz")).toBeVisible()
  await expect(importInbox.getByText("missing_section").first()).toBeVisible()
  await expect(importInbox.getByText("parse_failed")).toBeVisible()
  await expect(importInbox.getByText("object-imported-water").first()).toBeVisible()
  await expect(page.getByRole("region", { name: "Graph Canvas" }).getByText("node-web-3").first()).toBeVisible()
  await closeSourceTray(page)
}

export async function buildImportedWaterPath(page: Page) {
  const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })

  await expect(graphCanvas.getByText("node-web-3").first()).toBeVisible()

  await clickGraphNodeById(graphCanvas, "node-b")
  await clickGraphCanvasButton(graphCanvas, "Connect")
  await clickGraphNodeById(graphCanvas, "node-web-3")
  await expect(graphCanvas.getByText("No disconnected nodes")).toBeVisible()

  await clickGraphCanvasButton(graphCanvas, "Set Path")
  await expect(graphCanvas.getByText("path-web-main").first()).toBeVisible()
  await expect(graphCanvas.getByRole("button", { name: "Select path Canvas path" }))
    .toContainText("node-a -> node-b -> node-web-3")
}

export async function computeMissingEnergyProfile(page: Page) {
  await openAnalysisDockTab(page, "PES")
  const energyPanel = page.getByRole("region", { name: "Energy Profile Panel" })
  await energyPanel.getByRole("button", { name: "Compute" }).click()
  await expect(energyPanel.getByText("missing_energy").first()).toBeVisible()
  await expect(energyPanel.getByRole("row").filter({ hasText: "node-web-3" })).toContainText("missing_energy")
}

export async function exportFixtureProfile(page: Page) {
  await openAnalysisDockTab(page, "Export")
  const exportPanel = page.getByRole("region", { name: "Report Export Panel" })
  await openReportExportMode(exportPanel)
  await exportPanel.getByRole("button", { name: "Export", exact: true }).click()
  await expect(exportPanel.getByText("artifact-png-rxnflow-profile")).toBeVisible()
  await expect(exportPanel.getByText("artifact-cdxml-rxnflow-profile")).toBeVisible()
  await expect(exportPanel.getByText("artifact-xlsx-rxnflow-profile")).toBeVisible()
  await expect(exportPanel.getByText("artifact-csv-rxnflow-profile")).toBeVisible()
  await expect(exportPanel.getByText("artifact-svg-rxnflow-profile")).toBeVisible()
  await expect(exportPanel.getByText("exports/rxnflow-profile.png")).toBeVisible()
  await expect(exportPanel.getByText("exports/rxnflow-profile.cdxml")).toBeVisible()
  await expect(exportPanel.getByText("exports/rxnflow-profile.xlsx")).toBeVisible()
  await expect(exportPanel.getByText("exports/rxnflow-profile.csv")).toBeVisible()
  await expect(exportPanel.getByText("exports/rxnflow-profile.svg")).toBeVisible()
  await expect(exportPanel.getByText("fixture-png-energy-plot-v1")).toBeVisible()
  await expect(exportPanel.getByText("fixture-cdxml-energy-v1")).toBeVisible()
  await expect(exportPanel.getByText("fixture-xlsx-energy-table-v1")).toBeVisible()
  await expect(exportPanel.getByText("fixture-csv-energy-table-v1")).toBeVisible()
  await expect(exportPanel.getByText("fixture-svg-graph-snapshot-v1")).toBeVisible()
  await expect(exportPanel.getByText("energy_table_schema_version").first()).toBeVisible()
  await expect(exportPanel.getByText("artifact_kind").first()).toBeVisible()
  await expect(exportPanel.getByText("graph_snapshot")).toBeVisible()
  await expect(exportPanel.getByText("energy-table-v1", { exact: true }).first()).toBeVisible()
  await expect(exportPanel.getByText(/^sha256:[a-f0-9]{64}$/).first()).toBeVisible()
  await expect(exportPanel.getByText("Yes").first()).toBeVisible()
  await expect(exportPanel.getByRole("link", { name: "Download" })).toHaveCount(5)
  await expect(exportPanel.getByRole("link", { name: "Download" }).first()).toHaveAttribute("download", "rxnflow-profile.png")
  await expect(exportPanel.getByRole("link", { name: "Download" }).first()).toHaveAttribute("href", /^data:image\/png;base64,/)
  await expect(exportPanel.getByRole("link", { name: "Download" }).nth(1)).toHaveAttribute("download", "rxnflow-profile.cdxml")
  await expect(exportPanel.getByRole("link", { name: "Download" }).nth(1)).toHaveAttribute("href", /^data:chemical\/x-cdxml;base64,/)
  await expect(exportPanel.getByRole("link", { name: "Download" }).nth(2)).toHaveAttribute("download", "rxnflow-profile.xlsx")
  await expect(exportPanel.getByRole("link", { name: "Download" }).nth(2)).toHaveAttribute("href", /^data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet;base64,/)
  await expect(exportPanel.getByRole("link", { name: "Download" }).nth(3)).toHaveAttribute("download", "rxnflow-profile.csv")
  await expect(exportPanel.getByRole("link", { name: "Download" }).nth(3)).toHaveAttribute("href", /^data:text\/csv;base64,/)
  await expect(exportPanel.getByRole("link", { name: "Download" }).nth(4)).toHaveAttribute("download", "rxnflow-profile.svg")
  await expect(exportPanel.getByRole("link", { name: "Download" }).nth(4)).toHaveAttribute("href", /^data:image\/svg\+xml;base64,/)
  await expect(page.getByText("chemdraw_cdxml_only").first()).toBeVisible()
}

export async function exportWithoutInlineBytes(page: Page) {
  await openAnalysisDockTab(page, "Export")
  const exportPanel = page.getByRole("region", { name: "Report Export Panel" })
  await openReportExportMode(exportPanel)
  await exportPanel.getByLabel("Include bytes").uncheck()
  await exportPanel.getByRole("button", { name: "Export", exact: true }).click()
  await expect(exportPanel.getByText("artifact-png-rxnflow-profile")).toBeVisible()
  await expect(exportPanel.getByRole("link", { name: "Download" })).toHaveCount(0)
  await expect(exportPanel.getByText("Download unavailable")).toHaveCount(5)
}

async function openReportExportMode(exportPanel: Locator) {
  const exportModeButton = exportPanel.getByRole("button", { name: "Export mode" })
  if (await exportModeButton.getAttribute("aria-pressed") !== "true") {
    await exportModeButton.click()
  }
}

function graphNodeById(graphCanvas: Locator, nodeId: string): Locator {
  return graphCanvas.getByRole("button", { name: new RegExp(`\\b${escapeRegExp(nodeId)}\\b`, "i") }).first()
}

async function selectGraphPathById(graphCanvas: Locator, pathId: string) {
  const pathButton = graphCanvas
    .getByLabel("Graph paths")
    .locator("li", { hasText: pathId })
    .getByRole("button")
    .first()
  await expect(pathButton).toBeVisible()
  await pathButton.click()
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
    const scroller = buttonElement.closest<HTMLElement>(".graph-command-bar, .graph-viewport-bar")
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
  const handle = graphCanvas.locator(`.graph-edge-connect-handle[data-graph-node-id="${fromNodeId}"]`).first()
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
