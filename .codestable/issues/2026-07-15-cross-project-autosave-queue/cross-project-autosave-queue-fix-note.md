---
doc_type: issue-fix
issue: 2026-07-15-cross-project-autosave-queue
path: fast-track
fix_date: 2026-07-15
tags: [renderer, autosave, project-workspace, concurrency]
---

# 跨项目 autosave 队列丢失中间项目修复记录

## 1. 问题描述

项目 A 正在 autosave 时，项目 B 的保存请求只能把全局 `autosaveQueuedRef` 标记为 true。随后切到 C 后，A 完成时重新读取最新 active input，只会保存 C，B 的待保存状态被跳过。应用在 B 再次打开前关闭时，B 的编辑可能未落盘。

## 2. 根因

原实现只记录“还有一次 autosave”，没有保存待处理项目 ID 和对应状态快照。全局 autosave key 也无法区分各项目的已保存版本；项目切换会让 debounce callback 和队列处理读取错误的 latest input。

## 3. 修复方案

- 用 `Map<projectId, ProjectAutosaveInput>` 保存各项目最新待存快照；不同项目按入队顺序串行保存，同一项目重复更新合并为最新版本。
- autosave key 改为 per-project Map，保持同项目去重，并避免项目切换造成无意义的重复保存。
- debounce timer 显式捕获本次 `autosaveInput`，不在触发时临时读取其他项目的 latest ref。
- 离开项目时立即 flush 该项目最新快照；即使 900ms debounce 尚未触发，切换项目也不会丢失编辑。
- 已排队项目继续编辑时同步更新队列；如果 Undo 回到正在或已经保存的 key，则取消过时的 pending 快照。
- 删除项目时清理其 queued input 和 autosave key；某项目失败只清理自己的 key，不阻塞其他项目继续保存。

## 4. 改动文件清单

- `web/src/app/App.tsx`
- `web/src/app/App.test.tsx`
- `.codestable/issues/2026-07-15-cross-project-autosave-queue/cross-project-autosave-queue-fix-note.md`

## 5. 验证结果

- 定向队列测试通过：2 tests passed。
- Web 完整测试通过。
- Web production build 通过。
- `git diff --check` 通过。
- 本次没有视觉样式变化，不需要视觉回归。

## 6. 遗留事项

- 项目 autosave 已经 in-flight 时删除该项目，迟到的 Electron 保存仍可能重新登记其目录/recent 记录；这是独立的删除竞态，应另开 issue 修复。
