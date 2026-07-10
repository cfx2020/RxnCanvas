---
doc_type: issue-fix
issue: 2026-07-10-release-version-identity
path: fast-track
fix_date: 2026-07-10
tags: [version, release, packaging, engine]
---

# 发布版本身份修复记录

## 结果

桌面 package、lockfile、安装包查找、macOS artifact 查找和 Python engine 统一为 `0.1.0`。release smoke 会校验 SemVer、禁止 `0.0.0`，并验证 Python/Desktop 版本一致。

## 主要文件

- `web/package.json`、`web/package-lock.json`
- `rxnflow/version.py`、`rxnflow/engine.py`
- `web/electron/release-smoke.cjs`
- `web/electron/windows-installer-smoke.cjs`
- `web/scripts/notarize-mac.cjs`

## 验证

bundled engine status、packaged app runtime 和 macOS Info.plist 均报告 `0.1.0`。

## 遗留

Git remote、release tag 和发布目的地尚未配置，不能在本地代码中替用户决定。
