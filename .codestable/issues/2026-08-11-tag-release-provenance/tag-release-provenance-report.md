---
doc_type: issue-report
issue: 2026-08-11-tag-release-provenance
status: confirmed
severity: P1
summary: GitHub Beta Release 上传了本地 macOS 构建且遗漏 Windows 产物，最终附件不是同一次 tag CI 验证的输出
tags: [release, github-actions, provenance, macos, windows]
---

# Tag Release 产物来源不一致 Issue Report

## 1. 问题现象

`v0.1.0-beta.1` GitHub Pre-release 只包含本地生成的 macOS DMG/ZIP、blockmap 和 macOS manifest/checksum，没有 Windows 安装器。Release 附件并非由 tag 触发的同一次 CI 运行自动汇总发布。

## 2. 复现步骤

1. 打开私有仓库的 `v0.1.0-beta.1` Release。
2. 查看附件列表，只能看到 macOS DMG/ZIP 及其辅助文件。
3. 查看 `Desktop release verification` 工作流，确认它只把平台产物上传为 Actions artifact。
4. 推送 `v0.1.0-beta.1` tag，观察到没有 tag 专用构建和自动 Release 发布流程。

复现频率：稳定复现。

## 3. 期望 vs 实际

**期望行为**：推送符合规则的 Beta tag 后，同一次 GitHub Actions 运行应测试并构建 Windows/macOS，汇总统一 checksum/manifest，并自动创建只包含最终用户下载项的 Pre-release。

**实际行为**：CI 只验证分支构建并保存 Actions artifact；Release 由本地 `web/release/` 文件手动创建，导致已测试构建和已发布构建不是同一份字节，且 Windows 产物被遗漏。

## 4. 环境信息

- 涉及模块 / 功能：GitHub Actions 桌面构建与 GitHub Release 发布
- 相关文件 / 函数：`.github/workflows/desktop-release.yml`、`web/scripts/generate-release-manifest.cjs`、`web/electron/release-smoke.cjs`
- 运行环境：GitHub Actions macOS 14 / Windows latest、GitHub private repository
- 其他上下文：问题发生于 `v0.1.0-beta.1`，tag 指向提交 `991922d14a2c5b88d51ac61f9da55799c5268615`

## 5. 严重程度

**P1** — 安装包仍可运行，但发布来源无法证明为 CI 实际验证的同一份产物，属于发布供应链与可追溯性缺口。
