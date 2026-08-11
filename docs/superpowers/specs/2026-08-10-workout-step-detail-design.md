# Workout step detail on Today and Library

**Date:** 2026-08-10
**Design authority:** the `workout_hints` handoff packet (README +
`Workout steps final.dc.html`), decisions 1-9 and its token/type table.
The packet's four open questions were ruled by James this session:
repeats EXPAND per piece on Today; effort pieces render their words;
mixed-frame structure lines NAME each frame; distance pieces show the
split target only. The two remaining open questions became build-time
verifications (§7). An antagonistic pass (10 blocking findings,
`.superpowers/sdd/step-detail-spec-review.md`) reshaped §§1-2; its one
amendment to the handoff itself is flagged as **DEVIATION** in §2 for
James's veto.

## What this builds

Step detail on the two scanning surfaces, per the handoff's decision 1:
Today prints the pieces (a row per piece inside the suggestion card);
Library states the structure (one generated line per row). Nothing
changes on the workout detail screen, the builder, or connected mode.

## Evidence base (read this session; antagonistic pass re-verified every citation)

- Today's card is one `<Link className="today-card">`
  (`app/src/today/Today.tsx:1046`); `recommended` already carries full
  `steps` (`Today.tsx:797-799`). **The card never renders without both
  baselines** — `Today.tsx:962`'s `needsBaselineCard` swaps the entire
  suggestion region for BaselineCard while either baseline is null, so
  the piece rows may assume concrete `Baselines`.
- Library rows are two lines (`app/src/library/WorkoutRow.tsx:24-47`)
  and `GET /api/workouts` already returns full `steps[]` for every row
  (`app/server/routes/data.ts:423-434`) — zero API change.
- `phases()` (`app/domain/expand.ts:108-208`) expands reps with
  `set: {index, of}` and resolved targets, but **throws on split-ref
  steps with null baselines** (`expand.ts:175-179`) — so the Library
  line must NOT be built on it (§1). `estimateMinutes`
  (`expand.ts:235-264`) sums work AND rest, never warm-up.
- Formatting: `fmtSplit` (`app/domain/format.ts:2-8`), `fmtDuration`
  (`domain/duration.ts:109-126`), `refLabel` (`domain/pace.ts:104-108`,
  the `−` U+2212 idiom), `effortWord` (`pace.ts:39-41`).
- Design-sweep constraints: small mono labels ≥4.5:1
  (`design.spec.ts:832-836`); tap targets ≥44px (`:791-795`). The
  piece region adds NO interactive elements. Contrast computed by the
  antagonistic pass: `--ink-3` #57544c on the three tints = 6.93 /
  6.40 / 6.39; `--accent` on them = 5.54 / 5.12 / 5.11 — all pass.
  The mock's `#a29b8a` row numerals compute 2.54:1 and are REPLACED
  by `--ink-3` (§4).

## §1 — the domain module (`app/domain/display/stepDetail.ts`)

Pure, no framework imports. Two exports with DIFFERENT baseline
contracts:

**`pieceList(steps: Step[], baselines: Baselines): PieceRow[]`** —
the Today card's rows. Concrete `Baselines` (the card cannot render
without them, evidence above). Built on `phases()` filtered to
work+test phases; a rest phase's seconds attach to the preceding
piece.

```ts
interface PieceRow {
  duration: string;        // "18:00" (fmtDuration) or "500m"; a test
                           // piece prints its label ("All out") here
  refTextFull: string | null;    // "at 6k +10" / "at 6k pace"; the
                                 // two-line rows' form (mocks name the
                                 // base there even when shared)
  refTextCompact: string | null; // "at +10" when the set shares one
                                 // base (the compressed rows' form);
                                 // "at 6k pace" at offset 0; equals
                                 // refTextFull for mixed bases; null
                                 // for effort and test pieces
  effortText: string | null; // "ALL OUT" / "EASY" in the pace slot
                           // for effort pieces; test pieces show
                           // nothing there
  restText: string | null; // "2′ r" whole minutes, else fmtDuration
                           // ("2:30 r"); null when no rest follows
  split: string | null;    // "2:15.0" via resolveSplit+fmtSplit;
                           // null for effort/test pieces
  spm: number | null;
  off: number | null;      // signed offset for split pieces (peak math)
}
// The tint is not a row field: `peakIndex(rows, visibleCount)` returns
// the tinted index or null (peak behind the cap / all-effort), and
// `workAndTotal(steps, baselines)` feeds the summary foot — see §2.
```

