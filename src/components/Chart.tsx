import { useEffect, useRef } from "react";
import {
  init,
  dispose,
  type Chart,
  type KLineData,
  type Period,
} from "klinecharts";
import type { CandleHandlers } from "../hooks/useCandleStream";
import {
  INDICATOR_META,
  calcParamsEqual,
  type BuiltinIndicatorId,
  type IndicatorConfig,
} from "../lib/indicators";
import type { Candle } from "../lib/types";

type Props = {
  symbol: string;
  timeframe: string;
  pricePrecision: number;
  volumePrecision: number;
  stream: CandleHandlers;
  indicators: IndicatorConfig[];
};

type Applied = {
  calcParams: number[];
};

function enabledOrderKey(configs: IndicatorConfig[]): string {
  return configs
    .filter((c) => c.enabled)
    .map((c) => c.id)
    .join(",");
}

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

const KLINES_PAGE_LIMIT = 1000;

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

/** Sync built-in indicators to chart in config array order; mutates `applied`. */
function syncIndicators(
  chart: Chart,
  configs: IndicatorConfig[],
  applied: Map<BuiltinIndicatorId, Applied>,
  lastOrderKey: { current: string },
) {
  const nextKey = enabledOrderKey(configs);
  const orderChanged =
    lastOrderKey.current !== "" &&
    lastOrderKey.current !== nextKey &&
    applied.size > 0;

  if (orderChanged) {
    for (const id of [...applied.keys()]) {
      chart.removeIndicator({ name: id });
      applied.delete(id);
    }
  }
  lastOrderKey.current = nextKey;

  // Disable / remove first for ids no longer enabled
  for (const id of [...applied.keys()]) {
    const cfg = configs.find((c) => c.id === id);
    if (!cfg?.enabled) {
      chart.removeIndicator({ name: id });
      applied.delete(id);
    }
  }

  // Create / override in array order
  for (const cfg of configs) {
    if (!cfg.enabled) continue;
    const meta = INDICATOR_META[cfg.id];
    const prev = applied.get(cfg.id);

    if (!prev) {
      chart.createIndicator(
        {
          name: cfg.id,
          calcParams: cfg.calcParams,
          paneId: meta.paneId,
        },
        meta.stackOnCandle,
      );
      applied.set(cfg.id, { calcParams: [...cfg.calcParams] });
    } else if (!calcParamsEqual(prev.calcParams, cfg.calcParams)) {
      chart.overrideIndicator({
        name: cfg.id,
        calcParams: cfg.calcParams,
      });
      applied.set(cfg.id, { calcParams: [...cfg.calcParams] });
    }
  }
}

export default function ChartView({
  symbol,
  timeframe,
  pricePrecision,
  volumePrecision,
  stream,
  indicators,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const pushBarRef = useRef<((data: KLineData) => void) | null>(null);
  const appliedRef = useRef(new Map<BuiltinIndicatorId, Applied>());
  const orderKeyRef = useRef("");
  const streamRef = useRef(stream);
  streamRef.current = stream;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = init(el, { styles: "dark" });
    if (!chart) return;
    chartRef.current = chart;
    appliedRef.current = new Map();
    orderKeyRef.current = "";

    chart.setDataLoader({
      getBars: async ({ type, timestamp, callback }) => {
        // Right edge is live via subscribeBar; no REST backward pages.
        if (type === "backward" || type === "update") {
          callback([], { forward: true, backward: false });
          return;
        }
        try {
          const endTime =
            type === "forward" && timestamp != null ? timestamp - 1 : undefined;
          const bars = await streamRef.current.getBars(symbol, timeframe, {
            endTime,
          });
          callback(bars.map(candleToBar), {
            forward: bars.length >= KLINES_PAGE_LIMIT,
            backward: false,
          });
        } catch (e) {
          console.error("getBars failed", e);
          callback([], { forward: false, backward: false });
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
      pricePrecision,
      volumePrecision,
    });
    chart.setPeriod(toPeriod(timeframe));

    const offCandle = streamRef.current.onCandle((candle) => {
      pushBarRef.current?.(candleToBar(candle));
    });

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);

    return () => {
      offCandle();
      window.removeEventListener("resize", onResize);
      pushBarRef.current = null;
      appliedRef.current = new Map();
      orderKeyRef.current = "";
      dispose(chart);
      chartRef.current = null;
    };
  }, [symbol, timeframe, pricePrecision, volumePrecision]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    syncIndicators(chart, indicators, appliedRef.current, orderKeyRef);
  }, [indicators, symbol, timeframe, pricePrecision, volumePrecision]);

  return (
    <div
      ref={containerRef}
      className="chart-root"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
