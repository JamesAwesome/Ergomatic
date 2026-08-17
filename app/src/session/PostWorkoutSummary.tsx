import type { ReactNode } from "react";
import { fmtSplit } from "../../domain/format.js";
import type { HeldResult, Thumbs } from "../api/useRecentLogs";
import type { PlanData } from "../api/usePlan";
import BackLink from "../shell/BackLink";
import type { SummaryModel, SummaryRow } from "./summaryModel";

// Post-workout-summary spec (2026-08-17), §2D — RULED, option B (James
// 2026-08-17): the direction lives in the label now, not just in a
// convention nobody wrote down. UNDER = FASTER than target (under the
// target NUMBER). Mirrored at LogSession.tsx's own (now-retired) copy of
// this comment, the server's HeldResult copy (server/stores/logs.ts), and
// the pgEnum (server/db/schema.ts's `heldResultEnum`) — STORED values are
// unchanged ("held"/"under"/"over"); only these on-screen labels changed.
// Historical rows predate the ruling and are displayed under it, never
// re-interpreted as intent (spec's own words) — Today's LAST THREE keeps
// rendering the bare stored word, which now agrees with the button that
// wrote it.
const HELD_OPTIONS: { value: HeldResult; label: string }[] = [
  { value: "held", label: "HELD" },
  { value: "under", label: "UNDER · FASTER" },
  { value: "over", label: "OVER · SLOWER" },
];

const PAIN_LEVELS = [1, 2, 3, 4, 5] as const;

/** §2D's ACTUAL PAIN caption: `TAP TO RATE` unselected, else the row's own
 *  three-way read of the chosen level (1 -> easier, 2 -> as planned, 3-5 ->
 *  harder) — the design's own literal words, not a re-derivation of
 *  ClassificationCard.tsx's PAIN_WORDS (that card's own EXPECTED-pain
 *  vocabulary answers a different question, "how hard did you expect this
 *  to be", not "how did the actual compare to the plan"). */
function painCaption(pain: number | null): string {
  if (pain === null) return "TAP TO RATE";
  if (pain === 1) return "EASIER THAN PLANNED";
  if (pain === 2) return "AS PLANNED";
  return "HARDER THAN PLANNED";
}

/** A prescribed row's "offset" cell (README §8's flex column, `6K +8`) —
 *  `summaryModel.ts`'s own header explicitly leaves this fragment
 *  unisolated from `label` (`${duration} @ ${refLabel(ref)}`) rather than
 *  parse it there, and invites Task 5 to decide. This is that decision: the
 *  substring after the shared ` @ ` idiom every real `LogStep` label uses
 *  (`logDraft.ts`'s `refPaceLabel`), falling back to the WHOLE label when
 *  that delimiter is absent — only true for a legacy pre-`ref` `SessionRun`
 *  frozen before the idiom existed (`logDraft.ts`'s own FALLBACK
 *  paragraph). Never throws, never fabricates: the fallback is still the
 *  row's own real, honest label text, just not split into two pieces for
 *  that one legacy shape. */
// eslint-disable-next-line react-refresh/only-export-components
export function offsetFragment(label: string): string {
  const at = label.indexOf(" @ ");
  return at === -1 ? label : label.slice(at + 3);
}

/** §2D's single-target hint rule (flagged, not built, by `summaryModel.ts`'s
 *  own header — "Left for Task 5"): `TARGET m:ss` only when EXACTLY ONE
 *  distinct resolved target split exists across the door's own work steps
 *  (167 of 300 seeded workouts); zero (effort-only) or more than one
 *  (multi-target) distinct values both read as "no hint" — the same
 *  `undefined` outcome, no separate branch needed, since a caller asking
 *  "was there a single honest number to anchor this hint on" gets the same
 *  answer either way. The manual (by-hand) door never calls this at all —
 *  its own caller passes the fixed `"BY FEEL"` string instead (spec:
 *  "by-hand manual door: BY FEEL" — an unconditional override, not a
 *  degenerate case of this rule). Exported for a direct, non-integration
 *  test (this file's own convention, matching `monitorModeRun`). */
