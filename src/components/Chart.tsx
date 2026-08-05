import { useEffect, useRef } from "react";
import {
  init,
  dispose,
  type Chart,
  type KLineData,
  type Overlay,
  type Period,
} from "klinecharts";
import type { CandleHandlers } from "../hooks/useCandleStream";
import {
  USER_DRAWING_GROUP,
  snapshotFromOverlay,
  toOverlayStyles,
  toolNeedsText,
  type DrawingSnapshot,
  type DrawingStyle,
  type DrawingToolId,
  type OverlayMagnetMode,
} from "../lib/drawings";
import {
  INDICATOR_META,
  calcParamsEqual,
  type BuiltinIndicatorId,
  type IndicatorConfig,
} from "../lib/indicators";
import {
  INDICATOR_FEATURE,
  indicatorTooltipFeatures,
} from "../lib/tooltipFeatures";
import { toKLineStyles, type ThemeTokens } from "../lib/theme";
import type { Candle } from "../lib/types";

export type IndicatorFeatureAction = "visible" | "settings" | "close";

type Props = {
  symbol: string;
  timeframe: string;
  pricePrecision: number;
  volumePrecision: number;
  stream: CandleHandlers;
  indicators: IndicatorConfig[];
  themeTokens: ThemeTokens;
  themeId: string;
  themeMode: string;
  activeTool: DrawingToolId | null;
  magnetMode: OverlayMagnetMode;
  drawStyle: DrawingStyle;
  annotationText: string;
  drawings: DrawingSnapshot[];
  onDrawingsChange: (next: DrawingSnapshot[]) => void;
  onActiveToolConsumed: () => void;
  onIndicatorFeature: (
    id: BuiltinIndicatorId,
    action: IndicatorFeatureAction,
  ) => void;
  onOpenDrawingSettings: (id: string) => void;
  onDrawingSelect: (id: string | null) => void;
};

