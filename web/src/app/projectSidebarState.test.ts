import { describe, expect, it } from "vitest"
import {
  BrowserProjectRepositoryError,
} from "../repository"
import {
  initialProjectSidebarState,
  projectSidebarBridgeValidation,
  projectSidebarErrorPayload,
  projectSidebarErrorValidation,
  projectSidebarMissingValidation,
  projectSidebarValidValidation,
} from "./projectSidebarState"
import { projectContentIndexPath } from "./projectContentBridge"

describe("project sidebar state contract", () => {
  it("starts with an empty browser-local project sidebar state", () => {
    expect(initialProjectSidebarState).toEqual({
      status: "idle",
      projects: [],
      persistence: "empty",
      bridge: {
        state: "idle",
      },
      projectFiles: [],
      validation: {
        state: "unknown",
        messageKey: "projectSidebar.validation.noProject",
      },
    })
  })

  it("keeps repository errors JSON-safe for sidebar rendering", () => {
    const error = new BrowserProjectRepositoryError({
      code: "storage_unavailable",
      message: "IndexedDB is not available in this browser context.",
      target: "indexedDB",
      details: { name: "InvalidStateError" },
    })

    const payload = projectSidebarErrorPayload(error)
    const validation = projectSidebarErrorValidation(payload)

    expect(payload).toEqual({
      code: "storage_unavailable",
      message: "IndexedDB is not available in this browser context.",
      target: "indexedDB",
      details: { name: "InvalidStateError" },
    })
    expect(() => JSON.stringify(payload)).not.toThrow()
    expect(validation.state).toBe("error")
    expect(validation.messageKey).toBe("projectSidebar.errorMessage")
    expect(validation.messageParams).toEqual({ message: payload.message })
    expect(new Date(validation.checkedAt ?? "").toString()).not.toBe("Invalid Date")
  })

  it("represents shallow sidebar validation status", () => {
    const missing = projectSidebarMissingValidation()
    const valid = projectSidebarValidValidation("sha256:abc", "2026-05-20T01:02:03.000Z")

    expect(missing.state).toBe("missing")
    expect(missing.messageKey).toBe("projectSidebar.validation.contentMissing")
    expect(missing.messageParams).toEqual({ path: projectContentIndexPath })
    expect(valid).toEqual({
      state: "valid",
      messageKey: "projectSidebar.validation.contentReadable",
      checksum: "sha256:abc",
      checkedAt: "2026-05-20T01:02:03.000Z",
    })
  })

  it("maps browser content validation into sidebar validation", () => {
    expect(projectSidebarBridgeValidation({
      state: "valid",
      checksum: "sha256:def",
      checkedAt: "2026-05-20T01:02:03.000Z",
    })).toMatchObject({
      state: "valid",
      checksum: "sha256:def",
    })
    expect(projectSidebarBridgeValidation({
      state: "missing",
      path: ".rxnflow/state/workspaces.json",
      checkedAt: "2026-05-20T01:02:03.000Z",
    })).toMatchObject({
      state: "missing",
      messageParams: { path: ".rxnflow/state/workspaces.json" },
    })
    expect(projectSidebarBridgeValidation({
      state: "error",
      checkedAt: "2026-05-20T01:02:03.000Z",
      error: {
        code: "checksum_mismatch",
        message: "Checksum mismatch.",
        target: ".rxnflow/state/chemical-objects.json",
      },
    })).toMatchObject({
      state: "error",
      messageParams: { message: "Checksum mismatch." },
    })
  })
})
