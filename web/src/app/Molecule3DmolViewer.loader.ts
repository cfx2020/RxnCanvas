import { createRetryableImport } from "./retryableImport"

export const load3DmolModule = createRetryableImport(() => import("3dmol"))

export function preload3Dmol(): Promise<typeof import("3dmol")> {
  return load3DmolModule()
}