**`structureLine(steps: Step[]): string`** — the Library line. Takes
authored steps ONLY, never `phases()` and never baselines: offsets
come from the authored refs, durations from the authored steps, the
reps marker is interpreted structurally (repeat count × body). It must
be total over every parseable workout — a fresh no-baseline user scans
the same 300 lines as anyone else.

Formats, in precedence order (handoff decision 8 + rulings + the
pass's repairs):

1. single piece — `10:00 @ 6K+14`
2. uniform repeats — `3 × 5:00 @ 6K+10 · 2′ REST` — when the repeated
   body is ONE work piece (with or without its rest), or when the
   authored pieces are N identical work steps (identical duration,
   ref, spm; rest equality not required for identity — the rest
   clause rule below governs what is claimed about rest)
3. two unequal pieces — `18:00 + 9:00 @ +10 → +6 · 3′ REST`
4. longer sets, expanded count ≤ 8 — duration chain + offset range:
   `2-4-6-8-6-4-2 @ +6 → 6K · 2′ REST`. Chain tokens: whole minutes
   bare (`4`), fractional as fmtDuration (`4:30`).
5. longer than 8 expanded pieces (and not format 2) — count fallback:
   `12 PIECES @ +8 → +2 · 2′ REST` (a 24-piece chain states less
   than a count does)
6. mixed frames (James's ruling) — each segment names its base:
   `4:00 @ 2K+4 + 10:00 @ 6K+8 · 2′ REST`; effort pieces print their
   chip word (`5:00 @ MAX`); a set containing a `test` step falls back
   to format 5's count form (test pieces have no duration to chain)
7. distance — `8 × 500m @ 6K−4 · 1′ REST`

**Offset range rule** (the pass's finding 5): the range runs from the
LARGEST offset to the SMALLEST (slowest to fastest pace), independent
of piece order: `@ +6 → 6K` (zero renders as the bare base, per the
mock). Equal endpoints collapse to a single `@ 6K+N`. Mixed-sign
ranges render both signs (`@ +4 → −2`). This reproduces both mock
examples and is total over non-monotonic sets.

**Rest clause rule:** `· N′ REST` (whole minutes; fmtDuration
otherwise) appears once, only when every inter-piece rest is equal;
unequal rests drop the clause entirely. No named shapes anywhere
(decision 9).

**Testing:** domain, 100% pinned, heaviest here: every format branch,
the precedence boundaries (2-vs-4, 4-vs-5 at exactly 8, reps-body-of-
one vs multi-piece body), offset-range (non-monotonic, mixed-sign,
collapse), fractional tokens, unequal rests, effort/test/distance,
and a property test over ALL 300 real `LIBRARY_WORKOUTS` (fixture
rule): every line non-throwing, non-empty, free of `undefined`/`NaN`,
and matching one of the seven format shapes by regex.

## §2 — the Today card region

Between the meta line and the foot, inside the existing Link. All
rows are non-interactive text (the card stays ONE link; nothing
nests).

- **≤4 pieces:** two-line rows — `01  18:00 at 6k +10, 3′ r   2:15.0`
  with `22 SPM` beneath.
- **≥5 pieces:** one-line rows, SPM inline before the split.
- **Peak piece:** among VISIBLE split-ref rows only, the min `|off|`;
  ties → the later row (the mock tints 04 of its symmetric pyramid).
  If the true peak is behind the cap, or the set is all-effort, NO
  row is tinted — zero-tint is a legal state (pass finding 7; 119/300
  workouts would otherwise tint a wrong row).
- **Cap:** four piece rows, then the 44px `+N more pieces` row with
  the first three unseen durations (`6:00 · 4:00 · 2:00`, then `…` if
  more) and `›`. Visual only; the card's own tap opens detail.
- **DEVIATION from handoff decision 3 (James to veto):** the last
  piece SHOWS its rest when the data carries one. 158/300 library
  workouts author a trailing rest, and the timer/PM5 actually runs
  it — hiding it would misstate the session AND break the foot's
  arithmetic (WORK + visible rests would differ from TOTAL on more
  than half the library). The handoff's "absence of rest marks the
  set's end" signal still holds exactly where it was designed: on
  workouts authored without trailing rest.
- **Summary foot:** `27′ WORK · 30′ TOTAL`, plus `· 7 PIECES` only
  when capped. WORK = work phases only; TOTAL = the same
  `estimateMinutes` number as the duration chip. With the deviation
  above, WORK plus displayed rests equals TOTAL on every workout.
- **Effort pieces:** `ALL OUT` / `EASY` in the pace slot (James's
  ruling). No-baseline handling does not exist on this surface
  (unreachable, evidence above) — no foot link, nothing nested.
- **Foot row:** the full `suggestion.reason` string (unchanged,
  `suggest.ts` owns it — real strings run ~100 chars) left, Archivo
  13px as today, wrapping allowed, flex with a no-shrink mono
  `OPEN ›` right; the `.today-card-reason` line is absorbed into
  this strip.

## §3 — the Library row line

Line 2 of 3: `structureLine(...)` in IBM Plex Mono 11px, `--ink-2`
(#3f3c35 — token verified present). One line, `text-overflow:
ellipsis`, no wrap. Format 5's count fallback keeps chronic
ellipsizing rare by construction.

## §4 — colour and type

Existing tokens: `#f4f1e8` `--page`, `#fffdf7` `--card`, `#57544c`
`--ink-3`, `#3f3c35` `--ink-2`, `#b5341f` `--accent`, `#1b1a17`
`--ink`. New semantic tokens for the three region tints (absent
today): `--step-region` #f8f5ec, `--step-peak` #f1ecdd, `--step-foot`
#efece1. One theme exists (verified) — no dark variants owed.

Typography pinned per element (the mock HTML is the authority; its
README's "durations always mono" describes the split column and
Library line, not the row text — pass finding 9): piece-row text
(duration + ref + rest) Archivo 15px two-line / 14px one-line; row
numerals, SPM, splits, foot, `+N more` sub-line, Library structure
line all IBM Plex Mono. Row numerals use `--ink-3`, NOT the mock's
`#a29b8a` (2.54:1, fails). Splits and durations in `--accent`
(≥5.11:1 on every tint, computed).

## §5 — what does not change

The workout detail screen (authored steps + ×N marker — deliberately
NOT the expanded view), the builder, connected mode, `suggest()`'s
reason strings, the duration chip's number, every API, warm-up
display (none of these surfaces shows it).

## §6 — testing beyond the domain module

- Client: Today card with 2 pieces (two-line rows, no count in foot),
  7 pieces (compressed, cap, `+3 more`, count in foot, trailing-rest
  arithmetic), effort workout (words, zero tint), distance workout,
  peak-behind-cap (zero tint), real library fixtures throughout.
- e2e: Today's piece region against seeded data (a split like `2:`
  visible; `+3 more pieces` on a seeded 7-piece workout); Library
  first row's middle line non-empty; ink-4 and tap-target sweeps
  green.
- Screenshots: `today.png` recaptured, new `today-capped.png` (seven
  pieces), `library.png` recaptured. Open each and describe it.

## §7 — build-time verifications (the handoff's remaining questions)

1. **375-wide:** capture the capped card at 375×812; the card plus
   the `LAST THREE` heading must fit the first screenful, else the
   cap drops to three on that viewport via media query, stated in
   the PR.
2. **Detail at 7+ pieces:** confirm the detail screen scrolls
   acceptably with the seeded 7-piece workout (normal page scroll;
   formality, in the PR body).

## Out of scope, recorded

Named shapes; estimated distance on time pieces; nested scrolling /
the pinned-scroller alternative; detail adopting the expanded view;
warm-up display; dark theme tokens.
