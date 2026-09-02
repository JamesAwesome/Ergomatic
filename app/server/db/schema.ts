import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleSub: text("google_sub").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

// --- Phase 4: domain tables ---------------------------------------------

export const workoutTypeEnum = pgEnum("workout_type", ["AN", "O2", "AT", "TR"]);
export const difficultyEnum = pgEnum("difficulty", ["easy", "medium", "hard"]);
export const workoutSourceEnum = pgEnum("workout_source", ["starter", "user"]);
// UNDER = FASTER than target (under the target NUMBER), OVER = SLOWER
// (post-workout-summary spec, ruling option B, James 2026-08-17): stored
// members are unchanged from the pre-existing enum, this only documents the
// direction the button labels now read for a reader landing on this file
// cold. Mirrored at the options array (LogSession.tsx's HELD_OPTIONS) and
// both HeldResult copies (server/stores/logs.ts, src/api/useRecentLogs.ts).
export const heldResultEnum = pgEnum("held_result", ["held", "under", "over"]);
// Post-workout-summary spec (2026-08-17), §3 "Stored shapes": the reflection
// card's thumbs-up/down question, stored now even though nothing reads it
// yet (generation's own thumbs consumption is explicitly OUT for this
// phase — spec §4).
export const thumbsEnum = pgEnum("thumbs", ["up", "down"]);
export const testDistanceEnum = pgEnum("test_distance", ["2k", "6k"]);
// Phase LL Task 4 (design spec §4, TRIAD — a stored shape): the server-side
// mirror of `MonitorRun.endedBy` (`src/monitor/monitorRun.ts`'s own
// `CloseReason` union). `"interrupted"` rides along even though its own
// writer (F6, Today's row) predates this task — the client-side field
// already widened to include it, and posting it through unchanged is what
// makes the widened union additive rather than a second, competing shape.
// Wave F PR 1 (lifecycle design spec §1, "The migration, owned"): a real
// Postgres pgEnum TYPE, so the sixth value needs its own migration
// (`ALTER TYPE ... ADD VALUE`), not just a type-level edit — this array,
// `server/stores/logs.ts`'s hand-copied `EndedBy` union, and
// `server/routes/data.ts`'s `ENDED_BY_VALUES` are three independent
// mirrors of the same value set with no shared source, so widening one
// without the other two typechecks clean and fails only at runtime on a
// phone. All three move together in the same commit.
export const endedByEnum = pgEnum("ended_by", [
  "finished",
  "rower",
  "link-lost",
  "program-failed",
  "program-dropped",
  "interrupted",
]);
// Phase BL PR A (baseline-onboarding spec 2026-08-22 rev 2, "The stored
// shape"): per-NUMBER provenance for the two baseline splits — one row
// holds two numbers with independent origins (a questionnaire estimates
// both; a 2K test measures only k2), so a single row-level column would
// lie to the very consumer the ruling exists for. Stored, never shown in
// UI. `manual` = typed in the You editor; `estimated` = the questionnaire
// table (PR C); `derived` = the ±7s counterpart derivation
// (domain/deriveBaseline.ts) accepted as an offer; `tested` = a rowed
// test's measured result accepted from the post-test prompt (PR B).
export const baselineSourceEnum = pgEnum("baseline_source", [
  "manual",
  "estimated",
  "derived",
  "tested",
]);

