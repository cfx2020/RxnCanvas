---
doc_type: issue-fix
issue: 2026-07-10-canvas-annotations-not-persisted
path: fast-track
fix_date: 2026-07-10
tags: [persistence, canvas, annotations, data-loss, release-blocker]
---

# 画布注释未持久化修复记录

## 1. 问题描述

画布支持文本和图片 annotation，但项目保存、自动保存或恢复时，canvas annotations 被清空，导致关闭重开后用户内容丢失。

## 2. 根因

`web/src/domain/projectPackages.ts` 已实现 `normalizeCanvasAnnotation()`，但 `normalizeProjectCanvas()` 无条件写入 `annotations: []`，从未调用该 normalizer。项目构建和项目解析都走 `normalizeProjectCanvas()`，因此所有持久化路径都会丢弃 annotations。

## 3. 修复方案

让 `normalizeProjectCanvas()` 对 canvas annotations 逐项调用现有 normalizer，过滤无效 annotation，并保留 text annotation 与项目自有 `data:image/` image annotation。继续使用既有宽高 clamp 和字段归一化规则，不引入新 schema。

## 4. 改动文件清单

- `web/src/domain/projectPackages.ts`：恢复 canvas annotations 的规范化与持久化。
- `web/src/domain/projectPackages.test.ts`：增加 text/image annotation build、parse、非法外链图片过滤和尺寸 clamp 回归测试。

## 5. 验证结果

- 定向 Vitest、全量 366 个 Web tests、28 个 Python tests、TypeScript/Vite build 和 Electron desktop smoke 全部通过。
- Playwright 导入带 text annotation 的 schema 2 项目后，`Release audit annotation` 在画布中可见。
- 900×700 窄屏下 annotation 和节点仍可见，页面无横向溢出。

## 6. 后续闭环

图片 annotation 的单张与 stored data URL 大小限制已在 `2026-07-10-resource-size-limits` 修复中补齐。
