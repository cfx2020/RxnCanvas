---
doc_type: user-guide
slug: report-export-artifacts
component: report-export-guides
status: current
summary: 如何在 RxnFlow Web 工作台导出 PNG、CDXML 和 XLSX 报告 artifacts
tags: [report-export, web-workbench, cdxml, xlsx, local-first]
last_reviewed: 2026-05-21
---

# 导出 PNG、CDXML 和 XLSX 报告文件

## 功能简介

RxnFlow Web 工作台可以把当前能量剖面导出为三类文件：PNG 能量图、ChemDraw 可打开的 CDXML 能量图，以及 XLSX 能量表工作簿。导出结果会显示在 Report Export 面板中，带有下载入口、metadata、warnings、保存状态和 checksum。

当前导出是本地优先能力。浏览器项目中的 `exports/...` 文件保存在当前浏览器本地仓储中，不是云同步。

## 前置条件

- 已经在 Web 工作台运行过 fixture 或打开了可用 session。
- 图谱中已有 active path。
- Energy Profile 面板已经成功 Compute，页面中有当前 profile。

## 如何使用

1. 在 Web 工作台中确认图谱已有当前路径。
2. 在 Energy Profile 面板点击 `Compute`，得到相对能量表和曲线。
3. 在 Report Export 面板选择需要的格式：
   - `png`
   - `cdxml`
   - `xlsx`
4. 保持 `Include bytes` 开启，才能在浏览器中看到 Download link。
5. 根据需要修改 `Basename` 和 `Report title`。
6. 点击 `Export`。
7. 在 artifact card 中查看每个导出文件：
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

## 保存位置

有 active browser project 且 `Include bytes` 开启时，Web 会把导出文件保存到当前浏览器本地项目：

```text
exports/rxnflow-profile.png
exports/rxnflow-profile.cdxml
exports/rxnflow-profile.xlsx
```

`Basename` 改成别的值后，路径中的 `rxnflow-profile` 也会跟着改变。重复导出同名文件会覆盖同一路径或更新同一条记录，不会自动生成历史版本。

如果没有 active browser project，或关闭了 `Include bytes`，页面仍会显示 runtime artifact metadata，但不会写入 `exports/...`。

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

Q: 能导出 CSV、PDF、PPTX、SVG 或完整报告吗？

A: 当前不能。首轮只支持 PNG、CDXML 和 XLSX。CSV、CDX、PDF/PPTX/SVG 和组合报告都属于后续独立功能。

## 相关功能

- 打开并恢复项目内容：`docs/user/open-project-content.md`
- 项目备份包：`docs/user/project-bundle-backup.md`
- 开发者导出契约：`docs/dev/report-export-artifacts.md`
