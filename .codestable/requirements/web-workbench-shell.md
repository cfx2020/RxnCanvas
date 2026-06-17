---
doc_type: requirement
slug: web-workbench-shell
pitch: 这是一份已退役的旧 Web shell 需求占位；当前实现以桌面画布工作台为准
status: outdated
last_reviewed: 2026-06-17
implemented_by:
  - web-workbench
tags: [web, superseded, desktop-canvas-rebuild]
---

# Web Workbench Shell（已退役）

> 当前状态：这份文档记录的是 2026-06-12 桌面画布重构前的 browser-first / shell-first 设想，**不是当前 active contract**。

## 当前应当遵循的文档

请改看下面这些现行文档：

- `/Users/linsay/Desktop/code/rxnflow/.codestable/architecture/web-workbench.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/architecture/ARCHITECTURE.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/requirements/project-content-persistence.md`
- `/Users/linsay/Desktop/code/rxnflow/docs/user/desktop-canvas-workbench.md`
- `/Users/linsay/Desktop/code/rxnflow/docs/dev/desktop-rebuild-verification.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/roadmap/rxnflow-desktop-canvas-rebuild/rxnflow-desktop-canvas-rebuild-roadmap.md`

## 为什么被 supersede

当前产品已经切到 **desktop canvas workbench** 主线，真实实现是：

- React + TypeScript + Vite renderer
- Electron 桌面壳
- local engine `import.preview`
- renderer-side candidate review / fallback register
- 轻量 workspace folder open/save (`.rxnflow/project.json` metadata)
- PNG / CDXML / XLSX 轻量导出

因此，这份旧文档里涉及的 browser-first 设计不再作为现行承诺，尤其包括：

- 旧 ShellClient / transport / local-http bridge
- browser project repository / Project Content 自动保存主流程
- 旧 EnergyProfilePanel / `energy.compute`
- Object Registry / correction 表单
- `.rxnflow.zip` 导入 / bundle 作为主入口（当前仅保留 zip 导出）
- fixture / local-http E2E 作为当前主验证入口

## 保留这份文档的目的

- 只作为历史需求痕迹，帮助理解为什么仓库里曾出现过旧 shell / bridge / project-content 方向。
- 不再指导当前实现、验收、架构或 roadmap 拆分。

如果未来要恢复这些旧方向，必须先在 roadmap / feature design 中重新定义 UI 承载方式与桌面端边界，而不是直接复活旧实现。
