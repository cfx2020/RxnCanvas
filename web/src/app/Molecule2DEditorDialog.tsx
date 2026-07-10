import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ClipboardEvent as ReactClipboardEvent, ErrorInfo, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react"
import type { Ketcher } from "ketcher-core"
import type { FlowNode, ManualStructurePayload } from "../domain/projectPackages"
import type { CoordinateAtom } from "../domain/sourceParsers"
import { molfileFromAtoms } from "./Molecule2DDepiction"

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
  const toastTimerRef = useRef<number | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading")
  const [message, setMessage] = useState("Loading Ketcher editor…")
  const [toast, setToast] = useState<{ message: string; tone: "info" | "error" } | null>(null)
  const initialStructure = useMemo(() => (
    node.manualStructureKet
    || node.manualStructureMolfile
    || (atoms.length > 0 ? molfileFromAtoms(atoms) : "")
  ), [atoms, node.manualStructureKet, node.manualStructureMolfile])

  const showClipboardToast = useCallback((nextMessage: string, tone: "info" | "error" = "info", duration = 2600) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    setToast({ message: nextMessage, tone })
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, duration)
  }, [])

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
  }, [])

  const pasteStructureIntoKetcher = useCallback(async (candidate: ClipboardStructureCandidate) => {
    const ketcher = ketcherRef.current
    if (!ketcher || !candidate.text.trim()) return false
    try {
      await ketcher.addFragment(candidate.text, { needZoom: true })
      setStatus("ready")
      showClipboardToast(`Pasted ${candidate.label} structure.`)
      return true
    } catch (error) {
      console.warn("RxnFlow Ketcher paste failed", candidate.label, error)
      setStatus("ready")
      showClipboardToast("Ketcher could not read the pasted structure.", "error", 4200)
      return false
    }
  }, [showClipboardToast])

  const pasteFromDesktopClipboard = useCallback(async () => {
    const result = await window.rxnflowDesktop?.readChemicalClipboard?.()
    if (!result?.ok) {
      setStatus("ready")
      showClipboardToast(result?.error ? `Could not read clipboard: ${result.error}` : "Could not read the system clipboard.", "error", 4200)
      return false
    }
    const candidate = structureCandidateFromDesktopClipboard(result)
    if (!candidate) {
      setStatus("ready")
      console.warn("RxnFlow Ketcher paste found no supported chemical clipboard payload", {
        formats: result.formats,
        payloadFormats: result.payloads?.map((payload) => payload.format) ?? [],
      })
      showClipboardToast(`Clipboard has no supported structure.${clipboardFormatsSummary(result.formats)}`, "error", 5200)
      return false
    }
    return pasteStructureIntoKetcher(candidate)
  }, [pasteStructureIntoKetcher, showClipboardToast])

  const handlePasteCapture = useCallback((event: ReactClipboardEvent<HTMLElement>) => {
    if (isEditableTarget(event.target) && !isKetcherClipboardTarget(event.target)) return
    const candidate = structureCandidateFromClipboardData(event.clipboardData)
    if (candidate) {
      event.preventDefault()
      void pasteStructureIntoKetcher(candidate)
      return
    }
    if (window.rxnflowDesktop?.readChemicalClipboard) {
      event.preventDefault()
      event.stopPropagation()
      void pasteFromDesktopClipboard()
    }
  }, [pasteFromDesktopClipboard, pasteStructureIntoKetcher])

  const copyToDesktopClipboard = useCallback(async () => {
    const ketcher = ketcherRef.current
    if (!ketcher) return false
    setStatus("ready")
    showClipboardToast("Copying structure to ChemDraw clipboard...", "info", 1400)
    try {
      const [ket, molfile, cdxml, cdx] = await Promise.all([
        ketcher.getKet().catch(() => ""),
        ketcher.getMolfile("v3000").catch(() => ""),
        ketcher.getCDXml().catch(() => ""),
        ketcher.getCDX().catch(() => ""),
      ])
      const text = cdxml || molfile || ket || cdx
      if (!text.trim()) {
        showClipboardToast("There is no structure to copy.", "error", 3200)
        return false
      }
      const result = await window.rxnflowDesktop?.writeChemicalClipboard?.({
        cdxml,
        cdx,
        molfile,
        ket,
        text,
      })
      if (!result?.ok) {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
        showClipboardToast(result?.error ? `Copied plain text only: ${result.error}` : "Copied plain text only.", "error", 4200)
        return false
      }
      console.info("RxnFlow wrote chemical clipboard formats", result.formats)
      showClipboardToast("Copied structure for ChemDraw.")
      return true
    } catch (error) {
      console.error("RxnFlow Ketcher native copy failed", error)
      showClipboardToast("Ketcher could not copy the current structure.", "error", 4200)
      return false
    }
  }, [showClipboardToast])

  const enrichKetcherClipboardForDesktop = useCallback(async () => {
    const ketcher = ketcherRef.current
    const desktop = window.rxnflowDesktop
    if (!ketcher || !desktop?.readChemicalClipboard || !desktop.writeChemicalClipboard) return
    const result = await desktop.readChemicalClipboard()
    const candidate = structureCandidateFromDesktopClipboard(result)
    if (!candidate) return
    try {
      const [ket, molfile, cdxml, cdx] = await Promise.all([
        convertClipboardStructure(ketcher, candidate.text, ketcherChemicalMimeTypes.ket),
        convertClipboardStructure(ketcher, candidate.text, ketcherChemicalMimeTypes.mol),
        convertClipboardStructure(ketcher, candidate.text, ketcherChemicalMimeTypes.cdxml),
        convertClipboardStructure(ketcher, candidate.text, ketcherChemicalMimeTypes.cdx),
      ])
      const text = cdxml || molfile || ket || candidate.text
      if (!text.trim()) return
      await desktop.writeChemicalClipboard({ ket, molfile, cdxml, cdx, text })
    } catch (error) {
      console.warn("RxnFlow could not enrich the Ketcher clipboard for ChemDraw", error)
    }
  }, [])

  const handleKetcherRuntimeError = useCallback((nextMessage: string) => {
    console.warn("RxnFlow Ketcher runtime error", nextMessage)
    if (!ketcherRef.current) {
      setStatus("error")
      setMessage(ketcherEditorStartupMessage(nextMessage))
      return
    }
    setStatus("ready")
    showClipboardToast(ketcherRuntimeErrorToast(nextMessage), "error", 5600)
  }, [showClipboardToast])

  const handleKetcherClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target : null
    const pasteButton = target?.closest("[data-testid='paste-from-clipboard-button'], [data-testid='paste-button'], button[title='Paste'], [aria-label='Paste']")
    if (pasteButton) {
      event.preventDefault()
      event.stopPropagation()
      void pasteFromDesktopClipboard()
      return
    }
    const copyButton = target?.closest("[data-testid='copy-to-clipboard']")
    if (copyButton) {
      event.preventDefault()
      event.stopPropagation()
      void copyToDesktopClipboard()
    }
  }, [copyToDesktopClipboard, pasteFromDesktopClipboard])

  const handleClipboardShortcut = useCallback((event: ClipboardShortcutEvent) => {
    const commandKey = event.metaKey || event.ctrlKey
    if (!commandKey || event.altKey || event.shiftKey) return
    const key = event.key.toLowerCase()
    const ketcherOwnsShortcut = isTargetInsideElement(event.target, hostRef.current)
      || isTargetInsideElement(document.activeElement, hostRef.current)
    if (isEditableTarget(event.target) && !(key === "v" && isKetcherClipboardTarget(event.target))) return
    if (key === "c" && ketcherOwnsShortcut) return
    if (key === "v" && window.rxnflowDesktop?.readChemicalClipboard) {
      event.preventDefault()
      event.stopPropagation()
      void pasteFromDesktopClipboard()
    }
    if (key === "c") {
      event.preventDefault()
      event.stopPropagation()
      void copyToDesktopClipboard()
    }
  }, [copyToDesktopClipboard, pasteFromDesktopClipboard])

  const handleKetcherKeyDownCapture = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    handleClipboardShortcut(event)
  }, [handleClipboardShortcut])

  useEffect(() => {
    const root = hostRef.current
    if (!root) return undefined
    const handleCopy = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target) && !isKetcherClipboardTarget(event.target)) return
      window.setTimeout(() => {
        void enrichKetcherClipboardForDesktop()
      }, 120)
    }
    root.addEventListener("copy", handleCopy)
    return () => root.removeEventListener("copy", handleCopy)
  }, [enrichKetcherClipboardForDesktop])

  useEffect(() => {
    const root = hostRef.current
    if (!root) return undefined
    const decorate = () => decorateKetcherTooltips(root)
    decorate()
    const observer = new MutationObserver(decorate)
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["title", "aria-label"] })
    return () => observer.disconnect()
  }, [status])

  useEffect(() => {
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      const dialog = hostRef.current?.closest(".molecule-editor-dialog")
      if (!dialog) return
      const target = event.target instanceof Node ? event.target : null
      const activeElement = document.activeElement
      const targetIsAmbient = event.target === document || event.target === document.body || event.target === document.documentElement
      const activeInsideDialog = activeElement instanceof Node && dialog.contains(activeElement)
      if (target && !dialog.contains(target) && !targetIsAmbient && !activeInsideDialog) return
      handleClipboardShortcut(event)
    }
    document.addEventListener("keydown", handleDocumentKeyDown, true)
    return () => document.removeEventListener("keydown", handleDocumentKeyDown, true)
  }, [handleClipboardShortcut])

  const showStatusMessage = status !== "ready"

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
      onSave(node.id, { ket, molfile, cdxml })
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
            onClickCapture={handleKetcherClickCapture}
            onKeyDownCapture={handleKetcherKeyDownCapture}
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
                  onError={handleKetcherRuntimeError}
                />
              </Suspense>
            </MoleculeEditorErrorBoundary>
          </div>
          {showStatusMessage ? <div className={`molecule-editor-status${status === "error" ? " is-error" : ""}`}>{message}</div> : null}
          {toast ? <div className={`molecule-editor-toast${toast.tone === "error" ? " is-error" : ""}`} role="status">{toast.message}</div> : null}
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

