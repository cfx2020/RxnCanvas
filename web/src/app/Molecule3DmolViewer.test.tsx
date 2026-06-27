import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Molecule3DmolViewer, selectedAtomHighlightStyle } from "./Molecule3DmolViewer"

const threeDMolMock = vi.hoisted(() => ({
  createViewer: vi.fn(),
  latestAtomClick: undefined as undefined | ((atom: { index?: number; serial?: number }) => void),
}))

vi.mock("3dmol", () => ({
  createViewer: threeDMolMock.createViewer,
}))

const atoms = [
  { element: "C", x: 0, y: 0, z: 0 },
  { element: "H", x: 1, y: 0, z: 0 },
  { element: "H", x: 1, y: 1, z: 0 },
  { element: "H", x: 1, y: 1, z: 1 },
]

describe("Molecule3DmolViewer", () => {
  let getContextSpy: ReturnType<typeof vi.spyOn>
  let viewerMock: {
    removeAllModels: ReturnType<typeof vi.fn>
    addModel: ReturnType<typeof vi.fn>
    setStyle: ReturnType<typeof vi.fn>
    addStyle: ReturnType<typeof vi.fn>
    setClickable: ReturnType<typeof vi.fn>
    vibrate: ReturnType<typeof vi.fn>
    animate: ReturnType<typeof vi.fn>
    stopAnimate: ReturnType<typeof vi.fn>
    setFrame: ReturnType<typeof vi.fn>
    zoomTo: ReturnType<typeof vi.fn>
    render: ReturnType<typeof vi.fn>
    resize: ReturnType<typeof vi.fn>
    clear: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    threeDMolMock.latestAtomClick = undefined
    viewerMock = {
      removeAllModels: vi.fn(),
      addModel: vi.fn(),
      setStyle: vi.fn(),
      addStyle: vi.fn(),
      setClickable: vi.fn((_selection, _clickable, callback) => {
        threeDMolMock.latestAtomClick = callback
      }),
      vibrate: vi.fn(),
      animate: vi.fn(),
      stopAnimate: vi.fn(),
      setFrame: vi.fn(() => Promise.resolve()),
      zoomTo: vi.fn(),
      render: vi.fn(),
      resize: vi.fn(),
      clear: vi.fn(),
    }
    threeDMolMock.createViewer.mockReset()
    threeDMolMock.createViewer.mockReturnValue(viewerMock)
    Object.defineProperty(window, "WebGLRenderingContext", {
      configurable: true,
      value: function WebGLRenderingContext() {},
    })
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((contextId) => {
      return contextId === "webgl" || contextId === "experimental-webgl" ? ({} as CanvasRenderingContext2D) : null
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    getContextSpy.mockRestore()
  })

  it("renders the inline 3D viewer without fullscreen-only measurement controls", () => {
    render(
      <Molecule3DmolViewer
        atoms={atoms}
        formula="CH3"
        sourceName="fixture.log"
      />,
    )

    expect(screen.getByRole("img", { name: "3Dmol ball-and-stick model with 4 atoms" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Measure distance" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Measure angle" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Measure dihedral" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Show element index labels" })).not.toBeInTheDocument()
  })

  it("highlights selected atoms with the same sphere scale instead of enlarging them", async () => {
    render(
      <Molecule3DmolViewer
        atoms={atoms}
        formula="CH3"
        sourceName="fixture.log"
      />,
    )

    await waitFor(() => expect(threeDMolMock.latestAtomClick).toBeTypeOf("function"))

    act(() => {
      threeDMolMock.latestAtomClick?.({ index: 1 })
    })

    await waitFor(() => {
      expect(viewerMock.addStyle).toHaveBeenCalledWith({ index: [1] }, selectedAtomHighlightStyle)
    })
    expect(selectedAtomHighlightStyle.sphere.scale).toBe(0.28)
    expect(selectedAtomHighlightStyle.sphere.color).toBe("#9ad8ff")
    expect(viewerMock.addStyle).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sphere: expect.objectContaining({ scale: 0.46 }) }),
    )
  })

  it("clears atom selection when the user clicks empty 3D canvas space", async () => {
    render(
      <Molecule3DmolViewer
        atoms={atoms}
        formula="CH3"
        sourceName="fixture.log"
      />,
    )

    const viewer = screen.getByTestId("molecule-3dmol-viewer")
    await waitFor(() => expect(threeDMolMock.latestAtomClick).toBeTypeOf("function"))

    act(() => {
      threeDMolMock.latestAtomClick?.({ index: 1 })
    })
    await screen.findByText("H2")

    fireEvent.pointerDown(viewer)
    fireEvent.click(viewer)

    await waitFor(() => expect(screen.queryByText("H2")).not.toBeInTheDocument())
  })

  it("does not clear atom selection when the click came from an atom", async () => {
    render(
      <Molecule3DmolViewer
        atoms={atoms}
        formula="CH3"
        sourceName="fixture.log"
      />,
    )

    const viewer = screen.getByTestId("molecule-3dmol-viewer")
    await waitFor(() => expect(threeDMolMock.latestAtomClick).toBeTypeOf("function"))

    fireEvent.pointerDown(viewer)
    act(() => {
      threeDMolMock.latestAtomClick?.({ index: 1 })
    })
    fireEvent.click(viewer)

    await waitFor(() => expect(screen.getByText("H2")).toBeInTheDocument())
  })

  it("uses 3Dmol native vibration frames instead of rebuilding the model on animation frames", async () => {
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame")

    try {
      render(
        <Molecule3DmolViewer
          atoms={atoms}
          formula="CH3"
          sourceName="fixture.log"
          vibrationMode={{
            modeId: "mode-1",
            modeIndex: 1,
            frequencyCm1: -220,
            kind: "imaginary",
            displacements: atoms.map((_atom, atomIndex) => ({ atomIndex, dx: 0.01 * (atomIndex + 1), dy: 0.02, dz: 0.03 })),
            source: "rxnflow-text",
          }}
          vibrationPlaying
        />,
      )

      await waitFor(() => {
        expect(viewerMock.vibrate).toHaveBeenCalledWith(30, 0.45, true, undefined)
        expect(viewerMock.animate).toHaveBeenCalledWith({
          loop: "backAndForth",
          interval: 16,
        })
      })

      const vibrationXyz = viewerMock.addModel.mock.calls.at(-1)?.[0] as string
      expect(vibrationXyz).toContain("C 0.000000 0.000000 0.000000 0.010000 0.020000 0.030000")
      expect(vibrationXyz).toContain("H 1.000000 1.000000 1.000000 0.040000 0.020000 0.030000")
      expect(requestAnimationFrameSpy).not.toHaveBeenCalled()
    } finally {
      requestAnimationFrameSpy.mockRestore()
    }
  })

  it("restores the original native vibration frame when playback is paused", async () => {
    render(
      <Molecule3DmolViewer
        atoms={atoms}
        formula="CH3"
        sourceName="fixture.log"
        vibrationMode={{
          modeId: "mode-1",
          modeIndex: 1,
          frequencyCm1: -220,
          kind: "imaginary",
          displacements: atoms.map((_atom, atomIndex) => ({ atomIndex, dx: 0.01, dy: 0, dz: 0 })),
          source: "rxnflow-text",
        }}
        vibrationPlaying={false}
      />,
    )

    await waitFor(() => {
      expect(viewerMock.vibrate).toHaveBeenCalledWith(30, 0.45, true, undefined)
      expect(viewerMock.setFrame).toHaveBeenCalledWith(30)
    })
    expect(viewerMock.animate).not.toHaveBeenCalled()
  })
})
