import { Router, type RequestHandler } from "express";
import { parseBulk } from "../../domain/bulk.js";
import { bucketsForCap } from "../../domain/duration.js";
import { estimateMinutes } from "../../domain/expand.js";
import { isOnboardingTitle } from "../../domain/onboarding.js";
import { PLANS, type PlanCode } from "../../domain/plans.js";
import { suggest, type LibraryEntry } from "../../domain/suggest.js";
import type { Baselines, Difficulty, Step } from "../../domain/types.js";
import { validateWorkoutInput } from "../../domain/validate.js";
import type { ArticleReadsStore } from "../stores/articleReads.js";
import type { BaselinesStore } from "../stores/baselines.js";
import {
  CursorNotFoundError,
  type ActualSource,
  type HeldResult,
  type LogPatch,
  type LogsStore,
  type LogStep,
  type Thumbs,
} from "../stores/logs.js";
import type { PlanKey, PlanStateStore } from "../stores/planState.js";
import type {
  PreferencesRow,
  PreferencesStore,
  WarmupSetting,
} from "../stores/preferences.js";
import type { TestHistoryStore } from "../stores/testHistory.js";
import type { NewWorkoutInput, WorkoutsStore } from "../stores/workouts.js";

export interface Stores {
  baselines: BaselinesStore;
  workouts: WorkoutsStore;
  logs: LogsStore;
  planState: PlanStateStore;
  preferences: PreferencesStore;
  testHistory: TestHistoryStore;
  articleReads: ArticleReadsStore;
}

export interface DataRouterDeps {
  stores: Stores;
  requireUser: RequestHandler;
}

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const ACTUAL_SOURCES: ActualSource[] = ["assumed", "stopwatch", "pm5"];
const HELD_RESULTS: HeldResult[] = ["held", "under", "over"];
const THUMBS_VALUES: Thumbs[] = ["up", "down"];
const PLAN_KEYS: PlanKey[] = ["sprint", "head"];
const ACCENT_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
// The warm-up setting's bounds (2026-08-09 design §2). NOTE: these are NOT
// a reuse of domain/validate.ts's work-step duration bounds, despite the
// spec's own framing — checked directly against that file: its time bound
// (`wholeSecond(minutes, SECOND, 180)`) permits fractional, whole-SECOND-
// precision minutes up to 180, and its distance bound (`int(meters, 100,
// 42195)`) tops out at marathon distance; neither matches a warm-up's
// integer-minutes-to-30 / integer-meters-to-10000 shape (only the distance
// FLOOR of 100 happens to coincide). The rest ceiling (595s = 9:55) isn't in
// domain/validate.ts at all — it's `domain/monitor/program.ts`'s
// `MAX_REST_SECONDS`, confirmed against `docs/monitor/pm5-interface-notes.md`
// Table 19. These bounds are therefore the plan's own literal values, not a
// derived constant.
const WARMUP_MINUTES_MIN = 1;
const WARMUP_MINUTES_MAX = 30;
const WARMUP_METERS_MIN = 100;
const WARMUP_METERS_MAX = 10000;
const WARMUP_REST_SECONDS_MIN = 5;
const WARMUP_REST_SECONDS_MAX = 595;

function isValidWarmup(v: unknown): v is WarmupSetting {
  if (!isRec(v)) return false;
  const durationOk =
    (v.kind === "time" &&
      typeof v.minutes === "number" &&
      Number.isInteger(v.minutes) &&
      v.minutes >= WARMUP_MINUTES_MIN &&
      v.minutes <= WARMUP_MINUTES_MAX) ||
    (v.kind === "distance" &&
      typeof v.meters === "number" &&
      Number.isInteger(v.meters) &&
      v.meters >= WARMUP_METERS_MIN &&
      v.meters <= WARMUP_METERS_MAX);
  if (!durationOk) return false;
  const restOk =
    v.restSeconds === undefined ||
    (typeof v.restSeconds === "number" &&
      Number.isInteger(v.restSeconds) &&
      v.restSeconds >= WARMUP_REST_SECONDS_MIN &&
      v.restSeconds <= WARMUP_REST_SECONDS_MAX);
  if (!restOk) return false;
  // Reject stray keys (e.g. both `minutes` and `meters` present): only
  // `kind`, the one duration field its kind implies, and an optional
  // `restSeconds` are allowed.
  const allowed = new Set([
    "kind",
    v.kind === "time" ? "minutes" : "meters",
    "restSeconds",
  ]);
  return Object.keys(v).every((k) => allowed.has(k));
}
// Conservative slug shape, validated here rather than against the bundled
// registry: client and server versions may skew mid-deploy, and an unknown
// slug is harmless — it's ignored at display time.
const SLUG_RE = /^[a-z0-9-]{1,64}$/;
// Postgres uuid columns 500 on a malformed literal (22P02) rather than just
// finding no row; guard the shape here so a bad id is an ordinary 404/400
// instead of leaking a DB error as a 500.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Bounds for a real erg split: 60s/500m is world-class-plus fast, 240s/500m
// is a slow walk pace. Anything outside is almost certainly a data-entry
// mistake, not a real baseline.
const MIN_SPLIT_SECONDS = 60;
const MAX_SPLIT_SECONDS = 240;

function badRequest(
  res: Parameters<RequestHandler>[1],
  error: string,
  field?: string,
) {
  res.status(400).json(field ? { error, field } : { error });
}

function notFound(res: Parameters<RequestHandler>[1]) {
  res.status(404).json({ error: "not found" });
}

// Global (starter-library) workouts are visible to every user but never
// mutable by any of them — a 403 before any store write, distinct from the
// 404 a caller gets for an id they can't see at all.
function starterReadonly(res: Parameters<RequestHandler>[1]) {
  res.status(403).json({ error: "starter_readonly" });
}

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// From-the-log spec (2026-08-18), §3: each returns an error MESSAGE (or
// null when the value is acceptable) instead of writing the response
// directly, so `POST /api/logs` and `PATCH /api/logs/:id` share exactly
// ONE copy of each field's validation rule ("value validation reuses
// POST's validators by IMPORT" — both routes below call these, neither
// re-implements them). Each mirrors what used to be POST's own inline
// check verbatim: undefined and null are both acceptable (POST always
// treated an absent/explicit-null reflection field as "not answered");
// anything else must be a genuine member/shape, or it's rejected with the
// exact same message POST has always returned.
function heldError(value: unknown): string | null {
  if (
    value !== undefined &&
    value !== null &&
    !HELD_RESULTS.includes(value as HeldResult)
  ) {
    return "held must be one of held|under|over or null";
  }
  return null;
}

