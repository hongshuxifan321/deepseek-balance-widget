# DeepSeek API 余额悬浮窗

桌面悬浮小工具，实时显示 DeepSeek API 余额，点鲸鱼手动刷新。

![screenshot](.deepseek_whale.png)

## 功能

- 🐋 DeepSeek 品牌蓝 + 鲸鱼图标 + 旋转环
- 💰 实时显示 API 余额，每 60 秒自动刷新
- 🖱️ 点击鲸鱼 = 手动刷新 + 旋转动画
- 📋 右键菜单：API 开放平台 / 设置 / 退出
- 🔑 支持 DeepSeek 官方 API 和自定义中转站
- 💾 配置自动保存到 `~/.deepseek_balance_widget.json`

## 安装

```bash
pip install -r requirements.txt
```

## 使用

双击 `DeepSeek_API余额.vbs` 启动（无黑窗），或命令行：

```bash
pythonw DeepSeek_API余额.py
```

首次运行右键 → 设置 → 填入你的 [DeepSeek API Key](https://platform.deepseek.com/api_keys)。

## 打包为 exe

```bash
pip install pyinstaller
pyinstaller --onefile --windowed --name "DeepSeek_API余额" --add-data ".deepseek_whale.png;." DeepSeek_API余额.py
```

exe 在 `dist/` 目录，发给别人直接双击即用。