export const baselines = pgTable("baselines", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  k2Seconds: real("k2_seconds"),
  k6Seconds: real("k6_seconds"),
  // NOT NULL with a 'manual' default, deliberately no nullable "unknown"
  // fourth state: every pre-0013 row was written by the You editor (the
  // only writer that ever existed), so 'manual' is the truthful backfill,
  // and an old client's plain write IS a manual entry.
  k2Source: baselineSourceEnum("k2_source").notNull().default("manual"),
  k6Source: baselineSourceEnum("k6_source").notNull().default("manual"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const workouts = pgTable(
  "workouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable: NULL marks a global starter-library row, seeded once at
    // boot and shared read-only across every user (Task 9's global-library
    // amendment). A non-null value is an ordinary personal row.
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order"),
    title: text("title").notNull(),
    type: workoutTypeEnum("type").notNull(),
    difficulty: difficultyEnum("difficulty").notNull(),
    pain: integer("pain").notNull(),
    source: workoutSourceEnum("source").notNull(),
    steps: jsonb("steps").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("workouts_user_id_idx").on(t.userId),
    check("workouts_pain_check", sql`${t.pain} between 1 and 5`),
  ],
);

// Just Row unconnected spec (2026-09-02, §Mechanism stored shape (c),
// TRIAD — a stored shape): WHICH DOOR a session log came through. A real
// Postgres pgEnum TYPE, so widening it is an `ALTER TYPE ... ADD VALUE`
// migration, never a type-level edit (the `endedByEnum` lesson above).
// Three mirrors of this value set move together: this array,
// `domain/types.ts`'s `LOG_SOURCES` (what `routes/data.ts` validates the
// wire against), and the backfill CASE in `drizzle/0020_*.sql`.
export const logSourceEnum = pgEnum("log_source", ["pm5", "timer", "manual"]);

export const sessionLogs = pgTable(
  "session_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workoutId: uuid("workout_id").references(() => workouts.id, {
      onDelete: "set null",
    }),
    workoutTitle: text("workout_title").notNull(),
    // Phase JR PR 1: NULLABLE. `null` means "no intensity was prescribed" —
    // a free row (Just Row) prescribes none. Stays plain `text`, never the
    // `workoutTypeEnum` above (that types `workouts.type`); this column
    // holds OUR intensity axis only and carries no index, CHECK or FK.
    // R-A ordered: the null-tolerant read side ships in this same PR, the
    // same shape migration 0009 used for `held`/`pain`.
    workoutType: text("workout_type"),
    loggedAt: timestamp("logged_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    baselineK2: real("baseline_k2"),
    baselineK6: real("baseline_k6"),
    // Post-workout-summary spec (2026-08-17), §3 "Stored shapes": nullable
    // now (`DROP NOT NULL`, migration 0009) — the redesigned reflection card
    // makes every answer optional (James's ruling), so a rower who skips the
    // HELD question entirely must be storable, not just one who skips PAIN
    // (which was already impossible before this migration: both were
    // required together). R-A ordered this: the null-tolerant READ side
    // (`RecentLog.held`, src/api/useRecentLogs.ts) shipped and tagged
    // (v0.10.1) before this column could ever hold a null, so no installed
    // client white-screens on one.
    held: heldResultEnum("held"),
    // Same ruling as `held` above — nullable, `DROP NOT NULL`. The
    // `session_logs_pain_check` CHECK below is left untouched: Postgres
    // passes a CHECK constraint on NULL by definition (NULL is neither TRUE
    // nor FALSE, and a CHECK only ever REJECTS an explicit FALSE), so an
    // absent pain value satisfies `pain between 1 and 5` unchanged — no
    // migration edit needed for the constraint itself.
    pain: integer("pain"),
    notes: text("notes"),
    steps: jsonb("steps").notNull(),
    // Phase 7C Task 3 (spec §5/§6): session-scoped provenance for a
    // monitor-sourced log ("PM5 432331249 Row"), nullable — a phone-timer
    // log has no device to name, and existing rows read back null (nothing
    // backfills). Its own column, not folded into `steps` jsonb: the
    // adversarial review's B4 finding is that §5 and §6 disagreed on this
    // ("inside the existing steps JSON" vs. "no migration") — a session-
    // level string has nowhere to live inside a per-step array, so a real
    // migration is unavoidable.
    deviceName: text("device_name"),
    // Just Row unconnected spec (2026-09-02, §Mechanism stored shape (c),
    // TRIAD): the door this row came through — `pm5` (connected), `timer`
    // (the phone's clock: a Timer-closed SessionRun, or the time-only Just
    // Row), `manual` (`Log it after`). NOT NULL, no default: every writer
    // states it, and the one writer that cannot — an installed build that
    // predates the column — has the ROUTE derive it (`server/logSource.ts`,
    // a dated sunset). Migration 0020 adds it nullable, BACKFILLS every
    // existing row with the read side's old inference (`deviceName` ⇒ pm5,
    // else any stopwatch step ⇒ timer, else manual), then sets NOT NULL —
    // so a row that rendered PM5 / TIMER / LOGGED BY HAND before reads the
    // same word from a column instead of a guess. Its own column, not a
    // `steps` key, for the same reason `deviceName` above is: a row-level
    // fact has nowhere honest to live inside a per-step array.
    source: logSourceEnum("source").notNull(),
    // Post-workout-summary spec (2026-08-17), §3: nullable column, additive.
    // Absent/skipped reflection stores null; nothing consumes this yet
    // (generation's own thumbs consumption is explicitly OUT this phase).
    thumbs: thumbsEnum("thumbs"),
    // From-the-log spec (2026-08-18), §2 "Stored shapes" — migration 0010,
    // five additive/nullable columns, no defaults, no backfill: every
    // existing row reads every one of these back as null (spec exit
    // criterion 6). The three hero numbers below are written at save time,
    // only when the summary showed that hero — history renders the EXACT
    // numbers the rower saw, never a recomputed near-number (ruling 2).
    //
    // `double precision`, never `real` (float4): a probe run against real
    // Postgres shows `'2.7182818284'::real` truncating to `2.7182817`
    // while `::double precision` round-trips exactly (verified directly,
    // 2026-08-18 — the antagonist's own B8 finding on the spec) — a
    // triad-governed stored number does not get to lose precision the
    // summary itself never lost.
    avgSplitSeconds: doublePrecision("avg_split_seconds"),
    // The R-B number: a plain integer, a whole-meter total (fix round 3,
    // re-review: "the machine's" is no longer accurate for tier B, whose
    // total is OUR quotient over our own summed actuals, not a single
    // machine-reported field).
    // **CORRECTED (RC-5 hero-truth spec, Task 3 fix round 2, finding
    // I2): this column's MEANING is save-time-dependent, not fixed.**
    // Originally (R-B, pre-RC-5): work + rest + warm-up, fused. As of
    // RC-5 (this same phase), `LogSession.tsx` posts the tier-appropriate
    // WORK-ONLY number instead (`model.heroes.distanceMeters` —
    // `summaryModel.ts`'s tier A/B split) for every save going forward;
    // a row saved BEFORE RC-5 shipped still carries the OLD fused value,
    // read back unchanged (`storedSummary.ts`'s own FALLBACK/declined-
    // TIER-B2 branches — no migration backfills old rows). `avgSplitSeconds`
    // above and `timeSeconds` below carry the identical
    // save-time-dependent split.
    distanceMeters: integer("distance_meters"),
    timeSeconds: doublePrecision("time_seconds"),
    // Plan linkage pair, written ONLY on an advancing save whose
    // plan_state upsert returns a non-null planKey — server-derived from
    // that row in the same transaction, never posted by the client (see
    // stores/logs.ts's create()). Reset and Switch never rewrite these:
    // they are a record of what happened, not a foreign key into current
    // plan state (spec §2), so (plan_key, plan_index) is deliberately
    // NON-UNIQUE after a Reset — the newest row per index wins at read
    // time (§2), not enforced here.
    planKey: text("plan_key"),
    planIndex: integer("plan_index"),
    // Series capture spec (2026-08-19), §3 "Server home": the run's 1 Hz
    // trace, migration 0011 — one nullable jsonb column, no default,
    // additive-only. A column, not a table: one lifecycle (the log's own),
    // DELETE cascades free, and nothing streams or paginates samples this
    // phase (YAGNI, recorded in the spec). Every existing row reads this
    // back as null; nothing backfills. Untyped jsonb (no `.$type<>()`
    // binding), same convention as `steps` above — `stores/logs.ts`'s
    // `LogSeries` is the shape callers actually validate against, not a
    // Drizzle-level type. Deliberately excluded from `LOG_LIST_COLUMNS`
    // (`stores/logs.ts`) the same way `steps` already is: the list
    // projection's own drift pin (`storeContracts.ts`) now reads
    // "list = get - steps - series".
    series: jsonb("series"),
    // Phase LL Task 4 (design spec §4, TRIAD): migration 0012, one
    // additive-optional enum column, no default, no backfill — every
    // existing row reads this back as null (exit criterion 5's own "legacy
    // rows read back unchanged", extended to the server row: a row written
    // before this task simply has no `ended_by` at all). Nullable so a
    // rower who saved before a close reason existed, or a pre-this-task
    // client, is unaffected — this is the mirror of `MonitorRun.endedBy?`
    // (`src/monitor/monitorRun.ts`), never a second source of truth for
    // it: the CLIENT decides the value at close time (spec §4's own honest
    // limit — a server row exists only if the rower saves), and this
    // column only ever stores what `routes/data.ts`'s POST validated.
    endedBy: endedByEnum("ended_by"),
    // Storage-spine design spec §3 (RC-1, TRIAD — a stored shape): the
    // session's work and rest, stored SEPARATELY from the three fused
    // hero columns above — migration 0015, four additive-optional,
    // nullable columns, no default, no backfill. Every existing row reads
    // all four back as null, forever (spec §3's own "old records keep
    // fused-only quantities forever, said above the fold"). Mirrors
    // `MonitorRun.workSeconds`/`workMeters`/`restSeconds`/`restMeters`
    // (`src/monitor/monitorRun.ts`) — the CLIENT computes these once, at
    // natural close, from `IntervalActual` sums; this column only ever
    // stores what `routes/data.ts`'s POST validated, same posture
    // `endedBy` above already has.
    //
    // **CORRECTED at the final whole-branch review (BLOCKER-1) — this
    // comment used to claim every wire source here "is a whole-number
    // field," which is false and was never sourced from the field that
    // actually decides it.** `elapsedSeconds` (0x0037's own Split/Interval
    // Time, `domain/monitor/pm5/parse.ts`'s `splitIntervalTimeSeconds:
    // readU24LE(bytes, 6) / 10`) is TENTHS-of-a-second precision on the
    // wire, not whole seconds — a real natural finish's `workSeconds` is
    // routinely fractional (session-2's own real capture sums to
    // 398.4s). `workSeconds` is therefore `doublePrecision`, the same
    // type and the same B8-truncation reasoning the hero block above
    // already uses (`avgSplitSeconds`'s own comment) — a `real` column
    // would risk the identical float4 truncation on a value this
    // precise. `restSeconds` (0x0037's own Interval Rest Time, offset 12,
    // `intervalRestTimeSeconds: readU16LE(bytes, 12)`, no `/10`) reads
    // WHOLE seconds on every committed capture — genuinely a
    // whole-number wire field, unlike its sibling — but is
    // `doublePrecision` too, for symmetry with `workSeconds` (the pair is
    // computed and read together) and because a whole number loses
    // nothing by living in a wider column; nothing here assumes the wire
    // could someday send it fractional. `workMeters`/`restMeters` stay
    // `integer`: `distanceMeters` (0x0037 offset 9, `splitIntervalDistanceMeters:
    // readU24LE(bytes, 9)`, no scale) and `intervalRestDistanceMeters`
    // (offset 14, `readU16LE(bytes, 14)`, no scale) are both genuinely
    // whole-metre u24/u16 wire fields — `distanceMeters` above is this
    // table's own precedent for an `integer` hero column, and it still
    // applies to these two, just not to the seconds pair beside them.
    workSeconds: doublePrecision("work_seconds"),
    workMeters: integer("work_meters"),
    restSeconds: doublePrecision("rest_seconds"),
    restMeters: integer("rest_meters"),
    // RC-2/RC-3 wave design spec §1 ("The server tier (same PR)", TRIAD):
    // the machine's own end-of-workout summary — migration 0016, three
    // additive-optional, nullable columns, no default, no backfill. Same
    // posture as `workSeconds`/`endedBy` above: the CLIENT decides the
    // value (`src/monitor/monitorRun.ts`'s `MonitorRun.summaryTotals`/
    // `summaryDetail`/`verificationBytes`, captured verbatim from
    // `parseEndOfWorkoutSummary`'s 0x0039 decode), this column only ever
    // stores what `routes/data.ts`'s POST validated, and every existing
    // row reads all three back as null, forever.
    //
    // `machineWorkSeconds` is `doublePrecision`, same B8-truncation
    // reasoning as `workSeconds` above (0x0039's own elapsed field is the
    // identical tenths-precision Split/Interval Time source). Wire
    // decimeters; a `real` column risks losing precision on a value this
    // exact.
    machineWorkSeconds: doublePrecision("machine_work_seconds"),
    // `machineWorkMeters` is `integer`: 0x0039's own distance field is
    // decimeters on the wire, and the client rounds to whole meters before
    // posting (`Math.round` — the validator names the rounding, same
    // "sanity, not truth" trust boundary as every numeric field here).
    machineWorkMeters: integer("machine_work_meters"),
    // `machineSummary` is untyped jsonb (no `.$type<>()` binding), same
    // convention as `series` above — migration 0011 is the precedent this
    // column follows: monitor-observed, display-verbatim, never `WHERE`'d
    // yet. Carries `verificationBytes` (the 0x003F payload, optional) and
    // the nine `MachineSummaryDetail` fields verbatim
    // (`src/monitor/monitorRun.ts`) — `routes/data.ts`'s own validator is
    // the shape authority (object, size-capped, `verificationBytes`
    // band-checked when present), not this column's type.
    machineSummary: jsonb("machine_summary"),
    // Wave E PR1 (2026-08-31-concept2-logbook-design.md §Stored shapes):
    // all four additive-optional, no default, no backfill — every
    // existing row reads them back null. c2ResultId: C2's own result id,
    // written when C2 acknowledges the row — a 2xx, or a 409 whose body
    // names the colliding id (RF25's durable-recovery write). c2UserId:
    // WHICH Concept2 account accepted it — the sent state renders only
    // when this matches the live link's (anchor F8). Both server-written
    // at upload, never client input.
    c2ResultId: integer("c2_result_id"),
    c2UserId: integer("c2_user_id"),
    // completedAt: the client's MonitorRun.completedAt — C2's `date` is
    // the END of the workout and logged_at is save-time, minutes-to-hours
    // later (anchor K3). tz: the client's IANA zone; posted at save from
    // PR2 on, or written by the upload route's first legacy send (plan
    // deviation 2 — the payload's date must be stable across retries
    // because C2's dedup key is second-granular).
    completedAt: timestamp("completed_at", { withTimezone: true }),
    tz: text("tz"),
  },
  (t) => [
    index("session_logs_user_id_idx").on(t.userId),
    // LEFT ALONE by the post-workout-summary migration (0009): NULL passes
    // a Postgres CHECK constraint by rule (see the `pain` column's own
    // comment above) — the constraint doesn't need to change for `pain` to
    // become nullable, only the column's `NOT NULL` does.
    check("session_logs_pain_check", sql`${t.pain} between 1 and 5`),
  ],
);

