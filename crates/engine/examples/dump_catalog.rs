//! Dump the engine card catalog as JSON (for TS / API seed sync).

use ga_fire_engine::cards::{ALL_CARDS, CATALOG, CardDef};
use ga_fire_engine::version::ENGINE_VERSION;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DumpCard {
    #[serde(flatten)]
    def: CardDef,
    aliases: &'static [&'static str],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DumpPayload {
    card_digest: String,
    cards: Vec<DumpCard>,
}

fn main() {
    let cards: Vec<DumpCard> = ALL_CARDS
        .iter()
        .copied()
        .map(|card| {
            let entry = &CATALOG[card.index()];
            DumpCard {
                def: CardDef::from_entry(entry),
                aliases: entry.aliases,
            }
        })
        .collect();
    let payload = DumpPayload {
        card_digest: ENGINE_VERSION.card_digest.to_string(),
        cards,
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&payload).expect("serialize")
    );
}
