---
doc_type: user-guide
slug: macos-unsigned-beta
status: beta
summary: 在没有 Apple Developer 凭证时安装 RxnFlow 私有 macOS 测试版
tags: [macos, beta, gatekeeper, install]
---

# macOS 未公证测试版

这个版本面向 RxnFlow 私有测试者。它使用 ad-hoc 签名，但没有 Apple Developer ID 签名和 notarization，因此 macOS 可能会拦截首次启动。它不是正式公开发行版。

## 安装

1. 从私有仓库对应 Beta tag 的 GitHub Pre-release 下载与机器架构匹配的 `.dmg` 或 `.zip`。
2. 解压或打开 DMG，把 `RxnFlow.app` 拖到 `Applications`。
3. 第一次启动时，优先使用 Control-click `RxnFlow.app`，选择 **Open**。如果系统仍拦截，到 **System Settings > Privacy & Security**，在安全提示旁选择 **Open Anyway**。
4. 如果应用仍被 quarantine 属性拦截，并且你确认文件来源可信，在 Terminal 执行：

```bash
xattr -dr com.apple.quarantine /Applications/RxnFlow.app
```

然后再次打开应用。这个命令只移除该应用的 quarantine 属性，不要使用 `sudo spctl --master-disable` 关闭整台 Mac 的 Gatekeeper。

## 校验

下载后先用 artifact 中的 `SHA256SUMS.txt` 校验文件，再启动应用。不要运行来源不明的 `.app`，也不要把这个测试版当作已通过 Apple 公证的正式版本。

## 重新获得正式发布资格

正式对外分发仍需要 Apple Developer ID Application 证书、签名、notarization、staple 和 Gatekeeper 验证。
