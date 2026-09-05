import { useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useStagedDiscard } from "../session/useStagedDiscard";
import { fmtDuration } from "../../domain/duration.js";
import { fmtSplit } from "../../domain/format.js";
import {
  read as readHandoff,
  retire as retireHandoff,
  type HandoffEntry,
} from "../monitor/handoffStore";
import { usePlan, type PlanData } from "../api/usePlan";
import { activePlan } from "../api/activePlan";
import { completionStamp } from "../session/completionStamp";
import { useLogForm } from "../session/LogSession";
import { recordLogDoorEntry } from "../session/logDoorDiagnostics";
import { clearRun, loadRun, type SessionRun } from "../session/run";
import { freeRowTotals } from "./totals";

/**
 * `/justrow/log` — the workout-less log door (Phase JR PR 2, Gate 0
 * copy-final).
 *
 * **Why a new component rather than a branch in `LogSession`.** That
 * screen's monitor gate requires the record's `workoutId` to equal the
 * route's `:id` (`monitorModeEntry`'s condition 3), and a free row has
 * neither — no id in the record and no `:id` in a route. What IS shared is
 * the submit pipeline: `useLogForm` carries the retry policy, the series
 * sacrifice, the deviceName band and the error surface, and this door posts
 * through it rather than re-rolling any of that.
 *
 * **What is absent is the design** (the approved board, verbatim): no type
 * badge (`workout_type` is null and an unknown chip would be a fifth fake
 * peer), no intervals table (`steps` is `[]` — an absence, never an empty
 * widget), no DID YOU HOLD THE TARGETS? (a free row was never given one, so
 * the question has no honest answer), and the rating reads **PAIN**, not
 * ACTUAL PAIN — the word ACTUAL exists to contrast with the workout's own
 * EXPECTED figure beside it, which a free row does not have.
 *
 * **The save stack is the shipped door's own pair** (substitution spec,
 * 2026-09-02, §Mechanism 2 — James's ruling: a Just Row on a plan day can
 * STAND IN for that session). With a plan, `Log against plan · SESSION n
 * OF N` leads and posts `advancesPlan: true` — the explicit opt-in the
 * store requires of a free row (`logs.ts` resolves `advancesPlan ??
 * !isFreeRow(...)`, so an omitted key means "does not count" here, the
 * opposite of a workout row's default) — and `Save without logging` sits
 * under it posting `false`. With no plan — none chosen, or one whose 84
 * sessions are all logged (`api/activePlan.ts`, Today's own FREESTYLE
 * rule) — the lone button reads `Save`
 * (timer-mode spec 2026-09-02, ruling 5 — the qualifier survives only
 * beneath `Log against plan`) and still posts `false`: the same no-plan
 * rule `PostWorkoutSummary` applies, hidden outright rather than
 * disabled. The label formula, the classes
 * (`summary-save-lead` / `summary-save-secondary`) and the order are
 * borrowed verbatim from that component, not restyled. The onboarding
 * demotion rule there does not apply — a free row carries no onboarding
 * title. The one-button "Save this row" this door shipped with is
 * retired: it existed because a free row could never count.
 *
 * **Two entry kinds, one door** (Just Row without the monitor, spec
 * 2026-09-02, §Mechanism piece 4). The MONITOR entry is a closed free-row
 * `MonitorRun` on the hand-off store; the TIMER entry is a finished
 * free-row `SessionRun` (`mode: "justrow"`) on `RUN_KEY`, the phone's own
 * clock. They differ in exactly what the timer never had: no device, no
 * distance, no split, no machine block — the card renders TIME alone, the
 * device slot reads `TIMER`, and the posted body carries no metre key at
 * all (absence, never a zero or a dash: Global Constraints).
 */

/** The monitor kind: a CLOSED free row on the hand-off store. Anything
 *  else — no entry, an open run, a programmed record — is not this door's
 *  to touch, the same any-miss-falls-through posture `monitorModeEntry`
 *  takes. */
