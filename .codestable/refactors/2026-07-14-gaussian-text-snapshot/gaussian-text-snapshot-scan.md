---
doc_type: refactor-scan
refactor: 2026-07-14-gaussian-text-snapshot
status: selected
scope: Python/Web Gaussian 核心文本解析与振动索引
---

# gaussian-text-snapshot scan

Gaussian preview 路径两端均约有 20+ 次全文扫描。Link1 下多个字段刻意使用不同 first/last/全局存在性语义，振动解析还依赖调用方 atom count，因此拆成核心 snapshot、振动 index 和 cclib context 复用三层。

## ✓ G1 大文本刻画与基准

- 锁定 Link1、多 orientation、跨 job 能量、route/basis/formula、solvent、termination/runtime 和振动 mode/warning。
- 方法：M-L1-04。

## ✓ G2 Python 核心 GaussianTextSnapshot

- 收敛能量、坐标、charge/spin、route、method、formula、solvent、termination/runtime 扫描。
- 方法：M-L2-03、M-L2-01。

## ✓ G3 TypeScript 核心 snapshot parity

- Web preview 保持同构语义。
- 方法：M-L2-03、M-L2-01。

## ✓ G4 GaussianVibrationIndex

- 核心 snapshot 不存 mode；单独索引 frequency 行并支持任意 atom count。
- Python 与 TS 分步实施。
- 方法：M-L2-03、M-L2-01。

## ✓ G5 full-file cclib context 复用

- 私有 context 让 text result、snapshot 和 vibration index 供 cclib fallback 复用；不改变 cclib 标准字段权威性。
- 方法：M-L1-01、M-L4-01。

## 明确不做

- 不改变 `SourceParseResult` 公开结构。
- 不把 snapshot/index 暴露给 renderer。
- 不修改 cclib-owned 能量、坐标、振动字段优先级。
