---
doc_type: issue-fix
issue: 2026-06-30-desktop-import-source-lifecycle
path: fast-track
fix_date: 2026-06-30
tags: [desktop, import, parser, autosave, project-sources]
---

# 桌面导入源文件生命周期修复记录

## 1. 问题描述

用户在侧边栏删除 `i1p6.log` 后重新导入，侧边栏先显示 `i1p6.log`，解析完成后项目 `sources/` 里变成 `i1p6-2.log`。另一个现象是拖入错误的 `i1p6-sol.log` 时 App 会弹出 native unsupported dialog，但项目 `sources/` 仍留下这个坏 sol 文件。

期望行为是：导入占位行可以立即显示，但未解析成功前不能把原始文件复制进项目；unsupported 文件弹窗后不进入项目；删除后重导入同名文件不应被旧孤儿文件逼出 `-2` 后缀。

## 2. 根因

- Electron dialog / Finder drop 会先创建侧边栏占位行，并把 native `sourcePath` 放进占位文件对象。
- autosave 看到占位文件带 `sourcePath` 后，会按普通项目文件保存逻辑把它复制到 `sources/`。如果 parser 后续返回 unsupported，renderer 会移除成功导入元数据，但磁盘上的抢先复制已经发生。
- 侧边栏删除只先改 React 项目状态，真正删除未引用 `sources/` 文件依赖后续 autosave prune。用户马上重导入时，旧 `sources/i1p6.log` 还在磁盘上，Electron import materialize 只按磁盘存在判断冲突，于是生成 `sources/i1p6-2.log`。

## 3. 修复方案

- deferred desktop import 占位行剥离 `sourcePath/storedPath/checksum`，只保留文件名、大小、扩展类型和 pending parse 状态；native path 只保留在后台 import job payload 里。
- `unsupported_format` 的 desktop parser 结果不再回填为项目文件，而是移除占位行并保留 native/import issue dialog。
- renderer 调用 Electron import job 时带上当前项目仍引用的 `storedPath` 列表。
- Electron `materializeImportSourceFile()` 改为只避让这些仍被项目引用的 source path；磁盘里未引用的孤儿文件可以被同名新导入覆盖。
- Electron smoke 增加孤儿 source 重用与已引用 source 避让的断言。

## 4. 改动文件清单

- `web/src/app/appImportActions.ts`
- `web/src/app/importParseJobs.ts`
- `web/src/app/importRegistrationTypes.ts`
- `web/src/app/App.tsx`
- `web/electron/main.cjs`
- `web/electron/project-store.cjs`
- `web/electron/smoke.cjs`
- `web/src/app/appImportActions.test.ts`
- `web/src/app/importParseJobs.test.ts`
- `web/src/app/App.test.tsx`

## 5. 验证结果

- `cd web && npm run test -- --run src/app/appImportActions.test.ts src/app/importParseJobs.test.ts src/app/App.test.tsx` 通过，72 个测试通过。
- `cd web && npm run build` 通过；仍有既有 3Dmol direct eval 和大 chunk warning。
- `node web/electron/smoke.cjs` 通过。

## 5.1 追加修复：失败 sol 不进项目后节点灯消失

用户复测发现 unsupported sol 确实不再进入 `sources/`，但节点卡片的缺 sol 状态灯也消失，看起来像已经配对。

根因是 Canvas 节点状态灯还有一条旧捷径：只要节点 `energyTable` 里有 `gsolHartree` 或 `esolHartree`，就直接判定为 `paired`。但 Gaussian gas log 本身也可能含 free energy 字段，这不是 sol 文件配对证据。修复后节点 sol 状态只按项目文件列表里是否存在同组 parsed solution log 判断；能量表继续用于能量显示，不再参与配对语义。

追加验证：

- `cd web && npm run test -- --run src/app/CanvasWorkspace.test.tsx src/app/App.test.tsx src/app/importRegistration.test.ts src/app/fileDisplay.test.ts` 通过，107 个测试通过。
- `cd web && npm run build` 通过；仍有既有 3Dmol direct eval 和大 chunk warning。

