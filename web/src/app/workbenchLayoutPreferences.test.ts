import { beforeEach, describe, expect, it } from "vitest"
import {
  defaultWorkbenchLayoutPreference,
  loadWorkbenchLayoutPreference,
  saveWorkbenchLayoutPreference,
} from "./workbenchLayoutPreferences"

describe("workbench layout preferences", () => {
  const values = new Map<string, string>()

  beforeEach(() => {
    values.clear()
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })
  })

  it("persists both sidebar states", () => {
    saveWorkbenchLayoutPreference({ schemaVersion: 1, leftSidebarOpen: false, rightSidebarOpen: true })
    expect(loadWorkbenchLayoutPreference()).toEqual({ schemaVersion: 1, leftSidebarOpen: false, rightSidebarOpen: true })
  })

  it("falls back safely for malformed state", () => {
    window.localStorage.setItem("rxncanvas-workbench-layout-v1", "not-json")
    expect(loadWorkbenchLayoutPreference()).toEqual(defaultWorkbenchLayoutPreference)
  })
})
