import { useEffect, useMemo, useState } from 'react';

import { LayoutGrid, Plus, X } from 'lucide-react';

import './App.css';

import ChartWorkspace from './components/ChartWorkspace';

import DrawingSettingsDialog from './components/DrawingSettingsDialog';

import DrawingToolbar from './components/DrawingToolbar';

import FavoriteToolsBar from './components/FavoriteToolsBar';

import IndicatorPanel from './components/IndicatorPanel';

import IndicatorSettingsDialog from './components/IndicatorSettingsDialog';

import QuickEditBar, { type QuickTarget } from './components/QuickEditBar';

import Dialog from './components/ui/Dialog';

import LayoutMenu from './components/LayoutMenu';

import ThemePicker from './components/ThemePicker';

import SymbolPicker, { useSymbolCatalog } from './components/SymbolPicker';

import Watchlist from './components/Watchlist';

import {
  DEFAULT_DRAWING_STYLE,
  drawingsAreHidden,
  patchDrawing,
  setAllDrawingsVisible,
  toggleFavoriteTool,
  type DrawingSnapshot,
  type DrawingStyle,
  type DrawingToolId,
  type OverlayMagnetMode,
} from './lib/drawings';

import { patchIndicator, type BuiltinIndicatorId } from './lib/indicators';

import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  VALID_INTERVALS,
  type AppSettings,
  type QuickBarPos,
} from './lib/settings';

import {
  applyThemeToDOM,
  defaultDrawingColor,
  drawingColorPresets,
  resolveThemeTokens,
  type ThemeMode,
} from './lib/theme';

import { syncChartStreams, toStreamSubscriptions } from './lib/tauriBridge';

import type { SymbolInfo } from './lib/types';

import { toggleWatchlist } from './lib/watchlist';

import {
  addChart,
  MAX_CHARTS,
  removeChart,
  resolveActiveChartId,
  updateChart,
  type ChartId,
  type ChartPanelConfig,
  type WorkspaceLayout,
} from './lib/workspace';

type ConfigTarget =
  { kind: 'indicator'; id: BuiltinIndicatorId } | { kind: 'drawing'; id: string } | null;