function ketcherEditorStartupMessage(message: string): string {
  if (/styles?|initial structure|could not load/i.test(message)) return message
  return "Ketcher editor reported an error while loading."
}

function ketcherRuntimeErrorToast(message: string): string {
  if (/convert error|could not be loaded|loader|unsupported|invalid|unable to accept/i.test(message)) {
    return "Ketcher could not open that structure file. Use .mol, .sdf, .rxn, .cdxml, .cdx, .ket, .smi, .smiles, .cml or .mrv."
  }
  return "Ketcher reported an editor error."
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

type ClipboardShortcutEvent = Pick<KeyboardEvent | ReactKeyboardEvent<HTMLElement>, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey" | "target" | "preventDefault" | "stopPropagation">

const chemicalClipboardTypePattern = /(cdif|stru|chms|cdxm|cdx|cdxml|chem|chemical|molfile|mdl|mol|rxn|skc|com\.(cambridgesoft|perkinelmer|revvity)|xml|html|text\/plain)/i
const ketcherChemicalMimeTypes = {
  ket: "chemical/x-indigo-ket",
  mol: "chemical/x-mdl-molfile",
  cdxml: "chemical/x-cdxml",
  cdx: "chemical/x-cdx",
} as const
type KetcherChemicalMimeType = typeof ketcherChemicalMimeTypes[keyof typeof ketcherChemicalMimeTypes]

function structureCandidateFromClipboardData(clipboardData: DataTransfer | null): ClipboardStructureCandidate | null {
  if (!clipboardData) return null
  const types = Array.from(clipboardData.types)
  const orderedTypes = [
    ...types.filter((type) => /cdx|cdxml|chem|chemical|molfile|mdl|mol|rxn|skc|com\.cambridgesoft/i.test(type)),
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
  if (!trimmed) return null
  if (/cdx/i.test(label)) {
    const cdx = base64CdxPayload(trimmed)
    if (cdx) return { text: cdx, label }
  }
  if (trustChemicalFormat) return { text: trimmed, label }
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
    const cdx = base64CdxPayload(candidate)
    if (cdx) return cdx
  }
  return null
}

function chemicalClipboardPriority(format: string): number {
  if (/ket|indigo/i.test(format)) return 0
  if (/cdxml/i.test(format)) return 1
  if (/cdif|stru|chms|cdxm|cdx|com\.(cambridgesoft|perkinelmer|revvity)/i.test(format)) return 2
  if (/molfile|mdl|mol/i.test(format)) return 3
  if (/smiles|daylight|chemaxon/i.test(format)) return 4
  if (/rxn/i.test(format)) return 5
  if (/text\/plain|text/i.test(format)) return 6
  if (/html/i.test(format)) return 7
  return 8
}

function clipboardFormatsSummary(formats: string[]): string {
  if (formats.length === 0) return ""
  const visible = formats.slice(0, 5).join(", ")
  return ` Formats: ${visible}${formats.length > 5 ? ", ..." : ""}`
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest("input, textarea, [contenteditable='true'], [contenteditable=''], [role='textbox']"))
}

function isKetcherClipboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    (target instanceof HTMLTextAreaElement && /cliparea/i.test(String(target.className)))
    || target.closest("[data-cliparea], [class*='cliparea']"),
  )
}

function isTargetInsideElement(target: EventTarget | null, element: HTMLElement | null): boolean {
  return Boolean(element && target instanceof Node && element.contains(target))
}

async function convertClipboardStructure(ketcher: Ketcher, text: string, outputFormat: KetcherChemicalMimeType): Promise<string> {
  if (!text.trim()) return ""
  const result = await ketcher.indigo.convert(text, { outputFormat } as NonNullable<Parameters<Ketcher["indigo"]["convert"]>[1]>).catch(() => null)
  return typeof result?.struct === "string" ? result.struct.trim() : ""
}

function decorateKetcherTooltips(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("button[title], [role='button'][title]").forEach((element) => {
    const title = element.getAttribute("title")?.trim()
    if (!title) return
    element.dataset.rxnflowTooltip = title
    if (!element.getAttribute("aria-label")) element.setAttribute("aria-label", title)
  })
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

function base64CdxPayload(value: string): string | null {
  const compact = value.replace(/\s+/g, "")
  return compact.length > 40 && /^[a-z0-9+/]+={0,2}$/i.test(compact) ? compact : null
}
