import { useMemo } from "react"
import type { Ketcher } from "ketcher-core"
import { Editor } from "ketcher-react"
import { StandaloneStructServiceProvider } from "ketcher-standalone"
import "ketcher-react/dist/index.css"

type KetcherEditorHostProps = {
  initialStructure: string
  onReady: (ketcher: Ketcher) => void
  onError: (message: string) => void
}

export function KetcherEditorHost({ initialStructure, onReady, onError }: KetcherEditorHostProps) {
  const structServiceProvider = useMemo(() => new StandaloneStructServiceProvider(), [])

  return (
    <Editor
      staticResourcesUrl="/"
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
            console.error("RxnFlow Ketcher initial structure failed", error)
            onError("Ketcher loaded, but the initial structure could not be opened.")
            onReady(ketcher)
          })
      }}
    />
  )
}
