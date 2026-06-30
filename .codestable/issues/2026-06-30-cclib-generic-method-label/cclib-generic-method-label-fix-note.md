---
doc_type: issue-fix
issue: 2026-06-30-cclib-generic-method-label
path: fast-track
fix_date: 2026-06-30
tags: [import, cclib, gaussian, inspector]
---

# cclib 泛称 method 覆盖 Gaussian route 标签修复记录

## 1. 问题描述

用户截图中 `i1fix8p6-tsf` 节点显示 `Method = DFT DFT DFT`、`Basis = unavailable`，但 `Basis functions = 3,957` 正常显示。该节点应显示 Gaussian route 中的 `wb97xd/genecp`，而不是 cclib metadata 给出的泛称 `DFT DFT DFT`。

## 2. 根因

Python full-file cclib 路径在合并解析结果时使用 `cclib_method_from_data(data) or text_result.method`。对部分 Gaussian log，cclib metadata 只提供 `DFT` 或 `DFT DFT DFT` 这类计算类型泛称；同时 Electron 导入为避免 renderer 读取大 log，项目 `preview` 为空，Inspector 不能再从 preview route 行兜底解析 basis 标签。

实际项目数据验证：`i1fix8p6-tsf` 已保存 `gasBasisFunctions=2271`、配对后 `solBasisFunctions=3957`，说明 cclib `nbasis` 链路正常；缺失的是 method/basis 文本标签链路。

## 3. 修复方案

在 Python engine full-file cclib 合并层新增 Gaussian route 标签提取：Gaussian log 的 method/basis 展示标签优先从 full text route 行解析为 `method/basis`，例如 `wb97xd/genecp`。energy/free energy、basis functions、坐标和振动等标准数值字段仍继续由 cclib 回填。

## 4. 改动文件清单

- `rxnflow/engine.py`
- `tests/test_engine.py`

## 5. 验证结果

- 新增单测覆盖：当 cclib metadata 返回 `["DFT", "DFT", "DFT"]` 且 Gaussian route 为 `#p wb97xd/genecp ...` 时，最终 `parsed.method` 和 candidate method 都是 `wb97xd/genecp`，basis functions 仍来自 cclib `nbasis=3957`。
- `python3 -m unittest tests.test_engine.EngineSmokeTest.test_cclib_full_file_uses_gaussian_route_for_method_basis_label tests.test_engine.EngineSmokeTest.test_engine_import_preview_uses_cclib_standard_fields` 通过。
- `python3 -m unittest discover` 通过 28 项。

## 6. 遗留事项

已保存成 `DFT DFT DFT` 的旧项目节点不会自动改写；需要重新导入或后续做 reparse/refresh 节点功能后刷新项目数据。
