export type CanvasEditHistory<TSnapshot> = {
  past: TSnapshot[]
  future: TSnapshot[]
}

export type CanvasEditHistoryTransition<TSnapshot> = CanvasEditHistory<TSnapshot> & {
  snapshot: TSnapshot
}

export const defaultCanvasEditHistoryLimit = 30

export function appendCanvasEditHistory<TSnapshot>(
  past: TSnapshot[],
  snapshot: TSnapshot,
  limit = defaultCanvasEditHistoryLimit,
): TSnapshot[] {
  return [...past.slice(-(limit - 1)), snapshot]
}

export function undoCanvasEditHistory<TSnapshot>(
  history: CanvasEditHistory<TSnapshot>,
  currentSnapshot: TSnapshot,
  limit = defaultCanvasEditHistoryLimit,
): CanvasEditHistoryTransition<TSnapshot> | null {
  const snapshot = history.past.at(-1)
  if (!snapshot) return null

  return {
    snapshot,
    past: history.past.slice(0, -1),
    future: [currentSnapshot, ...history.future].slice(0, limit),
  }
}

export function redoCanvasEditHistory<TSnapshot>(
  history: CanvasEditHistory<TSnapshot>,
  currentSnapshot: TSnapshot,
  limit = defaultCanvasEditHistoryLimit,
): CanvasEditHistoryTransition<TSnapshot> | null {
  const snapshot = history.future[0]
  if (!snapshot) return null

  return {
    snapshot,
    past: appendCanvasEditHistory(history.past, currentSnapshot, limit),
    future: history.future.slice(1),
  }
}
