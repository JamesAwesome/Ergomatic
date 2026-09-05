// Wave E PR1 Task 5 (task-5-brief.md): the pure row -> Concept2 result
// mapping, plus the eligibility gate a caller runs before ever building a
// payload. A fresh SERVER module, not a re-export of
// scripts/c2-crossconnect.ts (the PR0 desk harness) — that file stays
// dev-only, never imported by server/ or src/ (agent briefing: "Two
// footguns"/module boundaries; same posture client.ts already states for
// itself). `c2Tenths`/`formatC2Date` below are TRANSPLANTED, logic-for-
// logic, from scripts/c2-crossconnect.ts:132-152, with their own comments
// here rather than a shared import.

import type { LogSource } from "../../domain/types.js";

// Independent, own-bounds structural mirror of `stores/logs.ts`'s `get()`
// return row (the SAME "independent mirror" idiom that file's own
// `LogSeriesSample` doc comment names) — only the fields this module
// actually reads, never the full Drizzle row type, so server/concept2/
// never imports server/stores/ or server/db/schema.ts. Every field's
// nullability mirrors its real column (`db/schema.ts`): `loggedAt` is
// NOT NULL (a DB-side default); everything else here is nullable exactly
// as stored.
//
// Door PR A (2026-09-02) §2.2: `deviceName` is GONE from this shape,
// replaced by `source`. Provenance is what the column is FOR
// (`domain/types.ts`'s `LogSource`); the null check this module used to
// run was convenient, never itself the stated signal — 0020's backfill
// CASE (`WHEN device_name IS NOT NULL THEN 'pm5'`) and
// `logSourceContradiction`'s biconditional (`deviceName ≠ null ⟺ source
// = 'pm5'`) have kept the two signals in agreement on every write since,
// so the rewrite below is a true no-op over every row ever stored,
// attacked and held (spec §2.2).
export interface SessionLogRow {
  loggedAt: Date;
  completedAt: Date | null;
  tz: string | null;
  workSeconds: number | null;
  workMeters: number | null;
  restSeconds: number | null;
  restMeters: number | null;
  // Wave E PR C: the monitor's OWN totals (0x0039), stored per row as
  // `machine_work_meters`/`machine_work_seconds` — what the PM5's
  // verification code is minted over, so what Concept2 checks it against
  // (proven live: 5706 verifies, our 5708 sum does not —
  // docs/superpowers/research/2026-09-05-c2-verification-measurement.md).
  // Nullable: a pm5/finished row can lack them, then the send falls back to
  // our interval sums.
  machineWorkMeters: number | null;
  machineWorkSeconds: number | null;
  machineSummary: Record<string, unknown> | null;
  source: LogSource;
  endedBy: string | null;
}

// The three reasons a row is not eligible for a Concept2 upload, in the
// order `eligibilityFailure` checks them (spec §The mapping).
export type EligibilityFailure =
  "not_monitor" | "not_finished" | "no_work_totals";

// `endedBy` is NULLABLE on the row (pre-RC rows carry null — the column
// shipped in Phase LL Task 4, so any row logged before that has no close
// reason recorded AT ALL): null !== "finished" -> "not_finished". That is
// deliberate: a pre-RC row is excluded with the SAME reason a
// rower-terminated row gets, stated here because a pre-RC row has no
// close reason at all, not a wrong one.
//
// Door PR A (2026-09-02) §2.2: gate 1 reads `source`, not `deviceName` —
// every non-`pm5` member (`timer`/`manual`/`no-reading`) is equally
// ineligible for a Concept2 upload, which `source !== "pm5"` says
// directly rather than through the deviceName proxy.
export function eligibilityFailure(row: {
  source: LogSource;
  endedBy: string | null;
  workSeconds: number | null;
  workMeters: number | null;
}): EligibilityFailure | null {
  if (row.source !== "pm5") return "not_monitor";
  if (row.endedBy !== "finished") return "not_finished";
  if (row.workSeconds === null || row.workMeters === null) {
    return "no_work_totals";
  }
  return null;
}

