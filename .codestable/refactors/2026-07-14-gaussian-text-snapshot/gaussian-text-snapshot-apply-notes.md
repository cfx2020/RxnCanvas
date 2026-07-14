---
doc_type: refactor-apply-notes
refactor: 2026-07-14-gaussian-text-snapshot
status: completed
---

# gaussian-text-snapshot apply notes

## 步骤 1：刻画与基准

- 新增约 287KB 的 Link1 opt+freq 合成输出。
- 锁定第一 route/formula/NBasis、最后 SCF/charge/有效 orientation、跨 job free energy、solvent、runtime/termination、3 个 modes、partial warning 与首 mode 位移。
- 基线：Python preview 约 48.8–59.9ms/parse；Web 约 1.49–1.77ms/parse；Python full-file fake-cclib/no-vib 约 102.4ms/parse。

## 步骤 2：Python 核心 snapshot

- `parse_source_preview` Gaussian 分支每次只构建一次 `GaussianTextSnapshot`。
- 能量、route/formula/NBasis、method、atoms、charge/spin、solvent、termination/runtime 复用快照。
- 振动与 cclib 未在本步修改。
- 基准中位约 48.8→39.8ms，下降约 18.4%。

## 步骤 3：TypeScript 核心 snapshot

- Web Gaussian preview 使用同构内部 snapshot。
- 保持 first/last、Link1、free/correction、坏 orientation 与 continuation 语义。
- 平均约 1.7685→1.3086ms，下降约 26%；吞吐提升约 35%。

## 步骤 4：GaussianVibrationIndex

- Python/TypeScript 各自建立 lines + frequency indices 的内部索引。
- 保持多 Link1 完整 block 累加、每 block partial warning、atom mismatch 和连续 modeIndex/modeId。
- Web 最终 benchmark 约 1.20–1.26ms/parse；Python额外小幅下降约 3%。

## 步骤 5：full-file cclib context

- 私有 `_SourceTextParseContext` 复用同一 Gaussian snapshot/index。
- method、kind、computation metadata 不再重复全文扫描。
- cclib 无振动时以 cclib atom count 解析同一 text index；有振动时不执行第二次文本 fallback。
- cclib 缺 energy/coordinates 时仍禁止文本回填。
- full-file 287KB 基准约 102.394→40.702ms，下降约 60.3%。

## 最终验证

- Python：44 项通过。
- Web：43 文件、393 项通过。
- Electron Node tests：12 项通过。
- Web production build：通过。
- Bundled Python engine：已重建。
- desktop smoke、release smoke、macOS packaged runtime smoke：通过。
- `git diff --check`：通过。

## 偏离

无。公开 payload、cclib 权威字段和 renderer 接口未改变。
