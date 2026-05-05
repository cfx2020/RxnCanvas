# import-registry-workflow 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-05
> 关联方案 doc：codestable/features/2026-05-04-import-registry-workflow/import-registry-workflow-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] 单文件导入并确认：`rxnflow.import_workflow.ImportRegistryWorkflow.import_files` 返回 `ImportBatch`，item 为 `needs_confirmation`；`confirm_import` 后 item 为 `registered` 并记录 object id。证据：`tests/test_import_registry_workflow.py::test_import_single_file_creates_parse_preview_and_confirm_registers_object`。
- [x] 批量部分失败：一个可解析 xyz 和一个 unsupported txt 会得到 `needs_confirmation` / `failed` item，失败 item error code 为 `unsupported_format`。证据：`test_batch_import_allows_partial_parse_failure`。
- [x] MAPLE 多帧式选择：`ImportSelection.object_indices` 可只登记 ParseResult 中指定 object。证据：`test_confirm_import_can_select_subset_of_parsed_objects`。

**名词层“现状 → 变化”逐项核对**：

- [x] `ImportFileRequest`、`ImportBatch`、`ImportItem`、`ParsePreview`、`ImportSelection`、`ImportItemStatus` 均在 `rxnflow/import_workflow.py` 落地。
- [x] `ImportItem` 状态包含 `source_path`、`raw_resource`、`preview`、`registered_object_ids`、`error`、`warnings`。
- [x] raw resource → RawFile adapter 落在 `_raw_file_from_resource`，path 指向 Project Directory 内的 raw file 副本。

**流程图核对**：

- [x] `import_files` 实现 project manifest load → per-file add raw resource → RawFile adapter → parser parse → ParsePreview / failed item → in-memory batch。
- [x] `confirm_import` 实现 batch lookup → item validation → optional object selection → ChemicalRegistry.register → registered item 或 failed item。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 支持单文件和批量 ImportFileRequest。
- [x] 调用 ProjectStore 把 source file 复制到项目并登记 `raw_file` resource。
- [x] 把 ProjectResource 转为 ParserRegistry 可解析的 RawFile。
- [x] 调用 ParserRegistry 得到 ParseResult 和 warnings，并形成 ParsePreview。
- [x] 确认后调用 ChemicalRegistry.register 登记 ChemicalObject。
- [x] 返回 sidebar-ready 的 batch/item 状态。

**明确不做逐项核对**：

- [x] 未新增 UI 组件、Web route、CLI 命令、桌面文件选择器或真实侧边栏。
- [x] 未新增或修改 Gaussian/ORCA/XYZ/MAPLE parser plugin 解析逻辑。
- [x] 未修改 ChemicalRegistry fingerprint、correction 或自动合并策略。
- [x] ImportRegistryWorkflow 未调用 ReactionGraphService、EnergyProfileEngine 或 Export Service。
- [x] 未生成 ReactionGraph、EnergyProfile、ExportArtifact、PNG、CDXML 或 Excel。
- [x] 未持久化 ImportBatch、ParsePreview 或 ChemicalObject 内容。
- [x] 未删除用户源文件，也未自动删除已进入项目的 raw file resource。

**关键决策落地**：

- [x] Workflow 主导编排，ProjectStore / ParserRegistry / ChemicalRegistry 保持单责。
- [x] 两阶段导入：`import_files` 产生 raw resource + parse preview；`confirm_import` 才登记对象。
- [x] 批量导入允许部分成功；project-level 错误才直接返回 Result error。
- [x] parse 失败后 raw resource 保留在 project 内。
- [x] confirmation 支持 object index 选择。
- [x] ImportBatch 当前为内存状态。

**挂载点反向核对**：

- [x] 挂载点只新增 `rxnflow/import_workflow.py`、feature 文档、测试和 roadmap/architecture 回写。
- [x] grep 确认 parser sources 不引用 `ImportRegistryWorkflow`。
- [x] 拔除沙盘：删除 `rxnflow/import_workflow.py`、`tests/test_import_registry_workflow.py` 和本 feature 文档即可移除本 feature；其它核心服务无反向依赖。

## 3. 验收场景核对

