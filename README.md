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

## Symbol / timeframe

Phase 1 hardcodes **BTCUSDT** / **1m** in:

- `src/App.tsx` (header + chart props)
- Binance stream URL in `src-tauri/src/data/binance.rs`
- `get_historical` interval mapping in `src-tauri/src/commands.rs`

Change those together when switching pairs/intervals.

## Architecture

- **Rust core** (`src-tauri/src/core`, `data`, `indicators`) has no Tauri or chart dependencies — reusable if you swap the UI or chart library.
- **Tauri bridge** only: `commands.rs`, `events.rs`, `lib.rs` setup.
- **KLineChart** only imported from `src/components/Chart.tsx`. Realtime uses v10 `setDataLoader` / `subscribeBar` (not the removed v9 `updateData`).

## Indicators

- Chart display: KLineChart built-ins — MA(20), VOL, RSI(14).
- Domain implementations (tests): `src-tauri/src/indicators/` (`cargo test` in `src-tauri`).
