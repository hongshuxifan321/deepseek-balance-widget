"""
DeepSeek API 余额悬浮窗
- DeepSeek 蓝色主题 + 鲸鱼图标 + 旋转弧线环
- 点击鲸鱼 = 立即刷新 + 旋转动画
- 默认 60 秒自动刷新（可在设置中调整）
- 右键菜单：API开放平台 / 设置 / 退出
- 支持 DeepSeek 官方 + 自定义中转站
- 配置存储在 ~/.deepseek_balance_widget.json

产出: DeepSeek_API余额.py
"""

import json
import math
import os
import queue
import subprocess
import sys
import threading
import time
import tkinter as tk
import webbrowser
from tkinter import messagebox

import requests
from PIL import Image, ImageTk

CONFIG_PATH = os.path.expanduser("~/.deepseek_balance_widget.json")


def _get_whale_path():
    """鲸鱼图标路径：打包后从 sys._MEIPASS 取，开发时从源目录取"""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, ".deepseek_whale.png")


WHALE_PNG = _get_whale_path()

DEFAULT_CONFIG = {
    "api_key": "",
    "endpoint": "https://api.deepseek.com/user/balance",
    "refresh_interval": 60,
    # 默认直连：物理网络直连 DeepSeek 已验证通畅，全关代理也能用。
    # 仅当 endpoint 是需代理才能访问的地址（如境外中转站）时才勾选走系统代理
    "use_system_proxy": False,
}

# 货币符号映射: API 返回的 currency 字段 → 显示符号; 未知货币只显示数字
CURRENCY_SYMBOL = {"CNY": "¥", "USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥"}

# ─── 配色 ─────────────────────────────────────────
DS_BLUE = "#4D6BFE"
DS_BLUE_DIM = "#3A54D4"
BG = "#111827"
BORDER = DS_BLUE_DIM
FG = "#E5E7EB"
FG_MUTED = "#9CA3AF"


def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            for k, v in DEFAULT_CONFIG.items():
                cfg.setdefault(k, v)
            return cfg
        except Exception:
            # 配置损坏(写入中断/手改坏): 备份后回退默认, 不让悬浮窗启动崩溃
            try:
                os.replace(CONFIG_PATH, CONFIG_PATH + ".corrupt")
            except OSError:
                pass
    return dict(DEFAULT_CONFIG)


def save_config(cfg):
    # 原子写: 先写临时文件再替换, 中途断电不会留下半截配置
    tmp = CONFIG_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    try:
        os.chmod(tmp, 0o600)  # POSIX: 仅本人可读写, API key 不对其他用户可见
    except OSError:
        pass
    os.replace(tmp, CONFIG_PATH)


def _dim_color(hex_color, factor):
    c = hex_color.lstrip("#")
    r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    return f"#{int(r*factor):02x}{int(g*factor):02x}{int(b*factor):02x}"


