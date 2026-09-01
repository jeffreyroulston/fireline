use std::collections::BTreeMap;

use super::evaluate::evaluate_hands;
use super::pool::requested_threads;
use super::*;
use crate::cards::Card;
use crate::error::EngineError;
use crate::model::{SimType, SolveRequest};

#[test]
fn deck_evaluation_is_deterministic() {
    let deck = BTreeMap::from([
        ("arthur".into(), 3),
        ("kingdom_informant".into(), 3),
        ("clumsy_apprentice".into(), 3),
    ]);
    let request = DeckEvalRequest {
        deck,
        samples: 2,
        go_first: true,
        max_turns: 2,
        seed: 9,
        sim_type: SimType::FireBrick,
        rollouts: 1,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    };
    let one = evaluate(&request).unwrap();
    let two = evaluate(&request).unwrap();
    assert_eq!(one.damages, two.damages);
    assert!(one.p10 <= one.p50);
    assert!(one.p50 <= one.p90);
    assert!(one.mean_end_influence >= 0.0);
    assert_eq!(one.effective.root_seed, 9);
    assert_eq!(one.effective.max_turns, Some(2));
    assert_eq!(one.effective.rollouts, Some(1));
    assert_eq!(one.effective.samples, Some(2));
    assert_eq!(one.effective.engine_version, two.effective.engine_version);
}

#[test]
fn optimizer_preserves_deck_size() {
    let result = optimize(&OptimizeRequest {
        bounds: BTreeMap::from([
            ("arthur".into(), Bounds { min: 1, max: 3 }),
            ("kingdom_informant".into(), Bounds { min: 1, max: 3 }),
            ("clumsy_apprentice".into(), Bounds { min: 1, max: 3 }),
        ]),
        deck_size: 7,
        samples: 1,
        decks: 4,
        metric: Metric::Mean,
        seed: 4,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        strategy: Strategy::RandomSample,
        base_deck: BTreeMap::new(),
        swap: None,
        multi_deck: None,
        go_first: true,
        max_turns: 3,
        sim_type: crate::model::SimType::FireBrick,
        rollouts: 1,
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,
        max_card_draw: None,
        eval_mode: EvalMode::Full,
    })
    .unwrap();
    assert_eq!(
        result
            .best_counts
            .values()
            .map(|&count| u16::from(count))
            .sum::<u16>(),
        7
    );
    assert!(result.decks_scored >= 1);
    assert!(result.legal_decks >= result.decks_scored as u64);
    assert_eq!(result.effective.decks, Some(4));
    assert_eq!(result.effective.deck_size, Some(7));
    assert_eq!(result.effective.samples, Some(1));
    assert_eq!(result.effective.metric, Some("mean"));
}

#[test]
fn evaluate_clamps_turns_and_rollouts() {
    let deck = BTreeMap::from([
        ("arthur".into(), 3),
        ("kingdom_informant".into(), 3),
        ("clumsy_apprentice".into(), 3),
    ]);
    let result = evaluate(&DeckEvalRequest {
        deck,
        samples: 1,
        go_first: true,
        max_turns: 1,
        seed: 3,
        sim_type: SimType::FireBrick,
        rollouts: 0,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    })
    .unwrap();
    assert_eq!(result.effective.max_turns, Some(2));
    assert_eq!(result.effective.rollouts, Some(1));
}

#[test]
fn parallel_eval_matches_serial_results() {
    let deck = BTreeMap::from([
        ("arthur".into(), 3),
        ("kingdom_informant".into(), 3),
        ("clumsy_apprentice".into(), 3),
        ("sable_remnant".into(), 2),
        ("blazing_throw".into(), 2),
        ("red_hare".into(), 2),
        ("march_hare".into(), 2),
    ]);
    let request = DeckEvalRequest {
        deck,
        samples: 8,
        go_first: true,
        max_turns: 2,
        seed: 17,
        sim_type: SimType::FireBrick,
        rollouts: 1,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    };
    let serial = evaluate_with_serial_progress(&request, |_| ControlFlow::Continue(())).unwrap();
    let parallel = evaluate_with_progress(&request, |_| ControlFlow::Continue(())).unwrap();
    assert_eq!(serial.damages, parallel.damages);
    assert_eq!(serial.mean, parallel.mean);
    assert_eq!(serial.p50, parallel.p50);
    assert_eq!(serial.unique_hands, parallel.unique_hands);
}

