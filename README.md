# Trading Terminal

Desktop trading terminal (Tauri v2 + React + TypeScript) with a pure Rust market-data core and KLineChart for rendering.

## Versions

| Package | Version |
|---------|---------|
| klinecharts | **10.0.1** |
| tauri (Rust crate / CLI) | **2** |
| @tauri-apps/api | **^2** |

## Run

```bash
bun run tauri dev
```

Production build:

```bash
bun run tauri build
```

(`npm run tauri dev` / `npm run tauri build` also work if you use npm; `tauri.conf.json` uses Bun for the Vite frontend scripts.)

## Market data (Binance)

- **History**: REST `GET /api/v3/klines` via `get_historical` (pages of up to 1000 bars; scroll-back loads older via `endTime`).
- **Live**: WebSocket `{symbol}@kline_{interval}` → Tauri event `candle-update` → chart `subscribeBar`.
- **Catalog**: `list_symbols` → `GET /api/v3/exchangeInfo` (TRADING pairs, cached in-process).
- **Symbol / interval**: header typeahead + TF buttons call `set_stream`; Rust reconnects WS via a `watch` channel.
- **Persistence**: last symbol/TF restored on launch via `@tauri-apps/plugin-store` (`settings.json` in the app data dir).

The kline WS alone cannot fill the chart; REST + WS is the standard terminal pattern.

## Symbol / timeframe

- **Symbol**: searchable picker (default `BTCUSDT`); any spot TRADING pair from exchangeInfo. Last choice is restored on restart.
- **Intervals**: `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, `1w`. Changing symbol or TF reloads REST history and resubscribes the live stream.

Exchange logic lives under `src-tauri/src/data/binance/`.

## Architecture

- **Rust core** (`src-tauri/src/core`, `data`, `indicators`) has no Tauri or chart dependencies — reusable if you swap the UI or chart library.
- **Tauri bridge** only: `commands.rs`, `events.rs`, `lib.rs` setup.
- **KLineChart** only imported from `src/components/Chart.tsx`. Realtime uses v10 `setDataLoader` / `subscribeBar` (not the removed v9 `updateData`).

## Indicators

- Chart display: KLineChart built-ins — MA(20), VOL, RSI(14).
- Domain implementations (tests): `src-tauri/src/indicators/` (`cargo test` in `src-tauri`).
