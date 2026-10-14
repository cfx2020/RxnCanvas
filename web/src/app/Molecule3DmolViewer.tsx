import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react"
import type { CoordinateAtom, VibrationalMode } from "../domain/sourceParseTypes"
import type { GLViewer } from "3dmol/build/types/GLViewer"
import { StructureUnavailableIcon } from "./StructureUnavailableIcon"
import {
  nextStructureAtomSelection,
  structureSelectionReadout,
} from "./structureMeasurements"
import { load3DmolModule } from "./Molecule3DmolViewer.loader"

type Molecule3DmolViewerProps = {
  atoms: CoordinateAtom[]
  formula: string
  sourceName: string
  compact?: boolean
  vibrationMode?: VibrationalMode | null
  vibrationPlaying?: boolean
}

type ViewerStatus = "loading" | "ready" | "unavailable" | "error"

const baseAtomSphereScale = 0.28
const selectedAtomHighlightColor = "#94caff"
const viewerDragThresholdPx = 4
const nativeVibrationFrameCount = 30
const nativeVibrationAmplitude = 0.45
const nativeVibrationIntervalMs = 16

const baseAtomStyle = {
  stick: { radius: 0.13, colorscheme: "Jmol" },
  sphere: { scale: baseAtomSphereScale, colorscheme: "Jmol" },
} as const

export const selectedAtomHighlightStyle = {
  stick: baseAtomStyle.stick,
  sphere: {
    scale: baseAtomSphereScale,
    color: selectedAtomHighlightColor,
  },
} as const

export function Molecule3DmolViewer({
  atoms,
  formula,
  sourceName,
  compact = false,
  vibrationMode = null,
  vibrationPlaying = false,
}: Molecule3DmolViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<GLViewer | null>(null)
  const latestSelectionRef = useRef<(atomIndex: number) => void>(() => undefined)
  const atomClickHandledRef = useRef(false)
  const blankClickSerialRef = useRef(0)
  const viewerPointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const viewerDraggedRef = useRef(false)
  const [status, setStatus] = useState<ViewerStatus>("loading")
  const [selectedAtomIndices, setSelectedAtomIndices] = useState<number[]>([])
  const structureComment = `${sourceName} ${formula}`
  const structureXyz = useMemo(() => xyzFromAtoms(atoms, structureComment), [atoms, structureComment])
  const vibrationXyz = useMemo(
    () => vibrationMode ? xyzFromAtoms(atoms, structureComment, vibrationMode) : null,
    [atoms, structureComment, vibrationMode],
  )
  const selectionReadout = useMemo(() => structureSelectionReadout(selectedAtomIndices, atoms), [atoms, selectedAtomIndices])

  useEffect(() => {
    let disposed = false
    let viewer: GLViewer | null = null

    async function mountViewer() {
      const container = containerRef.current
      if (!container || atoms.length === 0) {
        setStatus("unavailable")
        return
      }
      if (!hasWebGLSupport()) {
        setStatus("unavailable")
        return
      }

      try {
        setStatus("loading")
        const $3Dmol = await load3DmolModule()
        if (disposed || !containerRef.current) return

        container.innerHTML = ""
        viewer = $3Dmol.createViewer(container, {
          backgroundColor: "rgba(248, 252, 253, 0)",
          antialias: true,
        })
        viewerRef.current = viewer
        renderXyz(viewer, structureXyz, latestSelectionRef)
        viewer.zoomTo()
        viewer.render()
        viewer.resize?.()
        setStatus("ready")
      } catch (error) {
        console.error("RxnCanvas 3Dmol viewer failed", error)
        if (!disposed) setStatus("error")
      }
    }

    void mountViewer()

    return () => {
      disposed = true
      cleanupViewer(viewer, containerRef.current)
      viewerRef.current = null
    }
  }, [structureXyz])

  latestSelectionRef.current = (atomIndex: number) => {
    atomClickHandledRef.current = true
    blankClickSerialRef.current += 1
    setSelectedAtomIndices((currentAtomIndices) => nextStructureAtomSelection(currentAtomIndices, atomIndex))
  }

  const handleViewerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    atomClickHandledRef.current = false
    viewerPointerStartRef.current = { x: event.clientX, y: event.clientY }
    viewerDraggedRef.current = false
  }

  const handleViewerPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointerStart = viewerPointerStartRef.current
    if (!pointerStart || viewerDraggedRef.current) return
    const deltaX = event.clientX - pointerStart.x
    const deltaY = event.clientY - pointerStart.y
    if (Math.hypot(deltaX, deltaY) >= viewerDragThresholdPx) viewerDraggedRef.current = true
  }

  const handleViewerPointerUp = () => {
    viewerPointerStartRef.current = null
  }

  const handleViewerPointerCancel = () => {
    viewerPointerStartRef.current = null
    viewerDraggedRef.current = false
  }

  const handleViewerClick = () => {
    if (viewerDraggedRef.current) {
      viewerDraggedRef.current = false
      atomClickHandledRef.current = false
      return
    }
    const clickSerial = blankClickSerialRef.current + 1
    blankClickSerialRef.current = clickSerial
    window.setTimeout(() => {
      if (clickSerial !== blankClickSerialRef.current) return
      if (atomClickHandledRef.current) {
        atomClickHandledRef.current = false
        return
      }
      setSelectedAtomIndices((currentAtomIndices) => currentAtomIndices.length > 0 ? [] : currentAtomIndices)
    }, 0)
  }

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || status !== "ready") return
    let disposed = false

    stopViewerAnimation(viewer)

    if (!vibrationMode || !vibrationXyz) {
      renderXyz(viewer, structureXyz, latestSelectionRef, selectedAtomIndices)
      viewer.render()
      return
    }

    renderXyz(viewer, vibrationXyz, latestSelectionRef, selectedAtomIndices)
    viewer.vibrate(nativeVibrationFrameCount, nativeVibrationAmplitude, true, undefined as never)
    if (vibrationPlaying) {
      viewer.animate({
        loop: "backAndForth",
        interval: nativeVibrationIntervalMs,
      })
    } else {
      void viewer.setFrame(nativeVibrationFrameCount).then(() => {
        if (!disposed) viewer.render()
      })
    }

    return () => {
      disposed = true
      stopViewerAnimation(viewerRef.current)
    }
  }, [selectedAtomIndices, status, structureXyz, vibrationMode, vibrationPlaying, vibrationXyz])

  if (atoms.length === 0) {
    return (
      <div
        className={compact ? "structure-orbit molecule-3dmol-empty molecule-3dmol-compact" : "structure-orbit molecule-3dmol-empty"}
        role="img"
        aria-label="Coordinate preview unavailable"
      >
        <StructureUnavailableIcon className="structure-unavailable-icon" />
      </div>
    )
  }

  return (
    <div className={compact ? "structure-orbit molecule-3dmol-shell molecule-3dmol-compact" : "structure-orbit molecule-3dmol-shell"}>
      {status === "loading" ? <div className="molecule-3dmol-status">Loading 3Dmol viewer…</div> : null}
      {status === "unavailable" ? <div className="molecule-3dmol-status">WebGL unavailable in this environment.</div> : null}
      {status === "error" ? <div className="molecule-3dmol-status">3Dmol failed to render this structure.</div> : null}
      <div
        ref={containerRef}
        className="molecule-3dmol-canvas"
        role="img"
        aria-label={`3Dmol ball-and-stick model with ${atoms.length} atoms`}
        data-testid="molecule-3dmol-viewer"
        onPointerDown={handleViewerPointerDown}
        onPointerMove={handleViewerPointerMove}
        onPointerUp={handleViewerPointerUp}
        onPointerCancel={handleViewerPointerCancel}
        onClick={handleViewerClick}
      />
      {selectionReadout ? (
        <div className="molecule-3dmol-selection-readout" aria-label="Selected atom measurement">
          <span>{selectionReadout}</span>
        </div>
      ) : null}
    </div>
  )
}

