---
doc_type: issue-report
issue: 2026-08-05-stale-project-source-parse
status: confirmed
severity: P1
summary: 覆盖项目 sol 文件后节点与右侧 Source 仍使用旧自旋态和旧能量
tags: [desktop, source-files, parser, autosave, energy]
---

# 项目 Source 覆盖后仍使用旧 Parse Issue Report

## 1. 问题现象

Ni 项目中的某个节点原先配对了三重态 sol log。用户随后用同名的单重态 sol log 覆盖并重新把该结构拖入画布，但新节点仍使用三重态 sol 能量；右侧 Source 面板外部打开 sol 时也看到三重态内容。用户直接检查认为是项目 `sources/` 下的同名文件时，观察到的却是单重态内容，形成“项目文件、Source 面板和节点解析互相不一致”的现象。

## 2. 复现步骤

1. 导入一组 gas/sol 文件，其中 sol 是三重态，并把结构拖入画布。
2. 用同名的单重态 sol log 替换来源文件或项目 source 副本。
3. 回到 RxnFlow，再次从左侧 Files 把该 gas/sol 结构拖入画布。
4. 检查节点 free energy / multiplicity，以及右侧 Source 的 sol 外部打开结果。

复现频率：旧实现稳定复现。

## 3. 期望 vs 实际

**期望行为**：项目 `sources/` 副本是桌面工作区的长期文件 authority。文件内容变化后，拖入画布前必须重新解析完整 gas/sol 分组；节点能量、Source 面板元数据和外部打开都应对应同一个项目副本。若新文件解析失败，应显示 staged/pending，不得继续使用旧能量。

**实际行为**：renderer 直接复用内存和项目 JSON 中的旧 `SourceFile.parse`；autosave 又可能从残留外部 `sourcePath` 把旧内容重新复制回项目 `sources/`。因此 checksum、parse、节点能量和磁盘文件可以分别代表不同版本。

## 4. 环境与现场证据

- 项目：`/Users/linsay/Documents/chemistry/Ni`
- 项目副本：`sources/s-s-i5-2-fix7-ts_sol.log`
  - SHA-256：`df0782bd528508c45d5de312877a9c2185595560d8552c1119c643705b1716f3`
  - multiplicity：3
  - mtime：`2026-08-05 11:58:16`
  - ctime：`2026-08-05 15:00:22`
- 外部新文件：`/Users/linsay/Library/CloudStorage/OneDrive-汕头大学/Gaussian/cma/S/S-s-i5-2-fix7-ts_sol.log`
  - SHA-256：`15eb6559a5e3fa2d98324bf3c9780483490b326698feca07b7122e1aed650d92`
  - multiplicity：1
  - mtime / ctime：`2026-08-05 14:58:17`
- `.rxnflow/project.json` 中同一 source 的 parse multiplicity 为 3，且保存时尚无 `parseChecksum` 字段。

时间线表明：单重态外部文件在 `14:58:17` 已生成，但项目副本在 `15:00:22` 被旧三重态内容重新写入。

## 5. 严重程度

**P1** — 错误会静默污染溶剂化能量和自旋态，用户无法仅凭节点或 Source 面板判断数据版本，直接影响反应路径相对能量结论。
