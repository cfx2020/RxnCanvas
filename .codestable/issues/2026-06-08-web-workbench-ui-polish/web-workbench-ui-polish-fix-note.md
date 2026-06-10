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
- Graph Canvas 能垒标注改为从节点底部端口拖拽发起；拖到目标节点后生成垂直双箭头标注。能垒标注显示 `▲E‡ 12.55` 这种无正号、无单位格式；标注可选中、可直接编辑，并通过 X 删除。
- Graph node 视觉更新：节点端口缩小，节点宽度收窄；相对能标签使用 `▲E` / `▲G` 等符号；3D 预览角标只显示 `0,1`，不再写 `q` / `spin`。
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
  - 最新 Browser 复验：从节点底部能垒端口拖到目标节点生成 `▲E‡ 12.55`；选中后出现删除按钮，点击后 `barrierCount=0`。
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

## 2026-06-09 补充修复：能垒标注、边命中和浅色 3D 弹窗

### 用户反馈

- 节点底部圆点应像左右连接点一样支持拖出曲线，松手后生成垂直双箭头能垒标注。
- 双箭头标签后面不应出现椭圆背景，且标签应可直接编辑。
- 已标注文字的曲线 / 能垒应能选中和删除。
- 重新拖入节点并连线后，节点上的 `▲E` 不应退回绝对能量。
- 浅色模式下大 3D 结构窗口不应使用突兀深色背景。
- 删除节点后撤回按钮需要可用。

### 修复

- Bottom barrier handle 的拖拽逻辑改为与 edge handle 同级的 pointer session：pointer move 实时更新 pending barrier path，pointer up 命中目标节点后生成 `CanvasBarrierAnnotation`。
- Barrier 双箭头不再落在源节点卡片正中穿过 3D 预览；现在从节点底部引出到节点外侧，再绘制垂直双箭头和虚线参考线，标签命中点不再被 3D canvas 遮挡。
- `.graph-edge-layer` 提到节点层上方，但整层保持 `pointer-events: none`，只让具体 edge/barrier hitbox、label 和 SVG hit-line 接事件；修复 graph edge / barrier label 看得到但被节点 3D canvas 盖住、真实浏览器点不到的问题。
- Barrier 标签从胶囊按钮改为透明文本；选中编辑态只保留细下划线 input，不再有竖椭圆背景。
- Barrier 标注新增透明 hitbox，点击 label / hitbox 可进入编辑态；删除按钮同时处理 `pointerdown` 和真实 `click`，修复浏览器点击删除无效的问题。
- Web 侧 canvas energy resolver 增加 `egas` / `ggas` / `gsol` 优先键：电子能读 `egas`，气态自由能读 `ggas`，溶剂化自由能读 `gsol`，避免重新创建节点后相对能显示退化。
- 浅色模式的大 3D 弹窗 backdrop / viewer 改为浅色玻璃背景；深色背景只在 dark theme 下启用。
- Fixture transport 的 workspace normalize 将 `active_path_id: undefined` 收敛为 `null`，测试 helper 的 base64 生成移除 Node `Buffer` 依赖，恢复 Web build。
- Fixture transport 的 `node-web-*` 生成从“当前节点数量 + 1”改成单调递增计数；`fixture.run` 和打开项目内容时会重置到当前图谱之后，删除节点再从项目文件重新拖入不会复用旧 node id，避免 React 重复 key 导致节点/标签/相对能状态串位。

### 验证

