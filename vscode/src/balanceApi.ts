import * as vscode from 'vscode';
import { fetch, ProxyAgent } from 'undici';

/** 余额结果（对齐桌面版解析：balance_infos[0]，total_balance 必填） */
export interface BalanceResult {
  total: number;
  topup: number;
  granted: number;
  currency: string;
}

/** 货币符号映射: API 返回的 currency 字段 → 显示符号; 未知货币只显示数字 */
export const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥',
};

/** 把网络异常翻译成短提示（对齐桌面版 _friendly_error 风格） */
export function friendlyError(err: unknown): string {
  const e = err as { name?: string; cause?: unknown; message?: string };
  const name = e?.name ?? '';
  const msg = e?.message ?? '';
  // undici 把代理/连接错误包装在 TypeError("fetch failed") 里，真实类型在 cause 链
  const causeMsg = causeMessage(e?.cause);
  if (name === 'ProxyError' || name === 'ProxyAuthenticationError') return '代理连接失败';
  // 只认代理专用错误特征，不用宽泛 /proxy/i——endpoint 域名含 proxy 时 DNS 错误会误伤
  if (/ProxyError|proxy response|proxy server/i.test(msg + causeMsg)) return '代理连接失败';
  if (name === 'ConnectTimeoutError') return '连接超时';
  if (name === 'TimeoutError' || name === 'AbortError') return '请求超时';
  if (name === 'TypeError' && msg.includes('fetch failed')) return '无法连接服务器';
  if (/certificate|SSL/i.test(msg + causeMsg)) return 'SSL 证书错误';
  if (msg.length > 14) return msg.slice(0, 14) + '…';
  return msg || '未知错误';
}

/** 递归收集 cause 链的错误信息（undici 嵌套包装） */
function causeMessage(cause: unknown, depth = 0): string {
  if (!cause || depth > 3) return '';
  const c = cause as { name?: string; message?: string; cause?: unknown };
  return `${c.name ?? ''} ${c.message ?? ''} ${causeMessage(c.cause, depth + 1)}`.trim();
}

/**
 * 请求余额 API。
 * 默认直连（物理网络直连 DeepSeek 已验证通畅）；
 * 仅当勾选 useSystemProxy 且 VSCode 配置了 http.proxy 时才走代理。
 */
export async function fetchBalance(
  apiKey: string,
  endpoint: string,
  useSystemProxy: boolean,
): Promise<BalanceResult> {
  const opts: { headers: Record<string, string>; signal: AbortSignal; dispatcher?: ProxyAgent } = {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  };
  if (useSystemProxy) {
    const proxy = vscode.workspace.getConfiguration('http').get<string>('proxy');
    if (proxy) opts.dispatcher = new ProxyAgent(proxy);
  }

  const resp = await fetch(endpoint, opts);
  if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);

  const data = (await resp.json()) as { balance_infos?: unknown };
  const infos = data.balance_infos;
  const info = Array.isArray(infos) && infos.length > 0 ? infos[0] : null;
  // 格式非 DeepSeek 官方约定: 显式报错, 不静默显示 0
  if (!info || typeof info !== 'object' || !('total_balance' in info)) {
    throw new Error('余额格式异常');
  }
  const i = info as Record<string, unknown>;
  return {
    total: Number(i.total_balance ?? 0),
    topup: Number(i.topped_up_balance ?? 0),
    granted: Number(i.granted_balance ?? 0),
    currency: String(i.currency ?? 'CNY'),
  };
}
