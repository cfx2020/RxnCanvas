import { describe, expect, it } from "vitest"
import {
  buildProjectPackage,
  buildImportLedger,
  parseProjectPackage,
  safeProjectFileStem,
  type CanvasViewport,
  type CanvasAnnotation,
  type FlowBarrier,
  type FlowEdge,
  type FlowNode,
  type ProjectSummary,
  type SourceFile,
} from "./projectPackages"

const project: ProjectSummary = {
  id: "diels-alder",
  label: "Diels-Alder Study",
  meta: "open",
}

const files: SourceFile[] = [{
  id: "gaussian-log",
  name: "gaussian.log",
  kind: "Gaussian",
  size: 482000,
  checksum: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  status: "parsed",
  preview: "SCF Done: E(RwB97XD) = -232.487921 A.U.",
  storedPath: "sources/gaussian.log",
}]

const nodes: FlowNode[] = [{
  id: "ts-endo",
  label: "TS1 (Endo)",
  formula: "C10H12",
  kind: "transition",
  coefficient: 2,
  method: "wB97X-D",
  solvent: "Toluene",
  energyGas: -232.487921,
  energySolution: -232.278807,
  energyUnit: "hartree",
  sourceStatus: "parsed",
  sourceFileId: "gaussian-log",
  sourceCandidateId: "candidate-1-ts-endo",
  sourceObjectIndex: 0,
  parserId: "gaussian-log-text-preview",
  parserVersion: "0.2.1",
  corrections: [{
    id: "correction-manual-1",
    kind: "manual",
    value: 1.5,
    unit: "kcal/mol",
    note: "manual test correction",
  }],
  manualStructureKet: "{\"root\":{\"nodes\":[]}}",
  manualStructureMolfile: "manual molfile",
  manualStructureCdxml: "<CDXML><page><fragment id=\"1\"/></page></CDXML>",
  position: { x: 10, y: -140 },
}]

const edges: FlowEdge[] = [{
  id: "edge-reactant-ts",
  sourceId: "reactant",
  targetId: "ts-endo",
  label: "path",
}]

const barriers: FlowBarrier[] = [{
  id: "barrier-reactant-ts",
  sourceId: "reactant",
  targetId: "ts-endo",
  label: "OA barrier",
}]

const annotations: CanvasAnnotation[] = [{
  id: "annotation-text",
  type: "text",
  position: { x: 72, y: 96 },
  text: "Rate-determining step",
  width: 220,
}, {
  id: "annotation-image",
  type: "image",
  position: { x: 160, y: 210 },
  dataUrl: "data:image/png;base64,aGVsbG8=",
  width: 180,
  height: 120,
  name: "scheme.png",
}]

const viewport: CanvasViewport = {
  x: 575,
  y: 300,
  zoom: 0.82,
}