export const planState = pgTable(
  "plan_state",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    planKey: text("plan_key", { enum: ["sprint", "head"] }),
    doneN: integer("done_n").notNull().default(0),
  },
  (t) => [
    check(
      "plan_state_plan_key_check",
      sql`${t.planKey} is null or ${t.planKey} in ('sprint', 'head')`,
    ),
  ],
);

export const preferences = pgTable("preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  difficulties: jsonb("difficulties")
    .notNull()
    .default(["easy", "medium", "hard"]),
  timeCapMinutes: integer("time_cap_minutes").notNull().default(60),
  // Phase 9's warmup-setting design (2026-08-09, §2) added this column,
  // replacing the two columns above (warmup_minutes/warmup_override — the
  // override was never consumed anywhere; minutes' one consumer, the
  // Builder hint, was rewritten against this column). Phase WU
  // (2026-08-21) removed the setting: nothing reads or writes this column
  // any more. LEFT IN PLACE ON PURPOSE — spec §4: dropping it in the same
  // release that stops reading it would break rollback (the server image
  // a rollback restores still reads it, and `/api/health` is `select 1`,
  // so a rollback would report healthy over a dead preferences path). The
  // drop is an owed follow-up (ROADMAP), not forgotten.
  warmup: jsonb("warmup"),
  countdownSeconds: integer("countdown_seconds").notNull().default(10),
  paceToleranceSeconds: real("pace_tolerance_seconds").notNull().default(1),
  accentColor: text("accent_color").notNull().default("#b5341f"),
  // Phase 6I: START HERE's own dismissal, server-side so it was
  // recoverable from You (PUT IT BACK ON TODAY) rather than a
  // client-local flag. James's 2026-08-23 ruling removed the teaching
  // surfaces (Today's START HERE block, You › Learning the app, News's
  // dismissed-only pin) — the client no longer reads or writes this
  // column, and the pinned News articles carry the teaching alone. LEFT
  // IN PLACE ON PURPOSE, dormant not load-bearing — same rollback
  // reasoning as `warmup` above (the API stays additive-only between
  // tags, and the server route still accepts/returns the field).
  startHereDismissed: boolean("start_here_dismissed").notNull().default(false),
});

