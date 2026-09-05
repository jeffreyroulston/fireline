# Play decks — confirmed intent

Confirmed 2026-09-05 via interview-me.

## Intent

- **Outcome:** Dedicated deck builder in `apps/play` for main + material decks (create / edit / delete), using the same list format as the sim Manage builder.
- **User:** Play-app players building decks for solo and duel setup.
- **Why now:** Setup could only pick/paste; play needs its own decks, not workbench/sim ones.
- **Success:** From setup → Manage decks → CRUD main and material → Done → start with a play deck. Sim `decks` / `material_decks` stay untouched.
- **Constraint:** Separate DB tables (`play_decks`, `play_material_decks`) and API (`/play-decks*`, `/play-material-decks*`); reuse `@ga-fire/game` parse/format and sim panel layout patterns.
- **Out of scope:** Sim run-locks / deck-hash eval; sharing with workbench; duplicate as first-class; auth/accounts beyond what play already uses.

## Surfaces

- API: `/play-decks*`, `/play-material-decks*`
- Play: setup “Manage decks” → `DeckBuilderScreen` → back to setup picker
