import { LazyStore } from '@tauri-apps/plugin-store';
import { save, open } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import {
  normalizeDrawingsBySymbol,
  normalizeFavoriteTools,
  type DrawingSnapshot,
  type DrawingToolId,
} from './drawings';
import { DEFAULT_INDICATORS, normalizeIndicators, type IndicatorConfig } from './indicators';
import {
  DEFAULT_THEME_ID,
  DEFAULT_THEME_MODE,
  normalizeThemeId,
  normalizeThemeMode,
  type ThemeMode,
} from './theme';
import { DEFAULT_WATCHLIST, normalizeWatchlist } from './watchlist';
import {
  createChartPanel,
  normalizeCharts,
  normalizeWorkspaceLayout,
  resolveActiveChartId,
  type ChartId,
  type ChartPanelConfig,
  type WorkspaceLayout,
} from './workspace';

export { VALID_INTERVALS } from './workspace';

export type QuickBarPos = { x: number; y: number };

export type AppSettings = {
  version: 6;
  charts: ChartPanelConfig[];
  activeChartId: ChartId;
  workspaceLayout: WorkspaceLayout | null;
  drawingsBySymbol: Record<string, DrawingSnapshot[]>;
  watchlist: string[];
  quickBarPos: QuickBarPos | null;
  favoritesBarPos: QuickBarPos | null;
  favoriteTools: DrawingToolId[];
  favoritesBarVisible: boolean;
  themeId: string;
  themeMode: ThemeMode;
};

export const LAYOUT_EXPORT_KIND = 'trading-terminal-layout' as const;
export const LAYOUT_EXPORT_VERSION = 1;

export type LayoutExport = {
  kind: typeof LAYOUT_EXPORT_KIND;
  exportVersion: typeof LAYOUT_EXPORT_VERSION;
  exportedAt: string;
  settings: AppSettings;
};

const defaultCharts = (): ChartPanelConfig[] => [
  createChartPanel('BTCUSDT', '1m', DEFAULT_INDICATORS),
];

export const DEFAULT_SETTINGS: AppSettings = {
  version: 6,
  charts: defaultCharts(),
  activeChartId: '',
  workspaceLayout: null,
  drawingsBySymbol: {},
  watchlist: [...DEFAULT_WATCHLIST],
  quickBarPos: null,
  favoritesBarPos: null,
  favoriteTools: [],
  favoritesBarVisible: true,
  themeId: DEFAULT_THEME_ID,
  themeMode: DEFAULT_THEME_MODE,
};

DEFAULT_SETTINGS.activeChartId = DEFAULT_SETTINGS.charts[0]!.id;

