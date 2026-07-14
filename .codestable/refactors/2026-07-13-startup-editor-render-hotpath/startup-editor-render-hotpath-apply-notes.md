---
doc_type: refactor-apply-notes
refactor: 2026-07-13-startup-editor-render-hotpath
status: completed
---

# startup-editor-render-hotpath apply notes

## 步骤 1：启动 main I/O

- 启动恢复按最终 payload 顺序登记全部项目目录，active 最后覆盖重复 ID。
- invalid recent 批量清理，只持久化和刷新菜单一次。
- preferences/recent store 并行读取。
- 验证：Electron Node tests、desktop/release/macOS runtime smoke 通过。
- 偏离：无。

## 步骤 2：renderer startup batch

- Startup payload 按顺序纯 transition 累积，最终只 apply 一次。
- startup pending 期间跳过 demo active bind，结束后只绑定最终 active 一次。
- stable empty-dependency effect + latest handler ref 保留。
- 验证：startup 4 项、直接测试 82 项、Web 全量与 build 通过。
- 偏离：无。

## 步骤 3：CanvasSurface memo

- 稳定 App 回调并给 CanvasSurface 增加 memo 边界。
- 无关父状态更新不重建画布；node/viewport 更新保持。
- 验证：相关 81 项测试及 build 通过。
- 偏离：无。

## 步骤 4：重编辑器 intent preload

- 3Dmol/Ketcher 使用共享、失败可重试的 import promise。
- Open 3D hover/focus 立即预热。
- Edit 2D focus 立即预热，hover 200ms 后预热，leave/unmount 取消 timer。
- 首屏无对应 modulepreload；3Dmol 164.17KB gzip、Ketcher 5.797MB gzip，仍为独立 chunk。
- 验证：相关 38 项、Web 全量 388 项、build 和 diff check 通过。
- HUMAN 验证：用户在收到桌面端验收步骤后回复“下一步”，本批按验收通过收尾。
- 浏览器验证：工作台加载正常，首屏未请求实际 `3dmol` dependency 或 `KetcherEditorHost` chunk，console error 为 0；开发预览中的演示节点无完整结构数据，最终预加载手感仍需桌面 App 实测。
- 偏离：无。