describe("project packages", () => {
  it("builds the current RxnFlow project package envelope", () => {
    const projectPackage = buildProjectPackage(project, files, [{
      id: "canvas-1",
      label: "画布 1",
      nodes,
      edges,
      barriers,
      annotations,
      viewport,
      selectedNodeIds: ["ts-endo"],
      selectedEdgeIds: [],
      selectedBarrierIds: [],
    }], {
      activeCanvasId: "canvas-1",
      savedAt: "2026-06-14T00:00:00.000Z",
    })

    expect(projectPackage).toMatchObject({
      schemaVersion: 2,
      packageKind: "rxnflow-project",
      project,
      files,
      canvases: [{
        id: "canvas-1",
        label: "画布 1",
        nodes,
        edges,
        barriers,
        annotations,
        viewport,
      }],
      activeCanvasId: "canvas-1",
      nodes,
      edges,
      barriers,
      viewport,
      importLedger: {
        schemaVersion: 1,
        entries: [{
          id: "import-gaussian-log-candidate-1-ts-endo",
          fileId: "gaussian-log",
          sourceName: "gaussian.log",
          sourceKind: "Gaussian",
          status: "registered",
          parserId: "gaussian-log-text-preview",
          parserVersion: "0.2.1",
          candidateId: "candidate-1-ts-endo",
          objectIndex: 0,
          registeredNodeIds: ["ts-endo"],
          warningCodes: [],
        }],
      },
      savedAt: "2026-06-14T00:00:00.000Z",
    })
  })

  it("parses and normalizes valid package content", () => {
    const content = JSON.stringify({
      schemaVersion: 2,
      packageKind: "rxnflow-project",
      project,
      files,
      canvases: [{
        id: "canvas-a",
        label: "Path A",
        nodes: [{
          id: "node-a",
          label: "Imported node",
          kind: "bad-kind",
          pathRole: "participant",
          coefficient: 0,
          energyGas: Number.NaN,
          energyUnit: "kcal/mol",
          corrections: [{
            value: 2.25,
            kind: "bad-kind",
            unit: "bad-unit",
          }],
          manualStructureKet: "  custom ket  ",
          manualStructureMolfile: "  custom molfile  ",
          manualStructureCdxml: "  custom cdxml  ",
          manualStructureSvg: "<svg><image href=\"invalid://rxnflow\" onerror=\"window.pwned=true\"/></svg>",
          position: { x: 12, y: 24 },
        }],
        edges,
        barriers: [{
          id: "barrier-a",
          sourceId: "node-a",
          targetId: "ts-endo",
          label: "  custom barrier  ",
        }, {
          sourceId: "node-a",
          targetId: "",
          label: "",
        }],
        annotations: [{
          id: "note-a",
          type: "text",
          position: { x: 5, y: 9 },
          text: "  keep note spacing  ",
          width: 240,
        }, {
          id: "image-a",
          type: "image",
          position: { x: 25, y: 36 },
          dataUrl: "data:image/png;base64,aGVsbG8=",
          width: 16,
          height: 900,
          name: "  scheme.png  ",
        }, {
          id: "bad-image",
          type: "image",
          position: { x: 0, y: 0 },
          dataUrl: "https://example.com/not-project-owned.png",
          width: 100,
          height: 100,
        }],
        viewport,
        selectedNodeIds: ["node-a"],
        selectedEdgeIds: [],
        selectedBarrierIds: [],
      }],
      activeCanvasId: "canvas-a",
      importLedger: {
        schemaVersion: 1,
        entries: [{
          id: "custom-entry",
          fileId: "gaussian-log",
          sourceName: "gaussian.log",
          sourceKind: "Gaussian",
          status: "registered",
          parserId: "gaussian-log-text-preview",
          parserVersion: "0.2.1",
          registeredNodeIds: ["node-a"],
          warningCodes: ["candidate_selection_available"],
        }],
      },
      savedAt: "2026-06-14T00:00:00.000Z",
    })

    const parsed = parseProjectPackage(content)

    expect(parsed?.nodes?.[0]).toMatchObject({
      id: "node-a",
      formula: "pending",
      kind: "intermediate",
      pathRole: "participant",
      coefficient: undefined,
      method: "unassigned",
      energyGas: null,
      energyUnit: "kcal/mol",
      corrections: [{
        id: "correction-1",
        kind: "manual",
        value: 2.25,
        unit: "kcal/mol",
      }],
      manualStructureKet: "  custom ket  ",
      manualStructureMolfile: "  custom molfile  ",
      manualStructureCdxml: "  custom cdxml  ",
      position: { x: 12, y: 24 },
    })
    expect(parsed?.nodes?.[0]).not.toHaveProperty("manualStructureSvg")
    expect(parsed?.canvases?.[0].annotations).toEqual([{
      id: "note-a",
      type: "text",
      position: { x: 5, y: 9 },
      text: "  keep note spacing  ",
      width: 240,
    }, {
      id: "image-a",
      type: "image",
      position: { x: 25, y: 36 },
      dataUrl: "data:image/png;base64,aGVsbG8=",
      width: 48,
      height: 720,
      name: "scheme.png",
    }])
    expect(parsed?.files[0]).toMatchObject({
      name: "gaussian.log",
      storedPath: "sources/gaussian.log",
      checksum: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    })
    expect(parsed?.importLedger.entries[0]).toMatchObject({
      id: "custom-entry",
      fileId: "gaussian-log",
      status: "registered",
      registeredNodeIds: ["node-a"],
      warningCodes: ["candidate_selection_available"],
    })
    expect(parsed?.barriers).toEqual([{
      id: "barrier-a",
      sourceId: "node-a",
      targetId: "ts-endo",
      label: "custom barrier",
    }, {
      id: "barrier-2",
      sourceId: "node-a",
      targetId: "",
      label: undefined,
    }])
    expect(parsed?.edges?.[0]).toMatchObject({
      id: "edge-reactant-ts",
      stepRole: undefined,
    })
  })

  it("normalizes reaction path semantics on nodes and edges", () => {
    const content = JSON.stringify({
      schemaVersion: 2,
      packageKind: "rxnflow-project",
      project,
      files,
      canvases: [{
        id: "canvas-a",
        label: "Path A",
        nodes: [
          { ...nodes[0], pathRole: "participant" },
          { ...nodes[1], pathRole: "bad-role" },
        ],
        edges: [
          { ...edges[0], stepRole: "addition" },
          { ...edges[0], id: "edge-bad", stepRole: "bad-step" },
        ],
        barriers,
        viewport,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        selectedBarrierIds: [],
      }],
      activeCanvasId: "canvas-a",
      importLedger: { schemaVersion: 1, entries: [] },
      savedAt: "2026-06-14T00:00:00.000Z",
    })

    const parsed = parseProjectPackage(content)

    expect(parsed?.nodes?.[0].pathRole).toBe("participant")
    expect(parsed?.nodes?.[1].pathRole).toBeUndefined()
    expect(parsed?.edges?.[0].stepRole).toBe("addition")
    expect(parsed?.edges?.[1].stepRole).toBeUndefined()
  })

  it("derives a lightweight import ledger from files and nodes", () => {
    const ledger = buildImportLedger(files, nodes)

    expect(ledger).toEqual({
      schemaVersion: 1,
      entries: [{
        id: "import-gaussian-log-candidate-1-ts-endo",
        fileId: "gaussian-log",
        sourceName: "gaussian.log",
        sourceKind: "Gaussian",
        status: "registered",
        parserId: "gaussian-log-text-preview",
        parserVersion: "0.2.1",
        candidateId: "candidate-1-ts-endo",
        objectIndex: 0,
        registeredNodeIds: ["ts-endo"],
        warningCodes: [],
      }],
    })
  })

  it("keeps only the first valid vibration displacement payload during package parse", () => {
    const parseWithVibration = {
      label: "gaussian",
      sourceKind: "Gaussian",
      formula: "H2",
      kind: "transition",
      method: "B3LYP",
      solvent: "unassigned",
      energyGas: -1,
      energySolution: null,
      energyUnit: "hartree",
      parsed: true,
      parserId: "gaussian-log-text-preview",
      parserVersion: "0.2.1",
      objectCount: 1,
      warnings: [],
      candidates: [{
        candidateId: "candidate-1-h2",
        objectIndex: 0,
        label: "h2",
        formula: "H2",
        charge: 0,
        spinMultiplicity: 1,
        method: "B3LYP",
        energyGas: -1,
        energySolution: null,
        energyUnit: "hartree",
        coordinatePreview: {
          atomCount: 2,
          has3d: true,
          elements: ["H"],
          atoms: [
            { element: "H", x: 0, y: 0, z: 0 },
            { element: "H", x: 0, y: 0, z: 0.74 },
          ],
          vibrationModes: [{
            modeId: "mode-1-imaginary-42.00",
            modeIndex: 0,
            frequencyCm1: -42,
            kind: "imaginary",
            source: "rxnflow-text",
            displacements: [
              { atomIndex: 0, dx: 0.1, dy: 0, dz: 0 },
              { atomIndex: 1, dx: -0.1, dy: 0, dz: 0 },
            ],
          }, {
            modeId: "mode-2-real-10.00",
            modeIndex: 1,
            frequencyCm1: 10,
            kind: "real",
            source: "rxnflow-text",
            displacements: [
              { atomIndex: 0, dx: 0, dy: 0.1, dz: 0 },
              { atomIndex: 1, dx: 0, dy: -0.1, dz: 0 },
            ],
          }, {
            modeId: "bad",
            modeIndex: 2,
            frequencyCm1: 20,
            kind: "real",
            source: "rxnflow-text",
            displacements: [{ atomIndex: 0, dx: 0, dy: 0, dz: 0 }],
          }],
          previewKind: "text",
        },
        roleHint: "transition",
        warnings: [],
      }],
      coordinatePreview: null,
    }
    const parsed = parseProjectPackage(JSON.stringify({
      schemaVersion: 2,
      packageKind: "rxnflow-project",
      project,
      files: [{ ...files[0], parse: parseWithVibration }],
      canvases: [{
        id: "canvas-a",
        label: "Path A",
        nodes,
        edges,
        barriers: [],
        viewport,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        selectedBarrierIds: [],
      }],
      activeCanvasId: "canvas-a",
      importLedger: { schemaVersion: 1, entries: [] },
      savedAt: "2026-06-14T00:00:00.000Z",
    }))

    const modes = parsed?.files[0]?.parse?.candidates[0]?.coordinatePreview?.vibrationModes ?? []
    expect(modes).toHaveLength(2)
    expect(modes[0]).toMatchObject({
      modeId: "mode-1-imaginary-42.00",
      frequencyCm1: -42,
      kind: "imaginary",
      displacements: [
        { atomIndex: 0, dx: 0.1, dy: 0, dz: 0 },
        { atomIndex: 1, dx: -0.1, dy: 0, dz: 0 },
      ],
    })
    expect(modes[1]).toMatchObject({
      modeId: "mode-2-real-10.00",
      frequencyCm1: 10,
      kind: "real",
      displacements: [],
    })
    expect(parsed?.files[0]?.parse?.warnings.map((warning) => warning.code)).toContain("vibration_shape_mismatch")
  })

  it("backfills import ledger entries for older lightweight packages", () => {
    const parsed = parseProjectPackage(JSON.stringify({
      schemaVersion: 1,
      packageKind: "rxnflow-project",
      project,
      files,
      nodes,
      edges,
      viewport,
      savedAt: "2026-06-14T00:00:00.000Z",
    }))

    expect(parsed?.importLedger.entries[0]).toMatchObject({
      id: "import-gaussian-log-candidate-1-ts-endo",
      fileId: "gaussian-log",
      status: "registered",
      registeredNodeIds: ["ts-endo"],
    })
    expect(parsed?.barriers).toEqual([])
  })

  it("rejects legacy snapshots and invalid viewport packages", () => {
    expect(parseProjectPackage(JSON.stringify({ schemaVersion: 1, project, files, nodes, edges, viewport }))).toBeNull()
    expect(parseProjectPackage(JSON.stringify({
      schemaVersion: 1,
      packageKind: "rxnflow-project",
      project,
      files,
      nodes,
      edges,
      viewport: { x: 0, y: 0, zoom: 0 },
    }))).toBeNull()
    expect(parseProjectPackage("{bad json")).toBeNull()
  })

  it("creates safe project file stems", () => {
    expect(safeProjectFileStem("Diels-Alder Study")).toBe("diels-alder-study")
    expect(safeProjectFileStem("   ")).toBe("rxnflow-project")
  })
})
