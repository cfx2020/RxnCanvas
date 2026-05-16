import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { App } from "./App"

describe("WorkbenchShell", () => {
  it("renders a local-only workbench shell as the first screen", () => {
    render(<App />)

    expect(screen.getByRole("main", { name: /rxnflow web workbench/i })).toBeInTheDocument()
    expect(screen.getByText("Local-only")).toBeInTheDocument()
    expect(screen.getByText("No project loaded")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /fixture run/i })).toBeInTheDocument()
  })

  it("projects fixture.run into visible workbench state", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: /fixture run/i }))

    expect(await screen.findByText("Fixture Minimal Reaction")).toBeInTheDocument()
    expect(screen.getByText("profile-a-b-electronic")).toBeInTheDocument()
    expect(screen.getByText("2 profile points")).toBeInTheDocument()
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0)
  })

  it("renders invalid shell command errors with the error code visible", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: /invalid command/i }))

    expect(await screen.findByText("invalid_input")).toBeInTheDocument()
    expect(screen.getByText(/Unknown shell command/)).toBeInTheDocument()
  })
})
