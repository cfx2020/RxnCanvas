import { memo, useEffect, useRef, useState } from "react"
import type { PointerEvent } from "react"
import * as THREE from "three"
import type { Atom3DSummary } from "../shell"

type Molecule3DViewerProps = {
  atoms: Atom3DSummary[]
  label: string
  variant?: "node" | "large"
  interactiveMeasurements?: boolean
  infoLines?: string[]
}

type RenderableAtom = Atom3DSummary & {
  element: string
  x: number
  y: number
  z: number
}

type PointerRotationDraft = {
  x: number
  y: number
  rotationX: number
  rotationY: number
}

const yAxis = new THREE.Vector3(0, 1, 0)

export const Molecule3DViewer = memo(function Molecule3DViewer({
  atoms,
  label,
  variant = "node",
  interactiveMeasurements = false,
  infoLines = [],
}: Molecule3DViewerProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const moleculeGroupRef = useRef<THREE.Group | null>(null)
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null)
  const dragRef = useRef<PointerRotationDraft | null>(null)
  const renderSceneRef = useRef<(() => void) | null>(null)
  const [rendererState, setRendererState] = useState<"ready" | "fallback">("ready")
  const [selectedAtomIndices, setSelectedAtomIndices] = useState<number[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    const renderableAtoms = atoms
      .map(normalizeRenderableAtom3D)
      .filter((atom): atom is RenderableAtom => Boolean(atom))
    if (!canvas || !container || renderableAtoms.length === 0) return undefined
    if (!canAttemptWebGl()) {
      setRendererState("fallback")
      return undefined
    }

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    } catch {
      setRendererState("fallback")
      return undefined
    }
    setRendererState("ready")

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-2.4, 2.4, 1.55, -1.55, 0.1, 100)
    camera.position.set(0, 0, 7)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    scene.add(new THREE.AmbientLight(0xffffff, 1.5))
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4)
    keyLight.position.set(3, 5, 6)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xcfe7ff, 1.15)
    fillLight.position.set(-4, -3, 4)
    scene.add(fillLight)

    const group = buildMoleculeGroup(renderableAtoms, new Set(selectedAtomIndices))
    group.rotation.x = -0.34
    group.rotation.y = 0.54
    moleculeGroupRef.current = group
    scene.add(group)

    let disposed = false
    const renderScene = () => {
      if (disposed) return
      renderer.render(scene, camera)
    }
    renderSceneRef.current = renderScene

    const resize = () => {
      const width = Math.max(1, Math.floor(container.clientWidth))
      const height = Math.max(1, Math.floor(container.clientHeight))
      const aspect = width / height
      camera.left = -2.4 * aspect
      camera.right = 2.4 * aspect
      camera.top = 2.4
      camera.bottom = -2.4
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(width, height, false)
      renderScene()
    }

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(resize)
      : null
    resizeObserver?.observe(container)
    resize()

    return () => {
      disposed = true
      renderSceneRef.current = null
      resizeObserver?.disconnect()
      moleculeGroupRef.current = null
      scene.traverse((object: THREE.Object3D) => {
        const mesh = object as THREE.Mesh
        mesh.geometry?.dispose()
        const material = mesh.material
        if (Array.isArray(material)) {
          material.forEach((item) => item.dispose())
        } else {
          material?.dispose()
        }
      })
      renderer.dispose()
      cameraRef.current = null
    }
  }, [atoms, selectedAtomIndices])

  const stopPreviewEvent = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handlePointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    stopPreviewEvent(event)
    const group = moleculeGroupRef.current
    if (!group) return
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      rotationX: group.rotation.x,
      rotationY: group.rotation.y,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    const draft = dragRef.current
    if (!draft) return
    stopPreviewEvent(event)
    const group = moleculeGroupRef.current
    if (!group) return
    group.rotation.y = draft.rotationY + (event.clientX - draft.x) * 0.012
    group.rotation.x = clamp(draft.rotationX + (event.clientY - draft.y) * 0.012, -1.35, 1.35)
    renderSceneRef.current?.()
  }

  const handlePointerEnd = (event: PointerEvent<HTMLSpanElement>) => {
    const draft = dragRef.current
    if (draft) {
      stopPreviewEvent(event)
      if (
        interactiveMeasurements
        && Math.hypot(event.clientX - draft.x, event.clientY - draft.y) < 4
      ) {
        const pickedAtomIndex = pickAtomIndex(event, canvasRef.current, cameraRef.current, moleculeGroupRef.current)
        if (pickedAtomIndex !== null) {
          setSelectedAtomIndices((current) => [...current.filter((index) => index !== pickedAtomIndex), pickedAtomIndex].slice(-4))
        }
      }
      dragRef.current = null
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
  }

  const measurement = interactiveMeasurements
    ? moleculeMeasurementLabel(atoms, selectedAtomIndices)
    : null
  const overlayLines = [...infoLines, ...(measurement ? [measurement] : [])]

  return (
    <span
      ref={containerRef}
      className={`molecule-3d-viewer molecule-3d-viewer--${variant}`}
      role="img"
      aria-label={`${label} 3D structure`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      {rendererState === "fallback" ? (
        <small className="molecule-3d-viewer-fallback">3D</small>
      ) : null}
      {overlayLines.length > 0 ? (
        <span className="molecule-3d-info-overlay" aria-live="polite">
          {overlayLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      ) : null}
    </span>
  )
})

function buildMoleculeGroup(atoms: RenderableAtom[], selectedAtomIndices: Set<number>): THREE.Group {
  const group = new THREE.Group()
  const visibleAtoms = atoms.slice(0, 180)
  const center = moleculeCenter(visibleAtoms)
  const positions = visibleAtoms.map((atom) => new THREE.Vector3(atom.x - center.x, atom.y - center.y, atom.z - center.z))
  const radius = Math.max(0.35, ...positions.map((position) => position.length()))
  group.scale.setScalar(Math.min(1.55, 2.15 / radius))

  for (const [fromIndex, toIndex] of inferMoleculeBonds(visibleAtoms)) {
    const from = positions[fromIndex]
    const to = positions[toIndex]
    if (!from || !to) continue
    group.add(createBondMesh(from, to))
  }

  visibleAtoms.forEach((atom, index) => {
    const element = normalizeElementSymbol(atom.element)
    const selected = selectedAtomIndices.has(index)
    const geometry = new THREE.SphereGeometry(elementSphereRadius(element) * (selected ? 1.42 : 1), 32, 18)
    const material = new THREE.MeshStandardMaterial({
      color: selected ? 0xffd166 : elementColor(element),
      emissive: selected ? 0x7a4d00 : 0x000000,
      emissiveIntensity: selected ? 0.32 : 0,
      roughness: selected ? 0.28 : 0.42,
      metalness: element === "Ni" || element === "Pd" ? 0.24 : 0.04,
    })
    const sphere = new THREE.Mesh(geometry, material)
    sphere.position.copy(positions[index])
    sphere.userData.atomIndex = index
    group.add(sphere)
    if (selected) {
      const haloGeometry = new THREE.SphereGeometry(elementSphereRadius(element) * 1.75, 32, 12)
      const haloMaterial = new THREE.MeshBasicMaterial({
        color: 0xffcf4d,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      })
      const halo = new THREE.Mesh(haloGeometry, haloMaterial)
      halo.position.copy(positions[index])
      group.add(halo)
    }
  })

  return group
}

function pickAtomIndex(
  event: PointerEvent<HTMLSpanElement>,
  canvas: HTMLCanvasElement | null,
  camera: THREE.OrthographicCamera | null,
  group: THREE.Group | null,
): number | null {
  if (!canvas || !camera || !group) return null
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -(((event.clientY - rect.top) / rect.height) * 2 - 1),
  )
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(pointer, camera)
  const atomMeshes: THREE.Object3D[] = []
  group.traverse((object) => {
    if (typeof object.userData.atomIndex === "number") atomMeshes.push(object)
  })
  const hit = raycaster.intersectObjects(atomMeshes, false)[0]
  const atomIndex = hit?.object.userData.atomIndex
  return typeof atomIndex === "number" ? atomIndex : null
}

