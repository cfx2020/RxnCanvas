---
doc_type: refactor-apply-notes
refactor: 2026-07-13-orca-text-snapshot
status: completed
---

# orca-text-snapshot apply notes

## 步骤 1：刻画与基准

- 新增包含多能量、多坐标段、溶剂、电荷/多重度、method、frequency 和终止状态的约 149KB ORCA 文本。
- 深度锁定 Python/TypeScript 完整 payload。
- 基线：Python 约 35.97–39.57ms/parse；Web 约 1.47–1.50ms/parse。

## 步骤 2：Python snapshot

- `parse_source_preview` ORCA 分支只构建一次 `OrcaTextSnapshot`。
- 能量、energy table、坐标、电荷/多重度、method、formula、solvent、TS evidence 和 vibration warning 复用快照。
- 保留跨行 regex、first/last 和 FINAL-over-Total 语义。
- 结果：约 23.99–26.88ms/parse，耗时下降约 25%–33%。
- Python 全量 36 项通过。

## 步骤 3：TypeScript snapshot

- Web fallback parser 同样构建一次内部 snapshot。
- 移除坐标 block 的 `lines.slice` 分配。
- 结果：约 679.18→791.22Hz，平均 1.4724→1.2639ms，吞吐提升 16.5%，平均耗时下降 14.2%。
- Web 全量 43 文件、389 项测试通过；production build 通过。

## 偏离

无。Gaussian 与 cclib 未修改。
