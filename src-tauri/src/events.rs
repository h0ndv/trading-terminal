use crate::core::model::{
    CandleUpdateEvent, IndicatorBootstrapEvent, IndicatorPatchEvent, IndicatorSeries, TickerStats,
};
use tauri::{AppHandle, Emitter};

pub const CANDLE_UPDATE: &str = "candle-update";
pub const TICKER_UPDATE: &str = "ticker-update";
pub const INDICATOR_BOOTSTRAP: &str = "indicator-bootstrap";
pub const INDICATOR_PATCH: &str = "indicator-patch";

pub fn emit_candle_update(app: &AppHandle, event: &CandleUpdateEvent) {
    if let Err(e) = app.emit(CANDLE_UPDATE, event) {
        tracing::warn!(error = %e, "failed to emit candle-update");
    }
}

pub fn emit_ticker_update(app: &AppHandle, stats: &TickerStats) {
    if let Err(e) = app.emit(TICKER_UPDATE, stats) {
        tracing::warn!(error = %e, "failed to emit ticker-update");
    }
}

pub fn emit_indicator_bootstrap(
    app: &AppHandle,
    chart_id: &str,
    instance_id: &str,
    symbol: &str,
    timeframe: &str,
    series: &IndicatorSeries,
) {
    let event = IndicatorBootstrapEvent {
        chart_id: chart_id.to_string(),
        instance_id: instance_id.to_string(),
        symbol: symbol.to_string(),
        timeframe: timeframe.to_string(),
        series: series.clone(),
    };
    if let Err(e) = app.emit(INDICATOR_BOOTSTRAP, event) {
        tracing::warn!(error = %e, "failed to emit indicator-bootstrap");
    }
}

pub fn emit_indicator_patch(
    app: &AppHandle,
    chart_id: &str,
    instance_id: &str,
    symbol: &str,
    timeframe: &str,
    point: &crate::core::model::IndicatorPoint,
) {
    let event = IndicatorPatchEvent {
        chart_id: chart_id.to_string(),
        instance_id: instance_id.to_string(),
        symbol: symbol.to_string(),
        timeframe: timeframe.to_string(),
        point: point.clone(),
    };
    if let Err(e) = app.emit(INDICATOR_PATCH, event) {
        tracing::warn!(error = %e, "failed to emit indicator-patch");
    }
}
