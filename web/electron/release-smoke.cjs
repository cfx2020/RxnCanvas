const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { execFileSync } = require("node:child_process")

const projectRoot = path.join(__dirname, "..")
const packageJsonPath = path.join(projectRoot, "package.json")
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
const pythonVersionPath = path.join(projectRoot, "..", "rxnflow", "version.py")

function main() {
  verifyPackageMetadata()
  verifyDesktopIconAssets()
  verifyBuilderConfiguration()
  verifyReleaseScripts()
  verifyReleaseManifestScript()
  verifyRendererAssetBase()
  verifyBundledEngineConfiguration()
  verifyRuntimeSmokeScript()
  verifyWindowsInstallerSmokeScript()
  verifyMacSigningConfiguration()
  verifyUnsignedMacBetaGuide()
  verifyReleaseWorkflow()
  verifyCurrentPlatformUnpackedApp()
  verifyWindowsUnpackedApp()
  verifyWindowsDistributionArtifacts()

  console.log("RxnFlow release configuration ready")
  console.log("RxnFlow packaged renderer asset paths ready")
  console.log("RxnFlow bundled Python engine configuration ready")
  console.log("RxnFlow desktop icon assets ready")
  console.log("RxnFlow desktop runtime smoke ready")
  console.log("RxnFlow Windows installer smoke ready")
  console.log("macOS unpacked app structure checked when present")
  console.log("Windows x64 artifacts checked when present")
}

function verifyBundledEngineConfiguration() {
  const removedEnginePath = path.join(projectRoot, "electron", "embedded-engine.cjs")
  const buildScriptPath = path.join(projectRoot, "scripts", "build-engine.cjs")
  const entryPath = path.join(projectRoot, "scripts", "engine-entry.py")
  const requirementsLockPath = path.join(projectRoot, "engine-requirements.lock")
  const bridgeSource = fs.readFileSync(path.join(projectRoot, "electron", "engine-bridge.cjs"), "utf8")
  const buildScript = fs.readFileSync(buildScriptPath, "utf8")
  const extraResources = packageJson.build?.extraResources ?? []
  const engineResource = extraResources.find((resource) => resource?.from === "engine" && resource?.to === "engine")

  assert(!fs.existsSync(removedEnginePath), "electron/embedded-engine.cjs must be removed")
  assert(fs.existsSync(buildScriptPath), "missing scripts/build-engine.cjs")
  assert(fs.existsSync(entryPath), "missing scripts/engine-entry.py")
  assert(fs.existsSync(requirementsLockPath), "missing locked engine dependency graph")
  assert(engineResource, "build.extraResources must copy engine/ into app resources")
  assert(buildScript.includes("--collect-all") && buildScript.includes("cclib"), "engine build must collect bundled cclib")
  assert(buildScript.includes("--with-requirements"), "uv engine build must use the locked dependency graph")
  assert(buildScript.includes("--require-hashes"), "pip engine build must enforce locked dependency hashes")
  assert(bridgeSource.includes("bundledEngineCommand"), "engine bridge must prefer the bundled engine executable")
  assert(bridgeSource.includes("isPackagedAppRuntime"), "packaged app must require the bundled engine executable")
  assert(bridgeSource.includes("rxnflow.engine_ipc"), "engine bridge must keep the development Python IPC entry")
  assert(!bridgeSource.includes("runEmbeddedEngineRequest"), "engine bridge must not call embedded engine fallback")
  assert(!bridgeSource.includes("shouldFallbackToEmbedded"), "engine bridge must not keep embedded fallback routing")
}

function verifyRendererAssetBase() {
  const indexPath = path.join(projectRoot, "dist", "index.html")
  if (!fs.existsSync(indexPath)) return
  const indexHtml = fs.readFileSync(indexPath, "utf8")
  assert(!indexHtml.includes('src="/assets/'), "dist/index.html must not use root-absolute script asset paths for Electron file://")
  assert(!indexHtml.includes('href="/assets/'), "dist/index.html must not use root-absolute stylesheet asset paths for Electron file://")
  assert(!indexHtml.includes('href="/favicon'), "dist/index.html must not use a root-absolute favicon path for Electron file://")
}

function verifyPackageMetadata() {
  assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.version), "package version must be release semver")
  assert(packageJson.version !== "0.0.0", "package version must be set before release")
  assert(fs.existsSync(pythonVersionPath), "Python engine version module is missing")
  const pythonVersionSource = fs.readFileSync(pythonVersionPath, "utf8")
  const pythonVersion = pythonVersionSource.match(/__version__\s*=\s*["']([^"']+)["']/)?.[1]
  assert(pythonVersion === packageJson.version, "Python engine and desktop package versions must match")
  assert(packageJson.main === "electron/main.cjs", "package main must point at Electron main")
  assert(packageJson.build?.appId === "com.rxnflow.app", "build.appId must be stable")
  assert(packageJson.build?.productName === "RxnFlow", "build.productName must be RxnFlow")
  assert(packageJson.build?.asar === true, "build.asar must be enabled")
}

