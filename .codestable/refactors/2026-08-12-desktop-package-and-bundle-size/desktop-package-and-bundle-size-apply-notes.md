---
doc_type: refactor-apply-notes
refactor: 2026-08-12-desktop-package-and-bundle-size
---

# desktop-package-and-bundle-size apply notes

## 步骤 1：裁剪 Electron locale

- 完成时间：2026-08-12
- 改动文件：`web/package.json`、`web/electron/release-smoke.cjs`
- 验证结果：`npm run desktop:release:smoke` 通过；`npm run desktop:pack` 完成；`npm run desktop:runtime:smoke` 通过，packaged engine 为 0.1.0 / cclib 1.8.1。
- 体积结果：macOS app 从约 381 MiB（390152 KiB）降至约 337 MiB（344988 KiB），减少约 44 MiB；Electron Framework 从约 270 MiB（276688 KiB）降至约 225 MiB（230480 KiB）。
- locale 结果：从 220 个 `.lproj`、46.95 MiB 降至 `en`、`zh_CN`、`zh_TW` 共 3 个、1.63 MiB。
- HUMAN 验证：2026-08-12 用户确认只承诺中英文界面，其他系统语言回退英文。
- 偏离：无。

### HUMAN 确认

- 2026-08-12：用户确认只承诺中英文界面，其他系统语言回退英文。

## 步骤 2：收窄 ASAR build 资源

- 完成时间：2026-08-12
- 改动文件：`web/package.json`、`web/electron/release-smoke.cjs`
- 验证结果：重新构建 macOS unpacked app 后，ASAR 的 `build/` 条目仅剩 `icon.ico` 与 `icon.png`；`npm run desktop:release:smoke` 和 `npm run desktop:runtime:smoke` 均通过。
- 体积结果：macOS app 从步骤 1 的 344988 KiB 降至 342676 KiB，减少约 2.26 MiB；`app.asar` 从 50439134 bytes 降至 47959448 bytes，减少约 2.36 MiB。
- 构建说明：在线 electron-builder 重打因访问远端 `SHASUMS256.txt` 长时间无进展而安全中止；随后通过 electron-builder 官方 `electronDist` 参数使用本机已缓存、版本匹配的 Electron 42.8.1 arm64 ZIP 完成本地验证，未修改 CI 或正式发布下载校验配置。
- HUMAN 验证：2026-08-12 用户确认 macOS Finder/Dock 新图标显示正确。
- 偏离：无。

## 步骤 3：建立按入口 bundle 预算

- 完成时间：2026-08-12
- 改动文件：`web/package.json`、`web/vite.config.ts`、`web/electron/release-smoke.cjs`、`web/scripts/check-bundle-budgets.cjs`、`web/scripts/check-bundle-budgets.test.cjs`
- 构建结果：生产构建开启 Vite manifest，并由独立脚本沿静态依赖图去重计算文件闭包；通用大 chunk 告警已由场景化硬预算替代。
- 当前预算：首屏 887.2 KiB raw / 208.7 KiB gzip（上限 1.10 MiB）；3Dmol 562.5 KiB / 158.3 KiB gzip（上限 0.8 MiB）；Ketcher editor 23.81 MiB / 6.84 MiB gzip（上限 28 MiB）；Ketcher export 15.19 MiB / 3.60 MiB gzip（上限 18 MiB）。
- 测试结果：Web 45 个测试文件、446 项测试全部通过；bundle 预算脚本 4 项 Node 测试全部通过；`npm run build`、`npm run desktop:release:smoke`、`npm run desktop:runtime:smoke` 通过。
- 浏览器验证：在 `1440x900` 启动时只加载 `Molecule3DmolViewer.loader.ts`、`KetcherEditorHost.loader.ts` 等轻量模块，不请求 `3dmol.js`、`KetcherEditorHost.tsx` 或 Ketcher vendor；打开 3D 预览后才请求 `3dmol.js`，进入 2D 编辑器后才请求 `KetcherEditorHost.tsx`、`ketcher-react` 和 `ketcher-standalone`。
- 视觉结果：3D 预览和 Ketcher 编辑器在桌面视口可用；Ketcher 在 `900x800` 窄屏下无文档级横向或纵向溢出，弹窗边界为 `24,53` 至 `876,783`，控件无重叠；浏览器控制台 0 error、0 warning。
- 仍保留：3Dmol 2.5.5 上游构建中的 direct `eval` 告警。本轮已明确将其作为独立高风险事项延期，不通过关闭告警掩盖。
- 偏离：无。

## 最终状态

- macOS unpacked app 从 390152 KiB 降到 342676 KiB，减少 47476 KiB（约 46.4 MiB），当前约 334.6 MiB。
- 现有 macOS packaged runtime smoke 确认版本 0.1.0、bundled Python engine 和 cclib 1.8.1 可启动。
- `desktop:release:smoke` 在重新生成图标后提示现有 unpacked app 时间戳早于最新资源，因此正式发包仍应由 CI/干净构建生成新产物；配置和运行时断言本身均通过。
- Windows 0.1.0 当前产物尚未在 Windows runner 重建，因此 `desktop-runtime-equivalent` 继续保留为 pending，不能把仓库内旧的 0.0.0 Windows 文件计为本次验收证据。
- Ketcher 的 23.81 MiB 静态闭包仍是真实体积；进一步缩小需要另开行为等价实验，比较 `binaryWasm`/`binaryWasmNoRender` 等入口并完整回归编辑器，不纳入本轮。
