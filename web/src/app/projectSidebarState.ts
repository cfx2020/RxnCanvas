import type {
  BrowserProjectRepositoryErrorCode,
  BrowserProjectRef,
  BrowserProjectRepositoryError,
  BrowserProjectRepositoryErrorPayload,
  BrowserWriteReceipt,
} from "../repository"
import type { MessageKey, MessageParams } from "./i18n"
import type { BrowserContentValidation } from "./projectContentBridge"

export type ProjectPersistenceState = "empty" | "dirty" | "saving" | "persisted" | "error"
export type ProjectBridgeState = "idle" | "opening" | "open" | "saving" | "error"

export type SidebarValidationStatus = {
  state: "unknown" | "missing" | "valid" | "error"
  messageKey: MessageKey
  messageParams?: MessageParams
  checksum?: string
  checkedAt?: string
}

export type ProjectSidebarState = {
  status: "idle" | "loading" | "ready" | "error"
  projects: BrowserProjectRef[]
  activeProjectRef?: string
  activeProject?: BrowserProjectRef
  persistence: ProjectPersistenceState
  validation: SidebarValidationStatus
  bridge: {
    state: ProjectBridgeState
    sessionId?: string
  }
  lastWrite?: BrowserWriteReceipt
  error?: BrowserProjectRepositoryErrorPayload
}

export const initialProjectSidebarState: ProjectSidebarState = {
  status: "idle",
  projects: [],
  persistence: "empty",
  bridge: {
    state: "idle",
  },
  validation: {
    state: "unknown",
    messageKey: "projectSidebar.validation.noProject",
  },
}

export function projectSidebarErrorPayload(
  error: BrowserProjectRepositoryError,
): BrowserProjectRepositoryErrorPayload {
  return error.toJSON()
}

export function projectSidebarMissingValidation(path = ".rxnflow/state/project-content.json"): SidebarValidationStatus {
  return {
    state: "missing",
    messageKey: "projectSidebar.validation.contentMissing",
    messageParams: { path },
    checkedAt: new Date().toISOString(),
  }
}

export function projectSidebarValidValidation(
  checksum: string,
  checkedAt = new Date().toISOString(),
): SidebarValidationStatus {
  return {
    state: "valid",
    messageKey: "projectSidebar.validation.contentReadable",
    checksum,
    checkedAt,
  }
}

export function projectSidebarErrorValidation(
  error: BrowserProjectRepositoryErrorPayload,
): SidebarValidationStatus {
  return {
    state: "error",
    messageKey: "projectSidebar.errorMessage",
    messageParams: { message: error.message },
    checkedAt: new Date().toISOString(),
  }
}

export function projectSidebarBridgeValidation(
  validation: BrowserContentValidation,
): SidebarValidationStatus {
  if (validation.state === "valid") {
    return projectSidebarValidValidation(validation.checksum ?? "", validation.checkedAt)
  }
  if (validation.state === "missing") {
    return projectSidebarMissingValidation(validation.path)
  }
  return projectSidebarErrorValidation({
    code: (validation.error?.code ?? "storage_failed") as BrowserProjectRepositoryErrorCode,
    message: validation.error?.message ?? "Browser project content validation failed.",
    target: validation.error?.target ?? validation.path ?? null,
  })
}
