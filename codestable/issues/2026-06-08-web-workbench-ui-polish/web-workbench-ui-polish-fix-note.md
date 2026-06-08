---
doc_type: issue-fix-note
slug: web-workbench-ui-polish
component: web-workbench-shell
status: fixed
fixed_at: 2026-06-09
tags: [web-workbench, project-sidebar, graph-canvas, path-authoring, molecule-3d-viewer, qa]
---

# Web Workbench UI Polish Fix Note

## 问题

用户验收时指出四类问题：

- 左侧项目抽屉不像 Codex 式项目列表，删除项目菜单与文件行重叠，项目折叠/展开卡顿，并偶发暴露保存项目类旧入口。
- 画布拖动卡顿，背景网格显得有多层。
- 重新打开项目后，图谱节点先显示无 3D 结构，重新拖入后才显示结构。
- `Connect` / `Set Path` 语义不符合直觉；用户期望手动连线后自然就是路径。

## 修复

- Project Sidebar 的项目操作改为项目行 hover/focus/menu-open 下的紧凑按钮；三点删除菜单改成 `body` portal 上的轻量浮层，不占文件树布局、不被侧栏滚动容器裁切，也不再调用浏览器原生 `window.confirm` 弹窗。
- Project Files 行收窄为格式字标 + 文件名 + 警告点；`Graph`、`Previewed`、`Error` 等状态不再作为可见文字出现，只保留在 aria-label 和状态 class。
- Project folder 折叠改为即时布局切换，只保留很短的 opacity / transform 内容进入反馈，移除一层文件列表 wrapper，避免反复折叠/展开时动画高度造成卡顿。
- Graph Canvas 命令栏移除全局 `Connect` 按钮；用户从节点连接点拖线到另一个节点即可创建 edge，Path Authoring 在无歧义时自动创建或延长 active path。
- Graph Canvas 操作文案改为 `画布工具`、`整理节点`、`从节点拖出路径`，避免用户把连接与设为路径理解成两个独立步骤。
- Graph Canvas edge 从直线改为基于左右锚点的 SVG Bezier path，节点左右都显示连接点，同源同目标多边会做轻量错位。
- Graph Canvas edge 锚点不再使用固定 `source right -> target left` 和固定节点半宽；现在会按 source / target 的相对位置选择可见侧，并用运行时测得的节点卡片宽度换算图谱坐标，避免反向边穿过节点或线条端点与连接按钮错位。
- Graph Canvas edge 标签和端点 marker 从 SVG viewBox 内移到 HTML 百分比 overlay；SVG 只保留 path 线条，避免标签文字和橙色端点被 `viewBox + preserveAspectRatio=none` 按画布尺寸异常放大。
- 打开项目时若恢复出的 workspace 只有一条线性 edge 且没有 path/active path，会自动提交 `path-web-main` 修复当前路径。
- 画布背景改成单层浅点阵并去掉 3D 预览内部渐变背景，显式保持 viewport / edge / node 层透明，避免旧线网格与新点阵叠加。
- 节点拖动预览改为连续坐标，松手落点才吸附网格；画布平移拖动也改为 `requestAnimationFrame` 节流的临时 viewport 实时预览，松手后再写入 workspace viewport。
- 橡皮框选择从只判断节点中心点改为同时判断节点卡片近似矩形与选择框相交，框住卡片边缘也能选中节点。
- 3D viewer 背景去掉点状装饰并用 memo 缓存；Graph node card 也改为 memo + 稳定 pointer callbacks，节点拖动时不再卸载 Three.js 视图切换成占位符，避免拖动开始/结束时反复重建 WebGL renderer。
- 打开项目后 active object 会优先指向当前图谱节点引用且有可渲染 3D 坐标的化学对象，避免右侧 3D / 对象详情落到无几何对象上。
- 恢复项目时若节点引用对象缺少 3D 几何，会尝试从当前项目 raw 输入重新解析并把节点 composition 接回有几何的对象；单 raw / 单缺口场景和 raw 文件数等于缺 3D 节点数的场景都有兜底。
- Project Files / graph node projection 现在同时识别 `chemical_object_ids` 和 `composition`，避免恢复后节点已经挂上 composition 但左侧文件状态或 3D 恢复逻辑仍看不见。
- Graph Canvas wheel 监听改为稳定 `useCallback + useEffect` 依赖，避免拖动画布时反复卸载/挂载 wheel listener。
- Project Sidebar 的删除项目入口从大号菜单卡片改成项目行内锚定的轻量菜单项，避免把删除卡片塞进 Project Files 布局。
- Active project 行的三点更多菜单和 `+` 导入入口保持可见，非 active 项目仍通过 hover/focus 显示，避免当前项目操作入口在侧边栏里“摸不到”。
- 项目删除 popover 进一步压缩为 `116 x 36` 的轻量浮层，删除项 `28px` 高，并通过 portal 锚定到三点按钮右侧，视觉上更接近 Codex 侧边栏的上下文菜单，而不是占据列表空间的大卡片。
- Graph Canvas 底部 `graph-command-bar` 已移除；顶部 viewport toolbar 也移除常驻 `Add Active Object` / `Arrange Nodes`，删除命令只在有选中项时显示，避免把“添加/自动布局/删除”当成另一套主流程。
- Graph Canvas 小地图浮层曾短暂移除以减少旧多层网格噪声；按用户最新反馈，现已恢复为右下角紧凑 minimap，且浅色/深色模式均使用点阵背景。
- Graph Canvas 背景点阵进一步降噪为单层 `32px` 浅点阵，避免视觉上像多层网格。
- Graph Canvas 保留小地图 geometry / drag draft 作为 UI-only 状态；这些状态不进入 ShellResponse、Project Content、Browser Project Repository 或 localStorage。
- 节点拖动时保留可旋转 Three.js 视图挂载状态，避免拖动期间卸载/重建 WebGL 画布带来的卡顿。
- 打开 browser project 后如果恢复出的 graph node 缺 3D geometry，hydration 会在 sidebar project files 为空时主动重新从 active project 的 `inputs/raw` 列文件，并且不再因为 raw 文件 kind 暂时是 `unknown` 就跳过；匹配节点时同时使用显示文件名和 `source_name`，再用 raw log 补齐节点 composition，避免点击项目后先显示“无 3D 结构”、重新拖入才恢复。
- Canvas-first 布局修复 `.export-dock` 未跟随 `.analysis-dock` 进入 absolute overlay 的问题；此前右侧导出栏仍作为 grid 普通流子项，把 `canvas-stage` / `project-rail` / `graph-canvas-surface` 压进 0px 隐式行，导致 hover、点击命中和拖动都落到错误层。现在 rail、sidebar、canvas、graph surface 都恢复为完整 main 高度。
- CodeStable architecture / requirement 和 workspace-first 用户/开发者指南已同步当前主 UI 口径：不再把独立 Apply Layout、Network Preview、Path List、Connect / Set Path 按钮写成当前常规主流程能力；小地图作为右下角紧凑导航控件保留。
- Workbench 顶部改成 Flowith 式单行 app bar：左侧为 `Rf`、`RXNFLOW` 和项目按钮，右侧为语言切换和导出入口；不再保留独立右上浮动操作条。
- Project Sidebar 从 compact rail 改为 hover-reveal floating drawer：点击顶部项目按钮收起后，左侧不再显示可见竖栏，只保留 `18px` 透明热区；鼠标贴近左侧时项目面板从屏幕外浮出，点击顶部项目按钮可恢复常驻展开。
- 画布 viewport toolbar 继续位于 top app bar 下方，避免与顶部项目/语言/导出条重叠；桌面和窄屏下，收起后的项目面板不再占据画布可见宽度。
- Graph Canvas 触控板语义更新：普通 wheel / 双指滚动只平移画布，`ctrl/meta` pinch-style wheel 才缩放；默认工具保持平移模式。
- Graph Canvas selection 修复：节点 3D preview 内部 canvas 不再吞掉节点选择，选择模式下点击结构区域也会选中节点；点击画布空白处会清空节点、edge、path 或能垒标注选择。
- Graph Canvas edge hitbox 修复：viewport layer 透明区域不再盖住 edge hitbox，edge 中心点现在命中 `button.graph-edge-hitbox`，点击线条可选中 edge 并打开浮动标签编辑器。
- Graph Canvas 能垒标注改为从节点底部端口发起；拖拽到目标节点生成标注，同时提供“点击底部端口 -> 点击目标节点”的备用入口。能垒标注显示 `ΔE‡ 12.55` 这种无正号、无单位格式；标注可选中并通过 X 删除。
- Graph node 视觉更新：节点端口缩小，节点宽度收窄；相对能标签使用 `ΔE` / `ΔG` 等符号；3D 预览角标只显示 `0,1`，不再写 `q` / `spin`。
- Molecule 3D 大视图已接入：节点结构区域右上角可打开大视图，大视图保留左下角电荷/自旋，并支持点选 2/3/4 个原子显示键长、键角和二面角。
- Project Sidebar 宽度收窄为 `264px`，项目新增按钮只在项目标题行 hover/focus 时显示，项目更多/导入按钮只在对应项目行 hover/focus/menu-open 时显示；active/stored/registered/used-in-graph 文件行不再用整行底色制造“未 hover 也高亮”的错觉。
- Graph Canvas 节点进一步收窄，左右 edge 端口和底部能垒端口统一为实际 `10px x 10px`，并清除浏览器默认 button padding，避免左右端口比底部端口更大的问题。
- Edge Label Editing 从旧的大号浮动卡片改为选中 edge 后在线条中点显示紧凑 input；旧 `.edge-label-floating-editor` 不再渲染在主画布。
- Canvas node formula 使用 `<sub>` 渲染数字下标；测试改为按 formula 元素 `textContent` 校验，避免视觉下标破坏语义断言。
- Molecule 3D 大视图改成更接近 GaussianView 的深色结构窗口；左下角显示 `Charge / Multiplicity`、原子数和估算电子数，点选原子时高亮被选原子并用 `B/A/D = ... (C1 Ni2 ...)` 格式展示键长、键角或二面角。
- 右下角小地图降噪为更轻的 `168px` 半透明面板、浅边框和更小圆角，避免边框看起来像一块沉重的旧 UI 卡片。

