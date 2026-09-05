# Champion duel — confirmed intent

Confirmed 2026-09-05 via interview-me.

## Intent

- **Outcome:** Networked 1v1 duel — own deck, own board, opposite sides; alternate turns; FiZa damage hits opponent champion life.
- **User:** Two people on two computers via `apps/play`.
- **Why now:** Duel feel without real GA multiplayer rules yet.
- **Success:** Create/join; both ready with own decks; only active seat acts on their board; Pass ends turn; first to drop opponent champion life to 0 wins.
- **Constraint:** Same FiZa Full engine per seat as solo; v1 champion-life only; architecture is two seats + cross-seat effect hook for v2+.
- **Out of scope (v1):** Hotseat/shared line, Spirit as duel objective, ally targeting, real GA priority stack, workbench multiplayer.

## Architecture note

Build server rooms with **two independent engine states** and an explicit `applyCrossSeatEffects` boundary so v2 (ally targeting, pass opportunity) can extend without rewriting create/join/SSE.
