---
doc_type: issue-fix-note
slug: canvas-energy-mode-channels
component: web-graph-canvas
status: fixed
fixed_at: 2026-06-09
tags: [web-workbench, graph-canvas, energy-profile, gaussian, solvation]
---

# Canvas Energy Mode Channels Fix Note

## Problem

用户验收画布能量模式时指出：

- 选择自由能后节点仍显示缺失，且符号仍可能表现成 `△E`。
- 溶剂化模式错误地显示了气态电子能或单对象 solvation correction。
- 溶剂化自由能不应从一个 gas log 直接读出；它需要 gas/solution 两个 log 配对后按 `Gsol = Ggas(1M) - Egas + Esol` 计算。

## Root Cause

- `GraphCanvas` 的能量模式是局部 state，未稳定同步到 `WorkbenchShell` 的 `energy.compute` 选项。
- 画布只要发现一个匹配 profile，就完全跳过对象级 fallback，导致 profile 未覆盖的新节点显示 missing。
- 单对象溶剂化 correction 曾被当作 `gsol` fallback，语义上会把“校正项”误显示成“溶液自由能”。
- Web fixture parser 只投影 Gaussian `SCF Done` 电子能，未投影 `Sum of electronic and thermal Free Energies`。
- fixture 保存项目时会把对象 `thermochemistry` 写成 `{}`，导致重新打开后自由能通道丢失。
- 旧项目 rehydrate 时如果旧对象和新解析对象 label 都匹配 raw log，选择逻辑可能拿到仍缺自由能的旧对象。
- 项目文件点击创建节点时会优先复用 `registeredObjectIds` 指向的旧对象；旧对象缺 `ggas` 时，即使 raw log 已经能重新解析，新增节点仍会继续显示自由能缺失。

## Fix

- `GraphCanvas` 改为受控接收 `energyDisplayOptions`，由 `WorkbenchShell` 同步到 `energy.compute`：
  - Electronic -> `energy_key=electronic`, `energy_source=energies`
  - Free -> `energy_key=ggas`, `energy_source=thermochemistry`
  - Solvation -> `energy_key=gsol`, `energy_source=thermochemistry`
  - Corrected -> electronic + correction policy
- 节点相对能符号由当前能量模式决定：自由能显示 `△G`，溶剂化显示 `△Gsol`。
- profile 结果只覆盖其包含的节点；profile 未覆盖的节点继续用对象能量 fallback。
- 溶剂化模式只接受明确的 `thermochemistry.gsol` / solution free-energy key，不再从电子能或 correction fallback。
- `platform._object_summary` 额外输出 `energies` / `thermochemistry` 数值 map，供 web 画布和恢复流程直接读取。
- Web fixture Gaussian parser 投影 `ggas`，fixture 保存保留对象 `energies` / `thermochemistry`。
- 旧项目 raw rehydrate 优先选择“不再需要 hydration”的新解析对象，避免继续指向缺少 `ggas` 的旧对象。
- 项目文件复用已登记对象前会检查对象是否仍需要 raw hydration；缺结构、电子能或 gas 自由能时不复用旧对象，改为从项目 raw 文件重新解析。

## Verification

- `cd web && npm run test -- WorkbenchShell.test.tsx --run`
- `cd web && npm run test -- GraphCanvas.test.tsx --run`
- `python3 -m unittest tests.test_solution_energy_pairs`
- `cd web && npm run build`
- `git diff --check`
- Browser clean tab smoke: `http://127.0.0.1:5173/?qa=energy-mode-clean`
  - 从 `Ni-fxc-alpha` 项目文件创建节点。
  - Electronic 显示 `△E`。
  - Free 显示 `△G` 且不缺失。
  - Solvation 显示 `△Gsol 缺失`，没有使用气态电子能 fallback。
  - Console errors/warnings: none in clean tab.

## Remaining Boundary

- 当前只修正通道语义和旧项目 raw rehydrate；自动识别并管理 gas/solution log 配对的交互工作流仍应作为后续 feature 继续推进。
- Build 仍有既有 Vite large chunk warning，不影响本次能量模式修复。
