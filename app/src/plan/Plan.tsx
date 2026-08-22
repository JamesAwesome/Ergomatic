import { useState } from "react";
import { Link } from "react-router-dom";
import { PLANS } from "../../domain/plans.js";
import TypeBadge from "../components/TypeBadge";
import { usePlan } from "../api/usePlan";
import type { PlanData, PlanKey, PlanSequenceItem } from "../api/usePlan";
import { usePlanLinks } from "./usePlanLinks";

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
          // can never link a row that isn't actually done.
          const linkedLogId =
            item.status === "done" ? links.get(item.index) : undefined;
          const rowClassName = `plan-row plan-row-${item.status}`;
          const ariaCurrent = item.status === "today" ? "step" : undefined;
          const rowContent = (
            <>
              <span className="plan-row-index mono-status">
                {item.index + 1}
              </span>
              <TypeBadge type={item.code} />
              {/* Phase 8A: the "TEST" badge retired with its plan code — a
                  checkpoint is now a real-type day carrying a prescription,
                  computed CLIENT-SIDE from PLANS (the prescription never
                  crosses the wire). The affix is the PRESCRIBED WORKOUT'S
                  TITLE, uppercased to the row's mono voice (James,
                  2026-08-22: the checkpoint is the one day the plan names
                  a specific workout, so the row says which — reads
                  FIRST 2K now, 2K TEST after PR B's rename lands). */}
              {activePreset.sessions[item.index]?.prescribe !== undefined && (
                <span className="plan-row-checkpoint mono-status">
                  {activePreset.sessions[
                    item.index
                  ]!.prescribe!.ref.title.toUpperCase()}
                </span>
              )}
              <span className="plan-row-status" aria-hidden="true">
                {STATUS_GLYPH[item.status]}
              </span>
              <span className="visually-hidden">{item.status}</span>
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