function monitorFreeRowEntry(): HandoffEntry | null {
  const entry = readHandoff();
  if (entry === null) return null;
  if (entry.run.mode !== "justrow") return null;
  if (entry.run.completedAt === null) return null;
  return entry;
}

/** The timer kind: a FINISHED free-row `SessionRun`. A live one is the
 *  Timer's to drive, and a workout's run belongs to `/session/log`. */
function timerFreeRowRun(): SessionRun | null {
  const run = loadRun();
  if (run === null) return null;
  if (run.mode !== "justrow") return null;
  if (run.completedAt === null) return null;
  return run;
}

export type DoorEntry =
  { kind: "monitor"; entry: HandoffEntry } | { kind: "timer"; run: SessionRun };

/** The ring `kind` filed when both records exist at once — greppable in a
 *  MONITOR LOG paste, and pinned by name in this door's tests. */
const CONFLICT_KIND = "justrow-log-door-conflict";

/** The last conflict message filed by this module. `doorEntry` runs inside
 *  a `useState` initializer, which React's StrictMode invokes twice in dev
 *  builds; without this the same violated-invariant entry would be filed
 *  twice for one mount (whole-branch review, 2026-09-02, NIT 4). One entry
 *  per distinct pair is the honest count. */
let lastConflictFiled: string | null = null;

/** **Precedence, stated (exit criterion 7c): the monitor hand-off first,
 *  then the timer run.** Both present at once is a VIOLATED invariant —
 *  the coexistence guard at both doors (`ConnectAction`, the Just Row
 *  door's own Start Timer) exists to prevent it — and when it happens
 *  anyway this renders the NEWER `completedAt` (a tie keeps the stated
 *  order, monitor first) and files a ring entry naming the other, never a
 *  silent pick. The loser is left on disk untouched: this door destroys
 *  only what it saves. */
function doorEntry(): DoorEntry | null {
  const monitor = monitorFreeRowEntry();
  const timer = timerFreeRowRun();
  if (monitor !== null && timer !== null) {
    const monitorClosed = monitor.run.completedAt!;
    const timerClosed = timer.completedAt!;
    const timerNewer = Date.parse(timerClosed) > Date.parse(monitorClosed);
    const message = timerNewer
      ? `rendered=timer completedAt=${timerClosed}; other=monitor sessionKey=${monitor.sessionKey} completedAt=${monitorClosed}`
      : `rendered=monitor sessionKey=${monitor.sessionKey} completedAt=${monitorClosed}; other=timer completedAt=${timerClosed}`;
    if (message !== lastConflictFiled) {
      lastConflictFiled = message;
      recordLogDoorEntry(CONFLICT_KIND, message);
    }
    return timerNewer
      ? { kind: "timer", run: timer }
      : { kind: "monitor", entry: monitor };
  }
  if (monitor !== null) return { kind: "monitor", entry: monitor };
  if (timer !== null) return { kind: "timer", run: timer };
  return null;
}

/** The timer entry's seconds: the run's one actual, derived AT THE DOOR
 *  (`freeRowTotals` is `(run: MonitorRun)` and stays that way — spec ⟨F6⟩).
 *  `null` when the run carries no actual — a record that reached
 *  `completedAt` without the finish ever recording, which the Timer's own
 *  finish makes unreachable, so the honest state is a disabled save. */
function timerElapsedSeconds(run: SessionRun): number | null {
  const actual = run.actuals[0];
  return actual === undefined ? null : actual.elapsedSeconds;
}

const PAIN_LEVELS = [1, 2, 3, 4, 5];

export default function JustRowLog() {
  // A mount snapshot on purpose, like `LogSession`'s own doors: the record
  // is closed, so nothing enriches it after mount, and re-reading on every
  // render would make a mid-save retire yank the form out from under the
  // rower.
  const [door] = useState(doorEntry);
  return door === null ? (
    <Navigate to="/today" replace />
  ) : (
    <JustRowSummary door={door} context="legacy" />
  );
}

