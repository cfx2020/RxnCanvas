import { zipSync, type Zippable } from "fflate"
import { describe, expect, it } from "vitest"
import { checksumBrowserStorageBytes } from "../repository"
import { projectManifestPath } from "./projectContentBridge"
import {
  createBrowserProjectBundleArchive,
  readBrowserProjectBundleArchive,
  type BrowserProjectBundleEntry,
} from "./projectBundleArchive"

const encoder = new TextEncoder()

describe("project bundle archive adapter", () => {
  it("writes and reads a safe project bundle archive with summary fields", async () => {
    const entries = await bundleEntries({
      [projectManifestPath]: JSON.stringify({
        id: "project-demo",
        name: "Demo",
        schema_version: "project-v1",
        resources: [],
      }),
      ".rxnflow/state/project-content.json": '{"schema_version":"project-content-v1"}',
      "inputs/raw/water.xyz": "2\nwater\n",
      "exports/profile.png": "png",
    })

    const archive = await createBrowserProjectBundleArchive({
      bundleName: "demo.rxnflow.zip",
      rootName: "demo.rxnflow",
      entries,
    })

    expect(archive.ok).toBe(true)
    if (!archive.ok) return
    expect(archive.summary).toMatchObject({
      bundleName: "demo.rxnflow.zip",
      rootName: "demo.rxnflow",
      projectId: "project-demo",
      projectName: "Demo",
      fileCount: 4,
      validation: { state: "not_checked", issueCount: 0 },
    })
    expect(archive.summary.byteSize).toBe(archive.bytes.byteLength)
    expect(archive.summary.checksum).toMatch(/^sha256:[a-f0-9]{64}$/)

    const read = await readBrowserProjectBundleArchive({
      bundleName: "demo.rxnflow.zip",
      bytes: archive.bytes,
    })

    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.summary).toEqual(archive.summary)
    expect(read.entries.map((entry) => entry.projectRelativePath)).toEqual([
      ".rxnflow/manifest.json",
      ".rxnflow/state/project-content.json",
      "exports/profile.png",
      "inputs/raw/water.xyz",
    ])
    expect(read.entries.find((entry) => entry.projectRelativePath === "inputs/raw/water.xyz")).toMatchObject({
      byteSize: 8,
      checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
  })

  it("keeps writer output stable for identical entries", async () => {
    const entries = await bundleEntries({
      [projectManifestPath]: '{"id":"project-demo","name":"Demo","schema_version":"project-v1","resources":[]}',
      "exports/report.txt": "report",
    })

    const first = await createBrowserProjectBundleArchive({ rootName: "demo.rxnflow", entries })
    const second = await createBrowserProjectBundleArchive({ rootName: "demo.rxnflow", entries })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.summary.checksum).toBe(second.summary.checksum)
    expect(Array.from(first.bytes)).toEqual(Array.from(second.bytes))
  })

  it("skips export-only metadata files on write", async () => {
    const entries = await bundleEntries({
      [projectManifestPath]: '{"id":"project-demo","name":"Demo","schema_version":"project-v1","resources":[]}',
      ".DS_Store": "skip root file",
      "inputs/raw/.DS_Store": "skip raw metadata",
      "__MACOSX/._manifest": "skip mac metadata",
      "exports/report.txt": "report",
    })

    const archive = await createBrowserProjectBundleArchive({ rootName: "demo.rxnflow", entries })

    expect(archive.ok).toBe(true)
    if (!archive.ok) return
    const read = await readBrowserProjectBundleArchive({ bundleName: "demo.rxnflow.zip", bytes: archive.bytes })
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.entries.map((entry) => entry.projectRelativePath)).toEqual([
      ".rxnflow/manifest.json",
      "exports/report.txt",
    ])
  })

  it("rejects unsafe writer root names and project-relative paths", async () => {
    const manifest = await bundleEntry(projectManifestPath, "{}")
    await expectArchiveError(
      createBrowserProjectBundleArchive({ rootName: "__MACOSX", entries: [manifest] }),
      "invalid_input",
      "__MACOSX",
    )
    await expectArchiveError(
      createBrowserProjectBundleArchive({ rootName: "nested/demo", entries: [manifest] }),
      "invalid_input",
      "nested/demo",
    )

    for (const path of [
      "/absolute.txt",
      "demo\\evil.txt",
      "exports//bad.txt",
      "exports/./bad.txt",
      "exports/../bad.txt",
      "notes.txt",
      "inputs/cache/demo.log",
      "exports",
    ]) {
      await expectArchiveError(
        createBrowserProjectBundleArchive({
          rootName: "demo.rxnflow",
          entries: [manifest, await bundleEntry(path, "bad")],
        }),
        "invalid_bundle",
        path,
      )
    }
  })

  it("rejects unsafe reader entries without returning partial entries", async () => {
    for (const [name, zippable] of Object.entries<Record<string, string>>({
      multiRoot: {
        "demo.rxnflow/.rxnflow/manifest.json": "{}",
        "other.rxnflow/.rxnflow/manifest.json": "{}",
      },
      missingManifest: {
        "demo.rxnflow/exports/report.txt": "report",
      },
      absolute: {
        "/absolute.txt": "bad",
        "demo.rxnflow/.rxnflow/manifest.json": "{}",
      },
      backslash: {
        "demo.rxnflow\\.rxnflow\\manifest.json": "{}",
      },
      dotdot: {
        "demo.rxnflow/.rxnflow/manifest.json": "{}",
        "demo.rxnflow/exports/../evil.txt": "bad",
      },
      dot: {
        "demo.rxnflow/.rxnflow/manifest.json": "{}",
        "demo.rxnflow/exports/./evil.txt": "bad",
      },
      rootFile: {
        "demo.rxnflow": "bad",
      },
      macosx: {
        "__MACOSX/._manifest": "bad",
      },
      outsideAllowedRoots: {
        "demo.rxnflow/.rxnflow/manifest.json": "{}",
        "demo.rxnflow/notes.txt": "bad",
      },
      inputsNotRaw: {
        "demo.rxnflow/.rxnflow/manifest.json": "{}",
        "demo.rxnflow/inputs/cache/demo.log": "bad",
      },
    })) {
      const archive = zipObject(zippable)
      const read = await readBrowserProjectBundleArchive({ bundleName: `${name}.rxnflow.zip`, bytes: archive })
      expect(read.ok, name).toBe(false)
      if (read.ok) return
      expect(read.error.code, name).toBe("invalid_bundle")
    }
  })

  it("accepts explicit safe directory entries while returning only files", async () => {
    const archive = zipObject({
      "demo.rxnflow/": "",
      "demo.rxnflow/.rxnflow/": "",
      "demo.rxnflow/exports/": "",
      "demo.rxnflow/inputs/raw/": "",
      "demo.rxnflow/.rxnflow/manifest.json": '{"id":"project-demo","name":"Demo","schema_version":"project-v1"}',
      "demo.rxnflow/exports/report.txt": "report",
      "demo.rxnflow/inputs/raw/water.xyz": "2\nwater\n",
    })

    const read = await readBrowserProjectBundleArchive({ bundleName: "demo.rxnflow.zip", bytes: archive })

    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.entries.map((entry) => entry.projectRelativePath)).toEqual([
      ".rxnflow/manifest.json",
      "exports/report.txt",
      "inputs/raw/water.xyz",
    ])
  })

  it("rejects duplicate and symlink entries from central directory metadata", async () => {
    const duplicate = zipWithDuplicateCentralDirectoryName({
      "demo.rxnflow/.rxnflow/manifest.json": "{}",
    })
    await expectArchiveError(
      readBrowserProjectBundleArchive({ bundleName: "duplicate.rxnflow.zip", bytes: duplicate }),
      "invalid_bundle",
      "demo.rxnflow/.rxnflow/manifest.json",
    )

    const symlink = zipObject({
      "demo.rxnflow/.rxnflow/manifest.json": "{}",
      "demo.rxnflow/exports/link.txt": ["target", { os: 3, attrs: 0o120777 << 16 }],
    })
    await expectArchiveError(
      readBrowserProjectBundleArchive({ bundleName: "symlink.rxnflow.zip", bytes: symlink }),
      "invalid_bundle",
      "demo.rxnflow/exports/link.txt",
    )
  })

  it("returns warning validation state for malformed manifest summary JSON", async () => {
    const archive = await createBrowserProjectBundleArchive({
      rootName: "demo.rxnflow",
      entries: [
        await bundleEntry(projectManifestPath, "{bad json"),
      ],
    })

    expect(archive.ok).toBe(true)
    if (!archive.ok) return
    expect(archive.summary).toMatchObject({
      projectId: null,
      projectName: null,
      validation: { state: "warning", issueCount: 1 },
    })
    const read = await readBrowserProjectBundleArchive({ bundleName: "demo.rxnflow.zip", bytes: archive.bytes })
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.summary.validation).toEqual({ state: "warning", issueCount: 1 })
  })
})