class WhaleSpinner:
    """鲸鱼图标 + 旋转弧线段 —— 点击加速、惯性衰减"""

    N_SEG = 10          # 弧线段数目
    GAP = 3             # 缺口占几段
    SEG_DEG = 20        # 每段弧角度
    RING_R = 20
    ARC_W = 3.0         # 弧线粗度

    def __init__(self, canvas, cx, cy, whale_img, on_click, offset=(0, 0)):
        self.canvas = canvas
        self.cx = cx
        self.cy = cy
        self.whale_img = whale_img
        self.offset = offset  # 图像中心到质心的偏移，让鲸鱼质心对准环心
        self.on_click = on_click
        self.angle = 0.0
        self.velocity = 0.0
        self.friction = 0.982
        self.min_v = 0.0003
        self.auto_spin = False
        self._running = False
        self._click_count = 0
        self._click_timer = None

        self.canvas.bind("<Button-1>", self._on_click)
        self.canvas.bind("<MouseWheel>", self._on_scroll)

    def _on_click(self, event):
        self._click_count += 1
        mult = 1.0 + 0.5 * min(self._click_count - 1, 8)
        self.velocity += 0.15 * mult
        self._ensure_loop()
        if self._click_timer:
            self.canvas.after_cancel(self._click_timer)
        self._click_timer = self.canvas.after(1200, self._reset_clicks)
        if self.on_click:
            self.on_click()

    def _reset_clicks(self):
        self._click_count = 0
        self._click_timer = None

    def _on_scroll(self, event):
        delta = event.delta / 120.0
        self.velocity += delta * 3.0
        self._ensure_loop()

    def _ensure_loop(self):
        if not self._running:
            self._running = True
            self._loop()

    def _loop(self):
        if self.auto_spin:
            target = 0.06
            if abs(self.velocity) < target:
                self.velocity = target if self.velocity >= 0 else -target
        else:
            self.velocity *= self.friction

        self.angle = (self.angle - self.velocity) % (2 * math.pi)
        self._draw()

        if abs(self.velocity) > self.min_v or self.auto_spin:
            self.canvas.after(8, self._loop)
        else:
            self.velocity = 0.0
            self._running = False

    def _draw(self):
        self.canvas.delete("all")

        # 鲸鱼图标（质心对准环心，物理居中）；加载失败时降级为纯旋转环
        if self.whale_img is not None:
            self.canvas.create_image(
                self.cx + self.offset[0], self.cy + self.offset[1],
                image=self.whale_img, anchor="center")

        # 旋转弧线段
        step_deg = 360 / self.N_SEG
        deg = math.degrees(self.angle)
        for i in range(self.N_SEG):
            if i < self.GAP:
                continue  # 缺口

            # 离缺口越近越暗
            dist = min(i, self.N_SEG - i - 1, abs(i - self.GAP))
            if dist <= 3:
                c = _dim_color(DS_BLUE, 0.2 + 0.25 * dist)
            else:
                c = DS_BLUE

            start = (deg + i * step_deg) % 360
            self.canvas.create_arc(
                self.cx - self.RING_R, self.cy - self.RING_R,
                self.cx + self.RING_R, self.cy + self.RING_R,
                start=start, extent=self.SEG_DEG,
                style="arc", width=self.ARC_W, outline=c,
            )


