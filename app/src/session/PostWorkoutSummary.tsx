import type { ReactNode } from "react";
import { fmtSplit } from "../../domain/format.js";
import { isOnboardingTitle } from "../../domain/onboarding.js";
import type { Baselines } from "../../domain/types.js";
import type { HeldResult, Thumbs } from "../api/useRecentLogs";
import type { PlanData } from "../api/usePlan";
import type { SeriesData } from "../monitor/seriesRecorder.js";
import TraceChart from "../log/TraceChart";
import BackLink from "../shell/BackLink";
import type {
  MeasuredRow,
  SummaryHeroes,
  SummaryMeta,
  SummaryModel,
  SummaryRow,
} from "./summaryModel";

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
 *  answer either way. The by-hand door passes the fixed `"BY FEEL"` string
 *  instead (spec: "by-hand manual door: BY FEEL" — an unconditional override,
 *  not a degenerate case of this rule). **Phase LM Task 4 added the one
 *  exception:** a `?from=monitor` arrival that opened no record renders
 *  through the manual door but is NOT by-hand, so it calls this and shows the
 *  workout's own target rather than `BY FEEL`. Exported for a direct, non-integration
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

/** §2's compact SPM cell: `24 / 22`, measured first (plain ink), the
 *  authored target after the slash in QUIET ink (`.summary-row-spm-target`
 *  — the design's own explicit ruling for this one half, distinct from
 *  the TARGET column's own plain-ink treatment). Either half
 *  independently absent (§2's own "absent halves drop" rule): a
 *  measured-only cell renders the bare number with no slash at all; a
 *  target-only cell renders `/ 22` — no leading space, WHOLLY inside the
 *  quiet span, since there is no measured half in front of it to
 *  separate from. Always wraps in the outer `.summary-row-spm` span (even
 *  when `cell` itself is `undefined`) so this row's columns still line up
 *  with sibling rows in the list, the same "kept as an empty element"
 *  idiom the bar-track below already uses. */
function SpmCellSpan({
  cell,
}: {
  cell?: { measured?: number; target?: number };
}) {
  return (
    <span className="summary-row-spm">
      {cell?.measured !== undefined && cell.measured}
      {cell?.target !== undefined && (
        <span className="summary-row-spm-target">
          {cell?.measured !== undefined ? " / " : "/ "}
          {cell.target}
        </span>
      )}
    </span>
  );
}

/** Review fix round (MEDIUM, 2026-08-18): `IntervalRow`'s own
 *  `aria-label` REPLACES the row's content for assistive tech
 *  (`role="listitem"`, no visible-text fallback) — §1/§2's headline
 *  values (TARGET, the SPM cell, the judgment state) were sighted-only
 *  until this function existed, a WCAG AA violation this repo's own hard
 *  requirement (CLAUDE.md) does not allow. Three independent clauses,
 *  each absent exactly when its own VISIBLE cell is absent (the accessible
 *  name never speaks a fact the sighted cell doesn't also show):
 *   - TARGET: `, target 2:10.0 per 500` — keyed on `targetLabel` alone,
 *     same "abstains when" rule §1's own TARGET cell follows.
 *   - SPM: mirrors §2's own "absent halves drop" rule in plain words —
 *     both halves speak as `"24 strokes per minute, target 22"`,
 *     measured-only as `"24 strokes per minute"`, target-only as
 *     `"target 22 strokes per minute"`.
 *   - Judgment: `onTarget` speaks as `"on target"`; `judged` speaks as a
 *     plain `"<magnitude> faster/slower than target"` sentence — the
 *     SAME sign convention the visible `±` label uses, spelled out
 *     (`judged.direction`), not re-derived from `deviationSeconds`'s own
 *     sign a second time. Neither fires when the row was never judged at
 *     all (the abstained-effort-row shape).
 *  Reached for every measured row in `IntervalRow` below, not only judged
 *  ones: an unjudged row's own `targetLabel`/`spmCell`/`judged`/`onTarget`
 *  are always undefined by construction (an EFFORT-ref step carries no
 *  numeric target — neither `monitorWorkRows` nor `timerWorkRows` ever
 *  sets any of them for such a row; before Phase WU this was specifically
 *  the dedicated `monitorWarmupRow`/`timerWarmupRow` pair, since deleted,
 *  §1's original Warm-up row rule), so every clause here is a documented
 *  no-op there, not a second code path. Never called for a `PrescribedRow`
 *  — that shape has none of these four fields at all (a different
 *  TypeScript type), so its own aria-label (below) is unchanged, plain,
 *  and needs no clause. */
