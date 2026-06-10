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
  | {
      kind: "project-files"
      files: Array<{
        projectFileId: string
        path: string
      }>
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
    if (parsed.kind === "project-files") {
      if (!Array.isArray(parsed.files) || parsed.files.length === 0) return null
      const files = parsed.files.flatMap((file) => {
        if (!isObject(file)) return []
        if (typeof file.projectFileId !== "string" || file.projectFileId.trim().length === 0) return []
        if (typeof file.path !== "string" || file.path.trim().length === 0) return []
        return [{
          projectFileId: file.projectFileId,
          path: file.path,
        }]
      })
      if (files.length !== parsed.files.length) return null
      return { kind: "project-files", files }
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