export const testHistory = pgTable(
  "test_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    distance: testDistanceEnum("distance").notNull(),
    splitSeconds: real("split_seconds").notNull(),
    deltaSeconds: real("delta_seconds"),
    loggedAt: timestamp("logged_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Phase BL PR B (baseline-onboarding spec rev 2, "Recording
    // (decoupled)"): the saved session log this test result was measured
    // in — the IDEMPOTENCY KEY for POST /api/test-history's client-fired
    // record call. UNIQUE (Postgres NULLS DISTINCT, so the legacy keyless
    // rows — every row written before migration 0014, plus anything the
    // zero-sender isTestResult path might ever append — coexist freely);
    // a double-fire's second insert conflicts here instead of writing a
    // delta-0 duplicate. ON DELETE SET NULL, not CASCADE: test history is
    // its own record of what the rower measured, and deleting the log row
    // (which un-counts plan progress) must not silently rewrite the test
    // trend 8B will render. Nullable and additive — no backfill; a
    // pre-0014 row simply has no link.
    sessionLogId: uuid("session_log_id")
      .references(() => sessionLogs.id, { onDelete: "set null" })
      .unique(),
  },
  (t) => [index("test_history_user_id_idx").on(t.userId)],
);

// --- Phase 6H: News read state ------------------------------------------