- [x] **S1 单文件导入预览**：支持格式 source file → `needs_confirmation` item，含 raw_resource、parse preview、object_count 和 warnings。证据：`test_import_single_file_creates_parse_preview_and_confirm_registers_object`。
- [x] **S2 确认登记**：confirm 后 item 为 `registered`，ChemicalRegistry 可按 object id 读取对象。证据：同上。
- [x] **S3 批量部分失败**：可解析 item 成功、不支持 item 失败且 code 为 `unsupported_format`。证据：`test_batch_import_allows_partial_parse_failure`。
- [x] **S4 source_path 不存在**：对应 item 为 `failed`，error code 为 `invalid_input`，其它 item 继续。证据：`test_missing_source_file_fails_item_and_continues_batch`。
- [x] **S5 invalid project**：`import_files` 返回 `invalid_input` 且不创建 batch。证据：`test_invalid_project_path_returns_invalid_input_without_batch`。
- [x] **S6 raw file checksum 去重**：同一内容重复导入返回同一 raw_resource，manifest 不追加重复 resource。证据：`test_repeated_raw_file_import_reuses_resource_without_manifest_duplicate`。
- [x] **S7 object_indices**：只登记指定对象。证据：`test_confirm_import_can_select_subset_of_parsed_objects`。
- [x] **S8 重复确认幂等**：重复 confirm 同一 item 不重复登记对象。证据：`test_repeated_confirm_does_not_register_duplicate_objects`。
- [x] **S9 invalid confirmation**：不存在 batch/item、未解析成功 item、越界 index 返回 `invalid_input`。证据：`test_confirm_invalid_selection_returns_invalid_input`。
- [x] **S10 warnings 保存**：parse warnings 保存到 ImportItem / ParsePreview。证据：`test_import_single_file_creates_parse_preview_and_confirm_registers_object`。
- [x] **S11 回归**：现有 fixture / registry / parser / graph / energy 行为保持。证据：`python3 -m unittest discover`。

前端改动：无。本 feature 不包含 UI、画布或报告预览，因此不需要浏览器验证。

## 4. 术语一致性

- `ImportRegistryWorkflow`：代码命中只在 `rxnflow/import_workflow.py` 和测试/文档中，命名一致。
- `ImportBatch` / `ImportItem` / `ParsePreview` / `ImportSelection`：代码命名和方案第 0 节一致。
- `Import Confirmation`：代码入口使用 `confirm_import`，和设计中的确认动作一致。
- 防冲突：`ReactionGraphService`、`EnergyProfileEngine`、`ExportArtifact`、`PNG`、`CDXML`、`Excel`、`click`、`FastAPI` 未出现在 `rxnflow/import_workflow.py`。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：已补 Import Registry Workflow、ImportBatch / ImportItem、ParsePreview 术语，并写入两阶段导入、部分失败和 raw resource 保留等系统级决定。
- [x] `codestable/architecture/core-platform.md`：已把当前能力从六类扩展为七类，新增 ImportRegistryWorkflow 模块职责、数据状态协议、错误语义和边界约束。
- [x] `AGENTS.md`：不需要更新。现有硬约束已覆盖核心解耦、parser 插件化、文件格式结构化读写和 UI 验证边界。

## 6. requirement 回写

- [x] `requirement: null` 保持不变。本 feature 只新增核心 API workflow 和 sidebar-ready 状态，没有真实 Web/CLI/sidebar 用户入口；用户可见导入能力应在后续 platform shell 或 graph editor workspace 落地时 backfill requirement。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-items.yaml`：`import-registry-workflow` 已从 `in-progress` 改为 `done`，feature 指向 `2026-05-04-import-registry-workflow`。
- [x] `codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-roadmap.md`：第 5 节子 feature 清单同步为 `done` 和对应 feature。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露新的环境、工具链、远端执行或反复容易踩的项目级协作规则。

## 9. 遗留

- ImportBatch / ParsePreview 当前只保存在内存里，跨进程恢复和 project state 持久化留给后续 feature。
- ChemicalObject 内容仍不写入 Project Manifest resource。
- 真实侧边栏、CLI 命令、Web route、桌面文件选择器和上传流程未实现。
- retry/reparse、手动指定格式、parser 升级后重新解析的交互流程未实现。
- 化学意义上的对象合并、构象筛选、重复构象判断、多自旋态/多构象管理未实现。
- ImportSelection 的 object index 选择已支持，但更细的 MAPLE trajectory/IRC/path 语义建模留给后续 parser/graph feature。