function verifyDesktopIconAssets() {
  const buildDir = path.join(projectRoot, "build")
  const iconSvgPath = path.join(buildDir, "icon.svg")
  const iconPngPath = path.join(buildDir, "icon.png")
  const iconIcoPath = path.join(buildDir, "icon.ico")
  const iconIcnsPath = path.join(buildDir, "icon.icns")

  assert(fs.existsSync(iconSvgPath), "missing build/icon.svg source icon")
  assert(fs.existsSync(iconPngPath), "missing build/icon.png desktop icon")
  assert(fs.existsSync(iconIcoPath), "missing build/icon.ico Windows icon")
  assert(fs.existsSync(iconIcnsPath), "missing build/icon.icns macOS icon")
  assert(fs.statSync(iconPngPath).size > 10_000, "build/icon.png is unexpectedly small")
  assert(fs.statSync(iconIcoPath).size > 10_000, "build/icon.ico is unexpectedly small")
  assert(fs.statSync(iconIcnsPath).size > 10_000, "build/icon.icns is unexpectedly small")

  const pngHeader = fs.readFileSync(iconPngPath).subarray(1, 4).toString("ascii")
  assert(pngHeader === "PNG", "build/icon.png is not PNG data")
  const icoHeader = fs.readFileSync(iconIcoPath).subarray(0, 6)
  assert(icoHeader.readUInt16LE(0) === 0 && icoHeader.readUInt16LE(2) === 1, "build/icon.ico header is invalid")
  assert(icoHeader.readUInt16LE(4) >= 4, "build/icon.ico must contain multiple image sizes")

  if (process.platform === "darwin") {
    const icnsHeader = fs.readFileSync(iconIcnsPath).subarray(0, 4).toString("ascii")
    assert(icnsHeader === "icns", "build/icon.icns header is invalid")
  }
}

function verifyBuilderConfiguration() {
  assert(packageJson.dependencies?.yauzl === "3.4.0", "production project archive extraction must use yauzl 3.4.0")
  assert(!packageJson.dependencies?.["extract-zip"], "vulnerable extract-zip must not remain a production dependency")
  const buildFiles = packageJson.build?.files ?? []
  for (const requiredPattern of ["dist/**/*", "electron/**/*", "build/icon.png", "build/icon.ico", "package.json"]) {
    assert(buildFiles.includes(requiredPattern), `build.files missing ${requiredPattern}`)
  }
  assert(!buildFiles.includes("build/**/*"), "build.files must not pack all build-time resources into app.asar")
  assert(!buildFiles.includes("engine/**/*"), "engine executable must be copied as extraResources, not packed into app.asar")
  const extraResources = packageJson.build?.extraResources ?? []
  assert(extraResources.some((resource) => resource?.from === "engine" && resource?.to === "engine"), "build.extraResources must include engine/")
  assert(packageJson.build?.directories?.buildResources === "build", "buildResources must point to build")
  assert(packageJson.build?.icon === "build/icon.png", "build.icon must point to build/icon.png")
  const electronLanguages = packageJson.build?.electronLanguages ?? []
  for (const requiredLocale of ["en", "en-US", "zh-CN", "zh-TW", "zh_CN", "zh_TW"]) {
    assert(electronLanguages.includes(requiredLocale), `build.electronLanguages missing ${requiredLocale}`)
  }
  assert(electronLanguages.length === 6, "build.electronLanguages must only retain English and Chinese locale variants")

  const macTargets = packageJson.build?.mac?.target ?? []
  assert(packageJson.build?.mac?.icon === "build/icon.icns", "mac icon must point to build/icon.icns")
  assert(macTargets.includes("dmg"), "mac target must include dmg")
  assert(macTargets.includes("zip"), "mac target must include zip")
  assert(packageJson.build?.mac?.hardenedRuntime === true, "mac hardenedRuntime must be enabled for signed distribution")
  assert(packageJson.build?.mac?.entitlements === "build/entitlements.mac.plist", "mac entitlements must point to build/entitlements.mac.plist")
  assert(packageJson.build?.mac?.entitlementsInherit === "build/entitlements.mac.plist", "mac entitlementsInherit must point to build/entitlements.mac.plist")
  assert(packageJson.build?.afterPack === "scripts/after-pack.cjs", "desktop build must run the release metadata hardening hook")
  assert(packageJson.build?.mac?.extendInfo?.NSAppTransportSecurity?.NSAllowsArbitraryLoads === false, "mac app must not allow arbitrary network loads")

  const winTargets = packageJson.build?.win?.target ?? []
  assert(packageJson.build?.win?.icon === "build/icon.ico", "win icon must point to build/icon.ico")
  assert(winTargets.includes("nsis"), "win target must include nsis")
  assert(winTargets.includes("portable"), "win target must include portable")
}

