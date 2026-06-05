# DeepSeek API 余额悬浮窗

> 等 DeepSeek 回复时点鲸鱼转圈玩，顺便看一眼余额——不用切到官网，不用开 ccswitch。

桌面悬浮小工具，屏幕角落常驻。点击鲸鱼图标查询余额，顺带转圈解压。

## 为什么做这个

- 等 AI 回复的那几秒手闲，点鲸鱼转圈打发时间
- 查余额要打开官网 / ccswitch 再切回来，烦
- 悬浮窗往角落一放，扫一眼就知道还剩多少钱

## 功能

- 🐋 DeepSeek 品牌蓝 + 鲸鱼图标 + 旋转弧线环
- 💰 实时显示 API 余额，每 60 秒自动刷新
- 🖱️ 点击鲸鱼 = 手动刷新 + 解压转圈
- 📋 右键菜单：API 开放平台 / 设置 / 退出
- 🔑 支持 DeepSeek 官方 API 和自定义中转站（如 ccswitch）
- 💾 配置保存在本地 `~/.deepseek_balance_widget.json`，不上传

## 下载

直接下载 exe，免安装、免 Python：

👉 **[下载最新版 exe](../../releases/latest)**

## 从源码运行

```bash
pip install -r requirements.txt
pythonw DeepSeek_API余额.py
```

首次运行右键 → 设置 → 填入你的 [DeepSeek API Key](https://platform.deepseek.com/api_keys)。

## 自行打包

```bash
pip install pyinstaller
pyinstaller --onefile --windowed --name "DeepSeek_API余额" --add-data ".deepseek_whale.png;." DeepSeek_API余额.py
```