- `cd web && npm run test -- GraphCanvas.test.tsx WorkbenchShell.test.tsx --run -t "barrier|traffic-light deletion|graph edges|relative energy"`（7 passed）
- `cd web && npm run test -- WorkbenchShell.test.tsx --run -t "reuses project raw file rows"`（1 passed）
- `cd web && npm run test -- GraphCanvas.test.tsx WorkbenchShell.test.tsx --run -t "barrier|traffic-light deletion|graph edges|relative energy|reuses project raw file rows"`（8 passed）
- `cd web && npm run test -- GraphCanvas.test.tsx --run`（12 passed）
- `cd web && npm run test -- --run`（30 files passed；267 passed / 25 skipped）
- `cd web && npm run build`（passed；仍有 Vite chunk size warning）
- Browser 验证 `http://127.0.0.1:5173/?qa=cold-ui-polish-fresh`：
  - 页面 title 为 `RxnFlow Workbench`；当前 app 交互未新增相关运行错误，历史 console 中保留的重复 key 记录已在本轮定位并修复。
  - 打开 `Ni-fxc-alpha` 后画布有 3 个 graph nodes。
  - 从第一个节点底部 barrier handle 拖到第二个节点右侧后，DOM 出现 1 条 `.graph-barrier-arrow`、1 条 `.graph-barrier-guide`、1 个 `.graph-barrier-hitbox` 和 1 个 `.graph-barrier-delete-button`。
  - Barrier label computed background 为透明；编辑 input 可改为 `OA`。
  - 调整后 barrier label 命中堆栈顶部为 input / label / hitbox，3D canvas 已降到其后，不再覆盖标注。
  - 点击 barrier 删除按钮后，`.graph-barrier-arrow`、`.graph-barrier-hitbox`、`.graph-barrier-delete-button`、`.graph-barrier-label` 均回到 0。
  - 打开大 3D view 后，浅色模式 backdrop 为 `rgba(244, 247, 248, 0.72)`，viewer 背景为 `rgb(247, 250, 249)`。
  - 复验真实页面时发现历史 console error 中存在重复 key `node-web-3`，已定位为 Web fixture 删除节点后 id 复用并修复；新增测试覆盖“拖入 node-web-3 -> 删除 -> 再拖入同一项目文件 -> 生成 node-web-4/后续 id”。
  - 真实页面从第一个节点底部能垒端口拖到目标节点后生成 1 个 barrier arrow / guide / hitbox / delete button；默认标签 input 值为 `▲E‡ 6.28` 且背景透明。
  - 点击 barrier 删除按钮后，barrier arrow / hitbox / label / delete button 均变为 0。
  - 真实页面普通 edge hitbox 可选中，选中后出现 inline label editor；点击“删除选中项”后 edge hitbox 和 inline editor 均变为 0，撤销按钮显示“撤销 删除”且可用。
  - 真实页面通过节点红灯删除节点后，节点数 `3 -> 2`，撤销按钮可用；点击撤销后节点数恢复为 `3`。
  - 真实页面打开大 3D view 后，浅色模式 backdrop 为 `rgba(244, 247, 248, 0.72)`，dialog 为 `rgba(251, 253, 255, 0.98)`，viewer 为 `rgb(247, 250, 249)`，信息层显示 `Charge 0 / Multiplicity 1` 和原子/电子数。

### 剩余边界

- 本轮已在浏览器里删除普通 edge 和 graph node，并通过撤销恢复；验证后图谱节点数回到删除前状态。
- Codex in-app browser 的 CDP screenshot 在当前页面仍超时，截图证据未产出；本轮使用 DOM snapshot、computed style、console logs 和真实 CUA drag/click 验证。

## 2026-06-09 补充修复：标签一致性、小地图稳定性和节点尺寸

### 用户反馈

- 普通曲线标签和能垒标签风格需要统一为画布上 `OA` 那种胶囊样式；编辑标签后点击空白处应自动保存，标签应贴着曲线/双箭头中心。
- 画布边缘仍像有隐藏空气墙，节点拖到边缘不够自然。
- 右下角小地图拖动预览框时，画布视图和预览框不匹配，拖动时需要实时同步。
- 相对能符号里的 Delta 不应是实心三角。
- 节点默认尺寸偏小，3D 结构和标题看不清；节点需要可手动调整大小，左上角红绿灯按钮更轻。
- 侧边栏文件名在有空间时仍被省略，`Bfix6-ts...` 这类显示不合理。

### 修复

