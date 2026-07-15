---
doc_type: issue-fix
issue: 2026-07-15-cross-project-autosave-response
path: fast-track
fix_date: 2026-07-15
tags: [desktop, autosave, project-workspace, concurrency]
---

# 跨项目 autosave 迟到响应污染当前项目修复记录

## 1. 问题描述

项目 A 的 autosave 请求尚未返回时切换到项目 B，A 的成功响应仍会合并进当前 `files`，A 的失败或校验结果也会显示在 B。A、B 恰好存在相同 file ID 时，B 可能得到 A 的 `storedPath`、checksum、preview 或 parse 元数据。

## 2. 根因

`web/src/app/App.tsx` 的 autosave 请求虽然捕获了发起时的项目数据，但 runtime helper 直接持有全局 `setProjectValidation`，响应后又无条件调用当前项目的 `setFiles`。异步回包没有核对发起项目 ID，因此项目切换后仍按“当前项目”处理旧请求。

## 3. 修复方案

- 保存最新 active project ID，并在 autosave 响应落地时与请求发起项目核对。
- runtime validation 先收集为该请求的局部结果；只有发起项目仍 active 时才更新当前 validation。
- 发起项目仍 active 时继续更新当前 `files`；已经切走时，只合并到 `projectWorkspaces[originProjectId].files`。
- 非当前项目的 autosave failure 不再显示到当前项目；失败后仍清空 autosave key，允许后续重试。
- 增加成功与失败两条跨项目竞态测试，并使用相同 file ID 验证不会发生元数据串写。

## 4. 改动文件清单

- `web/src/app/App.tsx`
- `web/src/app/App.test.tsx`
- `.codestable/issues/2026-07-15-cross-project-autosave-response/cross-project-autosave-response-fix-note.md`

## 5. 验证结果

- 定向竞态测试通过：2 tests passed。
- Web 完整测试通过：43 files、401 tests passed。
- Web production build 通过。
- `git diff --check` 通过。
- 本次只修改状态路由，没有视觉或画布交互变化，因此不需要额外视觉回归。

## 6. 遗留事项

- 当前 validation 仍是 active-project 级 UI 状态；后台项目的 autosave validation 会被隔离但不会缓存。若未来需要在项目列表中显示每个后台项目的保存错误，应另行设计 per-project validation 状态。
- 快速 A → B → A 后，最早的 A 响应仍属于当前 A；若未来允许同一项目并发产生多代 autosave，需要增加 per-project generation，而不只是项目 ID 路由。
- 现有全局 queued 标记只保留“需要再保存一次”，连续 A → B → C 时会保存最新 C，B 可能等到再次激活才保存。该队列策略是独立问题，不在本次污染修复范围。
- Electron main process 的 autosave 完成逻辑仍会把 active/recent project 暂时切回响应所属项目；renderer 的 queued autosave 通常会随后纠正，但存在窗口期和关闭应用前未纠正的风险，应另开 runtime issue 修复。
