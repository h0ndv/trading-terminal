import "./App.css";
import ChartView from "./components/Chart";
import { useCandleStream } from "./hooks/useCandleStream";

const SYMBOL = "BTCUSDT";
const TIMEFRAME = "1m";

function App() {
  const stream = useCandleStream(SYMBOL, TIMEFRAME);

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Trading Terminal</h1>
        <div className="meta">
          <span className="symbol">{SYMBOL}</span>
          <span className="timeframe">{TIMEFRAME}</span>
        </div>
      </header>
      <main className="chart-area">
        <ChartView symbol={SYMBOL} timeframe={TIMEFRAME} stream={stream} />
      </main>
    </div>
  );
}

export default App;
