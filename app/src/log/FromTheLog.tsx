import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { fmtSplit } from "../../domain/format.js";
import { api } from "../api";
import type { HeldResult, Thumbs } from "../api/useRecentLogs";
import {
  SummaryHeroesBlock,
  SummaryIntervalsBlock,
  SummaryMetaBlock,
  SummaryReflectionCard,
} from "../session/PostWorkoutSummary";
import { resolveBackTarget } from "../shell/BackLink";
import { buildStoredSummary, type StoredLog } from "./storedSummary";
import TraceChart from "./TraceChart";

// RC-2/RC-3 wave (docs/superpowers/specs/2026-08-24-summary-record-design.md
// §3, PR 2), copy amended by the 2026-08-25 plan's Global Constraints
// (James's label ruling): the LE u32 word rendering the PM5's own
// Verification screen uses, uppercase hex, `XXXX-XXXX` per word
// (PRIMARY-photographed, walk-2026-08-23). Reads only the FIRST 8 bytes —
// a longer array (the jsonb column's cap is 32) still renders exactly one
// code, matching the hardware screen's own fixed two-word display.
function verificationCode(bytes: number[]): string {
  const word = (o: number) =>
    (
      ((bytes[o + 3] << 24) |
        (bytes[o + 2] << 16) |
        (bytes[o + 1] << 8) |
        bytes[o]) >>>
      0
    )
      .toString(16)
      .toUpperCase()
      .padStart(8, "0");
  const dash = (w: string) => `${w.slice(0, 4)}-${w.slice(4)}`;
  return `${dash(word(0))} ${dash(word(4))}`;
}

// §3's value line, `2:04.0 work · 500m` for the walk's real values — house
// elastic-positional time WITH tenths (`fmtSplit`, already imported by
// this screen's own `storedSummary.ts` for pace cells; reused here rather
// than `fmtDuration`, which drops the tenths digit §3's own example
// requires). Called only when `machineWorkSeconds` is non-null (the
// block's own render guard below), so the "work" clause is always
// present; `machineWorkMeters` is independently nullable at the DB layer
// (`server/db/schema.ts`) even though the walk's real capture always
// carries both together, so the meters clause degrades toward absence
// rather than inventing a value — same "never fabricate, degrade toward
// absence" rule `storedSummary.ts`'s own header comment names elsewhere
// on this screen.
function machineConfirmedValueLine(row: StoredLog): string {
  const parts = [`${fmtSplit(row.machineWorkSeconds!)} work`];
  if (row.machineWorkMeters !== null) parts.push(`${row.machineWorkMeters}m`);
  return parts.join(" · ");
}

// §3: "a row whose server row carries `machine_work_seconds` renders" —
// the ONE trigger for the whole block; `machineWorkMeters`/
// `machineSummary` only ever add or omit a clause inside an already-
// rendered block, never gate the block's own presence. Reads straight off
// the fetched `StoredLog` row, never `buildStoredSummary`'s pure view
// model (Global Constraints: "the block reads ... off the fetched
// StoredLog row and NOTHING else") — this screen's ONE other component
// that skips the view model, by the same spec's own explicit instruction.
function MachineConfirmedBlock({ row }: { row: StoredLog }) {
  if (row.machineWorkSeconds === null) return null;
  const bytes = row.machineSummary?.verificationBytes;
  const code =
    bytes !== undefined && bytes.length >= 8
      ? verificationCode(bytes)
      : undefined;
  return (
    <div
      className="log-machine-confirmed"
      role="group"
      aria-label="MACHINE CONFIRMED · WORK ONLY"
    >
      <p className="log-machine-confirmed-title">
        MACHINE CONFIRMED · WORK ONLY
      </p>
      <p className="log-machine-confirmed-value">
        {machineConfirmedValueLine(row)}
      </p>
      {code !== undefined && (
        <p className="log-machine-confirmed-code">CODE {code}</p>
      )}
      {/* NO CAPTION (James, 2026-08-27: "just no prose"). This block used to
          end with a sentence about where rest metres appear. It was rewritten
          four times, each correction buying accuracy with another clause, and
          every version was redundant: the title above says WORK ONLY, and the
          TOTAL line on the same screen names its own rest outright ("4:04
          total · plus 242 m coasting in rest"). A caption explaining a line
          that already explains itself is prose, not information. */}
    </div>
  );
}

