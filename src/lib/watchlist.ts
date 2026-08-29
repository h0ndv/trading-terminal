export const MAX_WATCHLIST = 40;

export const DEFAULT_WATCHLIST = ['BTCUSDT', 'ETHUSDT'] as const;

export function normalizeWatchlist(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_WATCHLIST];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const ticker = item.trim().toUpperCase();
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(ticker);
    if (out.length >= MAX_WATCHLIST) break;
  }
  return out;
}

export function toggleWatchlist(list: string[], ticker: string): string[] {
  const t = ticker.trim().toUpperCase();
  if (!t) return list;
  if (list.includes(t)) return list.filter((x) => x !== t);
  if (list.length >= MAX_WATCHLIST) return list;
  return [...list, t];
}