#[test]
fn parallel_progress_is_monotonic_and_reaches_total() {
    let deck = BTreeMap::from([
        ("arthur".into(), 3),
        ("kingdom_informant".into(), 3),
        ("clumsy_apprentice".into(), 3),
        ("sable_remnant".into(), 2),
        ("blazing_throw".into(), 2),
        ("red_hare".into(), 2),
        ("march_hare".into(), 2),
    ]);
    let mut ticks = Vec::new();
    let result = evaluate_with_progress(
        &DeckEvalRequest {
            deck,
            samples: 6,
            go_first: true,
            max_turns: 2,
            seed: 21,
            sim_type: SimType::FireBrick,
            rollouts: 1,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

            max_card_draw: None,
        },
        |progress| {
            ticks.push(progress);
            ControlFlow::Continue(())
        },
    )
    .unwrap();
    assert_eq!(result.samples, 6);
    let hand_ticks: Vec<_> = ticks
        .iter()
        .filter(|tick| tick.rollout == 0)
        .map(|tick| tick.sample)
        .collect();
    assert!(
        hand_ticks.windows(2).all(|pair| pair[0] <= pair[1]),
        "expected monotonic hand progress, got {hand_ticks:?}"
    );
    assert_eq!(
        hand_ticks.last().copied(),
        Some(6),
        "expected final hand progress to reach total, got {hand_ticks:?}"
    );
}

#[test]
fn parallel_monte_carlo_reports_hand_progress_only() {
    let deck = BTreeMap::from([
        ("arthur".into(), 3),
        ("kingdom_informant".into(), 3),
        ("clumsy_apprentice".into(), 3),
        ("sable_remnant".into(), 2),
        ("blazing_throw".into(), 2),
        ("red_hare".into(), 2),
        ("march_hare".into(), 2),
    ]);
    let mut ticks = Vec::new();
    let result = evaluate_with_progress(
        &DeckEvalRequest {
            deck,
            samples: 2,
            go_first: true,
            max_turns: 2,
            seed: 13,
            sim_type: SimType::MonteCarlo,
            rollouts: 3,
            budget: crate::budget::Budget {
                max_eval_rollouts: 3,
                ..crate::budget::Budget::default()
            },
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

            max_card_draw: None,
        },
        |progress| {
            ticks.push(progress);
            ControlFlow::Continue(())
        },
    )
    .unwrap();
    assert_eq!(result.effective.rollouts, Some(3));
    assert!(
        ticks.iter().all(|tick| tick.rollout == 0),
        "parallel MC should not emit rollout ticks, got {ticks:?}"
    );
    assert!(
        ticks.iter().any(|tick| tick.sample == 1 && tick.total == 2),
        "expected a completed-hand tick, got {ticks:?}"
    );
}

#[test]
fn monte_carlo_serial_progress_reports_rollouts() {
    let deck = BTreeMap::from([
        ("arthur".into(), 3),
        ("kingdom_informant".into(), 3),
        ("clumsy_apprentice".into(), 3),
        ("sable_remnant".into(), 2),
        ("blazing_throw".into(), 2),
        ("red_hare".into(), 2),
        ("march_hare".into(), 2),
    ]);
    let mut ticks = Vec::new();
    let result = evaluate_with_serial_progress(
        &DeckEvalRequest {
            deck,
            samples: 1,
            go_first: true,
            max_turns: 2,
            seed: 11,
            sim_type: SimType::MonteCarlo,
            rollouts: 3,
            budget: crate::budget::Budget {
                max_eval_rollouts: 3,
                ..crate::budget::Budget::default()
            },
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

            max_card_draw: None,
        },
        |progress| {
            ticks.push(progress);
            ControlFlow::Continue(())
        },
    )
    .unwrap();
    assert_eq!(result.effective.rollouts, Some(3));
    assert!(
        ticks
            .iter()
            .any(|tick| tick.rollout == 1 && tick.total_rollouts == 3),
        "expected a mid-hand rollout tick, got {ticks:?}"
    );
    assert!(
        ticks
            .iter()
            .any(|tick| tick.rollout == 3 && tick.total_rollouts == 3),
        "expected a final-rollout tick, got {ticks:?}"
    );
    assert!(
        ticks.iter().any(|tick| tick.sample == 1 && tick.total == 1),
        "expected a completed-hand tick, got {ticks:?}"
    );
}

