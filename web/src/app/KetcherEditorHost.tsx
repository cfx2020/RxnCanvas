import { useEffect, useMemo, useState } from "react"
import type { Ketcher } from "ketcher-core"
import { Editor } from "ketcher-react"
import { StandaloneStructServiceProvider } from "ketcher-standalone"
import ketcherStylesheetHref from "ketcher-react/dist/index.css?url"
let ketcherStylesheetPromise: Promise<void> | null = null

function ensureKetcherStylesheet(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve()
  if (document.querySelector(`link[data-rxncanvas-ketcher-style="true"]`)) return Promise.resolve()
  if (ketcherStylesheetPromise) return ketcherStylesheetPromise
  ketcherStylesheetPromise = new Promise<void>((resolve, reject) => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = ketcherStylesheetHref
    link.dataset.rxncanvasKetcherStyle = "true"
    link.onload = () => resolve()
    link.onerror = () => reject(new Error("Ketcher stylesheet failed to load."))
    document.head.appendChild(link)
  }).catch((error) => {
    ketcherStylesheetPromise = null
    throw error
  })
  return ketcherStylesheetPromise
}

type KetcherEditorHostProps = {
  initialStructure: string
  onReady: (ketcher: Ketcher) => void
  onError: (message: string) => void
}

export function KetcherEditorHost({ initialStructure, onReady, onError }: KetcherEditorHostProps) {
  const structServiceProvider = useMemo(() => new StandaloneStructServiceProvider(), [])
  const staticResourcesUrl = import.meta.env.BASE_URL || "/"
  const [stylesReady, setStylesReady] = useState(false)

  useEffect(() => {
    let canceled = false
    ensureKetcherStylesheet()
      .then(() => {
        if (!canceled) setStylesReady(true)
      })
      .catch((error: unknown) => {
        console.error("RxnCanvas Ketcher stylesheet failed", error)
        if (!canceled) {
          setStylesReady(true)
          onError("Ketcher styles could not load; the editor may look incomplete.")
        }
      })
    return () => {
      canceled = true
    }
  }, [onError])

  if (!stylesReady) return <div className="molecule-editor-status">Loading Ketcher editor…</div>

  return (
    <Editor
      staticResourcesUrl={staticResourcesUrl}
      structServiceProvider={structServiceProvider}
      disableMacromoleculesEditor={true}
      errorHandler={onError}
      onInit={(ketcher) => {
        const ready = initialStructure
          ? ketcher.setMolecule(initialStructure, { needZoom: true }).then(() => ketcher)
          : Promise.resolve(ketcher)
        ready
          .then(onReady)
          .catch((error: unknown) => {
            console.error("RxnCanvas Ketcher initial structure failed", error)
            onError("Ketcher loaded, but the initial structure could not be opened.")
            onReady(ketcher)
          })
      }}
    />
  )
}
