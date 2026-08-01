import { describe, expect, it } from "vitest"
import type { FlowNode, SourceFile } from "../domain/projectPackages"
import {
  dataTransferHasFiles,
  dataTransferTypes,
  deleteSourceFileTransition,
  displayExportDestination,
  filesFromDataTransfer,
  formatBytes,
  nodeSourceDetailsSelection,
  projectFileDragMimeType,
  projectFileDragPath,
  projectFileIdsFromDataTransfer,
  safeRawFileName,
  selectedFileIdsForAction,
  selectSourceFileTransition,
  sourceFileDisplayGroupKey,
  sourceFileGroupsForDisplay,
  sourceFileLooksLikeSolutionLog,
  sourceKindFromName,
} from "./fileDisplay"

function sourceFile(id: string, name: string, kind: string, storedPath?: string): SourceFile {
  return {
    id,
    name,
    kind,
    size: 1234,
    status: "parsed",
    preview: "",
    storedPath,
  }
}

function flowNode(id: string, sourceFileId?: string): FlowNode {
  return {
    id,
    label: id,
    formula: "H2",
    kind: "intermediate",
    method: "DFT",
    solvent: "none",
    energyGas: null,
    energySolution: null,
    energyUnit: "hartree",
    sourceFileId,
    position: { x: 0, y: 0 },
  }
}

function mockDataTransfer({
  dragPayload,
  files = [],
  types = dragPayload ? [projectFileDragMimeType] : [],
}: {
  dragPayload?: unknown
  files?: File[]
  types?: string[]
}): DataTransfer {
  return {
    files,
    types,
    getData: (type: string) => type === projectFileDragMimeType && dragPayload !== undefined
      ? JSON.stringify(dragPayload)
      : "",
  } as unknown as DataTransfer
}

