import { createRetryableImport } from "./retryableImport"

export const loadKetcherEditorHostModule = createRetryableImport(() => import("./KetcherEditorHost"))

export function preloadKetcherEditorHost(): Promise<typeof import("./KetcherEditorHost")> {
  return loadKetcherEditorHostModule()
}