function renderXyz(
  viewer: GLViewer,
  xyz: string,
  selectionRef: MutableRefObject<(atomIndex: number) => void> | null,
  selectedAtomIndices: number[] = [],
) {
  viewer.removeAllModels?.()
  viewer.addModel(xyz, "xyz")
  viewer.setStyle({}, baseAtomStyle)
  if (selectedAtomIndices.length > 0) {
    viewer.setStyle({ index: selectedAtomIndices }, selectedAtomHighlightStyle)
  }
  if (selectionRef) {
    viewer.setClickable?.({}, true, (atom: { serial?: number; index?: number }) => {
      const atomIndex = typeof atom.index === "number" ? atom.index : (typeof atom.serial === "number" ? atom.serial - 1 : -1)
      if (atomIndex >= 0) selectionRef.current(atomIndex)
    })
  }
}

function stopViewerAnimation(viewer: GLViewer | null) {
  const animationViewer = viewer as (GLViewer & { stopAnimate?: () => void }) | null
  animationViewer?.stopAnimate?.()
}

function cleanupViewer(viewer: GLViewer | null, container: HTMLDivElement | null) {
  try {
    stopViewerAnimation(viewer)
    const disposableViewer = viewer as (GLViewer & {
      removeAllSurfaces?: () => void
      removeAllShapes?: () => void
    }) | null
    disposableViewer?.removeAllSurfaces?.()
    disposableViewer?.removeAllShapes?.()
    disposableViewer?.removeAllModels?.()
    releaseWebGLContexts(container)
    disposableViewer?.clear?.()
  } catch {
    // Best-effort cleanup only; 3Dmol owns the WebGL context.
  }
  if (container) container.innerHTML = ""
}

function releaseWebGLContexts(container: HTMLElement | null) {
  if (!container) return
  container.querySelectorAll("canvas").forEach((canvas) => {
    const contexts = [
      canvas.getContext("webgl2"),
      canvas.getContext("webgl"),
      canvas.getContext("experimental-webgl"),
    ]
    contexts.forEach((context) => {
      const gl = context as WebGLRenderingContext | WebGL2RenderingContext | null
      const loseContext = gl?.getExtension?.("WEBGL_lose_context")
      loseContext?.loseContext?.()
    })
  })
}

function xyzFromAtoms(atoms: CoordinateAtom[], comment: string, vibrationMode?: VibrationalMode | null): string {
  const displacementByAtom = vibrationMode
    ? new Map(vibrationMode.displacements.map((displacement) => [displacement.atomIndex, displacement]))
    : null
  return [
    String(atoms.length),
    comment,
    ...atoms.map((atom, atomIndex) => {
      const baseCoordinates = `${atom.element} ${formatCoordinate(atom.x)} ${formatCoordinate(atom.y)} ${formatCoordinate(atom.z)}`
      const displacement = displacementByAtom?.get(atomIndex)
      return displacement
        ? `${baseCoordinates} ${formatCoordinate(displacement.dx)} ${formatCoordinate(displacement.dy)} ${formatCoordinate(displacement.dz)}`
        : baseCoordinates
    }),
  ].join("\n")
}

function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : "0.000000"
}

function hasWebGLSupport(): boolean {
  if (typeof window === "undefined" || typeof window.WebGLRenderingContext === "undefined") return false
  try {
    const canvas = document.createElement("canvas")
    return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
  } catch {
    return false
  }
}
