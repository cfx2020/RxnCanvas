const fs = require("node:fs")
const path = require("node:path")
const zlib = require("node:zlib")

const projectRoot = path.resolve(__dirname, "..")
const distRoot = path.join(projectRoot, "dist")
const manifestPath = path.join(distRoot, ".vite", "manifest.json")

const defaultBudgets = [
  {
    id: "startup",
    entry: "index.html",
    maxBytes: mib(1.1),
    forbiddenStaticEntries: [
      "node_modules/3dmol/build/3Dmol.js",
      "src/app/KetcherEditorHost.tsx",
      "node_modules/ketcher-standalone/dist/jsNoRender/main.js",
    ],
  },
  {
    id: "3dmol",
    entry: "node_modules/3dmol/build/3Dmol.js",
    maxBytes: mib(0.8),
    mustBeDynamicFrom: "index.html",
  },
  {
    id: "ketcher-editor",
    entry: "src/app/KetcherEditorHost.tsx",
    maxBytes: mib(28),
    mustBeDynamicFrom: "index.html",
  },
  {
    id: "ketcher-export",
    entry: "node_modules/ketcher-standalone/dist/jsNoRender/main.js",
    maxBytes: mib(18),
    mustBeDynamicFrom: "index.html",
  },
]

function main() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Vite manifest not found: ${path.relative(projectRoot, manifestPath)}`)
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  const results = analyzeManifest(manifest, defaultBudgets, {
    fileSize(file) {
      return fs.statSync(resolveDistFile(file)).size
    },
    gzipSize(file) {
      return zlib.gzipSync(fs.readFileSync(resolveDistFile(file)), { level: 9 }).length
    },
  })

  for (const result of results) {
    console.log([
      `Bundle budget ${result.id}:`,
      `${formatBytes(result.totalBytes)} raw / ${formatBytes(result.gzipBytes)} gzip`,
      `(limit ${formatBytes(result.maxBytes)}; ${result.files.length} files)`,
    ].join(" "))
  }
}

function analyzeManifest(manifest, budgets, measurements) {
  return budgets.map((budget) => analyzeBudget(manifest, budget, measurements))
}

function analyzeBudget(manifest, budget, measurements) {
  assertManifestEntry(manifest, budget.entry)
  if (budget.mustBeDynamicFrom) assertDynamicEntry(manifest, budget.mustBeDynamicFrom, budget.entry)

  const entries = collectStaticEntries(manifest, budget.entry)
  for (const forbiddenEntry of budget.forbiddenStaticEntries ?? []) {
    if (entries.has(forbiddenEntry)) {
      throw new Error(`Bundle budget ${budget.id} contains forbidden static entry: ${forbiddenEntry}`)
    }
  }

  const files = collectEntryFiles(manifest, entries)
  const totalBytes = sum(files, measurements.fileSize)
  if (totalBytes > budget.maxBytes) {
    throw new Error([
      `Bundle budget ${budget.id} exceeded: ${formatBytes(totalBytes)} > ${formatBytes(budget.maxBytes)}.`,
      `Files: ${[...files].sort().join(", ")}`,
    ].join(" "))
  }

  const gzipBytes = measurements.gzipSize ? sum(files, measurements.gzipSize) : 0
  return {
    id: budget.id,
    entry: budget.entry,
    entries: [...entries].sort(),
    files: [...files].sort(),
    totalBytes,
    gzipBytes,
    maxBytes: budget.maxBytes,
  }
}

function assertManifestEntry(manifest, entry) {
  if (!manifest[entry]) throw new Error(`Bundle manifest missing required entry: ${entry}`)
}

function assertDynamicEntry(manifest, importer, dynamicEntry) {
  assertManifestEntry(manifest, importer)
  const dynamicImports = manifest[importer].dynamicImports ?? []
  if (!dynamicImports.includes(dynamicEntry)) {
    throw new Error(`Bundle entry ${dynamicEntry} must remain dynamically imported from ${importer}`)
  }
}

function collectStaticEntries(manifest, entry) {
  const visited = new Set()

  function visit(currentEntry) {
    if (visited.has(currentEntry)) return
    assertManifestEntry(manifest, currentEntry)
    visited.add(currentEntry)
    for (const importedEntry of manifest[currentEntry].imports ?? []) visit(importedEntry)
  }

  visit(entry)
  return visited
}

function collectEntryFiles(manifest, entries) {
  const files = new Set()
  for (const entry of entries) {
    const chunk = manifest[entry]
    if (chunk.file) files.add(chunk.file)
    for (const file of chunk.css ?? []) files.add(file)
    for (const file of chunk.assets ?? []) files.add(file)
  }
  return files
}

function sum(files, measure) {
  let total = 0
  for (const file of files) total += measure(file)
  return total
}

function resolveDistFile(file) {
  const resolved = path.resolve(distRoot, file)
  if (resolved !== distRoot && !resolved.startsWith(`${distRoot}${path.sep}`)) {
    throw new Error(`Bundle manifest contains an unsafe output path: ${file}`)
  }
  if (!fs.existsSync(resolved)) throw new Error(`Bundle output missing: ${file}`)
  return resolved
}

function mib(value) {
  return Math.round(value * 1024 * 1024)
}

function formatBytes(value) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MiB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${value} B`
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

module.exports = {
  analyzeManifest,
  collectEntryFiles,
  collectStaticEntries,
  defaultBudgets,
  formatBytes,
  mib,
}
