---
doc_type: issue-analysis
issue: 2026-08-11-tag-release-provenance
status: confirmed
root_cause_type: config
related: [tag-release-provenance-report.md]
tags: [release, github-actions, provenance, tag, artifact]
---

# Tag Release 产物来源不一致根因分析

## 1. 问题定位

| 关键位置 | 说明 |
|---|---|
| `.github/workflows/desktop-release.yml:4` | `push` 只监听 `main` branch，没有 Beta tag trigger。 |
| `.github/workflows/desktop-release.yml:31` | workflow 默认只有 `contents: read`，没有创建或更新 Release 的权限。 |
| `.github/workflows/desktop-release.yml:158` | ad-hoc macOS Beta job 只允许 `workflow_dispatch`，tag push 不会构建 DMG。 |
| `.github/workflows/desktop-release.yml:147` | `actions/upload-artifact` 只保存 CI artifact，没有汇总两端并发布 Release 的下游 job。 |
| `web/scripts/generate-release-manifest.cjs:40` | manifest 只描述当前单个平台目录，缺少 Beta release tag/version 元数据。 |

## 2. 失败路径还原

**正常路径**：推送 Beta tag -> CI 在该 tag checkout 上测试和构建两端 -> 发布 job 下载同一运行的两端 artifact -> 生成统一 checksum/manifest -> GitHub token 创建 Pre-release。

**失败路径**：推送 `main` -> Windows 和 macOS 分别在不同触发方式下生成 Actions artifact -> tag push 不触发构建 -> 本地 macOS 输出被手动上传 -> Release 缺少 Windows 且发布字节不是 CI 测试字节。

**分叉点**：`.github/workflows/desktop-release.yml:4` — workflow 被设计成分支验证流程，没有 tag 发布入口和最终汇总发布 job。

## 3. 根因

**根因类型**：配置 / 发布编排缺失。

**根因描述**：现有 workflow 将“构建并保存 Actions artifact”误当成完整发布流程。它既没有监听 release tag，也没有 `contents: write` 的最小发布权限，更没有一个在 Windows/macOS job 全部成功后消费同一次运行 artifact 的发布阶段。因此最终 Release 只能依赖人工从某个环境挑选文件。

**是否有多个根因**：是。主根因是缺少 tag 驱动的发布编排；次要根因是 manifest 没有区分应用版本 `0.1.0` 与 Beta 发布版本 `0.1.0-beta.N`，且平台 checksum 无统一汇总点。

## 4. 影响面

- **影响范围**：所有当前和后续 Windows/macOS Beta Release。
- **潜在受害模块**：GitHub Release 附件、checksum/manifest、版本追溯、撤回与重跑流程。
- **数据完整性风险**：不会修改用户项目数据，但无法证明用户下载的安装包就是 CI 验证过的安装包。
- **严重程度复核**：维持 P1；这是发布供应链完整性问题，正式扩大测试前必须修复。

## 5. 修复方案

### 方案 A：继续人工汇总，但从 Actions 下载

- **做什么**：人工下载两端 Actions artifact，合并 checksum 后用 `gh release upload` 发布。
- **优点**：工作流改动少，可以快速补齐现有附件。
- **缺点 / 风险**：仍依赖人工步骤，容易再次漏平台、传错运行或暴露 blockmap 等内部文件。
- **影响面**：只调整操作流程，不能形成长期自动约束。

### 方案 B：Beta tag 驱动同次 CI 自动发布

- **做什么**：监听 `v*-beta.*` tag；tag 构建 Windows 和 ad-hoc macOS；发布 job 下载同一次运行的两端 artifact，只汇总 EXE/DMG/ZIP，生成统一 checksum/manifest，并使用 job 级 `contents: write` 创建 Pre-release。
- **优点**：测试字节与发布字节一致，平台完整，权限范围小，重跑和版本追溯可自动验证。
- **缺点 / 风险**：需要修改 workflow、manifest 元数据和 release smoke；首次应以新 tag 实际验证。
- **影响面**：发布工作流、manifest 和发布文档，不改产品运行逻辑。

### 推荐方案

**采用方案 B**。用户已确认撤回 `beta.1` 二进制附件且不移动旧 tag，之后以 `v0.1.0-beta.2` 对完整流水线做端到端验证。

## 6. 实施阶段补充证据

`v0.1.0-beta.2` tag run 的 Windows job 连续两次在 NSIS silent installer 阶段精确达到默认 `60000ms` 后失败；同一提交的 `main` CI 曾通过，且两次失败都尚未进入 installed app runtime smoke。`web/electron/windows-installer-smoke.cjs` 因此需要把安装/卸载外层预算提高到 `180000ms`，首次应用启动仍使用独立且有上限的 `45000ms` engine cold-start 预算。该调整不跳过安装、启动或卸载检查，只适应 hosted runner 的解压和安全扫描延迟。
