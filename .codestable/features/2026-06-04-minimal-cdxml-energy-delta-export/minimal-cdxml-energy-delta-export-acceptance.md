# minimal-cdxml-energy-delta-export 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-04
> 关联方案 doc：.codestable/features/2026-06-04-minimal-cdxml-energy-delta-export/minimal-cdxml-energy-delta-export-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `EnergyDiagramState`（rxnflow/export.py）：新增 `step_delta_value`、`correction_count`，保持 `relative_value`、`unit`、`missing_reason` 现有语义。
- [x] `CdxmlDiagramOptions`（rxnflow/export.py）：新增 `show_step_delta`、`show_correction_markers`、`show_missing_reason`，默认开启。
- [x] CDXML 文本口径：`_format_cdxml_energy_value` 输出 `{value} {unit}`，`_format_cdxml_step_delta` 输出 `dE +/-... {unit}`，missing marker 可包含 reason，correction marker 输出 `corr xN`。
- [x] CDXML metadata：`_cdxml_artifact_metadata` 输出 include flags、step delta count、correction marker count、missing point count，并由 `ExportArtifact.metadata` 合并 writer id、MIME、profile/path 等通用 metadata。

**名词层“现状 → 变化”逐项核对**：

- [x] `EnergyDiagramState`：变化已落在 route state annotation，不改 `EnergyProfile` / `EnergyPoint` dataclass，不把展示字段持久化到 profile snapshot。
- [x] `CdxmlDiagramOptions`：变化已落在 core writer options；Platform Shell 只透传 dict options，Web 可继续用默认值。
- [x] `_render_cdxml`：新增文本 marker，仍使用 ElementTree 生成 XML，labels/reasons 由 XML serializer escaping。
- [x] metadata：CDXML 增强只进入 artifact metadata，不改 `ExportArtifactRecord` schema。

**流程图核对**：

- [x] `Report Export Panel -> export.profile`：Web 仍调用 Shell command，未新增前端 writer。
- [x] `PlatformShell builds ExportRequest(..., options)`：`_run_export_profile` 和 fixture export 均透传 `_export_options_arg`。
- [x] `ReportExportService -> build_energy_diagram_route -> _render_cdxml`：route 派生 marker 数据，writer 只渲染。
- [x] `ShellArtifact -> Web displays/downloads/persists`：前端仍消费 artifact projection；本 feature 未改 Web schema。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 有效 state 保留结构名称和相对能量，且相对能量带单位；证据：`test_cdxml_export_includes_energy_delta_and_correction_markers`。
- [x] 相邻有效 state 显示 step delta；missing adjacency 不显示 delta；证据：route test 与 missing CDXML test。
- [x] correction expression 显示 marker；missing point 显示 reason；证据：CDXML marker tests。
- [x] `export.profile` / Report Export Panel 仍是唯一导出入口；证据：Platform Shell test、Web targeted tests。
- [x] `cdx` 仍 unsupported；CDXML 不包含 molecule-level atoms/bonds；证据：capability tests、scope guard grep。

**明确不做逐项核对**：

- [x] 不做 `.cdx` writer/converter：`cdx` 仍在 unsupported capability，`ALLOWED_EXPORT_FORMATS` 未包含 `cdx`。
- [x] 不做 molecule-level CDXML：scope guard 未发现 atoms/bonds/reaction scheme writer。
- [x] 不新增 Web 前端 CDXML writer：`web/src` 未新增 DOMParser/XMLSerializer/CDXML 拼接。
- [x] 不新增 `ExportFormat`：supported set 仍为 `png/cdxml/xlsx/csv/svg`。
- [x] 不改变 PNG/XLSX/CSV/SVG writer contract：full Python unittest 和 Web targeted tests 通过。
- [x] 不新增 Project Content / ExportArtifactRecord / Browser Project Repository schema：diff 未触碰对应 schema 文件。
- [x] 不把 missing relative energy 当作 0：missing point 不画 state line/connector，不跨 missing point 派生 delta。

