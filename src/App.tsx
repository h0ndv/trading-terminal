import { useEffect, useMemo, useState } from "react";
import "./App.css";
import ChartView, {
  type IndicatorFeatureAction,
} from "./components/Chart";
import DrawingSettingsDialog from "./components/DrawingSettingsDialog";
import DrawingToolbar from "./components/DrawingToolbar";
import FavoriteToolsBar from "./components/FavoriteToolsBar";
import IndicatorPanel from "./components/IndicatorPanel";
import IndicatorSettingsDialog from "./components/IndicatorSettingsDialog";
import QuickEditBar, {
  type QuickTarget,
} from "./components/QuickEditBar";
import Dialog from "./components/ui/Dialog";
import SymbolPicker, { useSymbolCatalog } from "./components/SymbolPicker";
import { useCandleStream } from "./hooks/useCandleStream";
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
} from "./lib/drawings";
import {
  patchIndicator,
  type BuiltinIndicatorId,
  type IndicatorConfig,
} from "./lib/indicators";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  VALID_INTERVALS,
  type QuickBarPos,
} from "./lib/settings";
import { setStream } from "./lib/tauriBridge";
import type { SymbolInfo } from "./lib/types";

type ConfigTarget =
  | { kind: "indicator"; id: BuiltinIndicatorId }
  | { kind: "drawing"; id: string }
  | null;

