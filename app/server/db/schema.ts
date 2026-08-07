import {
  boolean,
  check,
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
export const heldResultEnum = pgEnum("held_result", ["held", "under", "over"]);
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
    held: heldResultEnum("held").notNull(),
    pain: integer("pain").notNull(),
    notes: text("notes"),
    steps: jsonb("steps").notNull(),
  },
  (t) => [
    index("session_logs_user_id_idx").on(t.userId),
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
  warmupMinutes: real("warmup_minutes").notNull().default(10),
  warmupOverride: boolean("warmup_override").notNull().default(false),
  countdownSeconds: integer("countdown_seconds").notNull().default(10),
  paceToleranceSeconds: real("pace_tolerance_seconds").notNull().default(1),
  accentColor: text("accent_color").notNull().default("#b5341f"),
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
