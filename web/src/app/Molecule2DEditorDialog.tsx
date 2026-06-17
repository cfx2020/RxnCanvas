import { lazy, Suspense, useMemo, useRef, useState } from "react"
import type { Ketcher } from "ketcher-core"
import type { FlowNode, ManualStructurePayload } from "../domain/projectPackages"
import type { CoordinateAtom } from "../domain/sourceParsers"
import { molfileFromAtoms, svgFromMolfile } from "./Molecule2DDepiction"

const KetcherEditorHost = lazy(() => import("./KetcherEditorHost").then((module) => ({ default: module.KetcherEditorHost })))

type Molecule2DEditorDialogProps = {
  node: FlowNode
  atoms: CoordinateAtom[]
  onClose: () => void
  onSave: (nodeId: string, structure: ManualStructurePayload) => void
}

export function Molecule2DEditorDialog({ node, atoms, onClose, onSave }: Molecule2DEditorDialogProps) {
  const ketcherRef = useRef<Ketcher | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading")
  const [message, setMessage] = useState("Loading Ketcher editor…")
  const initialStructure = useMemo(() => (
    node.manualStructureKet
    || node.manualStructureMolfile
    || (atoms.length > 0 ? molfileFromAtoms(atoms) : "")
  ), [atoms, node.manualStructureKet, node.manualStructureMolfile])

  const saveStructure = async () => {
    const ketcher = ketcherRef.current
    if (!ketcher) return
    setStatus("saving")
    setMessage("Saving KET, Molfile and ChemDraw CDXML…")
    try {
      const [ket, molfile, cdxml] = await Promise.all([
        ketcher.getKet().catch(() => ""),
        ketcher.getMolfile("v3000").catch(() => ""),
        ketcher.getCDXml().catch(() => ""),
      ])
      const svg = svgFromMolfile(molfile, 260, 132) ?? undefined
      onSave(node.id, { ket, molfile, cdxml, svg })
    } catch (error) {
      console.error("RxnFlow Ketcher save failed", error)
      setStatus("error")
      setMessage("Ketcher could not export the current structure.")
    }
  }

  return (
    <div className="structure-preview-scrim molecule-editor-scrim" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="structure-preview-dialog molecule-editor-dialog" role="dialog" aria-modal="true" aria-label={`Edit 2D structure for ${node.label}`}>
        <header className="structure-preview-header">
          <div>
            <span>2D Structure Editor</span>
            <strong>{node.label}</strong>
          </div>
          <button type="button" onClick={onClose} aria-label="Close 2D structure editor">Close</button>
        </header>
        <div className="molecule-editor-shell">
          <div className="molecule-editor-host molecule-editor-host-ketcher" aria-label="Ketcher 2D structure editor">
            <Suspense fallback={<div className="molecule-editor-status">Loading Ketcher editor…</div>}>
              <KetcherEditorHost
                initialStructure={initialStructure}
                onReady={(ketcher) => {
                  ketcherRef.current = ketcher
                  setStatus("ready")
                  setMessage("Ketcher ready. Paste from ChemDraw or draw a 2D structure.")
                }}
                onError={(nextMessage) => {
                  setStatus("error")
                  setMessage(nextMessage)
                }}
              />
            </Suspense>
          </div>
          {status !== "ready" ? <div className={`molecule-editor-status${status === "error" ? " is-error" : ""}`}>{message}</div> : null}
        </div>
        <footer className="molecule-editor-actions">
          <p>Draw or paste a ChemDraw-compatible 2D structure. Saving stores KET, Molfile and CDXML for this node.</p>
          <div>
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="button" className="command-button" onClick={saveStructure} disabled={status !== "ready"}>Save 2D structure</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