## 5.2 追加修复：sol 成功但 gas 缺失也不能显示 paired

用户补充确认反向情况也要一致：如果 sol log 是好的，但同组 gas log 是坏的或没有成功进入项目，节点卡片同样不能显示成已配对。

修复后 Canvas 侧不再只维护“同组有没有 parsed sol”，而是维护同组 `hasGas / hasSolution` 两个 parsed presence。gas 节点缺 sol 显示 `No paired solvation log`；sol 节点缺 gas 显示 `No paired gas log`。两种情况都使用同一个缺配对状态灯，但 tooltip 区分缺的是哪一侧。

追加验证：

- `cd web && npm run test -- --run src/app/CanvasWorkspace.test.tsx src/app/App.test.tsx src/app/fileDisplay.test.ts src/app/importRegistration.test.ts` 通过，108 个测试通过。
- `cd web && npm run build` 通过；仍有既有 3Dmol direct eval 和大 chunk warning。

## 5.3 追加修复：desktop unsupported sol 移除后文件栏灯不可见

用户在 packaged app 中复测发现，错误 `i1p6-sol.log` 通过 Electron drop 导入失败并弹出 native unsupported dialog 后，坏 sol 确实没有进入 `sources/`，但左侧 `i1p6` 行没有显示缺 sol 状态灯。

补充修复两点：

- 新增 desktop drop 回归测试：先导入并解析正常 gas，拖到画布生成节点，再拖入 unsupported sol；断言 sol placeholder 被移除后，左侧 gas 行仍有 `has-missing-solution` 灯，画布节点右上角也仍有 missing 灯。
- 文件栏状态灯 DOM 从 `span` 改成 `i`，避开项目栏历史样式对 `.project-file-main span` 的 `overflow/text-overflow/white-space` 裁剪，保证 6px 状态灯不会被当作文件名文本裁掉。

追加验证：

- `cd web && npm run test -- --run src/app/App.test.tsx src/app/fileDisplay.test.ts src/app/CanvasWorkspace.test.tsx` 通过，85 个测试通过。
- `cd web && npm run build` 通过；仍有既有 3Dmol direct eval 和大 chunk warning。

## 5.4 追加修复：native dialog 确认后旧占位仍留在文件栏

用户继续复测发现：先导入错误 `i1p6-sol.log` 时 native unsupported dialog 会正确弹出，文件也不进 `sources/`，但点击 OK 后左侧栏仍留着 `i1p6-sol.log` 占位；如果先导入 gas 再导入坏 sol，坏 sol 占位或旧分组状态会让左侧栏看起来像已经配对。

根因是 desktop parser job 回调可能拿到的是导入时刻的文件对象，而 React state 中的当前文件列表已经经过占位、分组或后续更新。旧实现按失败文件 id 删除时，遇到 stale closure 或同名同组占位替换后会漏删当前文件栏里的实际占位。

补充修复后：

- `App.tsx` 用 `filesRef` 保存最新文件列表，parser 回调删除失败占位时不再依赖闭包里的旧 `files`。
- 删除规则不只匹配失败文件 id，也匹配同 source group、同 gas/sol 角色、同规范化文件名的未落盘 staged 占位。
- 只有 `parse_deferred`、`unsupported_format`、`import_preview_failed`、`import_preview_missing` 这类导入占位失败会被移除；已经 parsed 或已经有 `storedPath` 的正式文件不会被误删。
- 增加两个 Electron unsupported sol 回归：gas 已存在后坏 sol 被移除且 gas/节点仍显示缺 sol 灯；sol-only 坏文件失败后左侧占位完全移除。

追加验证：

- `cd web && npm run test -- --run src/app/App.test.tsx src/app/fileDisplay.test.ts src/app/CanvasWorkspace.test.tsx src/app/importParseJobs.test.ts` 通过，90 个测试通过。
- `cd web && npm run build` 通过；仍有既有 3Dmol direct eval 和大 chunk warning。

