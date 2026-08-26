import { useRef, useState } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api } from "../api";
import { useWorkouts, type LibraryWorkout } from "../api/useWorkouts";
import { useBaselines } from "../api/useBaselines";
import { usePlan } from "../api/usePlan";
import type { PlanData } from "../api/usePlan";
import type { HeldResult, Thumbs } from "../api/useRecentLogs";
import { fmtSplit } from "../../domain/format.js";
import { isEffortRef } from "../../domain/pace.js";
import { needsBaselines } from "../../domain/needsBaselines.js";
import type {
  Baselines,
  PaceBase,
  Step,
  WorkoutType,
} from "../../domain/types.js";
import { clearDraft, loadDraft, type SessionDraft } from "./draft";
import { isComplete } from "./engine";
import {
  buildLogSteps,
  buildManualLogSteps,
  buildMonitorLogSteps,
  MonitorLogSeedError,
  type LogStep,
} from "./logDraft";
import { clearRun, loadRun, type SessionRun } from "./run";
import {
  clearMonitorRun,
  loadMonitorRun,
  type MachineSummaryDetail,
  type MonitorRun,
} from "../monitor/monitorRun";
import type { SeriesData } from "../monitor/seriesRecorder";
import type { MonitorLogEntry } from "../monitor/eventLog";
import { useStagedDiscard } from "./useStagedDiscard";
import BackLink from "../shell/BackLink";
import PostWorkoutSummary, { singleTargetHint } from "./PostWorkoutSummary";
import { buildSummaryModel, type SummaryModel } from "./summaryModel";
import { postTestOffer, type PostTestOffer } from "./postTestOffer";
import PostTestPrompt from "./PostTestPrompt";
import { recordTestResult } from "../api/testHistory";

/** PACES LOCKED panel (README.md §7's own literal example: "PACES LOCKED AT
 *  2K 1:52.0 · 6K 2:02.0"). UNVERIFIED judgment call (Task 2 brief flagged
 *  this as the implementer's to make): the design's own Decisions table
 *  says the session door's paces are "locked at confirm time — survives
 *  baseline edits mid-session by construction," but `SessionRun` itself
 *  never stores the {k2Seconds,k6Seconds} pair it was built with (Task 1's
 *  own report: only each phase's already-RESOLVED `targetSplit` survives).
 *  Two honest options existed: (a) show the rower's CURRENT baselines with
 *  a caveat comment, or (b) reconstruct the value THIS run actually locked,
 *  exactly, from data already on hand. (a) was rejected because it would
 *  make the word "LOCKED" lie in precisely the case it exists to guard
 *  against — a baseline edited mid-session would make the panel disagree
 *  with the per-step splits rendered right below it, which stay genuinely
 *  frozen either way.
 *
 *  (b) is possible, exactly (not approximately), because `engine.ts`'s
 *  `buildRun` computes every split-ref phase's `targetSplit` as
 *  `baselines[base] + (rawOff + nudge)` (domain/expand.ts's `phases()`, fed
 *  the draft's EFFECTIVE steps — nudge already folded into `ref.off` there)
 *  — so for any phase whose authored step referenced `base`,
 *  `baselines[base] = phase.targetSplit - rawOff - nudge` is EXACT, using
 *  the same "recover the raw ref from the draft via `originalIndex`"
 *  technique `logDraft.ts`'s own `buildLogSteps` already established for
 *  step labels. Every phase referencing the same base within one run was
 *  built against the identical (per-run, frozen) baseline value, so the
 *  FIRST match is sufficient.
 *
 *  A workout with no step referencing a given base at all (e.g. built
 *  entirely from "6k" steps, or a Microburst-style all-effort workout with
 *  no split-ref step whatsoever) has nothing to reconstruct — this returns
 *  null, and `pacesLockedText` (below, F1 fix round) OMITS that base's slot
 *  entirely rather than fabricating a number from the rower's current
 *  baseline, which would have nothing to do with what this particular run
 *  actually locked (an earlier version of this panel rendered a literal
 *  "—" for the missing half instead — found, in review, to be what almost
 *  every real session would show, since (post the taste pass, 9b9fde5, which
 *  converted AT's last remaining 2k-base refs to 6k) no seeded library
 *  workout references both bases; see `pacesLockedText`'s own doc comment).
 *  `draft` should be the caller's
 *  match-checked draft (null when missing or foreign — see LogSession's own
 *  `matchedDraft`), never a draft this run wasn't built from: `rawOff`/
 *  `nudge` from the WRONG workout's steps would silently reconstruct a
 *  meaningless number instead of a real one.
 *
 *  Manual-door note (Task 3): this function is session-door-only — the
 *  manual door has no `SessionRun`/`SessionDraft` pair to reconstruct FROM
 *  at all, and doesn't need to: its baselines are read directly (current
 *  baselines ARE the lock for an off-app row, per the task brief), so it
 *  uses the simpler `manualLockedBaseline` below instead. */
function lockedBaseline(
  base: PaceBase,
  run: SessionRun,
  draft: SessionDraft | null,
): number | null {
  if (draft === null) return null;
  for (const phase of run.phases) {
    if (phase.type !== "work" || phase.targetKind !== "split") continue;
    const step = draft.steps[phase.originalIndex];
    if (
      step === undefined ||
      step.k !== "w" ||
      isEffortRef(step.ref) ||
      step.ref.base !== base
    ) {
      continue;
    }
    const nudge = draft.nudges[phase.originalIndex] ?? 0;
    // Every split-ref work phase gets a targetSplit (domain/expand.ts's
    // "case w"); the `!` documents that guarantee, same convention as
    // logDraft.ts's own identical assertion.
    return phase.targetSplit! - step.ref.off - nudge;
  }
  return null;
}

/** F1 (whole-branch review, Task 2 fix round): renders ONLY the bases the
 *  workout's own steps actually reference — never a bare dash. The
 *  original two-slot "2K … · 6K …" layout (matching README.md §7's own
 *  literal mock) was checked against all 35 seeded starters (this repo's
 *  original starter library, later retired at Phase 6E for a generated
 *  300-workout one) and found to be unconditionally wrong in production:
 *  not one referenced both "2k" and "6k" in the same workout (16 were
 *  2k-only, 18 were 6k-only, and Microburst referenced neither at all) — so
 *  the two-slot layout would show a permanent dash for one half of every
 *  real session logged (the generated library keeps to one base per
 *  workout exclusively — the taste pass, 9b9fde5, converted AT's last
 *  remaining 2k-base refs to 6k, so zero of its 300 entries mix both;
 *  before that pass, 3 did), violating the house "never a bare dash" rule
 *  this screen's own per-step list already honors. The two-slot form still
 *  renders correctly when both bases ARE present (see the dedicated test
 *  that pins this — a synthetic fixture, since the generated library no
 *  longer has a real example). `null`
 *  (both bases absent — an all-effort workout,
 *  or a mismatched/missing draft with nothing to reconstruct) means there
 *  is nothing honest to show at all; the caller omits the whole panel
 *  rather than rendering an empty "PACES LOCKED AT" label with no value.
 *  Recorded in docs/design/DEVIATIONS.md as a departure from §7's mock.
 *  Shared by both doors: `lockedBaseline` (session door) and
 *  `manualLockedBaseline` (manual door) both funnel through this one join,
 *  so neither can drift from the other's "never a bare dash" behavior. */
