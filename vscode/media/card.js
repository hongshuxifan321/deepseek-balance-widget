// DeepSeek 余额卡片 — 旋转弧线环 + 内部图标 + 余额（复刻桌面版 WhaleSpinner）
(() => {
  const vscode = acquireVsCodeApi();

  // ─── 主题（对齐桌面版配色） ───
  const DS_BLUE = '#4D6BFE';
  const FG = '#E5E7EB';
  const FG_MUTED = '#9CA3AF';
  const SYMBOLS = { CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };

  // ─── 旋转弧线环：10 段弧、缺口 3 段、靠近缺口越暗（对齐桌面版 WhaleSpinner） ───
  const RING_R = 20, ARC_W = 3, N_SEG = 10, GAP = 3, SEG_DEG = 20;

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
      const color = dist <= 3 ? dimColor(DS_BLUE, 0.2 + 0.25 * dist) : DS_BLUE;
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', String(RING_R));
      c.setAttribute('cx', '22');
      c.setAttribute('cy', '22');
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke', color);
      c.setAttribute('stroke-width', String(ARC_W));
      c.setAttribute('stroke-dasharray', `${dash} ${gapLen}`);
      c.setAttribute('transform', `rotate(${i * step} 22 22)`);
      svg.appendChild(c);
    }
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
  const card = document.getElementById('card');
  const nameEl = document.getElementById('name');
  const balEl = document.getElementById('balance');

  function toggleSpin(on) {
    card.classList.toggle('spin-on', on);
  }

  function requestRefresh() {
    toggleSpin(true);
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
    else if (msg.type === 'spinning') toggleSpin(msg.on);
  });

  buildRing();
})();