export function JustRowSummary({
  door,
  context,
}: {
  door: DoorEntry;
  context: "legacy" | "review";
}) {
  const navigate = useNavigate();
  const discard = useStagedDiscard();
  const recoveryActions =
    context === "review" ? (
      <div className="action-stack">
        <Link to="/today" className="button-outline">
          Keep unsaved
        </Link>
        <button
          type="button"
          className={
            discard.armed ? "summary-discard-armed" : "summary-discard"
          }
          onBlur={discard.disarm}
          onClick={() => {
            if (!discard.armed) {
              discard.arm();
              return;
            }
            discard.disarm();
            if (door.kind === "monitor")
              retireHandoff(
                [
                  {
                    sessionKey: door.entry.sessionKey,
                    revision: door.entry.revision,
                  },
                ],
                "monitor-discard",
              );
            else if (loadRun()?.startedAt === door.run.startedAt) clearRun();
            void navigate("/today");
          }}
        >
          {discard.armed ? "Tap again to discard" : "DISCARD WITHOUT SAVING"}
        </button>
      </div>
    ) : null;
  // The pair's one input beyond the record: the SAME rule the programmed
  // doors read (`api/activePlan.ts`) — a RESOLVED fetch, a chosen key, and
  // a session left to log against. Loading, errored, unchosen and
  // finished all read as "no plan" here, exactly as they do on those
  // doors; a rower whose plan fetch failed can still save the row,
  // without the option to count it against a plan this screen could not
  // confirm.
  const planState = usePlan();
  const plan: PlanData | null = activePlan(planState);
  const { held, pain, setPain, notes, setNotes, saving, saveError, submit } =
    useLogForm(() => {
      // Each kind clears ITS OWN record and only that one (the lifetime
      // table's "successful save" clear site for the timer run).
      if (door?.kind === "monitor") {
        retireHandoff(
          [
            {
              sessionKey: door.entry.sessionKey,
              revision: door.entry.revision,
            },
          ],
          "save-success",
        );
      } else if (door?.kind === "timer") {
        if (loadRun()?.startedAt === door.run.startedAt) clearRun();
      }
      void navigate("/today/log");
    });
  void held; // the targets question does not exist here; see the header.

  if (door.kind === "timer") {
    return (
      <TimerDoor
        recoveryActions={recoveryActions}
        run={door.run}
        plan={plan}
        pain={pain}
        setPain={setPain}
        notes={notes}
        setNotes={setNotes}
        saving={saving}
        saveError={saveError}
        onSave={(elapsed, advancesPlan) =>
          void submit(
            {
              workoutId: null,
              workoutTitle: "Just Row",
              workoutType: null,
              steps: [],
              // Exit criterion 3b: the timer entry names its door — and
              // carries no `deviceName`, which is the server's own
              // consistency condition for `timer`. NO `distanceMeters`, NO
              // `avgSplitSeconds`, no work pair, no machine fields: the key
              // is absent from the wire, not zero (spec ⟨F2⟩).
              source: "timer",
              timeSeconds: elapsed,
            },
            { advancesPlan },
          )
        }
      />
    );
  }

  const { entry } = door;
  const totals = freeRowTotals(entry.run);
  const avgSplitSeconds =
    totals !== null && totals.meters > 0
      ? (500 * totals.seconds) / totals.meters
      : null;

  function handleSave(advancesPlan: boolean) {
    if (totals === null) return;
    const { run } = entry;
    void submit(
      {
        workoutId: null,
        workoutTitle: "Just Row",
        workoutType: null,
        steps: [],
        deviceName: run.deviceName,
        // Just Row unconnected spec (2026-09-02), exit criterion 3b: the
        // monitor entry names its door. (The timer entry, `source:
        // "timer"` with no `deviceName`, is `TimerDoor` above.)
        source: "pm5",
        timeSeconds: totals.seconds,
        // ROUNDED at the payload boundary (review #1, finding 3): 0x0039's
        // distance is tenths-precision and can legitimately end on a
        // fractional metre (1396.5), while the server requires every metre
        // field to be a whole number — an unrounded summary would 400 the
        // save with no recovery. The seconds fields stay fractional; the
        // server's own validator treats only the metre pair as whole wire
        // fields, and the monitor door's submit already rounds the same way.
        distanceMeters: Math.round(totals.meters),
        ...(avgSplitSeconds !== null ? { avgSplitSeconds } : {}),
        // The work pair IS the whole piece — rest does not exist for a free
        // row (the spec's stored-shape table, Logbook-aligned).
        workSeconds: totals.seconds,
        workMeters: Math.round(totals.meters),
        ...(run.summaryTotals !== undefined
          ? {
              machineWorkSeconds: run.summaryTotals.workElapsedSeconds,
              machineWorkMeters: Math.round(
                run.summaryTotals.workDistanceMeters,
              ),
              machineSummary: {
                ...(run.summaryDetail ?? {}),
                ...(run.verificationBytes != null
                  ? { verificationBytes: run.verificationBytes }
                  : {}),
              },
            }
          : {}),
        ...(run.series !== undefined ? { series: run.series } : {}),
        ...(run.endedBy !== undefined ? { endedBy: run.endedBy } : {}),
        // Wave E PR2 Task 6: the app's OTHER `source: "pm5"` producer, so
        // it posts the same pair the programmed monitor door does — the
        // run's own close stamp plus this device's zone. A free row that
        // ends `finished` is as uploadable as any other, and without this
        // its Concept2 date would be the moment Save was tapped.
        ...completionStamp(run),
      },
      { advancesPlan },
    );
  }

  return (
    <main className="screen">
      <h1 className="screen-title">Just Row</h1>
      <p className="justrow-meta">
        {new Date(entry.run.startedAt)
          .toLocaleDateString("en-US", { month: "short", day: "numeric" })
          .toUpperCase()}
        {" · "}
        {entry.run.deviceName}
      </p>

      {totals !== null ? (
        <div className="justrow-log-numbers">
          <div>
            <p className="justrow-log-numlabel">TIME</p>
            <p className="justrow-log-numvalue">
              {fmtDuration(totals.seconds / 60)}
            </p>
          </div>
          <div>
            <p className="justrow-log-numlabel">DISTANCE</p>
            <p className="justrow-log-numvalue">
              {new Intl.NumberFormat("en-US").format(Math.round(totals.meters))}{" "}
              m
            </p>
          </div>
          <div>
            <p className="justrow-log-numlabel">AVG SPLIT</p>
            <p className="justrow-log-numvalue">
              {avgSplitSeconds !== null ? fmtSplit(avgSplitSeconds) : "—"}
            </p>
          </div>
        </div>
      ) : (
        // A recovered record whose burst never landed AND whose trace is
        // empty: nothing numeric to show, and fabricating a zero would be a
        // wrong number. The save below is DISABLED for the same reason —
        // the PM gate found the first cut rendering it enabled over a
        // handler that silently returned, a dead button on exactly the
        // recovery path the no-split condition protects. A numberless save
        // would need its own design against the stored shape PR 1 froze;
        // until someone does that work, the honest state is a disabled
        // button and this line saying why.
        <p className="justrow-band">
          The monitor's numbers did not reach the phone for this row, so there
          is nothing to save.
        </p>
      )}

      <Reflection
        pain={pain}
        setPain={setPain}
        notes={notes}
        setNotes={setNotes}
      />

      {saveError !== null && <p className="form-error">{saveError}</p>}
      <SaveStack
        plan={plan}
        disabled={saving || totals === null}
        onSave={handleSave}
      />
      {recoveryActions}
    </main>
  );
}

