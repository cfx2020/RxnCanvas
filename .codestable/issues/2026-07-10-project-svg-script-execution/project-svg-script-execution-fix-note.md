---
doc_type: issue-fix
issue: 2026-07-10-project-svg-script-execution
path: standard
fix_date: 2026-07-10
related: [project-svg-script-execution-analysis.md]
tags: [security, svg, project-schema, ketcher, release-blocker]
---

# 项目 SVG 可执行页面脚本修复记录

## 1. 实际采用方案

采用根因分析中的方案 B：从 active 项目 schema 和手动结构 payload 中删除 stored SVG。Ketcher 只保存 KET、Molfile、CDXML；节点二维预览始终从 Molfile 或坐标重新生成受控 SVG，不再接受项目提供的原始 SVG 字符串。

Electron CSP、导航和生产菜单硬化保留为独立发布安全项，不用它们代替本次对不可信 HTML sink 的根治。

## 2. 改动文件清单

- `web/src/domain/projectPackages.ts`：删除 `ManualStructurePayload.svg` 和 `FlowNode.manualStructureSvg`，项目恢复不再保留任意 SVG。
- `web/src/app/Molecule2DDepiction.tsx`：删除 `manualSvg` 输入及 stored SVG 归一化路径，只渲染内部生成 depiction。
- `web/src/app/Molecule2DEditorDialog.tsx`：Ketcher 保存结果只提交 KET/Molfile/CDXML。
- `web/src/app/canvasMutationState.ts`：手动结构更新和相等判断不再包含 SVG。
- `web/src/app/CanvasWorkspace.tsx`、`web/src/app/InspectorPanels.tsx`：节点与结构弹窗不再读取 stored SVG。
- `web/src/app/App.tsx`：调试摘要和图谱签名移除 SVG 字段。
- `web/src/domain/projectPackages.test.ts`：增加恶意 `manualStructureSvg` 在项目恢复时被丢弃的回归断言。
- `web/src/app/canvasEditState.test.ts`、`web/src/app/Molecule2DDepiction.test.tsx`：更新 canonical structure 和 depiction 测试。

## 3. 验证结果

- 定向 Vitest：5 files、72 tests passed。
- 全量 Vitest：41 files、366 tests passed。
- Python tests：28 tests passed。
- `npm run build`：通过。
- `npm run desktop:smoke`：通过。
- Playwright Chromium 导入包含 `<image onerror>` 的项目：
  - `window.__rxnflowSvgExecuted === false`；
  - 页面中危险事件属性数量为 0；
  - 节点显示 `2D pending`，没有渲染项目提供的 SVG。
- 900×700 窄屏验证无页面横向溢出。

## 4. 遗留事项

- Electron CSP、`will-navigate`、`setWindowOpenHandler`、生产 DevTools 和权限声明将在后续发布硬化 issue 中处理。
- 3Dmol 依赖本身的 direct `eval` build warning 与本次 stored project SVG 注入不是同一问题，单独评估。
