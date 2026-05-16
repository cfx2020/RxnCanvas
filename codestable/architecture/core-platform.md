---
doc_type: architecture
slug: core-platform
status: current
created: 2026-05-02
last_reviewed: 2026-05-16
tags: [core, fixture, domain-model, energy-profile, energy-profile-persistence, import-workflow, graph-editor-workspace, report-export, platform-shell, cli, project-content, project-content-validation, migration, chemical-object-persistence, reaction-graph-workspace-persistence, import-ledger-persistence, export-artifact-index-persistence, project-bundle, browser-storage, parser-fixture-harness, xyz-extxyz-fixture-coverage, gaussian-cclib-fixture-coverage, orca-cclib-fixture-coverage, maple-fixture-coverage, parser-support-matrix-diagnostics, parser-corpus-docs, import-preview-parser-regression]
---

# Core Platform

## 1. 当前能力

RxnFlow 当前已经落地十三类核心能力。

第一类是内置 fixture 的最小核心链路：

1. 创建内存 ProjectManifest。
2. 将两个内置 ChemicalObjectDraft 登记为 ChemicalObject。
3. 构造两个 species 节点、一条边和一条 path 的 ReactionGraph。
4. 使用 `electronic` 能量键计算以第一个节点为基线的 EnergyProfile。

第二类是可落盘的 Project Store 项目目录协议：

1. 创建 Project Directory。
2. 写入 `.rxnflow/manifest.json`。
3. 创建 `inputs/raw/` 作为 raw file 副本目录。
4. 加载和保存 `project-v1` ProjectManifest。
5. 将外部 raw file 复制进项目目录，并在 manifest 中登记 `raw_file` ProjectResource。

第三类是 Parser Plugins 基线：

1. 使用 RawFile / ParserCapability / ParseOptions / ParseResult / ParserPlugin 定义插件协议。
2. 通过 ParserRegistry 对单个 RawFile 做插件选择、冲突处理和 parse 调用。
3. 用 cclib adapter 支持 Gaussian log 和 ORCA output 的基础字段映射。
4. 支持标准 XYZ 和 ASE extxyz 的结构与可用 metadata 解析。
5. 支持 MAPLE `.out` 基础字段和 MAPLE 风格多帧 `.xyz` energy 注释解析。
6. 配套测试侧 Parser Fixture Harness，使用 `parser-fixtures-v1` manifest、`parser-support-matrix-v1` support matrix、synthetic MAPLE sp/opt `.out`、synthetic MAPLE path `.xyz` partial、synthetic Gaussian cclib `.log`、synthetic ORCA cclib `.out`、standard XYZ、ASE extxyz、bad XYZ count 输入和 `parser-golden-v1` snapshot 验证 ParserRegistry 输出稳定性与 fixture-backed 支持边界。
7. 配套 `docs/dev/parser-fixture-corpus.md` 开发者指南，说明新增样例、source policy、脱敏、snapshot 更新、support matrix / diagnostic codes、import preview regression 和 parser gap triage。

第四类是 Chemical Registry 基线：

1. 接收 `ParseResult(ChemicalObjectDraft[], provenance)` 并登记为项目内 ChemicalObject。
2. 按 project id 隔离 ChemicalObject 状态，并提供 object id 查询和对象列表 snapshot。
3. 使用 registry fingerprint 保证同项目内同来源、同 draft 内容的重复登记幂等，并把 fingerprint 保存到 ChemicalObject。
4. 支持追加 resonance、solvation、manual 三类 append-only Correction。
5. 对 correction id 做幂等和冲突检测。
6. 支持从已持久化 ChemicalObject 恢复 registry objects map 和 fingerprint index。

第五类是 Import Registry Workflow：

1. 通过 ImportRegistryWorkflow 编排 ProjectStore、ParserRegistry 和 ChemicalRegistry。
2. `import_files` 接收单文件或批量 ImportFileRequest，把 source file 复制为项目内 raw file resource。
3. raw resource 会被转换为 ParserRegistry 可读的 RawFile，并形成等待确认的 ParsePreview。
4. `confirm_import` 按 ImportSelection 登记全部或指定 object indices 的 ChemicalObject。
5. ImportBatch / ImportItem 保留 source_path、raw_resource、preview、warnings、error 和 registered_object_ids，供后续 sidebar 或 agent 读取。
6. 支持从已持久化 ImportBatch 恢复 batch state，恢复后可继续 list/get batch 或确认 pending preview。
7. 配套测试侧 import preview parser regression，使用 parser fixture corpus 验证 `import_files` 和 platform shell `import.preview` 保留 parser_id、parser_version、object_count、warnings、expected failure error code 和 raw_resource/provenance linkage。

第六类是 Reaction Graph 协议：

1. 使用 GraphPatch 定义 UI 和 agent 共用的图谱修改操作。
2. 通过 ReactionGraphService 创建项目内空 ReactionGraph。
3. 支持 add/update node、add/update edge、remove 和 set_path patch。
4. 支持同一 graph 保存多条 ReactionPath，用多路径表达分叉。
5. 校验 node/object/edge/path 引用，patch 批次失败时不写回 graph state。
6. 支持列出和恢复项目内 ReactionGraph，恢复后可继续 list_paths 和 apply_patch。

第七类是 Graph Editor Workspace：

1. 通过 GraphEditorWorkspaceService 打开或创建围绕 ReactionGraph 的 headless 编辑 workspace。
2. 从调用方传入的 ChemicalObject 或已 registered 的 ImportItem 生成 Object Palette。
3. 将 add_node、connect_nodes、set_active_path 和 apply_patches 转换为 GraphPatch，并交由 ReactionGraphService 写入 graph state。
4. 在 workspace state 中维护 CanvasViewport、WorkspaceSelection 和 active_path_id，不写入 ReactionGraph。
5. 从当前 graph 派生 NetworkPreview，包含 nodes、edges、paths、active path、disconnected node diagnostics 和 warnings。
6. 支持列出和恢复项目内 WorkspaceSnapshot，恢复时保留 selection、viewport、active_path_id 和 updated_at，并重新派生 Object Palette / NetworkPreview。

第八类是 Energy Engine：

1. 通过 EnergyProfileEngine 从指定 ReactionGraph / ReactionPath 和 ChemicalObject 集合计算 EnergyProfile。
2. 支持 `hartree`、`kcal_mol`、`kj_mol` 输入，并统一输出为 `kcal_mol` 或 `kj_mol`。
3. 支持多对象节点按隐含系数 1 求和。
4. 通过 `include_corrections` 显式控制是否叠加 ChemicalObject 上的 Correction.energy。
5. baseline 缺失能量时返回 `missing_energy`；非 baseline 缺失点保留为带 `missing_reason` 的 EnergyPoint 和 warning。

第九类是 Report Export：

1. 通过 ReportExportService 把已加载的 ReactionGraph / EnergyProfile / ChemicalObject / table_rows 导出为 ExportArtifact。
2. 支持 `png` energy plot、`cdxml` ChemDraw 可编辑能量图和 `xlsx` 结构能量 workbook。
3. 使用 structure-first 的 Energy Table，第一列固定为结构名称；缺失字段留空或保留 missing reason。
4. PNG 和 CDXML 共用 Energy Diagram Route；missing point 形成断点和 warning，不编造相对能量。
5. 支持 bytes-only 返回，也支持写入已有 destination_dir 并返回 artifact.path。

第十类是 Platform Shell：

1. 通过 ShellCommand、ShellResponse、ShellArtifact 和 PlatformSession 定义端侧 JSON-safe 命令协议。
2. 通过 AppKernel 集中装配 ProjectStore、ProjectContentStore、ProjectBundleService、ParserRegistry、ChemicalRegistry、ImportRegistryWorkflow、ReactionGraphService、GraphEditorWorkspaceService、EnergyProfileEngine 和 ReportExportService。
3. 通过 PlatformShellService.run 分发 `fixture.run`、`project.create`、`project.load`、`project.open`、`project.save_content`、`project.export_bundle`、`project.import_bundle`、`import.preview`、`import.register_all`、`workspace.open`、`workspace.add_node`、`workspace.connect`、`workspace.set_path`、`energy.compute` 和 `export.profile`。
4. 通过 `python3 -m rxnflow.cli` 提供标准库 CLI 入口，支持 fixture、project create/load/open、project export-bundle/import-bundle 和 import preview 的 JSON 输出与错误 exit code；CLI project open 支持默认恢复 content 和 `--manifest-only`。
5. 通过 handle_platform_payload 提供纯 Python dict adapter，供未来 Web route 或 desktop bridge 复用。

第十一类是 Project Content Store：

