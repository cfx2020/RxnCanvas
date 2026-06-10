---
doc_type: decision
category: architecture
date: 2026-06-06
slug: canonical-import-data
status: active
area: import-persistence
tags: [import, parser, project-content, raw-files, web-workbench]
---

## 背景

RxnFlow 的用户会导入 Gaussian log、ORCA output、MAPLE/ASE xyz/extxyz 等不同来源的计算输出。早期 Web MVP 为了快速验证导入、项目文件列表、保存恢复和 bundle roundtrip，把浏览器选择的原始文件写入 `inputs/raw/...`，并在项目 manifest 中登记 raw file resource。

用户现在明确拍板：不需要长期保留 log。不同格式的文件导入后，应统一转成 RxnFlow 项目自己的结构化数据。log/out/xyz/extxyz 文件中大量内容对后续图谱编辑、能量曲线和报告导出没有直接价值，长期保存会增加浏览器/云存储成本，也会让 Web 版、Vercel 版和桌面版的存储心智变复杂。

## 决定

原始计算输出文件只作为导入解析的临时输入，不作为 RxnFlow 项目的长期 authority。导入完成后，项目保存和恢复以 RxnFlow canonical project data 为准，包括：

- `ChemicalObject` 及其 geometry、charge、spin、method、energy、thermochemistry、correction 等字段。
- `ReactionGraph`、`WorkspaceSnapshot`、`EnergyProfile`、`ExportArtifactRecord` 等项目状态。
- 轻量来源记录：原始文件名、文件大小、checksum、parser id/version、parsed_at、software/method metadata、warning/error code。

默认不保存原始 log/out/xyz/extxyz bytes，不把 raw file resource 放入项目主数据，也不要求导出/分享项目时包含原始文件。raw 文件保留只作为后续可选附件能力，不进入当前默认路径。

## 理由

RxnFlow 的产品定位是计算化学结果的图谱编辑器和报告生成工具，不是 raw log 归档系统。用户导入文件的核心目的，是获得可复用的结构、能量和计算元数据，然后在画布中组合、连接、计算和导出。

统一 canonical project data 可以让 Web、Vercel 云解析、本地 bridge、桌面 app 和 CLI 共用一套项目状态，不必关心原始文件来自浏览器 File、服务器 Blob、本地路径还是桌面文件选择器。它也能显著降低云端方案的存储压力：云端可临时接收 raw log，解析成功后删除原文件，只保存结构化项目数据。

轻量来源记录仍然保留 checksum、parser version 和 warning/error code，用于排查 parser 结果、提示用户重新导入、以及让 agent 判断项目数据来源，但它不要求项目能从 raw log 重新解析恢复。

## 考虑过的替代方案

- 默认保存所有 raw log：便于复核和重新解析，但会放大项目体积、云存储成本和隐私风险，也不符合用户当前拍板。
- 只做云端 raw log 存储：适合在线重解析，但过早引入账号、权限、存储计费和数据合规问题。
- 完全不记录来源信息：项目更轻，但 parser 回归、错误排查和用户识别结构来源会变困难。

## 后果

- Import workflow 需要支持 transient parse：解析输入可以是 path、inline bytes、Blob 临时文件或本地 bridge staging file，但默认不把 raw bytes 写入项目。
- Project Content / browser repository / bundle helper 的主路径应去掉 `inputs/raw/...` 作为长期项目内容。
- Web 左侧不应继续把 raw log 列为长期 Project Files；应改成项目数据/结构库视图，展示已导入对象、来源摘要、状态和可拖入画布能力。
- Save Project / reopen / share 只依赖 canonical project data 恢复对象、画布、路径、能量和导出记录。
- 现有 architecture 文档中关于 raw file resource、Project Files raw-only、bundle 包含 `inputs/raw/` 的描述在实现迁移后需要回写为新现状。

## 相关文档

- `.codestable/requirements/web-workbench-shell.md`
- `.codestable/requirements/project-content-persistence.md`
- `.codestable/architecture/core-platform.md`
- `.codestable/architecture/web-workbench.md`
- `docs/user/workspace-first-workbench.md`
