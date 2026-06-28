---
doc_type: architecture
slug: core-platform
status: current
created: 2026-05-02
last_reviewed: 2026-06-28
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

这层的作用是保留一个可测试的本地 engine 入口形状，方便 Electron shell / IPC 接入时有最小自证目标。当前 `engine_ipc` 是 stdin/stdout JSON command boundary，支持 `engine.status`、`flow.demo`、`import.preview`、`import.register_selection`、`import.register_all`、`project.validate`、`project.open` 和 `project.save`，capabilities 里标明 `import.full_file` 语义，供 Electron smoke、桌面导入、project contract 和 renderer 状态显示使用。`engine.status` 会报告 runtime、Python version 和 `dependencies.cclib`，packaged runtime smoke 会断言 bundled-python+cclib 可用。

Python core 当前支持 `import.preview` full-file 解析：Electron 传 `sourcePath` 时由 Python 读取完整文件；Electron dialog/drop 本身不再读取 64KB preview。Gaussian/ORCA full-file 的 package kind、energy/free energy、basis count 和 coordinates 由 cclib authoritative 回填：`scfenergies` 转 hartree，`freeenergy` 保留 hartree，`nbasis` 写入 basis count，`atomnos/atomcoords` 生成当前坐标预览。cclib 失败时返回 `cclib_unavailable` / `cclib_parse_failed` / `cclib_parse_empty` warning，标准字段留空，不再靠 text regex 抓到能量就标成 parsed。

RxnFlow text parser 仍然存在，但职责收缩为应用层元数据和非 cclib 路径：termination/job CPU/elapsed、Gaussian opt+freq continuation、solvent/role labels、MAPLE、普通 XYZ、ASE extxyz 和浏览器 fallback parser。对于含频率计算结果的 source，Python full-file path 优先读取 cclib 的 `vibfreqs` / `vibdisps`，并尽量携带 IR/Raman、reduced mass、force constant 等可用字段；无法经 cclib 提供时只对可靠识别的 Gaussian/common frequency block 做 text fallback，返回 `CoordinatePreview.vibrationModes`。振动 payload 是结构化项目数据：`displacements.length` 必须匹配同一 candidate 的 `atomCount`，非数值、atomIndex 越界或长度不匹配会丢弃该 mode 并产生 `vibration_shape_mismatch`；无法可靠解析时返回 `vibration_unavailable` 或 `vibration_parse_partial` warning，不伪造 normal mode，也不让整体 `import.preview` 失败。

Core 也支持 lightweight stateless `import.register_selection` / `import.register_all`，把 preview candidates 转成带 candidate/parser provenance/energyTable 的稳定登记对象摘要，但不恢复旧 ChemicalRegistry 或旧持久化 import registry workflow。轻量 `project.validate` / `project.open` / `project.save` 用于校验/读写工作区文件夹内的 `rxnflow-project` envelope、`.rxnflow/project.json` 状态文件、file/node/edge 基础引用、轻量 `importLedger` entry/file/node 引用、node 能量单位/数值/position 形状，以及工作区 `sources/` / `exports/` 文件存在性、size 和 sha256 warning。`project.save` 会在有 preview 和安全 `storedPath` 时 materialize 轻量 source 副本。

Electron packaged app 不再带 `web/electron/embedded-engine.cjs`。`web/electron/engine-bridge.cjs` 打包态 spawn extraResource 里的 `engine/rxnflow-engine`，开发态优先使用 `web/engine/rxnflow-engine`，缺少构建产物时才回退 `python3 -m rxnflow.engine_ipc`。浏览器开发预览仍使用 Web renderer shared fallback parser：`web/src/domain/sourceParsers.ts`；当前 PNG/CDXML/XLSX 轻量报告导出位于 `web/src/domain/reportExports.ts`，Electron 工作区文件夹、source copy、`.rxnflow.zip` 导出和 export manifest 位于 `web/electron/project-store.cjs`。生产级 parser 兼容矩阵、虚拟滚动完整 log viewer、旧持久化 import registry workflow 与旧 Python ReportExportService 不属于当前 active core。

## 2. 已移出 active core 的旧能力

以下旧能力已从 active code 删除，历史实现保存在 `.codestable/history/2026-06-12-pre-desktop-canvas-rebuild/rxnflow-pre-desktop-canvas-rebuild.tar.gz`：

- 完整 Project Store / Project Content / migration / validation；当前只保留工作区文件夹中的轻量 `.rxnflow/project.json` envelope、基础 file/node/edge/importLedger 引用校验和 source/export 文件校验。
- 旧 Parser plugin registry、完整 Gaussian/ORCA cclib adapter 兼容矩阵、旧持久化 import registry workflow；当前 active core 保留 UI 已承载的 bundled Python+cclib `import.preview`、MAPLE/XYZ/extxyz text fallback 与结构化 vibration payload。
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

Electron packaged runtime 还通过下列命令验证 bundled Python+cclib engine：

```bash
cd web && npm run desktop:runtime:smoke
```

## 5. 变更日志

- 2026-06-28：回写 bundled Python+cclib engine、删除 embedded JS fallback、Gaussian/ORCA cclib authoritative 字段和 Electron dialog/drop 不读 preview 的当前导入边界。
