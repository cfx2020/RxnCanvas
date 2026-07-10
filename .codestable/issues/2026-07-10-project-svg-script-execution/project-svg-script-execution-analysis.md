---
doc_type: issue-analysis
issue: 2026-07-10-project-svg-script-execution
status: confirmed
root_cause_type: data-format
related: [project-svg-script-execution-report.md]
tags: [security, svg, project-schema, ketcher, electron]
---

# 项目 SVG 可执行页面脚本根因分析

## 1. 问题定位

| 关键位置 | 说明 |
|---|---|
| `web/src/domain/projectPackages.ts:36-41` | 手动结构 payload 把 SVG 与 KET/Molfile/CDXML 一起作为可持久化数据。 |
| `web/src/domain/projectPackages.ts:411-441` | 项目恢复时接受任意非空 `manualStructureSvg`，没有内容安全边界。 |
| `web/src/app/Molecule2DDepiction.tsx:36-55` | 只要项目节点带有 SVG，就优先把原始字符串通过 `dangerouslySetInnerHTML` 插入页面。 |
| `web/src/app/Molecule2DDepiction.tsx:236-239` | 所谓归一化仅删除 `<script>`，保留 `onerror` 等事件属性和其他主动 SVG 内容。 |
| `web/src/app/Molecule2DEditorDialog.tsx:247-260` | 应用自己保存结构时已经同时生成 KET、Molfile、CDXML；SVG 只是从 Molfile 生成的冗余展示缓存。 |
| `web/electron/preload.cjs:3-33` | Electron renderer 页面全局可访问受控桌面 API，因此 renderer 脚本执行的影响高于普通静态网页。 |

## 2. 失败路径还原

**正常路径**：用户在 Ketcher 编辑结构 → Ketcher 导出 KET/Molfile/CDXML → RxnFlow 从 Molfile 生成二维 depiction → 页面只展示分子绘图。

**失败路径**：项目 JSON 提供 `manualStructureSvg` → 项目 normalizer 原样保留 → depiction 优先选择 stored SVG → 只移除 `<script>` 后插入 DOM → SVG 事件属性在 renderer 页面执行。

**分叉点**：`web/src/app/Molecule2DDepiction.tsx:37` — stored SVG 被当作可信的展示缓存，并优先于可重新渲染的 Molfile。

## 3. 根因

**根因类型**：data-format。

**根因描述**：项目 schema 同时保存 canonical 化学结构数据和可执行能力更强的 SVG 展示字符串，却没有把 SVG 视为不可信主动内容。恢复项目时又让该冗余字段直接进入 HTML sink。删除 `<script>` 不能构成 SVG 安全策略，因为 SVG 还有事件属性、外部资源和多种主动内容表面。

**是否有多个根因**：是。主根因是项目 schema 接受并优先展示任意 stored SVG；次根因是 Electron renderer 缺少 CSP、导航拦截等纵深防御。次根因单独修复不能替代移除不可信 HTML sink。

## 4. 影响面

- **影响范围**：浏览器 `.rxnflow.json` 恢复、Electron workspace 恢复、recent project startup restore，以及所有显示节点二维结构的入口。
- **潜在受害模块**：节点卡片、Inspector 结构预览、项目导入、autosave/startup restore、preload 暴露的桌面能力。
- **数据完整性风险**：主动内容可以在页面上下文操作项目状态或调用保存相关 API，存在项目篡改风险。
- **严重程度复核**：维持 P0；正式发布前必须消除 stored SVG 执行路径。

## 5. 修复方案

### 方案 A：保留 SVG，增加 allowlist sanitizer

- **做什么**：在项目导入和渲染前使用成熟 sanitizer，只允许受控 SVG 元素/属性。
- **优点**：能够继续显示只包含 SVG 的旧项目。
- **缺点 / 风险**：需要长期维护 SVG sanitizer 配置；SVG 仍是冗余项目字段；配置遗漏会重新打开攻击面。
- **影响面**：新增依赖或安全模块，修改项目导入、Ketcher save 和 depiction。

### 方案 B：从项目 schema 删除 stored SVG，只保存 canonical 结构数据

- **做什么**：删除 `manualStructureSvg` 和 payload `svg`；Ketcher 只保存 KET/Molfile/CDXML；二维预览始终从 Molfile 或坐标生成受控 SVG。
- **优点**：从数据模型上消除不可信 SVG 输入，改动直接且无需新增 sanitizer 依赖；符合项目未发布、无需旧 schema 兼容的约束。
- **缺点 / 风险**：只有 SVG、没有 Molfile/KET/CDXML 的手工构造旧项目不再显示该结构。
- **影响面**：修改 project schema、Ketcher save、canvas mutation、节点/Inspector depiction 和相关测试。

### 方案 C：把 stored SVG 作为隔离图片资源加载

- **做什么**：把 SVG 转为 blob/data image 并通过 `<img>` 显示，配合 CSP 禁止外链。
- **优点**：不把 SVG 直接作为页面 DOM。
- **缺点 / 风险**：仍需处理 SVG 外部资源、尺寸和 URL 生命周期；保留冗余数据，没有方案 B 简洁。
- **影响面**：修改 depiction、资源生命周期、CSP 和项目 schema 校验。

### 推荐方案

**采用方案 B**。当前应用已经把 KET/Molfile/CDXML 作为编辑结果保存，SVG 只是从 Molfile 派生的展示缓存；删除该缓存可以从根上关闭攻击路径，并符合项目尚未发布、不需要兼容旧设计的硬约束。Electron CSP/导航收紧作为后续独立发布硬化项处理。
