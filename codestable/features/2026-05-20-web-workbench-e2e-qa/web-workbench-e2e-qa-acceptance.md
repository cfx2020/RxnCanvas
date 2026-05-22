# web-workbench-e2e-qa 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-20
> 关联方案 doc：codestable/features/2026-05-20-web-workbench-e2e-qa/web-workbench-e2e-qa-design.md

## 1. 接口契约核对

对照方案第 2.1 节，Web E2E QA Harness 已落地为 repo 内长期测试入口。

- [x] `npm run test:e2e` 已加入 `web/package.json`，执行 `playwright test`。
- [x] `web/playwright.config.ts` 使用 `testDir=./e2e`、`baseURL=http://127.0.0.1:5173`、Chromium project、`webServer` 和 ignored output/report。
- [x] `web/e2e/workbench-helpers.ts` 提供 storage reset、console issue collection、page identity、horizontal overflow、region visibility、screenshot attachment 和主流程 helper。
- [x] `web/e2e/workbench-journey.spec.ts` 提供 desktop 和 narrow Workbench Journey specs。
- [x] `.gitignore` 已忽略 `web/test-results/` 和 `web/playwright-report/`。

## 2. 行为与决策核对

- [x] E2E 只通过真实浏览器 UI 操作已落地 fixture flow，不 import Python core。
- [x] Playwright 自动启动或复用 `http://127.0.0.1:5173/`，未使用 `file://`。
- [x] 测试清理本测试上下文中的 localStorage 和 `rxnflow-browser-projects` IndexedDB，避免 E2E 之间互相污染。
- [x] console warning/error 和 pageerror 会被收集；相关 app issue 会导致测试失败。
- [x] layout health check 断言 document/body 无水平溢出。
- [x] screenshots/traces/report 只写入 Playwright output，并由 `.gitignore` 排除。
- [x] 范围守卫通过：未新增业务 UI、shell command、parser bridge、Python bridge、HTTP route、云存储、账号、JSZip、OPFS、File System Access API 或外部网络依赖；未修改 core/report/energy/import/repository 业务实现。

## 3. 验收场景核对

- [x] `npm run test:e2e -- --list` 能列出 2 个 Chromium tests。
- [x] `npm run test:e2e` 运行 Playwright webServer，目标 URL 为 `http://127.0.0.1:5173/`。
- [x] E2E page identity 验证 title 为 `RxnFlow Workbench`，main region 和 Project Sidebar 可见。
- [x] Desktop flow 创建 browser-local project、保存 stub，并看到 Persisted / Valid / checksum。
- [x] Desktop flow Fixture Run 后看到 fixture project、Object Registry、Graph Canvas、Energy Profile Panel 和 Report Export Panel。
- [x] Desktop flow Import Inbox 注入 `water.xyz` / `bad-count.xyz`，Preview 后看到 batch、raw resource、warnings/errors，Register All 后看到 `object-imported-water`。
- [x] Desktop flow 选择 imported water object，Add Node、Connect、Set Path 后 active path 为 `path-web-main`，path text 包含 `node-a -> node-b -> node-web-3`。
- [x] Desktop flow 在 imported water path 上 Compute 后显示 `missing_energy`，missing row 不被当作 0。
- [x] Desktop flow 重新 Fixture Run 后导出默认 profile，看到 3 个 artifacts、download links、metadata 和 `chemdraw_cdxml_only` warning。
- [x] E2E 覆盖 include bytes disabled：artifacts 可见但 Download link 为 0，`Download unavailable` 为 3。
- [x] Narrow flow 在 `390x840` 下完成 fixture -> graph add/connect/set path -> energy compute -> report export smoke。
- [x] Desktop 和 narrow flow 均断言无 document/body 水平溢出，并 attach viewport screenshots。
- [x] `npm run test:e2e` 通过：2 tests passed。

## 4. 术语一致性

- Web E2E QA Harness：命中集中在 `web/playwright.config.ts`、`web/e2e/` 和 CodeStable 文档，语义一致。
- Workbench Journey：只覆盖已落地 fixture UI，不声明真实 parser/bridge 支持。
- Layout Health Check：实现为 console clean、region visible、no horizontal overflow 和 screenshot attachment，不做 pixel diff。
- QA Artifact：只写到 `web/test-results/` / `web/playwright-report/`，不进入 Project Content、Browser Project Repository 或 report export artifact。

## 5. 架构归并

- [x] `codestable/architecture/web-workbench.md`：记录 `npm run test:e2e`、Playwright config、desktop/narrow journey、storage reset、console clean、no-overflow 和 output 边界。
- [x] `codestable/architecture/ARCHITECTURE.md`：补充 Web E2E QA Harness 术语和 Web Workbench 已落地能力。

## 6. requirement 回写

- [x] `codestable/requirements/web-workbench-shell.md` 已补充 Web 工作台有可重复真实浏览器回归入口，覆盖主流程、响应式布局健康和 QA artifact 边界。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-items.yaml` 中 `web-workbench-e2e-qa` 已由 `in-progress` 改为 `done`。
- [x] `codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-roadmap.md` 中 Web QA Harness 子 feature 状态同步为 done；Web Workbench MVP roadmap 实现项已完成。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 候选：可考虑在 AGENTS.md 常用验证命令中加入 `cd web && npm run test:e2e`。本 feature 未擅自修改 AGENTS.md，等用户确认是否加入。

## 9. 遗留

- E2E 当前只跑 Chromium，不做 Firefox/WebKit 矩阵。
- E2E 当前不做像素级 screenshot golden diff。
- E2E 当前只覆盖 fixture flow，不接真实 Python bridge / HTTP transport / parser file bytes。
- Playwright 运行中 Node 会输出 `NO_COLOR` / `FORCE_COLOR` 环境 warning；不影响测试结果，属于运行环境提示。
