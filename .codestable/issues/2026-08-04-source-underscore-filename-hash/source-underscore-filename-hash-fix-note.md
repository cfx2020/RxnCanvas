---
doc_type: issue-fix
issue: 2026-08-04-source-underscore-filename-hash
path: fast-track
fix_date: 2026-08-04
tags: [desktop, import, source-files, filenames]
---

# Source 下划线文件名误加 Hash 修复记录

## 1. 问题描述

删除旧节点及对应 source 文件后，重新拖入 gas/sol 计算文件，gas 文件按原名保存，但原始名称使用 `_sol.log` 的 sol 文件仍被保存为 `-sol-{hash}.log`。

## 2. 根因

`web/electron/project-store.cjs` 的 `safeSourceFileName()` 复用了只允许字母和数字的通用 stem 清洗规则。安全且跨平台可用的下划线 `_` 被替换成 `-`，随后代码把这次变化视为可能的文件名冲突，并追加原始名称 SHA-256 的前 16 位。

截图中的 hash 可由原始文件名精确复现，例如 `7a-1fix-ts_sol.log` 对应 `c5c9d3f317648c3f`。

## 3. 修复方案

- 为 source 文件名增加专用 stem 清洗规则，允许保留字母、数字、连字符和下划线。
- 继续对空格、特殊符号和不安全名称执行清洗与 hash 去冲突，不改变现有安全边界。
- 增加 `_sol.log` 与 `-sol.log` 均不追加 hash 的回归测试。

## 4. 改动文件

- `web/electron/project-store.cjs`
- `web/electron/project-store.test.cjs`

## 5. 验证结果

- `node --test web/electron/project-store.test.cjs` 通过，30 项测试全部通过；包含真实复制 `7a-1fix-ts_sol.log` 并断言落盘路径不含 hash。
- `node -c web/electron/project-store.cjs` 通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/issues/2026-08-04-source-underscore-filename-hash/source-underscore-filename-hash-fix-note.md` 通过。
- `npm --prefix web run desktop:pack` 通过，重新生成未签名 macOS App。
- `npm --prefix web run desktop:runtime:smoke` 通过，打包内 bundled Python 与 `cclib=1.8.1` 可用。
- `npm --prefix web run desktop:release:smoke` 通过；仅提示 Windows 产物需要在 Windows 上另行重建。

## 6. 遗留事项

本修复影响后续新导入文件；已经生成的带 hash source 文件不会自动迁移，需要删除并重新导入或另行执行迁移。
