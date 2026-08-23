/** Phase BL PR C — the questionnaire's 16-cell estimate table
 *  (baseline-onboarding spec rev 2, "The estimate table's grounding").
 *
 *  Two transient answers (experience x cardio — never stored, never sent;
 *  the minimal-PII ruling) look up a recommended starting pair of baseline
 *  splits. The table is static and hand-authored, cell by cell, because
 *  the honest grounding is COARSE: no primary source publishes splits axed
 *  by experience x cardio (Concept2's rankings are axed by age/sex/weight
 *  over a self-selected racing population — the wrong axes AND the wrong
 *  population, which is why rev 1's PRIMARY claim was withdrawn at the
 *  phase-open gates). What the secondary literature does support:
 *
 *  - Beginners' steady splits typically land 2:30-3:00/500m, improving
 *    quickly with fitness (SECONDARY: UCanRow2, "Rowing Split Times
 *    Explained", https://ucanrow2.com/rowing-split-times-explained/ ;
 *    Torokhtiy, "What Is Good Rowing Pace",
 *    https://torokhtiy.com/blogs/guides/what-is-a-good-rowing-pace
 *    gives beginners 2:30-2:45).
 *  - A beginner 2K of 2:00/500m or slower (men) / 2:15 or slower (women)
 *    is a normal start (SECONDARY: ErgMonkey alone,
 *    https://ergmonkey.com/2025/01/beginners-guide-to-reading-rowing-performance-charts/ ).
 *    Torokhtiy separately places INTERMEDIATE rowers at 2:00-2:30
 *    (SECONDARY, same guide as above); RowingCrazy gives only the
 *    2:30-3:00 initial band and no beginner-2K number — attributed
 *    per source, not bundled (triad review F5).
 *  - Concept2's own blog ("500m Split. What does it mean?",
 *    https://www.concept2.com/blog/500m-split-what-does-it-mean ) anchors
 *    2:00/500m as the pace of a competitive ~8:00 2K goal — i.e. genuinely
 *    QUICK, not a starting point. (Checked 2026-08-23: contrary to the
 *    spec's own citation, that post carries no 2:15-2:30 range; the range
 *    survives on the other secondary sources above.)
 *
 *  From that, a STATED CONSERVATIVE BIAS (the spec's ruling): a too-slow
 *  estimate self-corrects at the rower's first test (they feel underworked,
 *  and the post-test prompt offers the measured number); a too-fast
 *  estimate writes targets the rower cannot hold, which is harmful. So the
 *  2k column spans exactly the recreational band 2:30 down to 2:15
 *  (RECREATIONAL_FAST_END_SECONDS), quantized to 5s steps — an estimate
 *  with finer precision would be false precision — and only the one
 *  cell whose answers assert real training ("a lot" + "training hard")
 *  drops below the band, and even then conservatively (2:10/500m ~ an
 *  8:40 2K; a genuinely trained rower's first test corrects it upward
 *  fast). INFERENCE tags mark every cell interpolated between the
 *  sourced anchors — which is most of them, stated per cell below.
 *
 *  The k2/k6 gap is K2_K6_OFFSET_SECONDS (7s) in EVERY cell — the
 *  constants reconciliation the spec demands (the repo held three answers:
 *  this table, the 7s derive offer, and the editor's old 112/122 seeds
 *  with their 10s gap). 7s is kept, not changed: it is within range of
 *  Paul's Law (+5s/500m per doubling of distance; 2k->6k is log2(3) ~ 1.58
 *  doublings ~ +7.9s — SECONDARY heuristic, based on trained rowers:
 *  https://www.c2forum.com/viewtopic.php?t=7708 ), it is what the shipped
 *  derive OFFER already tells rowers ("-7s"/"+7s" in the editor's own
 *  copy), and no source grounds a better per-population gap. The editor's
 *  seeds are re-derived from this table's most-common cell
 *  (mostCommonEstimate below), collapsing the three answers to one family.
 *
 *  Pure domain: no framework imports, no I/O. The QUESTION COPY (the
 *  canvas's option labels) lives with the client; only the closed key
 *  unions live here. */

export const EXPERIENCE_LEVELS = [
  "never",
  "a-little",
  "regularly",
  "a-lot",
] as const;
export type Experience = (typeof EXPERIENCE_LEVELS)[number];

export const CARDIO_LEVELS = [
  "starting",
  "1-2-week",
  "most-days",
  "training-hard",
] as const;
export type Cardio = (typeof CARDIO_LEVELS)[number];

export interface BaselineEstimate {
  k2Seconds: number;
  k6Seconds: number;
}

/** 2:15/500m — the fast end of the secondary recreational band (see the
 *  header). No cell estimates a 2k faster than this unless the rower
 *  answered "a lot" AND "training hard"; the exit-criteria test pins it. */
export const RECREATIONAL_FAST_END_SECONDS = 135;

/** k6 riding k2 + K2_K6_OFFSET_SECONDS (7) in every cell — asserted by
 *  test against the imported constant, restated literally here so each
 *  cell reads as the pair the rower will actually be offered.
 *
 *  Population notes per row (source tags per the header's citations):
 *  - "never" (never rowed, or once or twice): the UCanRow2/Torokhtiy
 *    beginner band's faster half, because these are TARGET-SETTING
 *    baselines, not first-session paces — a 2:30 2k baseline prices even
 *    EASY near the beginner's actual steady pace. SECONDARY anchor at
 *    2:30, INFERENCE for the cardio spread (no source crosses beginner
 *    technique with cardio level).
 *  - "a-little" / "regularly": INFERENCE — interpolated between the
 *    beginner anchor and the recreational fast end; technique familiarity
 *    is worth roughly one 5s step per level, same as a cardio level.
 *  - "a-lot" (raced or trained, possibly lapsed): the recreational fast
 *    end, SECONDARY (inside Torokhtiy's 2:00-2:30 intermediate band and
 *    at ErgMonkey's beginner-women 2:15 mark, conservatively — per-source
 *    per the header); the one exempt cell (2:10) is
 *    INFERENCE with the stated conservative bias — a returning trained
 *    rower's real 2k is likely faster, and the first test corrects it. */