function App() {
  const [symbol, setSymbol] = useState(DEFAULT_SETTINGS.symbol);
  const [timeframe, setTimeframe] = useState(DEFAULT_SETTINGS.timeframe);
  const [indicators, setIndicators] = useState<IndicatorConfig[]>(
    () =>
      DEFAULT_SETTINGS.indicators.map((d) => ({
        ...d,
        calcParams: [...d.calcParams],
      })),
  );
  const [drawingsBySymbol, setDrawingsBySymbol] = useState<
    Record<string, DrawingSnapshot[]>
  >({});
  const [activeTool, setActiveTool] = useState<DrawingToolId | null>(null);
  const [magnetMode, setMagnetMode] =
    useState<OverlayMagnetMode>("normal");
  const [drawStyle, setDrawStyle] = useState<DrawingStyle>(() => ({
    ...DEFAULT_DRAWING_STYLE,
  }));
  const [annotationText, setAnnotationText] = useState("Note");
  const [pricePrecision, setPricePrecision] = useState(2);
  const [volumePrecision, setVolumePrecision] = useState(3);
  const [hydrated, setHydrated] = useState(false);
  const [quickTarget, setQuickTarget] = useState<QuickTarget | null>(null);
  const [configTarget, setConfigTarget] = useState<ConfigTarget>(null);
  const [quickBarPos, setQuickBarPos] = useState<QuickBarPos | null>(null);
  const [favoritesBarPos, setFavoritesBarPos] =
    useState<QuickBarPos | null>(null);
  const [favoriteTools, setFavoriteTools] = useState<DrawingToolId[]>([]);
  const [favoritesBarVisible, setFavoritesBarVisible] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { symbols, loading } = useSymbolCatalog();
  const stream = useCandleStream(symbol, timeframe);

  const drawings = drawingsBySymbol[symbol] ?? [];
  const drawingsHidden = drawingsAreHidden(drawings);

  useEffect(() => {
    let cancelled = false;
    loadSettings().then((s) => {
      if (cancelled) return;
      setSymbol(s.symbol);
      setTimeframe(s.timeframe);
      setIndicators(s.indicators);
      setDrawingsBySymbol(s.drawingsBySymbol);
      setQuickBarPos(s.quickBarPos);
      setFavoritesBarPos(s.favoritesBarPos);
      setFavoriteTools(s.favoriteTools);
      setFavoritesBarVisible(s.favoritesBarVisible);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setStream(symbol, timeframe).catch((e) =>
      console.error("set_stream failed", e),
    );
  }, [hydrated, symbol, timeframe]);

  useEffect(() => {
    if (!hydrated) return;
    saveSettings({
      symbol,
      timeframe,
      indicators,
      drawingsBySymbol,
      quickBarPos,
      favoritesBarPos,
      favoriteTools,
      favoritesBarVisible,
    });
  }, [
    hydrated,
    symbol,
    timeframe,
    indicators,
    drawingsBySymbol,
    quickBarPos,
    favoritesBarPos,
    favoriteTools,
    favoritesBarVisible,
  ]);

  useEffect(() => {
    if (!hydrated || symbols.length === 0) return;
    const info = symbols.find((s) => s.ticker === symbol);
    if (info) {
      setPricePrecision(info.price_precision);
      setVolumePrecision(info.volume_precision);
      return;
    }
    const fallback =
      symbols.find((s) => s.ticker === DEFAULT_SETTINGS.symbol) ?? null;
    if (fallback && symbol !== fallback.ticker) {
      setSymbol(fallback.ticker);
      setPricePrecision(fallback.price_precision);
      setVolumePrecision(fallback.volume_precision);
    } else if (!fallback && symbol !== DEFAULT_SETTINGS.symbol) {
      setSymbol(DEFAULT_SETTINGS.symbol);
    }
  }, [hydrated, symbols, symbol]);

  useEffect(() => {
    setActiveTool(null);
    setQuickTarget(null);
    setConfigTarget(null);
    setPendingDeleteId(null);
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!quickTarget) return;
    if (quickTarget.kind === "drawing") {
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
    setSymbol(info.ticker);
    setPricePrecision(info.price_precision);
    setVolumePrecision(info.volume_precision);
  }

  function onDrawingsChange(next: DrawingSnapshot[]) {
    setDrawingsBySymbol((prev) => {
      if (next.length === 0) {
        if (!(symbol in prev)) return prev;
        const copy = { ...prev };
        delete copy[symbol];
        return copy;
      }
      return { ...prev, [symbol]: next };
    });
  }

  function commitDeleteDrawing(id: string) {
    onDrawingsChange(drawings.filter((d) => d.id !== id));
    setQuickTarget((t) =>
      t?.kind === "drawing" && t.id === id ? null : t,
    );
    setConfigTarget((t) =>
      t?.kind === "drawing" && t.id === id ? null : t,
    );
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
    onDrawingsChange([]);
  }

  function onToggleDrawingsHidden() {
    if (drawings.length === 0) return;
    onDrawingsChange(setAllDrawingsVisible(drawings, drawingsHidden));
  }

  function onIndicatorFeature(
    id: BuiltinIndicatorId,
    action: IndicatorFeatureAction,
  ) {
    if (action === "visible") {
      setIndicators((list) => {
        const cur = list.find((c) => c.id === id);
        if (!cur) return list;
        return patchIndicator(list, id, { visible: !cur.visible });
      });
      return;
    }
    if (action === "settings") {
      setQuickTarget({ kind: "indicator", id });
      return;
    }
    if (action === "close") {
      setIndicators((list) => patchIndicator(list, id, { enabled: false }));
      setQuickTarget((t) =>
        t?.kind === "indicator" && t.id === id ? null : t,
      );
    }
  }

  const indicatorForDialog =
    configTarget?.kind === "indicator"
      ? (indicators.find((c) => c.id === configTarget.id) ?? null)
      : null;

  const drawingForDialog =
    configTarget?.kind === "drawing"
      ? (drawings.find((d) => d.id === configTarget.id) ?? null)
      : null;

  const quickDrawing =
    quickTarget?.kind === "drawing"
      ? (drawings.find((d) => d.id === quickTarget.id) ?? null)
      : null;

  const quickIndicator =
    quickTarget?.kind === "indicator"
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
                className={
                  tf === timeframe ? "interval-btn active" : "interval-btn"
                }
                onClick={() => {
                  setActiveTool(null);
                  setTimeframe(tf);
                }}
              >
                {tf}
              </button>
            ))}
          </div>
          <IndicatorPanel
            value={indicators}
            onChange={setIndicators}
            onOpenSettings={(id) => setQuickTarget({ kind: "indicator", id })}
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
          annotationText={annotationText}
          onAnnotationTextChange={setAnnotationText}
          drawingsHidden={drawingsHidden}
          onToggleDrawingsHidden={onToggleDrawingsHidden}
          onClear={onClearDrawings}
          favoriteTools={favoriteTools}
          onToggleFavorite={(id) =>
            setFavoriteTools((list) => toggleFavoriteTool(list, id))
          }
          favoritesBarVisible={favoritesBarVisible}
          onToggleFavoritesBar={() =>
            setFavoritesBarVisible((v) => !v)
          }
        />
        <main className="chart-area">
          {hydrated ? (
            <ChartView
              symbol={symbol}
              timeframe={timeframe}
              pricePrecision={pricePrecision}
              volumePrecision={volumePrecision}
              stream={stream}
              indicators={indicators}
              activeTool={activeTool}
              magnetMode={magnetMode}
              drawStyle={drawStyle}
              annotationText={annotationText}
              drawings={drawings}
              onDrawingsChange={onDrawingsChange}
              onActiveToolConsumed={() => setActiveTool(null)}
              onIndicatorFeature={onIndicatorFeature}
              onOpenDrawingSettings={(id) =>
                setConfigTarget({ kind: "drawing", id })
              }
              onDrawingSelect={(id) =>
                setQuickTarget(id ? { kind: "drawing", id } : null)
              }
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
            barPos={quickBarPos}
            onBarPosChange={setQuickBarPos}
            onClose={() => setQuickTarget(null)}
            onOpenFullSettings={() => {
              if (!quickTarget) return;
              setConfigTarget(quickTarget);
            }}
            onPatchDrawing={(id, patch) =>
              onDrawingsChange(patchDrawing(drawings, id, patch))
            }
            onDeleteDrawing={requestDeleteDrawing}
            onPatchIndicator={(id, patch) =>
              setIndicators((list) => patchIndicator(list, id, patch))
            }
            onRemoveIndicator={(id) =>
              setIndicators((list) =>
                patchIndicator(list, id, { enabled: false }),
              )
            }
          />
        </main>
      </div>

      <IndicatorSettingsDialog
        config={indicatorForDialog}
        onClose={() => setConfigTarget(null)}
        onSave={(id, calcParams) =>
          setIndicators((list) => patchIndicator(list, id, { calcParams }))
        }
      />
      <DrawingSettingsDialog
        drawing={drawingForDialog}
        onClose={() => setConfigTarget(null)}
        onSave={(id, patch) =>
          onDrawingsChange(patchDrawing(drawings, id, patch))
        }
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
        <p style={{ margin: 0, color: "#8b949e" }}>
          This drawing is locked. Delete it anyway?
        </p>
      </Dialog>
    </div>
  );
}

export default App;
