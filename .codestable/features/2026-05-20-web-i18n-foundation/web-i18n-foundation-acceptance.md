# web-i18n-foundation 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-20
> 关联方案 doc：.codestable/features/2026-05-20-web-i18n-foundation/web-i18n-foundation-design.md

## 1. 接口契约核对

对照方案第 2.1 节，本 feature 已新增 Web i18n contract、双语 message catalog、provider/hook、本地 preference helper，并把 Project Sidebar validation message 从固定英文字符串改为 message key + params。

接口示例逐项核对：

- [x] `SupportedLocale`：`web/src/app/i18n/runtime.ts` 从 `messageCatalogs` 推导，当前只包含 `zh-CN` 和 `en-US`。
- [x] `MessageKey` / `MessageCatalog`：`web/src/app/i18n/messages.ts` 以 `enUSMessages` 作为 key 源，`zhCNMessages` 使用 `Record<MessageKey, string>` 约束。
- [x] `I18nRuntime`：`web/src/app/i18n/index.tsx` 提供 `locale`、`setLocale(locale)` 和 `t(key, params)`。
- [x] `detectInitialLocale`：`zh*` browser language 返回 `zh-CN`，其他语言返回 `en-US`，合法 stored locale 优先。
- [x] `formatMessage`：支持 `{param}` 插值，缺失 param 保留 `{param}`，不导致 runtime crash。
- [x] `SidebarValidationStatus`：`web/src/app/projectSidebarState.ts` 改为 `messageKey` / `messageParams`，保留 checksum 和 checkedAt。

名词层“现状 -> 变化”核对：

- [x] `WorkbenchShell.tsx` 不再直接写主要 UI 文案，改为通过 `useI18n().t(...)` 渲染顶栏、状态、graph workspace、command/profile inspector。
- [x] `ProjectSidebar.tsx` 的 heading、按钮、empty state、bundle unavailable、status label 和 validation message 均通过 `t(...)` 渲染。
- [x] `projectSidebarState.ts` 不再把 validation message 写成固定英文；repository error message 作为动态参数原样传递。
- [x] `App.tsx` 在 WorkbenchShell 外层挂载 `I18nProvider`。

流程图核对：

- [x] App mounts I18nProvider：`web/src/app/App.tsx`。
- [x] Provider 检测 stored/browser locale：`resolveInitialLocale` + `readStoredLocale`。
- [x] WorkbenchShell uses useI18n：`web/src/app/WorkbenchShell.tsx`。
- [x] 顶栏 LocaleSwitcher 读取/修改 locale：`LocaleSwitcher`。
- [x] ProjectSidebar uses useI18n：`web/src/app/ProjectSidebar.tsx`。
- [x] Sidebar validation renders messageKey + params：`t(state.validation.messageKey, state.validation.messageParams)`。
- [x] setLocale 更新 React state 并 best-effort 写入 localStorage：`writeStoredLocale`。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] 已定义 `SupportedLocale = "zh-CN" | "en-US"`、typed message key/catalog 和 `t(key, params)`。
- [x] 已提供 `I18nProvider` / `useI18n`，WorkbenchShell 与 ProjectSidebar 不直接读取全局 locale。
- [x] 默认 locale 按浏览器语言选择：中文环境走 `zh-CN`，其他走 `en-US`。
- [x] 手动选择 locale 写入 `rxnflow.web.locale`，不写 Project Content。
- [x] 顶栏提供 `中文` / `English` 切换，覆盖已落地 Workbench / Project Sidebar 主文案。
- [x] 单测覆盖 catalog key completeness、locale detection、stored locale、storage failure fallback 和 interpolation。

明确不做逐项核对：

- [x] 未接云端翻译、AI 翻译、账号级语言偏好或 URL locale routing。
- [x] 未引入 i18next、react-intl、FormatJS、ICU plural runtime 或其他 i18n 库。
- [x] 未翻译 chemical object id、project name、projectRef、checksum、错误 code、error target、命令名、文件名或 fixture ids。
- [x] 未猜测 ShellResponse / repository error message 的领域含义；底层 message 原样显示。
- [x] 未修改 Python core、ShellResponse DTO、Browser Project Repository schema 或 Project Content schema。
- [x] 未改变 Project Sidebar create/open/save 行为、bundle disabled 边界或 Workbench fixture flow。

关键决策落地：