1. 通过 ProjectContentIndex、ProjectContentFile 和 ProjectContentSnapshot 定义 `.rxnflow/state/` 下的项目内容快照协议。
2. 通过 ProjectStorageBackend 定义按项目相对 path 读写 bytes 的后端协议。
3. 通过 LocalProjectStorageBackend 把 logical path 映射到本地项目目录，写入时返回 checksum、byte_size 和 backend_id。
4. 通过 ProjectContentStore.save_snapshot / load_snapshot / load_index 保存和加载 ProjectContentSnapshot。
5. 通过 `chemical-objects-v1` codec 保存和加载真实 ChemicalObject、provenance、registry fingerprint 和 append-only corrections。
6. 通过 `reaction-graphs-v1` codec 保存和加载真实 ReactionGraph、ReactionNode、ReactionEdge 和 ReactionPath，并校验 object/node/edge/path 引用。
7. 通过 `workspaces-v1` codec 保存和加载 workspace-only 状态，workspace 的 Object Palette 和 NetworkPreview 在加载后从 ChemicalObject / ReactionGraph 派生。
8. 通过 `import-ledger-v1` codec 保存和加载 ImportBatch、ImportItem、ParsePreview、registered ids、warnings 和 errors。
9. 通过 `energy-profiles-v1` codec 保存和加载已计算 EnergyProfile、EnergyOptions、EnergyPoint、missing reason 和 warnings，并校验 profile 与 loaded ReactionGraph / ReactionPath 的引用一致性。
10. 通过 `export-artifacts-v1` codec 保存和加载 ExportArtifactRecord 索引，记录导出文件的项目相对 path、format、checksum、metadata 和 created_at，不保存 artifact bytes。
11. 通过 ProjectContentValidationIssue / ProjectContentValidationReport 聚合 `.rxnflow/state/` index、section bytes checksum、section codec、跨 section 引用和 export artifact file checksum 的只读验证结果。
12. 通过 ProjectContentValidator 和 ProjectContentStore.validate_project 生成 validation report；内容不一致进入 report issues，backend internal I/O failure 仍返回 Result error。
13. 通过 ProjectContentMigrationPlan 和 ProjectContentStore.migration_plan 提供显式 schema migration plan；当前 `project-content-v1 -> project-content-v1` 为 no-op，未知 source/target 返回 unsupported issue，load_snapshot 不做 silent migration。

第十二类是 Project Bundle：

1. 通过 ProjectBundleSummary 描述项目包路径、项目路径、project id、root name、file count、byte size、bundle checksum 和 validation summary。
2. 通过 ProjectBundleService.export_bundle 把本地 Project Directory 打成 `.rxnflow.zip`。
3. Bundle export 只包含 `.rxnflow/`、`inputs/raw/` 和 `exports/`，跳过 `.DS_Store` 等系统元数据，不打包项目根散落文件。
4. 当 `.rxnflow/state/project-content.json` 存在时，bundle export/import 会调用 ProjectContentStore.validate_project；validation error 阻止输出最终 bundle 或落地导入项目，warning 透传给调用方。
5. 通过 ProjectBundleService.import_bundle 从 `.rxnflow.zip` 导入新的 Project Directory；导入前校验 zip entry 安全路径、唯一 Bundle Root 和 `<root>/.rxnflow/manifest.json`。
6. 第一版 import 只支持 `fail_if_exists` conflict policy；目标项目目录已存在时失败，不覆盖、不合并、不自动改名。

第十三类是 Browser Local Storage Backend：

1. 通过 BrowserLocalProjectStorageBackend 提供面向 IndexedDB / OPFS 方向的 ProjectStorageBackend 核心协议测试替身。
2. Browser backend 把 project_ref 解释为 opaque origin-local project key，不解释为本地文件系统路径，并按 project_ref 隔离对象。
3. 支持 read_object、write_object、exists、list_objects 和 delete_object；object path 仍沿用项目相对 POSIX path 规则。
4. write_object 返回 sha256 checksum、byte_size、updated_at 和 backend_id；read_object 返回 bytes、checksum 和 metadata。
5. list_objects 支持 exact file 和 prefix subtree 语义，并按 POSIX path 稳定排序。
6. 支持 quota_bytes 模拟浏览器本地空间不足；超限返回 storage_quota_exceeded，失败写入不部分覆盖已有对象。

这些能力仍不提供真实图形 UI、Web route、桌面 app 或安装包。当前 CLI 是最小可测试端侧入口；Web payload adapter 只是 dict 边界，不是服务器。fixture 链路仍是开发/测试用垂直切片；Project Store 只负责项目目录、manifest 和 raw file 资源索引；Project Content Store 当前保存/加载 ProjectContentSnapshot，并对 ChemicalObject、ReactionGraph、Workspace、Import Ledger、EnergyProfile 和 ExportArtifact index sections 提供长期持久化 codec、只读 validation report 和 no-op migration plan，不替代 Project Store 或完整项目数据库；Project Bundle 只复制项目文件作为本地备份/手动同步包，不替代 live storage、不自动保存当前 session、不恢复运行态；Browser Local Storage Backend 是核心协议测试替身，不是真实 JavaScript IndexedDB / OPFS adapter、云同步或可靠备份；Parser Plugins 只把 RawFile 解析为 ChemicalObjectDraft；Parser Fixture Harness 只存在于测试边界，当前覆盖 synthetic MAPLE sp/opt `.out`、synthetic MAPLE path `.xyz` partial、synthetic Gaussian cclib、synthetic ORCA cclib、standard XYZ、ASE extxyz 和 bad XYZ expected-error 样例，并通过 `support-matrix.yaml` 记录 fixture-backed 字段状态、known limits、diagnostic catalog 和 MAPLE reference-only artifacts；它不进入 `rxnflow.parsers` runtime API，不调用 Project Store、Import Workflow、Chemical Registry、Reaction Graph、Energy Engine 或 Report Export；Parser Corpus Developer Guide 只记录维护 fixture corpus 的开发者/agent 流程，不新增 runtime API、fixture 或用户可见导入能力；Import Preview Parser Regression 也只存在于测试边界，用 fixture corpus 验证 Import Workflow / Platform Shell 的 preview 投影保真，不确认导入、不登记 ChemicalObject、不新增 runtime API；Chemical Registry 只登记、列出、恢复对象和追加校正项；Import Registry Workflow 只编排导入、解析预览、确认登记和 batch 状态恢复；Reaction Graph 只维护节点、边、路径、patch 操作和运行态恢复，不计算能量；Graph Editor Workspace 只提供 headless 编辑会话、对象面板、workspace-only 状态、网络预览和运行态恢复协议，不渲染真实画布；Energy Engine 只读取传入 graph/object 数据并生成 profile 数据，不修改项目状态；Energy Profile Persistence 只保存物化 profile snapshot，不重新计算或修复 stale profile；Report Export 只消费调用方传入的已加载对象，不读写 manifest、不登记 ProjectResource、不调用 parser/import/registry/graph patch/energy compute；Export Artifact Index 只登记已存在导出文件的项目相对位置和元数据，不生成或复制 artifact bytes，artifact bytes 深校验由 Project Content Validation 只读执行；Platform Shell 只装配和投影这些核心能力，不复制业务逻辑，`project.open`/`project.save_content` 只是恢复和保存运行态服务状态的壳层编排，`project.export_bundle`/`project.import_bundle` 只是项目包传输编排。

## 2. 模块与职责

