import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig(({ mode }) => {
  const nodeEnv = mode === "production" ? "production" : "development"

  return {
    base: "./",
    plugins: [react()],
    define: {
      global: "globalThis",
      "process.env.NODE_ENV": JSON.stringify(nodeEnv),
      "process.env": JSON.stringify({ NODE_ENV: nodeEnv }),
    },
    build: {
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
      exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
    },
  }
})
