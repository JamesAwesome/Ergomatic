import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
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

          {view.planFooter !== undefined && (
            <p className="log-plan-footer">{view.planFooter}</p>
          )}
        </>
      )}
    </main>
  );
}
