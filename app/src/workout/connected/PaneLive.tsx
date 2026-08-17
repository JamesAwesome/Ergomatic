// Pane B — the live view (CR2 spec 3, connected redesign, design spec §2A/
// §2C/§2D/Stale/Disconnected). REBUILT this task (Task 4): every label the
// erg already shows four inches up the same sightline is gone — NOW,
// TARGET, LEFT IN INTERVAL/METERS LEFT, TOTAL M, HR. What is left is what
// the phone knows and the erg cannot: the two judged heroes, TOTAL LEFT,
// and what is coming.
//
// TWO HEROES, split left/right in landscape (flex 1.25/0.75, a 1px --rule
// divider) and stacked in portrait (2px ink rule above split, 1px --rule
// above rate) — the CSS decides which, one markup for both (design spec
// §2A/§2C). Each hero is: the actual reading at `--c-size-hero`/
// `--c-size-hero-2`, then its target row directly beneath at
// `--c-size-target` — split's target keeps a source tag (`6K`) at
// `--c-size-label`, rate's target keeps the word `SPM`. NEITHER TARGET
// CARRIES THE WORD "TARGET" ANY MORE (§2A: "Cut from LIVE: NO NOW/TARGET/
// UP NEXT labels") — the value and its tag/unit are what is left once the
// label is cut.
//
// THE PROGRESS BAR IS 3-STATE, NOT WARM-UP-AWARE (design spec §2A/§3):
// `ConnectedProgressBar` (Task 3) draws done/active/upcoming segments and
// nothing else — there is no fourth "warm-up" tone on this bar the way the
// old notched `TimerRuler` painted one. A warm-up interval is simply the
// FIRST segment, active like any other while it runs; the fact that it is
// a warm-up and not a working interval lives in the status caption above
// this pane (`WARM-UP`/`READY`, the shell header's own composed status
// span — `ConnectedSurface.tsx`'s `headerTrailing`, a header-level sibling
// of `ConnectionLine` since Task 6's fix round) — the bar's job is "where
// in the session am I", not "which segment is optional".
//
// THE BAND (design spec §3: "The up-next line is rendered by the band
// directly") replaces `TimerRuler`'s own TOTAL LEFT row AND the old metric
// row's UP NEXT strip in one element: up-next on the left (landscape: no
// label, the full `then` form, `REST 2:00 · then WORK 2:09.0`; portrait: a
// `UP NEXT` label over the `then`-less form, the shorter string this
// content width can hold without wrapping or clipping — the `.timer-
// upnext-then`-toggle idiom `UpNextStrip.tsx` used, reproduced here rather
// than imported per this task's own forked-component rule), and the
// `TOTAL LEFT` labelled cell on the right, reading `model.totalLeftDisplay`
// directly — the bar above takes elapsed/totalSeconds itself now, so
// nothing here subtracts a pre-computed remainder any more.
//
// CUT OUTRIGHT (design spec §2A's own casualty line, §3's fate table):
// `TimerRuler` and `UpNextStrip` (never imported — the connected surface
// forks its own bar and its own up-next line now); the metric row and its
// three cells (LEFT IN INTERVAL/METERS LEFT, TOTAL M, HR — `intervalClock
// Label`, `meters` and `hr` die off `SurfaceModel` itself, this task's own
// deletions); the `/500m` unit beside the split numeral; the word TARGET.
//
// STALE: `model.nowLabel` is the ONLY hero label left post-redesign — it
// collapses to `stale ? "LAST" : ""` (`surfaceModel.ts`'s own comment), so
// the existing `!== ""` guard below renders nothing at every other status.
//
// ARMED (design spec §2D): the split hero's ACTUAL reading previews the
// target value (`surfaceModel.ts`'s `armedMirror`) with its judgement
// forced to `"within"` — plain ink, indistinguishable from an ordinary
// unjudged reading. §2D wants MORE than that: a GHOST, ink-4, never ink-5.
// `connected-hero-ghost` is the one bit of pane-local styling this file
// adds on top of the model's own judgement class, keyed on `model.status`
// directly (armed is the only status where the split hero previews a
// number nobody has actually rowed yet). The rate hero does NOT ghost —
// §2D: "rate shows 0 plain ink" — so no equivalent class there.

import type { Judgement } from "../../../domain/judge.js";
import ConnectedProgressBar from "./ConnectedProgressBar";
import { type SurfaceModel } from "./surfaceModel";

// `Judgement`, not `string` (tail review M-7, carried forward): the class
// suffix IS the union member, so a member renamed without its CSS rule
// following stops compiling here rather than sitting silent.
function judgedClass(
  base: string,
  value: { judgement: Judgement; absent: boolean },
): string {
  return `${base} timer-card-actual-${value.judgement}${
    value.absent ? " connected-value-absent" : ""
  }`;
}

