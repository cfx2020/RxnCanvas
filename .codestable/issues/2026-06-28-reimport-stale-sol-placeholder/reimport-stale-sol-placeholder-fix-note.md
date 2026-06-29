---
doc_type: issue-fix
issue: 2026-06-28-reimport-stale-sol-placeholder
path: fast-track
fix_date: 2026-06-28
tags: [frontend, import, cclib, solvation, project-rail]
---

# 重新导入 sol 时旧失败占位污染状态修复记录

## 1. 问题描述

`i1fix8p6-tsf` 的文件行显示红色解析失败灯，tooltip 显示已配对 `i1fix8p6-tsf-sol.log`，但提示 `cclib did not return parsed data`。用户确认这是正常 Gaussian sol log，希望重新导入后能正常复制到 `sources/` 并由 bundled cclib 解析。

## 2. 根因

实测原始 `/Users/linsay/Library/CloudStorage/OneDrive-汕头大学/Gaussian/Ir/i1fix8p6-tsf-sol.log` 可以被系统 Python cclib 和打包的 `web/engine/rxnflow-engine` 正常解析；打包 engine 返回 `parsed=true`、`parserId=gaussian-log-cclib+rxnflow-text-full-file`、`energyGas=-7150.75209449193`、`esolHartree=-7150.75209449193`、`solBasisFunctions=3957`。

当前项目 `/Users/linsay/Documents/chemistry/Ir/.rxnflow/project.json` 中残留的 `i1fix8p6-tsf-sol.log` 是历史失败占位：`status=staged`、`storedPath=null`、`parserId=computational-output-cclib-full-file`、warning 为 `cclib_parse_empty`。它没有真实 `sources/` 文件 backing。

导入状态更新之前只按 `file.id` 匹配。用户重新拖入同名 sol 时，新文件会使用新 id，而旧失败占位不会被替换；ProjectRail 同组只要有任意 parse issue 就亮红，于是旧占位继续污染同组状态。

## 3. 修复方案

- 在 `sourceFilesWithImportPlan()` 中加入同名替换规则：新导入文件与旧文件同 display group、同 gas/solution 角色、同文件名时，如果旧文件是未落盘、未 parsed、非 pending 的 staged 失败占位，就移除旧占位。
- `prepend` 和 `update` 两种导入模式都应用该规则，覆盖窗口导入、Finder drop、画布 drop，以及后台 parser job 完成后的更新路径。
- 保留 pending 占位，不在后台解析中途删除正在运行的文件行。

## 4. 改动文件清单

- `web/src/app/importWorkspace.ts`
- `web/src/app/importRegistration.test.ts`

## 5. 验证结果

- `web/engine/rxnflow-engine` 直接解析 `i1fix8p6-tsf-sol.log` 成功，确认 bundled cclib 本身能解析该文件。
- `npm --prefix web run test -- importRegistration.test.ts --run` 通过 23 项。
- `npm --prefix web run test` 通过 305 项。
- `npm --prefix web run build` 通过。
- `npm --prefix web run desktop:pack` 通过，重新输出 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `npm --prefix web run desktop:release:smoke` 通过。
- `npm --prefix web run desktop:smoke` 通过。

## 6. 使用说明

当前已经保存到项目里的旧失败占位没有原始 source path，app 不能凭空恢复它。修复后的 app 需要重新拖入或窗口导入同名 `i1fix8p6-tsf-sol.log`；这次新解析结果会替换旧占位并复制到 `sources/`。

## 7. 遗留事项

构建仍有既有 3Dmol direct eval warning 和大 chunk warning；与本次导入去旧占位修复无关。
