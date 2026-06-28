---
doc_type: feature-ff-note
feature: cclib-authority-parser
date: 2026-06-28
requirement:
tags: [parser, cclib, gaussian, orca, import, chemistry]
---

## 做了什么
把 Gaussian/ORCA full-file 的标准字段收敛为 cclib authoritative：package kind、energy/free energy、basis count 和 coordinates 不再由 RxnFlow 正则 fallback 兜底。RxnFlow text parser 继续负责应用层元数据，例如 termination/job time、opt+freq continuation、solvent/role labels，以及 XYZ/MAPLE/browser fallback。

## 改了哪些
- `rxnflow/engine.py:445` — full-file output 先交给 cclib 解析，失败时返回 cclib warning，而不是靠正则抓到能量就算成功。
- `rxnflow/engine.py:532` — 合并逻辑明确 cclib 拥有 Gaussian/ORCA 标准字段，text parser 只补 RxnFlow 元数据。
- `rxnflow/engine.py:579` — coordinates 来自 cclib `atomnos/atomcoords` 的最新结构。
- `rxnflow/engine.py:759` — energy table 从 cclib `scfenergies/freeenergy/nbasis` 转成 RxnFlow 的 hartree/basis 字段。
- `tests/test_engine.py` — 覆盖 cclib authoritative 字段、cclib unavailable/parse failed warning 和 opt+freq termination 语义。

## 怎么验证的
跑过 `python3 -m unittest discover`、`npm --prefix web run test` 和 `npm --prefix web run build`。构建只保留既有 3Dmol direct eval 与大 chunk warning。
