# Linux 安装说明(带图标)

本目录包含:
- `DeepSeek_API_Balance` — 主程序(64 位 Linux 可执行文件)
- `icon-256.png` — 应用图标
- `DeepSeek_API_Balance.desktop` — 桌面入口模板

## 步骤

1. **放置程序**(假设解压到 `~/DeepSeek_API_Balance/`):

   ```bash
   chmod +x ~/DeepSeek_API_Balance/DeepSeek_API_Balance
   ```

2. **安装图标**:

   ```bash
   mkdir -p ~/.local/share/icons/hicolor/256x256/apps
   cp icon-256.png ~/.local/share/icons/hicolor/256x256/apps/deepseek-balance.png
   ```

3. **安装桌面入口**(应用菜单里会出现带图标的 DeepSeek API Balance):

   ```bash
   mkdir -p ~/.local/share/applications
   cp DeepSeek_API_Balance.desktop ~/.local/share/applications/
   # 编辑该文件,把 Exec= 后面的路径改成你的实际路径
   sed -i "s|Exec=.*|Exec=$HOME/DeepSeek_API_Balance/DeepSeek_API_Balance|" \
       ~/.local/share/applications/DeepSeek_API_Balance.desktop
   update-desktop-database ~/.local/share/applications 2>/dev/null || true
   ```

4. **运行**:双击桌面入口,或直接执行程序。

> 首次运行右键 → 设置 → 填入 DeepSeek API Key。
> 若桌面环境不显示图标,执行 `gtk-update-icon-cache ~/.local/share/icons/hicolor` 后注销重登。
