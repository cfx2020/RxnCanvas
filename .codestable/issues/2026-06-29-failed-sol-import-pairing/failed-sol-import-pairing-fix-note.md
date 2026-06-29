---
doc_type: issue-fix
issue: 2026-06-29-failed-sol-import-pairing
path: fast-track
fix_date: 2026-06-29
tags: [desktop, import, solvation, parser, project-rail]
---

# 失败 sol log 污染配对状态修复记录

## 1. 问题描述

用户导入有问题的 `i1p6-sol.log` 时，App 弹窗报错，但文件仍进入项目状态并影响同组 gas 节点：节点详情里的 solvent 显示为 `unassigned`，缺 sol 状态灯消失，表现得像坏 sol 已经成功配对。

期望行为是：parser 明确失败的 sol log 可以作为失败反馈显示红灯/弹窗，但不能算成功导入，不能复制进 `sources/`，不能参与 gas/sol 配对，也不能覆盖已有节点信息。

## 2. 根因

导入和配对逻辑有两处把“文件名像 sol log”和“解析成功的 sol log”混在了一起：

- Electron `rxnflow:import-source-files` 先 materialize 到项目 `sources/`，再调用 engine preview；如果解析失败，renderer 仍可能拿到 `storedPath/checksum`，从而把失败文件当作已落盘 source。
- ProjectRail、Canvas sol 状态灯和 import pairing 只看文件名后缀是否像 `-sol.log`，未要求 `parse.parsed=true` 且有可用 parsed data；坏 sol 因此会清掉 gas 节点的缺 sol 指示。
- renderer 后台解析失败结果保留了 sourcePath / storedPath / checksum 等成功导入元数据，让失败文件继续影响 open/source/package 语义。

## 3. 修复方案

- Electron 桌面导入改为两阶段：先用原始 native `sourcePath` 运行 bundled parser；只有 `parse.parsed=true` 后才复制到项目 `sources/` 并返回 `storedPath/checksum`。
- 新增 `sourceFileLooksLikeParsedSolutionLog()`：sol pairing、Canvas 节点状态灯、ProjectRail tooltip/badge 只认解析成功且有可用数据的 sol log。
- `buildImportPlan()` 对 `parsed=false` 的文件不再生成 fallback graph node；失败 sol 不参与 paired gas/solution node 合并。
- renderer `desktopImportFailureResult()` 在失败路径剥离 `sourcePath/storedPath/checksum`，保留红灯/弹窗所需 warning，但不伪装成成功 source。
- 补 UI 回归测试：先导入正常 gas 并拖到画布生成节点，再导入坏 sol；节点仍显示缺 sol 灯，重新选中节点后 inspector solvent 保持 gas 节点的 `implicit solvent`，不会变成 `unassigned`。

## 4. 改动文件清单

- `web/electron/main.cjs`
- `web/src/app/fileDisplay.ts`
- `web/src/app/importWorkspace.ts`
- `web/src/app/importParseJobs.ts`
- `web/src/app/CanvasWorkspace.tsx`
- `web/src/app/ProjectRail.tsx`
- `web/src/app/App.test.tsx`
- `web/src/app/importRegistration.test.ts`
- `web/src/app/importParseJobs.test.ts`

## 5. 验证结果

- `npm --prefix web run test -- App importRegistration importParseJobs --run` 通过。
- `npm --prefix web run test -- importRegistration fileDisplay App CanvasWorkspace importParseJobs --run` 通过。
- `node -c web/electron/main.cjs` 通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/issues/2026-06-29-failed-sol-import-pairing/failed-sol-import-pairing-fix-note.md` 通过。
- `npm --prefix web run desktop:runtime:smoke` 通过，packaged runtime 报告 bundled Python 和 `cclib=1.8.1` 可用。
- `npm --prefix web run build` 通过；仍有既有 3Dmol direct eval 和大 chunk warning。
- 浏览器验证通过：`http://127.0.0.1:5173/` 页面标题为 `RxnFlow Workbench`；导入 `i1p6.log` + 失败 `i1p6-sol.log` 后，同组文件 tooltip 为 `No paired solvation log - i1p6-sol.log: No supported parser recognized this source preview.`，红色 parse-error badge 存在，console 无 error/warn。
- `npm --prefix web run desktop:pack` 通过，重新输出本地未签名目录包 `web/release/mac-arm64/RxnFlow.app`。
- `npm --prefix web run desktop:release:smoke` 通过。

## 6. 遗留事项

已经存在于旧项目包里的历史坏 sol 记录不会被自动删除；如果它没有真实 `sources/` backing，重新导入同名正常 sol 会按同名失败占位替换规则清理。已经复制进 `sources/` 的坏原始文件需要用户删除对应文件记录或重新导入正确文件覆盖。
