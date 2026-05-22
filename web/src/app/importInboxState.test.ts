import { describe, expect, it } from "vitest"
import {
  importPreviewArgs,
  importPreviewArgsFromFiles,
  initialImportInboxState,
} from "./importInboxState"

describe("importInboxState", () => {
  it("builds path preview args for fixture mode", () => {
    const args = importPreviewArgs({
      ...initialImportInboxState,
      selectedFiles: [
        {
          id: "water",
          name: "water.xyz",
          size: 42,
          storagePath: "inbox/water.xyz",
        },
      ],
      expectedFormat: "xyz",
      strict: true,
    }, "session-fixture-web")

    expect(args).toEqual({
      session_id: "session-fixture-web",
      source_paths: ["inbox/water.xyz"],
      expected_format: "xyz",
      strict: true,
    })
  })

  it("builds inline byte preview args from browser File objects", async () => {
    const result = await importPreviewArgsFromFiles({
      ...initialImportInboxState,
      selectedFiles: [
        {
          id: "water",
          name: "water.xyz",
          size: 8,
          mimeType: "chemical/x-xyz",
          storagePath: "inbox/water.xyz",
          file: new File(["2\nwater\n"], "water.xyz", { type: "chemical/x-xyz" }),
        },
      ],
      expectedFormat: "xyz",
      strict: true,
    }, "session-1", { preferInlineBytes: true })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files[0].sourceKind).toBe("inline_bytes")
    expect(result.args).toMatchObject({
      session_id: "session-1",
      expected_format: "xyz",
      strict: true,
      sources: [
        {
          kind: "inline_bytes",
          filename: "water.xyz",
          bytes_base64: "Mgp3YXRlcgo=",
          mime_type: "chemical/x-xyz",
        },
      ],
    })
  })

  it("returns payload_too_large before reading oversized inline files", async () => {
    const result = await importPreviewArgsFromFiles({
      ...initialImportInboxState,
      selectedFiles: [
        {
          id: "large",
          name: "large.xyz",
          size: 5,
          storagePath: "inbox/large.xyz",
          file: new File(["12345"], "large.xyz"),
        },
      ],
    }, "session-1", { preferInlineBytes: true, inlineByteLimit: 4 })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("payload_too_large")
    expect(result.error.target).toBe("bytes_base64")
    expect(result.files[0].sourceKind).toBe("inline_bytes")
  })
})