#[test]
fn parallel_monte_carlo_emits_per_hand_progress() {
    let deck = BTreeMap::from([
        ("arthur".into(), 3),
        ("kingdom_informant".into(), 3),
        ("clumsy_apprentice".into(), 3),
        ("sable_remnant".into(), 2),
        ("blazing_throw".into(), 2),
        ("red_hare".into(), 2),
        ("march_hare".into(), 2),
    ]);
    let mut hand_ticks = Vec::new();
    let result = evaluate_with_hand_progress(
        &DeckEvalRequest {
            deck,
            samples: 2,
            go_first: true,
            max_turns: 2,
            seed: 13,
            sim_type: SimType::MonteCarlo,
            rollouts: 3,
            budget: crate::budget::Budget {
                max_eval_rollouts: 3,
                ..crate::budget::Budget::default()
            },
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

            max_card_draw: None,
        },
        |_| ControlFlow::Continue(()),
        |progress| {
            hand_ticks.push(progress);
            ControlFlow::Continue(())
        },
    )
    .unwrap();
    assert_eq!(result.effective.rollouts, Some(3));
    let unique_indexes: std::collections::BTreeSet<_> =
        hand_ticks.iter().map(|tick| tick.sample_index).collect();
    assert!(
        !unique_indexes.is_empty(),
        "expected at least one hand progress sample_index"
    );
    for &index in &unique_indexes {
        let for_hand: Vec<_> = hand_ticks
            .iter()
            .filter(|tick| tick.sample_index == index)
            .copied()
            .collect();
        assert_eq!(
            for_hand.first().map(|tick| tick.phase),
            Some(HandPhase::Started),
            "hand {index} should start with Started, got {for_hand:?}"
        );
        assert_eq!(
            for_hand.last().map(|tick| tick.phase),
            Some(HandPhase::Done),
            "hand {index} should end with Done, got {for_hand:?}"
        );
        let rollouts: Vec<_> = for_hand
            .iter()
            .filter(|tick| tick.phase == HandPhase::Rollout)
            .map(|tick| tick.rollout)
            .collect();
        assert_eq!(
            rollouts,
            vec![1, 2, 3],
            "hand {index} rollouts: {rollouts:?}"
        );
    }
    let done_count = hand_ticks
        .iter()
        .filter(|tick| tick.phase == HandPhase::Done)
        .count();
    assert_eq!(done_count, unique_indexes.len());
}

#[test]
fn deck_eval_omits_per_rollout_event_tapes() {
    let deck = BTreeMap::from([
        ("arthur".into(), 3),
        ("kingdom_informant".into(), 3),
        ("clumsy_apprentice".into(), 3),
        ("sable_remnant".into(), 2),
        ("blazing_throw".into(), 2),
        ("red_hare".into(), 2),
        ("march_hare".into(), 2),
    ]);
    let result = evaluate_with_progress(
        &DeckEvalRequest {
            deck: deck.clone(),
            samples: 2,
            go_first: true,
            max_turns: 2,
            seed: 13,
            sim_type: SimType::MonteCarlo,
            rollouts: 3,
            budget: crate::budget::Budget {
                max_eval_rollouts: 3,
                ..crate::budget::Budget::default()
            },
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

            max_card_draw: None,
        },
        |_| ControlFlow::Continue(()),
    )
    .unwrap();
    for hand in &result.hands {
        let dist = hand.distribution.as_ref().expect("MC distribution");
        assert_eq!(dist.rollouts.len(), 3);
        assert!(
            dist.rollouts
                .iter()
                .all(|rollout| rollout.events.is_empty()),
            "deck eval should drop per-rollout tapes"
        );
        assert!(
            !hand.events.is_empty(),
            "P50 headline tape should still be present"
        );
        assert_eq!(dist.damages.len(), 3);
    }

    let solve = crate::solve(&SolveRequest {
        hand: result.hands[0]
            .hand
            .iter()
            .map(|id| (*id).to_string())
            .collect(),
        go_first: true,
        max_turns: 2,
        sim_type: SimType::MonteCarlo,
        deck,
        queue: None,
        rollouts: 3,
        seed: 13,
        budget: crate::budget::Budget {
            max_solve_rollouts: 3,
            ..crate::budget::Budget::default()
        },
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    })
    .unwrap();
    let dist = solve.distribution.as_ref().expect("MC distribution");
    assert!(
        dist.rollouts
            .iter()
            .any(|rollout| !rollout.events.is_empty()),
        "hand solve should retain per-rollout tapes"
    );
}