/* -------------------------------------------------------------------------
 * Concept2's `weight_class`, and WHO produces it.
 *
 * Concept2 requires the field on every rower result (measured 2026-09-03
 * against log-dev: a POST without it answers 422
 * `{"errors":{"weight_class":["The weight class field is required."]}}`), and
 * ruling (i) says the app asks the rower nothing. So the server reads it from
 * Concept2. The question this block answers is which Concept2 fact IS the
 * class, and the vendor answers it in one sentence (SECONDARY — the logbook
 * help page 403s to fetchers, so this is a search snippet of Concept2's own
 * text, 2026-09-03):
 *
 *   "Lightweight and heavyweight are weight categories from the world of
 *    on-water rowing. Even though you may have entered a weight in your
 *    profile, you must designate L or H for every piece that you enter."
 *
 * The class is a DECLARATION, not a function of the profile weight. So the
 * producer order is:
 *
 *   1. The rower's own most recent declaration — the newest result in their
 *      logbook that is THEIRS TO HAVE DECLARED and whose `weight_class`
 *      reads "H" or "L" (`pickDeclaredWeightClass` below, over the ordered
 *      page `client.fetchResults` returns).
 *   2. Failing that, OUR derivation from the profile's `weight` + `gender`
 *      (`deriveWeightClass`). This is ours, not Concept2's, and the SENT
 *      state says so in as many words.
 *   3. Failing that, refuse the send (422 `no_weight_class`) rather than
 *      guessing a competition category onto a permanent third-party record.
 *
 * "THEIRS TO HAVE DECLARED" is doing real work, and producer 1 is a loop
 * without it: the results list contains the rows THIS APP posted, echoing
 * back the class we sent (`docs/monitor/c2-crossconnect-2026-09/
 * raw-output.txt` lines 1-25 — the 201 body carries our `weight_class` and
 * reports `source` as the rower's own name). Read naively, a class we
 * DERIVED on send 1 comes back as "the rower's declaration" on send 2, and
 * the provenance line that exists to make the guess correctable goes silent.
 * `pickDeclaredWeightClass` therefore takes the ids this app already wrote
 * for the linked account and skips them, and when every candidate is ours it
 * returns null — which is "no declaration", never "our last class".
 *
 * Nothing here is stored. The class is read on the send that uses it and
 * discarded with the response: a declaration can change on Concept2 at any
 * time with no signal to us, and a cached one would write a stale competition
 * category into a record we cannot edit.
 * ---------------------------------------------------------------------- */

export type WeightClass = "H" | "L";

/** Which producer answered — carried to the rower on the SENT state, because
 *  a class we DERIVED is a guess about a fact Concept2 lets its owner set,
 *  and a guess nobody is shown can never be corrected. Concept2 permits
 *  per-result editing, so naming the source at the moment the row lands is
 *  what makes a wrong one repairable. */
export type WeightClassSource = "declaration" | "profile";

/** Why the profile fallback can fail to yield a class at all.
 *
 *  Four members, not two, because the vendor NUMBER has more states than
 *  "set" and "not set" and folding them loses the one thing that would let an
 *  operator diagnose it: `no_weight` is absent-or-zero; `unreadable_weight`
 *  is present in a form we could not parse; `implausible_weight` is a number
 *  outside any human's range, which is what a WRONG UNIT looks like from
 *  here; `no_gender` is a profile whose `gender` is neither `M` nor `F`, for
 *  which C2's own two-category, gendered definition yields NO answer at all
 *  — that rower's class is only ever a declaration. */
export type WeightClassFailure =
  "no_weight" | "unreadable_weight" | "implausible_weight" | "no_gender";

/** The profile weight as the wire actually presents it: a parsed number, the
 *  string `"unreadable"` for a value that was PRESENT and not parseable, or
 *  `null` for absent. Three states, because the caller's honest answer
 *  differs for each and the middle one is otherwise indistinguishable from
 *  "you have not set a weight" — which would tell a rower who HAS set one to
 *  go and set it again, forever. */
export type C2ProfileWeight = number | "unreadable" | null;

/** One row of the rower's Concept2 results list, projected to the four
 *  fields the declaration read decides on (`client.fetchResults`'s own
 *  comment says what each is for). */
export interface C2ResultRow {
  id: number | null;
  type: string | null;
  weightClass: string | null;
  dateUtc: string | null;
  date: string | null;
}

/** The result types Concept2 REQUIRES a weight class on, and therefore the
 *  only types whose `weight_class` is a designation rather than noise.
 *  PRIMARY, `https://log.concept2.com/developers/documentation/` fetched
 *  2026-09-03, the Add Result parameter table, verbatim:
 *
 *    weight_class | Depends | string | Required if type is rower, dynamic
 *    or slides. Value must be either H or L | H
 *
 *  A row of any OTHER type may still carry a value — the same page's Get
 *  Results 200 example has a `"type": "skierg"` row carrying
 *  `"weight_class": "H"` — and that value is unmeasured, because nothing
 *  required the rower to mean it. Skipping those rows is the hedge, and it
 *  costs nothing: the rower falls through to the profile, or to the refusal
 *  that tells them where to fix it. */
