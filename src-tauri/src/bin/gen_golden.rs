use serde::Serialize;
use std::collections::HashMap;
use trading_terminal_lib::core::model::{Candle, IndicatorPoint, IndicatorSubscription};
use trading_terminal_lib::indicators::fixtures::{golden_cases, points_match, sample_candles};
use trading_terminal_lib::indicators::get_indicator;
use trading_terminal_lib::indicators::warm::compute_incremental;
use trading_terminal_lib::market::candle_store::CandleStoreState;
use trading_terminal_lib::market::indicator_manager::IndicatorManager;
use trading_terminal_lib::market::CandleChange;

#[derive(Serialize)]
struct GoldenFile {
    cases: Vec<GoldenCase>,
}

#[derive(Serialize)]
struct GoldenCase {
    indicator_id: String,
    calc_params: Vec<f64>,
    points: Vec<GoldenPoint>,
}

#[derive(Serialize)]
struct GoldenPoint {
    timestamp: i64,
    values: HashMap<String, Option<f64>>,
}

fn to_golden_point(pt: &IndicatorPoint) -> GoldenPoint {
    GoldenPoint {
        timestamp: pt.timestamp,
        values: pt.values.iter().map(|(k, v)| (k.clone(), *v)).collect(),
    }
}

fn validate_golden() {
    let candles = sample_candles();
    for case in golden_cases() {
        let indicator = get_indicator(&case.indicator_id).expect("indicator");
        let series = indicator
            .compute_all(&candles, &case.calc_params)
            .expect("batch");
        for expected in &case.points {
            let actual = series
                .points
                .iter()
                .find(|p| p.timestamp == expected.timestamp)
                .unwrap_or_else(|| {
                    panic!(
                        "missing point ts={} for {}",
                        expected.timestamp, case.indicator_id
                    )
                });
            assert!(
                points_match(actual, expected),
                "golden mismatch for {} at ts={}",
                case.indicator_id,
                expected.timestamp
            );
        }
    }
}

fn validate_incremental() {
    let candles = sample_candles();
    for case in golden_cases() {
        let indicator = get_indicator(&case.indicator_id).expect("indicator");
        let batch = indicator
            .compute_all(&candles, &case.calc_params)
            .expect("batch");
        let incremental =
            compute_incremental(indicator, &case.calc_params, &candles).expect("incremental");
        assert_eq!(batch.points.len(), incremental.len());
        for (b, i) in batch.points.iter().zip(incremental.iter()) {
            assert_eq!(b.timestamp, i.timestamp);
            for (key, bv) in &b.values {
                let iv = i.values.get(key).copied().flatten();
                match (*bv, iv) {
                    (None, None) => {}
                    (Some(bv), Some(iv)) => {
                        assert!(
                            (bv - iv).abs() < 1e-6,
                            "{} {} ts {}",
                            case.indicator_id,
                            key,
                            b.timestamp
                        );
                    }
                    _ => panic!(
                        "{} {} ts {}: batch {:?} vs incremental {:?}",
                        case.indicator_id, key, b.timestamp, bv, iv
                    ),
                }
            }
        }
    }
}

fn candle(ts: i64, close: f64) -> Candle {
    Candle {
        timestamp: ts,
        open: close,
        high: close + 1.0,
        low: close - 1.0,
        close,
        volume: 1000.0 + ts as f64,
    }
}

fn validate_integration() {
    let store = CandleStoreState::new();
    let mut mgr = IndicatorManager::new_for_test(store.clone());
    mgr.sync(vec![IndicatorSubscription {
        chart_id: "chart-1".into(),
        instance_id: "ma-1".into(),
        symbol: "BTCUSDT".into(),
        timeframe: "1m".into(),
        indicator_id: "MA".into(),
        calc_params: vec![5.0],
    }]);
    assert!(mgr.test_cached_series("chart-1", "ma-1").is_none());

    let candles = sample_candles();
    store
        .0
        .lock()
        .unwrap()
        .replace("BTCUSDT", "1m", candles.clone());
    mgr.on_candles_changed("BTCUSDT", "1m", CandleChange::Replace);

    let series = mgr.test_cached_series("chart-1", "ma-1").expect("series");
    assert_eq!(series.points.len(), candles.len());

    store
        .0
        .lock()
        .unwrap()
        .append_or_update("BTCUSDT", "1m", candle(2000, 50.0));
    mgr.on_candles_changed("BTCUSDT", "1m", CandleChange::PatchLast);
    let series = mgr.test_cached_series("chart-1", "ma-1").expect("series");
    assert_eq!(series.points.len(), candles.len() + 1);
}

fn main() {
    validate_golden();
    validate_incremental();
    validate_integration();

    let candles = sample_candles();
    let specs: &[(&str, &[f64])] = &[
        ("MA", &[5.0, 10.0]),
        ("EMA", &[9.0, 21.0]),
        ("BOLL", &[20.0, 2.0]),
        ("VOL", &[5.0, 10.0]),
        ("MACD", &[12.0, 26.0, 9.0]),
        ("RSI", &[14.0]),
        ("CCI", &[20.0]),
        ("KDJ", &[9.0, 3.0, 3.0]),
    ];
    let mut cases = Vec::new();
    for (id, params) in specs {
        let indicator = get_indicator(id).expect("indicator");
        let series = indicator.compute_all(&candles, params).expect("series");
        let checkpoints = [1009_i64, 1024, 1034];
        let points = checkpoints
            .iter()
            .filter_map(|ts| {
                series
                    .points
                    .iter()
                    .find(|p| p.timestamp == *ts)
                    .map(to_golden_point)
            })
            .collect();
        cases.push(GoldenCase {
            indicator_id: id.to_string(),
            calc_params: params.to_vec(),
            points,
        });
    }
    let file = GoldenFile { cases };
    println!("{}", serde_json::to_string_pretty(&file).unwrap());
}
