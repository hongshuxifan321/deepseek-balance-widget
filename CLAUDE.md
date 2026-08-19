# 项目规则 - 余额插件

## 项目是什么
DeepSeek API 余额 VSCode 插件：状态栏常显余额（左下角）+ 旋转弧线环余额卡片。
tkinter 桌面悬浮窗（exe）已于 2026-08-20 彻底退役（源码/CI/桌面入口全清），历史见 git 与 GitHub v1.x Release。
GitHub 公开仓库：`hongshuxifan321/deepseek-balance-widget`。

## 目录结构
- `vscode/`：插件本体
  - `src/extension.ts`：扩展入口（状态栏 / 定时刷新 / secretStorage / 命令 / webview 管理）
  - `src/balanceApi.ts`：余额 API 请求（undici fetch + 可选代理 + 错误翻译）
  - `media/`：webview 卡片前端（card.css / card.js / whale.png；HTML 模板内联在 extension.ts）
- 根：README.md（插件说明）、LICENSE（MIT）、.github/workflows/release-vsix.yml（发布 CI）

## 构建与发布
- 本地编译：`cd vscode && npx tsc -p ./`
- 本地打包：`cd vscode && npx @vscode/vsce package --out deepseek-balance-widget-<版本>.vsix`
- 本地安装：`code --install-extension <vsix>`，验证状态栏左下角出现余额
- **发布流程**：改代码 → bump `vscode/package.json` 的 version → 同步 README/使用说明.md 中的 vsix 文件名 → `git tag v2.x && git push origin v2.x` → CI 自动构建 vsix 挂 Release（workflow 只匹配 `v[2-9]*`，v1.x 不触发）
- 版本规则：exe 时代占用 v1.x，插件从 v2.x 起；tag 与 package.json version 必须一致

## git 纪律
- `vscode/.gitignore`：node_modules/、out/、*.vsix 不提交
- 根 .gitignore：`.deepseek_balance_widget.json`（旧配置，含 API key）不提交
- API key 只存 VSCode secretStorage，任何情况下不进代码/提交/日志/命令行
- 改动后 git commit 留历史；push 前先确认

## 维护要点（踩过的坑）
- **两版同步**：本仓库与 `deepshuk-balance-widget` 代码必须同步维护——改一处必须同步另一处（仅主题色/图标/命令前缀/配置前缀/标题不同）
- **状态栏**：必须 `StatusBarAlignment.Left`（用户要求左下角）
- **激活事件**：package.json 必须有 `activationEvents: ["onStartupFinished"]`——否则重启 VSCode 后扩展不激活、状态栏不出现（contributes.commands 只按需激活）
- **webview 消息时序**：卡片 JS 加载完成后发 `ready`，扩展收到再推缓存并刷新——直接 postMessage 会早于 JS 就绪而丢失
- **旋转环**：复刻桌面版 WhaleSpinner 惯性模型（FRICTION 0.982、AUTO_V 0.06、CLICK_V 0.15、连击 8 次封顶），用 rAF 驱动，别改回匀速 CSS 动画
- **错误翻译**：代理失败识别**靠上下文**（fetchBalance 知道是否用了代理，走了代理且失败 → 抛"代理连接失败"），不靠错误字符串特征——undici 错误链里没有 proxy 字样（实测只有 ECONNREFUSED）。friendlyError 用 causeMessage 递归收集 cause 链匹配特定特征（ProxyError 等），勿用宽泛 /proxy/i（误伤域名含 proxy 的 endpoint）
- **刷新间隔**：restartTimer 必须对非数字 interval 防御（手改 settings.json 可能写字符串 → NaN → 1ms 高频打 API），钳制 [10, 86400]
