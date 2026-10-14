import react from "@vitejs/plugin-react"
import { createRequire } from "node:module"
import type { Plugin } from "vite"
import { defineConfig } from "vitest/config"

const require = createRequire(import.meta.url)

function browserEngine(): Plugin {
  const { createBrowserEngineMiddleware } = require("./scripts/browser-engine.cjs")
  const { prepareDevEngine } = require("./scripts/dev-engine.cjs")
  const { shutdownEngineWorkers } = require("./electron/engine-bridge.cjs")
  return {
    name: "rxncanvas-python-engine",
    configureServer(server) {
      prepareDevEngine()
      server.middlewares.use(createBrowserEngineMiddleware())
      server.httpServer?.once("close", () => void shutdownEngineWorkers())
    },
    configurePreviewServer(server) {
      prepareDevEngine()
      server.middlewares.use(createBrowserEngineMiddleware())
      server.httpServer.once("close", () => void shutdownEngineWorkers())
    },
  }
}

export default defineConfig(({ mode }) => {
  const nodeEnv = mode === "production" ? "production" : "development"

  return {
    base: "./",
    plugins: [react(), ...(mode === "test" ? [] : [browserEngine()])],
    define: {
      global: "globalThis",
      "process.env.NODE_ENV": JSON.stringify(nodeEnv),
      "process.env": JSON.stringify({ NODE_ENV: nodeEnv }),
    },
    build: {
      manifest: true,
      chunkSizeWarningLimit: 17_000,
      modulePreload: {
        resolveDependencies(filename, deps) {
          if (filename.startsWith("KetcherEditorHost-")) return deps
          return deps.filter((dep) => !dep.includes("ketcher-vendor"))
        },
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("/node_modules/lodash/")) return "lodash-vendor"
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/e2e/**",
        "**/electron/**/*.test.cjs",
        "**/scripts/**/*.test.cjs",
      ],
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
    },
  }
})
