import { expect, test } from "playwright/test"
import {
  attachViewportScreenshot,
  applyAutoLayoutAndReplayHistory,
  buildImportedWaterPath,
  collectConsoleIssues,
  computeMissingEnergyProfile,
  createAndSaveBrowserProject,
  drawTemporaryEdgeWithPointer,
  dragGraphNode,
  dragRegisteredObjectToGraphCanvas,
  editFixtureEdgeLabel,
  exerciseNarrowGraphAdvancedControls,
  exerciseNarrowGraphZoomControls,
  exerciseGraphViewportControls,
  expectConsoleClean,
  expectNoFrameworkOverlay,
  expectNoHorizontalOverflow,
  exportFixtureProfile,
  importSourcesToCanvas,
  openAnalysisDockTab,
  openBrowserProject,
  openProjectRail,
  openWorkbench,
  rubberBandDeleteTemporaryNodes,
  reorderFixturePathToReverse,
  resetWorkbenchStorage,
  runFixture,
  saveReloadAndRestoreGraphWorkspace,
  nudgeFixtureNodeWithHistory,
  waitForAutoSave,
} from "./workbench-helpers"

test.describe("RxnFlow Web Workbench E2E", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies()
    await resetWorkbenchStorage(page)
  })

  test("desktop workbench journey covers project, import, graph, energy, and export", async ({ page }, testInfo) => {
    const consoleIssues = collectConsoleIssues(page)
    await page.setViewportSize({ width: 1280, height: 720 })
    await openWorkbench(page)

    const projectName = `E2E Project ${Date.now()}`
    await createAndSaveBrowserProject(page, projectName)
    await runFixture(page)
    await importSourcesToCanvas(page)
    await buildImportedWaterPath(page)
    await computeMissingEnergyProfile(page)

    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "desktop-missing-energy-path")

    await page.reload({ waitUntil: "networkidle" })
    await openWorkbench(page)
    await openBrowserProject(page, projectName)
    await runFixture(page)
    await exportFixtureProfile(page)

    await openAnalysisDockTab(page, "Export")
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(3)
    await expectNoFrameworkOverlay(page)
    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "desktop-report-export")
    await expectConsoleClean(consoleIssues)
  })

  test("desktop graph editor matrix covers advanced editing and project restore", async ({ page }, testInfo) => {
    const consoleIssues = collectConsoleIssues(page)
    await page.setViewportSize({ width: 1280, height: 720 })
    await openWorkbench(page)

    const projectName = `Graph Matrix ${Date.now()}`
    await createAndSaveBrowserProject(page, projectName)
    await runFixture(page)
    await nudgeFixtureNodeWithHistory(page)

    await dragRegisteredObjectToGraphCanvas(page, {
      objectName: /object b/i,
      objectId: "object-b",
      label: "Object B",
      target: { xRatio: 0.72, yRatio: 0.36 },
    })
    const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
    await expect(graphCanvas.locator(".graph-node-card")).toHaveCount(3)
    await expect(graphCanvas.getByText("Object B").first()).toBeVisible()

    await dragGraphNode(page, /Object B/i, { x: 88, y: 58 })
    await applyAutoLayoutAndReplayHistory(page)
    await editFixtureEdgeLabel(page, "TS scan")
    await importSourcesToCanvas(page)
    await drawTemporaryEdgeWithPointer(page)
    await rubberBandDeleteTemporaryNodes(page)
    await reorderFixturePathToReverse(page)
    await exerciseGraphViewportControls(page)
    await saveReloadAndRestoreGraphWorkspace(page, projectName)

    await expectNoFrameworkOverlay(page)
    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "desktop-graph-editor-matrix")
    await expectConsoleClean(consoleIssues)
  })

  test("desktop project save and reopen restores browser-local project content", async ({ page }, testInfo) => {
    const consoleIssues = collectConsoleIssues(page)
    await page.setViewportSize({ width: 1280, height: 720 })
    await openWorkbench(page)

    const projectName = `Restore QA ${Date.now()}`
    await createAndSaveBrowserProject(page, projectName)
    await runFixture(page)
    await importSourcesToCanvas(page)
    await waitForAutoSave(page)
    await openProjectRail(page)

    await page.reload({ waitUntil: "networkidle" })
    await openWorkbench(page)
    await openBrowserProject(page, projectName)
    await expect(page.getByText(projectName).first()).toBeVisible()
    await expect(page.getByRole("region", { name: "Graph Canvas" }).locator(".graph-node-card").filter({ hasText: "water" }).last()).toBeVisible()

    await expectNoFrameworkOverlay(page)
    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "desktop-project-save-restore")
    await expectConsoleClean(consoleIssues)
  })

  test("narrow project rail keeps bundle actions out of the primary flow", async ({ page }, testInfo) => {
    const consoleIssues = collectConsoleIssues(page)
    await page.setViewportSize({ width: 390, height: 840 })
    await openWorkbench(page)

    await expect(page.getByRole("button", { name: "Projects" })).toHaveAttribute("aria-pressed", "false")
    const sidebar = await openProjectRail(page)
    await expect(sidebar.getByRole("button", { name: "Import Bundle" })).toHaveCount(0)
    await expect(sidebar.getByRole("button", { name: "Export Bundle" })).toHaveCount(0)
    await expect(sidebar.getByText("No projects yet")).toBeVisible()

    await expectNoFrameworkOverlay(page)
    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "narrow-project-rail-no-bundle-actions")
    await expectConsoleClean(consoleIssues)
  })

  test("narrow workbench layout keeps graph and report export usable", async ({ page }, testInfo) => {
    const consoleIssues = collectConsoleIssues(page)
    await page.setViewportSize({ width: 390, height: 840 })
    await openWorkbench(page)
    await createAndSaveBrowserProject(page, `Narrow QA ${Date.now()}`)
    await runFixture(page)

    const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
    await expect(graphCanvas).toBeVisible()
    await importSourcesToCanvas(page)
    await drawTemporaryEdgeWithPointer(page)

    await exerciseNarrowGraphZoomControls(page)
    await expect(graphCanvas.locator(".graph-minimap-panel")).toBeVisible()

    await openAnalysisDockTab(page, "Export")
    await exportFixtureProfile(page)

    await expectNoFrameworkOverlay(page)
    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "narrow-workbench-flow")
    await expectConsoleClean(consoleIssues)
  })

  test("narrow graph editor keeps advanced controls reachable", async ({ page }, testInfo) => {
    const consoleIssues = collectConsoleIssues(page)
    await page.setViewportSize({ width: 390, height: 840 })
    await openWorkbench(page)
    await runFixture(page)

    await exerciseNarrowGraphAdvancedControls(page)

    await expectNoFrameworkOverlay(page)
    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "narrow-graph-editor-advanced")
    await expectConsoleClean(consoleIssues)
  })
})