```
run_core_fixture_vertical_slice
├── project.create_project
├── registry.register_fixture_objects
├── graph.build_fixture_graph
└── energy.compute_fixture_profile

ProjectStore
├── create_project
├── load_project
├── save_project
└── add_raw_file

ParserRegistry
├── can_parse over ParserPlugin[]
├── select plugin by confidence
├── plugin.parse(RawFile)
└── ParseResult(ChemicalObjectDraft[], provenance)

ParserFixtureHarness (tests only)
├── tests/fixtures/parsers/manifest.yaml
├── tests/fixtures/parsers/support-matrix.yaml
├── docs/dev/parser-fixture-corpus.md maintenance guide
├── tests/fixtures/parsers/files/{maple,gaussian,orca,xyz,extxyz}/ synthetic inputs
├── tests/fixtures/parsers/snapshots/*.json success and expected-error snapshots
├── ParserFixtureManifest / ParserFixture test dataclasses
├── ParserSupportMatrix / ParserSupportMatrixEntry / ParserDiagnosticCatalog test dataclasses
├── RawFile(path=fixture.file) + ParseOptions projection
├── ParserRegistry.default().parse
├── parser-golden-v1 snapshot assertion with energy/coordinate tolerances
└── parser-support-matrix-v1 validation for fixture ids, field statuses, diagnostic codes and partial known_limits

ChemicalRegistry
├── register(project_id, ParseResult)
├── get_object(project_id, object_id)
├── list_objects(project_id)
├── restore_objects(project_id, ChemicalObject[], replace=False)
└── apply_correction(project_id, object_id, Correction)

ImportRegistryWorkflow
├── import_files(project_path, ImportFileRequest[])
├── confirm_import(project_id, batch_id, ImportSelection[])
├── get_batch(project_id, batch_id)
├── list_batches(project_id)
├── restore_batches(project_id, ImportBatch[], object_ids?, replace=False)
└── tests/test_import_preview_parser_regression.py fixture-backed preview fidelity tests

ReactionGraphService
├── create_graph(project_id, label?)
├── apply_patch(project_id, graph_id, GraphPatch[], object_ids?)
├── list_paths(project_id, graph_id)
├── list_graphs(project_id)
└── restore_graphs(project_id, ReactionGraph[], object_ids?, replace=False)

GraphEditorWorkspaceService
├── open_workspace(project_id, graph_id?, label?, objects?)
├── add_node(project_id, workspace_id, NodePlacement)
├── connect_nodes(project_id, workspace_id, from_node_id, to_node_id)
├── set_active_path(project_id, workspace_id, path_id, node_ids)
├── apply_patches(project_id, workspace_id, GraphPatch[])
├── select(project_id, workspace_id, WorkspaceSelection)
├── set_viewport(project_id, workspace_id, CanvasViewport)
├── snapshot(project_id, workspace_id)
├── list_workspaces(project_id)
└── restore_workspaces(project_id, WorkspaceSnapshot[], objects=(), replace=False)

EnergyProfileEngine
└── compute_profile(project_id, graph, path_id, objects, options)

ReportExportService
├── export(project_id, ExportRequest)
├── build_energy_table_rows(objects, profile, table_rows)
├── build_energy_diagram_route(profile, options?)
├── PNG energy plot writer
├── CDXML energy diagram writer
└── XLSX energy workbook writer

PlatformShellService
├── run(ShellCommand)
├── fixture/project/import/workspace/energy/export command handlers
├── project.open validation-gated restore
├── project.save_content session snapshot save
├── project.export_bundle/project.import_bundle bundle transfer
├── ShellResponse JSON-safe projection
├── handle_platform_payload(dict)
└── rxnflow.cli argparse entry

ProjectContentStore
├── save_snapshot(project_ref, ProjectContentSnapshot)
├── load_snapshot(project_ref)
├── load_index(project_ref)
├── validate_project(project_ref)
├── migration_plan(project_ref, target_schema_version="project-content-v1")
├── ProjectContentValidator
├── chemical-objects-v1 codec
├── reaction-graphs-v1 codec
├── workspaces-v1 codec
├── import-ledger-v1 codec
├── energy-profiles-v1 codec
├── export-artifacts-v1 codec
├── LocalProjectStorageBackend read/write/exists/list/delete
└── project_content_snapshot_from_fixture(CoreFixtureResult)

BrowserLocalProjectStorageBackend
├── read_object/write_object/exists/list_objects/delete_object
├── origin-local project_ref isolation
├── metadata index and payload store test double
├── sha256 checksum receipts
└── quota_bytes failure modeling

ProjectBundleService
├── export_bundle(project_path, destination_path)
├── import_bundle(bundle_path, destination_dir, conflict_policy="fail_if_exists")
├── zip entry path validation
├── optional ProjectContentStore.validate_project gate
└── ProjectBundleSummary JSON-safe data
```

- `rxnflow.models`：核心值对象，包括 ProjectManifest、ChemicalObject、ReactionGraph、EnergyProfile、Result 相关承载类型。
- `rxnflow.project`：内存项目 manifest helper，以及文件系统 Project Store workflow。
- `rxnflow.project_manifest`：`project-v1` manifest JSON 与 dataclass 的序列化/反序列化边界。
- `rxnflow.parsers.contracts`：RawFile、ParserFormat、ParserCapability、ParseOptions、ParseResult、ParserPlugin。
- `rxnflow.parsers.registry`：ParserRegistry 插件选择、unsupported/ambiguous 分支和 parse 统一入口。
- `rxnflow.parsers.cclib_adapter`：Gaussian/ORCA 的 cclib adapter，把 cclib data 映射为 ChemicalObjectDraft。
- `rxnflow.parsers.xyz`：标准 XYZ 解析和 ASE extxyz adapter。
- `rxnflow.parsers.maple`：MAPLE `.out` 基础字段和 MAPLE 多帧 `.xyz` 解析。
- `tests/parser_fixture_harness.py`：测试侧 parser fixture harness，读取 `tests/fixtures/parsers/manifest.yaml` 和 `support-matrix.yaml`，构造 `RawFile` / `ParseOptions`，调用 `ParserRegistry` 并按 `parser-golden-v1` snapshot 比较成功解析和 expected-error 输出，同时校验 support matrix schema、fixture id 覆盖、diagnostic code 引用和 partial known limits；不作为 runtime API。
- `tests/fixtures/parsers/`：parser fixture corpus，当前包含 `parser-fixtures-v1` manifest、`parser-support-matrix-v1` support matrix、synthetic MAPLE sp/opt `.out`、synthetic MAPLE path `.xyz` partial、synthetic Gaussian cclib `.log`、synthetic ORCA cclib `.out`、standard XYZ geometry-only、ASE extxyz energy/charge/spin、ASE extxyz missing energy 和 bad XYZ count 输入及其 golden snapshots。
- `docs/dev/parser-fixture-corpus.md`：开发者和 agent 维护指南，说明新增 fixture workflow、source policy、redaction checklist、snapshot update procedure、support matrix / diagnostic code 维护规则、import preview regression 和 parser gap triage；不作为 runtime API 或用户指南。
- `tests/test_import_preview_parser_regression.py`：测试侧 import preview parser regression，使用 parser fixture corpus 驱动 `ImportRegistryWorkflow.import_files` 和 `PlatformShellService(import.preview)`，核对 ParsePreview / Shell Preview Projection 的 parser metadata、object_count、warnings、error code 和 raw_resource/provenance linkage；不作为 runtime API。
- `rxnflow.registry`：fixture object draft 到 ChemicalObject 的登记和 provenance 附加；通用 ChemicalRegistry 的项目内对象登记、查询、fingerprint 幂等去重和 correction 追加。
- `rxnflow.chemical_object_codec`：`chemical-objects-v1` section 的 ChemicalObject 序列化、反序列化和字段校验，覆盖 energies、thermochemistry、provenance、corrections 和 registry_fingerprint。
- `rxnflow.import_workflow`：ImportRegistryWorkflow 和 ImportBatch / ImportItem / ParsePreview / ImportSelection 状态协议，串联 raw file resource、解析预览、确认登记和 batch restore。
- `rxnflow.import_ledger_codec`：`import-ledger-v1` section 的 ImportBatch / ImportItem / ParsePreview 序列化、反序列化和字段校验，覆盖 draft/provenance、registered ids、warnings 和 errors。
- `rxnflow.graph`：fixture graph 构造；通用 ReactionGraphService 的项目内图谱创建、GraphPatch 应用、路径列表、graph snapshot/restore 和 node/object/edge/path 引用校验。
- `rxnflow.workspace`：GraphEditorWorkspaceService 和 CanvasViewport / WorkspaceSelection / ObjectPaletteItem / NetworkPreview / WorkspaceSnapshot / NodePlacement 协议，串联 graph patch、对象面板、workspace-only 状态、网络预览和 workspace snapshot/restore。
- `rxnflow.graph_workspace_codec`：`reaction-graphs-v1` 和 `workspaces-v1` sections 的 ReactionGraph / WorkspaceSnapshot 序列化、反序列化、引用校验和 derived palette/preview 构造边界。
- `rxnflow.energy`：fixture energy profile 计算；通用 EnergyProfileEngine 的 path 选择、baseline 解析、节点总能量、单位转换、correction inclusion 和缺失点诊断。
- `rxnflow.energy_profile_codec`：`energy-profiles-v1` section 的 EnergyProfile / EnergyOptions / EnergyPoint / RxnFlowWarning 序列化、反序列化、字段校验和 graph/path/node sequence 引用校验。
- `rxnflow.export`：ExportRequest / ExportArtifact / ExportArtifactRecord / EnergyTableRow / EnergyDiagramRoute 协议，以及 ReportExportService 的 PNG、CDXML、XLSX bytes-first 导出编排。
- `rxnflow.export_artifact_codec`：`export-artifacts-v1` section 的 ExportArtifactRecord 序列化、反序列化、format/path/checksum/metadata 校验和重复 id/path 检查。
- `rxnflow.platform`：ShellCommand / ShellResponse / ShellArtifact / PlatformSession / AppKernel / PlatformShellService / handle_platform_payload，提供端侧薄壳层命令协议和 JSON 投影。
- `rxnflow.content_store`：ProjectContentIndex / ProjectContentFile / ProjectContentSnapshot / ProjectContentValidationIssue / ProjectContentValidationReport / ProjectContentMigrationPlan / ProjectStorageBackend / LocalProjectStorageBackend / ProjectContentValidator / ProjectContentStore，以及 fixture snapshot 的 `.rxnflow/state/` 保存、加载、只读验证和 migration plan 闭环。
- `rxnflow.project_bundle`：ProjectBundleSummary / ProjectBundleService，提供 `.rxnflow.zip` 项目包导出、导入、zip entry 安全路径校验、manifest/content validation gate 和 non-overwrite import。
- `rxnflow.browser_storage`：BrowserLocalProjectStorageBackend，提供浏览器本地 ProjectStorageBackend 核心协议测试替身、origin-local project_ref 隔离、checksum/metadata 记录、prefix list 和 quota_bytes 失败模型。
- `rxnflow.cli`：标准库 argparse CLI 入口，把 argv 映射为 ShellCommand，向 stdout 写 JSON，并用 exit code 表达错误。
- `rxnflow.fixture`：默认 fixture scenario 和垂直切片编排入口。

