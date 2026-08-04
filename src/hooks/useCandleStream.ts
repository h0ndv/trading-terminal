import { useEffect, useRef } from "react";
import { getHistorical, onCandleUpdate } from "../lib/tauriBridge";
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

/**
 * Bridges Tauri historical + realtime candle stream.
 * Does not hold candle series in React state — callers push into chart refs.
 */
export function useCandleStream(
  _symbol: string,
  _timeframe: string,
): CandleHandlers {
  const listenersRef = useRef(new Set<(c: Candle) => void>());

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    onCandleUpdate((candle) => {
      listenersRef.current.forEach((cb) => cb(candle));
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return {
    getBars: (sym, tf, opts) => getHistorical(sym, tf, opts?.endTime),
    onCandle: (cb) => {
      listenersRef.current.add(cb);
      return () => {
        listenersRef.current.delete(cb);
      };
    },
  };
}
