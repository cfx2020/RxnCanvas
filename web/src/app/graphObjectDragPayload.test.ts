import { describe, expect, it } from "vitest"
import {
  parseGraphObjectDragPayload,
  serializeGraphObjectDragPayload,
} from "./graphObjectDragPayload"

describe("graphObjectDragPayload", () => {
  it("serializes and parses registered object payloads", () => {
    const text = serializeGraphObjectDragPayload({
      kind: "registered-object",
      objectId: "object-b",
      label: "Object B",
    })

    expect(parseGraphObjectDragPayload(text)).toEqual({
      kind: "registered-object",
      objectId: "object-b",
      label: "Object B",
    })
  })

  it("rejects malformed and unsupported payloads", () => {
    expect(parseGraphObjectDragPayload("not-json")).toBeNull()
    expect(parseGraphObjectDragPayload("{}")).toBeNull()
    expect(parseGraphObjectDragPayload(JSON.stringify({
      kind: "import-item",
      objectId: "object-b",
      label: "Object B",
    }))).toBeNull()
    expect(parseGraphObjectDragPayload(JSON.stringify({
      kind: "registered-object",
      objectId: "",
      label: "Object B",
    }))).toBeNull()
    expect(parseGraphObjectDragPayload(JSON.stringify({
      kind: "registered-object",
      objectId: "object-b",
      label: "",
    }))).toBeNull()
  })
})
