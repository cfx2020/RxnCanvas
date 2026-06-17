---
doc_type: feature-ff-note
feature: structure-2d-depiction
date: 2026-06-17
requirement:
tags: [web, canvas, molecule-viewer, openchemlib, 3dmol]
---

## 做了什么
节点卡和 Inspector 的结构预览改为基于真实导入坐标的 OpenChemLib 2D skeletal depiction，移除旧占位/伪 3D 缩略图；`3D Structure` 弹窗保留 3Dmol.js ball-stick viewer。
2D 预览使用坐标推断键，隐藏碳上的显式 H，并抑制由 3D 坐标误导出的伪手性文本，使 Ir 大分子在节点卡里更接近 ChemDraw 默认骨架图。

## 改了哪些
- `web/src/domain/sourceParsers.ts` — parser preview 保留真实 coordinate atoms，供 2D/3D viewer 使用。
- `web/src/app/Molecule2DDepiction.tsx` — 新增 OpenChemLib 2D SVG depiction、键推断、碳氢隐藏、SVG 清理和缓存。
- `web/src/app/CanvasWorkspace.tsx` / `web/src/app/InspectorPanels.tsx` — 节点卡与 Node Inspector 接入 2D preview，3Dmol 弹窗继续作为 3D 查看入口。
- `web/src/app/Molecule3DmolViewer.tsx` — 3D Structure 弹窗使用 3Dmol.js 渲染真实坐标。
- `docs/` 与 `.codestable/architecture/` — 更新 active 能力边界为“2D Structure Preview + 3Dmol Structure dialog”。

## 怎么验证的
使用真实数据 `/Users/linsay/Desktop/code/rxnflow/Ir/4b-1.log` 做浏览器 smoke，确认节点卡和 Inspector 生成 2D SVG、旧 glyph 为 0、无 OpenChemLib style/伪手性文本泄漏；截图证据保存到 `/tmp/rxnflow-2d-depiction.png`。
已通过 `npx tsc -b --pretty false`、`npm run test`、`npm run build`、`npm run desktop:smoke`、`npm run desktop:pack` 和 `npm run desktop:runtime:smoke`。

## 顺手发现
- Vite build 仍提示 3Dmol 依赖内部 direct `eval`，以及 3Dmol/OpenChemLib 动态 chunk 超过 500KB；当前不阻塞构建，但后续可评估 viewer lazy-load 体积预算与 CSP 策略。
