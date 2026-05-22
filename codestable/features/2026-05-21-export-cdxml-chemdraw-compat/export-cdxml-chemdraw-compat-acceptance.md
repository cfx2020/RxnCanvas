# export-cdxml-chemdraw-compat 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-21
> 关联方案 doc：codestable/features/2026-05-21-export-cdxml-chemdraw-compat/export-cdxml-chemdraw-compat-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层：

- [x] Root document attributes：`_render_cdxml()` 生成的 root 保留 `CreationProgram="RxnFlow"`，并新增 `LabelFont`、`LabelSize`、`CaptionFont`、`CaptionSize`、`LineWidth`、`BoldWidth`、`color`、`bgcolor`。
- [x] Page attributes：`page` 保留 `id`、`BoundingBox`，并新增 `HeaderPosition`、`FooterPosition`。
- [x] Group attributes：`group` 保留 `Integral="yes"`，并新增 `BoundingBox`、`Z`。
- [x] Graphic / arrow / text object shape：`graphic`、`arrow`、`t` 均带 `id` 和 `Z`；`arrow` 带 `BoundingBox`、`FillType="None"`、`LineWidth`；`t` 带 `CaptionJustification`、`Justification`、`LineHeight`。
- [x] Object id discipline：XML 测试枚举所有带 `id` 的 generated elements，并断言单文档内唯一。

流程图核对：`EnergyDiagramRoute -> _render_cdxml -> root/page/group -> axis graphics/title text -> state lines/arrows/labels/values -> XML parseable CDXML bytes` 均在 `rxnflow/export.py` 和 `tests/test_report_export_baseline.py` 有落点。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] Root/page/group 具有稳定 document attributes：`test_cdxml_writer_outputs_editable_energy_diagram_objects` 解析 XML 后逐项断言。
- [x] Graphic、arrow、text 对象都有 id、BoundingBox 和 Z：同一测试覆盖 state line、arrow、text shape。
- [x] Text 使用 `<t>` + `<s>` 并带 justification / line height：同一测试检查 `<t>` 和 `<s>` 属性。
- [x] Object ids 单文档唯一：同一测试检查所有 `id` 无重复。
- [x] CDXML 可被 XML parser 解析：同一测试和 missing-point 测试均调用 `ElementTree.fromstring()`。
- [x] CDX 仍不开放：同一测试请求 `formats=("cdx",)` 并断言 `invalid_input target=formats`。

明确不做逐项核对：

- [x] 不生成 `.cdx` binary，不新增 ExportFormat。
- [x] 不引入 ChemDraw GUI、PyQt、Open Babel、RDKit 或 binary converter。
- [x] 不生成 molecule-level CDXML、reaction scheme 或 bond/atom semantics。
- [x] 不复制参考项目代码、随机 id 或 PyQt UI；只参考其 CDXML 对象结构方向。
- [x] 不修改 Web / Project Content；实现只涉及 core export writer、report export tests 和 CodeStable 文档。

## 3. 验收场景核对

- [x] S1 root attributes：单测检查 `CreationProgram`、`LabelFont`、`CaptionFont`、`LineWidth`、`color`、`bgcolor`。
- [x] S2 page attributes：单测检查 `BoundingBox`、`HeaderPosition`、`FooterPosition`。
- [x] S3 group attributes：单测检查 `Integral`、`BoundingBox`、`Z`。
- [x] S4 unique ids：单测检查所有 generated ids 唯一。
- [x] S5 state line shape：单测检查 state line `GraphicType="Line"`、`LineWidth`、`BoundingBox`、`Z`。
- [x] S6 arrow shape：单测检查 `Tail3D`、`Head3D`、`BoundingBox`、`FillType`、`LineWidth`、`Z`。
- [x] S7 text shape：单测检查 `<t>` 的 `p`、`BoundingBox`、`CaptionJustification`、`Justification`、`LineHeight`、`Z` 和子 `<s>` 的 `font`、`size`、`color`、`face`。
- [x] S8 missing point 不生成 state line：`test_cdxml_missing_point_does_not_create_fake_state_line` 对 missing profile 断言 state line 数量为 2，并检查 line y 坐标不伪造 missing 点。
- [x] S9 `cdx` unsupported：单测断言 `invalid_input target=formats`。

证据：

- `python3 -m unittest tests.test_report_export_baseline`：15 tests OK。
- `python3 -m unittest discover`：250 tests OK。
- `python3 codestable/tools/validate-yaml.py --file codestable/features/2026-05-21-export-cdxml-chemdraw-compat/export-cdxml-chemdraw-compat-checklist.yaml --yaml-only`：通过。
- `python3 codestable/tools/validate-yaml.py --file codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-items.yaml --yaml-only`：通过。

## 4. 术语一致性

- CDXML ChemDraw Compatibility：只用于结构兼容，不声明 ChemDraw roundtrip 完整高保真。
- CDXML Object ID Discipline：代码和测试均使用 generated object id unique / stable increment 语义。
- CDXML Text Object：实现仍为 `<t>` + `<s>`。
- CDX Boundary：`ExportFormat` 仍只有 `png`、`cdxml`、`xlsx`；`cdx` 请求仍 unsupported。

## 5. 架构归并

- [x] `codestable/architecture/core-platform.md`：Report Export 稳定协议已补充 CDXML document/page/group/object attributes、generated id uniqueness、Z/BoundingBox/LineWidth/text shape，以及 `cdx` unsupported 边界。
- [x] `codestable/architecture/ARCHITECTURE.md`：总入口 Report Export 现状已补充 CDXML 对象属性纪律和 CDX 边界。

## 6. requirement 回写

本 feature 是 CDXML artifact 结构增强和兼容性回归，不新增独立用户故事；现有 report export 能力边界已通过 architecture 和 roadmap 归并，无 requirement 新建或更新。

## 7. roadmap 回写

- [x] `codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-items.yaml`：`export-cdxml-chemdraw-compat` 已标为 `done`，feature 指向 `2026-05-21-export-cdxml-chemdraw-compat`。
- [x] `codestable/roadmap/rxnflow-report-export-quality/rxnflow-report-export-quality-roadmap.md`：第 5 节子 feature 清单已同步 `done` 状态和落地说明。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的新通用工作流内容。现有规则已覆盖：报告导出 core 测试、YAML 校验、CDX 边界和前端视觉改动需浏览器验证。

## 9. 遗留

- 已知限制：当前只做 CDXML XML 结构回归，未在 ChemDraw 桌面程序内做 roundtrip 验证。
- 已知限制：仍不支持 CDX binary、molecule-level CDXML、reaction scheme、bond/atom semantics。
- 后续优化点：Web Report Export Panel 的 fixture/local-http E2E 验证由 roadmap 后续 `web-report-export-verification` 承接。
