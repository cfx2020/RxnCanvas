---
doc_type: issue-fix
issue: 2026-08-11-tag-release-provenance
path: standard
fix_date: 2026-08-11
related: [tag-release-provenance-analysis.md]
tags: [release, github-actions, provenance, tag, macos, windows]
---

# Tag Release 产物来源不一致修复记录

## 1. 实际采用方案

采用根因分析中的方案 B：Beta tag `v*-beta.*` 触发同一次 GitHub Actions 运行，在 tag 指向的提交上完成核心/Web 测试、Windows 安装器验证和 ad-hoc macOS Beta 构建。发布 job 仅在两端产物 job 成功后下载本次运行的 artifact，生成统一 checksum/manifest，并以 job 级 `contents: write` 权限创建 GitHub Pre-release。

发布清单只包含面向用户的 EXE、DMG、ZIP，不上传 electron-builder 的 `.blockmap`。Windows 安装器和 portable 在生成清单前重命名为无空格的稳定文件名；tagged manifest 遇到任何含空白的 artifact 名称会直接失败。

## 2. 改动文件清单

- `.github/workflows/desktop-release.yml`：增加 Beta tag trigger、同次运行的 Windows/macOS artifact 汇总和 Pre-release 发布；限制发布权限与附件范围；稳定 Windows Release 文件名。
- `web/scripts/generate-release-manifest.cjs`：区分应用版本与 Beta 发布版本，记录 release tag/source revision，并拒绝 tagged artifact 的空白文件名。
- `web/electron/release-smoke.cjs`：覆盖 tag/release 元数据、发布附件范围、稳定文件名和空白文件名失败路径。
- `web/electron/windows-installer-smoke.cjs`：把 hosted runner 上的 NSIS 安装/卸载外层超时提高到 180 秒，同时保留已安装应用 45 秒冷启动上限。
- `docs/user/macos-unsigned-beta.md`、`web/electron/README.md`：同步 tag 自动发布和 ad-hoc macOS Beta 的安装说明。
- `.codestable/architecture/ARCHITECTURE.md`：把桌面发布现状更新为 tag CI 自动汇总发布。
- `tag-release-provenance-report.md`、`tag-release-provenance-analysis.md`：记录问题、根因、选定方案以及 `beta.2`、`beta.3` 的实施证据。

## 3. 验证结果

- 本地回归：Python `46/46`、Web `446/446`、Vite build、release smoke、workflow YAML、Node syntax、`git diff --check` 全部通过；npm production audit 为 0 vulnerabilities。
- `main` 提交 `1a723d91b50ab35e91315deb26e9416c135d3362` 的 CI run `31510471152` 成功，包含 Windows 安装、启动、卸载验证。
- annotated tag `v0.1.0-beta.4` 的远端解引用目标为同一提交；tag CI run `31511226885` 成功，`Publish tagged beta release` 由该运行自动完成。
- GitHub Release `v0.1.0-beta.4` 为非 Draft 的 Pre-release，正好包含 6 个附件：2 个 Windows EXE、macOS DMG、macOS ZIP、`SHA256SUMS.txt`、`release-manifest.json`，没有 `.blockmap`。
- 从 GitHub Release 重新下载全部 6 个附件后，`SHA256SUMS.txt` 对 4 个分发包逐项校验通过；不是使用本地构建或 Actions artifact 代替验证。
- 下载后的 manifest 为 `version: 0.1.0`、`releaseVersion: 0.1.0-beta.4`、`releaseTag: v0.1.0-beta.4`、`sourceRevision: 1a723d91b50ab35e91315deb26e9416c135d3362`，包含 4 个无空格分发物且不含 `.blockmap`。
- 仓库保持 Private；已撤回的 `beta.1`、`beta.3` 保留 tag/Release 审计记录但不保留附件，并链接到有效的 `beta.4`。

## 4. 遗留事项

- macOS Beta 仍为 ad-hoc 签名、未 notarize；当前测试分发继续按用户指南使用定向 `xattr` 处理 Gatekeeper quarantine。这是已知发布约束，不影响本次 CI 产物来源闭环。
- `v0.1.0-beta.2` 保留失败 tag 作为审计记录，未创建 Release；不移动或复用旧 tag。
- GitHub Actions 报告部分上游 action 仍基于 Node.js 20、由 runner 强制使用 Node.js 24 的弃用警告，后续可独立升级 action major version，不纳入本次 provenance 修复。
