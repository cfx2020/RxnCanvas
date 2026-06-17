---
doc_type: dev-guide
slug: release-scope-boundary
status: current
summary: 发布前区分当前可用功能、roadmap-only 能力和非 active 历史能力
tags: [release, desktop, scope, roadmap]
last_reviewed: 2026-06-17
---

# Release Scope Boundary

本文是桌面画布重构发布前的范围收口清单。若旧 CodeStable feature、旧 roadmap 或旧代码注释与本文冲突，以当前项目级 `AGENTS.md`、`.codestable/attention.md`、`.codestable/architecture/web-workbench.md`、`docs/user/desktop-canvas-workbench.md` 和本文为准。

## 当前可用功能

这些能力已经由当前 React/Vite renderer + Electron shell 承载，可以作为本轮桌面端 smoke / 手动验收范围：

- **项目工作区**：Project Rail 新建、打开、切换、删除 renderer 本地项目；非当前项目导入会切换到目标项目并保持项目间文件/节点隔离。
- **轻量 source import / candidate review**：导入 Gaussian / ORCA / MAPLE / XYZ / extxyz 等当前 lightweight parser 能识别的文本输出；多候选文件打开候选选择面板；失败或未知格式保留 source preview 与 warning。
- **无限画布编辑**：画布平移、缩放、Fit view、小地图、节点拖拽、框选、Shift 多选、键盘删除/清选/微调、Undo/Redo。
- **图谱结构编辑**：拖线创建 reaction edge、键盘创建 edge、edge 选中与 label 编辑、barrier 创建/选中/内联 label 编辑/删除。
- **轻量能量显示**：`Egas` / `Gsol` 与 hartree / kcal/mol / kJ/mol 切换、相对能量 zero point、Table view、Auto layout 的轻量排序布局。
- **结构预览、Inspector 与 source preview**：节点卡与 Node 面板显示 lightweight 2D skeletal depiction；Node 面板可用 Ketcher 画板手动保存/重置单节点 KET/Molfile/CDXML/SVG；Node / Source / Export 三个 active tab，Node 内 3Dmol.js `3D Structure` 真实坐标查看器，Source details。
- **报告导出**：PNG、CDXML、XLSX 三种当前 UI 承载 artifact；Electron 打开 `.rxnflow` 项目目录时导出到项目 `exports/`。
- **轻量 `.rxnflow` 项目目录**：Electron open/save、本地 recent projects、`project.json`、source/export size + sha256 metadata、轻量 importLedger、基础引用校验与 warning。
- **桌面壳层**：macOS/Windows Electron BrowserWindow、preload IPC、native import/open/save menu、packaged embedded Node engine fallback、runtime smoke flag。

## Roadmap-only 能力

这些方向可以保留在 roadmap / feature design 中，但发布前不得直接出现在 active UI，也不得作为“已完成”宣传：

- 完整 cclib / ASE parser 兼容矩阵、真实大型输出容错、fixture corpus 扩展到生产级 parser engine。
- Project Content 深校验、迁移、content index、完整 artifact cleanup / repair。
- 完整 Chemical Object Registry、对象级 fingerprint / correction / provenance 编辑 UI。
- 完整 2D/3D 联动或 atom-map 工作流、2D/3D 原子级联动选择、子结构高亮、结构测量和 atom-map 工作流。
- 完整 Energy Profile / reaction path sheet / 多路径 tabs / 后端 `energy.compute` 或 correction policy engine。
- CSV、SVG、PDF、PPTX、CDX、高级 JSON export、完整 Python ReportExportService 或报告 composer delivery UI。
- 云端保存、账号、权限、跨设备同步、多人协作、CRDT、发布渠道自动更新。
- Windows 真实用户机器安装运行验收、macOS Developer ID 签名与公证通过证据。

## 非 active 历史能力

这些词或入口来自旧 Web shell / ShellClient 方向。它们只能作为历史证据，不能在当前桌面画布 UI 中出现；如需恢复，必须先重写 roadmap / feature design：

- `ShellClient`、`local-http`、`Python bridge`、fixture transport、Browser Project Repository 作为用户可见能力。
- `Computer Profile`、`Objects`、`Object Registry`、`Apply correction`、`Compute`、`Energy Profile`。
- `Search flows`、`Settings`、`Preferences`、云/Auth/sync 入口。
- `More canvas actions`、`Add Node` 等旧 demo 操作入口。
- CSV/SVG/PDF/PPTX/CDX/JSON export 的 active 开关或菜单项。

## 发布前验证口径

本轮发布前，至少保留以下自动证据：

```bash
cd web && npm run test
cd web && npm run build
cd web && npm run desktop:smoke
cd web && npm run desktop:runtime:smoke
```

前端视觉、画布交互、图谱编辑或报告预览发生变更后，还必须通过 `cd web && npm run dev` 启动 `http://127.0.0.1:5173/` 做真实浏览器 smoke。准备正式分发时再补：

- Windows 真机或 Windows CI installer install / launch / uninstall 验证。
- macOS Developer ID 签名、notarization、staple、Gatekeeper 验证。
