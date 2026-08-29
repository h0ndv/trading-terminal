export type BuiltinIndicatorId = 'MA' | 'EMA' | 'BOLL' | 'VOL' | 'MACD' | 'RSI' | 'CCI' | 'KDJ';

export type IndicatorCategory = 'overlay' | 'volume' | 'oscillator';

export type IndicatorParamMode = 'fixed' | 'variable';

export type IndicatorConfig = {
  id: BuiltinIndicatorId;
  enabled: boolean;
  visible: boolean;
  calcParams: number[];
};

export type IndicatorMeta = {
  label: string;
  paneId: string;
  stackOnCandle: boolean;
  category: IndicatorCategory;
  paramHint: string;
  allowFloat: boolean;
  paramMode: IndicatorParamMode;
  minParams: number;
  maxParams: number;
  paramLabels: string[];
};

export const BUILTIN_INDICATOR_IDS: BuiltinIndicatorId[] = [
  'MA',
  'EMA',
  'BOLL',
  'VOL',
  'MACD',
  'RSI',
  'CCI',
  'KDJ',
];

export const INDICATOR_META: Record<BuiltinIndicatorId, IndicatorMeta> = {
  MA: {
    label: 'MA',
    paneId: 'candle_pane',
    stackOnCandle: true,
    category: 'overlay',
    paramHint: '5,10,30,60',
    allowFloat: false,
    paramMode: 'variable',
    minParams: 1,
    maxParams: 5,
    paramLabels: ['MA1', 'MA2', 'MA3', 'MA4', 'MA5'],
  },
  EMA: {
    label: 'EMA',
    paneId: 'candle_pane',
    stackOnCandle: true,
    category: 'overlay',
    paramHint: '6,12,20',
    allowFloat: false,
    paramMode: 'variable',
    minParams: 1,
    maxParams: 5,
    paramLabels: ['EMA1', 'EMA2', 'EMA3', 'EMA4', 'EMA5'],
  },
  BOLL: {
    label: 'BOLL',
    paneId: 'candle_pane',
    stackOnCandle: true,
    category: 'overlay',
    paramHint: '20,2',
    allowFloat: true,
    paramMode: 'fixed',
    minParams: 2,
    maxParams: 2,
    paramLabels: ['Period', 'Mult'],
  },
  VOL: {
    label: 'Volume',
    paneId: 'pane_vol',
    stackOnCandle: false,
    category: 'volume',
    paramHint: '5,10,20',
    allowFloat: false,
    paramMode: 'variable',
    minParams: 1,
    maxParams: 3,
    paramLabels: ['MA1', 'MA2', 'MA3'],
  },
  MACD: {
    label: 'MACD',
    paneId: 'pane_macd',
    stackOnCandle: false,
    category: 'oscillator',
    paramHint: '12,26,9',
    allowFloat: false,
    paramMode: 'fixed',
    minParams: 3,
    maxParams: 3,
    paramLabels: ['Fast', 'Slow', 'Signal'],
  },
  RSI: {
    label: 'RSI',
    paneId: 'pane_rsi',
    stackOnCandle: false,
    category: 'oscillator',
    paramHint: '6,12,24',
    allowFloat: false,
    paramMode: 'variable',
    minParams: 1,
    maxParams: 3,
    paramLabels: ['RSI1', 'RSI2', 'RSI3'],
  },
  CCI: {
    label: 'CCI',
    paneId: 'pane_cci',
    stackOnCandle: false,
    category: 'oscillator',
    paramHint: '20',
    allowFloat: false,
    paramMode: 'fixed',
    minParams: 1,
    maxParams: 1,
    paramLabels: ['Period'],
  },
  KDJ: {
    label: 'KDJ',
    paneId: 'pane_kdj',
    stackOnCandle: false,
    category: 'oscillator',
    paramHint: '9,3,3',
    allowFloat: false,
    paramMode: 'fixed',
    minParams: 3,
    maxParams: 3,
    paramLabels: ['RSV', 'K', 'D'],
  },
};

export const DEFAULT_INDICATORS: IndicatorConfig[] = [
  { id: 'EMA', enabled: true, visible: true, calcParams: [21, 55, 200] },
  { id: 'MA', enabled: false, visible: true, calcParams: [5, 10, 30, 60] },
  { id: 'BOLL', enabled: false, visible: true, calcParams: [20, 2] },
  { id: 'VOL', enabled: true, visible: true, calcParams: [5, 10, 20] },
  { id: 'MACD', enabled: true, visible: true, calcParams: [12, 26, 9] },
  { id: 'RSI', enabled: true, visible: true, calcParams: [14] },
  { id: 'CCI', enabled: false, visible: true, calcParams: [20] },
  { id: 'KDJ', enabled: false, visible: true, calcParams: [9, 3, 3] },
];

function isBuiltinId(raw: unknown): raw is BuiltinIndicatorId {
  return typeof raw === 'string' && (BUILTIN_INDICATOR_IDS as string[]).includes(raw);
}

function defaultParams(id: BuiltinIndicatorId): number[] {
  return [...(DEFAULT_INDICATORS.find((d) => d.id === id)?.calcParams ?? [14])];
}