#[test]
fn card_stats_expose_damage_when_seen_sum() {
    let deck = BTreeMap::from([
        ("arthur".into(), 3),
        ("kingdom_informant".into(), 3),
        ("clumsy_apprentice".into(), 3),
    ]);
    let result = evaluate(&DeckEvalRequest {
        deck,
        samples: 4,
        go_first: true,
        max_turns: 2,
        seed: 11,
        sim_type: SimType::FireBrick,
        rollouts: 1,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    })
    .unwrap();
    for stat in &result.card_stats {
        if stat.seen > 0 {
            assert_eq!(
                stat.damage_when_seen,
                f64::from(stat.damage_when_seen_sum) / f64::from(stat.seen)
            );
        } else {
            assert_eq!(stat.damage_when_seen_sum, 0);
        }
        let buckets = stat.with_hand_samples + stat.without_hand_samples;
        if buckets > 0 {
            assert_eq!(buckets, result.samples as u32);
        }
    }
}

#[test]
fn heavy_hand_threads_are_capped_by_memory_budget() {
    // Max heavy hands is derived from total/reserve/hand_mem; Fire Brick
    // still gets the full CPU count.
    let heavy = hand_threads(SimType::MonteCarlo);
    assert!(heavy >= 1);
    assert!(heavy <= requested_threads());
    assert_eq!(hand_threads(SimType::FireBrick), requested_threads());
    assert_eq!(hand_threads(SimType::OracleOnly), heavy);
    assert_eq!(hand_threads(SimType::TwoPass), heavy);
}

#[test]
fn duplicate_opening_hands_keep_independent_sample_records() {
    let deck = BTreeMap::from([
        ("arthur".into(), 7),
        ("kingdom_informant".into(), 1),
        ("clumsy_apprentice".into(), 1),
    ]);
    let result = evaluate(&DeckEvalRequest {
        deck,
        samples: 8,
        go_first: true,
        max_turns: 1,
        seed: 1,
        sim_type: SimType::FireBrick,
        rollouts: 1,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    })
    .unwrap();
    assert_eq!(result.hands.len(), 8);
    // A 9-card deck with 7 Arthur copies repeats opening hands; each
    // sample still carries its own drawn-card list.
    for sample in &result.hands {
        assert_eq!(sample.hand.len(), 7);
    }
}

#[test]
fn serial_evaluate_save_keeps_finished_hands() {
    let deck = BTreeMap::from([
        ("arthur".into(), 3),
        ("kingdom_informant".into(), 3),
        ("clumsy_apprentice".into(), 3),
        ("sable_remnant".into(), 2),
        ("blazing_throw".into(), 2),
        ("red_hare".into(), 2),
        ("march_hare".into(), 2),
    ]);
    let request = DeckEvalRequest {
        deck,
        samples: 8,
        go_first: true,
        max_turns: 2,
        seed: 17,
        sim_type: SimType::FireBrick,
        rollouts: 1,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    };
    let flag = crate::cancel::new_flag();
    let result = evaluate_hands(
        &request,
        |progress| {
            if progress.sample >= 2 {
                crate::cancel::request_save(&flag);
            }
            ControlFlow::Continue(())
        },
        |_| ControlFlow::Continue(()),
        false,
        Some(flag.clone()),
        None,
    )
    .unwrap();
    assert!(result.samples >= 2);
    assert!(result.samples < 8);
    assert_eq!(result.hands.len(), result.samples);
    assert_eq!(result.damages.len(), result.samples);
}

