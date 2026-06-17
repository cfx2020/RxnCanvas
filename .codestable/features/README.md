---
doc_type: note
slug: codestable-features-readme
status: current
last_reviewed: 2026-06-17
---

# `.codestable/features/` 使用说明

这个目录保存的是**历史 feature design / checklist / acceptance 证据**。

在当前 RxnFlow 桌面画布重构阶段，请注意：

- 这里的旧 feature 文档 **不自动等于当前 active implementation**。
- 其中大量内容来自桌面画布重构前的 Web shell / ShellClient / local-http / Browser Project Repository / Project Content / EnergyProfile / Object Registry 方向。
- 这些历史 feature 只能作为“为什么以前做过、以前怎么设计过”的证据来源，不能直接覆盖当前产品边界。

## 当前应优先遵循

请优先以这些文档为准：

- `/Users/linsay/Desktop/code/rxnflow/AGENTS.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/attention.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/architecture/ARCHITECTURE.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/architecture/web-workbench.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/architecture/core-platform.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/roadmap/README.md`
- `/Users/linsay/Desktop/code/rxnflow/.codestable/roadmap/rxnflow-desktop-canvas-rebuild/rxnflow-desktop-canvas-rebuild-roadmap.md`
- `/Users/linsay/Desktop/code/rxnflow/docs/user/desktop-canvas-workbench.md`
- `/Users/linsay/Desktop/code/rxnflow/docs/dev/desktop-rebuild-verification.md`
- `/Users/linsay/Desktop/code/rxnflow/docs/dev/release-scope-boundary.md`

## 解读规则

如果某份旧 feature 文档与当前 active UI / 架构描述冲突：

1. 以当前桌面画布工作台边界为准；
2. 把旧能力视为历史方案或 roadmap/backlog 候选；
3. 不直接恢复旧代码或旧文案；
4. 真要回归，先写新的 roadmap / feature design。
