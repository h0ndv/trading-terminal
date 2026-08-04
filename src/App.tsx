import { useEffect, useMemo, useState } from "react";
import "./App.css";
import ChartView from "./components/Chart";
import SymbolPicker, { useSymbolCatalog } from "./components/SymbolPicker";
import { useCandleStream } from "./hooks/useCandleStream";
import { setStream } from "./lib/tauriBridge";
import type { SymbolInfo } from "./lib/types";

const DEFAULT_SYMBOL = "BTCUSDT";
const INTERVALS = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
  "1w",
] as const;

function App() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [timeframe, setTimeframe] = useState<string>("1m");
  const [pricePrecision, setPricePrecision] = useState(2);
  const [volumePrecision, setVolumePrecision] = useState(3);
  const { symbols, loading } = useSymbolCatalog();
  const stream = useCandleStream(symbol, timeframe);

  useEffect(() => {
    setStream(symbol, timeframe).catch((e) =>
      console.error("set_stream failed", e),
    );
  }, [symbol, timeframe]);

  // Sync precision when catalog arrives / symbol matches
  useEffect(() => {
    const info = symbols.find((s) => s.ticker === symbol);
    if (info) {
      setPricePrecision(info.price_precision);
      setVolumePrecision(info.volume_precision);
    }
  }, [symbols, symbol]);

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
            {INTERVALS.map((tf) => (
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
        <ChartView
          symbol={symbol}
          timeframe={timeframe}
          pricePrecision={pricePrecision}
          volumePrecision={volumePrecision}
          stream={stream}
        />
      </main>
    </div>
  );
}

export default App;