function verifyReleaseScripts() {
  const scripts = packageJson.scripts ?? {}
  const bundleBudgetScriptPath = path.join(projectRoot, "scripts", "check-bundle-budgets.cjs")
  const bundleBudgetTestPath = path.join(projectRoot, "scripts", "check-bundle-budgets.test.cjs")
  assert(scripts.build === "tsc -b && vite build && node scripts/check-bundle-budgets.cjs", "build must enforce bundle budgets")
  assert(scripts.test?.includes("node --test scripts/check-bundle-budgets.test.cjs"), "test must cover bundle budgets")
  assert(fs.existsSync(bundleBudgetScriptPath), "missing bundle budget checker")
  assert(fs.existsSync(bundleBudgetTestPath), "missing bundle budget checker tests")
  const bundleBudgetSource = fs.readFileSync(bundleBudgetScriptPath, "utf8")
  assert(bundleBudgetSource.includes("dist/.vite/manifest.json") || bundleBudgetSource.includes('".vite", "manifest.json"'), "bundle budget checker must read the Vite manifest")
  assert(bundleBudgetSource.includes("node_modules/3dmol/build/3Dmol.js"), "bundle budget checker must track 3Dmol")
  assert(bundleBudgetSource.includes("src/app/KetcherEditorHost.tsx"), "bundle budget checker must track Ketcher editor")
  assert(scripts["desktop:engine"] === "node scripts/build-engine.cjs", "desktop:engine must build the bundled Python engine")
  assert(scripts["desktop:pack"]?.includes("npm run desktop:engine"), "desktop:pack must build the bundled Python engine")
  assert(scripts["desktop:pack"]?.includes("electron-builder --mac dir"), "desktop:pack must build macOS unpacked app")
  assert(scripts["desktop:pack"]?.includes("--publish never"), "desktop:pack must not publish local unpacked app")
  assert(scripts["desktop:pack"]?.includes("--config.mac.identity=null"), "desktop:pack must skip macOS signing for local validation")
  assert(scripts["desktop:dist:mac"]?.includes("npm run desktop:engine"), "desktop:dist:mac must build the bundled Python engine")
  assert(scripts["desktop:dist:mac"]?.includes("electron-builder --mac"), "desktop:dist:mac missing")
  assert(scripts["desktop:dist:mac"]?.includes("--publish never"), "desktop:dist:mac must not publish local artifacts")
  assert(scripts["desktop:dist:mac:unsigned"]?.includes("RXNFLOW_MAC_ADHOC_SIGN=1"), "desktop:dist:mac:unsigned must ad-hoc sign the macOS beta app")
  assert(scripts["desktop:dist:mac:unsigned"]?.includes("--config.mac.identity=null"), "desktop:dist:mac:unsigned must skip Developer ID signing")
  assert(scripts["desktop:notarize:mac"] === "node scripts/notarize-mac.cjs", "desktop:notarize:mac missing")
  assert(scripts["desktop:runtime:smoke"] === "node electron/runtime-smoke.cjs", "desktop:runtime:smoke missing")
  assert(scripts["desktop:installer:smoke:win"] === "node electron/windows-installer-smoke.cjs", "desktop:installer:smoke:win missing")
  assert(scripts["desktop:dist:win"]?.includes("npm run desktop:engine"), "desktop:dist:win must build the bundled Python engine")
  assert(scripts["desktop:dist:win"]?.includes("electron-builder --win --x64"), "desktop:dist:win must target Windows x64")
  assert(scripts["desktop:dist:win"]?.includes("--publish never"), "desktop:dist:win must not publish local artifacts")
  assert(scripts["desktop:pack:win"]?.includes("npm run desktop:engine"), "desktop:pack:win must build the bundled Python engine")
  assert(scripts["desktop:pack:win"]?.includes("electron-builder --win --x64 --dir"), "desktop:pack:win must target Windows x64 unpacked")
  assert(scripts["desktop:pack:win"]?.includes("--publish never"), "desktop:pack:win must not publish local unpacked app")
  assert(scripts["desktop:release:manifest"] === "node scripts/generate-release-manifest.cjs", "desktop:release:manifest missing")
}

