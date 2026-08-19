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

export const baselines = pgTable("baselines", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  k2Seconds: real("k2_seconds"),
  k6Seconds: real("k6_seconds"),
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
    workoutType: text("workout_type").notNull(),
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
    // The R-B number: a plain integer, the machine's whole-meter total
    // (work + rest + warm-up).
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
  // Phase 9's warmup-setting design (2026-08-09, §2): replaces the two
  // columns above (warmup_minutes/warmup_override — the override was never
  // consumed anywhere; minutes' one consumer, the Builder hint, is rewritten
  // against this column). Nullable; null (the default) means OFF for every
  // existing and new row alike, per James's ruling. Shape is
  // `server/stores/preferences.ts`'s `WarmupSetting | null`, validated on
  // PUT — this column carries whatever shape already passed that check.
  warmup: jsonb("warmup"),
  countdownSeconds: integer("countdown_seconds").notNull().default(10),
  paceToleranceSeconds: real("pace_tolerance_seconds").notNull().default(1),
  accentColor: text("accent_color").notNull().default("#b5341f"),
  // Phase 6I: START HERE's own dismissal, server-side so it's recoverable
  // from You (PUT IT BACK ON TODAY) rather than a client-local flag.
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
