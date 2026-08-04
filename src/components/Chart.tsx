import { useEffect, useRef } from "react";
import {
  init,
  dispose,
  type Chart,
  type KLineData,
  type Period,
} from "klinecharts";
import type { CandleHandlers } from "../hooks/useCandleStream";
import type { Candle } from "../lib/types";

type Props = {
  symbol: string;
  timeframe: string;
  stream: CandleHandlers;
};

function toPeriod(timeframe: string): Period {
  switch (timeframe) {
    case "5m":
      return { span: 5, type: "minute" };
    case "15m":
      return { span: 15, type: "minute" };
    case "30m":
      return { span: 30, type: "minute" };
    case "1h":
      return { span: 1, type: "hour" };
    case "4h":
      return { span: 4, type: "hour" };
    case "1d":
      return { span: 1, type: "day" };
    case "1w":
      return { span: 1, type: "week" };
    case "1m":
    default:
      return { span: 1, type: "minute" };
  }
}

function candleToBar(c: Candle): KLineData {
  return {
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  };
}

export default function ChartView({ symbol, timeframe, stream }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const pushBarRef = useRef<((data: KLineData) => void) | null>(null);
  const streamRef = useRef(stream);
  streamRef.current = stream;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = init(el, { styles: "dark" });
    if (!chart) return;
    chartRef.current = chart;

    chart.setDataLoader({
      getBars: async ({ callback }) => {
        try {
          const bars = await streamRef.current.getBars(symbol, timeframe);
          callback(bars.map(candleToBar));
        } catch (e) {
          console.error("getBars failed", e);
          callback([]);
        }
      },
      subscribeBar: ({ callback }) => {
        pushBarRef.current = callback;
      },
      unsubscribeBar: () => {
        pushBarRef.current = null;
      },
    });

    chart.setSymbol({
      ticker: symbol,
      pricePrecision: 2,
      volumePrecision: 3,
    });
    chart.setPeriod(toPeriod(timeframe));

    chart.createIndicator(
      { name: "MA", calcParams: [20], paneId: "candle_pane" },
      true,
    );
    chart.createIndicator({ name: "VOL", paneId: "pane_vol" });
    chart.createIndicator({
      name: "RSI",
      calcParams: [14],
      paneId: "pane_rsi",
    });

    const offCandle = streamRef.current.onCandle((candle) => {
      pushBarRef.current?.(candleToBar(candle));
    });

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);

    return () => {
      offCandle();
      window.removeEventListener("resize", onResize);
      pushBarRef.current = null;
      dispose(chart);
      chartRef.current = null;
    };
  }, [symbol, timeframe]);

  return (
    <div
      ref={containerRef}
      className="chart-root"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