// No FK to content: articles are bundled in the client, so a slug unknown
// to the current bundle is simply ignored at display time (a rollback
// keeps its reads). Composite PK makes markRead an idempotent no-op insert.
export const articleReads = pgTable(
  "article_reads",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.slug] })],
);

// --- Wave E PR1 / PR1.75a: Concept2 stored shapes ------------------------

// Wave E PR1 (2026-08-31-concept2-logbook-design.md §Stored shapes, TRIAD).
export const weightClassEnum = pgEnum("weight_class", ["H", "L"]);

// Wave E PR1.75a (2026-09-02-concept2-pr175-app-bind-design.md §1-§3, TRIAD):
// which surface MINTED an attempt, derived server-side from which credential
// `requireUser` resolved (bearer -> native, cookie -> web) — never a
// client-asserted value, so there is nothing for an attacker to choose.
export const linkSurfaceEnum = pgEnum("link_surface", ["native", "web"]);

// One row per linked user. Tokens are plain columns behind the same trust
// boundary every credential this app holds already lives behind (spec:
// at-rest encryption with the key in the same process env is a lock taped
// to its own key — attacked at the anchor; held). Tokens are never
// serialized to any client response — `routes/concept2.ts` returns
// {available, linked, weightClass, c2UserId, needsReauth}, the account's
// numeric id but never a token (PR2's sent-state/View-on-Concept2 needs).
export const concept2Links = pgTable("concept2_links", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // PR1.75a D1 (APPROVED, James 2026-09-02): one Concept2 account can be
  // linked to at most ONE Ergomatic user per database. A detective control
  // against RFC 9700 §4.5 code injection (the common case: the victim is
  // already linked) and against two Ergomatic accounts writing one
  // logbook. Cost, named in the design: a shared household Concept2 login
  // can never sit behind two Ergomatic accounts. `upsertLink` maps the
  // violation to `Concept2LinkConflictError`; both completion routes answer
  // 409.
  c2UserId: integer("c2_user_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  weightClass: weightClassEnum("weight_class").notNull(),
  // Set (never deleteLink) by any AUTOMATIC path when C2's token endpoint
  // answers 400/401 on a refresh: C2 documents those statuses for OUR
  // malformed request and OUR client credentials too (their 400 example
  // says `Check the "client_secret" parameter`), so an automatic delete
  // would destroy links — and re-ask the one PII question — on a server
  // bug or a rotated C2_CLIENT_SECRET. With this flag a misclassified
  // status costs a re-consent prompt, never the stored weight_class.
  // Cleared by the callback's upsert on successful relink. Measured
  // grounds: docs/monitor/c2-crossconnect-2026-09/refresh-probe-2026-08-31.md.
  needsReauthAt: timestamp("needs_reauth_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Single-use, 15-minute link attempts. The nonce (`state`) CORRELATES a
// completion request to its mint attempt; the completing PRINCIPAL is
// authenticated separately on both completion routes (a cookie session on
// the web callback, a bearer on `POST /exchange`) and must equal `user_id`
// BEFORE the row is consumed and BEFORE any Concept2 call — PR1.75a,
// design §5/§6. `surface` says which route may complete the row; the
// `(nonce, user_id, surface)` predicate lives IN `consumeAttemptFor`'s
// DELETE statement (stores/concept2.ts), so a wrong principal or wrong
// surface consumes nothing by construction.
//
// UNIQUE(user_id): one live attempt per user, ENFORCED — mint is one
// `INSERT ... ON CONFLICT (user_id) DO UPDATE` (design §2). PROVEN by
// `concept2.integration.test.ts`'s deterministic race test ("createAttempt
// genuinely BLOCKS on an uncommitted conflicting row") that two concurrent
// mints serialize on this index and exactly one row survives. The old
// delete-then-insert image does NOT yield two rows on this schema: measured
// against real Postgres (Task 2 fix round 2), it dies with
// `concept2_auth_attempts_user_id_unique` propagating unmapped — "two rows"
// was the PRE-0020 behaviour, before that index existed.
//
// Migration 0020 rollback, both halves (design §2): (1) `surface` carries
// DEFAULT 'web' for ROLLBACK, not for writes — the PR1.5 image's
// `createAttempt` inserts no `surface`, and a plain NOT NULL would make
// every mint 500 after a rollback; new code always writes it explicitly.
// (2) The surviving UNIQUE(user_id) turns the rollback image's concurrent
// double-mint (delete-then-insert) into a unique violation (500) rather
// than two rows — accepted: a rare self-race, strictly smaller blast radius
// than the unbounded attempts the index prevents.
export const concept2AuthAttempts = pgTable("concept2_auth_attempts", {
  nonce: text("nonce").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  weightClass: weightClassEnum("weight_class").notNull(),
  surface: linkSurfaceEnum("surface").notNull().default("web"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
