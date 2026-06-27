---
doc_type: feature-acceptance
feature: 2026-06-26-vibration-3d-inspection
status: accepted
accepted_at: 2026-06-26
summary: 结构化 vibration modes 已进入 import.preview/project package，3Dmol 结构视图已支持振动播放、内联键长/键角/二面角量测和元素序号标签
tags: [parser, vibration, 3d, measurement, acceptance]
---

# vibration-3d-inspection 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-26
> 关联方案 doc：`.codestable/features/2026-06-26-vibration-3d-inspection/vibration-3d-inspection-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**

- [x] `VibrationDisplacement` / `VibrationalMode` / `CoordinatePreview.vibrationModes` 已落地到 `web/src/domain/sourceParsers.ts`，字段包含 `modeId`、`modeIndex`、`frequencyCm1`、`kind`、`displacements`、可选 intensity/mass/force 字段和 `source`。
- [x] `VibrationDisplacement.atomIndex` 使用 0-based，与 `CoordinatePreview.atoms[]` 对齐；viewer 标签显示层使用 `element + 1-based index`，例如 `C1` / `H2`。
- [x] renderer / project package 的 shape guard 会拒绝 atom count 不匹配、非数值或 atomIndex 越界的 vibration payload，并保留合法 payload。
- [x] `StructureMeasurementMode`、`StructureMeasurement` 和 `AtomLabelMode` 已落到 `web/src/app/structureMeasurements.ts` / `Molecule3DmolViewer.tsx`，覆盖 distance / angle / dihedral / element-index label。

**名词层“现状 → 变化”逐项核对**

- [x] `SourceParseResult` public payload 新增 `CoordinatePreview.vibrationModes`，Python engine、embedded engine、renderer fallback contract 同形。
- [x] `FlowNode` 未复制坐标或振动字段；结构弹窗仍通过 `sourceFileId + sourceCandidateId` 回到 source parse 获取结构数据。
- [x] `frequencyCm1 < 0` 或 imaginary marker 会映射为 `kind="imaginary"`；普通正频映射为 `real`。
- [x] `modeId` 在同一 candidate 内稳定生成；默认播放优先 imaginary mode，没有负频时选第一个有效 mode。

**流程图核对**

- [x] User import → Electron/browser import → Python/embedded/renderer parser → `SourceFile.parse` → `StructurePreviewDialog` → `Molecule3DmolViewer` 的链路均有代码落点。
- [x] `vibfreqs/vibdisps`、Gaussian text fallback、project normalize、structure dialog 默认 mode、3Dmol animation 与 inline inspection 的主流程均已实现并有测试覆盖。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] 导入 Gaussian/common frequency 输出后，candidate 能携带结构化振动模式；位移数量与 atom count 对齐。
- [x] ORCA frequency 输出优先走 Python/cclib full-file path；无法可靠识别时降级为 warning，不伪造 mode。
- [x] 无振动但有 3D 坐标的 source 仍正常显示结构，Play vibration disabled，不出现大段解释性文字。
- [x] 保存/重开项目后，合法 `vibrationModes` 随 `SourceFile.parse` 保留，不依赖重新读取原始 log/out。
- [x] 3D structure 普通态可播放/停止振动；普通 3D 视图内联提供键长、键角、二面角和元素序号 readout。

**明确不做逐项核对**

- [x] 未新增 Gaussian / ORCA job 提交、队列、进程启动或远程计算 API。
- [x] 未新增 IR/Raman 谱图、频率表编辑、模式归属工作流或振动报告导出入口。
- [x] 未引入第二套 Three.js viewer，也没有恢复旧 Three.js measurement / atom-map 代码。
- [x] 项目恢复以结构化 project JSON 为准，不要求读取原始 log/out。
- [x] 文案保持窄口径，没有宣称 Gaussian/ORCA frequency 全版本全任务支持。

**关键决策落地**

- [x] 继续使用 3Dmol.js：`web/src/app/Molecule3DmolViewer.tsx` 承担振动播放和普通 3D 内联检查，不恢复旧 viewer。
- [x] 振动数据作为 canonical structured data：保存于 `files[].parse.candidates[].coordinatePreview.vibrationModes`，项目 normalization / clone / roundtrip 保留合法 payload。
- [x] `CoordinatePreview` 作为当前 active 结构载体扩展；未做大规模重命名。
- [x] 默认 mode 选择策略已在结构 dialog 层落地。
- [x] 普通 3D 视图直接承载内联检查，不再提供全屏检查入口或 measurement toolbar。

**编排层与流程级约束核对**

- [x] Python full-file path 读取 cclib `vibfreqs` / `vibdisps`；text fallback 只覆盖可靠 common blocks。
- [x] warning codes 覆盖 `vibration_unavailable`、`vibration_shape_mismatch`、`vibration_parse_partial`。
- [x] 振动解析失败不使整体 import 失败；坏 payload 被清理或 warning 化。
- [x] 多 candidate / 多帧 source 不跨 candidate 复用 mode；displacements 与同一 candidate 坐标对齐。
- [x] inline atom click selection 由 viewer 处理，不冒泡触发画布节点/edge 选择或弹窗关闭。

**挂载点反向核对**

- [x] 挂载点 M1 `SourceParseResult` public payload：落在 `web/src/domain/sourceParsers.ts` 与 Python/embedded payload。
- [x] 挂载点 M2 `import.preview` extraction hook：落在 `rxnflow/engine.py`、`web/electron/embedded-engine.cjs`、`web/src/domain/vibrations.ts` / renderer fallback。
- [x] 挂载点 M3 project package normalization：落在 `web/src/domain/projectPackages.ts`。
- [x] 挂载点 M4 structure dialog UI：落在 `web/src/app/InspectorPanels.tsx`。
- [x] 挂载点 M5 3Dmol interaction layer：落在 `web/src/app/Molecule3DmolViewer.tsx` 与 `structureMeasurements.ts`。
- [x] 反向 grep：`vibrationModes`、`VibrationalMode`、`vibration_shape_mismatch`、`element-index` 命中均落在上述 runtime、tests 或本 feature spec 内；未发现清单外挂载点。
- [x] 拔除沙盘推演：移除上述五类挂载点后，振动数据无法进入 project/UI、3D 播放和量测入口消失；其余 parser/import/canvas 主链路不需要反向删除。

## 3. 验收场景核对

- [x] **S1 Gaussian frequency full-file**：`tests/test_engine.py` 与 `web/src/domain/sourceParsers.test.ts` 覆盖 candidate 产生 `vibrationModes`，displacements 与 atom count 对齐。
- [x] **S2 ORCA/cclib frequency path**：Python full-file cclib 读取逻辑已实现；无 cclib 或不可可靠 text parse 时 warning 降级，不伪造数据。
- [x] **S3 无振动 3D source**：component/browser 验证 Play disabled，结构仍显示，且无“没有振动数据”大块解释文案。
- [x] **S4 project roundtrip**：`web/src/domain/projectPackages.test.ts` 覆盖保存/打开后合法 vibration payload 保留，坏 payload 清理。
- [x] **S5 播放/停止振动**：`web/src/app/Molecule3DmolViewer.test.tsx` 覆盖 Play toggle 与振动帧渲染行为。
- [x] **S6 默认 imaginary mode**：`InspectorPanels.tsx` 默认 mode 选择优先 imaginary，测试和代码 review 确认。
- [x] **S7 inline measurement**：普通 3D 视图不显示 measurement toolbar，点击 1/2/3/4 个原子直接显示 C1 / distance / angle / dihedral。
- [x] **S8-S10 distance/angle/dihedral**：`web/src/app/structureMeasurements.test.ts` 覆盖 Å 距离、° 角度和 0/180° 附近二面角数值稳定。
- [x] **S11 element-index labels**：viewer label overlay 显示 `元素 + 1-based coordinate order`。
- [x] **S12 UI 事件边界**：viewer atom click selection 不调用画布 selection，不出现 fullscreen toolbar。
- [x] **S13 bad payload**：shape guard 丢弃非数值、长度不匹配、atomIndex 越界 mode 并返回 warning。

**前端浏览器验证**：已在 `http://127.0.0.1:5173/` 验证 demo 无 3D coords 时结构 dialog 的 Play disabled、界面不出现 `3Dmol.js` / `全屏打开` / `没有振动` 等多余注释文字；inline measurement 的真实 atom click 场景由组件测试覆盖，因为当前 demo 数据不足以肉眼触发。

