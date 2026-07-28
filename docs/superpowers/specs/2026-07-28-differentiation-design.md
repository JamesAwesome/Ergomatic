# Differentiation from Source Material — Design

Approved 2026-07-28, before Phase 4 began (nothing affected is built yet, so
this is spec-only). Motivation: Ergomatic should stand on its own as a
product, with clean IP posture for any future distribution. Not legal advice;
the guardrails below are the conservative, common-sense line.

## Decisions

| Question | Decision |
|---|---|
| Pain scale | **1–5** (was 1–10 in the handoff/book). Displays as `PAIN n/5`; library filter chip becomes `PAIN ≤3`; library rows use a **5-segment** pain bar (type-color fill, same geometry family as the handoff's 10-segment) |
| Pain pickers | Five 44px cells with **custom minimal SVG faces** — ink-weight strokes in the paper style, filled with a **muted green→red ramp** (5 hexes chosen at implementation, AA-verified, documented as a deliberate palette extension). Numerals ALWAYS beside faces — never smiley-only (a11y + the design's mono-numeral DNA) |
| Transcription mapping (pain) | Book 1–10 → `ceil(n/2)`: 1–2→1, 3–4→2, 5–6→3, 7–8→4, 9–10→5 |
| Difficulty | Enum `'easy' \| 'medium' \| 'hard'`; UI reads EASY / MEDIUM / HARD (was Introductory/Moderate/Advanced). Transcription 1:1 |
| Shipped content | **Original generated starter library** (~30–40 workouts) seeds every NEW account at creation (Phase 4). Users can edit/delete; it's their copy |
| Content guardrails | Starter workouts are generated from public training methodology (interval structures per AN/O₂/AT/TR, standard work:rest ratios, community-canon pieces like 4×2k / 8×500m / pyramids / steady state) with an ORIGINAL naming scheme, original composition, and a deliberately different scale (≈35, not 375). NEVER reproduce the book's curated list, titles, or prose descriptions. "The Erg Book" is never named in UI, store copy, or marketing — private repo docs only |
| Personal transcription | Unchanged: users may enter workouts from their own book copies for personal use; the builder + bulk import exist for exactly that |
| Future differentiator | **Parametric workout generator** ("generate me a 45' AT workout") — roadmap follow-on, not scheduled. The starter set's authoring parameters become its seed rules |
| Sharing | Private JSON export/import of a user's own library — backlog follow-on |

## Starter library composition requirements (Phase 4 authoring task)

- ~35 workouts covering: all four types × Easy/Medium/Hard × time bands
  (<30′, 30–45′, 45–60′, 60′+), including both time-based and
  distance-based work steps (exercising the full step model).
- Structures drawn from standard training science: AN = 30–90s intervals at
  ~1:4–1:5 work:rest; O₂ = steady state 30′+; AT = threshold intervals
  ~1:1–1:2; TR = sprint pieces ~1:3; plus community-canon pieces.
- Original naming scheme (short, evocative, ours — no book titles).
- Each carries pain 1–5 and easy/medium/hard per the new scales.
- Authored as reviewable data (one file), James reviews before it ships;
  seeded per-user on account creation; deleting/editing affects only that
  user's copy.
- The prototype's 11 sample workouts (book-derived names) are dev-only and
  get replaced by this set everywhere.

## Where recorded

- `docs/design/DEVIATIONS.md` — deliberate deltas from the design handoff so
  Phase 5/6 implementers don't faithfully regress them.
- ROADMAP.md amendments: Phase 4 (scales + starter seeding), Phase 5
  (5-segment bar, EASY/MEDIUM/HARD chips, PAIN ≤3), Phase 6 (smiley picker
  in log), Phase 9 (prefs chip rename), follow-ons (generator, import/export).

## Out of scope

Any change to pace math, step model, plan sequences, or the PM5/Capacitor
work. App Store submission itself (internal TestFlight needs none of this
urgently — this is done now because it's the cheapest moment).