## 3. 数据与状态

核心 fixture 使用稳定、可重复的标识：

- Project：`project-fixture-minimal-reaction`
- ChemicalObject：`object-a`、`object-b`
- ReactionGraph：`graph-a-b`
- ReactionPath：`path-a-b`
- EnergyProfile：`profile-a-b-electronic`

默认能量输入：

- `object-a.electronic = -100.000000 hartree`
- `object-b.electronic = -99.980000 hartree`

默认输出：

- `node-a.relativeEnergy = 0 kcal_mol`
- `node-b.relativeEnergy = 12.55018948 kcal_mol`

Project Store 使用以下稳定目录与 manifest 协议：

```
<project>/
├── .rxnflow/
│   └── manifest.json
└── inputs/
    └── raw/
```

- 当前 manifest schema version：`project-v1`
- Manifest 文件：`.rxnflow/manifest.json`
- Raw file 副本目录：`inputs/raw/`
- Raw file resource path：项目相对 POSIX 路径，例如 `inputs/raw/<sha-prefix>-input.log`
- Raw file checksum：`sha256:<hex>`
- Raw file metadata：当前记录 `source_name` 和 `byte_size`

Project Content Store 使用以下稳定目录与 index 协议：

```
<project>/
├── .rxnflow/
│   ├── manifest.json
│   └── state/
│       ├── project-content.json
│       ├── chemical-objects.json
│       ├── reaction-graphs.json
│       ├── workspaces.json
│       ├── import-ledger.json
│       ├── energy-profiles.json
│       └── export-artifacts.json
└── inputs/
    └── raw/
```

- 当前 project content schema version：`project-content-v1`
- Project Content Index：`.rxnflow/state/project-content.json`
- 当前 section 文件：`chemical-objects.json`、`reaction-graphs.json`、`workspaces.json`、`import-ledger.json`、`energy-profiles.json`、`export-artifacts.json`
- ProjectContentIndex 记录 `schema_version`、`project_id`、`updated_at` 和 ProjectContentFile 清单
- ProjectContentFile 记录 `kind`、项目相对 POSIX `path`、`checksum` 和 `updated_at`
- `import-ledger.json` 当前 schema version：`import-ledger-v1`
- `import-ledger-v1` 保存 Stored ImportBatch 的 `id`、`project_id` 和 items
- Stored ImportItem 保存 `id`、`source_path_display`、`status`、`raw_resource_id`、`preview`、`registered_object_ids`、`warnings` 和 `error`
- Stored ParsePreview 保存 `raw_resource_id`、`parser_id`、`parser_version`、`object_count`、`object_drafts`、`provenance` 和 `warnings`
- `source_path_display` 只用于展示，不作为恢复依据；raw file 恢复锚点是 `raw_resource_id` 和 manifest 中的 raw file resource
- `export-artifacts.json` 当前 schema version：`export-artifacts-v1`
- `export-artifacts-v1` 保存 ExportArtifactRecord 的 `id`、`format`、`path`、`checksum`、`metadata` 和 `created_at`
- ExportArtifactRecord.format 当前只支持 `png`、`cdxml`、`xlsx`
- ExportArtifactRecord.path 必须是 `exports/...` 项目相对 POSIX path，不接受绝对路径、反斜杠、空路径、`.` 或 `..`
- ExportArtifactRecord.checksum 必须是 `sha256:<64 hex>`；section codec 只校验字符串形状，Project Content Validation 会读取 `exports/...` artifact file bytes 复算
- ExportArtifactRecord.metadata 必须是 JSON-safe object，不接受 bytes、Path、dataclass、tuple 或非有限数字
- ExportArtifactRecord 不保存 ExportArtifact.bytes；ProjectContentStore 不生成、复制、移动或删除 artifact 文件本身，validation 只读校验 artifact 文件存在性和 checksum
- `chemical-objects.json` 当前 schema version：`chemical-objects-v1`
- `chemical-objects-v1` 保存 Stored ChemicalObject 的 `id`、`label`、`formula`、`charge`、`spin_multiplicity`、`method`、`geometry`、`energies`、`thermochemistry`、`source_file_id`、`provenance`、`corrections` 和 `registry_fingerprint`
- `chemical-objects-v1` energy/correction energy 必须是 `{value, unit, reference}` 对象，unit 当前支持 `hartree`、`kcal_mol`、`kj_mol`，不接受裸 float
- `reaction-graphs.json` 当前 schema version：`reaction-graphs-v1`
- `reaction-graphs-v1` 保存 ReactionGraph 的 `id`、`project_id`、`nodes`、`edges` 和 `paths`
- ReactionNode 保存 `id`、`kind`、`label`、`chemical_object_ids`、`position` 和 `metadata`；只引用 ChemicalObject id，不复制 ChemicalObject 内容
- ReactionEdge 保存 `id`、`from_node`、`to_node`、`label` 和 `metadata`
- ReactionPath 保存 `id`、`label` 和有序 `node_ids`
- `workspaces.json` 当前 schema version：`workspaces-v1`
- `workspaces-v1` 保存 Stored Workspace 的 `workspace_id`、`project_id`、`graph_id`、`selection`、`viewport`、`active_path_id` 和 `updated_at`
- Workspace section 不保存 ObjectPaletteItem、NetworkPreview、nodes、edges 或 paths；加载后 palette 从 ChemicalObject 派生，preview 从 ReactionGraph 派生
- `energy-profiles.json` 当前 schema version：`energy-profiles-v1`
- `energy-profiles-v1` 保存 Stored EnergyProfile 的 `id`、`graph_id`、`path_id`、`options`、`points` 和 `warnings`
- Stored EnergyOptions 保存 `output_unit`、`include_corrections`、`energy_key` 和可空 `baseline_node_id`
- Stored EnergyPoint 保存 `node_id`、`label`、`absolute_energy`、`relative_energy` 和 `missing_reason`
- EnergyPoint 的 absolute/relative energy 必须显式保存 `{value, unit, reference}`，unit 必须等于 options.output_unit；missing point 必须只有 missing_reason，不能混入 absolute/relative energy
- Energy profile load/save 基于已加载 ReactionGraph 校验 graph_id、path_id、point node 顺序和 baseline_node_id；不重新调用 EnergyProfileEngine，不根据当前 ChemicalObject energy/corrections 自动刷新 profile

Parser Plugins 使用以下稳定协议：

- ParserFormat：`gaussian-log`、`orca-output`、`xyz`、`extxyz`、`maple-output`、`maple-xyz`、`unknown`
- RawFile：`id`、`name`、`path`、`content`、`mime_type`、`size`
- ParseResult：`ChemicalObjectDraft[]` + `Provenance`
- Provenance：`source_file_id`、`parser_id`、`parser_version`、`parsed_at`
- warnings：继续解析但字段缺失、单位假设或格式歧义时通过 `Result.warnings` 返回

当前 parser 能力边界：

- Gaussian/ORCA：通过 cclib adapter 读取基础字段；cclib 的 `scfenergies` 按 eV 转 hartree；Gaussian DFT method 优先使用 `metadata.functional`，ORCA DFT method 可从已知 `metadata.keywords` functional token 恢复，避免只保留泛称 `DFT`。
- XYZ：标准 XYZ 解析元素和坐标；缺失 energy 返回 `missing_section` warning。
- extxyz：通过 ASE 读取 geometry 和可用 metadata；energy 按 ASE eV 语义转 hartree。
- MAPLE：解析 `.out` 中 task/model、坐标、Hartree energy；解析 MAPLE 风格 `.xyz` 中 `Image N`、`Frame N`、`Iter N Image M`、`Iteration N` 和 energy 注释；path `.xyz` 当前只生成 frame-level objects，不生成 ReactionPath 或 TS 语义。

