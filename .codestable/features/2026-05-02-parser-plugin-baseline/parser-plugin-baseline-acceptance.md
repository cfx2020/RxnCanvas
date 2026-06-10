# parser-plugin-baseline 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-02
> 关联方案 doc：.codestable/features/2026-05-02-parser-plugin-baseline/parser-plugin-baseline-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查。

**接口示例逐项核对**：

- [x] XYZ 正常解析：`XyzPlugin.parse(RawFile(...water.xyz...))` 返回 `ok=True`，ParseResult provenance 指向 raw id，ChemicalObjectDraft geometry 元素和 `angstrom` 单位正确。证据：`tests/test_parser_plugin_baseline.py::test_standard_xyz_content_parses_geometry`。
- [x] 不支持格式：`ParserRegistry.default().parse(note.txt)` 返回 `unsupported_format`。证据：`test_registry_returns_unsupported_format_for_no_candidates`。
- [x] Gaussian/ORCA 基础字段：`GaussianLogPlugin` / `OrcaOutputPlugin` 通过 cclib adapter 输出 draft、provenance 和 hartree energy。证据：`test_gaussian_cclib_adapter_maps_basic_fields`、`test_orca_cclib_adapter_maps_basic_fields`。
- [x] MAPLE 多帧 XYZ：`MapleOutputPlugin` 对 `Image N` / `Frame N` 逐帧输出 ChemicalObjectDraft，energy 为 hartree。证据：`test_maple_multi_frame_xyz_parses_each_image`。

**名词层"现状 → 变化"逐项核对**：

- [x] RawFile / ParserCapability / ParseOptions / ParseResult / ParserPlugin：已在 `rxnflow.parsers.contracts` 落地。
- [x] ParserFormat：包含 `gaussian-log`、`orca-output`、`xyz`、`extxyz`、`maple-output`、`maple-xyz`、`unknown`。
- [x] ParserRegistry：已在 `rxnflow.parsers.registry` 落地，提供插件选择与 parse 统一入口。
- [x] Parser Plugin：已落地 XYZ/ASE、cclib Gaussian/ORCA、MAPLE 三类内置插件。

**流程图核对**：

- [x] RawFile → ParserRegistry.parse → can_parse → plugin.parse → ChemicalObjectDraft[] 的主流程已在 `ParserRegistry.parse` 中落地。
- [x] unsupported candidate、ambiguous candidate、invalid path、backend parse failure 分支均有 Result 错误落点和测试证据。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] Project Store raw file 可被表达为 RawFile 输入：`RawFile` 支持 id/name/path/content/mime_type/size。
- [x] Parser Registry 找候选插件：capability 排序和 expected format 过滤已落地。
- [x] 插件 parse 返回 `ChemicalObjectDraft[]`、provenance、warnings：ParseResult + Result warnings 已落地并有测试覆盖。
- [x] ParseResult 交给后续 Registry：parser 只输出 draft，不生成 ChemicalObject id。

**明确不做逐项核对**：

- [x] 不新增 UI/CLI/Web route/桌面文件选择器/批量导入 workflow：范围 grep 未命中新代码。
- [x] 不写 Project Manifest 或 Chemical Registry：parser 源码范围守护测试断言无 `ProjectStore` / `save_project` / `ChemicalObject(`。
- [x] 不生成 ReactionGraph、EnergyProfile、Report Export：范围守护测试覆盖。
- [x] 不运行 MAPLE、PyTorch、ML potential 或外部计算：范围守护测试覆盖 `subprocess`、`torch`。
- [x] 不把缺失数值字段静默填 0：缺失 energy 走 `missing_section` warning；测试覆盖标准 XYZ 缺失 energy。

**关键决策落地**：