export const CLASS_BEARING_RESULT_TYPES: readonly string[] = [
  "rower",
  "dynamic",
  "slides",
];

/** How far ahead of our own clock a result may be dated and still count as
 *  the rower's most recent declaration.
 *
 *  A logbook row can be entered by hand with any date, and "newest" has no
 *  recency bound of its own: without this, ONE row dated 2030 pins the
 *  declaration for every send this rower ever makes, and nothing in the app
 *  could tell them why. Skipping it is the safe direction — the fallback is
 *  an older real declaration, or the profile, or a refusal that names a
 *  repair — whereas honouring it is silently permanent. A day of slack
 *  absorbs clock skew and timezone-boundary rows without admitting a
 *  deliberate future date. */
export const FUTURE_ROW_SKEW_MS = 24 * 60 * 60 * 1000;

/** `date_utc` is NULLABLE on Concept2's own documented example rows (both of
 *  them carry `"date_utc": null`), so `date` is the fallback, read as UTC:
 *  it is local time with no offset, which is at worst ~14 h out and well
 *  inside the skew above. A row with NEITHER is taken at its list position
 *  rather than discarded — a missing stamp is not a reason to throw away a
 *  real designation. */
function rowInstantMs(row: C2ResultRow): number | null {
  const raw = row.dateUtc ?? row.date;
  if (raw === null) return null;
  const parsed = Date.parse(raw.includes("T") ? raw : `${raw.trim()}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Producer 1: the rower's own most recent designation.
 *
 *  `rows` arrives in the order Concept2 returned it, which is
 *  DATE-DESCENDING — measured 2026-09-03 on log-dev with
 *  `GET /api/users/me/results?number=1`, where id 85561 dated
 *  `2026-09-02 10:00:30` sorts ahead of id 85562 dated `2026-09-02 10:00:00`,
 *  so the order is by date and not by id. The first row that survives every
 *  skip below is therefore the newest declaration.
 *
 *  FOUR skips, and the FIRST is the one that keeps this function honest:
 *
 *   1. `ourResultIds` — a result THIS APP wrote. See the block comment
 *      above: without this, our own derived guess is read back as the
 *      rower's declaration on the very next send. A row whose `id` did NOT
 *      parse is skipped too, and that direction is deliberate: an
 *      unidentifiable row cannot be checked against the exclusion set, so
 *      reading a class off it risks laundering our own write back as a
 *      declaration — the exact defect this skip exists for. Discarding it
 *      costs at worst one real declaration among fifty; honouring it costs
 *      the provenance of a permanent third-party record.
 *   2. a type Concept2 does not require a class on
 *      (`CLASS_BEARING_RESULT_TYPES`), and a row with no `type` at all.
 *   3. a `weight_class` that is not exactly "H" or "L". Selection is on the
 *      FIELD, not on `?type=` — that parameter IS documented as a filter,
 *      but it names one type and this read accepts three, and a field read
 *      is auditable in the route's own log line.
 *   4. a row dated further ahead than `FUTURE_ROW_SKEW_MS`.
 *
 *  Returning null means "this rower has declared nothing we can read", which
 *  is what the caller falls through on. It never means "use the last class
 *  we sent". */
export function pickDeclaredWeightClass(
  rows: readonly C2ResultRow[],
  opts: { ourResultIds: ReadonlySet<number>; now: number },
): WeightClass | null {
  for (const row of rows) {
    if (row.id === null) continue;
    if (opts.ourResultIds.has(row.id)) continue;
    if (row.type === null) continue;
    if (!CLASS_BEARING_RESULT_TYPES.includes(row.type)) continue;
    if (row.weightClass !== "H" && row.weightClass !== "L") continue;
    const at = rowInstantMs(row);
    if (at !== null && at > opts.now + FUTURE_ROW_SKEW_MS) continue;
    return row.weightClass;
  }
  return null;
}

/** Concept2's thresholds, which are Concept2's own: lightweight is 75 kg or
 *  less for men and 61.5 kg or less for women, heavyweight above, RowErg only
 *  (SECONDARY — logbook help and forum, 2026-09-03). "or less" is INCLUSIVE,
 *  which is why both comparisons are `<=` and why the table test pins the
 *  exact boundary on both sides.
 *
 *  Concept2 publishes the SAME boundary twice, in units that are not equal:
 *  165 lb is 74.84 kg, not 75.00, and 135 lb is 61.24 kg, not 61.50. Our kg
 *  pair is the more generous of the two, so a rower between 74.85 and 75.00 kg
 *  is L to us and H under the pound rule. Concept2 publishes both, so neither
 *  is wrong — this is recorded so nobody later "fixes" it.
 *
 *  THE UNIT IS AN INFERENCE AND THE IDENTIFIER SAYS SO. The only line
 *  Concept2 publishes about the encoding sits on the CREATE USER endpoint
 *  (`https://log.concept2.com/developers/documentation/`, fetched
 *  2026-09-03), verbatim:
 *
 *    weight | No | integer | The weight in decigrams for the user,
 *    e.g. 7500 for 75kg. Defaults to null if not set. | 7500
 *
 *  That sentence contradicts itself — 7500 decigrams is 750 g — and the
 *  EXAMPLE is the half that pins an actual correspondence: one unit is
 *  0.01 kg. Nothing states that `GET /api/users/me` echoes the same encoding,
 *  and that endpoint's own documented example omits `weight` entirely, so no
 *  observation settles it. Hence `_HUNDREDTHS_KG` in the names, and hence the
 *  plausibility band below, which is the part a machine can check. */
export const LIGHTWEIGHT_MAX_MEN_HUNDREDTHS_KG = 7500;
export const LIGHTWEIGHT_MAX_WOMEN_HUNDREDTHS_KG = 6150;

/** The band that turns the unit INFERENCE above into a loud refusal — for
 *  every candidate unit EXCEPT one, and the exception is stated because a
 *  guard oversold is worse than no guard.
 *
 *  Every candidate unit for the read field, against a 75 kg rower:
 *
 *    decigrams (the doc's word)  750000  -> outside, refused
 *    grams                        75000  -> outside, refused
 *    hundredths of a kilogram      7500  -> INSIDE, classified (assumed)
 *    hundredths of a pound        16530  -> INSIDE, classified (WRONG)
 *    integer kilograms               75  -> outside, refused
 *    integer pounds                 165  -> outside, refused
 *
 *  Without the band, the two integer readings classify EVERY rower as
 *  LIGHTWEIGHT, which files a heavyweight's rows in Concept2's lightweight
 *  rankings — falsifying a competition record rather than merely
 *  disadvantaging its owner. The band refuses those two and both
 *  metric-mass readings, loudly, with a reason token.
 *
 *  IT CANNOT REFUSE THE POUND READING, and no band can: hundredths-of-a-lb
 *  differs from hundredths-of-a-kg by 2.2x, and any band wide enough to hold
 *  real rowers (30-300 kg) contains both readings of all of them. Under that
 *  unit almost every rower reads HEAVY. That residue is what exit criterion
 *  3b's TWO readings exist for — a weight recorded with the profile's unit
 *  preference on kg and again on lb — and it is bounded by the fact that this
 *  function is the FALLBACK: a rower who has declared a class on any recent
 *  Concept2 result never reaches it.
 *
 *  30-300 kg is deliberately far wider than any rower: it is a UNIT check,
 *  not a body check. */
export const PLAUSIBLE_MIN_HUNDREDTHS_KG = 3000;
export const PLAUSIBLE_MAX_HUNDREDTHS_KG = 30000;

/** Producer 2: our derivation from the profile, used only when the rower has
 *  made no declaration we can read. */
export function deriveWeightClass(profile: {
  weight: C2ProfileWeight;
  gender: string | null;
}):
  | { ok: true; weightClass: WeightClass }
  | { ok: false; reason: WeightClassFailure } {
  const { weight, gender } = profile;
  if (weight === "unreadable") {
    return { ok: false, reason: "unreadable_weight" };
  }
  // `<= 0` and not just `null`: Concept2 defaults an unset weight to null,
  // but a 0 is a profile that has been touched and left empty, and it must
  // not classify as the lightest possible rower.
  if (weight === null || weight <= 0) return { ok: false, reason: "no_weight" };
  // The band runs BEFORE gender, so a wrong unit refuses for every profile
  // rather than only for the two genders we can classify.
  if (
    weight < PLAUSIBLE_MIN_HUNDREDTHS_KG ||
    weight > PLAUSIBLE_MAX_HUNDREDTHS_KG
  ) {
    return { ok: false, reason: "implausible_weight" };
  }
  // `M`/`F` is DOCUMENTED, and the read side's letter case is documented
  // only by EXAMPLE — so the comparison case-folds rather than trusting the
  // example. Both rows are PRIMARY,
  // `https://log.concept2.com/developers/documentation/` fetched 2026-09-03:
  //
  //   Create User parameter table:
  //     gender | Yes | string | Must be one of: F, M | M
  //   Get User (`GET /api/users/{user}`), the documented 200 example body:
  //     "gender": "M"
  //
  // The first is a WRITE parameter and pins the vocabulary; the second is
  // this endpoint's own example and is the only statement about what the
  // READ returns. Neither is an enumeration of what a live account may hold,
  // and this project has not yet read a real value (exit criterion 3b's
  // session does, in one glance). Case-folding and trimming cost nothing and
  // turn a plausible `"m"` from a silent refusal into a classification.
  const normalized = gender === null ? null : gender.trim().toUpperCase();
  if (normalized === "M") {
    return {
      ok: true,
      weightClass: weight <= LIGHTWEIGHT_MAX_MEN_HUNDREDTHS_KG ? "L" : "H",
    };
  }
  if (normalized === "F") {
    return {
      ok: true,
      weightClass: weight <= LIGHTWEIGHT_MAX_WOMEN_HUNDREDTHS_KG ? "L" : "H",
    };
  }
  // Concept2's category is two-valued and its thresholds are gendered, so a
  // profile outside `M`/`F` has no derivable class at all — not a missing
  // weight, and never told to the rower as one. Their class can only ever be
  // a declaration (producer 1).
  return { ok: false, reason: "no_gender" };
}

// Transplanted from scripts/c2-crossconnect.ts:132-134.
export function c2Tenths(seconds: number): number {
  return Math.round(seconds * 10);
}

// Transplanted from scripts/c2-crossconnect.ts:136-152 (en-CA date + en-GB
// h23 time via Intl — en-CA gives yyyy-mm-dd; hourCycle h23 avoids
// "24:00"). Measured live against this exact instant/tz at PR0
// (docs/monitor/c2-crossconnect-2026-09/raw-output.txt:1-26, "date":
// "2026-08-25 17:42:03").
export function formatC2Date(instant: Date, tz: string): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(instant);
  return `${date} ${time}`;
}

