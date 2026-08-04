import { useEffect, useState } from "react";
import "./App.css";
import ChartView from "./components/Chart";
import { useCandleStream } from "./hooks/useCandleStream";
import { setStream } from "./lib/tauriBridge";

const SYMBOL = "BTCUSDT";
// Binance spot intervals
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
  const [timeframe, setTimeframe] = useState<string>("1m");
  const stream = useCandleStream(SYMBOL, timeframe);

  useEffect(() => {
    setStream(SYMBOL, timeframe).catch((e) =>
      console.error("set_stream failed", e),
    );
  }, [timeframe]);

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Trading Terminal</h1>
        <div className="meta">
          <span className="symbol">{SYMBOL}</span>
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
        <ChartView symbol={SYMBOL} timeframe={timeframe} stream={stream} />
      </main>
    </div>
  );
}

export default App;
