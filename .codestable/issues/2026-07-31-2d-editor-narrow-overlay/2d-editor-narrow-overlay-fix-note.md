# 2026-07-31 2D Editor narrow-screen overlay — fix note

- 流程：issue fast-track（report → fix-note）
- 状态：已修复，待用户确认 commit
- 入口标注：最初记录于 `2026-07-30-structure-dialog-focus/structure-dialog-focus-fix-note.md` 第 5 节

## 现象

约 800px 窄屏下，从 Inspector 打开「Open 3D Structure」→「Edit 2D structure」后，2D 结构编辑器被右侧 Inspector 遮挡，Cancel / Save 按钮无法点击。

## 根因

响应式侧栏层级在历次调整中被提升，但 2D 编辑器 scrim 未同步跟进，导致窄屏下 Inspector 盖住编辑器：

| 元素 | z-index |
| --- | --- |
| `.molecule-editor-scrim`（2D 编辑器遮罩） | 320 |
| 窄屏 Inspector | 1450 |
| 窄屏左侧 hover rail | 2900 |
| desktop titlebar | 3000 |
| Settings | 3200 |

800×900 实测中，2D Editor 与 Inspector 横向重叠约 266px，Cancel / Save 的中心点 `elementFromPoint` 命中 Inspector 而非按钮自身。

不是弹窗尺寸或 DOM 结构问题，纯粹是层级冲突回归。

## 修复

单行 CSS 调整，`web/src/app/workbench.css`：

```diff
 .molecule-editor-scrim.has-right-sidebar {
   --structure-left-rail: 0px !important;
   --structure-right-rail: 0px !important;
-  z-index: 320 !important;
+  z-index: 2950 !important;
 }
```

scrim 提升至 2950，高于左右侧栏（1450 / 2900），仍低于 titlebar（3000）和 Settings（3200）。不改 Dialog DOM、Ketcher 尺寸或桌面布局。

## 验证

### 浏览器实测（in-app browser，Chromium）

800×900（CSS px）：

- scrim z-index 2950，Inspector 1450，rail 2900，titlebar 3000
- Cancel 中心 (650.79, 109.38) `elementFromPoint` 命中 Cancel 按钮自身
- Save 中心 (725.52, 109.38) `elementFromPoint` 命中 Save 按钮自身
- 鼠标移至左边缘 (1, 450)，命中 scrim 而非 rail，rail 未被 hover 唤出
- titlebar 中心命中 canvas-tab-bar，标题栏仍在编辑器之上

1280×900（桌面回归）：

- scrim 2950 高于 Inspector 90，Cancel / Save 均命中自身
- 桌面布局尺寸无变化

### 前端测试

```
npm run test -- --run src/app/Molecule2DEditorDialog.test.tsx src/app/App.test.tsx
Test Files  2 passed (2)
Tests  90 passed (90)
```

### 生产构建

```
npm run build  →  ✓ built in 1.87s
```

## 风险与回归边界

- 桌面宽屏下 Inspector z-index 为 90，scrim 2950 不影响既有行为。
- scrim 2950 低于 titlebar 3000 与 Settings 3200，标题栏与设置弹窗仍可覆盖编辑器。
- JSDOM `toBeVisible()` 无法发现此类遮挡，本轮以真实浏览器 `elementFromPoint` 作为验收，未新增自动化遮挡断言。

## 受影响文件

- `web/src/app/workbench.css`（单行 z-index 调整）
