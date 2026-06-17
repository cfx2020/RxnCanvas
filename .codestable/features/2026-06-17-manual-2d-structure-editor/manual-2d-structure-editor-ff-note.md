---
doc_type: feature-ff-note
feature: manual-2d-structure-editor
date: 2026-06-17
requirement:
tags: [web, canvas, molecule-editor, openchemlib, structure-preview]
---

## 做了什么
Node Inspector 增加 OpenChemLib 2D editor，用户可以手动画或修正单个节点的 2D 结构；保存后该节点使用 manual molfile 覆盖自动推断预览，`Reset 2D` 可恢复自动推断。
自动 2D depiction 同时禁用 OpenChemLib 隐式氢标注，避免 N2 / 1.log 这类真实坐标被显示成额外补氢结构；按用户要求本次不做 2D/3D 原子联动。

## 改了哪些
- `web/src/domain/projectPackages.ts` / `web/src/app/projectWorkspace.ts` — 为节点持久化并深拷贝 `manualStructureMolfile`，保留 source coordinate atoms。
- `web/src/app/Molecule2DEditorDialog.tsx` — 新增 OpenChemLib CanvasEditor 弹窗，支持从自动 molfile 或 manual molfile 初始化并保存。
- `web/src/app/Molecule2DDepiction.tsx` — 支持 manual molfile 优先渲染，自动推断时设置 `noImplicitHydrogen`。
- `web/src/app/CanvasWorkspace.tsx` / `web/src/app/InspectorPanels.tsx` / `web/src/app/App.tsx` / canvas mutation actions — 接入节点卡/Inspector 预览、Edit 2D、Reset 2D、undo/redo 历史。
- `docs/` 与 `.codestable/architecture/` — 更新 active 能力边界和验证口径，明确 2D/3D 联动仍不在当前范围。

## 怎么验证的
使用真实项目 `/Users/linsay/Downloads/ir-screening.rxnflow.json` 做浏览器 smoke：导入 16 个节点，确认 N2 / 1 的 SVG 文本无隐式氢模式，打开 4b-1 的 `Edit 2D`，OpenChemLib editor mount 成功，保存后出现 `Reset 2D`。
已通过 `git diff --check`、`npm run test`、`npm run build`、`npm run desktop:smoke`、`npm run desktop:pack` 和 `npm run desktop:runtime:smoke`。

## 顺手发现
- `1.log` 原始 Gaussian 坐标本身包含 7 个 H；本次修的是 OCL 自动补出的隐式氢显示，不会删除源文件里真实存在的 H 原子。
- Vite build 仍提示 3Dmol direct `eval` 与 3Dmol/OpenChemLib chunk 体积超过 500KB，后续可单独评估 viewer/editor lazy-load 与 CSP 策略。