- 普通 edge label 和 barrier label 共用紧凑胶囊样式；edge inline editor 和 barrier inline editor 都支持 blur / unmount 自动提交，点击画布空白即可保存，不再必须按回车。
- Edge label point 直接取 Bezier 曲线中点附近坐标，不再人为上移；barrier label point 固定在垂直双箭头中心。
- Barrier 默认标签从 `▲E‡` 改为 `△E‡` / `△G‡` 系列；节点相对能标签也同步改为 `△E` / `△G`，避免显示成实心三角。
- Graph node 坐标处理移除旧的虚拟画布 clamp：恢复已有位置、拖拽预览、松手吸附、edge 锚点和 screen-to-graph 换算都允许负坐标和超过旧 `600 x 360` 边界的坐标。
- Reset View 在已有节点时改为 Fit Nodes，避免重置到原点后节点落到侧边栏或不可操作区域；测试断言同步更新为新语义。
- 右下角 minimap 的世界边界改为只由默认画布范围和节点内容决定，不再把当前 viewport 纳入边界，避免拖动时坐标系随 viewport 变形；拖动过程中 `onSetViewport` 实时触发。
- 节点默认卡片和 3D viewer 尺寸增大；新增右下角 resize handle，节点可在画布上手动拉大/缩小，resize 会同步刷新 edge metrics。
- 节点红绿灯按钮尺寸进一步压缩，`X` 删除图标保留但只在 hover/focus 时显现，减少标题栏占位感。
- Project Files 文件名从强制单行 ellipsis 改为最多两行显示；删除按钮和 warning dot 继续绝对定位，只在 hover/focus 时覆盖右侧，不再永久挤占文件名宽度。

### 验证

- `cd web && npm run test -- graphViewport.test.ts GraphCanvas.test.tsx graphNodeLayout.test.ts WorkbenchShell.test.tsx --run`（4 files passed；80 passed / 25 skipped）
- `cd web && npm run test -- --run`（30 files passed；270 passed / 25 skipped）
- `cd web && npm run build`（passed；仍有既有 Vite chunk size warning）
- `git diff --check`
- Browser 验证 `http://127.0.0.1:5173/?qa=cold-ui-polish-fresh`：
  - 页面 title 为 `RxnFlow Workbench`，console error/warn 为空。
  - 打开 `Ni-fxc-alpha` 后 3 个 Project Files 均完整显示为 `Bfix6-ts.log`、`Bfix6-tsf.log`、`Bfix6-tsr.log`。
  - 图谱节点显示 `△E`，不再显示实心三角；3 个节点均在画布内可见，右侧节点未被裁切。
  - 从节点底部 barrier handle 拖到另一节点后生成 1 条 barrier annotation；默认 editor value 为 `△E‡ 12.55`，编辑为 `TS barrier` 后点击空白处自动保存。
  - 普通 edge label 点击后进入 inline editor，编辑为 `OA` 后点击空白处自动保存，editor 消失，标签保留为胶囊样式。
  - 节点 resize handle 真实拖动后，卡片从约 `229 x 237` 增大到约 `327 x 348`，内部 3D viewer 同步增大到约 `307 x 252`。
  - Minimap 拖动前后 `.graph-viewport-layer` transform 实时变化；修复后拖动目标点与 minimap viewport window 中心一致。
  - 通过真实拖拽把节点推向右下可视边缘，节点可以部分越过可视底边，不再被旧虚拟画布边界硬挡住；代码层面单元测试覆盖了负坐标和超出旧边界坐标不再 clamp。

### 剩余边界

- Vite build 仍提示单个 JS chunk 超过 500 kB，属于后续 code splitting / lazy load 范围。
- 节点拖动到浏览器窗口外的坐标受 in-app browser 自动化限制，浏览器验证只能覆盖视口内边缘；无 clamp 行为已由 `graphNodeLayout` / `graphViewport` 单元测试覆盖。

## 2026-06-09 补充修复：端口语义、边选择和小地图提交节流

### 用户反馈

- 小地图拖动预览框时，画布移动仍然卡。
- 从节点小圆点长按拖线时会先选中线段；选中线段应只由点击线段触发，修改标签应只由点击椭圆标签触发。
- 左右小圆点必须有固定语义：左侧为输入，右侧为输出；节点移动后连线关系不应自动换边。

### 修复

- Graph minimap 拖动改成 `requestAnimationFrame` 合并预览更新：拖动中只更新 UI-only preview viewport，释放时才调用 `onSetViewport` 提交到 workspace，避免每个 pointer move 都写入项目状态。
- Edge hit line / hitbox 的 `pointerdown` 现在只阻止画布拖拽，不再选择 edge；真正选择 edge 只发生在 `click`。
- Edge label 胶囊的 `pointerdown` 不再进入编辑，只有 `click` 标签胶囊才设置 `editingEdgeLabelId` 并打开 inline editor。
- 左侧 edge handle 保留为输入端口，只阻止事件冒泡，不发起拖线；右侧 handle 才调用 `onStartPointerEdge`。
- Edge segment 锚点固定为 source 右端口到 target 左端口，不再根据节点相对位置切换左右端口。
- 复核节点坐标系后保留节点 position 作为卡片中心点：edge 锚点使用中心 `± nodeHalfWidth`；能垒底部锚点改为中心 `+ nodeHalfHeight`，对应真实底部中央。
- Workbench 导出测试中 `chemdraw_cdxml_only` 的断言改为等待异步导出索引稳定，消除完整测试偶发失败。