function verifyReleaseManifestScript() {
  const manifestScriptPath = path.join(projectRoot, "scripts", "generate-release-manifest.cjs")
  assert(fs.existsSync(manifestScriptPath), "missing release manifest generator")
  const source = fs.readFileSync(manifestScriptPath, "utf8")
  assert(source.includes("sha256"), "release manifest must record SHA-256 digests")
  assert(source.includes("SHA256SUMS.txt"), "release manifest generator must write SHA256SUMS.txt")
  assert(source.includes("release-manifest.json"), "release manifest generator must write release-manifest.json")
  assert(source.includes("RXNFLOW_RELEASE_VERSION"), "release manifest generator must record the tagged release version")
  assert(source.includes("RXNFLOW_RELEASE_TAG"), "release manifest generator must record the release tag")
  assert(source.includes("releaseVersion"), "release manifest must distinguish the release version from the app version")
  assert(source.includes("releaseTag"), "release manifest must include its source tag")
  assert(source.includes("GITHUB_SHA"), "release manifest must accept the CI source revision")
  assert(source.includes("entry.name.includes(appVersion)"), "release manifest must exclude artifacts from other app versions")

  const releaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "rxnflow-release-manifest-"))
  const releaseVersion = `${packageJson.version}-beta.999`
  const releaseTag = `v${releaseVersion}`
  const sourceRevision = "0123456789abcdef0123456789abcdef01234567"
  try {
    fs.writeFileSync(path.join(releaseDir, `RxnFlow-${packageJson.version}-arm64.dmg`), "mac artifact")
    fs.writeFileSync(path.join(releaseDir, `RxnFlow-${packageJson.version}-windows-x64-setup.exe`), "windows setup artifact")
    fs.writeFileSync(path.join(releaseDir, `RxnFlow-${packageJson.version}-windows-x64-portable.exe`), "windows portable artifact")
    execFileSync(process.execPath, [manifestScriptPath], {
      cwd: projectRoot,
      env: {
        ...process.env,
        GITHUB_SHA: sourceRevision,
        RXNFLOW_RELEASE_DIR: releaseDir,
        RXNFLOW_RELEASE_VERSION: releaseVersion,
        RXNFLOW_RELEASE_TAG: releaseTag,
      },
      stdio: "ignore",
    })
    const manifest = JSON.parse(fs.readFileSync(path.join(releaseDir, "release-manifest.json"), "utf8"))
    assert(manifest.version === packageJson.version, "release manifest app version must match package.json")
    assert(manifest.releaseVersion === releaseVersion, "release manifest must record the tagged beta version")
    assert(manifest.releaseTag === releaseTag, "release manifest must record the source tag")
    assert(manifest.sourceRevision === sourceRevision, "release manifest must record the CI source revision")
    assert(manifest.artifacts.length === 3, "release manifest must include all assembled user-facing artifacts")
    assert(manifest.artifacts.every((artifact) => !artifact.name.endsWith(".blockmap")), "release manifest fixture must exclude blockmaps")
    assert(manifest.artifacts.every((artifact) => !/\s/.test(artifact.name)), "tagged release artifact names must survive GitHub upload unchanged")

    fs.writeFileSync(path.join(releaseDir, `RxnFlow Setup ${packageJson.version}.exe`), "unsafe Windows artifact name")
    let rejectedUnsafeName = false
    try {
      execFileSync(process.execPath, [manifestScriptPath], {
        cwd: projectRoot,
        env: {
          ...process.env,
          RXNFLOW_RELEASE_DIR: releaseDir,
          RXNFLOW_RELEASE_VERSION: releaseVersion,
          RXNFLOW_RELEASE_TAG: releaseTag,
        },
        stdio: "ignore",
      })
    } catch {
      rejectedUnsafeName = true
    }
    assert(rejectedUnsafeName, "tagged release manifest must reject artifact names containing whitespace")
  } finally {
    fs.rmSync(releaseDir, { recursive: true, force: true })
  }
}

function verifyWindowsInstallerSmokeScript() {
  const installerSmokePath = path.join(projectRoot, "electron", "windows-installer-smoke.cjs")
  assert(fs.existsSync(installerSmokePath), "missing electron/windows-installer-smoke.cjs")
  const source = fs.readFileSync(installerSmokePath, "utf8")
  assert(source.includes("packageJson.version"), "Windows installer smoke must derive the NSIS artifact version from package.json")
  assert(source.includes("/S"), "Windows installer smoke must use silent NSIS install/uninstall")
  assert(source.includes("/D="), "Windows installer smoke must install into an isolated temp directory")
  assert(source.includes("--rxnflow-smoke-exit"), "Windows installer smoke must launch the installed app with runtime smoke flag")
  assert(source.includes("RXNFLOW_DESKTOP_RUNTIME_SMOKE_OK"), "Windows installer smoke must verify the runtime smoke marker")
  assert(source.includes('"180000"'), "Windows installer smoke must allow hosted-runner antivirus scanning during install and uninstall")
  assert(source.includes("45000"), "Windows installer smoke must allow a bounded first-run engine startup budget")
  assert(source.includes("maxRetries"), "Windows installer smoke cleanup must retry transient Windows file locks")
  assert(source.includes("cleanup deferred"), "Windows installer smoke cleanup must not hide a successful install lifecycle behind transient file locks")
}