function painError(value: unknown): string | null {
  if (
    value !== undefined &&
    value !== null &&
    (typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 5)
  ) {
    return "pain must be an integer 1..5 or null";
  }
  return null;
}

function thumbsError(value: unknown): string | null {
  if (
    value !== undefined &&
    value !== null &&
    !THUMBS_VALUES.includes(value as Thumbs)
  ) {
    return "thumbs must be one of up|down or null";
  }
  return null;
}

function notesError(value: unknown): string | null {
  if (value !== null && value !== undefined && typeof value !== "string") {
    return "notes must be a string or null";
  }
  return null;
}

// Bounds for a logged step: 30-600s/500m spans "sprinting" to "recovery
// paddle"; spm 10..60 covers rest to a max-rate finish sprint; meters
// mirrors validateSteps' distance-step bound; seconds caps at 4 hours.
// Named (2026-08-08, Phase 7C Task 3) alongside the pm5-only bands below so
// the two sets read as siblings, not magic numbers vs. named constants.
const STEP_MIN_SPLIT_SECONDS = 30;
const STEP_MAX_SPLIT_SECONDS = 600;
const STEP_SPM_MIN = 10;
const STEP_SPM_MAX = 60;

// Amendment (2026-08-08, Phase 7C Task 3, spec §6): a pm5-only widening for
// actualSplit/spm. Walk-4 hardware (docs/monitor/pm5-interface-notes.md
// §18, 2026-08-08 entry) produced avgSpm 66 and splits past 600 on light
// rowing — real monitor readings at low load, not data-entry mistakes — and
// the adversarial review's B3 finding is that the manual bands above reject
// both. These bands apply ONLY when actualSource is "pm5"; the manual bands
// are UNCHANGED for assumed/stopwatch (a stopwatch entry claiming 66 spm is
// still a typo). Split's own lower bound is "greater than 0", not a second
// named minimum: `buildMonitorLogSteps` only ever sets actualSplit when the
// wire reading is itself a positive number (its own `avgSplit > 0` gate).
//
// Branch review Medium-1 (2026-08-09): the wire's own top end (`avgSplit`
// up to 6553.5, `avgSpm` up to 255) exceeds both bands above, which used to
// 400 the WHOLE log for a genuinely-measured, wire-legal reading with no
// recoverable retry. `buildMonitorLogSteps` now mirrors these exact numbers
// client-side (`MONITOR_SPLIT_MAX`/`MONITOR_SPM_MIN`/`MAX`,
// `src/session/logDraft.ts`) and drops `actualSplit`/`spm` rather than
// posting a value past them — a well-behaved client can no longer trigger
// these bands at all. They stay exactly as they are here to reject a
// hand-crafted liar, same role `HR_MIN`/`MAX` below already has.
const PM5_MAX_SPLIT_SECONDS = 6000;
const PM5_SPM_MIN = 0;
const PM5_SPM_MAX = 99;

// Phase LT spec 1 (2026-08-18), §2: `spm` above is now the AUTHORED target
// on every door — its own bounds (0..99 pm5, 10..60 manual) are UNCHANGED,
// so a v0.12.0-era client posting the pre-split shape (a monitor step's
// `spm` holding the OLD measured value) still validates and 201s
// byte-identically (additive-only between tags). `actualSpm` is new: the
// monitor door's MEASURED average, own field-named bound. Min 1, not 0
// ("POST already bounds pm5 spm 0..99; the new actualSpm key gets the same
// bounds with min 1" — the u8 wire field's own floor,
// `src/session/logDraft.ts`'s `MONITOR_SPM_MIN` doc comment carries the
// full justification: sub-1 unrepresentable, so an exact 0 can only mean
// "no strokes"). Max reuses `PM5_SPM_MAX` — the same upper bound `spm`
// already enforces for a pm5-sourced reading, since both fields describe
// the SAME wire quantity (`IntervalActual.avgSpm`), just two different
// moments of it.
const ACTUAL_SPM_MIN = 1;

// Heart rate bound (2026-08-08, Phase 7C Task 3, spec §6): mirrors the
// client's own `MONITOR_HR_MIN`/`MONITOR_HR_MAX` (`src/session/
// logDraft.ts`) — the standard ANT+/BLE heart-rate profile's field range.
// avgHr never arrives out-of-band from a well-behaved client (it drops the
// field itself, per that module's own doc comment); this band exists to
// reject a hand-crafted liar, not a real monitor reading, so it is NOT
// source-scoped like the pm5 bands above.
const HR_MIN = 20;
const HR_MAX = 254;

