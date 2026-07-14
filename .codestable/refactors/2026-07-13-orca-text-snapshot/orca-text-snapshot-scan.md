---
doc_type: refactor-scan
refactor: 2026-07-13-orca-text-snapshot
status: selected
scope: Python engine 与 Web preview ORCA 文本解析
---

# orca-text-snapshot scan

ORCA parser-specific 路径对同一文本约执行 10–13 次全文 regex/line pass。能量、energy table、坐标、电荷/多重度、方法和频率标记由多个函数分别扫描，整体为 O(k·n)。本批只优化 ORCA，并保持 Python engine 与 Web fallback parser 字段一致；Gaussian 因 opt/freq continuation 和振动耦合单独处理。

## ✓ O1 补 ORCA 大文本刻画与基准

- 当前测试覆盖基本能量与坐标，但无重复大文本等价/耗时基线。
- 方法：M-L1-04。

## ✓ O2 Python ORCA snapshot

- `parse_orca`、`orca_energy_table`、`orca_atoms_from_text`、`orca_charge_multiplicity`、`orca_method_from_text` 各自扫描。
- 方法：M-L2-03、M-L2-01。

## ✓ O3 TypeScript ORCA snapshot parity

- Web preview parser 同样分别解析能量、坐标和 metadata。
- 方法：M-L2-03、M-L2-01。

## 明确不做

- 不改变 cclib 全文件解析边界。
- 不改变 parser id、warning、候选顺序或能量单位。
- 不在本批修改 Gaussian。
