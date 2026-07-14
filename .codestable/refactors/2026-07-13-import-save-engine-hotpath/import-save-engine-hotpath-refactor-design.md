---
doc_type: refactor-design
refactor: 2026-07-13-import-save-engine-hotpath
status: approved
scope: 批量导入、项目保存和 Python engine 热路径
summary: 常驻解析 worker，并用有界文件指纹缓存消除未变化文件的重复读取
---

# import-save-engine-hotpath refactor design

## 1. 本次范围

- 执行 scan S1–S5。
- 保持解析结果、逐文件进度、并发上限、错误隔离和项目完整校验行为不变。
- 总风险：中等；按协议、worker、Node 缓存、Python 缓存、renderer batching 五步隔离。

## 2. 前置依赖

- 为多请求协议、PID 复用、崩溃恢复、缓存失效和 frame batching 补刻画测试。
- 保留当前单文件 request payload 和 Electron IPC 对外契约。

## 3. 执行顺序

### 步骤 1：Python stdin 多请求循环

- 方法：M-L1-01 Parallel Change；M-L4-06 Async & Cancellation。
- 操作：让 `engine_ipc` 逐行处理多条 JSON 请求；保留单请求 + EOF 的输出与退出语义。
- 退出信号：多请求、invalid JSON、unknown command、EOF 测试通过。
- 验证：AI 自证。
- 回滚：恢复单请求入口。

### 步骤 2：Electron 常驻 worker pool

- 方法：M-L4-02 Batching；M-L4-06 Async & Cancellation。
- 操作：`engine-bridge.cjs` 懒启动最多 3 个 worker，每个 worker 单 in-flight、FIFO 调度；timeout/crash 仅回收故障 worker，下一请求自动恢复；应用退出显式 shutdown。
- 退出信号：连续请求复用 PID，并发不超过 3，超时/崩溃后可恢复，无子进程残留。
- 验证：AI 自证。
- 回滚：恢复 per-request spawn。

### 步骤 3：Electron 文件指纹 LRU 与流式哈希

- 方法：M-L4-01 Memoization。
- 操作：`materializeImportSourceFile` 与 `persistSourceFile` 共用有界缓存；key 使用路径和 dev/ino/size/mtime/ctime 指纹。缓存 miss 改用流式 SHA-256，哈希前后 stat，不稳定时重试。
- 退出信号：未变化文件连续保存不读取内容；同大小修改和原子替换均重新哈希；LRU 有容量上限。
- 验证：AI 自证。
- 回滚：删除缓存并恢复原哈希函数。

### 步骤 4：Python validation 哈希 LRU

- 方法：M-L4-01 Memoization。
- 操作：常驻进程内对 source/export SHA-256 使用相同的有界 stat fingerprint 缓存。
- 退出信号：连续 validation 复用 checksum；修改、替换、删除仍产生原有 warning。
- 验证：AI 自证。
- 回滚：恢复无缓存 `sha256_file`。

### 步骤 5：普通侧栏导入 frame batching

- 方法：M-L4-02 Batching。
- 操作：仅对 `autoRegister:false` 的完成结果在同一 animation frame 合并一次 `stageSourceFilesForProject`；`autoRegister:true` 保持逐文件处理；结束前强制 flush。
- 退出信号：输入顺序、失败回滚、最终进度和自动登记行为不变；多文件导入 UI 正常。
- 验证：AI 测试 + HUMAN 浏览器确认。
- 回滚：恢复逐文件 state update。

## 4. 风险与看点

- worker protocol 必须保证一条坏请求不会污染后续响应。
- timeout 与 crash 不得让队列永久悬挂。
- 文件缓存只优化未变化文件，不能信任路径或大小单字段。
- renderer batching 必须在结束和异常路径 flush，不能让进度永久停留。
