import { useState } from "react";
import { Link } from "react-router-dom";
import { PLANS } from "../../domain/plans.js";
import { canonicalTitle } from "../../domain/onboarding.js";
import { isWorkoutType, type WorkoutType } from "../../domain/types.js";
import type { Prescription } from "../../domain/prescription.js";
import TypeBadge from "../components/TypeBadge";
import { usePlan } from "../api/usePlan";
import type { PlanData, PlanKey, PlanSequenceItem } from "../api/usePlan";
import { usePlanLinks, type PlanLink } from "./usePlanLinks";

const PLAN_KEYS: PlanKey[] = ["sprint", "head"];

// One-liners: not in domain/plans.ts (that file only carries title/sessions),
// so these paraphrase each preset's own philosophy comment block there
// (sprint: "O2-forward ... speed is sharpened on top of it"; head: "O2
// alone is nearly half the plan").
// Both name their reference distance (owner report, 2026-08-01: head said
// "long-course" while sprint said "2k" — the pair should read in parallel).
const PLAN_BLURBS: Record<PlanKey, string> = {
  sprint: "2k prep: an O2 base with speed sharpened on top.",
  head: "6k prep: the biggest aerobic engine wins.",
};

const STATUS_GLYPH: Record<PlanSequenceItem["status"], string> = {
  done: "✓", // ✓
  today: "▶", // ▶
  upcoming: "",
};

/** The type a done row should badge: the type actually ROWED when the
 *  stored value is readable, otherwise the plan's own.
 *
 *  The badge has to agree with the workout named beside it. On an
 *  unswapped row both values are equal, so nothing moves; on a swapped
 *  row, badging the PLAN's type would put a TR badge next to an O2
 *  workout's name and make the row contradict itself.
 *
 *  `session_logs.workout_type` is plain `text` (schema.ts — deliberately
 *  NOT the workouts table's pgEnum), and the POST route only checks it is
 *  a non-empty string, so an unrecognised value is genuinely storable.
 *  `undefined` here means "we cannot read it", which the swap check below
 *  treats as no evidence at all rather than as a deviation. */
function rowedType(link: PlanLink | undefined): WorkoutType | undefined {
  return link !== undefined && isWorkoutType(link.workoutType)
    ? link.workoutType
    : undefined;
}

/** What this done row replaced, or `undefined` when it was rowed as
 *  planned. The whole check is DERIVED from what the screen already
 *  holds — the log's save-time snapshot against `PLANS` — so nothing new
 *  is stored and no migration exists to get wrong. Its one accepted cost:
 *  editing a preset's session types would make old rows read as swapped
 *  against the NEW definition (the presets are static code and have
 *  changed once, at Phase 8A).
 *
 *  Two triggers, ONE mark, and the checkpoint branch wins when both fire —
 *  naming the prescription is strictly more informative than naming its
 *  type, and a row has room for one mark:
 *
 *  1. A CHECKPOINT day (the three days the plan names a specific workout)
 *     where that workout is not what was rowed. `canonicalTitle` is what
 *     makes this safe to ask: `session_logs.workout_title` is a save-time
 *     snapshot the seed's rename pre-pass never rewrites, so a 2k test
 *     logged before 2026-08-22 is spelled "First 2k" forever while the
 *     prescription says "2K Test" — comparing raw strings would tell a
 *     rower who DID the prescribed test that they did something else.
 *  2. Any other day whose rowed type differs from the plan's.
 *
 *  An unreadable stored type never manufactures a mark on either branch:
 *  it can only fail to CONFIRM a match, never contradict one. */
function swapMark(
  link: PlanLink | undefined,
  plannedType: WorkoutType,
  prescribe: Prescription | undefined,
): string | undefined {
  if (link === undefined) return undefined;
  const rowed = rowedType(link);
  const typeContradicts = rowed !== undefined && rowed !== plannedType;
  if (prescribe !== undefined) {
    const asPrescribed =
      canonicalTitle(link.workoutTitle) === prescribe.ref.title &&
      !typeContradicts;
    return asPrescribed ? undefined : prescribe.ref.title.toUpperCase();
  }
  return typeContradicts ? plannedType : undefined;
}

