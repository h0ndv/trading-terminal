import type { TickerStats } from '../lib/types';
import {
  formatChangePercent,
  formatCompactVolume,
  isTickerUp,
  tickerChangeClass,
} from '../lib/tickerFormat';

type Props = {
  stats: TickerStats | null;
  pricePrecision: number;
  quoteAsset: string;
};

export default function TickerBar({ stats, pricePrecision, quoteAsset }: Props) {
  if (!stats) return null;

  const up = isTickerUp(stats);
  const sign = up ? '+' : '';

  return (
    <div className="ticker-bar" aria-label="24 hour market stats">
      <span className="ticker-price">
        {stats.last_price.toFixed(pricePrecision)}
      </span>
      <span className={tickerChangeClass(stats)}>
        {formatChangePercent(stats)} ({sign}
        {stats.price_change.toFixed(pricePrecision)})
      </span>
      <span className="ticker-vol">
        Vol {formatCompactVolume(stats.quote_volume)} {quoteAsset}
      </span>
    </div>
  );
}
