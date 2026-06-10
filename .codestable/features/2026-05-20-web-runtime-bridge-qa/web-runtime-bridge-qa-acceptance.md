# web-runtime-bridge-qa 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：`.codestable/features/2026-05-20-web-runtime-bridge-qa/web-runtime-bridge-qa-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：

- [x] `WebRuntimeQaMode`：已落地为两套 Playwright 入口。默认 `web/playwright.config.ts` 只匹配 fixture journey 并通过 `testIgnore` 排除 local-http spec；`web/playwright.local-http.config.ts` 只匹配 `local-http-bridge.spec.ts`。
- [x] `LocalHttpE2EPorts`：`web/playwright.local-http.config.ts` 固定 bridge `8766` 和 Vite `5176`，local-http spec 断言 endpoint 为 `http://127.0.0.1:8766/api/shell`。
- [x] `npm run test:e2e`：`web/package.json` 保持默认 `playwright test`，验证 2 条 fixture Workbench Journey，不依赖 Python bridge。
- [x] `npm run test:e2e:local-http`：`web/package.json` 新增独立命令，local-http config 同时启动 bridge 与 local-http Vite server。
- [x] bridge Python 解释器选择：实现中按 `RXNFLOW_E2E_PYTHON`、`CONDA_PREFIX/bin/python3`、`python3` 顺序选择，并显式设置 `PYTHONPATH` 后调用 `serve_local_bridge`，已回填设计文档，避免导出依赖环境偏差。

**名词层“现状 → 变化”逐项核对**：

- [x] Python bridge contract：`tests/test_local_http_shell_bridge.py` 补 CORS local origin、remote origin no-CORS、OPTIONS preflight、payload-too-large 和 ShellResponse-shaped error 测试。
- [x] Web http-api transport：`web/src/shell/ShellClient.test.ts` 覆盖 endpoint missing、fetch failure、malformed response、HTTP non-ok shell error 穿透和 HTTP non-ok ok-response normalization。
- [x] UI error observability：`web/src/app/WorkbenchShell.tsx` 的 command status panel 显示 `error.target`；`web/src/app/WorkbenchShell.test.tsx` 覆盖 `transport_unavailable` 与 `http-api` 可见。
- [x] E2E mode isolation：默认 E2E 和 local-http E2E 分离 baseURL、env、testMatch/testIgnore、outputDir 和 HTML report 目录。

**流程图核对**：

- [x] `npm run test:e2e` → fixture Vite `5173` → fixture workbench journey → `Runtime Fixture`：`npm run test:e2e` 通过 2 个 Chromium tests。
- [x] `npm run test:e2e:local-http` → Python bridge `8766` → local-http Vite `5176` → browser smoke → real ShellResponse projection：`npm run test:e2e:local-http` 通过 1 个 Chromium local-http test。
- [x] local-http smoke 通过 UI 触发 `fixture.run`、inline `import.preview`、Project Content open/save bridge、`energy.compute` 和 `export.profile`；测试没有从前端直接 import Python core。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 默认 E2E 仍是 fixture mode：`npm run test:e2e` 通过，默认只发现 `workbench-journey.spec.ts` 两个测试。
- [x] local-http E2E 独立启动真实 bridge：`npm run test:e2e:local-http` 干净端口下通过，说明 Playwright 自己能拉起 bridge 和 Vite。
- [x] bridge contract / transport boundary 有自动化证据：Python unittest 和 Vitest 全量通过。
- [x] bridge 不可达 UI 错误可观察：`WorkbenchShell.test.tsx` 覆盖 `transport_unavailable` 与 target `http-api`。

**明确不做逐项核对**：

- [x] 不新增 Web 用户功能、UI 面板、导出格式或 parser 支持声明：改动集中在 tests、E2E harness、状态面板 target 显示和文档。
- [x] 不改变默认 runtime：`createConfiguredShellRuntime` 默认仍为 fixture；local-http 只由 Vite env 启用。
- [x] 不把 local HTTP bridge 变成生产公网服务：未新增认证、TLS、云 route 或公网 host，E2E 仍固定 `127.0.0.1`。
- [x] 不实现自动寻找空端口、后台 daemon、自动重连或 GUI 启停 bridge：local-http E2E 固定端口，端口冲突由 Playwright webServer 报告。
- [x] 不新增大文件 chunking、OPFS、browser_storage adapter、Service Worker 或 Worker pool：无相关代码路径。
- [x] 不修改核心 parser、registry、graph、energy、export 领域算法：本 feature 未改 core domain 算法；只补 bridge/transport tests 和 Playwright harness。

