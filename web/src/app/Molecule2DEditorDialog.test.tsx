import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { StrictMode, useEffect, useRef, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Molecule2DEditorDialog } from "./Molecule2DEditorDialog"
import type { FlowNode } from "../domain/projectPackages"

const ketcherMocks = vi.hoisted(() => ({
  fail: false,
  setMolecule: vi.fn(),
  addFragment: vi.fn(),
  getKet: vi.fn(),
  getMolfile: vi.fn(),
  getCDXml: vi.fn(),
  getCDX: vi.fn(),
  convert: vi.fn(),
}))

vi.mock("./KetcherEditorHost", () => ({
  KetcherEditorHost: ({ onReady, onError }: { onReady: (ketcher: unknown) => void; onError: (message: string) => void }) => {
    if (ketcherMocks.fail) throw new Error("synthetic Ketcher load failure")
    const initializedRef = useRef(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    useEffect(() => {
      if (initializedRef.current) return undefined
      const timer = window.setTimeout(() => {
        initializedRef.current = true
        document.querySelector<HTMLTextAreaElement>('[data-testid="ketcher-cliparea"]')?.focus()
        onReady({
          setMolecule: ketcherMocks.setMolecule,
          addFragment: ketcherMocks.addFragment,
          getKet: ketcherMocks.getKet,
          getMolfile: ketcherMocks.getMolfile,
          getCDXml: ketcherMocks.getCDXml,
          getCDX: ketcherMocks.getCDX,
          indigo: {
            convert: ketcherMocks.convert,
          },
        })
      }, 0)
      return () => window.clearTimeout(timer)
    }, [onReady])
    return (
      <div>
        <textarea data-testid="ketcher-cliparea" className="cliparea-module_cliparea__GdPrN" />
        <button type="button" data-testid="copy-button" title="Copy">Copy</button>
        <button type="button" data-testid="paste-button" title="Paste">Paste</button>
        <button
          type="button"
          data-testid="open-file-error"
          onClick={() => onError("Convert error! Given string could not be loaded as molecule. array: invalid index -1")}
        >
          Open file error
        </button>
        <button type="button" data-testid="ketcher-settings" onClick={() => setSettingsOpen(true)}>Settings</button>
        <button type="button" data-testid="paste-from-clipboard-button">Paste from clipboard</button>
        <button type="button" data-testid="copy-to-clipboard">Copy to clipboard</button>
        {settingsOpen ? (
          <dialog open aria-label="Ketcher settings">
            <button type="button" onClick={() => setSettingsOpen(false)}>Close Ketcher settings</button>
            <button type="button">Apply Ketcher settings</button>
          </dialog>
        ) : null}
      </div>
    )
  },
}))

const node: FlowNode = {
  id: "node-1",
  label: "Ir complex",
  formula: "C2H6IrN",
  kind: "intermediate",
  method: "wB97X-D",
  solvent: "Toluene",
  energyGas: -1,
  energySolution: -0.9,
  energyUnit: "hartree",
  position: { x: 0, y: 0 },
}

describe("Molecule2DEditorDialog", () => {
  let consoleError: ReturnType<typeof vi.spyOn>
  let consoleInfo: ReturnType<typeof vi.spyOn>
  let consoleWarn: ReturnType<typeof vi.spyOn>
  let originalDesktop: unknown

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined)
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    originalDesktop = window.rxncanvasDesktop
    ketcherMocks.fail = false
    ketcherMocks.setMolecule.mockReset()
    ketcherMocks.addFragment.mockReset()
    ketcherMocks.getKet.mockReset()
    ketcherMocks.getMolfile.mockReset()
    ketcherMocks.getCDXml.mockReset()
    ketcherMocks.getCDX.mockReset()
    ketcherMocks.convert.mockReset()
    ketcherMocks.setMolecule.mockResolvedValue(undefined)
    ketcherMocks.addFragment.mockResolvedValue(undefined)
    ketcherMocks.getKet.mockResolvedValue("{\"root\":{\"nodes\":[]}}")
    ketcherMocks.getMolfile.mockResolvedValue("molfile V3000\nM  END")
    ketcherMocks.getCDXml.mockResolvedValue("<CDXML><page><fragment id=\"1\"/></page></CDXML>")
    ketcherMocks.getCDX.mockResolvedValue("Q0RYLWJhc2U2NC1zdHJ1Y3R1cmUtcGF5bG9hZC1zaW11bGF0ZWQ=")
    ketcherMocks.convert.mockImplementation(async (text: string, options: { outputFormat: string }) => ({
      struct: `${options.outputFormat}:${text}`,
    }))
  })

  afterEach(() => {
    consoleError.mockRestore()
    consoleInfo.mockRestore()
    consoleWarn.mockRestore()
    window.rxncanvasDesktop = originalDesktop as typeof window.rxncanvasDesktop
  })

  it("contains editor focus and restores the supplied structure opener", async () => {
    const opener = document.createElement("button")
    opener.textContent = "Open 3D structure"
    document.body.append(opener)
    opener.focus()
    const onClose = vi.fn()
    const view = render(
      <StrictMode>
        <Molecule2DEditorDialog
          node={node}
          atoms={[]}
          returnFocusTo={opener}
          onClose={onClose}
          onSave={vi.fn()}
        />
      </StrictMode>,
    )

    const cancelButton = screen.getByRole("button", { name: "Cancel" })
    const saveButton = screen.getByRole("button", { name: "Save" })
    const editorDialog = screen.getByRole("dialog", { name: "Edit 2D structure for Ir complex" })
    const lastKetcherAction = await screen.findByTestId("copy-to-clipboard")
    await waitFor(() => expect(saveButton).toBeEnabled())
    await waitFor(() => expect(cancelButton).toHaveFocus())
    editorDialog.querySelectorAll<HTMLElement>("button, input, textarea, select, a[href], [tabindex], [contenteditable='true']")
      .forEach((element) => {
        const visible = element !== screen.getByTestId("ketcher-cliparea")
        vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
          bottom: visible ? 20 : 0,
          height: visible ? 20 : 0,
          left: 0,
          right: visible ? 20 : 0,
          top: 0,
          width: visible ? 20 : 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        })
      })
    fireEvent.keyDown(cancelButton, { key: "Tab", shiftKey: true })
    expect(lastKetcherAction).toHaveFocus()
    fireEvent.keyDown(lastKetcherAction, { key: "Tab" })
    expect(cancelButton).toHaveFocus()
    expect(fireEvent.keyDown(cancelButton, { key: "Escape" })).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)

    view.unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it("leaves Escape and Tab ownership with Ketcher nested dialogs", async () => {
    const onClose = vi.fn()
    render(
      <Molecule2DEditorDialog
        node={node}
        atoms={[]}
        onClose={onClose}
        onSave={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled())
    fireEvent.click(screen.getByTestId("ketcher-settings"))
    const nestedDialog = screen.getByRole("dialog", { name: "Ketcher settings" })
    const applyButton = screen.getByRole("button", { name: "Apply Ketcher settings" })
    applyButton.focus()

    fireEvent.keyDown(applyButton, { key: "Tab" })
    expect(applyButton).toHaveFocus()
    expect(screen.getByRole("button", { name: "Cancel" })).not.toHaveFocus()

    fireEvent.keyDown(applyButton, { key: "Escape" })
    expect(onClose).not.toHaveBeenCalled()
    expect(nestedDialog).toBeInTheDocument()
  })

  it("keeps the dialog mounted when Ketcher fails to load", async () => {
    ketcherMocks.fail = true

    render(
      <Molecule2DEditorDialog
        node={node}
        atoms={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByRole("dialog", { name: /edit 2d structure/i })).toBeInTheDocument()
    expect(await screen.findByRole("alert")).toHaveTextContent(/Ketcher editor could not load/i)
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled()
  })

  it("routes the Ketcher paste button through the native chemical clipboard", async () => {
    window.rxncanvasDesktop = {
      readChemicalClipboard: vi.fn(async () => ({
        ok: true,
        formats: ["com.cambridgesoft.cdxml"],
        payloads: [{ format: "com.cambridgesoft.cdxml", text: "<CDXML><page><fragment id=\"1\"/></page></CDXML>" }],
      })),
    } as unknown as typeof window.rxncanvasDesktop

    render(
      <Molecule2DEditorDialog
        node={node}
        atoms={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByTestId("paste-from-clipboard-button"))

    await waitFor(() => {
      expect(ketcherMocks.addFragment).toHaveBeenCalledWith("<CDXML><page><fragment id=\"1\"/></page></CDXML>", { needZoom: true })
    })
  })

  it("accepts ChemDraw binary CDX clipboard aliases from native paste", async () => {
    const cdxBase64 = "VmpDRDAxMDBzeW50aGV0aWMtY2R4LXBheWxvYWQtZm9yLXRlc3Q="
    window.rxncanvasDesktop = {
      readChemicalClipboard: vi.fn(async () => ({
        ok: true,
        formats: ["CDIF"],
        payloads: [{ format: "CDIF", text: cdxBase64 }],
      })),
    } as unknown as typeof window.rxncanvasDesktop

    render(
      <Molecule2DEditorDialog
        node={node}
        atoms={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByTestId("paste-from-clipboard-button"))

    await waitFor(() => {
      expect(ketcherMocks.addFragment).toHaveBeenCalledWith(cdxBase64, { needZoom: true })
    })
  })

  it("accepts ChemDraw AppleScript SMILES bridge payloads when the pasteboard only exposes an image", async () => {
    window.rxncanvasDesktop = {
      readChemicalClipboard: vi.fn(async () => ({
        ok: true,
        formats: ["image/png", "chemical/x-daylight-smiles"],
        payloads: [{ format: "chemical/x-daylight-smiles", text: "CCO" }],
      })),
    } as unknown as typeof window.rxncanvasDesktop

    render(
      <Molecule2DEditorDialog
        node={node}
        atoms={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByTestId("paste-from-clipboard-button"))

    await waitFor(() => {
      expect(ketcherMocks.addFragment).toHaveBeenCalledWith("CCO", { needZoom: true })
    })
  })

  it("keeps Ketcher file-open conversion failures as a compact toast", async () => {
    const { container } = render(
      <Molecule2DEditorDialog
        node={node}
        atoms={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled()
    })

    fireEvent.click(await screen.findByTestId("open-file-error"))

    expect(await screen.findByRole("status")).toHaveTextContent("Ketcher could not open that structure file.")
    expect(screen.queryByText(/array: invalid index/i)).not.toBeInTheDocument()
    expect(container.querySelector(".molecule-editor-status")).toBeNull()
  })

  it("routes the Ketcher copy button through the native chemical clipboard", async () => {
    const writeChemicalClipboard = vi.fn(async () => ({
      ok: true,
      formats: ["text/plain", "chemical/x-cdxml", "chemical/x-cdx"],
    }))
    window.rxncanvasDesktop = {
      writeChemicalClipboard,
    } as unknown as typeof window.rxncanvasDesktop

    const { container } = render(
      <Molecule2DEditorDialog
        node={node}
        atoms={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByTestId("copy-to-clipboard"))

    await waitFor(() => {
      expect(writeChemicalClipboard).toHaveBeenCalledWith({
        ket: "{\"root\":{\"nodes\":[]}}",
        molfile: "molfile V3000\nM  END",
        cdxml: "<CDXML><page><fragment id=\"1\"/></page></CDXML>",
        cdx: "Q0RYLWJhc2U2NC1zdHJ1Y3R1cmUtcGF5bG9hZC1zaW11bGF0ZWQ=",
        text: "<CDXML><page><fragment id=\"1\"/></page></CDXML>",
      })
    })
    expect(await screen.findByRole("status")).toHaveTextContent("Copied structure for ChemDraw.")
    expect(container.querySelector(".molecule-editor-toast")).toHaveTextContent("Copied structure for ChemDraw.")
    expect(container.querySelector(".molecule-editor-status")).toBeNull()
  })

  it("leaves Ketcher editor copy shortcuts to Ketcher's own clipboard handler", async () => {
    const writeChemicalClipboard = vi.fn(async () => ({
      ok: true,
      formats: ["text/plain", "CDIF"],
    }))
    window.rxncanvasDesktop = {
      writeChemicalClipboard,
    } as unknown as typeof window.rxncanvasDesktop

    render(
      <Molecule2DEditorDialog
        node={node}
        atoms={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    fireEvent.keyDown(await screen.findByTestId("ketcher-cliparea"), { key: "c", metaKey: true })

    expect(writeChemicalClipboard).not.toHaveBeenCalled()
  })

  it("routes Ketcher editor paste shortcuts through native chemical paste as a fragment", async () => {
    window.rxncanvasDesktop = {
      readChemicalClipboard: vi.fn(async () => ({
        ok: true,
        formats: ["chemical/x-indigo-ket", "text/plain"],
        payloads: [{ format: "chemical/x-indigo-ket", text: "{\"root\":{\"nodes\":[]}}" }],
      })),
    } as unknown as typeof window.rxncanvasDesktop

    render(
      <Molecule2DEditorDialog
        node={node}
        atoms={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    fireEvent.keyDown(await screen.findByTestId("ketcher-cliparea"), { key: "v", metaKey: true })

    await waitFor(() => {
      expect(ketcherMocks.addFragment).toHaveBeenCalledWith("{\"root\":{\"nodes\":[]}}", { needZoom: true })
    })
  })

  it("does not hijack Ketcher's regular copy toolbar button", async () => {
    const writeChemicalClipboard = vi.fn(async () => ({
      ok: true,
      formats: ["text/plain", "CDIF"],
    }))
    window.rxncanvasDesktop = {
      writeChemicalClipboard,
    } as unknown as typeof window.rxncanvasDesktop

    render(
      <Molecule2DEditorDialog
        node={node}
        atoms={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByTestId("copy-button"))

    expect(writeChemicalClipboard).not.toHaveBeenCalled()
  })

  it("enriches Ketcher's own copy event with ChemDraw-readable clipboard formats", async () => {
    const readChemicalClipboard = vi.fn(async () => ({
      ok: true,
      formats: ["text/plain"],
      payloads: [{ format: "text/plain", text: "{\"root\":{\"nodes\":[]}}" }],
    }))
    const writeChemicalClipboard = vi.fn(async () => ({
      ok: true,
      formats: ["text/plain", "chemical/x-cdxml", "chemical/x-cdx"],
    }))
    window.rxncanvasDesktop = {
      readChemicalClipboard,
      writeChemicalClipboard,
    } as unknown as typeof window.rxncanvasDesktop

    render(
      <Molecule2DEditorDialog
        node={node}
        atoms={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    fireEvent.copy(await screen.findByTestId("ketcher-cliparea"))

    await waitFor(() => {
      expect(writeChemicalClipboard).toHaveBeenCalledWith({
        ket: "chemical/x-indigo-ket:{\"root\":{\"nodes\":[]}}",
        molfile: "chemical/x-mdl-molfile:{\"root\":{\"nodes\":[]}}",
        cdxml: "chemical/x-cdxml:{\"root\":{\"nodes\":[]}}",
        cdx: "chemical/x-cdx:{\"root\":{\"nodes\":[]}}",
        text: "chemical/x-cdxml:{\"root\":{\"nodes\":[]}}",
      })
    })
  })
})
