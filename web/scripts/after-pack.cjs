const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return

  const infoPlistPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Info.plist")
  if (!fs.existsSync(infoPlistPath)) throw new Error(`Packaged macOS Info.plist not found: ${infoPlistPath}`)

  for (const key of [
    "NSAudioCaptureUsageDescription",
    "NSBluetoothAlwaysUsageDescription",
    "NSBluetoothPeripheralUsageDescription",
    "NSCameraUsageDescription",
    "NSMicrophoneUsageDescription",
  ]) {
    deletePlistKey(infoPlistPath, key)
  }
  deletePlistKey(infoPlistPath, "NSAppTransportSecurity:NSExceptionDomains")
  setPlistBoolean(infoPlistPath, "NSAppTransportSecurity:NSAllowsArbitraryLoads", false)
  setPlistBoolean(infoPlistPath, "NSAppTransportSecurity:NSAllowsLocalNetworking", false)

  if (process.env.RXNCANVAS_MAC_ADHOC_SIGN === "1") {
    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
    const entitlementsPath = path.join(context.packager.projectDir, "build", "entitlements.mac.plist")
    execFileSync("/usr/bin/codesign", [
      "--force",
      "--deep",
      "--sign",
      "-",
      "--options",
      "runtime",
      "--entitlements",
      entitlementsPath,
      appPath,
    ], { stdio: "inherit" })
    execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "inherit" })
  }
}

function deletePlistKey(infoPlistPath, key) {
  try {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", `Delete :${key}`, infoPlistPath], { stdio: "ignore" })
  } catch {
    // Electron versions differ in which default privacy descriptions they add.
  }
}

function setPlistBoolean(infoPlistPath, key, value) {
  execFileSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value ? "true" : "false"}`, infoPlistPath], { stdio: "ignore" })
}
