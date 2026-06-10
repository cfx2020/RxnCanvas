# project-storage-model 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-02
> 关联方案 doc：.codestable/features/2026-05-02-project-storage-model/project-storage-model-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查。

**接口示例逐项核对**：

- [x] `ProjectStore.create_project(name, location)` 正常路径：输入项目名和目录路径，返回 `schema_version=project-v1` 的 `ProjectManifest`，并创建 `.rxnflow/manifest.json` 与 `inputs/raw/`。证据：`tests/test_project_storage_model.py::test_create_project_writes_manifest_and_raw_directory`。
- [x] `ProjectStore.add_raw_file(project_path, source_path)` 正常路径：复制源文件到 `inputs/raw/<sha-prefix>-<source-name>`，返回 `kind=raw_file`、`checksum=sha256:*`、项目相对 path 的 `ProjectResource`。证据：`tests/test_project_storage_model.py::test_add_raw_file_copies_file_and_registers_relative_resource`。
- [x] `ProjectStore.load_project(project_path)` 错误路径：非项目目录返回 `ok=False`、`error.code=invalid_input`、`target` 指向缺失 manifest。证据：`tests/test_project_storage_model.py::test_load_non_project_directory_returns_invalid_input`。

**名词层"现状 → 变化"逐项核对**：

- [x] `ProjectManifest`：继续复用 `rxnflow.models.ProjectManifest`，新增 `project-v1` JSON 序列化/反序列化边界。
- [x] `ProjectResource`：继续复用 `rxnflow.models.ProjectResource`，序列化时校验 path 只能为项目相对路径。
- [x] `ProjectStore`：已在 `rxnflow.project.ProjectStore` 落地 create/load/save/add raw file 四个核心入口。
- [x] 内存 helper：`rxnflow.project.create_project` 和 `attach_resources` 保留，fixture slice 行为不变。

**流程图核对**：

- [x] create workflow：`mkdir project/.rxnflow` + `mkdir inputs/raw` → 构造 manifest → 原子写 manifest → 返回 manifest。
- [x] add raw file workflow：load manifest → 校验 source file → sha256 → checksum 去重 → copy → append resource → save manifest。
- [x] manifest missing/corrupt/schema mismatch/source missing 分支均有 Result 错误落点和测试证据。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 创建项目目录并写入 manifest：通过单测覆盖。
- [x] 从项目目录加载 manifest：通过 `test_create_then_load_returns_equivalent_manifest` 覆盖。
- [x] 保存更新后的 manifest：通过 `test_save_preserves_updated_resources` 覆盖。
- [x] 复制 raw file 并登记 `raw_file` resource：通过 `test_add_raw_file_copies_file_and_registers_relative_resource` 覆盖。

**明确不做逐项核对**：

- [x] 不新增 SQLite、SQLAlchemy 或数据库 migration：grep 未命中新代码。
- [x] 不新增 Gaussian/ORCA/XYZ parser：grep 命中仅来自 design/checklist 的反向核对文本。
- [x] 不新增 CLI、Web route、桌面文件选择器或 UI 组件：grep 未命中新代码。
- [x] Manifest 不保存源文件绝对路径：resource path 为 `inputs/raw/...`，metadata 只记录 `source_name` 和 `byte_size`。
- [x] 不持久化 ChemicalObject、ReactionGraph、EnergyProfile 完整内容：本 feature 只新增 Project Store 与 manifest/resource 序列化。

**关键决策落地**：

- [x] manifest 使用 JSON：`.rxnflow/manifest.json` 由 Python `json` 标准库读写。
- [x] 项目私有元数据放在 `.rxnflow/`，raw file 副本放在 `inputs/raw/`。
- [x] resource path 只存项目相对 POSIX 路径，反序列化拒绝绝对路径和 `..`。
- [x] raw file 用 sha256 去重，重复添加返回已有 resource。
- [x] schema_version 固定为 `project-v1`，不兼容版本返回 `invalid_input`。
- [x] Project Store API 返回 `Result`，外部路径和 I/O 错误不向调用方暴露未分类异常。

**跨层纪律核对**：

- [x] 错误语义：manifest 缺失、损坏 JSON、schema 不兼容、source missing 都返回 Result。
- [x] 幂等性：相同 checksum 的 raw file 重复添加不追加重复 resource。
- [x] 路径安全：manifest resource path 不能是绝对路径、空路径、`.` 或包含 `..`。
- [x] 顺序约束：`add_raw_file` 先 load manifest，再 copy，再 save。
- [x] 可观测点：manifest JSON 可人工查看，raw resource metadata 记录原文件名和字节数。

**挂载点反向核对（可卸载性）**：

- [x] Manifest 文件位置：`rxnflow.project.RXNFLOW_DIR` + `MANIFEST_NAME`。
- [x] Raw file 目录：`rxnflow.project.RAW_INPUT_DIR`。
- [x] Project Store 入口：`rxnflow.project.ProjectStore`。
- [x] Schema version：`rxnflow.project_manifest.PROJECT_SCHEMA_VERSION`。
- [x] 反向 grep：本 feature 代码引用集中在 `rxnflow/project.py`、`rxnflow/project_manifest.py` 和 `tests/test_project_storage_model.py`，没有额外产品入口。
- [x] 拔除沙盘推演：移除 `ProjectStore`、manifest 序列化 helper 和对应测试后，系统退回 fixture-only 内存 project helper；不影响 parser/UI/export 等未落地模块。

