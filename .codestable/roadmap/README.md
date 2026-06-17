# Roadmap index and active-scope boundary

本目录里有两类 roadmap：

1. **当前有效规划**：以 `rxnflow-desktop-canvas-rebuild/` 及其后续从它拆出的 feature design 为准。
2. **历史规划证据**：部分早期 roadmap 仍记录旧 Web / ShellClient / local-http / Object Registry / EnergyProfile / ProjectContent 方案。这些文件用于追溯当时的想法，不再代表当前 active UI 或当前架构承诺。

## 当前硬边界

RxnFlow 当前目标是桌面端计算化学图谱编辑器。实现顺序必须遵循：

- 只保留原始 UI 已承载且当前桌面工作台能清楚表达的能力。
- 原 UI 没有承载、或当前重构没有 UI affordance 的能力，不得直接回填代码；只能先进入 roadmap / feature design。
- active renderer 不恢复旧 `ShellClient`、`local-http` bridge、`EnergyProfilePanel`、`Object Registry` / `Objects tab`、correction policy 表单、通用 `Settings/Preferences`、`Search flows`、旧 Python `energy.compute` command、CSV/SVG/PDF/PPTX/CDX 高级导出口或旧 ProjectContent 深迁移体系。
- 这些旧能力如需回归，必须先写新的 feature design，说明：用户入口、桌面端边界、数据契约、与当前 lightweight project/import/export 状态的关系，以及迁移/验证路径。

## 读取规则

- 与当前实现冲突时，以项目级 `AGENTS.md`、`.codestable/attention.md`、`.codestable/architecture/web-workbench.md` 和 `rxnflow-desktop-canvas-rebuild/` 为准。
- 早期 roadmap 中出现的 ShellClient、fixture transport、local-http、Browser repository、完整 EnergyProfile/ObjectRegistry/ProjectContent 等词，默认解释为“历史/待重设计”，不能作为直接实现依据。
