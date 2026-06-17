import type { FlowBarrier, FlowNode, Point } from "../domain/projectPackages"
import {
  energyToKcal,
  formatBarrierValue,
  relativeEnergyValueFromKcal,
  type EnergyDisplayOptions,
} from "./energyDisplay"
import { clamp, nodeHeight, nodeWidth } from "./canvasGeometry"

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
  const bend = Math.max(80, Math.abs(end.x - start.x) * 0.42)
  return {
    path: cubicPath(start, end, bend),
    labelPoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 18 },
  }
}

export function createConnectionPreviewPath(source: FlowNode, current: Point): string {
  const start = edgeSourceAnchor(source)
  const bend = Math.max(80, Math.abs(current.x - start.x) * 0.42)
  return cubicPath(start, current, bend)
}

export function createBarrierDraftPreviewPath(source: FlowNode, current: Point): string {
  const start = {
    x: source.position.x + nodeWidth * 0.5,
    y: source.position.y + nodeHeight + 8,
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
  const sourceAnchor = { x: source.position.x + nodeWidth, y: source.position.y + nodeHeight * 0.5 }
  const targetAnchor = { x: target.position.x, y: target.position.y + nodeHeight * 0.5 }
  const arrowX = (sourceAnchor.x + targetAnchor.x) / 2
  const sourceY = sourceAnchor.y
  const targetY = targetAnchor.y
  const topY = Math.min(sourceY, targetY)
  const bottomY = Math.max(sourceY, targetY)
  const compact = Math.abs(sourceY - targetY) < 56
  const compactCenterY = ((sourceY + targetY) / 2) + 48
  const arrowTop = compact ? compactCenterY - 28 : topY
  const arrowBottom = compact ? compactCenterY + 28 : bottomY
  const sourceGuideY = compact ? compactCenterY : sourceY
  const targetGuideY = compact ? compactCenterY : sourceY > targetY ? arrowTop : arrowBottom
  const defaultLabel = defaultBarrierLabel(source, target, energyDisplayOptions)

  return {
    id: barrier.id,
    arrowPath: `M ${roundPathCoordinate(arrowX)} ${roundPathCoordinate(arrowTop)} L ${roundPathCoordinate(arrowX)} ${roundPathCoordinate(arrowBottom)}`,
    guidePath: [
      `M ${roundPathCoordinate(sourceAnchor.x)} ${roundPathCoordinate(sourceAnchor.y)}`,
      `L ${roundPathCoordinate(arrowX)} ${roundPathCoordinate(sourceGuideY)}`,
      `M ${roundPathCoordinate(targetAnchor.x)} ${roundPathCoordinate(targetAnchor.y)}`,
      `L ${roundPathCoordinate(arrowX)} ${roundPathCoordinate(targetGuideY)}`,
    ].join(" "),
    label: barrier.label?.trim() || defaultLabel,
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
  const delta = gasDelta ?? solutionDelta
  if (typeof delta !== "number") return "ΔE‡ pending"
  const value = relativeEnergyValueFromKcal(delta, energyDisplayOptions.outputUnit)
  const symbol = gasDelta !== null ? "ΔE‡" : "ΔG‡"
  return `${symbol} ${formatBarrierValue(value, energyDisplayOptions.outputUnit)}`
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
  return { x: source.position.x + nodeWidth, y: source.position.y + nodeHeight * 0.48 }
}

function edgeTargetAnchor(target: FlowNode): Point {
  return { x: target.position.x, y: target.position.y + nodeHeight * 0.48 }
}

function cubicPath(start: Point, end: Point, bend: number): string {
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`
}