// From-the-log spec (2026-08-18), §4 N5: the back affordance follows the
// SHIPPED BackLink idiom (origin rides `location.state.from`), but unlike
// every other screen's single fixed label, THIS screen's label must name
// whichever exact destination the resolved origin is — reused directly
// (`resolveBackTarget`, the same export Reader.tsx's own ✕ close reuses)
// rather than through `<BackLink>` itself, which only ever takes one
// caller-fixed label. Cold deep link (no `state.from`) falls through
// `resolveBackTarget`'s own fallback to `/today/log`, which this map
// resolves to `← LOG` — exactly §4 N5's stated cold-deep-link behavior,
// with no separate branch needed for it.
const LOG_BACK_LABELS: Record<string, string> = {
  "/today/log": "← LOG",
  "/today": "← TODAY",
  "/plan": "← PLAN",
};

/** Fix round LOW (a): resolves TARGET and LABEL together from the SAME
 *  lookup, never independently — the previous shape resolved `target` via
 *  `resolveBackTarget` (which only validates the value is a SAFE in-app
 *  path, e.g. `isSafeInAppPath`, not that it's one of THIS screen's three
 *  known origins) and `label` via a separate `?? "← LOG"` fallback, so an
 *  origin state carrying some other safe-but-unmapped in-app path (a
 *  future caller, a hand-crafted deep link) would have linked there while
 *  still LABELING it `← LOG` — exactly the "label names one place, the
 *  affordance navigates to another" failure §4 N5 exists to forbid. An
 *  unmapped origin now falls the TARGET back to `/today/log` too, so
 *  label and destination can never diverge. */
function resolveLogBack(origin: string): { target: string; label: string } {
  const label = LOG_BACK_LABELS[origin];
  return label === undefined
    ? { target: "/today/log", label: "← LOG" }
    : { target: origin, label };
}

type FetchState =
  | { state: "loading" }
  | { state: "not-found" }
  | { state: "error"; retry: () => void }
  // `setRow` rides the ready state itself (the `usePlan.ts` idiom — its
  // own `ready` variant carries `choose`/`reset` alongside `plan`) rather
  // than a second `useState` in the component synced from this one via an
  // effect: deriving one piece of React state from another inside a
  // `useEffect` body is exactly the synchronous-setState-in-effect shape
  // the lint rule (and the React docs it's drawn from) flag — folding the
  // update path into THIS state machine means a successful PATCH is just
  // another transition of the same state, computed during the event
  // handler that caused it, not synchronized after the fact.
  | { state: "ready"; row: StoredLog; setRow: (row: StoredLog) => void };

/** `GET /api/logs/:id` (spec §3) — this hook does exactly one thing:
 *  fetch and hold server state. §4 N1: it never reads or writes
 *  localStorage/sessionStorage and never touches a draft/run/monitor
 *  record — the mount-side-effect-free contract both `/today/log` routes
 *  share. A malformed/absent `:id` (shouldn't route here, but defensive)
 *  renders the same not-found state a genuine 404 would — decided in the
 *  lazy `useState` initializer, not a synchronous `setState` inside the
 *  effect body below (same reasoning as `setRow` above). */