- [x] 自建轻量 i18n runtime：仅新增 `web/src/app/i18n`，没有引入第三方 i18n package。
- [x] 英文 fallback：`fallbackLocale` 为 `en-US`，catalog 缺失时回退英文 key 或 key 名。
- [x] Preference local-only：`localePreferenceKey` 为 `rxnflow.web.locale`，只读写 `localStorage`。
- [x] Provider 挂在 App 层：后续 Import Inbox / Object Registry / Graph Canvas 可复用。
- [x] 错误 code/target 原样显示：Project Sidebar 和 command status 直接渲染错误 code、target、message。

跨层纪律核对：

- [x] Catalog completeness：`assertCatalogCompleteness()` 和 `zhCNMessages: MessageCatalog` 双重约束。
- [x] Fallback：非法 stored locale 被忽略，browser language 兜底；storage 异常时不崩溃。
- [x] Persistence：localStorage 写入失败被吞掉，UI 仍可切换当前运行态 locale。
- [x] Data boundary：动态领域数据保持原样，不进入 message catalog。
- [x] Component boundary：组件通过 `useI18n` 取 `t`，没有直接 import 单一 locale catalog。
- [x] Responsive：真实浏览器桌面和窄屏验证 locale switcher 无水平溢出。

挂载点核对：

- [x] `web/src/app/i18n/`：新增 runtime、catalogs、provider/hook 和 tests。
- [x] `web/src/app/App.tsx`：挂载 `I18nProvider`。
- [x] `web/src/app/WorkbenchShell.tsx`：主文案迁移到 `t(...)`，顶栏加入 locale switcher。
- [x] `web/src/app/ProjectSidebar.tsx`：项目侧边栏主文案迁移到 `t(...)`。
- [x] `web/src/app/projectSidebarState.ts`：validation message 改为 message key + params。
- [x] `web/src/app/workbench.css`：新增 locale switcher 样式并保持顶栏可换行。
- [x] `.codestable/architecture/web-workbench.md` / `ARCHITECTURE.md` / `requirements/web-workbench-shell.md`：已回写当前能力和边界。

反向核查：

- [x] grep `useI18n|I18nProvider|MessageKey|localePreferenceKey` 命中均落在 i18n runtime、App/WorkbenchShell/ProjectSidebar、ProjectSidebar state/tests 和 feature/architecture/requirement 文档中。
- [x] scope grep 确认未新增第三方 i18n lib、cloud translation、AI translation、URL locale routing 或 router。
- [x] scope review 确认没有修改 Python core、ShellResponse DTO、Browser Project Repository schema 或 Project Content schema。
- [x] 拔除沙盘推演：删除 `web/src/app/i18n/`、App provider、LocaleSwitcher 和组件中的 `t(...)` 调用后，i18n 能力消失；ShellClient、Browser Project Repository、Python core 和 project content schema 不受结构性影响。

## 3. 验收场景核对

- [x] S1 `I18nProvider` 默认按 browser language 选择 locale：`zh*` -> `zh-CN`，其他 -> `en-US`。
  - 证据：`web/src/app/i18n/runtime.test.ts`。
- [x] S2 localStorage 中已有合法 locale 时优先使用 stored locale。
  - 证据：`detectInitialLocale` / `readStoredLocale` 单测。
- [x] S3 localStorage 缺失、不可用或值非法时不崩溃，fallback 到 `en-US` 或 browser detection。
  - 证据：broken storage 单测覆盖 get/set 抛错。
- [x] S4 `zh-CN` 和 `en-US` message catalog key 完全一致。
  - 证据：`assertCatalogCompleteness()` 单测。
- [x] S5 `t(key, params)` 支持 `{param}` 插值；缺失 param 不导致页面崩溃。
  - 证据：`formatMessage` 单测。
- [x] S6 顶栏显示 locale switcher，用户可在 `中文` / `English` 间切换。
  - 证据：WorkbenchShell component test + 真实浏览器桌面验证。
- [x] S7 切换到 `zh-CN` 后 Workbench 顶栏、Project Sidebar heading、按钮、empty state、bundle unavailable、status label 等主文案变为简体中文。
  - 证据：WorkbenchShell component test + 浏览器 DOM 验证。
- [x] S8 切换回 `en-US` 后主文案恢复英文。
  - 证据：WorkbenchShell component test + 浏览器 DOM 验证。
- [x] S9 Project Sidebar validation message 使用 message key + params；stub missing path 能插值显示。
  - 证据：`renders sidebar validation messages through the active locale` component test。
- [x] S10 repository error code、target 和 message 原样显示，不被 i18n runtime 改写。
  - 证据：ProjectSidebar 渲染 `state.error.code/message/target`；component test 覆盖 code/message/target。
- [x] S11 project name、projectRef、checksum、fixture object/profile ids 等动态数据原样显示。
  - 证据：组件代码 review 和 WorkbenchShell tests 仍按项目名、fixture profile id、checksum 查询。
