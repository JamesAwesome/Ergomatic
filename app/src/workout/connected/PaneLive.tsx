// Pane B — the live view (design spec §6, revision §3's "Live · the pane you
// row on"). Pure machine data; the only control anywhere near it is the
// shell's End.
//
// TWO HEROES, LOUDLY (connected-revamp Task 3). The pane says two things:
// the actual split and the actual rate, each `--size-hero` (112px landscape
// / 104px portrait) with its target directly beneath at `--size-target`
// (46/44px), in ink. Everything else on the pane tops out at `--size-metric`
// (30px) — the metric row, three values on one baseline under a 1px ink
// rule — then UP NEXT, then the TOTAL LEFT bar, which Task 4 notched by
// INTERVAL (design spec §5): this file hands `TimerRuler` one more prop,
// `model.boundaries`, and the phone timer hands it the same shape, so the
// two surfaces cannot grow different bars.
//
// THE RATE HERO IS A PROMOTION, NOT NEW PLUMBING. `model.rate` is the same
// `JudgedValue` `judgedValue` has always produced (`surfaceModel.ts`'s one
// judgement path — `judgeActual`'s single call site is unmoved by this
// file); `model.targetRate.main` is read straight off the model (fix round
// 1, task-3-review.md Minor-3 — an earlier version of this file parsed a
// caption STRING for this value instead; `targetRate` replaced it at the
// model layer, see that file's own comment).
//
// THE NO-TARGET STATE (design spec §6, adversarial finding): every REST
// phase — and any work phase without a numeric target — has nothing to
// judge. `judgeActual` already reads a `null` target as `"within"` (rule
// 2: "nothing to judge is not a deviation"), so the actual above renders
// unjudged in plain ink with zero code here. The target VALUE says which
// KIND of piece this is — `Easy`, `Rest`, `All out`, `Free` — and this pane
// greys it via `connected-value-absent` (`--ink-3`) on the model's own
// `absent` flag, so the slot holds its space and names the phase without
// the word passing for a programmed number. (It was a bare dash until
// James's 2026-08-12 ruling on #89's warm-up captures; see
// `surfaceModel.ts`'s own comment for what that reversed and why.)
//
// CARDS ARE GONE (revision §3: "The old three metric cards are gone; the
// metric row costs 44px, not 120." / "Missing HR renders — in place. No
// dashed card, no explanatory copy."). RATE promoted to a hero; METERS and
// HR moved into the metric row alongside the interval countdown, all three
// plain judged numerals with no card, no border, no absent idiom beyond the
// shared `connected-value-absent` grey every dash on this pane already
// wears. `JudgedCard.tsx` had no other consumer and retired with them.
//
// REMOVED per spec §3 (retirement inventory §4/§5, Task 3's own): the
// ELAPSED strip (replaced by this metric row) and the equal-width
// `IntervalSegments` bar (the notched TOTAL LEFT bar says the same thing
// proportionally, Task 4's rebuild) — neither renders here any more.

import UpNextStrip from "../../components/UpNextStrip";
import TimerRuler from "../../session/TimerRuler";
import ConnectionLine from "./ConnectionLine";
import { type SurfaceModel } from "./surfaceModel";

function judgedClass(
  base: string,
  value: { judgement: string; absent: boolean },
): string {
  return `${base} timer-card-actual-${value.judgement}${
    value.absent ? " connected-value-absent" : ""
  }`;
}