**关键决策落地**：

- [x] 独立命令而不是改默认 E2E：`web/package.json` 同时保留 `test:e2e` 和新增 `test:e2e:local-http`。
- [x] 固定本地 QA 端口：local-http config 使用 `8766` / `5176`。
- [x] 多 webServer 启动真实依赖：local-http config 同时定义 bridge webServer 和 Vite webServer。
- [x] 只做 smoke：local-http spec 聚焦 bridge 主链路和模式身份，不复制默认 fixture journey 的窄屏布局矩阵。
- [x] 失败语义以 ShellResponse 为准：fetch/endpoint 失败归一为 `transport_unavailable`，Python 领域错误穿透。

**挂载点反向核对**：

- [x] `tests/test_local_http_shell_bridge.py`：bridge contract 测试，清单内。
- [x] `web/src/shell/ShellClient.test.ts` / `web/src/shell/httpTransport.ts`：http-api transport normalization 测试，清单内。
- [x] `web/playwright.local-http.config.ts`、`web/e2e/local-http-bridge.spec.ts`、`web/package.json`：新增 local-http E2E mode，清单内。
- [x] `web/e2e/workbench-helpers.ts`、`web/playwright.config.ts`、`.gitignore`：测试隔离、启动重试和输出目录忽略，清单内。
- [x] `web/src/app/WorkbenchShell.tsx`、`workbench.css`、`WorkbenchShell.test.tsx`：错误 target 可观察，属于 bridge unavailable smoke 挂载点。
- [x] 反向 grep 未发现当前 feature 引用落在清单外的运行时入口；拔除沙盘推演为删除 local-http config/spec/script 与新增测试后，默认 fixture Web app 仍可独立运行。

## 3. 验收场景核对

- [x] **S1**：默认 `npm run test:e2e` 仍使用 fixture runtime，且不要求 Python bridge server。
  - 证据：`npm run test:e2e` 通过 2 tests；默认 config 排除 `local-http-bridge.spec.ts`。
- [x] **S2**：`npm run test:e2e:local-http` 启动 local bridge 与 local-http Vite，页面显示 `Runtime Local HTTP`，endpoint 指向 `http://127.0.0.1:8766/api/shell`。
  - 证据：local-http E2E 通过；spec 对 runtime badge/title 有断言。
- [x] **S3**：local-http browser smoke 点击 `Fixture Run` 后通过真实 bridge 得到 fixture session、2 个 objects、workspace graph 和 profile projection。
  - 证据：`web/e2e/local-http-bridge.spec.ts` 断言 `fixture-minimal-reaction`、`project-fixture-minimal-reaction`、Fixture A/B、graph/path/profile id。
- [x] **S4**：小 `water.xyz` 走 inline bytes preview，返回 `xyz-ase`，不是 fixture-only batch。
  - 证据：local-http spec 断言 `xyz-ase`、`Inline bytes`，并断言 `import-batch-fixture-web-1` 不存在。
- [x] **S5**：browser-local project 可创建，Open Bridge / Save Bridge Session 不报错。
  - 证据：local-http spec 创建项目后断言 Open 状态、项目名和 `Project content files are readable.`。
- [x] **S6**：energy profile 与 PNG/CDXML/XLSX export persistence 可通过真实 bridge smoke。
  - 证据：local-http spec 断言 `profile-web-main-electronic-kcal_mol-raw`、动态 `artifact-*-<12 hex>`、`exports/rxnflow-profile.*`、writer ids、checksum、3 个 Download link 和 `3 artifacts indexed`。
- [x] **S7**：bridge contract tests 覆盖 CORS local origin / OPTIONS preflight、payload_too_large 和 ShellResponse-shaped error body。
  - 证据：`python3 -m unittest discover` 237 passed。
- [x] **S8**：Web http-api transport tests 覆盖 endpoint missing、fetch failure、malformed response、HTTP non-ok shell error 和 normalization。
  - 证据：`npm run test` 87 passed。
- [x] **S9**：local-http endpoint 不可达时 UI 可观察到 `transport_unavailable` 与 `http-api`。
  - 证据：`WorkbenchShell` component test 通过。
