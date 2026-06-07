import type { GraphNodeSummary, GraphPathSummary, ObjectSummary, ShellError, ShellWarning } from "../shell"

export function firstUserFacingName(values: Array<string | null | undefined>, fallback = "Structure"): string {
  for (const value of values) {
    const cleaned = userFacingText(value)
    if (cleaned) return cleaned
  }
  return fallback
}

export function userFacingText(value: string | null | undefined): string | null {
  if (!value) return null
  const base = stripStoragePath(value.trim())
  const cleaned = stripChecksumPrefix(base)
  if (!cleaned || looksLikeInternalId(cleaned)) return null
  return cleaned
}

export function objectDisplayName(object: ObjectSummary | null | undefined, fallback = "Structure"): string {
  return firstUserFacingName([
    object?.label,
    object?.source_file_id,
    object?.id,
  ], fallback)
}

export function graphNodeDisplayName(
  node: GraphNodeSummary | null | undefined,
  objectById: Map<string, ObjectSummary>,
  fallback = "Structure",
): string {
  if (!node) return fallback
  const objectIds = [
    ...(node.composition?.map((term) => term.object_id) ?? []),
    ...(node.chemical_object_ids ?? []),
  ]
  const objectNames = objectIds.map((objectId) => objectDisplayName(objectById.get(objectId), ""))
  return firstUserFacingName([
    node.label,
    ...objectNames,
    node.id,
  ], fallback)
}

export function graphPathDisplayName(
  path: GraphPathSummary | null | undefined,
  nodeLabelById: Map<string, string>,
  fallback = "Path",
): string {
  if (!path) return fallback
  const routeLabel = path.node_ids
    .map((nodeId) => userFacingText(nodeLabelById.get(nodeId)) ?? null)
    .filter((value): value is string => Boolean(value))
    .join(" -> ")
  return firstUserFacingName([
    path.label,
    routeLabel,
  ], fallback)
}

export function artifactDisplayName(format: string, path: string | null | undefined, fallback = "Export"): string {
  const extension = format ? format.toUpperCase() : null
  const name = firstUserFacingName([path], fallback)
  return extension ? `${extension} · ${name}` : name
}

export function warningTargetDisplay(
  warning: ShellWarning | ShellError,
): string | null {
  return userFacingText(warning.target ?? null)
}

export function looksLikeInternalId(value: string): boolean {
  return /^(node|object|raw|source|graph|workspace|session|artifact|profile|path|edge|corr)[-_:]/i.test(value)
    || /^sha256:/i.test(value)
    || /^[a-f0-9]{10,}[-_]/i.test(value)
    || /^[a-f0-9]{24,}$/i.test(value)
    || /\bfixture\b/i.test(value)
}

function stripStoragePath(value: string): string {
  const parts = value.split(/[\\/]+/).filter(Boolean)
  return parts.at(-1) ?? value
}

function stripChecksumPrefix(value: string): string {
  return value.replace(/^[a-f0-9]{10,}[-_]/i, "")
}