function moleculeMeasurementLabel(atoms: Atom3DSummary[], selectedAtomIndices: number[]): string | null {
  const selectedAtoms = selectedAtomIndices
    .map((index) => {
      const atom = normalizeRenderableAtom3D(atoms[index])
      return atom ? { atom, label: atomSelectionLabel(atom, index) } : null
    })
    .filter((entry): entry is { atom: RenderableAtom; label: string } => Boolean(entry))
  if (selectedAtoms.length < 2) return null
  if (selectedAtoms.length === 2) {
    return `B = ${atomDistance(selectedAtoms[0].atom, selectedAtoms[1].atom).toFixed(5)} (${selectedAtoms.map((entry) => entry.label).join(" ")})`
  }
  if (selectedAtoms.length === 3) {
    return `A = ${atomAngle(selectedAtoms[0].atom, selectedAtoms[1].atom, selectedAtoms[2].atom).toFixed(3)} (${selectedAtoms.map((entry) => entry.label).join(" ")})`
  }
  return `D = ${atomDihedral(selectedAtoms[0].atom, selectedAtoms[1].atom, selectedAtoms[2].atom, selectedAtoms[3].atom).toFixed(3)} (${selectedAtoms.map((entry) => entry.label).join(" ")})`
}

function atomSelectionLabel(atom: RenderableAtom, index: number): string {
  return `${normalizeElementSymbol(atom.element)}${index + 1}`
}

function atomAngle(a: RenderableAtom, b: RenderableAtom, c: RenderableAtom): number {
  const ba = new THREE.Vector3(a.x - b.x, a.y - b.y, a.z - b.z).normalize()
  const bc = new THREE.Vector3(c.x - b.x, c.y - b.y, c.z - b.z).normalize()
  return THREE.MathUtils.radToDeg(Math.acos(clamp(ba.dot(bc), -1, 1)))
}