// Amendment (2026-08-02, Phase 6C Task 1.5): Task 1's `logDraft.ts` proved
// this validation predates effort refs — `targetSplit` was required
// unconditionally, but an effort step's frozen split is `estimationSplit`'s
// internal guess, never a real prescription (the 5G rule: never present an
// estimate as a target), so an effort step could never be logged as
// designed. Resolution: `targetSplit` is now OPTIONAL. `actualSplit` and
// `actualSource` are now a PAIRED unit — both present (existing bounds/enum
// apply) or both absent; one without the other is a 400 naming the pairing.
// An effort step in practice omits all three (no target to hold, so no
// actual to attribute to one — see `logDraft.ts`'s "neither key" rule for a
// discarded/effort phase).
//
// This is additive-compatible: loosening required -> optional only ever
// ACCEPTS payloads the old code rejected, so every payload that used to be
// valid (which always sent targetSplit, and always sent actualSplit paired
// with actualSource per the client's own "assumed"/"stopwatch" rules) is
// still valid unchanged — the between-tags API discipline holds. See
// docs/superpowers/specs/2026-08-02-phase-6c-log-session-design.md's
// Amendment section.
function validateLogStepEntry(
  raw: unknown,
  index: number,
): { ok: true; step: LogStep } | { ok: false; message: string } {
  const at = (msg: string) => `steps[${index}]: ${msg}`;
  if (!isRec(raw)) return { ok: false, message: at("must be an object") };

  const {
    label,
    targetSplit,
    actualSplit,
    actualSource,
    spm,
    meters,
    seconds,
    avgHr,
    actualSeconds,
    actualMeters,
    actualSpm,
  } = raw;

  if (typeof label !== "string" || label.length < 1 || label.length > 80) {
    return { ok: false, message: at("label must be a string, 1..80 chars") };
  }
  if (
    targetSplit !== undefined &&
    (typeof targetSplit !== "number" ||
      targetSplit < STEP_MIN_SPLIT_SECONDS ||
      targetSplit > STEP_MAX_SPLIT_SECONDS)
  ) {
    return {
      ok: false,
      message: at(
        `targetSplit must be a number, ${STEP_MIN_SPLIT_SECONDS}..${STEP_MAX_SPLIT_SECONDS}`,
      ),
    };
  }
  if (
    actualSource !== undefined &&
    !ACTUAL_SOURCES.includes(actualSource as ActualSource)
  ) {
    return {
      ok: false,
      message: at("actualSource must be one of assumed|stopwatch|pm5"),
    };
  }
  // PM5 PAIRING EXCEPTION (spec §3/§6, Phase 7C Task 3): actualSource "pm5"
  // is valid without actualSplit (an unusable avgSplit reading, while the
  // other measured fields are still real). assumed/stopwatch keep the
  // ordinary paired-unit rule from the Task 1.5 amendment above.
  const pm5WithoutSplit = actualSource === "pm5" && actualSplit === undefined;
  if (
    !pm5WithoutSplit &&
    (actualSplit === undefined) !== (actualSource === undefined)
  ) {
    return {
      ok: false,
      message: at(
        "actualSplit and actualSource must both be present or both be absent",
      ),
    };
  }
  if (actualSplit !== undefined) {
    const isPm5 = actualSource === "pm5";
    const validSplit =
      typeof actualSplit === "number" &&
      (isPm5
        ? actualSplit > 0 && actualSplit <= PM5_MAX_SPLIT_SECONDS
        : actualSplit >= STEP_MIN_SPLIT_SECONDS &&
          actualSplit <= STEP_MAX_SPLIT_SECONDS);
    if (!validSplit) {
      return {
        ok: false,
        message: at(
          isPm5
            ? `actualSplit must be a number, > 0 and <= ${PM5_MAX_SPLIT_SECONDS}`
            : `actualSplit must be a number, ${STEP_MIN_SPLIT_SECONDS}..${STEP_MAX_SPLIT_SECONDS}`,
        ),
      };
    }
  }
  if (spm !== undefined) {
    const isPm5 = actualSource === "pm5";
    const spmMin = isPm5 ? PM5_SPM_MIN : STEP_SPM_MIN;
    const spmMax = isPm5 ? PM5_SPM_MAX : STEP_SPM_MAX;
    if (
      typeof spm !== "number" ||
      !Number.isInteger(spm) ||
      spm < spmMin ||
      spm > spmMax
    ) {
      return {
        ok: false,
        message: at(`spm must be an integer, ${spmMin}..${spmMax}`),
      };
    }
  }
  if (
    meters !== undefined &&
    (typeof meters !== "number" ||
      !Number.isInteger(meters) ||
      meters < 100 ||
      meters > 42195)
  ) {
    return { ok: false, message: at("meters must be an integer, 100..42195") };
  }
  if (
    seconds !== undefined &&
    (typeof seconds !== "number" || seconds < 1 || seconds > 14400)
  ) {
    return { ok: false, message: at("seconds must be a number, 1..14400") };
  }
  if (
    avgHr !== undefined &&
    (typeof avgHr !== "number" ||
      !Number.isInteger(avgHr) ||
      avgHr < HR_MIN ||
      avgHr > HR_MAX)
  ) {
    return {
      ok: false,
      message: at(`avgHr must be an integer, ${HR_MIN}..${HR_MAX}`),
    };
  }
  if (
    actualSeconds !== undefined &&
    (typeof actualSeconds !== "number" || actualSeconds < 0)
  ) {
    return {
      ok: false,
      message: at("actualSeconds must be a number, >= 0"),
    };
  }
  if (
    actualMeters !== undefined &&
    (typeof actualMeters !== "number" || actualMeters < 0)
  ) {
    return {
      ok: false,
      message: at("actualMeters must be a number, >= 0"),
    };
  }
  if (
    actualSpm !== undefined &&
    (typeof actualSpm !== "number" ||
      !Number.isInteger(actualSpm) ||
      actualSpm < ACTUAL_SPM_MIN ||
      actualSpm > PM5_SPM_MAX)
  ) {
    return {
      ok: false,
      message: at(
        `actualSpm must be an integer, ${ACTUAL_SPM_MIN}..${PM5_SPM_MAX}`,
      ),
    };
  }

  // Built from an explicit field list (never spread/cast the raw input) so
  // any extra keys the client sent are silently dropped, not persisted.
  const step: LogStep = { label };
  if (targetSplit !== undefined) step.targetSplit = targetSplit;
  if (actualSplit !== undefined) step.actualSplit = actualSplit;
  if (actualSource !== undefined)
    step.actualSource = actualSource as ActualSource;
  if (avgHr !== undefined) step.avgHr = avgHr;
  if (actualSeconds !== undefined) step.actualSeconds = actualSeconds;
  if (actualMeters !== undefined) step.actualMeters = actualMeters;
  if (spm !== undefined) step.spm = spm;
  if (actualSpm !== undefined) step.actualSpm = actualSpm;
  if (meters !== undefined) step.meters = meters;
  if (seconds !== undefined) step.seconds = seconds;
  return { ok: true, step };
}

