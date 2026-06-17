import { describe, expect, it } from "vitest"
import { blobPartFromData, bytesToBase64 } from "./browserDownloads"

describe("browserDownloads", () => {
  it("base64 encodes binary artifact content for desktop IPC", () => {
    expect(bytesToBase64(new Uint8Array([65, 66, 67]))).toBe("QUJD")
  })

  it("copies typed-array data before handing it to Blob", () => {
    const source = new Uint8Array([1, 2, 3])
    const part = blobPartFromData(source)
    source[0] = 9

    expect(Array.from(new Uint8Array(part as ArrayBuffer))).toEqual([1, 2, 3])
  })
})
