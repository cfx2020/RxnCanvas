# Web Project Portability Roundtrip 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：.codestable/features/2026-05-22-web-project-portability-roundtrip/web-project-portability-roundtrip-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `WebProjectPortabilityRoundtripStep`：未作为生产 API 暴露；同等步骤在 `web/src/app/WorkbenchShell.test.tsx` roundtrip 用例中逐步覆盖 import bundle、open bridge、edit/export、save bridge、export bundle、read exported bundle。
- [x] `RoundtripRepositoryProbe`：未新增 runtime type；测试直接读取 MemoryBrowserProjectRepository，核对 workspace viewport 从 1 变为 1.2、`inputs/raw/demo.xyz` 保留、`exports/profile.png` 和 `exports/rxnflow-profile.png` 保留。
- [x] `BundleReExportEvidence`：未新增 runtime type；测试捕获 Export Bundle Blob，用 `readBrowserProjectBundleArchive` 读回 entries，核对 `.rxnflow/state/workspaces.json`、`.rxnflow/state/reaction-graphs.json`、raw input 和 export artifact。

**名词层“现状 → 变化”逐项核对**：

- [x] Portability Roundtrip Scenario：已由 WorkbenchShell component test 和 local-http Playwright smoke 覆盖。
- [x] Imported Browser Project Session Restore：Import Bundle 后 UI 显示 active imported project，但 `No project loaded` 仍可见；Open Bridge 后才恢复 workbench projection。
- [x] Explicit Bridge Sync Boundary：测试断言 Import/Export Bundle 不调用 Python bundle commands，Save Bridge Session 前不调用 `project.save_content`。
- [x] Repository/Core Session Parity Probe：Save Bridge Session 后 repository Project Content state 更新；raw/export objects 保留。
- [x] Bundle Re-export Evidence：导出的 zip 被读回并验证 entries 与 workspace viewport。
- [x] Roundtrip Browser QA：`web/e2e/local-http-bridge.spec.ts` 新增 local-http bundle roundtrip smoke。

**流程图核对**：

- [x] Select `.rxnflow.zip` → Import Bundle creates new browser-local project：component test 通过 file input change 执行。
- [x] User clicks Open Bridge → `project.open(content_files, load_content=true)`：component test 断言 payload。
- [x] User edits workspace / exports report artifacts：component test 用 Zoom In 改 viewport，并用 Report Export 写 `exports/rxnflow-profile.png`。
- [x] Save Bridge Session → repository state 更新：component test 断言 `project.save_content(include_content_files=true)` 与 repository workspace state。
- [x] Export Bundle → read exported zip：component test 捕获 Blob 并读回 zip；local-http E2E 捕获下载文件并用 `fflate` 检查 entries。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 导入后的 project 可显式 Open Bridge 恢复 Project Content。证据：component test 的 `project.open` payload 和 restored viewport；local-http E2E 的 Import Bundle → Open Bridge。
- [x] 只有显式 Save Bridge Session 才把 `.rxnflow/state/*.json` 写回 repository。证据：Save 前 workspace viewport 仍为 1，Save 后为 1.2；Save 前 `project.save_content` payload 数量为 0。
- [x] Export Bundle 读取 repository 当前 bytes。证据：读回 zip entries 包含保存后的 workspace state、raw input 和 export artifact。

**明确不做逐项核对**：

- [x] 未新增 bundle 格式、allowed roots、manifest schema、Project Content schema 或 archive adapter 安全规则。
- [x] 未实现 autosave、dirty tracking、自动 Open Bridge、自动 Save Bridge Session 或导出前强制保存。
- [x] 未调用 Python `ProjectBundleService`、`project.import_bundle` 或 `project.export_bundle`；测试中新增反向断言。
- [x] 未新增 cloud、账号、OPFS/chunking、Worker、Service Worker、transaction API 或持久化权限申请。
- [x] 未实现 bundle overwrite/merge/conflict resolution/rollback。
- [x] 未做浏览器端 deep validation、schema migration、raw reparse、对象登记、能量重算或报告 bytes 生成。
- [x] 未写用户指南；指南仍留给 `web-project-portability-qa-guides`。

**关键决策落地**：

- [x] D1 一致性闭环与 QA 加固：实现提交只动测试/E2E/checklist，没有改生产路径。
- [x] D2 显式同步边界不变：Open Bridge / Save Bridge Session 是唯一 repository/core sync 入口。
- [x] D3 保存不得破坏 raw/export objects：测试验证 Save 后 `inputs/raw/demo.xyz`、`exports/profile.png`、`exports/rxnflow-profile.png` 均存在。
- [x] D4 导出证据读回 zip：component test 使用 `readBrowserProjectBundleArchive`，local-http E2E 使用 `fflate.unzipSync`。
- [x] D5 E2E 窄 smoke：新增 local-http bundle roundtrip 测试，没有复制完整 graph gesture matrix。
- [x] D6 保守提示优先：继续复用已有 bridge open Save Bridge hint，不新增 dirty tracking。
- [x] D7 测试不绕开用户路径：导入走 Project Sidebar file input，导出走 Export Bundle button。

**挂载点反向核对（可卸载性）**：