export function createDataRouter({
  stores,
  requireUser,
}: DataRouterDeps): Router {
  const router = Router();
  // Scoped to /api: this router is mounted at the app root (see app.ts), and
  // an unscoped `router.use(requireUser)` would gate every request that
  // reaches it — including "/" and the SPA fallback — not just this
  // router's own /api/* routes. Caught by e2e testing against the real
  // compose stack (unit tests only ever exercise this router in isolation,
  // or via createApp() with stores: null, so it was never mounted alongside
  // the SPA fallback in a way that could expose this).
  router.use("/api", requireUser);

  // -- baselines ------------------------------------------------------

  router.get("/api/baselines", async (req, res) => {
    const row = await stores.baselines.get(req.user!.id);
    res.json(row ?? { k2Seconds: null, k6Seconds: null });
  });

  router.put("/api/baselines", async (req, res) => {
    const body = isRec(req.body) ? req.body : {};
    const patch: { k2Seconds?: number; k6Seconds?: number } = {};

    for (const field of ["k2Seconds", "k6Seconds"] as const) {
      const value = body[field];
      if (value === undefined) continue;
      if (
        typeof value !== "number" ||
        value < MIN_SPLIT_SECONDS ||
        value > MAX_SPLIT_SECONDS
      ) {
        badRequest(
          res,
          `${field} must be between ${MIN_SPLIT_SECONDS} and ${MAX_SPLIT_SECONDS}`,
          field,
        );
        return;
      }
      patch[field] = value;
    }

    await stores.baselines.put(req.user!.id, patch);

    if (body.isTestResult === true) {
      if (patch.k2Seconds !== undefined) {
        await stores.testHistory.append(req.user!.id, {
          distance: "2k",
          splitSeconds: patch.k2Seconds,
        });
      }
      if (patch.k6Seconds !== undefined) {
        await stores.testHistory.append(req.user!.id, {
          distance: "6k",
          splitSeconds: patch.k6Seconds,
        });
      }
    }

    const row = await stores.baselines.get(req.user!.id);
    res.json(row ?? { k2Seconds: null, k6Seconds: null });
  });

  // -- workouts ---------------------------------------------------------

  router.get("/api/workouts", async (req, res) => {
    const userId = req.user!.id;
    // Two queries total, never per-row: lastDonePerWorkout is one grouped
    // query (see stores/logs.ts) — the library needs recency for every row.
    const [rows, lastDone] = await Promise.all([
      stores.workouts.list(userId),
      stores.logs.lastDonePerWorkout(userId),
    ]);
    res.json(
      rows.map((w) => ({ ...w, lastDoneDaysAgo: lastDone[w.id] ?? null })),
    );
  });

  router.post("/api/workouts", async (req, res) => {
    const validated = validateWorkoutInput(req.body);
    if (!validated.ok) {
      badRequest(res, validated.errors.join("; "));
      return;
    }
    const row = await stores.workouts.create(req.user!.id, {
      ...validated.workout,
      source: "user",
    });
    res.status(201).json(row);
  });

  router.get("/api/workouts/:id", async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      notFound(res);
      return;
    }
    const row = await stores.workouts.get(req.user!.id, req.params.id);
    if (!row) {
      notFound(res);
      return;
    }
    res.json(row);
  });

  router.put("/api/workouts/:id", async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      notFound(res);
      return;
    }
    const existing = await stores.workouts.get(req.user!.id, req.params.id);
    if (!existing) {
      notFound(res);
      return;
    }
    if (existing.isGlobal) {
      starterReadonly(res);
      return;
    }
    const validated = validateWorkoutInput(req.body);
    if (!validated.ok) {
      badRequest(res, validated.errors.join("; "));
      return;
    }
    const row = await stores.workouts.update(
      req.user!.id,
      req.params.id,
      validated.workout,
    );
    // The store no-ops (returns null) on an id it can't find, but we
    // already confirmed existence above, so this can't happen in practice.
    res.json(row ?? existing);
  });

  router.delete("/api/workouts/:id", async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      notFound(res);
      return;
    }
    const existing = await stores.workouts.get(req.user!.id, req.params.id);
    if (!existing) {
      notFound(res);
      return;
    }
    if (existing.isGlobal) {
      starterReadonly(res);
      return;
    }
    await stores.workouts.remove(req.user!.id, req.params.id);
    res.status(204).end();
  });

  router.post("/api/workouts/bulk", async (req, res) => {
    const text = isRec(req.body) ? req.body.text : undefined;
    if (typeof text !== "string" || text.trim() === "") {
      badRequest(res, "text is required", "text");
      return;
    }

    const parsed = parseBulk(text);
    const errors: Array<{ line: number | null; message: string }> =
      parsed.errors.map((e) => ({
        line: e.line,
        message: e.message,
      }));

    const toCreate: NewWorkoutInput[] = [];
    for (const workout of parsed.workouts) {
      const validated = validateWorkoutInput(workout);
      if (!validated.ok) {
        errors.push({
          line: null,
          message: `workout "${workout.title}": ${validated.errors.join("; ")}`,
        });
        continue;
      }
      toCreate.push({ ...validated.workout, source: "user" });
    }

    // All-or-nothing (Phase 5B merge: a plain per-block loop stranded
    // already-landed blocks on a later failure, and re-importing the same
    // paste duplicated them). Any error anywhere in the paste — parse-level
    // or validation-level, above — means NOTHING in this request gets
    // created; only a fully clean paste reaches `createMany`, which is
    // itself one transaction in the real store (`workouts.ts`) exactly
    // like `logs.ts`'s own `create` wraps its insert + plan_state upsert
    // in one `db.transaction` — reused here rather than re-implemented.
    // A dropped `wu` line is NOT an error and so never trips this gate: a
    // paste whose only oddity is warm-up lines still imports in full.
    const created =
      errors.length === 0 && toCreate.length > 0
        ? await stores.workouts.createMany(req.user!.id, toCreate)
        : [];

    // `droppedWarmups` (2026-08-09 warmup-setting spec §6): well-formed `wu`
    // lines parseBulk silently strips rather than erroring — the import
    // screen's own notice (`domain/bulk.ts`'s `droppedWarmupNotice`) is the
    // only place that count is ever surfaced, so it has to leave the route
    // in the response. Task 5 wired the identical notice for the local-draft
    // strip door; this was the import door's own half, left open until now
    // (task-5-report's Concern #2).
    res.json({ created, errors, droppedWarmups: parsed.droppedWarmups });
  });

  // -- logs ---------------------------------------------------------------

  // From-the-log spec (2026-08-18), §3: the `?plan=` variant is an ADDITION
  // to this existing route, not a new one — Plan's done-row link resolves
  // from `GET /api/logs?plan=<key>` returning `{ links: [...] }`, newest-
  // wins per index (see `stores/logs.ts`'s `listPlanLinks`). It short-
  // circuits before the ordinary cursor-list branch below: the two shapes
  // ({links:[...]} vs. a plain row array) are mutually exclusive per
  // request, distinguished by whether `plan` was sent at all.
  router.get("/api/logs", async (req, res) => {
    if (req.query.plan !== undefined) {
      if (
        typeof req.query.plan !== "string" ||
        !PLAN_KEYS.includes(req.query.plan as PlanKey)
      ) {
        badRequest(res, "plan must be one of sprint|head", "plan");
        return;
      }
      const links = await stores.logs.listPlanLinks(
        req.user!.id,
        req.query.plan,
      );
      res.json({ links });
      return;
    }

    const rawLimit = Number(req.query.limit);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(100, Math.floor(rawLimit))
        : 20;

    // Cursor = the last row's id alone, resolved entirely in SQL (spec
    // §3) — the route never touches a timestamp here, only validates the
    // id's SHAPE. "Unknown/foreign before id" (well-formed but doesn't
    // resolve to one of this caller's own rows) is a 400, not a silent
    // empty page: `stores.logs.list` throws `CursorNotFoundError` for
    // exactly that case.
    let before: string | undefined;
    if (req.query.before !== undefined) {
      if (
        typeof req.query.before !== "string" ||
        !UUID_RE.test(req.query.before)
      ) {
        badRequest(res, "before must be a valid id", "before");
        return;
      }
      before = req.query.before;
    }

    try {
      res.json(await stores.logs.list(req.user!.id, limit, before));
    } catch (err) {
      if (err instanceof CursorNotFoundError) {
        badRequest(res, "before does not reference an existing log", "before");
        return;
      }
      throw err;
    }
  });

  // The from-the-log view's fetch (spec §3): full row, steps included.
  // Owner-checked and 404 on BOTH absence and another user's id — the
  // store's own `WHERE user_id = $userId` predicate makes the two cases
  // structurally indistinguishable, so there's no existence leak to guard
  // separately. Malformed (non-uuid) ids 404 the same way `/api/workouts/
  // :id` does, before ever reaching the store (a real Postgres 22P02
  // dressed up as a 500 otherwise).
  router.get("/api/logs/:id", async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      notFound(res);
      return;
    }
    const row = await stores.logs.get(req.user!.id, req.params.id);
    if (!row) {
      notFound(res);
      return;
    }
    res.json(row);
  });

  // The API's first UPDATE (spec §3). Every key is independently
  // optional; presence is read with `in` (the `PUT /api/prefs` warmup
  // precedent) so a key that's ABSENT never touches its column, while a
  // key that's PRESENT-and-null clears it. Unknown keys (anything other
  // than thumbs/held/pain/notes) are silently ignored, matching POST and
  // `PUT /api/prefs` — a 400 on an unknown key would give this API two
  // personalities and break additive-only in the new-client/old-server
  // direction (spec §3, antagonist B6). An empty accepted-key set (an
  // empty body, or a body carrying only unknown keys) is therefore a
  // no-op READ, exactly like `PUT /api/prefs`'s own empty-patch guard —
  // `stores.logs.update` is never called with an empty patch object.
  router.patch("/api/logs/:id", async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      notFound(res);
      return;
    }
    const body = isRec(req.body) ? req.body : {};
    const patch: LogPatch = {};

    if ("held" in body) {
      const err = heldError(body.held);
      if (err) {
        badRequest(res, err, "held");
        return;
      }
      patch.held = (body.held as HeldResult | null) ?? null;
    }
    if ("pain" in body) {
      const err = painError(body.pain);
      if (err) {
        badRequest(res, err, "pain");
        return;
      }
      patch.pain = (body.pain as number | null) ?? null;
    }
    if ("thumbs" in body) {
      const err = thumbsError(body.thumbs);
      if (err) {
        badRequest(res, err, "thumbs");
        return;
      }
      patch.thumbs = (body.thumbs as Thumbs | null) ?? null;
    }
    if ("notes" in body) {
      const err = notesError(body.notes);
      if (err) {
        badRequest(res, err, "notes");
        return;
      }
      patch.notes = (body.notes as string | null) ?? null;
    }

    if (Object.keys(patch).length === 0) {
      const row = await stores.logs.get(req.user!.id, req.params.id);
      if (!row) {
        notFound(res);
        return;
      }
      res.json(row);
      return;
    }

    const row = await stores.logs.update(req.user!.id, req.params.id, patch);
    if (!row) {
      notFound(res);
      return;
    }
    res.json(row);
  });

  // Log-delete spec (2026-08-18), §2: the API's first DELETE. Owner-
  // checked exactly like GET/PATCH above (404 on absence OR another
  // user's row — `stores.logs.delete`'s `deleted: false` is structurally
  // the same "no existence leak" signal `get`/`update` already give via
  // a null return). A second delete of the same id 404s the same way —
  // there's no soft-delete state to distinguish "already gone" from
  // "never existed" (spec's own ruling: hard delete, no trash). Response
  // is `200 {unCounted}` per §2 — the server reporting what it actually
  // did, never a bare 204 (the client's post-delete UI depends on this).
  router.delete("/api/logs/:id", async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      notFound(res);
      return;
    }
    const result = await stores.logs.delete(req.user!.id, req.params.id);
    if (!result.deleted) {
      notFound(res);
      return;
    }
    res.json({ unCounted: result.unCounted });
  });

  router.post("/api/logs", async (req, res) => {
    const body = isRec(req.body) ? req.body : {};

    if (
      typeof body.workoutTitle !== "string" ||
      body.workoutTitle.length === 0
    ) {
      badRequest(res, "workoutTitle is required", "workoutTitle");
      return;
    }
    if (typeof body.workoutType !== "string" || body.workoutType.length === 0) {
      badRequest(res, "workoutType is required", "workoutType");
      return;
    }
    let workoutId: string | null = null;
    if (body.workoutId !== null && body.workoutId !== undefined) {
      if (typeof body.workoutId !== "string" || !UUID_RE.test(body.workoutId)) {
        badRequest(res, "workoutId must be a valid id or null", "workoutId");
        return;
      }
      // Ownership check up front: an absent/foreign workoutId would otherwise
      // either 500 (FK violation, 23503) or silently attribute the log to a
      // workout the user doesn't own.
      const owned = await stores.workouts.get(req.user!.id, body.workoutId);
      if (!owned) {
        badRequest(res, "workoutId does not exist", "workoutId");
        return;
      }
      workoutId = body.workoutId;
    }
    // Post-workout-summary spec (2026-08-17), §3: every reflection field is
    // now optional — the redesigned card never forces a HELD/PAIN/THUMBS
    // choice (James's ruling). Absent (undefined) OR explicit null both
    // store null; anything else must be a genuine member of the enum, still
    // 400 with the field named on a bad value. This is additive-compatible:
    // the old shape (held+pain always present) still validates identically,
    // so a v0.10.0/v0.10.1 client keeps working unchanged.
    const heldErr = heldError(body.held);
    if (heldErr) {
      badRequest(res, heldErr, "held");
      return;
    }
    const painErr = painError(body.pain);
    if (painErr) {
      badRequest(res, painErr, "pain");
      return;
    }
    const thumbsErr = thumbsError(body.thumbs);
    if (thumbsErr) {
      badRequest(res, thumbsErr, "thumbs");
      return;
    }
    const notesErr = notesError(body.notes);
    if (notesErr) {
      badRequest(res, notesErr, "notes");
      return;
    }
    // Task 3 (outside-plan logging): optional, defaults to true below (the
    // pre-Task-3 behavior every existing caller already gets) — present
    // means the caller is deliberately opting a row OUT of plan progress,
    // so a malformed value here is a genuine client bug, not silently
    // coerced.
    if (
      body.advancesPlan !== undefined &&
      typeof body.advancesPlan !== "boolean"
    ) {
      badRequest(res, "advancesPlan must be a boolean", "advancesPlan");
      return;
    }
    // Phase 7C Task 3 (spec §5/§6): session-scoped provenance, optional.
    // Absent stores null (see stores/logs.ts's create()); present must be a
    // non-empty string within the wire's own device-name length (bounded
    // here, not just relied on client-side).
    if (
      body.deviceName !== undefined &&
      (typeof body.deviceName !== "string" ||
        body.deviceName.length < 1 ||
        body.deviceName.length > 64)
    ) {
      badRequest(res, "deviceName must be a string, 1..64 chars", "deviceName");
      return;
    }
    // From-the-log spec (2026-08-18), §2/§3: the three hero numbers,
    // optional/nullable exactly like held/pain/thumbs above — a v0.11.0
    // client sends none of these and still 201s, storing null for all
    // three (additive-only between tags). Bounds-checked here like every
    // other numeric field on this route: this is sanity, not truth — an
    // authenticated client can still post a wrong number about its own
    // rowing, accepted and recorded as the trust boundary (the server
    // cannot re-derive what only the device saw, spec §2).
    if (
      body.avgSplitSeconds !== undefined &&
      body.avgSplitSeconds !== null &&
      (typeof body.avgSplitSeconds !== "number" ||
        !Number.isFinite(body.avgSplitSeconds) ||
        body.avgSplitSeconds <= 0 ||
        body.avgSplitSeconds > 3600)
    ) {
      badRequest(
        res,
        "avgSplitSeconds must be a finite number > 0 and <= 3600, or null",
        "avgSplitSeconds",
      );
      return;
    }
    if (
      body.distanceMeters !== undefined &&
      body.distanceMeters !== null &&
      (typeof body.distanceMeters !== "number" ||
        !Number.isInteger(body.distanceMeters) ||
        body.distanceMeters <= 0 ||
        body.distanceMeters > 1_000_000)
    ) {
      badRequest(
        res,
        "distanceMeters must be a whole number > 0 and <= 1000000, or null",
        "distanceMeters",
      );
      return;
    }
    if (
      body.timeSeconds !== undefined &&
      body.timeSeconds !== null &&
      (typeof body.timeSeconds !== "number" ||
        !Number.isFinite(body.timeSeconds) ||
        body.timeSeconds <= 0 ||
        body.timeSeconds > 604800)
    ) {
      badRequest(
        res,
        "timeSeconds must be a finite number > 0 and <= 604800, or null",
        "timeSeconds",
      );
      return;
    }
    if (!Array.isArray(body.steps) || body.steps.length === 0) {
      badRequest(res, "steps must be a non-empty array", "steps");
      return;
    }
    // Mirrors validateSteps' 100-step cap on workouts; a logged session can
    // run a bit longer in practice (warm-up + reps + rest entries all count
    // separately here), so the ceiling is doubled rather than reused as-is.
    if (body.steps.length > 200) {
      badRequest(res, "steps must have at most 200 entries", "steps");
      return;
    }
    const steps: LogStep[] = [];
    for (let i = 0; i < body.steps.length; i++) {
      const result = validateLogStepEntry(body.steps[i], i);
      if (!result.ok) {
        badRequest(res, result.message, "steps");
        return;
      }
      steps.push(result.step);
    }

    const baselines = await stores.baselines.get(req.user!.id);
    const { id } = await stores.logs.create(req.user!.id, {
      workoutId,
      workoutTitle: body.workoutTitle,
      workoutType: body.workoutType,
      baselineK2: baselines?.k2Seconds ?? null,
      baselineK6: baselines?.k6Seconds ?? null,
      held: (body.held as HeldResult | null | undefined) ?? null,
      pain: (body.pain as number | null | undefined) ?? null,
      notes: (body.notes as string | null | undefined) ?? null,
      steps,
      advancesPlan: (body.advancesPlan as boolean | undefined) ?? true,
      deviceName: (body.deviceName as string | undefined) ?? null,
      thumbs: (body.thumbs as Thumbs | null | undefined) ?? null,
      avgSplitSeconds:
        (body.avgSplitSeconds as number | null | undefined) ?? null,
      timeSeconds: (body.timeSeconds as number | null | undefined) ?? null,
      distanceMeters:
        (body.distanceMeters as number | null | undefined) ?? null,
    });
    res.status(201).json({ id });
  });

  // -- plan -----------------------------------------------------------

  async function planResponse(userId: string) {
    const row = await stores.planState.get(userId);
    const planKey = row?.planKey ?? null;
    const doneN = row?.doneN ?? 0;
    const sequence = planKey
      ? PLANS[planKey].sessions.map((code, index) => ({
          index,
          code,
          status:
            index < doneN ? "done" : index === doneN ? "today" : "upcoming",
        }))
      : [];
    return { planKey, doneN, sequence };
  }

  router.get("/api/plan", async (req, res) => {
    res.json(await planResponse(req.user!.id));
  });

  router.put("/api/plan", async (req, res) => {
    const body = isRec(req.body) ? req.body : {};
    const userId = req.user!.id;

    if (body.reset === true) {
      await stores.planState.reset(userId);
      res.json(await planResponse(userId));
      return;
    }

    if (body.planKey === undefined) {
      badRequest(res, "planKey or reset is required");
      return;
    }
    if (!PLAN_KEYS.includes(body.planKey as PlanKey)) {
      badRequest(res, "planKey must be one of sprint|head", "planKey");
      return;
    }

    const current = await stores.planState.get(userId);
    // Re-selecting the SAME plan must be a no-op: planState.set() always
    // zeroes done_n, and a same-key PUT (e.g. a client re-syncing its
    // choice) must not silently wipe progress.
    if (current?.planKey !== body.planKey) {
      await stores.planState.set(userId, body.planKey as PlanKey);
    }
    res.json(await planResponse(userId));
  });

  // -- prefs ------------------------------------------------------------

  router.get("/api/prefs", async (req, res) => {
    res.json(await stores.preferences.get(req.user!.id));
  });

  router.put("/api/prefs", async (req, res) => {
    const body = isRec(req.body) ? req.body : {};
    const patch: Partial<PreferencesRow> = {};

    if (body.difficulties !== undefined) {
      if (
        !Array.isArray(body.difficulties) ||
        body.difficulties.length === 0 ||
        !body.difficulties.every((d) => DIFFICULTIES.includes(d as Difficulty))
      ) {
        badRequest(
          res,
          "difficulties must be a non-empty subset of easy|medium|hard",
          "difficulties",
        );
        return;
      }
      patch.difficulties = body.difficulties as Difficulty[];
    }
    if (body.timeCapMinutes !== undefined) {
      if (
        typeof body.timeCapMinutes !== "number" ||
        !Number.isInteger(body.timeCapMinutes) ||
        body.timeCapMinutes < 10 ||
        body.timeCapMinutes > 300
      ) {
        badRequest(
          res,
          "timeCapMinutes must be an integer 10..300",
          "timeCapMinutes",
        );
        return;
      }
      patch.timeCapMinutes = body.timeCapMinutes;
    }
    // Presence check, not `!== undefined`: an explicit `warmup: null` in the
    // body must CLEAR the setting, so "the key is absent" and "the key is
    // present and null" have to read differently here — the only field on
    // this route where that distinction matters (2026-08-09 design §2).
    // NOT LOAD-BEARING AT RUNTIME, asked for twice (T2's own Finding 1;
    // block2-review §3) and recorded a third time here: no test can
    // actually discriminate `"warmup" in body` from `body.warmup !==
    // undefined` through the real stack. `express.json()`'s `JSON.parse`
    // can never produce a present key whose value is `undefined`, and the
    // client can't produce one either (`usePreferences.ts`'s `save` sends
    // `JSON.stringify(patch)`, which drops an `undefined`-valued key
    // entirely) — so the two forms agree on every body a real request can
    // ever carry. Kept as the more defensive form anyway, at zero cost;
    // a future "simplification" to `!== undefined` would not fail any
    // committed test, and that is expected, not a coverage gap.
    if ("warmup" in body) {
      if (body.warmup !== null && !isValidWarmup(body.warmup)) {
        badRequest(
          res,
          "warmup must be null or a valid warm-up shape",
          "warmup",
        );
        return;
      }
      patch.warmup = body.warmup as WarmupSetting | null;
    }
    if (body.countdownSeconds !== undefined) {
      if (
        typeof body.countdownSeconds !== "number" ||
        !Number.isInteger(body.countdownSeconds) ||
        body.countdownSeconds < 0 ||
        body.countdownSeconds > 60
      ) {
        badRequest(
          res,
          "countdownSeconds must be an integer 0..60",
          "countdownSeconds",
        );
        return;
      }
      patch.countdownSeconds = body.countdownSeconds;
    }
    if (body.paceToleranceSeconds !== undefined) {
      if (
        typeof body.paceToleranceSeconds !== "number" ||
        body.paceToleranceSeconds < 0 ||
        body.paceToleranceSeconds > 10
      ) {
        badRequest(
          res,
          "paceToleranceSeconds must be 0..10",
          "paceToleranceSeconds",
        );
        return;
      }
      patch.paceToleranceSeconds = body.paceToleranceSeconds;
    }
    if (body.accentColor !== undefined) {
      if (
        typeof body.accentColor !== "string" ||
        !ACCENT_COLOR_RE.test(body.accentColor)
      ) {
        badRequest(
          res,
          "accentColor must be a #rrggbb hex string",
          "accentColor",
        );
        return;
      }
      patch.accentColor = body.accentColor;
    }
    if (body.startHereDismissed !== undefined) {
      if (typeof body.startHereDismissed !== "boolean") {
        badRequest(
          res,
          "startHereDismissed must be a boolean",
          "startHereDismissed",
        );
        return;
      }
      patch.startHereDismissed = body.startHereDismissed;
    }

    // An empty patch (body `{}`, or all-unknown keys) must be a no-op read,
    // not a write: the real store's put() builds its upsert's `SET` clause
    // directly from `patch`, and Postgres rejects `ON CONFLICT DO UPDATE
    // SET` with nothing to set — a 500, not a 400, if we let it through.
    if (Object.keys(patch).length === 0) {
      res.json(await stores.preferences.get(req.user!.id));
      return;
    }

    await stores.preferences.put(req.user!.id, patch);
    res.json(await stores.preferences.get(req.user!.id));
  });

  // -- article reads ----------------------------------------------------

  router.get("/api/article-reads", async (req, res) => {
    res.json({ slugs: await stores.articleReads.list(req.user!.id) });
  });

  router.put("/api/article-reads/:slug", async (req, res) => {
    const { slug } = req.params;
    if (!SLUG_RE.test(slug)) {
      badRequest(res, "slug must match ^[a-z0-9-]{1,64}$", "slug");
      return;
    }
    await stores.articleReads.markRead(req.user!.id, slug);
    res.status(204).end();
  });

  // Idempotent: deleting a slug that was never read (or already deleted)
  // still 204s — MARK ALL FOUR UNREAD (You › Learning the app) fires four
  // of these unconditionally, partial-failure-safe by re-run.
  router.delete("/api/article-reads/:slug", async (req, res) => {
    const { slug } = req.params;
    if (!SLUG_RE.test(slug)) {
      badRequest(res, "slug must match ^[a-z0-9-]{1,64}$", "slug");
      return;
    }
    await stores.articleReads.unmarkRead(req.user!.id, slug);
    res.status(204).end();
  });

  // -- test history ---------------------------------------------------

  router.get("/api/test-history", async (req, res) => {
    res.json(await stores.testHistory.list(req.user!.id));
  });

  // -- today ------------------------------------------------------------

  router.get("/api/today", async (req, res) => {
    const userId = req.user!.id;
    const baselinesRow = await stores.baselines.get(userId);
    if (
      !baselinesRow ||
      baselinesRow.k2Seconds === null ||
      baselinesRow.k6Seconds === null
    ) {
      res.status(422).json({ error: "baselines_required" });
      return;
    }
    const baselines: Baselines = {
      k2Seconds: baselinesRow.k2Seconds,
      k6Seconds: baselinesRow.k6Seconds,
    };

    const planRow = await stores.planState.get(userId);
    // No plan chosen yet: default to the sprint preset at day 0 rather than
    // erroring — /today should always have something to say. The response's
    // own `planKey` still reports null in that case (see below) so callers
    // can tell "no plan selected" apart from "sprint is selected".
    const effectivePlanKey: PlanKey = planRow?.planKey ?? "sprint";
    const doneN = planRow?.doneN ?? 0;
    const sequence = PLANS[effectivePlanKey].sessions;
    const todayCode: PlanCode = sequence[Math.min(doneN, sequence.length - 1)];

    const [prefs, workouts, lastDone] = await Promise.all([
      stores.preferences.get(userId),
      stores.workouts.list(userId),
      stores.logs.lastDonePerWorkout(userId),
    ]);

    // Controller addendum (Phase 6I Task 7, design spec's "invisible
    // outside onboarding" rule): the two designated GLOBAL onboarding
    // workouts never enter the suggestion pool here, mirroring the
    // client's own exclusion (Today.tsx's `entries`) — a veteran with real
    // baselines set (the only account this route ever runs for; see the
    // 422 guard above) must never be SUGGESTED "First 6k"/"First 2k".
    // Final-review fix (2026-08-09): also require `isGlobal` — a rower's
    // own CUSTOM workout that happens to share one of these titles
    // (`w.isGlobal === false`, `withIsGlobal`'s own `userId !== null`
    // case) is a real, ownable workout; excluding it by title alone
    // orphaned it from this route's suggestion pool with no way back.
    const library: LibraryEntry[] = workouts
      .filter((w) => !(isOnboardingTitle(w.title) && w.isGlobal))
      .map((w) => ({
        id: w.id,
        type: w.type,
        difficulty: w.difficulty,
        pain: w.pain,
        estMinutes: estimateMinutes(w.steps as Step[], baselines).minutes,
        lastDoneDaysAgo: lastDone[w.id] ?? null,
        // Round 2 (2026-08-04): LibraryEntry.isGlobal is required, mirroring
        // `w.isGlobal` from `stores.workouts.list()` (server/stores/workouts.ts's
        // own `withIsGlobal`) exactly.
        isGlobal: w.isGlobal,
      }));

    const suggestion = suggest({
      todayCode,
      library,
      prefs: {
        difficulties: prefs.difficulties,
        // Amendment (2026-08-04 PR #50 round): SuggestPrefs' own TIME field
        // is now a bucket union, not a single cap — bucketsForCap derives
        // the same set the client's own Today screen seeds a fresh day's
        // TIME defaults from (domain/duration.ts's own doc comment on why
        // this lives in domain/, not client-only code).
        durations: bucketsForCap(prefs.timeCapMinutes),
        // Round 2 (2026-08-04): lastDone/source are deliberately OMITTED
        // here, not set to null — server-side suggestions have no
        // client-side overrides to derive a LAST DONE/SOURCE preference
        // from at all (both are optional on SuggestPrefs for exactly this
        // reason; see that interface's own doc comment).
      },
    });

    res.json({
      recommendation: suggestion.recommendationId,
      reason: suggestion.reason,
      pool: suggestion.poolIds,
      todayCode,
      doneN,
      planKey: planRow?.planKey ?? null,
    });
  });

  return router;
}
