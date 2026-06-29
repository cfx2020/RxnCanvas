import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { EnergyTableRow } from "./energyDisplay"
import { EnergyTableView } from "./ReportPanels"

function row(nodeId: string, label: string, absolute: number, relative: number): EnergyTableRow {
  return {
    nodeId,
    label,
    kind: "intermediate",
    formula: label,
    charge: null,
    spinMultiplicity: null,
    gas: absolute,
    solution: null,
    energyUnit: "hartree",
    energyTable: { egasHartree: absolute },
    relativeEnergyTable: { egasHartree: relative },
    relative: relative * 627.509474,
    relativeRole: "path-point",
    showInRelativeTable: true,
    expressionTerms: [{ nodeId, label, coefficient: 1 }],
  }
}

describe("EnergyTableView", () => {
  it("keeps compact headers and places kcal columns next to their Hartree source", () => {
    render(
      <EnergyTableView
        rows={[row("a", "A", -10, 1)]}
        outputUnit="kcal/mol"
        onSelectNode={vi.fn()}
      />,
    )

    const table = screen.getByRole("table")
    const headers = Array.from(table.querySelectorAll("thead th"))
      .map((cell) => cell.textContent?.replace(/\s+/g, "").trim())

    expect(headers).toEqual([
      "Structure",
      "Charge/Mult.",
      "Egas(Eh)",
      "Egas(kcal/mol)",
      "Basisgas",
      "Ggas(Eh)",
      "Ggas(kcal/mol)",
      "Ggas+1M(Eh)",
      "Ggas+1M(kcal/mol)",
      "Esol(Eh)",
      "Esol(kcal/mol)",
      "Basissol",
      "Gsol(kcal/mol)",
    ])
    expect(headers.join(" ")).not.toContain("Formula")
    expect(headers.join(" ")).not.toContain("627.5095")
    expect(headers.join(" ").toLowerCase()).not.toContain("shermo")
    expect(headers.join(" ").toLowerCase()).not.toContain("whit")
  })

  it("uses shared row-level relative tables instead of recomputing first-row baselines", () => {
    render(
      <EnergyTableView
        rows={[row("a", "A", -10, 1), row("b", "B", -8, 0)]}
        outputUnit="kcal/mol"
        onSelectNode={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Relative" }))
    const bRow = screen.getByRole("button", { name: "B" }).closest("tr") as HTMLTableRowElement

    expect(within(bRow).getByText("0.000000")).toBeInTheDocument()
    expect(bRow).not.toHaveTextContent("2.000000")
  })
})