function verifyRuntimeSmokeScript() {
  const mainPath = path.join(projectRoot, "electron", "main.cjs")
  const appSourcePath = path.join(projectRoot, "src", "app", "App.tsx")
  const workbenchCssPath = path.join(projectRoot, "src", "app", "workbench.css")
  const runtimeSmokePath = path.join(projectRoot, "electron", "runtime-smoke.cjs")
  const indexHtmlPath = path.join(projectRoot, "index.html")
  assert(fs.existsSync(runtimeSmokePath), "missing electron/runtime-smoke.cjs")
  const mainSource = fs.readFileSync(mainPath, "utf8")
  const appSource = fs.readFileSync(appSourcePath, "utf8")
  const workbenchCss = fs.readFileSync(workbenchCssPath, "utf8")
  const smokeSource = fs.readFileSync(runtimeSmokePath, "utf8")
  const indexHtml = fs.readFileSync(indexHtmlPath, "utf8")
  assert(mainSource.includes("--rxnflow-smoke-exit"), "Electron main must support --rxnflow-smoke-exit")
  assert(mainSource.includes("RXNFLOW_DESKTOP_RUNTIME_SMOKE_OK"), "Electron main must emit runtime smoke success marker")
  assert(mainSource.includes("desktop packaged runtime must use bundled Python engine with cclib"), "runtime smoke must verify bundled Python+cclib")
  assert(mainSource.includes("forbiddenRuntimeUiTerms"), "Electron runtime smoke must guard inactive UI terms")
  assert(mainSource.includes("node inspector and floating export trigger"), "Electron runtime smoke must verify active node inspector/export trigger")
  assert(mainSource.includes("PNG|XLSX|CDXML"), "Electron runtime smoke must verify active export menu formats")
  assert(mainSource.includes("inactiveExportFormats"), "Electron runtime smoke must guard inactive export formats")
  assert(mainSource.includes("runtimeRendererReadyTimeoutMs"), "Electron runtime smoke must budget renderer readiness separately")
  assert(mainSource.includes("runtimeEngineReadyTimeoutMs"), "Electron runtime smoke must budget bundled engine readiness separately")
  assert(mainSource.includes("waitForEngineStatus"), "Electron runtime smoke must retry transient bundled engine startup delays")
  assert(mainSource.includes("runtimeEngineStatusTimeoutMs"), "Electron runtime smoke IPC must allow a bounded cold engine response")
  assert(smokeSource.includes("String(appTimeoutMs)"), "runtime smoke launcher must pass the packaged app timeout budget")
  assert(mainSource.includes("titleBarStyle: process.platform === \"darwin\" ? \"hidden\" : \"default\""), "macOS window must use hidden titlebar instead of hiddenInset")
  assert(mainSource.includes("trafficLightPosition: macTrafficLightPosition"), "macOS traffic lights must use a stable explicit position")
  assert(mainSource.includes("installMacWindowControls(window)"), "Electron main must keep native macOS window controls visible")
  assert(mainSource.includes("installRendererNavigationGuards(window)"), "Electron main must install renderer navigation guards")
  assert(mainSource.includes("setWindowOpenHandler"), "Electron main must deny renderer-created windows")
  assert(mainSource.includes("will-navigate"), "Electron main must guard renderer navigation")
  assert(mainSource.includes("...(devServerUrl ? ["), "production View menu must hide reload and DevTools roles")
  assert(indexHtml.includes("Content-Security-Policy"), "renderer must define a Content Security Policy")
  assert(indexHtml.includes("object-src 'none'"), "renderer CSP must disable object embedding")
  assert(!appSource.includes("macos-traffic-light-ghosts"), "renderer must not draw fake macOS traffic-light dots")
  assert(!workbenchCss.includes(".macos-traffic-light-ghosts"), "workbench CSS must not draw fake macOS traffic-light dots")
  assert(!workbenchCss.includes(".app-shell.is-macos-desktop::before"), "workbench CSS must not draw a custom macOS traffic-light backing layer")
  assert(smokeSource.includes("--rxnflow-smoke-exit"), "runtime smoke script must launch packaged app with smoke flag")
}

