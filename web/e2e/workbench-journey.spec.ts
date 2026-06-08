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
  exerciseGraphViewportControls,
  expectConsoleClean,
  expectNoFrameworkOverlay,
  expectNoHorizontalOverflow,
  exportFixtureProfile,
  exportWithoutInlineBytes,
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
    await exportWithoutInlineBytes(page)

    await openAnalysisDockTab(page, "Export")
    await expect(page.getByText("Download unavailable")).toHaveCount(5)
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
    await expect(graphCanvas.locator('[data-graph-node-id="node-web-3"]').first()).toBeVisible()
    await expect(graphCanvas.getByText("Object B").first()).toBeVisible()

    await dragGraphNode(page, /Object B/i, { x: 88, y: 58 })
    await applyAutoLayoutAndReplayHistory(page)
    await editFixtureEdgeLabel(page, "TS scan")
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
    await expect(page.getByRole("region", { name: "Graph Canvas" }).locator('[data-graph-node-id="node-web-3"].graph-node-card')).toBeVisible()
    await expect(page.getByRole("region", { name: "Graph Canvas" }).getByText("water.xyz").first()).toBeVisible()

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
    await runFixture(page)

    const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
    await expect(graphCanvas).toBeVisible()
    await graphCanvas.getByRole("button", { name: "Add Active Object" }).click()
    await expect(graphCanvas.locator('[data-graph-node-id="node-web-3"]').first()).toBeVisible()
    await drawTemporaryEdgeWithPointer(page)

    await graphCanvas.getByRole("button", { name: "Zoom In" }).click()
    await expect(graphCanvas.locator(".graph-viewport-bar output")).toHaveText("120%")
    await graphCanvas.getByRole("button", { name: "Reset View", exact: true }).click()
    await expect(graphCanvas.locator(".graph-viewport-bar output")).toHaveText("100%")
    await expect(graphCanvas.getByLabel("Network Preview")).toBeVisible()

    await openAnalysisDockTab(page, "Export")
    const exportPanel = page.getByRole("complementary", { name: "Report Export Panel" })
    await exportPanel.getByRole("button", { name: "Export mode" }).click()
    await exportPanel.getByRole("button", { name: "Export", exact: true }).click()
    await expect(exportPanel.getByText("exports/rxnflow-profile.png")).toBeVisible()
    await expect(exportPanel.getByText("exports/rxnflow-profile.csv")).toBeVisible()
    await expect(exportPanel.getByText("exports/rxnflow-profile.svg")).toBeVisible()
    await expect(exportPanel.getByRole("link", { name: "Download" })).toHaveCount(5)

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