## 4. 术语一致性

- `VibrationalMode` / `VibrationDisplacement`：设计、TypeScript contract、Python/embedded payload 和 tests 使用一致。
- `StructureMeasurement` / `StructureMeasurementMode`：renderer helper、viewer UI 和 tests 使用一致。
- `AtomLabelMode = "element-index"`：代码命名与设计一致；UI 展示为 `C1` / `H2`。
- 防冲突：未新增旧 `Three.js measurement`、`atom-map`、`frequency table` 或 `IR/Raman spectrum` runtime 概念。

## 5. 架构归并

- [x] `.codestable/architecture/core-platform.md`：已补 local engine `import.preview` 可返回 vibration modes、cclib/text fallback 边界、warning codes、shape guard 与不伪造数据约束。
- [x] `.codestable/architecture/web-workbench.md`：已补 structure dialog / 3Dmol viewer 支持 vibration playback、inline measurement/labels，并说明这是基于 3Dmol 的新实现，不是恢复旧 Three.js。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已在 Web Renderer / Local Engine / Desktop Target 当前形态里补结构化 vibration data 和 3Dmol 新能力。
- [x] `.codestable/attention.md`：本 feature 没暴露每个 feature 都会重复踩的新工作流规则；不更新。

## 6. requirement 回写

- [x] `requirement: structure-vibration-inspection` 指向 draft req，已将 `.codestable/requirements/structure-vibration-inspection.md` 从 `draft` 升为 `current`。
- [x] `implemented_by` 已更新为 `[core-platform, web-workbench]`。
- [x] 已追加 2026-06-26 变更日志，保留原始愿景、用户故事和边界。
- [x] `.codestable/requirements/VISION.md` 已把 `structure-vibration-inspection` 从 draft 移入 current。

## 7. roadmap 回写

- [x] 本 feature design frontmatter 没有 `roadmap` / `roadmap_item` 字段，属于非 roadmap 起头；无需更新 roadmap items 或主文档。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露需要补入 `.codestable/attention.md` 的通用环境 / 工具 / 工作流信息。

## 9. 遗留

- 后续优化点：更完整的 Gaussian/ORCA frequency fixture corpus、mode browser / 频率表 / IR-Raman 谱图可另起 feature。
- 已知限制：当前只承诺 common frequency 输出的结构化振动 payload；不可可靠识别的输出只返回 warning，不伪造 mode。
- 顺手发现：`rxnflow/engine.py` 与 `web/electron/embedded-engine.cjs` 仍偏胖，后续 parser 模块化适合单独走 `cs-refactor`。