## 验证

- `cd web && npm run test -- src/app/ProjectSidebar.test.tsx src/app/WorkbenchShell.test.tsx src/app/GraphCanvas.test.tsx src/app/graphPathAutoExtend.test.ts`（72 passed / 25 skipped）
- `cd web && npm run test -- src/app/GraphCanvas.test.tsx src/app/graphViewport.test.ts src/app/WorkbenchShell.test.tsx`（70 passed / 25 skipped）
- `cd web && npm run test`（30 files passed；262 passed / 25 skipped）
- `cd web && npm run test -- src/app/GraphCanvas.test.tsx src/app/WorkbenchShell.test.tsx src/app/ProjectSidebar.test.tsx`（71 passed / 25 skipped）
- `python3 -m unittest tests.test_import_preview_parser_regression`（9 tests passed）
- `git diff --check`
- `cd web && npm run build`
- Browser 验证 `http://127.0.0.1:5173/`：
  - 打开 `Ni-fxc-alpha` 后 `nodeCount=3`、`viewerCount=3`、`no3dCount=0`，不需要重新拖入文件才显示 3D。
  - 打开 `Ni-fxc-alpha` 后有 `leftHandles=3`、`rightHandles=3`，edge DOM 是 SVG Bezier path，`bezierEdgeCount=1`。
  - `graph-command-bar` 数量为 0；顶部 viewport toolbar 只保留能量显示、撤销 / 重做、选择 / 平移、缩放、适配和重置视图；删除选中项仅在有选中项时显示。
  - Canvas computed style 为单层 `radial-gradient(rgba(13, 99, 116, 0.043) 0.8px, transparent 0.8px)`，`background-size: 32px 32px`；右下角 `.graph-minimap-panel` / `.graph-minimap` 可见。
  - Layout computed rect 已确认：`.workbench-grid.workspace-flow-shell`、`.project-rail`、`.project-sidebar`、`.canvas-stage`、`.workspace-column`、`.graph-workspace`、`.graph-canvas-surface` 高度均为 `704px`；项目行命中点落到 `.project-folder-main`，不再落到 main 背景层。
  - Project Files 只显示 `Bfix6-ts.log`、`Bfix6-tsf.log`、`Bfix6-tsr.log`，页面文本中没有 `sha256:`、`node-web-*`、`object-imported-*`、`保存项目`、`运行时 Fixture`、`browser-local-indexeddb-opfs-v1`、`设为路径`、`打开工作区`、`添加当前对象` 或 `整理节点`。
  - 项目行三点/加号默认不占布局空间，hover / focus / menu-open 下显示；三点菜单打开后只有 1 个 `body` portal fixed 删除 popover，尺寸约 `116 x 36`，Project Files 仍是 3 个紧凑 log 行。
  - 展开项目后 Project Files 三行 rect 均为 `225 x 30`，删除 popover rect 约 `116 x 36`，`rowOverlap=false`，且 popover parent 是 `document.body`；点击画布外后 `.project-folder-popover` 数量回到 0。
  - 画布平移交互验证：开启平移后 CUA drag 让 `.graph-viewport-layer` transform 从 `matrix(0.402, 0, 0, 0.402, 352.234, 197.127)` 变为 `matrix(0.402, 0, 0, 0.402, 422.24, 167.123)`，同时 `graphNodes=3`、`moleculeViewers=3`。
  - Edge alignment 复验：打开 `Ni-fxc-alpha` 后 `graphNodes=3`、`moleculeViewers=3`、`edgePaths=1`、`svgText=0`；当前 edge path 为 `M 295.31 180 C 359.31 180, 360.69 180, 424.69 180`，换算到屏幕后起点贴近第一个节点右侧 handle，终点贴近第二个节点左侧 handle；marker computed width 保持 `10px`，不再出现巨大 SVG marker / label。
  - Flowith-style topbar 复验：`.workbench-topbar` rect 为 `1280 x 58`，文本为 `RfRXNFLOW项目语言中文English导出`；左侧 `.topbar-command-menu` 只含项目按钮，右侧 `.topbar-status` 含语言和导出，`topbarOverlapsViewportBar=false`。
  - 点击顶部项目按钮收起后：`data-project-rail=closed`、项目按钮 `aria-pressed=false`、`.project-rail` 为透明 `18px` 热区、`.project-sidebar` 宽 `304px` 但位于 `x=-316` 且 `opacity=0`，页面无横向溢出；左侧命中点 `document.elementFromPoint(5, 120)` 为 `.project-rail`，用于 hover reveal。
  - 窄屏 `390 x 800` 复验：topbar rect 为 `390 x 58`；收起后 `.project-rail` 宽 `18px`、`.project-sidebar` 位于 `x=-316` 且 `opacity=0`；`topbarOverlapsViewportBar=false`、`horizontalOverflow=false`。
  - Browser console error/warn 为空。
  - 最新 Browser 复验 `http://127.0.0.1:5173/?qa=cold-ui-polish-fresh`：打开 `Ni-fxc-alpha` 后 `nodeCount=2`、`edgeHitElement=BUTTON.graph-edge-hitbox`、右下 `.graph-minimap-panel` 存在；浅色 canvas layout 为 `radial-gradient(... 32px 32px)` 点阵。
  - 最新 Browser 复验：普通 scroll 让 `.graph-viewport-layer` transform 平移但 zoom 文本保持 `93%`；Reset / Zoom In 分别回到 `100%` 和 `120%`。
  - 最新 Browser 复验：选择模式下点击 3D canvas 后节点 `aria-current=true`，点击画布空白处后所有节点 `aria-current=null`。
  - 最新 Browser 复验：点击 edge hitbox 后 `.graph-edge-hitbox--selected` 出现，并显示 `.graph-edge-inline-label-editor`。
  - 最新 Browser 复验：点击节点底部能垒端口再点击目标节点生成 `ΔE‡ 12.55`；选中后出现删除按钮，点击后 `barrierCount=0`。
  - 最新 Browser 复验：打开大 3D 结构视图后 overlay 为 `0,1`；点选两个原子后出现键长测量文本 `1.950 Å`。
