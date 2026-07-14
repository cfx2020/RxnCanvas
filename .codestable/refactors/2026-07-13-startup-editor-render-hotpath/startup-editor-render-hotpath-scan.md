---
doc_type: refactor-scan
refactor: 2026-07-13-startup-editor-render-hotpath
status: selected
scope: Electron 启动恢复、React 画布重渲染、Ketcher/3Dmol 按需预加载
---

# startup-editor-render-hotpath scan

范围约 12 个实现/测试文件，核心路径已有测试。发现 7 个性能点，选择 6 个进入本批；均保持启动后的最终项目状态、编辑器功能和画布行为不变。

## ✓ S1 recent workspace 被完整读取两次

- Electron 初次 restore 已 read/hydrate/validate；renderer 对非 active 项目再次 bind 时因缺少 id→directory map，又完整读取一次。
- N=8 时最多产生 7 次重复完整项目链。
- 方法：M-L4-05。

## ✓ S2 renderer 对每个 startup payload 完整 apply 和 bind

- loading screen 遮挡期间仍逐项 reconcile 全 workspace，并逐项 setActiveProject；最终 active effect 还会再 bind。
- 方法：M-L4-02。

## ✓ S3 无效 recent 项逐个写 store 和重建菜单

- 多个失效路径在循环内逐次 forget，产生重复磁盘写和菜单安装。
- 方法：M-L4-02。

## ✓ S4 preferences 与 recent store 串行加载

- 两者互不依赖，可并行读取后再统一建窗。
- 方法：M-L4-06。

## ✓ S5 无关 App 状态导致 CanvasSurface 父层重渲染

- `CanvasSurface` 未 memo，且两个 App 内联 callback 使 memo 无法命中；设置、导出等状态也会重建整张图谱 element tree。
- 方法：M-L4-01。

## ✓ S6 Ketcher/3Dmol 首次点击才开始下载

- 重依赖已正确动态 import，不在首屏；可在明确按钮 hover/focus 时预热共享 import promise。
- 方法：M-L4-03。

## ✗ S7 继续拆分小面板

- Settings、ExportDock、ReportPanels 等体量小，新增请求与 fallback 的成本可能超过收益。

## 独立问题

- StrictMode 可能吞掉 one-shot startup payload：走独立 issue。
- CDXML noRender singleton Worker 被每次 destroy 后第二次导出超时：走独立 issue。