export default function PaneLive({ model }: { model: SurfaceModel }) {
  // Both heroes signal "no target" the same way: the model's own `absent`
  // flag. This used to sniff for DASH in the value, which stopped working
  // when James ruled the WORD into that slot (`Easy`/`Rest`/`All out`/
  // `Free`, 2026-08-12) — a sentinel in the display string only ever held
  // while the display string had nothing else to say.
  const rateAbsent = model.targetRate.absent;
  const paceTargetAbsent = model.targetSplit.absent;
  // `model.stale` already distinguishes "the link is gone" from "the erg is
  // just paused" (paused values hold, they are not stale) — the same rule
  // `nowLabel` uses for the split hero's own NOW/LAST swap, mirrored here
  // rather than a second label field for one string.
  const rateLabel = model.stale ? "LAST" : "NOW";

  return (
    <div className="connected-pane connected-pane-live">
      <ConnectionLine model={model} trailing={model.intervalLabelShort} />
      <div className="connected-heroes">
        <div className="connected-hero connected-hero-split">
          <span className="connected-hero-label">{model.nowLabel}</span>
          {/* The unit sits BESIDE the numeral, on its baseline (testers via
              James, 2026-08-13) — hence the row wrapper: `.connected-hero`
              is a flex COLUMN, so an unwrapped unit span becomes its own
              line under the value instead of sitting next to it. OUTSIDE
              the judged span on purpose: `/500m` is a fact about the
              metric, not about how the rower is doing, so it must not turn
              blue or red with the reading it annotates. */}
          <span className="connected-hero-reading">
            <span className={judgedClass("connected-hero-value", model.pace)}>
              {model.paceWhole}
              {model.paceTenths !== "" && (
                <span className="connected-hero-tenths">
                  {model.paceTenths}
                </span>
              )}
            </span>
            <span className="connected-hero-unit">/500m</span>
          </span>
          <div className="connected-hero-target">
            <span className="connected-hero-target-label">TARGET</span>
            <span
              className={
                paceTargetAbsent
                  ? "connected-hero-target-value connected-value-absent"
                  : "connected-hero-target-value"
              }
            >
              {model.targetSplit.main}
            </span>
            <span className="connected-hero-target-ref">
              {model.targetSplitCaption}
            </span>
          </div>
        </div>
        <span className="connected-hero-divider" aria-hidden="true" />
        <div className="connected-hero connected-hero-rate">
          <span className="connected-hero-label">{rateLabel}</span>
          <span className="connected-hero-reading">
            <span className={judgedClass("connected-hero-value", model.rate)}>
              {model.rate.display}
            </span>
            <span className="connected-hero-unit">SPM</span>
          </span>
          <div className="connected-hero-target">
            <span className="connected-hero-target-label">TARGET</span>
            <span
              className={
                rateAbsent
                  ? "connected-hero-target-value connected-value-absent"
                  : "connected-hero-target-value"
              }
            >
              {model.targetRate.main}
            </span>
          </div>
        </div>
      </div>
      <div className="connected-metric-row">
        <div className="connected-metric-cell">
          <span className="connected-metric-label">
            {model.intervalClockLabel}
          </span>
          <span
            className={
              model.status === "paused" || model.stale
                ? "connected-metric-value connected-clock-value-held"
                : "connected-metric-value"
            }
          >
            {model.intervalClockValue}
          </span>
        </div>
        <div className="connected-metric-cell">
          <span className="connected-metric-label">METERS</span>
          <span className={judgedClass("connected-metric-value", model.meters)}>
            {model.meters.display}
          </span>
        </div>
        <div className="connected-metric-cell">
          {/* The HR card never left its own slot (handoff §4); revision §3
              drops the CARD, not the treatment — a missing reading still
              reads `—`, now via the shared `connected-value-absent` grey
              rather than a dashed border, and with no caption to explain
              it (`hrCaption`'s "NO HR MONITOR" string has no renderer left
              on this pane). */}
          <span className="connected-metric-label">HR</span>
          <span className={judgedClass("connected-metric-value", model.hr)}>
            {model.hr.display}
          </span>
        </div>
        {/* UP NEXT NESTS INSIDE the metric row rather than following it as
            its own sibling (index.css's own comment on `.connected-metric-
            row` has the full reasoning): landscape's 296px budget cannot
            fit two 112px heroes AND a full second row for UP NEXT AND the
            ruler. `flex-wrap` is what makes one DOM serve both layouts —
            portrait wraps it onto its own line (`flex-basis: 100%`,
            keeping its established pill), landscape keeps it on the metric
            row's own baseline, right-aligned, exactly where revision §3
            draws it. */}
        <UpNextStrip upNext={model.upNext} thenNext={model.thenNext} />
      </div>
      <TimerRuler
        totalLeftSeconds={model.totalLeftSeconds}
        totalSeconds={model.totalSeconds}
        boundaries={model.boundaries}
      />
    </div>
  );
}
