import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Molecule2DEditorDialog } from "./Molecule2DEditorDialog"
import type { FlowNode } from "../domain/projectPackages"

vi.mock("./KetcherEditorHost", () => ({
  KetcherEditorHost: () => {
    throw new Error("synthetic Ketcher load failure")
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

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it("keeps the dialog mounted when Ketcher fails to load", async () => {
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
    expect(screen.getByRole("button", { name: /save 2d structure/i })).toBeDisabled()
  })
})
