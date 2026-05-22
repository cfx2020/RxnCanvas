import { defineConfig, devices } from "playwright/test"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const bridgePort = 8766
const vitePort = 5176
const bridgeEndpoint = `http://127.0.0.1:${bridgePort}/api/shell`
const webRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(webRoot, "..")
const pythonExecutable = process.env.RXNFLOW_E2E_PYTHON
  ?? (process.env.CONDA_PREFIX ? resolve(process.env.CONDA_PREFIX, "bin", "python3") : "python3")
const bridgeCommand = `PYTHONPATH=${repoRoot} ${JSON.stringify(pythonExecutable)} -c "from rxnflow.local_bridge import serve_local_bridge; serve_local_bridge('127.0.0.1', ${bridgePort})"`

export default defineConfig({
  testDir: "./e2e",
  testMatch: /local-http-bridge\.spec\.ts/,
  outputDir: "./test-results-local-http",
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-local-http" }]],
  use: {
    baseURL: `http://127.0.0.1:${vitePort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: [
    {
      command: bridgeCommand,
      port: bridgePort,
      reuseExistingServer: true,
      timeout: 30_000,
      cwd: repoRoot,
      stderr: "pipe",
      stdout: "pipe",
    },
    {
      command: `VITE_RXNFLOW_SHELL_TRANSPORT=local-http VITE_RXNFLOW_SHELL_ENDPOINT=${bridgeEndpoint} npm run dev -- --host 127.0.0.1 --port ${vitePort}`,
      port: vitePort,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: "chromium-local-http",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
})
