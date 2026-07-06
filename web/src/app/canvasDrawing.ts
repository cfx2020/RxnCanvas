import type { EdgeStepRole, FlowBarrier, FlowNode, Point } from "../domain/projectPackages"
import {
  energyToKcal,
  formatBarrierValue,
  relativeEnergyValueFromKcal,
  type EnergyDisplayOptions,
} from "./energyDisplay"
import { clamp, flowNodeSize } from "./canvasGeometry"

export type EdgeSegment = {
  path: string
  labelPoint: Point
}

export type BarrierSegment = {
  id: string
  arrowPath: string
  guidePath: string
  label: string
  defaultLabel: string
  labelPoint: Point
  sourceLabel: string
  targetLabel: string
}

export type BarrierRelativeEnergyLookup = ReadonlyMap<string, number | null>

export function createEdgeSegment(source: FlowNode, target: FlowNode, stepRole?: EdgeStepRole): EdgeSegment {
  const start = edgeSourceAnchor(source, stepRole)
  const end = edgeTargetAnchor(target, stepRole)
  const horizontal = Math.abs(end.x - start.x)
  const vertical = Math.abs(end.y - start.y)
  const bend = clamp(Math.max(horizontal * 0.34, vertical * 0.2), 28, 96)
  const controlFrom = { x: start.x + bend, y: start.y }
  const controlTo = { x: end.x - bend, y: end.y }
  const labelPoint = cubicBezierPoint(start, controlFrom, controlTo, end, 0.5)
  return {
    path: cubicPath(start, end, bend),
    labelPoint: { x: labelPoint.x, y: labelPoint.y },
  }
}

export function createConnectionPreviewPath(source: FlowNode, current: Point, stepRole?: EdgeStepRole): string {
  const start = edgeSourceAnchor(source, stepRole)
  const bend = Math.max(80, Math.abs(current.x - start.x) * 0.42)
  return cubicPath(start, current, bend)
}

export function createBarrierDraftPreviewPath(source: FlowNode, current: Point): string {
  const sourceSize = flowNodeSize(source)
  const start = {
    x: source.position.x + sourceSize.width * 0.5,
    y: source.position.y + sourceSize.height + 8,
  }
  const vertical = current.y - start.y
  const bend = clamp(Math.max(40, Math.abs(vertical) * 0.36), 40, 130)
  const direction = Math.sign(vertical || 1)
  return `M ${start.x} ${start.y} C ${start.x} ${start.y + direction * bend}, ${current.x} ${current.y - direction * bend}, ${current.x} ${current.y}`
}

export function createBarrierSegment(
  barrier: FlowBarrier,
  nodeMap: Map<string, FlowNode>,
  energyDisplayOptions: EnergyDisplayOptions,
  relativeEnergyByNodeId?: BarrierRelativeEnergyLookup,
): BarrierSegment | null {
  const source = nodeMap.get(barrier.sourceId)
  const target = nodeMap.get(barrier.targetId)
  if (!source || !target) return null
  const endpoints = resolveBarrierEndpoints(source, target, relativeEnergyByNodeId)
  const peakSize = flowNodeSize(endpoints.peak)
  const referenceAnchor = barrierReferenceAnchor(endpoints.reference, endpoints.peak)
  const rulerGapFromPeak = 28
  const minRulerSpan = 76
  const arrowX = endpoints.peak.position.x + peakSize.width * 0.5
  const peakEnergyY = endpoints.peak.position.y + peakSize.height + rulerGapFromPeak
  const referenceEnergyY = Math.max(referenceAnchor.y, peakEnergyY + minRulerSpan)
  const arrowTop = Math.min(peakEnergyY, referenceEnergyY)
  const arrowBottom = Math.max(peakEnergyY, referenceEnergyY)
  const defaultLabel = defaultBarrierLabel(source, target, energyDisplayOptions, relativeEnergyByNodeId)
  const label = barrier.label?.trim() || defaultLabel

  return {
    id: barrier.id,
    arrowPath: `M ${roundPathCoordinate(arrowX)} ${roundPathCoordinate(arrowTop)} L ${roundPathCoordinate(arrowX)} ${roundPathCoordinate(arrowBottom)}`,
    guidePath: [
      `M ${roundPathCoordinate(referenceAnchor.x)} ${roundPathCoordinate(referenceAnchor.y)}`,
      referenceAnchor.y === referenceEnergyY
        ? ""
        : `L ${roundPathCoordinate(referenceAnchor.x)} ${roundPathCoordinate(referenceEnergyY)}`,
      `L ${roundPathCoordinate(arrowX)} ${roundPathCoordinate(referenceEnergyY)}`,
    ].filter(Boolean).join(" "),
    label,
    defaultLabel,
    labelPoint: { x: arrowX, y: (arrowTop + arrowBottom) / 2 },
    sourceLabel: endpoints.reference.label,
    targetLabel: endpoints.peak.label,
  }
}

function barrierReferenceAnchor(reference: FlowNode, peak: FlowNode): Point {
  return peak.position.x >= reference.position.x
    ? edgeSourceAnchor(reference)
    : edgeTargetAnchor(reference)
}

