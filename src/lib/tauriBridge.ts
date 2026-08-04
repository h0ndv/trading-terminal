import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Candle } from "./types";

export function getHistorical(
  symbol: string,
  timeframe: string,
): Promise<Candle[]> {
  return invoke<Candle[]>("get_historical", { symbol, timeframe });
}

export function setStream(symbol: string, timeframe: string): Promise<void> {
  return invoke("set_stream", { symbol, timeframe });
}

export function onCandleUpdate(
  handler: (candle: Candle) => void,
): Promise<UnlistenFn> {
  return listen<Candle>("candle-update", (event) => {
    handler(event.payload);
  });
}
