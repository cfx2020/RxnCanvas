---
doc_type: explore
type: question
status: active
created: 2026-06-30
summary: "cclib nbasis 与 Inspector basis functions 显示链路"
tags:
  - import
  - cclib
  - inspector
---

# cclib basis count 和节点 Basis functions 显示

## 速答

cclib 给出的 `nbasis` 和 Gaussian/ORCA 输出里的 basis functions count 是同一类值；RxnFlow 里显示的 `Basis functions` 也就是这个数。

节点不显示 basis functions，不是因为概念不同，而是因为当前节点的 `energyTable` 里没有 `gasBasisFunctions` 或 `solBasisFunctions`。常见原因包括：这个节点来自旧项目缓存/历史失败占位、full-file cclib 没有成功返回 `nbasis`、节点不是经 Electron full-file cclib 路径注册、或 gas/sol 配对时参与配对的一侧没有携带 energy table。

Method/Basis 文本和 Basis functions 数字是两条链路。`DFT` 这类泛称来自 cclib metadata 的 method 字符串；`genecp` 这类 basis 标签来自 route/text 解析或 method/basis 拆分。某些节点只显示 `DFT` 属于 method/basis 展示优先级问题，不等于 `nbasis` 数字概念不同。

## 关键证据

- `rxnflow/engine.py:759` `cclib_energy_table_from_data()` 从 cclib data 读取 `nbasis`，写入 `gasBasisFunctions`，solution log 也写入 `solBasisFunctions`。
- `web/src/app/InspectorPanels.tsx:346` Inspector 只从 `node.energyTable?.solBasisFunctions ?? node.energyTable?.gasBasisFunctions` 取 basis functions；没有这两个字段就显示 `unavailable`。
- `web/src/app/importWorkspace.ts:221` gas/sol 配对后的 energy table 先继承 gas table，再从 solution table 补 `esolHartree` 和 `solBasisFunctions`。
- `.codestable/architecture/core-platform.md:33` 当前架构约定 Gaussian/ORCA full-file 的 energy/free energy、basis count 和 coordinates 由 cclib authoritative 回填，text regex 不再作为标准字段权威兜底。
- `.codestable/issues/2026-06-28-reimport-stale-sol-placeholder/reimport-stale-sol-placeholder-fix-note.md:17` 已有实测案例中，打包 engine 解析正常 sol log 时会返回 `solBasisFunctions=3957`，说明 cclib -> engine 字段链路本身可工作。

## 后续方向

后续修复应分开处理两件事：第一，给缺 basis functions 的节点做可诊断的 reparse/刷新链路；第二，对 method/basis 展示把 `DFT` 这类泛称视为不够具体，优先展示 route 里的 `wb97xd/genecp`。
