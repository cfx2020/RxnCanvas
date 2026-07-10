---
doc_type: issue-fix
issue: 2026-07-10-3d-vibration-playback-delay
status: implemented
path: standard
fix_date: 2026-07-10
related: [3d-vibration-playback-delay-analysis.md]
tags: [3d-viewer, vibration, persistence, autosave, performance]
---

# 3D 振动播放延迟修复记录

## 1. 实际采用方案

采用已确认的方案 A，并按用户补充固定为 parser 顺序中的第一个振动模式：

- 新导入、renderer project normalization 与 Electron project save 只保留 `vibrationModes[0]` 的完整位移。
- 其他振动模式继续保存 frequency、kind、IR/Raman 等 metadata，但位移数组保持为空，避免恢复此前全量 normal modes 造成的项目 JSON 与 renderer 内存暴涨。
- Structure Preview 只播放 `vibrationModes[0]`。旧轻量项目缺少位移时，第一次点击执行 hydration；成功后立即自动播放，不再要求第二次点击。
- autosave dirty signature 记录首个 mode 的位移数量。旧项目从空位移补载为完整位移后会触发保存，后续打开可直接播放。

## 2. 改动文件清单

- `web/src/domain/vibrations.ts` — 把“删除全部 mode 位移”改为“只保留第一个 mode 位移”。
- `web/src/domain/projectPackages.ts` — project package normalize 使用有界振动持久化策略。
- `web/electron/project-store.cjs` — Electron 保存层使用同一策略，防止二次瘦身删除第一个 mode。
- `web/src/app/InspectorPanels.tsx` — 播放模式固定为 `modes[0]`；legacy hydration 完成后自动开始播放。
- `web/src/app/App.tsx` — autosave key 与保存结果比较识别首个 mode 位移数量变化。
- `web/src/domain/projectPackages.test.ts` — 验证第一个合法 mode 保留位移、后续合法 mode 仅保留 metadata、非法 mode 被丢弃。
- `web/src/app/InspectorPanels.test.tsx` — 验证即使后续 mode 已有位移，UI 仍补载并播放第一个 mode，且只需一次点击。
- `web/electron/smoke.cjs` — 验证 Electron 对 parse 顶层与 candidate preview 都只保留第一个 mode 位移。
- `.codestable/architecture/web-workbench.md` — 回写当前振动播放、持久化与 legacy hydration 现状。
- `.codestable/issues/2026-07-10-3d-vibration-playback-delay/` — report、analysis 与本 fix-note。

## 3. 验证结果

- 定向 Vitest：`npm run test -- src/domain/projectPackages.test.ts src/app/InspectorPanels.test.tsx --run`，2 files / 13 tests 通过。
- 完整 Web 测试：`npm run test -- --run`，41 files / 366 tests 通过。
- Web 生产构建：`npm run build` 通过；仅保留既有 3Dmol direct eval 与大 chunk warning。
- Electron smoke：`npm run desktop:smoke` 通过，包含新增的首个 vibration mode persistence 检查。
- 浏览器桌面验证：通过应用自身的 project package 打开路径载入 3 原子、2 mode 临时测试项目；Play 按钮首次点击可用，约 275 ms 后变为 Pause，未出现灰色等待或第二次点击。
- 浏览器窄屏验证：临时窄屏 viewport 下 structure dialog、3D pane、viewer 与 Pause 按钮均在可视边界内，无文字或控件重叠。
- 浏览器控制台：0 条 error。

## 4. 遗留事项

- 已被旧版本保存为 metadata-only 且工作区 source 已缺失的项目，无法凭空重建历史位移，需要重新导入对应频率输出；这属于缺失源数据的不可恢复场景。
- 当前 UI 只播放第一个 mode。未来若增加 mode selector，第二个及后续 mode 应设计独立的按需加载或 sidecar contract，不在本次 bug 修复中扩展。