function useLogFetch(id: string | undefined): FetchState {
  const [state, setState] = useState<FetchState>(() =>
    id === undefined ? { state: "not-found" } : { state: "loading" },
  );
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (id === undefined) return;
    let cancelled = false;
    const retry = () => setGeneration((g) => g + 1);
    api(`/api/logs/${id}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const row = (await res.json()) as StoredLog;
          const setRow = (nextRow: StoredLog) =>
            setState((prev) =>
              prev.state === "ready" ? { ...prev, row: nextRow } : prev,
            );
          setState({ state: "ready", row, setRow });
        } else if (res.status === 404) {
          setState({ state: "not-found" });
        } else {
          setState({ state: "error", retry });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ state: "error", retry });
      });
    return () => {
      cancelled = true;
    };
  }, [id, generation]);

  return state;
}

interface EditFields {
  held: HeldResult | null;
  pain: number | null;
  thumbs: Thumbs | null;
  notes: string;
}

/** §3/§5D: PATCH sends ONLY the changed subset — every field the staged
 *  edit didn't actually move off the row's own current value is left out
 *  of the body entirely (an absent PATCH key leaves that column alone;
 *  see `stores/logs.ts`'s own `LogPatch` comment for why that distinction
 *  matters — a present-and-equal key would still be a real write, just a
 *  no-op one, which is not what "unchanged" means here). `notes` is
 *  normalized the same way the live door's own save does
 *  (`LogSession.tsx`: `notes.trim().length > 0 ? notes : null`) before
 *  comparing, so retyping the identical text (or clearing to
 *  whitespace-only) doesn't count as a change either. */
function buildPatch(
  row: StoredLog,
  edit: EditFields,
): Record<string, HeldResult | number | Thumbs | string | null> {
  const patch: Record<string, HeldResult | number | Thumbs | string | null> =
    {};
  if (edit.held !== row.held) patch.held = edit.held;
  if (edit.pain !== row.pain) patch.pain = edit.pain;
  if (edit.thumbs !== row.thumbs) patch.thumbs = edit.thumbs;
  const normalizedNotes = edit.notes.trim().length > 0 ? edit.notes : null;
  if (normalizedNotes !== row.notes) patch.notes = normalizedNotes;
  return patch;
}

/** The from-the-log view (design spec docs/superpowers/specs/2026-08-18-
 *  from-the-log-design.md §5, route `/today/log/:id`) — spec 1's summary
 *  re-skinned per the handoff: `FROM YOUR LOG` eyebrow, the reflection
 *  card swapped for a read-back with an Edit affordance, a plan-linkage
 *  footer. A READ surface (§1): it renders server data only and never
 *  touches session records, drafts, or monitor state (§4 N1) — every
 *  number/label comes from `buildStoredSummary`, reusing
 *  `PostWorkoutSummary`'s own extracted meta/heroes/intervals/reflection-
 *  card pieces so this screen can never render the same fact differently
 *  than the live door did at save time. */
export default function FromTheLog() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fetchState = useLogFetch(id);
  // Derived during render, not synced via an effect (see `FetchState`'s
  // own comment above) — `row`/`view` recompute from whatever the fetch
  // state machine currently holds, including right after a successful
  // PATCH's own `setRow` call.
  const row = fetchState.state === "ready" ? fetchState.row : null;

  // §5F: a 404'd id always shows `← LOG`, overriding the origin-based
  // resolution below — the row is gone, so a stale "← TODAY"/"← PLAN"
  // origin is no more useful than the universal one, and the spec names
  // this exact label for this exact state.
  const origin = resolveBackTarget(location.state, "/today/log");
  const { target: backTarget, label: backLabel } =
    fetchState.state === "not-found"
      ? { target: "/today/log", label: "← LOG" }
      : resolveLogBack(origin);

  // §4 N6: edit mode is in-page state, not a route — entering it pushes
  // nothing onto history, and leaving this screen any way at all (browser
  // BACK, tab bar, the back affordance) discards these four fields
  // without a trap, simply by unmounting. Re-initialized fresh from `row`
  // every time edit is entered, so Cancel (which merely flips `editing`
  // back to false with no reset of its own) always shows the CURRENT
  // committed values the next time Edit is tapped, never a stale draft
  // from an earlier abandoned edit.
  const [editing, setEditing] = useState(false);
  const [held, setHeld] = useState<HeldResult | null>(null);
  const [pain, setPain] = useState<number | null>(null);
  const [thumbs, setThumbs] = useState<Thumbs | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function enterEdit() {
    if (row === null) return;
    setHeld(row.held);
    setPain(row.pain);
    setThumbs(row.thumbs);
    setNotes(row.notes ?? "");
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setSaveError(null);
    setEditing(false);
  }

  async function save() {
    if (row === null) return;
    const patch = buildPatch(row, { held, pain, thumbs, notes });
    if (Object.keys(patch).length === 0) {
      // Nothing actually changed — an honest no-op, no PATCH sent (§3's
      // own empty-patch precedent is a no-op READ; sending an empty-diff
      // write here would be the identical waste one layer up).
      setEditing(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await api(`/api/logs/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = (await res.json()) as StoredLog;
        if (fetchState.state === "ready") fetchState.setRow(updated);
        setEditing(false);
        setSaving(false);
        return;
      }
      // §4 N6: "re-enables with the server's field-named message" — the
      // route's own `badRequest` body already names the field in its
      // `error` text (e.g. "held must be one of held|under|over or
      // null"), so surfacing it verbatim IS the field-named message.
      let message = "Couldn't save. Try again.";
      try {
        const body = (await res.json()) as { error?: unknown };
        if (typeof body.error === "string") message = body.error;
      } catch {
        // Non-JSON error body — keep the generic message.
      }
      setSaveError(message);
      setSaving(false);
    } catch {
      setSaveError("Couldn't save. Try again.");
      setSaving(false);
    }
  }

  // Log-delete spec (2026-08-18), §1: the staged destructive confirm.
  // WorkoutDetail.tsx's own "Delete workout" (`OwnerActions`) has since
  // moved to a DIFFERENT idiom than what §1's table describes (its own
  // "Fix round 1 (F2)" comment: arm-in-place, disarm on blur/4s, no
  // literal Cancel button — confirmed by that component's own test suite,
  // which proves disarm via `fireEvent.blur`, never a Cancel click). §1's
  // own text ("Cancel + confirm pair") and this task's brief ("Cancel
  // unstages", a separately testable bullet from "first tap stages") both
  // name a REAL Cancel control, which arm-in-place doesn't have. The
  // house idiom that actually IS "stage → consequence copy → Cancel +
  // confirm pair" is `.baseline-confirm`/`.baseline-actions` — used six
  // places already, including WorkoutDetail.tsx's OWN `replaceStage` panel
  // a few hundred lines above its delete button (`button-outline` Cancel
  // beside a bare `button-primary` confirm, inside `.baseline-confirm`) —
  // reused here verbatim rather than the delete button's own idiom, which
  // no longer matches the spec's description at all.
  const [deleteStaged, setDeleteStaged] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function stageDelete() {
    setDeleteError(null);
    setDeleteStaged(true);
  }

  function cancelDelete() {
    setDeleteError(null);
    setDeleteStaged(false);
  }

  async function confirmDelete() {
    if (row === null) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await api(`/api/logs/${row.id}`, { method: "DELETE" });
      // §1 "In-flight": a 404 means another tab already deleted this row —
      // treated as success-and-navigate, never surfaced as an error (the
      // antagonist's own "an error toast for an operation that succeeded"
      // finding).
      if (res.ok || res.status === 404) {
        navigate(backTarget);
        return;
      }
      let message = "Couldn't delete this session. Try again.";
      try {
        const body = (await res.json()) as { error?: unknown };
        if (typeof body.error === "string") message = body.error;
      } catch {
        // Non-JSON error body — keep the generic message.
      }
      setDeleteError(message);
      setDeleting(false);
    } catch {
      setDeleteError("Couldn't delete this session. Try again.");
      setDeleting(false);
    }
  }

  const view = row !== null ? buildStoredSummary(row) : null;

  return (
    // §4 N3: `.overlay-screen` (Reader/Releases' own idiom) supplies the
    // own-scroller mechanism — no page-specific class beyond it (fix
    // round LOW: dropped an unstyled, unreferenced `.fromlog-screen`
    // class this component used to also carry). No `key={id}` here,
    // matching Releases.tsx's own "no key — this screen has no in-place
    // navigation" precedent: every real entry into this route is a full
    // Route-element mount (leaving `/today/log`/`/today`/`/plan` for a
    // different `:id`), which already gets a fresh DOM node for free.
    // INFO-level foot-gun, comment only: if a future change adds
    // in-place navigation BETWEEN two `/today/log/:id` detail views
    // (e.g. a "next session" link) without an intervening route change,
    // it needs Reader.tsx's `key={article.slug}` treatment — the same
    // fresh-DOM-node trick, keyed on `id` — or N3's scroll-lands-at-top
    // guarantee silently breaks for that one path.
    <main className="screen overlay-screen" tabIndex={0}>
      <p className="summary-eyebrow">FROM YOUR LOG</p>
      <Link to={backTarget} className="back-link">
        {backLabel}
      </Link>

      {fetchState.state === "loading" && (
        <p className="mono-status">LOADING…</p>
      )}

      {fetchState.state === "error" && (
        <>
          <p className="mono-status">Couldn&apos;t load this session.</p>
          <button
            type="button"
            className="button-outline"
            onClick={fetchState.retry}
          >
            Retry
          </button>
        </>
      )}

      {fetchState.state === "not-found" && (
        <p className="mono-status">This session is gone.</p>
      )}

      {row !== null && view !== null && (
        <>
          <SummaryMetaBlock title={row.workoutTitle} meta={view.meta} />
          {/* Door spec (2026-09-02) §1.3: the close-reason line, in the slot
              the cohort-unlock spec's `LINK LOST` already used — ABOVE the
              heroes, between the black rule and AVG SPLIT (Gate 0-A,
              APPROVED by James 2026-09-02, rendered at real proportions;
              the spec's first draft said "beneath" and the artboard, built
              from the real CSS, corrected it). Two triggers, both value
              equalities and both decided in `buildCloseLine`: a link-lost
              close alone, and a row the PARTIAL predicate marks — see
              `StoredSummaryView.closeLine`'s own doc comment. Everything
              else renders nothing here.
              `MachineConfirmedBlock` is UNTOUCHED by this: the marker is a
              sibling ABOVE it, from the view model, so that block keeps its
              "reads the row and nothing else" constraint (its own comment
              at :65-84).
              The DOM and the class are unchanged from the cohort-unlock
              rendering, so the contrast figure below still holds as
              measured.
              `.summary-meta` reused verbatim (no new CSS rule): it's the
              same header's own existing secondary-line class, already
              contrast-audited — this screen is `.overlay-screen`, whose
              background is `--page` (`index.css`'s own `.overlay-screen`
              rule), and `.summary-meta` is `--ink-3` (`index.css`'s own
              `.summary-meta` rule); `--ink-3` on `--page` measures 6.69:1
              (`index.css`'s own draft-restore-notice comment computes
              this exact pairing), clear of the 4.5:1 AA floor — NOT the
              7.43:1 `--ink-3`-on-`--surface` figure (a different
              background this screen never paints on), so this line reads
              as this header's own text rather than inventing a second
              visual register for one sentence. */}
          {view.closeLine !== undefined && (
            <p className="summary-meta">{view.closeLine}</p>
          )}
          <SummaryHeroesBlock heroes={view.heroes} />

          {/* Fix round ❌1: the handoff's own §3 "Section order" table
              (docs/design/handoffs/2026-08-12-post-workout/README.md)
              binds the from-the-log screen's layout (spec §1: "the
              handoff... is the UI/UX authority" for surfaces this spec
              re-skins) — "same minus the save options", which places the
              reflection card at slot 4, ABOVE INTERVALS. §5's own table
              is a property list, not an order spec, and this block used
              to follow §5's row order (meta, heroes, rows, read-back,
              footer) instead — corrected here: read-back/edit renders
              BEFORE the intervals list, matching the handoff's own
              section order exactly. */}
          {editing ? (
            <>
              <SummaryReflectionCard
                hint={undefined}
                expectedPain={null}
                held={held}
                onHeld={setHeld}
                pain={pain}
                onPain={setPain}
                thumbs={thumbs}
                onThumbs={setThumbs}
                notes={notes}
                onNotes={setNotes}
              />
              <div className="action-stack summary-save-stack log-edit-stack">
                {saveError !== null && (
                  <p className="field-error">{saveError}</p>
                )}
                <button
                  type="button"
                  className="summary-save-lead"
                  onClick={save}
                  disabled={saving}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="button-outline"
                  onClick={cancelEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              {!view.readBack.empty && (
                <div className="summary-reflection-card log-readback">
                  {view.readBack.segmentLine !== undefined && (
                    <p className="log-readback-segments">
                      {view.readBack.segmentLine}
                    </p>
                  )}
                  {view.readBack.note !== undefined && (
                    <p className="log-readback-note">{view.readBack.note}</p>
                  )}
                </div>
              )}
              <button
                type="button"
                className="button-outline log-edit-button"
                onClick={enterEdit}
              >
                {view.readBack.empty ? "Add how it felt" : "Edit"}
              </button>
            </>
          )}

          <SummaryIntervalsBlock rows={view.rows} caption={view.caption} />

          {/* RC-2/RC-3 wave, §3: "place it below the interval table...
              matching the section rhythm already on the screen." §3's own
              text says "above MONITOR LOG · COPY" — that diagnostics
              button lives on the LIVE summary (`LogSession.tsx`), which
              this stored view has no equivalent of; the closest analog on
              THIS screen is directly below the interval table and above
              the trace chart, where it sits below. */}
          <MachineConfirmedBlock row={row} />

          {/* Trace-rendering spec (Phase LT spec 3), §1: "above the plan
              footer on the stored one" — `row.series` is `null` (not just
              absent) for the common ABSENT case (any row saved before
              spec 2 shipped), which `<TraceChart>` treats identically to
              `undefined` at its own type boundary; the `?? undefined`
              here is only that type coercion, never a behavioral
              decision this screen makes. */}
          <TraceChart series={row.series ?? undefined} />

          {view.planFooter !== undefined && (
            <p className="log-plan-footer">{view.planFooter}</p>
          )}

          {/* §1 Placement: "Bottom of the view, below the plan footer —
              last, quiet, away from Edit." Copy is a pure function of
              `row.planKey` presence — the one fact this fetch already
              carries (§1's own words: "client-decidable from the one
              fetch it already makes"); the server, never the client,
              decides `unCounted` at DELETE time. */}
          {!deleteStaged ? (
            <button
              type="button"
              className="button-l4 log-delete-trigger"
              onClick={stageDelete}
            >
              Delete session
            </button>
          ) : (
            <div className="baseline-confirm log-delete-confirm">
              <p className="baseline-confirm-line">
                {row.planKey !== null
                  ? "This removes the session and its reflection. If it is your latest plan session, the checkmark un-ticks."
                  : "This removes the session and its reflection."}
              </p>
              {deleteError !== null && (
                <p className="baseline-error">{deleteError}</p>
              )}
              <div className="baseline-actions">
                <button
                  type="button"
                  className="button-outline"
                  onClick={cancelDelete}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button-primary"
                  onClick={confirmDelete}
                  disabled={deleting}
                >
                  Delete session
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
