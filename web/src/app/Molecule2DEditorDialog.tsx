import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ClipboardEvent as ReactClipboardEvent, ErrorInfo, ReactNode } from "react"
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
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading")
  const [message, setMessage] = useState("Loading Ketcher editor…")
  const initialStructure = useMemo(() => (
    node.manualStructureKet
    || node.manualStructureMolfile
    || (atoms.length > 0 ? molfileFromAtoms(atoms) : "")
  ), [atoms, node.manualStructureKet, node.manualStructureMolfile])

  const pasteStructureIntoKetcher = useCallback(async (candidate: ClipboardStructureCandidate) => {
    const ketcher = ketcherRef.current
    if (!ketcher || !candidate.text.trim()) return false
    try {
      await ketcher.setMolecule(candidate.text, { needZoom: true })
      setStatus("ready")
      setMessage(`Pasted ${candidate.label} structure.`)
      return true
    } catch (error) {
      console.warn("RxnFlow Ketcher paste fallback failed", candidate.label, error)
      setStatus("ready")
      setMessage("Ketcher could not read the pasted structure.")
      return false
    }
  }, [])

  const pasteFromDesktopClipboard = useCallback(async () => {
    const result = await window.rxnflowDesktop?.readChemicalClipboard?.()
    const candidate = structureCandidateFromDesktopClipboard(result)
    if (candidate) void pasteStructureIntoKetcher(candidate)
  }, [pasteStructureIntoKetcher])

  const handlePasteCapture = useCallback((event: ReactClipboardEvent<HTMLElement>) => {
    const candidate = structureCandidateFromClipboardData(event.clipboardData)
    if (candidate) {
      event.preventDefault()
      void pasteStructureIntoKetcher(candidate)
      return
    }
    if (window.rxnflowDesktop?.readChemicalClipboard) {
      void pasteFromDesktopClipboard()
    }
  }, [pasteFromDesktopClipboard, pasteStructureIntoKetcher])

  useEffect(() => {
    const root = hostRef.current
    if (!root) return undefined
    const decorate = () => decorateKetcherTooltips(root)
    decorate()
    const observer = new MutationObserver(decorate)
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["title", "aria-label"] })
    return () => observer.disconnect()
  }, [status])

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
      onClose()
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
          <div className="molecule-editor-header-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="button" className="command-button" onClick={saveStructure} disabled={status !== "ready"}>Save</button>
          </div>
        </header>
        <div className="molecule-editor-shell">
          <div
            ref={hostRef}
            className="molecule-editor-host molecule-editor-host-ketcher"
            aria-label="Ketcher 2D structure editor"
            onPasteCapture={handlePasteCapture}
          >
            <MoleculeEditorErrorBoundary
              key={node.id}
              onError={(nextMessage) => {
                setStatus("error")
                setMessage(nextMessage)
              }}
            >
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
            </MoleculeEditorErrorBoundary>
          </div>
          {status !== "ready" ? <div className={`molecule-editor-status${status === "error" ? " is-error" : ""}`}>{message}</div> : null}
        </div>
      </section>
    </div>
  )
}

class MoleculeEditorErrorBoundary extends Component<{
  children: ReactNode
  onError: (message: string) => void
}, { hasError: boolean; message: string }> {
  state = {
    hasError: false,
    message: "",
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: editorErrorMessage(error),
    }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    const message = editorErrorMessage(error)
    console.error("RxnFlow Ketcher editor crashed", error, errorInfo)
    this.props.onError(message)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="molecule-editor-status is-error" role="alert">
          {this.state.message}
        </div>
      )
    }
    return this.props.children
  }
}

function editorErrorMessage(error: unknown): string {
  const detail = error instanceof Error && error.message ? ` (${error.message})` : ""
  return `Ketcher editor could not load. The rest of RxnFlow is still available.${detail}`
}

type ClipboardStructureCandidate = {
  text: string
  label: string
}

