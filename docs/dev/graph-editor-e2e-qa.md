---
doc_type: dev-guide
slug: graph-editor-e2e-qa
component: web-graph-editor
status: current
summary: Web Graph Editor 高级交互的 Playwright QA 命令、覆盖范围和输出边界
tags: [web, graph-editor, e2e, playwright, local-http]
last_reviewed: 2026-06-09
---

# Graph Editor E2E QA

这份指南只负责 Graph Canvas 的高级交互矩阵。Workspace-first 主流程、Project Sidebar、自动保存、导出和 local-http roundtrip 的总入口见 `docs/dev/workspace-first-flow-qa.md`。

## 什么时候跑

改动 Graph Canvas、graph viewport、edge/path editing、selection keyboard、history、Project Content bridge restore 或 Web layout 时，至少跑默认 fixture E2E：

```bash
cd web && npm run test:e2e
```

如果改动 local HTTP transport、Python bridge、project open/save、import preview、energy compute 或 export projection，再跑 local-http smoke：

```bash
cd web && npm run test:e2e:local-http
```

`RXNFLOW_E2E_PYTHON=/path/to/python3 npm run test:e2e:local-http` 可显式指定带导出依赖的解释器。

## 默认 fixture 覆盖什么

`web/e2e/workbench-journey.spec.ts` 使用 fixture runtime，不依赖 Python bridge。它覆盖：

- desktop `1280x720` workbench journey：project、import、graph、energy、report export。
- desktop graph editor matrix：object drag/drop、node drag、path delete、direct edge drawing、rubber-band multi-select delete、keyboard nudge、Undo/Redo、wheel zoom、project restore。
- narrow `390x840` workbench flow：graph、energy、report export 主链路。
- narrow graph controls：floating toolbar、project rail、export dock、direct edge handles、viewport controls 可达，无水平溢出。
- report delivery：Report Export / Preview 覆盖 PNG、CDXML、XLSX、CSV 和 SVG 五个 supported artifacts 的 download link、writer metadata、browser-local persisted path/checksum，以及 include bytes 关闭时的不可下载状态。
- framework overlay absent、console clean、screenshot attachment。

默认 fixture E2E 证明 Web UI 编排与 ShellResponse projection 消费，不证明真实 Gaussian/ORCA/MAPLE/XYZ/extxyz 解析质量。

## local-http 覆盖什么

`web/e2e/local-http-bridge.spec.ts` 独立启动本地 Python bridge 和 Vite local-http runtime。它只覆盖 bridge 主链路：

- 普通 UI 不展示 runtime badge、endpoint 或 backend id。
- browser project create/open/auto-save project。
- 本地 inline parser preview。
- project file / inline parser preview -> graph node -> direct edge -> auto path 主流程。
- energy compute。
- PNG/CDXML/XLSX/CSV/SVG export projection、download MIME、writer metadata 与 browser-local artifact persistence。
- project save/reopen restore roundtrip。

不要把复杂 graph gesture matrix 复制进 local-http E2E；那会把浏览器手势波动和 Python bridge dependency 绑在一起。

## 输出边界

Playwright 产物只写入 gitignored 目录：

- `web/test-results/`
- `web/test-results-local-http/`
- `web/playwright-report/`
- `web/playwright-report-local-http/`

这些 screenshot、trace 和 HTML report 不进入 Project Content、Browser Project Repository 或报告导出索引。

Codex in-app Browser 适合做 Graph Canvas 的页面身份、DOM 坐标、console 和真实点击/拖拽 smoke；但当前本地 Vite + Three.js 画布上，CDP screenshot 可能超时。截图失败时不要放宽 Graph Canvas 行为断言；用 DOM/坐标/console 证明交互，再用项目 Playwright E2E 生成 gitignored screenshot/trace。

## 维护规则

- helper 名称描述用户动作，例如 `editFixtureEdgeLabel`、`rubberBandDeleteTemporaryNodes`，不要暴露 React 内部函数名。
- 优先使用 role、label、button text 和可访问区域；pointer / wheel / drag 这类输入可用局部 DOM event helper。
- 测试只通过 UI 触发 Shell command，不直接 mutate `WorkbenchDomainState`、IndexedDB bytes、Project Content files 或 ShellResponse。
- 断言用户可观察结果：node/edge/path 可见、3D 结构可见、direct edge handle 可用、viewport zoom/transform、active path、自动保存后重开恢复。
- 能量布局入口只验证 PES 视图语义：当前 `△E 0.00` 参考节点应在最左层，后继节点按 graph edge/path 连通关系向右展开，纵向仍按当前相对能量显示模式排序。
- E2E 不为测试便利新增生产按钮或测试专用 UI。