- [x] WorkbenchShell component roundtrip tests：新增 roundtrip 用例和 test-only helper。
- [x] E2E roundtrip harness：扩展 `web/e2e/local-http-bridge.spec.ts`，新增 local-http bundle roundtrip smoke。
- [x] Test bundle/download helpers：仅在测试文件内新增，未暴露生产 API。
- [x] Optional Sidebar hint/i18n：无需修改，现有 hint 足够。
- [x] CodeStable docs：architecture、requirement、roadmap 已回写。
- [x] 反向 grep：新增命中没有生产 `project.import_bundle` / `project.export_bundle` 调用；bundle service 未接入 Web。
- [x] 拔除沙盘推演：删除新增 component/E2E 测试与 docs 回写后，生产运行时完全回到上一提交状态。

## 3. 验收场景核对

- [x] **S1**：从含 manifest/state/raw/export 的 `.rxnflow.zip` 导入后 active project 指向新 project，WorkbenchDomainState 不自动替换。证据：component test 看到 active imported project 与 `No project loaded`。
- [x] **S2**：Open Bridge payload 包含导入 project content files，`load_content=true`，snapshot 恢复 graph/workspace/profile。证据：component test 断言 payload 与 restored `120%` viewport。
- [x] **S3**：Open Bridge 后执行 workspace edit/report export，Save Bridge 前 Export Bundle 不自动 save。证据：Save 前 `project.save_content` payload 为 0。
- [x] **S4**：Save Bridge Session 后 repository Project Content bytes 更新。证据：`workspaces.json` viewport zoom 从 1 更新到 1.2。
- [x] **S5**：Save Bridge Session 不删除 raw/export objects。证据：repository exists 断言覆盖 `inputs/raw/demo.xyz`、`exports/profile.png` 和 `exports/rxnflow-profile.png`。
- [x] **S6**：Save 后 Export Bundle zip 读回包含更新 state/raw/export entries。证据：component test 的 exportedBundle entries 和 workspace JSON。
- [x] **S7**：重新导入刚导出的 bundle 后，再 Open Bridge 能恢复 workspace 可观察状态。证据：component test reimport 后显示 `120%`。
- [x] **S8**：local-http E2E 完成 browser project bundle export/import/open bridge roundtrip。证据：`npm run test:e2e:local-http` 两条通过。
- [x] **S9**：bridge open hint 可见；不做精确 dirty tracking。证据：component test 断言现有 hint。
- [x] **S10**：Import/Export Bundle 不调用 Python bundle service commands。证据：component test 断言 payload 中无 `project.import_bundle` / `project.export_bundle`。
- [x] **S11**：未新增 cloud/autosave/OPFS/Worker/transaction API。证据：scope grep 与 diff review。
- [x] **S12**：`npm run test -- --run`、`npm run build`、`npm run test:e2e:local-http` 通过。

## 4. 术语一致性

- Portability Roundtrip Scenario：design、checklist、acceptance 与 `local-http-bridge.spec.ts` 的 bundle roundtrip smoke 一致。
- Explicit Bridge Sync Boundary：architecture/requirement 已记录；代码未新增自动 open/save。
- Repository/Core Session Parity Probe：仅作为测试证据存在，未进入生产 API。
- Bundle Re-export Evidence：测试通过 archive adapter / fflate 读回 zip，未从 WorkbenchDomainState 拼证据。
- 防冲突：`project.import_bundle`、`project.export_bundle` 只出现在反向断言或文档，不是新增 shell 调用。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已新增 Web Project Portability Roundtrip 术语，并记录 Import/Open/Save/Export 的显式同步纪律。
- [x] `.codestable/architecture/web-workbench.md`：已记录 roundtrip QA 当前能力、测试覆盖、local-http bundle roundtrip smoke 和 non-goal 更新。
- [x] `AGENTS.md`：无需新增硬约束。已有 Web 验证要求覆盖本 feature 的验证方式。

## 6. requirement 回写

- [x] `.codestable/requirements/project-content-persistence.md` 已更新：记录 Web bundle roundtrip QA 已验证手动迁移流程；强调 Import Bundle 不自动 Open Bridge、Export Bundle 不自动 Save Bridge Session。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-project-portability/rxnflow-web-project-portability-items.yaml`：`web-project-portability-roundtrip` 已从 `in-progress` 更新为 `done`。
- [x] `.codestable/roadmap/rxnflow-web-project-portability/rxnflow-web-project-portability-roadmap.md`：子 feature 状态已更新为 done，下一步切到 `web-project-portability-qa-guides`。
- [x] roadmap YAML 在验收提交前重新校验。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无候选。本 feature 沿用现有 Web validation 命令和 local-http E2E 命令，没有新增每个后续 feature 都需要记住的环境约束。

## 9. 遗留

- 后续优化点：`web-project-portability-qa-guides` 需要补用户/开发者指南、错误 bundle 样例和更完整的真实浏览器回归说明。
- 已知限制：roundtrip QA 证明显式手动迁移闭环，不等于云同步、自动保存或实时多端同步。
- 已知限制：Web Import Bundle 仍只做 archive safety + shallow validation，Project Content deep validation 仍由 Open Bridge / Python ProjectContentValidator 暴露。
- 实现阶段发现：local-http 主流程中若用户先打开一个 browser project，又运行 `Fixture Run` 切到另一个 core session，再 Save Bridge 到原 browser project，会出现 project_id 不一致的 validation error；这符合当前显式同步边界，不在本 feature 改为自动绑定/阻止。