**关键决策落地**：

- [x] 增强现有 `rxnflow-cdxml-energy-v1`，writer id 保持稳定；metadata 增加 feature flags。
- [x] step delta 位于 route/state annotation 层，CDXML writer 只消费 `EnergyDiagramRoute`。
- [x] CDXML 默认显示最小完整信息，options 只作为 core/shell 测试开关。
- [x] Web 仍只调用 `export.profile`，未导入 XML 库。
- [x] CDX scope guard 仍严格，unsupported 请求返回 `invalid_input target=formats`。

**编排层“现状 → 变化”逐项核对**：

- [x] `build_energy_diagram_route()` 记录 `step_delta_value`、`correction_count`、marker summary。
- [x] `_render_cdxml()` 写入 step delta、correction/missing marker 和带单位的相对能量。
- [x] Platform Shell 透传 dict options，不新增命令。
- [x] Web path 没有实现新 writer，下载和 persistence 继续使用 ShellArtifact bytes。

**跨层纪律核对**：

- [x] Energy authority：CDXML writer 不调用 Energy Engine，不重新计算 profile。
- [x] Missing semantics：missing point reset adjacency，不生成 y/state line/connector/delta。
- [x] XML safety：使用 ElementTree text 节点，测试覆盖 `<`、`&` label 后 XML 可解析。
- [x] Format boundary：CDXML supported，CDX unsupported。
- [x] Web isolation：Web 不构造 CDXML bytes。
- [x] Backward compatibility：无 options 的 `cdxml` export 仍可用。

**挂载点反向核对**：

- [x] Core Energy Diagram Route annotation：落点在 `rxnflow/export.py` 的 state/route/options/metadata。
- [x] Core CDXML writer rendering：落点在 `_render_cdxml` 和 CDXML formatting helpers。
- [x] Platform Shell export option passthrough：落点在 `rxnflow/platform.py` 的 `_run_export_profile`、fixture export 和 `_export_options_arg`。
- [x] Tests and docs：落点在 Python tests、Web targeted tests、architecture/requirements/dev/user docs。
- [x] 反向 grep：未发现清单外 Web writer、CDX converter、schema 改动。
- [x] 拔除沙盘推演：按上述挂载点逆向移除 helper/options/tests/docs 后 feature 可整体卸载；剩余仅为已通过 docs/roadmap 状态记录。

## 3. 验收场景核对

- [x] S1：三点 profile `[A=0.00, TS=12.50, B=4.20]` 导出 CDXML，文本包含结构名和 `0.00/12.50/4.20 kcal/mol`。证据：`test_cdxml_export_includes_energy_delta_and_correction_markers`。
- [x] S2：同一 profile 包含 `dE +12.50 kcal/mol` 和 `dE -8.30 kcal/mol`。证据：同上。
- [x] S3：第一 point 不显示 step delta。证据：`test_energy_diagram_route_derives_step_delta_and_correction_counts` 中第一 state 为 `None`。
- [x] S4：missing adjacency 不显示跨 missing `dE`，missing point 不画 state line/connector。证据：`test_cdxml_export_marks_missing_without_fake_lines_or_delta`。
- [x] S5：missing point 显示 `missing: missing_energy`，warnings 保留 missing energy path。证据：missing CDXML test 和既有 missing export baseline。
- [x] S6：corrections 长度为 2 显示 `corr x2`；无 expression 为 0。证据：route test 与 CDXML marker test。
- [x] S7：metadata 包含 writer id、MIME、path/profile ids 和 marker summary。证据：CDXML marker test、existing artifact metadata tests。
- [x] S8：`export.profile` shell command 返回 enhanced bytes；`include_bytes=false` 只返回 metadata。证据：`test_session_import_workspace_energy_and_profile_export` 扩展断言。
- [x] S9：Report Export Panel 不新增前端 writer；CDXML download/persistence 使用 ShellArtifact bytes。证据：Web targeted tests 与 scope guard grep。
- [x] S10：`cdx`、`pdf`、`pptx` 仍 unsupported。证据：Python export capability tests 与 Web capability tests。
- [x] S11：PNG/XLSX/CSV/SVG baseline 不变。证据：`python3 -m unittest discover` 和 Web targeted tests。
- [x] S12：CDXML text label XML escaping。证据：测试中 `TS <A & B>` 可由 ElementTree parse 并恢复文本。

