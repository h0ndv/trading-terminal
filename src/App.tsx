import { useEffect, useMemo, useState } from "react";
import "./App.css";
import ChartView from "./components/Chart";
import SymbolPicker, { useSymbolCatalog } from "./components/SymbolPicker";
import { useCandleStream } from "./hooks/useCandleStream";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  VALID_INTERVALS,
} from "./lib/settings";
import { setStream } from "./lib/tauriBridge";
import type { SymbolInfo } from "./lib/types";

function App() {
  const [symbol, setSymbol] = useState(DEFAULT_SETTINGS.symbol);
  const [timeframe, setTimeframe] = useState(DEFAULT_SETTINGS.timeframe);
  const [pricePrecision, setPricePrecision] = useState(2);
  const [volumePrecision, setVolumePrecision] = useState(3);
  const [hydrated, setHydrated] = useState(false);
  const { symbols, loading } = useSymbolCatalog();
  const stream = useCandleStream(symbol, timeframe);

  useEffect(() => {
    let cancelled = false;
    loadSettings().then((s) => {
      if (cancelled) return;
      setSymbol(s.symbol);
      setTimeframe(s.timeframe);
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
    saveSettings({ symbol, timeframe });
  }, [hydrated, symbol, timeframe]);

  // Sync precision + delist fallback when catalog arrives
  useEffect(() => {
    if (!hydrated || symbols.length === 0) return;
    const info = symbols.find((s) => s.ticker === symbol);
    if (info) {
      setPricePrecision(info.price_precision);
      setVolumePrecision(info.volume_precision);
      return;
    }
    // Saved pair no longer TRADING
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

  const activeInfo = useMemo(
    () => symbols.find((s) => s.ticker === symbol),
    [symbols, symbol],
  );

  function onSelectSymbol(info: SymbolInfo) {
    setSymbol(info.ticker);
    setPricePrecision(info.price_precision);
    setVolumePrecision(info.volume_precision);
  }

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
                onClick={() => setTimeframe(tf)}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="chart-area">
        {hydrated ? (
          <ChartView
            symbol={symbol}
            timeframe={timeframe}
            pricePrecision={pricePrecision}
            volumePrecision={volumePrecision}
            stream={stream}
          />
        ) : null}
      </main>
    </div>
  );
}

export default App;
