import { expect, test } from "playwright/test"
import {
  attachViewportScreenshot,
  buildImportedWaterPath,
  collectConsoleIssues,
  computeMissingEnergyProfile,
  createAndSaveBrowserProject,
  deleteFixtureEdge,
  dragGraphNode,
  dragRegisteredObjectToGraphCanvas,
  exerciseGraphViewportControls,
  expectConsoleClean,
  expectNoFrameworkOverlay,
  expectNoHorizontalOverflow,
  expectRegionVisible,
  exportFixtureProfile,
  exportWithoutInlineBytes,
  openBrowserProject,
  openWorkbench,
  previewAndRegisterImport,
  reorderFixturePathToReverse,
  resetWorkbenchStorage,
  runFixture,
  saveReloadAndRestoreGraphWorkspace,
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
    await previewAndRegisterImport(page)
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

    await expect(page.getByText("3 artifacts indexed")).toBeVisible()
    await expectNoFrameworkOverlay(page)
    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "desktop-report-export")
    await expectConsoleClean(consoleIssues)
  })

  test("desktop graph editor matrix covers drag, edit, viewport, and bridge restore", async ({ page }, testInfo) => {
    const consoleIssues = collectConsoleIssues(page)
    await page.setViewportSize({ width: 1280, height: 720 })
    await openWorkbench(page)

    const projectName = `Graph Matrix ${Date.now()}`
    await createAndSaveBrowserProject(page, projectName)
    await runFixture(page)

    await dragRegisteredObjectToGraphCanvas(page, {
      objectName: /object b/i,
      objectId: "object-b",
      label: "Object B",
      target: { xRatio: 0.72, yRatio: 0.36 },
    })
    const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
    await expect(graphCanvas.getByText("node-web-3").first()).toBeVisible()
    await expect(graphCanvas.getByText("object-b").first()).toBeVisible()

    await dragGraphNode(page, /node-b/i, { x: 88, y: 58 })
    await reorderFixturePathToReverse(page)
    await deleteFixtureEdge(page)
    await exerciseGraphViewportControls(page)
    await saveReloadAndRestoreGraphWorkspace(page, projectName)

    await expectNoFrameworkOverlay(page)
    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "desktop-graph-editor-matrix")
    await expectConsoleClean(consoleIssues)
  })

  test("narrow workbench layout keeps graph, energy, and report export usable", async ({ page }, testInfo) => {
    const consoleIssues = collectConsoleIssues(page)
    await page.setViewportSize({ width: 390, height: 840 })
    await openWorkbench(page)
    await runFixture(page)

    const objectRegistry = await expectRegionVisible(page, "Object Registry")
    const graphCanvas = await expectRegionVisible(page, "Graph Canvas")
    const energyPanel = await expectRegionVisible(page, "Energy Profile Panel")
    const exportPanel = await expectRegionVisible(page, "Report Export Panel")

    await objectRegistry.getByRole("button", { name: /object b/i }).click()
    await graphCanvas.getByRole("button", { name: "Add Node" }).click()
    await expect(graphCanvas.getByText("node-web-3").first()).toBeVisible()
    await graphCanvas.getByRole("button", { name: /node-b/i }).click()
    await graphCanvas.getByRole("button", { name: "Connect" }).click()
    await graphCanvas.getByRole("button", { name: /node-web-3/i }).click()
    await graphCanvas.getByRole("button", { name: "Set Path" }).click()
    await expect(graphCanvas.getByText("path-web-main").first()).toBeVisible()

    await graphCanvas.getByRole("button", { name: "Zoom In" }).click()
    await expect(graphCanvas.getByText("120%")).toBeVisible()
    await graphCanvas.getByRole("button", { name: "Reset" }).click()
    await expect(graphCanvas.getByText("100%")).toBeVisible()
    await expect(graphCanvas.getByLabel("Network Preview")).toBeVisible()

    await energyPanel.getByRole("button", { name: "Compute" }).click()
    await expect(energyPanel.getByText("profile-path-web-main-electronic-kcal_mol").first()).toBeVisible()
    await expect(energyPanel.getByText("Energy curve")).toBeVisible()

    await exportPanel.getByRole("button", { name: "Export" }).click()
    await expect(exportPanel.getByText("artifact-png-rxnflow-profile")).toBeVisible()
    await expect(exportPanel.getByRole("link", { name: "Download" })).toHaveCount(3)

    await expectNoFrameworkOverlay(page)
    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "narrow-workbench-flow")
    await expectConsoleClean(consoleIssues)
  })
})
