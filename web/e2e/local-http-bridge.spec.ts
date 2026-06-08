import { expect, test } from "playwright/test"
import {
  attachViewportScreenshot,
  collectConsoleIssues,
  createAndSaveBrowserProject,
  dropExternalFileOnGraphCanvas,
  expectConsoleClean,
  expectNoHorizontalOverflow,
  openBrowserProject,
  openExportDock,
  openWorkbench,
  openProjectRail,
  runFixture,
  resetWorkbenchStorage,
  waitForAutoSave,
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

    await expect(page.getByText("Runtime Fixture")).toHaveCount(0)
    await expect(page.getByText("Runtime Local HTTP")).toHaveCount(0)

    const projectName = `Local HTTP E2E ${Date.now()}`
    await createAndSaveBrowserProject(page, projectName)
    await expect(page.getByText(projectName).first()).toBeVisible()
    await waitForAutoSave(page)

    await runFixture(page)
    await openProjectRail(page)
    await expect(page.getByRole("region", { name: "Object Registry" })).toHaveCount(0)

    await dropExternalFileOnGraphCanvas(page, {
      name: "water.xyz",
      mimeType: "chemical/x-xyz",
      text: "2\nEnergy = -1.5 Hartree\nH 0 0 0\nH 0 0 0.74\n",
    })
    const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
    await expect(graphCanvas.getByText("water.xyz").first()).toBeVisible()
    await expect(graphCanvas.getByText("Runtime Fixture")).toHaveCount(0)
    await expect(graphCanvas.getByText("Object A -> Object B").first()).toBeVisible()

    await expect(page.getByRole("region", { name: "Energy Profile Panel" })).toHaveCount(0)

    const exportPanel = await openExportDock(page)
    await exportPanel.getByRole("button", { name: "Export mode" }).click()
    await exportPanel.getByRole("button", { name: "Export", exact: true }).click()
    await expect(exportPanel.getByText("exports/rxnflow-profile.png")).toBeVisible()
    await expect(exportPanel.getByText("exports/rxnflow-profile.cdxml")).toBeVisible()
    await expect(exportPanel.getByText("exports/rxnflow-profile.xlsx")).toBeVisible()
    await expect(exportPanel.getByText("exports/rxnflow-profile.csv")).toBeVisible()
    await expect(exportPanel.getByText("exports/rxnflow-profile.svg")).toBeVisible()
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

    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "local-http-bridge-smoke")
    await expectConsoleClean(consoleIssues)
  })

  test("saves and reopens browser-local raw inputs through the local HTTP bridge", async ({ page }, testInfo) => {
    const consoleIssues = collectConsoleIssues(page)
    await page.setViewportSize({ width: 1280, height: 720 })
    await openWorkbench(page)

    const projectName = `Local HTTP Restore ${Date.now()}`
    await createAndSaveBrowserProject(page, projectName)

    await dropExternalFileOnGraphCanvas(page, {
      name: "water.xyz",
      mimeType: "chemical/x-xyz",
      text: "2\nEnergy = -1.5 Hartree\nH 0 0 0\nH 0 0 0.74\n",
    })
    await expect(page.getByRole("region", { name: "Graph Canvas" }).getByText("water.xyz").first()).toBeVisible()

    const sidebar = await openProjectRail(page)
    await expect(sidebar.getByRole("button", { name: new RegExp(projectName) })).toBeVisible()
    await expect(sidebar.getByText("water.xyz")).toBeVisible()
    await waitForAutoSave(page)

    await page.reload({ waitUntil: "networkidle" })
    await openWorkbench(page)
    await openBrowserProject(page, projectName)
    await expect(page.getByText(projectName).first()).toBeVisible()
    await expect(page.getByRole("complementary", { name: "Project Sidebar" }).getByText("water.xyz")).toBeVisible()
    await expect(page.getByRole("region", { name: "Graph Canvas" }).getByText("water.xyz").first()).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "local-http-project-save-restore")
    await expectConsoleClean(consoleIssues)
  })
})