type DesktopChemicalClipboardResult = {
  ok: boolean
  formats: string[]
  text?: string
  html?: string
  payloads?: Array<{ format: string; text: string }>
}

const chemicalClipboardTypePattern = /(cdxml|chem|chemical|molfile|mdl|mol|rxn|skc|com\.cambridgesoft|xml|html|text\/plain)/i

function structureCandidateFromClipboardData(clipboardData: DataTransfer | null): ClipboardStructureCandidate | null {
  if (!clipboardData) return null
  const types = Array.from(clipboardData.types)
  const orderedTypes = [
    ...types.filter((type) => /cdxml|chem|chemical|molfile|mdl|mol|rxn|skc|com\.cambridgesoft/i.test(type)),
    ...types.filter((type) => /text\/plain/i.test(type)),
    ...types.filter((type) => /text\/html/i.test(type)),
  ]
  for (const type of orderedTypes) {
    const text = clipboardData.getData(type)
    const candidate = structureCandidateFromText(text, type, chemicalClipboardTypePattern.test(type))
    if (candidate) return candidate
  }
  return null
}

function structureCandidateFromDesktopClipboard(result: DesktopChemicalClipboardResult | undefined): ClipboardStructureCandidate | null {
  if (!result?.ok) return null
  const payloads = [
    ...(result.payloads ?? []),
    ...(result.text ? [{ format: "text/plain", text: result.text }] : []),
    ...(result.html ? [{ format: "text/html", text: result.html }] : []),
  ].sort((a, b) => chemicalClipboardPriority(a.format) - chemicalClipboardPriority(b.format))

  for (const payload of payloads) {
    const candidate = structureCandidateFromText(payload.text, payload.format, chemicalClipboardTypePattern.test(payload.format))
    if (candidate) return candidate
  }
  return null
}

function structureCandidateFromText(text: string, label: string, trustChemicalFormat = false): ClipboardStructureCandidate | null {
  const extracted = extractKnownStructurePayload(text)
  if (extracted) return { text: extracted, label }
  const trimmed = text.trim()
  if (trustChemicalFormat && trimmed.length > 0) return { text: trimmed, label }
  return null
}

function extractKnownStructurePayload(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const decoded = decodeHtmlEntities(trimmed)
  const candidates = [trimmed, decoded]
  for (const candidate of candidates) {
    const cdxml = candidate.match(/(?:<\?xml[\s\S]*?\?>\s*)?<CDXML[\s\S]*?<\/CDXML>/i)?.[0]
    if (cdxml) return cdxml
    const molBlock = candidate.match(/(?:^[^\n]*\n){0,3}[\s\S]*?(?:V2000|V3000)[\s\S]*?M\s+END/i)?.[0]
    if (molBlock) return molBlock
    const rxnBlock = candidate.match(/\$RXN[\s\S]*?(?:M\s+END)?/i)?.[0]
    if (rxnBlock) return rxnBlock
    if (/^\s*\{[\s\S]*\"root\"[\s\S]*\"nodes\"[\s\S]*\}\s*$/.test(candidate)) return candidate
  }
  return null
}

function chemicalClipboardPriority(format: string): number {
  if (/cdxml|com\.cambridgesoft/i.test(format)) return 0
  if (/molfile|mdl|mol/i.test(format)) return 1
  if (/rxn/i.test(format)) return 2
  if (/text\/plain|text/i.test(format)) return 3
  if (/html/i.test(format)) return 4
  return 5
}

function decodeHtmlEntities(value: string): string {
  if (!/[&][a-z#0-9]+;/i.test(value)) return value
  if (typeof document === "undefined") {
    return value
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;/g, "'")
  }
  const textarea = document.createElement("textarea")
  textarea.innerHTML = value
  return textarea.value
}

function decorateKetcherTooltips(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("button[title], [role='button'][title]").forEach((element) => {
    const title = element.getAttribute("title")?.trim()
    if (!title) return
    element.dataset.rxnflowTooltip = title
    if (!element.getAttribute("aria-label")) element.setAttribute("aria-label", title)
  })
}
