---
doc_type: architecture
slug: web-workbench
status: current
created: 2026-05-16
last_reviewed: 2026-05-16
implements: [web-workbench-shell]
tags: [web, workbench, shell-client, react, vite, local-first]
---

# Web Workbench

## 1. 当前能力

RxnFlow 当前已有独立 `web/` 前端工程，用于承载 Web Workbench MVP 的第一屏 app shell。该工程使用 React + TypeScript + Vite + npm，提供 `dev`、`build` 和 `test` scripts。

当前 Web Workbench 只落地浏览器端壳层能力：

1. 浏览器入口 `web/index.html` 挂载 React app。
2. `App` 创建前端 `ShellClient`，并接入当前唯一落地的 `in-process-test` fixture transport。
3. `WorkbenchShell` 渲染三栏工作台结构：左侧 project/object summary，中间 graph workspace 区域，右侧 command/profile inspector。
4. 用户点击 `Fixture Run` 后，fixture transport 返回结构化 `ShellResponse`，前端投影为 `WorkbenchShellState` 并更新 project/session/graph/profile/object/artifact summary。
5. 未知 command 返回 `invalid_input`，UI 显示 error code 和 message。
6. 顶栏显示 `Local-only` 状态；当前不承诺云同步。

`web/index.html` 是 Vite app 入口，不能直接用 `file://.../web/index.html` 预览。开发期查看页面需要运行：

```bash
cd web
npm run dev
```

然后打开 `http://127.0.0.1:5173/`。

## 2. 模块与职责

```
web/
├── index.html
├── package.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── shell/
    │   ├── types.ts
    │   ├── ShellClient.ts
    │   └── fixtureTransport.ts
    └── app/
        ├── App.tsx
        ├── WorkbenchShell.tsx
        ├── workbenchState.ts
        └── workbench.css
```

- `web/src/shell/types.ts`：定义前端 JSON-safe Shell DTO，包括 `JsonValue`、`ShellCommandPayload`、`ShellError`、`ShellWarning`、`ShellArtifact`、`ShellResponse`、`ShellTransport`。
- `web/src/shell/ShellClient.ts`：负责 request id 填充、transport 调用和 response normalization。
- `web/src/shell/fixtureTransport.ts`：当前唯一 runtime transport，支持 `fixture.run` 成功路径和 unknown command 错误路径。
- `web/src/app/workbenchState.ts`：把 fixture `ShellResponse` 投影为 `WorkbenchShellState`，保存 command status、session/project/graph/profile summary、counts、warnings 和 error。
- `web/src/app/WorkbenchShell.tsx`：渲染 Web app shell 第一屏，包括 local-only indicator、command button、summary panels 和 graph workspace 占位区。
- `web/src/app/workbench.css`：当前 MVP 的响应式工作台样式；视觉风格不冻结，后续可替换组件库、配色、密度和面板细节。

## 3. 稳定边界

- Web UI 不直接 import Python core，也不复制 parser、registry、reaction graph、energy 或 export 领域算法。
- 前端 Shell DTO 必须保持 JSON-safe；`File`、`Blob`、`ArrayBuffer`、Path 和 class instance 不直接穿过 Shell Client。
- 当前代码只声明已落地的 `in-process-test` transport；`local-python-bridge` 和 `http-api` 仍是 roadmap / runtime boundary 中的未来 transport，不是当前 runtime。
- Fixture Transport 只证明前端能按 `ShellResponse` 消费数据；它不代表真实 Gaussian、ORCA、MAPLE、XYZ/extxyz 导入能力。
- WorkbenchShellState 是 shell response projection，不是 ChemicalObject / ReactionGraph / EnergyProfile 的前端复制品。
- 三栏工作台结构是后续项目、导入、对象、图谱、能量和导出面板的承载骨架；当前 object metrics 和 path board 不是可拖拽对象列表或真实图谱画布。
- 当前不实现 Browser Project Repository、IndexedDB / OPFS、bundle import/export、真实 project open/save、file import、drag/drop、graph canvas editing、energy curve 或 report export UI。
- 当前不实现 HTTP route、Vercel route、FastAPI、Flask、Django、Express server、云存储、账号、权限或同步。

## 4. QA 与验证

当前 Web Workbench 使用 Vitest + Testing Library 覆盖 ShellClient 和 WorkbenchShell：

- `fixture.run` 返回 `ok=true` 的 JSON-safe response。
- unknown command 返回 `ok=false` 和 `invalid_input`。
- App 首屏是 workbench，不是 landing page。
- 点击 `Fixture Run` 后，UI 展示 fixture project/profile/counts 和 `Ready` 状态。
- invalid command error code 可见。

实现验收时已通过：

- `npm run test`
- `npm run build`
- `python3 -m unittest discover`
- 浏览器桌面 viewport `1280x820` 验证
- 浏览器窄屏 viewport `390x840` 验证

桌面和窄屏验证均确认页面可用、无水平溢出；窄屏采用纵向堆叠布局。
