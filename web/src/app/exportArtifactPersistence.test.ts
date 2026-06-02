import { describe, expect, it } from "vitest"
import { MemoryBrowserProjectRepository } from "../repository"
import type { ShellArtifact, WorkbenchArtifactSummary } from "../shell"
import { ensureEmptyProjectContent, exportArtifactsPath, projectContentIndexPath } from "./projectContentBridge"
import {
  applyArtifactPersistenceResults,
  persistExportArtifacts,
} from "./exportArtifactPersistence"

describe("export artifact persistence", () => {
  it("writes inline artifacts to exports and upserts export-artifacts-v1 records", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Exports" })
    await ensureEmptyProjectContent(repository, project)

    const artifacts = fixtureArtifacts()
    const first = await persistExportArtifacts(repository, project.projectRef, artifacts, {
      basename: "rxnflow-profile",
    })
    const second = await persistExportArtifacts(repository, project.projectRef, artifacts, {
      basename: "rxnflow-profile",
    })

    expect(first).toHaveLength(5)
    expect(first[0]).toMatchObject({
      artifactId: "artifact-png-rxnflow-profile",
      persisted: true,
      path: "exports/rxnflow-profile.png",
      checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
    expect(second).toHaveLength(5)
    await expect(repository.readObject(project.projectRef, "exports/rxnflow-profile.png")).resolves.toMatchObject({
      path: "exports/rxnflow-profile.png",
      checksum: first[0].checksum,
      metadata: expect.objectContaining({
        kind: "export_artifact",
        artifact_id: "artifact-png-rxnflow-profile",
        format: "png",
        mime_type: "image/png",
      }),
    })
    const indexObject = await repository.readObject(project.projectRef, exportArtifactsPath)
    const index = JSON.parse(new TextDecoder().decode(indexObject.bytes))
    expect(index.artifacts).toHaveLength(5)
    expect(index.artifacts[0]).toMatchObject({
      id: "artifact-cdxml-rxnflow-profile",
      format: "cdxml",
      path: "exports/rxnflow-profile.cdxml",
      checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      metadata: expect.objectContaining({ profile_id: "profile-a-b-electronic" }),
    })
    expect(index.artifacts[1]).toMatchObject({
      id: "artifact-csv-rxnflow-profile",
      format: "csv",
      path: "exports/rxnflow-profile.csv",
      metadata: expect.objectContaining({
        mime_type: "text/csv",
        energy_table_schema_version: "energy-table-v1",
      }),
    })
    expect(index.artifacts.find((artifact: { id: string }) => artifact.id === "artifact-svg-rxnflow-profile")).toMatchObject({
      id: "artifact-svg-rxnflow-profile",
      format: "svg",
      path: "exports/rxnflow-profile.svg",
      metadata: expect.objectContaining({
        mime_type: "image/svg+xml",
        artifact_kind: "graph_snapshot",
        workspace_id: "workspace-a-b",
      }),
    })
    const contentIndex = JSON.parse(new TextDecoder().decode((await repository.readObject(project.projectRef, projectContentIndexPath)).bytes))
    expect(contentIndex.files.find((file: { path: string }) => file.path === exportArtifactsPath)).toMatchObject({
      checksum: indexObject.checksum,
    })
  })

  it("skips missing inline bytes and reports invalid base64 without writing records", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Skip" })
    await ensureEmptyProjectContent(repository, project)

    const results = await persistExportArtifacts(repository, project.projectRef, [
      { ...fixtureArtifacts()[0], bytes_base64: null },
      { ...fixtureArtifacts()[1], bytes_base64: "%" },
    ], { basename: "bad" })

    expect(results).toEqual([
      expect.objectContaining({
        artifactId: "artifact-png-rxnflow-profile",
        persisted: false,
        error: expect.objectContaining({ code: "missing_inline_bytes" }),
      }),
      expect.objectContaining({
        artifactId: "artifact-cdxml-rxnflow-profile",
        persisted: false,
        error: expect.objectContaining({ code: "invalid_input", target: "bytes_base64" }),
      }),
    ])
    const index = JSON.parse(new TextDecoder().decode((await repository.readObject(project.projectRef, exportArtifactsPath)).bytes))
    expect(index.artifacts).toHaveLength(0)
    await expect(repository.exists(project.projectRef, "exports/bad.png")).resolves.toBe(false)
  })

  it("skips unsupported artifact formats without writing export records", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Unsupported" })
    await ensureEmptyProjectContent(repository, project)

    const unsupportedFormats = ["pdf", "pptx", "cdx"]
    const results = await persistExportArtifacts(repository, project.projectRef, unsupportedFormats.map((format) => ({
      ...fixtureArtifact("png"),
      id: `artifact-${format}-rxnflow-profile`,
      format,
    })), { basename: "rxnflow-profile" })

    expect(results).toEqual(unsupportedFormats.map((format) =>
      expect.objectContaining({
        artifactId: `artifact-${format}-rxnflow-profile`,
        persisted: false,
        error: expect.objectContaining({ code: "unsupported_format", target: "format" }),
      }),
    ))
    await expect(repository.exists(project.projectRef, "exports/rxnflow-profile.pdf")).resolves.toBe(false)
    await expect(repository.exists(project.projectRef, "exports/rxnflow-profile.pptx")).resolves.toBe(false)
    await expect(repository.exists(project.projectRef, "exports/rxnflow-profile.cdx")).resolves.toBe(false)
    const index = JSON.parse(new TextDecoder().decode((await repository.readObject(project.projectRef, exportArtifactsPath)).bytes))
    expect(index.artifacts).toHaveLength(0)
  })

  it("applies persistence results to artifact summaries", () => {
    const summaries: WorkbenchArtifactSummary[] = fixtureArtifacts().map((artifact) => ({
      id: artifact.id,
      format: artifact.format,
      path: null,
      bytes_base64: artifact.bytes_base64 ?? null,
      metadata: artifact.metadata,
      persisted: false,
      has_inline_bytes: true,
    }))

    expect(applyArtifactPersistenceResults(summaries, [{
      artifactId: "artifact-png-rxnflow-profile",
      persisted: true,
      path: "exports/rxnflow-profile.png",
      checksum: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }])).toEqual([
      expect.objectContaining({
        id: "artifact-png-rxnflow-profile",
        path: "exports/rxnflow-profile.png",
        persisted: true,
        checksum: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
      expect.objectContaining({
        id: "artifact-cdxml-rxnflow-profile",
        persisted: false,
      }),
      expect.objectContaining({
        id: "artifact-xlsx-rxnflow-profile",
        persisted: false,
      }),
      expect.objectContaining({
        id: "artifact-csv-rxnflow-profile",
        persisted: false,
      }),
      expect.objectContaining({
        id: "artifact-svg-rxnflow-profile",
        persisted: false,
      }),
    ])
  })

  it("sanitizes generated export paths into the exports subtree", async () => {
    const repository = new MemoryBrowserProjectRepository()
    const project = await repository.createProject({ name: "Safe Paths" })
    await ensureEmptyProjectContent(repository, project)

    const [result] = await persistExportArtifacts(repository, project.projectRef, [fixtureArtifact("png")], {
      basename: "../bad\\ name",
    })

    expect(result).toMatchObject({
      persisted: true,
      path: "exports/bad-name.png",
    })
    await expect(repository.exists(project.projectRef, "exports/bad-name.png")).resolves.toBe(true)
  })
})

function fixtureArtifacts(): ShellArtifact[] {
  return [
    fixtureArtifact("png"),
    fixtureArtifact("cdxml"),
    fixtureArtifact("xlsx"),
    fixtureArtifact("csv"),
    fixtureArtifact("svg"),
  ]
}

function fixtureArtifact(format: "png" | "cdxml" | "xlsx" | "csv" | "svg"): ShellArtifact {
  const metadataByFormat = {
    png: {
      mime_type: "image/png",
      extension: "png",
      artifact_kind: "energy_diagram",
      format_status: "supported",
    },
    cdxml: {
      mime_type: "chemical/x-cdxml",
      extension: "cdxml",
      artifact_kind: "energy_diagram",
      format_status: "supported",
    },
    xlsx: {
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
      artifact_kind: "energy_table",
      format_status: "supported",
    },
    csv: {
      mime_type: "text/csv",
      extension: "csv",
      artifact_kind: "energy_table",
      format_status: "supported",
      energy_table_schema_version: "energy-table-v1",
    },
    svg: {
      mime_type: "image/svg+xml",
      extension: "svg",
      artifact_kind: "graph_snapshot",
      format_status: "supported",
      workspace_id: "workspace-a-b",
    },
  } satisfies Record<"png" | "cdxml" | "xlsx" | "csv" | "svg", Record<string, string>>
  return {
    id: `artifact-${format}-rxnflow-profile`,
    format,
    path: null,
    bytes_base64: btoa(`fixture ${format}`),
    metadata: {
      profile_id: "profile-a-b-electronic",
      graph_id: "graph-a-b",
      path_id: "path-a-b",
      writer_id: `fixture-${format}`,
      ...metadataByFormat[format],
    },
  }
}
