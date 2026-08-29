import type { TickerStats } from '../lib/types';
import { formatChangePercent, tickerChangeClass } from '../lib/tickerFormat';

type Props = {
  stats: TickerStats | null;
  pricePrecision: number;
  variant?: 'panel' | 'watchlist';
};

export default function CompactTicker({
  stats,
  pricePrecision,
  variant = 'panel',
}: Props) {
  if (!stats) {
    return (
      <span className={`compact-ticker compact-ticker--${variant} compact-ticker--empty`}>
        —
      </span>
    );
  }

  return (
    <span className={`compact-ticker compact-ticker--${variant}`}>
      <span className="compact-ticker-price">{stats.last_price.toFixed(pricePrecision)}</span>
      <span className={tickerChangeClass(stats)}>{formatChangePercent(stats)}</span>
    </span>
  );
}