#[test]
fn serial_evaluate_hard_cancel_discards_hands() {
    let deck = BTreeMap::from([
        ("arthur".into(), 3),
        ("kingdom_informant".into(), 3),
        ("clumsy_apprentice".into(), 3),
        ("sable_remnant".into(), 2),
        ("blazing_throw".into(), 2),
        ("red_hare".into(), 2),
        ("march_hare".into(), 2),
    ]);
    let flag = crate::cancel::new_flag();
    let error = evaluate_hands(
        &DeckEvalRequest {
            deck,
            samples: 8,
            go_first: true,
            max_turns: 2,
            seed: 17,
            sim_type: SimType::FireBrick,
            rollouts: 1,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

            max_card_draw: None,
        },
        |progress| {
            if progress.sample >= 2 {
                crate::cancel::request(&flag);
            }
            ControlFlow::Continue(())
        },
        |_| ControlFlow::Continue(()),
        false,
        Some(flag.clone()),
        None,
    )
    .expect_err("hard cancel should discard finished hands");
    assert!(matches!(error, EngineError::Cancelled));
}

#[test]
fn truncate_draw_queue_caps_known_draws() {
    use crate::model::truncate_draw_queue;
    let queue = vec![
        Card::Arthur,
        Card::RedHare,
        Card::MarchHare,
        Card::BlazingThrow,
    ];
    assert_eq!(truncate_draw_queue(queue.clone(), None).len(), 4);
    assert_eq!(truncate_draw_queue(queue.clone(), Some(0)).len(), 4);
    assert_eq!(truncate_draw_queue(queue.clone(), Some(2)).len(), 2);
    assert_eq!(
        truncate_draw_queue(queue, Some(2)),
        vec![Card::Arthur, Card::RedHare]
    );
}

#[test]
fn effective_glimpse_forces_off_for_fire_brick() {
    use crate::model::effective_glimpse;
    assert!(!effective_glimpse(SimType::FireBrick, false, Some(true)));
    assert!(!effective_glimpse(SimType::TwoPass, true, Some(true)));
    assert!(effective_glimpse(SimType::OracleOnly, false, None));
    assert!(!effective_glimpse(SimType::OracleOnly, false, Some(false)));
}

#[test]
fn deck_eval_accounts_for_timed_out_samples() {
    let deck = BTreeMap::from([
        ("arthur".into(), 3),
        ("kingdom_informant".into(), 3),
        ("clumsy_apprentice".into(), 3),
        ("sable_remnant".into(), 2),
        ("blazing_throw".into(), 2),
        ("red_hare".into(), 2),
        ("march_hare".into(), 2),
    ]);
    let outcome = evaluate(&DeckEvalRequest {
        deck,
        samples: 4,
        go_first: true,
        max_turns: 3,
        seed: 17,
        sim_type: SimType::OracleOnly,
        rollouts: 1,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: Some(1),
        max_card_draw: None,
    });
    match outcome {
        Ok(result) => {
            assert_eq!(result.samples + result.timed_out_samples, 4);
        }
        Err(EngineError::InvalidRequest(_)) => {}
        Err(other) => panic!("unexpected evaluate error: {other}"),
    }
}

#[test]
fn deck_eval_all_hands_timeout_errors() {
    let deck = BTreeMap::from([
        ("arthur".into(), 3),
        ("kingdom_informant".into(), 3),
        ("clumsy_apprentice".into(), 3),
        ("sable_remnant".into(), 2),
        ("blazing_throw".into(), 2),
        ("red_hare".into(), 2),
        ("march_hare".into(), 2),
    ]);
    let error = evaluate(&DeckEvalRequest {
        deck,
        samples: 2,
        go_first: true,
        max_turns: 3,
        seed: 17,
        sim_type: SimType::OracleOnly,
        rollouts: 1,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: Some(1),
        max_card_draw: None,
    })
    .unwrap_err();
    assert!(matches!(error, EngineError::InvalidRequest(_)));
}
