import { expect, test } from "playwright/test"
import {
  attachViewportScreenshot,
  collectConsoleIssues,
  createAndSaveBrowserProject,
  expectBundleEntry,
  expectConsoleClean,
  expectNoHorizontalOverflow,
  exportProjectBundleDownload,
  importProjectBundleFile,
  openWorkbench,
  resetWorkbenchStorage,
} from "./workbench-helpers"

test.describe("RxnFlow local-http bridge E2E", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies()
    await resetWorkbenchStorage(page)
  })

  test("runs the workbench smoke through the Python local HTTP bridge", async ({ page }, testInfo) => {
    const consoleIssues = collectConsoleIssues(page)
    await page.setViewportSize({ width: 1280, height: 720 })
    await openWorkbench(page)

    const runtimeBadge = page.getByText("Runtime Local HTTP")
    await expect(runtimeBadge).toBeVisible()
    await expect(runtimeBadge).toHaveAttribute("title", "Endpoint http://127.0.0.1:8766/api/shell")
    await expect(page.getByText("Runtime Fixture")).toHaveCount(0)

    const projectName = `Local HTTP E2E ${Date.now()}`
    await createAndSaveBrowserProject(page, projectName)
    await page.getByRole("button", { name: "Open Bridge" }).click()
    await expect(page.getByText("Open", { exact: true }).first()).toBeVisible()
    await expect(page.getByText(projectName).first()).toBeVisible()
    await page.getByRole("button", { name: "Save Bridge" }).click()
    await expect(page.getByText("Project content files are readable.")).toBeVisible()

    await page.getByRole("button", { name: "Fixture Run" }).click()
    await expect(page.getByText("fixture-minimal-reaction")).toBeVisible()
    await expect(page.getByText("project-fixture-minimal-reaction").first()).toBeVisible()
    const objectRegistry = page.getByRole("region", { name: "Object Registry" })
    await expect(objectRegistry.getByRole("button", { name: /Fixture A/ })).toBeVisible()
    await expect(objectRegistry.getByRole("button", { name: /Fixture B/ })).toBeVisible()

    const importInbox = page.getByRole("region", { name: "Import Inbox" })
    await importInbox.getByLabel("Select Files").setInputFiles({
      name: "water.xyz",
      mimeType: "chemical/x-xyz",
      buffer: Buffer.from("2\nEnergy = -1.5 Hartree\nH 0 0 0\nH 0 0 0.74\n"),
    })
    await importInbox.getByLabel("Expected format").selectOption("xyz")
    await importInbox.getByRole("button", { name: "Preview" }).click()

    await expect(importInbox.getByText("xyz-ase").first()).toBeVisible()
    await expect(importInbox.getByText("Inline bytes").first()).toBeVisible()
    await expect(importInbox.getByText("import-batch-fixture-web-1")).toHaveCount(0)

    const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
    await graphCanvas.getByRole("button", { name: "Open Workspace" }).click()
    await expect(graphCanvas.getByText("No workspace graph")).toBeVisible()
    await objectRegistry.getByRole("button", { name: "Fixture A" }).click()
    await graphCanvas.getByRole("button", { name: "Add Node" }).click()
    await expect(graphCanvas.getByText("Fixture A").first()).toBeVisible()
    await objectRegistry.getByRole("button", { name: "Fixture B" }).click()
    await graphCanvas.getByRole("button", { name: "Add Node" }).click()
    await expect(graphCanvas.getByText("Fixture B").first()).toBeVisible()
    await graphCanvas.getByRole("button", { name: /Fixture A node-/ }).click()
    await graphCanvas.getByRole("button", { name: "Connect" }).click()
    await graphCanvas.getByRole("button", { name: /Fixture B node-/ }).click()
    await expect(graphCanvas.getByText("No disconnected nodes")).toBeVisible()
    await graphCanvas.getByRole("button", { name: "Set Path" }).click()
    await expect(graphCanvas.getByText("path-web-main").first()).toBeVisible()

    const energyPanel = page.getByRole("region", { name: "Energy Profile Panel" })
    await energyPanel.getByRole("button", { name: "Compute" }).click()
    await expect(energyPanel.getByText("profile-web-main-electronic-kcal_mol-raw").first()).toBeVisible()
    await expect(energyPanel.getByText("Energy curve")).toBeVisible()

    const exportPanel = page.getByRole("region", { name: "Report Export Panel" })
    await exportPanel.getByRole("button", { name: "Export" }).click()
    await expect(exportPanel.getByText(/artifact-png-[a-f0-9]{12}/).first()).toBeVisible()
    await expect(exportPanel.getByText(/artifact-cdxml-[a-f0-9]{12}/).first()).toBeVisible()
    await expect(exportPanel.getByText(/artifact-xlsx-[a-f0-9]{12}/).first()).toBeVisible()
    await expect(exportPanel.getByText("exports/rxnflow-profile.png")).toBeVisible()
    await expect(exportPanel.getByText("exports/rxnflow-profile.cdxml")).toBeVisible()
    await expect(exportPanel.getByText("exports/rxnflow-profile.xlsx")).toBeVisible()
    await expect(exportPanel.getByText("pillow-energy-plot-v1")).toBeVisible()
    await expect(exportPanel.getByText("rxnflow-cdxml-energy-v1")).toBeVisible()
    await expect(exportPanel.getByText("xlsxwriter-energy-workbook-v1")).toBeVisible()
    await expect(exportPanel.getByText("energy_table_schema_version")).toBeVisible()
    await expect(exportPanel.getByText("energy-table-v1")).toBeVisible()
    await expect(exportPanel.getByText("energy_table_column_count")).toBeVisible()
    await expect(exportPanel.getByText(/^sha256:[a-f0-9]{64}$/).first()).toBeVisible()
    await expect(exportPanel.getByRole("link", { name: "Download" })).toHaveCount(3)
    await expect(exportPanel.getByRole("link", { name: "Download" }).nth(1)).toHaveAttribute("download", "rxnflow-profile.cdxml")
    await expect(exportPanel.getByRole("link", { name: "Download" }).nth(1)).toHaveAttribute("href", /^data:chemical\/x-cdxml;base64,/)
    await expect(exportPanel.getByRole("link", { name: "Download" }).nth(2)).toHaveAttribute("download", "rxnflow-profile.xlsx")
    await expect(exportPanel.getByRole("link", { name: "Download" }).nth(2)).toHaveAttribute("href", /^data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet;base64,/)

    await expect(page.getByText("3 artifacts indexed")).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "local-http-bridge-smoke")
    await expectConsoleClean(consoleIssues)
  })

  test("exports, imports, and opens a browser project bundle through the local HTTP bridge", async ({ page }, testInfo) => {
    const consoleIssues = collectConsoleIssues(page)
    await page.setViewportSize({ width: 1280, height: 720 })
    await openWorkbench(page)

    const projectName = `Local HTTP Bundle ${Date.now()}`
    await createAndSaveBrowserProject(page, projectName)

    const importInbox = page.getByRole("region", { name: "Import Inbox" })
    await importInbox.getByLabel("Select Files").setInputFiles({
      name: "water.xyz",
      mimeType: "chemical/x-xyz",
      buffer: Buffer.from("2\nEnergy = -1.5 Hartree\nH 0 0 0\nH 0 0 0.74\n"),
    })
    await importInbox.getByLabel("Expected format").selectOption("xyz")
    await importInbox.getByRole("button", { name: "Preview" }).click()
    await expect(importInbox.getByText("Persisted raw input")).toBeVisible()
    await expect(importInbox.getByText(/inputs\/raw\/[a-f0-9]{12}-water\.xyz/)).toBeVisible()

    const sidebar = page.getByRole("complementary", { name: "Project Sidebar" })
    await sidebar.getByRole("button", { name: "Open Bridge" }).click()
    await expect(sidebar.getByText("Open", { exact: true })).toBeVisible()
    await sidebar.getByRole("button", { name: "Save Bridge" }).click()
    await expect(sidebar.getByText("Project content files are readable.")).toBeVisible()

    const bundle = await exportProjectBundleDownload(page)
    const bundleEntries = bundle.entries
    expectBundleEntry(bundleEntries, ".rxnflow/manifest.json")
    expectBundleEntry(bundleEntries, ".rxnflow/state/project-content.json")
    expectBundleEntry(bundleEntries, ".rxnflow/state/workspaces.json")
    expectBundleEntry(bundleEntries, ".rxnflow/state/reaction-graphs.json")
    expect(bundleEntries.some((entry) => /\/inputs\/raw\/[a-f0-9]{12}-water\.xyz$/.test(entry))).toBe(true)

    await page.reload({ waitUntil: "networkidle" })
    await openWorkbench(page)
    await importProjectBundleFile(page, bundle.path)
    await expect(sidebar.getByText("No project loaded")).toBeVisible()
    await sidebar.getByRole("button", { name: "Open Bridge" }).click()
    await expect(sidebar.getByText("Open", { exact: true })).toBeVisible()
    await expect(page.getByText(projectName).first()).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "local-http-bundle-roundtrip")
    await expectConsoleClean(consoleIssues)
  })
})