function rowJudgmentDescription(row: MeasuredRow): string {
  let out = "";
  if (row.targetLabel !== undefined) {
    out += `, target ${row.targetLabel} per 500`;
  }
  const cell = row.spmCell;
  if (cell?.measured !== undefined && cell.target !== undefined) {
    out += `, ${cell.measured} strokes per minute, target ${cell.target}`;
  } else if (cell?.measured !== undefined) {
    out += `, ${cell.measured} strokes per minute`;
  } else if (cell?.target !== undefined) {
    out += `, target ${cell.target} strokes per minute`;
  }
  if (row.onTarget === true) {
    out += ", on target";
  } else if (row.judged !== undefined) {
    const magnitude = Math.abs(row.judged.deviationSeconds).toFixed(1);
    const word = row.judged.direction === "faster" ? "faster" : "slower";
    out += `, ${magnitude} ${word} than target`;
  }
  return out;
}

function IntervalRow({ row }: { row: SummaryRow }) {
  if (row.measured) {
    const colorClass = judgedColorClass(row.judged?.direction);
    return (
      <li
        className="summary-row"
        aria-label={`Interval ${row.index}: ${row.label}${row.timeLabel ? `, ${row.timeLabel}` : ""}${row.paceLabel ? ` at ${row.paceLabel} per 500` : ""}${rowJudgmentDescription(row)}`}
      >
        <span className="summary-row-index">{row.index}</span>
        <span className="summary-row-time">{row.timeLabel ?? ""}</span>
        <span className="summary-row-target">{row.targetLabel ?? ""}</span>
        <span className={`summary-row-pace ${colorClass}`}>
          {row.paceLabel ?? ""}
        </span>
        <SpmCellSpan cell={row.spmCell} />
        {row.judged === undefined ? (
          // PM final-PR gate (lone-measured-row ruling, 2026-08-17): §2B's
          // own idiom ("any cell whose inputs are absent is ABSENT") plus
          // §2E's warm-up-row precedent (measured but UNJUDGED renders no
          // deviation bar) — a measured row with no `judged` (either
          // genuinely unjudged, OR on-target — Task 2's `rowJudgment`
          // encodes on-target as `judged` absent too, `onTarget: true`
          // instead) gets the SAME empty track a warm-up row used to
          // render: no center tick, no fill, no color. Kept as an (empty)
          // element, not omitted outright, so this row's columns still
          // line up with judged sibling rows sharing this list.
          <span className="summary-row-bar-track" />
        ) : (
          <span className="summary-row-bar-track">
            <span className="summary-row-bar-tick" />
            <span
              className={`summary-row-bar ${colorClass}`}
              style={{
                width: `${row.judged.barWidthPercent}%`,
                ...(row.judged.direction === "faster"
                  ? { right: "50%" }
                  : { left: "50%" }),
              }}
            />
          </span>
        )}
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

/** §2A's title block (from-the-log spec, 2026-08-18, Task 5: extracted so
 *  `FromTheLog.tsx` can re-render the exact same title/meta/rule markup
 *  the live door renders, fed by a stored row's own `SummaryMeta` instead
 *  of a live door's — see that file's `storedSummary.ts` for how the
 *  latter is derived). No behavior change to the live door below, which
 *  now renders this component in place of the identical inline JSX it
 *  used to carry directly. */
export function SummaryMetaBlock({
  title,
  meta,
}: {
  title: string;
  meta: SummaryMeta;
}) {
  return (
    <>
      <h1 className="screen-title summary-title">{title}</h1>
      <p className="summary-meta">
        {meta.dateLabel}
        {meta.timeLabel !== undefined ? ` · ${meta.timeLabel}` : ""} ·{" "}
        {meta.sourceLabel}
      </p>
      <hr className="summary-rule" />
    </>
  );
}

/** §2B's hero block (from-the-log spec, Task 5: extracted, same reuse
 *  reason as `SummaryMetaBlock` above). Owns its own "whole block absent
 *  when every hero is absent" check — a caller never needs to repeat that
 *  gate, it can render this unconditionally and get nothing back when
 *  there's nothing to show (old rows, spec §5B). */
export function SummaryHeroesBlock({ heroes }: { heroes: SummaryHeroes }) {
  const hasHero =
    heroes.avgSplit !== undefined ||
    heroes.time !== undefined ||
    heroes.distanceMeters !== undefined;
  if (!hasHero) return null;
  return (
    <div className="summary-heroes-block">
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
            <span className="summary-hero-value">{heroes.distanceMeters}</span>
          </div>
        )}
      </div>
      {/* RC-5 §2 (hero-truth design spec): the wall-clock total the three
          heroes above used to fold rest into, now on its own line — right
          beneath the heroes, unconditionally (no scroll/collapse/lazy
          render — the design review's own placement requirement: "the
          total line sitting right underneath" is what stops a rower
          filing a bug on a heroes total that shrank). Absent whenever
          `buildTotalLine` had nothing to say (the manual/timer doors, or
          a monitor row with no measured time at all). */}
      {heroes.totalLine !== undefined && (
        <p className="summary-total-line">{heroes.totalLine}</p>
      )}
    </div>
  );
}

/** §2E's interval list (from-the-log spec, Task 5: extracted, same reuse
 *  reason as the two blocks above). `pacesOffCaption` defaults to `null`
 *  (omitted) — the from-the-log view has no live baseline-lock context to
 *  caption with; the live door below still passes its own real value
 *  explicitly. Owns its own "nothing to render" gate (`rows.length ===
 *  0`), same reasoning as `SummaryHeroesBlock`. */
export function SummaryIntervalsBlock({
  rows,
  pacesOffCaption = null,
  caption,
}: {
  rows: SummaryRow[];
  pacesOffCaption?: string | null;
  caption?: string;
}) {
  if (rows.length === 0) return null;
  const hasJudgedRow = rows.some((r) => r.measured && r.judged !== undefined);
  return (
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
  );
}

/** The reflection card (§2D) — extracted (from-the-log spec, Task 5) so
 *  `FromTheLog.tsx`'s Edit affordance can swap in the exact SAME four
 *  clearable controls the live door uses (this spec's own binding
 *  preamble: "Edit swaps in spec 1's reflection card"), rather than a
 *  second hand-rolled copy of the HELD/pain roving-button groups
 *  (CLAUDE.md's own recurring-failure #8). No behavior change to the live
 *  door below, which now renders this component in place of the
 *  identical inline JSX it used to carry directly. */
export function SummaryReflectionCard({
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
}: {
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
}) {
  const painWord = painCaption(pain);
  return (
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
          <p className="summary-reflection-label">DID YOU HOLD THE TARGETS?</p>
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
   *  comment for the derivation; the manual door's caller passes the
   *  literal `"BY FEEL"` string instead of calling that function, EXCEPT
   *  for Phase LM Task 4's connected arrival with no record, which was
   *  rowed against a programmed workout and so takes the same
   *  single-target rule the connected door does (`LogSession.tsx`'s own
   *  comment at that call site). */
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
  /** The ACCOUNT's current baselines — the combined pair, null when either
   *  side is unset or the fetch hasn't resolved (the app-wide partial-pair
   *  convention). Phase 8A (James's ruling 5, 2026-08-22): together with
   *  `title` this DERIVES which save button leads — the component keys the
   *  6I demotion on `isOnboardingTitle(title) && accountBaselines === null`
   *  itself, so no caller (and no test) can assert the demotion without
   *  supplying the real inputs it is derived from. Distinct from
   *  `pacesOffCaption`'s locked paces: those are frozen at session start,
   *  this is the account's live state at save time. */
  accountBaselines: Baselines | null;
  saving: boolean;
  saveError: string | null;
  onLogAgainstPlan: () => void;
  onSaveWithoutLogging: () => void;
  /** LT-0 (2026-08-18-target-truth-design.md §3): every current caller now
   *  passes a real `ReactNode` — discard is present wherever save is, on
   *  all three doors, including the manual door's plain (non-monitor)
   *  render, which used to pass `null` here as the app's last
   *  discard-less save surface. `ReactNode` (not a stricter non-nullable
   *  type) stays the prop's own type regardless: this component enforces
   *  nothing about presence, only renders what it's given — `null` is
   *  still a legal value the component itself renders as "nothing extra."
   *  Built by the caller (the two-tap machinery differs per door — which
   *  records clear, where a fired discard navigates — the "per-door record
   *  semantics" §2F names). */
  discardSlot: ReactNode;
  /** Trace-rendering spec (Phase LT spec 3), §1: the LIVE door's own
   *  source — `MonitorRun.series`, straight from the session record the
   *  door already loaded, never re-derived here. Absent on every door but
   *  monitor (timer/by-hand doors have no PM5, so no wire trace exists to
   *  draw — `LogSession.tsx`'s own callers simply omit this prop, the
   *  same "absent means nothing" idiom `deviceName` already uses one
   *  layer down). `<TraceChart>` (Task 2) owns every absence/gate rule
   *  from here: fewer than 3 real readings, no HR sample anywhere, etc. —
   *  this component passes the value through and places the result,
   *  nothing more. */
  series?: SeriesData;
  backFallback?: string;
  /** Wave F PR 1 Task 4 (design spec 2026-08-31-lifecycle-design.md §1,
   *  Gate 0 CLEARED 2026-08-31, "PLACEMENT REVISED with the destination
   *  ruling: the strip sits at the top of the LOG screen ... above the
   *  title"). Caller-built and door-specific (only the monitor door's
   *  `endedBy === "program-dropped"` case ever passes one — the timer/
   *  manual doors have no PM5 to have dropped anything), same "self-
   *  contained ReactNode this screen only places" idiom as `discardSlot`
   *  above. `undefined` renders nothing extra, same as `children`. */
  stripSlot?: ReactNode;
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
  accountBaselines,
  saving,
  saveError,
  onLogAgainstPlan,
  onSaveWithoutLogging,
  discardSlot,
  series,
  backFallback = "/today",
  stripSlot,
  children,
}: PostWorkoutSummaryProps) {
  const { meta, heroes, rows, caption } = model;

  // §2F: `Log against plan` carries the plan's own position information
  // (`Log against plan · SESSION n OF N`) whether it's leading or demoted —
  // "the toggle's information, kept at the decision point."
  const logAgainstPlanLabel =
    plan !== null
      ? `Log against plan · SESSION ${plan.doneN + 1} OF ${plan.sequence.length}`
      : "Log against plan";

  // §2F: no plan hides `Log against plan` outright (not disabled) and
  // `Save without logging` leads alone. Phase 8A (James's ruling 5,
  // 2026-08-22) narrows 6I's demotion to its actual case: an
  // onboarding-titled workout swaps which button leads ONLY while the
  // account's baselines are null — that no-baseline population is who "a
  // baseline test must not silently consume plan session 1" protects. A
  // BASELINED rower rowing that same title is at a plan checkpoint
  // (session 7/35/63 prescribes it), and demoting there soft-locks the
  // plan: the lead save writes plan_key/plan_index NULL and done_n never
  // advances past the checkpoint. Derived HERE from `title` +
  // `accountBaselines`, never taken as a caller boolean — a prop-injected
  // flag let a green test pin the wrong behaviour through any wiring
  // change (PostWorkoutSummary.test.tsx:883, pre-8A). `lead`/`secondary`
  // name the VISUAL slot (54px accent vs 48px outline), independent of
  // which literal button text occupies it.
  const demoteForOnboarding =
    isOnboardingTitle(title) && accountBaselines === null;
  const saveWithoutLoggingButton = (
    <button
      key="save-without-logging"
      type="button"
      className={
        plan === null || demoteForOnboarding
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
          demoteForOnboarding ? "summary-save-secondary" : "summary-save-lead"
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
      : demoteForOnboarding
        ? [saveWithoutLoggingButton, logAgainstPlanButton]
        : [logAgainstPlanButton, saveWithoutLoggingButton];

  return (
    <main className="screen">
      <p className="summary-eyebrow">WORKOUT COMPLETE</p>
      <BackLink fallback={backFallback} label="← DONE" />
      {stripSlot}
      <SummaryMetaBlock title={title} meta={meta} />

      <SummaryHeroesBlock heroes={heroes} />

      <SummaryReflectionCard
        hint={hint}
        expectedPain={expectedPain}
        held={held}
        onHeld={onHeld}
        pain={pain}
        onPain={onPain}
        thumbs={thumbs}
        onThumbs={onThumbs}
        notes={notes}
        onNotes={onNotes}
      />

      <SummaryIntervalsBlock
        rows={rows}
        pacesOffCaption={pacesOffCaption}
        caption={caption}
      />

      {/* Trace-rendering spec (Phase LT spec 3), §1: "below the INTERVALS
          list ... above the save stack on the live door" — placed here,
          between the two, so it's the last thing a rower sees before the
          save/discard controls. `<TraceChart>` renders nothing at all
          when `series` is absent or too thin to draw (Task 2's own gate),
          so this is an unconditional render, not a second absence check
          duplicated here. */}
      <TraceChart series={series} />

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
