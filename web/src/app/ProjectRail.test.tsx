import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { SourceFile } from "../domain/projectPackages"
import type { SourceParseResult } from "../domain/sourceParsers"
import { ProjectRail } from "./ProjectRail"

function sourceFile(id: string, name: string, parse?: SourceParseResult): SourceFile {
  return {
    id,
    name,
    kind: "Gaussian",
    size: 1024,
    status: parse?.parsed === false ? "staged" : "parsed",
    preview: "",
    parse,
  }
}

function parsedSource(label: string): SourceParseResult {
  return {
    label,
    sourceKind: "Gaussian",
    formula: "H2",
    kind: "intermediate",
    method: "wB97X-D",
    solvent: "unassigned",
    energyGas: -1,
    energySolution: null,
    energyUnit: "hartree",
    parsed: true,
    parserId: "gaussian-output-cclib+rxnflow-text-full-file",
    parserVersion: "1",
    objectCount: 1,
    warnings: [],
    candidates: [],
    coordinatePreview: null,
    parseScope: "full-file",
    confidence: "high",
    terminationStatus: "normal",
    terminationLabel: "normal",
    jobCpuTime: null,
    elapsedTime: null,
  }
}

function failedSource(label: string): SourceParseResult {
  return {
    ...parsedSource(label),
    parsed: false,
    parserId: null,
    objectCount: 0,
    warnings: [{
      code: "parse_failed",
      message: "Parser failed.",
      target: `${label}.log`,
    }],
  }
}

function deferredSource(label: string): SourceParseResult {
  return {
    ...failedSource(label),
    warnings: [{
      code: "parse_deferred",
      message: "Waiting for parser.",
      target: `${label}.log`,
    }],
  }
}

function renderRail(files: SourceFile[]) {
  return render(
    <ProjectRail
      projects={[{ id: "p1", label: "Ir", meta: "open" }]}
      activeProjectId="p1"
      files={files}
      selectedFileId={null}
      selectedFileIds={[]}
      onCreateProject={vi.fn()}
      onOpenProject={vi.fn()}
      onDeleteProject={vi.fn()}
      onOpenProjectPackage={vi.fn()}
      onImportFiles={vi.fn()}
      onDropProjectFiles={vi.fn()}
      onSelectFile={vi.fn()}
      onDeleteFiles={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
  )
}

function fileButtons() {
  const filesSection = screen.getByText("Files").closest(".rail-section") as HTMLElement
  return Array.from(filesSection.querySelectorAll(".project-file-main"))
    .map((button) => button.getAttribute("aria-label")?.split(",")[0])
}

describe("ProjectRail", () => {
  it("filters, searches, and sorts the compact source browser", () => {
    renderRail([
      sourceFile("beta-gas", "Beta.log", parsedSource("Beta")),
      sourceFile("beta-sol", "Beta-sol.log", parsedSource("Beta-sol")),
      sourceFile("alpha", "Alpha.log", parsedSource("Alpha")),
      sourceFile("failed", "Failed.log", failedSource("Failed")),
      sourceFile("queued", "Queued.log", deferredSource("Queued")),
    ])

    expect(screen.queryByRole("searchbox", { name: "Search files" })).not.toBeInTheDocument()
    const filesSection = screen.getByText("Files").closest(".rail-section") as HTMLElement
    fireEvent.click(within(filesSection).getByRole("button", { name: "Search and filter files" }))

    expect(screen.getByRole("searchbox", { name: "Search files" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Filter files" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Sort files" })).toBeInTheDocument()
    expect(fileButtons()).toEqual([
      "Beta Gaussian",
      "Alpha.log Gaussian",
      "Failed.log Gaussian",
      "Queued.log Gaussian",
    ])

    fireEvent.change(screen.getByRole("searchbox", { name: "Search files" }), { target: { value: "beta" } })
    expect(fileButtons()).toEqual(["Beta Gaussian"])

    fireEvent.change(screen.getByRole("searchbox", { name: "Search files" }), { target: { value: "" } })
    fireEvent.change(screen.getByRole("combobox", { name: "Filter files" }), { target: { value: "missing-pair" } })
    expect(fileButtons()).toEqual(["Alpha.log Gaussian"])

    fireEvent.change(screen.getByRole("combobox", { name: "Filter files" }), { target: { value: "parse-error" } })
    expect(fileButtons()).toEqual(["Failed.log Gaussian"])

    fireEvent.change(screen.getByRole("combobox", { name: "Filter files" }), { target: { value: "all" } })
    fireEvent.change(screen.getByRole("combobox", { name: "Sort files" }), { target: { value: "name" } })
    expect(fileButtons()).toEqual([
      "Alpha.log Gaussian",
      "Beta Gaussian",
      "Failed.log Gaussian",
      "Queued.log Gaussian",
    ])
  })

  it("keeps the import action available inside the source browser header", () => {
    const onImportFiles = vi.fn()
    render(
      <ProjectRail
        projects={[{ id: "p1", label: "Ir", meta: "open" }]}
        activeProjectId="p1"
        files={[]}
        selectedFileId={null}
        selectedFileIds={[]}
        onCreateProject={vi.fn()}
        onOpenProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onOpenProjectPackage={vi.fn()}
        onImportFiles={onImportFiles}
        onDropProjectFiles={vi.fn()}
        onSelectFile={vi.fn()}
        onDeleteFiles={vi.fn()}
      />,
    )

    const filesSection = screen.getByText("Files").closest(".rail-section") as HTMLElement
    fireEvent.click(within(filesSection).getByRole("button", { name: "Import files" }))
    expect(onImportFiles).toHaveBeenCalledWith("p1")
  })
})