function normalizeCalcParams(id: BuiltinIndicatorId, raw: unknown): number[] {
  const fallback = defaultParams(id);
  const meta = INDICATOR_META[id];
  if (!Array.isArray(raw)) return fallback;

  const nums: number[] = [];
  for (const item of raw) {
    const n = typeof item === 'number' ? item : Number(item);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (meta.allowFloat) {
      nums.push(Number.isInteger(n) ? n : Math.round(n * 1000) / 1000);
    } else {
      if (n < 1) continue;
      nums.push(Math.floor(n));
    }
  }

  if (nums.length === 0) return fallback;

  if (meta.paramMode === 'variable') {
    const sliced = nums.slice(0, meta.maxParams);
    if (sliced.length < meta.minParams) return fallback;
    if (id === 'BOLL' && sliced.length >= 1) {
      sliced[0] = Math.max(1, Math.floor(sliced[0]));
    }
    return sliced;
  }

  const count = meta.maxParams;
  if (nums.length >= count) {
    const sliced = nums.slice(0, count);
    if (id === 'BOLL' && sliced.length >= 1) {
      sliced[0] = Math.max(1, Math.floor(sliced[0]));
    }
    return sliced;
  }
  const out = [...nums];
  while (out.length < count) {
    out.push(fallback[out.length] ?? fallback[fallback.length - 1] ?? 14);
  }
  if (id === 'BOLL') out[0] = Math.max(1, Math.floor(out[0]));
  return out;
}

export function normalizeIndicators(raw: unknown): IndicatorConfig[] {
  const seen = new Set<BuiltinIndicatorId>();
  const ordered: IndicatorConfig[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (!isBuiltinId(rec.id) || seen.has(rec.id)) continue;
      seen.add(rec.id);
      ordered.push({
        id: rec.id,
        enabled: Boolean(rec.enabled),
        visible: rec.visible === undefined ? true : Boolean(rec.visible),
        calcParams: normalizeCalcParams(rec.id, rec.calcParams),
      });
    }
  }

  for (const id of BUILTIN_INDICATOR_IDS) {
    if (seen.has(id)) continue;
    const d = DEFAULT_INDICATORS.find((x) => x.id === id)!;
    ordered.push({
      id,
      enabled: d.enabled,
      visible: d.visible,
      calcParams: [...d.calcParams],
    });
  }

  return ordered;
}

export function calcParamsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((n, i) => n === b[i]);
}

export function parsePeriodInput(
  raw: string,
  meta: Pick<IndicatorMeta, 'paramMode' | 'minParams' | 'maxParams' | 'allowFloat'>,
): number[] | null {
  const parts = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return null;

  let ints: number[];
  if (meta.allowFloat) {
    ints = nums.map((n) => (Number.isInteger(n) ? n : Math.round(n * 1000) / 1000));
    if (ints.length >= 1) ints[0] = Math.max(1, Math.floor(ints[0]));
  } else {
    if (nums.some((n) => n < 1)) return null;
    ints = nums.map((n) => Math.floor(n));
  }

  if (meta.paramMode === 'variable') {
    if (ints.length < meta.minParams || ints.length > meta.maxParams) {
      return null;
    }
    return ints;
  }

  if (ints.length < meta.maxParams) return null;
  return ints.slice(0, meta.maxParams);
}

export function parseParamSlots(
  slots: string[],
  meta: Pick<IndicatorMeta, 'paramMode' | 'minParams' | 'maxParams' | 'allowFloat'>,
): number[] | null {
  const nums: number[] = [];
  for (const raw of slots) {
    const t = raw.trim();
    if (!t) {
      if (meta.paramMode === 'fixed') return null;
      continue;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (meta.allowFloat) {
      const v = Number.isInteger(n) ? n : Math.round(n * 1000) / 1000;
      nums.push(nums.length === 0 ? Math.max(1, Math.floor(v)) : v);
    } else {
      if (n < 1) return null;
      nums.push(Math.floor(n));
    }
  }
  if (meta.paramMode === 'variable') {
    if (nums.length < meta.minParams || nums.length > meta.maxParams) {
      return null;
    }
    return nums;
  }
  if (nums.length !== meta.maxParams) return null;
  return nums;
}

export function formatPeriodInput(params: number[]): string {
  return params.join(',');
}

export function patchIndicator(
  list: IndicatorConfig[],
  id: BuiltinIndicatorId,
  patch: Partial<Omit<IndicatorConfig, 'id'>>,
): IndicatorConfig[] {
  return list.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

export function reorderIndicators(
  list: IndicatorConfig[],
  id: BuiltinIndicatorId,
  beforeId: BuiltinIndicatorId | null,
): IndicatorConfig[] {
  if (id === beforeId) return list;
  const from = list.findIndex((c) => c.id === id);
  if (from < 0) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (beforeId == null) {
    next.push(item);
    return next;
  }
  const to = next.findIndex((c) => c.id === beforeId);
  if (to < 0) {
    next.push(item);
    return next;
  }
  next.splice(to, 0, item);
  return next;
}
