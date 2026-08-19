// DeepSeek 余额卡片 — 旋转弧线环 + 内部图标 + 余额（复刻桌面版 WhaleSpinner 惯性旋转）
(() => {
  const vscode = acquireVsCodeApi();

  // ─── 主题（对齐桌面版配色） ───
  const DS_BLUE = '#4D6BFE';
  const FG = '#E5E7EB';
  const FG_MUTED = '#9CA3AF';
  const SYMBOLS = { CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };

  // ─── 旋转弧线环：10 段弧、缺口 3 段、靠近缺口渐暗（对齐桌面版 WhaleSpinner） ───
  // 颜色下限 0.45、线宽 4.5：webview 抗锯齿渲染偏淡偏细，补偿后接近桌面版观感
  const RING_R = 20, ARC_W = 4.5, N_SEG = 10, GAP = 3, SEG_DEG = 20;

  function dimColor(hex, factor) {
    const c = hex.replace('#', '');
    const part = (i) =>
      Math.round(parseInt(c.slice(i, i + 2), 16) * factor).toString(16).padStart(2, '0');
    return '#' + part(0) + part(2) + part(4);
  }

  function buildRing() {
    const svg = document.getElementById('ring');
    const CIRC = 2 * Math.PI * RING_R;
    const dash = (CIRC * SEG_DEG) / 360; // 每段弧长
    const gapLen = (CIRC * (360 / N_SEG - SEG_DEG)) / 360; // 段间空白
    const step = 360 / N_SEG;
    for (let i = 0; i < N_SEG; i++) {
      if (i < GAP) continue; // 缺口（与桌面版一致）
      const dist = Math.min(i, N_SEG - i - 1, Math.abs(i - GAP));
      const factor = dist <= 3 ? 0.45 + 0.18 * dist : 1; // 0.45/0.63/0.81/0.99/全亮
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', String(RING_R));
      c.setAttribute('cx', '22');
      c.setAttribute('cy', '22');
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke', dimColor(DS_BLUE, factor));
      c.setAttribute('stroke-width', String(ARC_W));
      c.setAttribute('stroke-dasharray', `${dash} ${gapLen}`);
      c.setAttribute('transform', `rotate(${i * step} 22 22)`);
      svg.appendChild(c);
    }
  }

  // ─── 惯性旋转（复刻桌面版：点击加速 + 连击加成 + 摩擦衰减 + 刷新时自动转） ───
  // 参数照搬桌面版 WhaleSpinner：FRICTION 0.982/帧(8ms)、AUTO_V 0.06 rad/帧 ≈ 1.2 圈/s、
  // CLICK_V 0.15 rad/帧 ≈ 3 圈/s，连击 8 次封顶（mult 1+0.5*min(n-1,8)）
  const ring = document.getElementById('ring');
  const FRICTION = 0.982;
  const MIN_V = 0.0003;
  const AUTO_V = 0.06;
  const CLICK_V = 0.15;
  let angle = 0, velocity = 0, autoSpin = false;
  let rafId = null, lastTs = 0;
  let clickCount = 0, clickResetTimer = null;

  function frame(ts) {
    const dt = lastTs ? ts - lastTs : 8;
    lastTs = ts;
    const dt8 = dt / 8; // 归一化到桌面版 8ms 帧间隔
    if (autoSpin) {
      // 刷新中持续转；低于目标速度时拉回目标（对齐桌面版 auto_spin 逻辑）
      if (velocity === 0) velocity = AUTO_V;
      else if (Math.abs(velocity) < AUTO_V) velocity = velocity > 0 ? AUTO_V : -AUTO_V;
    } else {
      velocity *= Math.pow(FRICTION, dt8);
    }
    angle = (angle - velocity * dt8) % (2 * Math.PI);
    ring.style.transform = `rotate(${angle * 57.29578}deg)`;
    if (Math.abs(velocity) > MIN_V || autoSpin) {
      rafId = requestAnimationFrame(frame);
    } else {
      velocity = 0;
      rafId = null;
      lastTs = 0;
    }
  }

  function ensureSpin() {
    if (rafId === null) {
      lastTs = 0;
      rafId = requestAnimationFrame(frame);
    }
  }

  function kick() {
    clickCount += 1;
    const mult = 1 + 0.5 * Math.min(clickCount - 1, 8); // 连击加速，8 次封顶
    velocity += CLICK_V * mult;
    ensureSpin();
    if (clickResetTimer) clearTimeout(clickResetTimer);
    clickResetTimer = setTimeout(() => {
      clickCount = 0;
      clickResetTimer = null;
    }, 1200);
  }

  function setAutoSpin(on) {
    autoSpin = on;
    if (on) ensureSpin();
  }

  // ─── 图标按 alpha 质心居中（对齐桌面版像素质心计算） ───
  const avatar = document.getElementById('avatar');
  avatar.addEventListener('load', () => {
    try {
      const c = document.createElement('canvas');
      c.width = avatar.naturalWidth;
      c.height = avatar.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(avatar, 0, 0);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      let sx = 0, sy = 0, wsum = 0;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const a = px[(y * c.width + x) * 4 + 3];
          sx += x * a;
          sy += y * a;
          wsum += a;
        }
      }
      if (wsum > 0) {
        const scale = avatar.clientWidth / c.width; // 显示尺寸缩放
        avatar.style.transform = `translate(${(c.width / 2 - sx / wsum) * scale}px, ${(c.height / 2 - sy / wsum) * scale}px)`;
      }
    } catch (e) {
      // 图标损坏时降级：保持居中显示，不崩溃
    }
  });

  // ─── 交互 ───
  const nameEl = document.getElementById('name');
  const balEl = document.getElementById('balance');

  function requestRefresh() {
    kick(); // 点击加速（惯性旋转），刷新结果回来时自动转由消息驱动
    vscode.postMessage({ type: 'refresh' });
  }

  // 点击环/图标 = 立即刷新 + 旋转动画（对齐桌面版）
  document.getElementById('spinner').addEventListener('click', requestRefresh);
  document.getElementById('btn-refresh').addEventListener('click', requestRefresh);
  document.getElementById('btn-platform').addEventListener('click', () =>
    vscode.postMessage({ type: 'openPlatform' }));
  document.getElementById('btn-settings').addEventListener('click', () =>
    vscode.postMessage({ type: 'openSettings' }));

  // ─── 渲染 ───
  function fmt(symbol, v) {
    return symbol + v.toFixed(2);
  }

  function render(balance, error) {
    const symbol = (balance && SYMBOLS[balance.currency]) || '';
    if (balance) {
      nameEl.textContent = 'DeepSeek';
      nameEl.style.color = DS_BLUE;
      balEl.textContent = fmt(symbol, balance.total);
      balEl.style.color = FG;
      balEl.title = `充值: ${fmt(symbol, balance.topup)}\n赠送: ${fmt(symbol, balance.granted)}`;
    } else {
      balEl.textContent = '---';
      balEl.style.color = FG_MUTED;
      const t = error || 'DeepSeek';
      nameEl.textContent = t.length > 14 ? t.slice(0, 14) + '…' : t;
      nameEl.style.color = error ? FG_MUTED : DS_BLUE;
      balEl.title = '';
    }
  }

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'update') render(msg.balance, msg.error);
    else if (msg.type === 'spinning') setAutoSpin(msg.on);
  });

  buildRing();
  // 通知扩展 webview 已就绪，由扩展推送缓存并刷新（防消息丢失）
  vscode.postMessage({ type: 'ready' });
})();