// The HOUSE stroke-rate band, duplicated here (not imported — the source
// constants are module-private in routes/data.ts) as an independent
// mirror, same idiom as `SessionLogRow` above: `ACTUAL_SPM_MIN = 1`
// (server/routes/data.ts:348) and `PM5_SPM_MAX = 99`
// (server/routes/data.ts:332). This is NOT the wire's own u8 range
// (0..255 — that same file's comment at line 320 notes "avgSpm up to
// 255" as the reason the manual/pm5 bands had to widen in the first
// place). `machineSummary` is untyped jsonb and `validateMachineSummary`
// band-checks nothing numeric in it, so THIS band is the only thing
// standing between a malformed or out-of-range stroke count and a C2
// upload — load-bearing, not decorative.
//
// The 2x stroke-rate anomaly (walk-2026-08-25 README W-3) has never been
// observed on a FINISHED row (n=1) and RC-16 itself was closed
// PREMISE-FALSIFIED (docs/history/phase-rc.md:1962-1968 — a later capture
// read 25 against a PM5 screen reading 25, refuting the "always 2x"
// premise). The guard here is this band plus the finished-only fence
// `eligibilityFailure` already enforces upstream — never RC-16, which
// answered a different, now-closed question.
const STROKE_RATE_MIN = 1;
const STROKE_RATE_MAX = 99;