Chemical Registry 当前使用以下稳定协议：

- ChemicalRegistry 入口：`register(project_id, parse_result)`、`get_object(project_id, object_id)`、`list_objects(project_id)`、`restore_objects(project_id, objects, replace=False)`、`apply_correction(project_id, object_id, correction)`
- 登记输入：Parser Plugins 输出的 `ParseResult`
- 登记输出：带 registry 生成 id、source_file_id、provenance、corrections 和 registry_fingerprint 的 `ChemicalObject`
- Registry fingerprint：`source_file_id`、`parser_id`、`parser_version`、draft index 和 draft 内容的哈希
- Registry restore：直接加载已持久化 ChemicalObject，重建 project-scoped objects map 和 fingerprint_to_object_id，不调用 register 或 parser
- Correction kind：`resonance`、`solvation`、`manual`
- Correction 行为：append-only，不改写 ChemicalObject 原始 `energies` / `thermochemistry`

Import Registry Workflow 当前使用以下稳定协议：

- ImportRegistryWorkflow 入口：`import_files(project_path, requests)`、`confirm_import(project_id, batch_id, selections)`、`get_batch(project_id, batch_id)`、`list_batches(project_id)`、`restore_batches(project_id, batches, object_ids=None, replace=False)`
- ImportFileRequest：`source_path` 和可选 `ParseOptions`
- ImportItemStatus：`raw_added`、`parsed`、`needs_confirmation`、`registered`、`failed`
- ImportItem：`id`、`source_path`、`status`、`raw_resource`、`preview`、`registered_object_ids`、`error`、`warnings`
- ParsePreview：`raw_resource_id`、`parser_id`、`parser_version`、`object_count`、`warnings`、`parse_result`
- ImportSelection：`item_id` 和可选 `object_indices`；`None` 表示确认该 item 的全部 objects
- 两阶段语义：`import_files` 只产生 raw resource 和 parse preview；`confirm_import` 才调用 ChemicalRegistry.register
- 批量语义：单个 source file 的 add/parse/register 失败记录在 ImportItem，batch 可继续返回部分成功结果
- restore 行为：直接恢复已持久化 ImportBatch，不调用 `import_files`、ParserRegistry 或 ChemicalRegistry.register；registered_object_ids 可按已加载 ChemicalObject ids 校验
- 持久化边界：ProjectStore 中的 raw file resource 落盘；ChemicalObject 内容可通过 `chemical-objects-v1` 保存；ImportBatch 和 ParsePreview 可通过 `import-ledger-v1` 保存
- fixture-backed preview regression：supported/partial parser fixtures 在 `import_files` 后必须形成 `needs_confirmation` item，preview parser metadata、object_count、warnings 和 raw_resource/provenance linkage 必须与 golden snapshot 对齐；expected parser failure fixture 必须形成 failed item、保留 raw_resource、暴露 error code 且不登记 ChemicalObject。

Reaction Graph 当前使用以下稳定协议：

- GraphPatch op：`add_node`、`update_node`、`add_edge`、`update_edge`、`remove`、`set_path`
- ReactionGraphService 入口：`create_graph(project_id, label)`、`apply_patch(project_id, graph_id, patches, object_ids)`、`list_paths(project_id, graph_id)`、`list_graphs(project_id)`、`restore_graphs(project_id, graphs, object_ids=None, replace=False)`
- ReactionNode kind：`species`、`transition_state`、`group`、`annotation`
- species / transition_state 节点必须引用至少一个 ChemicalObject id
- annotation / group 节点允许不引用 ChemicalObject
- 分叉路径表达：同一 ReactionGraph 的多条 ReactionPath
- remove node 行为：删除节点，并级联删除相关 edge 和包含该 node 的 path
- restore 行为：直接恢复 materialized ReactionGraph state，不回放 GraphPatch；恢复后可继续 list_paths 和 apply_patch

Graph Editor Workspace 当前使用以下稳定协议：

- GraphEditorWorkspaceService 入口：`open_workspace(project_id, graph_id, label, objects)`、`add_node(project_id, workspace_id, placement)`、`connect_nodes(project_id, workspace_id, from_node_id, to_node_id)`、`set_active_path(project_id, workspace_id, path_id, node_ids)`、`apply_patches(project_id, workspace_id, patches)`、`select(project_id, workspace_id, selection)`、`set_viewport(project_id, workspace_id, viewport)`、`snapshot(project_id, workspace_id)`、`list_workspaces(project_id)`、`restore_workspaces(project_id, workspaces, objects=(), replace=False)`
- CanvasViewport：`x`、`y`、`zoom`
- WorkspaceSelection：`node_ids`、`edge_ids`、`path_ids`
- ObjectPaletteItem：`object_id`、`label`、`formula`、`charge`、`spin_multiplicity`、`method`、`source_file_id`、`energy_keys`
- NodePlacement：`kind`、`label`、`chemical_object_ids`、`position`、`metadata`
- WorkspaceSnapshot：`workspace_id`、`project_id`、`graph`、`palette`、`selection`、`viewport`、`active_path_id`、`preview`、可选 `updated_at`
- NetworkPreview：`graph_id`、`active_path_id`、`nodes`、`edges`、`paths`、`disconnected_node_ids`、`warnings`
- Object Palette 来源：调用方传入的 ChemicalObject，以及 ImportRegistryWorkflow 中已 `registered` 且能由 ChemicalRegistry.get_object 解析的 registered object ids
- graph 结构修改：统一通过 ReactionGraphService.apply_patch；selection、viewport 和 active_path_id 保留在 workspace-only 内存 state
- NetworkPreview 只表达结构预览与诊断，不包含真实 canvas render、自动布局或能量曲线数据
- restore 行为：从已恢复的 ReactionGraphService 读取 graph，重建 workspace-only state；Object Palette 和 NetworkPreview 重新派生，不从持久化 JSON 读取缓存

Energy Engine 当前使用以下稳定协议：

- EnergyProfileEngine 入口：`compute_profile(project_id, graph, path_id, objects, options)`
- 计算输入：已加载的 ReactionGraph、selected ReactionPath id、ChemicalObject 集合和 EnergyOptions
- baseline 规则：`baseline_node_id` 为空时使用 selected path 第一个 node；非空时必须属于 selected path
- node total energy：对 node 引用的所有 ChemicalObject 取 `options.energy_key` 并按隐含系数 1 求和
- correction inclusion：`include_corrections=True` 时叠加每个对象上的所有 Correction.energy；`False` 时忽略 corrections 且不改写原始 energy channel
- unit conversion：输入 `hartree`、`kcal_mol`、`kj_mol`，输出 `kcal_mol` 或 `kj_mol`
- missing point：baseline 缺失直接失败；非 baseline 缺失返回带 `missing_reason="missing_energy"` 的 EnergyPoint 和 warning

Report Export 当前使用以下稳定协议：

- ExportFormat：`png`、`cdxml`、`xlsx`
- ReportExportService 入口：`export(project_id, request)`
- ExportRequest：`formats`、`graph`、`profile`、`objects`、`table_rows`、`destination_dir`、`basename`、`title`、`options`
- ExportArtifact：`id`、`format`、`path`、`bytes`、`created_at`、`metadata`
- ExportArtifactRecord：`id`、`format`、项目相对 `path`、`checksum`、`created_at`、`metadata`
- Energy Table：第一列语义为 `structure_name`，默认列覆盖 Egas、Ggas、Ggas+1M、Ggas(shermo)、Ggas(shermo+1M)、Esol、Gsol、basis function 占位、relative energy 和 missing reason
- Energy Diagram Route：从 EnergyProfile.points 派生 state label、relative value、unit 和 missing reason，供 PNG/CDXML 共用
- XLSX workbook：写 `Energy Table` sheet，可选 `Energy Profile` sheet 和 `Warnings` sheet
- CDXML energy diagram：写 CDXML root、page、colortable、fonttable、state lines、connectors、labels、relative values 和 y-axis 文本
- 文件输出：默认 bytes-only；提供 destination_dir 和 basename 时写入 `<basename>.<format>`，basename 不允许路径分隔符或 `..`

Platform Shell 当前使用以下稳定协议：