## 3. 验收场景核对

- [x] **S1**：输入项目名和空临时目录路径 → 创建 `.rxnflow/manifest.json`、`inputs/raw/`，返回 `schema_version=project-v1`。
  - 证据来源：单测 `test_create_project_writes_manifest_and_raw_directory`
  - 结果：通过
- [x] **S2**：创建项目后调用 load → 返回与 manifest 内容等价的 ProjectManifest。
  - 证据来源：单测 `test_create_then_load_returns_equivalent_manifest`
  - 结果：通过
- [x] **S3**：修改 ProjectManifest resources 后 save，再 load → resources 更新被保留。
  - 证据来源：单测 `test_save_preserves_updated_resources`
  - 结果：通过
- [x] **S4**：添加一个 raw file → 文件被复制到 `inputs/raw/`，manifest 增加一条 `kind=raw_file` resource，resource path 为项目相对路径。
  - 证据来源：单测 `test_add_raw_file_copies_file_and_registers_relative_resource`
  - 结果：通过
- [x] **S5**：重复添加同一内容 raw file → 返回同一 checksum 的已有 resource，manifest 不增加重复条目。
  - 证据来源：单测 `test_add_same_raw_file_is_idempotent`
  - 结果：通过
- [x] **S6**：load 非项目目录 → 返回 `invalid_input`，target 指向缺失 manifest。
  - 证据来源：单测 `test_load_non_project_directory_returns_invalid_input`
  - 结果：通过
- [x] **S7**：load 损坏 manifest JSON → 返回 `invalid_input`，不得抛 JSONDecodeError 给调用方。
  - 证据来源：单测 `test_load_corrupt_manifest_returns_invalid_input`
  - 结果：通过
- [x] **S8**：load schema_version 不是 `project-v1` 的 manifest → 返回 `invalid_input`，不得尝试 silent migration。
  - 证据来源：单测 `test_load_incompatible_schema_returns_invalid_input`
  - 结果：通过
- [x] **S9**：add raw file 的 source_path 不存在或不是普通文件 → 返回 `invalid_input`。
  - 证据来源：单测 `test_add_raw_file_missing_source_returns_invalid_input`
  - 结果：通过
- [x] **S10**：现有 `run_core_fixture_vertical_slice()` 行为不变。
  - 证据来源：`python3 -m unittest discover` 全量 20 tests 通过
  - 结果：通过

本 feature 无前端改动，无需浏览器验证。

## 4. 术语一致性

- Project Store：代码入口为 `ProjectStore`，含义一致。
- Project Directory：代码以 `project_path` / `root` 表示项目根目录，含义一致。
- Project Manifest：代码使用 `ProjectManifest` 与 `.rxnflow/manifest.json`，含义一致。
- Project Resource：代码使用 `ProjectResource`，含义一致。
- Raw File Resource：resource kind 固定为 `raw_file`，含义一致。
- 防冲突：未发现同名 parser、UI store、database store 或 shell 入口。

## 5. 架构归并

- [x] `.codestable/architecture/core-platform.md`：已更新 Project Store 当前能力、目录协议、模块职责、数据状态和错误边界。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已更新子系统索引和关键架构决定，把 Project Directory、`.rxnflow/manifest.json`、`project-v1` 与 raw file checksum 去重写入当前状态。

归并后，未读过 design 的读者可以从 architecture 中知道：系统现在已有可落盘项目目录协议、manifest 文件位置、raw file 资源目录、Project Store API 和持久化边界。

## 6. requirement 回写

- [x] `requirement` 为空；本 feature 是核心服务能力，不是完整用户 workflow。暂不新增 requirement。
- [x] 后续导入 workflow、项目侧边栏或 CLI/Web 壳层启动时，再从用户故事角度补 requirement。

## 7. roadmap 回写

- [x] `roadmap=rxnflow-core-platform`、`roadmap_item=project-storage-model` 字段完整。
- [x] `.codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-items.yaml` 已将 `project-storage-model` 更新为 `status: done`，`feature: 2026-05-02-project-storage-model`。
- [x] `.codestable/roadmap/rxnflow-core-platform/rxnflow-core-platform-roadmap.md` 主文档第 5 节已同步状态为 done。
- [x] YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新环境、工具或工作流约定。既有测试和 YAML 校验命令已在 AGENTS.md 中。

## 9. 遗留

- 后续优化点：
  - 后续 migration feature 需要定义 `project-v2+` 的升级策略。
  - 后续 parser feature 应把 raw file resource 作为解析入口，而不是重新发明文件索引。
  - 后续对象/图谱/profile 持久化 feature 需要在 manifest resource index 之外定义具体内容文件格式。
- 已知限制：
  - 当前只持久化 manifest 和 raw file resource，不持久化 ChemicalObject、ReactionGraph、EnergyProfile。
  - 当前只支持 `project-v1`，遇到其他 schema version 会拒绝加载。
  - 当前没有 CLI/Web/Desktop 壳层入口。
- 实现阶段顺手发现：
  - 无。
