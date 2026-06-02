---
doc_type: user-guide
slug: report-export-artifacts
component: report-export-guides
status: current
summary: 如何在 RxnFlow Web 工作台导出报告 artifacts
tags: [report-export, web-workbench, cdxml, xlsx, csv, svg, local-first]
last_reviewed: 2026-06-01
---

# 导出 PNG、CDXML、XLSX、CSV 和 SVG 报告文件

## 功能简介

RxnFlow Web 工作台当前可以把当前能量剖面和图谱快照导出为五类文件：PNG 能量图、ChemDraw 可打开的 CDXML 能量图、XLSX 能量表工作簿、CSV 能量表，以及 SVG graph snapshot。Report Export 面板默认先显示 Preview，用来检查 graph/profile summary、报告资产 readiness、可复用 artifacts 和 warnings；切到 Export 后可以执行导出。导出结果会显示下载入口、metadata、warnings、保存状态和 checksum。

当前导出是本地优先能力。浏览器项目中的 `exports/...` 文件保存在当前浏览器本地仓储中，不是云同步。

## 前置条件

- 已经在 Web 工作台运行过 fixture 或打开了可用 session。
- 图谱中已有 active path。
- Energy Profile 面板已经成功 Compute，页面中有当前 profile。

## 如何使用

1. 在 Web 工作台中确认图谱已有当前路径。
2. 在 Energy Profile 面板点击 `Compute`，得到相对能量表和曲线。
3. 在 Report Export 面板先查看 `Preview`：
   - `Report assets` 会显示 energy diagram、energy table、graph snapshot 是 `Ready` 还是 `Pending export`。
   - `Reusable artifacts` 会列出当前已有 artifact 的 format、id、inline bytes、persisted/path/checksum 状态。
   - `Preview warnings` 会保留导出 warning code、message 和 target。
4. 切到 `Export` 模式，选择需要的格式：
   - `png`
   - `cdxml`
   - `xlsx`
   - `csv`
   - `svg`
5. 保持 `Include bytes` 开启，才能在浏览器中看到 Download link。
6. 根据需要修改 `Basename` 和 `Report title`。
7. 点击 `Export`。
8. 回到 `Preview`，确认 energy table 和 graph snapshot 等资产从 `Pending export` 变成 `Ready`。
9. 在 artifact card 中查看每个导出文件：
   - `Download`：直接下载当前 artifact。
   - `Path`：如果已经持久化，会显示 `exports/{basename}.{format}`。
   - `Persisted`：是否已写入当前 browser-local project。
   - `Checksum`：保存后用于校验文件内容的 sha256。
   - `Metadata`：writer、profile、path、schema version 等信息。
   - `Warnings`：导出过程中的说明或限制。

## 格式说明

| 格式 | 用途 | 当前边界 |
|---|---|---|
| PNG | 快速放进文档、汇报或聊天中查看能量图。 | 位图，不适合在 ChemDraw 中编辑对象。 |
| CDXML | 用 ChemDraw 打开和编辑能量图线条、文字等图形对象。 | 当前是 `.cdxml` XML 文件，不是 `.cdx` 二进制文件；不包含分子结构编辑语义。 |
| XLSX | 查看结构优先的能量表、Energy Profile 和 warnings。 | 当前不套用你的私有 Excel 模板；缺失字段留空，不自动补 0。 |
| CSV | 把结构优先的能量表交给脚本、表格软件或其他数据流程。 | UTF-8 单表 CSV；没有公式、多 sheet、样式或私有模板；缺失字段为空 cell。 |
| SVG | 保存当前反应图谱的 graph snapshot，适合放入报告、网页或矢量编辑流程。 | 由 core 根据 graph/workspace 投影生成，不是 Web 画布截图；包含节点、边、active path、selection 和 viewport metadata，不包含 hover 或拖拽中的临时状态。 |

RxnFlow 内部仍记录了 PDF、PPTX 和 CDX 的格式能力边界，但这些格式当前不会出现在 Web 导出勾选项里，也不会生成文件。

