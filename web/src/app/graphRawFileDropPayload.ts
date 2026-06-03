export const graphRawFileDropMimeType = "application/x-rxnflow-raw-file"

export type GraphRawFileDropPayload =
  | {
      kind: "external-file"
      sourceId: string
      name: string
      size: number
    }
  | {
      kind: "project-file"
      projectFileId: string
      path: string
    }

export function serializeGraphRawFileDropPayload(payload: GraphRawFileDropPayload): string {
  return JSON.stringify(payload)
}

export function parseGraphRawFileDropPayload(value: string): GraphRawFileDropPayload | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!isObject(parsed)) return null
    if (parsed.kind === "project-file") {
      if (typeof parsed.projectFileId !== "string" || parsed.projectFileId.trim().length === 0) return null
      if (typeof parsed.path !== "string" || parsed.path.trim().length === 0) return null
      return {
        kind: "project-file",
        projectFileId: parsed.projectFileId,
        path: parsed.path,
      }
    }
    if (parsed.kind === "external-file") {
      if (typeof parsed.sourceId !== "string" || parsed.sourceId.trim().length === 0) return null
      if (typeof parsed.name !== "string" || parsed.name.trim().length === 0) return null
      if (typeof parsed.size !== "number" || !Number.isFinite(parsed.size) || parsed.size < 0) return null
      return {
        kind: "external-file",
        sourceId: parsed.sourceId,
        name: parsed.name,
        size: parsed.size,
      }
    }
    return null
  } catch {
    return null
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
