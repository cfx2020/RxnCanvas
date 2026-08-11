const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const projectRoot = path.join(__dirname, "..")
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"))
const appVersion = packageJson.version
const releaseVersion = process.env.RXNFLOW_RELEASE_VERSION || appVersion
const releaseTag = process.env.RXNFLOW_RELEASE_TAG || null
const releaseDir = process.env.RXNFLOW_RELEASE_DIR
  ? path.resolve(process.env.RXNFLOW_RELEASE_DIR)
  : path.join(projectRoot, "release")
const artifactPattern = /\.(?:dmg|zip|exe|blockmap)$/i

if (releaseTag && releaseTag !== `v${releaseVersion}`) {
  throw new Error(`Release tag ${releaseTag} does not match release version ${releaseVersion}`)
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256")
  const fd = fs.openSync(filePath, "r")
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    let bytesRead = 0
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead))
    }
  } finally {
    fs.closeSync(fd)
  }
  return hash.digest("hex")
}

fs.mkdirSync(releaseDir, { recursive: true })
const artifacts = fs.readdirSync(releaseDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && artifactPattern.test(entry.name) && entry.name.includes(appVersion))
  .map((entry) => {
    const filePath = path.join(releaseDir, entry.name)
    const stats = fs.statSync(filePath)
    return { name: entry.name, size: stats.size, sha256: sha256(filePath) }
  })
  .sort((left, right) => left.name.localeCompare(right.name))

if (artifacts.length === 0) {
  throw new Error(`No RxnFlow ${appVersion} release artifacts found in ${releaseDir}`)
}

const manifest = {
  schemaVersion: 1,
  product: "RxnFlow",
  version: appVersion,
  releaseVersion,
  releaseTag,
  generatedAt: new Date().toISOString(),
  sourceRevision: process.env.GITHUB_SHA || process.env.RXNFLOW_SOURCE_REVISION || null,
  artifacts,
  dependencyInventories: [
    "legal/node-third-party-licenses.json",
    "legal/engine-third-party-licenses.json",
  ],
}

fs.writeFileSync(path.join(releaseDir, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
fs.writeFileSync(
  path.join(releaseDir, "SHA256SUMS.txt"),
  `${artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}`).join("\n")}\n`,
)
console.log(`Generated release manifest for ${artifacts.length} artifact(s).`)
