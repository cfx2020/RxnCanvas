import { describe, expect, it } from "vitest"
import {
  exportFormatCapabilities,
  exportFormatCapability,
  extensionForExportFormat,
  mimeTypeForExportFormat,
  reportExportFormats,
  supportedExportFormats,
  supportsBrowserPersistence,
  writerIdForExportFormat,
} from "./exportFormatCapabilities"

describe("export format capabilities", () => {
  it("tracks supported and future report export formats from one table", () => {
    expect(exportFormatCapabilities.map((capability) => capability.format)).toEqual([
      "png",
      "cdxml",
      "xlsx",
      "csv",
      "svg",
      "pdf",
      "pptx",
      "cdx",
    ])
    expect(supportedExportFormats()).toEqual(["png", "cdxml", "xlsx", "csv"])
    expect(reportExportFormats()).toEqual(["png", "cdxml", "xlsx", "csv"])
    expect(exportFormatCapability("csv")).toMatchObject({
      extension: "csv",
      mimeType: "text/csv",
      writerId: "python-csv-energy-table-v1",
      fixtureWriterId: "fixture-csv-energy-table-v1",
      status: "supported",
      supportsBrowserPersistence: true,
      webDefaultEnabled: true,
    })
    expect(exportFormatCapability("svg")).toMatchObject({
      status: "experimental",
      artifactKind: "graph_snapshot",
    })
    expect(exportFormatCapability("cdx")?.unsupportedReason).toContain("CDX binary")
  })

  it("provides MIME, extension, writer id, and persistence guards", () => {
    expect(mimeTypeForExportFormat("png")).toBe("image/png")
    expect(mimeTypeForExportFormat("unknown")).toBe("application/octet-stream")
    expect(extensionForExportFormat("xlsx")).toBe("xlsx")
    expect(extensionForExportFormat("unknown")).toBe("unknown")
    expect(writerIdForExportFormat("cdxml")).toBe("rxnflow-cdxml-energy-v1")
    expect(writerIdForExportFormat("cdxml", true)).toBe("fixture-cdxml-energy-v1")
    expect(writerIdForExportFormat("csv")).toBe("python-csv-energy-table-v1")
    expect(writerIdForExportFormat("csv", true)).toBe("fixture-csv-energy-table-v1")
    expect(supportsBrowserPersistence("xlsx")).toBe(true)
    expect(supportsBrowserPersistence("csv")).toBe(true)
  })
})
