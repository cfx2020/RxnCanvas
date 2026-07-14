---
doc_type: issue-fix
issue: 2026-07-15-preview-sample-source-truncation
status: fixed
path: fast-track
fix_date: 2026-07-15
severity: high
tags: [project-save, source-files, preview, data-integrity, electron, python-engine]
---

# Preview 样本伪装成完整源文件修复记录

## 1. 问题描述

项目保存时，如果找不到完整的原始计算文件，但 source 记录仍带有 preview，Electron 和 Python/core 两条保存路径都会把 preview 文本写入 `sources/`，随后生成新的 size/checksum。大文件 preview 可能只有头尾片段和省略标记，因此项目会把截断样本伪装成校验通过的完整 log，重新打开或按需读取振动、结构时可能得到残缺数据。

## 2. 根因

- `web/electron/project-store.cjs` 的 `persistSourceFile()` 在 `sourcePath` 不可用时，把任意非空 preview 直接写入目标 source 文件。
- `rxnflow/engine.py` 的 `materialize_project_sources()` 在 stored source 不存在时执行相同的 preview `write_text()` fallback。
- 两条路径随后都以截断文件重新计算 size/checksum，校验无法再识别原始内容已经丢失。

## 3. 修复方案

- preview 永远只作为界面预览字段保存，不再参与 source 文件物化。
- 项目目录中已经存在完整 stored source 时，继续读取真实文件并更新其 size/checksum；preview 不会覆盖它。
- 已解析或 ready 的 source 缺少完整文件时，保留安全的 planned/existing `storedPath`、移除 checksum，让项目校验明确返回 `source_missing`。
- 仍在解析中的 pending/deferred source 如果实际文件不存在，则同时移除 stale `storedPath` 和 checksum，避免产生暂时性的 missing-source 误报。
- Electron 与 Python/core `project.save` 使用相同语义。

## 4. 改动文件清单

- `web/electron/project-store.cjs`
- `web/electron/project-store.test.cjs`
- `web/electron/smoke.cjs`
- `rxnflow/engine.py`
- `tests/test_engine.py`
- `.codestable/issues/2026-07-15-preview-sample-source-truncation/preview-sample-source-truncation-fix-note.md`

## 5. 验证结果

- Electron 回归覆盖 sampled preview：保留原 size/preview 与 planned storedPath，不生成 checksum，不创建 source 文件。
- Electron 回归覆盖 pending + stale storedPath：保存后不保留 storedPath/checksum，也不创建文件。
- Electron 回归覆盖已有完整 source：完整 bytes 保持不变，size/checksum 来自真实文件。
- Python/core 回归覆盖 preview-only missing source、已有完整 source 和 pending stale storedPath，语义与 Electron 一致。
- Desktop smoke 证明 sampled preview 保存后返回 `source_missing`，且磁盘不存在伪造 source。
- `python3 -m unittest discover`：46 项通过。
- `cd web && node --test electron/*.test.cjs`：23 项通过。
- `cd web && npm run desktop:smoke`：通过。
- `cd web && npm run test`：43 个文件、399 项测试通过。
- `cd web && npm run build`：通过；仅保留既有 3Dmol direct `eval` 与大 chunk 警告。
- `git diff --check`：通过。

## 6. 遗留事项

无。本次只修 preview 被当作完整 source 落盘的数据完整性问题，不改变解析器或 UI 展示逻辑。
