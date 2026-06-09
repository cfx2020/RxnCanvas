---
doc_type: user-guide
slug: report-export-artifacts
component: report-export-guides
status: current
summary: 如何在 RxnFlow Web 工作台导出 PNG、CDXML 和 XLSX 文件
tags: [report-export, web-workbench, png, cdxml, xlsx, local-first]
last_reviewed: 2026-06-09
---

# 导出报告文件

## 功能简介

RxnFlow Web 工作台当前的导出面板只做一件事：把当前能量剖面导出为文件并提供下载。

当前 Web 面板显示三种格式：

| 格式 | 用途 | 当前边界 |
|---|---|---|
| PNG | 快速放进文档、汇报或聊天中查看能量图。 | 位图，不适合在 ChemDraw 中编辑。 |
| CDXML | 用 ChemDraw 打开能量图文本和线条。 | 当前是 `.cdxml` XML 文件，不是 `.cdx`；只包含结构名称、相对能量和能量差等能量图元素，不包含分子级原子/键结构。 |
| XLSX | 导出结构优先的能量表。 | 第一列是结构名称；当前不套用你的私有 Excel 模板，缺失字段留空。 |

CSV 和 SVG 在底层 core 仍保留 writer 能力，但当前 Web 主界面不显示这两个格式。这样导出面板不会再混入不清楚用途的 graph snapshot 或脚本数据格式。

## 如何使用

1. 在画布上完成节点和路径连接。
2. 等待当前能量剖面自动计算完成。
3. 点击右上角 `导出` 打开右侧导出面板。
4. 勾选需要的格式：PNG、CDXML、XLSX。
5. 根据需要修改文件名基底和报告标题。
6. 点击 `导出`。
7. 在导出的文件列表里点击 `下载`。

导出面板不会显示 preview、readiness、checksum、writer id、metadata 或 persisted 状态。这些信息仍保留在内部数据结构和测试里，但不应该占用普通用户界面。

## 保存位置

在 Web 工作台中，下载链接直接来自当前 runtime 返回的文件 bytes。若当前项目处于 browser-local 项目中，Web 还会把这些 bytes 写入浏览器本地项目的 `exports/` 下：

```text
exports/rxnflow-profile.png
exports/rxnflow-profile.cdxml
exports/rxnflow-profile.xlsx
```

这些文件不显示在左侧 Project Files 里。左侧 Project Files 只放用户导入并可拖到画布的计算输出文件，例如 `.log`、`.out`、`.xyz`、`.extxyz`。

## 常见问题

Q: 为什么没有 CSV？

A: 当前 Web 主流程先收敛到 PNG、CDXML 和 XLSX。CSV writer 仍在 core 中，可供后续 CLI、脚本或高级导出入口复用，但普通导出面板暂时不显示。

Q: SVG 是导出什么？

A: SVG writer 是底层 graph snapshot 能力，不是当前画布截图，也不是用户要交给 ChemDraw 的能量图。因此当前 Web 面板先隐藏它，避免和报告导出混在一起。

Q: CDXML 和 CDX 有什么区别？

A: CDXML 是 XML 格式，当前 RxnFlow 支持导出 `.cdxml`。CDX 是 ChemDraw 的二进制格式，当前不支持。需要 CDX 时，先在 ChemDraw 中打开 CDXML，再由 ChemDraw 另存为 CDX。

Q: CDXML 里有什么？

A: 当前 CDXML 只做最小能量图导出：结构名称、相对能量、相邻能量差和必要的 missing/correction 标记。它不是分子结构 ChemDraw 文件。

Q: XLSX 第一列是什么？

A: 第一列固定为结构名称。能量字段来自当前能量表契约；没有数据的字段留空，不自动补 0。

Q: 网页版会自动云备份导出文件吗？

A: 不会。当前 Web 工作台是 local-first。浏览器本地项目不是云同步，也不是跨设备备份。需要长期保存时，请下载导出的 PNG、CDXML、XLSX 文件。

Q: 能导出 PDF、PPTX、CDX 或完整报告吗？

A: 当前不能。PDF/PPTX/CDX 需要单独设计 writer、依赖和验收方式，不能直接拿当前网页 DOM 或截图当正式报告。

## 相关功能

- Web 工作台主流程验收：`docs/user/workspace-first-workbench.md`
- 打开并恢复项目内容：`docs/user/open-project-content.md`
- 项目备份包：`docs/user/project-bundle-backup.md`
- 开发者导出契约：`docs/dev/report-export-artifacts.md`