- ShellCommand：`name` 和 JSON-safe `args`
- ShellResponse：`ok`、`data`、`error`、`warnings`、`artifacts`
- ShellArtifact：`id`、`format`、`path`、`bytes_base64`、`metadata`
- PlatformSession：`id`、`project_path`、`project_id`、`workspace_id`、`graph_id`、`profile_id`、`object_ids`、`artifact_ids`
- AppKernel：集中持有 ProjectStore、ParserRegistry、ChemicalRegistry、ImportRegistryWorkflow、ReactionGraphService、GraphEditorWorkspaceService、EnergyProfileEngine 和 ReportExportService
- PlatformShellService 入口：`run(command)`
- Web/desktop bridge 入口：`handle_platform_payload(payload: dict) -> dict`
- CLI 入口：`python3 -m rxnflow.cli`
- artifact bytes 策略：默认不内联 bytes；`include_bytes=True` 时 ShellArtifact 使用 base64 字符串并记录 `metadata.encoding = "base64"`
- JSON 投影边界：response dict 不包含 dataclass、Path、tuple 或 bytes

Project Content Store 当前使用以下稳定协议：

- ProjectContentFile：`kind`、`path`、`checksum`、`updated_at`
- ProjectContentIndex：`schema_version`、`project_id`、`updated_at`、`files`
- StorageObject：`path`、`bytes`、`checksum`、`metadata`
- StorageObjectInfo：`path`、`checksum`、`byte_size`、`backend_id`
- WriteReceipt：`path`、`checksum`、`byte_size`、`updated_at`、`backend_id`
- ProjectContentSnapshot：`project_id`、`chemical_objects`、`reaction_graphs`、`workspaces`、`energy_profiles`、`import_batches`、`export_artifacts`
- ProjectContentValidationIssue：`severity`、`code`、`message`、`target`、`details`
- ProjectContentValidationReport：`project_id`、`schema_version`、`issues`、`checked_at`、`summary`，其中 `ok` 由是否存在 error issue 派生
- ProjectContentMigrationPlan：`current_schema_version`、`target_schema_version`、`needed`、`steps`、`issues`
- ProjectStorageBackend 入口：`read_object(project_ref, path)`、`write_object(project_ref, obj)`、`exists(project_ref, path)`、`list_objects(project_ref, prefix)`、`delete_object(project_ref, path)`
- LocalProjectStorageBackend：`backend_id = "local-filesystem-v1"`，把 project_ref 解释为本地项目目录
- BrowserLocalProjectStorageBackend：`backend_id = "browser-local-indexeddb-opfs-test-v1"`，把 project_ref 解释为 origin-local project key，按 `(project_ref, path)` 存储对象；当前是 Python 内存测试替身，不是真实浏览器 API adapter
- BrowserLocalProjectStorageBackend quota：可配置 `quota_bytes`；超限返回 `storage_quota_exceeded`，target=`quota`，details 含 `quota_bytes`、`requested_bytes` 和 `current_bytes`
- ProjectContentStore 入口：`save_snapshot(project_ref, snapshot)`、`load_index(project_ref)`、`load_snapshot(project_ref)`、`validate_project(project_ref)`、`migration_plan(project_ref, target_schema_version="project-content-v1")`
- Fixture snapshot helper：`project_content_snapshot_from_fixture(CoreFixtureResult)`
- 当前 save workflow：校验 snapshot，通过 chemical object / graph / workspace / import ledger / energy profile / export artifact codec 序列化 JSON，先写 section files，汇总 checksum，再写 `project-content.json`
- 当前 load workflow：先读 index，校验 `project-content-v1` 和 file path，再读 ChemicalObject section、校验 Import Ledger section、校验 ReactionGraph section、校验 EnergyProfile section、校验 ExportArtifact section、校验 Workspace section，并反序列化为 ProjectContentSnapshot
- 当前 validate workflow：先读 index bytes，再校验 schema/project_id/files shape、section kind/path/checksum 和 canonical path，随后读取 section bytes 复算 checksum，复用现有 codecs 解码，读取 manifest raw resources 作为 source/raw_resource 锚点，最后读取 `exports/...` artifact bytes 并与 ExportArtifactRecord.checksum 比对
- 当前 migration plan workflow：读取 index schema 后判断 target；`project-content-v1 -> project-content-v1` 返回 `needed=False` 和空 steps，未知 source/target 返回 error issue，不写任何项目文件
- Platform Session content collections：`objects`、`import_batches`、`reaction_graphs`、`workspaces`、`energy_profiles`、`export_artifact_records` 和运行时 `artifacts`；同时保留 active `graph`、`workspace`、`profile` 供既有命令继续操作
- Platform restore workflow：`project.open(load_content=True)` 先加载 manifest，再 `validate_project`；validation error 返回 `project_content_invalid`，validation 通过后 `load_snapshot`，并按 ChemicalRegistry.restore_objects → ImportRegistryWorkflow.restore_batches → ReactionGraphService.restore_graphs → GraphEditorWorkspaceService.restore_workspaces 顺序恢复，随后把 energy profiles/export artifact records 写入 session 并返回 restored summary
- Platform manifest-only workflow：`project.load` 和 `project.open(load_content=False)` 只创建 manifest-only session，object/graph/workspace/profile/artifact counts 均为 0，不访问 Project Content
- Platform save workflow：`project.save_content(session_id)` 从当前 session content collections 构造 ProjectContentSnapshot 并调用 ProjectContentStore.save_snapshot；session 缺失或没有 project_path 返回结构化 `invalid_input`
- Platform artifact record workflow：`project.save_content` 会把运行时 ShellArtifact 中位于当前项目 `exports/...` 下的文件转为 ExportArtifactRecord，记录项目相对 path 和 sha256；bytes-only、项目外路径、缺文件或 checksum 读取失败只产生 warning，不阻断 save
- CLI project open workflow：`python3 -m rxnflow.cli project open --json --project-path <path>` 默认恢复 content；`--manifest-only` 只打开 manifest；CLI 不提供 project save-content，因为 CLI 进程内 session 无法跨命令复用

Project Bundle 使用以下稳定协议：

```
<project-name>.rxnflow.zip
└── <bundle-root>/
    ├── .rxnflow/
    ├── inputs/raw/
    └── exports/
```

- Bundle suffix：`.rxnflow.zip`
- Bundle Root：zip 内唯一 top-level directory，当前使用源 Project Directory 的目录名
- Bundle export content roots：`.rxnflow/`、`inputs/raw/`、`exports/`
- Bundle skipped file names：当前跳过 `.DS_Store`
- Conflict policy：第一版只支持 `fail_if_exists`
- ProjectBundleSummary：`bundle_path`、`project_path`、`project_id`、`root_name`、`file_count`、`byte_size`、`checksum`、`validation_summary`
- Bundle export workflow：load project manifest → 如果 content index 存在则 validate_project → 收集并排序允许 roots 下的文件 → 写临时 zip → replace destination → 计算 zip sha256 → 返回 summary
- Bundle import workflow：读取 zip central directory → 校验 entry path、唯一 root、manifest 存在和 allowed roots → 目标项目不存在 → 解包到临时目录 → load manifest → 如果 content index 存在则 validate_project → rename 到目标目录 → 返回 summary
- Bundle path safety：zip entry 禁止绝对路径、反斜杠、空路径、`.`、`..`、多 root、`__MACOSX`、root 下普通文件和 allowed roots 外路径；`inputs/` 下只允许 `inputs/raw/...`
- Bundle validation gate：`.rxnflow/state/project-content.json` 存在时 validation error 阻止 export/import；不存在时允许 manifest-only project bundle，validation_summary 标为未执行
- Bundle 不保存当前进程内 PlatformSession；需要调用方先用同一进程内 `project.save_content` 保存内容，再导出 bundle
- Bundle import 成功后不自动 `project.open`；调用方需要显式打开导入后的项目

## 4. 错误语义

核心模块使用 `Result<T>` 边界协议。正常结果返回 `ok=True` 和 `value`；错误返回 `ok=False` 和 `RxnFlowError`。

当前已落地错误：

