import type { FlowNode, NodeKind, SourceFile } from "../domain/projectPackages"
import type { ParseCandidate, ParsedEnergyUnit, SourceParseResult } from "../domain/sourceParseTypes"
import { importNodeId, importNodePosition } from "./importLayout"
import type { ImportNodeLayout, RegisteredImportObject } from "./importRegistrationTypes"

export function nodeKindFromCandidate(candidate: ParseCandidate, fallback: NodeKind): NodeKind {
  if (candidate.roleHint === "transition") return "transition"
  if (candidate.roleHint === "path-point") return "intermediate"
  if (candidate.roleHint === "final" && fallback === "intermediate") return "product"
  return fallback
}

export function nodeFromRegisteredImportObject(
  registeredObject: RegisteredImportObject,
  index: number,
  layout: ImportNodeLayout,
): FlowNode {
  return {
    id: importNodeId(`imported-${registeredString(registeredObject.id, `object-${index + 1}`)}`, layout),
    label: registeredString(registeredObject.label, "Imported object"),
    formula: registeredString(registeredObject.formula, "pending"),
    kind: registeredNodeKind(registeredObject.kind, "intermediate"),
    method: registeredString(registeredObject.method, "unassigned"),
    solvent: registeredString(registeredObject.solvent, "unassigned"),
    energyGas: finiteNumberOrNull(registeredObject.energyGas),
    energySolution: finiteNumberOrNull(registeredObject.energySolution),
    energyUnit: registeredEnergyUnit(registeredObject.energyUnit),
    sourceStatus: registeredObject.sourceStatus === "staged" ? "staged" : "parsed",
    sourceFileId: registeredString(registeredObject.sourceFileId, ""),
    sourceCandidateId: registeredString(registeredObject.sourceCandidateId, ""),
    sourceObjectIndex: finiteNumberOrUndefined(registeredObject.sourceObjectIndex),
    parserId: registeredObject.parserId ?? null,
    parserVersion: registeredObject.parserVersion ?? null,
    roleHint: registeredString(registeredObject.roleHint, "unknown"),
    charge: finiteNumberOrNull(registeredObject.charge),
    spinMultiplicity: finiteNumberOrNull(registeredObject.spinMultiplicity),
    energyTable: registeredObject.energyTable ?? undefined,
    position: importNodePosition(index, layout),
  }
}

export function nodeFromCandidate(
  file: SourceFile,
  parsed: SourceParseResult,
  candidate: ParseCandidate,
  index: number,
  layout: ImportNodeLayout,
): FlowNode {
  return {
    id: importNodeId(`imported-${file.id}-${candidate.candidateId}`, layout),
    label: candidate.label,
    formula: candidate.formula,
    kind: nodeKindFromCandidate(candidate, parsed.kind),
    method: candidate.method || parsed.method,
    solvent: parsed.solvent,
    energyGas: candidate.energyGas,
    energySolution: candidate.energySolution,
    energyUnit: candidate.energyUnit,
    sourceStatus: "parsed",
    sourceFileId: file.id,
    sourceCandidateId: candidate.candidateId,
    sourceObjectIndex: candidate.objectIndex,
    parserId: parsed.parserId,
    parserVersion: parsed.parserVersion,
    roleHint: candidate.roleHint,
    charge: candidate.charge,
    spinMultiplicity: candidate.spinMultiplicity,
    energyTable: candidate.energyTable ?? parsed.energyTable ?? undefined,
    position: importNodePosition(index, layout),
  }
}

export function nodeFromParsedFallback(
  file: SourceFile,
  parsed: SourceParseResult,
  index: number,
  layout: ImportNodeLayout,
): FlowNode {
  return {
    id: importNodeId(`imported-${file.id}`, layout),
    label: parsed.label,
    formula: parsed.formula,
    kind: parsed.kind,
    method: parsed.method,
    solvent: parsed.solvent,
    energyGas: parsed.energyGas,
    energySolution: parsed.energySolution,
    energyUnit: parsed.energyUnit,
    sourceStatus: parsed.parsed ? "parsed" : "staged",
    sourceFileId: file.id,
    parserId: parsed.parserId,
    parserVersion: parsed.parserVersion,
    energyTable: parsed.energyTable ?? undefined,
    position: importNodePosition(index, layout),
  }
}

function registeredString(value: string | null | undefined, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

function finiteNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function finiteNumberOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function registeredNodeKind(value: string, fallback: NodeKind): NodeKind {
  if (value === "reactant" || value === "transition" || value === "intermediate" || value === "product") return value
  return fallback
}

function registeredEnergyUnit(value: string): ParsedEnergyUnit {
  return value === "hartree" ? "hartree" : "kcal/mol"
}
