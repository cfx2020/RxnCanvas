---
doc_type: refactor-design
refactor: 2026-07-13-orca-text-snapshot
status: approved
scope: ORCA 文本解析单次快照复用
summary: Python 与 TypeScript 各自一次收集 ORCA 文本字段并供现有结果组装复用
---

# orca-text-snapshot refactor design

## 1. 本次范围

- 执行 O1–O3。
- 对外接口和解析 payload 不变；仅把重复扫描集中为内部 snapshot。

## 2. 执行顺序

### 步骤 1：刻画测试与基准

- 方法：M-L1-04。
- 操作：构造包含多能量、多坐标段、溶剂、电荷/多重度、方法和频率标记的大 ORCA 文本；锁定 Python/TS 完整结果。
- 退出信号：当前实现通过等价测试并有可重复计时基线。
- 验证：AI。

### 步骤 2：Python OrcaTextSnapshot

- 方法：M-L2-03、M-L2-01。
- 操作：单次行遍历/必要的局部 block 解析收集最终能量、solvation、坐标、charge/spin、method、frequency presence；原组装函数复用 snapshot。
- 退出信号：所有 Python ORCA 字段与 warning 深度等价，扫描/耗时下降。
- 验证：AI。

### 步骤 3：TypeScript OrcaTextSnapshot

- 方法：M-L2-03、M-L2-01。
- 操作：Web parser 使用同构 snapshot，保持 preview parser parity。
- 退出信号：Web ORCA 测试和大文本等价测试通过，build 通过。
- 验证：AI。

## 3. 风险

- “最后一次匹配”语义必须保持。
- 坐标 block 的终止条件和元素顺序不能改变。
- energy table 的 source/label/单位不能改变。
- 缺失字段与 warning 不能被 snapshot 默认值掩盖。
