---
doc_type: feature-acceptance
feature: 2026-06-26-desktop-preferences-source-openers
status: accepted
accepted_at: 2026-06-26
summary: 桌面偏好 Settings、Gaussian/Text source opener、外观三态、能量单位偏好与右键菜单瘦身已落地，并保持偏好只存在本机 userData
tags: [desktop, preferences, source-openers, settings, context-menu, acceptance]
---

# desktop-preferences-source-openers 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-26
> 关联方案 doc：`.codestable/features/2026-06-26-desktop-preferences-source-openers/desktop-preferences-source-openers-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**

- [x] `DesktopPreferences` 已落地到 `web/src/app/desktopPreferences.ts`，包含 `schemaVersion: 1`、`appearance`、`energyOutputUnit`、`sourceOpeners.gaussian/text`。
- [x] `AppearancePreference = "system" | "dark" | "light"` 已接入 `App.tsx` 的 `effectiveTheme`，system 模式跟随 `prefers-color-scheme` / Electron native theme。
- [x] `EnergyOutputUnitPreference` 复用当前 `EnergyDisplayOptions.outputUnit`，默认 `kcal/mol`。
- [x] `openSourceFile` payload 已带 `sourceKind` / `parserId`，Electron 按 Gaussian/Text opener profile 分类。
- [x] Electron preload API 已暴露 `getPreferences`、`setPreferences`、`chooseExternalApp`、`onPreferencesChanged` 与增强 `openSourceFile`。

**名词层“现状 → 变化”逐项核对**

- [x] 旧 renderer-only `rxnflow-theme` 状态被 `DesktopPreferences.appearance + effectiveTheme` 替代；浏览器 fallback 仍用 localStorage 保存可降级偏好。
- [x] 悬浮工具栏不再渲染 Unit select；energy unit 权威入口迁到 Settings。
- [x] 悬浮工具栏不再渲染 Delete selection；删除保留键盘快捷键并进入右键菜单。
- [x] 节点卡用户可见三点更多菜单被移出；Rename / Set zero / Source details 进入节点右键菜单。
- [x] Node Source 按钮文案从 `Open raw log` 更新为 `Open with external app`，不再走系统默认 `shell.openPath`。

**流程图核对**

- [x] 用户点击 source 外部打开 → renderer 传 file/sourceKind/parserId → Electron 读 userData preferences → classify gaussian/text → preference/default probe/user selection → 无 shell app launch 的流程已落地。
- [x] 用户点击 Project Rail Settings → `SettingsPanel` 修改 appearance / energy unit / opener → renderer state + Electron preference store 同步的流程已落地。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] Gaussian source 使用 gaussian profile，用户设置 GaussView 路径或系统常见路径存在时用对应 app 打开。
- [x] ORCA / MAPLE / 其他 source 使用 text profile，默认探测 TextEdit / Notepad / Linux 文本工具，缺失时引导用户选择并保存。
- [x] 设置面板提供 Appearance、Energy unit、Gaussian opener、Text opener。
- [x] 外观支持 system/dark/light；单位默认 kcal，并可从 Settings 改为 Eh/kJ。
- [x] 悬浮工具栏瘦身：Unit 和 Delete selection 不再出现；节点更多操作迁移到右键菜单。

**明确不做逐项核对**

- [x] 未写系统注册表、LaunchServices 或修改 OS 默认打开方式。
- [x] 偏好路径不写入 `.rxnflow/project.json`、`files[]`、`importLedger` 或导出包。
- [x] 外部 app 启动不使用 shell 字符串拼接；不支持用户输入任意命令模板。
- [x] 未新增下载/安装 GaussView、TextEdit、Notepad、gedit 等外部软件逻辑。
- [x] 浏览器预览不调用 Electron-only opener API，也不显示“已外部打开”的假成功。
- [x] toolbar DOM 不再出现 `aria-label="Unit"` 或 `aria-label="Delete selection"`。
- [x] 节点卡 DOM 不再出现用户可见 `node-more-button` 三点菜单入口。

**关键决策落地**

- [x] 偏好属于用户机器：Electron 写 `userData/rxnflow-preferences.json`，不进入项目数据。
- [x] source opener 分类放在桌面壳层：renderer 只传 source 元数据，OS 细节在 `web/electron/source-openers.cjs`。
- [x] 默认路径只是候选：不存在时走选择应用弹窗，用户选择后保存 profile。
- [x] 首次缺失在点击 source 按钮时引导，不要求用户先打开设置。
- [x] Settings 入口放 Project Rail 左下角。
- [x] 主题与单位权威入口在 Settings。
- [x] 删除和节点更多操作迁移到 context menu，同时保留键盘快捷键。

**编排层与流程级约束核对**

- [x] 坏 preference JSON 会 normalize 到默认值，不崩溃。
- [x] 同一 profile 选择应用后后续打开复用；用户清空 profile 后会重新走默认探测/选择。
- [x] Source opener app path 只来自 userData preference、默认候选探测或用户选择；`spawn` / macOS `open -a` 均设置 `shell:false`。
- [x] 浏览器 fallback 下 opener controls disabled / `Desktop only`，Source 外部打开不伪造成功。
- [x] Delete / Backspace 仍可删除选中内容；右键菜单提供鼠标入口。

**挂载点反向核对**

- [x] 挂载点 M1 Electron preload API：落在 `web/electron/preload.cjs` 和 `web/src/app/appRuntimeEffects.ts` 类型。
- [x] 挂载点 M2 userData preference file：落在 `web/electron/preferences-store.cjs`。
- [x] 挂载点 M3 Project Rail Settings 入口：落在 `web/src/app/ProjectRail.tsx` / `App.tsx`。
- [x] 挂载点 M4 Settings panel controls：落在 `web/src/app/SettingsPanel.tsx`。
- [x] 挂载点 M5 Node Source external opener：落在 `InspectorPanels.tsx`、`App.tsx`、`web/electron/source-openers.cjs`、`main.cjs`。
- [x] 挂载点 M6 canvas/node context menu：落在 `CanvasWorkspace.tsx` 与 `App.tsx`。
- [x] 反向 grep：`DesktopPreferences`、`sourceOpeners`、`chooseExternalApp`、`Open with external app`、`CanvasContextMenuRequest` 命中均落在上述挂载点、tests 或本 feature spec 内。
- [x] 拔除沙盘推演：移除 preference store/API/settings panel/source-opener/context menu 挂载点后，本 feature 行为消失；项目导入、基础画布和 inspector 主链路不需要反向删除。

## 3. 验收场景核对

- [x] **S1 初次启动默认偏好**：`desktopPreferences.test.ts` / Electron smoke 覆盖 `appearance=system`、openers 为空、坏 JSON 回退默认。
- [x] **S2 Settings 面板**：浏览器验证 Settings 可打开，并显示 Appearance、Energy unit、Gaussian opener、Text opener。
- [x] **S3-S4 appearance**：浏览器验证切换 dark 后 `.app-shell.theme-dark` / `color-scheme: dark` 生效；system/light 路径由 helper 与 App tests 覆盖。
- [x] **S5-S6 Energy unit**：默认 `kcal/mol`；Settings 改动同步 `energyDisplayOptions.outputUnit`，toolbar 不显示 Unit select。
- [x] **S7-S9 toolbar/context menu**：App tests 覆盖 toolbar 无 Delete、节点右键 Rename / Set zero / Source details，键盘 Delete 保留。
- [x] **S10-S14 source opener**：Electron source opener smoke 覆盖 gaussian/text profile 分类、默认 path probe、用户选择后保存 preferences、清空后回到探测/选择。
- [x] **S15 source 文件缺失/不安全**：main IPC 先 resolve project source path 并返回 warning/error，不启动外部 app。
- [x] **S16 browser fallback**：浏览器验证 opener controls disabled / Desktop only，appearance 与 energy unit 可在浏览器 fallback 中使用。

**前端浏览器验证**：已在 `http://127.0.0.1:5173/` 打开 Settings，确认四个设置项存在；浏览器环境 opener controls disabled 且标注 Desktop only；切换 Appearance 到 dark 后 app shell 与 `colorScheme` 生效。