- [x] Parser 输出 draft，不登记对象：ParseResult.objects 类型为 `ChemicalObjectDraft[]`。
- [x] Parser Registry 只做选择和编排：registry 不含格式解析逻辑。
- [x] Gaussian/ORCA 使用 cclib backend：`rxnflow.parsers.cclib_adapter` 隔离 cclib 读取和字段映射。
- [x] XYZ 支持标准 XYZ + ASE extxyz：标准 XYZ 轻量解析，extxyz 通过 ASE `read(..., format="extxyz")`。
- [x] MAPLE 独立插件：`rxnflow.parsers.maple` 识别 MAPLE banner 和 MAPLE 风格多帧 XYZ 注释。
- [x] 单位显式映射：`EV_TO_HARTREE` 常量已落地，cclib/ASE eV 转 hartree，MAPLE Hartree 直接入库。

**跨层纪律核对**：

- [x] 错误语义：unsupported/invalid_input/parse_failed 均有测试。
- [x] 幂等性：parser 不修改输入文件，只读 RawFile path/content。
- [x] 顺序约束：parser 不依赖 Project Store save 或 Chemical Registry register。
- [x] 扩展点：新增格式只需实现 ParserPlugin 并注册到 ParserRegistry。
- [x] 可观测点：ParseResult 必有 provenance；缺失/假设字段通过 warnings 表达。

**挂载点反向核对（可卸载性）**：

- [x] Parser contract：`rxnflow.parsers.contracts`。
- [x] Parser Registry：`rxnflow.parsers.registry`。
- [x] cclib adapter：`rxnflow.parsers.cclib_adapter`。
- [x] XYZ/ASE adapter：`rxnflow.parsers.xyz`。
- [x] MAPLE plugin：`rxnflow.parsers.maple`。
- [x] Parser tests：`tests/test_parser_plugin_baseline.py`。
- [x] 反向 grep：本 feature 引用集中在 `rxnflow/parsers/`、`rxnflow/constants.py` 和 parser 测试；没有接入 Project Store/Registry/UI。
- [x] 拔除沙盘推演：移除 `rxnflow/parsers/`、`EV_TO_HARTREE` 和 parser 测试后，系统退回 Project Store + fixture 状态；未落地的 Import Workflow 不受影响。

## 3. 验收场景核对

- [x] **S1**：标准 XYZ RawFile content → ChemicalObjectDraft geometry 正确，单位为 `angstrom`。
  - 证据来源：单测 `test_standard_xyz_content_parses_geometry`
  - 结果：通过
- [x] **S2**：ASE extxyz RawFile → 读取 geometry 和 energy metadata。
  - 证据来源：单测 `test_extxyz_parses_energy_metadata`
  - 结果：通过
- [x] **S3**：XYZ atom count 与坐标行不一致 → `parse_failed`。
  - 证据来源：单测 `test_xyz_atom_count_mismatch_returns_parse_failed`
  - 结果：通过
- [x] **S4**：Gaussian fixture → cclib adapter 输出 provenance 和基础字段。
  - 证据来源：单测 `test_gaussian_cclib_adapter_maps_basic_fields`
  - 结果：通过
- [x] **S5**：ORCA fixture → cclib adapter 输出 provenance 和基础字段。
  - 证据来源：单测 `test_orca_cclib_adapter_maps_basic_fields`
  - 结果：通过
- [x] **S6**：MAPLE sp `.out` fixture → 解析 task/model、geometry 和 Hartree energy。
  - 证据来源：单测 `test_maple_sp_output_parses_task_model_geometry_and_energy`
  - 结果：通过
- [x] **S7**：MAPLE 多帧 `.xyz` fixture → 每个 frame/image 输出 ChemicalObjectDraft，label 和 energy 正确。
  - 证据来源：单测 `test_maple_multi_frame_xyz_parses_each_image`
  - 结果：通过
- [x] **S8**：不支持文件 → `unsupported_format`。
  - 证据来源：单测 `test_registry_returns_unsupported_format_for_no_candidates`
  - 结果：通过
- [x] **S9**：多个高置信候选冲突 → ambiguous warning + `unsupported_format`。
  - 证据来源：单测 `test_registry_rejects_ambiguous_high_confidence_candidates`
  - 结果：通过
