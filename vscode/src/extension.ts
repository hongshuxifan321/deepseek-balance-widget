import * as vscode from 'vscode';
import { fetchBalance, friendlyError, CURRENCY_SYMBOL, BalanceResult } from './balanceApi';

const CONFIG_SECTION = 'deepseekBalance';
const SECRET_KEY = 'apiKey';
const PLATFORM_URL = 'https://platform.deepseek.com/usage';
const DEFAULT_ENDPOINT = 'https://api.deepseek.com/user/balance';
const CARD_TITLE = 'DeepSeek 余额';

let statusBar: vscode.StatusBarItem | undefined;
let panel: vscode.WebviewPanel | undefined;
let refreshTimer: NodeJS.Timeout | undefined;
let lastBalance: BalanceResult | null = null;
let lastError: string | null = null;
let fetching = false;

export function activate(context: vscode.ExtensionContext) {
  // ─── 状态栏：常显余额，点击开关卡片 ───
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'deepseekBalance.toggleCard';
  context.subscriptions.push(statusBar);
  statusBar.show();
  renderStatusBar();

  // ─── 命令 ───
  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekBalance.toggleCard', () => {
      if (panel) {
        panel.dispose();
      } else {
        openCard(context);
      }
    }),
    vscode.commands.registerCommand('deepseekBalance.refresh', () => refresh(context)),
    vscode.commands.registerCommand('deepseekBalance.setApiKey', async () => {
      const key = await vscode.window.showInputBox({
        prompt: '输入 DeepSeek API Key（sk-...，保存在 VSCode secretStorage，仅本机可读）',
        password: true,
        ignoreFocusOut: true,
      });
      if (key === undefined) return; // 用户取消
      const trimmed = key.trim();
      if (!trimmed) return;
      await context.secrets.store(SECRET_KEY, trimmed);
      vscode.window.showInformationMessage('API Key 已保存');
      refresh(context);
    }),
    vscode.commands.registerCommand('deepseekBalance.clearApiKey', async () => {
      await context.secrets.delete(SECRET_KEY);
      lastBalance = null;
      lastError = null;
      renderStatusBar();
      postToCard({ type: 'update', balance: null, error: null });
    }),
    vscode.commands.registerCommand('deepseekBalance.openPlatform', () => {
      vscode.env.openExternal(vscode.Uri.parse(PLATFORM_URL));
    }),
  );

  // ─── 配置变化 → 重置定时器并立即刷新 ───
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        restartTimer(context);
        refresh(context);
      }
    }),
  );

  // 延迟首次请求，等网络栈就绪（对齐桌面版 1500ms 延迟）
  setTimeout(() => {
    refresh(context);
    restartTimer(context);
  }, 1500);
}

export function deactivate() {
  if (refreshTimer) clearInterval(refreshTimer);
}

// ─── 刷新 ──────────────────────────────────────
async function refresh(context: vscode.ExtensionContext) {
  if (fetching) return;
  fetching = true;
  postToCard({ type: 'spinning', on: true });
  renderStatusBar();
  try {
    const key = await context.secrets.get(SECRET_KEY);
    if (!key) {
      lastBalance = null;
      lastError = '请先设置 API Key';
    } else {
      const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
      const endpoint = cfg.get<string>('endpoint', DEFAULT_ENDPOINT);
      const useProxy = cfg.get<boolean>('useSystemProxy', false);
      lastBalance = await fetchBalance(key, endpoint, useProxy);
      lastError = null;
    }
  } catch (err) {
    lastBalance = null;
    lastError = friendlyError(err);
  } finally {
    fetching = false;
    postToCard({ type: 'update', balance: lastBalance, error: lastError });
    postToCard({ type: 'spinning', on: false });
    renderStatusBar();
  }
}

function restartTimer(context: vscode.ExtensionContext) {
  if (refreshTimer) clearInterval(refreshTimer);
  const interval = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<number>('refreshInterval', 60);
  // 钳制到 [10, 86400]，防止填 0/负数导致高频打爆 API
  const ms = Math.max(10, Math.min(interval, 86400)) * 1000;
  refreshTimer = setInterval(() => {
    if (!fetching) refresh(context);
  }, ms);
}

// ─── 状态栏 ────────────────────────────────────
function renderStatusBar() {
  if (!statusBar) return;
  if (fetching) {
    statusBar.text = '$(sync~spin) 刷新中…';
    statusBar.tooltip = 'DeepSeek API 余额刷新中';
    return;
  }
  if (lastError) {
    statusBar.text = '$(error) 余额';
    statusBar.tooltip = `DeepSeek API 余额：${lastError}\n点击打开余额卡片`;
    return;
  }
  if (lastBalance) {
    const symbol = CURRENCY_SYMBOL[lastBalance.currency] ?? '';
    statusBar.text = `$(database) ${symbol}${lastBalance.total.toFixed(2)}`;
    statusBar.tooltip = [
      'DeepSeek API 余额',
      `总额: ${symbol}${lastBalance.total.toFixed(2)}`,
      `充值: ${symbol}${lastBalance.topup.toFixed(2)}`,
      `赠送: ${symbol}${lastBalance.granted.toFixed(2)}`,
      '点击打开余额卡片',
    ].join('\n');
  } else {
    statusBar.text = '$(key) 未设置 Key';
    statusBar.tooltip = 'DeepSeek API 余额：请先设置 API Key\n点击打开余额卡片';
  }
}

// ─── 余额卡片（webview）───────────────────────
function openCard(context: vscode.ExtensionContext) {
  panel = vscode.window.createWebviewPanel(
    'deepseekBalanceCard',
    CARD_TITLE,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    },
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'whale.png');
  panel.webview.html = getCardHtml(context, panel.webview);

  panel.webview.onDidReceiveMessage((msg) => {
    switch (msg.type) {
      case 'refresh':
        refresh(context);
        break;
      case 'openPlatform':
        vscode.commands.executeCommand('deepseekBalance.openPlatform');
        break;
      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', CONFIG_SECTION);
        break;
    }
  });
  panel.onDidDispose(() => {
    panel = undefined;
  });

  // 打开即推送缓存数据并刷新一次
  postToCard({ type: 'update', balance: lastBalance, error: lastError });
  refresh(context);
}

function postToCard(msg: unknown) {
  panel?.webview.postMessage(msg);
}

function getCardHtml(context: vscode.ExtensionContext, webview: vscode.Webview): string {
  const media = vscode.Uri.joinPath(context.extensionUri, 'media');
  const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(media, 'whale.png'));
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(media, 'card.css'));
  const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(media, 'card.js'));
  const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource}; img-src ${webview.cspSource} data:;`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${cssUri}">
</head>
<body>
  <div id="card">
    <div id="spinner">
      <svg id="ring" viewBox="0 0 44 44" width="44" height="44"></svg>
      <img id="avatar" src="${iconUri}" alt="" draggable="false">
    </div>
    <div id="text">
      <div id="name">DeepSeek</div>
      <div id="balance">---</div>
    </div>
    <div id="actions">
      <button id="btn-refresh" title="立即刷新">刷新</button>
      <button id="btn-platform" title="API 开放平台">平台</button>
      <button id="btn-settings" title="设置">设置</button>
    </div>
  </div>
  <script src="${jsUri}"></script>
</body>
</html>`;
}
