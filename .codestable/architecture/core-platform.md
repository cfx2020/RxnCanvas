---
doc_type: architecture
slug: core-platform
status: current
created: 2026-05-02
last_reviewed: 2026-06-17
tags: [core, smoke-core, desktop-rebuild, local-engine-roadmap]
---

# Core Platform

## 1. 当前能力

桌面画布重构后，active Python core 已收缩为 smoke boundary。当前只保留：

1. `rxnflow.engine.EnergySummary`
2. `rxnflow.engine.FlowNode`
3. `rxnflow.engine.FlowEdge`
4. `rxnflow.engine.ReactionFlow`
5. `rxnflow.engine.demo_flow()`
6. `rxnflow.engine.export_flow_json()`
7. `rxnflow.engine.parse_source_preview()`
8. `rxnflow.engine.preview_sources()`
9. `rxnflow.engine.register_import_candidates()`
10. `rxnflow.engine.validate_project_content()`
11. `rxnflow.engine.open_project()`
12. `rxnflow.engine.save_project()`
13. `rxnflow.engine_ipc.handle_request()`
14. `python3 -m rxnflow.engine_ipc`

这层的作用是保留一个可测试的本地 engine 入口形状，方便 Electron shell / IPC 接入时有最小自证目标。Python core 当前支持 `import.preview` 的 full-file capable lightweight 解析：Electron 传 `sourcePath` 时由 Python 读取完整文件，未传 path 时才使用 renderer preview sample；可识别 Gaussian / ORCA（含常见 Cartesian coordinate、charge/spin 摘要）/ MAPLE / 普通 XYZ comment energy / ASE extxyz metadata（label、charge/spin、eV energy 转 Hartree）的基础摘要、formula、部分坐标摘要、候选列表、`objectCount`、parser provenance、`parseScope` / `confidence`、warnings 和 Gaussian/ORCA `energyTable` 字段；也支持 lightweight stateless `import.register_selection` / `import.register_all`，把 preview candidates 转成带 candidate/parser provenance/energyTable 的稳定登记对象摘要，但不恢复旧 ChemicalRegistry 或旧持久化 import registry workflow。轻量 `project.validate` / `project.open` / `project.save` 用于校验/读写工作区文件夹内的 `rxnflow-project` envelope、`.rxnflow/project.json` 状态文件、file/node/edge 基础引用、轻量 `importLedger` entry/file/node 引用、node 能量单位/数值/position 形状，以及工作区 `sources/` / `exports/` 文件存在性、size 和 sha256 warning。`project.save` 会在有 preview 和安全 `storedPath` 时 materialize 轻量 source 副本。它不计算能量 profile、不生成报告 artifact，也不提供用户面对的 CLI 或 HTTP 服务；当前 Electron renderer 会通过 preload 优先调用 engine register commands，再把 candidate/parser provenance 写入项目节点，保存时由 renderer package schema 派生 lightweight `importLedger`，浏览器开发预览和 engine failure path 继续使用 renderer-side fallback register。当前 `engine_ipc` 是 stdin/stdout JSON command boundary，支持 `engine.status`、`flow.demo`、`import.preview`、`import.register_selection`、`import.register_all`、`project.validate`、`project.open` 和 `project.save`，capabilities 里标明 `import.full_file` 语义，供 Electron smoke、桌面导入、project contract 和 renderer 状态显示使用。Electron packaged app 还带有 `web/electron/embedded-engine.cjs`，在 Python engine unavailable / timeout / bad response 时提供同一组轻量 UI command fallback；packaged runtime smoke 会验证 preload engine status、candidate registration、importLedger persistence 和基础 project reference validation。浏览器开发预览和 engine failure path 仍使用 Web renderer shared fallback parser：`web/src/domain/sourceParsers.ts`；当前 PNG/CDXML/XLSX 轻量报告导出位于 `web/src/domain/reportExports.ts`，Electron 工作区文件夹、source copy、`.rxnflow.zip` 导出和 export manifest 位于 `web/electron/project-store.cjs`。生产级 cclib 后端、虚拟滚动完整 log viewer、旧持久化 import registry workflow 与旧 Python ReportExportService 不属于当前 active core。

## 2. 已移出 active core 的旧能力

以下旧能力已从 active code 删除，历史实现保存在 `.codestable/history/2026-06-12-pre-desktop-canvas-rebuild/rxnflow-pre-desktop-canvas-rebuild.tar.gz`：

- 完整 Project Store / Project Content / migration / validation；当前只保留工作区文件夹中的轻量 `.rxnflow/project.json` envelope、基础 file/node/edge/importLedger 引用校验和 source/export 文件校验。
- Parser plugin registry、Gaussian/ORCA cclib adapter、MAPLE/XYZ/extxyz parser。
- Chemical Registry、Import Registry Workflow、Reaction Graph Service、Graph Editor Workspace。
- Energy Engine、Energy Profile persistence、correction policy。
- 旧 Python 报告导出服务、导出清单和 artifact 索引。
- Platform Shell、CLI、Local HTTP bridge、browser storage backend。
- Parser fixture corpus 和大规模 regression harness。

按当前规则，这些能力不能因为“历史上有代码”就回到 active surface。只有当新 UI 或桌面客户端明确需要时，才通过 roadmap 中的 feature 逐项重新引入。

## 3. 当前重引入约束

如果未来要把旧 core 能力重新引回 active surface，必须满足：

- 领域核心不依赖 React、Electron、Vite 或具体桌面壳。
- 端侧能力通过薄壳层适配共享核心。
- 解析器保持插件化，避免回到大函数。
- 数值处理显式记录单位、基准和校正项来源。

## 4. 当前验证

`tests/test_engine.py` 覆盖 smoke core 的 JSON export、`import.preview`、project validation/open/save 和 `engine_ipc` command handling：

```bash
python3 -m unittest discover
```