- [x] **S10**：fixture 与 local-http 两套 E2E 隔离。
  - 证据：`npm run test:e2e -- --list` 默认只列 2 个 fixture tests；`npm run test:e2e:local-http -- --list` 只列 1 个 local-http spec；最终两条命令均通过。
- [x] **S11**：完整验证命令通过，浏览器无空白、无 framework overlay、无相关 console error。
  - 证据：`python3 -m unittest discover`、`npm run test`、`npm run build`、`npm run test:e2e`、`npm run test:e2e:local-http` 全部通过；Browser 插件检查当前 `http://127.0.0.1:5176/` title 为 `RxnFlow Workbench`、非空白、无 overlay、console warning/error 为 0。

## 4. 术语一致性

- Bridge QA Harness：design、roadmap、architecture 和 E2E config 均指向同一组 Python contract、Web transport、Playwright smoke。
- Fixture E2E Mode：默认 `npm run test:e2e`，`Runtime Fixture`，不依赖 Python bridge。
- Local HTTP E2E Mode：`npm run test:e2e:local-http`，`Runtime Local HTTP`，通过本地 bridge 调用 Python Platform Shell。
- Runtime Mode Isolation：baseURL、env、test file、outputDir/report 均分离。
- Bridge Unavailable Smoke：`transport_unavailable` / `http-api` 术语在 tests 与 UI 可见状态一致。
- 防冲突：未引入生产 HTTP API、云存储、账号权限、自动 daemon、OPFS/chunking 或完整 parser 支持声明。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md`：已记录 `test:e2e` / `test:e2e:local-http` 两条 QA harness、local-http config、fixed ports、output isolation、Browser QA 证据和 Python 解释器选择顺序。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已补 Web E2E QA Harness 术语和稳定边界，明确 local-http E2E 的 `RXNFLOW_E2E_PYTHON` / `CONDA_PREFIX/bin/python3` / `python3` 解释器选择。
- [x] `AGENTS.md`：已有 Web 预览和验证命令；本 feature 暴露的解释器选择属于 `web/playwright.local-http.config.ts` 的局部 QA 细节，暂不补入项目级硬约束。

## 6. requirement 回写

- [x] `.codestable/requirements/web-workbench-shell.md`：已记录 fixture/local-http E2E 分离、local-http bridge smoke 覆盖范围，以及 `RXNFLOW_E2E_PYTHON` 可显式指定解释器。

## 7. roadmap 回写

- [x] `.codestable/roadmap/rxnflow-web-runtime-bridge/rxnflow-web-runtime-bridge-items.yaml`：`web-runtime-bridge-qa` 已从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/rxnflow-web-runtime-bridge/rxnflow-web-runtime-bridge-roadmap.md`：第 6 条子 feature 已同步为 `done`。
- [x] 该 roadmap 的 6 个子 feature 已全部 `done`，主文档 frontmatter 已标为 `status: completed`。
- [x] YAML 校验：feature checklist 与 runtime bridge items 均通过 `validate-yaml.py --yaml-only`。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 候选 1：local-http E2E 如遇 Python 依赖差异，可用 `RXNFLOW_E2E_PYTHON=/path/to/python3 npm run test:e2e:local-http` 指定解释器。当前已写入架构和需求文档；是否提升到 `AGENTS.md` 作为项目级常用验证规则，留给后续用户确认。

## 9. 遗留

- 后续优化点：
  - `rxnflow-web-workbench-mvp` roadmap 主文档已在本轮顺手核对后标为 `completed`；后续如要继续 Web 产品化，应另起新的 roadmap 或 feature。
  - 真实 Web 文件大 payload、OPFS/chunking、browser_storage adapter、bundle IO、云同步仍在当前范围外。
- 已知限制：
  - local-http E2E 是 smoke，不替代完整真实 Gaussian/ORCA/MAPLE/XYZ/extxyz parser 支持矩阵。
  - local-http bridge 仍是本地开发 bridge，不是公网生产服务。
- 顺手发现：
  - Playwright webServer 如果只用 URL 探测，在当前环境里 closed port 可能返回 HTTP 400 并被误判为可用；local-http config 已改用 `port` 探测。
  - E2E bridge 必须显式选到带 Pillow / XlsxWriter 的 Python，否则真实导出会返回 `export_failed target=dependency`。
