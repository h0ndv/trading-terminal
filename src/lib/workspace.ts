import { DEFAULT_INDICATORS, normalizeIndicators, type IndicatorConfig } from './indicators';
import type { IndicatorSubscription } from './types';

export const VALID_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const;

export type ChartId = string;

export type ChartPanelConfig = {
  id: ChartId;
  symbol: string;
  timeframe: string;
  indicators: IndicatorConfig[];
};

export type WorkspaceLayout = {
  panelGroupId: string;
  defaultLayout: Record<string, number>;
};

export const MAX_CHARTS = 4;

export const DEFAULT_SYMBOL = 'BTCUSDT';
export const DEFAULT_TIMEFRAME = '1m';

function cloneIndicators(list: IndicatorConfig[]): IndicatorConfig[] {
  return list.map((d) => ({ ...d, calcParams: [...d.calcParams] }));
}

export function defaultIndicators(): IndicatorConfig[] {
  return cloneIndicators(DEFAULT_INDICATORS);
}

export function createChartPanel(
  symbol = DEFAULT_SYMBOL,
  timeframe = DEFAULT_TIMEFRAME,
  indicators?: IndicatorConfig[],
): ChartPanelConfig {
  return {
    id: crypto.randomUUID(),
    symbol,
    timeframe,
    indicators: indicators ? cloneIndicators(indicators) : defaultIndicators(),
  };
}

export function normalizeChartPanel(raw: unknown): ChartPanelConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id.length > 0 ? r.id : null;
  if (!id) return null;
  const symbol =
    typeof r.symbol === 'string' && r.symbol.trim().length > 0
      ? r.symbol.trim().toUpperCase()
      : DEFAULT_SYMBOL;
  const timeframe =
    typeof r.timeframe === 'string' && (VALID_INTERVALS as readonly string[]).includes(r.timeframe)
      ? r.timeframe
      : DEFAULT_TIMEFRAME;
  const indicators = normalizeIndicators(
    Array.isArray(r.indicators) ? r.indicators : DEFAULT_INDICATORS,
  );
  return { id, symbol, timeframe, indicators };
}

export function normalizeCharts(raw: unknown): ChartPanelConfig[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const charts = raw.map(normalizeChartPanel).filter((c): c is ChartPanelConfig => c != null);
  return charts.length > 0 ? charts : [];
}

export function normalizeWorkspaceLayout(raw: unknown): WorkspaceLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const panelGroupId =
    typeof r.panelGroupId === 'string' && r.panelGroupId.length > 0 ? r.panelGroupId : null;
  if (!panelGroupId) return null;
  const defaultLayout =
    r.defaultLayout && typeof r.defaultLayout === 'object'
      ? Object.fromEntries(
          Object.entries(r.defaultLayout as Record<string, unknown>).flatMap(([k, v]) => {
            const n = Number(v);
            return Number.isFinite(n) ? [[k, n]] : [];
          }),
        )
      : {};
  return { panelGroupId, defaultLayout };
}

export function updateChart(
  charts: ChartPanelConfig[],
  id: ChartId,
  patch: Partial<Pick<ChartPanelConfig, 'symbol' | 'timeframe' | 'indicators'>>,
): ChartPanelConfig[] {
  return charts.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

export function setAllChartsTimeframe(
  charts: ChartPanelConfig[],
  timeframe: string,
): ChartPanelConfig[] {
  return charts.map((c) => (c.timeframe === timeframe ? c : { ...c, timeframe }));
}

export function addChart(
  charts: ChartPanelConfig[],
  template?: Partial<Pick<ChartPanelConfig, 'symbol' | 'timeframe' | 'indicators'>>,
): ChartPanelConfig[] {
  if (charts.length >= MAX_CHARTS) return charts;
  const source = charts[charts.length - 1];
  return [
    ...charts,
    createChartPanel(
      template?.symbol ?? source?.symbol ?? DEFAULT_SYMBOL,
      template?.timeframe ?? source?.timeframe ?? DEFAULT_TIMEFRAME,
      template?.indicators ?? source?.indicators,
    ),
  ];
}

export function removeChart(charts: ChartPanelConfig[], id: ChartId): ChartPanelConfig[] {
  if (charts.length <= 1) return charts;
  return charts.filter((c) => c.id !== id);
}

export function resolveActiveChartId(
  charts: ChartPanelConfig[],
  activeId: string | null | undefined,
): ChartId {
  if (activeId && charts.some((c) => c.id === activeId)) return activeId;
  return charts[0]?.id ?? '';
}

export function collectTickerSymbols(charts: ChartPanelConfig[], watchlist: string[]): string[] {
  const set = new Set<string>();
  for (const c of charts) set.add(c.symbol.toUpperCase());
  for (const w of watchlist) set.add(w.toUpperCase());
  return [...set].sort();
}

export function collectIndicatorSubscriptions(charts: ChartPanelConfig[]): IndicatorSubscription[] {
  const subs: IndicatorSubscription[] = [];
  for (const chart of charts) {
    for (const ind of chart.indicators) {
      if (!ind.enabled) continue;
      subs.push({
        chart_id: chart.id,
        instance_id: ind.instanceId,
        symbol: chart.symbol,
        timeframe: chart.timeframe,
        indicator_id: ind.id,
        calc_params: ind.calcParams,
      });
    }
  }
  return subs;
}