async function bundleEntries(entries: Record<string, string>): Promise<BrowserProjectBundleEntry[]> {
  return Promise.all(Object.entries(entries).map(([path, text]) => bundleEntry(path, text)))
}

async function bundleEntry(path: string, text: string): Promise<BrowserProjectBundleEntry> {
  const bytes = encoder.encode(text) as Uint8Array<ArrayBuffer>
  return {
    name: path.split("/").at(-1) ?? path,
    projectRelativePath: path,
    bytes,
    byteSize: bytes.byteLength,
    checksum: await checksumBrowserStorageBytes(bytes) as `sha256:${string}`,
  }
}

function zipObject(entries: Record<string, string | [string, { os: number; attrs: number }]>): Uint8Array<ArrayBuffer> {
  const zippable: Zippable = {}
  for (const [path, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      zippable[path] = [
        encoder.encode(value[0]) as Uint8Array<ArrayBuffer>,
        { ...value[1], mtime: new Date(Date.UTC(2026, 4, 14, 0, 0, 0)) },
      ]
    } else {
      zippable[path] = [
        encoder.encode(value) as Uint8Array<ArrayBuffer>,
        { os: 3, attrs: 0o644 << 16, mtime: new Date(Date.UTC(2026, 4, 14, 0, 0, 0)) },
      ]
    }
  }
  return zipSync(zippable, { level: 6 }) as Uint8Array<ArrayBuffer>
}

