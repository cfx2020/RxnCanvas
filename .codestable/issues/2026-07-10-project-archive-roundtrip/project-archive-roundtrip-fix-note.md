---
doc_type: issue-fix
issue: 2026-07-10-project-archive-roundtrip
path: fast-track
fix_date: 2026-07-10
tags: [project, zip, import, export, persistence]
---

# 项目压缩包往返修复记录

## 结果

`.rxnflow.zip` 不再是只能导出的死路。Electron 文件选择可打开项目目录、ZIP 或 legacy JSON；ZIP 在临时目录安全解包，经过大小/条目限制与项目 state 校验后再原子放置到压缩包旁的新工作区。导出改为 stream pipeline，不再把整个项目与压缩包拼进内存。

## 主要文件

- `web/electron/project-store.cjs`
- `web/electron/main.cjs`
- `web/electron/smoke.cjs`
- `web/package.json`

## 验证

desktop smoke 已完成 workspace export → ZIP import → project id/source 恢复，并覆盖失败清理与资源限制。
