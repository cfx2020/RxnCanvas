---
doc_type: issue-fix
issue: 2026-07-10-electron-release-hardening
path: fast-track
fix_date: 2026-07-10
tags: [electron, security, csp, macos, release]
---

# Electron 发布防护修复记录

## 结果

renderer 增加 CSP、拒绝新窗口与非应用导航；生产菜单移除 reload/DevTools。macOS afterPack 删除未使用的摄像头、麦克风、音频和蓝牙声明，并关闭任意网络加载与本地网络例外。保留 3Dmol/Ketcher 当前运行所需的 `unsafe-eval`、`wasm-unsafe-eval` 与 blob worker 许可。

## 改动

- `web/index.html`
- `web/electron/main.cjs`
- `web/scripts/after-pack.cjs`
- `web/package.json`
- `web/electron/release-smoke.cjs`

## 验证

浏览器工作台、3D structure dialog 和 Ketcher editor 均可加载；控制台无 CSP 错误。重建后的 macOS Info.plist 已确认 ATS 收紧且无未使用隐私权限键，release smoke 通过。

## 遗留

正式分发仍需要 Apple Developer ID 签名、公证与 Gatekeeper 开启环境验证。
