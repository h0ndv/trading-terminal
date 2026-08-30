use crate::core::model::Candle;
use serde::Deserialize;
use std::collections::HashMap;

const CANDLES_JSON: &str = include_str!("../../fixtures/indicators/candles.json");
const GOLDEN_JSON: &str = include_str!("../../fixtures/indicators/golden.json");

#[derive(Debug, Deserialize)]
struct GoldenFile {
    cases: Vec<GoldenCase>,
}

#[derive(Debug, Deserialize)]
pub struct GoldenCase {
    pub indicator_id: String,
    pub calc_params: Vec<f64>,
    pub points: Vec<GoldenPoint>,
}

#[derive(Debug, Deserialize)]
pub struct GoldenPoint {
    pub timestamp: i64,
    pub values: HashMap<String, Option<f64>>,
}

pub fn sample_candles() -> Vec<Candle> {
    serde_json::from_str(CANDLES_JSON).expect("candles fixture")
}

pub fn golden_cases() -> Vec<GoldenCase> {
    serde_json::from_str::<GoldenFile>(GOLDEN_JSON)
        .expect("golden fixture")
        .cases
}

pub fn approx_eq(a: Option<f64>, b: Option<f64>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(x), Some(y)) => (x - y).abs() < 1e-6,
        _ => false,
    }
}

pub fn points_match(actual: &crate::core::model::IndicatorPoint, expected: &GoldenPoint) -> bool {
    if actual.timestamp != expected.timestamp {
        return false;
    }
    for (key, exp) in &expected.values {
        let got = actual.values.get(key).copied().flatten();
        if !approx_eq(got, *exp) {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod generate {
    use super::sample_candles;
    use crate::core::model::IndicatorPoint;
    use crate::indicators::get_indicator;
    use serde::Serialize;
    use std::collections::HashMap;

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

    #[test]
    #[ignore]
    fn generate_golden_fixture() {
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
            let indicator = get_indicator(id).unwrap();
            let series = indicator.compute_all(&candles, params).unwrap();
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
}
