---
doc_type: refactor-design
refactor: 2026-07-14-gaussian-text-snapshot
status: approved
scope: Gaussian 文本核心快照、振动索引与 full-file 私有 context
summary: 逐层消除 Gaussian 重复全文扫描并严格保持 Link1 与 cclib 语义
---

# gaussian-text-snapshot refactor design

## 1. 范围

- 执行 G1–G5，Python 与 TypeScript 分步验证。
- 每步必须用完整 payload fingerprint 和基准自证。

## 2. 执行顺序

### 步骤 1：刻画与基准

- 方法：M-L1-04。
- 锁定第一 route/basis/formula、最后 SCF/charge/有效 atoms、free-energy-over-correction、solvent 优先级、runtime/termination、两 Link1 振动 block 与 malformed warning。
- 验证：Python/TS characterization + repeatable benchmark。

### 步骤 2：Python 核心 snapshot

- 方法：M-L2-03、M-L2-01。
- 单次收集核心标量、最后有效坐标和 computation metadata；振动保持旧实现。
- 验证：完整 payload 等价、snapshot 构建一次、Python 基准下降。

### 步骤 3：TypeScript 核心 snapshot

- 方法：M-L2-03、M-L2-01。
- Web parser 使用同构 snapshot；vibrations 模块暂不改。
- 验证：完整 payload 等价、Web 基准下降、build 通过。

### 步骤 4：GaussianVibrationIndex

- 方法：M-L2-03、M-L2-01。
- Python/TS 分别将 lines + frequency indices 建为内部 index，继续支持调用方 atom count；完整/partial block、modeIndex、warning 不变。
- 验证：多 Link1、partial、atom mismatch、cclib fallback 测试。

### 步骤 5：cclib context 复用

- 方法：M-L1-01、M-L4-01。
- Python full-file 私有 helper 返回 text result + snapshot/index，供 route/method、metadata 与 text vibration fallback 复用。
- 验证：cclib 标准字段权威性测试、full-file 基准和全量回归。

## 3. 风险

- energy/free correction 继续使用跨 job 的独立 last 语义。
- route/basis/formula 保持 first；charge/atoms/SCF/runtime 保持 last。
- 最后坏 orientation 不覆盖前一有效 block。
- 所有完整 frequency blocks 全文累加，partial warning 与 mode 编号不变。
