import { describe, expect, it } from "vitest"
import {
  parseGraphRawFileDropPayload,
  serializeGraphRawFileDropPayload,
} from "./graphRawFileDropPayload"

describe("graph raw file drop payload", () => {
  it("roundtrips project raw file payloads", () => {
    const payload = {
      kind: "project-file" as const,
      projectFileId: "raw-abc123def456",
      path: "inputs/raw/abc123def456-water.extxyz",
    }

    expect(parseGraphRawFileDropPayload(serializeGraphRawFileDropPayload(payload))).toEqual(payload)
  })

  it("roundtrips external file descriptors", () => {
    const payload = {
      kind: "external-file" as const,
      sourceId: "picker-water",
      name: "water.xyz",
      size: 128,
    }

    expect(parseGraphRawFileDropPayload(serializeGraphRawFileDropPayload(payload))).toEqual(payload)
  })

  it("rejects malformed raw file payloads", () => {
    expect(parseGraphRawFileDropPayload("not json")).toBeNull()
    expect(parseGraphRawFileDropPayload(JSON.stringify({
      kind: "project-file",
      projectFileId: "raw-abc123def456",
      path: "",
    }))).toBeNull()
    expect(parseGraphRawFileDropPayload(JSON.stringify({
      kind: "external-file",
      sourceId: "source",
      name: "water.xyz",
      size: -1,
    }))).toBeNull()
  })
})