export const ESTIMATE_TABLE: Record<
  Experience,
  Record<Cardio, BaselineEstimate>
> = {
  never: {
    // 2:30 / 2:37 — SECONDARY (beginner band, conservative edge).
    starting: { k2Seconds: 150, k6Seconds: 157 },
    // 2:30 / 2:37 — INFERENCE: light activity does not yet move an
    // untrained stroke; technique caps the pace before cardio does.
    "1-2-week": { k2Seconds: 150, k6Seconds: 157 },
    // 2:25 / 2:32 — INFERENCE: fit but new to the stroke; one step.
    "most-days": { k2Seconds: 145, k6Seconds: 152 },
    // 2:25 / 2:32 — INFERENCE: even training-hard cardio is capped by a
    // brand-new stroke (erg pace is technique-bound at this end).
    "training-hard": { k2Seconds: 145, k6Seconds: 152 },
  },
  "a-little": {
    // 2:30 / 2:37 — INFERENCE: knows the stroke, cardio just starting;
    // the beginner anchor still governs.
    starting: { k2Seconds: 150, k6Seconds: 157 },
    // 2:25 / 2:32 — INFERENCE: one technique step + one cardio step off
    // the anchor, folded into one 5s quantum.
    "1-2-week": { k2Seconds: 145, k6Seconds: 152 },
    // 2:25 / 2:32 — INFERENCE, as above.
    "most-days": { k2Seconds: 145, k6Seconds: 152 },
    // 2:20 / 2:27 — INFERENCE: solid cardio, familiar stroke.
    "training-hard": { k2Seconds: 140, k6Seconds: 147 },
  },
  regularly: {
    // 2:25 / 2:32 — INFERENCE: an on-and-off rower restarting.
    starting: { k2Seconds: 145, k6Seconds: 152 },
    // 2:25 / 2:32 — INFERENCE.
    "1-2-week": { k2Seconds: 145, k6Seconds: 152 },
    // 2:20 / 2:27 — INFERENCE: regular stroke + regular activity.
    "most-days": { k2Seconds: 140, k6Seconds: 147 },
    // 2:20 / 2:27 — INFERENCE: held at the same step; "regularly, on and
    // off" self-describes inconsistency the estimate should not outrun.
    "training-hard": { k2Seconds: 140, k6Seconds: 147 },
  },
  "a-lot": {
    // 2:20 / 2:27 — INFERENCE: raced or trained once, but cardio
    // restarting; the lapsed-rower case, kept inside the band.
    starting: { k2Seconds: 140, k6Seconds: 147 },
    // 2:20 / 2:27 — INFERENCE.
    "1-2-week": { k2Seconds: 140, k6Seconds: 147 },
    // 2:15 / 2:22 — SECONDARY (the recreational fast end itself; inside
    // Torokhtiy's 2:00-2:30 intermediate band, at ErgMonkey's 2:15 mark).
    "most-days": { k2Seconds: 135, k6Seconds: 142 },
    // 2:10 / 2:17 — INFERENCE, the ONE cell allowed past the band
    // (experience=a-lot AND cardio=training-hard, the spec's own
    // exemption): still ~30s/500m slower than a competitive 2K pace,
    // because the first test corrects a slow guess for free.
    "training-hard": { k2Seconds: 130, k6Seconds: 137 },
  },
};

/** The recommended pair for one pair of questionnaire answers. Total by
 *  construction (Record over both closed unions); the test pins totality
 *  at runtime too. */
export function estimateFor(
  experience: Experience,
  cardio: Cardio,
): BaselineEstimate {
  return ESTIMATE_TABLE[experience][cardio];
}

/** The modal {k2,k6} pair of `table` — the single source the editor's
 *  seeds derive from (the constants reconciliation: seeds are no longer a
 *  second, hand-typed answer to "what does a rower we know nothing about
 *  row"; they are this table's most common cell). Ties break toward the
 *  SLOWER pair, the same conservative bias every cell carries. Takes the
 *  table as a parameter so the tie-break is testable without a second
 *  real table. */
export function mostCommonEstimate(
  table: Record<Experience, Record<Cardio, BaselineEstimate>>,
): BaselineEstimate {
  const counts = new Map<string, { cell: BaselineEstimate; n: number }>();
  for (const experience of EXPERIENCE_LEVELS) {
    for (const cardio of CARDIO_LEVELS) {
      const cell = table[experience][cardio];
      const key = `${cell.k2Seconds}/${cell.k6Seconds}`;
      const entry = counts.get(key);
      if (entry) {
        entry.n += 1;
      } else {
        counts.set(key, { cell, n: 1 });
      }
    }
  }
  let best: { cell: BaselineEstimate; n: number } | null = null;
  for (const entry of counts.values()) {
    if (
      best === null ||
      entry.n > best.n ||
      (entry.n === best.n && entry.cell.k2Seconds > best.cell.k2Seconds)
    ) {
      best = entry;
    }
  }
  // `best` cannot be null: both unions are non-empty, so the loops above
  // always populate at least one entry.
  return best!.cell;
}

/** The one real table's modal pair: 2:25 / 2:32. `BaselineEditor`'s
 *  SEED_K2/SEED_K6 read these (the reconciliation's second half). */
export const MOST_COMMON_ESTIMATE: BaselineEstimate =
  mostCommonEstimate(ESTIMATE_TABLE);