- `invalid_input`：fixture 缺少对象、对象缺少能量通道、请求 correction 或 unsupported fixture unit。
- `invalid_input`：Project Store 中 manifest 缺失、manifest JSON 损坏、schema 不兼容、source_path 不存在或不是普通文件、resource path 不安全。
- `invalid_input`：Parser Registry 中 RawFile 同时缺少 content 和有效 path。
- `invalid_input`：Chemical Registry 中 project id 缺失、ParseResult.objects 为空、ChemicalObject 不存在、restore object id/source_file_id 缺失、restore object id 重复、registry_fingerprint 指向冲突、Correction id 缺失或同 id correction 内容冲突。
- `invalid_input`：ImportRegistryWorkflow 中 requests/selections 为空、project_path 无效、batch/item 不存在、item 没有 parse preview、object index 为空/越界/重复或 raw file resource 无法转换为 RawFile。
- `invalid_input`：ReactionGraphService 中 project id 为空、graph id 不存在、GraphPatch 缺少必须 payload 或 patch 字段不支持。
- `invalid_input`：ReactionGraphService restore 中 graph id/project_id 无效、重复 graph/node/edge/path id 或与既有 graph 冲突。
- `invalid_input`：GraphEditorWorkspaceService 中 project id 为空、workspace id 不存在、workspace/project 不匹配或绑定 graph 失败。
- `invalid_input`：GraphEditorWorkspaceService restore 中 workspace id/project_id/graph_id 无效、重复 workspace id、selection/active_path 引用缺失或 viewport zoom 非正数。
- `invalid_input`：EnergyProfileEngine 中 project id 为空、energy key 为空、output unit 不支持或 EnergyValue unit 不支持。
- `invalid_input`：ReportExportService 中 project id 为空、formats 为空、请求格式不支持、PNG/CDXML 缺少 EnergyProfile、XLSX 缺少 profile/object/table rows，或 basename 不是安全文件名。
- `invalid_input`：PlatformShellService 中 command name 为空、未知 command、缺少必填 args，或 session 缺少对应 graph/path/object/profile 前置状态。
- `invalid_input`：Project Content Store 中 project_ref 为空、不安全 logical path、index 缺失、project content JSON 损坏或 schema 不兼容。
- `storage_quota_exceeded`：BrowserLocalProjectStorageBackend 中写入或替换对象会超过 quota_bytes，失败写入不部分覆盖已有对象。
- `invalid_input`：Project Bundle 中 bundle path 后缀不是 `.rxnflow.zip`、bundle 文件缺失、destination_dir 缺失/不是目录、目标项目已存在，或 conflict_policy 不是 `fail_if_exists`。
- `invalid_bundle`：Project Bundle zip 损坏、entry path 不安全、包含多 root、缺少 `.rxnflow/manifest.json`、包含 `__MACOSX` 或包含 allowed roots 外文件。
- Validation Report issue：Project Content Validation 中 index schema/project_id/files shape 错误、unsafe path、duplicate kind/path、canonical path mismatch、section 缺失、section checksum mismatch、bad section JSON、section codec 错误、missing source/raw resource、missing export artifact、artifact checksum mismatch 或 export metadata ref 缺失会进入 ValidationIssue；error issue 使 report.ok 为 false，warning 不阻止 report 生成。
- `invalid_input`：ChemicalObject section codec 中 `chemical-objects-v1` schema 不兼容、project id 不匹配、object id/source_file_id 缺失、energy 缺 value/unit、unit 不支持、重复 object id、重复 registry_fingerprint 冲突、重复 correction id 冲突。
- `invalid_input`：Graph / Workspace section codec 中 `reaction-graphs-v1` 或 `workspaces-v1` schema 不兼容、project id 不匹配、字段 shape 错误、重复 graph/workspace/node/edge/path id、workspace selection/active_path 引用缺失或 viewport 非法。
- `invalid_input`：Import Ledger section codec 中 `import-ledger-v1` schema 不兼容、project id 不匹配、重复 batch/item id、非法 status、preview object_count 不一致、preview/provenance parser 信息不一致、registered_object_ids 引用缺失 ChemicalObject、warnings/error shape 错误。
- `invalid_input`：Export Artifact section codec 中 `export-artifacts-v1` schema 不兼容、project id 不匹配、artifacts 不是 list、record 不是 object、重复 artifact id/path、format 不支持、path 不在 `exports/` 下、checksum 不是 `sha256:<64 hex>` 或 metadata 非 JSON-safe object。
- `unsupported_format`：没有插件支持、置信度不足或插件选择歧义。
- `parse_failed`：XYZ/MAPLE/cclib/ASE adapter 无法解析输入或字段映射失败。
- `export_failed`：ReportExportService 中 writer 依赖缺失、destination_dir 不存在/不是目录，或 artifact 写入失败。
- `internal_error`：Project Store 中 manifest 读写、raw file 复制或 source stat 的 I/O 失败。
- `internal_error`：extxyz 解析缺少 ASE 依赖。
- `internal_error`：Project Content Store 本地 backend 读、写、删、列文件时遇到文件系统 I/O 失败。
- `graph_invalid`：node、edge、path 或 object 引用不存在，graph patch 重复 id，或 species / transition_state 节点缺少 ChemicalObject 引用。
- `graph_invalid`：Graph section codec 或 ReactionGraphService restore 中 graph node/object/edge/path 引用不完整，或 species / transition_state 节点缺少 ChemicalObject 引用。
- `graph_invalid`：GraphEditorWorkspaceService 的 add/connect/path 操作透传 ReactionGraphService 的 graph 引用错误或 object 引用错误。
- `graph_invalid`：EnergyProfileEngine 中 selected path 不存在、baseline 不在 path 中、path 引用缺失 node 或 node 引用缺失 ChemicalObject。
- `missing_energy`：请求的 energy key 在对应 ChemicalObject 中不存在。

缺失能量不得默认为 0；图谱引用错误不得继续计算 EnergyProfile。EnergyProfileEngine 中 baseline 缺失能量返回 `missing_energy`；非 baseline 节点缺失能量时允许返回包含缺失点和 warning 的 profile。

Project Store 不兼容 schema 不做 silent migration；当前只支持 `project-v1`。Manifest resource path 不允许绝对路径、空路径、`.` 或包含 `..`。

Project Content Store 不兼容 schema 不做 silent migration；当前只支持 `project-content-v1`。Project content path 不允许绝对路径、空路径、`.`、包含 `..` 或反斜杠。保存时先写 section files，再写 index；load 时 index 缺失、section 缺失、坏 JSON 或 schema 不兼容均返回结构化错误，不自动生成空 snapshot。validation 是只读聚合报告，不自动修复 checksum/path/project_id/ref 错误；migration_plan 当前只做 no-op/unsupported 判断，不写文件。

Chemical Registry 重复登记同一 ParseResult 时返回既有对象，不追加重复 ChemicalObject。重复提交同 id 且内容相同的 Correction 时幂等返回；同 id 不同内容返回 `invalid_input`。

Chemical Registry restore 不重新 parse raw file、不调用 register 重新计算 fingerprint、不深校验 source_file_id 是否存在于 manifest/import ledger。source_file_id 跨文件引用完整性由 Project Content Validation 以 warning 形式报告。

ImportRegistryWorkflow 中 project-level 错误返回 `Result` error；单文件导入或解析失败写入 ImportItem.error，且已复制进 Project Directory 的 raw file resource 不自动删除。重复确认已 registered 的 item 直接返回既有 registered_object_ids，不重复登记对象。

ImportRegistryWorkflow restore 直接恢复 batch map，不重新复制 raw file、不重新 parse、不调用 ChemicalRegistry.register。`needs_confirmation` item 必须带完整 ParsePreview.parse_result；`registered` item 的 registered_object_ids 可按已加载 ChemicalObject ids 做 hard validation。

ReactionGraphService 按顺序应用 patch；同一批 patches 中途失败时不写回 graph state。重复 set 同一 path id 会覆盖旧 path，add node/edge 遇到重复 id 返回 `graph_invalid`。`restore_graphs` 直接恢复 materialized graph state，不回放 GraphPatch。

GraphEditorWorkspaceService 的 graph edit 操作失败时不更新 workspace graph 或 active_path_id。`restore_workspaces` 从已恢复 graph state 重建 workspace-only state，不保存或读取 palette/preview 缓存。NetworkPreview 中 disconnected nodes 属于 warning/diagnostics，不使 snapshot 失败。

EnergyProfileEngine 不持久化 profile，也不写回 graph/object state；返回的 EnergyProfile.options 会记录实际 baseline node、energy key、output unit 和 correction inclusion。

PlatformShellService 将核心 Result error 投影进 ShellResponse.error；空命令、未知命令和 shell 层参数缺失统一返回 `invalid_input`。Project Bundle validation error 以 `project_content_invalid` 或 `invalid_bundle` 投影。CLI 对 `ok=False` 返回非 0 exit code。

## 5. 约束与边界

