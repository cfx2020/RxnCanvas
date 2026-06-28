---
doc_type: issue-fix
issue: 2026-06-28-desktop-import-autosave-parse-race
path: fast-track
fix_date: 2026-06-28
tags: [desktop, import, parser, autosave, project-rail]
---

# 桌面导入解析结果被 autosave 旧回包覆盖修复记录

## 1. 问题描述

用户先导入 `2a.log`，再导入或拖入 `2a-sol.log` 后，项目 `sources/2a-sol.log` 已存在且不是 0B，但 Project Rail 中 `2a` 文件组仍一直显示解析进度条。直接调用 bundled engine 解析同一个 `2a-sol.log` 约 1.5 秒即可返回 `parsed: true`。

## 2. 根因

桌面导入采用“先入栏、后台解析、autosave 保存项目副本”的流程。导入占位行出现后，autosave 会保存仍带 `parse_deferred` 的旧状态并等待 Electron 回包；如果 parser job 先成功回填 parsed 状态，而这个旧 autosave 回包稍后才返回，`sourceFilesWithAutosavedMetadata()` 会无条件采用 saved file 的 `parse` 和 `status`，把当前已解析状态退回 `parse_deferred` / `staged`。因此文件已经复制并可解析，但 UI 看起来像 parser 一直卡住。

## 3. 修复方案

- autosave 回包继续负责补充 `size` / `storedPath` / `checksum` / `sourcePath` 这些项目副本元数据。
- parse 合并改为按解析完成度择优：pending desktop job < unparsed failure < parsed metadata < parsed objects/coordinates。
- 当 autosave 回包里的 parse 比当前 parse 更旧或同级时，保留当前 parse 和 status，避免旧的 `parse_deferred` 降级 parser job 的结果。
- 打开已有项目时，如果 stored source 的保存状态仍是 `parse_deferred` 或缺少关键 metadata，允许 engine 的 full-file parse 覆盖旧 parse；不再要求新 parse 一定带坐标才更新。
- 新增 App 竞态测试：autosave 先拿到 pending 内容并挂起，parser 成功回填后再释放 stale autosave 回包，断言 Project Rail 不会恢复进度条。

## 4. 改动文件清单

- `web/electron/main.cjs`
- `web/src/app/App.tsx`
- `web/src/app/App.test.tsx`

## 5. 验证结果

- `npm --prefix web run test -- App importParseJobs --run` 通过。
- 直接 engine 验证：`/Users/linsay/Documents/chemistry/Ir/sources/2a-sol.log` 和原始 OneDrive `2a-sol.log` 均返回 `parsed: true`，parserId 为 `gaussian-log-cclib+rxnflow-text-full-file`。

## 6. 遗留事项

仍可考虑后续加一个显式“重新解析 stored source”动作，方便用户不重启 / 不重开项目时主动修复某个 source。