- Playwright smoke `http://127.0.0.1:5173/?qa=cold-ui-polish-fresh`：
  - fixture graph 初始化后 `nodeCount=2`、`edgeCount=1`。
  - `.project-sidebar` rect 为 `264 x 744`。
  - 左右 edge 端口和底部能垒端口 rect 均为 `10 x 10`，computed `padding=0px`。
  - formula `H2` 渲染为 1 个 `<sub>`。
  - `.edge-label-floating-editor` 数量为 0；点击 edge 后 `.graph-edge-inline-label-editor` 数量为 1，`.graph-edge-hitbox--selected` 数量为 1。
  - 3D 大视图打开后 `.molecule-3d-dialog` 存在，左下 overlay 为 `Charge 0 / Multiplicity 1` 和 `2 atoms, 2 electrons`，旧 `.molecule-3d-measurement` 数量为 0。
  - `.graph-viewport-bar` 无 overflow；`.graph-minimap-panel` rect 为 `168 x 106`，border 为 `1px solid rgba(23, 28, 31, 0.12)`，console application error/warn 为空。

## 剩余边界

- Vite build 仍提示单个 JS chunk 超过 500 kB；这是后续 code splitting / lazy load 工作，不影响本轮 UI 行为修复。
- Browser screenshot / macOS `screencapture` 在当前 Codex in-app browser 环境中无法产出截图（CDP screenshot 超时，系统截图返回 display image 失败）；本轮浏览器验收使用 DOM snapshot、computed style、console logs 和 CUA click 证据。后续若继续做拖拽/框选验收，可以补专门的 Playwright/CUA 交互脚本。
- 项目文件行右侧删除 `X` 没有在本轮加假按钮：当前仓储只有低层 `deleteObject(projectRef, path)`，还缺少“删除 raw file 后如何处理已登记对象、图谱节点、自动保存和恢复”的完整产品语义。应作为后续 Project File Delete feature 设计后实现。
