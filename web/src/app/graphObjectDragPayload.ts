export const graphObjectDragMimeType = "application/x-rxnflow-graph-object"

export type GraphObjectDragPayload = {
  kind: "registered-object"
  objectId: string
  label: string
}

export function serializeGraphObjectDragPayload(payload: GraphObjectDragPayload): string {
  return JSON.stringify(payload)
}

export function parseGraphObjectDragPayload(value: string): GraphObjectDragPayload | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!isObject(parsed)) return null
    if (parsed.kind !== "registered-object") return null
    if (typeof parsed.objectId !== "string" || parsed.objectId.trim().length === 0) return null
    if (typeof parsed.label !== "string" || parsed.label.trim().length === 0) return null
    return {
      kind: "registered-object",
      objectId: parsed.objectId,
      label: parsed.label,
    }
  } catch {
    return null
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
