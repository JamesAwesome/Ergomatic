> **Archived 2026-08-28** from `ROADMAP.md` (lines 137-150 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 5A — Library & baselines

**Status:** Done (2026-07-29, PR #22)
**Goal:** Enter real baselines and start transcribing The Erg Book.

- [x] Design-token CSS foundation (paper palette, Newsreader/Archivo/IBM Plex Mono, 2 px radii, spacing scale) + bottom tab shell — fonts self-hosted via @fontsource (offline-capable native shell, no CDN)
- [x] Library screen: rows with **5-segment** pain bars, filter chips (type single-select toggle, duration multi-select union, `PAIN ≤3`, RECENT/NOT RECENT exclusivity, ALL clears); chips read EASY/MEDIUM/HARD; library counter is a plain count (no /375)
- [x] Workout detail: resolved ranges, ▲▼ per-step nudges (session-local, never persisted), derived duration
- [x] **You** — staged baseline editor (drafts, − = faster, 0.5 s steps, Discard/Apply confirm block)
- [x] App icon; iOS safe areas (`viewport-fit=cover` + `env(safe-area-inset-*)`) so the UI clears the notch and home indicator
- [x] `GET /api/workouts` gains `lastDoneDaysAgo` (additive; reuses the existing grouped query — no N+1)

**Exit:** Pace resolution verified end to end against real baselines and deployed. The literal `6k -2 @ 22 SPM` case moved to 5B — it needs the Builder, since no seeded workout carries a negative 6k offset.