function verifyMacSigningConfiguration() {
  const entitlementsPath = path.join(projectRoot, "build", "entitlements.mac.plist")
  const notarizeScriptPath = path.join(projectRoot, "scripts", "notarize-mac.cjs")
  const afterPackScriptPath = path.join(projectRoot, "scripts", "after-pack.cjs")
  assert(fs.existsSync(entitlementsPath), "missing build/entitlements.mac.plist")
  assert(fs.existsSync(notarizeScriptPath), "missing scripts/notarize-mac.cjs")
  assert(fs.existsSync(afterPackScriptPath), "missing scripts/after-pack.cjs")
  const entitlements = fs.readFileSync(entitlementsPath, "utf8")
  assert(entitlements.includes("com.apple.security.cs.allow-jit"), "mac entitlements must allow Electron JIT")
  assert(entitlements.includes("com.apple.security.cs.disable-library-validation"), "mac entitlements must disable library validation for Electron")
  const notarizeScript = fs.readFileSync(notarizeScriptPath, "utf8")
  for (const envName of ["APPLE_ID", "APPLE_TEAM_ID", "APPLE_APP_SPECIFIC_PASSWORD"]) {
    assert(notarizeScript.includes(envName), `notarization script must require ${envName}`)
  }
  assert(notarizeScript.includes("notarytool"), "notarization script must submit with notarytool")
  assert(notarizeScript.includes("stapler"), "notarization script must staple accepted artifacts")
  const afterPackScript = fs.readFileSync(afterPackScriptPath, "utf8")
  assert(afterPackScript.includes("RXNFLOW_MAC_ADHOC_SIGN"), "after-pack hook must gate ad-hoc beta signing behind an explicit environment flag")
  assert(afterPackScript.includes('"--sign"') && afterPackScript.includes('"-"'), "after-pack hook must use an ad-hoc signing identity")
  assert(afterPackScript.includes('"--options"') && afterPackScript.includes('"runtime"'), "ad-hoc macOS beta must keep hardened runtime enabled")
  assert(afterPackScript.includes('"--verify"') && afterPackScript.includes('"--strict"'), "after-pack hook must verify the ad-hoc signature")
}

function verifyUnsignedMacBetaGuide() {
  const guidePath = path.join(projectRoot, "..", "docs", "user", "macos-unsigned-beta.md")
  assert(fs.existsSync(guidePath), "missing docs/user/macos-unsigned-beta.md")
  const guide = fs.readFileSync(guidePath, "utf8")
  assert(guide.includes("xattr -dr com.apple.quarantine /Applications/RxnFlow.app"), "unsigned macOS beta guide must remove only the RxnFlow quarantine attribute")
  assert(guide.includes("不要使用 `sudo spctl --master-disable`"), "unsigned macOS beta guide must reject disabling Gatekeeper globally")
  assert(guide.includes("不是正式公开发行版"), "unsigned macOS beta guide must clearly label the artifact as non-production")
}

function verifyReleaseWorkflow() {
  const workflowPath = path.join(projectRoot, "..", ".github", "workflows", "desktop-release.yml")
  assert(fs.existsSync(workflowPath), "missing .github/workflows/desktop-release.yml")
  const workflow = fs.readFileSync(workflowPath, "utf8")
  for (const requiredText of [
    "macos-14",
    "windows-latest",
    "actions/setup-python@v5",
    "python-version: \"3.12\"",
    "npm run desktop:pack",
    "npm run desktop:pack:win",
    "npm run desktop:runtime:smoke",
    "npm run desktop:installer:smoke:win",
    "unsigned_macos_beta",
    "npm run desktop:dist:mac:unsigned",
    "rxnflow-macos-unsigned-beta",
    "docs/user/macos-unsigned-beta.md",
    "npm run desktop:notarize:mac",
    "npm run desktop:release:manifest",
    "SHA256SUMS.txt",
    "release-manifest.json",
    "v*-beta.*",
    "publish-beta-release",
    "actions/download-artifact@v4",
    "RXNFLOW_RELEASE_VERSION",
    "RXNFLOW_RELEASE_TAG",
    "RXNFLOW_APP_VERSION",
    "windows-x64-setup.exe",
    "windows-x64-portable.exe",
    "contents: write",
    "gh release create",
    "--prerelease",
  ]) {
    assert(workflow.includes(requiredText), `desktop release workflow missing ${requiredText}`)
  }

  const publishJobStart = workflow.indexOf("  publish-beta-release:")
  const signedJobStart = workflow.indexOf("  macos-signed-notarized:")
  assert(publishJobStart >= 0 && signedJobStart > publishJobStart, "tagged beta publish job must be defined before notarized publishing")
  const publishJob = workflow.slice(publishJobStart, signedJobStart)
  assert(publishJob.includes("*.exe"), "tagged beta release must publish Windows executables")
  assert(publishJob.includes("*.dmg"), "tagged beta release must publish a macOS DMG")
  assert(publishJob.includes("*-mac.zip"), "tagged beta release must publish the alternative macOS ZIP")
  assert(!publishJob.includes("*.blockmap"), "tagged beta release must not expose updater blockmaps")
}