export function defaultBarrierLabel(
  source: FlowNode,
  target: FlowNode,
  energyDisplayOptions: EnergyDisplayOptions,
  relativeEnergyByNodeId?: BarrierRelativeEnergyLookup,
): string {
  const preferredSymbol = energyDisplayOptions.energySource === "solution" ? "ΔG‡" : "ΔE‡"
  const endpoints = resolveBarrierEndpoints(source, target, relativeEnergyByNodeId)
  if (relativeEnergyByNodeId) {
    const referenceRelative = relativeEnergyByNodeId.get(endpoints.reference.id)
    const peakRelative = relativeEnergyByNodeId.get(endpoints.peak.id)
    const delta = typeof referenceRelative === "number" && typeof peakRelative === "number"
      ? peakRelative - referenceRelative
      : endpoints.reference.pathRole === "participant" && typeof peakRelative === "number"
        ? peakRelative
        : null
    if (typeof delta !== "number") return `${preferredSymbol} pending`
    const value = relativeEnergyValueFromKcal(delta, energyDisplayOptions.outputUnit)
    return `${preferredSymbol} ${formatBarrierValue(value, energyDisplayOptions.outputUnit)}`
  }

  const gasDelta = energyDeltaKcal(endpoints.reference.energyGas, endpoints.reference.energyUnit, endpoints.peak.energyGas, endpoints.peak.energyUnit)
  const solutionDelta = energyDeltaKcal(endpoints.reference.energySolution, endpoints.reference.energyUnit, endpoints.peak.energySolution, endpoints.peak.energyUnit)
  const preferredDelta = energyDisplayOptions.energySource === "solution" ? solutionDelta : gasDelta
  const fallbackDelta = energyDisplayOptions.energySource === "solution" ? gasDelta : solutionDelta
  const delta = preferredDelta ?? fallbackDelta
  const fallbackSymbol = energyDisplayOptions.energySource === "solution" ? "ΔE‡" : "ΔG‡"
  if (typeof delta !== "number") return `${preferredSymbol} pending`
  const value = relativeEnergyValueFromKcal(delta, energyDisplayOptions.outputUnit)
  return `${preferredDelta === null ? fallbackSymbol : preferredSymbol} ${formatBarrierValue(value, energyDisplayOptions.outputUnit)}`
}


type BarrierResolvedEndpoints = {
  reference: FlowNode
  peak: FlowNode
}

function resolveBarrierEndpoints(
  source: FlowNode,
  target: FlowNode,
  relativeEnergyByNodeId?: BarrierRelativeEnergyLookup,
): BarrierResolvedEndpoints {
  const sourceIsTransition = source.kind === "transition"
  const targetIsTransition = target.kind === "transition"
  if (sourceIsTransition !== targetIsTransition) {
    return sourceIsTransition
      ? { reference: target, peak: source }
      : { reference: source, peak: target }
  }

  const sourceRelative = relativeEnergyByNodeId?.get(source.id)
  const targetRelative = relativeEnergyByNodeId?.get(target.id)
  if (typeof sourceRelative === "number" && typeof targetRelative === "number" && sourceRelative !== targetRelative) {
    return sourceRelative > targetRelative
      ? { reference: target, peak: source }
      : { reference: source, peak: target }
  }

  return { reference: source, peak: target }
}

export function energyDeltaKcal(
  sourceValue: number | null,
  sourceUnit: FlowNode["energyUnit"],
  targetValue: number | null,
  targetUnit: FlowNode["energyUnit"],
): number | null {
  const source = energyToKcal(sourceValue, sourceUnit)
  const target = energyToKcal(targetValue, targetUnit)
  return typeof source === "number" && typeof target === "number" ? target - source : null
}

export function roundPathCoordinate(value: number): number {
  return Math.round(value * 10) / 10
}

function edgeSourceAnchor(source: FlowNode, stepRole?: EdgeStepRole): Point {
  const size = flowNodeSize(source)
  if (stepRole === "release") return stepConnectorAnchor(source, "release", size)
  return { x: source.position.x + size.width, y: source.position.y + size.height * 0.5 }
}

function edgeTargetAnchor(target: FlowNode, stepRole?: EdgeStepRole): Point {
  const size = flowNodeSize(target)
  if (stepRole === "addition") return stepConnectorAnchor(target, "addition", size)
  return { x: target.position.x, y: target.position.y + size.height * 0.5 }
}

function stepConnectorAnchor(node: FlowNode, role: Extract<EdgeStepRole, "addition" | "release">, size = flowNodeSize(node)): Point {
  return {
    x: role === "addition" ? node.position.x : node.position.x + size.width,
    y: node.position.y + size.height * 0.5 - 38,
  }
}

function cubicPath(start: Point, end: Point, bend: number): string {
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`
}

function cubicBezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const oneMinusT = 1 - t
  return {
    x: oneMinusT ** 3 * p0.x
      + 3 * oneMinusT ** 2 * t * p1.x
      + 3 * oneMinusT * t ** 2 * p2.x
      + t ** 3 * p3.x,
    y: oneMinusT ** 3 * p0.y
      + 3 * oneMinusT ** 2 * t * p1.y
      + 3 * oneMinusT * t ** 2 * p2.y
      + t ** 3 * p3.y,
  }
}