function atomDihedral(a: RenderableAtom, b: RenderableAtom, c: RenderableAtom, d: RenderableAtom): number {
  const p0 = new THREE.Vector3(a.x, a.y, a.z)
  const p1 = new THREE.Vector3(b.x, b.y, b.z)
  const p2 = new THREE.Vector3(c.x, c.y, c.z)
  const p3 = new THREE.Vector3(d.x, d.y, d.z)
  const b0 = new THREE.Vector3().subVectors(p0, p1)
  const b1 = new THREE.Vector3().subVectors(p2, p1).normalize()
  const b2 = new THREE.Vector3().subVectors(p3, p2)
  const v = b0.sub(b1.clone().multiplyScalar(b0.dot(b1)))
  const w = b2.sub(b1.clone().multiplyScalar(b2.dot(b1)))
  const x = v.dot(w)
  const y = new THREE.Vector3().crossVectors(b1, v).dot(w)
  return THREE.MathUtils.radToDeg(Math.atan2(y, x))
}

function createBondMesh(from: THREE.Vector3, to: THREE.Vector3): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(to, from)
  const length = direction.length()
  const geometry = new THREE.CylinderGeometry(0.035, 0.035, Math.max(length, 0.01), 16)
  const material = new THREE.MeshStandardMaterial({
    color: 0x8c989c,
    roughness: 0.56,
    metalness: 0.02,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(from).add(to).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(yAxis, direction.normalize())
  return mesh
}

function normalizeRenderableAtom3D(atom: Atom3DSummary): RenderableAtom | null {
  const x = Number(atom.x)
  const y = Number(atom.y)
  const z = Number(atom.z)
  if (!atom.element || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
  return {
    ...atom,
    element: String(atom.element),
    x,
    y,
    z,
  }
}

function moleculeCenter(atoms: RenderableAtom[]): { x: number; y: number; z: number } {
  const count = atoms.length || 1
  return {
    x: atoms.reduce((sum, atom) => sum + atom.x, 0) / count,
    y: atoms.reduce((sum, atom) => sum + atom.y, 0) / count,
    z: atoms.reduce((sum, atom) => sum + atom.z, 0) / count,
  }
}

function inferMoleculeBonds(atoms: RenderableAtom[]): Array<[number, number]> {
  const bonds: Array<[number, number]> = []
  const maxBonds = 260
  for (let index = 0; index < atoms.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < atoms.length; nextIndex += 1) {
      const distance = atomDistance(atoms[index], atoms[nextIndex])
      const threshold = bondThreshold(atoms[index].element, atoms[nextIndex].element)
      if (distance <= threshold) bonds.push([index, nextIndex])
      if (bonds.length >= maxBonds) return bonds
    }
  }
  return bonds
}

function atomDistance(a: RenderableAtom, b: RenderableAtom): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function bondThreshold(a: string, b: string): number {
  const radiusA = covalentRadius(normalizeElementSymbol(a))
  const radiusB = covalentRadius(normalizeElementSymbol(b))
  return Math.min(2.65, Math.max(0.45, (radiusA + radiusB) * 1.22 + 0.22))
}

function normalizeElementSymbol(value: string): string {
  const normalized = value.trim()
  if (!normalized) return "X"
  return normalized.slice(0, 1).toUpperCase() + normalized.slice(1, 2).toLowerCase()
}

function covalentRadius(element: string): number {
  const radii: Record<string, number> = {
    H: 0.31,
    B: 0.84,
    C: 0.76,
    N: 0.71,
    O: 0.66,
    F: 0.57,
    P: 1.07,
    S: 1.05,
    Cl: 1.02,
    Br: 1.2,
    I: 1.39,
    Ni: 1.24,
    Pd: 1.39,
  }
  return radii[element] ?? 0.9
}

function elementSphereRadius(element: string): number {
  if (element === "H") return 0.12
  if (element === "C") return 0.17
  if (element === "O" || element === "N") return 0.18
  if (element === "Ni" || element === "Pd") return 0.23
  return 0.18
}

function elementColor(element: string): THREE.ColorRepresentation {
  const colors: Record<string, number> = {
    H: 0xf8fbfb,
    C: 0x293336,
    N: 0x3157a5,
    O: 0xb43b32,
    F: 0x5b8f5a,
    P: 0xb27b29,
    S: 0xc49a2c,
    Cl: 0x5f8f47,
    Br: 0x7c4d35,
    I: 0x6d4f84,
    Ni: 0x5f9a8a,
    Pd: 0x9aa0aa,
  }
  return colors[element] ?? 0x7b8588
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function canAttemptWebGl(): boolean {
  return typeof WebGLRenderingContext !== "undefined" || typeof WebGL2RenderingContext !== "undefined"
}
