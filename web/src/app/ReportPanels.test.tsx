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
