import { describe, expect, it } from "vitest"
import {
  importPreviewArgs,
  importPreviewArgsFromFiles,
  initialTransientImportState,
} from "./transientImportState"

describe("transientImportState", () => {
  it("builds path preview args for fixture mode", () => {
    const args = importPreviewArgs({
      ...initialTransientImportState,
      selectedFiles: [
        {
          id: "water",
          name: "water.xyz",
          size: 42,
          storagePath: "transient/water.xyz",
        },
      ],
      expectedFormat: "xyz",
      strict: true,
    }, "session-fixture-web")

    expect(args).toEqual({
      session_id: "session-fixture-web",
      source_paths: ["transient/water.xyz"],
      expected_format: "xyz",
      strict: true,
    })
  })

  it("builds inline byte preview args from browser File objects", async () => {
    const result = await importPreviewArgsFromFiles({
      ...initialTransientImportState,
      selectedFiles: [
        {
          id: "water",
          name: "water.xyz",
          size: 8,
          mimeType: "chemical/x-xyz",
          storagePath: "transient/water.xyz",
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

  it("preserves raw persistence state while deriving preview sources", async () => {
    const result = await importPreviewArgsFromFiles({
      ...initialTransientImportState,
      selectedFiles: [
        {
          id: "water",
          name: "water.xyz",
          size: 8,
          storagePath: "transient/water.xyz",
          file: new File(["2\nwater\n"], "water.xyz"),
          rawPersistence: {
            state: "persisted",
            resource: {
              id: "raw-demo",
              kind: "raw_file",
              path: "inputs/raw/demo-water.xyz",
              checksum: "sha256:demo",
              metadata: {
                source_name: "water.xyz",
                byte_size: 8,
              },
            },
          },
        },
      ],
    }, "session-1", { preferInlineBytes: true })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files[0].rawPersistence).toEqual({
      state: "persisted",
      resource: expect.objectContaining({
        id: "raw-demo",
        path: "inputs/raw/demo-water.xyz",
      }),
    })
  })

  it("returns payload_too_large before reading oversized inline files", async () => {
    const result = await importPreviewArgsFromFiles({
      ...initialTransientImportState,
      selectedFiles: [
        {
          id: "large",
          name: "large.xyz",
          size: 5,
          storagePath: "transient/large.xyz",
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

  it("allows local-http inline files above the former small demo limit", async () => {
    const result = await importPreviewArgsFromFiles({
      ...initialTransientImportState,
      selectedFiles: [
        {
          id: "gaussian-log",
          name: "sample.log",
          size: 1024 * 1024 + 1,
          storagePath: "transient/sample.log",
          file: new File([new Uint8Array(1024 * 1024 + 1)], "sample.log"),
        },
      ],
    }, "session-1", { preferInlineBytes: true })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.args.sources).toEqual([
      expect.objectContaining({
        kind: "inline_bytes",
        filename: "sample.log",
      }),
    ])
  })
})
