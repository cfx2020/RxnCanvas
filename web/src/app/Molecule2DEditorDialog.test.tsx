import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useEffect } from "react"
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
  KetcherEditorHost: ({ onReady }: { onReady: (ketcher: unknown) => void }) => {
    if (ketcherMocks.fail) throw new Error("synthetic Ketcher load failure")
    useEffect(() => {
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
    }, [onReady])
    return (
      <div>
        <textarea data-testid="ketcher-cliparea" className="cliparea-module_cliparea__GdPrN" />
        <button type="button" data-testid="copy-button" title="Copy">Copy</button>
        <button type="button" data-testid="paste-button" title="Paste">Paste</button>
        <button type="button" data-testid="paste-from-clipboard-button">Paste from clipboard</button>
        <button type="button" data-testid="copy-to-clipboard">Copy to clipboard</button>
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
  let originalDesktop: unknown

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined)
    originalDesktop = window.rxnflowDesktop
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
    window.rxnflowDesktop = originalDesktop as typeof window.rxnflowDesktop
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
    window.rxnflowDesktop = {
      readChemicalClipboard: vi.fn(async () => ({
        ok: true,
        formats: ["com.cambridgesoft.cdxml"],
        payloads: [{ format: "com.cambridgesoft.cdxml", text: "<CDXML><page><fragment id=\"1\"/></page></CDXML>" }],
      })),
    } as unknown as typeof window.rxnflowDesktop

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
    window.rxnflowDesktop = {
      readChemicalClipboard: vi.fn(async () => ({
        ok: true,
        formats: ["CDIF"],
        payloads: [{ format: "CDIF", text: cdxBase64 }],
      })),
    } as unknown as typeof window.rxnflowDesktop

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
    window.rxnflowDesktop = {
      readChemicalClipboard: vi.fn(async () => ({
        ok: true,
        formats: ["image/png", "chemical/x-daylight-smiles"],
        payloads: [{ format: "chemical/x-daylight-smiles", text: "CCO" }],
      })),
    } as unknown as typeof window.rxnflowDesktop

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

  it("routes the Ketcher copy button through the native chemical clipboard", async () => {
    const writeChemicalClipboard = vi.fn(async () => ({
      ok: true,
      formats: ["text/plain", "chemical/x-cdxml", "chemical/x-cdx"],
    }))
    window.rxnflowDesktop = {
      writeChemicalClipboard,
    } as unknown as typeof window.rxnflowDesktop

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
    window.rxnflowDesktop = {
      writeChemicalClipboard,
    } as unknown as typeof window.rxnflowDesktop

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
    window.rxnflowDesktop = {
      readChemicalClipboard: vi.fn(async () => ({
        ok: true,
        formats: ["chemical/x-indigo-ket", "text/plain"],
        payloads: [{ format: "chemical/x-indigo-ket", text: "{\"root\":{\"nodes\":[]}}" }],
      })),
    } as unknown as typeof window.rxnflowDesktop

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
    window.rxnflowDesktop = {
      writeChemicalClipboard,
    } as unknown as typeof window.rxnflowDesktop

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
    window.rxnflowDesktop = {
      readChemicalClipboard,
      writeChemicalClipboard,
    } as unknown as typeof window.rxnflowDesktop

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