function App() {
  const [charts, setCharts] = useState<ChartPanelConfig[]>(() =>
    DEFAULT_SETTINGS.charts.map((c) => ({
      ...c,
      indicators: c.indicators.map((d) => ({
        ...d,
        calcParams: [...d.calcParams],
      })),
    })),
  );

  const [activeChartId, setActiveChartId] = useState<ChartId>(DEFAULT_SETTINGS.activeChartId);

  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayout | null>(
    DEFAULT_SETTINGS.workspaceLayout,
  );

  const [drawingsBySymbol, setDrawingsBySymbol] = useState<Record<string, DrawingSnapshot[]>>({});

  const [watchlist, setWatchlist] = useState<string[]>(() => [...DEFAULT_SETTINGS.watchlist]);

  const [activeTool, setActiveTool] = useState<DrawingToolId | null>(null);

  const [magnetMode, setMagnetMode] = useState<OverlayMagnetMode>('normal');

  const [drawStyle, setDrawStyle] = useState<DrawingStyle>(() => ({
    ...DEFAULT_DRAWING_STYLE,
  }));

  const [annotationText, setAnnotationText] = useState('Note');

  const [hydrated, setHydrated] = useState(false);

  const [quickTarget, setQuickTarget] = useState<QuickTarget | null>(null);

  const [configTarget, setConfigTarget] = useState<ConfigTarget>(null);

  const [quickBarPos, setQuickBarPos] = useState<QuickBarPos | null>(null);

  const [favoritesBarPos, setFavoritesBarPos] = useState<QuickBarPos | null>(null);

  const [favoriteTools, setFavoriteTools] = useState<DrawingToolId[]>([]);

  const [favoritesBarVisible, setFavoritesBarVisible] = useState(true);

  const [themeId, setThemeId] = useState(DEFAULT_SETTINGS.themeId);

  const [themeMode, setThemeMode] = useState<ThemeMode>(DEFAULT_SETTINGS.themeMode);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { symbols, loading } = useSymbolCatalog();

  const activeChart = useMemo(
    () => charts.find((c) => c.id === activeChartId) ?? charts[0] ?? null,

    [charts, activeChartId],
  );

  const symbol = activeChart?.symbol ?? 'BTCUSDT';

  const timeframe = activeChart?.timeframe ?? '1m';

  const indicators = activeChart?.indicators ?? [];

  const themeTokens = useMemo(
    () => resolveThemeTokens(themeId, themeMode),

    [themeId, themeMode],
  );

  const colorPresets = useMemo(
    () => drawingColorPresets(themeTokens),

    [themeTokens],
  );

  const drawings = drawingsBySymbol[symbol] ?? [];

  const drawingsHidden = drawingsAreHidden(drawings);

  function applyAppSettings(s: AppSettings) {
    const nextCharts = s.charts.map((c) => ({
      ...c,

      indicators: c.indicators.map((d) => ({
        ...d,

        calcParams: [...d.calcParams],
      })),
    }));

    setCharts(nextCharts);

    setActiveChartId(resolveActiveChartId(nextCharts, s.activeChartId));

    setWorkspaceLayout(s.workspaceLayout);

    setDrawingsBySymbol(s.drawingsBySymbol);

    setWatchlist(s.watchlist);

    setQuickBarPos(s.quickBarPos);

    setFavoritesBarPos(s.favoritesBarPos);

    setFavoriteTools(s.favoriteTools);

    setFavoritesBarVisible(s.favoritesBarVisible);

    setThemeId(s.themeId);

    setThemeMode(s.themeMode);

    const tokens = resolveThemeTokens(s.themeId, s.themeMode);

    setDrawStyle((prev) =>
      prev.color === DEFAULT_DRAWING_STYLE.color
        ? { ...prev, color: defaultDrawingColor(tokens) }
        : prev,
    );

    setActiveTool(null);

    setQuickTarget(null);

    setConfigTarget(null);

    setPendingDeleteId(null);
  }

  function getCurrentSettings(): AppSettings {
    return {
      version: 6,

      charts,

      activeChartId: resolveActiveChartId(charts, activeChartId),

      workspaceLayout,

      drawingsBySymbol,

      watchlist,

      quickBarPos,

      favoritesBarPos,

      favoriteTools,

      favoritesBarVisible,

      themeId,

      themeMode,
    };
  }

  function onImportLayout(s: AppSettings) {
    applyAppSettings(s);

    void saveSettings(s);
  }

  function onRestoreLayout() {
    const defaults = {
      ...DEFAULT_SETTINGS,

      charts: DEFAULT_SETTINGS.charts.map((c) => ({
        ...c,

        indicators: c.indicators.map((d) => ({
          ...d,

          calcParams: [...d.calcParams],
        })),
      })),

      activeChartId: DEFAULT_SETTINGS.activeChartId,

      workspaceLayout: null,

      drawingsBySymbol: {},

      watchlist: [...DEFAULT_SETTINGS.watchlist],

      quickBarPos: null,

      favoritesBarPos: null,

      favoriteTools: [],

      favoritesBarVisible: true,
    };

    applyAppSettings(defaults);

    void saveSettings(defaults);
  }

  function patchActiveChart(
    patch: Partial<Pick<ChartPanelConfig, 'symbol' | 'timeframe' | 'indicators'>>,
  ) {
    if (!activeChart) return;

    setCharts((list) => updateChart(list, activeChart.id, patch));
  }

  function onAddChart() {
    setCharts((list) => {
      const next = addChart(list);

      const added = next[next.length - 1];

      if (added) setActiveChartId(added.id);

      return next;
    });

    setActiveTool(null);

    setQuickTarget(null);

    setConfigTarget(null);
  }

  function onCloseActiveChart() {
    if (!activeChart || charts.length <= 1) return;

    setCharts((list) => {
      const next = removeChart(list, activeChart.id);

      setActiveChartId(resolveActiveChartId(next, activeChartId));

      return next;
    });

    setActiveTool(null);

    setQuickTarget(null);

    setConfigTarget(null);
  }

  useEffect(() => {
    applyThemeToDOM(themeTokens, themeMode);
  }, [themeTokens, themeMode]);

  useEffect(() => {
    let cancelled = false;

    loadSettings().then((s) => {
      if (cancelled) return;

      applyAppSettings(s);

      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    syncChartStreams(
      toStreamSubscriptions(
        charts.map((c) => ({
          chartId: c.id,

          symbol: c.symbol,

          timeframe: c.timeframe,
        })),
      ),
    ).catch((e) => console.error('sync_chart_streams failed', e));
  }, [hydrated, charts]);

  useEffect(() => {
    if (!hydrated) return;

    saveSettings(getCurrentSettings());
  }, [
    hydrated,

    charts,

    activeChartId,

    workspaceLayout,

    drawingsBySymbol,

    watchlist,

    quickBarPos,

    favoritesBarPos,

    favoriteTools,

    favoritesBarVisible,

    themeId,

    themeMode,
  ]);

  useEffect(() => {
    if (!hydrated || symbols.length === 0 || !activeChart) return;

    const info = symbols.find((s) => s.ticker === activeChart.symbol);

    if (info) return;

    const fallback = symbols.find((s) => s.ticker === DEFAULT_SETTINGS.charts[0]!.symbol) ?? null;

    if (fallback) {
      patchActiveChart({ symbol: fallback.ticker });
    }
  }, [hydrated, symbols, activeChart]);

  useEffect(() => {
    setActiveTool(null);

    setQuickTarget(null);

    setConfigTarget(null);

    setPendingDeleteId(null);
  }, [activeChartId, symbol, timeframe]);

  useEffect(() => {
    if (!quickTarget) return;

    if (quickTarget.kind === 'drawing') {
      if (!drawings.some((d) => d.id === quickTarget.id)) {
        setQuickTarget(null);
      }

      return;
    }

    const ind = indicators.find((c) => c.id === quickTarget.id);

    if (!ind?.enabled) setQuickTarget(null);
  }, [quickTarget, drawings, indicators]);

  const activeInfo = useMemo(
    () => symbols.find((s) => s.ticker === symbol),

    [symbols, symbol],
  );

  function onSelectSymbol(info: SymbolInfo) {
    setActiveTool(null);

    patchActiveChart({ symbol: info.ticker });
  }

  function onToggleWatchlist(ticker: string) {
    setWatchlist((list) => toggleWatchlist(list, ticker));
  }

  function onDrawingsChange(sym: string, next: DrawingSnapshot[]) {
    setDrawingsBySymbol((prev) => {
      if (next.length === 0) {
        if (!(sym in prev)) return prev;

        const copy = { ...prev };

        delete copy[sym];

        return copy;
      }

      return { ...prev, [sym]: next };
    });
  }

  function commitDeleteDrawing(id: string) {
    onDrawingsChange(
      symbol,

      drawings.filter((d) => d.id !== id),
    );

    setQuickTarget((t) => (t?.kind === 'drawing' && t.id === id ? null : t));

    setConfigTarget((t) => (t?.kind === 'drawing' && t.id === id ? null : t));

    setPendingDeleteId(null);
  }

  function requestDeleteDrawing(id: string) {
    const d = drawings.find((x) => x.id === id);

    if (!d) return;

    if (d.lock) {
      setPendingDeleteId(id);

      return;
    }

    commitDeleteDrawing(id);
  }

  function onClearDrawings() {
    setQuickTarget(null);

    setPendingDeleteId(null);

    onDrawingsChange(symbol, []);
  }

  function onToggleDrawingsHidden() {
    if (drawings.length === 0) return;

    onDrawingsChange(symbol, setAllDrawingsVisible(drawings, drawingsHidden));
  }

  function onIndicatorFeature(
    chartId: ChartId,

    id: BuiltinIndicatorId,

    action: 'visible' | 'settings' | 'close',
  ) {
    if (action === 'visible') {
      setCharts((list) =>
        list.map((c) => {
          if (c.id !== chartId) return c;
          const cur = c.indicators.find((x) => x.id === id);
          if (!cur) return c;
          return {
            ...c,
            indicators: patchIndicator(c.indicators, id, {
              visible: !cur.visible,
            }),
          };
        }),
      );
      return;
    }

    if (action === 'settings') {
      setActiveChartId(chartId);

      setQuickTarget({ kind: 'indicator', id });

      return;
    }

    if (action === 'close') {
      setCharts((list) =>
        list.map((c) =>
          c.id === chartId
            ? {
                ...c,

                indicators: patchIndicator(c.indicators, id, {
                  enabled: false,
                }),
              }
            : c,
        ),
      );

      setQuickTarget((t) => (t?.kind === 'indicator' && t.id === id ? null : t));
    }
  }

  const indicatorForDialog =
    configTarget?.kind === 'indicator'
      ? (indicators.find((c) => c.id === configTarget.id) ?? null)
      : null;

  const drawingForDialog =
    configTarget?.kind === 'drawing'
      ? (drawings.find((d) => d.id === configTarget.id) ?? null)
      : null;

  const quickDrawing =
    quickTarget?.kind === 'drawing'
      ? (drawings.find((d) => d.id === quickTarget.id) ?? null)
      : null;

  const quickIndicator =
    quickTarget?.kind === 'indicator'
      ? (indicators.find((c) => c.id === quickTarget.id) ?? null)
      : null;

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Trading Terminal</h1>

        <div className="meta">
          <SymbolPicker
            value={symbol}

            onSelect={onSelectSymbol}

            symbols={symbols}

            loading={loading}

            watchlist={watchlist}

            onToggleWatchlist={onToggleWatchlist}
          />

          {activeInfo && (
            <span className="symbol-hint">
              {activeInfo.base}/{activeInfo.quote}
            </span>
          )}

          <div className="intervals" role="group" aria-label="Interval">
            {VALID_INTERVALS.map((tf) => (
              <button
                key={tf}

                type="button"

                className={tf === timeframe ? 'interval-btn active' : 'interval-btn'}

                onClick={() => {
                  setActiveTool(null);

                  patchActiveChart({ timeframe: tf });
                }}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="chart-workspace-controls" role="group" aria-label="Charts">
            <button
              type="button"

              className="workspace-btn"

              title="Add chart"

              aria-label="Add chart"

              disabled={charts.length >= MAX_CHARTS}

              onClick={onAddChart}
            >
              <Plus size={16} />
            </button>

            <button
              type="button"

              className="workspace-btn"

              title="Close active chart"

              aria-label="Close active chart"

              disabled={charts.length <= 1}

              onClick={onCloseActiveChart}
            >
              <X size={16} />
            </button>

            <span className="workspace-chart-count" title="Active charts">
              <LayoutGrid size={14} />
              {charts.length}/{MAX_CHARTS}
            </span>
          </div>

          <IndicatorPanel
            value={indicators}

            onChange={(next) => patchActiveChart({ indicators: next })}

            onOpenSettings={(id) => setQuickTarget({ kind: 'indicator', id })}
          />

          <LayoutMenu
            getSettings={getCurrentSettings}

            onImport={onImportLayout}

            onRestore={onRestoreLayout}
          />

          <ThemePicker
            themeId={themeId}

            themeMode={themeMode}

            onThemeId={setThemeId}

            onThemeMode={setThemeMode}
          />
        </div>
      </header>

      <div className="workspace">
        <DrawingToolbar
          activeTool={activeTool}

          onActiveTool={setActiveTool}

          magnetMode={magnetMode}

          onMagnetMode={setMagnetMode}

          style={drawStyle}

          onStyleChange={setDrawStyle}

          colorPresets={colorPresets}

          annotationText={annotationText}

          onAnnotationTextChange={setAnnotationText}

          drawingsHidden={drawingsHidden}

          onToggleDrawingsHidden={onToggleDrawingsHidden}

          onClear={onClearDrawings}

          favoriteTools={favoriteTools}

          onToggleFavorite={(id) => setFavoriteTools((list) => toggleFavoriteTool(list, id))}

          favoritesBarVisible={favoritesBarVisible}

          onToggleFavoritesBar={() => setFavoritesBarVisible((v) => !v)}
        />

        <Watchlist
          tickers={watchlist}

          activeSymbol={symbol}

          symbols={symbols}

          onSelect={onSelectSymbol}

          onRemove={onToggleWatchlist}

          onAddCurrent={() => onToggleWatchlist(symbol)}
        />

        <main className="chart-area">
          {hydrated ? (
            <ChartWorkspace
              charts={charts}

              activeChartId={resolveActiveChartId(charts, activeChartId)}

              workspaceLayout={workspaceLayout}

              symbols={symbols}

              themeTokens={themeTokens}

              themeId={themeId}

              themeMode={themeMode}

              activeTool={activeTool}

              magnetMode={magnetMode}

              drawStyle={drawStyle}

              annotationText={annotationText}

              drawingsBySymbol={drawingsBySymbol}

              onActiveChartId={setActiveChartId}

              onLayoutChange={setWorkspaceLayout}

              onDrawingsChange={onDrawingsChange}

              onActiveToolConsumed={() => setActiveTool(null)}

              onIndicatorFeature={onIndicatorFeature}

              onOpenDrawingSettings={(id) => setConfigTarget({ kind: 'drawing', id })}

              onDrawingSelect={(id) => setQuickTarget(id ? { kind: 'drawing', id } : null)}
            />
          ) : null}

          {favoritesBarVisible && (
            <FavoriteToolsBar
              favorites={favoriteTools}

              activeTool={activeTool}

              onSelectTool={setActiveTool}

              barPos={favoritesBarPos}

              onBarPosChange={setFavoritesBarPos}
            />
          )}

          <QuickEditBar
            target={quickTarget}

            drawing={quickDrawing}

            indicator={quickIndicator}

            colorPresets={colorPresets}

            barPos={quickBarPos}

            onBarPosChange={setQuickBarPos}

            onClose={() => setQuickTarget(null)}

            onOpenFullSettings={() => {
              if (!quickTarget) return;

              setConfigTarget(quickTarget);
            }}

            onPatchDrawing={(id, patch) =>
              onDrawingsChange(symbol, patchDrawing(drawings, id, patch))
            }

            onDeleteDrawing={requestDeleteDrawing}

            onPatchIndicator={(id, patch) =>
              patchActiveChart({
                indicators: patchIndicator(indicators, id, patch),
              })
            }

            onRemoveIndicator={(id) =>
              patchActiveChart({
                indicators: patchIndicator(indicators, id, {
                  enabled: false,
                }),
              })
            }
          />
        </main>
      </div>

      <IndicatorSettingsDialog
        config={indicatorForDialog}

        onClose={() => setConfigTarget(null)}

        onSave={(id, calcParams) =>
          patchActiveChart({
            indicators: patchIndicator(indicators, id, { calcParams }),
          })
        }
      />

      <DrawingSettingsDialog
        drawing={drawingForDialog}

        colorPresets={colorPresets}

        onClose={() => setConfigTarget(null)}

        onSave={(id, patch) => onDrawingsChange(symbol, patchDrawing(drawings, id, patch))}

        onDelete={requestDeleteDrawing}
      />

      <Dialog
        open={pendingDeleteId != null}

        title="Delete locked drawing?"

        onClose={() => setPendingDeleteId(null)}

        onConfirm={() => {
          if (pendingDeleteId) commitDeleteDrawing(pendingDeleteId);
        }}

        confirmLabel="Delete"

        confirmDanger
      >
        <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
          This drawing is locked. Delete it anyway?
        </p>
      </Dialog>
    </div>
  );
}

export default App;
