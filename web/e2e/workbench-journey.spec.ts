import { expect, test } from "playwright/test"
import {
  attachViewportScreenshot,
  applyAutoLayoutAndReplayHistory,
  buildImportedWaterPath,
  collectConsoleIssues,
  computeMissingEnergyProfile,
  createAndDeleteTemporaryGraphPath,
  createAndSaveBrowserProject,
  drawTemporaryEdgeWithPointer,
  dragGraphNode,
  dragRegisteredObjectToGraphCanvas,
  editFixtureEdgeLabel,
  exerciseNarrowGraphAdvancedControls,
  exerciseGraphViewportControls,
  expectBundleEntry,
  expectConsoleClean,
  expectNoFrameworkOverlay,
  expectNoHorizontalOverflow,
  expectRegionVisible,
  exportProjectBundleDownload,
  exportFixtureProfile,
  exportWithoutInlineBytes,
  importInvalidProjectBundleSample,
  importProjectBundleFile,
  openBrowserProject,
  openWorkbench,
  previewAndRegisterImport,
  rubberBandDeleteTemporaryNodes,
  reorderFixturePathToReverse,
  resetWorkbenchStorage,
  runFixture,
  saveReloadAndRestoreGraphWorkspace,
  nudgeFixtureNodeWithHistory,
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

  test("desktop graph editor matrix covers advanced editing and bridge restore", async ({ page }, testInfo) => {
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
    await expect(graphCanvas.getByText("node-web-3").first()).toBeVisible()
    await expect(graphCanvas.getByText("object-b").first()).toBeVisible()

    await dragGraphNode(page, /node-b/i, { x: 88, y: 58 })
    await applyAutoLayoutAndReplayHistory(page)
    await createAndDeleteTemporaryGraphPath(page)
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

  test("desktop project bundle backup and restore uses browser-local repository bytes", async ({ page }, testInfo) => {
    const consoleIssues = collectConsoleIssues(page)
    await page.setViewportSize({ width: 1280, height: 720 })
    await openWorkbench(page)

    const projectName = `Bundle QA ${Date.now()}`
    await createAndSaveBrowserProject(page, projectName)

    const bundle = await exportProjectBundleDownload(page)
    expectBundleEntry(bundle.entries, ".rxnflow/manifest.json")
    expectBundleEntry(bundle.entries, ".rxnflow/state/project-content.json")

    await page.reload({ waitUntil: "networkidle" })
    await openWorkbench(page)
    await importProjectBundleFile(page, bundle.path)
    await expect(page.getByText("No project loaded")).toBeVisible()
    await expect(page.getByText(projectName).first()).toBeVisible()

    await expectNoFrameworkOverlay(page)
    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "desktop-project-bundle-backup-restore")
    await expectConsoleClean(consoleIssues)
  })

  test("narrow project bundle rejects invalid imports without creating projects", async ({ page }, testInfo) => {
    const consoleIssues = collectConsoleIssues(page)
    await page.setViewportSize({ width: 390, height: 840 })
    await openWorkbench(page)

    const sidebar = page.getByRole("complementary", { name: "Project Sidebar" })
    await expect(sidebar.getByRole("button", { name: "Import Bundle" })).toBeVisible()
    await expect(sidebar.getByRole("button", { name: "Export Bundle" })).toBeDisabled()

    await importInvalidProjectBundleSample(page, "non_zip_bytes")
    await expect(sidebar.getByText("Project bundle is not a valid zip file.")).toBeVisible()
    await expect(sidebar.getByText("No browser-local projects")).toBeVisible()

    await importInvalidProjectBundleSample(page, "missing_manifest")
    await expect(sidebar.getByText("Project bundle is missing .rxnflow/manifest.json.")).toBeVisible()
    await expect(sidebar.getByText("No browser-local projects")).toBeVisible()

    await expectNoFrameworkOverlay(page)
    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "narrow-project-bundle-invalid-imports")
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
    await expect(graphCanvas.locator(".graph-viewport-bar output")).toHaveText("120%")
    await graphCanvas.getByRole("button", { name: "Reset", exact: true }).click()
    await expect(graphCanvas.locator(".graph-viewport-bar output")).toHaveText("100%")
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
