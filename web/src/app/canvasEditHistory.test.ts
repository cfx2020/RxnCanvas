import { describe, expect, it } from "vitest"
import {
  appendCanvasEditHistory,
  redoCanvasEditHistory,
  undoCanvasEditHistory,
} from "./canvasEditHistory"

describe("canvasEditHistory", () => {
  it("appends snapshots while respecting the bounded history limit", () => {
    expect(appendCanvasEditHistory(["a", "b", "c"], "d", 3)).toEqual(["b", "c", "d"])
  })

  it("creates an undo transition from the latest past snapshot", () => {
    expect(undoCanvasEditHistory({ past: ["a", "b"], future: ["z"] }, "current", 3)).toEqual({
      snapshot: "b",
      past: ["a"],
      future: ["current", "z"],
    })
    expect(undoCanvasEditHistory({ past: [], future: [] }, "current")).toBeNull()
  })

  it("creates a redo transition from the first future snapshot", () => {
    expect(redoCanvasEditHistory({ past: ["a", "b"], future: ["next", "later"] }, "current", 3)).toEqual({
      snapshot: "next",
      past: ["a", "b", "current"],
      future: ["later"],
    })
    expect(redoCanvasEditHistory({ past: [], future: [] }, "current")).toBeNull()
  })

  it("caps future entries added by undo transitions", () => {
    expect(undoCanvasEditHistory({ past: ["a"], future: ["b", "c", "d"] }, "current", 3)?.future).toEqual([
      "current",
      "b",
      "c",
    ])
  })
})
