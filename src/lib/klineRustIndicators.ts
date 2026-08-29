import {
  registerIndicator,
  type IndicatorFigure,
  type KLineData,
} from 'klinecharts';
import type { BuiltinIndicatorId } from './indicators';

type ValueRow = Record<string, number | null>;

const cache = new Map<string, Map<number, ValueRow>>();

export function rustIndicatorInstanceKey(chartId: string, instanceId: string): string {
  return `${chartId}:${instanceId}`;
}

export function setRustIndicatorBootstrap(
  chartId: string,
  instanceId: string,
  points: { timestamp: number; values: Record<string, number | null | undefined> }[],
): void {
  const key = rustIndicatorInstanceKey(chartId, instanceId);
  const byTs = new Map<number, ValueRow>();
  for (const pt of points) {
    const row: ValueRow = {};
    for (const [k, v] of Object.entries(pt.values)) {
      row[k] = v ?? null;
    }
    byTs.set(pt.timestamp, row);
  }
  cache.set(key, byTs);
}

export function setRustIndicatorPatch(
  chartId: string,
  instanceId: string,
  point: { timestamp: number; values: Record<string, number | null | undefined> },
): void {
  const key = rustIndicatorInstanceKey(chartId, instanceId);
  let byTs = cache.get(key);
  if (!byTs) {
    byTs = new Map();
    cache.set(key, byTs);
  }
  const row: ValueRow = {};
  for (const [k, v] of Object.entries(point.values)) {
    row[k] = v ?? null;
  }
  byTs.set(point.timestamp, row);
}

function readCache(extendData: unknown, timestamp: number): ValueRow | undefined {
  if (typeof extendData !== 'string') return undefined;
  return cache.get(extendData)?.get(timestamp);
}

function lineFigures(prefix: string, count: number, titlePrefix: string): IndicatorFigure[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `${prefix}${i + 1}`,
    title: `${titlePrefix}${i + 1}: `,
    type: 'line',
  }));
}

function calcPassthrough(dataList: KLineData[], indicator: { extendData?: unknown }) {
  return dataList.map((bar) => {
    const row = readCache(indicator.extendData, bar.timestamp);
    if (!row) return {};
    return { ...row };
  });
}

const RUST_INDICATOR_DEFS: Record<
  BuiltinIndicatorId,
  {
    figures: (params: number[]) => IndicatorFigure[];
    regenerateFigures?: (params: number[]) => IndicatorFigure[];
  }
> = {
  MA: {
    figures: (p) => lineFigures('ma', p.length, 'MA'),
    regenerateFigures: (p) => lineFigures('ma', p.length, 'MA'),
  },
  EMA: {
    figures: (p) => lineFigures('ema', p.length, 'EMA'),
    regenerateFigures: (p) => lineFigures('ema', p.length, 'EMA'),
  },
  BOLL: {
    figures: () => [
      { key: 'mid', title: 'MID: ', type: 'line' },
      { key: 'upper', title: 'UPPER: ', type: 'line' },
      { key: 'lower', title: 'LOWER: ', type: 'line' },
    ],
  },
  VOL: {
    figures: (p) => [
      { key: 'vol', title: 'VOLUME: ', type: 'bar' },
      ...lineFigures('ma', p.length, 'MA'),
    ],
    regenerateFigures: (p) => [
      { key: 'vol', title: 'VOLUME: ', type: 'bar' },
      ...lineFigures('ma', p.length, 'MA'),
    ],
  },
  MACD: {
    figures: () => [
      { key: 'dif', title: 'DIF: ', type: 'line' },
      { key: 'dea', title: 'DEA: ', type: 'line' },
      { key: 'macd', title: 'MACD: ', type: 'bar' },
    ],
  },
  RSI: {
    figures: (p) => lineFigures('rsi', p.length, 'RSI'),
    regenerateFigures: (p) => lineFigures('rsi', p.length, 'RSI'),
  },
  CCI: {
    figures: () => [{ key: 'cci', title: 'CCI: ', type: 'line' }],
  },
  KDJ: {
    figures: () => [
      { key: 'k', title: 'K: ', type: 'line' },
      { key: 'd', title: 'D: ', type: 'line' },
      { key: 'j', title: 'J: ', type: 'line' },
    ],
  },
};

let registered = false;

export function registerRustIndicators(): void {
  if (registered) return;
  registered = true;

  for (const id of Object.keys(RUST_INDICATOR_DEFS) as BuiltinIndicatorId[]) {
    const def = RUST_INDICATOR_DEFS[id];
    registerIndicator({
      name: id,
      shortName: id,
      series: id === 'VOL' ? 'volume' : id === 'MA' || id === 'EMA' || id === 'BOLL' ? 'price' : 'normal',
      calcParams: [],
      figures: def.figures([]),
      regenerateFigures: def.regenerateFigures
        ? (params) => def.regenerateFigures!(params as number[])
        : undefined,
      calc: (dataList, indicator) => calcPassthrough(dataList, indicator),
    });
  }
}

export function defaultFiguresFor(id: BuiltinIndicatorId, params: number[]): IndicatorFigure[] {
  return RUST_INDICATOR_DEFS[id].figures(params);
}
