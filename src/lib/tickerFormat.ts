import type { TickerStats } from './types';

export function formatCompactVolume(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

export function isTickerUp(stats: TickerStats): boolean {
  return stats.price_change_percent >= 0;
}

export function formatChangePercent(stats: TickerStats): string {
  const sign = isTickerUp(stats) ? '+' : '';
  return `${sign}${stats.price_change_percent.toFixed(2)}%`;
}

export function tickerChangeClass(stats: TickerStats): 'ticker-change up' | 'ticker-change down' {
  return isTickerUp(stats) ? 'ticker-change up' : 'ticker-change down';
}
