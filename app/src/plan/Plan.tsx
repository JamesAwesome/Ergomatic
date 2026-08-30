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
 *  NOT the workouts table's pgEnum). `POST /api/logs` now validates it
 *  against the `WorkoutType` union, so no NEW row can carry an
 *  unrecognised value; rows written before that check can, and this
 *  narrowing exists for them alone. `undefined` here means "we cannot
 *  read it", which the swap check below treats as no evidence at all
 *  rather than as a deviation. */
function rowedType(link: PlanLink | undefined): WorkoutType | undefined {
  return link !== undefined && isWorkoutType(link.workoutType)
    ? link.workoutType
    : undefined;
}

/** What this done row replaced, or `undefined` when it was rowed as
 *  planned. The whole check is DERIVED from what the screen already
 *  holds — the log's own record against `PLANS` — so nothing new is
 *  stored and no migration exists to get wrong. Its one accepted cost:
 *  editing a preset's session types would make old rows read as swapped
 *  against the NEW definition (the presets are static code and have
 *  changed once, at Phase 8A).
 *
 *  Two triggers, ONE mark, and the checkpoint branch wins when both could
 *  fire — naming the prescription is strictly more informative than
 *  naming its type, and a row has room for one mark.
 *
 *  **A CHECKPOINT day asks about IDENTITY, never about type.** The three
 *  checkpoint days are the days the plan names a specific workout.
 *  `resolvePrescribed` (`domain/prescription.ts`) resolves such a ref as
 *  `w.title === ref.title && (!ref.globalOnly || w.isGlobal)`, reading
 *  both facts off ONE workout row, and this is that predicate one layer
 *  down. Each part was a live defect before it was here:
 *
 *  - **Title alone is not identity.** A rower may author their own
 *    workout called "2K Test" — titles are not unique, nothing excludes
 *    the onboarding names, and `isOnboardingTitle`'s own comment says
 *    such a row is "real, ownable" and must stay suggestable. Rowing it
 *    on the checkpoint day is NOT doing the prescribed test, and a
 *    title-only check called it one.
 *  - **Type must NOT enter this branch.** It looks like a cheap extra
 *    guard and it is actively wrong: the global 6K Test was reclassified
 *    O2 -> AT on 2026-08-22, and `workout_type` is a save-time snapshot,
 *    so a genuinely-prescribed 6k rowed before that date is stored O2
 *    against an AT checkpoint day forever. Guarding on type marked it
 *    swapped. The seed's own comment already ruled that split legitimate.
 *  - **BOTH identity facts must come from the SAME row.** Comparing the
 *    log's snapshot TITLE against the joined row's OWNERSHIP mixes two
 *    sources that are free to disagree: `POST /api/logs` resolves
 *    `workoutId` only to check ownership and then trusts the submitted
 *    title and type independently, so a request naming the global 6K
 *    Test's id with a "2K Test" snapshot was accepted and left the sprint
 *    checkpoint unmarked. Renaming a prescribed global would do the same
 *    through the front door. So identity reads `linkedTitle` and
 *    `workoutIsGlobal` — the linked row's own pair, which also means a
 *    future rename self-heals, since the workouts table converges and the
 *    ref is a constant.
 *
 *  The SNAPSHOT title is the fallback, and only when there is no linked
 *  row to read: an off-app log that carried no `workoutId`, or a workout
 *  since deleted. `canonicalTitle` belongs to exactly that path — the
 *  2026-08-22 rename moved the titles too ("First 2k" -> "2K Test") and
 *  log snapshots keep the old spelling forever.
 *
 *  Unknown identity never manufactures a mark. The mark is a positive
 *  accusation, so a matching title with unresolvable ownership stays
 *  quiet rather than guessing; a DIFFERING title is positive evidence of
 *  a different workout and still marks on its own. **The cost is real and
 *  is ACCEPTED (James, 2026-08-30):** deleting a personal same-titled
 *  workout nulls the log's link, so a row that WAS marked stops being
 *  marked. Re-gated verbally after #233's re-review pointed out that the
 *  design gate had only covered preset edits; storing provenance at save
 *  time was the alternative and is deliberately not built. ROADMAP holds
 *  the entry and the revisit trigger.
 *
 *  Every OTHER day compares type, where an unreadable stored type also
 *  never manufactures a mark — it can fail to CONFIRM a match, never
 *  contradict one. */
function swapMark(
  link: PlanLink | undefined,
  plannedType: WorkoutType,
  prescribe: Prescription | undefined,
): string | undefined {
  if (link === undefined) return undefined;
  if (prescribe !== undefined) {
    const ref = prescribe.ref;
    // The linked row's own pair when there is one; the snapshot title
    // with unknown ownership when there is not. Never one from each.
    const identity =
      link.linkedTitle !== null
        ? { title: link.linkedTitle, isGlobal: link.workoutIsGlobal }
        : { title: canonicalTitle(link.workoutTitle), isGlobal: null };
    // `ref.globalOnly` is read, not assumed. Every shipped ref sets it
    // true, but `PrescribedRef` allows false and `resolvePrescribed`
    // honours it — hard-coding the global requirement here would silently
    // reject a legitimate personal match the day a false ref exists.
    const asPrescribed =
      identity.title === ref.title &&
      (!ref.globalOnly || identity.isGlobal !== false);
    // The workout's own name, in its own case — the mark names a WORKOUT
    // here and a TYPE below, and a type code genuinely is uppercase where
    // a title is not. Uppercasing the title would re-introduce the "2K
    // TEST reads as a label" problem this round removed from the row.
    return asPrescribed ? undefined : ref.title;
  }
  const rowed = rowedType(link);
  return rowed !== undefined && rowed !== plannedType ? plannedType : undefined;
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
              {/* ONE name per row, in one treatment (James, 2026-08-30:
                  "a 2k test is just a specific workout on a specific
                  day"). Which workout it names depends on whether the day
                  has happened: the one you rowed if it has, the one the
                  plan asks for if it has not (only the three checkpoint
                  days carry a prescription — `PLANS` holds it client-side
                  and it never crosses the wire, Phase 8A).
                  The prescribed title used to render uppercased in the
                  mono label voice, which made a real library workout —
                  "2K Test" has its own detail route and is classified
                  AN/hard/pain 5 — read as a status badge instead of as a
                  name. Every other surface in the app titles a workout at
                  --ink in sentence case (`.workout-row-title`,
                  `.today-log-title`); the plan row was the only one that
                  shouted it. A done row cannot show both, and does not
                  need to: it records what was rowed, plus a mark when
                  that was something else. */}
              {(link !== undefined || prescribe !== undefined) && (
                <span className="plan-row-name">
                  {link !== undefined
                    ? link.workoutTitle
                    : prescribe!.ref.title}
                </span>
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
