use crate::indicators::fixtures::{golden_cases, points_match, sample_candles};
use crate::indicators::get_indicator;
use crate::indicators::warm::compute_incremental;

#[test]
fn golden_batch_matches_fixture() {
    let candles = sample_candles();
    for case in golden_cases() {
        let indicator = get_indicator(&case.indicator_id).expect("indicator");
        let series = indicator.compute_all(&candles, &case.calc_params);
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
                "golden mismatch for {} at ts={}: {:?} vs {:?}",
                case.indicator_id,
                expected.timestamp,
                actual.values,
                expected.values
            );
        }
    }
}

#[test]
fn incremental_path_matches_batch_all_indicators() {
    let candles = sample_candles();
    for case in golden_cases() {
        let indicator = get_indicator(&case.indicator_id).expect("indicator");
        let batch = indicator.compute_all(&candles, &case.calc_params);
        let incremental =
            compute_incremental(indicator, &case.calc_params, &candles).expect("incremental");
        assert_eq!(
            batch.points.len(),
            incremental.len(),
            "{} point count",
            case.indicator_id
        );
        for (b, i) in batch.points.iter().zip(incremental.iter()) {
            assert_eq!(b.timestamp, i.timestamp);
            for (key, bv) in &b.values {
                let iv = i.values.get(key).copied().flatten();
                match (*bv, iv) {
                    (None, None) => {}
                    (Some(bv), Some(iv)) => assert!(
                        (bv - iv).abs() < 1e-6,
                        "{} key {} ts {}",
                        case.indicator_id,
                        key,
                        b.timestamp
                    ),
                    _ => panic!(
                        "{} key {} ts {}: batch {:?} vs incremental {:?}",
                        case.indicator_id,
                        key,
                        b.timestamp,
                        bv,
                        iv
                    ),
                }
            }
        }
    }
}
