---
doc_type: dev-guide
slug: workspace-first-flow-qa
component: web-workbench-shell
status: current
summary: Workspace-first Web 工作台主流程的 QA matrix、命令和证据边界
tags: [web-workbench, workspace-first, qa, e2e, playwright, local-http, local-first]
last_reviewed: 2026-06-05
---

# Workspace-First Flow QA

## 什么时候跑

改动 Project Sidebar、Project Files、Source Tray、Graph Canvas、Analysis Dock、PES、Report Export、browser-local persistence、project save/restore、local-http transport 或用户指南时，按下面矩阵选择命令。

常规 Web 改动至少跑：

```bash
cd web && npm run test
cd web && npm run build
cd web && npm run test:e2e -- workbench-journey.spec.ts
```

触碰 local HTTP bridge、Python parser preview、project open/save、energy compute、export writer projection 或 project restore roundtrip 时，再跑：

```bash
cd web && npm run test:e2e:local-http
```

触碰 Python core、Shell command、Project Content、parser 或 report writer 时，同时跑：

```bash
python3 -m unittest discover
```

CodeStable YAML 或 roadmap/checklist 有改动时跑对应 YAML 校验，提交前跑：

```bash
git diff --check
```

## QA Matrix

| Scenario | Mode | Viewport | Command / spec | Proves | Does not prove |
|---|---|---|---|---|---|
| `fixture-desktop-workbench-journey` | fixture | desktop `1280x720` | `npm run test:e2e -- workbench-journey.spec.ts` | 顶部菜单、Project Sidebar、Graph Canvas、Analysis Dock、Source/Analysis 互斥、import/register、path、PES、Export、download、browser-local persistence | 真实 Python parser、真实 export writer、完整第三方输出兼容 |
| `fixture-desktop-project-restore` | fixture | desktop `1280x720` | `workbench-journey.spec.ts` | Save Project、刷新/重开 project、Project Files raw-only、graph/workspace/path/viewport 恢复 | Python bridge roundtrip、Project Content deep validation |
| `fixture-narrow-workbench-flow` | fixture | narrow `390x840` | `workbench-journey.spec.ts` | 窄屏首屏项目栏默认收起、主动作可达、graph/PES/export 可用、无页面级水平溢出 | 桌面复杂手势覆盖、真实 bridge |
| `fixture-graph-editor-matrix` | fixture | desktop + narrow | `workbench-journey.spec.ts` | object drag/drop、node drag、layout、path delete、edge label、direct edge、rubber-band、keyboard nudge、viewport/minimap/history | Python bridge、真实 parser/export writer |
| `local-http-bridge-smoke` | local-http | desktop `1280x720` | `npm run test:e2e:local-http` | Runtime Local HTTP、Save Project、小文件 parser preview、graph/path、energy compute、PNG/CDXML/XLSX/CSV/SVG export projection、download MIME、writer metadata、artifact persistence | 复杂 graph gestures、完整 Gaussian/ORCA/MAPLE/XYZ/extxyz 认证 |
| `local-http-project-restore` | local-http | desktop `1280x720` | `npm run test:e2e:local-http` | raw input persistence、Save Project、重新打开 project、graph/workspace restore、project file retention | 所有 graph gestures、云同步、autosave |
| `manual-user-journey` | manual | desktop + narrow | `docs/user/workspace-first-workbench.md` | 用户能按指南从创建项目走到 Save Project、重开恢复和右侧导出 | 自动化覆盖以外的真实长文件、大文件、私有模板或跨设备云同步 |

## Fixture 与 local-http 分工

默认 fixture E2E 不依赖 Python bridge。它主要证明 Web UI 编排、ShellResponse projection consumption、桌面/窄屏布局、复杂图谱手势、console clean 和 no horizontal overflow。

local-http E2E 会启动本地 Python bridge 和 Vite local-http runtime。它只证明真实 bridge 主链路：小文件 parser preview、project open/save、energy compute、export projection 和 project restore roundtrip。不要把复杂 graph gesture matrix 复制进 local-http spec，否则会把浏览器手势波动和 Python bridge dependency 绑在一起。

`RXNFLOW_E2E_PYTHON=/path/to/python3 npm run test:e2e:local-http` 可显式指定带导出依赖的解释器。

## 输出边界

Playwright 产物只写入 gitignored 目录：

- `web/test-results/`
- `web/test-results-local-http/`
- `web/playwright-report/`
- `web/playwright-report-local-http/`

这些 screenshot、trace 和 HTML report 不进入 Project Content、Browser Project Repository 或报告导出索引。

## 维护规则

- E2E 只通过 UI、可访问 role/label/text 和公开浏览器 API 操作。
- 不直接 mutate `WorkbenchDomainState`、ShellResponse、Project Content files 或 Browser Project Repository bytes。
- 断言用户可观察结果：顶部菜单状态、项目栏展开/收起、Project Files path/status/Add to canvas、Graph Canvas node/path、Analysis Dock tab、PES profile、Export artifact、Download link 和 Diagnostics 内 runtime status。
- 主界面不得断言或展示 backend id、browser project ref、`Runtime Fixture`、`browser-project:...` 等实现细节；这类信息只能在 Diagnostics 中作为排障信息出现。
- Source Tray、Analysis Dock 和 Export 入口是互斥覆盖层；测试需要在进入画布编辑前显式收起会遮挡画布的面板。
- 不为测试便利新增生产按钮、测试专用 UI、runtime schema、localStorage key 或 shell command。
- fixture/local-http 都要检查 framework overlay absent、console clean 和 no horizontal overflow。
- CDXML 只按 `.cdxml` 支持验收，不把能力描述成 CDX 或 molecule-level ChemDraw structure export。
- parser smoke 只描述当前 fixture/local-http 小文件链路，不承诺完整 Gaussian/ORCA/MAPLE/XYZ/extxyz 兼容认证。

## 相关指南

- 用户主流程：`docs/user/workspace-first-workbench.md`
- 图谱高级手势 QA：`docs/dev/graph-editor-e2e-qa.md`
- 报告导出开发者契约：`docs/dev/report-export-artifacts.md`
- Browser local storage backend：`docs/dev/browser-local-storage-backend.md`
