const { spawn } = require("node:child_process")
const { setTimeout: delay } = require("node:timers/promises")
const { chromium } = require("playwright")

const port = Number(process.env.RXNFLOW_PERF_E2E_PORT || 5175)
const baseUrl = `http://127.0.0.1:${port}/`
const budgets = {
  maxRafP95Ms: 50,
  maxLongFrames: 2,
  maxSidebarLayoutCount: 80,
  maxSidebarRecalcStyleCount: 80,
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log([
      "Run the Chromium workbench performance smoke.",
      `URL: ${baseUrl}`,
      `Budgets: RAF p95 <= ${budgets.maxRafP95Ms} ms, long frames <= ${budgets.maxLongFrames},`,
      `sidebar LayoutCount <= ${budgets.maxSidebarLayoutCount},`,
      `RecalcStyleCount <= ${budgets.maxSidebarRecalcStyleCount}.`,
    ].join("\n"))
    return
  }

  const server = startServer()
  try {
    await waitForServer()
    const browser = await chromium.launch({ headless: true })
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      try {
        const page = await context.newPage()
        const consoleErrors = []
        page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`))
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`)
        })
        await page.goto(baseUrl, { waitUntil: "networkidle" })
        await page.getByRole("button", { name: "Collapse project sidebar" }).or(
          page.getByRole("button", { name: "Expand project sidebar" }),
        ).first().waitFor()

        const cdp = await context.newCDPSession(page)
        await cdp.send("Performance.enable")
        const beforeSidebar = await readMetrics(cdp)
        const sidebarToggle = page.locator(
          'button[aria-label="Collapse project sidebar"], button[aria-label="Expand project sidebar"]',
        ).first()
        await sidebarToggle.click()
        await page.waitForTimeout(350)
        const afterSidebar = await readMetrics(cdp)

        const node = page.locator(".reaction-node").first()
        await node.scrollIntoViewIfNeeded()
        const box = await node.boundingBox()
        if (!box) throw new Error("Could not locate a visible reaction node for the drag measurement.")
        await page.evaluate(startFrameMeasurement)
        const startX = box.x + box.width / 2
        const startY = box.y + box.height / 2
        await page.mouse.move(startX, startY)
        await page.mouse.down()
        for (let step = 1; step <= 80; step += 1) {
          await page.mouse.move(startX + step * 2, startY + step * 0.4)
          await delay(8)
        }
        await page.mouse.up()
        await page.waitForTimeout(120)
        const drag = await page.evaluate(stopFrameMeasurement)
        const finalBox = await node.boundingBox()
        if (!finalBox || Math.hypot(finalBox.x - box.x, finalBox.y - box.y) < 1) {
          throw new Error("Drag measurement did not move the reaction node.")
        }

        const metrics = {
          raf: drag,
          sidebar: {
            layoutCount: metricDelta(beforeSidebar, afterSidebar, "LayoutCount"),
            recalcStyleCount: metricDelta(beforeSidebar, afterSidebar, "RecalcStyleCount"),
          },
          budgets,
          consoleErrors,
        }
        console.log(JSON.stringify(metrics, null, 2))
        assertBudgets(metrics)
      } finally {
        await context.close()
      }
    } finally {
      await browser.close()
    }
  } finally {
    await stopServer(server)
  }
}

function startFrameMeasurement() {
  const state = { frame: null, lastRaf: null, intervals: [] }
  window.__rxnflowPerf = state
  // Input events may be sparse even while the browser keeps rendering frames.
  function sample(timestamp) {
    if (state.lastRaf !== null) state.intervals.push(timestamp - state.lastRaf)
    state.lastRaf = timestamp
    state.frame = window.requestAnimationFrame(sample)
  }
  state.frame = window.requestAnimationFrame(sample)
}

function stopFrameMeasurement() {
  const state = window.__rxnflowPerf
  window.cancelAnimationFrame(state.frame)
  const ordered = state.intervals.slice().sort((a, b) => a - b)
  const p95Index = Math.min(ordered.length - 1, Math.ceil(ordered.length * 0.95) - 1)
  return {
    frameCount: ordered.length,
    minIntervalMs: ordered.length ? Number(ordered[0].toFixed(3)) : null,
    medianIntervalMs: ordered.length ? Number(ordered[Math.floor(ordered.length / 2)].toFixed(3)) : null,
    p95IntervalMs: ordered.length ? Number(ordered[p95Index].toFixed(3)) : null,
    maxIntervalMs: ordered.length ? Number(ordered[ordered.length - 1].toFixed(3)) : null,
    longFrameCount: ordered.filter((interval) => interval > 50).length,
  }
}

function startServer() {
  const command = process.platform === "win32" ? "npm.cmd" : "npm"
  return spawn(command, ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: require("node:path").resolve(__dirname, ".."),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  })
}

async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {}
    await delay(100)
  }
  throw new Error(`Performance server did not start at ${baseUrl}.`)
}

async function stopServer(server) {
  if (server.exitCode !== null || server.signalCode !== null) return
  server.kill("SIGTERM")
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    delay(5_000),
  ])
  if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL")
}

async function readMetrics(cdp) {
  const response = await cdp.send("Performance.getMetrics")
  return Object.fromEntries(response.metrics.map(({ name, value }) => [name, value]))
}

function metricDelta(before, after, name) {
  if (!(name in before) || !(name in after)) return null
  return Math.max(0, Math.round(after[name] - before[name]))
}

function assertBudgets(metrics) {
  const failures = []
  if (metrics.consoleErrors.length > 0) failures.push(`browser console errors: ${metrics.consoleErrors.join("; ")}`)
  if (!metrics.raf.frameCount) failures.push("RAF drag measurement captured no frames.")
  if (metrics.raf.p95IntervalMs === null || metrics.raf.p95IntervalMs > budgets.maxRafP95Ms) {
    failures.push(`RAF p95 interval ${metrics.raf.p95IntervalMs ?? "missing"} ms > ${budgets.maxRafP95Ms} ms`)
  }
  if (metrics.raf.longFrameCount > budgets.maxLongFrames) {
    failures.push(`long frames ${metrics.raf.longFrameCount} > ${budgets.maxLongFrames}`)
  }
  if (metrics.sidebar.layoutCount === null || metrics.sidebar.layoutCount > budgets.maxSidebarLayoutCount) {
    failures.push(`sidebar LayoutCount ${metrics.sidebar.layoutCount ?? "missing"} > ${budgets.maxSidebarLayoutCount}`)
  }
  if (metrics.sidebar.recalcStyleCount === null || metrics.sidebar.recalcStyleCount > budgets.maxSidebarRecalcStyleCount) {
    failures.push(`sidebar RecalcStyleCount ${metrics.sidebar.recalcStyleCount ?? "missing"} > ${budgets.maxSidebarRecalcStyleCount}`)
  }
  if (failures.length > 0) throw new Error(failures.join("\n"))
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}

module.exports = { startFrameMeasurement, stopFrameMeasurement, assertBudgets }
