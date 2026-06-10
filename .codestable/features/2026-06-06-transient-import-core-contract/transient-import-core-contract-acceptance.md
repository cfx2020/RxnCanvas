# transient-import-core-contract 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-06
> 关联方案 doc：.codestable/features/2026-06-06-transient-import-core-contract/transient-import-core-contract-design.md

## 1. 契约核对

- [x] `ImportFileRequest` 新增 `retain_raw: bool = False`，默认导入不复制 raw file。
- [x] `ImportRegistryWorkflow` 默认从 `source_path` 构造 transient `RawFile`，sha256 派生 `source-<sha12>`，并把 `source_name/source_checksum/source_byte_size` 写入 `ImportItem`。
- [x] 默认 preview / failed item 的 `raw_resource` 为 `None`，project manifest 不新增 `raw_file` resource。
- [x] `retain_raw=true` 继续调用 `ProjectStore.add_raw_file`，保留旧 `raw_resource` / provenance linkage。
- [x] Platform Shell `import.preview` 支持 args-level/source-level `retain_raw`，非 bool 返回 `invalid_input target=retain_raw`。
- [x] Inline bytes 仍由 Platform Shell 写入临时文件后进入 workflow，返回前清理临时目录。

## 2. 范围核对

- [x] 未改 parser plugin 解析逻辑。
- [x] 未改 ChemicalRegistry fingerprint、correction 或 restore 逻辑。
- [x] 未改 ReactionGraph、Workspace、Energy Engine 或 Report Export。
- [x] 未改 Web raw project file 面板；该迁移留给后续 Web 子项。
- [x] 未新增 `CanonicalImportRecord` schema；该项留给后续 import ledger 子项。

## 3. 验证记录

- `python3 -m unittest tests.test_import_registry_workflow tests.test_import_ledger_persistence tests.test_platform_shell_baseline tests.test_local_http_shell_bridge`：通过。
- `python3 -m unittest tests.test_import_preview_parser_regression`：通过。
- `python3 -m unittest discover`：通过，364 tests。
- `cd web && npm run test -- WorkbenchShell.test.tsx importInboxState.test.ts projectFiles.test.ts`：通过，86 tests。
- `cd web && npm run build`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/features/2026-06-06-transient-import-core-contract/transient-import-core-contract-checklist.yaml --yaml-only`：通过。
- `python3 .codestable/tools/validate-yaml.py --file .codestable/roadmap/rxnflow-canonical-import-data/rxnflow-canonical-import-data-items.yaml --yaml-only`：通过。
- `git diff --check`：通过。
- `Ni-fxc` smoke：`Bfix6-ts.log`、`Bfix6-tsf.log`、`Bfix6-tsr.log` 默认 transient import 解析 3 items、登记 3 objects、创建 3 graph nodes，project manifest resources 为 0；electronic energies 分别为 `-5151.485945293177`、`-5151.491118552949`、`-5151.601333558106` hartree。

## 4. 遗留

- `import-ledger-v1` 字段仍叫 `raw_resource_id`；当 `raw_resource is None` 时它实际表示 transient source id。后续 `canonical-import-ledger` 需要补 `CanonicalImportRecord`、`raw_retention` 和更清晰的命名。
- Web 当前仍有 Browser Raw Input Store / Project Files raw-only 迁移前 UI；后续由 `web-transient-import-flow` 与 `web-data-library-panel` 处理。
