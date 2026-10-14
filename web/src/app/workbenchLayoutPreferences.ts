export type WorkbenchLayoutPreference = {
  schemaVersion: 1
  leftSidebarOpen: boolean
  rightSidebarOpen: boolean
}

const storageKey = "rxncanvas-workbench-layout-v1"

export const defaultWorkbenchLayoutPreference: WorkbenchLayoutPreference = {
  schemaVersion: 1,
  leftSidebarOpen: true,
  rightSidebarOpen: true,
}

export function loadWorkbenchLayoutPreference(): WorkbenchLayoutPreference {
  if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") {
    return defaultWorkbenchLayoutPreference
  }
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as Partial<WorkbenchLayoutPreference> | null
    if (!value || value.schemaVersion !== 1) return defaultWorkbenchLayoutPreference
    return {
      schemaVersion: 1,
      leftSidebarOpen: typeof value.leftSidebarOpen === "boolean" ? value.leftSidebarOpen : true,
      rightSidebarOpen: typeof value.rightSidebarOpen === "boolean" ? value.rightSidebarOpen : true,
    }
  } catch {
    return defaultWorkbenchLayoutPreference
  }
}

export function saveWorkbenchLayoutPreference(preference: WorkbenchLayoutPreference) {
  if (typeof window === "undefined" || typeof window.localStorage?.setItem !== "function") return
  window.localStorage.setItem(storageKey, JSON.stringify(preference))
}
