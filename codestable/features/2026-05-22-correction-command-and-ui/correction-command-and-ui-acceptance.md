# Correction Command And UI 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：`codestable/features/2026-05-22-correction-command-and-ui/correction-command-and-ui-design.md`

## 1. 接口契约核对

对照方案第 2.1 节，`ShellCommandName` 已新增 `registry.apply_correction`：后端分发点在 `rxnflow/platform.py` 的 `PlatformShellService.run`，前端 DTO 在 `web/src/shell/types.ts`，fixture runtime 在 `web/src/shell/fixtureTransport.ts`。

- [x] `RegistryApplyCorrectionArgs`：`session_id`、`object_id`、`correction.kind`、`correction.energy.value/unit/reference`、可选 `id/note` 均已由 Shell helper 校验并构造 `Correction`。
- [x] 成功 response：返回 `command=session_id/object`，object summary 保留 `correction_count` 并新增 `corrections` 明细。
- [x] Object Summary Projection：后端 `_object_summary` 与前端 `ObjectSummary` 已包含 `corrections?: CorrectionSummary[]`。
- [x] Correction Entry Form：Web 表单只产出 `ApplyCorrectionRequest`，提交给 `WorkbenchShell.applyCorrection`，不直接改对象。
- [x] 流程图落点：Web form -> ShellClient -> `registry.apply_correction` -> ChemicalRegistry -> session objects replace -> ShellResponse object summary -> Web objects replace 均有代码落点。

## 2. 行为与决策核对

- [x] ChemicalRegistry 仍是唯一核心写入点：Shell command 只做 payload 解析、session registry restore、调用 `ChemicalRegistry.apply_correction` 和 session object 替换。
- [x] Shell 成功后同步 session objects：`workbench.snapshot` 和后续 `energy.compute(include_corrections=true)` 可看到新增 correction。
- [x] Web 只信 ShellResponse：`WorkbenchShell.applyCorrection` 成功后用 response object 替换 `WorkbenchDomainState.objects`，失败时只显示错误。
- [x] 错误语义：invalid kind/unit/value/object 和 correction id 冲突返回结构化 `invalid_input` target。
- [x] 持久化边界：本功能不自动调用 `project.save_content`；长期保存仍走显式 Save Bridge Session。
- [x] i18n：新增表单与列表文案已进入 `zh-CN` / `en-US` catalog，错误 code/target 原样显示。
- [x] 挂载点可卸载性：相关引用集中在 Platform Shell command registry/object summary、Web DTO/FixtureTransport、ObjectRegistryPanel/WorkbenchShell handler/i18n/css/tests；grep 未发现方案清单外的新挂载点。

## 3. 验收场景核对

- [x] S1 合法 manual/solvation/resonance correction 追加后 snapshot 同步刷新。
  - 证据：`tests/test_platform_shell_baseline.py`、`web/src/shell/ShellClient.test.ts`。
- [x] S2 payload 未带 id 时 Shell 生成稳定 correction id，同 payload 重复提交不重复追加。
  - 证据：后端和 fixture ShellClient tests 均断言 `corr-object-...` 前缀和 `correction_count=1`。
- [x] S3 同 id 不同 payload 返回 `invalid_input target=correction.id`，session object 不被部分更新。
  - 证据：`test_registry_apply_correction_rejects_invalid_payload_without_state_change`。
- [x] S4 invalid kind/unit/value/object 返回结构化 `invalid_input`。
  - 证据：后端平台测试覆盖 kind/unit/value/object；前端 fixture test 覆盖 kind/unit/missing object。
- [x] S5 追加 correction 后再次 `energy.compute(include_corrections=true)` 会消费新增 correction。
  - 证据：平台测试断言 corrected relative energy 比 raw profile 增加 1.0 kcal_mol。
- [x] S6 Web Object Registry 选择对象后填写表单并提交，correction count/list 刷新。
  - 证据：`WorkbenchShell.test.tsx` 和真实 Playwright desktop/narrow QA。
- [x] S7 Web submit 失败不本地伪造 correction，错误 code/message/target 可见。
  - 证据：`FailingCorrectionTransport` component test。
- [x] S8 空对象状态下 correction form 不可提交。
  - 证据：Workbench 首屏 component test 断言 `Add Correction` disabled。
- [x] 前端浏览器验证：`http://127.0.0.1:5173/` 上 Playwright Chromium 验证 desktop `1280x720` 与 narrow `390x840`，无 console warning/error、无水平溢出；截图为 `/tmp/rxnflow-correction-desktop.png`、`/tmp/rxnflow-correction-narrow.png`。Browser 插件 DOM/console 可读，但点击和截图 CDP 命令超时，已按前端 QA 规程 fallback 到项目 Playwright。

## 4. 术语一致性

- Registry Apply Correction Command：代码命中集中在 `rxnflow/platform.py`、Web shell DTO/fixture、tests，命名与方案一致。
- Correction Entry Form：Web 组件内使用 `CorrectionEntryForm`，对外请求类型为 `ApplyCorrectionRequest`，与方案语义一致。
- Correction Summary Projection：后端 `_correction_summary` 和前端 `CorrectionSummary` 对齐。
- Append-only Correction：实现与测试均保持 append-only，不改写原始 `energies`、`thermochemistry` 或 provenance。

## 5. 架构归并

- [x] `codestable/architecture/ARCHITECTURE.md`：补充 Correction Entry Form、Object Summary corrections 明细、`registry.apply_correction` 和 Web Object Registry 的新边界。
- [x] `codestable/architecture/core-platform.md`：补充 PlatformShellService 命令清单、Registry Apply Correction 协议、错误 target 和不自动保存/不改 parser 输出的约束。
- [x] `codestable/architecture/web-workbench.md`：补充 Correction Entry Form、ShellResponse-only 状态更新、fixture/component/browser QA 证据，并清理 disabled correction entry 旧描述。

## 6. requirement 回写

- [x] `codestable/requirements/web-workbench-shell.md` 已更新：新增用户故事，说明 Object Registry Panel 可追加 manual/solvation/resonance correction，并明确不支持编辑、删除、排序、批量导入、自动推荐数值或自动保存。
- [x] `project-content-persistence` 未改变：本功能只更新 session objects，持久化仍由既有 Project Content save bridge 承担。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-energy-chemistry-semantics/rxnflow-energy-chemistry-semantics-items.yaml` 中 `correction-command-and-ui` 已从 `in-progress` 更新为 `done`，feature 指向 `2026-05-22-correction-command-and-ui`。
- [x] `codestable/roadmap/rxnflow-energy-chemistry-semantics/rxnflow-energy-chemistry-semantics-roadmap.md` 第 5 节同步为 done，并在观察项中更新 Correction Entry Form 已落地现状。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新长期规则。已有规则“Web 工作台必须从 `web/` 运行 `npm run dev` 并打开 `http://127.0.0.1:5173/`”仍适用。

## 9. 遗留

- 后续优化点：`web-energy-semantics-controls` 仍需补 correction policy options、energy channel selector 和更完整的 energy semantics 控件。
- 已知限制：Correction Entry Form 不支持编辑、删除、排序、批量导入、undo/redo 或自动推荐校正值；不自动保存 Project Content。
- 实现阶段顺手发现：Browser 插件当前在本地 Vite 页面上 DOM/console 可读，但 click/screenshot CDP 命令间歇超时；本次已按前端 QA 规程 fallback 到项目 Playwright，未写入仓库规则。
