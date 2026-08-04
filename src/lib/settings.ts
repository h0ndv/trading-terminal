import { LazyStore } from "@tauri-apps/plugin-store";
import {
  DEFAULT_INDICATORS,
  normalizeIndicators,
  type IndicatorConfig,
} from "./indicators";

export const VALID_INTERVALS = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
  "1w",
] as const;

export type AppSettings = {
  version: 2;
  symbol: string;
  timeframe: string;
  indicators: IndicatorConfig[];
};

export const DEFAULT_SETTINGS: AppSettings = {
  version: 2,
  symbol: "BTCUSDT",
  timeframe: "1m",
  indicators: DEFAULT_INDICATORS.map((d) => ({
    ...d,
    calcParams: [...d.calcParams],
  })),
};

const store = new LazyStore("settings.json", { autoSave: 200 });

function normalizeSymbol(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_SETTINGS.symbol;
  const s = raw.trim().toUpperCase();
  return s.length > 0 ? s : DEFAULT_SETTINGS.symbol;
}

function normalizeTimeframe(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_SETTINGS.timeframe;
  return (VALID_INTERVALS as readonly string[]).includes(raw)
    ? raw
    : DEFAULT_SETTINGS.timeframe;
}

export function normalizeSettings(partial: Partial<AppSettings>): AppSettings {
  return {
    version: 2,
    symbol: normalizeSymbol(partial.symbol),
    timeframe: normalizeTimeframe(partial.timeframe),
    indicators: normalizeIndicators(
      partial.indicators ?? DEFAULT_SETTINGS.indicators,
    ),
  };
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const symbol = await store.get<string>("symbol");
    const timeframe = await store.get<string>("timeframe");
    const indicators = await store.get<IndicatorConfig[]>("indicators");
    return normalizeSettings({
      symbol: symbol ?? DEFAULT_SETTINGS.symbol,
      timeframe: timeframe ?? DEFAULT_SETTINGS.timeframe,
      indicators: indicators ?? DEFAULT_SETTINGS.indicators,
    });
  } catch (e) {
    console.error("loadSettings failed", e);
    return {
      ...DEFAULT_SETTINGS,
      indicators: DEFAULT_SETTINGS.indicators.map((d) => ({
        ...d,
        calcParams: [...d.calcParams],
      })),
    };
  }
}

export async function saveSettings(
  partial: Partial<Pick<AppSettings, "symbol" | "timeframe" | "indicators">>,
): Promise<void> {
  try {
    const next = normalizeSettings(partial);
    await store.set("version", next.version);
    await store.set("symbol", next.symbol);
    await store.set("timeframe", next.timeframe);
    await store.set("indicators", next.indicators);
    await store.save();
  } catch (e) {
    console.error("saveSettings failed", e);
  }
}