class BalanceWidget:
    def __init__(self):
        self.cfg = load_config()
        self.balance_data = None
        self.fetch_error = None
        self._fetching = False
        # 工作线程 → 主线程的结果通道。Tk 非线程安全,
        # 工作线程绝不直接调 root.after, 只 put 队列, 主线程 after 轮询
        self._result_queue = queue.Queue()

        self.root = tk.Tk()
        self.root.title("DeepSeek 余额")
        self.root.geometry("152x62+{}+{}".format(
            self.root.winfo_screenwidth() - 170,
            self.root.winfo_screenheight() - 210,
        ))
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.attributes("-alpha", 0.98)
        self.root.configure(bg=BORDER)

        # 内容区（1px 边框）
        inner = tk.Frame(self.root, bg=BG, width=150, height=60)
        inner.place(x=1, y=1)
        inner.pack_propagate(False)

        # 鲸鱼图片（必须在 Tk() 之后加载）；同时计算像素质心，
        # 让鲸鱼在旋转环中物理居中（替代视觉微调）
        self._whale_tk = None
        self._whale_offset = (0, 0)
        if os.path.exists(WHALE_PNG):
            try:
                # 转 RGBA: 无 alpha 的 RGB 图 pa[x,y][3] 会 IndexError 启动崩溃
                img = Image.open(WHALE_PNG).convert("RGBA")
                self._whale_tk = ImageTk.PhotoImage(img)
                w, h = img.size
                pa = img.load()
                sx = sy = wsum = 0.0
                for y in range(h):
                    for x in range(w):
                        a = pa[x, y][3]
                        sx += x * a
                        sy += y * a
                        wsum += a
                if wsum > 0:
                    self._whale_offset = (w / 2 - sx / wsum, h / 2 - sy / wsum)
            except Exception:
                self._whale_tk = None  # 图标损坏时降级: 只显示旋转环, 不崩溃

        # ─── 内容区（整体左右+上下居中） ──────────
        content = tk.Frame(inner, bg=BG)
        content.place(relx=0.5, rely=0.5, anchor="center")

        # 鲸鱼旋转区
        spinner_size = 44
        self.spinner_canvas = tk.Canvas(
            content, width=spinner_size, height=spinner_size,
            bg=BG, highlightthickness=0,
        )
        self.spinner_canvas.pack(side="left")
        self.spin = WhaleSpinner(
            self.spinner_canvas,
            cx=spinner_size // 2, cy=spinner_size // 2,
            whale_img=self._whale_tk,
            on_click=self.refresh,
            offset=self._whale_offset,
        )

        # 文字区
        self.text_frame = tk.Frame(content, bg=BG)
        self.text_frame.pack(side="left", padx=(2, 0))

        # 用 Canvas 画两行文字，间距精确为 0，左右居中
        self.text_canvas = tk.Canvas(
            self.text_frame, width=90, height=44,
            bg=BG, highlightthickness=0,
        )
        self.text_canvas.pack()
        cx = 45  # 画布水平中心
        self._text_name = self.text_canvas.create_text(
            cx, 0, text="DeepSeek", fill=DS_BLUE,
            font=("Segoe UI", 12, "bold"), anchor="n",
        )
        self._text_bal = self.text_canvas.create_text(
            cx, 0, text="---", fill=FG,
            font=("Segoe UI", 12, "bold"), anchor="n",
        )
        self.text_canvas.after_idle(self._recenter_text)

        # ─── 右键菜单 ──────────────────────────────
        self.menu = tk.Menu(self.root, tearoff=0)
        self.menu.add_command(label="API开放平台", command=self._open_platform)
        self.menu.add_command(label="设置", command=self.settings_dialog)
        self.menu.add_separator()
        self.menu.add_command(label="退出", command=self.quit)
        for w in [self.root, inner, content, self.spinner_canvas,
                   self.text_frame, self.text_canvas]:
            w.bind("<Button-3>", lambda e: self.menu.post(e.x_root, e.y_root))

        # ─── 窗口拖动 ──────────────────────────────
        self._drag_x = 0
        self._drag_y = 0
        for w in [inner, content, self.text_frame, self.text_canvas]:
            w.bind("<Button-1>", self._drag_start)
            w.bind("<B1-Motion>", self._drag_move)

        # 延迟首次请求，等系统网络栈初始化完毕
        self.root.after(1500, self._start_refresh_cycle)

    # ─── API 开放平台 ───────────────────────────────
    @staticmethod
    def _open_url(url):
        """跨平台非阻塞打开浏览器"""
        try:
            if sys.platform == "win32":
                os.startfile(url)
            elif sys.platform == "darwin":
                subprocess.Popen(["open", url])
            else:
                subprocess.Popen(["xdg-open", url])
        except Exception:
            webbrowser.open(url)

    def _open_platform(self):
        threading.Thread(
            target=self._open_url,
            args=("https://platform.deepseek.com/usage",),
            daemon=True,
        ).start()

    def _recenter_text(self):
        """根据实际字体尺寸垂直居中两行文字"""
        try:
            b1 = self.text_canvas.bbox(self._text_name)
            b2 = self.text_canvas.bbox(self._text_bal)
            if not b1 or not b2:
                return
            cx = 45
            name_h = b1[3] - b1[1]
            bal_h = b2[3] - b2[1]
            total = name_h + bal_h
            name_y = max(0, (44 - total) // 2)
            bal_y = name_y + name_h
            self.text_canvas.coords(self._text_name, cx, name_y)
            self.text_canvas.coords(self._text_bal, cx, bal_y)
        except Exception:
            pass

    # ─── 拖动 ──────────────────────────────────────
    def _drag_start(self, event):
        self._drag_x = event.x_root - self.root.winfo_x()
        self._drag_y = event.y_root - self.root.winfo_y()

    def _drag_move(self, event):
        self.root.geometry(f"+{event.x_root - self._drag_x}+{event.y_root - self._drag_y}")

    # ─── 刷新 ──────────────────────────────────────
    def refresh(self):
        if self._fetching:
            return
        self._fetching = True
        self.spin.auto_spin = True
        self.spin._ensure_loop()
        threading.Thread(target=self._fetch, daemon=True).start()
        self._poll_result()

    def _poll_result(self):
        """主线程轮询结果队列——工作线程不得直接调 Tk。"""
        try:
            balance_data, fetch_error = self._result_queue.get_nowait()
        except queue.Empty:
            if self._fetching:
                self.root.after(50, self._poll_result)
            return
        self.balance_data = balance_data
        self.fetch_error = fetch_error
        self._update_ui()

    def _fetch(self):
        if not self.cfg["api_key"]:
            result = (None, "请先设置 API Key")
        else:
            try:
                session = requests.Session()
                # 默认直连（物理网络直连 DeepSeek 已验证通畅，Clash 全关也能用）；
                # 需要走代理时在设置里勾选"走系统代理"
                session.trust_env = bool(self.cfg.get("use_system_proxy", False))
                resp = session.get(
                    self.cfg["endpoint"],
                    headers={
                        "Authorization": f"Bearer {self.cfg['api_key']}",
                        "Accept": "application/json",
                    },
                    timeout=10,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    info = data.get("balance_infos", [{}])[0] if data.get("balance_infos") else {}
                    result = ({
                        "total": float(info.get("total_balance", 0)),
                        "topup": float(info.get("topped_up_balance", 0)),
                        "granted": float(info.get("granted_balance", 0)),
                        "currency": info.get("currency", "CNY"),
                    }, None)
                else:
                    result = (None, f"HTTP {resp.status_code}")
            except Exception as e:
                result = (None, self._friendly_error(e))

        self._result_queue.put(result)

    @staticmethod
    def _friendly_error(e):
        """把常见网络异常翻译成悬浮窗能放下的短提示"""
        if isinstance(e, requests.exceptions.ProxyError):
            return "代理连接失败"
        if isinstance(e, requests.exceptions.ConnectTimeout):
            return "连接超时"
        if isinstance(e, requests.exceptions.ReadTimeout):
            return "响应超时"
        if isinstance(e, requests.exceptions.SSLError):
            return "SSL 证书错误"
        if isinstance(e, requests.exceptions.ConnectionError):
            return "无法连接服务器"
        text = str(e)
        return text[:14] + "…" if len(text) > 16 else text

    def _update_ui(self):
        self._fetching = False
        self.spin.auto_spin = False

        if self.balance_data:
            total = self.balance_data["total"]
            symbol = CURRENCY_SYMBOL.get(self.balance_data.get("currency", "CNY"), "")
            self.text_canvas.itemconfig(self._text_bal, text=f"{symbol}{total:.2f}", fill=FG)
            self.text_canvas.itemconfig(self._text_name, text="DeepSeek", fill=DS_BLUE)
        else:
            self.text_canvas.itemconfig(self._text_bal, text="---", fill=FG_MUTED)
            err_text = self.fetch_error or "DeepSeek"
            # 截断过长错误信息（如 SSL 证书路径），避免撑破界面
            if len(err_text) > 16:
                err_text = err_text[:14] + "…"
            self.text_canvas.itemconfig(self._text_name,
                text=err_text,
                fill=FG_MUTED if self.fetch_error else DS_BLUE)
        self._recenter_text()

        self.spin._ensure_loop()

    def _start_refresh_cycle(self):
        """启动刷新循环（延迟后首次刷新 + 启动定时器）"""
        self.refresh()
        self._schedule_refresh()

    def _schedule_refresh(self):
        interval = self.cfg["refresh_interval"] * 1000
        self.root.after(interval, self._schedule_refresh)
        if not self._fetching:
            self.refresh()

    # ─── 设置 ──────────────────────────────────────
    def settings_dialog(self):
        dialog = tk.Toplevel(self.root)
        dialog.title("设置")
        dialog.geometry("420x300")
        dialog.resizable(False, False)
        dialog.configure(bg=BG)
        dialog.attributes("-topmost", True)

        def _add_entry_menu(entry_widget):
            menu = tk.Menu(entry_widget, tearoff=0)
            menu.add_command(label="粘贴", command=lambda: entry_widget.event_generate("<<Paste>>"))
            menu.add_command(label="复制", command=lambda: entry_widget.event_generate("<<Copy>>"))
            menu.add_command(label="剪切", command=lambda: entry_widget.event_generate("<<Cut>>"))
            def _show_menu(event):
                try:
                    menu.tk_popup(event.x_root, event.y_root)
                finally:
                    menu.grab_release()
            entry_widget.bind("<Button-3>", _show_menu)
            entry_widget.bind("<Control-v>", lambda e: entry_widget.event_generate("<<Paste>>"))
            entry_widget.bind("<Control-V>", lambda e: entry_widget.event_generate("<<Paste>>"))

        # API Key
        tk.Label(dialog, text="API Key", fg=FG, bg=BG, font=("Segoe UI", 10)).place(x=16, y=16)
        key_var = tk.StringVar(value=self.cfg["api_key"])
        key_entry = tk.Entry(dialog, textvariable=key_var, show="•", width=50,
                             bg="#1F2937", fg=FG, insertbackground=FG, relief="flat")
        key_entry.place(x=16, y=40)
        _add_entry_menu(key_entry)

        self._show_key = tk.BooleanVar(value=False)
        def _toggle_key():
            key_entry.config(show="" if self._show_key.get() else "•")
        tk.Checkbutton(dialog, text="显示", variable=self._show_key, command=_toggle_key,
                       bg=BG, fg=FG_MUTED, selectcolor="#1F2937",
                       activebackground=BG, activeforeground=FG,
                       font=("Segoe UI", 8)).place(x=340, y=38)

        # Endpoint
        tk.Label(dialog, text="余额查询地址", fg=FG, bg=BG, font=("Segoe UI", 10)).place(x=16, y=76)
        ep_var = tk.StringVar(value=self.cfg["endpoint"])
        ep_entry = tk.Entry(dialog, textvariable=ep_var, width=50,
                           bg="#1F2937", fg=FG, insertbackground=FG, relief="flat")
        ep_entry.place(x=16, y=100)
        _add_entry_menu(ep_entry)

        def set_deepseek():
            ep_var.set("https://api.deepseek.com/user/balance")
        tk.Button(dialog, text="DeepSeek 官方", command=set_deepseek,
                  bg=DS_BLUE_DIM, fg=FG, relief="flat", font=("Segoe UI", 8)).place(x=16, y=130)

        # 刷新间隔
        tk.Label(dialog, text="刷新间隔（秒）", fg=FG, bg=BG, font=("Segoe UI", 10)).place(x=16, y=168)
        interval_var = tk.StringVar(value=str(self.cfg["refresh_interval"]))
        int_entry = tk.Entry(dialog, textvariable=interval_var, width=10,
                           bg="#1F2937", fg=FG, insertbackground=FG, relief="flat")
        int_entry.place(x=16, y=190)
        _add_entry_menu(int_entry)

        # 走系统代理（默认不勾选，直连即可；仅 endpoint 需代理访问时才勾选）
        proxy_var = tk.BooleanVar(value=bool(self.cfg.get("use_system_proxy", False)))
        tk.Checkbutton(dialog, text="走系统代理（仅中转站需要）", variable=proxy_var,
                       bg=BG, fg=FG_MUTED, selectcolor="#1F2937",
                       activebackground=BG, activeforeground=FG,
                       font=("Segoe UI", 8)).place(x=16, y=214)

        def save():
            self.cfg["api_key"] = key_var.get()
            self.cfg["endpoint"] = ep_var.get()
            self.cfg["use_system_proxy"] = proxy_var.get()
            # 间隔钳制到 [10, 86400]: 填 0/负数会让 after(0) 事件循环自旋, 打爆 API
            try:
                val = int(interval_var.get())
            except ValueError:
                val = DEFAULT_CONFIG["refresh_interval"]
            self.cfg["refresh_interval"] = max(10, min(val, 86400))
            save_config(self.cfg)
            dialog.destroy()
            self.refresh()

        tk.Button(dialog, text="保存", command=save,
                  bg=DS_BLUE, fg="#FFFFFF", relief="flat",
                  font=("Segoe UI", 10, "bold"), width=10).place(x=300, y=230)

        dialog.transient(self.root)
        dialog.grab_set()
        dialog.focus_force()
        key_entry.focus_set()

    def quit(self):
        self.root.destroy()
        sys.exit(0)

    def run(self):
        self.root.mainloop()


def _ensure_single_instance():
    """Windows 互斥量: 已有一个实例运行时, 重复启动直接退出。"""
    if sys.platform != "win32":
        return True
    try:
        import ctypes
        mutex = ctypes.windll.kernel32.CreateMutexW(None, False, "DeepSeek_Balance_Widget_Singleton")
        return ctypes.windll.kernel32.GetLastError() == 0  # ERROR_ALREADY_EXISTS 时返回 False
    except Exception:
        return True


if __name__ == "__main__":
    # 注意: 不要加 SetProcessDpiAwareness。本机 150% 缩放下 DPI 感知会让
    # Tk 按物理像素布局, 152x62 窗口缩成 101x41, 文字被裁(2026-08-09 实测)。
    # 不做 DPI 感知时 Windows 按缩放拉伸窗口, 尺寸正常。
    if not _ensure_single_instance():
        sys.exit(0)
    widget = BalanceWidget()
    widget.run()