function verifyCurrentPlatformUnpackedApp() {
  if (process.platform !== "darwin") return

  const releaseDir = path.join(projectRoot, "release")
  if (!fs.existsSync(releaseDir)) return

  const appPath = findMacApp(releaseDir)
  if (!appPath) return

  const infoPlistPath = path.join(appPath, "Contents", "Info.plist")
  const executablePath = path.join(appPath, "Contents", "MacOS", "RxnFlow")
  const asarPath = path.join(appPath, "Contents", "Resources", "app.asar")
  const resourcesIconPath = path.join(appPath, "Contents", "Resources", "icon.icns")
  const enginePath = path.join(appPath, "Contents", "Resources", "engine", "rxnflow-engine")

  assert(fs.existsSync(infoPlistPath), "mac unpacked app missing Info.plist")
  assert(fs.existsSync(executablePath), "mac unpacked app missing executable")
  assert(fs.statSync(executablePath).mode & 0o111, "mac executable is not executable")
  const infoPlist = fs.readFileSync(infoPlistPath, "utf8")
  assert(infoPlist.includes("com.rxnflow.app"), "Info.plist missing bundle id")
  assert(readPlistValue(infoPlistPath, "CFBundleShortVersionString") === packageJson.version, "Info.plist version must match package.json")
  assert(readPlistValue(infoPlistPath, "NSAppTransportSecurity.NSAllowsArbitraryLoads") === "false", "mac app must disable arbitrary network loads")
  for (const privacyKey of [
    "NSAudioCaptureUsageDescription",
    "NSBluetoothAlwaysUsageDescription",
    "NSBluetoothPeripheralUsageDescription",
    "NSCameraUsageDescription",
    "NSMicrophoneUsageDescription",
  ]) {
    assert(readPlistValue(infoPlistPath, privacyKey) === null, `mac app must not declare unused ${privacyKey}`)
  }
  if (!fs.existsSync(asarPath)) {
    console.warn("Existing mac unpacked app is stale or partial; skipping app.asar check.")
    return
  }

  const hasCurrentIcon = fs.existsSync(resourcesIconPath) || infoPlist.includes("icon.icns")
  if (!hasCurrentIcon) {
    console.warn("Existing mac unpacked app predates RxnFlow icon config; rebuild with npm run desktop:pack to refresh it.")
    return
  }
  assert(fs.existsSync(resourcesIconPath), "mac unpacked app missing icon.icns")
  assert(infoPlist.includes("icon.icns"), "Info.plist missing app icon reference")
  assert(fs.existsSync(enginePath), "mac unpacked app missing bundled rxnflow-engine")
  assert(fs.statSync(enginePath).mode & 0o111, "bundled rxnflow-engine is not executable")
  verifyCurrentMacElectronLocales(appPath, asarPath)
  verifyCurrentAsarBuildResources(asarPath)
}

function verifyCurrentMacElectronLocales(appPath, asarPath) {
  if (fs.statSync(asarPath).mtimeMs < fs.statSync(packageJsonPath).mtimeMs) {
    console.warn("Existing mac unpacked app predates the current locale config; rebuild with npm run desktop:pack to refresh it.")
    return
  }

  const localeRoot = path.join(
    appPath,
    "Contents",
    "Frameworks",
    "Electron Framework.framework",
    "Versions",
    "A",
    "Resources",
  )
  assert(fs.existsSync(localeRoot), "mac Electron Framework locale resources are missing")
  const locales = fs.readdirSync(localeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".lproj"))
    .map((entry) => entry.name.slice(0, -".lproj".length))
    .sort()
  assert(locales.length > 0, "mac Electron Framework must retain at least one locale")
  const unexpectedLocales = locales.filter((locale) => !["en", "zh_CN", "zh_TW"].includes(locale))
  assert(unexpectedLocales.length === 0, `mac Electron Framework contains unexpected locales: ${unexpectedLocales.join(", ")}`)
  for (const requiredLocale of ["en", "zh_CN", "zh_TW"]) {
    assert(locales.includes(requiredLocale), `mac Electron Framework missing ${requiredLocale}.lproj`)
  }
}

