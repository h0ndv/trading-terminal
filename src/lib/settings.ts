import { LazyStore } from "@tauri-apps/plugin-store";
import {
  normalizeDrawingsBySymbol,
  normalizeFavoriteTools,
  type DrawingSnapshot,
  type DrawingToolId,
} from "./drawings";
import {
  DEFAULT_INDICATORS,
  normalizeIndicators,
  type IndicatorConfig,
} from "./indicators";
import {
  DEFAULT_THEME_ID,
  DEFAULT_THEME_MODE,
  normalizeThemeId,
  normalizeThemeMode,
  type ThemeMode,
} from "./theme";

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

export type QuickBarPos = { x: number; y: number };

export type AppSettings = {
  version: 4;
  symbol: string;
  timeframe: string;
  indicators: IndicatorConfig[];
  drawingsBySymbol: Record<string, DrawingSnapshot[]>;
  quickBarPos: QuickBarPos | null;
  favoritesBarPos: QuickBarPos | null;
  favoriteTools: DrawingToolId[];
  favoritesBarVisible: boolean;
  themeId: string;
  themeMode: ThemeMode;
};

export const DEFAULT_SETTINGS: AppSettings = {
  version: 4,
  symbol: "BTCUSDT",
  timeframe: "1m",
  indicators: DEFAULT_INDICATORS.map((d) => ({
    ...d,
    calcParams: [...d.calcParams],
  })),
  drawingsBySymbol: {},
  quickBarPos: null,
  favoritesBarPos: null,
  favoriteTools: [],
  favoritesBarVisible: true,
  themeId: DEFAULT_THEME_ID,
  themeMode: DEFAULT_THEME_MODE,
};

export function normalizeQuickBarPos(raw: unknown): QuickBarPos | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const x = Number(r.x);
  const y = Number(r.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    return null;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

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
    version: 4,
    symbol: normalizeSymbol(partial.symbol),
    timeframe: normalizeTimeframe(partial.timeframe),
    indicators: normalizeIndicators(
      partial.indicators ?? DEFAULT_SETTINGS.indicators,
    ),
    drawingsBySymbol: normalizeDrawingsBySymbol(
      partial.drawingsBySymbol ?? DEFAULT_SETTINGS.drawingsBySymbol,
    ),
    quickBarPos:
      partial.quickBarPos === undefined
        ? DEFAULT_SETTINGS.quickBarPos
        : normalizeQuickBarPos(partial.quickBarPos),
    favoritesBarPos:
      partial.favoritesBarPos === undefined
        ? DEFAULT_SETTINGS.favoritesBarPos
        : normalizeQuickBarPos(partial.favoritesBarPos),
    favoriteTools: normalizeFavoriteTools(
      partial.favoriteTools ?? DEFAULT_SETTINGS.favoriteTools,
    ),
    favoritesBarVisible:
      partial.favoritesBarVisible === undefined
        ? DEFAULT_SETTINGS.favoritesBarVisible
        : Boolean(partial.favoritesBarVisible),
    themeId: normalizeThemeId(
      partial.themeId === undefined
        ? DEFAULT_SETTINGS.themeId
        : partial.themeId,
    ),
    themeMode: normalizeThemeMode(
      partial.themeMode === undefined
        ? DEFAULT_SETTINGS.themeMode
        : partial.themeMode,
    ),
  };
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const symbol = await store.get<string>("symbol");
    const timeframe = await store.get<string>("timeframe");
    const indicators = await store.get<IndicatorConfig[]>("indicators");
    const drawingsBySymbol = await store.get<
      Record<string, DrawingSnapshot[]>
    >("drawingsBySymbol");
    const quickBarPos = await store.get<QuickBarPos | null>("quickBarPos");
    const favoritesBarPos = await store.get<QuickBarPos | null>(
      "favoritesBarPos",
    );
    const favoriteTools = await store.get<DrawingToolId[]>("favoriteTools");
    const favoritesBarVisible = await store.get<boolean>(
      "favoritesBarVisible",
    );
    const themeId = await store.get<string>("themeId");
    const themeMode = await store.get<ThemeMode>("themeMode");
    return normalizeSettings({
      symbol: symbol ?? DEFAULT_SETTINGS.symbol,
      timeframe: timeframe ?? DEFAULT_SETTINGS.timeframe,
      indicators: indicators ?? DEFAULT_SETTINGS.indicators,
      drawingsBySymbol:
        drawingsBySymbol ?? DEFAULT_SETTINGS.drawingsBySymbol,
      quickBarPos: quickBarPos ?? DEFAULT_SETTINGS.quickBarPos,
      favoritesBarPos: favoritesBarPos ?? DEFAULT_SETTINGS.favoritesBarPos,
      favoriteTools: favoriteTools ?? DEFAULT_SETTINGS.favoriteTools,
      favoritesBarVisible:
        favoritesBarVisible ?? DEFAULT_SETTINGS.favoritesBarVisible,
      themeId: themeId ?? DEFAULT_SETTINGS.themeId,
      themeMode: themeMode ?? DEFAULT_SETTINGS.themeMode,
    });
  } catch (e) {
    console.error("loadSettings failed", e);
    return {
      ...DEFAULT_SETTINGS,
      indicators: DEFAULT_SETTINGS.indicators.map((d) => ({
        ...d,
        calcParams: [...d.calcParams],
      })),
      drawingsBySymbol: {},
      quickBarPos: null,
      favoritesBarPos: null,
      favoriteTools: [],
      favoritesBarVisible: true,
    };
  }
}

export async function saveSettings(
  partial: Partial<
    Pick<
      AppSettings,
      | "symbol"
      | "timeframe"
      | "indicators"
      | "drawingsBySymbol"
      | "quickBarPos"
      | "favoritesBarPos"
      | "favoriteTools"
      | "favoritesBarVisible"
      | "themeId"
      | "themeMode"
    >
  >,
): Promise<void> {
  try {
    const next = normalizeSettings(partial);
    await store.set("version", next.version);
    await store.set("symbol", next.symbol);
    await store.set("timeframe", next.timeframe);
    await store.set("indicators", next.indicators);
    await store.set("drawingsBySymbol", next.drawingsBySymbol);
    await store.set("quickBarPos", next.quickBarPos);
    await store.set("favoritesBarPos", next.favoritesBarPos);
    await store.set("favoriteTools", next.favoriteTools);
    await store.set("favoritesBarVisible", next.favoritesBarVisible);
    await store.set("themeId", next.themeId);
    await store.set("themeMode", next.themeMode);
    await store.save();
  } catch (e) {
    console.error("saveSettings failed", e);
  }
}
