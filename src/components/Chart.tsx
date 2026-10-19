import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { init, dispose, type Chart, type KLineData, type Overlay, type Period } from 'klinecharts';
import type { CandleHandlers } from '../hooks/useChartStream';
import {
  USER_DRAWING_GROUP,
  snapshotFromOverlay,
  toOverlayStyles,
  toolNeedsText,
  type DrawingSnapshot,
  type DrawingStyle,
  type DrawingToolId,
  type OverlayMagnetMode,
} from '../lib/drawings';
import {
  INDICATOR_META,
  calcParamsEqual,
  type BuiltinIndicatorId,
  type IndicatorConfig,
} from '../lib/indicators';
import { clearRustIndicatorCache, rustIndicatorInstanceKey } from '../lib/klineRustIndicators';
import { subscribeIndicatorBootstrap, subscribeIndicatorPatch } from '../lib/marketStream';
import { INDICATOR_FEATURE, indicatorTooltipFeatures } from '../lib/tooltipFeatures';
import { toKLineStyles, type ThemeTokens } from '../lib/theme';
import type { Candle } from '../lib/types';

export type IndicatorFeatureAction = 'visible' | 'settings' | 'close';

type Props = {
  chartId: string;
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
  onIndicatorFeature: (id: BuiltinIndicatorId, action: IndicatorFeatureAction) => void;
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
    .join(',');
}

function toPeriod(timeframe: string): Period {
  switch (timeframe) {
    case '5m':
      return { span: 5, type: 'minute' };
    case '15m':
      return { span: 15, type: 'minute' };
    case '30m':
      return { span: 30, type: 'minute' };
    case '1h':
      return { span: 1, type: 'hour' };
    case '4h':
      return { span: 4, type: 'hour' };
    case '1d':
      return { span: 1, type: 'day' };
    case '1w':
      return { span: 1, type: 'week' };
    case '1m':
    default:
      return { span: 1, type: 'minute' };
  }
}

const KLINES_PAGE_LIMIT = 1000;
const STREAM_MIN_LOADING_MS = 320;
const STREAM_CANDLES_MS = 420;
const STREAM_READY_MS = 520;

type StreamVisual = 'loading' | 'candles' | 'ready';

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
  | 'onDrawEnd'
  | 'onRemoved'
  | 'onPressedMoveEnd'
  | 'onDoubleClick'
  | 'onSelected'
  | 'onDeselected'
  | 'onRightClick'
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
      mode: snap.mode ?? 'normal',
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
      mode: snap.mode ?? 'normal',
      extendData: snap.extendData,
      styles: snap.styles ? toOverlayStyles(snap.styles) : undefined,
    });
  }
}

function syncIndicators(
  chart: Chart,
  chartId: string,
  configs: IndicatorConfig[],
  applied: Map<BuiltinIndicatorId, Applied>,
  lastOrderKey: { current: string },
) {
  const nextKey = enabledOrderKey(configs);
  const orderChanged =
    lastOrderKey.current !== '' && lastOrderKey.current !== nextKey && applied.size > 0;

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
          extendData: rustIndicatorInstanceKey(chartId, cfg.instanceId),
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
          extendData: rustIndicatorInstanceKey(chartId, cfg.instanceId),
        });
        applied.set(cfg.id, {
          calcParams: [...cfg.calcParams],
          visible,
        });
      }
    }
  }
}

function resubscribeLiveCandle(
  stream: CandleHandlers,
  pushBar: (data: KLineData) => void,
  historyReady: { current: boolean },
): () => void {
  return stream.onCandle((candle) => {
    if (!historyReady.current) return;
    pushBar(candleToBar(candle));
  });
}