## 5.5 追加修复：解析失败必须整条回滚导入

用户继续复测确认：错误 `i1p6-sol.log` 在 native dialog 报错后仍会留在左侧栏；先有 gas 再导入坏 sol 时，文件栏仍可能看起来像已配对。这个现象说明 5.4 仍只覆盖了 `unsupported_format` 等特定错误，真实坏 Gaussian log 可能返回 `parse_failed`、`cclib_parse_failed` 或没有 `parse` 数据，未被当成本次导入失败回滚。

补充修复后：

- Electron 后台导入结果只要 `parse.parsed !== true`，一律视为本次导入失败，回滚本次创建的占位行，不写入项目、不保留红灯文件行。
- 错误 dialog 不再只看少数错误码；任何 desktop parser 未成功 parsed 的结果都会生成 import issue entry，继续通过 native dialog 或内置 dialog 告知用户。
- 回滚删除使用导入前的源文件 id 加同组/同 gas-sol 角色/同文件名匹配，覆盖 parser 回调返回对象与当前占位对象不同步的情况。
- 文件栏分组仍按文件名识别 gas/sol，但配对状态灯只按 parsed 成功的 gas/sol presence 判断，避免失败 sol 或失败 gas 参与“已配对”语义。
- 回归测试覆盖 `parse_failed` sol drop、无 parse 数据、materialize failure、unsupported sol-only，以及文件栏 parsed 配对状态。

追加验证：

- `cd web && npm run test -- --run src/app/App.test.tsx src/app/fileDisplay.test.ts src/app/CanvasWorkspace.test.tsx src/app/importParseJobs.test.ts` 通过，90 个测试通过。
- `cd web && npm run build` 通过；仍有既有 3Dmol direct eval 和大 chunk warning。

## 5.6 追加修复：parsed=true 但计算错误也不能导入

用户复测截图显示：坏 `i1p6-sol.log` native dialog 已提示 `Unsupported import format`，但左侧栏仍留下 `i1p6-sol.log`；Inspector 里同时出现 `STATUS parsed` 和右上角 `ERROR`。这说明真实坏 sol 不是 `parse.parsed=false`，而是 cclib/text 读出了候选结构，所以被标成 `parsed=true`，但计算终止状态或 parser warning 已经说明它不能作为项目 source 登记。

补充修复后：

- Electron 主进程在复制到 `sources/` 前先检查解析结果是否可导入；`unsupported_format`、`parse_failed`、`cclib_parse_failed`、`full_file_read_failed` 等拒绝码，以及 `terminationStatus=error/running`，都会直接返回 import error，不再 materialize 原始文件。
- Renderer 侧保留同样的导入 gate，防止旧 backend 或测试路径返回 `parsed=true + ERROR` 时仍把占位行留下。
- import issue dialog 不再只依赖 `parse.parsed=false`，parsed 但被导入 gate 拒绝的文件也会弹出 native/import failed 提示。
- 回归测试覆盖“先导入 gas，再导入 parsed=true 但 ERROR 的 sol”：坏 sol 行被移除，gas 行和节点仍显示缺 sol 状态灯。

追加验证：

- `cd web && npm run test -- --run src/app/App.test.tsx src/app/fileDisplay.test.ts src/app/CanvasWorkspace.test.tsx src/app/importParseJobs.test.ts` 通过，91 个测试通过。
- `cd web && npm run build` 通过；仍有既有 3Dmol direct eval 和大 chunk warning。
- `cd web && node --check electron/main.cjs && node electron/smoke.cjs` 通过。
- `cd web && npm run desktop:pack` 完成，macOS unpacked app 已刷新到 `web/release/mac-arm64/RxnFlow.app`。
- `cd web && npm run desktop:release:smoke` 通过。

## 6. 遗留事项

仍建议后续补一个显式的“清理未引用 sources”维护动作，方便用户手动处理历史项目目录里已经存在的孤儿文件；本次导入路径已经不会再依赖这些孤儿文件的状态。
