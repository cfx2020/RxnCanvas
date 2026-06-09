import { unzipSync } from "fflate"
import { expect, test, type Locator, type Page } from "playwright/test"
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

    await runRuntimeFixtureForExport(page)
    await expect(page.getByRole("region", { name: "Object Registry" })).toHaveCount(0)
    const graphCanvas = page.getByRole("region", { name: "Graph Canvas" })
    await expect(graphCanvas.getByText("Runtime Fixture")).toHaveCount(0)

    await expect(page.getByRole("region", { name: "Energy Profile Panel" })).toHaveCount(0)

    const exportPanel = await openExportDock(page)
    await expect(exportPanel.getByRole("button", { name: "Export", exact: true })).toBeEnabled()
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
    await expectLocalHttpDownloadBytes(exportPanel, {
      cdxmlText: ["0.00 kcal/mol", "12.55 kcal/mol"],
      xlsxValues: ["-100", "-99.98"],
    })

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
    await expect(page.getByRole("region", { name: "Graph Canvas" }).locator(".graph-node-card").filter({ hasText: "Energy = -1.5 Hartree" })).toBeVisible()

    const sidebar = await openProjectRail(page)
    await expect(sidebar.getByRole("button", { name: new RegExp(projectName) })).toBeVisible()
    await expect(sidebar.getByText("water.xyz")).toBeVisible()
    await waitForAutoSave(page)

    await page.reload({ waitUntil: "networkidle" })
    await openWorkbench(page)
    await openBrowserProject(page, projectName)
    await expect(page.getByText(projectName).first()).toBeVisible()
    await expect(page.getByRole("complementary", { name: "Project Sidebar" }).getByText("water.xyz")).toBeVisible()
    await expect(page.getByRole("region", { name: "Graph Canvas" }).locator(".graph-node-card").filter({ hasText: "Energy = -1.5 Hartree" })).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await attachViewportScreenshot(page, testInfo, "local-http-project-save-restore")
    await expectConsoleClean(consoleIssues)
  })
})

async function runRuntimeFixtureForExport(page: Page) {
  await page.evaluate(async () => {
    const api = (window as Window & {
      __rxnflowWorkbenchTest?: { runFixture: () => Promise<void> }
    }).__rxnflowWorkbenchTest
    if (!api) throw new Error("Workbench test API is not available.")
    await api.runFixture()
  })
}

async function expectLocalHttpDownloadBytes(
  exportPanel: Locator,
  expected: { cdxmlText: string[]; xlsxValues: string[] },
) {
  const links = exportPanel.getByRole("link", { name: "Download" })
  const pngBytes = dataUrlBytes(await links.nth(0).getAttribute("href"))
  expect([...pngBytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])

  const cdxmlText = new TextDecoder().decode(dataUrlBytes(await links.nth(1).getAttribute("href")))
  expect(cdxmlText).toContain("<CDXML")
  for (const label of expected.cdxmlText) {
    expect(cdxmlText).toContain(label)
  }

  const xlsxBytes = dataUrlBytes(await links.nth(2).getAttribute("href"))
  expect([...xlsxBytes.slice(0, 4)]).toEqual([80, 75, 3, 4])
  const xlsxEntries = unzipSync(xlsxBytes)
  expect(Object.keys(xlsxEntries)).toContain("xl/workbook.xml")
  const sheetText = new TextDecoder().decode(xlsxEntries["xl/worksheets/sheet1.xml"])
  for (const value of expected.xlsxValues) {
    expect(sheetText).toContain(value)
  }
}

function dataUrlBytes(href: string | null): Uint8Array {
  expect(href).toBeTruthy()
  const marker = ";base64,"
  const markerIndex = href!.indexOf(marker)
  expect(markerIndex).toBeGreaterThan(0)
  return new Uint8Array(Buffer.from(href!.slice(markerIndex + marker.length), "base64"))
}
