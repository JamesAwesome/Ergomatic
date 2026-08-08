// Pane A — the shipped phone timer's rhythm, driven by the machine
// (handoff §3's "Pane A — our timer, connected"). Reads nothing but its
// `SurfaceModel`; the shell owns End, the lost-link banner and the pager.
//
// What is REUSED verbatim from the phone timer (Task 3's extractions, so
// there is no second copy of any of it): `IntervalSegments` (the
// `.timer-dots` strip), `UpNextStrip`, `TimerRuler` (TOTAL LEFT + the
// quarter ruler), and `TimerTargets`'s own `targetSplitDisplay` for the
// TARGET SPLIT card's value/ref pair (via `surfaceModel.ts`).
//
// What is NOT reused, and no longer exists to reuse: `TimerTargets`'s own
// `variant="connected"` JSX, which used to render the actual INSIDE the
// target card. The handoff is explicit that the actual is a SEPARATE card
// of the same geometry beside it ("The machine's actual is the big numeral
// beside it, same card geometry, same size — distinguished by its label
// (`NOW · /500M` vs `TARGET SPLIT`)"), and §3's own row layout is
// `[NOW][TARGET]` then `[RATE][METERS]`. The handoff is the visual
// authority, so the four cards below follow it; the task-6 review flagged
// that variant as dead code with no consumer, and Task 8 deleted it —
// `TimerTargets` now renders only the phone timer's own unlabelled cards.
// Its CSS hooks (`timer-card-actual-{judgement}`) survive that deletion —
// they were never PART of the JSX being removed, only exercised through
// it — and ARE used, by `JudgedCard`.
//
// TWO COLUMNS THAT VANISH IN PORTRAIT. `.connected-col` is
// `display: contents` in portrait — the wrappers disappear and their
// children become direct flex items of the pane, ordered by CSS `order` into
// the handoff's portrait sequence — and a real flex column in landscape.
// Same markup in both orientations, so nothing re-mounts or reflows on
// rotation, and the two columns size INDEPENDENTLY.
//
// That independence is the whole point, and it is why this is not the
// explicit-grid-placement idiom `.timer-screen`'s landscape query uses: a
// grid's rows are shared across both columns, so pane A's 128px numeral
// forced the row that pane B's card rows lived in, and the first
// `pnpm screenshots` run showed TOTAL LEFT, the quarter ruler and UP NEXT
// squeezed to nothing and clipped away at 844x390. Two independent columns
// cannot do that to each other.

import IntervalSegments from "../../components/IntervalSegments";
import UpNextStrip from "../../components/UpNextStrip";
import TimerRuler from "../../session/TimerRuler";
import ConnectionLine from "./ConnectionLine";
import JudgedCard from "./JudgedCard";
import type { SurfaceModel } from "./surfaceModel";

export default function PaneTimer({ model }: { model: SurfaceModel }) {
  return (
    <div className="connected-pane connected-pane-timer">
      <div className="connected-col connected-col-clock">
        <div className="connected-phase-line">
          <span className="connected-phase-label">{model.intervalLabel}</span>
          {/* Ink, never the phone timer's accent RUNNING — DEVIATIONS row 1. */}
          <span className="connected-status-word">{model.statusWord}</span>
        </div>
        <div className="connected-interval-clock">
          {/* Labelled, unlike the mockup's bare `0:41` — see the
              `.connected-clock-label` rule in index.css: a distance
              interval's countdown is a raw meter count and needs saying. */}
          <span className="connected-clock-label">
            {model.intervalClockLabel}
          </span>
          {/* Handoff §4: paused "greys but holds its last value". The hook's
              paused derivation is what holds it (the frame itself stops
              changing); this class is only the greying. */}
          <span
            className={
              model.status === "paused" || model.stale
                ? "connected-clock-value connected-clock-value-held"
                : "connected-clock-value"
            }
          >
            {model.intervalClockValue}
          </span>
          <div className="connected-interval-bar">
            <span style={{ width: `${model.intervalProgressPct}%` }} />
          </div>
        </div>
        <TimerRuler
          totalLeftSeconds={model.totalLeftSeconds}
          totalSeconds={model.totalSeconds}
        />
      </div>
      <div className="connected-col connected-col-cards">
        <ConnectionLine model={model} />
        <IntervalSegments
          total={model.segments.total}
          current={model.segments.current}
          kinds={model.segments.kinds}
        />
        <div className="connected-cards connected-cards-primary">
          <JudgedCard
            label={model.nowLabel}
            value={model.pace}
            caption={model.paceCaption}
            stale={model.stale}
          />
          <div
            className={
              model.stale ? "timer-card connected-card-stale" : "timer-card"
            }
          >
            <span className="timer-card-label">TARGET SPLIT</span>
            {/* INK, not accent — the supersession (handoff §3: "the target
                is ink in connected mode"; DEVIATIONS row 0). A programmed
                value is never tinted: only what happened is judged. */}
            <span className="timer-card-value">{model.targetSplit.main}</span>
            <span className="timer-card-caption">
              {model.targetSplitCaption}
            </span>
          </div>
        </div>
        <div className="connected-cards connected-cards-secondary">
          <JudgedCard
            label="RATE"
            value={model.rate}
            caption={model.rateCaption}
            stale={model.stale}
          />
          <JudgedCard
            label="METERS"
            value={model.meters}
            caption={model.metersCaption}
            stale={model.stale}
          />
        </div>
        <UpNextStrip upNext={model.upNext} thenNext={model.thenNext} />
      </div>
    </div>
  );
}