/** The timer entry's screen: the same door with the parts a phone-timed
 *  row never had simply missing. `run.startedAt` gives the date, `TIMER`
 *  fills the device slot (handoff `LogDoor.dc.html`), and the card is TIME
 *  alone — no DISTANCE cell, no AVG SPLIT cell, and no dash standing in for
 *  either. Save is disabled only when the run carries no actual. */
function TimerDoor({
  recoveryActions,
  run,
  plan,
  pain,
  setPain,
  notes,
  setNotes,
  saving,
  saveError,
  onSave,
}: {
  recoveryActions: ReactNode;
  run: SessionRun;
  plan: PlanData | null;
  pain: number | null;
  setPain: (pain: number | null) => void;
  notes: string;
  setNotes: (notes: string) => void;
  saving: boolean;
  saveError: string | null;
  onSave: (elapsedSeconds: number, advancesPlan: boolean) => void;
}) {
  const elapsed = timerElapsedSeconds(run);
  return (
    <main className="screen">
      <h1 className="screen-title">Just Row</h1>
      <p className="justrow-meta">
        {new Date(run.startedAt)
          .toLocaleDateString("en-US", { month: "short", day: "numeric" })
          .toUpperCase()}
        {" · "}
        TIMER
      </p>

      {elapsed !== null && (
        <div className="justrow-log-numbers">
          <div>
            <p className="justrow-log-numlabel">TIME</p>
            <p className="justrow-log-numvalue">{fmtDuration(elapsed / 60)}</p>
          </div>
        </div>
      )}

      <Reflection
        pain={pain}
        setPain={setPain}
        notes={notes}
        setNotes={setNotes}
      />

      {saveError !== null && <p className="form-error">{saveError}</p>}
      <SaveStack
        plan={plan}
        disabled={saving || elapsed === null}
        onSave={(advancesPlan) => {
          if (elapsed !== null) onSave(elapsed, advancesPlan);
        }}
      />
      {recoveryActions}
    </main>
  );
}

