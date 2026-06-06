---
doc_type: feature-design
feature: 2026-06-06-transient-import-core-contract
requirement: web-workbench-shell
roadmap: rxnflow-canonical-import-data
roadmap_item: transient-import-core-contract
status: approved
summary: Core 和 Platform Shell 的 import preview 默认只把原始输出作为临时解析输入，不再复制为项目 raw resource
tags: [import, transient-import, canonical-import-data, platform-shell, parser]
---

# transient-import-core-contract design

## 1. 需求摘要

用户已拍板：Gaussian log、ORCA output、MAPLE/ASE xyz/extxyz 等原始输出文件默认不作为项目长期内容保存。导入链路的最小核心闭环需要先改为 transient input：parser 仍能读取本地 path 或 inline bytes staging file，但 `ImportRegistryWorkflow.import_files` 默认不调用 `ProjectStore.add_raw_file`，不向 manifest 添加 `raw_file` resource。确认导入后登记的 ChemicalObject 以 parser provenance 的 source id 为来源锚点，后续由 import ledger / project content 保存恢复。

## 2. 范围

- `ImportFileRequest` 增加 `retain_raw: bool = False`。
- `retain_raw=false` 时，workflow 直接从 `source_path` 构造 parser `RawFile`，用 sha256 生成稳定 transient source id。
- `ImportItem.raw_resource` 在默认路径下为 `None`，但保留 `source_name`、`source_checksum` 和 `source_byte_size` 供 shell projection / 后续 ledger 使用。
- `retain_raw=true` 保留旧行为：复制 source file 到 `inputs/raw/...`，manifest 登记 `raw_file` ProjectResource，parser provenance 继续使用 raw resource id。
- Platform Shell `import.preview` 支持 args-level 或 source-level `retain_raw` boolean；默认 false。
- Inline bytes 仍先写入临时文件再复用 workflow，返回前清理临时目录。

## 3. 明确不做

- 不改 Web Project Sidebar / Browser Raw Input Store / raw file drop UI；这些属于后续 `web-transient-import-flow` 和 `web-data-library-panel`。
- 不新增 `CanonicalImportRecord` schema；这是后续 `canonical-import-ledger`。
- 不删除 `ProjectStore.add_raw_file`、`inputs/raw/` 或 bundle helper 的旧能力；它们只从默认导入路径移出。
- 不改变 parser plugin、ChemicalRegistry fingerprint、ReactionGraph、Energy Engine 或 Report Export。

## 4. 接口契约

```python
@dataclass(frozen=True)
class ImportFileRequest:
    source_path: str | os.PathLike[str]
    parse_options: ParseOptions | None = None
    retain_raw: bool = False
```

默认 preview item：

```python
ImportItem(
    raw_resource=None,
    source_name="Bfix6-ts.log",
    source_checksum="sha256:...",
    source_byte_size=...,
    preview=ParsePreview(raw_resource_id="source-<sha12>", ...),
)
```

迁移期约定：`ParsePreview.raw_resource_id` 字段名暂不改；当 `raw_resource is None` 时它表示 transient source id，而不是 manifest resource id。`import-ledger-v1` 仍可用该 id 锚定 restored ChemicalObject.source_file_id；字段命名和 `raw_retention` 语义在 `canonical-import-ledger` 子项中修订。

## 5. 验收契约

- 默认 `ImportRegistryWorkflow.import_files` 对有效文件产生 `needs_confirmation` preview，`raw_resource is None`，manifest resources 为空。
- 默认解析失败 item 保留 structured error/warnings，但不写 raw resource。
- 重复 transient import 同一文件生成相同 transient source id，不向 manifest 添加重复资源。
- `retain_raw=true` 继续复制文件、登记 manifest resource，并保持 parser preview provenance 与 raw resource id 一致。
- Platform Shell / local HTTP 默认 inline preview 返回 `raw_resource=null`、source summary 和 `source-*` preview id。
- Parser regression 可显式 `retain_raw=true` 继续覆盖旧 raw-resource linkage。