本 feature 未修改前端视觉或交互代码；本阶段未新增浏览器肉眼验收项。

## 4. 术语一致性

- Minimal CDXML Energy Delta Export：只作为 feature/doc 名称出现，代码复用既有 CDXML writer 名称。
- CDXML Energy Delta Label：代码使用 `step_delta_value` / `dE`，与方案一致。
- CDXML Correction Marker：代码使用 `correction_count` / `corr xN`，与方案一致。
- CDXML Missing Marker：代码使用 `missing_reason` / `missing: {reason}`，与方案一致。
- CDXML-only Boundary：`cdx` 仍 unsupported，未新增 converter。
- 防冲突：grep 未发现 Web CDXML writer、CDX converter 或 schema 新概念。

## 5. 架构归并

- [x] `.codestable/architecture/core-platform.md`：已记录 Energy Diagram Route 派生 step delta/correction/missing marker，以及 CDXML writer 输出 label/value/dE/missing/correction marker。
- [x] `.codestable/architecture/web-workbench.md`：已记录 Web 只消费 core writer 的 ShellArtifact bytes，不解析/生成 CDXML。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已同步架构总览中的 CDXML/route 现状，避免总入口仍停留在旧描述。
- [x] `AGENTS.md`：无新增必须进入项目硬约束的内容；现有 Web 预览和导出边界规则足够。

## 6. requirement 回写

- [x] `requirement: web-workbench-shell` 已更新：新增 ChemDraw CDXML 用户故事，并补当前边界说明：CDXML artifact 由 core writer 生成，包含结构名称、relative value + unit、相邻 `dE`、missing reason 和 `corr xN` marker；Web 不生成 CDXML bytes，也不重算 marker。

## 7. roadmap 回写

- [x] `roadmap: rxnflow-workspace-first-canvas-mvp`
- [x] `roadmap_item: minimal-cdxml-energy-delta-export`
- [x] `rxnflow-workspace-first-canvas-mvp-items.yaml` 已从 `in-progress` 改为 `done`，feature id 保持 `2026-06-04-minimal-cdxml-energy-delta-export`。
- [x] `rxnflow-workspace-first-canvas-mvp-roadmap.md` 第 5 节子 feature 清单已同步为 `done`，并补上对应 feature id 和 CDXML 当前口径。
- [x] YAML 已通过校验。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 未暴露每个 feature 都会重复踩的环境、工具或工作流类新信息。

## 9. 遗留

- 后续优化点：ChemDraw `.cdx` binary、molecule-level CDXML、atoms/bonds/reaction scheme 仍是明确未来范围，不在本 feature 内。
- 已知限制：当前 CDXML 是最小能量图对象和文本标注，不包含真实分子结构编辑语义；需要 CDX 时仍需用户在 ChemDraw 中打开 CDXML 后另存。
- 实现阶段顺手发现：无。

## 验证记录

- `python3 -m unittest tests.test_report_export_baseline tests.test_platform_shell_baseline`：通过。
- `python3 -m unittest discover`：通过。
- `cd web && npm run test -- WorkbenchShell.test.tsx ShellClient.test.ts exportArtifactPersistence.test.ts exportFormatCapabilities.test.ts`：通过。
- `cd web && npm run build`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-06-04-minimal-cdxml-energy-delta-export/minimal-cdxml-energy-delta-export-checklist.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-workspace-first-canvas-mvp/rxnflow-workspace-first-canvas-mvp-items.yaml --yaml-only`：通过。
- `git diff --check`：通过。