export function normalizeQuickBarPos(raw: unknown): QuickBarPos | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const x = Number(r.x);
  const y = Number(r.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    return null;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

type LegacySettings = {
  version?: number;
  symbol?: string;
  timeframe?: string;
  indicators?: IndicatorConfig[];
  charts?: ChartPanelConfig[];
  activeChartId?: string;
  workspaceLayout?: WorkspaceLayout | null;
};

function migrateFromLegacy(partial: LegacySettings): {
  charts: ChartPanelConfig[];
  activeChartId: string;
  workspaceLayout: WorkspaceLayout | null;
} {
  const charts = normalizeCharts(partial.charts);
  if (charts.length > 0) {
    return {
      charts,
      activeChartId: resolveActiveChartId(charts, partial.activeChartId),
      workspaceLayout: normalizeWorkspaceLayout(partial.workspaceLayout),
    };
  }

  const symbol =
    typeof partial.symbol === 'string' && partial.symbol.trim().length > 0
      ? partial.symbol.trim().toUpperCase()
      : 'BTCUSDT';
  const timeframe = typeof partial.timeframe === 'string' ? partial.timeframe : '1m';
  const indicators = normalizeIndicators(partial.indicators ?? DEFAULT_INDICATORS);
  const panel = createChartPanel(symbol, timeframe, indicators);
  return {
    charts: [panel],
    activeChartId: panel.id,
    workspaceLayout: null,
  };
}

export function normalizeSettings(partial: Partial<AppSettings> & LegacySettings): AppSettings {
  const migrated = migrateFromLegacy(partial);
  return {
    version: 6,
    charts: migrated.charts,
    activeChartId: migrated.activeChartId,
    workspaceLayout: migrated.workspaceLayout,
    drawingsBySymbol: normalizeDrawingsBySymbol(
      partial.drawingsBySymbol ?? DEFAULT_SETTINGS.drawingsBySymbol,
    ),
    watchlist: normalizeWatchlist(partial.watchlist ?? DEFAULT_SETTINGS.watchlist),
    quickBarPos:
      partial.quickBarPos === undefined
        ? DEFAULT_SETTINGS.quickBarPos
        : normalizeQuickBarPos(partial.quickBarPos),
    favoritesBarPos:
      partial.favoritesBarPos === undefined
        ? DEFAULT_SETTINGS.favoritesBarPos
        : normalizeQuickBarPos(partial.favoritesBarPos),
    favoriteTools: normalizeFavoriteTools(partial.favoriteTools ?? DEFAULT_SETTINGS.favoriteTools),
    favoritesBarVisible:
      partial.favoritesBarVisible === undefined
        ? DEFAULT_SETTINGS.favoritesBarVisible
        : Boolean(partial.favoritesBarVisible),
    themeId: normalizeThemeId(
      partial.themeId === undefined ? DEFAULT_SETTINGS.themeId : partial.themeId,
    ),
    themeMode: normalizeThemeMode(
      partial.themeMode === undefined ? DEFAULT_SETTINGS.themeMode : partial.themeMode,
    ),
  };
}

const store = new LazyStore('settings.json', { autoSave: 200 });

export async function loadSettings(): Promise<AppSettings> {
  try {
    const version = await store.get<number>('version');
    const charts = await store.get<ChartPanelConfig[]>('charts');
    const activeChartId = await store.get<string>('activeChartId');
    const workspaceLayout = await store.get<WorkspaceLayout | null>('workspaceLayout');
    const symbol = await store.get<string>('symbol');
    const timeframe = await store.get<string>('timeframe');
    const indicators = await store.get<IndicatorConfig[]>('indicators');
    const drawingsBySymbol = await store.get<Record<string, DrawingSnapshot[]>>('drawingsBySymbol');
    const watchlist = await store.get<string[]>('watchlist');
    const quickBarPos = await store.get<QuickBarPos | null>('quickBarPos');
    const favoritesBarPos = await store.get<QuickBarPos | null>('favoritesBarPos');
    const favoriteTools = await store.get<DrawingToolId[]>('favoriteTools');
    const favoritesBarVisible = await store.get<boolean>('favoritesBarVisible');
    const themeId = await store.get<string>('themeId');
    const themeMode = await store.get<ThemeMode>('themeMode');

    return normalizeSettings({
      version: version === 6 ? 6 : undefined,
      charts: charts ?? undefined,
      activeChartId: activeChartId ?? undefined,
      workspaceLayout: workspaceLayout ?? undefined,
      symbol: symbol ?? undefined,
      timeframe: timeframe ?? undefined,
      indicators: indicators ?? undefined,
      drawingsBySymbol: drawingsBySymbol ?? undefined,
      watchlist: watchlist ?? undefined,
      quickBarPos: quickBarPos ?? undefined,
      favoritesBarPos: favoritesBarPos ?? undefined,
      favoriteTools: favoriteTools ?? undefined,
      favoritesBarVisible: favoritesBarVisible ?? undefined,
      themeId: themeId ?? undefined,
      themeMode: themeMode ?? undefined,
    });
  } catch (e) {
    console.error('loadSettings failed', e);
    return {
      ...DEFAULT_SETTINGS,
      charts: defaultCharts(),
      activeChartId: defaultCharts()[0]!.id,
      drawingsBySymbol: {},
      watchlist: [...DEFAULT_WATCHLIST],
      quickBarPos: null,
      favoritesBarPos: null,
      favoriteTools: [],
      favoritesBarVisible: true,
    };
  }
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<void> {
  try {
    const next = normalizeSettings(partial);
    await store.set('version', next.version);
    await store.set('charts', next.charts);
    await store.set('activeChartId', next.activeChartId);
    await store.set('workspaceLayout', next.workspaceLayout);
    await store.set('drawingsBySymbol', next.drawingsBySymbol);
    await store.set('watchlist', next.watchlist);
    await store.set('quickBarPos', next.quickBarPos);
    await store.set('favoritesBarPos', next.favoritesBarPos);
    await store.set('favoriteTools', next.favoriteTools);
    await store.set('favoritesBarVisible', next.favoritesBarVisible);
    await store.set('themeId', next.themeId);
    await store.set('themeMode', next.themeMode);
    await store.save();
  } catch (e) {
    console.error('saveSettings failed', e);
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
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind !== undefined && obj.kind !== LAYOUT_EXPORT_KIND) return null;
  const settingsRaw = obj.kind === LAYOUT_EXPORT_KIND ? obj.settings : obj;
  if (!settingsRaw || typeof settingsRaw !== 'object') return null;
  return normalizeSettings(settingsRaw as Partial<AppSettings> & LegacySettings);
}

function layoutDefaultFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `trading-terminal-layout-${stamp}.json`;
}

export async function exportLayoutToFile(settings: AppSettings): Promise<boolean> {
  const path = await save({
    filters: [{ name: 'Layout', extensions: ['json'] }],
    defaultPath: layoutDefaultFilename(),
  });
  if (!path) return false;
  await writeTextFile(path, serializeLayoutExport(settings));
  return true;
}

export async function importLayoutFromFile(): Promise<
  { ok: true; settings: AppSettings } | { ok: false; reason: 'cancelled' | 'invalid' }
> {
  const path = await open({
    multiple: false,
    filters: [{ name: 'Layout', extensions: ['json'] }],
  });
  if (!path || Array.isArray(path)) return { ok: false, reason: 'cancelled' };
  try {
    const text = await readTextFile(path);
    const settings = parseLayoutImport(JSON.parse(text));
    if (!settings) return { ok: false, reason: 'invalid' };
    return { ok: true, settings };
  } catch (e) {
    console.error('importLayoutFromFile failed', e);
    return { ok: false, reason: 'invalid' };
  }
}

if (import.meta.env.DEV) {
  const roundTrip = parseLayoutImport(JSON.parse(serializeLayoutExport(DEFAULT_SETTINGS)));
  if (!roundTrip || roundTrip.charts.length !== DEFAULT_SETTINGS.charts.length) {
    console.error('layout import/export self-check failed');
  }
}