## 保存位置

有 active browser project 且 `Include bytes` 开启时，Web 会把导出文件保存到当前浏览器本地项目：

```text
exports/rxnflow-profile.png
exports/rxnflow-profile.cdxml
exports/rxnflow-profile.xlsx
exports/rxnflow-profile.csv
exports/rxnflow-profile.svg
```

`Basename` 改成别的值后，路径中的 `rxnflow-profile` 也会跟着改变。重复导出同名文件会覆盖同一路径或更新同一条记录，不会自动生成历史版本。

如果没有 active browser project，或关闭了 `Include bytes`，页面仍会显示 runtime artifact metadata，但不会写入 `exports/...`。

## Preview 状态含义

| 状态 | 含义 |
|---|---|
| Ready | 当前 runtime 或 browser-local artifacts 中已经有可复用资产。 |
| Pending export | 当前 profile/graph 已经足够生成资产，但还没有对应导出 artifact。 |
| Needs review | 当前 profile 含 missing point 或 warning，需要导出前人工检查。 |
| Unavailable | 缺少 profile、graph 或必要输入，当前还不能判断或生成该资产。 |

Preview 只读取页面已有的 profile、workspace、artifacts 和 warnings，不会生成文件、不保存项目，也不会重新计算能量或重排图谱。

## 常见问题

Q: 为什么没有 Download link？

A: 通常是 `Include bytes` 没有开启，或 Shell 返回的 artifact 没有 inline bytes。开启 `Include bytes` 后重新导出。

Q: `Persisted: no` 是什么意思？

A: 当前 artifact 还没有写入 browser-local project。可能是没有打开浏览器本地项目、关闭了 `Include bytes`，或浏览器本地写入失败。

Q: checksum 有什么用？

A: checksum 是文件内容的 sha256 指纹，用于判断保存后的 artifact 是否和索引记录一致。

Q: CDXML 和 CDX 有什么区别？

A: CDXML 是 XML 格式，当前 RxnFlow 支持导出 `.cdxml`。CDX 是 ChemDraw 的二进制格式，当前不支持。需要 CDX 时，先在 ChemDraw 中打开 CDXML，再由 ChemDraw 另存为 CDX。

Q: XLSX 第一列是什么？

A: 第一列固定为结构名称。能量字段包括 Egas、Ggas、Ggas+1M、Ggas(shermo)、Ggas(shermo+1M)、Esol、Gsol、relative energy 和 missing reason 等。当前没有数据的字段留空。

Q: 网页版会自动云备份这些导出文件吗？

A: 不会。当前 Web 工作台是 local-only。浏览器清数据、profile 损坏或换浏览器都可能导致 browser-local project 丢失。需要迁移或备份时，后续使用 `.rxnflow.zip` 项目包路线。

Q: 能导出 CSV 吗？

A: 可以。CSV 使用和 XLSX 一样的 `energy-table-v1` 表格字段，第一列固定为结构名称，缺失字段为空 cell，不自动补 0 或 NA。

Q: 能导出 SVG 吗？

A: 可以。SVG 是 graph snapshot artifact，反映当前 workspace graph、active path、selection 和 viewport。它不是浏览器 DOM/canvas 截图，也不会包含 hover、正在拖动的连线草稿或历史记录。

Q: 能导出 PDF、PPTX、CDX 或完整报告吗？

A: 当前不能。当前可执行导出是 PNG、CDXML、XLSX、CSV 和 SVG。内部已经有组合报告 manifest 用来约束后续 PDF/PPTX/HTML 等 writer，但它不是用户可下载的完整报告文件；PDF、PPTX 和 CDX 仍属于后续独立功能。

## 相关功能

- 打开并恢复项目内容：`docs/user/open-project-content.md`
- 项目备份包：`docs/user/project-bundle-backup.md`
- 开发者导出契约：`docs/dev/report-export-artifacts.md`
