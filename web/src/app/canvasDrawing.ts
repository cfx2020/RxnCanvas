import type { FlowBarrier, FlowNode, Point } from "../domain/projectPackages"
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

export function createEdgeSegment(source: FlowNode, target: FlowNode): EdgeSegment {
  const start = edgeSourceAnchor(source)
  const end = edgeTargetAnchor(target)
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

export function createConnectionPreviewPath(source: FlowNode, current: Point): string {
  const start = edgeSourceAnchor(source)
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
): BarrierSegment | null {
  const source = nodeMap.get(barrier.sourceId)
  const target = nodeMap.get(barrier.targetId)
  if (!source || !target) return null
  const sourceSize = flowNodeSize(source)
  const targetSize = flowNodeSize(target)
  const sourceAnchor = { x: source.position.x + sourceSize.width * 0.5, y: source.position.y + sourceSize.height + 12 }
  const targetOnRight = target.position.x + targetSize.width * 0.5 >= sourceAnchor.x
  const targetAnchor = {
    x: target.position.x + (targetOnRight ? 0 : targetSize.width),
    y: target.position.y + targetSize.height * 0.5,
  }
  const arrowX = sourceAnchor.x
  const sourceY = sourceAnchor.y + 10
  const targetY = targetAnchor.y
  const topY = Math.min(sourceY, targetY)
  const bottomY = Math.max(sourceY, targetY)
  const compact = Math.abs(sourceY - targetY) < 48
  const compactCenterY = ((sourceY + targetY) / 2) + (targetY >= sourceY ? 40 : -40)
  const arrowTop = compact ? compactCenterY - 28 : topY
  const arrowBottom = compact ? compactCenterY + 28 : bottomY
  const sourceGuideY = compact ? compactCenterY : sourceY
  const targetGuideY = compact ? compactCenterY : sourceY > targetY ? arrowTop : arrowBottom
  const defaultLabel = defaultBarrierLabel(source, target, energyDisplayOptions)
  const label = barrier.label?.trim() || defaultLabel

  return {
    id: barrier.id,
    arrowPath: `M ${roundPathCoordinate(arrowX)} ${roundPathCoordinate(arrowTop)} L ${roundPathCoordinate(arrowX)} ${roundPathCoordinate(arrowBottom)}`,
    guidePath: [
      `M ${roundPathCoordinate(sourceAnchor.x)} ${roundPathCoordinate(sourceAnchor.y)}`,
      `L ${roundPathCoordinate(arrowX)} ${roundPathCoordinate(sourceGuideY)}`,
      `M ${roundPathCoordinate(targetAnchor.x)} ${roundPathCoordinate(targetAnchor.y)}`,
      `L ${roundPathCoordinate(arrowX)} ${roundPathCoordinate(targetGuideY)}`,
    ].join(" "),
    label,
    defaultLabel,
    labelPoint: { x: arrowX, y: (arrowTop + arrowBottom) / 2 },
    sourceLabel: source.label,
    targetLabel: target.label,
  }
}

export function defaultBarrierLabel(
  source: FlowNode,
  target: FlowNode,
  energyDisplayOptions: EnergyDisplayOptions,
): string {
  const gasDelta = energyDeltaKcal(source.energyGas, source.energyUnit, target.energyGas, target.energyUnit)
  const solutionDelta = energyDeltaKcal(source.energySolution, source.energyUnit, target.energySolution, target.energyUnit)
  const preferredDelta = energyDisplayOptions.energySource === "solution" ? solutionDelta : gasDelta
  const fallbackDelta = energyDisplayOptions.energySource === "solution" ? gasDelta : solutionDelta
  const delta = preferredDelta ?? fallbackDelta
  const preferredSymbol = energyDisplayOptions.energySource === "solution" ? "ΔG‡" : "ΔE‡"
  const fallbackSymbol = energyDisplayOptions.energySource === "solution" ? "ΔE‡" : "ΔG‡"
  if (typeof delta !== "number") return `${preferredSymbol} pending`
  const value = relativeEnergyValueFromKcal(delta, energyDisplayOptions.outputUnit)
  return `${preferredDelta === null ? fallbackSymbol : preferredSymbol} ${formatBarrierValue(value, energyDisplayOptions.outputUnit)}`
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

function edgeSourceAnchor(source: FlowNode): Point {
  const size = flowNodeSize(source)
  return { x: source.position.x + size.width, y: source.position.y + size.height * 0.5 }
}

function edgeTargetAnchor(target: FlowNode): Point {
  const size = flowNodeSize(target)
  return { x: target.position.x, y: target.position.y + size.height * 0.5 }
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
