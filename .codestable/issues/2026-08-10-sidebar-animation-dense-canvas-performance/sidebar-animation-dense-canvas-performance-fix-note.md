---
doc_type: issue-fix
issue: 2026-08-10-sidebar-animation-dense-canvas-performance
path: fast-track
fix_date: 2026-08-10
tags: [web, performance, canvas, sidebar]
---

# 侧边栏动画与密集画布卡顿修复记录

## 1. 问题描述

- 上一轮性能优化后，侧边栏收合时画布宽度先瞬间跳到终态，侧边栏再单独滑动，动画显得生硬且割裂。
- 原来的六节点演示图不足以代表真实项目；节点数量增加后，二维画布平移仍有明显卡顿。

## 2. 根因

- `web/src/app/workbench.css` 在桌面布局中禁用了 `grid-template-columns` 过渡，工作区列宽和侧边栏位移动画失去同步。
- 节点卡片及其内部控件使用多层 `backdrop-filter`。平移整张 `canvas-world` 时，大量可见节点需要持续重绘模糊背景，合成层优化无法消除这部分绘制成本。

## 3. 修复方案

- 恢复工作区列宽的 190ms 同步过渡，并与左右侧栏现有的 transform 时长和缓动保持一致。
- 复用现有 `is-live-pan` 手势状态，只在画布实时平移期间关闭节点及节点控件的背景模糊和样式过渡；手势提交后自动恢复静止态视觉。

## 4. 改动文件清单

- `web/src/app/workbench.css`

## 5. 验证结果

- 浏览器逐帧采样确认：左侧栏展开时，project rail、工作区左边界和画布宽度在同一 190ms 窗口内连续变化，不再瞬间跳变。
- 真实滚轮路径确认：`is-live-pan` 在滚动期间激活，停止约 70ms 后移除，节点静止态效果正常恢复。
- 密集画布临时压测：24 个可见节点的同段平移，平均帧间隔从约 40.24ms 降至 20.06ms，p95 从约 49.9ms 降至 33.5ms。
- 桌面布局和 1180px 以下窄屏布局均完成浏览器检查，无新增横向溢出或侧栏遮挡。
- `npm run test -- src/app/App.test.tsx src/app/CanvasWorkspace.test.tsx src/app/appCanvasEffects.test.ts`：97 项通过。
- `npm run test`：45 个测试文件、446 项测试全部通过。
- `npm run build`：通过；仅保留既有的 3Dmol 直接 eval 和大 chunk 警告。

## 6. 遗留事项

- 当前优化针对画布平移热路径；如果真实超大项目仍需要更高帧率，下一步应使用真实项目规模继续评估可见节点裁剪或分层缓存，而不是继续用小型演示图估算。
