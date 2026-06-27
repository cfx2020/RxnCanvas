---
doc_type: issue-fix
issue: 2026-06-27-barrier-label-overlap
status: fixed
severity: medium
tags: [ui, canvas, layout, barrier-label, energy-ruler]
fixed_at: 2026-06-27
---

# barrier-label-overlap / energy-ruler fix note

## 问题

点击能量布局后，旧的能垒标注用 source / target 之间的斜向折线表达，视觉上像锐角连接线；部分情况下胶囊还会靠近或覆盖过渡态节点卡片。用户期望改成更接近能量图的表达：source/reference 能级水平虚线 + TS 下方垂直虚线双箭头 + 居中的 ΔG‡ 胶囊。

## 根因

`createBarrierSegment()` 以前把能垒几何绑定到 source 底部和 target 侧边锚点，天然会生成斜向连接结构；自动能量布局也只按节点卡片自身位置缩放，没有把 TS 下方的“能垒尺端点”作为能量锚点，所以标注与节点之间容易挤压。

## 修复

- `web/src/app/canvasDrawing.ts`
  - 能垒标注改为 energy-ruler 几何：垂直双箭头固定在 target/TS 卡片中心线下方，source/reference 能级用水平虚线连接到该尺。
  - 给尺子设置最小可视高度，避免 source 与 TS 很近时胶囊挤到节点上。
- `web/src/app/canvasGeometry.ts`
  - 自动能量布局改为让普通节点的中心能级锚点、transition 节点底部下方的能垒尺端点共用同一套相对能量比例尺。
  - 这样 TS、反应物/产物和能垒尺的相对位置更像真实能量图。
- `web/src/app/workbench.css`
  - 垂直能垒箭头也改成虚线，和水平参考线统一成“能量尺”风格。

## 验证

- `npm --prefix web run test -- canvasDrawing canvasGeometry --run`：通过，覆盖 energy-ruler 路径、最小尺高，以及 transition 布局锚点。
- `npm --prefix web run build`：通过。
- 浏览器验证：在 `http://127.0.0.1:5173/` reload 后点击 Auto layout，并拖出一个 butadiene → TS1 的能垒标注；页面中出现水平虚线 + TS 下方垂直双箭头 + 居中 ΔG‡ 胶囊，未再形成锐角连接。

## 备注

这次按用户最新反馈把能垒显示语义从“连接线”改为“能量尺”，属于 UI 几何和自动布局比例尺调整，不改变项目数据结构。

## 2026-06-27 追加修复：水平虚线锚到 reference 节点圆点

用户指出能垒参考虚线仍然在节点下方悬空，应该直接连到左侧中间体的连接圆点。

修复：
- `createBarrierSegment()` 的 `guidePath` 起点改为 reference 节点朝向 peak/TS 的 edge connector anchor：
  - peak 在 reference 右侧时，锚到 reference 右侧输出圆点；
  - peak 在 reference 左侧时，锚到 reference 左侧输入圆点。
- 当最小能垒尺高度要求 reference 能级线低于圆点时，虚线会从圆点先竖直延伸再水平接到 TS 下方的垂直双箭头，避免悬空断线。

验证：
- `npm --prefix web run test -- canvasDrawing CanvasWorkspace App canvasGeometry energyDisplay --run` 通过。
- `npm --prefix web run build` 通过。
- 浏览器验证：reload `http://127.0.0.1:5173/` 后拖出 `1,3-Butadiene → TS1 (Endo)` 能垒标注，`barrier-guide` 为 `M -230 -63 L -230 178 L 115 178`，起点 `-230,-63` 与左侧节点右侧连接圆点世界坐标一致。
