---
doc_type: issue-fix-note
status: fixed
slug: cdxml-repeat-export
path: fast-track
fixed_at: 2026-07-14
tags: [web-workbench, export, cdxml, ketcher]
---

# CDXML repeat export fix note

## 问题

同一个应用会话中第一次 CDXML 导出成功后，连续执行第二次导出可能超时。

## 根因

每次导出完成后都会调用 Ketcher `StructService.destroy()`。`jsNoRender` 的 service 共享底层运行时；销毁单次创建的 service 会同时终止后续转换仍需使用的共享运行时，因此第二次创建 service 并不能可靠恢复转换能力。

## 修复

- 单次导出只创建并使用结构转换 service，不再在导出结束时调用 `destroy()`。
- 本地 service 类型缩小为仅包含实际需要的 `convert` 能力。
- 没有引入新的 service singleton，也没有改变 molfile/KET 到 CDXML 的输入、转换参数或输出内容。
- 增加连续两次导出的生命周期 mock 回归测试：mock 将 `destroy()` 建模为共享运行时永久失效，旧生命周期会使第二次转换失败；修复后两次转换均完成且不会销毁运行时。

## 验证

- `cd web && npm run test -- --run src/app/appReportExport.test.ts` — 1 个文件、5 项测试通过。
- `cd web && npm run test -- --run` — 43 个文件、394 项测试通过。
- `cd web && npm run build` — TypeScript 与 Vite production build 通过。
- 连续转换由模块级生命周期回归测试覆盖；CDXML conversion 参数与既有断言保持一致。
- `git diff --check` — 通过。

## 边界

Ketcher 重包大小和 3Dmol 的既有 build warning 与本次正确性修复无关，未在本次改动中处理。
