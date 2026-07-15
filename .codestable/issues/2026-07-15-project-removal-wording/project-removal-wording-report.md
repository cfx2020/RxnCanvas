---
doc_type: issue-report
issue: 2026-07-15-project-removal-wording
status: confirmed
severity: low
path: fast-track
tags: [ui, project-rail, wording, accessibility]
---

# 项目移除入口错误使用删除语义

## 1. 现象

项目操作菜单、确认框和确认按钮使用 `Delete project` 及垃圾桶图标，容易让用户理解为会删除磁盘上的 `.rxnflow` 工作区和源文件。

## 2. 实际行为

该操作只从当前侧栏和 Electron Recent Projects 中移除项目引用；不会删除磁盘上的项目文件夹或原始计算文件。

## 3. 期望行为

- 所有可见文案和无障碍名称明确表达 `Remove from sidebar`。
- 确认框明确说明原始源文件及已保存的 `.rxnflow` 文件夹不会删除。
- 图标表达“移除项目引用”，不使用垃圾桶暗示磁盘删除。

## 4. 根因与快速通道判定

`web/src/app/ProjectRail.tsx` 的显示文案和图标仍沿用旧删除语义。行为本身正确，修复范围仅为项目操作 UI 及对应测试，因此走快速通道。
