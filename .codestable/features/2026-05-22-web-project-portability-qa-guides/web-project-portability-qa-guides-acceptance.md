# Web Project Portability QA Guides 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-22
> 关联方案 doc：.codestable/features/2026-05-22-web-project-portability-qa-guides/web-project-portability-qa-guides-design.md

## 1. 接口契约核对

对照方案第 2.1 节：

- [x] **PortabilityQaScenario**：以测试名称和 helper 落地，未新增生产 TypeScript API。证据：`web/e2e/workbench-journey.spec.ts` 的 desktop backup/restore、narrow invalid import；`web/e2e/local-http-bridge.spec.ts` 的 local-http roundtrip。
- [x] **InvalidBundleSampleKind**：测试 helper 覆盖 `non_zip_bytes`、`missing_manifest`、`unsafe_entry`，并只服务 Playwright。证据：`web/e2e/workbench-helpers.ts`。
- [x] **GuideVerificationHook**：指南中列出的 UI 文案、错误 code 和命令均可 grep 到。证据：`docs/user/project-bundle-backup.md`、`docs/dev/project-bundle-import-export.md`。
- [x] 未把上述 shape 暴露为 runtime Shell DTO、Project Content schema 或 Browser Project Repository interface。

## 2. 行为与决策核对

- [x] 需求摘要落地：真实浏览器 QA、错误 bundle 样例和用户/开发者指南均已完成。
- [x] 决策 1：本 feature 只收口 QA/指南，未扩展 runtime import/export 行为。
- [x] 决策 2：default fixture 覆盖 desktop/narrow，local-http 只保留真实 bridge 窄链路。
- [x] 决策 3：错误 bundle 样例动态生成，不维护二进制 fixture。
- [x] 决策 4：用户指南明确导出前 Save Bridge、导入后 Open Bridge。
- [x] 决策 5：开发者指南记录 Web adapter 边界、QA 命令和 Python bundle service 不调用边界。
- [x] 决策 6：未新增生产 UI 长教程或 i18n 文案。
- [x] 挂载点反向核对：改动只落在 Playwright E2E/helper、用户/开发者指南、checklist 和验收回写文档。未触碰 Python core、ProjectBundleService、Project Content schema、repository interface 或生产 Web runtime。

## 3. 验收场景核对

- [x] **S1**：default fixture desktop E2E 创建 browser project、Export Bundle、读回 `.rxnflow/manifest.json` 与 `.rxnflow/state/project-content.json` entries、reload 后 Import Bundle。证据：`npm run test:e2e` 5 passed。
- [x] **S2**：narrow E2E 显示 bundle controls，执行 invalid bundle path，console clean 且无水平溢出。证据：`npm run test:e2e` 5 passed。
- [x] **S3**：Invalid Bundle Samples 覆盖 non-zip 与 missing manifest，UI 显示 `invalid_bundle` 且仍为 No browser-local projects。证据：`web/e2e/workbench-journey.spec.ts`。
- [x] **S4**：local-http E2E 覆盖 raw input persistence、Open Bridge、Save Bridge、Export Bundle、Import Bundle、再次 Open Bridge。证据：`npm run test:e2e:local-http` 2 passed。
- [x] **S5-S6**：用户指南说明 Save Bridge / Open Bridge 顺序、bundle 包含目录和非云同步边界。证据：`docs/user/project-bundle-backup.md`。
- [x] **S7-S9**：开发者指南说明 Web 不调用 Python bundle service，列出 QA 命令，错误 code 与源码一致。证据：`docs/dev/project-bundle-import-export.md`。
- [x] **S10**：验证命令通过：`npm run test -- --run`、`npm run build`、`npm run test:e2e`、`npm run test:e2e:local-http`。

## 4. 术语一致性

- Portability QA Matrix：design/acceptance 中使用；实现以 E2E test matrix 表达。
- Invalid Bundle Samples：design、helper、开发者指南一致。
- Web Backup/Restore Guide：落地为 `docs/user/project-bundle-backup.md`。
- Manual Portability Boundary：用户/开发者指南、architecture、requirement 均用手动 `.rxnflow.zip`、非云同步表达。
- Guide Verification Hooks：落地为文档 grep 与验证命令清单。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：补 Web Project Portability QA & Guides 术语、Web E2E QA Harness 覆盖、Project Bundle 指南和显式同步边界已文档化。
- [x] `.codestable/architecture/web-workbench.md`：补当前能力、helper 职责、QA bullets、已知约束和不再待补的指南/错误样例。

## 6. requirement 回写

- [x] `.codestable/requirements/project-content-persistence.md` 已更新 Web Project Bundle 当前能力：补用户/开发者指南已覆盖 Save Bridge / Open Bridge 顺序、错误样例和手动 `.rxnflow.zip` 边界。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-project-portability/rxnflow-web-project-portability-items.yaml`：`web-project-portability-qa-guides` 已从 `in-progress` 更新为 `done`。
- [x] `.codestable/roadmap/rxnflow-web-project-portability/rxnflow-web-project-portability-roadmap.md`：子 feature 状态已更新为 done，frontmatter `status` 已更新为 `completed`，观察项已转为后续独立 feature 候选。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无新增候选。现有 AGENTS.md 已要求 Web 预览使用 `cd web && npm run dev` 和前端验证；本 feature 的 QA 命令已写入开发者指南，不需要提升为项目硬约束。

## 9. 遗留

- 后续优化点：如果需要自动判断未保存 bridge session，另起 dirty tracking / autosave feature。
- 后续优化点：如果需要 import rollback，另起 Browser Project Repository transaction feature。
- 已知限制：Web import 仍只做 archive safety 和 shallow validation；深校验继续通过显式 Open Bridge / core ProjectContentValidator 暴露。
