---
doc_type: issue-report
issue: 2026-07-10-project-svg-script-execution
status: confirmed
severity: P0
summary: 打开包含特制二维结构 SVG 的项目后，SVG 中的事件代码会在 RxnFlow 页面执行
tags: [security, svg, project-import, electron, release-blocker]
---

# 项目 SVG 可执行页面脚本 Issue Report

## 1. 问题现象

RxnFlow 项目可以保存节点的二维结构 SVG。打开包含特制 SVG 内容的项目后，SVG 元素携带的事件代码会在 RxnFlow renderer 页面执行。

该行为不需要项目中出现 `<script>` 标签；SVG 内的图片加载失败事件即可触发。执行环境能够看到页面全局对象，包括桌面版通过 preload 暴露的 RxnFlow API。

## 2. 复现步骤

1. 准备一个包含手动二维结构 SVG 的 RxnFlow 项目节点。
2. SVG 内容中加入会在资源加载失败时执行的事件，例如：

   ```html
   <svg xmlns="http://www.w3.org/2000/svg">
     <image href="invalid://rxnflow" onerror="window.__rxnflowSvgExecuted=true" />
   </svg>
   ```

3. 让 RxnFlow 恢复该项目并显示节点二维结构预览；等价的浏览器最小复现是把该 SVG 按当前项目展示路径插入页面。
4. 观察到：`window.__rxnflowSvgExecuted` 变为 `true`，说明事件代码已经执行。

复现频率：稳定复现。

## 3. 期望 vs 实际

**期望行为**：项目中的二维结构内容只能用于绘制分子结构，不应执行项目提供的脚本、事件处理器、外链代码或其他主动内容。

**实际行为**：特制 SVG 中的事件处理器会在 RxnFlow 页面上下文执行，并能接触页面公开的全局能力。

## 4. 环境信息

- 涉及模块 / 功能：项目包恢复、手动二维结构持久化、节点二维结构预览、Electron renderer。
- 相关文件 / 函数：`web/src/app/Molecule2DDepiction.tsx`、`web/src/domain/projectPackages.ts`、`web/electron/preload.cjs`；具体根因与修复范围待阶段 2 分析。
- 运行环境：当前 React/Vite renderer；桌面 Electron 使用同一展示路径。
- 其他上下文：2026-07-10 使用 Playwright Chromium 对最小 SVG 载荷稳定复现；当前项目尚未正式发布。

## 5. 严重程度

**P0 阻塞** — 打开来自其他人的项目可能执行项目携带的主动内容，并触达桌面页面公开能力；正式发布前必须修复。

## 备注

本问题在发布准备度审计中首次作为明确发布阻断项记录：`.codestable/compound/2026-07-10-explore-release-readiness-audit.md`。