function verifyCurrentAsarBuildResources(asarPath) {
  if (fs.statSync(asarPath).mtimeMs < fs.statSync(packageJsonPath).mtimeMs) {
    console.warn("Existing app.asar predates the current runtime resource config; rebuild the unpacked app to refresh it.")
    return
  }

  const asarCliPath = path.join(projectRoot, "node_modules", "@electron", "asar", "bin", "asar.js")
  assert(fs.existsSync(asarCliPath), "@electron/asar CLI is required for packaged resource verification")
  const entries = execFileSync(process.execPath, [asarCliPath, "list", asarPath], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
  const buildEntries = entries.filter((entry) => entry.startsWith("/build/"))
  assert(
    buildEntries.join("\n") === ["/build/icon.ico", "/build/icon.png"].join("\n"),
    `app.asar build resources must only contain runtime icons; found: ${buildEntries.join(", ")}`,
  )
}

function readPlistValue(infoPlistPath, key) {
  try {
    return execFileSync("plutil", ["-extract", key, "raw", infoPlistPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return null
  }
}

function verifyWindowsUnpackedApp() {
  const appPath = path.join(projectRoot, "release", "win-unpacked")
  if (!fs.existsSync(appPath)) return

  const executablePath = path.join(appPath, "RxnFlow.exe")
  const asarPath = path.join(appPath, "resources", "app.asar")
  const enginePath = path.join(appPath, "resources", "engine", "rxnflow-engine.exe")
  if (!fs.existsSync(enginePath) && process.platform !== "win32") {
    console.warn("Existing Windows unpacked app predates bundled engine config; rebuild on Windows to refresh it.")
    return
  }
  const requiredFiles = [
    executablePath,
    asarPath,
    enginePath,
    path.join(appPath, "resources.pak"),
    path.join(appPath, "icudtl.dat"),
    path.join(appPath, "ffmpeg.dll"),
    path.join(appPath, "libEGL.dll"),
    path.join(appPath, "libGLESv2.dll"),
    path.join(appPath, "vulkan-1.dll"),
  ]

  for (const filePath of requiredFiles) {
    assert(fs.existsSync(filePath), `Windows unpacked app missing ${path.relative(appPath, filePath)}`)
  }
  assert(fs.statSync(executablePath).size > 50 * 1024 * 1024, "RxnFlow.exe is unexpectedly small")
  assert(fs.statSync(asarPath).size > 1024 * 1024, "Windows app.asar is unexpectedly small")
  assert(fs.statSync(enginePath).size > 1024 * 1024, "Windows bundled rxnflow-engine.exe is unexpectedly small")
  assertWindowsX64Executable(executablePath)
  assertWindowsExecutable(enginePath, "Windows bundled rxnflow-engine.exe")
}

function assertWindowsX64Executable(executablePath) {
  const header = fs.readFileSync(executablePath)
  assert(header.subarray(0, 2).toString("ascii") === "MZ", "RxnFlow.exe missing MZ header")
  const peOffset = header.readUInt32LE(0x3c)
  assert(header.subarray(peOffset, peOffset + 4).toString("ascii") === "PE\u0000\u0000", "RxnFlow.exe missing PE header")
  const machine = header.readUInt16LE(peOffset + 4)
  assert(machine === 0x8664, "RxnFlow.exe must be Windows x64")
  const characteristics = header.readUInt16LE(peOffset + 22)
  assert((characteristics & 0x0002) !== 0, "RxnFlow.exe must be executable")
}

function verifyWindowsDistributionArtifacts() {
  const releaseDir = path.join(projectRoot, "release")
  if (!fs.existsSync(releaseDir)) return

  const installerPath = path.join(releaseDir, `RxnFlow Setup ${packageJson.version}.exe`)
  const portablePath = path.join(releaseDir, `RxnFlow ${packageJson.version}.exe`)
  const blockMapPath = path.join(releaseDir, `RxnFlow Setup ${packageJson.version}.exe.blockmap`)
  const anyWindowsDistExists = fs.readdirSync(releaseDir).some((name) => /^RxnFlow(?: Setup)? .+\.exe(?:\.blockmap)?$/.test(name))
  if (!anyWindowsDistExists) return

  if (![installerPath, portablePath, blockMapPath].some((filePath) => fs.existsSync(filePath))) {
    console.warn(`Existing Windows distribution artifacts do not match version ${packageJson.version}; rebuild them on Windows.`)
    return
  }

  assert(fs.existsSync(installerPath), "Windows NSIS installer missing")
  assert(fs.existsSync(portablePath), "Windows portable executable missing")
  assert(fs.existsSync(blockMapPath), "Windows NSIS blockmap missing")
  assert(fs.statSync(installerPath).size > 50 * 1024 * 1024, "Windows NSIS installer is unexpectedly small")
  assert(fs.statSync(portablePath).size > 50 * 1024 * 1024, "Windows portable executable is unexpectedly small")
  assert(fs.statSync(blockMapPath).size > 1024, "Windows NSIS blockmap is unexpectedly small")
  assertWindowsExecutable(installerPath, "Windows NSIS installer")
  assertWindowsExecutable(portablePath, "Windows portable executable")

  const blockMapHeader = fs.readFileSync(blockMapPath).subarray(0, 2)
  assert(blockMapHeader[0] === 0x1f && blockMapHeader[1] === 0x8b, "Windows NSIS blockmap must be gzip data")
}

function assertWindowsExecutable(executablePath, label) {
  const header = fs.readFileSync(executablePath)
  assert(header.subarray(0, 2).toString("ascii") === "MZ", `${label} missing MZ header`)
  const peOffset = header.readUInt32LE(0x3c)
  assert(header.subarray(peOffset, peOffset + 4).toString("ascii") === "PE\u0000\u0000", `${label} missing PE header`)
  const characteristics = header.readUInt16LE(peOffset + 22)
  assert((characteristics & 0x0002) !== 0, `${label} must be executable`)
}

function findMacApp(releaseDir) {
  const entries = fs.readdirSync(releaseDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(releaseDir, entry.name, "RxnFlow.app")
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main()
