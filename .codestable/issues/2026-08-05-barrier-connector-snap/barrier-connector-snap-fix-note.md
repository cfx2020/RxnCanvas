---
doc_type: issue-fix
issue: 2026-08-05-barrier-connector-snap
status: verified
path: fast
fix_date: 2026-08-05
tags: [canvas, pointer, barrier, magnetism, interaction]
---

# 势垒曲线连接缺少吸附反馈修复记录

## 1. 问题与根因

从节点底部势垒手柄拖向其他节点时，旧实现只在松手阶段通过 DOM 卡片命中决定目标；拖动阶段没有经过普通连线使用的磁吸计算，也没有给目标中间端口添加吸附高亮。初次修复又只处理了卡片左侧中端口，因此当目标节点位于拖拽源左边时，鼠标接近的是卡片右侧中端口，依然无法进入磁吸范围或显示轨道。

## 2. 修复内容

- 势垒磁吸候选同时包含目标卡片左、右两个中间端口，并按鼠标距离选择最近一侧；不会误吸到左上方 release 端口。
- 势垒拖动阶段在草稿中记录 `snapTargetSide`，曲线端点进入范围后锁定对应的左侧或右侧中端口。
- 目标节点分别使用 `is-barrier-snap-target-left` / `is-barrier-snap-target-right` 点亮实际命中的轨道。
- 松手阶段优先使用磁吸目标创建势垒，并保留原有卡片 DOM 命中作为回退。

## 3. 验证结果

- 定向 Vitest：4 个测试文件、32 项测试通过。
- 全量 Vitest：45 个测试文件、445 项测试通过。
- `npm run build`：通过；仅有既有的 3Dmol direct eval 与大 chunk 警告。
- 浏览器真实双向拖拽：`TS1 (Endo) → Endo Adduct` 点亮目标左侧中轨道；`Endo Adduct → TS1 (Endo)` 点亮目标右侧中轨道。两种方向下画布均进入 `is-connection-snapped`，预览曲线端点锁定，松手后成功生成势垒。
- `git diff --check`：通过。

## 4. 影响范围

仅调整势垒草稿的拖动、吸附、目标高亮和完成逻辑；普通 path、addition、release 连线的端口选择保持不变。