- [x] S12 `npm run test` 通过。
  - 证据：8 files / 41 tests passed。
- [x] S13 `npm run build` 通过。
  - 证据：`tsc -b && vite build` passed。
- [x] S14 真实浏览器桌面 viewport 验证 locale switcher 可用，无顶栏/侧栏重叠。
  - 证据：1280x720 下中英文切换通过，无 console warn/error，无水平溢出。
- [x] S15 真实浏览器窄屏 viewport 验证 locale switcher 和 sidebar 文案无水平溢出。
  - 证据：390x840 下中文 UI 可见，按钮文本 fits，无 console warn/error，无水平溢出。

前端浏览器验证说明：

- [x] 已在 `http://127.0.0.1:5173/` 真实浏览器验证桌面和窄屏。页面仍需从 `web/` 目录运行 `npm run dev` 后访问，不支持直接 `file://.../web/index.html` 预览。

## 4. 术语一致性

- Supported Locale：代码为 `SupportedLocale`，只包含 `zh-CN` / `en-US`，与 design 一致。
- Message Key / Message Catalog：代码为 `MessageKey` / `MessageCatalog`，catalog key 完全一致。
- I18n Runtime：代码为 `I18nRuntime`，只存在于 React app context，不进入 ShellResponse。
- Locale Preference：代码常量为 `rxnflow.web.locale`，只存在于浏览器 localStorage。
- Locale Switcher：代码为顶栏 `<select>`，不承担 routing、账号偏好或云同步。
- 防冲突：`ShellResponse`、`ProjectContentSnapshot`、Browser Project Repository schema 和 Python core 未被 i18n runtime 改写。

## 5. 架构归并

- [x] `.codestable/architecture/web-workbench.md`：已归并 Web i18n runtime、catalogs、provider/hook、localStorage locale preference、locale switcher、双语覆盖范围、动态数据不翻译和 QA 证据。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已补充 Web I18n Runtime、Message Catalog、Locale Preference 术语，并把 Web Workbench 已落地能力更新为包含 i18n runtime。
- [x] 跨层纪律已写入 architecture：i18n 不进入 ShellResponse / Project Content，不改变 Browser Project Repository 或 Python core contract；新增主文案应进入 message catalog。
- [x] `AGENTS.md`：不需要改；Web 预览命令和前端浏览器验证要求已存在。

## 6. requirement 回写

- [x] `requirement: web-workbench-shell` 存在。
- [x] 已更新 `.codestable/requirements/web-workbench-shell.md`：补充用户可切换简体中文/英文，默认按浏览器语言选择，手动偏好只保存在浏览器本地。
- [x] requirement 已明确当前 i18n 只覆盖 Web 工作台和项目侧边栏主文案，不翻译项目名、projectRef、checksum、错误 code/target、文件名或底层错误 message。

## 7. roadmap 回写

- [x] `roadmap: rxnflow-web-workbench-mvp` / `roadmap_item: web-i18n-foundation` 均存在。
- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-items.yaml` 中 `web-i18n-foundation` 已改为 `status: done`，feature 保持 `2026-05-20-web-i18n-foundation`。
- [x] `.codestable/roadmap/rxnflow-web-workbench-mvp/rxnflow-web-workbench-mvp-roadmap.md` 主文档对应模块和子 feature 清单状态已同步为 `done`。
- [x] roadmap items YAML 校验通过。

## 8. AGENTS.md / CLAUDE.md 候选盘点

- [x] 无新增候选。本 feature 没暴露新的每个后续 feature 都会重复踩的环境或工具规则；`npm run dev`、`npm run test`、`npm run build` 和浏览器验证规则已在 AGENTS.md 中存在。

## 9. 遗留

- 后续优化点：
  - 下一步按 roadmap 进入 `web-import-inbox`，新增导入面板时继续把新增主文案纳入 `web/src/app/i18n/messages.ts`。
  - 后续如需翻译底层错误 message，应另起 error mapping feature，不在 foundation 中猜测 core/repository 错误语义。
- 已知限制：
  - 当前只支持 `zh-CN` / `en-US`，不支持复数规则、日期/数字地区化、URL locale routing 或账号级偏好。
  - localStorage 被清理或不可用时，手动 locale preference 不持久。
  - 当前只覆盖已落地 WorkbenchShell / ProjectSidebar 主文案；未来新面板需要继续补 catalog。
- 实现阶段顺手发现：
  - Import Inbox 之前落 i18n 是正确顺序，否则后续导入、对象、画布和导出面板会继续累积硬编码文案。
