---
doc_type: issue-fix-note
status: implemented
date: 2026-06-28
slug: idle-status-light-gpu-load
issue: Electron GPU helper process stays busy while the workbench is idle
scope: web renderer CSS, packaged desktop app
---

# idle-status-light-gpu-load 修复记录

## 背景

用户截图显示 macOS Activity Monitor 中 `RxnFlow Helper` GPU 进程约 87% CPU / 74% GPU，而 `RxnFlow Helper (Renderer)` 只有约 6.8% CPU。高负载更像 Chromium/Electron GPU compositor 被持续动画驱动，而不是 Python/cclib 解析或 React JS 主线程长任务。

## 根因

`web/src/app/workbench.css` 中缺 sol / 解析失败状态灯使用了 `missing-solvation-pulse 1.6s ease-in-out infinite`：

- 节点状态灯 `.status-light-node.status-light-missing`；
- 侧栏缺配对 sol 状态灯 `.project-file-phase-badges.has-missing-solution`；
- 侧栏解析失败状态灯 `.project-file-phase-badges.has-parse-error`。

这些灯在项目空闲时也会一直存在，且动画改变 `transform` / `opacity` 并带有发光 `box-shadow`，会让 Electron GPU 进程持续合成。项目里文件/节点越多，空闲 GPU 负载越容易被放大。

## 修复

- 移除 `missing-solvation-pulse` 常驻无限动画和对应 keyframes。
- 保留状态灯颜色与静态发光视觉，缺 sol / 解析失败仍然可见。
- 保留 `.project-file-progress` 的解析中进度条动画；它只在 pending parser job 存在时渲染，不属于空闲常驻动画。

## 验证

- `npm --prefix web run test -- App.test.tsx --run`：通过，59 tests。
- Playwright 页面检查 `http://127.0.0.1:5173/`：
  - 页面标题 `RxnFlow Workbench`；
  - 注入 80 组侧栏缺 sol / 解析失败灯和 80 个节点缺 sol 灯后，所有探针 `animationName` 均为 `none`；
  - `document.getAnimations().filter(a => a.playState === "running")` 返回 `0`；
  - console 无 error / warn。
- `npm --prefix web run desktop:pack`：通过，重新生成 `/Users/linsay/Desktop/code/rxnflow/web/release/mac-arm64/RxnFlow.app`。
- `npm --prefix web run desktop:release:smoke`：通过。
- `npm --prefix web run desktop:smoke`：通过。

## 仍需观察

- 3D 视图手动播放振动时仍会持续使用 WebGL/GPU，这是预期行为；暂停或关闭 3D 视图应释放动画。
- 启动恢复 spinner 和解析中进度条仍是短时动画；如果 Activity Monitor 仍显示长期高 GPU，需要再抓取当时打开的面板和 running animation / WebGL 状态。
- 构建仍有既有 3Dmol direct `eval` 和 large chunk warning，本次未处理，且与这次空闲状态灯 GPU 负载不是同一类问题。