// eslint-disable-next-line react-refresh/only-export-components
export function singleTargetHint(
  steps: { targetSplit?: number }[],
): string | undefined {
  const distinct = new Set<number>();
  for (const step of steps) {
    if (step.targetSplit !== undefined) distinct.add(step.targetSplit);
  }
  if (distinct.size !== 1) return undefined;
  const [only] = distinct;
  return `TARGET ${fmtSplit(only!)}`;
}

function judgedColorClass(direction: "faster" | "slower" | undefined): string {
  if (direction === "faster") return "summary-row-faster";
  if (direction === "slower") return "summary-row-slower";
  return "";
}

function IntervalRow({ row }: { row: SummaryRow }) {
  if (row.measured) {
    if (row.isWarmup) {
      return (
        <li
          className="summary-row summary-row-warmup"
          aria-label={`Warm-up${row.timeLabel ? `, ${row.timeLabel}` : ""}${row.paceLabel ? ` at ${row.paceLabel} per 500` : ""}`}
        >
          <span className="summary-row-index summary-row-warmup-label">
            WARM-UP
          </span>
          <span className="summary-row-time">{row.timeLabel ?? ""}</span>
          <span className="summary-row-pace">{row.paceLabel ?? ""}</span>
          <span className="summary-row-bar-track" />
          <span className="summary-row-dev" />
        </li>
      );
    }
    const colorClass = judgedColorClass(row.judged?.direction);
    return (
      <li
        className="summary-row"
        aria-label={`Interval ${row.index}: ${row.label}${row.timeLabel ? `, ${row.timeLabel}` : ""}${row.paceLabel ? ` at ${row.paceLabel} per 500` : ""}`}
      >
        <span className="summary-row-index">{row.index}</span>
        <span className="summary-row-time">{row.timeLabel ?? ""}</span>
        <span className={`summary-row-pace ${colorClass}`}>
          {row.paceLabel ?? ""}
        </span>
        <span className="summary-row-bar-track">
          <span className="summary-row-bar-tick" />
          {row.judged !== undefined && (
            <span
              className={`summary-row-bar ${colorClass}`}
              style={{
                width: `${row.judged.barWidthPercent}%`,
                ...(row.judged.direction === "faster"
                  ? { right: "50%" }
                  : { left: "50%" }),
              }}
            />
          )}
        </span>
        <span className={`summary-row-dev ${colorClass}`}>
          {row.judged?.deviationLabel ?? ""}
        </span>
      </li>
    );
  }
  return (
    <li
      className="summary-row"
      aria-label={`Interval ${row.index}: ${row.label}, not measured`}
    >
      <span className="summary-row-index">{row.index}</span>
      <span className="summary-row-duration">{row.durationLabel ?? ""}</span>
      <span className="summary-row-target">{row.targetPaceLabel ?? ""}</span>
      <span className="summary-row-offset">{offsetFragment(row.label)}</span>
      <span className="summary-row-dash">—</span>
    </li>
  );
}

export interface PostWorkoutSummaryProps {
  title: string;
  model: SummaryModel;
  /** `PACES OFF 6K 2:09.0` / `PACES OFF 2K 1:52.0 · 6K 2:02.0`, already
   *  composed by the caller (`LogSession.tsx`'s own `pacesLockedText`) —
   *  `null` omits the caption entirely (the F1 rule: never a bare dash). */
  pacesOffCaption: string | null;
  /** `TARGET m:ss` / `BY FEEL` / absent — see `singleTargetHint`'s own doc
   *  comment for the derivation; the manual door's caller always passes
   *  the literal `"BY FEEL"` string instead of calling that function. */
  hint: string | undefined;
  expectedPain: number | null;
  held: HeldResult | null;
  onHeld: (value: HeldResult | null) => void;
  pain: number | null;
  onPain: (value: number | null) => void;
  thumbs: Thumbs | null;
  onThumbs: (value: Thumbs | null) => void;
  notes: string;
  onNotes: (value: string) => void;
  plan: PlanData | null;
  isOnboarding: boolean;
  saving: boolean;
  saveError: string | null;
  onLogAgainstPlan: () => void;
  onSaveWithoutLogging: () => void;
  /** `null` when this door has nothing staged to discard (the manual
   *  door's original, non-monitor branch — LogSession.tsx's own hard
   *  constraint). A real `ReactNode` otherwise, built by the caller (the
   *  two-tap machinery differs per door — which records clear, where a
   *  fired discard navigates — the "per-door record semantics" §2F names). */
  discardSlot: ReactNode;
  backFallback?: string;
  /** The diagnostics rows (MONITOR LOG · COPY / RECORDING · DOWNLOAD) —
   *  §2F: "SURVIVE below the stack." Rendered as children rather than a
   *  named slot: both are self-contained, state-owning components in
   *  `LogSession.tsx` with no props this screen needs to thread through. */
  children?: ReactNode;
}