## 4. 术语一致性

- `DesktopPreferences`、`SourceOpener`、`OpenerProfile`、`AppearancePreference`、`EnergyUnitPreference`、`CanvasContextMenu` 在 design、代码和 tests 中语义一致。
- 防冲突：没有新增系统默认打开方式、任意 shell command template、插件市场或项目内 opener path 概念。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已补 Desktop Target / Web Renderer 的用户偏好、source opener、主题三态、单位偏好和右键菜单瘦身现状。
- [x] `.codestable/architecture/web-workbench.md`：已补 Project Rail Settings 入口、Settings panel 当前承载项、Source 外部打开行为、toolbar 瘦身和 canvas/node context menu。
- [x] `.codestable/attention.md`：本 feature 没暴露每个 feature 都会重复踩的新工作流规则；不更新。

## 6. requirement 回写

- [x] `requirement: desktop-preferences` 指向 draft req，已将 `.codestable/requirements/desktop-preferences.md` 从 `draft` 升为 `current`。
- [x] `implemented_by` 已更新为 `[web-workbench]`。
- [x] 已追加 2026-06-26 变更日志，保留原始愿景、用户故事和边界。
- [x] `.codestable/requirements/VISION.md` 已把 `desktop-preferences` 从 draft 移入 current。

## 7. roadmap 回写

- [x] 本 feature design frontmatter 没有 `roadmap` / `roadmap_item` 字段，属于非 roadmap 起头；无需更新 roadmap items 或主文档。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露需要补入 `.codestable/attention.md` 的通用环境 / 工具 / 工作流信息。

## 9. 遗留

- 后续优化点：Settings 后续如果继续增加项，应考虑分区或独立设置页；跨窗口 preferencesChanged 目前已有 API 形状但只按当前单窗口需要验证。
- 已知限制：浏览器预览不支持真实外部应用打开；desktop opener 只承诺 Gaussian/Text 两个 profile，不是通用插件系统。
- 顺手发现：`App.tsx` 和 `workbench.css` 仍偏胖，后续拆分 runtime/preferences/import/export state 适合另走 `cs-refactor`。