function pacesLockedText(k2: number | null, k6: number | null): string | null {
  const parts: string[] = [];
  if (k2 !== null) parts.push(`2K ${fmtSplit(k2)}`);
  if (k6 !== null) parts.push(`6K ${fmtSplit(k6)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Manual door's PACES LOCKED reconstruction (Task 3 brief: "the lock
 *  moment IS save time — current baselines are the truth"). Unlike the
 *  session door's `lockedBaseline`, there is no run/draft pair to
 *  back-calculate a frozen value FROM — the rower's CURRENT `baselines` are
 *  simply read as-is. The only work left is the SAME "referenced bases
 *  only" filter `pacesLockedText`'s caller applies for the session door
 *  (F1, above): a base no step in this workout ever references has nothing
 *  honest to show, so it's omitted rather than showing a value that has
 *  nothing to do with this workout.
 *
 *  Must-fix minor (whole-branch review): this used to run the referenced-
 *  base check over `liveSteps(steps)` rather than the raw `steps` array,
 *  with a comment claiming the reps-block EXPANSION was needed because "a
 *  reference buried inside a repeated block is still a real reference even
 *  though the raw array only lists it once" — that reasoning doesn't hold
 *  for a plain existence check: a step authored inside a reps block is
 *  already present, once, in the RAW `steps` array (`liveSteps` only
 *  changes how many times it appears, repeating it `count` times), and
 *  `.some()` only cares whether at least one match exists, not how many.
 *  Expanding first was a no-op that happened to read as thorough. Reading
 *  `steps` directly is both simpler and correct.
 *
 *  Phase 6I close-out fold (Task 2's deferred ledger item): `baselines` is
 *  now `Baselines | null` — `ManualDoorLog` (below) gates on
 *  `needsBaselines(steps)`, not bare `baselines === null`, so an
 *  effort-only workout can reach here with null baselines. `referenced`
 *  can only read true for a base some SPLIT-ref step names, and
 *  `needsBaselines` is exactly "some work step is a split ref" — so
 *  `referenced` and `baselines === null` can never both be true at once;
 *  the `!` below documents that invariant, not a runtime check. */
function manualLockedBaseline(
  base: PaceBase,
  steps: Step[],
  baselines: Baselines | null,
): number | null {
  const referenced = steps.some(
    (step) =>
      step.k === "w" && !isEffortRef(step.ref) && step.ref.base === base,
  );
  return referenced
    ? base === "2k"
      ? baselines!.k2Seconds
      : baselines!.k6Seconds
    : null;
}

// Task 1 (lost-monitor design spec): mirrors `recordPostSacrifice`'s own
// append idiom (below, module scope) onto the DIFFERENT stash
// `useMonitorSession.ts`'s own teardown now writes unconditionally —
// `ergomatic:last-session-log` in `localStorage`, not the rowed-only
// `ergomatic:last-rowed-log` in `sessionStorage`. `monitorModeRun` is a
// `from=monitor` arrival that just finished tearing down the connected
// session that sent it here, so this key is very likely to already hold
// that session's own exported ring — appending onto it, rather than
// starting a second stash, keeps one artifact for the whole story:
// what the session recorded, and what the log screen then found (or
// didn't). Best-effort and silent on any failure (missing/malformed
// stash, localStorage disabled) — diagnostics never block this screen's
// render.
const LOG_DOOR_MISS_CAPACITY = 500;

function recordLogDoorMiss(condition: string): void {
  try {
    const raw = localStorage.getItem("ergomatic:last-session-log");
    let entries = raw !== null ? (JSON.parse(raw) as MonitorLogEntry[]) : [];
    const nextSeq =
      entries.length > 0 ? entries[entries.length - 1]!.seq + 1 : 0;
    entries.push({
      seq: nextSeq,
      atMs: Date.now(),
      kind: "log-door-miss",
      detail: condition,
    });
    if (entries.length > LOG_DOOR_MISS_CAPACITY) {
      entries = entries.slice(entries.length - LOG_DOOR_MISS_CAPACITY);
    }
    localStorage.setItem("ergomatic:last-session-log", JSON.stringify(entries));
  } catch {
    // Best-effort diagnostics; never block or complicate this screen's render.
  }
}

/** The monitor mode gate (7C spec §4) — the manual door's route
 *  (`/library/:id/log`) is ALSO where `WorkoutDetail.tsx`'s
 *  `handleConnectedEnded` sends a just-finished connected session
 *  (`?from=monitor`). Engaging the monitor mode on that same URL requires
 *  ALL FOUR of the following, independently — a miss on any one of them
 *  falls straight through to today's manual form, byte-for-byte (the
 *  "hijack pin": a stale completed `MonitorRun` sitting in storage must
 *  never silently take over a bookmarked or reload-of `/library/:id/log`
 *  that carries no `from=monitor` flag at all):
 *
 *  1. the `from=monitor` search param is present — the flag is an INTENT,
 *     not evidence on its own (a reload after a successful save, or a
 *     stale/shared URL, still carries it with nothing behind it);
 *  2. `loadMonitorRun()` returns a record, and it's finished
 *     (`completedAt !== null`) — the evidence the flag alone can't supply;
 *  3. that record's own `workoutId` matches THIS route's `:id` — a
 *     connected session for a DIFFERENT workout must never prefill this
 *     one;
 *  4. `logSeed` exists and aligns with `program.intervals` — proven by
 *     actually calling `buildMonitorLogSteps` rather than duplicating its
 *     own alignment check here, so the two can never drift apart.
 *
 *  **Fix round 1 (review finding #1):** condition 4's `catch` disqualifies
 *  the record on ANY exception the builder throws, not only its documented
 *  `MonitorLogSeedError` — `isMonitorRun` (`monitorRun.ts`) is *deliberately
 *  shallow* (its own doc comment: "shaped enough not to crash the screens
 *  that read it immediately, not a deep per-interval domain validation"),
 *  so a record can pass that check while still carrying a malformed
 *  `actuals` entry (e.g. a tampered/corrupted localStorage write leaves
 *  `actuals: [null]`) that `buildMonitorLogSteps` never anticipated —
 *  reaching, say, `actual.index` on a `null` and throwing a plain
 *  `TypeError`, not a `MonitorLogSeedError`. The spec's own rule for this
 *  whole gate is "any miss falls through to today's manual form untouched"
 *  (§4) — the same "malformed shape is discarded rather than crashing the
 *  caller" discipline `loadMonitorRun`'s own "Resilience #5" already
 *  applies one layer down. A narrower `instanceof MonitorLogSeedError`
 *  check (this function's own pre-fix-round shape) let an unanticipated
 *  builder exception escape uncaught, straight out of this `useState` lazy
 *  initializer's render — the log door's one truly unrecoverable crash
 *  path, for exactly the class of resilience scenario (a hand-edited or
 *  browser-extension-corrupted record) this file's sibling loaders already
 *  guard against. Never re-attempt anything against `run` once ANY
 *  exception fires here — the record is simply untrustworthy for monitor
 *  mode, and manual is always a safe, fully-functional fallback.
 *
 *  Exported for tests (task brief): each condition gets its own
 *  independent-removal test against this one function, cheaper than
 *  driving the whole screen four times over. Reads `localStorage` via
 *  `loadMonitorRun()` the same way `loadRun`/`loadDraft` already do at this
 *  screen's other call sites, never a hook of its own.
 *
 *  **Task 1 (lost-monitor design spec): no longer side-effect-free.** A
 *  `from=monitor` arrival that finds no usable record is exactly the
 *  flagship shape this phase exists to make self-diagnosing, so every
 *  null-returning branch below (save the flag itself — an ordinary manual
 *  visit is not evidence of anything) makes one best-effort append onto
 *  `ergomatic:last-session-log` via `recordLogDoorMiss`, naming WHICH gate
 *  missed and never why. The RETURN VALUE and every condition's own logic
 *  are unchanged; this call site's `useState` lazy initializer may run
 *  twice under StrictMode in dev, which duplicates at most one diagnostic
 *  entry — harmless for a best-effort append, same posture every other
 *  writer onto this stash already takes. */
// eslint-disable-next-line react-refresh/only-export-components
export function monitorModeRun(
  search: URLSearchParams,
  workoutId: string,
): MonitorRun | null {
  if (search.get("from") !== "monitor") return null;
  const run = loadMonitorRun();
  if (run === null) {
    recordLogDoorMiss("no-run");
    return null;
  }
  if (run.completedAt === null) {
    recordLogDoorMiss("not-completed");
    return null;
  }
  if (run.workoutId !== workoutId) {
    recordLogDoorMiss("workout-id-mismatch");
    return null;
  }
  try {
    buildMonitorLogSteps(run);
  } catch {
    recordLogDoorMiss("log-steps-build-failed");
    return null;
  }
  return run;
}

/** Phase LM PR 1 Task 4 (lost-monitor design spec): the flagship arrival,
 *  as a predicate. TRUE only when this route was reached from the
 *  CONNECTED door (`?from=monitor`, `WorkoutDetail.tsx`'s
 *  `handleConnectedEnded`) and there is NO RECORD AT ALL in storage — the
 *  session where the app never heard a first pull, so `createMonitorRun`
 *  never fired and End had nothing to close.
 *
 *  **Deliberately narrower than "`monitorModeRun` returned null".** That
 *  function misses on four conditions and only the FIRST of them (no
 *  record) proves we hold nothing: a record that is merely unfinished, for
 *  another workout, or one whose `logSeed` no longer aligns can carry real
 *  PM5 readings we simply cannot render here. Saying "no reading" over
 *  those would be a claim we have not earned, so they keep the
 *  door-ambiguous `LOGGED BY HAND` they render today. The one rule this
 *  file already trusts for the same storage read applies: read
 *  `loadMonitorRun()` directly, never a state var.
 *
 *  Known and accepted: a RELOAD of this URL after a successful monitor-mode
 *  save also lands here (that save clears the record), and this predicate
 *  cannot tell it from the flagship. Both are "we hold no reading for the
 *  row you are about to save", which is what the label says — and the same
 *  pair `recordLogDoorMiss("no-run")` above already records as one class.
 *
 *  Exported for tests, same reasoning as `monitorModeRun` above. */
// eslint-disable-next-line react-refresh/only-export-components
export function connectedArrivalWithNoRecord(search: URLSearchParams): boolean {
  return search.get("from") === "monitor" && loadMonitorRun() === null;
}

/** Resolves the POST body's `workoutType` — `SessionRun` itself doesn't
 *  carry one (confirmed against run.ts's own shape, per the task brief's
 *  "UNVERIFIED — check before use"). Priority order:
 *  1. `matchedDraft.type` — the draft this run was actually built from
 *     carries `type` (draft.ts's own `SessionDraft` shape) and survives a
 *     LATER deletion of the workout from the library untouched (deleting a
 *     workout never touches localStorage), so this alone already covers
 *     "the workout may be deleted" honestly for the realistic case: a
 *     session run against a workout that still existed at start time.
 *  2. A `useWorkouts()` library lookup by `run.workoutId` — only reachable
 *     when `matchedDraft` is null (missing or foreign; see LogSession's own
 *     residual check) AND the workout is still findable. This is a genuine
 *     fallback, not the common path.
 *  3. "O2" — builderState.ts's own new-workout default, reused here as the
 *     same kind of placeholder, not a meaningful guess. Reachable only when
 *     BOTH of the above fail: no usable draft AND the workout gone from the
 *     library too (a corrupted/partial localStorage state, or a foreign
 *     draft for a since-deleted workout) — 6B's own guarantee (the draft is
 *     cleared only alongside a successful save, WorkoutDetail.tsx's own
 *     `clearRun` comment) means this shouldn't happen for a real session,
 *     but a real `WorkoutType` has to render either way (`TypeBadge`/
 *     `RecentLog.workoutType` both assume one) instead of crashing the
 *     screen that is the rower's only path to logging this session at all.
 *
 *  Session-door-only: the manual door reads `workout.type` straight off the
 *  `LibraryWorkout` it was fetched by id from (`ManualDoorLog` below) —
 *  there is no run/draft pair, and no fallback chain needed, since a
 *  missing workout is caught by ManualDoorLog's own "not in your library"
 *  guard before any of this would matter. */
function resolveWorkoutType(
  run: SessionRun,
  matchedDraft: SessionDraft | null,
  library: { id: string; type: WorkoutType }[],
): WorkoutType {
  if (matchedDraft !== null) return matchedDraft.type;
  const found =
    run.workoutId !== null
      ? library.find((w) => w.id === run.workoutId)
      : undefined;
  return found?.type ?? "O2";
}

// Shared by both doors — no closed-over state, so hoisted to module scope
// rather than redefined inside each door's own component (SessionDoorLog's
// pre-Task-3 version defined this as a local function; ManualDoorLog would
// otherwise need a byte-identical second copy).
async function postLog(body: Record<string, unknown>): Promise<Response> {
  return api("/api/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Fix round (MED-LOW/LOW-3): the POST sacrifice ring-logs itself — the
// live `MonitorEventLog` (`eventLog.ts`) this run's own recorder wrote to
// is long gone by the time this screen renders (it's exported and
// stashed at teardown, `useMonitorSession.ts` ~1470, well before
// `LogSession` ever mounts), so there's no live instance to `.record()`
// into. Instead this appends ONE more `MonitorLogEntry` (the exact
// `{seq, kind, detail}` shape `eventLog.ts` already defines) onto the
// SAME sessionStorage stash `MonitorLogRow` above already reads
// (`ergomatic:last-rowed-log` — the copy a ROWED session keeps, which
// this screen can only be showing for a run that was), so a systematic
// server-side refusal of `series` becomes visible in diagnostics exactly
// like every other monitor-session event, not just a client-console
// inference from network tab. Best-effort and silent on any failure
// (missing/malformed stash, sessionStorage disabled) — diagnostics never
// block or complicate a save.
//
// Task 4 handoff (task-2 review): this is a SECOND, independent writer
// onto the same stash `eventLog.ts`'s own live `record()` already writes
// — without its own cap, a sitting with repeated sacrifices (a retried
// save after a deleted workout, a flaky network) could grow this stash
// without bound, unlike every entry `record()` itself ever wrote
// (`eventLog.ts`'s own `DEFAULT_CAPACITY`). Mirrored here rather than
// imported: `DEFAULT_CAPACITY` is module-private to `eventLog.ts` and this
// function does not otherwise depend on that module at all.
const POST_SACRIFICE_LOG_CAPACITY = 500;

function recordPostSacrifice(status: number): void {
  try {
    const raw = sessionStorage.getItem("ergomatic:last-rowed-log");
    if (raw === null) return;
    let entries = JSON.parse(raw) as MonitorLogEntry[];
    const nextSeq =
      entries.length > 0 ? entries[entries.length - 1]!.seq + 1 : 0;
    entries.push({
      seq: nextSeq,
      // Phase LL Task 1: every OTHER writer onto this ring stamps `atMs`
      // now (`eventLog.ts`'s own `record()`); this second, independent
      // writer (this function's own header comment on why it exists at
      // all) matches that shape rather than leaving its one entry the
      // only unstamped one in a stash that is otherwise consistent.
      atMs: Date.now(),
      kind: "post-sacrifice",
      detail: `series dropped from POST /api/logs after status ${status}`,
    });
    // Same ring idiom as `eventLog.ts`'s own `record()`: drop the OLDEST
    // entries first, `seq` numbers never rewritten — the dropped entries'
    // own seqs are simply gone, exactly like the live log's own ring.
    if (entries.length > POST_SACRIFICE_LOG_CAPACITY) {
      entries = entries.slice(entries.length - POST_SACRIFICE_LOG_CAPACITY);
    }
    sessionStorage.setItem("ergomatic:last-rowed-log", JSON.stringify(entries));
  } catch {
    // Best-effort diagnostics; never block or complicate the save.
  }
}

// The part of the POST body that genuinely differs per door — where the
// workout identity/steps come FROM (a frozen `SessionRun` vs a fetched
// `LibraryWorkout`). `held`/`pain`/`notes` are NOT here: those are the
// shared form state `useLogForm` itself owns and merges in below.
interface LogFormFields {
  workoutId: string | null;
  workoutTitle: string;
  workoutType: WorkoutType;
  steps: LogStep[];
  // 7C spec §6: the monitor mode's ONLY addition to the shared body shape —
  // `run.deviceName`, spread straight onto the wire body below (`{
  // ...fields }`) the same way every other `LogFormFields` key already is.
  // Optional so the session/manual doors (which never set it) simply never
  // put the key on the wire at all, proving the server's own `?? null`
  // default the same way the outside-plan toggle's `advancesPlan` already
  // does for its own optional key.
  deviceName?: string;
  // From-the-log spec (2026-08-18), §2: the three stored-hero numbers,
  // spread straight from the door's own `SummaryModel.heroes` the same
  // optional-key way `deviceName` above already works — `summaryModel.ts`
  // is the ONE place that decides whether a given hero exists for this
  // door's run (monitor: all three when the run has them; timer: split/
  // time only, distance always absent; manual: heroes is always `{}`, so
  // all three read `undefined` here and JSON.stringify drops the key
  // entirely below, same as an unset `deviceName`). Never re-derived here.
  avgSplitSeconds?: number;
  timeSeconds?: number;
  distanceMeters?: number;
  // Series capture spec (2026-08-19), §3: the monitor mode's own second
  // addition, same optional-key idiom as `deviceName` above — attached
  // straight from `monitorRun.series` (undefined when the run has none:
  // an older record, a save-time sacrifice already dropped it client-side
  // — Task 2's own `seriesDropped` flag is the audit trail, never
  // re-derived here). Undefined here means `JSON.stringify` drops the key
  // entirely below, exactly like an absent `deviceName` already does.
  series?: SeriesData;
  // Phase LL Task 4 (design spec §4): the monitor mode's third addition,
  // same optional-key idiom as `deviceName`/`series` above — spread
  // straight from `monitorRun.endedBy` (undefined for the never-widened
  // v1/v2 record shape, or a record no writer has closed through the new
  // paths yet). Undefined here means `JSON.stringify` drops the key
  // entirely below, exactly like an absent `deviceName` already does; the
  // server's own `endedByError` (`routes/data.ts`) accepts absent, so
  // this never blocks a save. Typed off `MonitorRun` itself rather than
  // re-declaring the union here — one definition, `monitorRun.ts`'s own
  // `CloseReason | "interrupted"`.
  endedBy?: MonitorRun["endedBy"];
  // RC-1 (storage-spine design spec §3): the monitor mode's fourth
  // addition, same optional-key idiom as `deviceName`/`series`/`endedBy`
  // above — spread straight from `monitorRun`'s own four fields
  // (`monitorRun.ts`'s own doc comment: computed once, only for a natural
  // `endedBy === "finished"` close; undefined on every other close reason
  // and on any record saved before this task). Undefined here means
  // `JSON.stringify` drops the key entirely below, exactly like an absent
  // `deviceName` already does; the server's own validator
  // (`routes/data.ts`) accepts absent, so this never blocks a save. Never
  // re-derived here — `monitorRun.ts`'s writers are the one place that
  // decides these four numbers, same posture the three hero numbers
  // already have with `summaryModel.ts`.
  workSeconds?: number;
  workMeters?: number;
  restSeconds?: number;
  restMeters?: number;
  // RC-3 (storage-spine design spec §2, PR 1 Task 7): the monitor mode's
  // fifth addition, same optional-key idiom as `deviceName`/`series`/
  // `endedBy`/the four RC-1 fields above — spread straight from
  // `monitorRun.summaryTotals`/`summaryDetail`/`verificationBytes`
  // (Tasks 2-4), never re-derived here. Undefined here means
  // `JSON.stringify` drops the key entirely below, exactly like an absent
  // `deviceName` already does; the server's own validator (Task 6,
  // `routes/data.ts`) accepts absent, so this never blocks a save.
  // The build below guards `summaryDetail` being absent while
  // `summaryTotals` is present — a REAL historical shape, not merely a
  // type-system possibility: build 738's `appendSummaryObservations`
  // (`git show v0.21.0:app/src/monitor/monitorRun.ts`) wrote ONLY
  // `summaryTotals` (always) and `verificationBytes` (conditionally) —
  // `summaryDetail` did not exist on that build's `MonitorRun` at all.
  // An unsaved build-738-era run that survives the update and gets saved
  // through THIS code carries totals (and maybe bytes) with no detail,
  // so this guard is live, not dead defensive code. Same shape the
  // server-side integration test names "a build-738-era record's honest
  // shape" (`machineSummary.integration.test.ts`).
  machineWorkSeconds?: number;
  machineWorkMeters?: number;
  machineSummary?: {
    verificationBytes?: readonly number[];
  } & Partial<MachineSummaryDetail>;
}

/** Fix round 1 (whole-branch review, I1): the two doors' `handleSave` were
 *  ~45 lines of verbatim-duplicated behaviour (the held/pain/notes state
 *  quintet, body assembly, and — the part that actually carries the app's
 *  rules — the `field === "workoutId"` 400-retry policy and the error
 *  string). This hook makes it structurally impossible for the two doors'
 *  BEHAVIOUR to diverge: there is exactly one copy of the retry policy, not
 *  two that a future fix to one door could silently leave the other behind.
 *
 *  Each door supplies only what genuinely differs: `submit`'s own
 *  `LogFormFields` argument (workoutId/title/type/steps — where the
 *  workout identity comes from), and `onSaved` (what happens after a
 *  genuine 201 — the session door clears the draft/run records before
 *  navigating; the manual door never touched either in the first place, so
 *  it just navigates). Both still navigate to `/today` (README.md §7:
 *  "Save session ... returns to Today", true of the Log screen as a whole,
 *  not just the session door) — that call lives in each door's own
 *  `onSaved`, not here, since navigation itself isn't part of the shared
 *  save behaviour (a future third door could plausibly want to land
 *  somewhere else).
 *
 *  Post-workout-summary spec (2026-08-17), §2F/§3: the outside-plan TOGGLE
 *  Task 3 shipped here (`outsidePlan`/`setOutsidePlan`, seeded from
 *  `isOnboardingTitle(workoutTitle)`) is gone — "the toggle's death," per
 *  the spec's own words. There is no longer a persistent form-state bit to
 *  seed a default for at all: the choice between counting toward the plan
 *  and not is now made by which of the SAVE STACK's two buttons the rower
 *  taps (`PostWorkoutSummary`'s own `Log against plan`/`Save without
 *  logging`), decided at the moment of the tap, not pre-set at mount. This
 *  is a strict improvement over the old toggle's own known gap (its own
 *  header comment, retired along with it): the toggle could only default
 *  correctly for the session door, since the manual door's `workoutTitle`
 *  wasn't known synchronously at THIS hook's mount. Button order has no
 *  such constraint — `PostWorkoutSummary` itself derives which button
 *  leads at RENDER time (Phase 8A: `isOnboardingTitle(title)` plus the
 *  account's baselines state, both resolved by then on every door,
 *  monitor branch included). `submit` now takes an
 *  explicit `advancesPlan` option instead: omitted or `true` leaves the key
 *  off the wire entirely (proving the server's own `?? true` default, same
 *  as before); `{ advancesPlan: false }` is what `Save without logging`
 *  passes. */
function useLogForm(onSaved: (logId: string | null) => void) {
  const [held, setHeld] = useState<HeldResult | null>(null);
  const [pain, setPain] = useState<number | null>(null);
  // Post-workout-summary spec (2026-08-17), §3: `thumbs` joins the
  // held/pain/notes quintet — clearable the same way (tap the selected
  // option again to return to null), same reason as its siblings: it must
  // survive a failed save without forcing the rower to re-pick it.
  const [thumbs, setThumbs] = useState<Thumbs | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function submit(
    fields: LogFormFields,
    opts: { advancesPlan?: boolean } = {},
  ) {
    // Post-workout-summary spec (2026-08-17), §3: the reflection card is
    // now entirely optional (James's ruling) — Save is never gated on
    // held/pain/thumbs being chosen (both save buttons' `disabled` prop
    // now reads only `saving`). held/pain go on the wire as their raw
    // state, null included; the server stores null the same way it already
    // does for `notes`/`deviceName`.
    setSaving(true);
    setSaveError(null);
    const body: Record<string, unknown> = {
      ...fields,
      held,
      pain,
      thumbs,
      notes: notes.trim().length > 0 ? notes : null,
    };
    if (opts.advancesPlan === false) body.advancesPlan = false;
    // Branch review Minor: the server's own `deviceName` band is 1..64
    // chars (`data.ts`), but `webBluetooth.ts`/`capacitorBle.ts` both use
    // `device.name ?? "PM5"` (nullish, not `||`) — an empty advertised GATT
    // name (`""`) or one past 64 chars reaches `createMonitorRun` and this
    // body unguarded, and would otherwise 400 the WHOLE save with no
    // recoverable retry (the 400-retry above only ever strips `workoutId`).
    // Same "drop the field, never block the save" rule this branch already
    // applies to avgHr/actualSplit/spm (`logDraft.ts`'s `buildMonitorLogSteps`)
    // — the save always goes through; the server reads `deviceName` back as
    // null, same as any pre-7C row.
    if (
      typeof body.deviceName === "string" &&
      (body.deviceName.length === 0 || body.deviceName.length > 64)
    ) {
      delete body.deviceName;
    }
    try {
      // Fix round (MED-1): every retry below rebuilds from `currentBody`
      // — the LAST body actually posted — never the original `body`.
      // Rebuilding from the original would discard an EARLIER correction
      // on a later retry: workout deleted mid-session -> 400 workoutId ->
      // corrected retry (workoutId: null) ALSO fails, still carrying
      // `series` -> the sacrifice must strip series from THAT corrected
      // body, not re-post the original's now-stale workoutId (which is
      // guaranteed to 400 again, surfacing a failure the sacrifice exists
      // specifically to prevent).
      let currentBody = body;
      let res = await postLog(currentBody);
      // Retry once with `workoutId: null` ONLY when the 400 is specifically
      // about workoutId (the server's own `field` name on its error body —
      // server/routes/data.ts's `badRequest`) — e.g. the workout was
      // deleted between this door's mount and the Save click. Any other
      // 400 (a real validation bug in this screen's own payload) must
      // surface as a genuine failure, not be silently papered over by
      // stripping workoutId and resubmitting. The ONE place this policy
      // lives now, for both doors.
      if (res.status === 400 && currentBody.workoutId !== null) {
        let field: unknown;
        try {
          field = ((await res.json()) as { field?: unknown }).field;
        } catch {
          field = undefined;
        }
        if (field === "workoutId") {
          currentBody = { ...currentBody, workoutId: null };
          res = await postLog(currentBody);
        }
      }
      // Series capture spec (2026-08-19), §3: THE POST SACRIFICE — a
      // non-ok response to a body carrying `series` retries ONCE with the
      // key simply omitted, and only a failure of THAT retry surfaces the
      // save error. The rower can always save the run; only the trace is
      // sacrificed. Composes with the workoutId retry above (runs after
      // it, against whatever `currentBody` that retry left behind) rather
      // than replacing it: a 413 (this route's own route-scoped 1mb limit
      // still has a ceiling) is not a 400, so that block never fires for
      // it and this one does (the red-provable 413 leg); a 400 that WAS
      // about workoutId retries first, then lands here if the retry is
      // STILL not ok and still carries `series`. The audit trail is the
      // ring event below (LOW-3) — never a server-side "dropped" flag;
      // Task 2's `MonitorRun.seriesDropped` is the LOCALSTORAGE
      // sacrifice's own separate audit trail (a write-time quota
      // failure), not this one's.
      if (!res.ok && currentBody.series !== undefined) {
        recordPostSacrifice(res.status);
        const { series: _series, ...withoutSeries } = currentBody;
        currentBody = withoutSeries;
        res = await postLog(currentBody);
      }
      if (res.ok) {
        // Only ever fires on a genuine 201 — a failed save (network error,
        // a real validation 400, a 500) leaves the caller's own records
        // intact so the rower can retry without redoing anything.
        //
        // Phase BL PR B: the 201's own body carries the created log's id
        // ({ id } — data.ts's POST response), which the post-test
        // recording needs as its idempotency key. Parsed defensively:
        // an unreadable body degrades to null (the door then skips the
        // record call but still offers — the offer never depended on
        // the id), never to a failed save.
        let logId: string | null = null;
        try {
          const parsed = (await res.json()) as { id?: unknown };
          if (typeof parsed.id === "string") logId = parsed.id;
        } catch {
          logId = null;
        }
        onSaved(logId);
        return;
      }
      setSaveError("Couldn't save this session. Try again.");
    } catch {
      setSaveError("Couldn't save this session. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return {
    held,
    setHeld,
    pain,
    setPain,
    thumbs,
    setThumbs,
    notes,
    setNotes,
    saving,
    saveError,
    submit,
  };
}

/** LogSession: the Log screen's TWO doors (Phase 6C spec, "Doors" decision;
 *  Task 3 brief) — `/session/log` (the session door: a just-completed timer
 *  run) and `/library/:id/log` (the manual door: an off-app row logged
 *  straight from a workout's detail screen). Distinguished purely by
 *  whether a route `:id` param is present — react-router only ever matches
 *  one of these two routes for a given URL (AppRoutes.tsx), so `id`'s
 *  presence IS the door, not a heuristic. Each door is its own component
 *  below (`SessionDoorLog`/`ManualDoorLog`) rather than one component
 *  branching internally: the two read entirely different hooks
 *  (draft/run's `useState(loadX)` lazy-init pair vs `useWorkouts`/
 *  `useBaselines`), and conditionally skipping hooks inside one function
 *  body would violate their fixed call order — same reason
 *  `WorkoutDetail.tsx` splits into `WorkoutDetail`/`WorkoutDetailView`. */
export default function LogSession() {
  const { id } = useParams();
  return id !== undefined ? (
    <ManualDoorLog workoutId={id} />
  ) : (
    <SessionDoorLog />
  );
}

/** The recording's quiet door (walk-2026-08-16 close-out) — the monitor
 *  log row's sibling, same vocabulary, same invisibility to production.
 *  The walk proved the in-session sheet's Download button is unreachable
 *  at the one moment the operator wants it: the finish auto-navigates
 *  HERE and the sheet dies with the session, so James fell back to a
 *  DevTools console call that silently produced a program-less header.
 *  The recording seam itself survives that navigation
 *  (`transports/index.ts`'s latest-session-wins global, set only inside
 *  the dev/fake-monitor gate — absent in every production build, which is
 *  the whole render gate this row needs). `download()` is argument-less
 *  on purpose: nothing on this screen still holds the compiled program,
 *  and the header simply omits it (the replay tests never read it). */
function RecordingDownloadRow() {
  const [seam] = useState(() => window.__pm5Recording__ ?? null);
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");
  if (seam === null) return null;
  return (
    <button
      type="button"
      className="log-monitor-diag"
      onClick={() => {
        seam
          .download()
          .then(() => setState("saved"))
          .catch(() => setState("failed"));
      }}
    >
      {state === "idle"
        ? "RECORDING · DOWNLOAD"
        : state === "saved"
          ? "RECORDING · DOWNLOADED"
          : "RECORDING · FAILED"}
    </button>
  );
}

/** Reads the two stashes a connected session's teardown may have left
 *  behind, rowed one first: `ergomatic:last-rowed-log` (sessionStorage,
 *  written only when a run actually opened) falls back to
 *  `ergomatic:last-session-log` (localStorage, written UNCONDITIONALLY on
 *  every teardown as of Task 1, lost-monitor design spec) — the key that
 *  exists for the never-rowed case this component used to have nothing to
 *  show for. A session that opened a run writes both, so the more
 *  specific rowed key still wins whenever it exists; only the never-rowed
 *  case ever falls through to the second read. */
function readMonitorLogStash(): string | null {
  return (
    sessionStorage.getItem("ergomatic:last-rowed-log") ??
    localStorage.getItem("ergomatic:last-session-log")
  );
}

/** The wire log's one UI door (7B iteration, 2026-08-08 — James: "1 but I
 *  want it to not disrupt the product experience"). A connected session's
 *  teardown stashes its full trace (`useMonitorSession.ts`); the ended
 *  hand-off frame navigates HERE before the diagnostics sheet can be
 *  reached, so this screen is where the operator has always wanted the
 *  log and never had it. Deliberately whisper-quiet: absent entirely
 *  unless a stash exists, one mono caption line below the actions, no
 *  layout the manual path ever sees.
 *
 *  I2 fix (final-review): the button used to copy `stash` — a value read
 *  ONCE at mount via `useState`'s lazy initializer. The hold-open
 *  instrument (Phase RC spec 1) appends to the rowed key on
 *  release/expiry, up to 90s AFTER this screen has already mounted (the
 *  finish hand-off navigates here well before that window closes) — so
 *  the mount-time snapshot could never contain the held-open window, and
 *  exit criterion 1's claim that this button "shows the window" was false
 *  as shipped. `stash` now only gates whether the row renders at all; the
 *  CLICK handler re-reads live, so a hold that finished after mount is
 *  included.
 *
 *  **Task 1 (lost-monitor design spec): the never-rowed case used to have
 *  no key at mount and none ever materialized later either — that claim
 *  is why this whole task exists, and it is no longer true.**
 *  `readMonitorLogStash` falls back to the never-rowed key both at mount
 *  and at click time, so a session that never opened a run now renders
 *  and copies exactly like a rowed one. */
function MonitorLogRow() {
  const [stash] = useState<string | null>(() => {
    try {
      return readMonitorLogStash();
    } catch {
      return null;
    }
  });
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  if (stash === null) return null;
  return (
    <button
      type="button"
      className="log-monitor-diag"
      onClick={() => {
        // I2 fix: read live, not the mount-time closure — see this
        // component's own doc comment for why the mount-time value can be
        // stale by up to HOLD_OPEN_MS. Falls back to the mount-time
        // `stash` only if BOTH storages have become unreadable between
        // mount and click (extremely unlikely, but never worse than the
        // pre-fix behaviour).
        let latest: string | null;
        try {
          latest = readMonitorLogStash();
        } catch {
          latest = null;
        }
        void navigator.clipboard
          .writeText(latest ?? stash)
          .then(() => setCopied("copied"))
          .catch(() => setCopied("failed"));
      }}
    >
      {copied === "idle"
        ? "MONITOR LOG · COPY"
        : copied === "copied"
          ? "MONITOR LOG · COPIED"
          : "MONITOR LOG · COPY FAILED"}
    </button>
  );
}

/** The session door (README.md §7, `/session/log`) — the timer's hand-off
 *  from `/session/complete`, and Today's own unlogged line. Reads
 *  `run`/`draft` once at mount (lazy initializers, same idiom as every
 *  other session screen — Timer.tsx's own comment on this).
 *
 *  Ledger residual (Task 1's own progress.md, routed here): `buildLogSteps`'
 *  mismatch detection only catches a wrong-KIND step at a given
 *  `originalIndex`, not a same-shape draft for an entirely different
 *  workout — belt-and-braces, this compares `run.workoutId ===
 *  draft.workoutId` before trusting the draft for ANYTHING (step labels,
 *  the PACES LOCKED reconstruction, AND the workoutType fallback all share
 *  this one `matchedDraft` value): a foreign draft's `ref`/`nudges`/`type`
 *  would silently mislabel every one of those otherwise. A mismatch passes
 *  `null` through, engaging each function's own documented fallback. */
function SessionDoorLog() {
  const navigate = useNavigate();
  const [draft] = useState<SessionDraft | null>(() => loadDraft());
  const [run] = useState<SessionRun | null>(() => loadRun());
  const workoutsState = useWorkouts();
  const planState = usePlan();
  // Phase 8A (James's ruling 5): the save stack derives which button leads
  // from the workout title + the ACCOUNT's baselines state, so this door
  // now reads the same hook the manual door always has. NEVER a gate —
  // logging must not be hostage to this fetch (the same M1/M2 rule
  // `planState` follows above); while loading/errored, `accountBaselines`
  // below reads null, the identical value a genuinely-unset account has.
  const baselinesState = useBaselines();

  // Phase BL PR B: non-null from the moment a save of a designated test
  // with a measurable, complete result succeeds — the render below then
  // shows the post-save offer INSTEAD of navigating (post-save only is
  // binding, spec M6: mounting the offer above the save stack would swap
  // the two save buttons under the rower's thumb). The `run` state var is
  // read-once at mount, so the `run === null` redirect guard above stays
  // false even though `clearRun()` has already emptied storage.
  const [postSaveOffer, setPostSaveOffer] = useState<PostTestOffer | null>(
    null,
  );
  // The offer travels from `handleSave` (which sets it right before
  // `submit`) into the shared onSaved callback via this ref — the same
  // idiom `ManualDoorLog`'s two branches use, and the lint-clean
  // alternative to closing over a const declared later in this body.
  const pendingOfferRef = useRef<PostTestOffer | null>(null);

  // Only ever clears the draft/run records on a genuine 201 (`onSaved`
  // fires after that, never on a failed save) — a network error, a real
  // validation 400, or a 500 leaves both intact so the rower can retry
  // without having to redo the session.
  const {
    held,
    setHeld,
    pain,
    setPain,
    thumbs,
    setThumbs,
    notes,
    setNotes,
    saving,
    saveError,
    submit,
  } = useLogForm((logId) => {
    clearDraft();
    clearRun();
    const offer = pendingOfferRef.current;
    if (offer !== null) {
      // James's ruling (spec rev 2): every designated-test session with a
      // measurable result records — accept OR decline — so the record
      // fires HERE, before the prompt can even render, keyed to the log
      // the 201 minted. Fire-and-forget: recording never blocks the flow.
      if (logId !== null) {
        recordTestResult({
          distance: offer.distance,
          splitSeconds: offer.splitSeconds,
          logId,
        });
      }
      setPostSaveOffer(offer);
    } else {
      navigate("/today");
    }
  });
  // Task 3 (ui-fix round): the two-button `.baseline-confirm` side panel
  // this discard used to open is gone — replaced by the shared
  // `useStagedDiscard` machine and the level system's own in-place L4/
  // L4-armed idiom (WorkoutDetail.tsx's Delete workout, the post-workout-
  // summary spec's own Discard), so every staged-discard control in the app
  // shares one look AND one implementation. Behaviour is unchanged: still a
  // two-tap confirm, still clears both records with no POST, still lands on
  // /today.
  const discard = useStagedDiscard();

  // No run record, or a run that isn't actually complete yet (a direct/deep
  // nav here mid-session) — same guard SessionComplete.tsx's own screen
  // uses (`isComplete`, not a bare `completedAt` check). Deliberately does
  // NOT also require `draft !== null`: a missing/foreign draft degrades
  // (fallback labels, a dashed PACES LOCKED panel) rather than blocking the
  // rower's only path to logging a real, completed session.
  if (run === null || !isComplete(run)) {
    return <Navigate to="/today" replace />;
  }

  const matchedDraft =
    draft !== null && draft.workoutId === run.workoutId ? draft : null;

  // Must-fix minor (whole-branch review): `resolveWorkoutType`'s fallback
  // chain only needs a library lookup when there's no matched draft to read
  // `type` from directly (see its own doc comment's numbered priority
  // list) — while `useWorkouts()` is still loading, `library` below reads
  // as `[]` regardless of what's actually in it, so a Save pressed in that
  // window would silently post the "O2" placeholder as this session's real
  // type. Gated ONLY on that combination (no matched draft AND still
  // loading): a matched draft already has an authoritative type with
  // nothing to wait for, so this never flashes a loading screen in the
  // common case where nothing is actually unresolved.
  //
  // Fix round 2 (whole-branch review, M1/M2): `planState` no longer joins
  // this gate at all — a STALLED (not merely slow) `/api/plan` request (`
  // api()` is a bare `fetch` with no `AbortSignal.timeout`, and `usePlan`
  // only ever leaves `loading` on resolve or reject) used to park this
  // door at LOADING… forever: no Retry, no BackLink, no tab bar — the
  // exact "logging held hostage to the plan fetch" failure this door's own
  // comments elsewhere claim can't happen. `plan` (below) already reads as
  // null while `planState` is loading, the identical value it takes for a
  // genuine no-plan or plan-error state, so the toggle simply appears once
  // (and only once) the fetch resolves with an active plan — the form
  // itself never waits on it.
  if (matchedDraft === null && workoutsState.state === "loading") {
    return (
      <main className="screen">
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  // Task 3 (fix round 2, M1/M2): null means "render the form with no
  // toggle at all" — no active plan (`planKey === null`, the ordinary
  // freestyle case), the plan hook errored, OR the plan fetch simply
  // hasn't resolved yet. All three are deliberate: a rower whose plan
  // fetch failed, or hasn't returned yet, can still log their session
  // normally, just without the option to opt it out of a plan whose own
  // state this screen couldn't yet confirm.
  const plan: PlanData | null =
    planState.state === "ready" && planState.plan.planKey !== null
      ? planState.plan
      : null;

  // Fix round (C2): `plan` above conflates "no plan", "still loading" and
  // "hook errored" into the same `null` — correct for what button renders,
  // wrong for what `Save without logging` sends on the wire. Only a
  // RESOLVED plan fetch (`state === "ready"`) can tell the wire body
  // "genuinely omit this session from plan progress"; while the fetch is
  // loading or has errored, the server's own `?? true` default (`data.ts`)
  // must run unchanged — the same behavior the old, now-retired toggle had
  // (its key was simply never sent until the plan resolved). Sending an
  // explicit `false` during that window silently dropped `doneN` advancement
  // for a session that may have had an active plan the UI just hadn't
  // learned about yet.
  const saveWithoutLoggingOpts: { advancesPlan?: boolean } =
    planState.state === "ready" ? { advancesPlan: false } : {};

  // Phase 8A: the account's combined baseline pair, the save stack's
  // second real input (PostWorkoutSummary derives the 6I demotion from it
  // plus the title). Same partial-pair-reads-as-unset convention the
  // manual door already applies; loading/error read as null too (see the
  // hook's own comment above — a moment later the resolved fetch settles
  // which button leads, and the demotion is only ever a protection for an
  // account that has NO baselines).
  const accountBaselines: Baselines | null =
    baselinesState.state === "ready" &&
    baselinesState.baselines.k2Seconds !== null &&
    baselinesState.baselines.k6Seconds !== null
      ? {
          k2Seconds: baselinesState.baselines.k2Seconds,
          k6Seconds: baselinesState.baselines.k6Seconds,
        }
      : null;

  const library = workoutsState.state === "ready" ? workoutsState.workouts : [];
  const libraryWorkout =
    run.workoutId !== null
      ? library.find((w) => w.id === run.workoutId)
      : undefined;

  const workoutType = resolveWorkoutType(run, matchedDraft, library);
  const expectedPain = libraryWorkout?.pain ?? null;
  const logSteps = buildLogSteps(run, matchedDraft);
  const k2 = lockedBaseline("2k", run, matchedDraft);
  const k6 = lockedBaseline("6k", run, matchedDraft);
  const pacesText = pacesLockedText(k2, k6);
  // TS narrowing from the `run === null` guard above doesn't survive into a
  // function DECLARED later in this component (the arrow function passed
  // to `submit`, below) — a separately-typed `const` alias is the standard
  // fix, not a non-null assertion at each use site.
  const activeRun: SessionRun = run;

  // Post-workout-summary spec §2B: the summary's own heroes/rows/meta come
  // straight from `buildSummaryModel` — this door never re-derives a
  // number. The timer door never throws (`summaryModel.ts`'s own header:
  // only the monitor door's internal `buildMonitorLogSteps` call can), so
  // no try/catch is needed here the way the monitor branch below needs one.
  const model = buildSummaryModel({
    door: "timer",
    run: activeRun,
    steps: logSteps,
  });

  // Phase BL PR B: is this session a designated test whose measured
  // result earns the post-save offer? All four conditions live in
  // postTestOffer.ts. Identity needs the GLOBAL row (title alone is not
  // identity — domain/onboarding.ts's own rule), so while the library is
  // still loading at save time this honestly reads "not the designated
  // test" and the save navigates exactly as before. Completeness on this
  // door is `isComplete(run)` — already guaranteed by the redirect guard
  // above, passed explicitly so the offer's own rule doesn't silently
  // depend on a guard elsewhere. The phone-timer has no distance oracle:
  // advancing through every phase IS this door's definition of having
  // rowed the programmed distance (the suspect-actual panel and the
  // 60..240 band are what push back on an implausible advance).
  const offer = postTestOffer({
    workoutTitle: activeRun.title,
    workoutIsGlobal: libraryWorkout?.isGlobal ?? false,
    avgSplitSeconds: model.heroes.avgSplitSeconds,
    completedFullDistance: isComplete(activeRun),
  });

  if (postSaveOffer !== null) {
    return (
      <PostTestPrompt
        offer={postSaveOffer}
        stored={
          baselinesState.state === "ready" ? baselinesState.baselines : null
        }
        onDone={() => navigate("/today")}
      />
    );
  }

  // Fix round 1 (I1): the body-assembly and 400-retry logic that used to
  // live in this door's own `handleSave` now lives once, in `useLogForm`'s
  // `submit` above — this is only what genuinely differs for this door:
  // WHERE the workout identity/steps come from (the frozen `SessionRun`).
  function handleSave(opts: { advancesPlan?: boolean } = {}) {
    // Phase BL PR B: stamp the offer (or its absence) for the onSaved
    // callback above — set at the tap, so it always reflects the render
    // the rower actually saved from.
    pendingOfferRef.current = offer;
    return submit(
      {
        workoutId: activeRun.workoutId,
        workoutTitle: activeRun.title,
        workoutType,
        steps: logSteps,
        avgSplitSeconds: model.heroes.avgSplitSeconds,
        timeSeconds: model.heroes.timeSeconds,
        distanceMeters: model.heroes.distanceMeters,
      },
      opts,
    );
  }

  // Same two-tap shape as WorkoutDetail.tsx's OwnerActions `handleClick`:
  // the first press arms, the second (only reachable while `armed`) fires
  // the shared discard and navigates.
  function handleDiscardClick() {
    if (discard.armed) {
      discard.fire();
      navigate("/today");
    } else {
      discard.arm();
    }
  }

  return (
    <PostWorkoutSummary
      title={run.title}
      model={model}
      pacesOffCaption={pacesText !== null ? `PACES OFF ${pacesText}` : null}
      hint={singleTargetHint(logSteps)}
      expectedPain={expectedPain}
      held={held}
      onHeld={setHeld}
      pain={pain}
      onPain={setPain}
      thumbs={thumbs}
      onThumbs={setThumbs}
      notes={notes}
      onNotes={setNotes}
      plan={plan}
      accountBaselines={accountBaselines}
      saving={saving}
      saveError={saveError}
      onLogAgainstPlan={() => void handleSave()}
      onSaveWithoutLogging={() => void handleSave(saveWithoutLoggingOpts)}
      backFallback="/today"
      discardSlot={
        <button
          type="button"
          className={
            discard.armed ? "summary-discard-armed" : "summary-discard"
          }
          onClick={handleDiscardClick}
          onBlur={discard.disarm}
        >
          {discard.armed ? "Tap again to discard" : "DISCARD WITHOUT SAVING"}
        </button>
      }
    >
      <MonitorLogRow />
      <RecordingDownloadRow />
    </PostWorkoutSummary>
  );
}

/** The manual door (Task 3 brief, `/library/:id/log`) — logging an off-app
 *  row straight from a workout's own detail screen ("Log it after"). Reads
 *  the workout fresh by `workoutId` (the route's own `:id` param) via
 *  `useWorkouts`/`useBaselines`, the SAME two hooks `WorkoutDetail.tsx`
 *  itself reads to decide whether to even show this door's link — a
 *  baselines-missing deep link (bookmarked, or reached before the gating
 *  link would have blocked it) still can't be resolved into real splits, so
 *  it degrades to the same "no target / Set baselines" recovery idiom
 *  rather than crashing on `buildManualLogSteps`' non-nullable `Baselines`
 *  contract.
 *
 *  Hard constraint (the brief's own words): "must NOT touch the draft/run
 *  records — an in-progress session elsewhere survives logging an off-app
 *  row." This component never imports `./draft` or `./run` at all — there
 *  is nothing here that COULD touch either, by construction, not by
 *  discipline.
 *
 *  **7C: this route ALSO doubles as the monitor mode's door** —
 *  `WorkoutDetail.tsx`'s `handleConnectedEnded` sends a just-finished
 *  connected session to this exact URL, `?from=monitor` appended
 *  (`monitorModeRun`'s own doc comment has the full four-condition gate).
 *  The hard constraint above still holds for the ORIGINAL manual path —
 *  baselines-gated, no `MonitorRun` in sight — and for the monitor branch's
 *  OWN records (it reads/writes `MONITOR_RUN_KEY` only, never
 *  `./draft`/`./run` — the M-2 coexistence contract, spec §5). The one
 *  qualified exception is `useStagedDiscard` (imported for its `armed`/
 *  `arm`/`disarm` timing machine, the session door's own idiom, spec §4's
 *  own words): its `fire()` method calls `clearDraft`/`clearRun`
 *  internally, so BOTH doors' own discard handlers below call `disarm()`
 *  plus their own, narrower `clearMonitorRun()` directly, never `fire()` —
 *  the one call that would break the constraint.
 *
 *  **LT-0 (2026-08-18-target-truth-design.md §3): the PLAIN-manual render
 *  (below, once `monitorRun` is proven `null`) needs the identical
 *  discipline, for a reason that isn't obvious from its name.**
 *  `monitorModeRun`'s own "hijack pin" doc comment says a miss on ANY of
 *  its four conditions "falls straight through to today's manual form,
 *  byte-for-byte" — so the plain-manual branch is not only the genuine
 *  off-app door, it is also where a REAL, completed `MonitorRun` lands the
 *  instant its `workoutId` mismatches this route, its `logSeed` fails
 *  `buildMonitorLogSteps`' alignment check, or the catch-all swallows an
 *  unanticipated exception. That branch's own discard reads
 *  `loadMonitorRun()` fresh at fire time (never the `monitorRun` state
 *  var, which this branch has already proven `null`) and clears it the
 *  same qualified-exception way, so the record this door was originally
 *  trying to log for the rower doesn't survive as an invisible orphan once
 *  they've explicitly asked to discard. */
function ManualDoorLog({ workoutId }: { workoutId: string }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workoutsState = useWorkouts();
  const baselinesState = useBaselines();
  const planState = usePlan();
  const discard = useStagedDiscard();

  // 7C spec §4: computed once at mount (`useState` lazy init, the same
  // idiom `SessionDoorLog`'s own `run`/`draft` already use) — a reload of
  // THIS screen after a successful save must not re-detect a monitor run
  // that `clearMonitorRun()` (below) already retired; re-deriving on every
  // render would do exactly that the instant the record disappeared out
  // from under a still-mounted component.
  const [monitorRun] = useState<MonitorRun | null>(() =>
    monitorModeRun(searchParams, workoutId),
  );

  // Task 4: computed once at mount, the same lazy-init idiom and for the
  // same reason as `monitorRun` above — this reads storage, and a later
  // render (a successful save clears the record) must not change what the
  // screen already told the rower. Only ever consumed in the plain-manual
  // branch below; the monitor branch returns before it is read.
  const [connectedNoRecord] = useState<boolean>(() =>
    connectedArrivalWithNoRecord(searchParams),
  );

  // This door never read the draft/run records in the first place (the
  // hard constraint above), so `onSaved` here is just the navigation —
  // unlike the session door's `onSaved`, there is nothing to clear, save
  // for 7C's own addition: a genuine monitor-mode save clears
  // `MonitorRun` too (spec §5, "SAVE (success only)"), the ONE new
  // destruction path this door gains, and it fires from inside `onSaved`
  // so a failed save (network error, a real validation 400, a 500) never
  // touches the record — `useLogForm`'s own "onSaved only fires on a
  // genuine 201" contract, unchanged.
  //
  // Must-fix minor (whole-branch review): a browser BACK press after a
  // successful save used to leave this exact route mounted fresh again
  // (React Router simply re-renders whatever route a popped history entry
  // points at), with an untouched, still-fillable form — a second Save
  // click would POST a genuine duplicate log and advance `doneN` a second
  // time for one real session. The session door doesn't need a guard of
  // its own: a successful save clears the draft/run records, so revisiting
  // `/session/log` afterward hits the `run === null` redirect above instead
  // of a re-fillable form. This door has no records to clear (the hard
  // constraint above), so it needs its OWN guard — `replace: true` swaps
  // OUT this history entry for `/today` instead of pushing a new one on
  // top, so a subsequent BACK skips straight past this route entirely
  // (landing on whatever came before it, e.g. the workout's detail screen)
  // rather than re-mounting this form.
  // Phase BL PR B: the two branches below (monitor mode and plain manual)
  // share this one `useLogForm` call, so the branch-local offer travels
  // through a ref each save handler sets right before `submit` — the
  // monitor branch computes a real offer from its own model; the plain
  // manual branch pins null (a manual log has no measured number,
  // `buildManualModel` returns no heroes — spec M1, and the You editor
  // stays the honest path for a remembered one).
  const pendingOfferRef = useRef<PostTestOffer | null>(null);
  const [postSaveOffer, setPostSaveOffer] = useState<PostTestOffer | null>(
    null,
  );

  const {
    held,
    setHeld,
    pain,
    setPain,
    thumbs,
    setThumbs,
    notes,
    setNotes,
    saving,
    saveError,
    submit,
  } = useLogForm((logId) => {
    if (monitorRun !== null) clearMonitorRun();
    const offer = pendingOfferRef.current;
    if (offer !== null) {
      // James's ruling (spec rev 2): the record fires on the SAVE, before
      // the prompt renders — accept or decline changes nothing about it.
      if (logId !== null) {
        recordTestResult({
          distance: offer.distance,
          splitSeconds: offer.splitSeconds,
          logId,
        });
      }
      // The prompt renders in place (below, ahead of both branches); its
      // onDone performs this same replace-navigation, so the BACK
      // dup-save guard survives the detour.
      setPostSaveOffer(offer);
    } else {
      navigate("/today", { replace: true });
    }
  });

  // Fix round 2 (whole-branch review, M1/M2): `planState` no longer joins
  // this gate either. It used to run BEFORE the workouts/baselines error
  // branches just below, so a merely-slow plan fetch hid a genuine
  // library/baselines load failure behind LOADING…; a STALLED plan fetch
  // (no `AbortSignal.timeout` on `api()`) hid it forever, with no Retry
  // reachable at all. `plan` (below) reads as null while `planState` is
  // loading — same value as a genuine no-plan or plan-error state — so the
  // toggle just appears once the plan resolves with an active plan.
  //
  // 7C: `baselinesState`'s own loading/error gates moved BELOW the
  // `monitorRun !== null` branch (further down this function) — the
  // monitor branch never calls `buildManualLogSteps` and has no use for
  // baselines at all (`PACES LOCKED` reads `logSeed.paces`, frozen at
  // Connect), so a monitor-mode run must not sit at LOADING… (or an error
  // screen) behind a fetch its own render path never consults. Only
  // `workoutsState` gates here — both branches need the library lookup
  // just below.
  if (workoutsState.state === "loading") {
    return (
      <main className="screen">
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  if (workoutsState.state === "error") {
    return (
      <main className="screen">
        <p className="mono-status">Couldn't load your library.</p>
        <button
          type="button"
          className="button-outline"
          onClick={workoutsState.retry}
        >
          Retry
        </button>
      </main>
    );
  }

  // Task 3 (fix round 2, M1/M2): same derivation as the session door's own
  // `plan` — null means "no toggle" for a no-active-plan state, a
  // plan-hook error, OR the plan fetch still being in flight, none of
  // which gate this door's form (logging must never be hostage to the
  // plan fetch).
  const plan: PlanData | null =
    planState.state === "ready" && planState.plan.planKey !== null
      ? planState.plan
      : null;

  // Fix round (C2): same reasoning as `SessionDoorLog`'s own copy of this
  // constant — `plan` above conflates "no plan"/"loading"/"errored", but
  // the wire body must only assert `advancesPlan:false` once the plan fetch
  // has genuinely resolved. Shared by both branches below (monitor and
  // plain manual), since `planState` is a single hook call at this
  // component's top.
  const saveWithoutLoggingOpts: { advancesPlan?: boolean } =
    planState.state === "ready" ? { advancesPlan: false } : {};

  // Phase 8A: the account's combined baseline pair for the save stack's
  // lead derivation (PostWorkoutSummary keys the 6I demotion on it plus
  // the title). Shared by both branches below. Computed WITHOUT gating on
  // `baselinesState` — the monitor branch deliberately renders ahead of
  // the baselines loading/error gates (its own render path never consults
  // them), so while unresolved this reads null, the same value a
  // genuinely-unset account has; the plain-manual branch sits behind those
  // gates, where this equals its own step-resolving `baselines` value.
  const accountBaselines: Baselines | null =
    baselinesState.state === "ready" &&
    baselinesState.baselines.k2Seconds !== null &&
    baselinesState.baselines.k6Seconds !== null
      ? {
          k2Seconds: baselinesState.baselines.k2Seconds,
          k6Seconds: baselinesState.baselines.k6Seconds,
        }
      : null;

  const workout = workoutsState.workouts.find((w) => w.id === workoutId);
  if (!workout) {
    return (
      <main className="screen">
        <p className="mono-status">That workout isn't in your library.</p>
        <BackLink />
      </main>
    );
  }

  // Phase BL PR B: once a designated-test save has landed, the offer
  // replaces BOTH branches' forms (the monitor record is already cleared,
  // and re-rendering a fillable form behind the prompt would resurrect
  // the double-save hazard the replace-navigation guard exists for).
  if (postSaveOffer !== null) {
    return (
      <PostTestPrompt
        offer={postSaveOffer}
        stored={
          baselinesState.state === "ready" ? baselinesState.baselines : null
        }
        onDone={() => navigate("/today", { replace: true })}
      />
    );
  }

  if (monitorRun !== null) {
    // 7C spec §4: the monitor mode's own render — `buildMonitorLogSteps`
    // never throws here (`monitorModeRun` already proved it wouldn't, by
    // calling it once itself; this is the SAME pure function against the
    // SAME immutable record, so a second call is deterministic, not a
    // second chance to fail).
    const logSteps = buildMonitorLogSteps(monitorRun);
    // PACES LOCKED renders from the frozen seed, never `manualLockedBaseline`
    // (spec §4: "the manual recovery path cannot run here") — `logSeed` is
    // optional only so a pre-7C `MonitorRun` still type-checks;
    // `monitorModeRun`'s own alignment check is what guarantees a REAL one
    // exists for any record that reaches this branch.
    const k2 = monitorRun.logSeed?.paces.k2 ?? null;
    const k6 = monitorRun.logSeed?.paces.k6 ?? null;
    const pacesText = pacesLockedText(k2, k6);
    // Same narrowing idiom as `activeWorkout`/`activeRun` below/above: TS
    // narrowing from the `!workout` guard doesn't survive into a closure
    // declared later in this component.
    const activeWorkout: LibraryWorkout = workout;

    // Post-workout-summary spec §2B/`summaryModel.ts`'s own header: this is
    // the ONE call site that CAN throw (`MonitorLogSeedError`, when
    // `logSeed` is missing or misaligned with `program.intervals`) — but
    // `monitorModeRun` (computed at this component's own mount) already
    // called the identical pure `buildMonitorLogSteps` against this exact
    // immutable record and proved it wouldn't. This try/catch exists only
    // because that module's own header requires every consumer to handle
    // the error explicitly, not because it is reachable here in practice;
    // on the (unreachable) catch, this door has nothing better to do than
    // the same disqualification `monitorModeRun` itself performs — bounce
    // to `/today` rather than render a screen built on a record neither
    // gate trusts.
    let model: SummaryModel;
    try {
      model = buildSummaryModel({ door: "monitor", run: monitorRun });
    } catch (err) {
      if (err instanceof MonitorLogSeedError) {
        return <Navigate to="/today" replace />;
      }
      throw err;
    }
    // Phase BL PR B: the connected door's own offer. Completeness (spec
    // M2, binding) is the machine's own WORKOUTEND — `endedBy ===
    // "finished"` is the only close reason that proves the programmed
    // distance completed ("rower"/"link-lost"/"program-failed"/
    // "interrupted"/absent all mean it did not, or cannot be shown to
    // have), so an interrupted run's real-but-partial average split is
    // never offered as a full-distance test result.
    const monitorOffer = postTestOffer({
      workoutTitle: activeWorkout.title,
      workoutIsGlobal: activeWorkout.isGlobal,
      avgSplitSeconds: model.heroes.avgSplitSeconds,
      completedFullDistance: monitorRun.endedBy === "finished",
    });

    const handleMonitorSave = (opts: { advancesPlan?: boolean } = {}) => {
      pendingOfferRef.current = monitorOffer;
      return submit(
        {
          workoutId: activeWorkout.id,
          workoutTitle: activeWorkout.title,
          workoutType: activeWorkout.type,
          steps: logSteps,
          deviceName: monitorRun.deviceName,
          avgSplitSeconds: model.heroes.avgSplitSeconds,
          timeSeconds: model.heroes.timeSeconds,
          distanceMeters: model.heroes.distanceMeters,
          series: monitorRun.series,
          endedBy: monitorRun.endedBy,
          workSeconds: monitorRun.workSeconds,
          workMeters: monitorRun.workMeters,
          restSeconds: monitorRun.restSeconds,
          restMeters: monitorRun.restMeters,
          // RC-3 (storage-spine design spec §2, PR 1 Task 7): same
          // optional-key idiom as `workSeconds` etc. above — spread
          // straight from `monitorRun.summaryTotals`/`summaryDetail`/
          // `verificationBytes` (Tasks 2-4), never re-derived here.
          ...(monitorRun.summaryTotals !== undefined
            ? {
                machineWorkSeconds: monitorRun.summaryTotals.workElapsedSeconds,
                machineWorkMeters: Math.round(
                  monitorRun.summaryTotals.workDistanceMeters,
                ),
                machineSummary: {
                  ...(monitorRun.verificationBytes !== undefined
                    ? { verificationBytes: [...monitorRun.verificationBytes] }
                    : {}),
                  // A real build-738-era record can carry `summaryTotals`
                  // (and maybe `verificationBytes`) with no `summaryDetail`
                  // — that build's `appendSummaryObservations` never wrote
                  // the field (it didn't exist on that build's
                  // `MonitorRun` at all; `git show
                  // v0.21.0:app/src/monitor/monitorRun.ts`). An unsaved
                  // run from that build, saved through this code after the
                  // update, reaches here and posts a bytes-only
                  // `machineSummary` — correct, not a bug. Same shape the
                  // server-side integration test names "a build-738-era
                  // record's honest shape."
                  ...(monitorRun.summaryDetail ?? {}),
                },
              }
            : {}),
        },
        opts,
      );
    };

    // Same two-tap shape as `SessionDoorLog`'s own `handleDiscardClick`
    // (spec §4: "in the session door's idiom") — deliberately does NOT
    // call `discard.fire()`, which would also clear `./draft`/`./run` (this
    // door's own hard constraint, header comment above): `disarm()` resets
    // the armed state, and `clearMonitorRun()` is this branch's own,
    // narrower destruction. Navigates back to the workout's OWN detail
    // screen (spec §4: "navigates back to the detail"), not `/today` — the
    // session door's discard lands on `/today` because it has no other
    // natural home; this one does.
    function handleMonitorDiscardClick() {
      if (discard.armed) {
        discard.disarm();
        clearMonitorRun();
        navigate(`/library/${workoutId}`);
      } else {
        discard.arm();
      }
    }

    return (
      <PostWorkoutSummary
        title={workout.title}
        model={model}
        pacesOffCaption={pacesText !== null ? `PACES OFF ${pacesText}` : null}
        hint={singleTargetHint(logSteps)}
        expectedPain={workout.pain}
        held={held}
        onHeld={setHeld}
        pain={pain}
        onPain={setPain}
        thumbs={thumbs}
        onThumbs={setThumbs}
        notes={notes}
        onNotes={setNotes}
        plan={plan}
        accountBaselines={accountBaselines}
        saving={saving}
        saveError={saveError}
        onLogAgainstPlan={() => void handleMonitorSave()}
        onSaveWithoutLogging={() =>
          void handleMonitorSave(saveWithoutLoggingOpts)
        }
        // Trace-rendering spec (Phase LT spec 3), §1: the live door's own
        // source — straight off the loaded `MonitorRun.series`, the same
        // record `handleMonitorSave` above already spreads onto the POST
        // body (spec 2). The timer door and the manual door below both
        // omit this prop entirely (neither has a PM5), which is the
        // "absent" case `PostWorkoutSummary`'s own doc comment names.
        series={monitorRun.series}
        discardSlot={
          <button
            type="button"
            className={
              discard.armed ? "summary-discard-armed" : "summary-discard"
            }
            onClick={handleMonitorDiscardClick}
            onBlur={discard.disarm}
          >
            {discard.armed ? "Tap again to discard" : "DISCARD WITHOUT SAVING"}
          </button>
        }
      >
        <MonitorLogRow />
        <RecordingDownloadRow />
      </PostWorkoutSummary>
    );
  }

  // 7C: from here on `monitorRun` is provably `null` (the branch above
  // always returns) — the ORIGINAL manual path's own baselines gate lives
  // here, not up with `workoutsState`'s, so a monitor-mode run is never
  // blocked on a fetch it has no use for (this function's own comment,
  // above, on why).
  if (baselinesState.state === "loading") {
    return (
      <main className="screen">
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  if (baselinesState.state === "error") {
    return (
      <main className="screen">
        <p className="mono-status">Couldn't load your baselines.</p>
        <button
          type="button"
          className="button-outline"
          onClick={baselinesState.retry}
        >
          Retry
        </button>
      </main>
    );
  }

  // Same "partial baseline pair reads as unset" convention as
  // WorkoutDetail.tsx/Library.tsx. WorkoutDetail's own gating link means a
  // real rower can't normally reach this state, but a stale bookmark or a
  // baseline cleared in another tab between load and click still can — a
  // concrete `Baselines` is required for a SPLIT-ref workout
  // (`buildManualLogSteps`' own resolveSplit call), so that case degrades
  // honestly instead of crashing or fabricating a number.
  const baselines: Baselines | null =
    baselinesState.baselines.k2Seconds !== null &&
    baselinesState.baselines.k6Seconds !== null
      ? {
          k2Seconds: baselinesState.baselines.k2Seconds,
          k6Seconds: baselinesState.baselines.k6Seconds,
        }
      : null;

  // Phase 6I close-out fold (Task 2's deferred ledger item, WorkoutDetail.
  // tsx's own KNOWN GAP comment on its "Log it after" link): this used to
  // gate on bare `baselines === null`, blocking EVERY workout alike —
  // including the two designated effort-only onboarding workouts, whose
  // whole point is to run (and now log) with no baselines set at all. Gated
  // on the SAME `needsBaselines` predicate every other coupled guard site
  // shares (domain/needsBaselines.ts's own header comment names them): an
  // effort-only workout has nothing to resolve against baselines, so it
  // reaches the form below with `baselines` possibly still null.
  // `WorkoutDetail.tsx`'s own gating link already used this predicate for
  // whether to show this door's link at all (line ~522) — this closes the
  // one remaining site the design spec named that hadn't followed.
  if (baselines === null && needsBaselines(workout.steps)) {
    return (
      <main className="screen">
        <BackLink />
        <h1 className="screen-title">Log {workout.title}</h1>
        <span className="step-row-no-target">
          <em>no target</em> <Link to="/you">Set baselines</Link>
        </span>
      </main>
    );
  }

  const logSteps = buildManualLogSteps(workout, baselines);
  // Post-workout-summary spec: the manual door has no run record and no
  // measured reading of any kind (`summaryModel.ts`'s own header — heroes
  // are always `{}`, the "date-only" half of §2B's own stated fallback);
  // `dateIso` is simply "now" (the brief's own words — the lock moment IS
  // save time for an off-app row, same reasoning `manualLockedBaseline`
  // already applies to PACES LOCKED).
  const model = buildSummaryModel({
    door: "manual",
    steps: logSteps,
    dateIso: new Date().toISOString(),
    // Task 4: the ONE thing that differs for a connected arrival with no
    // record — the SOURCE slot (`NO_PM5_READING_SOURCE`'s own doc comment
    // has the rule and its accepted stored-row divergence). Rows, heroes
    // and caption are identical to a by-hand entry, because the numbers on
    // screen genuinely are targets and nothing else.
    connectedNoRecord,
  });
  const k2 = manualLockedBaseline("2k", workout.steps, baselines);
  const k6 = manualLockedBaseline("6k", workout.steps, baselines);
  const pacesText = pacesLockedText(k2, k6);
  // TS narrowing from the `!workout` guard above doesn't survive into a
  // function DECLARED later in this component (the arrow function passed
  // to `submit`, below) — the same separately-typed `const` alias fix the
  // session door's own `activeRun` uses, not a non-null assertion at each
  // use site.
  const activeWorkout: LibraryWorkout = workout;

  // Fix round 1 (I1): same shared `submit` the session door now calls —
  // this is only what genuinely differs for this door: `workoutId` is
  // OWNED here (a real route param, not a possibly-stale run record), and
  // there is no `clearDraft`/`clearRun` in this door's own `onSaved` at all
  // (wired above), since this door never touched either to begin with.
  function handleSave(opts: { advancesPlan?: boolean } = {}) {
    // Phase BL PR B: never an offer from a by-hand entry — a manual log
    // has no measured number at all (spec M1; `buildManualModel` returns
    // no heroes), so a hand-logged "2K Test" saves and navigates exactly
    // as any other manual log. Pinned explicitly so a stale ref from an
    // earlier monitor-branch render can never leak into this branch.
    pendingOfferRef.current = null;
    return submit(
      {
        workoutId: activeWorkout.id,
        workoutTitle: activeWorkout.title,
        workoutType: activeWorkout.type,
        steps: logSteps,
      },
      opts,
    );
  }

  // LT-0 (2026-08-18-target-truth-design.md §3): the manual door's own
  // staged discard — same two-tap idiom (armed/disarm,
  // `summary-discard`/`summary-discard-armed`, `DISCARD WITHOUT SAVING`/
  // `Tap again to discard`) as `handleDiscardClick`/
  // `handleMonitorDiscardClick` above. Reaching this render already proves
  // `monitorRun === null` — but that only means `monitorModeRun`'s OWN
  // four-condition gate missed, not that nothing is stored: this is
  // exactly the fallthrough target `monitorModeRun`'s own "hijack pin" doc
  // comment describes, so a real, completed `MonitorRun` can be sitting in
  // `MONITOR_RUN_KEY` right now (a mismatched `workoutId`, a misaligned
  // `logSeed`, or the catch-all all land here with the record still real).
  // Reading `loadMonitorRun()` fresh at fire time — never the `monitorRun`
  // state var, fixed `null` in this branch by construction — is what
  // catches it, the same "read the key directly" discipline
  // `monitorModeRun`'s own doc comment already applies one call site up.
  // Same qualified exception this component's header comment names:
  // `clearMonitorRun()` directly, never `discard.fire()`, which would also
  // clear `./draft`/`./run` — this component's own hard constraint — and
  // could nuke an unrelated in-progress session elsewhere. A pure by-hand
  // entry (nothing ever stored under either key) leaves storage
  // byte-identical; the form state itself simply dies with this
  // component's unmount, the same as an ordinary Back press already
  // silently does today. Navigates to the workout's own detail screen —
  // the same target `handleMonitorDiscardClick` above uses, for the same
  // reason (spec §4: "navigates back to the detail"), not `/today`.
  function handleManualDiscardClick() {
    if (discard.armed) {
      discard.disarm();
      if (loadMonitorRun() !== null) clearMonitorRun();
      navigate(`/library/${workoutId}`);
    } else {
      discard.arm();
    }
  }

  return (
    <PostWorkoutSummary
      title={workout.title}
      model={model}
      pacesOffCaption={pacesText !== null ? `PACES OFF ${pacesText}` : null}
      // §2D: "by-hand manual door: BY FEEL" — an unconditional override
      // for a genuine off-app entry, never the single-target rule
      // (`singleTargetHint`'s own doc comment). Task 4 carves out the ONE
      // arrival that is not an off-app entry: a connected session rowed
      // against a PROGRAMMED workout, whose targets the erg itself was
      // carrying. `BY FEEL` there is the same false by-hand claim the
      // source slot just stopped making, in the other half of the screen —
      // so this arrival gets the rule the connected door itself uses, and
      // shows no hint at all when the workout has no single target.
      hint={connectedNoRecord ? singleTargetHint(logSteps) : "BY FEEL"}
      expectedPain={workout.pain}
      held={held}
      onHeld={setHeld}
      pain={pain}
      onPain={setPain}
      thumbs={thumbs}
      onThumbs={setThumbs}
      notes={notes}
      onNotes={setNotes}
      plan={plan}
      accountBaselines={accountBaselines}
      saving={saving}
      saveError={saveError}
      onLogAgainstPlan={() => void handleSave()}
      onSaveWithoutLogging={() => void handleSave(saveWithoutLoggingOpts)}
      // LT-0: the app's last discard-less save surface gains the staged
      // discard, same idiom as the session/monitor doors above —
      // `handleManualDiscardClick`'s own doc comment covers what it clears
      // and why (a fallen-through `MonitorRun`, or nothing at all).
      discardSlot={
        <button
          type="button"
          className={
            discard.armed ? "summary-discard-armed" : "summary-discard"
          }
          onClick={handleManualDiscardClick}
          onBlur={discard.disarm}
        >
          {discard.armed ? "Tap again to discard" : "DISCARD WITHOUT SAVING"}
        </button>
      }
    >
      <MonitorLogRow />
      <RecordingDownloadRow />
    </PostWorkoutSummary>
  );
}