// `machineSummary.workoutType` is the raw 0x0039 byte 17
// (domain/monitor/pm5/parse.ts:370). Ordinal 8 is the programmed-row
// reading on the finished capture this module's fixture transcribes, and
// Concept2 accepted the string "VariableInterval" live at PR0
// (docs/monitor/c2-crossconnect-2026-09/raw-output.txt:1-26). The JustRow
// capture read `01` on this same byte, "noted raw, not yet interpreted"
// (docs/monitor/sessions/walk-2026-08-24/README.md:116-118), so ordinal 1
// stays UNMAPPED until phase JR confirms what it means — any ordinal not
// in this table (including 1) omits `workout_type` entirely (spec's
// "everything else OMITTED" rule, anchor F6: omission is honest).
const C2_WORKOUT_TYPE_BY_ORDINAL: Record<number, string> = {
  8: "VariableInterval",
};

// Row totals `buildC2Payload` requires — non-null, unlike `SessionLogRow`'s
// own nullable fields — because this function is only ever called on a
// row that has ALREADY passed `eligibilityFailure` (whose "no_work_totals"
// branch is exactly this guarantee). Throwing here is a defensive
// contract check, not a reachable production path when callers respect
// the gate.
function requireWorkTotals(row: SessionLogRow): {
  workSeconds: number;
  workMeters: number;
} {
  if (row.workSeconds === null || row.workMeters === null) {
    throw new Error(
      "buildC2Payload requires a row that has already passed eligibilityFailure (workSeconds/workMeters is null)",
    );
  }
  return { workSeconds: row.workSeconds, workMeters: row.workMeters };
}

