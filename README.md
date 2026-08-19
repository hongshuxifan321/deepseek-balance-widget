# DeepSeek API 余额（VSCode 插件）

VSCode 状态栏常显 DeepSeek API 余额，点击打开旋转弧线环余额卡片。

> 原 tkinter 桌面悬浮窗（exe）已于 2026-08-20 退役，由本插件取代。历史版本见 git 历史与 GitHub Release。

## 功能

- 状态栏常显余额（左下角），悬停显示充值/赠送明细
- 点击状态栏打开余额卡片：旋转弧线环 + 鲸鱼图标 + 余额（复刻原悬浮窗视觉）
- 点击鲸鱼 = 立即刷新 + 惯性旋转动画（点击加速、摩擦衰减、连击加成）
- 默认 60 秒自动刷新
- 支持自定义 endpoint（中转站）与系统代理
- API key 存 VSCode secretStorage（系统加密，不落明文文件）

## 安装

```bash
code --install-extension deepseek-balance-widget-2.0.1.vsix
```

或 VSCode 扩展面板 → `...` → 从 VSIX 安装。

## 使用

1. 命令面板（Ctrl+Shift+P）→「DeepSeek 余额：设置 API Key」，输入 `sk-...`
2. 状态栏左下角显示 `¥余额`，点击打开余额卡片

## 配置（设置 → 搜索 `deepseekBalance`）

| 配置项 | 默认 | 说明 |
|---|---|---|
| `deepseekBalance.endpoint` | `https://api.deepseek.com/user/balance` | 余额查询地址（中转站改这里） |
| `deepseekBalance.refreshInterval` | `60` | 自动刷新间隔（秒，10-86400） |
| `deepseekBalance.useSystemProxy` | `false` | 走系统代理（仅当 endpoint 需代理访问时勾选） |

## 命令

| 命令 | 说明 |
|---|---|
| DeepSeek 余额：设置 API Key | 输入/更新 API key（secretStorage） |
| DeepSeek 余额：清除 API Key | 删除已存 key |
| DeepSeek 余额：立即刷新 | 手动刷新余额 |
| DeepSeek 余额：打开 API 开放平台 | 浏览器打开 `platform.deepseek.com/usage` |
| DeepSeek 余额：打开/关闭余额卡片 | 开关旋转环卡片 |

## 从源码构建

```bash
cd vscode
npm install
npm run compile            # tsc
npx @vscode/vsce package   # 生成 .vsix
```

## 安全

- API key 只存 VSCode secretStorage（Windows 凭据保护加密），不上传、不写日志
- 插件无遥测、无任何第三方请求，仅向配置的 endpoint 发起余额查询
- 鲸鱼图标为 DeepSeek 商标，仅用于功能展示

## License

MIT
