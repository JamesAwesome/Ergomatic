// Pane B — the live view (handoff §3's "Pane B — live view"). Pure machine
// data; the only control anywhere near it is the shell's End.
//
// "The pane opens with the SAME interval segment bar and the SAME `UP NEXT`
// strip as pane A, in both orientations — swiping between the two panes
// must never cost the rower their place in the session; only the size of
// the numbers changes." That is why this file renders the identical
// `IntervalSegments`, `UpNextStrip` and `TimerRuler` components pane A
// does, from the identical `SurfaceModel` fields, rather than a
// pane-B-shaped copy of any of them.
//
// Hierarchy, largest first (handoff §3, sizes in `index.css`): hero /500m
// (96px portrait with tenths at 52px, 150/72 landscape) -> time left in the
// interval (72/62), or `METERS LEFT` on a distance interval -> rate · HR ·
// meters as three equal cards (40/44) -> the mono strip -> the same total
// bar and quarter ruler as pane A.
//
// THE SUPERSESSION: the handoff's own line for the hero's target reads
// "accent value, mono caption". Superseded — targets are INK on both
// connected panes (handoff §3's own earlier ruling, "The target is ink in
// connected mode", and DEVIATIONS row 0; the two statements contradict each
// other inside one document and the phase spec resolves it in ink's
// favour). Accent appears NOWHERE on panes A or B; its only job on this
// surface is pane C's active countdown.
//
// Two columns that vanish in portrait (`display: contents`), same as pane A
// — see that file's header for why the landscape layout is two independent
// flex columns rather than one shared grid.

import IntervalSegments from "../../components/IntervalSegments";
import UpNextStrip from "../../components/UpNextStrip";
import TimerRuler from "../../session/TimerRuler";
import ConnectionLine from "./ConnectionLine";
import JudgedCard from "./JudgedCard";
import type { SurfaceModel } from "./surfaceModel";

export default function PaneLive({ model }: { model: SurfaceModel }) {
  return (
    <div className="connected-pane connected-pane-live">
      <div className="connected-col connected-col-hero">
        <ConnectionLine model={model} trailing={model.intervalLabelShort} />
        <IntervalSegments
          total={model.segments.total}
          current={model.segments.current}
          kinds={model.segments.kinds}
        />
        <div className="connected-hero">
          <span className="connected-hero-label">{model.nowLabel}</span>
          <span
            className={`connected-hero-value timer-card-actual-${model.pace.judgement}${
              model.pace.absent ? " connected-value-absent" : ""
            }`}
          >
            {model.paceWhole}
            {model.paceTenths !== "" && (
              <span className="connected-hero-tenths">{model.paceTenths}</span>
            )}
          </span>
          <div className="connected-hero-target">
            <span className="connected-hero-target-label">TARGET</span>
            {/* Ink — see the supersession note in this file's header. */}
            <span className="connected-hero-target-value">
              {model.targetSplit.main}
            </span>
            <span className="connected-hero-target-ref">
              {model.targetSplitCaption}
            </span>
          </div>
        </div>
        <TimerRuler
          totalLeftSeconds={model.totalLeftSeconds}
          totalSeconds={model.totalSeconds}
        />
      </div>
      <div className="connected-col connected-col-readouts">
        <div className="connected-second">
          <span className="connected-second-label">
            {model.intervalClockLabel}
          </span>
          <span
            className={
              model.status === "paused" || model.stale
                ? "connected-second-value connected-clock-value-held"
                : "connected-second-value"
            }
          >
            {model.intervalClockValue}
          </span>
        </div>
        <div className="connected-cards connected-cards-triple">
          <JudgedCard
            label="RATE"
            value={model.rate}
            caption={model.rateCaption}
            stale={model.stale}
          />
          {/* The HR card never leaves (handoff §4). With no belt talking it
              reads `—` over a dashed border with the caption
              `NO HR MONITOR`; if a monitor appears mid-session the dash
              becomes a number with no announcement. `JudgedCard` does both
              from `absent` alone. */}
          <JudgedCard
            label="HR"
            value={model.hr}
            caption={model.hrCaption}
            stale={model.stale}
            absentIdiom="dashed"
          />
          <JudgedCard
            label="METERS"
            value={model.meters}
            caption={model.metersCaption}
            stale={model.stale}
          />
        </div>
        <UpNextStrip upNext={model.upNext} thenNext={model.thenNext} />
        {/* The handoff's strip is "strokes · elapsed · total left". One cell
            of those three survives contact with the seam:
            - STROKES: `MonitorFrame` carries no stroke count, and no
              characteristic `domain/monitor/pm5/parse.ts` decodes has one.
              A permanently dashed cell would be noise, not an idiom.
            - TOTAL LEFT: the shared `TimerRuler` prints it in bigger type a
              few lines away. Two of the same number is the redundancy the
              first screenshots run made obvious.
            So the strip keeps its rule and its slot and carries the one
            thing it can honestly say. Recorded in DEVIATIONS. */}
        <div className="connected-strip">
          <div className="connected-strip-cell">
            <span className="connected-strip-label">ELAPSED</span>
            <span className="connected-strip-value">
              {model.elapsedDisplay}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
