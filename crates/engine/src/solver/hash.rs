//! Opening-hand hashing and labels for memoization.

use crate::cards::Card;
use sha2::{Digest, Sha256};

pub fn opening_hand_hash(hand: &[Card]) -> String {
    let mut ids: Vec<&str> = hand.iter().map(|card| card.id()).collect();
    ids.sort_unstable();
    let digest = Sha256::digest(ids.join(",").as_bytes());
    hex_lower(&digest)
}

pub(crate) fn opening_hand_label(hand: &[Card]) -> String {
    let mut ids: Vec<&str> = hand.iter().map(|card| card.id()).collect();
    ids.sort_unstable();
    ids.join(",")
}

pub(crate) fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}
