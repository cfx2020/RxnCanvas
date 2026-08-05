---
doc_type: issue-fix
issue: 2026-08-05-stale-project-source-parse
status: verified
path: standard
fix_date: 2026-08-05
related: [stale-project-source-parse-report.md, stale-project-source-parse-analysis.md]
tags: [desktop, source-files, parser, autosave, checksum]
---

# 项目 Source 覆盖后仍使用旧 Parse 修复记录

## 1. 实际采用方案

- 项目副本 `storedPath` 成为保存、重新解析和外部打开的首选文件来源；残留导入期 `sourcePath` 不再覆盖已存在的项目 source。
- `SourceFile` 新增 `parseChecksum`，把磁盘文件版本与 parse 版本显式绑定。
- Electron 新增 `rxnflow:inspect-project-source-files`，使用共享指纹缓存返回项目 source 当前 size/SHA-256；`parse-source-preview` 同时返回实际解析文件的 checksum。
- renderer 新增 source refresh 流程：窗口聚焦、项目激活时检查变化；从 Files 拖入画布前强制重新解析完整 gas/sol 分组。
- 文件变化但重解析失败时清空旧 parse，并把关联节点降为 staged/pending；不再静默复用旧能量。
- 刷新既有节点仅更新 source 派生字段，保留用户标签、布局、尺寸、连线、手动画结构和选择状态。

## 2. 主要改动文件

- `web/electron/project-store.cjs`
- `web/electron/main.cjs`
- `web/electron/preload.cjs`
- `web/src/domain/projectPackages.ts`
- `web/src/app/sourceFileRefresh.ts`
- `web/src/app/App.tsx`
- `web/src/app/importWorkspace.ts`
- `web/src/app/importParseJobs.ts`
- `web/src/app/fileDisplay.ts`
- 相关 TypeScript / Electron 回归测试与架构文档。

## 3. 验证结果

- 新增 App 回归：恢复含旧三重态 parse 的 Ni 风格项目，磁盘检查返回新单重态 sol checksum，拖入 gas/sol 分组后节点 `energySolution=-100.4`、`spinMultiplicity=1`，右侧 Source 同时显示 gas/sol，sol 外部打开 payload 指向项目 `sources/Ni-ts_sol.log`。
- `cd web && npm test`：45 个测试文件、442 项测试通过。
- `cd web && node --test electron/*.test.cjs`：50 项通过；覆盖项目副本优先、source metadata、IPC handler 和 preload bridge。
- `python3 -m unittest discover`：46 项通过。
- `cd web && npm run build`：通过；仅保留既有 3Dmol direct eval 与大 chunk 警告。
- 浏览器桌面与窄屏冒烟：Project Rail、Files 四按钮、画布和 Inspector 正常；控制台无 warning/error。
- `git diff --check`：通过。

## 4. 真实项目恢复说明

当前只读检查显示，Ni 项目 `sources/s-s-i5-2-fix7-ts_sol.log` 目前仍是三重态 SHA `df0782bd...b1716f3`；外部单重态文件 SHA 为 `15eb6559...650d92`。本次修复没有未经确认修改用户项目数据。

安装或运行修复后的 app 后，需要再把单重态 sol 重新导入/覆盖一次项目副本。此后拖入画布前会重新解析，并且 autosave 不会再把旧外部三重态文件倒灌回来。

## 5. 遗留事项

- 旧项目没有 `parseChecksum` 时，首次强制拖入会补齐；若用户不拖入，仅在磁盘 checksum 未变化的情况下打开旧项目，不会无条件重解析全部历史 source，以避免启动时批量解析大量大文件。
- 当前真实 Ni 项目数据仍需用户确认后再执行单重态 source 恢复；不属于代码修复提交内容。
