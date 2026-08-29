import { getHistorical, subscribeCandles } from "../lib/marketStream";
import type { Candle } from "../lib/types";

export type GetBarsOpts = {
  endTime?: number;
};

export type CandleHandlers = {
  getBars: (
    symbol: string,
    timeframe: string,
    opts?: GetBarsOpts,
  ) => Promise<Candle[]>;
  onCandle: (cb: (candle: Candle) => void) => () => void;
};

export function useChartStream(
  symbol: string,
  timeframe: string,
): CandleHandlers {
  return {
    getBars: (sym, tf, opts) => getHistorical(sym, tf, opts?.endTime),
    onCandle: (cb) => subscribeCandles(symbol, timeframe, cb),
  };
}