function zipWithDuplicateCentralDirectoryName(entries: Record<string, string>): Uint8Array<ArrayBuffer> {
  const name = Object.keys(entries)[0]
  const encodedName = encoder.encode(name)
  const sameLengthName = `${name.slice(0, -1)}x`
  const bytes = zipObject({
    ...entries,
    [sameLengthName]: "duplicate",
  })
  const index = findCentralDirectoryNameOffset(bytes, sameLengthName)
  if (index === -1 || sameLengthName.length !== name.length) {
    throw new Error("Duplicate test archive could not be patched")
  }
  const patched = bytes.slice() as Uint8Array<ArrayBuffer>
  patched.set(encodedName, index)
  return patched
}

function findCentralDirectoryNameOffset(bytes: Uint8Array<ArrayBuffer>, targetName: string): number {
  for (let offset = 0; offset <= bytes.length - 46; offset += 1) {
    if (readUint32(bytes, offset) !== 0x02014b50) continue
    const fileNameLength = readUint16(bytes, offset + 28)
    const extraLength = readUint16(bytes, offset + 30)
    const commentLength = readUint16(bytes, offset + 32)
    const nameStart = offset + 46
    const nameEnd = nameStart + fileNameLength
    if (new TextDecoder().decode(bytes.slice(nameStart, nameEnd)) === targetName) {
      return nameStart
    }
    offset = nameEnd + extraLength + commentLength - 1
  }
  return -1
}

function readUint16(bytes: Uint8Array<ArrayBuffer>, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint32(bytes: Uint8Array<ArrayBuffer>, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0
}

async function expectArchiveError(
  result: Promise<unknown>,
  code: string,
  target: string,
): Promise<void> {
  const resolved = await result as { ok: boolean; error?: { code: string; target?: string | null } }
  expect(resolved.ok).toBe(false)
  expect(resolved.error).toMatchObject({ code, target })
}