describe("fileDisplay", () => {
  it("formats byte sizes for compact project rows", () => {
    expect(formatBytes(42)).toBe("42 B")
    expect(formatBytes(2048)).toBe("2.0 KB")
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB")
  })

  it("classifies source files by extension", () => {
    expect(sourceKindFromName("ts.log")).toBe("Gaussian")
    expect(sourceKindFromName("orca.OUT")).toBe("ORCA")
    expect(sourceKindFromName("path.extxyz")).toBe("XYZ")
    expect(sourceKindFromName("notes.txt")).toBe("Raw")
  })

  it("keeps export destinations readable without exposing long local paths", () => {
    expect(displayExportDestination("browser-download")).toBe("browser download")
    expect(displayExportDestination("exports/report.png")).toBe("exports/report.png")
    expect(displayExportDestination("/Users/me/project/output/report.png")).toBe(".../output/report.png")
  })

  it("groups gas and solution logs into one structure row", () => {
    const gas = sourceFile("gas", "TS1.log", "Gaussian")
    const solution = sourceFile("solution", "TS1-sol.log", "Gaussian")
    const unrelated = sourceFile("xyz", "scan.xyz", "XYZ")

    const groups = sourceFileGroupsForDisplay([solution, unrelated, gas])

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      id: "gas",
      displayName: "TS1",
      displayKind: "Gaussian",
      hasGasLog: true,
      hasSolutionLog: true,
      hasParsedGasLog: true,
      hasParsedSolutionLog: true,
    })
    expect(groups[0].files.map((file) => file.id)).toEqual(["gas", "solution"])
    expect(groups[1]).toMatchObject({
      id: "xyz",
      displayName: "scan.xyz",
      displayKind: "XYZ",
      hasGasLog: false,
      hasSolutionLog: false,
      hasParsedGasLog: false,
      hasParsedSolutionLog: false,
    })
  })

  it("groups solution logs by filename even when the parser cannot classify the source kind", () => {
    const gas = sourceFile("gas", "i1p6.log", "Gaussian")
    const solution = sourceFile("solution", "i1p6-sol.log", "Raw")

    const groups = sourceFileGroupsForDisplay([solution, gas])

    expect(sourceFileDisplayGroupKey(solution)).toBe("i1p6")
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      id: "gas",
      displayName: "i1p6",
      hasGasLog: true,
      hasSolutionLog: true,
      hasParsedGasLog: true,
      hasParsedSolutionLog: true,
    })
    expect(groups[0].files.map((file) => file.id)).toEqual(["gas", "solution"])
  })

  it("marks solution-only groups as missing their gas counterpart", () => {
    const solution = sourceFile("solution", "i1p6-sol.log", "Gaussian")

    const groups = sourceFileGroupsForDisplay([solution])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      id: "solution",
      displayName: "i1p6-sol.log",
      hasGasLog: false,
      hasSolutionLog: true,
      hasParsedGasLog: false,
      hasParsedSolutionLog: true,
    })
  })

  it("pairs gas and solution logs when the solvent token sits in the middle of the name", () => {
    const gas = sourceFile("gas", "S-i1-PhCF3.log", "Gaussian")
    const solution = sourceFile("solution", "S-i1-sol-PhCF3.log", "Gaussian")

    expect(sourceFileDisplayGroupKey(gas)).toBe("s-i1-phcf3")
    expect(sourceFileDisplayGroupKey(solution)).toBe("s-i1-phcf3")
    expect(sourceFileLooksLikeSolutionLog(solution)).toBe(true)
    expect(sourceFileLooksLikeSolutionLog(gas)).toBe(false)

    const groups = sourceFileGroupsForDisplay([solution, gas])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      id: "gas",
      displayName: "S-i1-PhCF3",
      hasGasLog: true,
      hasSolutionLog: true,
    })
    expect(groups[0].files.map((file) => file.id)).toEqual(["gas", "solution"])
  })

  it("derives additive, range, and replacement file selections", () => {
    const gas = sourceFile("gas", "TS1.log", "Gaussian")
    const solution = sourceFile("solution", "TS1-sol.log", "Gaussian")
    const xyz = sourceFile("xyz", "scan.xyz", "XYZ")
    const files = [gas, solution, xyz]

    expect(selectedFileIdsForAction({
      files,
      currentSelectedFileIds: ["gas"],
      lastSelectedFileId: "gas",
      fileId: "xyz",
    })).toEqual(["xyz"])
    expect(selectedFileIdsForAction({
      files,
      currentSelectedFileIds: ["gas"],
      lastSelectedFileId: "gas",
      fileId: "xyz",
      options: { additive: true },
    })).toEqual(["gas", "xyz"])
    expect(selectedFileIdsForAction({
      files,
      currentSelectedFileIds: ["gas", "xyz"],
      lastSelectedFileId: "gas",
      fileId: "xyz",
      options: { additive: true },
    })).toEqual(["gas"])
    expect(selectedFileIdsForAction({
      files,
      currentSelectedFileIds: ["gas"],
      lastSelectedFileId: "gas",
      fileId: "xyz",
      options: { range: true },
    })).toEqual(["gas", "solution", "xyz"])
  })

  it("builds source file selection transitions for the project rail", () => {
    const gas = sourceFile("gas", "TS1.log", "Gaussian")
    const solution = sourceFile("solution", "TS1-sol.log", "Gaussian")
    const xyz = sourceFile("xyz", "scan.xyz", "XYZ")
    const files = [gas, solution, xyz]

    expect(selectSourceFileTransition({
      files,
      currentSelectedFileIds: ["gas"],
      lastSelectedFileId: "gas",
      fileId: "xyz",
    })).toEqual({
      selectedFileId: "xyz",
      selectedFileIds: ["xyz"],
      lastSelectedFileId: "xyz",
      selectedNodeIds: [],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
      keyboardEdgeSourceId: null,
      inspectorMode: "inspector",
    })

    expect(selectSourceFileTransition({
      files,
      currentSelectedFileIds: ["gas"],
      lastSelectedFileId: "gas",
      fileId: "xyz",
      options: { additive: true },
    })).toMatchObject({
      selectedFileId: "xyz",
      selectedFileIds: ["gas", "xyz"],
      lastSelectedFileId: "xyz",
      selectedNodeIds: [],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
      keyboardEdgeSourceId: null,
      inspectorMode: "inspector",
    })

    expect(selectSourceFileTransition({
      files,
      currentSelectedFileIds: ["gas"],
      lastSelectedFileId: "gas",
      fileId: "xyz",
      options: { range: true },
    })).toMatchObject({
      selectedFileIds: ["gas", "solution", "xyz"],
      selectedBarrierIds: [],
      keyboardEdgeSourceId: null,
      inspectorMode: "inspector",
    })
  })

  it("deletes source files while preserving or falling back selection", () => {
    const files = [
      sourceFile("gas", "TS1.log", "Gaussian"),
      sourceFile("solution", "TS1-sol.log", "Gaussian"),
      sourceFile("xyz", "scan.xyz", "XYZ"),
    ]

    expect(deleteSourceFileTransition({
      files,
      selectedFileId: "gas",
      selectedFileIds: ["gas", "xyz"],
      lastSelectedFileId: "gas",
      deletedFileId: "gas",
    })).toMatchObject({
      files: [files[1], files[2]],
      selectedFileId: "solution",
      selectedFileIds: ["xyz"],
      lastSelectedFileId: "solution",
      inspectorMode: "inspector",
    })

    expect(deleteSourceFileTransition({
      files: [files[0]],
      selectedFileId: "gas",
      selectedFileIds: ["gas"],
      lastSelectedFileId: "gas",
      deletedFileId: "gas",
    })).toEqual({
      files: [],
      selectedFileId: null,
      selectedFileIds: [],
      lastSelectedFileId: null,
      inspectorMode: "inspector",
    })
  })

  it("selects a node and its source file for source details", () => {
    const files = [
      sourceFile("gas", "TS1.log", "Gaussian"),
      sourceFile("xyz", "scan.xyz", "XYZ"),
    ]
    const nodes = [
      flowNode("missing-source", "missing"),
      flowNode("ts", "gas"),
      flowNode("no-source"),
    ]

    expect(nodeSourceDetailsSelection({ nodes, files, nodeId: "ts" })).toEqual({
      selectedNodeIds: ["ts"],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
      selectedFileId: "gas",
      selectedFileIds: ["gas"],
      lastSelectedFileId: "gas",
      keyboardEdgeSourceId: null,
      inspectorMode: "inspector",
    })
    expect(nodeSourceDetailsSelection({ nodes, files, nodeId: "missing-source" })).toBeNull()
    expect(nodeSourceDetailsSelection({ nodes, files, nodeId: "no-source" })).toBeNull()
    expect(nodeSourceDetailsSelection({ nodes, files, nodeId: "unknown" })).toBeNull()
  })

  it("normalizes source grouping keys from stored checksums, paths, and solution suffixes", () => {
    expect(sourceFileDisplayGroupKey(sourceFile("a", "/tmp/abc123def456-endo_solution.OUT", "ORCA"))).toBe("endo")
    expect(sourceFileDisplayGroupKey(sourceFile("b", "scan-smd.xyz", "MAPLE"))).toBe("scan")
    expect(sourceFileDisplayGroupKey(sourceFile("c", "coordinates.xyz", "XYZ"))).toBe("c")
  })

  it("builds stable drag paths for raw project files", () => {
    expect(projectFileDragPath(sourceFile("file id", "source path/ts 1.log", "Gaussian")))
      .toBe("inputs/raw/file-id-source-path-ts-1.log")
    expect(projectFileDragPath(sourceFile("stored", "ts.log", "Gaussian", "sources/01-ts.log")))
      .toBe("sources/01-ts.log")
    expect(safeRawFileName(" /bad name?.log ")).toBe("bad-name-.log")
  })

  it("extracts project file ids from single and grouped drag payloads", () => {
    expect(projectFileIdsFromDataTransfer(mockDataTransfer({
      dragPayload: { kind: "project-file", projectFileId: "gas", path: "sources/gas.log" },
    }))).toEqual(["gas"])

    expect(projectFileIdsFromDataTransfer(mockDataTransfer({
      dragPayload: {
        kind: "project-files",
        files: [
          { projectFileId: "gas", path: "sources/gas.log" },
          { projectFileId: "solution", path: "sources/solution.log" },
          { path: "sources/ignored.log" },
        ],
      },
    }))).toEqual(["gas", "solution"])
  })

  it("ignores invalid project drag payloads and exposes raw file drops", () => {
    const rawFile = new File(["energy"], "energy.log", { type: "text/plain" })
    const transfer = mockDataTransfer({
      dragPayload: "not-object",
      files: [rawFile],
      types: [projectFileDragMimeType, "Files"],
    })

    expect(projectFileIdsFromDataTransfer(transfer)).toEqual([])
    expect(filesFromDataTransfer(transfer)).toEqual([rawFile])
    expect(dataTransferTypes(transfer)).toEqual([projectFileDragMimeType, "Files"])
  })

  it("detects external file drags before the File objects are readable", () => {
    expect(dataTransferHasFiles(mockDataTransfer({ types: ["Files"] }))).toBe(true)
    expect(dataTransferHasFiles(mockDataTransfer({ files: [new File(["energy"], "energy.log")] }))).toBe(true)
    expect(dataTransferHasFiles(mockDataTransfer({ types: ["text/plain"] }))).toBe(false)
  })
})