type Applied = {
  calcParams: number[];
  visible: boolean;
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

function isBuiltinId(name: string): name is BuiltinIndicatorId {
  return name in INDICATOR_META;
}

function collectUserDrawings(chart: Chart): DrawingSnapshot[] {
  return chart
    .getOverlays({ groupId: USER_DRAWING_GROUP })
    .map((o) => snapshotFromOverlay(o))
    .filter((s): s is DrawingSnapshot => s != null);
}

function attachDrawingLifecycle(
  emit: () => void,
  onOpenSettings: (id: string) => void,
  onSelect: (id: string | null) => void,
): Pick<
  Overlay,
  | "onDrawEnd"
  | "onRemoved"
  | "onPressedMoveEnd"
  | "onDoubleClick"
  | "onSelected"
  | "onDeselected"
  | "onRightClick"
> {
  return {
    onDrawEnd: () => emit(),
    onRemoved: () => {
      emit();
      onSelect(null);
    },
    onPressedMoveEnd: () => emit(),
    onDoubleClick: (event) => {
      const id = event.overlay?.id;
      if (id) onOpenSettings(id);
    },
    onSelected: (event) => {
      const id = event.overlay?.id;
      if (id) onSelect(id);
    },
    onDeselected: () => onSelect(null),
    onRightClick: (event) => {
      if (event.overlay?.lock) {
        event.preventDefault?.();
      }
    },
  };
}

function restoreDrawings(
  chart: Chart,
  drawings: DrawingSnapshot[],
  emit: () => void,
  onOpenSettings: (id: string) => void,
  onSelect: (id: string | null) => void,
) {
  for (const snap of drawings) {
    chart.createOverlay({
      id: snap.id,
      name: snap.name,
      groupId: snap.groupId ?? USER_DRAWING_GROUP,
      points: snap.points.map((p) => ({
        timestamp: p.timestamp,
        value: p.value,
        ...(p.dataIndex != null ? { dataIndex: p.dataIndex } : {}),
      })),
      lock: snap.lock,
      visible: snap.visible ?? true,
      mode: snap.mode ?? "normal",
      extendData: snap.extendData,
      styles: snap.styles ? toOverlayStyles(snap.styles) : undefined,
      ...attachDrawingLifecycle(emit, onOpenSettings, onSelect),
    });
  }
}

function syncDrawingOverrides(chart: Chart, drawings: DrawingSnapshot[]) {
  for (const snap of drawings) {
    chart.overrideOverlay({
      id: snap.id,
      visible: snap.visible ?? true,
      lock: snap.lock ?? false,
      mode: snap.mode ?? "normal",
      extendData: snap.extendData,
      styles: snap.styles ? toOverlayStyles(snap.styles) : undefined,
    });
  }
}

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

  for (const id of [...applied.keys()]) {
    const cfg = configs.find((c) => c.id === id);
    if (!cfg?.enabled) {
      chart.removeIndicator({ name: id });
      applied.delete(id);
    }
  }

  for (const cfg of configs) {
    if (!cfg.enabled) continue;
    const meta = INDICATOR_META[cfg.id];
    const prev = applied.get(cfg.id);
    const visible = cfg.visible !== false;

    if (!prev) {
      chart.createIndicator(
        {
          name: cfg.id,
          calcParams: cfg.calcParams,
          paneId: meta.paneId,
          visible,
        },
        meta.stackOnCandle,
      );
      applied.set(cfg.id, {
        calcParams: [...cfg.calcParams],
        visible,
      });
    } else {
      const paramsChanged = !calcParamsEqual(prev.calcParams, cfg.calcParams);
      const visibleChanged = prev.visible !== visible;
      if (paramsChanged || visibleChanged) {
        chart.overrideIndicator({
          name: cfg.id,
          ...(paramsChanged ? { calcParams: cfg.calcParams } : {}),
          ...(visibleChanged ? { visible } : {}),
        });
        applied.set(cfg.id, {
          calcParams: [...cfg.calcParams],
          visible,
        });
      }
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
  themeTokens,
  themeId,
  themeMode,
  activeTool,
  magnetMode,
  drawStyle,
  annotationText,
  drawings,
  onDrawingsChange,
  onActiveToolConsumed,
  onIndicatorFeature,
  onOpenDrawingSettings,
  onDrawingSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const pushBarRef = useRef<((data: KLineData) => void) | null>(null);
  const appliedRef = useRef(new Map<BuiltinIndicatorId, Applied>());
  const orderKeyRef = useRef("");
  const drawingsRestoredRef = useRef(false);
  const streamRef = useRef(stream);
  streamRef.current = stream;
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  const onDrawingsChangeRef = useRef(onDrawingsChange);
  onDrawingsChangeRef.current = onDrawingsChange;
  const onActiveToolConsumedRef = useRef(onActiveToolConsumed);
  onActiveToolConsumedRef.current = onActiveToolConsumed;
  const magnetModeRef = useRef(magnetMode);
  magnetModeRef.current = magnetMode;
  const drawStyleRef = useRef(drawStyle);
  drawStyleRef.current = drawStyle;
  const annotationTextRef = useRef(annotationText);
  annotationTextRef.current = annotationText;
  const onIndicatorFeatureRef = useRef(onIndicatorFeature);
  onIndicatorFeatureRef.current = onIndicatorFeature;
  const onOpenDrawingSettingsRef = useRef(onOpenDrawingSettings);
  onOpenDrawingSettingsRef.current = onOpenDrawingSettings;
  const onDrawingSelectRef = useRef(onDrawingSelect);
  onDrawingSelectRef.current = onDrawingSelect;
  const themeTokensRef = useRef(themeTokens);
  themeTokensRef.current = themeTokens;

  function emitDrawings(chart: Chart) {
    onDrawingsChangeRef.current(collectUserDrawings(chart));
  }

  function applyChartTheme(chart: Chart, tokens: ThemeTokens) {
    const up = tokens["candle-up"];
    const down = tokens["candle-down"];
    const themed = toKLineStyles(tokens);
    // Candle bar first so merge can't be skipped by a partial tooltip-only path.
    chart.setStyles({
      candle: {
        bar: {
          upColor: up,
          downColor: down,
          noChangeColor: tokens["muted-foreground"],
          upBorderColor: up,
          downBorderColor: down,
          noChangeBorderColor: tokens["muted-foreground"],
          upWickColor: up,
          downWickColor: down,
          noChangeWickColor: tokens["muted-foreground"],
        },
        priceMark: {
          last: {
            upColor: up,
            downColor: down,
            noChangeColor: tokens["muted-foreground"],
          },
        },
      },
    });
    chart.setStyles({
      ...themed,
      indicator: {
        ...themed.indicator,
        tooltip: {
          ...themed.indicator?.tooltip,
          features: indicatorTooltipFeatures(tokens),
        },
      },
    });
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = init(el, { styles: "dark" });
    if (!chart) return;
    chartRef.current = chart;
    appliedRef.current = new Map();
    orderKeyRef.current = "";
    drawingsRestoredRef.current = false;

    applyChartTheme(chart, themeTokensRef.current);

    chart.subscribeAction("onIndicatorTooltipFeatureClick", (data) => {
      const payload = data as {
        feature?: { id?: string };
        indicator?: { name?: string };
      } | null;
      const featureId = payload?.feature?.id;
      const name = payload?.indicator?.name;
      if (!featureId || !name || !isBuiltinId(name)) return;

      if (featureId === INDICATOR_FEATURE.visible) {
        onIndicatorFeatureRef.current(name, "visible");
      } else if (featureId === INDICATOR_FEATURE.settings) {
        onIndicatorFeatureRef.current(name, "settings");
      } else if (featureId === INDICATOR_FEATURE.close) {
        onIndicatorFeatureRef.current(name, "close");
      }
    });

    chart.setDataLoader({
      getBars: async ({ type, timestamp, callback }) => {
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
      drawingsRestoredRef.current = false;
      dispose(chart);
      chartRef.current = null;
    };
  }, [symbol, timeframe, pricePrecision, volumePrecision]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    applyChartTheme(chart, themeTokens);
  }, [themeId, themeMode, themeTokens]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    syncIndicators(chart, indicators, appliedRef.current, orderKeyRef);
  }, [indicators, symbol, timeframe, pricePrecision, volumePrecision]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const openSettings = (id: string) =>
      onOpenDrawingSettingsRef.current(id);
    const onSelect = (id: string | null) =>
      onDrawingSelectRef.current(id);

    if (drawings.length === 0) {
      chart.removeOverlay({ groupId: USER_DRAWING_GROUP });
      drawingsRestoredRef.current = true;
      return;
    }

    const existing = chart.getOverlays({ groupId: USER_DRAWING_GROUP });
    if (existing.length === 0 && !drawingsRestoredRef.current) {
      restoreDrawings(
        chart,
        drawings,
        () => emitDrawings(chart),
        openSettings,
        onSelect,
      );
      drawingsRestoredRef.current = true;
      return;
    }

    if (existing.length > 0) {
      const keep = new Set(drawings.map((d) => d.id));
      for (const o of existing) {
        if (!keep.has(o.id)) {
          chart.removeOverlay({ id: o.id });
        }
      }
      syncDrawingOverrides(chart, drawings);
    }
  }, [drawings, symbol, timeframe, pricePrecision, volumePrecision]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !activeTool) return;

    const style = drawStyleRef.current;
    const text = annotationTextRef.current.trim() || "Note";

    chart.createOverlay({
      name: activeTool,
      groupId: USER_DRAWING_GROUP,
      mode: magnetModeRef.current,
      styles: toOverlayStyles(style),
      ...(toolNeedsText(activeTool) ? { extendData: text } : {}),
      onDrawEnd: (event) => {
        emitDrawings(chart);
        onActiveToolConsumedRef.current();
        const id = event.overlay?.id;
        if (id) onDrawingSelectRef.current(id);
      },
      onRemoved: () => {
        emitDrawings(chart);
        onDrawingSelectRef.current(null);
      },
      onPressedMoveEnd: () => emitDrawings(chart),
      onDoubleClick: (event) => {
        const id = event.overlay?.id;
        if (id) onOpenDrawingSettingsRef.current(id);
      },
      onSelected: (event) => {
        const id = event.overlay?.id;
        if (id) onDrawingSelectRef.current(id);
      },
      onDeselected: () => onDrawingSelectRef.current(null),
      onRightClick: (event) => {
        if (event.overlay?.lock) {
          event.preventDefault?.();
        }
      },
    });
  }, [activeTool, symbol, timeframe, pricePrecision, volumePrecision]);

  return (
    <div
      ref={containerRef}
      className="chart-root"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
