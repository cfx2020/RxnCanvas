---
doc_type: issue-fix
issue: 2026-07-30-structure-dialog-focus
status: fixed
path: fast-track
fix_date: 2026-07-30
tags: [ui, accessibility, keyboard, focus, 3d, 2d, ketcher]
---

# 3D → 2D 结构弹窗焦点生命周期修复记录

## 1. 问题与根因

3D Structure 和 2D Editor 都声明为模态弹窗，但原实现没有完整的初始焦点、Tab 约束和焦点恢复。3D 使用 document 级 Escape，进入 2D 时组件和 App 又重复关闭 3D；2D 保存时同样有双重关闭。3D 卸载后，2D 因此只能看到已经失效的 Edit 按钮，无法返回最初的 Open 3D Structure 入口。

真实 Ketcher 还暴露了三个运行时边界：冷加载后会程序化聚焦隐藏剪贴板 textarea；该 textarea 尺寸为 0×0，却会被普通焦点查询选中；Settings 使用原生 `<dialog>`，其 Escape 和 Tab 必须由内层弹窗自己处理。

## 2. 修复内容

- 3D 打开后聚焦 Close 3D Structure，Tab / Shift+Tab 只在可用操作间循环，Escape 在弹窗内消费。
- 3D 直接关闭时恢复原入口；进入 2D 时把原入口交给 App，3D 卸载不短暂把焦点送回背景。
- 2D 打开后聚焦 Cancel，并在用户尚未开始操作前阻止 Ketcher 异步加载抢走初始焦点。
- 2D 的焦点循环只包含实际有可见尺寸的控件，排除 Ketcher 的 0×0 cliparea。
- Ketcher 内层原生 `<dialog>` 保留自己的 Tab 和 Escape 所有权，外层 2D 编辑器不会误关闭。
- 关闭或保存 2D 后恢复最初的 Open 3D Structure；删除 3D 切换和 2D 保存中的重复关闭责任。

## 3. 改动文件

- `web/src/app/InspectorPanels.tsx`
- `web/src/app/InspectorPanels.test.tsx`
- `web/src/app/Molecule2DEditorDialog.tsx`
- `web/src/app/Molecule2DEditorDialog.test.tsx`
- `web/src/app/App.tsx`
- `web/src/app/App.test.tsx`
- `.codestable/issues/2026-07-30-structure-dialog-focus/structure-dialog-focus-fix-note.md`

## 4. 验证

- 3D / 2D / App 定向测试通过：3 个测试文件、99 项测试。
- Web 全量测试通过：44 个测试文件、416 项测试。首次全量运行有一个无关的 Electron 重复导入进度用例在高负载下超时；该用例单独重跑通过，第二次全量运行全部通过。
- Web production build 通过；仅保留 3Dmol direct `eval` 和既有大 chunk 警告。
- 浏览器桌面宽度验证：3D 初始焦点、双向 Tab 循环、直接关闭恢复、3D → 2D 单模态交接、2D Escape 恢复均通过。
- 真实 Ketcher 冷加载后焦点稳定在 Cancel；Shift+Tab 落到可见的 Extended Table，而不是隐藏 cliparea。
- 真实 Ketcher Settings 验证：Tab 保持在内层原生 dialog，Escape 只关闭 Settings，外层编辑器和未保存结构保留。
- 窄屏验证焦点交接和可见焦点循环通过；浏览器控制台无 error / warning。
- `git diff --check` 通过。

## 5. 后续事项

窄屏约 800 px 宽时，2D Editor 仍会延伸到右侧 Inspector 下方，导致右侧画布和 Cancel / Save 区域被遮挡。这是既有的响应式布局缺陷，不属于本次焦点生命周期根因，后续应单独修复。