export default function ChartView({
  chartId,
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
  const offCandleRef = useRef<(() => void) | null>(null);
  const historyReadyRef = useRef(false);
  const appliedRef = useRef(new Map<BuiltinIndicatorId, Applied>());
  const orderKeyRef = useRef('');
  const drawingsRestoredRef = useRef(false);
  const streamRef = useRef(stream);
  streamRef.current = stream;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const timeframeRef = useRef(timeframe);
  timeframeRef.current = timeframe;
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
  const [streamVisual, setStreamVisual] = useState<StreamVisual>('loading');
  const loadTokenRef = useRef(0);
  const loadStartedAtRef = useRef(0);
  const awaitingIndicatorsRef = useRef(false);
  const streamSwitchReadyRef = useRef(false);
  const setStreamVisualRef = useRef(setStreamVisual);
  setStreamVisualRef.current = setStreamVisual;

  function scheduleStreamVisual(phase: StreamVisual, token: number, extraDelay = 0) {
    const elapsed = performance.now() - loadStartedAtRef.current;
    const floor =
      phase === 'loading'
        ? 0
        : phase === 'candles'
          ? Math.max(STREAM_CANDLES_MS, STREAM_MIN_LOADING_MS)
          : STREAM_READY_MS;
    const remaining = Math.max(0, floor - elapsed) + extraDelay;
    window.setTimeout(() => {
      if (token !== loadTokenRef.current) return;
      setStreamVisualRef.current(phase);
    }, remaining);
  }

  function beginStreamTransition(hasEnabledIndicators: boolean) {
    loadStartedAtRef.current = performance.now();
    loadTokenRef.current += 1;
    awaitingIndicatorsRef.current = hasEnabledIndicators;
    flushSync(() => {
      setStreamVisual('loading');
    });
  }

  function reloadChartStream(
    chart: Chart,
    sym: string,
    tf: string,
    pricePrec: number,
    volPrec: number,
    hasEnabledIndicators: boolean,
  ) {
    beginStreamTransition(hasEnabledIndicators);
    clearRustIndicatorCache(chartId);
    historyReadyRef.current = false;
    offCandleRef.current?.();
    offCandleRef.current = null;

    requestAnimationFrame(() => {
      if (chartRef.current !== chart) return;
      chart.setSymbol({
        ticker: sym,
        pricePrecision: pricePrec,
        volumePrecision: volPrec,
      });
      chart.setPeriod(toPeriod(tf));
      if (pushBarRef.current) {
        offCandleRef.current = resubscribeLiveCandle(
          streamRef.current,
          pushBarRef.current,
          historyReadyRef,
        );
      }
    });
  }

  function finishStreamTransition(token: number) {
    scheduleStreamVisual(awaitingIndicatorsRef.current ? 'candles' : 'ready', token);
  }

  function finishIndicatorTransition() {
    if (!awaitingIndicatorsRef.current) return;
    awaitingIndicatorsRef.current = false;
    scheduleStreamVisual('ready', loadTokenRef.current, 90);
  }

  function emitDrawings(chart: Chart) {
    onDrawingsChangeRef.current(collectUserDrawings(chart));
  }

  function applyChartTheme(chart: Chart, tokens: ThemeTokens) {
    const up = tokens['candle-up'];
    const down = tokens['candle-down'];
    const themed = toKLineStyles(tokens);
    chart.setStyles({
      candle: {
        bar: {
          upColor: up,
          downColor: down,
          noChangeColor: tokens['muted-foreground'],
          upBorderColor: up,
          downBorderColor: down,
          noChangeBorderColor: tokens['muted-foreground'],
          upWickColor: up,
          downWickColor: down,
          noChangeWickColor: tokens['muted-foreground'],
        },
        priceMark: {
          last: {
            upColor: up,
            downColor: down,
            noChangeColor: tokens['muted-foreground'],
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

    const chart = init(el, { styles: 'dark' });
    if (!chart) return;
    chartRef.current = chart;
    appliedRef.current = new Map();
    orderKeyRef.current = '';
    drawingsRestoredRef.current = false;
    historyReadyRef.current = false;

    applyChartTheme(chart, themeTokensRef.current);

    chart.subscribeAction('onIndicatorTooltipFeatureClick', (data) => {
      const payload = data as {
        feature?: { id?: string };
        indicator?: { name?: string };
      } | null;
      const featureId = payload?.feature?.id;
      const name = payload?.indicator?.name;
      if (!featureId || !name || !isBuiltinId(name)) return;

      if (featureId === INDICATOR_FEATURE.visible) {
        onIndicatorFeatureRef.current(name, 'visible');
      } else if (featureId === INDICATOR_FEATURE.settings) {
        onIndicatorFeatureRef.current(name, 'settings');
      } else if (featureId === INDICATOR_FEATURE.close) {
        onIndicatorFeatureRef.current(name, 'close');
      }
    });

    chart.setDataLoader({
      getBars: async ({ type, timestamp, callback }) => {
        if (type === 'backward' || type === 'update') {
          callback([], { forward: true, backward: false });
          return;
        }
        try {
          const endTime = type === 'forward' && timestamp != null ? timestamp - 1 : undefined;
          const bars = await streamRef.current.getBars(
            symbolRef.current,
            timeframeRef.current,
            { endTime },
          );
          callback(bars.map(candleToBar), {
            forward: bars.length >= KLINES_PAGE_LIMIT,
            backward: false,
          });
          historyReadyRef.current = true;
          if (type !== 'forward') {
            finishStreamTransition(loadTokenRef.current);
          }
        } catch (e) {
          console.error('getBars failed', e);
          callback([], { forward: false, backward: false });
          historyReadyRef.current = true;
          if (type !== 'forward') {
            finishStreamTransition(loadTokenRef.current);
          }
        }
      },
      subscribeBar: ({ callback }) => {
        pushBarRef.current = callback;
        offCandleRef.current?.();
        offCandleRef.current = resubscribeLiveCandle(
          streamRef.current,
          callback,
          historyReadyRef,
        );
      },
      unsubscribeBar: () => {
        offCandleRef.current?.();
        offCandleRef.current = null;
        pushBarRef.current = null;
      },
    });

    reloadChartStream(
      chart,
      symbolRef.current,
      timeframeRef.current,
      pricePrecision,
      volumePrecision,
      indicators.some((cfg) => cfg.enabled),
    );

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);

    return () => {
      offCandleRef.current?.();
      offCandleRef.current = null;
      window.removeEventListener('resize', onResize);
      pushBarRef.current = null;
      historyReadyRef.current = false;
      appliedRef.current = new Map();
      orderKeyRef.current = '';
      drawingsRestoredRef.current = false;
      dispose(chart);
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (!streamSwitchReadyRef.current) {
      streamSwitchReadyRef.current = true;
      return;
    }

    reloadChartStream(
      chart,
      symbol,
      timeframe,
      pricePrecision,
      volumePrecision,
      indicators.some((cfg) => cfg.enabled),
    );
  }, [chartId, symbol, timeframe, pricePrecision, volumePrecision, indicators]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    applyChartTheme(chart, themeTokens);
  }, [themeId, themeMode, themeTokens]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    syncIndicators(chart, chartId, indicators, appliedRef.current, orderKeyRef);
  }, [chartId, indicators, symbol, timeframe, pricePrecision, volumePrecision]);

  useEffect(() => {
    const refresh = () => {
      const chart = chartRef.current;
      if (!chart) return;
      for (const cfg of indicators) {
        if (!cfg.enabled) continue;
        chart.overrideIndicator({
          name: cfg.id,
          calcParams: cfg.calcParams,
          extendData: rustIndicatorInstanceKey(chartId, cfg.instanceId),
        });
      }
      finishIndicatorTransition();
    };
    const offBootstrap = subscribeIndicatorBootstrap(chartId, refresh);
    const offPatch = subscribeIndicatorPatch(chartId, refresh);
    return () => {
      offBootstrap();
      offPatch();
    };
  }, [chartId, indicators]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const openSettings = (id: string) => onOpenDrawingSettingsRef.current(id);
    const onSelect = (id: string | null) => onDrawingSelectRef.current(id);

    if (drawings.length === 0) {
      chart.removeOverlay({ groupId: USER_DRAWING_GROUP });
      drawingsRestoredRef.current = true;
      return;
    }

    const existing = chart.getOverlays({ groupId: USER_DRAWING_GROUP });
    if (existing.length === 0 && !drawingsRestoredRef.current) {
      restoreDrawings(chart, drawings, () => emitDrawings(chart), openSettings, onSelect);
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
    const text = annotationTextRef.current.trim() || 'Note';

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
    <div className={`chart-stage chart-stage--${streamVisual}`}>
      <div ref={containerRef} className="chart-root" />
    </div>
  );
}
