import { LazyStore } from "@tauri-apps/plugin-store";
import { save, open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
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
import {
  DEFAULT_WATCHLIST,
  normalizeWatchlist,
} from "./watchlist";

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
  version: 5;
  symbol: string;
  timeframe: string;
  indicators: IndicatorConfig[];
  drawingsBySymbol: Record<string, DrawingSnapshot[]>;
  watchlist: string[];
  quickBarPos: QuickBarPos | null;
  favoritesBarPos: QuickBarPos | null;
  favoriteTools: DrawingToolId[];
  favoritesBarVisible: boolean;
  themeId: string;
  themeMode: ThemeMode;
};

export const LAYOUT_EXPORT_KIND = "trading-terminal-layout" as const;
export const LAYOUT_EXPORT_VERSION = 1;

export type LayoutExport = {
  kind: typeof LAYOUT_EXPORT_KIND;
  exportVersion: typeof LAYOUT_EXPORT_VERSION;
  exportedAt: string;
  settings: AppSettings;
};

export const DEFAULT_SETTINGS: AppSettings = {
  version: 5,
  symbol: "BTCUSDT",
  timeframe: "1m",
  indicators: DEFAULT_INDICATORS.map((d) => ({
    ...d,
    calcParams: [...d.calcParams],
  })),
  drawingsBySymbol: {},
  watchlist: [...DEFAULT_WATCHLIST],
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
    version: 5,
    symbol: normalizeSymbol(partial.symbol),
    timeframe: normalizeTimeframe(partial.timeframe),
    indicators: normalizeIndicators(
      partial.indicators ?? DEFAULT_SETTINGS.indicators,
    ),
    drawingsBySymbol: normalizeDrawingsBySymbol(
      partial.drawingsBySymbol ?? DEFAULT_SETTINGS.drawingsBySymbol,
    ),
    watchlist: normalizeWatchlist(
      partial.watchlist ?? DEFAULT_SETTINGS.watchlist,
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
    const watchlist = await store.get<string[]>("watchlist");
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
      watchlist: watchlist ?? DEFAULT_SETTINGS.watchlist,
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
      watchlist: [...DEFAULT_WATCHLIST],
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
      | "watchlist"
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
    await store.set("watchlist", next.watchlist);
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

export function serializeLayoutExport(settings: AppSettings): string {
  const envelope: LayoutExport = {
    kind: LAYOUT_EXPORT_KIND,
    exportVersion: LAYOUT_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: normalizeSettings(settings),
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseLayoutImport(raw: unknown): AppSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind !== undefined && obj.kind !== LAYOUT_EXPORT_KIND) return null;
  const settingsRaw =
    obj.kind === LAYOUT_EXPORT_KIND ? obj.settings : obj;
  if (!settingsRaw || typeof settingsRaw !== "object") return null;
  return normalizeSettings(settingsRaw as Partial<AppSettings>);
}

function layoutDefaultFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `trading-terminal-layout-${stamp}.json`;
}

export async function exportLayoutToFile(
  settings: AppSettings,
): Promise<boolean> {
  const path = await save({
    filters: [{ name: "Layout", extensions: ["json"] }],
    defaultPath: layoutDefaultFilename(),
  });
  if (!path) return false;
  await writeTextFile(path, serializeLayoutExport(settings));
  return true;
}

export async function importLayoutFromFile(): Promise<
  | { ok: true; settings: AppSettings }
  | { ok: false; reason: "cancelled" | "invalid" }
> {
  const path = await open({
    multiple: false,
    filters: [{ name: "Layout", extensions: ["json"] }],
  });
  if (!path || Array.isArray(path)) return { ok: false, reason: "cancelled" };
  try {
    const text = await readTextFile(path);
    const settings = parseLayoutImport(JSON.parse(text));
    if (!settings) return { ok: false, reason: "invalid" };
    return { ok: true, settings };
  } catch (e) {
    console.error("importLayoutFromFile failed", e);
    return { ok: false, reason: "invalid" };
  }
}

if (import.meta.env.DEV) {
  const roundTrip = parseLayoutImport(
    JSON.parse(serializeLayoutExport(DEFAULT_SETTINGS)),
  );
  if (!roundTrip || roundTrip.symbol !== DEFAULT_SETTINGS.symbol) {
    console.error("layout import/export self-check failed");
  }
}
