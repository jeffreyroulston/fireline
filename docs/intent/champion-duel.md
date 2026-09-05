# Champion duel — confirmed intent

Confirmed 2026-09-05 via interview-me. V2 engine-prep locked 2026-09-05. V3 dual-board combat locked 2026-09-05.

## Intent

- **Outcome:** Networked 1v1 duel — own deck, own board, opposite sides; alternate turns. Attacks hit far-side champion/allies with engine-owned declare → optional retaliate → damage (v3). Solo/Spirit uses the same combat resolve path with a synthetic champion opponent.
- **User:** Two people on two computers via `apps/play`.
- **Why now:** Duel feel without full GA multiplayer yet; keep rules engine-owned as combat grows.
- **Success (v1):** Create/join; both ready with own decks; only active seat acts on their board; Pass ends turn; first to drop opponent champion life to 0 wins.
- **Success (v2):** Engine accepts actor state + opponent public view; returns legal attack targets (stealth / taunt / true sight); Full offers per-ally attacks; hub/play only forward states — no targeting rules in TypeScript.
- **Success (v3):** Declare one attacker vs champion/ally; if defender ally may retaliate (awake, power > 0), defender chooses rest-to-retaliate or skip; simultaneous damage; ally destroy; champion life ≤ 0 wins. Solo calls the same declare+resolve API (retaliate false). Hub stores pending combat only — no damage math in TypeScript.
- **Constraint:** Same FiZa Full engine per seat as solo; rules exclusively in the engine; SolverReduced heuristics stay search-only.
- **Out of scope (v1):** Hotseat/shared line, Spirit as duel objective, ally targeting, real GA priority stack, workbench multiplayer.
- **Out of scope (v3 → v4):** Intercept; Opportunity / Effects Stack mid-combat; domains; multistrike; champion retaliation.

## Architecture note

Two independent engine states under a server room. V1 remapped Spirit damage → champion life. V2 added `OpponentView` + `legal_attack_targets`. V3 replaces attack remapping with `combat/declare` + `combat/resolve` mutating both boards (ally-only retaliation choice).

## Surfaces

- API: `/game/v1/duels*` (create / join / rejoin / ready / start / action / combat/declare / combat/retaliate / events)
- API: `/game/v1/legal-targets` (actor + opponent public view → legal attack targets)
- API: `/game/v1/combat/{declare,resolve}` (dual-state combat; solo + duel)
- Play lobby: Create duel / Join / Solo; rejoin cookie
- Ego board: you near, opponent far; watch-only when not controller; retaliate prompt when defender
- Auth: opaque `clientId` + `X-Game-Client-Id` (SSE uses `?clientId=`)