- [x] **S10**：RawFile path 不存在且没有 content → `invalid_input`。
  - 证据来源：单测 `test_registry_missing_path_returns_invalid_input`
  - 结果：通过
- [x] **S11**：cclib/adapter 抛错 → `parse_failed`，不泄漏 backend exception。
  - 证据来源：单测 `test_cclib_adapter_backend_exception_returns_parse_failed`
  - 结果：通过
- [x] **S12**：parse 成功但缺失可选字段 → `ok=True` 且 warning。
  - 证据来源：标准 XYZ 缺失 energy 测试断言 `missing_section`
  - 结果：通过
- [x] **S13**：parser 不修改 Project Manifest，不登记 ChemicalObject，不生成 Graph/Profile。
  - 证据来源：范围守护单测 `test_maple_parser_does_not_run_maple_or_project_store` + grep
  - 结果：通过

本 feature 无前端改动，无需浏览器验证。

## 4. 术语一致性

- Raw File：代码使用 `RawFile`，含义一致。
- Parser Plugin：代码使用 `ParserPlugin` Protocol 和内置 plugin class，含义一致。
- Parser Capability：代码使用 `ParserCapability`，含义一致。
- Parse Result：代码使用 `ParseResult`，含义一致。
- Parse Warning：代码使用 `RxnFlowWarning` 承载，含义一致。
- Gaussian Log Plugin / ORCA Output Plugin / XYZ Plugin / MAPLE Output Plugin：代码类名和 parser id 均保持一致。
- 防冲突：未发现 parser 术语与 Project Store、Registry、Graph、Energy Engine 混用。

## 5. 架构归并

- [x] `.codestable/architecture/core-platform.md`：已更新 Parser Plugins 当前能力、模块职责、数据状态、错误语义、单位转换和外部依赖边界。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已新增 Parser Plugin / Parse Result 等核心术语，并记录 cclib、ASE、MAPLE parser 的架构决定。

归并后，未读过 design 的读者可以从 architecture 中知道：系统现在有解析器插件协议、默认插件选择入口、Gaussian/ORCA cclib adapter、XYZ/extxyz adapter、MAPLE 输出解析插件，以及 parser 不写 Project Store/Registry 的边界。

## 6. requirement 回写

- [x] `requirement` 为空；本 feature 是核心 parser 服务能力，不是完整用户导入 workflow。暂不新增 requirement。
- [x] 后续 `import-registry-workflow` 做用户可见导入流程时，再从用户故事角度补 requirement。

## 7. roadmap 回写

- [x] `roadmap=rxnflow-core-platform`、`roadmap_item=parser-plugin-baseline` 字段完整。
- [x] `.codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-items.yaml` 已将 `parser-plugin-baseline` 更新为 `status: done`，`feature: 2026-05-02-parser-plugin-baseline`。
- [x] `.codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-roadmap.md` 主文档第 5 节已同步状态为 done。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 有候选，暂不擅自写入。
  - 候选 1：parser 测试依赖当前 Python 环境安装 `cclib` 和 `ase`；建议在后续 dependency/packaging 决策后写入 AGENTS.md 或依赖文件，而不是只写本地环境说明。

## 9. 遗留

- 后续优化点：
  - 用用户提供的真实 Gaussian/ORCA/MAPLE 文件扩展 fixture corpus。
  - MAPLE `.sum` 频率/热化学、AutoNEB tree `.json`、MD thermo 和 IRC/NEB path 语义需要独立 feature。
  - cclib/ASE 依赖需要在后续包管理/技术栈决策中固化。
- 已知限制：
  - cclib Gaussian/ORCA 测试当前用 fake cclib data 验证 adapter 映射，未提交真实 Gaussian/ORCA 输出 fixture。
  - extxyz energy 按 ASE SinglePointCalculator / metadata 的 eV 语义转换为 hartree。
  - MAPLE parser 只解析 `.out` 基础字段和 MAPLE 风格多帧 `.xyz` energy 注释。
- 实现阶段顺手发现：
  - 无。