// Builds the Concept2 result payload for one eligible row (spec §The
// mapping). Callers run `eligibilityFailure` first; this function does
// not re-derive eligibility itself beyond the work-totals guard above.
//
// tz precedence: `row.completedAt` + `row.tz` when BOTH are present (the
// client's own recorded instant and zone); otherwise `row.loggedAt` +
// `effectiveTz`, where the CALLER is responsible for resolving
// `effectiveTz` to the row's stored tz when present, else the request's
// (persisted by the route before this runs — plan deviation 2). This
// function only ever reads `row.tz` as part of the FIRST branch's paired
// check — it never falls back to `row.tz` alone.
export function buildC2Payload(
  row: SessionLogRow,
  // Wave E PR2, ruling (i): this used to be the stored LINK row's class.
  // It is now the resolution the send path produced (declaration first,
  // our profile derivation second), so a parameter named `link` would be a
  // stale name outliving the refactor.
  weightClass: WeightClass,
  effectiveTz: string,
): Record<string, unknown> {
  const { workSeconds, workMeters } = requireWorkTotals(row);

  // Narrowing happens per-branch of this ternary (TS control-flow
  // analysis), so no non-null assertion is needed on either side.
  const instant =
    row.completedAt !== null && row.tz !== null
      ? row.completedAt
      : row.loggedAt;
  const tz = row.completedAt !== null && row.tz !== null ? row.tz : effectiveTz;

  const post: Record<string, unknown> = {
    type: "rower",
    date: formatC2Date(instant, tz),
    timezone: tz,
    // Wave E PR C: the monitor's own total, not our interval sum, for the
    // two code-checked numeric fields (workout_type is already machine-
    // sourced below; date is the row's own instant). The predicate is the
    // hero's OWN — `!== null && > 0` (`src/log/LogRow.tsx`'s
    // `heroDistanceMeters` and the machine-tier gate it shares) — NOT `??`:
    // a `0` machine total is a value `??`
    // would post while the hero falls back to our sum, reintroducing the
    // send≠display split this PR closes (lens 2). Falls back to our interval
    // sums for a row with no 0x0039 summary — today's behavior, which could
    // not verify anyway. `time` moves with `distance`: seconds DO diverge on
    // real captures (oracleCorpusReplay KEYSTONE, machine 138.7 vs ours
    // 138.8), gated by a seeded unit test at this store→payload seam while
    // oracleCorpusReplay gates the wire→machine_work_seconds step.
    distance:
      row.machineWorkMeters !== null && row.machineWorkMeters > 0
        ? row.machineWorkMeters
        : workMeters,
    time: c2Tenths(
      row.machineWorkSeconds !== null && row.machineWorkSeconds > 0
        ? row.machineWorkSeconds
        : workSeconds,
    ),
    weight_class: weightClass,
  };

  // rest_time/rest_distance ride only when > 0 — PR0's own rule
  // (scripts/c2-crossconnect.ts:166-167): a zero-rest row never forces
  // either key.
  if (row.restSeconds !== null && row.restSeconds > 0) {
    post.rest_time = c2Tenths(row.restSeconds);
  }
  if (row.restMeters !== null && row.restMeters > 0) {
    post.rest_distance = row.restMeters;
  }

  const avgStrokeRate = row.machineSummary?.avgStrokeRate;
  if (
    typeof avgStrokeRate === "number" &&
    Number.isInteger(avgStrokeRate) &&
    avgStrokeRate >= STROKE_RATE_MIN &&
    avgStrokeRate <= STROKE_RATE_MAX
  ) {
    post.stroke_rate = avgStrokeRate;
  }

  const workoutType = row.machineSummary?.workoutType;
  if (
    typeof workoutType === "number" &&
    workoutType in C2_WORKOUT_TYPE_BY_ORDINAL
  ) {
    post.workout_type = C2_WORKOUT_TYPE_BY_ORDINAL[workoutType];
  }

  return post;
}
