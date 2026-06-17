const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const projectRoot = path.join(__dirname, "..")
const releaseDir = path.join(projectRoot, "release")

function main() {
  assert(process.platform === "darwin", "macOS notarization must run on macOS.")
  const appPath = findMacApp()
  const dmgPath = findArtifact(/\.dmg$/)
  assert(appPath, "No RxnFlow.app found under web/release. Run npm run desktop:dist:mac first.")
  assert(dmgPath, "No macOS DMG found under web/release. Run npm run desktop:dist:mac first.")

  const appleId = requireEnv("APPLE_ID")
  const teamId = requireEnv("APPLE_TEAM_ID")
  const password = requireEnv("APPLE_APP_SPECIFIC_PASSWORD")

  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath])
  run("xcrun", [
    "notarytool",
    "submit",
    dmgPath,
    "--apple-id",
    appleId,
    "--team-id",
    teamId,
    "--password",
    password,
    "--wait",
  ])
  run("xcrun", ["stapler", "staple", appPath])
  run("xcrun", ["stapler", "staple", dmgPath])
  run("spctl", ["--assess", "--type", "execute", "--verbose=2", appPath])

  console.log(`RxnFlow macOS notarization passed: ${path.relative(projectRoot, dmgPath)}`)
}

function findMacApp() {
  if (!fs.existsSync(releaseDir)) return null
  const candidates = fs.readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(releaseDir, entry.name, "RxnFlow.app"))
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

function findArtifact(pattern) {
  if (!fs.existsSync(releaseDir)) return null
  const entries = fs.readdirSync(releaseDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => path.join(releaseDir, entry.name))
    .sort()
    .at(0) ?? null
}

function requireEnv(name) {
  const value = process.env[name]
  assert(value, `${name} is required for macOS notarization.`)
  return value
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  })
  assert(result.status === 0, `${command} ${args.join(" ")} failed with exit code ${result.status}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main()