### 验证

- `cd web && npm run test -- GraphCanvas.test.tsx --run`（17 passed）
- `cd web && npm run test -- WorkbenchShell.test.tsx --run -t "exports profile artifacts"`（1 passed / 72 skipped）
- `cd web && npm run test -- GraphCanvas.test.tsx graphViewport.test.ts WorkbenchShell.test.tsx --run`（78 passed / 25 skipped）
- `cd web && npm run test -- --run`（30 files passed；273 passed / 25 skipped）
- `cd web && npm run build`（passed；仍有既有 Vite chunk size warning）
- `git diff --check`
- Browser 验证 `http://127.0.0.1:5173/?qa=cold-ui-polish-fresh`：
  - 打开 `Ni-fxc-alpha` 后有 3 个节点、4 条测试过程中生成的 edge、1 个 minimap，页面 title 为 `RxnFlow Workbench`。
  - 右侧输出端口命中堆栈顶部为 `.graph-edge-connect-handle--right`，其下才是 `.graph-edge-hit-line`；边线不再抢端口拖拽。
  - 从 `Bfix6-tsr` 右侧输出端口拖到 `Bfix6-tsf` 左侧输入端口后，edge 数量从 3 变为 4，且没有打开 edge label editor。
  - 点击 `.graph-edge-hitbox` 后只选中 edge，`.graph-edge-inline-label-editor` 数量为 0；点击同一 edge 的胶囊标签后才出现 1 个 inline editor。
  - 逐条检查 SVG path 端点：每条 edge 的起点最近端口都是 source 的 right handle，终点最近端口都是 target 的 left handle，距离均小于 0.2px。
  - 拖动 minimap viewport window 后 `.graph-viewport-layer` transform 发生变化，释放后 `.graph-minimap-window--draft` 数量为 0。

### 剩余边界

- Browser dev log API 仍返回一条旧时间戳 `2026-06-09T06:15:14.350Z` 的 Vite HMR `Maximum update depth exceeded` 记录；刷新和本轮交互没有生成新的相关 app error。
- 本轮真实浏览器拖线验证会在本地 fixture project 中新增一条测试 edge；这是当前 browser-local 项目状态，不影响源码测试和构建。

## 2026-06-09 补充修复：能量布局 0 点左置

### 用户反馈

- 能量布局应始终把当前 `△E 0.00` 的参考结构放在画布左边。
- 后续节点应根据图谱连线关系向右展开，而不是单纯按能量高低或已有画布位置横向排序。

### 修复

- `Energy Layout` 现在把当前能量参考节点作为 layer 0；若用户没有手动指定参考节点，则继续使用当前路径里的默认 0 点。
- 横向坐标改为从参考节点出发，按 directed edge / path 连通关系分层：参考节点在最左侧，直接相连的后继进入右侧下一层，后续节点继续向右展开。
- 纵向坐标继续使用当前显示模式下的相对能量值，因此势能面仍然保持“高能在上、低能在下”的视觉语义。
- 对未从参考节点有向可达的节点，布局会按无向连通关系、path order 和原有位置兜底，但仍只给非负 layer，避免任何节点跑到 0 点左侧。

### 验证

- `cd web && npm run test -- GraphCanvas.test.tsx --run`（18 passed）
- `cd web && npm run build`（passed；仍有既有 Vite chunk size warning）
- Browser 验证 `http://127.0.0.1:5173/?qa=cold-ui-polish-fresh`：
  - 打开 `Ni-fxc-alpha` 后画布有 3 个节点，`能量布局` 按钮可用。
  - 点击 `能量布局` 后，`Bfix6-tsr` 显示 `△E 0.00 kcal/mol`，其屏幕 `x=370.6`，为当前 3 个节点里的最小 x。
  - 与 0 点相连的 `Bfix6-ts` 和 `Bfix6-tsf` 被排到右侧同一后继层，屏幕 `x=579.7`。
  - Browser console error/warn 为空；CDP screenshot 在当前 in-app browser 环境中仍超时，因此本轮沿用 DOM 坐标和 console 证据。
