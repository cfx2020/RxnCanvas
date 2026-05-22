# Web Project Bundle Archive Adapter 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：`codestable/features/2026-05-22-web-project-bundle-archive-adapter/web-project-bundle-archive-adapter-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

- [x] `BrowserProjectBundleEntry` 已落地于 `web/src/app/projectBundleArchive.ts`，包含 `name`、`projectRelativePath`、`bytes`、`byteSize` 和 `sha256` checksum。
- [x] `BrowserProjectBundleSummary` 已落地，包含 bundleName、rootName、projectId/projectName、fileCount、byteSize、checksum 和 shallow validation state。
- [x] `BrowserProjectBundleArchiveResult` / `BrowserProjectBundleReadResult` / `BrowserProjectBundleError` 已落地，错误 code 收敛为 `invalid_bundle` / `invalid_input` / `zip_failed`。
- [x] `createBrowserProjectBundleArchive`、`inspectBrowserProjectBundleArchive`、`readBrowserProjectBundleArchive` 已落地；`inspect` 第一版复用 `read`，符合 design 中“可共享实现”的推进口径。
- [x] helper 输入仍是 entry list / bytes，不读 Browser Project Repository，不输出 `Blob`。

流程图核对：

- [x] writer 路径：entries → path/root validation → sort/skip → `fflate.zipSync` → bytes + summary。
- [x] reader 路径：zip bytes → central directory inspection → entry/root/manifest validation → `fflate.unzipSync` → safe entries + summary。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] Web 侧已有 helper 能创建 `.rxnflow.zip` bytes，也能从 zip bytes 读取 safe project-relative entries。证据：`projectBundleArchive.test.ts` roundtrip。
- [x] helper 覆盖 single-root、manifest required、allowed roots、entry safety 和 summary。证据：unsafe reader/writer tests。
- [x] 该 helper 仍未启用 Project Sidebar import/export。证据：scope grep 只命中 adapter/tests；既有 Project Sidebar disabled test 未改动。

明确不做逐项核对：

- [x] 未启用 Project Sidebar bundle UI，没有新增 file picker、download link、object URL 或 toast。
- [x] 未写 Browser Project Repository，未创建 browser-local project。
- [x] 未调用 Python `ProjectBundleService`、Platform Shell bundle commands 或 local-http bridge。
- [x] 未做 Project Content deep validation；manifest 只做 shallow summary。
- [x] 未实现 OPFS/chunking/Worker/Service Worker/cloud/account。

关键决策落地：

- [x] `fflate` 已作为 Web zip dependency 写入 `web/package.json` / lockfile，并只在 adapter/test import。
- [x] adapter 输出 `Uint8Array`，后续 UI 才负责 `Blob`。
- [x] writer 接收 entries，不直接读 repository。
- [x] reader 先检查 central directory 和安全语义，非法 entry 不返回部分 entries。
- [x] fixed mtime + path sort 保证相同输入稳定 checksum。
- [x] symlink 通过 central directory external attributes 拒绝。

挂载点反向核对：

- [x] Web package dependency：`fflate`。
- [x] Browser Bundle Archive Adapter module：`web/src/app/projectBundleArchive.ts`。
- [x] Archive adapter tests：`web/src/app/projectBundleArchive.test.ts`。
- [x] CodeStable checklist/architecture/requirement/roadmap 回写。
- [x] 拔除沙盘：删除 adapter/test + `fflate` dependency 后，当前 UI 仍回到 disabled bundle actions，现有 repository/shell/UI 不依赖该 helper。

## 3. 验收场景核对

- [x] **S1**：manifest + state + `inputs/raw/water.xyz` + `exports/profile.png` entries → writer 生成单 Bundle Root archive。证据：roundtrip test。
- [x] **S2**：相同输入重复 writer checksum 稳定。证据：stable output test。
- [x] **S3**：writer 跳过 `.DS_Store` / `__MACOSX` metadata。证据：skip test。
- [x] **S4-S5**：writer 拒绝 unsafe root 和 unsafe project-relative paths。证据：writer rejection test。
- [x] **S6**：reader 返回 project-relative entries、entry checksum、bundle checksum、fileCount、byteSize。证据：roundtrip test。
- [x] **S7**：manifest summary 提取 project id/name；malformed manifest 给 warning validation state。证据：malformed manifest test。
- [x] **S8**：reader 拒绝 multi-root、missing manifest、absolute/backslash/dotdot/dot/root file/outside roots/`inputs` 非 raw。证据：unsafe reader test。
- [x] **S9**：reader 拒绝 symlink external attributes。证据：symlink test。
- [x] **S10-S11**：`fflate` 只在 adapter/tests import，Project Sidebar actions 保持 disabled。证据：scope grep + existing tests。
- [x] **S12**：`npm run test -- --run` 和 `npm run build` 均通过。

前端浏览器验证：

- [x] 本 feature 不改变 React UI、CSS、画布交互或报告预览；浏览器视觉验收不适用。范围守护通过 scope grep 证明未接 UI。

## 4. 术语一致性

- Browser Bundle Archive Adapter：代码命中 `projectBundleArchive.ts` 与测试，语义一致。
- Browser Project Bundle Entry / Summary：类型命名与方案一致。
- Bundle Root / Bundle Entry Safety：校验函数和测试按该语义命名。
- Zip Dependency Boundary：`fflate` import 只在 adapter 和对应测试中出现。
- 防冲突：未新增与既有 Python `ProjectBundleService` 混淆的同名 class。

## 5. 架构归并

- [x] `codestable/architecture/web-workbench.md`：已补 Browser Bundle Archive Adapter 当前能力、模块职责、稳定边界和测试覆盖。
- [x] `codestable/architecture/ARCHITECTURE.md`：已补术语表、Web Workbench 索引和 Web archive helper 边界。
- [x] AGENTS.md：无需要新增的项目级硬约束；dependency boundary 已写入 architecture。

## 6. requirement 回写

- [x] `project-content-persistence` 已更新：记录 Web Browser Bundle Archive Adapter 已能读写 `.rxnflow.zip` bytes、安全校验和 shallow summary；同时保留“用户可见 Project Sidebar import/export 未启用”的边界。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-web-project-portability/rxnflow-web-project-portability-items.yaml`：`web-project-bundle-archive-adapter` 已从 `in-progress` 改为 `done`。
- [x] `codestable/roadmap/rxnflow-web-project-portability/rxnflow-web-project-portability-roadmap.md`：子 feature 清单已同步为 done，观察项已改为 `fflate` 已决策并隔离。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 暴露的是模块级 dependency boundary，写入 architecture 足够；不需要升级为每个 agent 都必须遵守的项目硬约束。

## 9. 遗留

- 后续 `web-project-bundle-export`：从 Browser Project Repository 收集 `.rxnflow/`、`inputs/raw/`、`exports/` entries，并把 adapter bytes 包装为 downloadable `Blob`。
- 后续 `web-project-bundle-import`：把 adapter 返回的 safe entries 写入新 browser-local project。
- 当前已知限制：Web helper 做 archive/path/manifest shallow summary，不做 Python Project Content deep validation，也不处理 Zip64 archive。