export default function Plan() {
  const planState = usePlan();

  if (planState.state === "loading") {
    return (
      <main className="screen">
        <h1 className="screen-title">Plan</h1>
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  if (planState.state === "error") {
    return (
      <main className="screen">
        <h1 className="screen-title">Plan</h1>
        <p className="mono-status">Couldn't load your plan.</p>
        <button
          type="button"
          className="button-outline"
          onClick={planState.retry}
        >
          Retry
        </button>
      </main>
    );
  }

  return (
    <PlanView
      plan={planState.plan}
      choose={planState.choose}
      reset={planState.reset}
    />
  );
}

type PendingAction = "reset" | "switch" | null;

function PlanView({
  plan,
  choose,
  reset,
}: {
  plan: PlanData;
  choose: (planKey: PlanKey) => Promise<void>;
  reset: () => Promise<void>;
}) {
  // From-the-log spec (2026-08-18) §1/§3: one fetch on mount when a plan
  // is active — called unconditionally (React's own rules-of-hooks; the
  // `plan.planKey === null` early return sits below this), and the hook
  // itself fires no fetch at all in that case (its own guard). `reset`
  // does not change `planKey`, so a Reset alone doesn't refetch — every
  // row is `today`/`upcoming` immediately after one anyway (see the
  // `linkedLogId` derivation below), so a stale links Map is inert until
  // the next real advance, which only ever happens after this screen has
  // been left and revisited (a fresh mount, a fresh fetch).
  const links = usePlanLinks(plan.planKey);

  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setPending(null);
    setError(null);
  }

  // No active plan: choosing a preset is a single tap — no staged confirm,
  // since there is no existing progress to lose (spec: "choosing with no
  // active plan = single tap"). Returns whether it succeeded so handleSwitch
  // (below) can decide whether the confirm panel should close.
  async function handleChoose(key: PlanKey): Promise<boolean> {
    setError(null);
    setBusy(true);
    try {
      await choose(key);
      return true;
    } catch {
      setError("Couldn't start that plan. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setError(null);
    setBusy(true);
    try {
      await reset();
      setPending(null);
    } catch {
      setError("Couldn't reset your plan. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Switching is a destructive choose (it zeroes doneN, same as reset) —
  // only close the confirm panel on success, so a failed switch leaves the
  // panel (and its error) up rather than silently reverting to the header.
  async function handleSwitch(key: PlanKey) {
    const ok = await handleChoose(key);
    if (ok) setPending(null);
  }

  if (plan.planKey === null) {
    return (
      <main className="screen">
        <h1 className="screen-title">Plan</h1>
        <p className="plan-intro">
          Pick a plan and Today will suggest from it every day.
        </p>
        <div className="plan-presets">
          {PLAN_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="plan-preset-card"
              onClick={() => handleChoose(key)}
              disabled={busy}
            >
              <h2 className="plan-preset-title">{PLANS[key].title}</h2>
              <p className="plan-preset-blurb">{PLAN_BLURBS[key]}</p>
              <p className="plan-preset-count mono-status">
                {PLANS[key].sessions.length} SESSIONS
              </p>
            </button>
          ))}
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </main>
    );
  }

  const activePreset = PLANS[plan.planKey];
  const otherKey: PlanKey = plan.planKey === "sprint" ? "head" : "sprint";
  const otherPreset = PLANS[otherKey];

  return (
    <main className="screen">
      <h1 className="screen-title">Plan</h1>
      <div className="plan-active-header">
        <div>
          <p className="plan-active-title">{activePreset.title}</p>
          <p className="mono-status">
            SESSION {plan.doneN + 1} OF {plan.sequence.length}
          </p>
        </div>
        {pending === null && (
          <div className="plan-active-actions">
            <button
              type="button"
              className="button-outline"
              onClick={() => setPending("reset")}
            >
              Reset
            </button>
            <button
              type="button"
              className="button-outline"
              onClick={() => setPending("switch")}
            >
              Switch
            </button>
          </div>
        )}
      </div>

      {/* Staged-confirm idiom (src/you/BaselineEditor.tsx, also
          WorkoutDetail.tsx's delete): the destructive action never fires on
          the first press, and the copy names the exact consequence. */}
      {pending === "reset" && (
        <div className="baseline-confirm">
          <p className="baseline-confirm-line">
            This resets your progress. Session 1 becomes today.
          </p>
          {error && <p className="baseline-error">{error}</p>}
          <div className="baseline-actions">
            <button
              type="button"
              className="button-outline"
              onClick={cancel}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={handleReset}
              disabled={busy}
            >
              Reset progress
            </button>
          </div>
        </div>
      )}

      {pending === "switch" && (
        <div className="baseline-confirm">
          <p className="baseline-confirm-line">
            Switching to {otherPreset.title} resets your progress. Session 1
            becomes today.
          </p>
          {error && <p className="baseline-error">{error}</p>}
          <div className="baseline-actions">
            <button
              type="button"
              className="button-outline"
              onClick={cancel}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={() => handleSwitch(otherKey)}
              disabled={busy}
            >
              Switch to {otherPreset.title}
            </button>
          </div>
        </div>
      )}

      <ul className="plan-sequence" aria-label="Plan sequence">
        {plan.sequence.map((item) => {
          // §1 (Task 6): a done row with stored linkage becomes a link;
          // a done row with none (pre-spec-2 checkmarks, or a fetch that
          // hasn't resolved/failed) stays plain text — no guessing. Only
          // `status === "done"` ever consults `links` at all, so a
          // malformed/adversarial response naming a today/upcoming index
          // can never link a row that isn't actually done — nor, now,
          // name a workout on one.
          const link =
            item.status === "done" ? links.get(item.index) : undefined;
          const linkedLogId = link?.id;
          const prescribe = activePreset.sessions[item.index]?.prescribe;
          const mark = swapMark(link, item.code, prescribe);
          // Variant B (design gate, 2026-08-30): the mark drops to its own
          // line rather than sharing one with the name. Inline, "INSTEAD
          // OF 2K TEST" takes 126 px of a 330 px row and squeezes the name
          // to about fifteen characters — worst on the three checkpoint
          // days, which are the rows most worth reading.
          const rowClassName = `plan-row plan-row-${item.status}${
            mark !== undefined ? " plan-row-swapped" : ""
          }`;
          const ariaCurrent = item.status === "today" ? "step" : undefined;
          const rowContent = (
            <>
              <span className="plan-row-index mono-status">
                {item.index + 1}
              </span>
              <TypeBadge type={rowedType(link) ?? item.code} />
              {/* Phase 8A: the "TEST" badge retired with its plan code — a
                  checkpoint is now a real-type day carrying a prescription,
                  computed CLIENT-SIDE from PLANS (the prescription never
                  crosses the wire). The affix is the PRESCRIBED WORKOUT'S
                  TITLE, uppercased to the row's mono voice (James,
                  2026-08-22: the checkpoint is the one day the plan names
                  a specific workout, so the row says which: 2K TEST /
                  6K TEST).
                  It yields to the name once the row has one: the affix
                  exists to say which workout the plan WANTS, and a row
                  that already records what was rowed — plus a mark when
                  that was something else — has no second thing to say. */}
              {prescribe !== undefined && link === undefined && (
                <span className="plan-row-checkpoint mono-status">
                  {prescribe.ref.title.toUpperCase()}
                </span>
              )}
              {link !== undefined && (
                <span className="plan-row-name">{link.workoutTitle}</span>
              )}
              <span className="plan-row-status" aria-hidden="true">
                {STATUS_GLYPH[item.status]}
              </span>
              <span className="visually-hidden">{item.status}</span>
              {mark !== undefined && (
                <span className="plan-row-swap">INSTEAD OF {mark}</span>
              )}
            </>
          );
          return (
            <li key={item.index}>
              {linkedLogId !== undefined ? (
                // `state.from = "/plan"` — `FromTheLog.tsx`'s own
                // `resolveLogBack` map resolves this exact origin to the
                // `← PLAN` label (spec §4 N5), already shipped in Task 5.
                <Link
                  to={`/today/log/${linkedLogId}`}
                  state={{ from: "/plan" }}
                  className={rowClassName}
                  aria-current={ariaCurrent}
                >
                  {rowContent}
                </Link>
              ) : (
                <div className={rowClassName} aria-current={ariaCurrent}>
                  {rowContent}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
