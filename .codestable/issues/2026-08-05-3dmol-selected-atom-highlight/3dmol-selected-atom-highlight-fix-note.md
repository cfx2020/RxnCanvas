---
doc_type: issue-fix
issue: 2026-08-05-3dmol-selected-atom-highlight
status: verified
path: fast
fix_date: 2026-08-05
tags: [structure, 3d, 3dmol, measurement, selection, visual-feedback]
---

# 3D 量测原子缺少选中高亮修复记录

## 1. 问题与根因

3D 结构量测已经能记录点选原子并计算键长、键角和二面角，但选中样式通过 `addStyle` 叠加在原有 Jmol 球体样式上。3Dmol 在解析球体颜色时仍会应用基础样式的 `colorscheme`，导致指定的选中颜色被覆盖，用户只能看到量测读数，无法辨认当前选中了哪些原子。此外，3Dmol 拖动旋转结束后浏览器会补发一次 `click`，旧实现把它当成空白单击，意外清除了已经选中的原子。

## 2. 修复内容

- 抽出统一的基础球棍样式，继续使用 Jmol 配色、`0.13` 键半径和 `0.28` 原子球缩放。
- 选中原子改用 `setStyle` 替换对应原子的球体样式，移除会覆盖高亮色的球体 `colorscheme`。
- 选中球体使用更明亮的浅蓝色 `#94caff`，同时保持 `0.28` 缩放，不改变原子大小。
- 记录指针按下位置，移动超过 `4px` 时判定为拖动；拖动旋转后的补发 `click` 不再清除选择。
- 保留原有键样式和量测选择逻辑；真正点击 3D 画布空白处仍会清除选择。

## 3. 验证结果

- 定向 Vitest：`Molecule3DmolViewer.test.tsx` 7 项测试通过。
- TypeScript：`npx tsc -b --pretty false` 通过。
- 全量 Vitest：45 个测试文件、446 项测试通过。
- `npm run build`：通过；仅保留既有的 3Dmol direct eval 与大 chunk 警告。
- 浏览器真实 WebGL 验证：点选两个原子后，两颗原子均显示明亮浅蓝色高亮，球体尺寸没有变化，读数显示 `H2 – H3 · 1.41 Å`；拖动空白区域旋转模型后选择保持，真正点击空白区域后高亮和读数一并清除。

## 4. 影响范围

仅调整 3Dmol 结构查看器的基础样式复用和选中原子样式覆盖方式；坐标解析、量测数学、振动播放、2D 结构预览和画布节点样式均未改变。