/** The post-workout summary (post-workout-summary spec, Phase PW Task 5) —
 *  replaces `SessionComplete` and the old `LogScreen` chrome wholesale
 *  (James's ruling, PROVENANCE.md: "the summary IS the post-row flow").
 *  Pure rendering: every number, label, and per-row measured-ness comes
 *  from `model` (`buildSummaryModel`, Task 4) — this component never
 *  re-derives one. All three doors (monitor/timer/manual) converge on this
 *  one component; `LogSession.tsx` builds the `SummaryModel` and the
 *  door-specific save/discard wiring, this file only renders it. */
export default function PostWorkoutSummary({
  title,
  model,
  pacesOffCaption,
  hint,
  expectedPain,
  held,
  onHeld,
  pain,
  onPain,
  thumbs,
  onThumbs,
  notes,
  onNotes,
  plan,
  isOnboarding,
  saving,
  saveError,
  onLogAgainstPlan,
  onSaveWithoutLogging,
  discardSlot,
  backFallback = "/today",
  children,
}: PostWorkoutSummaryProps) {
  const { meta, heroes, rows, caption } = model;
  const hasHero =
    heroes.avgSplit !== undefined ||
    heroes.time !== undefined ||
    heroes.distanceMeters !== undefined;
  const hasJudgedRow = rows.some((r) => r.measured && r.judged !== undefined);
  const painWord = painCaption(pain);

  // §2F: `Log against plan` carries the plan's own position information
  // (`Log against plan · SESSION n OF N`) whether it's leading or demoted —
  // "the toggle's information, kept at the decision point."
  const logAgainstPlanLabel =
    plan !== null
      ? `Log against plan · SESSION ${plan.doneN + 1} OF ${plan.sequence.length}`
      : "Log against plan";

  // §2F: no plan hides `Log against plan` outright (not disabled) and
  // `Save without logging` leads alone; an onboarding title swaps which of
  // the remaining two buttons leads (6I's "a baseline test must not
  // silently consume plan session 1," now expressed as button order rather
  // than a pre-toggled state). `lead`/`secondary` name the VISUAL slot
  // (54px accent vs 48px outline), independent of which literal button
  // text occupies it.
  const saveWithoutLoggingButton = (
    <button
      key="save-without-logging"
      type="button"
      className={
        plan === null || isOnboarding
          ? "summary-save-lead"
          : "summary-save-secondary"
      }
      onClick={onSaveWithoutLogging}
      disabled={saving}
    >
      Save without logging
    </button>
  );
  const logAgainstPlanButton =
    plan === null ? null : (
      <button
        key="log-against-plan"
        type="button"
        className={
          isOnboarding ? "summary-save-secondary" : "summary-save-lead"
        }
        onClick={onLogAgainstPlan}
        disabled={saving}
      >
        {logAgainstPlanLabel}
      </button>
    );
  const saveButtons =
    plan === null
      ? [saveWithoutLoggingButton]
      : isOnboarding
        ? [saveWithoutLoggingButton, logAgainstPlanButton]
        : [logAgainstPlanButton, saveWithoutLoggingButton];

  return (
    <main className="screen summary-screen">
      <p className="summary-eyebrow">WORKOUT COMPLETE</p>
      <BackLink fallback={backFallback} label="← DONE" />
      <h1 className="screen-title summary-title">{title}</h1>
      <p className="summary-meta">
        {meta.dateLabel}
        {meta.timeLabel !== undefined ? ` · ${meta.timeLabel}` : ""} ·{" "}
        {meta.sourceLabel}
      </p>
      <hr className="summary-rule" />

      {hasHero && (
        <div className="summary-heroes">
          {heroes.avgSplit !== undefined && (
            <div className="summary-hero summary-hero-lead">
              <span className="summary-hero-label">AVG SPLIT</span>
              <span className="summary-hero-value">{heroes.avgSplit}</span>
            </div>
          )}
          {heroes.time !== undefined && (
            <div className="summary-hero">
              <span className="summary-hero-label">TIME</span>
              <span className="summary-hero-value">{heroes.time}</span>
            </div>
          )}
          {heroes.distanceMeters !== undefined && (
            <div className="summary-hero">
              <span className="summary-hero-label">DISTANCE</span>
              <span className="summary-hero-value">
                {heroes.distanceMeters}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="summary-reflection-card">
        <div className="summary-reflection-group">
          <p className="summary-reflection-label">HOW DID IT FEEL?</p>
          <div className="summary-feel-row">
            <button
              type="button"
              className="summary-feel-up"
              aria-pressed={thumbs === "up"}
              onClick={() => onThumbs(thumbs === "up" ? null : "up")}
            >
              ↑ MORE LIKE THIS
            </button>
            <button
              type="button"
              className="summary-feel-down"
              aria-pressed={thumbs === "down"}
              aria-label="Less like this"
              onClick={() => onThumbs(thumbs === "down" ? null : "down")}
            >
              ↓
            </button>
          </div>
        </div>

        <div className="summary-reflection-group">
          <div className="summary-reflection-label-row">
            <p className="summary-reflection-label">
              DID YOU HOLD THE TARGETS?
            </p>
            {hint !== undefined && <p className="summary-hint">{hint}</p>}
          </div>
          <div className="summary-held-row">
            {HELD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="summary-held-chip"
                aria-pressed={held === opt.value}
                onClick={() => onHeld(held === opt.value ? null : opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="summary-reflection-group">
          <div className="summary-reflection-label-row">
            <p className="summary-reflection-label">ACTUAL PAIN</p>
            {expectedPain !== null && (
              <p className="summary-hint">EXPECTED {expectedPain}/5</p>
            )}
          </div>
          <div className="summary-pain-row">
            {PAIN_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className="summary-pain-chip"
                aria-pressed={pain === level}
                aria-label={`Pain ${level}`}
                onClick={() => onPain(pain === level ? null : level)}
              >
                {level}
              </button>
            ))}
          </div>
          <p className="summary-pain-caption">{painWord}</p>
        </div>

        <div className="summary-reflection-group">
          <label className="summary-reflection-label" htmlFor="summary-notes">
            NOTES
          </label>
          <textarea
            id="summary-notes"
            className="summary-notes-textarea"
            placeholder="What happened out there?"
            value={notes}
            onChange={(e) => onNotes(e.target.value)}
          />
        </div>
      </div>

      {rows.length > 0 && (
        <div className="summary-intervals">
          <div className="summary-intervals-header">
            <p className="summary-intervals-title">INTERVALS</p>
            {pacesOffCaption !== null && (
              <p className="summary-intervals-caption">{pacesOffCaption}</p>
            )}
          </div>
          <ul className="summary-row-list">
            {rows.map((row, i) => (
              <IntervalRow key={i} row={row} />
            ))}
          </ul>
          {hasJudgedRow && (
            <p className="summary-legend">← FASTER (BLUE) · SLOWER (RED) →</p>
          )}
          {caption !== undefined && (
            <p className="summary-targets-only-caption">{caption}</p>
          )}
        </div>
      )}

      <div className="action-stack summary-save-stack">
        {saveError !== null && <p className="field-error">{saveError}</p>}
        {saveButtons}
        {discardSlot}
      </div>

      {children !== undefined && (
        <div className="summary-diagnostics">{children}</div>
      )}
    </main>
  );
}