- 内置 fixture 不代表真实化学体系，不作为推荐反应示例。
- Project Store 不保存用户源文件的绝对路径；manifest 只保存项目相对路径。
- `add_raw_file` 只复制文件和登记 resource，不解析 Gaussian、ORCA、XYZ 或任何计算输出内容。
- Parser Plugins 不写 `.rxnflow/manifest.json`，不调用 ProjectStore.save_project，不登记 ChemicalObject，不生成 ReactionGraph/EnergyProfile。
- Chemical Registry 不调用 Parser Plugin 实现，不读取 raw file，不写 `.rxnflow/manifest.json`，不生成 ReactionGraph、EnergyProfile 或 export artifact。
- Chemical Registry restore 只恢复已持久化 ChemicalObject 和 fingerprint index，不重新 parse raw file，不根据 parser version 自动刷新对象，不做 source_file_id 跨文件深校验。
- Chemical Registry 不基于 formula、label、energy 接近或 geometry 相似度自动合并对象。
- ImportRegistryWorkflow 可以调用 ProjectStore、ParserRegistry 和 ChemicalRegistry；它不调用 ReactionGraphService、EnergyProfileEngine 或 Export Service。
- ImportRegistryWorkflow 不新增 UI 组件、Web route、CLI 命令、桌面文件选择器或真实侧边栏；只输出 sidebar-ready 的结构化状态。
- ImportRegistryWorkflow 不新增或修改 parser plugin 解析逻辑，不修改 ChemicalRegistry fingerprint、correction 或自动合并策略。
- ImportRegistryWorkflow 不删除用户源文件，也不自动删除已进入项目的 raw file resource。
- Correction 是 additive energy correction 的记录；正负号由用户输入值表达，是否参与能量计算由后续 Energy Engine 显式控制。
- ReactionGraphService 不调用 Chemical Registry、Parser Plugin、Project Store、Energy Engine 或 Export Service；它只接收 object id 集合作为引用校验输入。
- GraphEditorWorkspaceService 可以调用 ReactionGraphService、ImportRegistryWorkflow.list_batches 和 ChemicalRegistry.get_object；它不调用 ParserRegistry、ProjectStore.add_raw_file、ImportRegistryWorkflow.import_files、ImportRegistryWorkflow.confirm_import、EnergyProfileEngine 或 Export Service。
- GraphEditorWorkspaceService 不新增 UI 组件、Web route、CLI 命令、桌面窗口、canvas 渲染、拖拽事件、自动布局、化学计量系数、自动路径搜索或化学合理性判定。
- GraphEditorWorkspaceService 不直接写项目文件、不修改 Project Content Store、不持久化 ChemicalObject、EnergyProfile 或 export artifact；WorkspaceSnapshot、CanvasViewport、WorkspaceSelection 和 active_path_id 的长期保存由 ProjectContentStore 的 `workspaces-v1` section 负责。
- EnergyProfileEngine 不调用 Project Store、Parser Registry、Parser Plugins、ChemicalRegistry.apply_correction、ReactionGraphService.apply_patch 或 Export Service。
- EnergyProfileEngine 只读取传入的 ReactionGraph 和 ChemicalObject 集合，不登记对象、不修改 graph、不追加 correction、不写 `.rxnflow/manifest.json`。
- ReportExportService 不调用 Project Store、Parser Registry、Parser Plugins、ImportRegistryWorkflow、ChemicalRegistry、ReactionGraphService.apply_patch 或 EnergyProfileEngine。
- ReportExportService 只消费调用方传入的已加载对象，不读取 raw file、不解析、不登记对象、不计算 EnergyProfile、不修改 graph/object/profile 状态、不写 `.rxnflow/manifest.json`。
- ReportExportService 当前不新增 UI 组件、Web route、CLI 命令、桌面保存面板、真实报告预览、graph canvas screenshot、Excel chart、公式、宏或模板。
- ReportExportService 当前不从 3D geometry 自动推断 bonds，不生成 molecule-level CDXML，不生成 generic reaction scheme CDXML，不生成 CDX。
- ReportExportService 当前不实现 PDF、PPTX、SVG、CSV、JSON、SDF、MOL 或批量目录导出。
- PlatformShellService 可以调用 ProjectStore、ProjectBundleService、ImportRegistryWorkflow、ChemicalRegistry、GraphEditorWorkspaceService、EnergyProfileEngine 和 ReportExportService；它不复制 parser 字段映射、registry fingerprint、GraphPatch 语义、energy 计算规则、export writer 能力或 bundle zip 复制逻辑。
- AppKernel 只做进程内装配，不是数据库、全局单例或跨进程持久化层。
- PlatformSession 只保存进程内可观察状态，不写 `.rxnflow/manifest.json`，也不新增 ProjectResource 来持久化 ChemicalObject、ReactionGraph、WorkspaceSnapshot、EnergyProfile 或 ExportArtifact 内容。
- Project Content Store 不修改 `.rxnflow/manifest.json`，不新增 ProjectResource，不读取、复制、删除或解析 `inputs/raw/` 文件。
- Project Content Store 不调用 ParserRegistry、ImportRegistryWorkflow、ChemicalRegistry.register、ReactionGraphService.apply_patch、EnergyProfileEngine 或 ReportExportService。
- Project Content Store 本身不实现浏览器 IndexedDB/OPFS API、云存储、数据库、CLI/Web/desktop command、真实 schema migration、增量保存、并发锁、冲突合并或 bundle zip 读写；浏览器本地核心协议替身由 BrowserLocalProjectStorageBackend 提供，project bundle 由 ProjectBundleService 编排。
- Project Content Validation 不自动修复或重写 project-content index、section JSON、manifest、raw files 或 export files，不删除 orphan files，不重新 parse raw files、不重新 register objects、不重新 compute profile、不重新 export reports。
- Project Content Store 当前保存/加载 ChemicalObject、ReactionGraph、WorkspaceSnapshot、ImportBatch/ParsePreview、EnergyProfile 和 ExportArtifact index 长期 sections。
- BrowserLocalProjectStorageBackend 不保存到磁盘、不提供跨浏览器/跨设备同步、不新增 Platform Shell/CLI/Web route/桌面入口，也不调用 parser/import/registry/graph/energy/export/bundle 服务。
- ProjectBundleService 只复制项目文件，不解析 raw file、不登记 ChemicalObject、不确认 import、不计算 EnergyProfile、不调用 ReportExportService、不保存当前 PlatformSession。
- ProjectBundleService export 只打包 `.rxnflow/`、`inputs/raw/` 和 `exports/`，不打包项目根 notes、临时脚本或其他散落文件。
- ProjectBundleService import 不覆盖、不自动改名、不 merge、不做冲突合并；第一版只支持 `fail_if_exists`。
- Project Bundle 不是云同步，也不是浏览器本地存储 adapter；早期 Web 可把它作为用户手动备份/同步路径。
- `rxnflow.cli` 当前不新增 packaging console script、Windows exe、Linux packaging、macOS app 或桌面启动入口。
- handle_platform_payload 当前不新增 Next.js、React、Vercel Functions、FastAPI、Flask、Django、真实 Web route、server 或 worker。
- Platform Shell 当前不新增 UI 组件、文件选择器、拖拽、canvas、窗口管理、报告预览、账号权限、云同步或后台任务队列。
- GraphPatch 不包含 UI 状态，不负责自动布局、拖拽、缩放或选中态。
- transition_state 节点只表达用户/上游对象语义，不判断虚频或结构特征。
- 多对象节点当前只表达同一状态包含多个对象，各对象隐含计量系数为 1；复杂化学计量留待后续 feature。
- MAPLE parser 不运行 MAPLE、PyTorch、ML potential 或外部计算，只解析已有输出文件。
- cclib 和 ASE 是 Parser Plugins 当前依赖边界；依赖锁定方式仍待后续包管理决策。
- 同一项目内重复添加相同 checksum 的 raw file 返回已有 resource，不追加重复条目。
- 当前持久化能力包括 Project Store 的 manifest/raw file resource、Project Content Store 的 ChemicalObject、ReactionGraph、WorkspaceSnapshot、CanvasViewport、WorkspaceSelection、ImportBatch、ParsePreview、EnergyProfile snapshot 和 ExportArtifact index。
- fixture helper 仍只计算单对象 species 节点并输出 `kcal_mol`，用于保持最小垂直切片兼容。
- 通用 EnergyProfileEngine 可计算多对象节点，energy key 由 EnergyOptions 指定，输出支持 `kcal_mol` 和 `kj_mol`。
- `HARTREE_TO_KCAL_MOL = 627.509474` 是当前显式使用的转换常量。
- `KCAL_MOL_TO_KJ_MOL = 4.184` 是当前 kcal/mol 与 kJ/mol 的转换常量。
- 化学计量系数、多组分能量表达式、过渡态化学判定、热化学表达式、溶剂化公式和交互式曲线绘图尚未实现。
- Gaussian/ORCA/MAPLE 真实 fixture corpus、Gaussian/ORCA/MAPLE 版本/任务支持矩阵、MAPLE `.sum`/AutoNEB tree/MD thermo/path topology 语义建模尚未实现。
