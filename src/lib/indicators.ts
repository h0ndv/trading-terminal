export type BuiltinIndicatorId =
  | "MA"
  | "EMA"
  | "BOLL"
  | "VOL"
  | "MACD"
  | "RSI"
  | "CCI"
  | "KDJ";

export type IndicatorCategory = "overlay" | "volume" | "oscillator";

export type IndicatorConfig = {
  id: BuiltinIndicatorId;
  enabled: boolean;
  calcParams: number[];
};

export type IndicatorMeta = {
  label: string;
  paneId: string;
  stackOnCandle: boolean;
  paramCount: number;
  category: IndicatorCategory;
  paramHint: string;
  allowFloat: boolean;
};

/** Catalog order used when appending missing ids after persisted order. */
export const BUILTIN_INDICATOR_IDS: BuiltinIndicatorId[] = [
  "MA",
  "EMA",
  "BOLL",
  "VOL",
  "MACD",
  "RSI",
  "CCI",
  "KDJ",
];

export const INDICATOR_META: Record<BuiltinIndicatorId, IndicatorMeta> = {
  MA: {
    label: "MA",
    paneId: "candle_pane",
    stackOnCandle: true,
    paramCount: 1,
    category: "overlay",
    paramHint: "20",
    allowFloat: false,
  },
  EMA: {
    label: "EMA",
    paneId: "candle_pane",
    stackOnCandle: true,
    paramCount: 3,
    category: "overlay",
    paramHint: "6,12,20",
    allowFloat: false,
  },
  BOLL: {
    label: "BOLL",
    paneId: "candle_pane",
    stackOnCandle: true,
    paramCount: 2,
    category: "overlay",
    paramHint: "20,2",
    allowFloat: true,
  },
  VOL: {
    label: "Volume",
    paneId: "pane_vol",
    stackOnCandle: false,
    paramCount: 3,
    category: "volume",
    paramHint: "5,10,20",
    allowFloat: false,
  },
  MACD: {
    label: "MACD",
    paneId: "pane_macd",
    stackOnCandle: false,
    paramCount: 3,
    category: "oscillator",
    paramHint: "12,26,9",
    allowFloat: false,
  },
  RSI: {
    label: "RSI",
    paneId: "pane_rsi",
    stackOnCandle: false,
    paramCount: 1,
    category: "oscillator",
    paramHint: "14",
    allowFloat: false,
  },
  CCI: {
    label: "CCI",
    paneId: "pane_cci",
    stackOnCandle: false,
    paramCount: 1,
    category: "oscillator",
    paramHint: "20",
    allowFloat: false,
  },
  KDJ: {
    label: "KDJ",
    paneId: "pane_kdj",
    stackOnCandle: false,
    paramCount: 3,
    category: "oscillator",
    paramHint: "9,3,3",
    allowFloat: false,
  },
};

export const DEFAULT_INDICATORS: IndicatorConfig[] = [
  { id: "EMA", enabled: true, calcParams: [21, 55, 200] },
  { id: "MA", enabled: false, calcParams: [20] },
  { id: "BOLL", enabled: false, calcParams: [20, 2] },
  { id: "VOL", enabled: true, calcParams: [5, 10, 20] },
  { id: "MACD", enabled: true, calcParams: [12, 26, 9] },
  { id: "RSI", enabled: true, calcParams: [14] },
  { id: "CCI", enabled: false, calcParams: [20] },
  { id: "KDJ", enabled: false, calcParams: [9, 3, 3] },
];

function isBuiltinId(raw: unknown): raw is BuiltinIndicatorId {
  return (
    typeof raw === "string" &&
    (BUILTIN_INDICATOR_IDS as string[]).includes(raw)
  );
}

function defaultParams(id: BuiltinIndicatorId): number[] {
  return [
    ...(DEFAULT_INDICATORS.find((d) => d.id === id)?.calcParams ?? [14]),
  ];
}

function normalizeCalcParams(id: BuiltinIndicatorId, raw: unknown): number[] {
  const fallback = defaultParams(id);
  const meta = INDICATOR_META[id];
  const count = meta.paramCount;
  if (!Array.isArray(raw)) return fallback;

  const nums: number[] = [];
  for (const item of raw) {
    const n = typeof item === "number" ? item : Number(item);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (meta.allowFloat) {
      nums.push(Number.isInteger(n) ? n : Math.round(n * 1000) / 1000);
    } else {
      if (n < 1) continue;
      nums.push(Math.floor(n));
    }
  }

  if (nums.length === 0) return fallback;
  if (nums.length >= count) {
    const sliced = nums.slice(0, count);
    if (id === "BOLL" && sliced.length >= 1) {
      sliced[0] = Math.max(1, Math.floor(sliced[0]));
    }
    return sliced;
  }
  const out = [...nums];
  while (out.length < count) {
    out.push(fallback[out.length] ?? fallback[fallback.length - 1] ?? 14);
  }
  if (id === "BOLL") out[0] = Math.max(1, Math.floor(out[0]));
  return out;
}

/**
 * Restore persisted order; append any catalog ids missing at the end.
 */
export function normalizeIndicators(raw: unknown): IndicatorConfig[] {
  const seen = new Set<BuiltinIndicatorId>();
  const ordered: IndicatorConfig[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      if (!isBuiltinId(rec.id) || seen.has(rec.id)) continue;
      seen.add(rec.id);
      ordered.push({
        id: rec.id,
        enabled: Boolean(rec.enabled),
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
  count: number,
  allowFloat = false,
): number[] | null {
  const parts = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return null;

  let ints: number[];
  if (allowFloat) {
    ints = nums.map((n) =>
      Number.isInteger(n) ? n : Math.round(n * 1000) / 1000,
    );
    if (ints.length >= 1) ints[0] = Math.max(1, Math.floor(ints[0]));
  } else {
    if (nums.some((n) => n < 1)) return null;
    ints = nums.map((n) => Math.floor(n));
  }

  if (count === 1) return [ints[0]];
  if (ints.length < count) return null;
  return ints.slice(0, count);
}

export function formatPeriodInput(params: number[]): string {
  return params.join(",");
}

/** Move `id` so it sits at the index of `beforeId` (or end if null). */
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
  let to = next.findIndex((c) => c.id === beforeId);
  if (to < 0) {
    next.push(item);
    return next;
  }
  next.splice(to, 0, item);
  return next;
}
