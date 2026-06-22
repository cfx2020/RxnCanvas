import { useEffect, useMemo, useRef, useState } from "react"
import type { CoordinateAtom } from "../domain/sourceParsers"
import type { GLViewer } from "3dmol/build/types/GLViewer"

type Molecule3DmolViewerProps = {
  atoms: CoordinateAtom[]
  formula: string
  sourceName: string
  compact?: boolean
}

type ViewerStatus = "loading" | "ready" | "unavailable" | "error"

export function Molecule3DmolViewer({ atoms, formula, sourceName, compact = false }: Molecule3DmolViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<ViewerStatus>("loading")
  const xyz = useMemo(() => xyzFromAtoms(atoms, `${sourceName} ${formula}`), [atoms, formula, sourceName])

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
        const $3Dmol = await import("3dmol")
        if (disposed || !containerRef.current) return

        container.innerHTML = ""
        viewer = $3Dmol.createViewer(container, {
          backgroundColor: "rgba(248, 252, 253, 0)",
          antialias: true,
        })
        viewer.addModel(xyz, "xyz")
        viewer.setStyle({}, {
          stick: { radius: 0.13, colorscheme: "Jmol" },
          sphere: { scale: 0.28, colorscheme: "Jmol" },
        })
        viewer.zoomTo()
        viewer.render()
        viewer.resize?.()
        setStatus("ready")
      } catch (error) {
        console.error("RxnFlow 3Dmol viewer failed", error)
        if (!disposed) setStatus("error")
      }
    }

    void mountViewer()

    return () => {
      disposed = true
      try {
        viewer?.removeAllModels?.()
        viewer?.clear?.()
      } catch {
        // Best-effort cleanup only; 3Dmol owns the WebGL context.
      }
      if (containerRef.current) containerRef.current.innerHTML = ""
    }
  }, [atoms.length, xyz])

  if (atoms.length === 0) {
    return (
      <div className={compact ? "structure-orbit molecule-3dmol-empty molecule-3dmol-compact" : "structure-orbit molecule-3dmol-empty"} aria-label="Coordinate preview unavailable">
        <strong>{compact ? "No 3D coordinates" : "No 3D coordinates in this source"}</strong>
        <span>{compact ? "Import coordinates to preview." : "Import Gaussian / ORCA / XYZ files with coordinate blocks to view them in 3Dmol."}</span>
      </div>
    )
  }

  return (
    <div className={compact ? "structure-orbit molecule-3dmol-shell molecule-3dmol-compact" : "structure-orbit molecule-3dmol-shell"}>
      {compact ? null : (
        <div className="molecule-3dmol-hud">
          <span>3Dmol.js</span>
          <span>{atoms.length} atoms</span>
          <span>Mouse drag / wheel</span>
        </div>
      )}
      {status === "loading" ? <div className="molecule-3dmol-status">Loading 3Dmol viewer…</div> : null}
      {status === "unavailable" ? <div className="molecule-3dmol-status">WebGL unavailable in this environment.</div> : null}
      {status === "error" ? <div className="molecule-3dmol-status">3Dmol failed to render this structure.</div> : null}
      <div
        ref={containerRef}
        className="molecule-3dmol-canvas"
        role="img"
        aria-label={`3Dmol ball-and-stick model with ${atoms.length} atoms`}
        data-testid="molecule-3dmol-viewer"
      />
    </div>
  )
}

function xyzFromAtoms(atoms: CoordinateAtom[], comment: string): string {
  return [
    String(atoms.length),
    comment,
    ...atoms.map((atom) => `${atom.element} ${formatCoordinate(atom.x)} ${formatCoordinate(atom.y)} ${formatCoordinate(atom.z)}`),
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
