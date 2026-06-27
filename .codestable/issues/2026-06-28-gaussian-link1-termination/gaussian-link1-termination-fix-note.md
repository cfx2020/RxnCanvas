---
doc_type: issue-fix
issue: 2026-06-28-gaussian-link1-termination
path: fast-track
fix_date: 2026-06-28
tags: [web, parser, gaussian, termination, inspector]
---

# Gaussian 多 step 日志 termination 误判修复记录

## 1. 问题描述

导入一个 opt+freq Gaussian log 时，opt step 已输出 `Normal termination`，但后续 freq step 没有完成、free energy 仍为 pending，Inspector 右上角却显示 `normal`。

## 2. 根因

`sourceParsers.ts` 的 termination 分类只查找全文件最后一次 `Normal termination of Gaussian`，并且只在它后面出现 error 时才覆盖为 error。对于 Link1 / 多 step job，前一段 opt 正常结束后还会继续输出下一段 freq job；如果 freq 截断且没有 error，旧逻辑会把前一段 normal 当成整个文件 normal。

## 3. 修复方案

导出统一的 `classifyComputationTermination()`，在最后一次 normal 后检测是否仍有 Gaussian 后续 job 输出标记；若有且没有后续 error，则返回 `running`。Inspector fallback 改为复用 domain parser 的同一分类函数，避免 UI 和 parser 语义分叉。

## 4. 改动文件清单

- `web/src/domain/sourceParsers.ts:394` — 导出 termination 分类函数，并在 normal 后检测 Gaussian Link1/route/geometry/SCF/frequency 后续输出。
- `web/src/app/InspectorPanels.tsx:4` — Inspector fallback 复用 domain parser 的 termination 分类。
- `web/src/domain/sourceParsers.test.ts:369` — 覆盖 opt normal 后 freq step 截断时应显示 `running`，free energy 仍为 `null`。

## 5. 验证结果

- `npm --prefix web run test -- sourceParsers InspectorPanels App --run` 通过。
- `npm --prefix web run build` 通过；仅保留既有 3Dmol eval 和大 chunk warning。
- `git diff --check` 通过。
- Playwright fallback 在 `http://127.0.0.1:5173/` 拖入截断 opt+freq Gaussian log：Inspector termination pill 显示 `running`，class 为 `termination-running`，free energy 显示 `pending`，console/page error 为空。

## 6. 遗留事项

真实 Gaussian 多 step 格式很多，本次修复覆盖 Link1/后续 route/geometry/SCF/frequency 输出的截断判定；如后续遇到新的 continuation marker，再补充 fixture。