/** The save stack, shared by both kinds: `PostWorkoutSummary`'s pair with
 *  its own label formula, classes and no-plan rule (see the header). The
 *  boolean each button hands back is the WHOLE decision — it goes on the
 *  wire as `advancesPlan`, and the store does the rest. */
function SaveStack({
  plan,
  disabled,
  onSave,
}: {
  plan: PlanData | null;
  disabled: boolean;
  onSave: (advancesPlan: boolean) => void;
}) {
  return (
    <div className="action-stack summary-save-stack">
      {plan !== null && (
        <button
          type="button"
          className="summary-save-lead"
          disabled={disabled}
          onClick={() => onSave(true)}
        >
          {`Log against plan · SESSION ${plan.doneN + 1} OF ${plan.sequence.length}`}
        </button>
      )}
      <button
        type="button"
        className={
          plan === null ? "summary-save-lead" : "summary-save-secondary"
        }
        disabled={disabled}
        onClick={() => onSave(false)}
      >
        {plan === null ? "Save" : "Save without logging"}
      </button>
    </div>
  );
}

/** PAIN + NOTES, shared by both kinds — one markup, one set of labels. */
function Reflection({
  pain,
  setPain,
  notes,
  setNotes,
}: {
  pain: number | null;
  setPain: (pain: number | null) => void;
  notes: string;
  setNotes: (notes: string) => void;
}) {
  return (
    <>
      <div className="summary-reflection-group">
        <div className="summary-reflection-label-row">
          <p className="summary-reflection-label">PAIN</p>
        </div>
        <div className="summary-pain-row">
          {PAIN_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className="summary-pain-chip"
              aria-pressed={pain === level}
              aria-label={`Pain ${level}`}
              onClick={() => setPain(pain === level ? null : level)}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div className="summary-reflection-group">
        <label className="summary-reflection-label" htmlFor="justrow-notes">
          NOTES
        </label>
        <textarea
          id="justrow-notes"
          className="summary-notes-textarea"
          placeholder="What happened out there?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </>
  );
}