export default function PaneLive({ model }: { model: SurfaceModel }) {
  // Both heroes signal "no target" the same way: the model's own `absent`
  // flag (I-1, carried forward — the target VALUE names the phase kind,
  // `Easy`/`Rest`/`All out`/`Free`, greyed by `connected-value-absent`).
  const rateAbsent = model.targetRate.absent;
  const paceTargetAbsent = model.targetSplit.absent;
  // BOTH heroes wear the SAME label (carried forward, I-1): one field, read
  // twice, cannot disagree with itself the way two re-derivations could.
  const heroLabel = model.nowLabel;
  const paceValueClass = `${judgedClass("connected-hero-value", model.pace)}${
    model.status === "armed" ? " connected-hero-ghost" : ""
  }`;

  return (
    <div className="connected-pane connected-pane-live">
      {/* `ConnectionLine` (the mark, device caption and status) and the
          progress bar's own row order match design spec §2A/§2C exactly:
          the bar sits between the header and the heroes in BOTH
          orientations, so it renders FIRST here, ahead of the heroes. */}
      <ConnectedProgressBar
        boundaries={model.boundaries}
        totalSeconds={model.totalSeconds}
        elapsedSeconds={model.elapsedSeconds}
      />
      <div className="connected-heroes">
        <div className="connected-hero connected-hero-split">
          {/* NOTHING AT ALL when there is no label (I-1, carried forward):
              an empty node still occupies a flex slot and the
              accessibility tree, which is exactly the "absent, not blank"
              idiom the target-ref caption below already uses. */}
          {heroLabel !== "" && (
            <span className="connected-hero-label">{heroLabel}</span>
          )}
          <span className={paceValueClass}>
            {model.paceWhole}
            {model.paceTenths !== "" && (
              <span className="connected-hero-tenths">{model.paceTenths}</span>
            )}
          </span>
          <div className="connected-hero-target">
            <span
              className={
                paceTargetAbsent
                  ? "connected-hero-target-value connected-value-absent"
                  : "connected-hero-target-value"
              }
            >
              {model.targetSplit.main}
            </span>
            {/* NOTHING AT ALL when there is no caption (tail review M-5,
                carried forward — measured, not guessed: an empty span here
                buys no layout stability, it only puts an empty node in the
                DOM). `targetSplitCaption` is the source TAG the redesign
                keeps (`6K`) now that the word TARGET is gone. */}
            {model.targetSplitCaption !== "" && (
              <span className="connected-hero-target-ref">
                {model.targetSplitCaption}
              </span>
            )}
          </div>
        </div>
        <span className="connected-hero-divider" aria-hidden="true" />
        <div className="connected-hero connected-hero-rate">
          {heroLabel !== "" && (
            <span className="connected-hero-label">{heroLabel}</span>
          )}
          <span className={judgedClass("connected-hero-value", model.rate)}>
            {model.rate.display}
          </span>
          <div className="connected-hero-target">
            <span
              className={
                rateAbsent
                  ? "connected-hero-target-value connected-value-absent"
                  : "connected-hero-target-value"
              }
            >
              {model.targetRate.main}
            </span>
            {/* `SPM` sits beside the TARGET now, not beside the actual
                numeral (design spec §2A/§2C: "beneath target ... + SPM ...
                ink-3") — the old `.connected-hero-unit` beside the reading
                is gone along with the split's own `/500m`. Unconditional,
                the same "a unit annotates whatever number is there" stance
                the retired unit spans took. */}
            <span className="connected-hero-rate-unit">SPM</span>
          </div>
        </div>
      </div>
      {/* THE BAND (design spec §2A/§2C/§3): up-next + TOTAL LEFT, replacing
          the metric row's own UP NEXT cell and `TimerRuler`'s TOTAL LEFT
          row in one element. Class names are e2e-load-bearing (task
          brief): `connected-band`, `connected-band-upnext`,
          `connected-band-cell`. */}
      <div className="connected-band">
        <div className="connected-band-upnext">
          {/* Portrait-only label (§2C); landscape hides it (§2A: "NO
              label") — CSS toggle, not a second markup, the same
              orientation-blind-component rule `UpNextStrip.tsx` already
              established for this exact string. */}
          <span className="connected-band-upnext-label">UP NEXT</span>
          <span className="connected-band-upnext-value">
            {/* LANDSCAPE-ONLY "NEXT · " PREFIX (queue item 7, James's
                ruling: uniform beats special-casing, so the prefix is
                unconditional — "NEXT · FINISH" as much as "NEXT · REST
                3:00 · then WORK 2:09.0"). Same toggle idiom as `-then`
                below: always in the DOM (one builder for both
                orientations), hidden by `index.css`'s base rule, shown
                only under the landscape query — portrait's OWN stacked
                `UP NEXT` label above already names this line, so showing
                this prefix there too would double-label it. */}
            <span className="connected-band-upnext-next">NEXT · </span>
            {model.upNext}
            {/* The `then` word is the ONLY thing landscape adds over
                portrait's string (§2C: "the existing `.timer-upnext-then
                { display: none }` mechanism dies with UpNextStrip, so the
                band reproduces the drop itself") — reproduced verbatim
                here as `connected-band-upnext-then`, toggled by
                `index.css`'s own landscape query. `thenNext === null`
                renders no separator at all, matching `UpNextStrip`'s own
                "null past the last phase" contract. */}
            {model.thenNext !== null && (
              <>
                {" · "}
                <span className="connected-band-upnext-then">then </span>
                {model.thenNext}
              </>
            )}
          </span>
        </div>
        <div className="connected-band-cell">
          <span className="connected-band-cell-label">TOTAL LEFT</span>
          <span className="connected-band-cell-value">
            {model.totalLeftDisplay}
          </span>
        </div>
      </div>
    </div>
  );
}
