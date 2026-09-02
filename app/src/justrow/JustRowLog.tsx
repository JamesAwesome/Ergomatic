import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { fmtDuration } from "../../domain/duration.js";
import { fmtSplit } from "../../domain/format.js";
import {
  read as readHandoff,
  retire as retireHandoff,
  type HandoffEntry,
} from "../monitor/handoffStore";
import { useLogForm } from "../session/LogSession";
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
 * **"Save this row" is one action with no plan choice to name.** The
 * shipped door's pair (`Log against plan` / `Save without logging`) decides
 * whether the session counts toward the plan; a free row can never count
 * (the server's own `isFreeRow` refusal is the enforcement), so this door
 * posts `advancesPlan: false` unconditionally and says so with one button.
 */

/** The record this door can serve: a CLOSED free row on the hand-off
 *  store. Anything else — no entry, an open run, a programmed record — is
 *  not this door's to touch and falls through to Today, the same
 *  any-miss-falls-through posture `monitorModeEntry` takes. */
function freeRowEntry(): HandoffEntry | null {
  const entry = readHandoff();
  if (entry === null) return null;
  if (entry.run.mode !== "justrow") return null;
  if (entry.run.completedAt === null) return null;
  return entry;
}

const PAIN_LEVELS = [1, 2, 3, 4, 5];

export default function JustRowLog() {
  const navigate = useNavigate();
  // A mount snapshot on purpose, like `LogSession`'s own doors: the record
  // is closed, so nothing enriches it after mount, and re-reading on every
  // render would make a mid-save retire yank the form out from under the
  // rower.
  const [entry] = useState(freeRowEntry);
  const { held, pain, setPain, notes, setNotes, saving, saveError, submit } =
    useLogForm(() => {
      if (entry !== null) {
        retireHandoff(
          [{ sessionKey: entry.sessionKey, revision: entry.revision }],
          "save-success",
        );
      }
      void navigate("/today/log");
    });
  void held; // the targets question does not exist here; see the header.

  if (entry === null) {
    return <Navigate to="/today" replace />;
  }

  const totals = freeRowTotals(entry.run);
  const avgSplitSeconds =
    totals !== null && totals.meters > 0
      ? (500 * totals.seconds) / totals.meters
      : null;

  function handleSave() {
    if (entry === null || totals === null) return;
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
        // "timer"` with no `deviceName`, lands with the door in Task 7.)
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
      },
      { advancesPlan: false },
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

      {saveError !== null && <p className="form-error">{saveError}</p>}
      <div className="action-stack">
        <button
          type="button"
          className="button-l1"
          disabled={saving || totals === null}
          onClick={handleSave}
        >
          Save this row
        </button>
      </div>
    </main>
  );
}
